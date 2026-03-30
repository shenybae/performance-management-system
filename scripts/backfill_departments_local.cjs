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

  const sql = `INSERT INTO departments (name, slug)
SELECT DISTINCT dept AS name,
       LOWER(REGEXP_REPLACE(dept, '[^a-z0-9]+', '-', 'g')) AS slug
FROM users
WHERE dept IS NOT NULL AND TRIM(dept) <> ''
ON CONFLICT (slug) DO NOTHING;
`;

  try {
    const res = await pool.query(sql);
    console.log('Inserted rows (approx):', res.rowCount);
  } catch (err) {
    console.error('Backfill error:', err.message || err);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
