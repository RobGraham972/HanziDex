// Load environment variables from .env file
require('dotenv').config();

// Global Error Handling (for unhandled exceptions/rejections)
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION! Server is shutting down...');
    console.error(err.stack);
    process.exit(1); // Exit with a failure code
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION! Server is shutting down...');
    console.error('Reason:', reason);
    process.exit(1); // Exit with a failure code
});

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
let fsrsLib = null;
async function initFsrs() {
    try {
        // Try CommonJS require
        // Some builds of ts-fsrs are ESM-only; this may throw
        // eslint-disable-next-line global-require, import/no-extraneous-dependencies
        fsrsLib = require('ts-fsrs');
        return;
    } catch (errRequire) {
        try {
            // Dynamic import for ESM
            // eslint-disable-next-line no-await-in-loop
            const mod = await import('ts-fsrs');
            fsrsLib = mod?.default || mod;
        } catch (errImport) {
            fsrsLib = null;
        }
    }
}

const app = express();
const port = process.env.PORT || 5000;
const jwtSecret = process.env.JWT_SECRET;

// Middleware
app.use(express.json());
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'], // frontend dev ports
}));

// Serve stroke/data files under /data
app.use('/data', express.static(path.join(__dirname, '../data')));

// Request logger
app.use((req, res, next) => {
  console.log(`${req.method} ${req.originalUrl}`);
  next();
});

// ----------------------------------------------------
// PostgreSQL Database Connection Pool
// ----------------------------------------------------
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// --- Helper function for updating status in user_item_progress ---
async function updateItemStatus(client, userId, itemId, newStatus) {
    await client.query(
        "UPDATE user_item_progress SET status = $1 WHERE user_id = $2 AND item_id = $3",
        [newStatus, userId, itemId]
    );
}

// ----------------------------------------------------
// Skills System (Schema + Helpers)
// ----------------------------------------------------

const DEFAULT_CHARACTER_SKILLS = [
    { code: 'recognition', label: 'Character Recognition' },
    { code: 'meaning', label: 'Meaning Recall' },
    { code: 'pinyin', label: 'Pinyin Recall' },
    { code: 'writing', label: 'Character Writing' },
];

const DEFAULT_WORD_SKILLS = [
    { code: 'word_recognition', label: 'Word Recognition' },
    { code: 'word_meaning', label: 'Word Meaning Recall' },
];

const DEFAULT_RADICAL_SKILLS = [
    { code: 'radical_recognition', label: 'Radical Recognition' },
];

async function ensureSkillsSchema() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
            CREATE TABLE IF NOT EXISTS skills (
                code TEXT PRIMARY KEY,
                label TEXT NOT NULL
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS user_item_skill_progress (
                user_id INTEGER NOT NULL,
                item_id INTEGER NOT NULL,
                skill_code TEXT NOT NULL REFERENCES skills(code),
                level INTEGER NOT NULL DEFAULT 1,
                last_trained_at TIMESTAMPTZ,
                due_at TIMESTAMPTZ,
                stability DOUBLE PRECISION,
                difficulty DOUBLE PRECISION,
                suspended BOOLEAN NOT NULL DEFAULT FALSE,
                PRIMARY KEY (user_id, item_id, skill_code)
            );
        `);

        // Ensure added columns exist (idempotent)
        await client.query(`ALTER TABLE user_item_skill_progress ADD COLUMN IF NOT EXISTS stability DOUBLE PRECISION`);
        await client.query(`ALTER TABLE user_item_skill_progress ADD COLUMN IF NOT EXISTS difficulty DOUBLE PRECISION`);
        await client.query(`ALTER TABLE user_item_skill_progress ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT FALSE`);

        // Reviews log for FSRS history
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_item_skill_reviews (
                user_id INTEGER NOT NULL,
                item_id INTEGER NOT NULL,
                skill_code TEXT NOT NULL,
                reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                rating_label TEXT NOT NULL,       -- again|hard|good|easy
                rating_value INTEGER NOT NULL,    -- 1..4
                duration_ms INTEGER,
                experiment_id TEXT,
                PRIMARY KEY (user_id, item_id, skill_code, reviewed_at)
            );
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_reviews_user_time ON user_item_skill_reviews(user_id, reviewed_at)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_reviews_user_item_skill ON user_item_skill_reviews(user_id, item_id, skill_code)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_progress_user_due ON user_item_skill_progress(user_id, due_at)`);

        // User options for evidence-aligned defaults
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_options (
                user_id INTEGER PRIMARY KEY,
                desired_retention NUMERIC NOT NULL DEFAULT 0.9,
                daily_new_limit INTEGER NOT NULL DEFAULT 10,
                daily_review_limit INTEGER NOT NULL DEFAULT 100,
                bury_siblings BOOLEAN NOT NULL DEFAULT TRUE,
                leech_threshold INTEGER NOT NULL DEFAULT 8,
                reminders_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                reminder_time TIME,
                nudges_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                experiment_id TEXT,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);
        // Add new columns if missing
        await client.query(`ALTER TABLE user_options ADD COLUMN IF NOT EXISTS reminders_enabled BOOLEAN NOT NULL DEFAULT FALSE`);
        await client.query(`ALTER TABLE user_options ADD COLUMN IF NOT EXISTS reminder_time TIME`);
        await client.query(`ALTER TABLE user_options ADD COLUMN IF NOT EXISTS nudges_enabled BOOLEAN NOT NULL DEFAULT TRUE`);
        await client.query(`ALTER TABLE user_options ADD COLUMN IF NOT EXISTS experiment_id TEXT`);
        await client.query(`ALTER TABLE user_item_skill_reviews ADD COLUMN IF NOT EXISTS experiment_id TEXT`);

        // Seed default skills (characters, words, radicals)
        const allSkills = [
            ...DEFAULT_CHARACTER_SKILLS,
            ...DEFAULT_WORD_SKILLS,
            ...DEFAULT_RADICAL_SKILLS,
        ];
        for (const s of allSkills) {
            await client.query(
                `INSERT INTO skills(code, label) VALUES ($1, $2)
                 ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label`,
                [s.code, s.label]
            );
        }

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Failed to ensure skills schema:', err.stack);
        throw err;
    } finally {
        client.release();
    }
}

function intervalForLevelMs(level) {
    // Increasing intervals by level (approximate Anki-style growth)
    // L1: 8h, L2: 1d, L3: 3d, L4: 7d, L5: 14d, L6+: 30d
    const hours = [0, 8, 24, 72, 168, 336, 720];
    const idx = Math.min(level, hours.length - 1);
    return hours[idx] * 60 * 60 * 1000;
}

function graceForLevelMs(level) {
    // Allow half of interval as grace before turning red
    return Math.max(4 * 60 * 60 * 1000, Math.floor(intervalForLevelMs(level) * 0.5));
}

function computeStatus(nowMs, dueAtMs, level) {
    if (!dueAtMs) return 'amber';
    if (nowMs < dueAtMs) return 'green';
    const graceMs = graceForLevelMs(level);
    if (nowMs < dueAtMs + graceMs) return 'amber';
    return 'red';
}

function mapRating(input) {
    const s = String(input || '').toLowerCase();
    if (s === 'again') return { label: 'again', value: 1 };
    if (s === 'hard') return { label: 'hard', value: 2 };
    if (s === 'good') return { label: 'good', value: 3 };
    if (s === 'easy') return { label: 'easy', value: 4 };
    // Back-compat: map success/fail
    if (s === 'success') return { label: 'good', value: 3 };
    if (s === 'fail') return { label: 'again', value: 1 };
    return { label: 'good', value: 3 };
}

function daysToMs(days) { return days * 24 * 60 * 60 * 1000; }

