const { Pool } = require('pg');
require('dotenv').config();
(async () => {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'postgres',
  });
  try {
    const r = await pool.query('SELECT id, name, slug, created_at, deleted_at FROM departments ORDER BY name');
    console.log('departments:', r.rows.length);
    for (const row of r.rows) console.log(row);
  } catch (e) { console.error(e); process.exit(1); } finally { await pool.end(); }
})();
