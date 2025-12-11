const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function updateCustomWords() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Update specific words mentioned by user to be sure
        const specificWords = ['勺子', '柠檬', '你好'];
        for (const word of specificWords) {
            const res = await client.query(
                "UPDATE items SET hsk_level = 0 WHERE value = $1 RETURNING id, value, hsk_level",
                [word]
            );
            if (res.rows.length > 0) {
                console.log(`Updated specific word: ${word} -> hsk_level 0`);
            } else {
                console.log(`Specific word not found or not updated: ${word}`);
            }
        }

        // 2. Update all items that users have interacted with (in user_item_progress) 
        // AND currently have hsk_level IS NULL.
        // This effectively migrates "custom" words created/discovered by users to hsk_level 0.
        const res = await client.query(`
            UPDATE items
            SET hsk_level = 0
            WHERE hsk_level IS NULL
            AND id IN (SELECT item_id FROM user_item_progress)
            RETURNING id, value
        `);

        console.log(`Updated ${res.rowCount} other items to hsk_level 0 because users have progress on them.`);
        
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating custom words:', err);
    } finally {
        client.release();
        pool.end();
    }
}

updateCustomWords();