function computeNextFromRating(currentLevel, currentDueAt, rating) {
    // Transitional scheduler: approximate next interval by rating
    // Will be replaced by FSRS library outputs
    const now = Date.now();
    const level = Math.max(1, currentLevel || 1);
    let nextLevel = level;
    let intervalMs = intervalForLevelMs(level);
    switch (rating.label) {
        case 'again':
            nextLevel = Math.max(1, level - 1);
            intervalMs = Math.max(2 * 60 * 60 * 1000, Math.floor(intervalForLevelMs(nextLevel) * 0.25));
            break;
        case 'hard':
            nextLevel = Math.max(1, level);
            intervalMs = Math.max(6 * 60 * 60 * 1000, Math.floor(intervalForLevelMs(nextLevel) * 0.6));
            break;
        case 'good':
            nextLevel = Math.min(60, level + 1);
            intervalMs = intervalForLevelMs(nextLevel);
            break;
        case 'easy':
            nextLevel = Math.min(60, level + 2);
            intervalMs = Math.floor(intervalForLevelMs(nextLevel) * 1.2);
            break;
        default:
            nextLevel = Math.min(60, level + 1);
            intervalMs = intervalForLevelMs(nextLevel);
    }
    return { nextLevel, dueAt: new Date(now + intervalMs) };
}

function computeRetrievability(row) {
    // Prefer FSRS stability if available. Stability is modeled in days.
    const last = row.last_trained_at ? new Date(row.last_trained_at).getTime() : null;
    if (!last) return 0.6; // unknown → trainable
    const now = Date.now();
    if (row.stability && row.stability > 0) {
        const elapsedDays = (now - last) / (1000 * 60 * 60 * 24);
        const R = Math.exp(-elapsedDays / row.stability);
        return Math.min(0.99, Math.max(0.01, R));
    }
    // Fallback: approximate via current interval mapping from level
    const level = row.level || 1;
    const elapsed = Math.max(0, now - last);
    const stabilityMs = Math.max(4 * 60 * 60 * 1000, intervalForLevelMs(level));
    const R = Math.exp(-elapsed / stabilityMs);
    return Math.min(0.99, Math.max(0.01, R));
}

async function getUserDesiredRetention(userId) {
    try {
        const r = await pool.query('SELECT desired_retention FROM user_options WHERE user_id = $1', [userId]);
        const v = r.rows[0]?.desired_retention;
        const dr = Number(v);
        return (Number.isFinite(dr) && dr >= 0.7 && dr <= 0.99) ? dr : 0.9;
    } catch {
        return 0.9;
    }
}

async function scheduleWithFsrsOrFallback({ userId, itemId, skillCode, ratingLabel, now }) {
    // Attempt to use ts-fsrs to compute new stability/difficulty and due date.
    // If unavailable or any error occurs, fall back to the simple rating-based scheduler.
    const desiredRetention = await getUserDesiredRetention(userId);
    const client = await pool.connect();
    try {
        // Load history
        const histRes = await client.query(
            `SELECT reviewed_at, rating_label
             FROM user_item_skill_reviews
             WHERE user_id = $1 AND item_id = $2 AND skill_code = $3
             ORDER BY reviewed_at ASC`,
            [userId, itemId, skillCode]
        );

        if (!fsrsLib) throw new Error('FSRS lib not available');

        // Try multiple API shapes to maximize compatibility
        const RatingEnum = fsrsLib.Rating || fsrsLib.RATINGS || null;
        const toRating = (lab) => {
            const s = String(lab || '').toLowerCase();
            if (RatingEnum) {
                if (s === 'again') return RatingEnum.Again ?? RatingEnum.AGAIN ?? 1;
                if (s === 'hard') return RatingEnum.Hard ?? RatingEnum.HARD ?? 2;
                if (s === 'good') return RatingEnum.Good ?? RatingEnum.GOOD ?? 3;
                if (s === 'easy') return RatingEnum.Easy ?? RatingEnum.EASY ?? 4;
            }
            return s === 'again' ? 1 : s === 'hard' ? 2 : s === 'easy' ? 4 : 3;
        };

        const generatorParameters = fsrsLib.generatorParameters || fsrsLib.GeneratorParameters || null;
        const schedulerFactory = fsrsLib.scheduler || fsrsLib.FSRS || null;
        const createEmptyCard = fsrsLib.createEmptyCard || fsrsLib.EmptyCard || null;

        if (!generatorParameters || !schedulerFactory || !createEmptyCard) {
            throw new Error('FSRS API mismatch');
        }

        const params = generatorParameters({ desiredRetention });
        const scheduler = typeof schedulerFactory === 'function' ? schedulerFactory(params) : new schedulerFactory(params);

        // Reconstruct state by replaying history
        let card = createEmptyCard();
        for (const h of histRes.rows) {
            const r = toRating(h.rating_label);
            // Many APIs use .repeat(card, date, rating) and return an object containing the updated card
            const out = scheduler.repeat(card, new Date(h.reviewed_at), r);
            card = out.card ?? out;
        }
        // Apply new rating
        const outNow = scheduler.repeat(card, now, toRating(ratingLabel));
        const newCard = outNow.card ?? outNow;

        // Map card values to our columns (stability in days; due date returned by scheduler)
        const stability = Number(newCard.stability ?? newCard.s ?? null);
        const difficulty = Number(newCard.difficulty ?? newCard.d ?? null);
        const dueAt = new Date(newCard.due ?? (now.getTime() + intervalForLevelMs( (stability && stability > 1) ? 3 : 2 )));

        return { stability: Number.isFinite(stability) ? stability : null, difficulty: Number.isFinite(difficulty) ? difficulty : null, dueAt };
    } catch (err) {
        // Fallback to existing simple rating-based scheduler
        const rating = mapRating(ratingLabel);
        // Load current row for level/due
        const curRes = await client.query(
            `SELECT level, due_at FROM user_item_skill_progress WHERE user_id = $1 AND item_id = $2 AND skill_code = $3`,
            [userId, itemId, skillCode]
        );
        const row = curRes.rows[0] || { level: 1, due_at: null };
        const { nextLevel, dueAt } = computeNextFromRating(row.level, row.due_at, rating);
        return { stability: null, difficulty: null, dueAt, nextLevel };
    } finally {
        client.release();
    }
}

