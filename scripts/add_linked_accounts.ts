import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import pg from 'pg';

dotenv.config();

if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_NAME) {
  console.error('Missing PostgreSQL configuration. Set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME in .env.');
  process.exit(1);
}

const pgPool = new pg.Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

async function rawQuery(sql: string, params: any[] = []) {
  let count = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++count}`);
  const res = await pgPool.query(pgSql, params);
  return res.rows;
}

async function createLinkedAccounts() {
  const DEPARTMENTS = [
    'Accounting/Financing',
    'Engineering',
    'HR',
    'Sales Admin',
    'Marketing',
  ];

  const slugify = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/\.{2,}/g, '.')
      .replace(/^\.|\.$/g, '');

  const properCaseWords = (value: string) =>
    value
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');

  const ensureEmployee = async (name: string, dept: string, position: string) => {
    const existing = await rawQuery('SELECT id FROM employees WHERE LOWER(name) = LOWER(?) LIMIT 1', [name]) as any[];
    const row = Array.isArray(existing) ? existing[0] : existing;
    if (row?.id) {
      await rawQuery('UPDATE employees SET dept = ?, position = ? WHERE id = ?', [dept, position, row.id]);
      return Number(row.id);
    }
    const inserted = await rawQuery(
      'INSERT INTO employees (name, dept, position, status) VALUES (?, ?, ?, ?) RETURNING id',
      [name, dept, position, 'Regular']
    ) as any;
    if (inserted?.insertId) return Number(inserted.insertId);
    const latest = await rawQuery('SELECT id FROM employees WHERE LOWER(name) = LOWER(?) ORDER BY id DESC LIMIT 1', [name]) as any[];
    return Number((Array.isArray(latest) ? latest[0] : latest)?.id || 0);
  };

  const ensureUser = async (acc: {
    username: string;
    email: string;
    password: string;
    role: string;
    full_name: string;
    dept: string;
    position: string;
    employee_id: number | null;
    linked_user_id: number | null;
  }) => {
    const hash = bcrypt.hashSync(acc.password, 10);
    const existingRows = await rawQuery(
      'SELECT id FROM users WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?) LIMIT 1',
      [acc.email, acc.username]
    ) as any[];
    const existing = Array.isArray(existingRows) ? existingRows[0] : existingRows;
    if (existing?.id) {
      await rawQuery(
        'UPDATE users SET username = ?, email = ?, password = ?, role = ?, employee_id = ?, full_name = ?, dept = ?, position = ?, linked_user_id = ?, deleted_at = NULL WHERE id = ?',
        [acc.username, acc.email, hash, acc.role, acc.employee_id, acc.full_name, acc.dept, acc.position, acc.linked_user_id, existing.id]
      );
      return existing.id;
    }
    const result = await rawQuery(
      'INSERT INTO users (username, email, password, role, employee_id, full_name, dept, position, linked_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
      [acc.username, acc.email, hash, acc.role, acc.employee_id, acc.full_name, acc.dept, acc.position, acc.linked_user_id]
    ) as any[];
    return result?.[0]?.id || 0;
  };

  const generated: Array<{
    email: string;
    password: string;
    role: string;
    dept: string;
    position: string;
    linked_to?: string;
  }> = [];

  for (const dept of DEPARTMENTS) {
    const slug = slugify(dept);
    const deptLabel = properCaseWords(dept);

    console.log(`\n[${deptLabel}] Creating linked account chain...`);

    // Create HR User
    const hrName = `${deptLabel} HR Lead`;
    const hrEmployeeId = await ensureEmployee(hrName, dept, 'HR Lead');
    const hrPassword = `Hr.${slug.replace(/\./g, '')}@123`;
    const hrId = await ensureUser({
      username: `hr.lead.${slug}`,
      email: `hr.lead.${slug}@example.com`,
      password: hrPassword,
      role: 'HR',
      full_name: hrName,
      dept,
      position: 'HR Lead',
      employee_id: hrEmployeeId || null,
      linked_user_id: null,
    });
    generated.push({
      email: `hr.lead.${slug}@example.com`,
      password: hrPassword,
      role: 'HR',
      dept,
      position: 'HR Lead',
    });

    // Create Manager User
    const managerName = `${deptLabel} Manager`;
    const managerEmployeeId = await ensureEmployee(managerName, dept, 'Manager');
    const managerPassword = `Mgr.${slug.replace(/\./g, '')}@123`;
    const managerId = await ensureUser({
      username: `manager.${slug}`,
      email: `manager.${slug}@example.com`,
      password: managerPassword,
      role: 'Manager',
      full_name: managerName,
      dept,
      position: 'Manager',
      employee_id: managerEmployeeId || null,
      linked_user_id: hrId, // Manager linked to HR user
    });
    generated.push({
      email: `manager.${slug}@example.com`,
      password: managerPassword,
      role: 'Manager',
      dept,
      position: 'Manager',
      linked_to: hrName,
    });

    // Create Supervisor User
    const supervisorName = `${deptLabel} Supervisor`;
    const supervisorEmployeeId = await ensureEmployee(supervisorName, dept, 'Supervisor');
    const supervisorPassword = `Sup.${slug.replace(/\./g, '')}@123`;
    const supervisorId = await ensureUser({
      username: `supervisor.${slug}`,
      email: `supervisor.${slug}@example.com`,
      password: supervisorPassword,
      role: 'Employee', // Supervisors are typically Employees with supervisor flag
      full_name: supervisorName,
      dept,
      position: 'Supervisor',
      employee_id: supervisorEmployeeId || null,
      linked_user_id: managerId, // Supervisor linked to Manager user
    });
    generated.push({
      email: `supervisor.${slug}@example.com`,
      password: supervisorPassword,
      role: 'Employee (Supervisor)',
      dept,
      position: 'Supervisor',
      linked_to: managerName,
    });

    // Create Test Employee User
    const employeeName = `${deptLabel} Employee Test`;
    const employeeEmployeeId = await ensureEmployee(employeeName, dept, 'Analyst');
    const employeePassword = `Emp.${slug.replace(/\./g, '')}@123`;
    await ensureUser({
      username: `employee.${slug}`,
      email: `employee.${slug}@example.com`,
      password: employeePassword,
      role: 'Employee',
      full_name: employeeName,
      dept,
      position: 'Analyst',
      employee_id: employeeEmployeeId || null,
      linked_user_id: supervisorId, // Employee linked to Supervisor
    });
    generated.push({
      email: `employee.${slug}@example.com`,
      password: employeePassword,
      role: 'Employee',
      dept,
      position: 'Analyst',
      linked_to: supervisorName,
    });

    console.log(`✓ Created chain: HR Lead → Manager → Supervisor → Employee`);
  }

  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║  LINKED TEST ACCOUNTS CREATED - TEST CREDENTIALS                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  generated.forEach((a) => {
    const linkedInfo = a.linked_to ? ` [linked to ${a.linked_to}]` : '';
    console.log(`${a.email} / ${a.password} → ${a.role} (${a.dept})${linkedInfo}`);
  });

  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('Account Structure Created:');
  console.log('  HR Lead        → assigned to approve/sign all dept records');
  console.log('  Manager        → linked to HR Lead, delegates within dept only');
  console.log('  Supervisor     → linked to Manager, delegates within dept only');
  console.log('  Test Employee  → linked to Supervisor, appears in signature queues');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  await pgPool.end();
  process.exit(0);
}

createLinkedAccounts().catch(err => {
  console.error(err);
  process.exit(1);
});
