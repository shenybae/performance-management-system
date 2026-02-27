import express from "express";
import { createServer as createViteServer } from "vite";
import pg from "pg";
import Database from "better-sqlite3";
import path from "path";
import dotenv from "dotenv";
import crypto from 'crypto';
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cors from "cors";

dotenv.config();

let usePostgres = !!process.env.DB_HOST;
let pgPool: pg.Pool | null = null;
let sqliteDb: any = null;

if (usePostgres) {
  try {
    pgPool = new pg.Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    console.log("PostgreSQL Pool created. Attempting connection...");
  } catch (err) {
    console.error("Failed to create PostgreSQL pool, falling back to SQLite:", err);
    usePostgres = false;
  }
}

if (!usePostgres) {
  console.log("Using SQLite (Demo Mode)");
  sqliteDb = new Database("talentflow_demo.db");
}

async function query(sql: string, params: any[] = []) {
  if (usePostgres && pgPool) {
    try {
      // Convert ? to $1, $2, etc for PostgreSQL
      let pgSql = sql;
      let count = 1;
      while (pgSql.includes('?')) {
        pgSql = pgSql.replace('?', `$${count++}`);
      }
      const res = await pgPool.query(pgSql, params);
      
      // Normalize response to match mysql2/sqlite behavior
      if (sql.trim().toUpperCase().startsWith("INSERT")) {
        return { insertId: res.rows[0]?.id, affectedRows: res.rowCount };
      }
      return res.rows;
    } catch (err) {
      console.error("PostgreSQL Query Error:", err);
      throw err;
    }
  } else {
    try {
      if (sql.trim().toUpperCase().startsWith("SELECT")) {
        return sqliteDb.prepare(sql).all(...params);
      } else {
        const info = sqliteDb.prepare(sql).run(...params);
        return { insertId: info.lastInsertRowid, affectedRows: info.changes };
      }
    } catch (err) {
      console.error("SQLite Query Error:", err);
      throw err;
    }
  }
}