// ------------------------------
// Training Queue
// ------------------------------
app.get('/api/training/queue', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const rows = await pool.query(
            `SELECT uisp.user_id, uisp.item_id, uisp.skill_code, uisp.level, uisp.last_trained_at, uisp.due_at,
                    i.value, i.kinds, i.display_pinyin, i.english_definition, s.label
             FROM user_item_skill_progress uisp
             JOIN items i ON i.id = uisp.item_id
             JOIN skills s ON s.code = uisp.skill_code
             WHERE uisp.user_id = $1 AND uisp.suspended = FALSE
             ORDER BY COALESCE(uisp.due_at, NOW()) ASC
             LIMIT 200`,
            [userId]
        );

        // Load user options or defaults
        const optsRes = await pool.query(
            `SELECT desired_retention, daily_new_limit, daily_review_limit, bury_siblings, leech_threshold
             FROM user_options WHERE user_id = $1`,
            [userId]
        );
        const opts = optsRes.rows[0] || {
            desired_retention: 0.9,
            daily_new_limit: 10,
            daily_review_limit: 100,
            bury_siblings: true,
            leech_threshold: 8,
        };

        // Reviews done today
        const reviewsTodayRes = await pool.query(
            `SELECT COUNT(*)::INT AS cnt FROM user_item_skill_reviews
             WHERE user_id = $1 AND reviewed_at >= CURRENT_DATE`,
            [userId]
        );
        const reviewsToday = reviewsTodayRes.rows[0]?.cnt ?? 0;

        // New introductions today (skills whose first-ever review is today)
        const newTodayRes = await pool.query(
            `SELECT COUNT(*)::INT AS cnt
             FROM (
               SELECT user_id, item_id, skill_code, MIN(reviewed_at) AS first_seen
               FROM user_item_skill_reviews
               WHERE user_id = $1
               GROUP BY user_id, item_id, skill_code
             ) t
             WHERE t.first_seen >= CURRENT_DATE`,
            [userId]
        );
        const newIntroducedToday = newTodayRes.rows[0]?.cnt ?? 0;

        const now = Date.now();
        function buildCard(r) {
            const value = r.value;
            const pinyin = r.display_pinyin || null;
            const english = r.english_definition || null;
            const kinds = r.kinds || [];
            const isWord = Array.isArray(kinds) && kinds.includes('word');
            const isCharacter = Array.isArray(kinds) && kinds.includes('character');
            const isRadical = Array.isArray(kinds) && kinds.includes('radical');

            const basic = (front, back) => ({ card_type: 'basic', card_front: String(front || ''), card_back: String(back || '') });
            switch (r.skill_code) {
                case 'recognition':
                case 'word_recognition':
                case 'radical_recognition':
                    return basic(value, [pinyin, english].filter(Boolean).join(' · '));
                case 'meaning':
                case 'word_meaning':
                    return basic(english || 'Meaning?', [value, pinyin].filter(Boolean).join(' · '));
                case 'pinyin':
                    return basic(value, pinyin || '');
                case 'writing':
                    return basic(`${value}`, [pinyin, english].filter(Boolean).join(' · '));
                default:
                    return basic(value, [pinyin, english].filter(Boolean).join(' · '));
            }
        }

        const entries = rows.rows.map(r => {
            const R = computeRetrievability(r);
            const dueMs = r.due_at ? new Date(r.due_at).getTime() : null;
            const status = computeStatus(now, dueMs, r.level || 1);
            const card = buildCard(r);
            return {
                item_id: r.item_id,
                value: r.value,
                kinds: r.kinds,
                skill_code: r.skill_code,
                skill_label: r.label,
                level: r.level,
                last_trained_at: r.last_trained_at,
                retrievability: R,
                due_at: r.due_at,
                status,
                ...card,
            };
        });

        // Prioritize red, then amber; within each, lowest retrievability first
        const prioritized = entries
            .filter(e => e.status === 'red' || e.status === 'amber')
            .sort((a, b) => {
                const rank = s => (s.status === 'red' ? 0 : s.status === 'amber' ? 1 : 2);
                const ra = rank(a), rb = rank(b);
                if (ra !== rb) return ra - rb;
                return (a.retrievability ?? 0.5) - (b.retrievability ?? 0.5);
            });

        // Enforce daily limits
        const availableTotal = Math.max(0, (opts.daily_review_limit ?? 100) - reviewsToday);
        const availableNew = Math.max(0, (opts.daily_new_limit ?? 10) - newIntroducedToday);

        const newCards = [];
        const reviewCards = [];
        for (const e of prioritized) {
            if (!e.last_trained_at) newCards.push(e);
            else reviewCards.push(e);
        }

        const selectedNew = newCards.slice(0, availableNew);
        const remainingSlots = Math.max(0, availableTotal - selectedNew.length);
        const selectedReview = reviewCards.slice(0, remainingSlots);
        const items = [...selectedNew, ...selectedReview];

        const meta = {
            daily_new_limit: opts.daily_new_limit ?? 10,
            daily_review_limit: opts.daily_review_limit ?? 100,
            remaining_new: availableNew,
            remaining_reviews: Math.max(0, (opts.daily_review_limit ?? 100) - reviewsToday),
            potential_new: newCards.length,
            potential_reviews: reviewCards.length,
            suppressed_new: Math.max(0, newCards.length - selectedNew.length),
            suppressed_reviews: Math.max(0, reviewCards.length - selectedReview.length),
            new_limit_reached: availableNew === 0 && newCards.length > 0,
            review_limit_reached: (opts.daily_review_limit ?? 100) - reviewsToday <= 0 && reviewCards.length > 0,
        };

        res.json({ count: items.length, items, meta });
    } catch (err) {
        console.error('Error building training queue:', err.stack);
        res.status(500).json({ message: 'Server Error fetching training queue' });
    }
});

// ------------------------------
// User Options API
// ------------------------------
app.get('/api/user/options', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const r = await pool.query(
            `SELECT desired_retention, daily_new_limit, daily_review_limit, bury_siblings, leech_threshold, reminders_enabled, reminder_time, nudges_enabled, experiment_id
             FROM user_options WHERE user_id = $1`,
            [userId]
        );
        if (r.rows.length === 0) {
            // Return defaults if not set
            return res.json({
                desired_retention: 0.9,
                daily_new_limit: 10,
                daily_review_limit: 100,
                bury_siblings: true,
                leech_threshold: 8,
                reminders_enabled: false,
                reminder_time: null,
                nudges_enabled: true,
                experiment_id: null,
            });
        }
        res.json(r.rows[0]);
    } catch (err) {
        console.error('Error fetching user options:', err.stack);
        res.status(500).json({ message: 'Server Error fetching options' });
    }
});

// ------------------------------
// Analytics & Stats
// ------------------------------
app.get('/api/stats/overview', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const client = await pool.connect();
    try {
        const leechOptsRes = await client.query('SELECT leech_threshold FROM user_options WHERE user_id = $1', [userId]);
        const leechThreshold = parseInt(leechOptsRes.rows[0]?.leech_threshold ?? 8, 10);

        // Retention by skill over last 30 days
        const retentionRes = await client.query(`
            SELECT r.skill_code,
                   SUM(CASE WHEN r.rating_label <> 'again' THEN 1 ELSE 0 END)::INT AS correct,
                   COUNT(*)::INT AS total,
                   s.label
            FROM user_item_skill_reviews r
            JOIN skills s ON s.code = r.skill_code
            WHERE r.user_id = $1 AND r.reviewed_at >= NOW() - INTERVAL '30 days'
            GROUP BY r.skill_code, s.label
            ORDER BY r.skill_code;
        `, [userId]);

        // Average stability by skill (days)
        const stabilityRes = await client.query(`
            SELECT uisp.skill_code, s.label, AVG(uisp.stability)::FLOAT AS avg_stability
            FROM user_item_skill_progress uisp
            JOIN skills s ON s.code = uisp.skill_code
            WHERE uisp.user_id = $1 AND uisp.stability IS NOT NULL
            GROUP BY uisp.skill_code, s.label
            ORDER BY uisp.skill_code;
        `, [userId]);

        // Leeches: lapses (Again) count by item/skill overall
        const leechesRes = await client.query(`
            SELECT r.item_id, i.value, r.skill_code, s.label,
                   SUM(CASE WHEN r.rating_label = 'again' THEN 1 ELSE 0 END)::INT AS lapses,
                   u.level
            FROM user_item_skill_reviews r
            JOIN items i ON i.id = r.item_id
            JOIN skills s ON s.code = r.skill_code
            JOIN user_item_skill_progress u ON (u.user_id = r.user_id AND u.item_id = r.item_id AND u.skill_code = r.skill_code)
            WHERE r.user_id = $1
            GROUP BY r.item_id, i.value, r.skill_code, s.label, u.level
            HAVING SUM(CASE WHEN r.rating_label = 'again' THEN 1 ELSE 0 END) >= $2
            ORDER BY lapses DESC, r.item_id
            LIMIT 50;
        `, [userId, leechThreshold]);

        // Average daily load (reviews per day)
        const daily7Res = await client.query(`
            SELECT COUNT(*)::INT AS cnt
            FROM user_item_skill_reviews
            WHERE user_id = $1 AND reviewed_at >= NOW() - INTERVAL '7 days';
        `, [userId]);
        const daily30Res = await client.query(`
            SELECT COUNT(*)::INT AS cnt
            FROM user_item_skill_reviews
            WHERE user_id = $1 AND reviewed_at >= NOW() - INTERVAL '30 days';
        `, [userId]);
        const todayRes = await client.query(`
            SELECT COUNT(*)::INT AS cnt
            FROM user_item_skill_reviews
            WHERE user_id = $1 AND reviewed_at >= CURRENT_DATE;
        `, [userId]);

        // Due trend next 7 days
        const dueTrendRes = await client.query(`
            WITH days AS (
                SELECT generate_series(CURRENT_DATE, CURRENT_DATE + INTERVAL '6 days', INTERVAL '1 day')::DATE AS d
            )
            SELECT d.d AS date,
                   COALESCE(
                     (SELECT COUNT(*) FROM user_item_skill_progress u
                      WHERE u.user_id = $1 AND u.due_at::DATE = d.d), 0
                   )::INT AS due_count
            FROM days d
            ORDER BY d.d;
        `, [userId]);

        // Time on task
        const time7Res = await client.query(`
            SELECT COALESCE(SUM(duration_ms), 0)::INT AS ms
            FROM user_item_skill_reviews
            WHERE user_id = $1 AND reviewed_at >= NOW() - INTERVAL '7 days';
        `, [userId]);
        const time30Res = await client.query(`
            SELECT COALESCE(SUM(duration_ms), 0)::INT AS ms
            FROM user_item_skill_reviews
            WHERE user_id = $1 AND reviewed_at >= NOW() - INTERVAL '30 days';
        `, [userId]);

        res.json({
            date_range: { from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), to: new Date() },
            retention_by_skill: retentionRes.rows.map(r => ({
                skill_code: r.skill_code,
                label: r.label,
                total: r.total,
                correct: r.correct,
                retention: r.total > 0 ? r.correct / r.total : null,
            })),
            stability_by_skill: stabilityRes.rows.map(r => ({
                skill_code: r.skill_code,
                label: r.label,
                avg_stability_days: r.avg_stability,
            })),
            leeches: leechesRes.rows,
            avg_daily_load: {
                last_7d: Math.round((daily7Res.rows[0]?.cnt ?? 0) / 7),
                last_30d: Math.round((daily30Res.rows[0]?.cnt ?? 0) / 30),
                today: todayRes.rows[0]?.cnt ?? 0,
            },
            due_trend: dueTrendRes.rows,
            time_on_task: {
                last_7d_ms: time7Res.rows[0]?.ms ?? 0,
                last_30d_ms: time30Res.rows[0]?.ms ?? 0,
            },
        });
    } catch (err) {
        console.error('Error building stats overview:', err.stack);
        res.status(500).json({ message: 'Server Error building stats' });
    } finally {
        client.release();
    }
});

