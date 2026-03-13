import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer as createHttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import pg from "pg";
import path from "path";
import dotenv from "dotenv";
import crypto from 'crypto';
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cors from "cors";

dotenv.config();

// Enforce PostgreSQL usage only. Require DB env vars and exit if missing.
if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_NAME) {
  console.error('PostgreSQL configuration missing. Please set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME in your .env');
  process.exit(1);
}

let usePostgres = true;
let pgPool: pg.Pool | null = null;
let sqliteDb: any = null; // kept declared for compatibility with legacy code paths (unused)

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
  console.error("Failed to create PostgreSQL pool:", err);
  process.exit(1);
}

async function query(sql: string, params: any[] = []) {
  if (!pgPool) throw new Error('Postgres pool not initialized');
  try {
    // Convert ? placeholders to $1, $2, ... for pg
    let pgSql = sql;
    let count = 1;
    while (pgSql.includes('?')) pgSql = pgSql.replace('?', `$${count++}`);
    const res = await pgPool.query(pgSql, params);
    if (sql.trim().toUpperCase().startsWith('INSERT')) {
      return { insertId: res.rows[0]?.id, affectedRows: res.rowCount };
    }
    return res.rows;
  } catch (err) {
    console.error('PostgreSQL Query Error:', err);
    throw err;
  }
}

// Simple audit recorder: stores who did what and snapshots of before/after plus metadata
async function recordAudit(user: any, action: string, tableName: string, rowId: any = null, before: any = null, after: any = null, meta: any = null) {
  try {
    const user_id = user && (user.id || user.employee_id) ? (user.id || user.employee_id) : null;
    const username = user && (user.email || user.username || user.full_name) ? (user.email || user.username || user.full_name) : null;
    const source = meta && meta.source ? meta.source : null;
    const ip = meta && meta.ip ? meta.ip : null;
    const user_agent = meta && meta.user_agent ? meta.user_agent : null;
    const route = meta && meta.route ? meta.route : null;
    const method = meta && meta.method ? meta.method : null;
    const meta_json = meta ? JSON.stringify(meta) : null;

    await query(
      'INSERT INTO audit_logs (user_id, username, action, table_name, row_id, before_json, after_json, source, ip, user_agent, route, method, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [user_id, username, action, tableName, rowId, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, source, ip, user_agent, route, method, meta_json]
    );
  } catch (err) {
    console.error('recordAudit error:', err);
  }
}

