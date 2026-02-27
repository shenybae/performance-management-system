import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import Database from 'better-sqlite3';

dotenv.config();

const usePostgres = !!process.env.DB_HOST;
let pgPool: pg.Pool | null = null;
let sqliteDb: any = null;

if (usePostgres) {
  pgPool = new pg.Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
} else {
  sqliteDb = new Database('talentflow_demo.db');
}

async function rawQuery(sql: string, params: any[] = []) {
  if (usePostgres && pgPool) {
    // Convert ? -> $n
    let count = 0;
    const pgSql = sql.replace(/\?/g, () => `$${++count}`);
    const res = await pgPool.query(pgSql, params);
    return res.rows;
  } else {
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      return sqliteDb.prepare(sql).all(...params);
    } else {
      const info = sqliteDb.prepare(sql).run(...params);
      return { insertId: info.lastInsertRowid, affectedRows: info.changes };
    }
  }
}

async function ensureTables() {
  const createUsers = `CREATE TABLE IF NOT EXISTS users (
    id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    employee_id INTEGER
  )`;

  const createEmployees = `CREATE TABLE IF NOT EXISTS employees (
    id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
    name TEXT NOT NULL
  )`;

  if (usePostgres && pgPool) {
    const client = await pgPool.connect();
    try {
      await client.query(createEmployees);
      await client.query(createUsers);
    } finally {
      client.release();
    }
  } else {
    sqliteDb.exec(createEmployees);
    sqliteDb.exec(createUsers);
  }
}

async function seed() {
  await ensureTables();

  const accounts = [
    { username: 'hr_admin', password: 'demo_hr_pass', role: 'HR' },
    { username: 'manager_bob', password: 'demo_manager_pass', role: 'Manager' },
    { username: 'employee_john', password: 'demo_employee_pass', role: 'Employee' },
  ];

  for (const acc of accounts) {
    const hash = bcrypt.hashSync(acc.password, 10);
    try {
      await rawQuery('INSERT INTO users (username, password, role, employee_id) VALUES (?, ?, ?, NULL)', [acc.username, hash, acc.role]);
      console.log(`Created ${acc.role} account: ${acc.username}`);
    } catch (err: any) {
      if (String(err).toLowerCase().includes('unique')) {
        console.log(`Account ${acc.username} already exists — skipping.`);
      } else {
        console.error('Error creating account', acc.username, err);
      }
    }
  }

  console.log('\nCredentials (use these to log in):');
  accounts.forEach(a => console.log(`${a.username} / ${a.password}  → role: ${a.role}`));
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