// ------------------------------
// Migration: initialize FSRS state for existing discovered items
// ------------------------------
app.post('/api/admin/migrate/seed-fsrs', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    // For safety in multi-user contexts you might gate this behind admin; for now allow per-user invocation
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Find skills without any review history
        const rows = await client.query(`
            SELECT u.user_id, u.item_id, u.skill_code, u.level, u.last_trained_at, u.due_at
            FROM user_item_skill_progress u
            LEFT JOIN (
                SELECT user_id, item_id, skill_code, MIN(reviewed_at) AS first_seen
                FROM user_item_skill_reviews
                WHERE user_id = $1
                GROUP BY user_id, item_id, skill_code
            ) r ON r.user_id = u.user_id AND r.item_id = u.item_id AND r.skill_code = u.skill_code
            WHERE u.user_id = $1 AND r.first_seen IS NULL;
        `, [userId]);

        const now = new Date();
        let seeded = 0;
        for (const r of rows.rows) {
            // Seed a baseline 'good' review now to give FSRS an initial state
            await client.query(
                `INSERT INTO user_item_skill_reviews (user_id, item_id, skill_code, reviewed_at, rating_label, rating_value, duration_ms)
                 VALUES ($1, $2, $3, $4, 'good', 3, 2000)`,
                [userId, r.item_id, r.skill_code, now]
            );
            // Run scheduler to compute initial due/stability/difficulty
            const sched = await scheduleWithFsrsOrFallback({ userId, itemId: r.item_id, skillCode: r.skill_code, ratingLabel: 'good', now });
            if (sched.stability != null || sched.difficulty != null) {
                await client.query(
                    `UPDATE user_item_skill_progress
                     SET last_trained_at = $1, due_at = $2, stability = $3, difficulty = $4
                     WHERE user_id = $5 AND item_id = $6 AND skill_code = $7`,
                    [now, sched.dueAt, sched.stability, sched.difficulty, userId, r.item_id, r.skill_code]
                );
            } else {
                await client.query(
                    `UPDATE user_item_skill_progress
                     SET last_trained_at = $1, due_at = $2
                     WHERE user_id = $3 AND item_id = $4 AND skill_code = $5`,
                    [now, sched.dueAt, userId, r.item_id, r.skill_code]
                );
            }
            seeded++;
        }

        await client.query('COMMIT');
        res.json({ message: 'FSRS seeding complete', seeded });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error during FSRS seeding migration:', err.stack);
        res.status(500).json({ message: 'Server Error during FSRS seeding migration' });
    } finally {
        client.release();
    }
});

app.get('/api/stats/daily', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const days = Math.max(1, Math.min(90, parseInt(req.query.days ?? '30', 10)));
    const client = await pool.connect();
    try {
        const dailyRes = await client.query(`
            WITH day_series AS (
                SELECT generate_series((CURRENT_DATE - $2::INT), CURRENT_DATE, INTERVAL '1 day')::DATE AS d
            ),
            reviews AS (
                SELECT reviewed_at::DATE AS day,
                       COUNT(*)::INT AS total,
                       SUM(CASE WHEN rating_label <> 'again' THEN 1 ELSE 0 END)::INT AS correct,
                       COALESCE(SUM(duration_ms), 0)::INT AS ms
                FROM user_item_skill_reviews
                WHERE user_id = $1 AND reviewed_at >= CURRENT_DATE - $2::INT
                GROUP BY reviewed_at::DATE
            ),
            new_introduced AS (
                SELECT first_seen::DATE AS day, COUNT(*)::INT AS new_count
                FROM (
                    SELECT MIN(reviewed_at) AS first_seen
                    FROM user_item_skill_reviews
                    WHERE user_id = $1 AND reviewed_at >= CURRENT_DATE - $2::INT
                    GROUP BY user_id, item_id, skill_code
                ) t GROUP BY first_seen::DATE
            )
            SELECT ds.d AS date,
                   COALESCE(r.total, 0)::INT AS total,
                   COALESCE(r.correct, 0)::INT AS correct,
                   CASE WHEN COALESCE(r.total, 0) > 0 THEN (r.correct::FLOAT / r.total) ELSE NULL END AS retention,
                   COALESCE(r.ms, 0)::INT AS ms,
                   COALESCE(n.new_count, 0)::INT AS new_count
            FROM day_series ds
            LEFT JOIN reviews r ON r.day = ds.d
            LEFT JOIN new_introduced n ON n.day = ds.d
            ORDER BY ds.d;
        `, [userId, days]);
        res.json({ days, series: dailyRes.rows });
    } catch (err) {
        console.error('Error building daily stats:', err.stack);
        res.status(500).json({ message: 'Server Error building daily stats' });
    } finally {
        client.release();
    }
});

// Suspend/unsuspend a skill (leech management)
app.post('/api/items/:itemId/skills/:skillCode/suspend', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const itemId = parseInt(req.params.itemId, 10);
    const skillCode = req.params.skillCode;
    const { suspended } = req.body || {};
    if (!Number.isFinite(itemId)) return res.status(400).json({ message: 'Invalid item id' });
    const client = await pool.connect();
    try {
        const r = await client.query(
            `UPDATE user_item_skill_progress SET suspended = $1 WHERE user_id = $2 AND item_id = $3 AND skill_code = $4
             RETURNING user_id, item_id, skill_code, suspended`,
            [!!suspended, userId, itemId, skillCode]
        );
        if (r.rows.length === 0) return res.status(404).json({ message: 'Skill not found' });
        res.json(r.rows[0]);
    } catch (err) {
        console.error('Error updating suspension:', err.stack);
        res.status(500).json({ message: 'Server Error updating suspension' });
    } finally {
        client.release();
    }
});

