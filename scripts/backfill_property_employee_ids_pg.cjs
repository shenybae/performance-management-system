#!/usr/bin/env node
const { Pool } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

if (!process.env.DB_HOST) {
  console.error('DB_HOST not set — please set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME in .env');
  process.exit(1);
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 2,
});

const updateSql = `
UPDATE property_accountability
SET employee_id = e.id
FROM employees e
WHERE property_accountability.employee_id IS NULL
  AND property_accountability.employee_name IS NOT NULL
  AND lower(trim(e.name)) = lower(trim(property_accountability.employee_name));
`;

(async () => {
  let client;
  try {
    client = await pool.connect();
    const res = await client.query(updateSql);
    console.log('Rows updated:', res.rowCount);
    const rem = await client.query('SELECT COUNT(*)::int AS cnt FROM property_accountability WHERE employee_id IS NULL');
    console.log('Remaining without employee_id:', rem.rows[0].cnt);
    const samples = await client.query('SELECT id, employee_name, items, brand, serial_no FROM property_accountability WHERE employee_id IS NULL LIMIT 8');
    if (samples.rows.length) {
      console.log('Sample unmatched records:');
      console.table(samples.rows);
    } else {
      console.log('No remaining unmatched records.');
    }
  } catch (err) {
    console.error('Backfill failed:', err);
    process.exitCode = 2;
  } finally {
    try { if (client) client.release(); } catch {}
    await pool.end();
  }
})();