async function initDb() {
  const createTables = [
    `CREATE TABLE IF NOT EXISTS employees (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      name TEXT NOT NULL,
      status TEXT DEFAULT 'Probationary',
      position TEXT,
      dept TEXT,
      manager_id INTEGER,
      hire_date TEXT,
      salary_base REAL,
      ssn TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS goals (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      employee_id INTEGER,
      statement TEXT,
      metric TEXT,
      target_date TEXT,
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    )`,
    `CREATE TABLE IF NOT EXISTS coaching_logs (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      employee_id INTEGER,
      category TEXT,
      notes TEXT,
      is_positive INTEGER,
      logged_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    )`,
    `CREATE TABLE IF NOT EXISTS appraisals (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      employee_id INTEGER,
      job_knowledge INTEGER,
      productivity INTEGER,
      attendance INTEGER,
      overall REAL,
      promotability_status TEXT,
      sign_off_date TEXT,
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    )`,
    `CREATE TABLE IF NOT EXISTS discipline_records (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      employee_id INTEGER,
      violation_type TEXT,
      warning_level TEXT,
      employer_statement TEXT,
      employee_statement TEXT,
      action_taken TEXT,
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    )`,
    `CREATE TABLE IF NOT EXISTS property_accountability (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      employee_id INTEGER,
      brand TEXT,
      serial_no TEXT,
      uom_qty INTEGER,
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      employee_id INTEGER,
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    )`
    ,
    `CREATE TABLE IF NOT EXISTS password_resets (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS suggestions (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      employee_id INTEGER,
      employee_name TEXT,
      position TEXT,
      dept TEXT,
      concern TEXT,
      labor_needed TEXT,
      materials_needed TEXT,
      equipment_needed TEXT,
      capital_needed TEXT,
      estimated_cost TEXT,
      desired_benefit TEXT,
      estimated_financial_benefit TEXT,
      planning_steps TEXT,
      estimated_time TEXT,
      status TEXT DEFAULT 'Under Review',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS feedback_360 (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      evaluator_id INTEGER,
      target_employee_name TEXT,
      relationship TEXT,
      job_knowledge INTEGER,
      work_quality INTEGER,
      attendance INTEGER,
      productivity INTEGER,
      communication INTEGER,
      dependability INTEGER,
      strengths TEXT,
      improvements TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS applicants (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      name TEXT NOT NULL,
      position TEXT,
      score REAL DEFAULT 0,
      status TEXT DEFAULT 'Screening',
      job_skills TEXT,
      asset_value TEXT,
      communication_skills TEXT,
      teamwork TEXT,
      overall_rating INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS requisitions (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      job_title TEXT NOT NULL,
      department TEXT,
      supervisor TEXT,
      hiring_contact TEXT,
      position_status TEXT,
      months_per_year INTEGER,
      hours_per_week INTEGER,
      start_date TEXT,
      position_type TEXT,
      type_reason TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS offboarding (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      employee_name TEXT NOT NULL,
      last_day TEXT,
      clearance_status TEXT DEFAULT 'Pending',
      reason TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS exit_interviews (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      offboarding_id INTEGER,
      employee_name TEXT,
      department TEXT,
      supervisor TEXT,
      reasons TEXT,
      liked_most TEXT,
      liked_least TEXT,
      interview_date TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(offboarding_id) REFERENCES offboarding(id)
    )`,
    `CREATE TABLE IF NOT EXISTS development_plans (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      employee_id INTEGER,
      skill_gap TEXT,
      growth_step TEXT,
      step_order INTEGER DEFAULT 0,
      status TEXT DEFAULT 'Not Started',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    )`,
    `CREATE TABLE IF NOT EXISTS self_assessments (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      employee_id INTEGER,
      achievements TEXT,
      job_knowledge INTEGER,
      productivity INTEGER,
      attendance INTEGER,
      communication INTEGER,
      dependability INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    )`
  ];

  try {
    if (usePostgres && pgPool) {
      const client = await pgPool.connect();
      try {
        for (const sql of createTables) {
          await client.query(sql);
        }
      } finally {
        client.release();
      }
    } else {
      for (const sql of createTables) {
        sqliteDb.exec(sql);
      }
    }

    const userCountResult = await query("SELECT COUNT(*) as count FROM users") as any;
    const userCount = parseInt(userCountResult[0].count);

    if (userCount === 0) {
      console.warn("No users found. No demo accounts are created automatically. Run `npm run seed` to create initial accounts.");
    }
    console.log(`Database Initialized Successfully in ${usePostgres ? 'PostgreSQL' : 'SQLite'} mode`);
  } catch (err) {
    console.error("Database initialization failed:", err);
    if (usePostgres) {
      console.log("Attempting fallback to SQLite...");
      usePostgres = false;
      sqliteDb = new Database("talentflow_demo.db");
      await initDb();
    }
  }
}