// Undo last answer (remove last review and reschedule based on previous state)
app.post('/api/items/:itemId/skills/:skillCode/undo', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const itemId = parseInt(req.params.itemId, 10);
    const skillCode = req.params.skillCode;
    if (!Number.isFinite(itemId)) return res.status(400).json({ message: 'Invalid item id' });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Delete the most recent review
        const del = await client.query(
            `DELETE FROM user_item_skill_reviews
             WHERE ctid IN (
                 SELECT ctid FROM user_item_skill_reviews
                 WHERE user_id = $1 AND item_id = $2 AND skill_code = $3
                 ORDER BY reviewed_at DESC
                 LIMIT 1
             ) RETURNING reviewed_at`,
            [userId, itemId, skillCode]
        );
        if (del.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'No review to undo' });
        }

        // Rebuild schedule from remaining history (if any)
        const hist = await client.query(
            `SELECT reviewed_at, rating_label
             FROM user_item_skill_reviews
             WHERE user_id = $1 AND item_id = $2 AND skill_code = $3
             ORDER BY reviewed_at ASC`,
            [userId, itemId, skillCode]
        );

        let updateQuery, updateParams;
        if (fsrsLib && hist.rows.length > 0) {
            // Replay with FSRS
            const desiredRetention = await getUserDesiredRetention(userId);
            const generatorParameters = fsrsLib.generatorParameters || fsrsLib.GeneratorParameters || null;
            const schedulerFactory = fsrsLib.scheduler || fsrsLib.FSRS || null;
            const createEmptyCard = fsrsLib.createEmptyCard || fsrsLib.EmptyCard || null;
            if (generatorParameters && schedulerFactory && createEmptyCard) {
                const params = generatorParameters({ desiredRetention });
                const scheduler = typeof schedulerFactory === 'function' ? schedulerFactory(params) : new schedulerFactory(params);
                const RatingEnum = fsrsLib.Rating || fsrsLib.RATINGS || null;
                const toRating = (lab) => {
                    const s = String(lab || '').toLowerCase();
                    if (RatingEnum) {
                        if (s === 'again') return RatingEnum.Again ?? RatingEnum.AGAIN ?? 1;
                        if (s === 'hard') return RatingEnum.Hard ?? RatingEnum.HARD ?? 2;
                        if (s === 'good') return RatingEnum.Good ?? RatingEnum.GOOD ?? 3;
                        if (s === 'easy') return RatingEnum.Easy ?? RatingEnum.EASY ?? 4;
                    }
                    return s === 'again' ? 1 : s === 'hard' ? 2 : s === 'easy' ? 4 : 3;
                };
                let card = createEmptyCard();
                for (const h of hist.rows) {
                    const out = scheduler.repeat(card, new Date(h.reviewed_at), toRating(h.rating_label));
                    card = out.card ?? out;
                }
                const stability = Number(card.stability ?? card.s ?? null);
                const difficulty = Number(card.difficulty ?? card.d ?? null);
                const nextDue = card.due ? new Date(card.due) : null;
                updateQuery = `UPDATE user_item_skill_progress
                               SET stability = $1, difficulty = $2, due_at = $3
                               WHERE user_id = $4 AND item_id = $5 AND skill_code = $6
                               RETURNING user_id, item_id, skill_code, stability, difficulty, due_at`;
                updateParams = [Number.isFinite(stability) ? stability : null, Number.isFinite(difficulty) ? difficulty : null, nextDue, userId, itemId, skillCode];
            }
        }

        if (!updateQuery) {
            // Fallback: just set due now and clear stability/difficulty
            updateQuery = `UPDATE user_item_skill_progress
                           SET stability = NULL, difficulty = NULL, due_at = NOW()
                           WHERE user_id = $1 AND item_id = $2 AND skill_code = $3
                           RETURNING user_id, item_id, skill_code, stability, difficulty, due_at`;
            updateParams = [userId, itemId, skillCode];
        }
        const upd = await client.query(updateQuery, updateParams);
        await client.query('COMMIT');
        res.json(upd.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error undoing review:', err.stack);
        res.status(500).json({ message: 'Server Error undoing review' });
    } finally {
        client.release();
    }
});

// ------------------------------
// Import/Export and Batch Sync
// ------------------------------

// Export reviews as JSON or CSV
app.get('/api/reviews/export', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const format = (req.query.format || 'json').toString().toLowerCase();
    const days = parseInt(req.query.days ?? '0', 10);
    const client = await pool.connect();
    try {
        const params = [userId];
        let where = 'user_id = $1';
        if (Number.isFinite(days) && days > 0) {
            where += ' AND reviewed_at >= NOW() - ($2 || \n) ::interval';
            params.push(`${days} days`);
        }
        const r = await client.query(
            `SELECT user_id, item_id, skill_code, reviewed_at, rating_label, rating_value, duration_ms, experiment_id
             FROM user_item_skill_reviews WHERE ${where} ORDER BY reviewed_at ASC`,
            params
        );
        if (format === 'csv') {
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename="reviews.csv"');
            const header = 'user_id,item_id,skill_code,reviewed_at,rating_label,rating_value,duration_ms,experiment_id\n';
            const rows = r.rows.map(row => [
                row.user_id, row.item_id, row.skill_code,
                new Date(row.reviewed_at).toISOString(),
                row.rating_label, row.rating_value, row.duration_ms ?? '', row.experiment_id ?? ''
            ].join(','));
            res.send(header + rows.join('\n'));
        } else {
            res.setHeader('Content-Type', 'application/json');
            res.json(r.rows);
        }
    } catch (err) {
        console.error('Error exporting reviews:', err.stack);
        res.status(500).json({ message: 'Server Error exporting reviews' });
    } finally {
        client.release();
    }
});

// Import reviews (JSON array); optional dry_run
app.post('/api/reviews/import', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { reviews, dry_run } = req.body || {};
    if (!Array.isArray(reviews)) return res.status(400).json({ message: 'reviews must be an array' });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        let inserted = 0;
        for (const rev of reviews) {
            const { item_id, skill_code, reviewed_at, rating_label, rating_value, duration_ms, experiment_id } = rev || {};
            if (!item_id || !skill_code || !rating_label) continue;
            if (!dry_run) {
                await client.query(
                    `INSERT INTO user_item_skill_reviews (user_id, item_id, skill_code, reviewed_at, rating_label, rating_value, duration_ms, experiment_id)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                     ON CONFLICT (user_id, item_id, skill_code, reviewed_at) DO NOTHING`,
                    [userId, item_id, skill_code, reviewed_at ? new Date(reviewed_at) : new Date(), rating_label, rating_value ?? null, duration_ms ?? null, experiment_id ?? null]
                );
                inserted++;
            }
        }
        await client.query('COMMIT');
        res.json({ inserted, dry_run: !!dry_run });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error importing reviews:', err.stack);
        res.status(500).json({ message: 'Server Error importing reviews' });
    } finally {
        client.release();
    }
});

