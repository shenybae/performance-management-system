import express from "express";
import { createServer as createViteServer } from "vite";
import pg from "pg";
import Database from "better-sqlite3";
import path from "path";
import dotenv from "dotenv";

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
      console.log("Seeding initial data...");
      const empResult = await query(`
        INSERT INTO employees (name, status, position, dept, hire_date, salary_base, ssn)
        VALUES ('John Doe', 'Permanent', 'Senior Developer', 'Engineering', '2023-01-15', 85000, 'XXX-XX-1234')
        ${usePostgres ? 'RETURNING id' : ''}
      `) as any;
      
      const emp1Id = empResult.insertId;

      await query("INSERT INTO users (username, password, role, employee_id) VALUES ('hr_admin', 'password123', 'HR', NULL)");
      await query("INSERT INTO users (username, password, role, employee_id) VALUES ('manager_bob', 'password123', 'Manager', NULL)");
      await query("INSERT INTO users (username, password, role, employee_id) VALUES ('employee_john', 'password123', 'Employee', ?)", [emp1Id]);

      await query("INSERT INTO goals (employee_id, statement, metric, target_date) VALUES (?, 'Implement Microservices Architecture', '99.9% Uptime', '2024-12-31')", [emp1Id]);
      await query("INSERT INTO coaching_logs (employee_id, category, notes, is_positive, logged_by) VALUES (?, 'Work Quality', 'Excellent code review feedback.', 1, 'Jane Smith')", [emp1Id]);
      await query("INSERT INTO appraisals (employee_id, job_knowledge, productivity, attendance, overall, promotability_status, sign_off_date) VALUES (?, 5, 4, 5, 4.7, 'Ready for Promotion', '2023-12-15')", [emp1Id]);
      await query("INSERT INTO property_accountability (employee_id, brand, serial_no, uom_qty) VALUES (?, 'MacBook Pro M3', 'SN-123456', 1)", [emp1Id]);
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
  app.use(express.json());
  const PORT = 3000;

  // API Routes
  app.post("/api/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const rows = await query("SELECT * FROM users WHERE username = ? AND password = ?", [username, password]) as any;
      const user = rows[0];
      if (user) {
        res.json({ id: user.id, username: user.username, role: user.role, employee_id: user.employee_id });
      } else {
        res.status(401).json({ error: "Invalid credentials" });
      }
    } catch (err) {
      res.status(500).json({ error: "Database error" });
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
      const { username, password, role, employee_id } = req.body;
      await query("INSERT INTO users (username, password, role, employee_id) VALUES (?, ?, ?, ?)", 
        [username, password, role, employee_id || null]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/employees", async (req, res) => {
    try {
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