async function startServer() {
  await initDb();
  
  const app = express();
  app.use(cors());
  app.use(express.json());
  const PORT = parseInt(process.env.PORT || '3000');

  const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

  function authenticateToken(req: any, res: any, next: any) {
    const auth = req.headers['authorization'];
    if (!auth) return res.status(401).json({ error: 'Missing Authorization header' });
    const parts = auth.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Invalid Authorization header' });
    const token = parts[1];
    try {
      const payload = jwt.verify(token, JWT_SECRET) as any;
      req.user = payload;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  // API Routes
  app.post("/api/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const rows = await query("SELECT * FROM users WHERE username = ?", [username]) as any;
      const user = rows[0];
      if (!user) return res.status(401).json({ error: "Invalid credentials" });
      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(401).json({ error: "Invalid credentials" });
      const token = jwt.sign({ id: user.id, username: user.username, role: user.role, employee_id: user.employee_id }, JWT_SECRET, { expiresIn: '8h' });
      res.json({ token, id: user.id, username: user.username, role: user.role, employee_id: user.employee_id });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  // Forgot password: generates a reset token and (in dev) returns it in response
  app.post('/api/forgot-password', async (req, res) => {
    try {
      const { username } = req.body;
      if (!username) return res.status(400).json({ error: 'Missing username' });
      const rows = await query('SELECT * FROM users WHERE username = ?', [username]) as any;
      const user = rows[0];
      if (!user) return res.status(404).json({ error: 'User not found' });
      const token = crypto.randomBytes(24).toString('hex');
      const expires = Date.now() + 1000 * 60 * 60; // 1 hour
      await query('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)', [user.id, token, expires]);
      console.log(`Password reset token for ${username}: ${token}`);
      const returnToken = process.env.DEV_SHOW_RESET === 'true' || process.env.NODE_ENV !== 'production';
      res.json({ success: true, token: returnToken ? token : undefined });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Reset password using token
  app.post('/api/reset-password', async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) return res.status(400).json({ error: 'Missing token or password' });
      const rows = await query('SELECT * FROM password_resets WHERE token = ?', [token]) as any;
      const pr = rows[0];
      if (!pr) return res.status(400).json({ error: 'Invalid token' });
      if (pr.expires_at < Date.now()) return res.status(400).json({ error: 'Token expired' });
      const userRows = await query('SELECT * FROM users WHERE id = ?', [pr.user_id]) as any;
      const user = userRows[0];
      if (!user) return res.status(404).json({ error: 'User not found' });
      const hashed = bcrypt.hashSync(newPassword, 10);
      await query('UPDATE users SET password = ? WHERE id = ?', [hashed, user.id]);
      await query('DELETE FROM password_resets WHERE id = ?', [pr.id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Change password (authenticated)
  app.post('/api/change-password', async (req, res) => {
    try {
      const auth = req.headers['authorization'];
      if (!auth) return res.status(401).json({ error: 'Unauthorized' });
      const parts = auth.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Invalid Authorization header' });
      let payload: any;
      try { payload = jwt.verify(parts[1], JWT_SECRET) as any; } catch (err) { return res.status(401).json({ error: 'Invalid token' }); }
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Missing passwords' });
      const rows = await query('SELECT * FROM users WHERE id = ?', [payload.id]) as any;
      const user = rows[0];
      if (!user) return res.status(404).json({ error: 'User not found' });
      const match = await bcrypt.compare(currentPassword, user.password);
      if (!match) return res.status(401).json({ error: 'Current password incorrect' });
      const hashed = bcrypt.hashSync(newPassword, 10);
      await query('UPDATE users SET password = ? WHERE id = ?', [hashed, user.id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get("/api/employees", async (req, res) => {
    try {
      const employees = await query("SELECT * FROM employees");
      res.json(employees);
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.get("/api/users", async (req, res) => {
    try {
      const users = await query(`
        SELECT u.id, u.username, u.role, u.employee_id, e.name as employee_name 
        FROM users u 
        LEFT JOIN employees e ON u.employee_id = e.id
      `);
      res.json(users);
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      // Protected: only HR or Manager can create users
      const authHeader = req.headers['authorization'];
      if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
      // reuse authenticateToken to validate
      // (for simplicity, call it manually)
      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Unauthorized' });
      try {
        const payload = jwt.verify(parts[1], JWT_SECRET) as any;
        if (payload.role !== 'HR' && payload.role !== 'Manager') return res.status(403).json({ error: 'Forbidden' });
      } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const { username, password, role, employee_id } = req.body;
      const hashed = bcrypt.hashSync(password, 10);
      await query("INSERT INTO users (username, password, role, employee_id) VALUES (?, ?, ?, ?)", 
        [username, hashed, role, employee_id || null]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  // Update user (HR only)
  app.put('/api/users/:id', async (req, res) => {
    try {
      const authHeader = req.headers['authorization'];
      if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Unauthorized' });
      let payload: any;
      try { payload = jwt.verify(parts[1], JWT_SECRET) as any; } catch (err) { return res.status(401).json({ error: 'Invalid token' }); }
      if (payload.role !== 'HR') return res.status(403).json({ error: 'Forbidden' });

      const id = req.params.id;
      const { password, role, employee_id } = req.body;
      const hashed = password ? bcrypt.hashSync(password, 10) : undefined;
      if (hashed) {
        await query('UPDATE users SET password = ?, role = ?, employee_id = ? WHERE id = ?', [hashed, role, employee_id || null, id]);
      } else {
        await query('UPDATE users SET role = ?, employee_id = ? WHERE id = ?', [role, employee_id || null, id]);
      }
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  // Delete user (HR only)
  app.delete('/api/users/:id', async (req, res) => {
    try {
      const authHeader = req.headers['authorization'];
      if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Unauthorized' });
      let payload: any;
      try { payload = jwt.verify(parts[1], JWT_SECRET) as any; } catch (err) { return res.status(401).json({ error: 'Invalid token' }); }
      if (payload.role !== 'HR') return res.status(403).json({ error: 'Forbidden' });

      const id = req.params.id;
      await query('DELETE FROM users WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  app.post("/api/employees", async (req, res) => {
    try {
      // Require authenticated user
      const auth = req.headers['authorization'];
      if (!auth) return res.status(401).json({ error: 'Unauthorized' });
      const parts = auth.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Unauthorized' });
      try {
        jwt.verify(parts[1], JWT_SECRET);
      } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const { name, status, position, dept, manager_id, hire_date, salary_base, ssn } = req.body;
      const result = await query(`
        INSERT INTO employees (name, status, position, dept, manager_id, hire_date, salary_base, ssn)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ${usePostgres ? 'RETURNING id' : ''}
      `, [name, status, position, dept, manager_id, hire_date, salary_base, ssn]) as any;
      res.json({ id: result.insertId });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  // Update employee
  app.put("/api/employees/:id", async (req, res) => {
    try {
      const auth = req.headers['authorization'];
      if (!auth) return res.status(401).json({ error: 'Unauthorized' });
      const parts = auth.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Unauthorized' });
      try { jwt.verify(parts[1], JWT_SECRET); } catch (err) { return res.status(401).json({ error: 'Invalid token' }); }

      const id = req.params.id;
      const { name, status, position, dept, manager_id, hire_date, salary_base, ssn } = req.body;
      await query(`UPDATE employees SET name = ?, status = ?, position = ?, dept = ?, manager_id = ?, hire_date = ?, salary_base = ?, ssn = ? WHERE id = ?`,
        [name, status, position, dept, manager_id, hire_date, salary_base, ssn, id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  // Delete employee
  app.delete("/api/employees/:id", async (req, res) => {
    try {
      const auth = req.headers['authorization'];
      if (!auth) return res.status(401).json({ error: 'Unauthorized' });
      const parts = auth.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Unauthorized' });
      try { jwt.verify(parts[1], JWT_SECRET); } catch (err) { return res.status(401).json({ error: 'Invalid token' }); }

      const id = req.params.id;
      await query('DELETE FROM employees WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  app.get("/api/employees/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const empRows = await query("SELECT * FROM employees WHERE id = ?", [id]) as any;
      const employee = empRows[0];
      
      if (!employee) return res.status(404).json({ error: "Employee not found" });

      const goals = await query("SELECT * FROM goals WHERE employee_id = ?", [id]);
      const logs = await query("SELECT * FROM coaching_logs WHERE employee_id = ?", [id]);
      const appraisals = await query("SELECT * FROM appraisals WHERE employee_id = ?", [id]);
      const discipline = await query("SELECT * FROM discipline_records WHERE employee_id = ?", [id]);
      const property = await query("SELECT * FROM property_accountability WHERE employee_id = ?", [id]);
      
      res.json({ ...employee, goals, logs, appraisals, discipline, property });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/goals", async (req, res) => {
    try {
      const { employee_id, statement, metric, target_date } = req.body;
      await query("INSERT INTO goals (employee_id, statement, metric, target_date) VALUES (?, ?, ?, ?)", 
        [employee_id, statement, metric, target_date]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/coaching_logs", async (req, res) => {
    try {
      const { employee_id, category, notes, is_positive, logged_by } = req.body;
      await query("INSERT INTO coaching_logs (employee_id, category, notes, is_positive, logged_by) VALUES (?, ?, ?, ?, ?)", 
        [employee_id, category, notes, is_positive ? 1 : 0, logged_by]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/appraisals", async (req, res) => {
    try {
      const { employee_id, job_knowledge, productivity, attendance, overall, promotability_status, sign_off_date } = req.body;
      await query(`
        INSERT INTO appraisals (employee_id, job_knowledge, productivity, attendance, overall, promotability_status, sign_off_date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [employee_id, job_knowledge, productivity, attendance, overall, promotability_status, sign_off_date]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  // ---- Goals CRUD ----
  app.get("/api/goals", async (req, res) => {
    try { const rows = await query("SELECT g.*, e.name as employee_name FROM goals g LEFT JOIN employees e ON g.employee_id = e.id"); res.json(rows); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.delete("/api/goals/:id", authenticateToken, async (req, res) => {
    try { await query("DELETE FROM goals WHERE id = ?", [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- Coaching Logs CRUD ----
  app.get("/api/coaching_logs", async (req, res) => {
    try { const rows = await query("SELECT c.*, e.name as employee_name FROM coaching_logs c LEFT JOIN employees e ON c.employee_id = e.id ORDER BY c.created_at DESC"); res.json(rows); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.delete("/api/coaching_logs/:id", authenticateToken, async (req, res) => {
    try { await query("DELETE FROM coaching_logs WHERE id = ?", [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- Appraisals GET/DELETE ----
  app.get("/api/appraisals", async (req, res) => {
    try { const rows = await query("SELECT a.*, e.name as employee_name FROM appraisals a LEFT JOIN employees e ON a.employee_id = e.id"); res.json(rows); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.delete("/api/appraisals/:id", authenticateToken, async (req, res) => {
    try { await query("DELETE FROM appraisals WHERE id = ?", [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- Discipline Records CRUD ----
  app.get("/api/discipline_records", async (req, res) => {
    try { const rows = await query("SELECT d.*, e.name as employee_name FROM discipline_records d LEFT JOIN employees e ON d.employee_id = e.id"); res.json(rows); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.post("/api/discipline_records", authenticateToken, async (req, res) => {
    try {
      const { employee_id, violation_type, warning_level, employer_statement, employee_statement, action_taken } = req.body;
      await query("INSERT INTO discipline_records (employee_id, violation_type, warning_level, employer_statement, employee_statement, action_taken) VALUES (?, ?, ?, ?, ?, ?)",
        [employee_id, violation_type, warning_level, employer_statement, employee_statement, action_taken]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.delete("/api/discipline_records/:id", authenticateToken, async (req, res) => {
    try { await query("DELETE FROM discipline_records WHERE id = ?", [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- Property Accountability CRUD ----
  app.get("/api/property_accountability", async (req, res) => {
    try { const rows = await query("SELECT p.*, e.name as employee_name FROM property_accountability p LEFT JOIN employees e ON p.employee_id = e.id"); res.json(rows); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.post("/api/property_accountability", authenticateToken, async (req, res) => {
    try {
      const { employee_id, brand, serial_no, uom_qty } = req.body;
      await query("INSERT INTO property_accountability (employee_id, brand, serial_no, uom_qty) VALUES (?, ?, ?, ?)", [employee_id, brand, serial_no, uom_qty]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.delete("/api/property_accountability/:id", authenticateToken, async (req, res) => {
    try { await query("DELETE FROM property_accountability WHERE id = ?", [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- Suggestions CRUD ----
  app.get("/api/suggestions", async (req, res) => {
    try { const rows = await query("SELECT * FROM suggestions ORDER BY created_at DESC"); res.json(rows); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.post("/api/suggestions", authenticateToken, async (req, res) => {
    try {
      const { employee_name, position, dept, concern, labor_needed, materials_needed, equipment_needed, capital_needed, estimated_cost, desired_benefit, estimated_financial_benefit, planning_steps, estimated_time } = req.body;
      const empId = (req as any).user?.employee_id || null;
      await query("INSERT INTO suggestions (employee_id, employee_name, position, dept, concern, labor_needed, materials_needed, equipment_needed, capital_needed, estimated_cost, desired_benefit, estimated_financial_benefit, planning_steps, estimated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [empId, employee_name, position, dept, concern, labor_needed, materials_needed, equipment_needed, capital_needed, estimated_cost, desired_benefit, estimated_financial_benefit, planning_steps, estimated_time]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.put("/api/suggestions/:id/status", authenticateToken, async (req, res) => {
    try { await query("UPDATE suggestions SET status = ? WHERE id = ?", [req.body.status, req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.delete("/api/suggestions/:id", authenticateToken, async (req, res) => {
    try { await query("DELETE FROM suggestions WHERE id = ?", [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- 360 Feedback CRUD ----
  app.get("/api/feedback_360", async (req, res) => {
    try { const rows = await query("SELECT * FROM feedback_360 ORDER BY created_at DESC"); res.json(rows); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.post("/api/feedback_360", authenticateToken, async (req, res) => {
    try {
      const { target_employee_name, relationship, job_knowledge, work_quality, attendance, productivity, communication, dependability, strengths, improvements } = req.body;
      const evaluatorId = (req as any).user?.id || null;
      await query("INSERT INTO feedback_360 (evaluator_id, target_employee_name, relationship, job_knowledge, work_quality, attendance, productivity, communication, dependability, strengths, improvements) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [evaluatorId, target_employee_name, relationship, job_knowledge, work_quality, attendance, productivity, communication, dependability, strengths, improvements]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.delete("/api/feedback_360/:id", authenticateToken, async (req, res) => {
    try { await query("DELETE FROM feedback_360 WHERE id = ?", [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- Applicants CRUD ----
  app.get("/api/applicants", async (req, res) => {
    try { const rows = await query("SELECT * FROM applicants ORDER BY created_at DESC"); res.json(rows); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.post("/api/applicants", authenticateToken, async (req, res) => {
    try {
      const { name, position, score, status, job_skills, asset_value, communication_skills, teamwork, overall_rating } = req.body;
      await query("INSERT INTO applicants (name, position, score, status, job_skills, asset_value, communication_skills, teamwork, overall_rating) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [name, position, score || 0, status || 'Screening', job_skills, asset_value, communication_skills, teamwork, overall_rating]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.put("/api/applicants/:id", authenticateToken, async (req, res) => {
    try {
      const { name, position, score, status } = req.body;
      await query("UPDATE applicants SET name = ?, position = ?, score = ?, status = ? WHERE id = ?", [name, position, score, status, req.params.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.delete("/api/applicants/:id", authenticateToken, async (req, res) => {
    try { await query("DELETE FROM applicants WHERE id = ?", [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- Requisitions CRUD ----
  app.get("/api/requisitions", async (req, res) => {
    try { const rows = await query("SELECT * FROM requisitions ORDER BY created_at DESC"); res.json(rows); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.post("/api/requisitions", authenticateToken, async (req, res) => {
    try {
      const { job_title, department, supervisor, hiring_contact, position_status, months_per_year, hours_per_week, start_date, position_type, type_reason } = req.body;
      await query("INSERT INTO requisitions (job_title, department, supervisor, hiring_contact, position_status, months_per_year, hours_per_week, start_date, position_type, type_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [job_title, department, supervisor, hiring_contact, position_status, months_per_year, hours_per_week, start_date, position_type, type_reason]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.delete("/api/requisitions/:id", authenticateToken, async (req, res) => {
    try { await query("DELETE FROM requisitions WHERE id = ?", [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- Offboarding CRUD ----
  app.get("/api/offboarding", async (req, res) => {
    try { const rows = await query("SELECT * FROM offboarding ORDER BY created_at DESC"); res.json(rows); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.post("/api/offboarding", authenticateToken, async (req, res) => {
    try {
      const { employee_name, last_day, clearance_status, reason } = req.body;
      const result = await query(`INSERT INTO offboarding (employee_name, last_day, clearance_status, reason) VALUES (?, ?, ?, ?) ${usePostgres ? 'RETURNING id' : ''}`, [employee_name, last_day, clearance_status || 'Pending', reason]) as any;
      res.json({ success: true, id: result.insertId });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.put("/api/offboarding/:id", authenticateToken, async (req, res) => {
    try { await query("UPDATE offboarding SET clearance_status = ? WHERE id = ?", [req.body.clearance_status, req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.delete("/api/offboarding/:id", authenticateToken, async (req, res) => {
    try { await query("DELETE FROM offboarding WHERE id = ?", [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- Exit Interviews CRUD ----
  app.get("/api/exit_interviews", async (req, res) => {
    try { const rows = await query("SELECT * FROM exit_interviews ORDER BY created_at DESC"); res.json(rows); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.post("/api/exit_interviews", authenticateToken, async (req, res) => {
    try {
      const { offboarding_id, employee_name, department, supervisor, reasons, liked_most, liked_least, interview_date } = req.body;
      await query("INSERT INTO exit_interviews (offboarding_id, employee_name, department, supervisor, reasons, liked_most, liked_least, interview_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [offboarding_id || null, employee_name, department, supervisor, reasons, liked_most, liked_least, interview_date]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.delete("/api/exit_interviews/:id", authenticateToken, async (req, res) => {
    try { await query("DELETE FROM exit_interviews WHERE id = ?", [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- Development Plans CRUD ----
  app.get("/api/development_plans", async (req, res) => {
    try {
      const empId = req.query.employee_id;
      const rows = empId 
        ? await query("SELECT * FROM development_plans WHERE employee_id = ? ORDER BY step_order", [empId])
        : await query("SELECT d.*, e.name as employee_name FROM development_plans d LEFT JOIN employees e ON d.employee_id = e.id ORDER BY d.employee_id, d.step_order");
      res.json(rows);
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.post("/api/development_plans", authenticateToken, async (req, res) => {
    try {
      const { employee_id, skill_gap, growth_step, step_order, status } = req.body;
      await query("INSERT INTO development_plans (employee_id, skill_gap, growth_step, step_order, status) VALUES (?, ?, ?, ?, ?)",
        [employee_id, skill_gap, growth_step, step_order || 0, status || 'Not Started']);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.put("/api/development_plans/:id", authenticateToken, async (req, res) => {
    try {
      const { status } = req.body;
      await query("UPDATE development_plans SET status = ? WHERE id = ?", [status, req.params.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.delete("/api/development_plans/:id", authenticateToken, async (req, res) => {
    try { await query("DELETE FROM development_plans WHERE id = ?", [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- Self Assessments CRUD ----
  app.get("/api/self_assessments", async (req, res) => {
    try {
      const empId = req.query.employee_id;
      const rows = empId
        ? await query("SELECT * FROM self_assessments WHERE employee_id = ? ORDER BY created_at DESC", [empId])
        : await query("SELECT s.*, e.name as employee_name FROM self_assessments s LEFT JOIN employees e ON s.employee_id = e.id ORDER BY s.created_at DESC");
      res.json(rows);
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.post("/api/self_assessments", authenticateToken, async (req, res) => {
    try {
      const { employee_id, achievements, job_knowledge, productivity, attendance, communication, dependability } = req.body;
      await query("INSERT INTO self_assessments (employee_id, achievements, job_knowledge, productivity, attendance, communication, dependability) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [employee_id, achievements, job_knowledge, productivity, attendance, communication, dependability]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.delete("/api/self_assessments/:id", authenticateToken, async (req, res) => {
    try { await query("DELETE FROM self_assessments WHERE id = ?", [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // DB stats (counts) for visualization
  app.get('/api/db_stats', async (req, res) => {
    try {
      const tables = ['employees','goals','coaching_logs','appraisals','discipline_records','property_accountability','users'];
      const counts: any = {};
      for (const t of tables) {
        const rows: any = await query(`SELECT COUNT(*) as count FROM ${t}`) as any;
        counts[t] = parseInt(rows[0].count || rows[0].COUNT || 0);
      }
      res.json({ counts });
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  // DB overview: counts + sample rows
  app.get('/api/db/overview', async (req, res) => {
    try {
      const tables = ['employees','goals','coaching_logs','appraisals','discipline_records','property_accountability','users'];
      const out: any = {};
      for (const t of tables) {
        const rows: any = await query(`SELECT COUNT(*) as count FROM ${t}`) as any;
        const count = parseInt(rows[0].count || rows[0].COUNT || 0);
        let sample = [];
        try { sample = await query(`SELECT * FROM ${t} LIMIT 5`); } catch (e) { sample = [] }
        out[t] = { count, sample };
      }
      res.json(out);
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