// Batch sync reviews with scheduling (offline-friendly)
app.post('/api/reviews/batch', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { events } = req.body || {};
    if (!Array.isArray(events) || events.length === 0) return res.status(400).json({ message: 'events must be a non-empty array' });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const exp = await client.query('SELECT experiment_id FROM user_options WHERE user_id = $1', [userId]);
        const experimentId = exp.rows[0]?.experiment_id ?? null;
        let processed = 0;
        // Sort by reviewed_at to ensure chronological apply
        events.sort((a, b) => new Date(a.reviewed_at || Date.now()) - new Date(b.reviewed_at || Date.now()));
        for (const ev of events) {
            const itemId = parseInt(ev.item_id, 10);
            const skillCode = ev.skill_code;
            const ratingLabel = String(ev.rating_label || '').toLowerCase();
            const reviewedAt = ev.reviewed_at ? new Date(ev.reviewed_at) : new Date();
            const duration = ev.duration_ms ?? null;
            if (!Number.isFinite(itemId) || !skillCode || !ratingLabel) continue;

            // Ensure progress row exists
            await client.query(
                `INSERT INTO user_item_skill_progress (user_id, item_id, skill_code, level, due_at)
                 VALUES ($1, $2, $3, 1, NOW())
                 ON CONFLICT (user_id, item_id, skill_code) DO NOTHING`,
                [userId, itemId, skillCode]
            );

            await client.query(
                `INSERT INTO user_item_skill_reviews (user_id, item_id, skill_code, reviewed_at, rating_label, rating_value, duration_ms, experiment_id)
                 VALUES ($1, $2, $3, $4, $5, NULL, $6, $7)
                 ON CONFLICT (user_id, item_id, skill_code, reviewed_at) DO NOTHING`,
                [userId, itemId, skillCode, reviewedAt, ratingLabel, duration, experimentId]
            );

            // Reschedule after each event
            const sched = await scheduleWithFsrsOrFallback({ userId, itemId, skillCode, ratingLabel, now: reviewedAt });
            if (sched.stability != null || sched.difficulty != null) {
                await client.query(
                    `UPDATE user_item_skill_progress
                     SET last_trained_at = $1, due_at = $2, stability = $3, difficulty = $4
                     WHERE user_id = $5 AND item_id = $6 AND skill_code = $7`,
                    [reviewedAt, sched.dueAt, sched.stability, sched.difficulty, userId, itemId, skillCode]
                );
            } else {
                await client.query(
                    `UPDATE user_item_skill_progress
                     SET last_trained_at = $1, due_at = $2
                     WHERE user_id = $3 AND item_id = $4 AND skill_code = $5`,
                    [reviewedAt, sched.dueAt, userId, itemId, skillCode]
                );
            }
            processed++;
        }

        await client.query('COMMIT');
        res.json({ processed });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error in batch reviews:', err.stack);
        res.status(500).json({ message: 'Server Error in batch reviews' });
    } finally {
        client.release();
    }
});

app.put('/api/user/options', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const {
        desired_retention,
        daily_new_limit,
        daily_review_limit,
        bury_siblings,
        leech_threshold,
        reminders_enabled,
        reminder_time,
        nudges_enabled,
        experiment_id,
    } = req.body || {};

    // Simple validation with clamping
    const dr = Math.max(0.7, Math.min(0.99, Number(desired_retention ?? 0.9)));
    const newLim = Math.max(0, Math.min(200, parseInt(daily_new_limit ?? 10, 10)));
    const revLim = Math.max(0, Math.min(2000, parseInt(daily_review_limit ?? 100, 10)));
    const bury = !!(bury_siblings ?? true);
    const leech = Math.max(1, Math.min(50, parseInt(leech_threshold ?? 8, 10)));
    const remind = !!(reminders_enabled ?? false);
    const rtime = reminder_time ?? null;
    const nudges = !!(nudges_enabled ?? true);
    const expId = experiment_id ?? null;

    try {
        await pool.query(
            `INSERT INTO user_options (user_id, desired_retention, daily_new_limit, daily_review_limit, bury_siblings, leech_threshold, reminders_enabled, reminder_time, nudges_enabled, experiment_id, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
             ON CONFLICT (user_id)
             DO UPDATE SET desired_retention = EXCLUDED.desired_retention,
                           daily_new_limit = EXCLUDED.daily_new_limit,
                           daily_review_limit = EXCLUDED.daily_review_limit,
                           bury_siblings = EXCLUDED.bury_siblings,
                           leech_threshold = EXCLUDED.leech_threshold,
                           reminders_enabled = EXCLUDED.reminders_enabled,
                           reminder_time = EXCLUDED.reminder_time,
                           nudges_enabled = EXCLUDED.nudges_enabled,
                           experiment_id = EXCLUDED.experiment_id,
                           updated_at = NOW()`,
            [userId, dr, newLim, revLim, bury, leech, remind, rtime, nudges, expId]
        );
        res.json({ message: 'Options updated', desired_retention: dr, daily_new_limit: newLim, daily_review_limit: revLim, bury_siblings: bury, leech_threshold: leech, reminders_enabled: remind, reminder_time: rtime, nudges_enabled: nudges, experiment_id: expId });
    } catch (err) {
        console.error('Error updating user options:', err.stack);
        res.status(500).json({ message: 'Server Error updating options' });
    }
});

async function seedSkillsForItemIfMissing(client, userId, itemId, kinds) {
    const isCharacter = Array.isArray(kinds) && kinds.includes('character');
    const isWord = Array.isArray(kinds) && kinds.includes('word');
    const isRadical = Array.isArray(kinds) && kinds.includes('radical');

    const toSeed = [];
    if (isCharacter) toSeed.push(...DEFAULT_CHARACTER_SKILLS);
    if (isWord) toSeed.push(...DEFAULT_WORD_SKILLS);
    if (isRadical) toSeed.push(...DEFAULT_RADICAL_SKILLS);

    for (const s of toSeed) {
        await client.query(
            `INSERT INTO user_item_skill_progress (user_id, item_id, skill_code, level, due_at)
             VALUES ($1, $2, $3, 1, NOW())
             ON CONFLICT (user_id, item_id, skill_code) DO NOTHING`,
            [userId, itemId, s.code]
        );
    }
}

async function applyOverdueDecayIfNeeded(client, row) {
    // row: { user_id, item_id, skill_code, level, due_at }
    const level = row.level || 1;
    const dueAt = row.due_at ? new Date(row.due_at) : null;
    const now = Date.now();
    const status = computeStatus(now, dueAt ? dueAt.getTime() : null, level);
    if (status !== 'red') return row; // no change

    const newLevel = Math.max(1, level - 1);
    const updated = await client.query(
        `UPDATE user_item_skill_progress
         SET level = $1,
             due_at = NOW() -- after decay, allow immediate training (amber)
         WHERE user_id = $2 AND item_id = $3 AND skill_code = $4
         RETURNING user_id, item_id, skill_code, level, last_trained_at, due_at`,
        [newLevel, row.user_id, row.item_id, row.skill_code]
    );
    return updated.rows[0];
}

// ----------------------------------------------------
// Root Route
// ----------------------------------------------------
app.get('/', (req, res) => {
    res.send('HanziDex Backend is Running!');
});

// ----------------------------------------------------
// Authentication Routes
// ----------------------------------------------------

// Register a new user
app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check if username already exists
        const userCheck = await client.query('SELECT id FROM users WHERE username = $1', [username]);
        if (userCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ message: 'Username already taken.' });
        }

        // Hash password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Insert new user
        const newUserResult = await client.query(
            'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, created_at',
            [username, passwordHash]
        );
        const newUser = newUserResult.rows[0];

        // Initialize user_item_progress for ALL existing items for the new user
        await client.query(`
            INSERT INTO user_item_progress (user_id, item_id, status)
            SELECT $1, id, 'LOCKED' FROM items
        `, [newUser.id]);

        await client.query('COMMIT');
        res.status(201).json({ message: 'User registered successfully!', user: newUser });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error during user registration:', err.stack);
        res.status(500).json({ message: 'Server Error during registration.' });
    } finally {
        client.release();
    }
});

// Login user
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }

    const client = await pool.connect();
    try {
        const userResult = await client.query('SELECT * FROM users WHERE username = $1', [username]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        const user = userResult.rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username },
            jwtSecret,
            { expiresIn: '12h' }
        );

        res.status(200).json({ message: 'Logged in successfully!', token: token, user: { id: user.id, username: user.username } });

    } catch (err) {
        console.error('Error during user login:', err.stack);
        res.status(500).json({ message: 'Server Error during login.' });
    } finally {
        client.release();
    }
});

// ----------------------------------------------------
// Authentication Middleware
// ----------------------------------------------------
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Authentication token required.' });
    }

    if (!jwtSecret) {
        console.error("JWT_SECRET is not defined!");
        return res.status(500).json({ message: 'Server configuration error.' });
    }

    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) {
            console.error('JWT verification error:', err.message);
            return res.status(403).json({ message: 'Invalid or expired token.' });
        }
        req.user = user;
        next();
    });
}

// ----------------------------------------------------
// Item Retrieval Routes (Protected)
// ----------------------------------------------------

