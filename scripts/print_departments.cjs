const { Pool } = require('pg');
(async () => {
  const pool = new Pool({ host: 'shuttle.proxy.rlwy.net', port: 51019, user: 'postgres', password: 'YjCucYQyCRZlrUgNNEAfjalswGzSUDpw', database: 'railway' });
  try {
    const r = await pool.query('SELECT id, name, slug, created_at FROM departments ORDER BY name');
    console.log('departments:', r.rows.length);
    for (const row of r.rows) console.log(row);
  } catch (e) { console.error(e); process.exit(1); } finally { await pool.end(); }
})();
