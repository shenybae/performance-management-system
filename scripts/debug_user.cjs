const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'talentflow',
});

async function run() {
  try {
    const res = await pool.query("SELECT id, username, email, password FROM users ORDER BY id");
    console.log(res.rows);
  } catch (e) {
    console.error('Query error:', e.message || e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