// Get all DISCOVERED Items for the current user
app.get('/api/discovered-items', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const result = await pool.query(`
            SELECT 
                i.id, i.value, i.kinds, i.type, i.hsk_level,
                i.components, i.is_contained_in, i.constituent_items,
                i.radicals_contained, i.stroke_count,
                COALESCE(i.display_pinyin, i.pinyin) AS pinyin,
                i.display_pinyin,
                i.english_definition,
                uip.status
            FROM items i
            JOIN user_item_progress uip ON i.id = uip.item_id
            WHERE uip.user_id = $1 AND uip.status = 'DISCOVERED'

            ORDER BY 
                CASE
                    WHEN 'radical'   = ANY(i.kinds) THEN 1
                    WHEN 'character' = ANY(i.kinds) THEN 2
                    WHEN 'word'      = ANY(i.kinds) THEN 3
                    ELSE 4
                END,
                i.id;
        `, [userId]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching discovered items:', err.stack);
        res.status(500).json({ message: 'Server Error fetching discovered items' });
    }
});

// Get all DISCOVERABLE items for the current user
app.get('/api/discoverable-items', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const result = await pool.query(`
            SELECT 
                i.id, i.value, i.kinds, i.type, i.hsk_level,
                i.components, i.is_contained_in, i.constituent_items,
                i.radicals_contained, i.stroke_count,
                COALESCE(i.display_pinyin, i.pinyin) AS pinyin,
                i.display_pinyin,
                i.english_definition,
                uip.status
            FROM items i
            JOIN user_item_progress uip ON i.id = uip.item_id
            WHERE uip.user_id = $1 AND uip.status = 'DISCOVERABLE'

            ORDER BY
                CASE
                    WHEN 'radical'   = ANY(i.kinds) THEN 1
                    WHEN 'character' = ANY(i.kinds) THEN 2
                    WHEN 'word'      = ANY(i.kinds) THEN 3
                    ELSE 4
                END, 
                i.id;
        `, [userId]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching discoverable items:', err.stack);
        res.status(500).json({ message: 'Server Error fetching discoverable items' });
    }
});

// Generate a daily batch of 3 DISCOVERABLE items from LOCKED pool
app.post('/api/generate-daily-discoverables', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const generatedItems = [];

        const lockedItemsResult = await client.query(`
            SELECT i.id, i.value, i.kinds, i.hsk_level
            FROM items i
            JOIN user_item_progress uip ON i.id = uip.item_id
            WHERE uip.user_id = $1
              AND uip.status = 'LOCKED'
              AND COALESCE(i.hsk_level, 1) = 1
            ORDER BY
                CASE
                    WHEN 'radical'   = ANY(i.kinds) THEN 1
                    WHEN 'character' = ANY(i.kinds) THEN 2
                    WHEN 'word'      = ANY(i.kinds) THEN 3
                    ELSE 4
                END,
                i.id
            LIMIT 3;
        `, [userId]);

        for (const item of lockedItemsResult.rows) {
            await updateItemStatus(client, userId, item.id, 'DISCOVERABLE');
            generatedItems.push({ 
                id: item.id, 
                value: item.value, 
                type: item.type, 
                pinyin: item.display_pinyin
            });
                    }

        await client.query('COMMIT');
        res.status(200).json({ message: 'Daily discoverable items generated!', items: generatedItems });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error generating daily discoverables:', err.stack);
        res.status(500).json({ message: 'Server Error generating daily discoverables.' });
    } finally {
        client.release();
    }
});

// Discover a new Item (mark as DISCOVERED) for the current user
app.post('/api/discover', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { item_value } = req.body;

    if (!item_value || item_value.trim() === '') {
        return res.status(400).json({ message: 'Item value is required for discovery.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let message = '';
        let isNewlyDiscovered = false;

        const itemResult = await client.query(`
            SELECT 
                i.id, i.value, i.kinds, i.components, i.is_contained_in,
                i.constituent_items, i.radicals_contained, i.stroke_count,
                COALESCE(i.display_pinyin, i.pinyin) AS pinyin,
                i.display_pinyin,
                i.english_definition,
                uip.status
            FROM items i
            JOIN user_item_progress uip ON i.id = uip.item_id
            WHERE uip.user_id = $1 AND i.value = $2;
        `, [userId, item_value]);

        if (itemResult.rows.length === 0) {
            return res.status(404).json({ message: `Item '${item_value}' not found.` });
        }

        const item = itemResult.rows[0];
        const hasKind = (k) => Array.isArray(item.kinds) && item.kinds.includes(k);

        if (item.status === 'LOCKED' || item.status === 'DISCOVERABLE') {
            await updateItemStatus(client, userId, item.id, 'DISCOVERED');
            message = `'${item.value}' (${item.kinds.join(', ')}) discovered successfully!`;
            isNewlyDiscovered = true;

            // Seed skills for this item (e.g., character skills)
            await seedSkillsForItemIfMissing(client, userId, item.id, item.kinds);

            // Character logic
            if (hasKind('character')) {
                const itemsToMakeDiscoverable = new Set();

                if (Array.isArray(item.components)) item.components.forEach(v => itemsToMakeDiscoverable.add(v));
                if (Array.isArray(item.radicals_contained)) item.radicals_contained.forEach(v => itemsToMakeDiscoverable.add(v));

                for (const relatedValue of itemsToMakeDiscoverable) {
                    const related = await client.query(`
                        SELECT i.id, uip.status, i.kinds
                        FROM items i
                        JOIN user_item_progress uip ON i.id = uip.item_id
                        WHERE uip.user_id = $1 AND i.value = $2
                          AND ( 'character' = ANY(i.kinds) OR 'radical' = ANY(i.kinds) )
                    `, [userId, relatedValue]);

                    if (related.rows.length > 0 && related.rows[0].status === 'LOCKED') {
                        await updateItemStatus(client, userId, related.rows[0].id, 'DISCOVERABLE');
                        message += ` Related '${relatedValue}' is now discoverable.`;
                    }
                }

                // Unlock words when all constituent chars discovered
                const potentialWords = await client.query(`
                    SELECT i.id, i.value, i.constituent_items, uip.status
                    FROM items i
                    JOIN user_item_progress uip ON i.id = uip.item_id
                    WHERE uip.user_id = $1
                      AND 'word' = ANY(i.kinds)
                      AND $2 = ANY(i.constituent_items)
                `, [userId, item.value]);

                for (const w of potentialWords.rows) {
                    if (w.status !== 'LOCKED') continue;

                    const chars = Array.isArray(w.constituent_items) ? w.constituent_items : [];
                    if (chars.length === 0) continue;

                    let allDiscovered = true;
                    for (const c of chars) {
                        const s = await client.query(`
                            SELECT uip.status
                            FROM items i
                            JOIN user_item_progress uip ON i.id = uip.item_id
                            WHERE uip.user_id = $1 AND i.value = $2
                              AND 'character' = ANY(i.kinds)
                        `, [userId, c]);
                        if (s.rows.length === 0 || s.rows[0].status !== 'DISCOVERED') {
                            allDiscovered = false;
                            break;
                        }
                    }

                    if (allDiscovered) {
                        await updateItemStatus(client, userId, w.id, 'DISCOVERABLE');
                        message += ` Item '${w.value}' is now discoverable (all constituent characters discovered).`;
                    }
                }
            }

            // Word logic
            if (hasKind('word') && !hasKind('character')) {
                const chars = Array.isArray(item.constituent_items) ? item.constituent_items : [];
                for (const c of chars) {
                    const ch = await client.query(`
                        SELECT i.id, uip.status
                        FROM items i
                        JOIN user_item_progress uip ON i.id = uip.item_id
                        WHERE uip.user_id = $1 AND i.value = $2
                          AND 'character' = ANY(i.kinds)
                    `, [userId, c]);
                    if (ch.rows.length > 0 && ch.rows[0].status === 'LOCKED') {
                        await updateItemStatus(client, userId, ch.rows[0].id, 'DISCOVERABLE');
                        message += ` Constituent '${c}' is now discoverable.`;
                    }
                }
            }
        } else {
            message = `'${item.value}' is already discovered.`;
        }

        await client.query('COMMIT');
        res.status(200).json({ message });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error during discovery:', err.stack);
        res.status(500).json({ message: 'Server Error during discovery.' });
    } finally {
        client.release();
    }
});

// ----------------------------------------------------
// Skills API
// ----------------------------------------------------

// Fetch skills for a specific item for current user
app.get('/api/items/:itemId/skills', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const itemId = parseInt(req.params.itemId, 10);
    if (!Number.isFinite(itemId)) {
        return res.status(400).json({ message: 'Invalid item id' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Get kinds for the item to decide which skills to seed
        const itemRes = await client.query('SELECT kinds FROM items WHERE id = $1', [itemId]);
        if (itemRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Item not found' });
        }
        const kinds = itemRes.rows[0].kinds;

        // Ensure the user has DISCOVERED this item
        const statusRes = await client.query(
            `SELECT status FROM user_item_progress WHERE user_id = $1 AND item_id = $2`,
            [userId, itemId]
        );
        if (statusRes.rows.length === 0 || statusRes.rows[0].status !== 'DISCOVERED') {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: 'Skills available only for discovered items.' });
        }

        await seedSkillsForItemIfMissing(client, userId, itemId, kinds);

        const rowsRes = await client.query(
            `SELECT uisp.user_id, uisp.item_id, uisp.skill_code, uisp.level, uisp.last_trained_at, uisp.due_at, uisp.stability, uisp.difficulty, s.label
             FROM user_item_skill_progress uisp
             JOIN skills s ON s.code = uisp.skill_code
             WHERE uisp.user_id = $1 AND uisp.item_id = $2
             ORDER BY uisp.skill_code`,
            [userId, itemId]
        );

        await client.query('COMMIT');

        const now = Date.now();
        const result = rowsRes.rows.map(r => {
            const dueMs = r.due_at ? new Date(r.due_at).getTime() : null;
            const status = computeStatus(now, dueMs, r.level || 1);
            const retrievability = computeRetrievability(r);
            const greenUntilAt = r.due_at ? new Date(r.due_at) : null;
            const redAt = r.due_at ? new Date(dueMs + graceForLevelMs(r.level || 1)) : null;
            return {
                skill_code: r.skill_code,
                label: rowsRes.rows.find(x => x.skill_code === r.skill_code)?.label || r.skill_code,
                level: r.level,
                due_at: r.due_at,
                last_trained_at: r.last_trained_at,
                status,
                retrievability,
                stability: r.stability ?? null,
                difficulty: r.difficulty ?? null,
                green_until_at: greenUntilAt,
                red_at: redAt,
            };
        });

        res.json(result);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error fetching skills:', err.stack);
        res.status(500).json({ message: 'Server Error fetching skills' });
    } finally {
        client.release();
    }
});

