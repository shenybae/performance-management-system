import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import pg from 'pg';

dotenv.config();

const usePostgres = !!process.env.DB_HOST;
let pgPool: pg.Pool | null = null;
let sqliteDb: any = null;

async function rawQuery(sql: string, params: any[] = []) {
  if (usePostgres && pgPool) {
    let count = 0;
    const pgSql = sql.replace(/\?/g, () => `$${++count}`);
    const res = await pgPool.query(pgSql, params);
    return res.rows;
  } else {
    if (!sqliteDb) throw new Error('SQLite DB not initialized');
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      return sqliteDb.prepare(sql).all(...params);
    } else {
      const info = sqliteDb.prepare(sql).run(...params);
      return { insertId: info.lastInsertRowid, affectedRows: info.changes };
    }
  }
}

async function main() {
  if (usePostgres) {
    pgPool = new pg.Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
  } else {
    try {
      const mod = await import('better-sqlite3');
      const Database = mod.default || mod;
      sqliteDb = new Database('talentflow_demo.db');
    } catch (err: any) {
      console.error('better-sqlite3 is not installed. Install it with `npm i better-sqlite3` or set DB_HOST to use Postgres.');
      process.exit(1);
    }
  }

  const purgeAllEmployeesOnly = process.argv.includes('--all-employees');
  if (purgeAllEmployeesOnly) {
    await purgeAllEmployees();
  } else {
    await purgeToSeed();
  }
}

const seedAccounts = [
  { username: 'hr_admin', email: 'hr_admin@maptech.com', password: 'demo_hr_pass', role: 'HR' },
  { username: 'manager_bob', email: 'manager.bob@maptech.com', password: 'demo_manager_pass', role: 'Manager' },
  {
    username: 'employee_john',
    email: 'john.doe@maptech.com',
    password: 'demo_employee_pass',
    role: 'Employee',
    employee_profile: {
      name: 'John Doe',
      position: 'Software Engineer',
      dept: 'Engineering',
      status: 'Regular',
    },
  },
];

function buildPlaceholders(count: number) {
  return Array.from({ length: count }, () => '?').join(',');
}

async function purgeEmployeesByIds(deleteIds: any[]) {
  if (!deleteIds.length) return;

  if (usePostgres && pgPool) {
    const client = await pgPool.connect();
    const quoteIdent = (s: string) => `"${String(s).replace(/"/g, '""')}"`;

    try {
      await client.query('BEGIN');

      const refs = await client.query(
        `SELECT tc.table_name, kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
         WHERE tc.constraint_type = 'FOREIGN KEY'
           AND tc.table_schema = 'public'
           AND ccu.table_name = 'employees'
           AND ccu.column_name = 'id'
         ORDER BY tc.table_name, kcu.column_name`
      );

      const inParams = `(${deleteIds.map((_, i) => `$${i + 1}`).join(',')})`;
      for (const ref of refs.rows) {
        const table = String(ref.table_name);
        const column = String(ref.column_name);
        if (table === 'employees') continue;

        if (table === 'users' && column === 'employee_id') {
          await client.query(
            `UPDATE ${quoteIdent(table)} SET ${quoteIdent(column)} = NULL WHERE ${quoteIdent(column)} IN ${inParams}`,
            deleteIds
          );
        } else {
          await client.query(
            `DELETE FROM ${quoteIdent(table)} WHERE ${quoteIdent(column)} IN ${inParams}`,
            deleteIds
          );
        }
      }

      await client.query(`DELETE FROM "employees" WHERE "id" IN ${inParams}`, deleteIds);
      await client.query('COMMIT');
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch {}
      throw err;
    } finally {
      client.release();
    }
  } else {
    const idPlaceholders = buildPlaceholders(deleteIds.length);
    const employeeRefDeletes: Array<[string, string]> = [
      ['users', 'employee_id'],
      ['goals', 'employee_id'],
      ['coaching_logs', 'employee_id'],
      ['appraisals', 'employee_id'],
      ['discipline_records', 'employee_id'],
      ['property_accountability', 'employee_id'],
      ['suggestions', 'employee_id'],
      ['development_plans', 'employee_id'],
      ['self_assessments', 'employee_id'],
      ['onboarding', 'employee_id'],
      ['coaching_chats', 'employee_id'],
      ['elearning_recommendations', 'employee_id'],
      ['goal_assignees', 'employee_id'],
      ['goal_member_tasks', 'member_employee_id'],
    ];

    for (const [table, col] of employeeRefDeletes) {
      try {
        if (table === 'users' && col === 'employee_id') {
          await rawQuery(`UPDATE ${table} SET ${col} = NULL WHERE ${col} IN (${idPlaceholders})`, deleteIds);
        } else {
          await rawQuery(`DELETE FROM ${table} WHERE ${col} IN (${idPlaceholders})`, deleteIds);
        }
      } catch {
        // best-effort for optional/missing tables in sqlite mode
      }
    }

    await rawQuery(`DELETE FROM employees WHERE id IN (${idPlaceholders})`, deleteIds);
  }
}

async function purgeNonSeedEmployees(seedUsernames: string[]) {
  const usernamePlaceholders = buildPlaceholders(seedUsernames.length);
  const seedUsers = (await rawQuery(
    `SELECT id, username, employee_id FROM users WHERE username IN (${usernamePlaceholders})`,
    seedUsernames
  )) as any[];

  const keepEmployeeIds = Array.from(
    new Set(seedUsers.map(u => u.employee_id).filter((v: any) => v !== null && v !== undefined))
  );

  const employees = (await rawQuery('SELECT id, name FROM employees ORDER BY id')) as any[];
  const toDelete = employees.filter(e => !keepEmployeeIds.includes(e.id));

  if (toDelete.length === 0) {
    console.log('No non-seed employees found.');
    return;
  }

  const deleteIds = toDelete.map(e => e.id);
  console.log(`Deleting ${deleteIds.length} non-seed employee records.`);

  await purgeEmployeesByIds(deleteIds);
}

