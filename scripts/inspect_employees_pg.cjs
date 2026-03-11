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

(async () => {
  let client;
  try {
    client = await pool.connect();
    const res = await client.query('SELECT id, name FROM employees ORDER BY id DESC LIMIT 100');
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error('Inspect failed:', err);
    process.exitCode = 2;
  } finally {
    try { if (client) client.release(); } catch {}
    await pool.end();
  }
})();
