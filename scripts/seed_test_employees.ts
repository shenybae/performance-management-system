import dotenv from 'dotenv';
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
  let count = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++count}`);
  const res = await pgPool.query(pgSql, params);
  return res.rows;
}

async function seedTestEmployees() {
  const DEPARTMENTS = [
    'Accounting/Financing',
    'Engineering',
    'HR',
    'Sales Admin',
    'Marketing',
  ];

  const POSITIONS_BY_DEPT: Record<string, string[]> = {
    'Accounting/Financing': ['Accountant', 'Financial Analyst', 'Auditor', 'Payroll Specialist', 'Budget Analyst'],
    'Engineering': ['Software Engineer', 'DevOps Engineer', 'QA Engineer', 'Systems Architect', 'Tech Lead'],
    'HR': ['HR Specialist', 'Recruiter', 'HR Coordinator', 'Training Manager', 'Compensation Analyst'],
    'Sales Admin': ['Sales Representative', 'Sales Coordinator', 'Account Executive', 'Sales Engineer', 'Business Development'],
    'Marketing': ['Marketing Manager', 'Marketing Coordinator', 'Brand Specialist', 'Content Manager', 'Digital Marketing'],
  };

  const FIRST_NAMES = ['Alice', 'Bob', 'Carol', 'David', 'Emma', 'Frank', 'Grace', 'Henry'];
  const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];

  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║  SEEDING TEST EMPLOYEES FOR EACH DEPARTMENT                       ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  let totalCreated = 0;

  for (const dept of DEPARTMENTS) {
    console.log(`\n[${dept}] Creating test employees...`);
    const positions = (POSITIONS_BY_DEPT[dept] || ['Employee']).slice(0, 5); // 5 employees per dept
    let deptCount = 0;

    for (let i = 0; i < positions.length; i++) {
      const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
      const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
      const fullName = `${firstName} ${lastName} (${dept.split('/')[0]})`;
      const position = positions[i];
      const hireDate = new Date(2023, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toISOString().split('T')[0];
      const salary = Math.floor(Math.random() * 80000) + 40000; // $40k-$120k range

      try {
        // Check if employee already exists (by name and dept)
        const existing = await rawQuery(
          'SELECT id FROM employees WHERE LOWER(name) = LOWER(?) AND dept = ? LIMIT 1',
          [fullName, dept]
        ) as any[];
        
        if (existing.length > 0) {
          console.log(`  – ${fullName} (${position}) — already exists`);
          continue;
        }

        // Create employee
        const result = await rawQuery(
          'INSERT INTO employees (name, dept, position, status, hire_date, salary_base) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
          [fullName, dept, position, 'Regular', hireDate, salary]
        ) as any[];

        const empId = result?.[0]?.id;
        if (empId) {
          console.log(`  ✓ ${fullName} (${position}) — ID ${empId}`);
          deptCount++;
          totalCreated++;
        }
      } catch (err) {
        console.error(`  ✗ Error creating ${fullName}:`, (err as any).message);
      }
    }

    console.log(`  ━━ ${deptCount} employees created for ${dept}`);
  }

  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log(`║  TOTAL: ${totalCreated} TEST EMPLOYEES CREATED                                  ║`);
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');
  console.log('Use these to test department-scoped delegation:');
  console.log('  1. Assign a Manager to each department.');
  console.log('  2. Have the Manager create goals and delegate to dept employees.');
  console.log('  3. Verify Manager cannot see/assign employees from other departments.\n');

  await pgPool.end();
  process.exit(0);
}

// Run only when explicitly requested
if (process.env.RUN_SEED_TEST_EMPLOYEES === '1') {
  seedTestEmployees().catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}
