import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import pg from 'pg';

dotenv.config();

const dbConnectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.PGURL;
const dbHost = process.env.DB_HOST || process.env.POSTGRES_HOST || process.env.PGHOST;
const dbPort = parseInt(process.env.DB_PORT || process.env.POSTGRES_PORT || process.env.PGPORT || '5432', 10);
const dbUser = process.env.DB_USER || process.env.POSTGRES_USER || process.env.PGUSER;
const dbPassword = process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD;
const dbName = process.env.DB_NAME || process.env.POSTGRES_DB || process.env.PGDATABASE;

if (!dbConnectionString && (!dbHost || !dbUser || !dbName)) {
  console.error('Missing PostgreSQL configuration. Set DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME (POSTGRES_* and PG* are also supported).');
  process.exit(1);
}

const pgPool = dbConnectionString
  ? new pg.Pool({ connectionString: dbConnectionString })
  : new pg.Pool({
      host: dbHost,
      port: Number.isFinite(dbPort) ? dbPort : 5432,
      user: dbUser,
      password: dbPassword,
      database: dbName,
    });

async function rawQuery(sql: string, params: any[] = []) {
  // Convert ? -> $n
  let count = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++count}`);
  const res = await pgPool.query(pgSql, params);
  return res.rows;
}

async function ensureTables() {
  const createUsers = `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    employee_id INTEGER
  )`;

  const createEmployees = `CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL
  )`;

  const client = await pgPool.connect();
  try {
    await client.query(createEmployees);
    await client.query(createUsers);
  } finally {
    client.release();
  }
}

async function seed() {
  await ensureTables();

  const DEPARTMENTS = [
    'Accounting/Financing',
    'Sales Admin',
    'Marketing',
    'Pre-Technical',
    'Post-Technical',
    'Executives',
    'Engineering',
    'HR',
    'Operations',
    'IT',
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
      await rawQuery('UPDATE employees SET dept = ?, position = ?, status = COALESCE(status, ?) WHERE id = ?', [dept, position, 'Regular', row.id]);
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

  const ensureUser = async (acc: { username: string; email: string; password: string; role: 'HR' | 'Employee'; full_name: string; dept: string; position: string; employee_id: number | null; }) => {
    const hash = bcrypt.hashSync(acc.password, 10);
    const existingRows = await rawQuery('SELECT id FROM users WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?) LIMIT 1', [acc.email, acc.username]) as any[];
    const existing = Array.isArray(existingRows) ? existingRows[0] : existingRows;
    if (existing?.id) {
      await rawQuery(
        'UPDATE users SET username = ?, email = ?, password = ?, role = ?, employee_id = ?, full_name = ?, dept = ?, position = ?, deleted_at = NULL WHERE id = ?',
        [acc.username, acc.email, hash, acc.role, acc.employee_id, acc.full_name, acc.dept, acc.position, existing.id]
      );
      return 'updated';
    }
    await rawQuery(
      'INSERT INTO users (username, email, password, role, employee_id, full_name, dept, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [acc.username, acc.email, hash, acc.role, acc.employee_id, acc.full_name, acc.dept, acc.position]
    );
    return 'created';
  };

  const generated: Array<{ email: string; password: string; role: string; dept: string; position: string; state: string }> = [];

  for (const dept of DEPARTMENTS) {
    const slug = slugify(dept);
    const deptLabel = properCaseWords(dept);

    const hrName = `${deptLabel} HR`;
    const supervisorName = `${deptLabel} Supervisor`;

    const hrEmployeeId = await ensureEmployee(hrName, dept, 'HR Admin');
    const supervisorEmployeeId = await ensureEmployee(supervisorName, dept, 'Supervisor');

    const hrAccount = {
      username: `hr.${slug}`,
      email: `hr.${slug}@example.com`,
      password: `Hr.${slug.replace(/\./g, '')}@123`,
      role: 'HR' as const,
      full_name: hrName,
      dept,
      position: 'HR Admin',
      employee_id: hrEmployeeId || null,
    };

    const supervisorAccount = {
      username: `supervisor.${slug}`,
      email: `supervisor.${slug}@example.com`,
      password: `Sup.${slug.replace(/\./g, '')}@123`,
      role: 'Employee' as const,
      full_name: supervisorName,
      dept,
      position: 'Supervisor',
      employee_id: supervisorEmployeeId || null,
    };

    const hrState = await ensureUser(hrAccount);
    const supState = await ensureUser(supervisorAccount);

    generated.push({ email: hrAccount.email, password: hrAccount.password, role: hrAccount.role, dept, position: hrAccount.position, state: hrState });
    generated.push({ email: supervisorAccount.email, password: supervisorAccount.password, role: supervisorAccount.role, dept, position: supervisorAccount.position, state: supState });
  }

  console.log('\nDepartment account provisioning complete.');
  generated.forEach((a) => {
    console.log(`[${a.state}] ${a.email} / ${a.password} -> role: ${a.role}, dept: ${a.dept}, position: ${a.position}`);
  });
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
