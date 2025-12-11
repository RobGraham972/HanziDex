const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const fs = require('fs');
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

const TSV_PATH = path.join(__dirname, 'data/00_hsk/HSK_all_merged.tsv');

async function seed() {
    console.log('Connecting to database...');
    const client = await pool.connect();
    try {
        console.log(`Reading data from ${TSV_PATH}...`);
        const content = fs.readFileSync(TSV_PATH, 'utf-8');
        const lines = content.split('\n');
        
        // Header: Traditional	Simplified	Pinyin	English	Zhuyin	Level
        const header = lines[0].split('\t').map(h => h.trim());
        const colMap = {
            Traditional: header.indexOf('Traditional'),
            Simplified: header.indexOf('Simplified'),
            Pinyin: header.indexOf('Pinyin'),
            English: header.indexOf('English'),
            Level: header.indexOf('Level')
        };

        console.log('Starting seed...');
        await client.query('BEGIN');

        let count = 0;
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const parts = line.split('\t');
            const simp = parts[colMap.Simplified];
            const trad = parts[colMap.Traditional];
            const pinyin = parts[colMap.Pinyin];
            const english = parts[colMap.English];
            let levelStr = parts[colMap.Level];
            
            if (!simp) continue;

            // Parse Level
            let level = 1;
            if (levelStr === '7-9') {
                level = 7;
            } else {
                level = parseInt(levelStr, 10) || 1;
            }

            // Determine Type and Kinds
            const isChar = simp.length === 1;
            const type = isChar ? 'character' : 'word';
            const kinds = isChar ? ['character', 'word'] : ['word']; // Assume all HSK items are words, single chars are both

            // Upsert
            // We use 'value' (Simplified) as unique key for simplicity, though strictly it might not be unique across all Chinese.
            // But for HSK list, it should be unique enough or we merge.
            // Actually, schema says 'id' is PK. 'value' is text.
            // We should check if it exists by value.
            
            const checkRes = await client.query('SELECT id FROM items WHERE value = $1', [simp]);
            
            if (checkRes.rows.length > 0) {
                // Update
                await client.query(`
                    UPDATE items SET
                        hsk_level = $1,
                        pinyin = $2,
                        english_definition = $3,
                        -- Merge kinds:
                        kinds = (select array_agg(distinct x) from unnest(array_cat(kinds, $4)) as x),
                        type = $5
                    WHERE id = $6
                `, [level, pinyin, english, kinds, type, checkRes.rows[0].id]);
                count++;
            } else {
                // Insert
                await client.query(`
                    INSERT INTO items (value, type, hsk_level, pinyin, english_definition, kinds)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [simp, type, level, pinyin, english, kinds]);
                count++;
            }
        }
        
        await client.query('COMMIT');
        console.log(`Seed complete. Processed ${count} items.`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error seeding:', err);
    } finally {
        client.release();
        pool.end();
    }
}

// Helper to check ID strategy
async function checkIdStrategy() {
    // I'll just try to insert with DEFAULT and see if it fails.
    // Or I'll query max id.
}

// I'll modify the loop to handle ID generation if needed.
// For now, I'll read schema.sql again to be sure.
seed();
