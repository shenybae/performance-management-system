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
      date_of_warning TEXT,
      violation_date TEXT,
      violation_time TEXT,
      violation_place TEXT,
      employer_statement TEXT,
      employee_statement TEXT,
      action_taken TEXT,
      supervisor TEXT,
      approved_by_name TEXT,
      approved_by_title TEXT,
      approved_by_date TEXT,
      copy_distribution TEXT,
      prev_first_date TEXT,
      prev_first_type TEXT,
      prev_second_date TEXT,
      prev_second_type TEXT,
      prev_third_date TEXT,
      prev_third_type TEXT,
      employee_signature TEXT,
      employee_signature_date TEXT,
      preparer_signature TEXT,
      preparer_signature_date TEXT,
      supervisor_signature TEXT,
      supervisor_signature_date TEXT,
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    )`,
    `CREATE TABLE IF NOT EXISTS property_accountability (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      employee_id INTEGER,
      employee_name TEXT,
      position_dept TEXT,
      date_prepared TEXT,
      items TEXT,
      brand TEXT,
      serial_no TEXT,
      uom_qty INTEGER,
      turnover_by_name TEXT,
      turnover_by_date TEXT,
      turnover_by_sig TEXT,
      noted_by_name TEXT,
      noted_by_date TEXT,
      noted_by_sig TEXT,
      received_by_name TEXT,
      received_by_date TEXT,
      received_by_sig TEXT,
      audited_by_name TEXT,
      audited_by_date TEXT,
      audited_by_sig TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
      office_assignment TEXT,
      recruitment_web TEXT,
      recruitment_newspapers TEXT,
      recruitment_listserv TEXT,
      recruitment_other TEXT,
      classification TEXT,
      hiring_range TEXT,
      hourly_rate TEXT,
      supervisor_approval TEXT,
      supervisor_approval_date TEXT,
      dept_head_approval TEXT,
      dept_head_approval_date TEXT,
      cabinet_approval TEXT,
      cabinet_approval_date TEXT,
      vp_approval TEXT,
      vp_approval_date TEXT,
      president_approval TEXT,
      president_approval_date TEXT,
      comments TEXT,
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
    )`,
    `CREATE TABLE IF NOT EXISTS onboarding (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      employee_id INTEGER,
      employee_name TEXT,
      applicant_id INTEGER,
      checklist TEXT,
      hr_signature TEXT,
      employee_signature TEXT,
      notes TEXT,
      status TEXT DEFAULT 'Pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    )`,
    `CREATE TABLE IF NOT EXISTS coaching_chats (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      employee_id INTEGER NOT NULL,
      sender_role TEXT NOT NULL,
      sender_name TEXT,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    )`,
    `CREATE TABLE IF NOT EXISTS elearning_courses (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      title TEXT NOT NULL,
      category TEXT,
      description TEXT,
      url TEXT,
      difficulty TEXT DEFAULT 'Beginner',
      duration_hours REAL DEFAULT 1,
      weakness_tags TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS elearning_recommendations (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      employee_id INTEGER NOT NULL,
      course_id INTEGER,
      course_title TEXT,
      reason TEXT,
      weakness TEXT,
      status TEXT DEFAULT 'Recommended',
      recommended_by TEXT,
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

    // Safe migrations — ignored if column already exists
    const disciplineMigrations = [
      'ALTER TABLE discipline_records ADD COLUMN date_of_warning TEXT',
      'ALTER TABLE discipline_records ADD COLUMN violation_date TEXT',
      'ALTER TABLE discipline_records ADD COLUMN violation_time TEXT',
      'ALTER TABLE discipline_records ADD COLUMN violation_place TEXT',
      'ALTER TABLE discipline_records ADD COLUMN supervisor TEXT',
      'ALTER TABLE discipline_records ADD COLUMN approved_by_name TEXT',
      'ALTER TABLE discipline_records ADD COLUMN approved_by_title TEXT',
      'ALTER TABLE discipline_records ADD COLUMN approved_by_date TEXT',
      'ALTER TABLE discipline_records ADD COLUMN copy_distribution TEXT',
      'ALTER TABLE discipline_records ADD COLUMN prev_first_date TEXT',
      'ALTER TABLE discipline_records ADD COLUMN prev_first_type TEXT',
      'ALTER TABLE discipline_records ADD COLUMN prev_second_date TEXT',
      'ALTER TABLE discipline_records ADD COLUMN prev_second_type TEXT',
      'ALTER TABLE discipline_records ADD COLUMN prev_third_date TEXT',
      'ALTER TABLE discipline_records ADD COLUMN prev_third_type TEXT',
      'ALTER TABLE discipline_records ADD COLUMN employee_signature TEXT',
      'ALTER TABLE discipline_records ADD COLUMN employee_signature_date TEXT',
      'ALTER TABLE discipline_records ADD COLUMN preparer_signature TEXT',
      'ALTER TABLE discipline_records ADD COLUMN preparer_signature_date TEXT',
      'ALTER TABLE discipline_records ADD COLUMN supervisor_signature TEXT',
      'ALTER TABLE discipline_records ADD COLUMN supervisor_signature_date TEXT',
    ];
    for (const sql of disciplineMigrations) {
      try {
        if (usePostgres && pgPool) {
          const c = await pgPool.connect();
          try { await c.query(sql); } catch {} finally { c.release(); }
        } else {
          sqliteDb.exec(sql);
        }
      } catch {}
    }

    // Safe migrations for requisitions
    const requisitionMigrations = [
      'ALTER TABLE requisitions ADD COLUMN office_assignment TEXT',
      'ALTER TABLE requisitions ADD COLUMN recruitment_web TEXT',
      'ALTER TABLE requisitions ADD COLUMN recruitment_newspapers TEXT',
      'ALTER TABLE requisitions ADD COLUMN recruitment_listserv TEXT',
      'ALTER TABLE requisitions ADD COLUMN recruitment_other TEXT',
      'ALTER TABLE requisitions ADD COLUMN classification TEXT',
      'ALTER TABLE requisitions ADD COLUMN hiring_range TEXT',
      'ALTER TABLE requisitions ADD COLUMN hourly_rate TEXT',
      'ALTER TABLE requisitions ADD COLUMN supervisor_approval TEXT',
      'ALTER TABLE requisitions ADD COLUMN supervisor_approval_date TEXT',
      'ALTER TABLE requisitions ADD COLUMN dept_head_approval TEXT',
      'ALTER TABLE requisitions ADD COLUMN dept_head_approval_date TEXT',
      'ALTER TABLE requisitions ADD COLUMN cabinet_approval TEXT',
      'ALTER TABLE requisitions ADD COLUMN cabinet_approval_date TEXT',
      'ALTER TABLE requisitions ADD COLUMN vp_approval TEXT',
      'ALTER TABLE requisitions ADD COLUMN vp_approval_date TEXT',
      'ALTER TABLE requisitions ADD COLUMN president_approval TEXT',
      'ALTER TABLE requisitions ADD COLUMN president_approval_date TEXT',
      'ALTER TABLE requisitions ADD COLUMN comments TEXT',
      'ALTER TABLE requisitions ADD COLUMN supervisor_approval_sig TEXT',
      'ALTER TABLE requisitions ADD COLUMN dept_head_approval_sig TEXT',
      'ALTER TABLE requisitions ADD COLUMN cabinet_approval_sig TEXT',
      'ALTER TABLE requisitions ADD COLUMN vp_approval_sig TEXT',
      'ALTER TABLE requisitions ADD COLUMN president_approval_sig TEXT',
    ];
    for (const sql of requisitionMigrations) {
      try {
        if (usePostgres && pgPool) {
          const c = await pgPool.connect();
          try { await c.query(sql); } catch {} finally { c.release(); }
        } else {
          sqliteDb.exec(sql);
        }
      } catch {}
    }

    // Safe migrations for appraisals — add all missing evaluation fields
    const appraisalMigrations = [
      'ALTER TABLE appraisals ADD COLUMN form_type TEXT',
      'ALTER TABLE appraisals ADD COLUMN eval_type TEXT',
      'ALTER TABLE appraisals ADD COLUMN eval_period_from TEXT',
      'ALTER TABLE appraisals ADD COLUMN eval_period_to TEXT',
      'ALTER TABLE appraisals ADD COLUMN work_quality INTEGER',
      'ALTER TABLE appraisals ADD COLUMN communication INTEGER',
      'ALTER TABLE appraisals ADD COLUMN dependability INTEGER',
      'ALTER TABLE appraisals ADD COLUMN quantity_of_work INTEGER',
      'ALTER TABLE appraisals ADD COLUMN relationship_with_others INTEGER',
      'ALTER TABLE appraisals ADD COLUMN work_habits INTEGER',
      'ALTER TABLE appraisals ADD COLUMN promotability_score INTEGER',
      'ALTER TABLE appraisals ADD COLUMN employee_goals TEXT',
      'ALTER TABLE appraisals ADD COLUMN additional_comments TEXT',
      'ALTER TABLE appraisals ADD COLUMN supervisors_overall_comment TEXT',
      'ALTER TABLE appraisals ADD COLUMN reviewers_comment TEXT',
      'ALTER TABLE appraisals ADD COLUMN employee_acknowledgement TEXT',
      'ALTER TABLE appraisals ADD COLUMN supervisor_signature TEXT',
      'ALTER TABLE appraisals ADD COLUMN supervisor_signature_date TEXT',
      'ALTER TABLE appraisals ADD COLUMN reviewer_signature TEXT',
      'ALTER TABLE appraisals ADD COLUMN reviewer_signature_date TEXT',
      'ALTER TABLE appraisals ADD COLUMN employee_signature TEXT',
      'ALTER TABLE appraisals ADD COLUMN employee_signature_date TEXT',
      'ALTER TABLE appraisals ADD COLUMN verified INTEGER DEFAULT 0',
      'ALTER TABLE appraisals ADD COLUMN hr_signature TEXT',
      'ALTER TABLE appraisals ADD COLUMN hr_signature_date TEXT',
      'ALTER TABLE appraisals ADD COLUMN overall_rating TEXT',
      'ALTER TABLE appraisals ADD COLUMN recommendation TEXT',
      'ALTER TABLE appraisals ADD COLUMN reviewer_agree TEXT',
      'ALTER TABLE appraisals ADD COLUMN revised_rating TEXT',
      'ALTER TABLE appraisals ADD COLUMN status TEXT',
      'ALTER TABLE appraisals ADD COLUMN employee_department TEXT',
      'ALTER TABLE appraisals ADD COLUMN employee_title TEXT',
      'ALTER TABLE appraisals ADD COLUMN probationary_period TEXT',
      'ALTER TABLE appraisals ADD COLUMN supervisor_print_name TEXT',
      'ALTER TABLE appraisals ADD COLUMN reviewer_print_name TEXT',
      'ALTER TABLE appraisals ADD COLUMN hr_print_name TEXT',
    ];
    for (const sql of appraisalMigrations) {
      try {
        if (usePostgres && pgPool) {
          const c = await pgPool.connect();
          try { await c.query(sql); } catch {} finally { c.release(); }
        } else { sqliteDb.exec(sql); }
      } catch {}
    }

    // Safe migrations for goals — add status, progress, scope, department, team, delegation, priority
    const goalMigrations = [
      'ALTER TABLE goals ADD COLUMN title TEXT',
      'ALTER TABLE goals ADD COLUMN status TEXT DEFAULT \'Not Started\'',
      'ALTER TABLE goals ADD COLUMN progress INTEGER DEFAULT 0',
      'ALTER TABLE goals ADD COLUMN scope TEXT DEFAULT \'Individual\'',
      'ALTER TABLE goals ADD COLUMN department TEXT',
      'ALTER TABLE goals ADD COLUMN team_name TEXT',
      'ALTER TABLE goals ADD COLUMN delegation TEXT',
      'ALTER TABLE goals ADD COLUMN priority TEXT DEFAULT \'Medium\'',
      'ALTER TABLE goals ADD COLUMN quarter TEXT',
    ];
    for (const sql of goalMigrations) {
      try {
        if (usePostgres && pgPool) {
          const c = await pgPool.connect();
          try { await c.query(sql); } catch {} finally { c.release(); }
        } else { sqliteDb.exec(sql); }
      } catch {}
    }

    // Safe migrations for exit_interviews — add all missing fields
    const exitInterviewMigrations = [
      'ALTER TABLE exit_interviews ADD COLUMN ssn TEXT',
      'ALTER TABLE exit_interviews ADD COLUMN hire_date TEXT',
      'ALTER TABLE exit_interviews ADD COLUMN termination_date TEXT',
      'ALTER TABLE exit_interviews ADD COLUMN starting_position TEXT',
      'ALTER TABLE exit_interviews ADD COLUMN ending_position TEXT',
      'ALTER TABLE exit_interviews ADD COLUMN salary TEXT',
      'ALTER TABLE exit_interviews ADD COLUMN pay_benefits_opinion TEXT',
      'ALTER TABLE exit_interviews ADD COLUMN satisfaction_ratings TEXT',
      'ALTER TABLE exit_interviews ADD COLUMN would_recommend TEXT',
      'ALTER TABLE exit_interviews ADD COLUMN improvement_suggestions TEXT',
      'ALTER TABLE exit_interviews ADD COLUMN additional_comments TEXT',
      'ALTER TABLE exit_interviews ADD COLUMN employee_sig TEXT',
      'ALTER TABLE exit_interviews ADD COLUMN interviewer_name TEXT',
      'ALTER TABLE exit_interviews ADD COLUMN interviewer_sig TEXT',
      'ALTER TABLE exit_interviews ADD COLUMN interviewer_date TEXT',
      'ALTER TABLE exit_interviews ADD COLUMN dismissal_details TEXT',
    ];
    for (const sql of exitInterviewMigrations) {
      try {
        if (usePostgres && pgPool) {
          const c = await pgPool.connect();
          try { await c.query(sql); } catch {} finally { c.release(); }
        } else { sqliteDb.exec(sql); }
      } catch {}
    }

    // Safe migrations for suggestions — add missing fields
    const suggestionMigrations = [
      'ALTER TABLE suggestions ADD COLUMN title TEXT',
      'ALTER TABLE suggestions ADD COLUMN other_resource_needed TEXT',
      'ALTER TABLE suggestions ADD COLUMN planning_step_1 TEXT',
      'ALTER TABLE suggestions ADD COLUMN planning_step_2 TEXT',
      'ALTER TABLE suggestions ADD COLUMN planning_step_3 TEXT',
      'ALTER TABLE suggestions ADD COLUMN total_financial_benefit TEXT',
      'ALTER TABLE suggestions ADD COLUMN employee_signature TEXT',
      'ALTER TABLE suggestions ADD COLUMN employee_signature_date TEXT',
      'ALTER TABLE suggestions ADD COLUMN supervisor_name TEXT',
      'ALTER TABLE suggestions ADD COLUMN supervisor_title TEXT',
      'ALTER TABLE suggestions ADD COLUMN date_received TEXT',
      'ALTER TABLE suggestions ADD COLUMN follow_up_date TEXT',
      'ALTER TABLE suggestions ADD COLUMN suggestion_merit TEXT',
      'ALTER TABLE suggestions ADD COLUMN benefit_to_company TEXT',
      'ALTER TABLE suggestions ADD COLUMN cost_to_company TEXT',
      'ALTER TABLE suggestions ADD COLUMN cost_efficient_explanation TEXT',
      'ALTER TABLE suggestions ADD COLUMN suggestion_priority INTEGER',
      'ALTER TABLE suggestions ADD COLUMN action_to_be_taken TEXT',
      'ALTER TABLE suggestions ADD COLUMN suggested_reward TEXT',
      'ALTER TABLE suggestions ADD COLUMN supervisor_signature TEXT',
      'ALTER TABLE suggestions ADD COLUMN supervisor_signature_date TEXT',
      'ALTER TABLE suggestions ADD COLUMN date TEXT',
    ];
    for (const sql of suggestionMigrations) {
      try {
        if (usePostgres && pgPool) {
          const c = await pgPool.connect();
          try { await c.query(sql); } catch {} finally { c.release(); }
        } else { sqliteDb.exec(sql); }
      } catch {}
    }

    // Applicant appraisal form migrations (interview questions, signatures, etc.)
    const applicantMigrations = [
      'ALTER TABLE applicants ADD COLUMN interview_impression TEXT',
      'ALTER TABLE applicants ADD COLUMN dept_fit TEXT',
      'ALTER TABLE applicants ADD COLUMN previous_qualifications TEXT',
      'ALTER TABLE applicants ADD COLUMN q_experience TEXT',
      'ALTER TABLE applicants ADD COLUMN q_why_interested TEXT',
      'ALTER TABLE applicants ADD COLUMN q_strengths TEXT',
      'ALTER TABLE applicants ADD COLUMN q_weakness TEXT',
      'ALTER TABLE applicants ADD COLUMN q_conflict TEXT',
      'ALTER TABLE applicants ADD COLUMN q_goals TEXT',
      'ALTER TABLE applicants ADD COLUMN q_teamwork TEXT',
      'ALTER TABLE applicants ADD COLUMN q_pressure TEXT',
      'ALTER TABLE applicants ADD COLUMN q_contribution TEXT',
      'ALTER TABLE applicants ADD COLUMN q_questions TEXT',
      'ALTER TABLE applicants ADD COLUMN additional_comments TEXT',
      'ALTER TABLE applicants ADD COLUMN interviewer_name TEXT',
      'ALTER TABLE applicants ADD COLUMN interviewer_title TEXT',
      'ALTER TABLE applicants ADD COLUMN interview_date TEXT',
      'ALTER TABLE applicants ADD COLUMN interviewer_signature TEXT',
      'ALTER TABLE applicants ADD COLUMN hr_reviewer_name TEXT',
      'ALTER TABLE applicants ADD COLUMN hr_reviewer_signature TEXT',
      'ALTER TABLE applicants ADD COLUMN hr_reviewer_date TEXT',
      'ALTER TABLE applicants ADD COLUMN recommendation TEXT',
    ];
    for (const sql of applicantMigrations) {
      try {
        if (usePostgres && pgPool) {
          const c = await pgPool.connect();
          try { await c.query(sql); } catch {} finally { c.release(); }
        } else { sqliteDb.exec(sql); }
      } catch {}
    }

    // Property accountability migrations (expand table with full form fields)
    const propertyMigrations = [
      'ALTER TABLE property_accountability ADD COLUMN employee_name TEXT',
      'ALTER TABLE property_accountability ADD COLUMN position_dept TEXT',
      'ALTER TABLE property_accountability ADD COLUMN date_prepared TEXT',
      'ALTER TABLE property_accountability ADD COLUMN items TEXT',
      'ALTER TABLE property_accountability ADD COLUMN turnover_by_name TEXT',
      'ALTER TABLE property_accountability ADD COLUMN turnover_by_date TEXT',
      'ALTER TABLE property_accountability ADD COLUMN turnover_by_sig TEXT',
      'ALTER TABLE property_accountability ADD COLUMN noted_by_name TEXT',
      'ALTER TABLE property_accountability ADD COLUMN noted_by_date TEXT',
      'ALTER TABLE property_accountability ADD COLUMN noted_by_sig TEXT',
      'ALTER TABLE property_accountability ADD COLUMN received_by_name TEXT',
      'ALTER TABLE property_accountability ADD COLUMN received_by_date TEXT',
      'ALTER TABLE property_accountability ADD COLUMN received_by_sig TEXT',
      'ALTER TABLE property_accountability ADD COLUMN audited_by_name TEXT',
      'ALTER TABLE property_accountability ADD COLUMN audited_by_date TEXT',
      'ALTER TABLE property_accountability ADD COLUMN audited_by_sig TEXT',
      'ALTER TABLE property_accountability ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    ];
    for (const sql of propertyMigrations) {
      try {
        if (usePostgres && pgPool) {
          const c = await pgPool.connect();
          try { await c.query(sql); } catch {} finally { c.release(); }
        } else { sqliteDb.exec(sql); }
      } catch {}
    }

    // Create PIP (Performance Improvement Plan) table
    const pipTable = `CREATE TABLE IF NOT EXISTS pip_plans (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      employee_id INTEGER,
      appraisal_id INTEGER,
      start_date TEXT,
      end_date TEXT,
      deficiency TEXT,
      improvement_objective TEXT,
      action_steps TEXT,
      support_provided TEXT,
      progress_check_date TEXT,
      progress_notes TEXT,
      outcome TEXT DEFAULT 'In Progress',
      supervisor_name TEXT,
      supervisor_signature TEXT,
      employee_signature TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(employee_id) REFERENCES employees(id),
      FOREIGN KEY(appraisal_id) REFERENCES appraisals(id)
    )`;
    try {
      if (usePostgres && pgPool) {
        const c = await pgPool.connect();
        try { await c.query(pipTable); } finally { c.release(); }
      } else { sqliteDb.exec(pipTable); }
    } catch {}

    // Safe migration: add profile_picture column to users
    const userMigrations = [
      'ALTER TABLE users ADD COLUMN profile_picture TEXT',
    ];
    for (const sql of userMigrations) {
      try {
        if (usePostgres && pgPool) {
          const c = await pgPool.connect();
          try { await c.query(sql); } catch {} finally { c.release(); }
        } else { sqliteDb.exec(sql); }
      } catch {}
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
  app.use(express.json({ limit: '50mb' }));
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
      res.json({ token, id: user.id, username: user.username, role: user.role, employee_id: user.employee_id, profile_picture: user.profile_picture || null });
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

  // Get own profile picture
  app.get('/api/profile-picture', authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      const rows = await query('SELECT profile_picture FROM users WHERE id = ?', [userId]) as any;
      res.json({ profile_picture: rows[0]?.profile_picture || null });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  // Upload / update own profile picture (base64)
  app.put('/api/profile-picture', authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      const { profile_picture } = req.body;
      await query('UPDATE users SET profile_picture = ? WHERE id = ?', [profile_picture || null, userId]);
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
      const { employee_id, statement, metric, target_date, title, status, progress, scope, department, team_name, delegation, priority, quarter } = req.body;
      await query("INSERT INTO goals (employee_id, statement, metric, target_date, title, status, progress, scope, department, team_name, delegation, priority, quarter) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", 
        [employee_id || null, statement, metric, target_date, title || statement, status || 'Not Started', progress || 0, scope || 'Individual', department || null, team_name || null, delegation || null, priority || 'Medium', quarter || null]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  // PUT /api/goals/:id — update goal status/progress
  app.put("/api/goals/:id", authenticateToken, async (req, res) => {
    try {
      const b = req.body;
      const sets: string[] = [];
      const vals: any[] = [];
      for (const k of ['statement','metric','target_date','title','status','progress','scope','department','team_name','delegation','priority','quarter']) {
        if (b[k] !== undefined) { sets.push(`${k} = ?`); vals.push(b[k]); }
      }
      if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });
      vals.push(req.params.id);
      await query(`UPDATE goals SET ${sets.join(', ')} WHERE id = ?`, vals);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  app.post("/api/coaching_logs", authenticateToken, async (req, res) => {
    try {
      const { employee_id, category, notes, is_positive, logged_by } = req.body;
      await query("INSERT INTO coaching_logs (employee_id, category, notes, is_positive, logged_by) VALUES (?, ?, ?, ?, ?)", 
        [employee_id, category, notes, is_positive ? 1 : 0, logged_by]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/appraisals", authenticateToken, async (req, res) => {
    try {
      const b = req.body;
      await query(`
        INSERT INTO appraisals (employee_id, job_knowledge, productivity, attendance, overall, promotability_status, sign_off_date,
          form_type, eval_type, eval_period_from, eval_period_to, work_quality, communication, dependability,
          quantity_of_work, relationship_with_others, work_habits, promotability_score, employee_goals, additional_comments,
          supervisors_overall_comment, reviewers_comment, employee_acknowledgement,
          supervisor_signature, supervisor_signature_date, reviewer_signature, reviewer_signature_date,
          employee_signature, employee_signature_date, verified,
          hr_signature, hr_signature_date, overall_rating, recommendation, reviewer_agree, revised_rating,
          status, employee_department, employee_title, probationary_period,
          supervisor_print_name, reviewer_print_name, hr_print_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [b.employee_id, b.job_knowledge, b.productivity, b.attendance, b.overall, b.promotability_status, b.sign_off_date,
          b.form_type || null, b.eval_type || null, b.eval_period_from || null, b.eval_period_to || null,
          b.work_quality || null, b.communication || null, b.dependability || null,
          b.quantity_of_work || null, b.relationship_with_others || null, b.work_habits || null,
          b.promotability_score || null, b.employee_goals || null, b.additional_comments || null,
          b.supervisors_overall_comment || null, b.reviewers_comment || null, b.employee_acknowledgement || null,
          b.supervisor_signature || null, b.supervisor_signature_date || null,
          b.reviewer_signature || null, b.reviewer_signature_date || null,
          b.employee_signature || null, b.employee_signature_date || null, b.verified || 0,
          b.hr_signature || null, b.hr_signature_date || null,
          b.overall_rating || null, b.recommendation || null, b.reviewer_agree || null, b.revised_rating || null,
          b.status || null, b.employee_department || null, b.employee_title || null, b.probationary_period || null,
          b.supervisor_print_name || null, b.reviewer_print_name || null, b.hr_print_name || null]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  // PUT /api/appraisals/:id — update verification signatures
  app.put("/api/appraisals/:id", authenticateToken, async (req, res) => {
    try {
      const b = req.body;
      const sets: string[] = [];
      const vals: any[] = [];
      const updatable = ['supervisor_signature','supervisor_signature_date','reviewer_signature','reviewer_signature_date',
        'employee_signature','employee_signature_date','verified','promotability_status',
        'hr_signature','hr_signature_date','overall_rating','recommendation','reviewer_agree','revised_rating',
        'reviewers_comment','employee_acknowledgement','supervisors_overall_comment','status',
        'supervisor_print_name','reviewer_print_name','hr_print_name'];
      for (const k of updatable) {
        if (b[k] !== undefined) { sets.push(`${k} = ?`); vals.push(b[k]); }
      }
      if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });
      vals.push(req.params.id);
      await query(`UPDATE appraisals SET ${sets.join(', ')} WHERE id = ?`, vals);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
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

  // ---- Coaching Chat Messages ----
  app.get("/api/coaching_chats/:employee_id", async (req, res) => {
    try {
      const rows = await query("SELECT * FROM coaching_chats WHERE employee_id = ? ORDER BY created_at ASC", [req.params.employee_id]);
      res.json(rows);
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.post("/api/coaching_chats", authenticateToken, async (req, res) => {
    try {
      const { employee_id, sender_role, sender_name, message } = req.body;
      await query("INSERT INTO coaching_chats (employee_id, sender_role, sender_name, message) VALUES (?, ?, ?, ?)",
        [employee_id, sender_role, sender_name, message]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.delete("/api/coaching_chats/:employee_id", authenticateToken, async (req, res) => {
    try { await query("DELETE FROM coaching_chats WHERE employee_id = ?", [req.params.employee_id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- E-Learning Courses & Recommendations ----
  app.get("/api/elearning_courses", async (req, res) => {
    try { const rows = await query("SELECT * FROM elearning_courses ORDER BY title ASC"); res.json(rows); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.post("/api/elearning_courses", async (req, res) => {
    try {
      const { title, category, description, url, difficulty, duration_hours, weakness_tags } = req.body;
      await query("INSERT INTO elearning_courses (title, category, description, url, difficulty, duration_hours, weakness_tags) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [title, category, description, url, difficulty || 'Beginner', duration_hours || 1, weakness_tags]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.delete("/api/elearning_courses/:id", authenticateToken, async (req, res) => {
    try { await query("DELETE FROM elearning_courses WHERE id = ?", [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.get("/api/elearning_recommendations/:employee_id", async (req, res) => {
    try { const rows = await query("SELECT * FROM elearning_recommendations WHERE employee_id = ? ORDER BY created_at DESC", [req.params.employee_id]); res.json(rows); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.get("/api/elearning_recommendations", async (req, res) => {
    try { const rows = await query("SELECT r.*, e.name as employee_name FROM elearning_recommendations r LEFT JOIN employees e ON r.employee_id = e.id ORDER BY r.created_at DESC"); res.json(rows); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.post("/api/elearning_recommendations", async (req, res) => {
    try {
      const { employee_id, course_id, course_title, reason, weakness, recommended_by } = req.body;
      await query("INSERT INTO elearning_recommendations (employee_id, course_id, course_title, reason, weakness, recommended_by) VALUES (?, ?, ?, ?, ?, ?)",
        [employee_id, course_id, course_title, reason, weakness, recommended_by]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.put("/api/elearning_recommendations/:id", async (req, res) => {
    try {
      const { status } = req.body;
      await query("UPDATE elearning_recommendations SET status = ? WHERE id = ?", [status, req.params.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
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
      const {
        employee_id, violation_type, warning_level, date_of_warning,
        violation_date, violation_time, violation_place,
        employer_statement, employee_statement, action_taken,
        supervisor, approved_by_name, approved_by_title, approved_by_date,
        copy_distribution,
        prev_first_date, prev_first_type, prev_second_date, prev_second_type, prev_third_date, prev_third_type,
        employee_signature, employee_signature_date,
        preparer_signature, preparer_signature_date,
        supervisor_signature, supervisor_signature_date,
      } = req.body;
      await query(
        `INSERT INTO discipline_records (
          employee_id, violation_type, warning_level, date_of_warning,
          violation_date, violation_time, violation_place,
          employer_statement, employee_statement, action_taken,
          supervisor, approved_by_name, approved_by_title, approved_by_date,
          copy_distribution,
          prev_first_date, prev_first_type, prev_second_date, prev_second_type, prev_third_date, prev_third_type,
          employee_signature, employee_signature_date,
          preparer_signature, preparer_signature_date,
          supervisor_signature, supervisor_signature_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          employee_id, violation_type, warning_level, date_of_warning,
          violation_date, violation_time, violation_place,
          employer_statement, employee_statement, action_taken,
          supervisor, approved_by_name, approved_by_title, approved_by_date,
          copy_distribution,
          prev_first_date, prev_first_type, prev_second_date, prev_second_type, prev_third_date, prev_third_type,
          employee_signature, employee_signature_date,
          preparer_signature, preparer_signature_date,
          supervisor_signature, supervisor_signature_date,
        ]
      );
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.delete("/api/discipline_records/:id", authenticateToken, async (req, res) => {
    try { await query("DELETE FROM discipline_records WHERE id = ?", [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- Property Accountability CRUD ----
  app.get("/api/property_accountability", async (req, res) => {
    try { const rows = await query("SELECT * FROM property_accountability ORDER BY created_at DESC"); res.json(rows); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.post("/api/property_accountability", authenticateToken, async (req, res) => {
    try {
      const { employee_id, employee_name, position_dept, date_prepared, items,
        turnover_by_name, turnover_by_date, turnover_by_sig,
        noted_by_name, noted_by_date, noted_by_sig,
        received_by_name, received_by_date, received_by_sig,
        audited_by_name, audited_by_date, audited_by_sig } = req.body;
      await query(`INSERT INTO property_accountability
        (employee_id, employee_name, position_dept, date_prepared, items,
         turnover_by_name, turnover_by_date, turnover_by_sig,
         noted_by_name, noted_by_date, noted_by_sig,
         received_by_name, received_by_date, received_by_sig,
         audited_by_name, audited_by_date, audited_by_sig)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [employee_id, employee_name, position_dept, date_prepared, items,
         turnover_by_name, turnover_by_date, turnover_by_sig,
         noted_by_name, noted_by_date, noted_by_sig,
         received_by_name, received_by_date, received_by_sig,
         audited_by_name, audited_by_date, audited_by_sig]);
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
      const b = req.body;
      const userRole = (req as any).user?.role;
      // Managers/HR can specify a target employee_id from the body; employees use their own
      const empId = (userRole === 'Manager' || userRole === 'HR') && b.employee_id ? b.employee_id : ((req as any).user?.employee_id || null);
      await query(`INSERT INTO suggestions (employee_id, employee_name, position, dept, date, concern, labor_needed, materials_needed, equipment_needed, capital_needed, estimated_cost, desired_benefit, estimated_financial_benefit, planning_steps, estimated_time, title, other_resource_needed, planning_step_1, planning_step_2, planning_step_3, total_financial_benefit, employee_signature, employee_signature_date, supervisor_name, supervisor_title, date_received, follow_up_date, suggestion_merit, benefit_to_company, cost_to_company, cost_efficient_explanation, suggestion_priority, action_to_be_taken, suggested_reward, supervisor_signature, supervisor_signature_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [empId, b.employee_name || null, b.position || null, b.dept || null, b.date || null, b.concern || null,
         b.labor_needed || null, b.materials_needed || null, b.equipment_needed || null, b.capital_needed || null,
         b.estimated_cost || null, b.desired_benefit || null, b.estimated_financial_benefit || b.estimated_benefit || null,
         b.planning_steps || null, b.estimated_time || null, b.title || null, b.other_resource_needed || null,
         b.planning_step_1 || null, b.planning_step_2 || null, b.planning_step_3 || null, b.total_financial_benefit || null,
         b.employee_signature || null, b.employee_signature_date || null,
         b.supervisor_name || null, b.supervisor_title || null, b.date_received || null, b.follow_up_date || null,
         b.suggestion_merit || null, b.benefit_to_company || null, b.cost_to_company || null,
         b.cost_efficient_explanation || null, b.suggestion_priority || null, b.action_to_be_taken || null,
         b.suggested_reward || null, b.supervisor_signature || null, b.supervisor_signature_date || null,
         b.status || 'Under Review']);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.put("/api/suggestions/:id/status", authenticateToken, async (req, res) => {
    try { await query("UPDATE suggestions SET status = ? WHERE id = ?", [req.body.status, req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.put("/api/suggestions/:id/management", authenticateToken, async (req, res) => {
    try {
      const b = req.body;
      await query(`UPDATE suggestions SET supervisor_name = ?, supervisor_title = ?, date_received = ?, follow_up_date = ?, suggestion_merit = ?, benefit_to_company = ?, cost_to_company = ?, cost_efficient_explanation = ?, suggestion_priority = ?, action_to_be_taken = ?, suggested_reward = ?, supervisor_signature = ?, supervisor_signature_date = ?, status = ? WHERE id = ?`,
        [b.supervisor_name || null, b.supervisor_title || null, b.date_received || null, b.follow_up_date || null,
         b.suggestion_merit || null, b.benefit_to_company || null, b.cost_to_company || null,
         b.cost_efficient_explanation || null, b.suggestion_priority || null, b.action_to_be_taken || null,
         b.suggested_reward || null, b.supervisor_signature || null, b.supervisor_signature_date || null,
         b.status || 'Reviewed', req.params.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
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
      const evaluatorId = (req as any).user?.employee_id || (req as any).user?.id || null;
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
      const { name, position, score, status, job_skills, asset_value, communication_skills, teamwork, overall_rating,
        interview_impression, dept_fit, previous_qualifications,
        q_experience, q_why_interested, q_strengths, q_weakness, q_conflict, q_goals, q_teamwork, q_pressure, q_contribution, q_questions,
        additional_comments, interviewer_name, interviewer_title, interview_date, interviewer_signature,
        hr_reviewer_name, hr_reviewer_signature, hr_reviewer_date, recommendation } = req.body;
      await query(`INSERT INTO applicants (name, position, score, status, job_skills, asset_value, communication_skills, teamwork, overall_rating,
        interview_impression, dept_fit, previous_qualifications,
        q_experience, q_why_interested, q_strengths, q_weakness, q_conflict, q_goals, q_teamwork, q_pressure, q_contribution, q_questions,
        additional_comments, interviewer_name, interviewer_title, interview_date, interviewer_signature,
        hr_reviewer_name, hr_reviewer_signature, hr_reviewer_date, recommendation)
        VALUES (${Array(31).fill('?').join(', ')})`,
        [name, position, score || 0, status || 'Screening', job_skills, asset_value, communication_skills, teamwork, overall_rating,
        interview_impression, dept_fit, previous_qualifications,
        q_experience, q_why_interested, q_strengths, q_weakness, q_conflict, q_goals, q_teamwork, q_pressure, q_contribution, q_questions,
        additional_comments, interviewer_name, interviewer_title, interview_date, interviewer_signature,
        hr_reviewer_name, hr_reviewer_signature, hr_reviewer_date, recommendation]);
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
      const {
        job_title, department, supervisor, hiring_contact,
        position_status, months_per_year, hours_per_week, start_date,
        position_type, type_reason, office_assignment,
        recruitment_web, recruitment_newspapers, recruitment_listserv, recruitment_other,
        classification, hiring_range, hourly_rate,
        supervisor_approval, supervisor_approval_date, supervisor_approval_sig,
        dept_head_approval, dept_head_approval_date, dept_head_approval_sig,
        cabinet_approval, cabinet_approval_date, cabinet_approval_sig,
        vp_approval, vp_approval_date, vp_approval_sig,
        president_approval, president_approval_date, president_approval_sig,
        comments,
      } = req.body;
      await query(
        `INSERT INTO requisitions (
          job_title, department, supervisor, hiring_contact,
          position_status, months_per_year, hours_per_week, start_date,
          position_type, type_reason, office_assignment,
          recruitment_web, recruitment_newspapers, recruitment_listserv, recruitment_other,
          classification, hiring_range, hourly_rate,
          supervisor_approval, supervisor_approval_date, supervisor_approval_sig,
          dept_head_approval, dept_head_approval_date, dept_head_approval_sig,
          cabinet_approval, cabinet_approval_date, cabinet_approval_sig,
          vp_approval, vp_approval_date, vp_approval_sig,
          president_approval, president_approval_date, president_approval_sig,
          comments
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          job_title, department, supervisor, hiring_contact,
          position_status, months_per_year, hours_per_week, start_date,
          position_type, type_reason, office_assignment,
          recruitment_web, recruitment_newspapers, recruitment_listserv, recruitment_other,
          classification, hiring_range, hourly_rate,
          supervisor_approval, supervisor_approval_date, supervisor_approval_sig,
          dept_head_approval, dept_head_approval_date, dept_head_approval_sig,
          cabinet_approval, cabinet_approval_date, cabinet_approval_sig,
          vp_approval, vp_approval_date, vp_approval_sig,
          president_approval, president_approval_date, president_approval_sig,
          comments,
        ]
      );
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
      const b = req.body;
      await query(`INSERT INTO exit_interviews (offboarding_id, employee_name, department, supervisor, reasons, liked_most, liked_least, interview_date, ssn, hire_date, termination_date, starting_position, ending_position, salary, pay_benefits_opinion, satisfaction_ratings, would_recommend, improvement_suggestions, additional_comments, employee_sig, interviewer_name, interviewer_sig, interviewer_date, dismissal_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [b.offboarding_id || null, b.employee_name, b.department, b.supervisor, b.reasons, b.liked_most, b.liked_least, b.interview_date,
         b.ssn || null, b.hire_date || null, b.termination_date || null, b.starting_position || null, b.ending_position || null,
         b.salary || null, b.pay_benefits_opinion || null,
         typeof b.satisfaction_ratings === 'object' ? JSON.stringify(b.satisfaction_ratings) : (b.satisfaction_ratings || null),
         b.would_recommend || null, b.improvement_suggestions || null, b.additional_comments || null,
         b.employee_sig || null, b.interviewer_name || null, b.interviewer_sig || null, b.interviewer_date || null, b.dismissal_details || null]);
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

  // ---- PIP (Performance Improvement Plans) CRUD ----
  app.get("/api/pip_plans", async (req, res) => {
    try {
      const empId = req.query.employee_id;
      const rows = empId
        ? await query("SELECT p.*, e.name as employee_name FROM pip_plans p LEFT JOIN employees e ON p.employee_id = e.id WHERE p.employee_id = ? ORDER BY p.created_at DESC", [empId])
        : await query("SELECT p.*, e.name as employee_name FROM pip_plans p LEFT JOIN employees e ON p.employee_id = e.id ORDER BY p.created_at DESC");
      res.json(rows);
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.post("/api/pip_plans", authenticateToken, async (req, res) => {
    try {
      const b = req.body;
      await query(`INSERT INTO pip_plans (employee_id, appraisal_id, start_date, end_date, deficiency, improvement_objective, action_steps, support_provided, progress_check_date, progress_notes, outcome, supervisor_name, supervisor_signature, employee_signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [b.employee_id, b.appraisal_id || null, b.start_date, b.end_date, b.deficiency, b.improvement_objective, b.action_steps, b.support_provided || null, b.progress_check_date || null, b.progress_notes || null, b.outcome || 'In Progress', b.supervisor_name || null, b.supervisor_signature || null, b.employee_signature || null]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.put("/api/pip_plans/:id", authenticateToken, async (req, res) => {
    try {
      const b = req.body;
      const sets: string[] = [];
      const vals: any[] = [];
      for (const k of ['employee_id','appraisal_id','start_date','end_date','deficiency','improvement_objective','action_steps','support_provided','outcome','progress_notes','progress_check_date','supervisor_name','supervisor_signature','employee_signature']) {
        if (b[k] !== undefined) { sets.push(`${k} = ?`); vals.push(b[k]); }
      }
      if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });
      vals.push(req.params.id);
      await query(`UPDATE pip_plans SET ${sets.join(', ')} WHERE id = ?`, vals);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.delete("/api/pip_plans/:id", authenticateToken, async (req, res) => {
    try { await query("DELETE FROM pip_plans WHERE id = ?", [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- Onboarding CRUD ----
  app.get("/api/onboarding", async (req, res) => {
    try { const rows = await query("SELECT * FROM onboarding ORDER BY created_at DESC"); res.json(rows); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.post("/api/onboarding", authenticateToken, async (req, res) => {
    try {
      const { employee_id, employee_name, applicant_id, checklist, hr_signature, employee_signature, notes, status } = req.body;
      await query("INSERT INTO onboarding (employee_id, employee_name, applicant_id, checklist, hr_signature, employee_signature, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [employee_id, employee_name, applicant_id, checklist, hr_signature, employee_signature, notes, status || 'Pending']);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.put("/api/onboarding/:id", authenticateToken, async (req, res) => {
    try {
      const { checklist, hr_signature, employee_signature, notes, status } = req.body;
      await query("UPDATE onboarding SET checklist = ?, hr_signature = ?, employee_signature = ?, notes = ?, status = ? WHERE id = ?",
        [checklist, hr_signature, employee_signature, notes, status, req.params.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.delete("/api/onboarding/:id", authenticateToken, async (req, res) => {
    try { await query("DELETE FROM onboarding WHERE id = ?", [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- Hire Candidate: Convert applicant to employee ----
  app.post("/api/applicants/:id/hire", authenticateToken, async (req, res) => {
    try {
      const applicant: any = await query("SELECT * FROM applicants WHERE id = ?", [req.params.id]);
      if (!applicant || (Array.isArray(applicant) && applicant.length === 0)) return res.status(404).json({ error: "Applicant not found" });
      const a = Array.isArray(applicant) ? applicant[0] : applicant;
      const { position, dept, hire_date, salary_base } = req.body;
      await query("INSERT INTO employees (name, status, position, dept, hire_date, salary_base) VALUES (?, ?, ?, ?, ?, ?)",
        [a.name, 'Probationary', position || a.position, dept || null, hire_date || new Date().toISOString().split('T')[0], salary_base || 0]);
      await query("UPDATE applicants SET status = 'Hired' WHERE id = ?", [req.params.id]);
      res.json({ success: true, message: `${a.name} hired as ${position || a.position}` });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
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
      const tables = ['employees','goals','coaching_logs','appraisals','discipline_records','property_accountability','users','password_resets','suggestions','feedback_360','applicants','requisitions','offboarding','exit_interviews','development_plans','self_assessments','pip_plans','coaching_chats','elearning_courses','elearning_recommendations'];
      const out: any = {};
      for (const t of tables) {
        try {
          const rows: any = await query(`SELECT COUNT(*) as count FROM ${t}`) as any;
          const count = parseInt(rows[0].count || rows[0].COUNT || 0);
          let sample = [];
          try { sample = await query(`SELECT * FROM ${t} LIMIT 5`); } catch (e) { sample = [] }
          out[t] = { count, sample };
        } catch (e) { out[t] = { count: 0, sample: [], error: 'Table not found' }; }
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
