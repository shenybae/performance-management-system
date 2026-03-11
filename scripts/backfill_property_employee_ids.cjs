#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '..', 'talentflow_demo.db');
const db = new Database(dbPath);

console.log('Opening database:', dbPath);

const updateSql = `
UPDATE property_accountability
SET employee_id = (
  SELECT id FROM employees e
  WHERE lower(trim(e.name)) = lower(trim(property_accountability.employee_name))
)
WHERE employee_id IS NULL AND employee_name IS NOT NULL;
`;

try {
  const info = db.prepare(updateSql).run();
  console.log('Rows updated:', info.changes);
  const remaining = db.prepare('SELECT COUNT(*) as cnt FROM property_accountability WHERE employee_id IS NULL').get();
  console.log('Remaining without employee_id:', remaining.cnt);

  // show up to 8 sample rows still missing employee_id
  const samples = db.prepare('SELECT id, employee_name, items, brand, serial_no FROM property_accountability WHERE employee_id IS NULL LIMIT 8').all();
  if (samples.length > 0) {
    console.log('Sample records still without employee_id:');
    samples.forEach(r => console.log(JSON.stringify(r)));
  } else {
    console.log('No remaining unmatched records.');
  }
} catch (err) {
  console.error('Error running update:', err);
  process.exit(1);
} finally {
  db.close();
}