// Train a specific skill for an item
app.post('/api/items/:itemId/skills/:skillCode/train', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const itemId = parseInt(req.params.itemId, 10);
    const skillCode = req.params.skillCode;
    const { result, rating: ratingInput, duration_ms } = req.body; // rating: again|hard|good|easy

    if (!Number.isFinite(itemId)) {
        return res.status(400).json({ message: 'Invalid item id' });
    }
    if (!skillCode) {
        return res.status(400).json({ message: 'Skill code required' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Ensure the user has DISCOVERED this item before training
        const statusRes = await client.query(
            `SELECT status FROM user_item_progress WHERE user_id = $1 AND item_id = $2`,
            [userId, itemId]
        );
        if (statusRes.rows.length === 0 || statusRes.rows[0].status !== 'DISCOVERED') {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: 'Training available only for discovered items.' });
        }

        // Ensure row exists
        await client.query(
            `INSERT INTO user_item_skill_progress (user_id, item_id, skill_code, level, due_at)
             VALUES ($1, $2, $3, 1, NOW())
             ON CONFLICT (user_id, item_id, skill_code) DO NOTHING`,
            [userId, itemId, skillCode]
        );

        // Load current row
        const curRes = await client.query(
            `SELECT user_id, item_id, skill_code, level, last_trained_at, due_at
             FROM user_item_skill_progress
             WHERE user_id = $1 AND item_id = $2 AND skill_code = $3`,
            [userId, itemId, skillCode]
        );
        if (curRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Skill not found' });
        }

        let row = { ...curRes.rows[0] };
        const now = new Date();
        const rating = mapRating(ratingInput ?? result);

        // Log the review
        // Attach experiment id if present
        const exp = await client.query('SELECT experiment_id FROM user_options WHERE user_id = $1', [userId]);
        const experimentId = exp.rows[0]?.experiment_id ?? null;
        await client.query(
            `INSERT INTO user_item_skill_reviews (user_id, item_id, skill_code, reviewed_at, rating_label, rating_value, duration_ms)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [userId, itemId, skillCode, now, rating.label, rating.value, duration_ms ?? null]
        );
        if (experimentId) {
            await client.query(
                `UPDATE user_item_skill_reviews SET experiment_id = $1
                 WHERE user_id = $2 AND item_id = $3 AND skill_code = $4 AND reviewed_at = $5`,
                [experimentId, userId, itemId, skillCode, now]
            );
        }

        // Try FSRS scheduling
        const sched = await scheduleWithFsrsOrFallback({ userId, itemId, skillCode, ratingLabel: rating.label, now });
        let updateQuery, updateParams;
        if (sched.stability != null || sched.difficulty != null) {
            // FSRS path: keep level as a coarse display (optional increment on success)
            const displayLevel = rating.label === 'again' ? Math.max(1, (row.level || 1) - 1)
                                 : rating.label === 'easy' ? Math.min(60, (row.level || 1) + 2)
                                 : Math.min(60, (row.level || 1) + 1);
            updateQuery = `UPDATE user_item_skill_progress
                           SET level = $1, last_trained_at = $2, due_at = $3, stability = $4, difficulty = $5
                           WHERE user_id = $6 AND item_id = $7 AND skill_code = $8
                           RETURNING user_id, item_id, skill_code, level, last_trained_at, due_at, stability, difficulty`;
            updateParams = [displayLevel, now, sched.dueAt, sched.stability, sched.difficulty, userId, itemId, skillCode];
        } else {
            // Fallback path used nextLevel
            updateQuery = `UPDATE user_item_skill_progress
                           SET level = $1, last_trained_at = $2, due_at = $3
                           WHERE user_id = $4 AND item_id = $5 AND skill_code = $6
                           RETURNING user_id, item_id, skill_code, level, last_trained_at, due_at, stability, difficulty`;
            updateParams = [sched.nextLevel || row.level || 1, now, sched.dueAt, userId, itemId, skillCode];
        }
        const upd = await client.query(updateQuery, updateParams);
        row = upd.rows[0];

        await client.query('COMMIT');

        const status = computeStatus(Date.now(), row.due_at ? new Date(row.due_at).getTime() : null, row.level || 1);
        return res.json({
            skill_code: row.skill_code,
            level: row.level,
            due_at: row.due_at,
            status,
            stability: row.stability ?? null,
            difficulty: row.difficulty ?? null,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error training skill:', err.stack);
        res.status(500).json({ message: 'Server Error training skill' });
    } finally {
        client.release();
    }
});

// ----------------------------------------------------
// Start the Server only after confirming DB connection
// ----------------------------------------------------
async function startServer() {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        console.log('Database connected successfully at:', result.rows[0].now);
        client.release();

        // Ensure skills schema exists before starting
        await ensureSkillsSchema();
        await initFsrs();

        app.listen(port, () => {
            console.log(`Server running on port ${port}`);
            if (!fsrsLib) {
                console.warn('FSRS library not found; using approximate scheduler. Install @open-spaced-repetition/ts-fsrs for full FSRS.');
            }
        });

    } catch (err) {
        console.error('CRITICAL: Initial Database Connection Failed. Server will not start.');
        console.error(err.stack);
        process.exit(1); // Exit with a failure code
    }
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: `Not Found: ${req.method} ${req.originalUrl}` });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('API error:', err.stack);
  const status = err.status || 500;
  res.status(status).json({ message: err.message || 'Internal Server Error' });
});

startServer();
