const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const db = new Database('talentflow_demo.db');

const updates = [
  { username: 'hr_admin', password: 'demo_hr_pass' },
  { username: 'manager_bob', password: 'demo_manager_pass' },
  { username: 'employee_john', password: 'demo_employee_pass' },
];

for (const u of updates) {
  const hash = bcrypt.hashSync(u.password, 10);
  const info = db.prepare('UPDATE users SET password = ? WHERE username = ?').run(hash, u.username);
  console.log(`Updated ${u.username}: changes=${info.changes}`);
}

console.log('Done.');
