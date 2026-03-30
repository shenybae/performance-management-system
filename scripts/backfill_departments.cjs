const { Pool } = require('pg');
(async () => {
  const pool = new Pool({
    host: 'shuttle.proxy.rlwy.net',
    port: 51019,
    user: 'postgres',
    password: 'YjCucYQyCRZlrUgNNEAfjalswGzSUDpw',
    database: 'railway',
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