async function purgeAllEmployees() {
  try {
    const employees = (await rawQuery('SELECT id, name FROM employees ORDER BY id')) as any[];
    if (!employees.length) {
      console.log('No employee records found.');
    } else {
      const deleteIds = employees.map(e => e.id);
      console.log(`Deleting all employee records (${deleteIds.length}).`);
      await purgeEmployeesByIds(deleteIds);
    }

    const finalUsers = await rawQuery('SELECT id, username, email, role, employee_id FROM users ORDER BY id');
    const finalEmployees = await rawQuery('SELECT id, name, position, dept, status FROM employees ORDER BY id');
    console.log('\nFinal users:');
    console.table(finalUsers as any);
    console.log('\nFinal employees:');
    console.table(finalEmployees as any);
    process.exit(0);
  } catch (err) {
    console.error('Unexpected error during all-employee purge:', err);
    process.exit(1);
  }
}

async function ensureSeedEmployeeLinks() {
  for (const acc of seedAccounts) {
    const profile = (acc as any).employee_profile;
    if (!profile) continue;

    const users = (await rawQuery('SELECT id, username, employee_id FROM users WHERE username = ? LIMIT 1', [acc.username])) as any[];
    const user = users[0];
    if (!user) continue;

    let employeeId: number | null = user.employee_id ? Number(user.employee_id) : null;

    if (employeeId) {
      const existing = (await rawQuery('SELECT id FROM employees WHERE id = ? LIMIT 1', [employeeId])) as any[];
      if (!existing.length) employeeId = null;
    }

    if (!employeeId) {
      const byName = (await rawQuery('SELECT id FROM employees WHERE name = ? ORDER BY id DESC LIMIT 1', [profile.name])) as any[];
      if (byName.length) {
        employeeId = Number(byName[0].id);
      } else {
        await rawQuery(
          'INSERT INTO employees (name, status, position, dept) VALUES (?, ?, ?, ?)',
          [profile.name, profile.status, profile.position, profile.dept]
        );
        const created = (await rawQuery('SELECT id FROM employees WHERE name = ? ORDER BY id DESC LIMIT 1', [profile.name])) as any[];
        employeeId = created.length ? Number(created[0].id) : null;
      }
    }

    if (employeeId) {
      await rawQuery('UPDATE users SET employee_id = ? WHERE id = ?', [employeeId, user.id]);
      await rawQuery('UPDATE employees SET status = ?, position = ?, dept = ? WHERE id = ?', [profile.status, profile.position, profile.dept, employeeId]);
      console.log(`Linked ${acc.username} -> employee_id ${employeeId} (${profile.name})`);
    }
  }
}

async function purgeToSeed() {
  try {
    // Ensure users table exists (best-effort)
    try {
      await rawQuery('SELECT id, username FROM users LIMIT 1');
    } catch (e) {
      console.error('The `users` table does not exist or the DB is unreachable:', e);
      process.exit(1);
    }

    const existingUsers = (await rawQuery('SELECT id, username FROM users')) as any[];
    const seedUsernames = seedAccounts.map(a => a.username);
    const toDelete = existingUsers.filter(u => !seedUsernames.includes(u.username));

    if (toDelete.length === 0) {
      console.log('No non-seed users found. Nothing to delete.');
    } else {
      const ids = toDelete.map(u => u.id);
      console.log(`Deleting ${ids.length} non-seed users: ${toDelete.map(u => u.username).join(', ')}`);

      const placeholders = buildPlaceholders(ids.length);
      await rawQuery(`DELETE FROM users WHERE id IN (${placeholders})`, ids);

      // Clean associated password_resets if present
      try {
        await rawQuery(`DELETE FROM password_resets WHERE user_id IN (${placeholders})`, ids);
      } catch (e) {
        console.warn('Could not clean password_resets (maybe table missing):', e.message || e);
      }
    }

    await purgeNonSeedEmployees(seedUsernames);

    // Ensure seed accounts exist and have current seeded passwords/emails
    for (const acc of seedAccounts) {
      const hash = bcrypt.hashSync(acc.password, 10);
      try {
        await rawQuery('INSERT INTO users (username, email, password, role, employee_id) VALUES (?, ?, ?, ?, NULL)', [acc.username, acc.email || null, hash, acc.role]);
        console.log(`Created seed account: ${acc.username}`);
      } catch (err: any) {
        if (String(err).toLowerCase().includes('unique') || String(err).toLowerCase().includes('constraint')) {
          // Update password and email if exists
          try {
            await rawQuery('UPDATE users SET password = ?, email = COALESCE(email, ?) WHERE username = ?', [hash, acc.email || null, acc.username]);
            console.log(`Updated existing seed account: ${acc.username}`);
          } catch (uerr) {
            console.warn(`Failed to update seed account ${acc.username}:`, uerr);
          }
        } else {
          console.error(`Error creating/updating seed account ${acc.username}:`, err);
        }
      }
    }

    await ensureSeedEmployeeLinks();

    const final = await rawQuery('SELECT id, username, email, role, employee_id FROM users ORDER BY id');
    const finalEmployees = await rawQuery('SELECT id, name, position, dept, status FROM employees ORDER BY id');
    console.log('\nFinal users:');
    console.table(final as any);
    console.log('\nFinal employees:');
    console.table(finalEmployees as any);
    process.exit(0);
  } catch (err) {
    console.error('Unexpected error during purge:', err);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