// Tables/resources that are considered important enough to auto-audit when mutated.
// Use this list to avoid logging every incidental HTTP request and reduce noise.
const auditInterestTables = [
  'employees','goals','coaching_logs','coaching_chats','appraisals','discipline_records','property_accountability',
  'users','suggestions','feedback_360','applicants','requisitions','offboarding','exit_interviews','development_plans',
  'self_assessments','onboarding','notifications','elearning_courses','elearning_recommendations','pip_plans'
];

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
      email TEXT UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      employee_id INTEGER,
      profile_picture TEXT,
      full_name TEXT,
      linked_user_id INTEGER,
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
      status TEXT DEFAULT 'delivered',
      reply_to INTEGER,
      action_type TEXT,
      action_payload TEXT,
      action_status TEXT,
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
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      user_id INTEGER,
      role TEXT,
      type TEXT DEFAULT 'info',
      message TEXT NOT NULL,
      source TEXT,
      read INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
    ,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      user_id INTEGER,
      username TEXT,
      action TEXT NOT NULL,
      table_name TEXT NOT NULL,
      row_id INTEGER,
      before_json TEXT,
      after_json TEXT,
      source TEXT,
      ip TEXT,
      user_agent TEXT,
      route TEXT,
      method TEXT,
      meta_json TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      'ALTER TABLE appraisals ADD COLUMN job_knowledge_comment TEXT',
      'ALTER TABLE appraisals ADD COLUMN work_quality_comment TEXT',
      'ALTER TABLE appraisals ADD COLUMN attendance_comment TEXT',
      'ALTER TABLE appraisals ADD COLUMN productivity_comment TEXT',
      'ALTER TABLE appraisals ADD COLUMN communication_comment TEXT',
      'ALTER TABLE appraisals ADD COLUMN dependability_comment TEXT',
    ];
    for (const sql of appraisalMigrations) {
      try {
        if (usePostgres && pgPool) {
          const c = await pgPool.connect();
          try { await c.query(sql); } catch {} finally { c.release(); }
        } else { sqliteDb.exec(sql); }
      } catch {}
    }

    // Safe migrations for self_assessments
    const selfAssessmentMigrations = [
      'ALTER TABLE self_assessments ADD COLUMN work_quality INTEGER',
    ];
    for (const sql of selfAssessmentMigrations) {
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

    // Employee profile migrations — email, phone, address
    const employeeProfileMigrations = [
      'ALTER TABLE employees ADD COLUMN email TEXT',
      'ALTER TABLE employees ADD COLUMN phone TEXT',
      'ALTER TABLE employees ADD COLUMN address TEXT',
    ];
    for (const sql of employeeProfileMigrations) {
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
      'ALTER TABLE users ADD COLUMN email TEXT',
      'ALTER TABLE users ADD COLUMN full_name TEXT',
      'ALTER TABLE users ADD COLUMN linked_user_id INTEGER',
      'ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP',
      'ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0',
      'ALTER TABLE coaching_chats ADD COLUMN status TEXT DEFAULT \'delivered\'',
      'ALTER TABLE coaching_chats ADD COLUMN reply_to INTEGER',
      'ALTER TABLE coaching_chats ADD COLUMN action_type TEXT',
      'ALTER TABLE coaching_chats ADD COLUMN action_payload TEXT',
      'ALTER TABLE coaching_chats ADD COLUMN action_status TEXT',
    ];
    for (const sql of userMigrations) {
      try {
        if (usePostgres && pgPool) {
          const c = await pgPool.connect();
          try { await c.query(sql); } catch {} finally { c.release(); }
        } else { sqliteDb.exec(sql); }
      } catch {}
    }

    // Safe migrations for audit_logs — add metadata columns if missing
    const auditMigrations = [
      'ALTER TABLE audit_logs ADD COLUMN source TEXT',
      'ALTER TABLE audit_logs ADD COLUMN ip TEXT',
      'ALTER TABLE audit_logs ADD COLUMN user_agent TEXT',
      'ALTER TABLE audit_logs ADD COLUMN route TEXT',
      'ALTER TABLE audit_logs ADD COLUMN method TEXT',
      'ALTER TABLE audit_logs ADD COLUMN meta_json TEXT',
    ];
    for (const sql of auditMigrations) {
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
      console.log("No users found — creating demo accounts...");
      const bcrypt = await import('bcryptjs');
      const hash = (pw: string) => bcrypt.default.hashSync(pw, 10);

      // Create demo employees first
      await query("INSERT INTO employees (name, status, position, dept, hire_date) VALUES (?, 'Regular', 'Software Engineer', 'Engineering', '2025-01-15')", ['John Doe']);
      await query("INSERT INTO employees (name, status, position, dept, hire_date) VALUES (?, 'Probationary', 'QA Analyst', 'Engineering', '2025-06-01')", ['Jane Smith']);

      const empRows = await query("SELECT id, name FROM employees ORDER BY id") as any[];
      const johnId = empRows.find((e: any) => e.name === 'John Doe')?.id;
      const janeId = empRows.find((e: any) => e.name === 'Jane Smith')?.id;

      // Set manager_id on employees so manager sees them
      if (johnId) await query("UPDATE employees SET manager_id = 0 WHERE id = ?", [johnId]);
      if (janeId) await query("UPDATE employees SET manager_id = 0 WHERE id = ?", [janeId]);

      // Create user accounts linked to employees (demo passwords)
      await query("INSERT INTO users (username, email, password, role, employee_id) VALUES (?, ?, ?, 'Employee', ?)", ['employee_john', 'john.doe@example.com', hash('demo_employee_pass'), johnId]);
      await query("INSERT INTO users (username, email, password, role, employee_id) VALUES (?, ?, ?, 'Employee', ?)", ['employee_jane', 'jane.smith@example.com', hash('demo_employee_pass'), janeId]);
      await query("INSERT INTO users (username, email, password, role, employee_id) VALUES (?, ?, ?, 'Manager', NULL)", ['manager_bob', 'manager.bob@example.com', hash('demo_manager_pass')]);
      await query("INSERT INTO users (username, email, password, role, employee_id) VALUES (?, ?, ?, 'HR', NULL)", ['hr_admin', 'hr_admin@example.com', hash('demo_hr_pass')]);

      // Ensure demo accounts have human-friendly full_name values
      await query("UPDATE users SET full_name = ? WHERE username = ?", ['John Doe', 'employee_john']);
      await query("UPDATE users SET full_name = ? WHERE username = ?", ['Jane Smith', 'employee_jane']);
      await query("UPDATE users SET full_name = ? WHERE username = ?", ['Manager Bob', 'manager_bob']);
      await query("UPDATE users SET full_name = ? WHERE username = ?", ['HR Admin', 'hr_admin']);

      // Update manager_id to the manager's user id after creation  
      const mgrUser = (await query("SELECT id FROM users WHERE username = 'manager_bob'") as any[])[0];
      if (mgrUser && johnId) await query("UPDATE employees SET manager_id = ? WHERE id = ?", [mgrUser.id, johnId]);
      if (mgrUser && janeId) await query("UPDATE employees SET manager_id = ? WHERE id = ?", [mgrUser.id, janeId]);

      // Seed demo goals for John Doe
      if (johnId) {
        await query("INSERT INTO goals (employee_id, title, statement, metric, target_date, status, progress, scope, priority, quarter) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [johnId, 'Complete API Refactor', 'Refactor all legacy REST endpoints to use the new service layer', 'All endpoints migrated and tested', '2026-06-30', 'In Progress', 45, 'Individual', 'High', 'Q2 2026']);
        await query("INSERT INTO goals (employee_id, title, statement, metric, target_date, status, progress, scope, priority, quarter) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [johnId, 'Improve Test Coverage', 'Increase unit test coverage from 40% to 80%', 'Coverage report shows ≥80%', '2026-03-31', 'In Progress', 60, 'Individual', 'Medium', 'Q1 2026']);
        await query("INSERT INTO goals (employee_id, title, statement, metric, target_date, status, progress, scope, priority, quarter) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [johnId, 'Complete Onboarding Docs', 'Write developer onboarding documentation for the team', 'Document published and reviewed', '2026-02-28', 'Completed', 100, 'Team', 'Low', 'Q1 2026']);
      }
      // Seed demo goals for Jane Smith
      if (janeId) {
        await query("INSERT INTO goals (employee_id, title, statement, metric, target_date, status, progress, scope, priority, quarter) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [janeId, 'Automate Regression Suite', 'Build automated regression test suite covering core user flows', '90% of core flows automated', '2026-05-31', 'In Progress', 30, 'Individual', 'High', 'Q2 2026']);
        await query("INSERT INTO goals (employee_id, title, statement, metric, target_date, status, progress, scope, priority, quarter) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [janeId, 'Zero Critical Bugs in Q1', 'Ensure no critical bugs reach production in Q1', '0 critical bugs in production', '2026-03-31', 'In Progress', 80, 'Individual', 'High', 'Q1 2026']);
      }

      console.log("Demo accounts created:");
      console.log("  john.doe@example.com / demo_employee_pass  → Employee (John Doe)");
      console.log("  jane.smith@example.com / demo_employee_pass  → Employee (Jane Smith)");
      console.log("  manager.bob@example.com / demo_manager_pass  → Manager");
      console.log("  hr_admin@example.com / demo_hr_pass  → HR");
    }
    console.log(`Database Initialized Successfully in ${usePostgres ? 'PostgreSQL' : 'SQLite'} mode`);
  } catch (err) {
    console.error("Database initialization failed:", err);
    console.error("PostgreSQL initialization failed. This application requires a running PostgreSQL instance.\nPlease verify your DB connection settings in .env (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME) and ensure the database is reachable.");
    process.exit(1);
  }
}

async function startServer() {
  await initDb();
  
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  const PORT = parseInt(process.env.PORT || '3000');

  const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

  // Verify token and ensure token_version matches DB to support single-active-session invalidation
  async function verifyTokenWithVersion(token: string) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as any;
      if (!payload || !payload.id) throw new Error('Invalid token payload');
      const rows: any = await query('SELECT token_version FROM users WHERE id = ?', [payload.id]);
      const row = Array.isArray(rows) ? rows[0] : rows;
      const dbVersion = row ? (row.token_version || 0) : 0;
      const tokenVersion = (payload.token_version || 0);
      console.log(`[auth] verifyToken user=${payload.id} tokenVersion=${tokenVersion} dbVersion=${dbVersion}`);
      if ((tokenVersion || 0) !== (dbVersion || 0)) {
        console.log(`[auth] token version mismatch for user=${payload.id} -> invalidated`);
        throw new Error('Token invalidated');
      }
      return payload;
    } catch (err) {
      throw err;
    }
  }

  async function authenticateToken(req: any, res: any, next: any) {
    const auth = req.headers['authorization'];
    if (!auth) return res.status(401).json({ error: 'Missing Authorization header' });
    const parts = auth.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Invalid Authorization header' });
    const token = parts[1];
    try {
      const payload = await verifyTokenWithVersion(token);
      req.user = payload;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  // Utility: extract JWT payload without failing the request
  function extractUserFromAuthHeader(req: any) {
    try {
      const auth = req.headers['authorization'];
      if (!auth) return null;
      const parts = auth.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
      const token = parts[1];
      const payload = jwt.verify(token, JWT_SECRET) as any;
      return payload;
    } catch (e) { return null; }
  }

  // Utility: shallow sanitize request bodies to avoid storing secrets
  function sanitizeRequestBody(obj: any) {
    if (!obj || typeof obj !== 'object') return null;
    const out: any = Array.isArray(obj) ? [] : {};
    for (const k of Object.keys(obj)) {
      try {
        if (/password|token|secret|ssn|card|cvv/i.test(k)) {
          out[k] = '[REDACTED]';
        } else {
          out[k] = obj[k];
        }
      } catch (e) { out[k] = null; }
    }
    return out;
  }

  // Audit middleware: record only meaningful authenticated actions to avoid
  // overwhelming the audit trail with low-value HTTP requests. We record when
  // the client explicitly requests an audit (`_audit_action` / header), or
  // when a mutating HTTP method touches a resource in `auditInterestTables`.
  app.use(async (req: any, res: any, next: any) => {
    try {
      if (!req.path || !req.path.startsWith('/api')) return next();
      if (req.path.startsWith('/api/audit_logs') || req.path === '/api/activity') return next();

      const user = (req as any).user || extractUserFromAuthHeader(req) || null;
      if (!user) return next();

      const method = (req.method || '').toUpperCase();
      const pathSegments = (req.path || '').split('/').filter(Boolean);
      const resource = pathSegments[1] || pathSegments[0] || null; // /api/<resource>
      const idSeg = pathSegments[2] || null;
      const rowId = idSeg && /^\d+$/.test(idSeg) ? parseInt(idSeg) : null;

      const explicitAction = (req && req.body && typeof req.body === 'object' && req.body._audit_action) ? req.body._audit_action :
        (req && req.headers && (req.headers['x-audit-action'] || req.headers['x-audit-description']) ? (req.headers['x-audit-action'] || req.headers['x-audit-description']) : null);

      // Decide whether to record: explicit action OR mutating method on an important resource
      let shouldAudit = false;
      if (explicitAction) shouldAudit = true;
      else if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        const candidate = resource ? resource.toString() : null;
        if (candidate && auditInterestTables.includes(candidate)) shouldAudit = true;
      }

      if (!shouldAudit) return next();

      const normalizedAction = explicitAction || (method === 'POST' ? 'create' : (method === 'PUT' || method === 'PATCH' ? 'update' : (method === 'DELETE' ? 'delete' : `${method} ${req.path}`)));
      const tableName = resource || 'http';

      const meta = {
        source: 'http',
        ip: req.headers['x-forwarded-for'] || req.ip || (req.connection && (req.connection as any).remoteAddress) || null,
        user_agent: req.headers['user-agent'] || null,
        route: req.originalUrl || req.url || req.path,
        method,
        body: sanitizeRequestBody(req.body),
        query: req.query || null,
      };

      const after = (['create', 'update', 'submit', 'review'].includes(normalizedAction) ? sanitizeRequestBody(req.body) : null);
      recordAudit(user, normalizedAction, tableName, rowId, null, after, meta).catch(() => {});
    } catch (e) { console.error('audit middleware error:', e); }
    next();
  });

  // API Routes
  app.post("/api/login", async (req, res) => {
    try {
      const { email, username, password } = req.body;
      if (!email && !username) return res.status(400).json({ error: 'Missing email or username' });
      let rows: any = [];
      if (email) {
        rows = await query("SELECT * FROM users WHERE email = ? AND deleted_at IS NULL", [email]) as any;
      }
      if ((!rows || rows.length === 0) && username) {
        rows = await query("SELECT * FROM users WHERE username = ? AND deleted_at IS NULL", [username]) as any;
      }
      const user = rows[0];
      if (!user) return res.status(401).json({ error: "Invalid credentials" });
      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(401).json({ error: "Invalid credentials" });
      // Increment token_version to invalidate prior sessions for this user (single-active-session)
      try {
        const prevTvRows: any = await query('SELECT token_version FROM users WHERE id = ?', [user.id]);
        const prevTv = Array.isArray(prevTvRows) && prevTvRows[0] ? (prevTvRows[0].token_version || 0) : (prevTvRows.token_version || 0);
        console.log(`Login: user ${user.id} previous token_version=${prevTv}`);
        await query('UPDATE users SET token_version = COALESCE(token_version, 0) + 1 WHERE id = ?', [user.id]);
      } catch (e) { console.error('token_version update error:', e); }
      const tvRows: any = await query('SELECT token_version FROM users WHERE id = ?', [user.id]);
      const tokenVersion = Array.isArray(tvRows) && tvRows[0] ? (tvRows[0].token_version || 0) : (tvRows.token_version || 0);
      console.log(`Login: user ${user.id} new token_version=${tokenVersion}`);
      // Notify existing sockets for this user to force logout, then disconnect them.
      // Strategy: compute the union of socket ids from the Socket.IO room and the
      // server-side `userSocketMap`, then disconnect each socket id found. Clean
      // up stale entries from `userSocketMap` and `onlineUsers` as we go.
      try {
        if (typeof io !== 'undefined' && io) {
          const roomName = `user_${user.id}`;
          // Ask clients in the room to handle graceful logout first
          try { io.to(roomName).emit('force_logout', { reason: 'logged_in_elsewhere' }); } catch (e) { console.error('emit force_logout error', e); }

          // Gather socket ids from the room (if any)
          let roomSockets: string[] = [];
          try {
            const sockets = await io.in(roomName).fetchSockets();
            roomSockets = sockets.map(s => s.id);
          } catch (e) {
            console.error('fetchSockets error:', e);
          }

          // Gather socket ids from authoritative server-side map
          const mapSet = userSocketMap.get(user.id) || new Set<string>();
          const mapSockets = Array.from(mapSet);

          // Union the ids
          const unionIds = new Set<string>([...roomSockets, ...mapSockets]);
          // Also sweep all connected sockets and add any whose socket.data.userId matches
          try {
            io.sockets.sockets.forEach((s: any) => {
              try {
                const sid = s.id;
                const sd = (s as any).data || {};
                if (sd && sd.userId === user.id) unionIds.add(sid);
              } catch (e) {}
            });
          } catch (e) { console.error('sweep sockets error', e); }

          console.log(`Login: user ${user.id} disconnect candidate sockets: ${Array.from(unionIds).join(', ') || '(none)'}`);

          let disconnected = 0;
          for (const sid of unionIds) {
            try {
              const s = io.sockets.sockets.get(sid);
              if (s) {
                // If the socket reports the same tokenVersion as the new token, skip to avoid disconnecting the freshly logged-in client
                const sData = (s as any).data || {};
                if (sData.tokenVersion !== undefined && sData.tokenVersion === tokenVersion) {
                  console.log(`Login: skipping disconnect for socket ${sid} (tokenVersion matches new ${tokenVersion})`);
                } else {
                  console.log(`Login: disconnecting socket ${sid} for user ${user.id} (socket tokenVersion=${sData.tokenVersion ?? 'unknown'})`);
                  try { s.disconnect(true); disconnected++; } catch (e) { console.error('socket disconnect error', e); }
                }
              } else {
                console.log(`Login: candidate socket ${sid} not found in io.sockets (stale). Cleaning up.`);
              }
            } catch (e) {
              console.error('Login disconnect loop error', e);
            } finally {
              // Clean up server-side references for this socket id
              try { onlineUsers.delete(sid); } catch (e) {}
              try {
                const set = userSocketMap.get(user.id);
                if (set) { set.delete(sid); if (set.size === 0) userSocketMap.delete(user.id); }
              } catch (e) { console.error('userSocketMap cleanup error', e); }
            }
          }

          if (disconnected) console.log(`Login: user ${user.id} disconnected ${disconnected} socket(s)`);
          else console.log(`Login: user ${user.id} had no active sockets to disconnect`);
        }
      } catch (e) { console.error('Error forcing logout sockets:', e); }
      const token = jwt.sign({
        id: user.id,
        username: user.username || user.email || user.full_name || null,
        email: user.email || user.username,
        role: user.role,
        employee_id: user.employee_id,
        token_version: tokenVersion
      }, JWT_SECRET, { expiresIn: '8h' });
      let employee_name: string | null = null, position: string | null = null, dept: string | null = null, user_email: string | null = null, phone: string | null = null, address: string | null = null, hire_date: string | null = null, status: string | null = null;
      if (user.employee_id) {
        const empRows = await query('SELECT name, position, dept, email, phone, address, hire_date, status FROM employees WHERE id = ?', [user.employee_id]) as any;
        if (empRows[0]) { employee_name = empRows[0].name; position = empRows[0].position; dept = empRows[0].dept; user_email = empRows[0].email; phone = empRows[0].phone; address = empRows[0].address; hire_date = empRows[0].hire_date; status = empRows[0].status; }
      }
      try {
        const meta = {
          source: 'http',
          ip: req.headers['x-forwarded-for'] || req.ip || (req.connection && (req.connection as any).remoteAddress) || null,
          user_agent: req.headers['user-agent'] || null,
          route: req.originalUrl || req.url || req.path,
          method: 'POST',
          body: sanitizeRequestBody(req.body),
        };
        // Record login event
        recordAudit(user, 'login', 'users', user.id, null, { token_version: tokenVersion }, meta).catch(() => {});
      } catch (e) { /* ignore audit errors */ }
      res.json({ token, id: user.id, email: user.email || user.username, full_name: user.full_name || null, role: user.role, employee_id: user.employee_id, profile_picture: user.profile_picture || null, employee_name, position, dept, email: user_email || user.email || null, phone, address, hire_date, status });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  // Logout endpoint — records a logout audit entry for the authenticated user
  app.post('/api/logout', authenticateToken, async (req: any, res: any) => {
    try {
      const user = (req as any).user || null;
      const meta = {
        source: 'http',
        ip: req.headers['x-forwarded-for'] || req.ip || (req.connection && (req.connection as any).remoteAddress) || null,
        user_agent: req.headers['user-agent'] || null,
        route: req.originalUrl || req.url || req.path,
        method: req.method || 'POST'
      };
      await recordAudit(user, 'logout', 'users', user?.id || null, null, null, meta);
      res.json({ success: true });
    } catch (err) {
      console.error('POST /api/logout error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Forgot password: generates a reset token and (in dev) returns it in response
  app.post('/api/forgot-password', async (req, res) => {
    try {
      const { email, username } = req.body;
      if (!email && !username) return res.status(400).json({ error: 'Missing email or username' });
      let rows: any = [];
      if (email) rows = await query('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL', [email]) as any;
      if ((!rows || rows.length === 0) && username) rows = await query('SELECT * FROM users WHERE username = ? AND deleted_at IS NULL', [username]) as any;
      const user = rows[0];
      if (!user) return res.status(404).json({ error: 'User not found' });
      const token = crypto.randomBytes(24).toString('hex');
      const expires = Date.now() + 1000 * 60 * 60; // 1 hour
      await query('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)', [user.id, token, expires]);
      console.log(`Password reset token for ${user.email || user.username}: ${token}`);
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
      const userRows = await query('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', [pr.user_id]) as any;
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
      try { payload = await verifyTokenWithVersion(parts[1]); } catch (err) { return res.status(401).json({ error: 'Invalid token' }); }
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Missing passwords' });
      const rows = await query('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', [payload.id]) as any;
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

  app.post("/api/users", async (req, res) => {
    try {
      // Protected: only HR or Manager can create users
      const authHeader = req.headers['authorization'];
      if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
      // reuse authenticateToken to validate
      // (for simplicity, call it manually)
      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Unauthorized' });
      let creatorPayload: any = null;
        try {
        creatorPayload = await verifyTokenWithVersion(parts[1]);
        if (creatorPayload.role !== 'HR' && creatorPayload.role !== 'Manager') return res.status(403).json({ error: 'Forbidden' });
      } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const { email, username, password, role, employee_id, full_name, linked_user_id } = req.body;
      if ((!email && !username) || !password) return res.status(400).json({ error: 'Missing email (or username) or password' });
      const allowedRoles = ['Employee', 'Manager', 'HR'];
      if (!role || typeof role !== 'string' || !allowedRoles.includes(role)) return res.status(400).json({ error: 'Invalid or missing role' });
      const hashed = bcrypt.hashSync(password, 10);
      // Prefer email for new accounts; keep username as optional legacy field.
      await query("INSERT INTO users (username, email, password, role, employee_id, full_name, linked_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)", 
        [username || null, email || null, hashed, role, employee_id || null, full_name || null, linked_user_id || null]);

      try {
        await recordAudit(creatorPayload, 'create', 'users', null, null, { email: email || null, username: username || null, role, employee_id: employee_id || null, full_name: full_name || null, linked_user_id: linked_user_id || null });
      } catch (e) { /* ignore audit errors */ }

      res.json({ success: true });
    } catch (err) {
      console.error('POST /api/users error:', err);
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
      try { payload = await verifyTokenWithVersion(parts[1]); } catch (err) { return res.status(401).json({ error: 'Invalid token' }); }
      if (payload.role !== 'HR') return res.status(403).json({ error: 'Forbidden' });

      const id = req.params.id;
      const { password, role, employee_id, full_name, linked_user_id } = req.body;
      // Capture previous state for audit
      let before: any = null;
      try {
        const br: any = await query('SELECT * FROM users WHERE id = ?', [id]);
        before = Array.isArray(br) ? br[0] : br;
      } catch (e) { before = null; }
      const sets: string[] = [];
      const vals: any[] = [];
      if (password) {
        const hashed = bcrypt.hashSync(password, 10);
        sets.push('password = ?');
        vals.push(hashed);
      }
      if (role !== undefined) {
        const allowedRoles = ['Employee', 'Manager', 'HR'];
        if (!role || !allowedRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });
        sets.push('role = ?');
        vals.push(role);
      }
      if (employee_id !== undefined) { sets.push('employee_id = ?'); vals.push(employee_id || null); }
      if (full_name !== undefined) { sets.push('full_name = ?'); vals.push(full_name || null); }
      if (linked_user_id !== undefined) { sets.push('linked_user_id = ?'); vals.push(linked_user_id || null); }
      if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
      vals.push(id);
      await query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, vals);
      // Capture after state and record audit
      try {
        const ar: any = await query('SELECT * FROM users WHERE id = ?', [id]);
        const after = Array.isArray(ar) ? ar[0] : ar;
        await recordAudit(payload, 'update', 'users', id, before, after);
      } catch (e) { /* ignore audit errors */ }

      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  // Get own account info
  app.get('/api/account-info', authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      const employeeId = (req as any).user?.employee_id;
      const userRows = await query('SELECT id, username, email, role, employee_id, profile_picture, full_name FROM users WHERE id = ?', [userId]) as any;
      const u = userRows[0];
      if (!u) return res.status(404).json({ error: 'User not found' });
      let emp: any = null;
      if (employeeId) {
        const empRows = await query('SELECT name, position, dept, email, phone, address, hire_date, status FROM employees WHERE id = ?', [employeeId]) as any;
        emp = empRows[0] || null;
      }
      res.json({ ...u, ...(emp || {}) });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  // Update own account info (email, phone, address)
  app.put('/api/account-info', authenticateToken, async (req, res) => {
    try {
      const employeeId = (req as any).user?.employee_id;
      if (!employeeId) return res.status(400).json({ error: 'No linked employee' });
      // Accept updates for contact info and basic profile fields
      const { email, phone, address, employee_name, position, dept } = req.body;
      const sets: string[] = [];
      const vals: any[] = [];
      if (employee_name !== undefined) { sets.push('name = ?'); vals.push(employee_name || null); }
      if (position !== undefined) { sets.push('position = ?'); vals.push(position || null); }
      if (dept !== undefined) { sets.push('dept = ?'); vals.push(dept || null); }
      if (email !== undefined) { sets.push('email = ?'); vals.push(email || null); }
      if (phone !== undefined) { sets.push('phone = ?'); vals.push(phone || null); }
      if (address !== undefined) { sets.push('address = ?'); vals.push(address || null); }
      if (sets.length > 0) {
        vals.push(employeeId);
        await query(`UPDATE employees SET ${sets.join(', ')} WHERE id = ?`, vals);
      }
      // If employee name was updated, mirror it to the linked user.full_name
      if (employee_name !== undefined) {
        try {
          await query('UPDATE users SET full_name = ? WHERE employee_id = ?', [employee_name || null, employeeId]);
        } catch (e) { /* ignore */ }
      }
      // Return refreshed employee info
      const empRows = await query('SELECT name, position, dept, email, phone, address, hire_date, status FROM employees WHERE id = ?', [employeeId]) as any;
      res.json({ success: true, ...(empRows[0] || {}) });
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
      try { payload = await verifyTokenWithVersion(parts[1]); } catch (err) { return res.status(401).json({ error: 'Invalid token' }); }
      if (payload.role !== 'HR') return res.status(403).json({ error: 'Forbidden' });

      const id = req.params.id;
      // capture before state
      let before: any = null;
      try { const br: any = await query('SELECT * FROM users WHERE id = ?', [id]); before = Array.isArray(br) ? br[0] : br; } catch (e) { before = null; }
      // Soft-delete: set deleted_at timestamp instead of hard deleting
      await query('UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
      // capture after state
      let after: any = null;
      try { const ar: any = await query('SELECT * FROM users WHERE id = ?', [id]); after = Array.isArray(ar) ? ar[0] : ar; } catch (e) { after = null; }
      try { await recordAudit(payload, 'delete', 'users', id, before, after); } catch (e) {}
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  // Restore user (HR only) — clears deleted_at timestamp
  app.put('/api/users/:id/restore', async (req, res) => {
    try {
      const authHeader = req.headers['authorization'];
      if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Unauthorized' });
      let payload: any;
      try { payload = await verifyTokenWithVersion(parts[1]); } catch (err) { return res.status(401).json({ error: 'Invalid token' }); }
      if (payload.role !== 'HR') return res.status(403).json({ error: 'Forbidden' });

      const id = req.params.id;
      let before: any = null;
      try { const br: any = await query('SELECT * FROM users WHERE id = ?', [id]); before = Array.isArray(br) ? br[0] : br; } catch (e) { before = null; }
      await query('UPDATE users SET deleted_at = NULL WHERE id = ?', [id]);
      let after: any = null;
      try { const ar: any = await query('SELECT * FROM users WHERE id = ?', [id]); after = Array.isArray(ar) ? ar[0] : ar; } catch (e) { after = null; }
      try { await recordAudit(payload, 'restore', 'users', id, before, after); } catch (e) {}
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
        await verifyTokenWithVersion(parts[1]);
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

  // List employees (authenticated)
  app.get('/api/employees', async (req, res) => {
    try {
      const auth = req.headers['authorization'];
      if (!auth) return res.status(401).json({ error: 'Unauthorized' });
      const parts = auth.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Unauthorized' });
      try { await verifyTokenWithVersion(parts[1]); } catch (err) { return res.status(401).json({ error: 'Invalid token' }); }

      const rows: any = await query('SELECT * FROM employees ORDER BY name');
      res.json(Array.isArray(rows) ? rows : []);
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  // Update employee
  app.put("/api/employees/:id", async (req, res) => {
    try {
      const auth = req.headers['authorization'];
      if (!auth) return res.status(401).json({ error: 'Unauthorized' });
      const parts = auth.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Unauthorized' });
      try { await verifyTokenWithVersion(parts[1]); } catch (err) { return res.status(401).json({ error: 'Invalid token' }); }

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
      try { await verifyTokenWithVersion(parts[1]); } catch (err) { return res.status(401).json({ error: 'Invalid token' }); }

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
      // Fetch property rows assigned to this employee by id.
      // Also include records where employee_id is NULL but the saved employee_name
      // matches the employee's name (case-insensitive, trimmed). This helps
      // surface assets that were saved without an employee_id set.
      const property = await query(
        "SELECT * FROM property_accountability WHERE employee_id = ? OR (employee_id IS NULL AND TRIM(LOWER(employee_name)) = TRIM(LOWER(?)))",
        [id, employee.name || '']
      );
      
      res.json({ ...employee, goals, logs, appraisals, discipline, property });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

    // List users (authenticated). HR may request include_deleted=1 to see archived accounts.
    app.get('/api/users', async (req, res) => {
      try {
        const authHeader = req.headers['authorization'];
        if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Unauthorized' });
        let payload: any;
        try { payload = await verifyTokenWithVersion(parts[1]); } catch (err) { return res.status(401).json({ error: 'Invalid token' }); }

        const includeDeleted = (req.query && (req.query.include_deleted === '1' || req.query.include_deleted === 'true'));
        if (includeDeleted && payload.role !== 'HR') return res.status(403).json({ error: 'Forbidden' });

        const q = `SELECT u.*, e.name AS employee_name, lu.full_name AS linked_user_full_name, lu.role AS linked_user_role
                   FROM users u
                   LEFT JOIN employees e ON u.employee_id = e.id
                   LEFT JOIN users lu ON u.linked_user_id = lu.id
                   ${includeDeleted ? '' : 'WHERE u.deleted_at IS NULL'}
                   ORDER BY u.full_name IS NULL, u.full_name, u.email`;
        const users: any = await query(q);
        res.json(Array.isArray(users) ? users : []);
      } catch (err) { res.status(500).json({ error: 'Database error' }); }
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
      // Notify the employee
      const empUsers: any = await query("SELECT id FROM users WHERE employee_id = ?", [employee_id]);
      const empUser = Array.isArray(empUsers) ? empUsers[0] : empUsers;
      if (empUser) {
        await createNotification({ user_id: empUser.id, type: is_positive ? 'success' : 'info', message: `New coaching entry: ${category || 'General'} — ${is_positive ? 'Positive' : 'Constructive'}`, source: 'coaching_log' });
      }
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
          supervisor_print_name, reviewer_print_name, hr_print_name,
          job_knowledge_comment, work_quality_comment, attendance_comment, productivity_comment, communication_comment, dependability_comment)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          b.supervisor_print_name || null, b.reviewer_print_name || null, b.hr_print_name || null,
          b.job_knowledge_comment || null, b.work_quality_comment || null, b.attendance_comment || null, b.productivity_comment || null, b.communication_comment || null, b.dependability_comment || null]);
      // Notify the employee about their new evaluation
      const eUsers: any = await query("SELECT id FROM users WHERE employee_id = ?", [b.employee_id]);
      const eUser = Array.isArray(eUsers) ? eUsers[0] : eUsers;
      if (eUser) {
        await createNotification({ user_id: eUser.id, type: 'info', message: `A new ${b.form_type || 'performance'} evaluation has been submitted for you`, source: 'appraisal' });
      }
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
      // Notify the other party
      if (sender_role === 'Employee') {
        // Find the user linked to this employee's manager
        const emp: any = await query("SELECT e.name, e.manager_id FROM employees e WHERE e.id = ?", [employee_id]);
        const empRow = Array.isArray(emp) ? emp[0] : emp;
        if (empRow) {
          const mgrUsers: any = await query("SELECT id FROM users WHERE employee_id = ? AND role = 'Manager'", [empRow.manager_id]);
          const mgrUser = Array.isArray(mgrUsers) ? mgrUsers[0] : mgrUsers;
          if (mgrUser) {
            await createNotification({ user_id: mgrUser.id, type: 'info', message: `New chat message from ${sender_name || empRow.name}`, source: 'coaching_chat' });
          } else {
            await createNotification({ role: 'Manager', type: 'info', message: `New chat message from ${sender_name || empRow.name}`, source: 'coaching_chat' });
          }
        }
      } else {
        // Manager sent — notify the employee
        const empUsers: any = await query("SELECT id FROM users WHERE employee_id = ?", [employee_id]);
        const empUser = Array.isArray(empUsers) ? empUsers[0] : empUsers;
        if (empUser) {
          await createNotification({ user_id: empUser.id, type: 'info', message: `New chat message from ${sender_name || 'your Manager'}`, source: 'coaching_chat' });
        }
      }
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
      // Notify the employee about the new course recommendation
      const recEmpUsers: any = await query("SELECT id FROM users WHERE employee_id = ?", [employee_id]);
      const recEmpUser = Array.isArray(recEmpUsers) ? recEmpUsers[0] : recEmpUsers;
      if (recEmpUser) {
        await createNotification({ user_id: recEmpUser.id, type: 'info', message: `New e-learning recommendation: ${course_title}`, source: 'elearning' });
      }
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
    try { const rows = await query("SELECT d.*, e.name as employee_name, e.dept as dept FROM discipline_records d LEFT JOIN employees e ON d.employee_id = e.id"); res.json(rows); } catch (err) { res.status(500).json({ error: "Database error" }); }
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
    try {
      const qName = (req.query.employee_name || '').toString();
      if (qName) {
        // If an employee name query param was provided, attempt to return rows
        // that belong to that employee by id OR where the saved employee_name
        // matches (case-insensitive). This helps the UI when records were
        // previously saved without an employee_id.
        const empRows: any = await query('SELECT id FROM employees WHERE TRIM(LOWER(name)) = TRIM(LOWER(?))', [qName]);
        const empId = (Array.isArray(empRows) && empRows[0]) ? empRows[0].id : null;
        const rows = empId
          ? await query('SELECT * FROM property_accountability WHERE employee_id = ? OR (employee_id IS NULL AND TRIM(LOWER(employee_name)) = TRIM(LOWER(?))) ORDER BY created_at DESC', [empId, qName])
          : await query('SELECT * FROM property_accountability WHERE TRIM(LOWER(employee_name)) = TRIM(LOWER(?)) ORDER BY created_at DESC', [qName]);
        res.json(rows);
        return;
      }
      const rows = await query("SELECT * FROM property_accountability ORDER BY created_at DESC");
      res.json(rows);
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  app.post("/api/property_accountability", authenticateToken, async (req, res) => {
    try {
      let { employee_id, employee_name, position_dept, date_prepared, items,
        turnover_by_name, turnover_by_date, turnover_by_sig,
        noted_by_name, noted_by_date, noted_by_sig,
        received_by_name, received_by_date, received_by_sig,
        audited_by_name, audited_by_date, audited_by_sig } = req.body;

      // Resolve employee_id server-side when possible (handles cases where the
      // client didn't provide it or the name formatting differs slightly).
      if ((!employee_id || employee_id === null) && employee_name) {
        try {
          const empRows: any = await query('SELECT id FROM employees WHERE TRIM(LOWER(name)) = TRIM(LOWER(?))', [employee_name]);
          if (Array.isArray(empRows) && empRows[0]) employee_id = empRows[0].id;
        } catch (e) { /* ignore resolution errors and allow null */ }
      }

      // Accept both bulk `items` JSON or per-item `brand`/`serial_no`/`uom_qty`.
      const brand = req.body.brand || null;
      const serial_no = req.body.serial_no || null;
      const uom_qty = req.body.uom_qty !== undefined ? req.body.uom_qty : null;

      await query(`INSERT INTO property_accountability
        (employee_id, employee_name, position_dept, date_prepared, items, brand, serial_no, uom_qty,
         turnover_by_name, turnover_by_date, turnover_by_sig,
         noted_by_name, noted_by_date, noted_by_sig,
         received_by_name, received_by_date, received_by_sig,
         audited_by_name, audited_by_date, audited_by_sig)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [employee_id, employee_name, position_dept, date_prepared, items, brand, serial_no, uom_qty,
         turnover_by_name, turnover_by_date, turnover_by_sig,
         noted_by_name, noted_by_date, noted_by_sig,
         received_by_name, received_by_date, received_by_sig,
         audited_by_name, audited_by_date, audited_by_sig]);

      // Record audit (who created the property accountability record)
      try {
        await recordAudit((req as any).user || null, 'create', 'property_accountability', null, null, {
          employee_id, employee_name, position_dept, date_prepared, items, brand, serial_no, uom_qty
        });
      } catch (e) { /* non-fatal */ }

      res.json({ success: true });
    } catch (err) { console.error('POST /api/property_accountability error:', err); res.status(500).json({ error: "Database error" }); }
  });
  app.delete("/api/property_accountability/:id", authenticateToken, async (req, res) => {
    try {
      const id = req.params.id;
      const beforeRows: any = await query('SELECT * FROM property_accountability WHERE id = ?', [id]);
      const before = Array.isArray(beforeRows) ? beforeRows[0] : beforeRows;
      await query("DELETE FROM property_accountability WHERE id = ?", [id]);
      try { await recordAudit((req as any).user || null, 'delete', 'property_accountability', id, before || null, null); } catch (e) {}
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
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
      // If employee submitted, notify Manager role
      if (userRole === 'Employee') {
        await createNotification({ role: 'Manager', type: 'info', message: `New employee suggestion submitted: ${b.title || b.concern || 'Untitled'}`, source: 'suggestion' });
      }
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
      // Notify the employee who submitted the suggestion
      const sugRow: any = await query("SELECT employee_id FROM suggestions WHERE id = ?", [req.params.id]);
      const sug = Array.isArray(sugRow) ? sugRow[0] : sugRow;
      if (sug?.employee_id) {
        const sugEmpUsers: any = await query("SELECT id FROM users WHERE employee_id = ?", [sug.employee_id]);
        const sugEmpUser = Array.isArray(sugEmpUsers) ? sugEmpUsers[0] : sugEmpUsers;
        if (sugEmpUser) {
          await createNotification({ user_id: sugEmpUser.id, type: 'info', message: `Your suggestion has been reviewed by management (Status: ${b.status || 'Reviewed'})`, source: 'suggestion' });
        }
      }
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
    try {
      const rows: any = await query("SELECT * FROM feedback_360 WHERE id = ?", [req.params.id]);
      const feedback = Array.isArray(rows) ? rows[0] : rows;
      if (!feedback) return res.status(404).json({ error: 'Feedback not found' });
      const user: any = (req as any).user || {};
      const allowed = user.role === 'HR' || user.role === 'Manager' || feedback.evaluator_id === user.employee_id || feedback.evaluator_id === user.id;
      if (!allowed) return res.status(403).json({ error: 'Forbidden' });
      await query("DELETE FROM feedback_360 WHERE id = ?", [req.params.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
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

      try { await recordAudit((req as any).user || null, 'create', 'applicants', null, null, req.body); } catch (e) {}
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.put("/api/applicants/:id", authenticateToken, async (req, res) => {
    try {
      const { name, position, score, status, job_skills, asset_value, communication_skills, teamwork, overall_rating,
        interview_impression, dept_fit, previous_qualifications,
        q_experience, q_why_interested, q_strengths, q_weakness, q_conflict, q_goals, q_teamwork, q_pressure, q_contribution, q_questions,
        additional_comments, interviewer_name, interviewer_title, interview_date, interviewer_signature,
        hr_reviewer_name, hr_reviewer_signature, hr_reviewer_date, recommendation } = req.body;
      // capture before state
      let beforeApp: any = null;
      try { const br: any = await query('SELECT * FROM applicants WHERE id = ?', [req.params.id]); beforeApp = Array.isArray(br) ? br[0] : br; } catch (e) { beforeApp = null; }

      await query(`UPDATE applicants SET name=?, position=?, score=?, status=?, job_skills=?, asset_value=?, communication_skills=?, teamwork=?, overall_rating=?,
        interview_impression=?, dept_fit=?, previous_qualifications=?,
        q_experience=?, q_why_interested=?, q_strengths=?, q_weakness=?, q_conflict=?, q_goals=?, q_teamwork=?, q_pressure=?, q_contribution=?, q_questions=?,
        additional_comments=?, interviewer_name=?, interviewer_title=?, interview_date=?, interviewer_signature=?,
        hr_reviewer_name=?, hr_reviewer_signature=?, hr_reviewer_date=?, recommendation=? WHERE id=?`,
        [name, position, score || 0, status || 'Screening', job_skills, asset_value, communication_skills, teamwork, overall_rating,
        interview_impression, dept_fit, previous_qualifications,
        q_experience, q_why_interested, q_strengths, q_weakness, q_conflict, q_goals, q_teamwork, q_pressure, q_contribution, q_questions,
        additional_comments, interviewer_name, interviewer_title, interview_date, interviewer_signature,
        hr_reviewer_name, hr_reviewer_signature, hr_reviewer_date, recommendation, req.params.id]);
      // record after state
      try { const ar: any = await query('SELECT * FROM applicants WHERE id = ?', [req.params.id]); const afterApp = Array.isArray(ar) ? ar[0] : ar; await recordAudit((req as any).user || null, 'update', 'applicants', req.params.id, beforeApp, afterApp); } catch (e) {}
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.delete("/api/applicants/:id", authenticateToken, async (req, res) => {
    try {
      const id = req.params.id;
      let beforeApp: any = null;
      try { const br: any = await query('SELECT * FROM applicants WHERE id = ?', [id]); beforeApp = Array.isArray(br) ? br[0] : br; } catch (e) { beforeApp = null; }
      await query("DELETE FROM applicants WHERE id = ?", [id]);
      try { await recordAudit((req as any).user || null, 'delete', 'applicants', id, beforeApp, null); } catch (e) {}
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
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
      try { await recordAudit((req as any).user || null, 'create', 'offboarding', result.insertId || null, null, { employee_name, last_day, clearance_status: clearance_status || 'Pending', reason }); } catch (e) {}
      res.json({ success: true, id: result.insertId });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.put("/api/offboarding/:id", authenticateToken, async (req, res) => {
    try {
      const id = req.params.id;
      let before: any = null;
      try { const br: any = await query('SELECT * FROM offboarding WHERE id = ?', [id]); before = Array.isArray(br) ? br[0] : br; } catch (e) { before = null; }
      await query("UPDATE offboarding SET clearance_status = ? WHERE id = ?", [req.body.clearance_status, id]);
      try { const ar: any = await query('SELECT * FROM offboarding WHERE id = ?', [id]); const after = Array.isArray(ar) ? ar[0] : ar; await recordAudit((req as any).user || null, 'update', 'offboarding', id, before, after); } catch (e) {}
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.delete("/api/offboarding/:id", authenticateToken, async (req, res) => {
    try {
      const id = req.params.id;
      let before: any = null;
      try { const br: any = await query('SELECT * FROM offboarding WHERE id = ?', [id]); before = Array.isArray(br) ? br[0] : br; } catch (e) { before = null; }
      await query("DELETE FROM offboarding WHERE id = ?", [id]);
      try { await recordAudit((req as any).user || null, 'delete', 'offboarding', id, before, null); } catch (e) {}
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
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
      try { await recordAudit((req as any).user || null, 'create', 'exit_interviews', null, null, b); } catch (e) {}
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.delete("/api/exit_interviews/:id", authenticateToken, async (req, res) => {
    try {
      const id = req.params.id;
      let before: any = null;
      try { const br: any = await query('SELECT * FROM exit_interviews WHERE id = ?', [id]); before = Array.isArray(br) ? br[0] : br; } catch (e) { before = null; }
      await query("DELETE FROM exit_interviews WHERE id = ?", [id]);
      try { await recordAudit((req as any).user || null, 'delete', 'exit_interviews', id, before, null); } catch (e) {}
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
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
      const { employee_id, achievements, job_knowledge, productivity, attendance, communication, dependability, work_quality } = req.body;
      await query("INSERT INTO self_assessments (employee_id, achievements, job_knowledge, productivity, attendance, communication, dependability, work_quality) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [employee_id, achievements, job_knowledge, productivity, attendance, communication, dependability, work_quality || null]);
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
      // Notify the employee about the new PIP
      const pipEmpUsers: any = await query("SELECT id FROM users WHERE employee_id = ?", [b.employee_id]);
      const pipEmpUser = Array.isArray(pipEmpUsers) ? pipEmpUsers[0] : pipEmpUsers;
      if (pipEmpUser) {
        await createNotification({ user_id: pipEmpUser.id, type: 'info', message: `A Performance Improvement Plan has been created for you: ${b.deficiency}`, source: 'pip' });
      }
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

  // ---- Notifications CRUD ----
  // Helper: create a notification for a user or role
  async function createNotification(opts: { user_id?: number | null; role?: string | null; type?: string; message: string; source?: string }) {
    try {
      await query("INSERT INTO notifications (user_id, role, type, message, source) VALUES (?, ?, ?, ?, ?)",
        [opts.user_id || null, opts.role || null, opts.type || 'info', opts.message, opts.source || null]);
    } catch (err) { console.error('Failed to create notification:', err); }
  }

  app.get("/api/notifications", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role;
      // Get notifications targeted at this specific user OR at their role
      const rows = await query(
        "SELECT * FROM notifications WHERE (user_id = ? OR role = ? OR (user_id IS NULL AND role IS NULL)) ORDER BY created_at DESC LIMIT 100",
        [userId, userRole]
      );
      res.json(rows);
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  app.put("/api/notifications/read", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role;
      await query("UPDATE notifications SET read = 1 WHERE (user_id = ? OR role = ?)", [userId, userRole]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  app.delete("/api/notifications", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role;
      await query("DELETE FROM notifications WHERE (user_id = ? OR role = ?)", [userId, userRole]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
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
      const tables = ['employees','goals','coaching_logs','appraisals','discipline_records','property_accountability','users','password_resets','suggestions','feedback_360','applicants','requisitions','offboarding','exit_interviews','development_plans','self_assessments','pip_plans','coaching_chats','elearning_courses','elearning_recommendations','notifications'];
      const out: any = {};
      for (const t of tables) {
        try {
          const rows: any = await query(`SELECT COUNT(*) as count FROM ${t}`) as any;
          const count = parseInt(rows[0].count || rows[0].COUNT || 0);
          let sample = [];
          try { sample = await query(`SELECT * FROM ${t} LIMIT 5`) as any[]; } catch (e) { sample = [] }
          out[t] = { count, sample };
        } catch (e) { out[t] = { count: 0, sample: [], error: 'Table not found' }; }
      }
      res.json(out);
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  // ---- Audit logs (HR only). Supports employee_activity flag and partial matches ----
  app.get('/api/audit_logs', authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user || {};
      if (user.role !== 'HR') return res.status(403).json({ error: 'Forbidden' });

      const qTableRaw = (req.query.table_name || req.query.table || '').toString();
      const qUsernameRaw = (req.query.username || '').toString();
      const qUserId = req.query.user_id ? parseInt(req.query.user_id as string) : null;
      const qAction = (req.query.action || '').toString();
      const employeeOnly = (req.query.employee === '1' || req.query.employee_activity === '1' || req.query.employee === 'true' || req.query.employee_activity === 'true');
      const limit = Math.min(1000, parseInt((req.query.limit || '200').toString() || '200'));

      // (Use global `auditInterestTables` to decide which resources are employee-related)

      let sql = 'SELECT * FROM audit_logs WHERE 1=1';
      const params: any[] = [];

      if (employeeOnly) {
        const placeholders = auditInterestTables.map(() => '?').join(',');
        sql += ` AND table_name IN (${placeholders})`;
        params.push(...auditInterestTables);
      } else if (qTableRaw) {
        const parts = qTableRaw.split(',').map((t: any) => t.trim()).filter(Boolean);
        if (parts.length > 1) {
          const placeholders = parts.map(() => '?').join(',');
          sql += ` AND table_name IN (${placeholders})`;
          params.push(...parts);
        } else {
          sql += ' AND table_name ILIKE ?';
          params.push(`%${qTableRaw}%`);
        }
      }

      if (qUsernameRaw) { sql += ' AND username ILIKE ?'; params.push(`%${qUsernameRaw}%`); }
      if (!isNaN(Number(qUserId)) && qUserId !== null) { sql += ' AND user_id = ?'; params.push(qUserId); }
      if (qAction) { sql += ' AND action = ?'; params.push(qAction); }
      sql += ' ORDER BY created_at DESC LIMIT ?'; params.push(limit);

      const rows: any = await query(sql, params);
      const mapped = Array.isArray(rows) ? rows : [];

      // Enrich results with user role and a human-friendly action label.
      try {
        const userIds = Array.from(new Set(mapped.map((r: any) => r.user_id).filter(Boolean)));
        const userMap: any = {};
        if (userIds.length > 0) {
          const placeholders = userIds.map(() => '?').join(',');
          const urows: any = await query(`SELECT id, role, full_name, username, email FROM users WHERE id IN (${placeholders})`, userIds);
          for (const u of (Array.isArray(urows) ? urows : [urows].filter(Boolean))) userMap[u.id] = u;
        }

        function titleCase(s: string) {
          if (!s) return s;
          return s.split(/\s+/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
        }

        function humanizeAction(r: any) {
          try {
            // Prefer explicit activity descriptions stored in after_json (from /api/activity)
            if (r.after_json) {
              try {
                const aj = JSON.parse(r.after_json);
                if (aj && (aj.description || aj.desc || aj.label)) return aj.description || aj.desc || aj.label;
              } catch (e) { /* ignore */ }
            }
            // Common literal actions
            if (r.action === 'login') return 'Logged in';
            if (r.action === 'logout') return 'Logged out';
            if (r.action === 'time_in') return 'Clocked in';
            if (r.action === 'time_out') return 'Clocked out';
            if (r.action === 'socket_connect') return 'Socket connected';
            if (r.action === 'socket_disconnect') return 'Socket disconnected';

            // Server-side recordAudit calls sometimes use verbs like 'create','update','delete'
            // with `table_name` populated; present these as human-friendly messages.
            if (r.action && ['create','update','delete','restore'].includes(r.action)) {
              const namestr = (r.table_name || '').toString().replace(/[_-]/g, ' ');
              let resource = namestr;
              if (resource.endsWith('s')) resource = resource.slice(0, -1);
              resource = titleCase(resource || r.table_name || 'record');
              const vmap: any = { create: 'Created', update: 'Updated', delete: 'Deleted', restore: 'Restored' };
              return `${vmap[r.action] || 'Changed'} ${resource}`;
            }

            // Parse HTTP-style actions like "POST /api/offboarding"
            const parts = (r.action || '').toString().split(/\s+/).filter(Boolean);
            if (parts.length >= 2 && parts[1].startsWith('/api')) {
              const method = parts[0];
              const path = parts[1];
              const segments = path.split('/').filter(Boolean); // ['api','resource', ...]
              const base = segments[1] || segments[0] || '';
              let verb = 'Performed';
              if (method === 'POST') verb = (auditInterestTables.includes(base) ? 'Submitted' : 'Created');
              else if (method === 'PUT' || method === 'PATCH') verb = 'Updated';
              else if (method === 'DELETE') verb = 'Deleted';
              else if (method === 'GET') verb = 'Viewed';
              if (path.includes('approve') || path.includes('review')) verb = 'Reviewed';
              if (path.includes('restore')) verb = 'Restored';
              let resource = base.replace(/[_-]/g, ' ');
              if (resource.endsWith('s')) resource = resource.slice(0, -1);
              resource = titleCase(resource || base);
              return `${verb} ${resource}`;
            }
            return r.action || '';
          } catch (e) { return r.action || ''; }
        }

        const out = mapped.map((r: any) => {
          const u = r.user_id ? userMap[r.user_id] : null;
          // derive a short description if available in after_json or meta_json
          let display_description: string | null = null;
          try {
            if (r.after_json) {
              const aj = JSON.parse(r.after_json);
              if (aj && (aj.description || aj.desc || aj.label)) display_description = aj.description || aj.desc || aj.label;
              else {
                const keys = ['full_name','employee_name','email','username','message','title','label'];
                const parts: string[] = [];
                for (const k of keys) if (aj[k]) parts.push(aj[k]);
                if (parts.length) display_description = parts.slice(0,3).join(' — ');
              }
            }
            if (!display_description && r.meta_json) {
              try {
                const mj = JSON.parse(r.meta_json);
                if (mj && mj.description) display_description = mj.description;
              } catch (e) { /* ignore */ }
            }
          } catch (e) { display_description = null; }

          return { ...r,
            username: (u && (u.full_name || u.username || u.email)) || r.username,
            user_role: u ? u.role : null,
            display_action: humanizeAction(r),
            display_description: display_description || null
          };
        });
        res.json(out);
        return;
      } catch (e) {
        console.error('audit logs enrich error:', e);
      }

      // Fallback
      res.json(mapped);
    } catch (err) {
      console.error('GET /api/audit_logs error:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // POST /api/activity — record a user activity or action (human-friendly)
  app.post('/api/activity', authenticateToken, async (req: any, res) => {
    try {
      const user = (req as any).user || null;
      const { action, description, entity, entity_id, meta } = req.body || {};
      const tableName = entity || 'activity';
      const after = description ? { description } : null;
      await recordAudit(user, action || 'activity', tableName, entity_id || null, null, after, meta || null);
      res.json({ success: true });
    } catch (err) {
      console.error('POST /api/activity error:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // ─── Socket.io Real-Time Chat ───
  const httpServer = createHttpServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    path: '/socket.io'
  });

  // Socket connection audit: log connect/disconnect events
  io.on('connection', async (socket) => {
    try {
      const hs: any = (socket.handshake || {});
      const metaBase = { source: 'socket', socketId: socket.id, auth: hs.auth || null, address: hs.address || null };
      // Try to resolve a user from the handshake (if client sent a token)
      let auditUser: any = null;
      try {
        const hsAuth = hs.auth || hs.query || {};
        const raw = hsAuth && (hsAuth.token || hsAuth.authorization || hsAuth.Authorization) ? (hsAuth.token || hsAuth.authorization || hsAuth.Authorization) : null;
        if (raw && typeof raw === 'string') {
          const token = raw.startsWith('Bearer ') ? raw.split(' ')[1] : raw;
          try { auditUser = await verifyTokenWithVersion(token); } catch (e) { /* ignore invalid token */ }
        }
      } catch (e) { /* ignore handshake parsing errors */ }

      const meta = { ...metaBase, user: auditUser ? { id: auditUser.id, username: auditUser.username || auditUser.email || null } : null };
      // Record connection (associate with user when available)
      recordAudit(auditUser, 'socket_connect', 'socket', null, null, null, meta).catch(() => {});
      // Also record an explicit time-in for authenticated users so audit logs
      // clearly show when a user became active (clock in / session start)
      if (auditUser) {
        try { recordAudit(auditUser, 'time_in', 'users', auditUser.id, null, null, meta).catch(() => {}); } catch (e) {}
      }
      socket.on('disconnect', (reason: any) => {
        const dmeta = { ...meta, reason };
        recordAudit(auditUser, 'socket_disconnect', 'socket', null, null, null, dmeta).catch(() => {});
        // Record time-out / clock out on disconnect when user context available
        if (auditUser) {
          try { recordAudit(auditUser, 'time_out', 'users', auditUser.id, null, null, dmeta).catch(() => {}); } catch (e) {}
        }
      });
    } catch (e) { console.error('socket audit error:', e); }
  });

  // ─── Goal Update Request API (creates actionable system message) ───
  app.post("/api/goal_update_request", authenticateToken, async (req: any, res) => {
    try {
      const { employee_id, goal_id, goal_title, proposed_status, proposed_progress, reason } = req.body;
      const user = req.user;
      const actionPayload = JSON.stringify({ goal_id, goal_title, proposed_status, proposed_progress, reason });
      const sysMessage = `📋 Goal Update Request: "${goal_title}" → ${proposed_status || ''}${proposed_progress !== undefined ? ` (${proposed_progress}%)` : ''}${reason ? ` — ${reason}` : ''}`;
      await query(
        "INSERT INTO coaching_chats (employee_id, sender_role, sender_name, message, status, action_type, action_payload, action_status) VALUES (?, 'System', 'System', ?, 'delivered', 'goal_update', ?, 'pending')",
        [employee_id, sysMessage, actionPayload]
      );
      // Notify manager
      const emp: any = await query("SELECT name, manager_id FROM employees WHERE id = ?", [employee_id]);
      const empRow = Array.isArray(emp) ? emp[0] : emp;
      if (empRow) {
        const mgrUsers: any = await query("SELECT id FROM users WHERE role = 'Manager'", []);
        for (const mu of (Array.isArray(mgrUsers) ? mgrUsers : [mgrUsers].filter(Boolean))) {
          await createNotification({ user_id: mu.id, type: 'info', message: `${empRow.name} requests goal update approval: "${goal_title}"`, source: 'goal_update' });
          io.to(`user_${mu.id}`).emit('notification', { type: 'info', message: `${empRow.name} requests goal update approval` });
        }
      }
      // Broadcast the system message
      const latest: any = await query("SELECT * FROM coaching_chats WHERE employee_id = ? ORDER BY id DESC LIMIT 1", [employee_id]);
      const latestMsg = Array.isArray(latest) ? latest[0] : latest;
      if (latestMsg) {
        io.to(`employee_${employee_id}`).emit('chat:message', latestMsg);
        io.to('role_Manager').emit('chat:message', latestMsg);
      }
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // Vite middleware for development
  // Role-based sidebar endpoints: map frontend sidebar navigation
  // to explicit server endpoints and return 404 for unknown pages.
  const sidebarRoutes: any = {
    admin: ['recruitmentboard','feedback360','onboarding','employee-directory','offboarding','user-accounts','audit-logs','db-viewer','settings'],
    manager: ['recruitmentboard','feedback360','okr-planner','coaching-journal','disciplinary-action','evaluation-portal','promotability','pip-manager','suggestion-review','settings'],
    employee: ['career-dashboard','feedback','idp','self-assessment','suggestion-form','coaching-chat','verification-of-review','settings']
  };

  // Exact two-segment routes: /:role/:page
  app.get('/:role/:page', (req, res, next) => {
    try {
      const role = (req.params.role || '').toString().toLowerCase();
      const page = (req.params.page || '').toString().toLowerCase();
      if (!['admin','manager','employee'].includes(role)) return next();
      const valid = sidebarRoutes[role] || [];
      if (!valid.includes(page)) return res.status(404).json({ error: 'Not Found' });
      // For valid role/page, serve SPA index in production; in development
      // fallthrough to Vite middleware so the client-side router can load correctly.
      if (process.env.NODE_ENV === 'production') {
        return res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
      }
      return next();
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // Fallback for deeper paths under a role, e.g. /admin/something/else
  app.get('/:role/*', (req, res, next) => {
    try {
      const role = (req.params.role || '').toString().toLowerCase();
      if (!['admin','manager','employee'].includes(role)) return next();
      const rest = (req.params[0] || '').toString().split('/').filter(Boolean);
      const page = (rest[0] || '').toLowerCase();
      const valid = sidebarRoutes[role] || [];
      if (!page || !valid.includes(page)) return res.status(404).json({ error: 'Not Found' });
      if (process.env.NODE_ENV === 'production') {
        return res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
      }
      return next();
    } catch (err) { return res.status(500).json({ error: 'Server error' }); }
  });

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

  // Presence map: socketId → { userId, role, username, employeeId }
  const onlineUsers = new Map<string, { userId: number; role: string; username: string; employeeId: number | null }>();
  // userId -> Set(socketId) for quick lookups when forcing disconnects
  const userSocketMap = new Map<number, Set<string>>();

  function broadcastPresence() {
    const users = Array.from(onlineUsers.values());
    io.emit('presence', users);
  }

  io.on('connection', async (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Auto-authenticate if client provided token during the initial socket handshake
    try {
      const hs: any = (socket.handshake || {});
      const hsAuth = hs.auth || hs.query || {};
      const hsToken = hsAuth && hsAuth.token ? hsAuth.token : null;
      if (hsToken) {
        try {
          const decoded: any = await verifyTokenWithVersion(hsToken);
          console.log(`Socket handshake auth OK: socket=${socket.id} user=${decoded.id} token_version=${decoded.token_version || 0}`);
          onlineUsers.set(socket.id, {
            userId: decoded.id,
            role: decoded.role,
            username: decoded.username,
            employeeId: decoded.employee_id || null
          });
          try { (socket as any).data = (socket as any).data || {}; (socket as any).data.userId = decoded.id; (socket as any).data.tokenVersion = decoded.token_version || 0; } catch (e) {}
          try {
            let set = userSocketMap.get(decoded.id);
            if (!set) { set = new Set<string>(); userSocketMap.set(decoded.id, set); }
            set.add(socket.id);
          } catch (e) { console.error('userSocketMap add error', e); }
          socket.join(`user_${decoded.id}`);
          if (decoded.employee_id) socket.join(`employee_${decoded.employee_id}`);
          socket.join(`role_${decoded.role}`);
          broadcastPresence();
          try { socket.emit('auth_ok', { userId: decoded.id, role: decoded.role }); } catch (e) {}
        } catch (err) {
          console.log(`Socket handshake auth failed: socket=${socket.id} error=${err && err.message ? err.message : err}`);
          try { socket.emit('auth_error', { message: 'Invalid token' }); } catch (e) {}
        }
      }
    } catch (e) { console.error('handshake auth processing error', e); }

    // Client sends { token } on connect to authenticate
    socket.on('auth', async (data: { token: string }) => {
      try {
        const decoded: any = await verifyTokenWithVersion(data.token);
        console.log(`Socket auth OK: socket=${socket.id} user=${decoded.id} token_version=${decoded.token_version || 0}`);
        onlineUsers.set(socket.id, {
          userId: decoded.id,
          role: decoded.role,
          username: decoded.username,
          employeeId: decoded.employee_id || null
        });
        // Attach user id to socket.data for fallback disconnects, then join user room
        try {
          (socket as any).data = (socket as any).data || {};
          (socket as any).data.userId = decoded.id;
          // store token_version on the socket so forced-logout can avoid disconnecting the freshly-authenticated session
          (socket as any).data.tokenVersion = decoded.token_version || 0;
        } catch (e) {}
        // Track socket id under the user's set for robust disconnects
        try {
          let set = userSocketMap.get(decoded.id);
          if (!set) { set = new Set<string>(); userSocketMap.set(decoded.id, set); }
          set.add(socket.id);
        } catch (e) { console.error('userSocketMap add error', e); }
        // Join a room for their own userId for targeted messages
        socket.join(`user_${decoded.id}`);
        if (decoded.employee_id) socket.join(`employee_${decoded.employee_id}`);
        socket.join(`role_${decoded.role}`);
        broadcastPresence();
        socket.emit('auth_ok', { userId: decoded.id, role: decoded.role });
      } catch (err) {
        console.log(`Socket auth failed: socket=${socket.id} error=${err && err.message ? err.message : err}`);
        socket.emit('auth_error', { message: 'Invalid token' });
      }
    });

    // Send a chat message
    socket.on('chat:send', async (data: { employee_id: number; sender_role: string; sender_name: string; message: string; reply_to?: number }) => {
      try {
        const result: any = await query(
          "INSERT INTO coaching_chats (employee_id, sender_role, sender_name, message, status, reply_to) VALUES (?, ?, ?, ?, 'delivered', ?) RETURNING id",
          [data.employee_id, data.sender_role, data.sender_name, data.message, data.reply_to || null]
        );
        const insertId = result.insertId || result[0]?.id;
        const rows: any = await query("SELECT * FROM coaching_chats WHERE id = ?", [insertId]);
        const newMsg = Array.isArray(rows) ? rows[0] : rows;
        if (!newMsg) {
          // Fallback construct
          const fallback = { id: insertId, ...data, status: 'delivered', reply_to: data.reply_to || null, action_type: null, action_payload: null, action_status: null, created_at: new Date().toISOString() };
          io.to(`employee_${data.employee_id}`).emit('chat:message', fallback);
          io.to('role_Manager').emit('chat:message', fallback);
          return;
        }
        // Broadcast to relevant rooms
        io.to(`employee_${data.employee_id}`).emit('chat:message', newMsg);
        io.to('role_Manager').emit('chat:message', newMsg);

        // Also create DB notification for the other party 
        if (data.sender_role === 'Employee') {
          const emp: any = await query("SELECT name, manager_id FROM employees WHERE id = ?", [data.employee_id]);
          const empRow = Array.isArray(emp) ? emp[0] : emp;
          if (empRow) {
            const mgrUsers: any = await query("SELECT id FROM users WHERE employee_id = ? AND role = 'Manager'", [empRow.manager_id]);
            const mgrUser = Array.isArray(mgrUsers) ? mgrUsers[0] : mgrUsers;
            if (mgrUser) {
              await createNotification({ user_id: mgrUser.id, type: 'info', message: `New chat from ${data.sender_name || empRow.name}`, source: 'coaching_chat' });
              io.to(`user_${mgrUser.id}`).emit('notification', { type: 'info', message: `New chat from ${data.sender_name || empRow.name}`, source: 'coaching_chat', employee_id: data.employee_id });
            }
          }
        } else {
          const empUsers: any = await query("SELECT id FROM users WHERE employee_id = ?", [data.employee_id]);
          const empUser = Array.isArray(empUsers) ? empUsers[0] : empUsers;
          if (empUser) {
            await createNotification({ user_id: empUser.id, type: 'info', message: `New chat from ${data.sender_name || 'your Manager'}`, source: 'coaching_chat' });
            io.to(`user_${empUser.id}`).emit('notification', { type: 'info', message: `New chat from ${data.sender_name || 'your Manager'}`, source: 'coaching_chat', employee_id: data.employee_id });
          }
        }
      } catch (err) { console.error('Socket chat:send error:', err); }
    });

    // Mark messages as read
    socket.on('chat:read', async (data: { employee_id: number; reader_role: string }) => {
      try {
        const otherRole = data.reader_role === 'Employee' ? 'Manager' : 'Employee';
        await query("UPDATE coaching_chats SET status = 'read' WHERE employee_id = ? AND sender_role = ? AND status != 'read'", [data.employee_id, otherRole]);
        io.to(`employee_${data.employee_id}`).emit('chat:read_ack', { employee_id: data.employee_id, reader_role: data.reader_role });
        io.to('role_Manager').emit('chat:read_ack', { employee_id: data.employee_id, reader_role: data.reader_role });
      } catch (err) { console.error('Socket chat:read error:', err); }
    });

    // Typing indicator
    socket.on('chat:typing', (data: { employee_id: number; sender_role: string; sender_name: string }) => {
      io.to(`employee_${data.employee_id}`).emit('chat:typing', data);
      io.to('role_Manager').emit('chat:typing', data);
    });
    socket.on('chat:stop_typing', (data: { employee_id: number; sender_role: string }) => {
      io.to(`employee_${data.employee_id}`).emit('chat:stop_typing', data);
      io.to('role_Manager').emit('chat:stop_typing', data);
    });

    // Goal update approval action (from system message)
    socket.on('chat:action', async (data: { message_id: number; action: 'approved' | 'rejected' }) => {
      try {
        await query("UPDATE coaching_chats SET action_status = ? WHERE id = ?", [data.action, data.message_id]);
        // If approved, apply the goal update
        const msgs: any = await query("SELECT * FROM coaching_chats WHERE id = ?", [data.message_id]);
        const msg = Array.isArray(msgs) ? msgs[0] : msgs;
        if (msg && msg.action_type === 'goal_update' && msg.action_payload) {
          const payload = JSON.parse(msg.action_payload);
          if (data.action === 'approved') {
            const sets: string[] = [];
            const vals: any[] = [];
            if (payload.status) { sets.push('status = ?'); vals.push(payload.status); }
            if (payload.progress !== undefined) { sets.push('progress = ?'); vals.push(payload.progress); }
            if (sets.length > 0) {
              vals.push(payload.goal_id);
              await query(`UPDATE goals SET ${sets.join(', ')} WHERE id = ?`, vals);
            }
          }
          // Notify the employee
          const empUsers: any = await query("SELECT id FROM users WHERE employee_id = ?", [msg.employee_id]);
          const empUser = Array.isArray(empUsers) ? empUsers[0] : empUsers;
          if (empUser) {
            const statusText = data.action === 'approved' ? 'approved' : 'rejected';
            await createNotification({ user_id: empUser.id, type: data.action === 'approved' ? 'success' : 'error', message: `Your goal update was ${statusText} by your manager`, source: 'goal_action' });
            io.to(`user_${empUser.id}`).emit('notification', { type: data.action === 'approved' ? 'success' : 'error', message: `Your goal update was ${statusText} by your manager` });
          }
        }
        // Broadcast updated message
        const updated: any = await query("SELECT * FROM coaching_chats WHERE id = ?", [data.message_id]);
        const updMsg = Array.isArray(updated) ? updated[0] : updated;
        if (updMsg) {
          io.to(`employee_${updMsg.employee_id}`).emit('chat:action_update', updMsg);
          io.to('role_Manager').emit('chat:action_update', updMsg);
        }
      } catch (err) { console.error('Socket chat:action error:', err); }
    });

    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: socket=${socket.id} reason=${reason}`);
      // remove from presence map
      const meta = onlineUsers.get(socket.id);
      onlineUsers.delete(socket.id);
      // remove from userSocketMap if present
      try {
        if (meta && meta.userId) {
          const set = userSocketMap.get(meta.userId);
          if (set) {
            set.delete(socket.id);
            if (set.size === 0) userSocketMap.delete(meta.userId);
          }
        }
      } catch (e) { console.error('userSocketMap remove error', e); }
      broadcastPresence();
    });
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
