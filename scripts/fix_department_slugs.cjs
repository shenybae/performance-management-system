const { Pool } = require('pg');
(async () => {
  const pool = new Pool({ host: 'shuttle.proxy.rlwy.net', port: 51019, user: 'postgres', password: 'YjCucYQyCRZlrUgNNEAfjalswGzSUDpw', database: 'railway' });
  try {
    const res = await pool.query('SELECT id, name FROM departments ORDER BY id');
    const rows = res.rows;
    const baseMap = {};
    for (const r of rows) {
      const base = (r.name || '').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dept';
      if (!baseMap[base]) baseMap[base] = [];
      baseMap[base].push(r.id);
    }
    for (const r of rows) {
      const base = (r.name || '').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dept';
      let final = base;
      if (baseMap[base].length > 1) final = `${base}-${r.id}`;
      const upd = await pool.query('UPDATE departments SET slug = $1 WHERE id = $2', [final, r.id]);
      console.log('updated', r.id, r.name, '->', final);
    }
  } catch (e) {
    console.error('error', e.message || e);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
