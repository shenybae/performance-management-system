const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const db = new Database('talentflow_demo.db');
const row = db.prepare('SELECT * FROM users WHERE email = ?').get('hr_admin@example.com');
console.log('user row:', row);
if (!row) {
  console.error('User not found');
  process.exit(1);
}
console.log('password hash:', row.password);
console.log('compare demo_hr_pass ->', bcrypt.compareSync('demo_hr_pass', row.password));
console.log('compare wrongpass ->', bcrypt.compareSync('wrongpass', row.password));
