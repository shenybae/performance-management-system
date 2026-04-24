const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const db = new Database('talentflow_demo.db');

const updates = [
  { email: 'hr_admin@maptech.com', password: 'demo_hr_pass' },
  { email: 'manager.bob@maptech.com', password: 'demo_manager_pass' },
  { email: 'john.doe@maptech.com', password: 'demo_employee_pass' },
];

for (const u of updates) {
  const hash = bcrypt.hashSync(u.password, 10);
  const info = db.prepare('UPDATE users SET password = ? WHERE email = ?').run(hash, u.email);
  console.log(`Updated ${u.email}: changes=${info.changes}`);
}

console.log('Done.');
