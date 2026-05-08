require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const conn = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.PGURL;
const pool = conn
  ? new Pool({ connectionString: conn })
  : new Pool({
      host: process.env.DB_HOST || process.env.POSTGRES_HOST || process.env.PGHOST,
      port: parseInt(process.env.DB_PORT || process.env.POSTGRES_PORT || process.env.PGPORT || '5432', 10),
      user: process.env.DB_USER || process.env.POSTGRES_USER || process.env.PGUSER,
      password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD,
      database: process.env.DB_NAME || process.env.POSTGRES_DB || process.env.PGDATABASE,
    });

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.|\.$/g, '');
}

async function getDepartments() {
  const fromDepartments = await pool.query(
    `SELECT DISTINCT TRIM(name) AS dept
     FROM departments
     WHERE COALESCE(TRIM(name), '') <> ''
       AND deleted_at IS NULL
     ORDER BY dept`
  );

  let departments = fromDepartments.rows
    .map((r) => String(r.dept || '').trim())
    .filter(Boolean);

  if (departments.length > 0) return departments;

  const fromEmployees = await pool.query(
    `SELECT DISTINCT TRIM(dept) AS dept
     FROM employees
     WHERE COALESCE(TRIM(dept), '') <> ''
       AND deleted_at IS NULL
     ORDER BY dept`
  );

  const fromUsers = await pool.query(
    `SELECT DISTINCT TRIM(dept) AS dept
     FROM users
     WHERE COALESCE(TRIM(dept), '') <> ''
       AND deleted_at IS NULL
     ORDER BY dept`
  );

  departments = [
    ...new Set([
      ...fromEmployees.rows.map((r) => String(r.dept || '').trim()),
      ...fromUsers.rows.map((r) => String(r.dept || '').trim()),
    ]),
  ]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  return departments;
}

(async () => {
  const passwordHash = bcrypt.hashSync('Maptech2026@', 10);
  const departments = await getDepartments();

  if (departments.length === 0) {
    throw new Error('No departments found. Cannot provision signer accounts.');
  }

  const signerSpecs = [
    { key: 'depthead', title: 'Department Head' },
    { key: 'cabinet', title: 'Cabinet Member' },
    { key: 'vpfinance', title: 'VP for Business and Finance' },
    { key: 'president', title: 'President' },
  ];

  const out = [];

  for (const dept of departments) {
    const deptSlug = slugify(dept);

    for (const spec of signerSpecs) {
      const username = `${deptSlug}.${spec.key}.hr`;
      const email = `${spec.key}.${deptSlug}@maptech.com`;
      const fullName = `${dept} ${spec.title}`;

      const existingByDeptAndTitle = await pool.query(
        `SELECT id
         FROM users
         WHERE LOWER(TRIM(COALESCE(role, ''))) = 'hr'
           AND LOWER(TRIM(COALESCE(dept, ''))) = LOWER(TRIM($1))
           AND LOWER(TRIM(COALESCE(position, ''))) = LOWER(TRIM($2))
         ORDER BY id DESC
         LIMIT 1`,
        [dept, spec.title]
      );

      const existingByIdentity = await pool.query(
        `SELECT id
         FROM users
         WHERE LOWER(COALESCE(email, '')) = LOWER($1)
            OR LOWER(COALESCE(username, '')) = LOWER($2)
         ORDER BY id DESC
         LIMIT 1`,
        [email, username]
      );

      const targetId = existingByDeptAndTitle.rows[0]?.id || existingByIdentity.rows[0]?.id || null;

      if (targetId) {
        await pool.query(
          `UPDATE users
           SET username = $1,
               email = $2,
               password = $3,
               role = 'HR',
               employee_id = NULL,
               linked_user_id = NULL,
               full_name = $4,
               dept = $5,
               position = $6,
               deleted_at = NULL
           WHERE id = $7`,
          [username, email, passwordHash, fullName, dept, spec.title, targetId]
        );

        out.push({ state: 'updated', dept, full_name: fullName, email, role: 'HR', position: spec.title });
      } else {
        await pool.query(
          `INSERT INTO users
           (username, email, password, role, employee_id, linked_user_id, full_name, dept, position, deleted_at)
           VALUES ($1, $2, $3, 'HR', NULL, NULL, $4, $5, $6, NULL)`,
          [username, email, passwordHash, fullName, dept, spec.title]
        );

        out.push({ state: 'created', dept, full_name: fullName, email, role: 'HR', position: spec.title });
      }
    }
  }

  console.log(`Done. Provisioned signer HR accounts for ${departments.length} department(s).`);
  console.table(out);

  await pool.end();
})().catch(async (error) => {
  console.error('Provisioning failed:', error);
  try {
    await pool.end();
  } catch (_) {
    // ignore close errors
  }
  process.exit(1);
});
