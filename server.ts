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
import { createLinkedAccounts } from './scripts/add_linked_accounts';

dotenv.config();

const dbConnectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.PGURL;
const dbHost = process.env.DB_HOST || process.env.POSTGRES_HOST || process.env.PGHOST;
const dbPort = parseInt(process.env.DB_PORT || process.env.POSTGRES_PORT || process.env.PGPORT || '5432', 10);
const dbUser = process.env.DB_USER || process.env.POSTGRES_USER || process.env.PGUSER;
const dbPassword = process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD;
const dbName = process.env.DB_NAME || process.env.POSTGRES_DB || process.env.PGDATABASE;

// Enforce PostgreSQL usage only. Accept common env var names used by deployment providers.
if (!dbConnectionString && (!dbHost || !dbUser || !dbName)) {
  console.error('PostgreSQL configuration missing. Set DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME (POSTGRES_* and PG* are also supported).');
  process.exit(1);
}

let usePostgres = true;
let pgPool: pg.Pool | null = null;
let sqliteDb: any = null; // kept declared for compatibility with legacy code paths (unused)

try {
  pgPool = dbConnectionString
    ? new pg.Pool({
        connectionString: dbConnectionString,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      })
    : new pg.Pool({
        host: dbHost,
        port: Number.isFinite(dbPort) ? dbPort : 5432,
        user: dbUser,
        password: dbPassword,
        database: dbName,
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

function assertSafeTableName(tableName: string) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(tableName)) {
    throw new Error(`Unsafe table name: ${tableName}`);
  }
}

async function softDeleteById(tableName: string, id: any) {
  assertSafeTableName(tableName);
  return query(`UPDATE ${tableName} SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
}

async function softDeleteWhere(tableName: string, whereClause: string, params: any[] = []) {
  assertSafeTableName(tableName);
  return query(`UPDATE ${tableName} SET deleted_at = CURRENT_TIMESTAMP WHERE ${whereClause}`, params);
}

const TASK_PROGRESS_SUBMITTED = 25;
const TASK_PROGRESS_REVIEW_APPROVED = 100;
const GOAL_PROGRESS_MAX_BEFORE_MANAGER_APPROVAL = 75;

function normalizeProgressValue(value: any) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function isGoalMarkedCompleted(status: any) {
  return String(status || '').trim().toLowerCase() === 'completed';
}

function computeGoalProgressFromTaskAverage(avgProgress: any, goalStatus: any) {
  const normalizedAverage = normalizeProgressValue(avgProgress);
  if (isGoalMarkedCompleted(goalStatus)) return 100;
  return Math.min(GOAL_PROGRESS_MAX_BEFORE_MANAGER_APPROVAL, normalizedAverage);
}

function normalizeGoalStatusFromProgress(currentStatus: any, progressValue: any) {
  const status = String(currentStatus || '').trim();
  const normalized = status.toLowerCase();
  if (normalized === 'completed' || normalized === 'cancelled' || normalized === 'at risk') return status || currentStatus;
  const progress = normalizeProgressValue(progressValue);
  if (progress >= 100) return 'Completed';
  if (progress > 0) return 'In Progress';
  return 'Not Started';
}

function parseJsonArray(value: any) {
  const raw = String(value || '').trim();
  if (!raw || !raw.startsWith('[')) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeProofFilesPayload(value: any) {
  return parseJsonArray(value)
    .map((item: any) => ({
      proof_file_data: String(item?.proof_file_data || item?.data || '').trim(),
      proof_file_name: String(item?.proof_file_name || item?.name || '').trim(),
      proof_file_type: String(item?.proof_file_type || item?.type || '').trim() || 'application/octet-stream',
    }))
    .filter((item: any) => !!item.proof_file_data);
}

function ordinalLabel(value: number) {
  const n = Math.max(1, Math.trunc(Number(value) || 0));
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function normalizeProofReviewRating(value: any): number | null {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(5, Math.round(n)));
}

function normalizeDateOnly(value: any): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

async function recomputeGoalProgress(goalId: number) {
  const rows: any = await query(
    `SELECT g.status AS goal_status,
            g.proof_review_status AS goal_proof_review_status,
            g.proof_review_rating AS goal_proof_review_rating,
            g.proof_reviewed_by AS goal_proof_reviewed_by,
            ug.role AS goal_proof_reviewer_role,
            COALESCE(TRIM(g.proof_image), '') AS goal_proof_image,
            COALESCE(ROUND(AVG(COALESCE(t.progress, 0))), 0) AS avg_progress,
            SUM(
              CASE
                WHEN COALESCE(TRIM(t.proof_image), '') <> '' THEN 1
                ELSE 0
              END
            ) AS submitted_tasks,
            SUM(
              CASE
                WHEN COALESCE(t.proof_review_status, 'Not Submitted') = 'Approved'
                 AND COALESCE(TRIM(t.proof_image), '') <> ''
                 AND t.proof_reviewed_by IS NOT NULL
                 AND COALESCE(t.proof_review_rating, 0) BETWEEN 1 AND 5
                 AND LOWER(TRIM(COALESCE(ut.role, ''))) = 'manager'
                THEN 1
                ELSE 0
              END
            ) AS approved_tasks
     FROM goals g
     LEFT JOIN users ug ON ug.id = g.proof_reviewed_by
     LEFT JOIN goal_member_tasks t
       ON t.goal_id = g.id
      AND t.deleted_at IS NULL
     LEFT JOIN users ut ON ut.id = t.proof_reviewed_by
     WHERE g.id = ?
     GROUP BY g.id, g.status, g.proof_review_status, g.proof_review_rating, g.proof_reviewed_by, ug.role, g.proof_image`,
    [goalId]
  );
  const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  const submittedTasks = Number(row?.submitted_tasks || 0);
  const approvedTasks = Number(row?.approved_tasks || 0);
  const leaderProofApproved =
    String(row?.goal_proof_review_status || '').trim() === 'Approved'
    && String(row?.goal_proof_image || '').trim().length > 0
    && Number(row?.goal_proof_reviewed_by || 0) > 0
    && String(row?.goal_proof_reviewer_role || '').trim().toLowerCase() === 'manager'
    && Number(row?.goal_proof_review_rating || 0) >= 1
    && Number(row?.goal_proof_review_rating || 0) <= 5;
  const allMemberProofsApproved = submittedTasks === 0 ? true : approvedTasks >= submittedTasks;
  const allProofsApproved = leaderProofApproved && allMemberProofsApproved;

  const statusForComputation = allProofsApproved
    ? row?.goal_status
    : (isGoalMarkedCompleted(row?.goal_status) ? 'In Progress' : row?.goal_status);
  const nextProgress = allProofsApproved
    ? 100
    : computeGoalProgressFromTaskAverage(row?.avg_progress || 0, statusForComputation);
  const nextStatus = allProofsApproved
    ? 'Completed'
    : normalizeGoalStatusFromProgress(statusForComputation, nextProgress);

  try {
    await query('UPDATE goals SET progress = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [nextProgress, nextStatus, goalId]);
  } catch (goalUpdateErr: any) {
    const msg = String(goalUpdateErr?.message || '').toLowerCase();
    const missingUpdatedAt = String(goalUpdateErr?.code || '') === '42703' || msg.includes('updated_at') || msg.includes('no such column');
    if (!missingUpdatedAt) throw goalUpdateErr;
    await query('UPDATE goals SET progress = ?, status = ? WHERE id = ?', [nextProgress, nextStatus, goalId]);
  }

  return nextProgress;
}

function usernameBaseFromInput(input: string) {
  const normalized = (input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.|\.$/g, '');
  return normalized || 'user';
}

async function generateUniqueUsername(requested: string) {
  const base = usernameBaseFromInput(requested).slice(0, 50) || 'user';
  let candidate = base;
  let suffix = 1;
  while (true) {
    const existing = await query('SELECT id FROM users WHERE username = ? LIMIT 1', [candidate]) as any[];
    if (!Array.isArray(existing) || existing.length === 0) return candidate;
    suffix += 1;
    candidate = `${base}.${suffix}`;
  }
}

function escapeRegExp(value: string) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ALLOWED_ACCOUNT_EMAIL_DOMAIN = 'maptech.com';

function isAllowedAccountEmailDomain(email: string) {
  const normalized = String(email || '').trim().toLowerCase();
  return normalized.endsWith(`@${ALLOWED_ACCOUNT_EMAIL_DOMAIN}`);
}

function getPasswordPolicyError(password: any): string | null {
  if (typeof password !== 'string') return 'Password must be a valid string';
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (password.length > 128) return 'Password must be 128 characters or less';
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain a number';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain a special character';
  return null;
}

function parseDisplayNameFromEmail(value: any) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  const localPart = raw.includes('@') ? raw.split('@')[0] : raw;
  return localPart
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c: string) => c.toUpperCase())
    .trim();
}

// Normalize user-entered full names so UI labels stay readable even with legacy encoding artifacts.
function sanitizeUserFullName(rawFullName: any, email?: string | null) {
  let name = String(rawFullName || '')
    .replace(/\u00e2\u20ac[\u2013\u2014]/g, '-')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  if (!name) return '';

  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (normalizedEmail) {
    const trailingProvidedEmail = new RegExp(`\\s*(?:-|\\||\\u00b7)\\s*${escapeRegExp(normalizedEmail)}\\s*$`, 'i');
    name = name.replace(trailingProvidedEmail, '').trim();
  }

  const embeddedEmail = name.match(/^(.+?)\s*(?:-|\||\u00b7)\s*([^\s@]+@[^\s@]+\.[^\s@]+)\s*$/i);
  if (embeddedEmail?.[1]) {
    name = embeddedEmail[1].trim();
  }

  return name;
}

function sanitizeDisplayText(rawValue: any) {
  const text = String(rawValue || '').trim();
  if (!text) return '';

  return text
    // Mojibake for em/en dash (e.g., "â€”", "â€“")
    .replace(/\u00e2\u20ac[\u201c\u201d]/g, '-')
    // Mojibake for right arrow (e.g., "â†’")
    .replace(/\u00e2\u2020\u2019/g, '->')
    // Mojibake for clipboard emoji (e.g., "ðŸ“‹")
    .replace(/\u00f0\u0178\u201c\u2039/g, '[Goal]')
    .replace(/\s+/g, ' ')
    .trim();
}

async function resolveEmployeeIdByFullName(fullName: string): Promise<number | null> {
  const candidate = String(fullName || '').trim();
  if (!candidate) return null;

  // First pass: exact match with whitespace normalization only.
  const strictRows = await query(
    `SELECT id
     FROM employees
     WHERE REGEXP_REPLACE(LOWER(TRIM(name)), '\\s+', ' ', 'g') = REGEXP_REPLACE(LOWER(TRIM(?)), '\\s+', ' ', 'g')
     ORDER BY id DESC
     LIMIT 1`,
    [candidate]
  ) as any[];
  const strictMatch = Array.isArray(strictRows) ? strictRows[0] : strictRows;
  if (strictMatch?.id) return Number(strictMatch.id);

  // Second pass: ignore punctuation/spaces (e.g., middle initials, dots, dashes).
  const looseRows = await query(
    `SELECT id
     FROM employees
     WHERE REGEXP_REPLACE(LOWER(COALESCE(name, '')), '[^a-z0-9]', '', 'g') = REGEXP_REPLACE(LOWER(COALESCE(?, '')), '[^a-z0-9]', '', 'g')
     ORDER BY id DESC
     LIMIT 1`,
    [candidate]
  ) as any[];
  const looseMatch = Array.isArray(looseRows) ? looseRows[0] : looseRows;
  if (looseMatch?.id) return Number(looseMatch.id);

  return null;
}

async function ensureEmployeeIdByFullName(fullName: string): Promise<number | null> {
  const candidate = String(fullName || '').trim();
  if (!candidate) return null;

  const hiredStatusCheck = "UPPER(COALESCE(status, '')) IN ('PROBATIONARY', 'REGULAR', 'PERMANENT', 'HIRED')";

  const strictRows = await query(
    `SELECT id
     FROM employees
     WHERE ${hiredStatusCheck}
       AND REGEXP_REPLACE(LOWER(TRIM(name)), '\\s+', ' ', 'g') = REGEXP_REPLACE(LOWER(TRIM(?)), '\\s+', ' ', 'g')
     ORDER BY id DESC
     LIMIT 1`,
    [candidate]
  ) as any[];
  const strictMatch = Array.isArray(strictRows) ? strictRows[0] : strictRows;
  if (strictMatch?.id) return Number(strictMatch.id);

  const looseRows = await query(
    `SELECT id
     FROM employees
     WHERE ${hiredStatusCheck}
       AND REGEXP_REPLACE(LOWER(COALESCE(name, '')), '[^a-z0-9]', '', 'g') = REGEXP_REPLACE(LOWER(COALESCE(?, '')), '[^a-z0-9]', '', 'g')
     ORDER BY id DESC
     LIMIT 1`,
    [candidate]
  ) as any[];
  const looseMatch = Array.isArray(looseRows) ? looseRows[0] : looseRows;
  if (looseMatch?.id) return Number(looseMatch.id);

  return null;
}

async function resolveUserIdByFullName(fullName: string): Promise<number | null> {
  const candidate = String(fullName || '').trim();
  if (!candidate) return null;

  // Try direct match on users.full_name
  const uRows: any = await query(
    `SELECT id FROM users WHERE REGEXP_REPLACE(LOWER(TRIM(COALESCE(full_name, ''))), '\\s+', ' ', 'g') = REGEXP_REPLACE(LOWER(TRIM(?)), '\\s+', ' ', 'g') LIMIT 1`,
    [candidate]
  );
  const uMatch = Array.isArray(uRows) ? uRows[0] : uRows;
  if (uMatch?.id) return Number(uMatch.id);

  // Fallback: try to resolve an employee by name and find a linked user
  const empId = await resolveEmployeeIdByFullName(candidate);
  if (empId) {
    const ux: any = await query('SELECT id FROM users WHERE employee_id = ? LIMIT 1', [empId]);
    const um = Array.isArray(ux) ? ux[0] : ux;
    if (um?.id) return Number(um.id);
  }

  return null;
}

// Simple audit recorder: stores who did what and snapshots of before/after plus metadata
async function recordAudit(user: any, action: string, tableName: string, rowId: any = null, before: any = null, after: any = null, meta: any = null) {
  try {
    const user_id = user && (user.id || user.employee_id) ? (user.id || user.employee_id) : null;
    const username = user && (user.email || user.username || user.full_name) ? (user.email || user.username || user.full_name) : null;
    const user_role = user && user.role ? user.role : null;
    const user_department = user && user.dept ? user.dept : null;
    const source = meta && meta.source ? meta.source : null;
    const ip = meta && meta.ip ? meta.ip : null;
    const user_agent = meta && meta.user_agent ? meta.user_agent : null;
    const route = meta && meta.route ? meta.route : null;
    const method = meta && meta.method ? meta.method : null;
    const meta_json = meta ? JSON.stringify(meta) : null;

    try {
      await query(
        'INSERT INTO audit_logs (user_id, username, user_role, user_department, action, table_name, row_id, before_json, after_json, source, ip, user_agent, route, method, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [user_id, username, user_role, user_department, action, tableName, rowId, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, source, ip, user_agent, route, method, meta_json]
      );
    } catch (insertErr: any) {
      // Backward-compatible fallback for databases where audit_logs schema
      // has not yet been migrated with user_role/user_department columns.
      const code = insertErr?.code ? String(insertErr.code) : '';
      const msg = (insertErr?.message || '').toString().toLowerCase();
      const missingRoleCols =
        code === '42703' ||
        msg.includes('user_role') ||
        msg.includes('user_department') ||
        msg.includes('no such column');

      if (!missingRoleCols) throw insertErr;

      try {
        await query(
          'INSERT INTO audit_logs (user_id, username, action, table_name, row_id, before_json, after_json, source, ip, user_agent, route, method, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [user_id, username, action, tableName, rowId, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, source, ip, user_agent, route, method, meta_json]
        );
      } catch (legacyErr: any) {
        const legacyCode = legacyErr?.code ? String(legacyErr.code) : '';
        const legacyMsg = (legacyErr?.message || '').toString().toLowerCase();
        const missingMetaCols =
          legacyCode === '42703' ||
          legacyMsg.includes('source') ||
          legacyMsg.includes('user_agent') ||
          legacyMsg.includes('meta_json') ||
          legacyMsg.includes('no such column');

        if (!missingMetaCols) throw legacyErr;

        // Oldest schema compatibility: only core audit columns.
        await query(
          'INSERT INTO audit_logs (user_id, username, action, table_name, row_id, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [user_id, username, action, tableName, rowId, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null]
        );
      }
    }
  } catch (err) {
    console.error('recordAudit error:', err);
  }
}

// Tables/resources that are considered important enough to auto-audit when mutated.
// Use this list to avoid logging every incidental HTTP request and reduce noise.
const auditInterestTables = [
  'employees','goals','coaching_logs','coaching_chats','appraisals','discipline_records','property_accountability',
  'users','suggestions','feedback_360','applicants','requisitions','offboarding','exit_interviews','development_plans',
  'self_assessments','onboarding','notifications','elearning_courses','elearning_recommendations','pip_plans',
  'promotion_recommendations','promotions','goal_member_tasks','goal_improvement_plans','goal_development_plans'
];

const softDeleteTables = [
  'users',
  'employees',
  'payroll_adjustments',
  'goals',
  'goal_member_tasks',
  'coaching_logs',
  'coaching_chats',
  'elearning_courses',
  'appraisals',
  'discipline_records',
  'property_accountability',
  'suggestions',
  'feedback_360',
  'applicants',
  'requisitions',
  'offboarding',
  'exit_interviews',
  'development_plans',
  'goal_improvement_plans',
  'goal_development_plans',
  'self_assessments',
  'pip_plans',
  'promotion_recommendations',
  'promotions',
  'career_paths',
  'onboarding',
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
    `CREATE TABLE IF NOT EXISTS departments (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP NULL
    )`,
    `CREATE TABLE IF NOT EXISTS goals (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      employee_id INTEGER,
      statement TEXT,
      metric TEXT,
      target_date TEXT,
      proof_image TEXT,
      proof_file_name TEXT,
      proof_file_type TEXT,
      proof_note TEXT,
      proof_submitted_at TEXT,
      proof_review_status TEXT DEFAULT 'Not Submitted',
      proof_review_note TEXT,
      proof_review_file_data TEXT,
      proof_review_file_name TEXT,
      proof_review_file_type TEXT,
      proof_review_rating INTEGER,
      proof_reviewed_by INTEGER,
      proof_reviewed_role TEXT,
      proof_reviewed_at TEXT,
      proof_revision_history TEXT DEFAULT '[]',
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    )`,
    `CREATE TABLE IF NOT EXISTS goal_assignees (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      goal_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      UNIQUE(goal_id, employee_id)
    )`,
    `CREATE TABLE IF NOT EXISTS team_leaders (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      leader_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      UNIQUE(leader_id, member_id)
    )`,
    `CREATE TABLE IF NOT EXISTS goal_member_tasks (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      goal_id INTEGER NOT NULL,
      member_employee_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      due_date TEXT,
      priority TEXT DEFAULT 'Medium',
      status TEXT DEFAULT 'Not Started',
      progress INTEGER DEFAULT 0,
      brief_file_data TEXT,
      brief_file_name TEXT,
      brief_file_type TEXT,
      proof_image TEXT,
      proof_file_name TEXT,
      proof_file_type TEXT,
      proof_note TEXT,
      proof_submitted_at TEXT,
      proof_review_status TEXT DEFAULT 'Not Submitted',
      proof_review_note TEXT,
      proof_review_file_data TEXT,
      proof_review_file_name TEXT,
      proof_review_file_type TEXT,
      proof_review_rating INTEGER,
      proof_reviewed_by INTEGER,
      proof_reviewed_role TEXT,
      proof_reviewed_at TEXT,
      proof_revision_history TEXT DEFAULT '[]',
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(goal_id) REFERENCES goals(id),
      FOREIGN KEY(member_employee_id) REFERENCES employees(id)
    )`,
    `CREATE TABLE IF NOT EXISTS deadline_extension_requests (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      entity_type TEXT NOT NULL,
      goal_id INTEGER,
      task_id INTEGER,
      requester_user_id INTEGER NOT NULL,
      requester_employee_id INTEGER,
      requester_role TEXT,
      next_approver_role TEXT NOT NULL,
      approver_user_id INTEGER,
      status TEXT DEFAULT 'Pending',
      current_due_date TEXT,
      requested_due_date TEXT NOT NULL,
      reason TEXT,
      decision_note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT,
      FOREIGN KEY(goal_id) REFERENCES goals(id),
      FOREIGN KEY(task_id) REFERENCES goal_member_tasks(id)
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
      preparer_user_id INTEGER,
      supervisor_user_id INTEGER,
      is_acknowledged INTEGER DEFAULT 0,
      is_viewed INTEGER DEFAULT 0,
      is_archived INTEGER DEFAULT 0,
      acknowledged_at TEXT,
      viewed_at TEXT,
      archived_at TEXT,
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
      phone TEXT,
      address TEXT,
      position TEXT,
      dept TEXT,
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      linked_user_id INTEGER,
      FOREIGN KEY(employee_id) REFERENCES employees(id),
      FOREIGN KEY(created_by) REFERENCES users(id)
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
      goal_id INTEGER,
      skill_gap TEXT,
      growth_step TEXT,
      step_order INTEGER DEFAULT 0,
      status TEXT DEFAULT 'Not Started',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    )`,
    `CREATE TABLE IF NOT EXISTS goal_improvement_plans (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      goal_id INTEGER NOT NULL,
      goal_scope TEXT NOT NULL,
      plan_title TEXT,
      issue_summary TEXT,
      improvement_objective TEXT,
      action_steps TEXT,
      review_date TEXT,
      status TEXT DEFAULT 'Not Started',
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(goal_id) REFERENCES goals(id)
    )`,
    `CREATE TABLE IF NOT EXISTS goal_development_plans (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      goal_id INTEGER NOT NULL,
      goal_scope TEXT NOT NULL,
      plan_title TEXT,
      skill_focus TEXT,
      development_actions TEXT,
      review_date TEXT,
      status TEXT DEFAULT 'Not Started',
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(goal_id) REFERENCES goals(id)
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
      user_role TEXT,
      user_department TEXT,
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

    // Safe migrations â€” ignored if column already exists
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
      'ALTER TABLE discipline_records ADD COLUMN is_acknowledged INTEGER DEFAULT 0',
      'ALTER TABLE discipline_records ADD COLUMN is_viewed INTEGER DEFAULT 0',
      'ALTER TABLE discipline_records ADD COLUMN is_archived INTEGER DEFAULT 0',
      'ALTER TABLE discipline_records ADD COLUMN acknowledged_at TEXT',
      'ALTER TABLE discipline_records ADD COLUMN viewed_at TEXT',
      'ALTER TABLE discipline_records ADD COLUMN archived_at TEXT',
      'ALTER TABLE discipline_records ADD COLUMN preparer_user_id INTEGER',
      'ALTER TABLE discipline_records ADD COLUMN supervisor_user_id INTEGER',
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

    // Ensure departments have a description column for richer UI details
    try {
      if (usePostgres && pgPool) {
        const c = await pgPool.connect();
        try { await c.query("ALTER TABLE departments ADD COLUMN description TEXT"); } catch {} finally { c.release(); }
      } else {
        try { sqliteDb.exec('ALTER TABLE departments ADD COLUMN description TEXT'); } catch {}
      }
    } catch {}

    // Ensure departments have deleted_at column (backwards-compat safe)
    try {
      if (usePostgres && pgPool) {
        const cdel = await pgPool.connect();
        try { await cdel.query("ALTER TABLE departments ADD COLUMN deleted_at TIMESTAMP NULL"); } catch {} finally { cdel.release(); }
      } else {
        try { sqliteDb.exec('ALTER TABLE departments ADD COLUMN deleted_at TIMESTAMP NULL'); } catch {}
      }
    } catch {}

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

    // Safe migrations for appraisals â€” add all missing evaluation fields
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
      'ALTER TABLE appraisals ADD COLUMN employee_print_name TEXT',
      'ALTER TABLE appraisals ADD COLUMN supervisor_user_id INTEGER',
      'ALTER TABLE appraisals ADD COLUMN reviewer_user_id INTEGER',
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

    // Safe migrations for notifications (per-user targeting + unread/audit fields)
    const notificationMigrations = [
      'ALTER TABLE notifications ADD COLUMN employee_id INTEGER',
      'ALTER TABLE notifications ADD COLUMN read_at TIMESTAMP',
    ];
    for (const sql of notificationMigrations) {
      try {
        if (usePostgres && pgPool) {
          const c = await pgPool.connect();
          try { await c.query(sql); } catch {} finally { c.release(); }
        } else { sqliteDb.exec(sql); }
      } catch {}
    }

    const notificationIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications (user_id, read)',
    ];
    for (const sql of notificationIndexes) {
      try {
        if (usePostgres && pgPool) {
          const c = await pgPool.connect();
          try { await c.query(sql); } catch {} finally { c.release(); }
        } else { sqliteDb.exec(sql); }
      } catch {}
    }

    // Legacy cleanup: remove unused table if it exists.
    try {
      if (usePostgres && pgPool) {
        const c = await pgPool.connect();
        try { await c.query('DROP TABLE IF EXISTS user_notifications'); } catch {} finally { c.release(); }
      } else {
        try { sqliteDb.exec('DROP TABLE IF EXISTS user_notifications'); } catch {}
      }
    } catch {}

    // Safe migrations for goals â€” add status, progress, scope, department, team, delegation, priority
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
      'ALTER TABLE goals ADD COLUMN frequency TEXT DEFAULT \'One-time\'',
      'ALTER TABLE goals ADD COLUMN leader_id INTEGER',
      'ALTER TABLE goals ADD COLUMN proof_image TEXT',
      'ALTER TABLE goals ADD COLUMN proof_file_name TEXT',
      'ALTER TABLE goals ADD COLUMN proof_file_type TEXT',
      'ALTER TABLE goals ADD COLUMN proof_note TEXT',
      'ALTER TABLE goals ADD COLUMN proof_submitted_at TEXT',
      'ALTER TABLE goals ADD COLUMN proof_review_status TEXT DEFAULT \'Not Submitted\'',
      'ALTER TABLE goals ADD COLUMN proof_review_note TEXT',
      'ALTER TABLE goals ADD COLUMN proof_review_file_data TEXT',
      'ALTER TABLE goals ADD COLUMN proof_review_file_name TEXT',
      'ALTER TABLE goals ADD COLUMN proof_review_file_type TEXT',
      'ALTER TABLE goals ADD COLUMN proof_review_rating INTEGER',
      'ALTER TABLE goals ADD COLUMN proof_reviewed_by INTEGER',
      'ALTER TABLE goals ADD COLUMN proof_reviewed_role TEXT',
      'ALTER TABLE goals ADD COLUMN proof_reviewed_at TEXT',
      'ALTER TABLE goals ADD COLUMN proof_revision_history TEXT DEFAULT \'[]\'',
      'ALTER TABLE goal_assignees ADD COLUMN assigned_by INTEGER',
      'ALTER TABLE goal_assignees ADD COLUMN assigned_by_role TEXT',
      'ALTER TABLE goal_assignees ADD COLUMN assigned_at TEXT',
    ];
    for (const sql of goalMigrations) {
      try {
        if (usePostgres && pgPool) {
          const c = await pgPool.connect();
          try { await c.query(sql); } catch {} finally { c.release(); }
        } else { sqliteDb.exec(sql); }
      } catch {}
    }

    const goalTaskMigrations = [
      'ALTER TABLE goal_member_tasks ADD COLUMN description TEXT',
      'ALTER TABLE goal_member_tasks ADD COLUMN due_date TEXT',
      'ALTER TABLE goal_member_tasks ADD COLUMN priority TEXT DEFAULT \'Medium\'',
      'ALTER TABLE goal_member_tasks ADD COLUMN status TEXT DEFAULT \'Not Started\'',
      'ALTER TABLE goal_member_tasks ADD COLUMN progress INTEGER DEFAULT 0',
      'ALTER TABLE goal_member_tasks ADD COLUMN brief_file_data TEXT',
      'ALTER TABLE goal_member_tasks ADD COLUMN brief_file_name TEXT',
      'ALTER TABLE goal_member_tasks ADD COLUMN brief_file_type TEXT',
      'ALTER TABLE goal_member_tasks ADD COLUMN proof_image TEXT',
      'ALTER TABLE goal_member_tasks ADD COLUMN proof_file_name TEXT',
      'ALTER TABLE goal_member_tasks ADD COLUMN proof_file_type TEXT',
      'ALTER TABLE goal_member_tasks ADD COLUMN proof_note TEXT',
      'ALTER TABLE goal_member_tasks ADD COLUMN proof_submitted_at TEXT',
      'ALTER TABLE goal_member_tasks ADD COLUMN proof_review_status TEXT DEFAULT \'Not Submitted\'',
      'ALTER TABLE goal_member_tasks ADD COLUMN proof_review_note TEXT',
      'ALTER TABLE goal_member_tasks ADD COLUMN proof_review_file_data TEXT',
      'ALTER TABLE goal_member_tasks ADD COLUMN proof_review_file_name TEXT',
      'ALTER TABLE goal_member_tasks ADD COLUMN proof_review_file_type TEXT',
      'ALTER TABLE goal_member_tasks ADD COLUMN proof_review_rating INTEGER',
      'ALTER TABLE goal_member_tasks ADD COLUMN proof_reviewed_by INTEGER',
      'ALTER TABLE goal_member_tasks ADD COLUMN proof_reviewed_role TEXT',
      'ALTER TABLE goal_member_tasks ADD COLUMN proof_reviewed_at TEXT',
      'ALTER TABLE goal_member_tasks ADD COLUMN proof_revision_history TEXT DEFAULT \'[]\'',
      'ALTER TABLE goal_member_tasks ADD COLUMN tl_review_locked INTEGER DEFAULT 0',
      'ALTER TABLE goal_member_tasks ADD COLUMN created_by INTEGER',
      'ALTER TABLE goal_member_tasks ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      'ALTER TABLE goal_member_tasks ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    ];
    for (const sql of goalTaskMigrations) {
      try {
        if (usePostgres && pgPool) {
          const c = await pgPool.connect();
          try { await c.query(sql); } catch {} finally { c.release(); }
        } else { sqliteDb.exec(sql); }
      } catch {}
    }

    // Safe migrations for exit_interviews â€” add all missing fields
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

    // Safe migrations for suggestions â€” add missing fields
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

    // Employee profile migrations â€” email, phone, address
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

    const userProfileMigrations = [
      'ALTER TABLE users ADD COLUMN phone TEXT',
      'ALTER TABLE users ADD COLUMN address TEXT',
    ];
    for (const sql of userProfileMigrations) {
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
      goal_id INTEGER,
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

    // Safe migration: add goal_id to development_plans and pip_plans if missing
    const goalLinkMigrations = [
      'ALTER TABLE development_plans ADD COLUMN goal_id INTEGER',
      'ALTER TABLE pip_plans ADD COLUMN goal_id INTEGER',
    ];
    for (const sql of goalLinkMigrations) {
      try {
        if (usePostgres && pgPool) {
          const c = await pgPool.connect();
          try { await c.query(sql); } catch {} finally { c.release(); }
        } else { sqliteDb.exec(sql); }
      } catch {}
    }

    // Create promotion_recommendations table
    const promoRecTable = `CREATE TABLE IF NOT EXISTS promotion_recommendations (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      employee_id INTEGER NOT NULL,
      recommended_by INTEGER NOT NULL,
      recommended_position TEXT,
      current_position TEXT,
      current_dept TEXT,
      readiness_score REAL,
      justification TEXT,
      status TEXT DEFAULT 'Proposed',
      reviewed_by INTEGER,
      review_notes TEXT,
      review_date TEXT,
      effective_date TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    )`;
    try {
      if (usePostgres && pgPool) {
        const c = await pgPool.connect();
        try { await c.query(promoRecTable); } finally { c.release(); }
      } else { sqliteDb.exec(promoRecTable); }
    } catch {}

    // Create promotions history table
    const promotionsTable = `CREATE TABLE IF NOT EXISTS promotions (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      employee_id INTEGER NOT NULL,
      recommendation_id INTEGER,
      previous_position TEXT,
      new_position TEXT,
      previous_dept TEXT,
      new_dept TEXT,
      previous_salary REAL,
      new_salary REAL,
      effective_date TEXT NOT NULL,
      promoted_by INTEGER,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    )`;
    try {
      if (usePostgres && pgPool) {
        const c = await pgPool.connect();
        try { await c.query(promotionsTable); } finally { c.release(); }
      } else { sqliteDb.exec(promotionsTable); }
    } catch {}

    // Create career_paths table
    const careerPathsTable = `CREATE TABLE IF NOT EXISTS career_paths (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      current_role TEXT NOT NULL,
      next_role TEXT NOT NULL,
      department TEXT,
      min_tenure_months INTEGER DEFAULT 12,
      min_readiness_score INTEGER DEFAULT 60,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;
    try {
      if (usePostgres && pgPool) {
        const c = await pgPool.connect();
        try { await c.query(careerPathsTable); } finally { c.release(); }
      } else { sqliteDb.exec(careerPathsTable); }
    } catch {}

    // Create promotion_comments table
    const promoCommentsTable = `CREATE TABLE IF NOT EXISTS promotion_comments (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      recommendation_id INTEGER NOT NULL,
      user_id INTEGER,
      user_name TEXT,
      comment TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(recommendation_id) REFERENCES promotion_recommendations(id)
    )`;
    try {
      if (usePostgres && pgPool) {
        const c = await pgPool.connect();
        try { await c.query(promoCommentsTable); } finally { c.release(); }
      } else { sqliteDb.exec(promoCommentsTable); }
    } catch {}

    // Rubric columns for promotion_recommendations
    const promoRecMigrations = [
      'ALTER TABLE promotion_recommendations ADD COLUMN rubric_technical INTEGER',
      'ALTER TABLE promotion_recommendations ADD COLUMN rubric_leadership INTEGER',
      'ALTER TABLE promotion_recommendations ADD COLUMN rubric_teamwork INTEGER',
      'ALTER TABLE promotion_recommendations ADD COLUMN rubric_initiative INTEGER',
      'ALTER TABLE promotion_recommendations ADD COLUMN rubric_reliability INTEGER',
      'ALTER TABLE promotion_recommendations ADD COLUMN rubric_avg REAL',
      'ALTER TABLE goals ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    ];
    for (const sql of promoRecMigrations) {
      try {
        if (usePostgres && pgPool) {
          const c = await pgPool.connect();
          try { await c.query(sql); } catch {} finally { c.release(); }
        } else { sqliteDb.exec(sql); }
      } catch {}
    }

    // Safe migration: add profile_picture column to users
    const userMigrations = [
      'ALTER TABLE users ADD COLUMN profile_picture TEXT',
      'ALTER TABLE users ADD COLUMN email TEXT',
      'ALTER TABLE users ADD COLUMN full_name TEXT',
      'ALTER TABLE users ADD COLUMN position TEXT',
      'ALTER TABLE users ADD COLUMN dept TEXT',
      'ALTER TABLE users ADD COLUMN created_by INTEGER',
      'ALTER TABLE users ADD COLUMN created_at TIMESTAMP',
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

    const softDeleteMigrations = [
      'ALTER TABLE employees ADD COLUMN deleted_at TIMESTAMP',
      'ALTER TABLE payroll_adjustments ADD COLUMN deleted_at TIMESTAMP',
      'ALTER TABLE goals ADD COLUMN deleted_at TIMESTAMP',
      'ALTER TABLE goal_member_tasks ADD COLUMN deleted_at TIMESTAMP',
      'ALTER TABLE coaching_logs ADD COLUMN deleted_at TIMESTAMP',
      'ALTER TABLE coaching_chats ADD COLUMN deleted_at TIMESTAMP',
      'ALTER TABLE elearning_courses ADD COLUMN deleted_at TIMESTAMP',
      'ALTER TABLE appraisals ADD COLUMN deleted_at TIMESTAMP',
      'ALTER TABLE discipline_records ADD COLUMN deleted_at TIMESTAMP',
      'ALTER TABLE property_accountability ADD COLUMN deleted_at TIMESTAMP',
      'ALTER TABLE suggestions ADD COLUMN deleted_at TIMESTAMP',
      'ALTER TABLE feedback_360 ADD COLUMN deleted_at TIMESTAMP',
      'ALTER TABLE applicants ADD COLUMN deleted_at TIMESTAMP',
      'ALTER TABLE requisitions ADD COLUMN deleted_at TIMESTAMP',
      'ALTER TABLE offboarding ADD COLUMN deleted_at TIMESTAMP',
      'ALTER TABLE exit_interviews ADD COLUMN deleted_at TIMESTAMP',
      'ALTER TABLE development_plans ADD COLUMN deleted_at TIMESTAMP',
      'ALTER TABLE goal_improvement_plans ADD COLUMN deleted_at TIMESTAMP',
      'ALTER TABLE goal_development_plans ADD COLUMN deleted_at TIMESTAMP',
      'ALTER TABLE self_assessments ADD COLUMN deleted_at TIMESTAMP',
      'ALTER TABLE pip_plans ADD COLUMN deleted_at TIMESTAMP',
      'ALTER TABLE promotion_recommendations ADD COLUMN deleted_at TIMESTAMP',
      'ALTER TABLE promotions ADD COLUMN deleted_at TIMESTAMP',
      'ALTER TABLE career_paths ADD COLUMN deleted_at TIMESTAMP',
      'ALTER TABLE onboarding ADD COLUMN deleted_at TIMESTAMP',
    ];
    for (const sql of softDeleteMigrations) {
      try {
        if (usePostgres && pgPool) {
          const c = await pgPool.connect();
          try { await c.query(sql); } catch {} finally { c.release(); }
        } else { sqliteDb.exec(sql); }
      } catch {}
    }

    // Safe migrations for audit_logs â€” add metadata columns if missing
    const auditMigrations = [
      'ALTER TABLE audit_logs ADD COLUMN user_role TEXT',
      'ALTER TABLE audit_logs ADD COLUMN user_department TEXT',
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

    // Safe migrations for HR ownership tracking on signature-required tables
    const hrOwnershipMigrations = [
      'ALTER TABLE appraisals ADD COLUMN hr_owner_user_id INTEGER',
      'ALTER TABLE discipline_records ADD COLUMN hr_owner_user_id INTEGER',
      'ALTER TABLE onboarding ADD COLUMN hr_owner_user_id INTEGER',
      'ALTER TABLE applicants ADD COLUMN hr_owner_user_id INTEGER',
      'ALTER TABLE requisitions ADD COLUMN hr_owner_user_id INTEGER',
      'ALTER TABLE property_accountability ADD COLUMN hr_owner_user_id INTEGER',
      'ALTER TABLE exit_interviews ADD COLUMN hr_owner_user_id INTEGER',
      'ALTER TABLE suggestions ADD COLUMN hr_owner_user_id INTEGER',
      'ALTER TABLE suggestions ADD COLUMN supervisor_user_id INTEGER',
    ];
    for (const sql of hrOwnershipMigrations) {
      try {
        if (usePostgres && pgPool) {
          const c = await pgPool.connect();
          try { await c.query(sql); } catch {} finally { c.release(); }
        } else { sqliteDb.exec(sql); }
      } catch {}
    }

    // Safe migrations for department scoping on plan tables
    const departmentPlanMigrations = [
      'ALTER TABLE pip_plans ADD COLUMN department TEXT',
      'ALTER TABLE development_plans ADD COLUMN department TEXT',
      'ALTER TABLE goal_improvement_plans ADD COLUMN department TEXT',
      'ALTER TABLE goal_development_plans ADD COLUMN department TEXT',
    ];
    for (const sql of departmentPlanMigrations) {
      try {
        if (usePostgres && pgPool) {
          const c = await pgPool.connect();
          try { await c.query(sql); } catch {} finally { c.release(); }
        } else { sqliteDb.exec(sql); }
      } catch {}
    }

    // Payroll adjustments table
    const payrollAdjTable = `CREATE TABLE IF NOT EXISTS payroll_adjustments (
      id ${usePostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      employee_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      category TEXT,
      description TEXT,
      amount REAL NOT NULL DEFAULT 0,
      effective_date TEXT,
      pay_period TEXT,
      status TEXT DEFAULT 'pending',
      approved_by INTEGER,
      approved_at TEXT,
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;
    try {
      if (usePostgres && pgPool) {
        const c = await pgPool.connect();
        try { await c.query(payrollAdjTable); } finally { c.release(); }
      } else { sqliteDb.exec(payrollAdjTable); }
    } catch {}

    const userCountResult = await query("SELECT COUNT(*) as count FROM users") as any;
    const userCount = parseInt(userCountResult[0].count);

    if (userCount === 0) {
      console.log("No users found â€” creating demo accounts...");
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
      await query("INSERT INTO users (username, email, password, role, employee_id) VALUES (?, ?, ?, 'Employee', ?)", ['employee_john', 'john.doe@maptech.com', hash('demo_employee_pass'), johnId]);
      await query("INSERT INTO users (username, email, password, role, employee_id) VALUES (?, ?, ?, 'Employee', ?)", ['employee_jane', 'jane.smith@maptech.com', hash('demo_employee_pass'), janeId]);
      await query("INSERT INTO users (username, email, password, role, employee_id) VALUES (?, ?, ?, 'Manager', NULL)", ['manager_bob', 'manager.bob@maptech.com', hash('demo_manager_pass')]);
      await query("INSERT INTO users (username, email, password, role, employee_id) VALUES (?, ?, ?, 'HR', NULL)", ['hr_admin', 'hr_admin@maptech.com', hash('demo_hr_pass')]);

      // Ensure demo accounts have human-friendly full_name values
      await query("UPDATE users SET full_name = ? WHERE username = ?", ['John Doe', 'employee_john']);
      await query("UPDATE users SET full_name = ? WHERE username = ?", ['Jane Smith', 'employee_jane']);
      await query("UPDATE users SET full_name = ? WHERE username = ?", ['Bob Johnson', 'manager_bob']);
      await query("UPDATE users SET full_name = ? WHERE username = ?", ['Maria Cruz', 'hr_admin']);

      // Update manager_id to the manager's user id after creation  
      const mgrUser = (await query("SELECT id FROM users WHERE username = 'manager_bob'") as any[])[0];
      if (mgrUser && johnId) await query("UPDATE employees SET manager_id = ? WHERE id = ?", [mgrUser.id, johnId]);
      if (mgrUser && janeId) await query("UPDATE employees SET manager_id = ? WHERE id = ?", [mgrUser.id, janeId]);

      // Seed demo goals for John Doe
      if (johnId) {
        await query("INSERT INTO goals (employee_id, title, statement, metric, target_date, status, progress, scope, priority, quarter) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [johnId, 'Complete API Refactor', 'Refactor all legacy REST endpoints to use the new service layer', 'All endpoints migrated and tested', '2026-06-30', 'In Progress', 45, 'Individual', 'High', 'Q2 2026']);
        await query("INSERT INTO goals (employee_id, title, statement, metric, target_date, status, progress, scope, priority, quarter) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [johnId, 'Improve Test Coverage', 'Increase unit test coverage from 40% to 80%', 'Coverage report shows â‰¥80%', '2026-03-31', 'In Progress', 60, 'Individual', 'Medium', 'Q1 2026']);
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
      console.log("  john.doe@maptech.com / demo_employee_pass  â†’ Employee (John Doe)");
      console.log("  jane.smith@maptech.com / demo_employee_pass  â†’ Employee (Jane Smith)");
      console.log("  manager.bob@maptech.com / demo_manager_pass  â†’ Manager");
      console.log("  hr_admin@maptech.com / demo_hr_pass  â†’ HR");
    }

    // Ensure demo accounts always have full_name set (handles databases created before full_name migration)
    try {
      await query("UPDATE users SET full_name = 'Manager Bob' WHERE username = 'manager_bob' AND (full_name IS NULL OR full_name = '')");
      await query("UPDATE users SET full_name = 'HR Admin' WHERE username = 'hr_admin' AND (full_name IS NULL OR full_name = '')");
      await query("UPDATE users SET full_name = 'John Doe' WHERE username = 'employee_john' AND (full_name IS NULL OR full_name = '')");
      await query("UPDATE users SET full_name = 'Jane Smith' WHERE username = 'employee_jane' AND (full_name IS NULL OR full_name = '')");
    } catch (e) { console.error('full_name migration fallback error:', e); }

    // Ensure manager_bob is department-scoped and has Engineering employees to delegate.
    try {
      const managerDept = 'Engineering';
      await query("UPDATE users SET dept = ? WHERE username = 'manager_bob'", [managerDept]);
      const mgrRows = await query("SELECT id FROM users WHERE username = 'manager_bob' LIMIT 1") as any[];
      const managerId = Number(mgrRows?.[0]?.id || 0);

      const ensureManagedEmployee = async (name: string, position: string, status: string, hireDate: string) => {
        let rows = await query("SELECT id FROM employees WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1", [name]) as any[];
        let employeeId = Number(rows?.[0]?.id || 0);
        if (!employeeId) {
          await query("INSERT INTO employees (name, status, position, dept, hire_date) VALUES (?, ?, ?, ?, ?)", [name, status, position, managerDept, hireDate]);
          rows = await query("SELECT id FROM employees WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) ORDER BY id DESC LIMIT 1", [name]) as any[];
          employeeId = Number(rows?.[0]?.id || 0);
        }
        if (employeeId && managerId) {
          await query("UPDATE employees SET dept = ?, manager_id = ? WHERE id = ?", [managerDept, managerId, employeeId]);
        } else if (employeeId) {
          await query("UPDATE employees SET dept = ? WHERE id = ?", [managerDept, employeeId]);
        }
      };

      await ensureManagedEmployee('John Doe', 'Software Engineer', 'Regular', '2025-01-15');
      await ensureManagedEmployee('Jane Smith', 'QA Analyst', 'Probationary', '2025-06-01');
      await ensureManagedEmployee('Alex Ramos', 'Backend Engineer', 'Regular', '2025-02-15');
      await ensureManagedEmployee('Mia Santos', 'Frontend Engineer', 'Regular', '2025-03-20');
    } catch (e) { console.error('manager_bob department/employee setup error:', e); }

    // Ensure each department has an HR account, a Manager account, and test employees.
    try {
      const bcrypt = await import('bcryptjs');
      const hash = (pw: string) => bcrypt.default.hashSync(pw, 10);
      const DEPARTMENT_SEED_LIST = [
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

      const toSlug = (value: string) =>
        value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/_{2,}/g, '_')
          .replace(/^_|_$/g, '');

      const toLabel = (value: string) =>
        value
          .replace(/[\/]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      const ensureDepartment = async (dept: string) => {
        const slug = toSlug(dept).replace(/_/g, '-');
        await query(
          "INSERT INTO departments (name, slug, description, deleted_at) VALUES (?, ?, ?, NULL) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, deleted_at = NULL",
          [dept, slug, `${dept} team and workforce records`]
        );
      };

      const ensureUserAccount = async (args: {
        username: string;
        email: string;
        password: string;
        role: 'HR' | 'Manager' | 'Employee';
        fullName: string;
        dept: string;
        position: string;
        employeeId: number | null;
      }) => {
        const rows = await query(
          "SELECT id FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?) LIMIT 1",
          [args.username, args.email]
        ) as any[];
        const existingId = Number(rows?.[0]?.id || 0);
        if (existingId) {
          await query(
            "UPDATE users SET username = ?, email = ?, role = ?, employee_id = ?, full_name = ?, dept = ?, position = ?, deleted_at = NULL WHERE id = ?",
            [args.username, args.email, args.role, args.employeeId, args.fullName, args.dept, args.position, existingId]
          );
          return existingId;
        }
        await query(
          "INSERT INTO users (username, email, password, role, employee_id, full_name, dept, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [args.username, args.email, hash(args.password), args.role, args.employeeId, args.fullName, args.dept, args.position]
        );
        const createdRows = await query("SELECT id FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1", [args.username]) as any[];
        return Number(createdRows?.[0]?.id || 0);
      };

      const ensureEmployee = async (name: string, dept: string, position: string, managerId: number | null, hireDate: string) => {
        const rows = await query("SELECT id FROM employees WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1", [name]) as any[];
        let employeeId = Number(rows?.[0]?.id || 0);
        if (!employeeId) {
          await query(
            "INSERT INTO employees (name, status, position, dept, hire_date, manager_id) VALUES (?, 'Regular', ?, ?, ?, ?)",
            [name, position, dept, hireDate, managerId]
          );
          const inserted = await query("SELECT id FROM employees WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) ORDER BY id DESC LIMIT 1", [name]) as any[];
          employeeId = Number(inserted?.[0]?.id || 0);
        }
        if (employeeId) {
          await query(
            "UPDATE employees SET dept = ?, position = ?, manager_id = ?, status = COALESCE(status, 'Regular') WHERE id = ?",
            [dept, position, managerId, employeeId]
          );
        }
        return employeeId;
      };

      for (const dept of DEPARTMENT_SEED_LIST) {
        const deptSlug = toSlug(dept);
        const deptLabel = toLabel(dept);

        await ensureDepartment(dept);

        const managerUsername = `manager_${deptSlug}`;
        const managerEmail = `manager.${deptSlug}@maptech.com`;
        const managerFullName = `${deptLabel} Manager`;
        const managerId = await ensureUserAccount({
          username: managerUsername,
          email: managerEmail,
          password: 'demo_manager_pass',
          role: 'Manager',
          fullName: managerFullName,
          dept,
          position: 'Manager',
          employeeId: null,
        });

        const hrUsername = `hr_${deptSlug}`;
        const hrEmail = `hr.${deptSlug}@maptech.com`;
        const hrFullName = `${deptLabel} HR`;
        await ensureUserAccount({
          username: hrUsername,
          email: hrEmail,
          password: 'demo_hr_pass',
          role: 'HR',
          fullName: hrFullName,
          dept,
          position: 'HR Admin',
          employeeId: null,
        });

        const empAName = `${deptLabel} Employee A`;
        const empBName = `${deptLabel} Employee B`;
        const empAId = await ensureEmployee(empAName, dept, 'Staff', managerId || null, '2025-01-15');
        const empBId = await ensureEmployee(empBName, dept, 'Staff', managerId || null, '2025-02-15');

        await ensureUserAccount({
          username: `employee_${deptSlug}_a`,
          email: `employee.${deptSlug}.a@maptech.com`,
          password: 'demo_employee_pass',
          role: 'Employee',
          fullName: empAName,
          dept,
          position: 'Staff',
          employeeId: empAId || null,
        });
        await ensureUserAccount({
          username: `employee_${deptSlug}_b`,
          email: `employee.${deptSlug}.b@maptech.com`,
          password: 'demo_employee_pass',
          role: 'Employee',
          fullName: empBName,
          dept,
          position: 'Staff',
          employeeId: empBId || null,
        });
      }

      // Transfer department ownership to the new manager accounts and stop using legacy manager_bob.
      const legacyMgrRows = await query("SELECT id FROM users WHERE username = 'manager_bob' OR LOWER(email) = LOWER('manager.bob@maptech.com') LIMIT 1") as any[];
      const legacyManagerId = Number(legacyMgrRows?.[0]?.id || 0);

      for (const dept of DEPARTMENT_SEED_LIST) {
        const deptSlug = toSlug(dept);
        const deptLabel = toLabel(dept);

        const managerRows = await query(
          "SELECT id FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?) LIMIT 1",
          [`manager_${deptSlug}`, `manager.${deptSlug}@maptech.com`]
        ) as any[];
        const managerUserId = Number(managerRows?.[0]?.id || 0);
        if (!managerUserId) continue;

        // Canonical manager profile for this department.
        await query(
          "UPDATE users SET role = 'Manager', dept = ?, position = 'Manager', deleted_at = NULL WHERE id = ?",
          [dept, managerUserId]
        );

        // Reassign every employee in this department to the new department manager.
        await query(
          "UPDATE employees SET manager_id = ?, dept = ? WHERE LOWER(TRIM(COALESCE(dept, ''))) = LOWER(TRIM(?))",
          [managerUserId, dept, dept]
        );

        // Ensure the department supervisor employee record exists and is managed by the department manager.
        const supervisorName = `${deptLabel} Supervisor`;
        const supervisorEmpId = await ensureEmployee(supervisorName, dept, 'Supervisor', managerUserId, '2025-01-10');

        // Ensure supervisor account is linked to the supervisor employee record and scoped to the department.
        const supervisorUsername = `supervisor_${deptSlug}`;
        const supervisorEmail = `supervisor.${deptSlug}@maptech.com`;
        const supervisorRows = await query(
          "SELECT id FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?) OR LOWER(TRIM(COALESCE(full_name, ''))) = LOWER(TRIM(?)) LIMIT 1",
          [supervisorUsername, supervisorEmail, supervisorName]
        ) as any[];
        const supervisorUserId = Number(supervisorRows?.[0]?.id || 0);
        if (supervisorUserId) {
          await query(
            "UPDATE users SET username = ?, email = ?, role = 'Employee', dept = ?, position = 'Supervisor', employee_id = ?, full_name = ?, deleted_at = NULL WHERE id = ?",
            [supervisorUsername, supervisorEmail, dept, supervisorEmpId || null, supervisorName, supervisorUserId]
          );
        } else {
          await ensureUserAccount({
            username: supervisorUsername,
            email: supervisorEmail,
            password: 'demo_supervisor_pass',
            role: 'Employee',
            fullName: supervisorName,
            dept,
            position: 'Supervisor',
            employeeId: supervisorEmpId || null,
          });
        }

        // Sync all linked employee users in this department to correct dept metadata.
        await query(
          "UPDATE users SET dept = ?, role = 'Employee', deleted_at = NULL WHERE role = 'Employee' AND employee_id IN (SELECT id FROM employees WHERE LOWER(TRIM(COALESCE(dept, ''))) = LOWER(TRIM(?)))",
          [dept, dept]
        );
      }

      // Explicitly phase out legacy manager ownership.
      if (legacyManagerId) {
        await query("UPDATE employees SET manager_id = NULL WHERE manager_id = ?", [legacyManagerId]);
        await query("UPDATE users SET dept = NULL, position = COALESCE(position, 'Legacy Manager') WHERE id = ?", [legacyManagerId]);
      }
    } catch (e) { console.error('department-wide account seed error:', e); }

    // Backfill full_name for any users still missing it â€” format username into display name
    try {
      const nameless = await query("SELECT id, username FROM users WHERE (full_name IS NULL OR full_name = '') AND username IS NOT NULL") as any[];
      for (const u of (Array.isArray(nameless) ? nameless : [])) {
        const display = (u.username || '').replace(/[._]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()).trim();
        if (display) await query("UPDATE users SET full_name = ? WHERE id = ?", [display, u.id]);
      }
    } catch (e) { console.error('full_name backfill error:', e); }

    // Backfill goals.department from employee.dept for goals that have employee_id but no department
    try {
      const goalsWithoutDept = await query("SELECT DISTINCT g.id, g.employee_id FROM goals g WHERE (g.department IS NULL OR g.department = '') AND g.employee_id IS NOT NULL") as any[];
      for (const g of (Array.isArray(goalsWithoutDept) ? goalsWithoutDept : [])) {
        const empRows: any = await query("SELECT dept FROM employees WHERE id = ? LIMIT 1", [g.employee_id]);
        const emp = Array.isArray(empRows) ? empRows[0] : empRows;
        if (emp?.dept) {
          await query("UPDATE goals SET department = ? WHERE id = ?", [emp.dept, g.id]);
        }
      }
    } catch (e) { console.error('goals.department backfill error:', e); }

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

  function isPrivilegedRole(role: any) {
    const r = (role || '').toString().toLowerCase().replace(/[_-]+/g, ' ').trim();
    return r === 'hr' || r === 'hr admin' || r === 'admin';
  }

  function normalizeUserRole(role: any): 'Employee' | 'Manager' | 'HR' | null {
    const r = (role || '').toString().toLowerCase().replace(/[_-]+/g, ' ').trim();
    if (r === 'employee') return 'Employee';
    if (r === 'manager') return 'Manager';
    if (r === 'hr' || r === 'hr admin') return 'HR';
    return null;
  }

  function normalizeEmployeeId(value: any): number | null {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
  }
  function normalizeDept(value: any): string {
    return (value || '').toString().trim().toLowerCase();
  }

  function isSupervisorPositionLabel(position: any): boolean {
    return (position || '').toString().toLowerCase().includes('supervisor');
  }

  async function getActorOrgContext(userId: number) {
    if (!userId) return { dept: null as string | null, position: null as string | null, isSupervisor: false, employeeId: null as number | null };
    const rows: any = await query(
      `SELECT u.id, u.employee_id, u.position AS user_position, u.dept AS user_dept,
              e.position AS employee_position, e.dept AS employee_dept
       FROM users u
       LEFT JOIN employees e ON e.id = u.employee_id
       WHERE u.id = ?
       LIMIT 1`,
      [userId]
    );
    const row = Array.isArray(rows) ? rows[0] : rows;
    const dept = row?.employee_dept || row?.user_dept || null;
    const position = row?.employee_position || row?.user_position || null;
    const employeeId = normalizeEmployeeId(row?.employee_id);
    return { dept, position, isSupervisor: isSupervisorPositionLabel(position), employeeId };
  }

  async function canActorAccessEmployeeByDept(actorDept: any, employeeId: number | null) {
    if (!employeeId) return false;
    const deptNorm = normalizeDept(actorDept);
    if (!deptNorm) return false;
    const rows: any = await query('SELECT dept FROM employees WHERE id = ? LIMIT 1', [employeeId]);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return normalizeDept(row?.dept) === deptNorm;
  }

  async function getManagedEmployeeIds(managerUserId: number) {
    const rows: any = await query('SELECT id FROM employees WHERE manager_id = ?', [managerUserId]);
    const arr = Array.isArray(rows) ? rows : [rows].filter(Boolean);
    return arr.map((r: any) => normalizeEmployeeId(r.id)).filter((id: any) => id !== null) as number[];
  }

  async function canManagerAccessEmployee(managerUserId: number, employeeId: number | null) {
    if (!employeeId) return false;
    const rows: any = await query('SELECT id FROM employees WHERE id = ? AND manager_id = ?', [employeeId, managerUserId]);
    const arr = Array.isArray(rows) ? rows : [rows].filter(Boolean);
    return arr.length > 0;
  }

  async function resolveDeptHrOwnerUserId(dept: any) {
    const deptNorm = normalizeDept(dept);
    if (!deptNorm) return null;
    const rows: any = await query(
      `SELECT id
       FROM users
       WHERE LOWER(TRIM(COALESCE(dept, ''))) = LOWER(TRIM(?))
         AND LOWER(TRIM(COALESCE(role, ''))) = 'hr'
         AND deleted_at IS NULL
       ORDER BY created_at ASC
       LIMIT 1`,
      [deptNorm]
    );
    const row = Array.isArray(rows) ? rows[0] : rows;
    return Number(row?.id || 0) || null;
  }

  async function resolveUserFullName(userId: number | null): Promise<string | null> {
    if (!userId) return null;
    const rows: any = await query(
      `SELECT COALESCE(full_name, username, email) as name FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    const row = Array.isArray(rows) ? rows[0] : rows;
    return String(row?.name || '').trim() || null;
  }

  // Enrich appraisal records: fill blank print_name fields from linked user IDs
  async function enrichAppraisalNames(records: any[]): Promise<any[]> {
    if (!records || records.length === 0) return records;
    const userIds = new Set<number>();
    for (const r of records) {
      if (!r.supervisor_print_name && r.supervisor_user_id) userIds.add(Number(r.supervisor_user_id));
      if (!r.reviewer_print_name && r.reviewer_user_id) userIds.add(Number(r.reviewer_user_id));
      if (!r.hr_print_name && r.hr_owner_user_id) userIds.add(Number(r.hr_owner_user_id));
    }
    if (userIds.size === 0) return records;
    const ids = Array.from(userIds);
    const placeholders = ids.map(() => '?').join(',');
    const userRows: any = await query(
      `SELECT id, COALESCE(full_name, username, email) as name FROM users WHERE id IN (${placeholders})`,
      ids
    );
    const nameMap: Record<number, string> = {};
    const arr = Array.isArray(userRows) ? userRows : (userRows ? [userRows] : []);
    for (const u of arr) nameMap[Number(u.id)] = String(u.name || '').trim();
    return records.map((r) => ({
      ...r,
      supervisor_print_name: r.supervisor_print_name || (r.supervisor_user_id ? nameMap[Number(r.supervisor_user_id)] || null : null),
      reviewer_print_name: r.reviewer_print_name || (r.reviewer_user_id ? nameMap[Number(r.reviewer_user_id)] || null : null),
      hr_print_name: r.hr_print_name || (r.hr_owner_user_id ? nameMap[Number(r.hr_owner_user_id)] || null : null),
    }));
  }

  async function isLeaderOf(leaderUserId: number, memberEmployeeId: number | null) {
    if (!leaderUserId || !memberEmployeeId) return false;
    try {
      const rows: any = await query('SELECT id FROM team_leaders WHERE leader_id = ? AND member_id = ?', [leaderUserId, memberEmployeeId]);
        const arr = Array.isArray(rows) ? rows : (rows ? [rows] : []);
      return arr.length > 0;
    } catch (e) { return false; }
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
        const actorCtx = await getActorOrgContext(Number(user.id || 0));
        const candidate = resource ? resource.toString() : null;
        if (candidate && auditInterestTables.includes(candidate)) shouldAudit = true;
      }

      if (!shouldAudit) return next();
        // Managers can review task proofs for goals in their department.
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

  // Internal admin endpoint to trigger seeding of linked test accounts.
  // Protected: requires `x-seed-secret` header to equal `process.env.SEED_SECRET`.
  // Additionally, to avoid accidental runs against non-Railway DBs, seeding
  // is allowed only when `DATABASE_URL` contains 'railway' or when
  // `ALLOW_SEED_ANY_HOST` is set to '1'.
  app.post('/internal/seed-linked-accounts', async (req, res) => {
    try {
      const provided = String(req.headers['x-seed-secret'] || '');
      const expected = String(process.env.SEED_SECRET || '');
      if (!expected || provided !== expected) return res.status(403).json({ error: 'Forbidden' });

      const dbUrl = String(process.env.DATABASE_URL || '');
      const dbHost = String(process.env.DB_HOST || '');
      const allowAny = String(process.env.ALLOW_SEED_ANY_HOST || '0') === '1';
      const isRailwayHost = /(railway|rlwy|shuttle|railway.app)/i.test(dbUrl + ' ' + dbHost);
      if (!allowAny && !isRailwayHost) {
        return res.status(400).json({ error: 'Seeding only allowed on Railway by default. Set ALLOW_SEED_ANY_HOST=1 to override.' });
      }

      await createLinkedAccounts();
      res.json({ success: true, message: 'Seed job started (synchronous)' });
    } catch (err) {
      console.error('Seed endpoint error:', err);
      res.status(500).json({ error: 'Seed failed', details: err instanceof Error ? err.message : String(err) });
    }
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
      } else {
        employee_name = user.full_name || user.username || null;
        position = user.position || null;
        dept = user.dept || null;
        user_email = user.email || null;
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
      res.json({ token, id: user.id, username: user.username || null, email: user_email || user.email || null, full_name: user.full_name || (user.username ? user.username.replace(/[._]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()).trim() : null), role: user.role, employee_id: user.employee_id, profile_picture: user.profile_picture || null, employee_name, position, dept, phone, address, hire_date, status });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  // Logout endpoint â€” records a logout audit entry for the authenticated user
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
      const passwordPolicyError = getPasswordPolicyError(newPassword);
      if (passwordPolicyError) return res.status(400).json({ error: passwordPolicyError });
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
        const creatorRole = normalizeUserRole(creatorPayload.role);
        if (creatorRole !== 'HR' && creatorRole !== 'Manager') return res.status(403).json({ error: 'Forbidden' });
      } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const { email, username, password, role, employee_id, full_name, linked_user_id, position, dept } = req.body;
      if ((!email && !username) || !password) return res.status(400).json({ error: 'Missing email (or username) or password' });
      const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      const normalizedFullName = sanitizeUserFullName(typeof full_name === 'string' ? full_name : '', normalizedEmail || null);
      const normalizedPosition = typeof position === 'string' ? position.trim() : '';
      const normalizedDept = typeof dept === 'string' ? dept.trim() : '';
      const requestedUsername = typeof username === 'string' ? username.trim() : '';
      if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return res.status(400).json({ error: 'Invalid email format' });
      if (normalizedEmail && !isAllowedAccountEmailDomain(normalizedEmail)) return res.status(400).json({ error: `Email must use @${ALLOWED_ACCOUNT_EMAIL_DOMAIN}` });
      const passwordPolicyError = getPasswordPolicyError(password);
      if (passwordPolicyError) return res.status(400).json({ error: passwordPolicyError });
      const normalizedRole = normalizeUserRole(role);
      if (!normalizedRole) return res.status(400).json({ error: 'Invalid or missing role' });

      const usernameSeed = requestedUsername || normalizedEmail.split('@')[0] || normalizedFullName || 'user';
      const finalUsername = await generateUniqueUsername(usernameSeed);

      let resolvedEmployeeId: number | null = null;
      if (normalizedRole === 'Employee') {
        if (!normalizedFullName) {
          return res.status(400).json({ error: 'Full name is required for Employee account creation' });
        }
        resolvedEmployeeId = await ensureEmployeeIdByFullName(normalizedFullName);
        if (!resolvedEmployeeId) {
          return res.status(400).json({ error: 'Employee account can only be created for hired employees in Employee Master Directory' });
        }
      }

      const explicitLinkedUserId = Number(linked_user_id);
      const resolvedLinkedUserId = Number.isFinite(explicitLinkedUserId) && explicitLinkedUserId > 0 ? explicitLinkedUserId : null;
      const shouldStoreOrgMeta = normalizedRole === 'HR' || normalizedRole === 'Manager';
      let effectiveDept = normalizedDept;
      if (shouldStoreOrgMeta) {
        const creatorCtx = await getActorOrgContext(Number(creatorPayload?.id || 0));
        effectiveDept = String(creatorCtx?.dept || '').trim();
        if (!effectiveDept) {
          return res.status(400).json({ error: 'Creator account must have a department to create Manager/HR users' });
        }
      }

      const hashed = bcrypt.hashSync(password, 10);
      // Username is required by DB schema; derive one when not provided by the client.
      await query("INSERT INTO users (username, email, password, role, employee_id, full_name, linked_user_id, position, dept, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", 
        [
          finalUsername,
          normalizedEmail || null,
          hashed,
          normalizedRole,
          resolvedEmployeeId,
          normalizedFullName || null,
          resolvedLinkedUserId,
          shouldStoreOrgMeta ? (normalizedPosition || null) : null,
          shouldStoreOrgMeta ? (effectiveDept || null) : null,
          creatorPayload?.id || null,
          new Date().toISOString(),
        ]);

      try {
        await recordAudit(creatorPayload, 'create', 'users', null, null, { email: normalizedEmail || null, username: finalUsername, role: normalizedRole, employee_id: resolvedEmployeeId, full_name: normalizedFullName || null, linked_user_id: resolvedLinkedUserId, position: shouldStoreOrgMeta ? (normalizedPosition || null) : null, dept: shouldStoreOrgMeta ? (effectiveDept || null) : null });
      } catch (e) { /* ignore audit errors */ }

      res.json({ success: true });
    } catch (err) {
      const pgErr: any = err;
      if (pgErr?.code === '23505') {
        const detail = String(pgErr?.detail || '');
        if (detail.includes('(email)')) return res.status(409).json({ error: 'Email is already in use' });
        if (detail.includes('(username)')) return res.status(409).json({ error: 'Username is already in use' });
        return res.status(409).json({ error: 'Duplicate user account' });
      }
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
      if (normalizeUserRole(payload.role) !== 'HR') return res.status(403).json({ error: 'Forbidden' });

      const id = req.params.id;
      const targetUserId = Number(id);
      if (!Number.isFinite(targetUserId) || targetUserId <= 0) return res.status(400).json({ error: 'Invalid user id' });

      const actorCtx = await getActorOrgContext(Number(payload.id));
      const actorDeptNorm = normalizeDept(actorCtx?.dept || '');

      const targetCtxRows: any = await query(
        `SELECT u.id, u.dept AS user_dept, e.dept AS employee_dept
         FROM users u
         LEFT JOIN employees e ON e.id = u.employee_id
         WHERE u.id = ?
         LIMIT 1`,
        [targetUserId]
      );
      const targetCtx = Array.isArray(targetCtxRows) ? targetCtxRows[0] : targetCtxRows;
      if (!targetCtx) return res.status(404).json({ error: 'User not found' });
      const targetDeptNorm = normalizeDept(targetCtx?.employee_dept || targetCtx?.user_dept || '');
      const isSelfEdit = Number(payload.id) === targetUserId;
      if (!isSelfEdit) {
        if (!actorDeptNorm || !targetDeptNorm || actorDeptNorm !== targetDeptNorm) {
          return res.status(403).json({ error: 'Department-scoped access: you can only edit users in your department' });
        }
      }

      const { password, role, full_name, position, dept, email, phone, address } = req.body;
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
      if (email !== undefined) {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
          return res.status(400).json({ error: 'Invalid email format' });
        }
        if (normalizedEmail && !isAllowedAccountEmailDomain(normalizedEmail)) {
          return res.status(400).json({ error: `Email must use @${ALLOWED_ACCOUNT_EMAIL_DOMAIN}` });
        }
        sets.push('email = ?');
        vals.push(normalizedEmail || null);
      }
      if (role !== undefined) {
        const normalizedRequestedRole = normalizeUserRole(role);
        if (!normalizedRequestedRole) return res.status(400).json({ error: 'Invalid role' });
        sets.push('role = ?');
        vals.push(normalizedRequestedRole);
      }

      const normalizedFullName = full_name !== undefined
        ? sanitizeUserFullName(String(full_name || ''), String(before?.email || ''))
        : sanitizeUserFullName(String(before?.full_name || ''), String(before?.email || ''));

      if (full_name !== undefined) {
        sets.push('full_name = ?');
        vals.push(normalizedFullName || null);
      }

      // Employee link is automatic by full name only for Employee role.
      if (role !== undefined || full_name !== undefined) {
        const resolvedRole = normalizeUserRole(role !== undefined ? role : (before?.role || ''));
        let resolvedEmployeeId: number | null = null;
        if (resolvedRole === 'Employee' && normalizedFullName) {
          resolvedEmployeeId = await ensureEmployeeIdByFullName(normalizedFullName);
          if (!resolvedEmployeeId) {
            return res.status(400).json({ error: 'Employee role requires a hired employee match in Employee Master Directory' });
          }
        }
        if (resolvedRole === 'Employee' && !normalizedFullName) {
          return res.status(400).json({ error: 'Full name is required for Employee role' });
        }

        sets.push('employee_id = ?');
        vals.push(resolvedEmployeeId);
      }

      const effectiveRole = normalizeUserRole(role !== undefined ? role : (before?.role || ''));
      const canStoreOrgMeta = effectiveRole === 'HR' || effectiveRole === 'Manager';
      if (position !== undefined) {
        sets.push('position = ?');
        vals.push(canStoreOrgMeta ? (String(position || '').trim() || null) : null);
      }
      if (dept !== undefined) {
        sets.push('dept = ?');
        vals.push(canStoreOrgMeta ? (String(dept || '').trim() || null) : null);
      }
      if (role !== undefined && !canStoreOrgMeta) {
        sets.push('position = ?');
        vals.push(null);
        sets.push('dept = ?');
        vals.push(null);
      }

      if (phone !== undefined) {
        sets.push('phone = ?');
        vals.push(String(phone || '').trim() || null);
      }
      if (address !== undefined) {
        sets.push('address = ?');
        vals.push(String(address || '').trim() || null);
      }

      if ((phone !== undefined || address !== undefined) && before?.employee_id) {
        const employeeSets: string[] = [];
        const employeeVals: any[] = [];
        if (phone !== undefined) {
          employeeSets.push('phone = ?');
          employeeVals.push(String(phone || '').trim() || null);
        }
        if (address !== undefined) {
          employeeSets.push('address = ?');
          employeeVals.push(String(address || '').trim() || null);
        }
        if (employeeSets.length > 0) {
          employeeVals.push(before.employee_id);
          await query(`UPDATE employees SET ${employeeSets.join(', ')} WHERE id = ?`, employeeVals);
        }
      }

      if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
      vals.push(id);
      await query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, vals);

      if (email !== undefined && before?.employee_id) {
        try {
          const normalizedEmail = String(email || '').trim().toLowerCase() || null;
          await query('UPDATE employees SET email = ? WHERE id = ?', [normalizedEmail, before.employee_id]);
        } catch (e) { /* ignore employee mirror failures */ }
      }
      // Capture after state and record audit
      try {
        const ar: any = await query('SELECT * FROM users WHERE id = ?', [id]);
        const after = Array.isArray(ar) ? ar[0] : ar;
        await recordAudit(payload, 'update', 'users', id, before, after);
      } catch (e) { /* ignore audit errors */ }

      res.json({ success: true });
    } catch (err: any) {
      if (err?.code === '23505') {
        const detail = String(err?.detail || '');
        if (detail.includes('(email)')) return res.status(409).json({ error: 'Email is already in use' });
      }
      res.status(500).json({ error: 'Database error' });
    }
  });

  // Get own account info
  app.get('/api/account-info', authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      const employeeId = (req as any).user?.employee_id;
      const userRows = await query('SELECT id, username, email, role, employee_id, profile_picture, full_name, phone, address, position, dept FROM users WHERE id = ?', [userId]) as any;
      const u = userRows[0];
      if (!u) return res.status(404).json({ error: 'User not found' });
      const usernameAsEmail = (typeof u.username === 'string' && /@/.test(u.username)) ? u.username : null;
      let emp: any = null;
      if (employeeId) {
        const empRows = await query('SELECT name, position, dept, email, phone, address, hire_date, status FROM employees WHERE id = ?', [employeeId]) as any;
        emp = empRows[0] || null;
      }
      if (!emp) {
        return res.json({
          ...u,
          email: u.email || usernameAsEmail || null,
          name: u.full_name || u.username || null,
          phone: u.phone || null,
          address: u.address || null,
          position: u.position || null,
          dept: u.dept || null
        });
      }
      res.json({
        ...u,
        ...emp,
        email: emp.email || u.email || usernameAsEmail || null,
        phone: emp.phone || u.phone || null,
        address: emp.address || u.address || null,
        position: emp.position || u.position || null,
        dept: emp.dept || u.dept || null,
        name: emp.name || u.full_name || u.username || null,
      });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  // Update own account info (email, phone, address)
  app.put('/api/account-info', authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      const employeeId = (req as any).user?.employee_id;
      const actorRole = String((req as any).user?.role || '').toLowerCase();
      if (actorRole !== 'hr' && actorRole !== 'hr admin' && actorRole !== 'hr_admin') {
        return res.status(403).json({ error: 'Only HR admin can edit account information' });
      }
      const { email, phone, address, employee_name, full_name, position, dept } = req.body;

      // Users without a linked employee can still update full_name on users table
      if (!employeeId) {
        const nameToSet = full_name || employee_name;
        if (nameToSet !== undefined) {
          await query('UPDATE users SET full_name = ? WHERE id = ?', [nameToSet || null, userId]);
        }
        const userUpdates: string[] = [];
        const userVals: any[] = [];
        if (email !== undefined) { userUpdates.push('email = ?'); userVals.push(String(email || '').trim().toLowerCase() || null); }
        if (phone !== undefined) { userUpdates.push('phone = ?'); userVals.push(phone || null); }
        if (address !== undefined) { userUpdates.push('address = ?'); userVals.push(address || null); }
        if (userUpdates.length > 0) {
          userVals.push(userId);
          await query(`UPDATE users SET ${userUpdates.join(', ')} WHERE id = ?`, userVals);
        }
        const userRows = await query('SELECT id, username, email, role, full_name, phone, address, profile_picture, position, dept FROM users WHERE id = ?', [userId]) as any;
        return res.json({ success: true, ...(userRows[0] || {}) });
      }

      // Accept updates for contact info and basic profile fields
      const sets: string[] = [];
      const vals: any[] = [];
      if (employee_name !== undefined) { sets.push('name = ?'); vals.push(employee_name || null); }
      if (position !== undefined) { sets.push('position = ?'); vals.push(position || null); }
      if (dept !== undefined) { sets.push('dept = ?'); vals.push(dept || null); }
      if (email !== undefined) {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
          return res.status(400).json({ error: 'Invalid email format' });
        }
        if (normalizedEmail && !isAllowedAccountEmailDomain(normalizedEmail)) {
          return res.status(400).json({ error: `Email must use @${ALLOWED_ACCOUNT_EMAIL_DOMAIN}` });
        }
        sets.push('email = ?');
        vals.push(normalizedEmail || null);
      }
      if (phone !== undefined) { sets.push('phone = ?'); vals.push(phone || null); }
      if (address !== undefined) { sets.push('address = ?'); vals.push(address || null); }
      if (sets.length > 0) {
        vals.push(employeeId);
        await query(`UPDATE employees SET ${sets.join(', ')} WHERE id = ?`, vals);
        try {
          const userSets: string[] = [];
          const userVals: any[] = [];
          if (phone !== undefined) { userSets.push('phone = ?'); userVals.push(phone || null); }
          if (address !== undefined) { userSets.push('address = ?'); userVals.push(address || null); }
          if (userSets.length > 0) {
            userVals.push(userId);
            await query(`UPDATE users SET ${userSets.join(', ')} WHERE id = ?`, userVals);
          }
        } catch (e) { /* ignore */ }
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

  // Restore user (HR only) â€” clears deleted_at timestamp
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

  // ---- Payroll Analytics ----
  app.get('/api/payroll-analytics', authenticateToken, async (req, res) => {
    try {
      const rows: any = await query('SELECT id, name, position, dept, salary_base, status, hire_date FROM employees ORDER BY dept, name');
      const employees = Array.isArray(rows) ? rows : [];
      const withSalary = employees.filter((e: any) => e.salary_base && e.salary_base > 0);
      const totalPayroll = withSalary.reduce((s: number, e: any) => s + (e.salary_base || 0), 0);
      const avgSalary = withSalary.length > 0 ? totalPayroll / withSalary.length : 0;

      // By department
      const deptMap: Record<string, { count: number; total: number; employees: any[] }> = {};
      employees.forEach((e: any) => {
        const d = e.dept || 'Unassigned';
        if (!deptMap[d]) deptMap[d] = { count: 0, total: 0, employees: [] };
        deptMap[d].count++;
        deptMap[d].total += e.salary_base || 0;
        deptMap[d].employees.push({ id: e.id, name: e.name, position: e.position, salary_base: e.salary_base || 0, status: e.status });
      });
      const byDepartment = Object.entries(deptMap).map(([dept, d]) => ({
        dept, headcount: d.count, totalSalary: d.total,
        avgSalary: d.count > 0 ? Math.round(d.total / d.count) : 0,
        employees: d.employees,
      }));

      // Salary distribution ranges
      const ranges = [
        { label: '$0 - $30k', min: 0, max: 30000, count: 0 },
        { label: '$30k - $50k', min: 30000, max: 50000, count: 0 },
        { label: '$50k - $80k', min: 50000, max: 80000, count: 0 },
        { label: '$80k - $120k', min: 80000, max: 120000, count: 0 },
        { label: '$120k+', min: 120000, max: Infinity, count: 0 },
      ];
      withSalary.forEach((e: any) => {
        const r = ranges.find(r => e.salary_base >= r.min && e.salary_base < r.max);
        if (r) r.count++;
      });

      res.json({
        totalPayroll: Math.round(totalPayroll),
        avgSalary: Math.round(avgSalary),
        headcount: employees.length,
        departmentCount: Object.keys(deptMap).length,
        byDepartment,
        salaryDistribution: ranges.map(r => ({ label: r.label, count: r.count })),
      });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  // ---- Payroll Adjustments CRUD ----
  // GET all adjustments (optionally filtered by employee_id)
  app.get('/api/payroll-adjustments', authenticateToken, async (req, res) => {
    try {
      const { employee_id } = req.query;
      let sql = 'SELECT pa.*, e.name as employee_name, e.dept as employee_dept, e.position as employee_position FROM payroll_adjustments pa LEFT JOIN employees e ON pa.employee_id = e.id';
      const params: any[] = [];
      if (employee_id) { sql += ' WHERE pa.employee_id = ?'; params.push(employee_id); }
      sql += ' ORDER BY pa.created_at DESC';
      const rows = await query(sql, params);
      res.json(Array.isArray(rows) ? rows : []);
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  // POST create adjustment
  app.post('/api/payroll-adjustments', authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      const { employee_id, type, category, description, amount, effective_date, pay_period, status } = req.body;
      if (!employee_id || !type || amount === undefined) return res.status(400).json({ error: 'employee_id, type, and amount are required' });
      await query(
        'INSERT INTO payroll_adjustments (employee_id, type, category, description, amount, effective_date, pay_period, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [employee_id, type, category || null, description || null, amount, effective_date || null, pay_period || null, status || 'pending', userId]
      );
      const rows = await query('SELECT pa.*, e.name as employee_name, e.dept as employee_dept FROM payroll_adjustments pa LEFT JOIN employees e ON pa.employee_id = e.id ORDER BY pa.id DESC LIMIT 1') as any[];
      res.json(rows[0] || { success: true });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  // PUT update adjustment
  app.put('/api/payroll-adjustments/:id', authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      const { id } = req.params;
      const { type, category, description, amount, effective_date, pay_period, status } = req.body;
      const sets: string[] = [];
      const vals: any[] = [];
      if (type !== undefined) { sets.push('type = ?'); vals.push(type); }
      if (category !== undefined) { sets.push('category = ?'); vals.push(category); }
      if (description !== undefined) { sets.push('description = ?'); vals.push(description); }
      if (amount !== undefined) { sets.push('amount = ?'); vals.push(amount); }
      if (effective_date !== undefined) { sets.push('effective_date = ?'); vals.push(effective_date); }
      if (pay_period !== undefined) { sets.push('pay_period = ?'); vals.push(pay_period); }
      if (status !== undefined) {
        sets.push('status = ?'); vals.push(status);
        if (status === 'approved') {
          sets.push('approved_by = ?'); vals.push(userId);
          sets.push('approved_at = ?'); vals.push(new Date().toISOString());
        }
      }
      if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
      vals.push(id);
      await query(`UPDATE payroll_adjustments SET ${sets.join(', ')} WHERE id = ?`, vals);
      const rows = await query('SELECT pa.*, e.name as employee_name, e.dept as employee_dept FROM payroll_adjustments pa LEFT JOIN employees e ON pa.employee_id = e.id WHERE pa.id = ?', [id]) as any[];
      res.json(rows[0] || { success: true });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  // DELETE adjustment
  app.delete('/api/payroll-adjustments/:id', authenticateToken, async (req, res) => {
    try {
      await softDeleteById('payroll_adjustments', req.params.id);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  // Payroll summary per employee (base + adjustments)
  app.get('/api/payroll-summary', authenticateToken, async (req, res) => {
    try {
      const employees: any = await query('SELECT id, name, position, dept, salary_base, status FROM employees ORDER BY dept, name');
      const adjustments: any = await query("SELECT * FROM payroll_adjustments WHERE status = 'approved'");
      const adjMap: Record<number, any[]> = {};
      (Array.isArray(adjustments) ? adjustments : []).forEach((a: any) => {
        if (!adjMap[a.employee_id]) adjMap[a.employee_id] = [];
        adjMap[a.employee_id].push(a);
      });
      const results = (Array.isArray(employees) ? employees : []).map((e: any) => {
        const empAdj = adjMap[e.id] || [];
        const bonuses = empAdj.filter((a: any) => a.type === 'bonus').reduce((s: number, a: any) => s + (a.amount || 0), 0);
        const deductions = empAdj.filter((a: any) => a.type === 'deduction').reduce((s: number, a: any) => s + (a.amount || 0), 0);
        const allowances = empAdj.filter((a: any) => a.type === 'allowance').reduce((s: number, a: any) => s + (a.amount || 0), 0);
        const overtime = empAdj.filter((a: any) => a.type === 'overtime').reduce((s: number, a: any) => s + (a.amount || 0), 0);
        const grossPay = (e.salary_base || 0) + bonuses + allowances + overtime;
        const netPay = grossPay - deductions;
        return { ...e, bonuses, deductions, allowances, overtime, grossPay, netPay, adjustments: empAdj };
      });
      res.json(results);
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  // List employees (authenticated)
  app.get('/api/employees', async (req, res) => {
    try {
      const auth = req.headers['authorization'];
      if (!auth) return res.status(401).json({ error: 'Unauthorized' });
      const parts = auth.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Unauthorized' });
      try { await verifyTokenWithVersion(parts[1]); } catch (err) { return res.status(401).json({ error: 'Invalid token' }); }

      try {
        // Get employees with manager and profile picture information
        // Use a JOIN with users and pick the latest profile picture (highest user id)
        const sqlQuery = `
          SELECT DISTINCT ON (e.id)
            e.id,
            e.name,
            e.status,
            e.position,
            e.dept,
            e.manager_id,
            e.hire_date,
            e.salary_base,
            e.ssn,
            u.full_name as manager,
            u.username as manager_username,
            uu.profile_picture
          FROM employees e
          LEFT JOIN users u ON e.manager_id = u.id
          LEFT JOIN users uu ON uu.employee_id = e.id
          WHERE UPPER(COALESCE(e.status, '')) IN ('PROBATIONARY', 'REGULAR', 'PERMANENT', 'HIRED')
            AND NOT EXISTS (
            SELECT 1
            FROM users ux
            WHERE ux.deleted_at IS NULL
              AND ux.role IN ('HR', 'Manager')
              AND (
                ux.employee_id = e.id
                OR (
                  COALESCE(TRIM(ux.full_name), '') <> ''
                  AND REGEXP_REPLACE(LOWER(COALESCE(ux.full_name, '')), '[^a-z0-9]', '', 'g') = REGEXP_REPLACE(LOWER(COALESCE(e.name, '')), '[^a-z0-9]', '', 'g')
                )
              )
          )
          ORDER BY e.id, uu.id DESC
        `;
        
        const rows: any = await query(sqlQuery);
        
        const result = (Array.isArray(rows) ? rows : []).map((r: any) => ({ 
          ...r, 
          manager: r.manager || r.manager_username || '',
          profile_picture: r.profile_picture || null 
        }));
        
        res.json(result);
      } catch (dbErr) {
        console.error('Database query error:', dbErr);
        res.status(500).json({ error: 'Database error retrieving employees' });
      }
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  // Debug: Check profile picture for a specific employee
  app.get("/api/employees/debug/:employeeId", async (req, res) => {
    try {
      const auth = req.headers['authorization'];
      if (!auth) return res.status(401).json({ error: 'Unauthorized' });
      const parts = auth.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Unauthorized' });
      try { await verifyTokenWithVersion(parts[1]); } catch (err) { return res.status(401).json({ error: 'Invalid token' }); }

      const employeeId = req.params.employeeId;
      
      // Get employee info
      const empRows: any = await query('SELECT * FROM employees WHERE id = ?', [employeeId]);
      const employee = empRows[0];
      
      // Get users linked to this employee
      const userRows: any = await query('SELECT id, username, email, role, employee_id, (profile_picture IS NOT NULL AND profile_picture != \'\') as has_profile, LENGTH(COALESCE(profile_picture, \'\')) as profile_size FROM users WHERE employee_id = ?', [employeeId]);
      
      res.json({
        employee,
        linked_users: userRows,
        debug_info: {
          employee_found: !!employee,
          users_found: userRows.length,
          message: userRows.length === 0 ? 'No users linked to this employee!' : userRows.map((u: any) => `User ${u.id} (${u.username}): has_profile=${u.has_profile}, size=${u.profile_size}`).join('; ')
        }
      });
    } catch (err) {
      console.error('Debug endpoint error:', err);
      res.status(500).json({ error: 'Database error', details: err instanceof Error ? err.message : 'Unknown error' });
    }
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
      await softDeleteById('employees', id);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  app.get("/api/employees/:id", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = String(actor.role || '');
      const id = req.params.id;
      const employeeId = normalizeEmployeeId(id);
      if (!employeeId) return res.status(400).json({ error: 'Invalid employee id' });

      if (isPrivilegedRole(role)) {
        // HR/Admin can view any employee record.
      } else if (role === 'Manager') {
        const allowed = await canManagerAccessEmployee(actor.id, employeeId);
        if (!allowed) return res.status(403).json({ error: 'Forbidden' });
      } else if (role === 'Employee') {
        const ownEmployeeId = normalizeEmployeeId(actor.employee_id);
        if (!ownEmployeeId || ownEmployeeId !== employeeId) return res.status(403).json({ error: 'Forbidden' });
      } else {
        return res.status(403).json({ error: 'Forbidden' });
      }

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
        if (includeDeleted && normalizeUserRole(payload.role) !== 'HR') return res.status(403).json({ error: 'Forbidden' });

        // HR/Manager users should not be linked to employees.
        try {
          await query("UPDATE users SET employee_id = NULL WHERE COALESCE(TRIM(role), '') <> '' AND LOWER(TRIM(COALESCE(role, ''))) <> 'employee' AND employee_id IS NOT NULL");
        } catch (e) { /* ignore cleanup errors */ }

        // Backfill unresolved employee links by full_name so existing accounts stop showing N/A.
        try {
          const unresolvedUsers = await query(
            `SELECT id, full_name
             FROM users
             WHERE employee_id IS NULL
               AND COALESCE(TRIM(full_name), '') <> ''
               AND LOWER(TRIM(COALESCE(role, ''))) = 'employee'
               ${includeDeleted ? '' : 'AND deleted_at IS NULL'}`
          ) as any[];

          for (const u of (Array.isArray(unresolvedUsers) ? unresolvedUsers : [])) {
            const resolvedEmployeeId = await ensureEmployeeIdByFullName(String(u.full_name || ''));
            if (resolvedEmployeeId) {
              await query('UPDATE users SET employee_id = ? WHERE id = ?', [resolvedEmployeeId, u.id]);
            }
          }
        } catch (e) { /* ignore backfill errors */ }

          const q = `SELECT u.*, e.name AS employee_name, e.position AS employee_position, e.dept AS employee_dept, e.phone AS employee_phone, e.address AS employee_address, e.hire_date AS employee_hire_date, e.status AS employee_status, lu.full_name AS linked_user_full_name, lu.role AS linked_user_role,
              cu.full_name AS creator_full_name, cu.email AS creator_email, cu.username AS creator_username
                   FROM users u
                   LEFT JOIN employees e ON u.employee_id = e.id
                   LEFT JOIN users lu ON u.linked_user_id = lu.id
             LEFT JOIN users cu ON u.created_by = cu.id
                   ${includeDeleted ? '' : 'WHERE u.deleted_at IS NULL'}
                   ORDER BY u.full_name IS NULL, u.full_name, u.email`;
        const users: any = await query(q);
        let sanitizedUsers = (Array.isArray(users) ? users : []).map((u: any) => ({
          ...u,
          full_name: sanitizeUserFullName(u?.full_name, u?.email)
        }));

        res.json(sanitizedUsers);
      } catch (err) { res.status(500).json({ error: 'Database error' }); }
    });

  app.post("/api/goals", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      if (!isPrivilegedRole(role) && role !== 'Manager') return res.status(403).json({ error: 'Forbidden' });

      const { employee_id, statement, metric, target_date, title, status, progress, scope, department, team_name, delegation, priority, quarter, frequency, leader_id } = req.body;
      const targetEmployeeId = normalizeEmployeeId(employee_id);
      const normalizedScope = String(scope || 'Individual').trim() || 'Individual';
      const isIndividualScope = normalizedScope === 'Individual';
      const normalizedLeaderId = isIndividualScope ? null : (leader_id ? parseInt(String(leader_id)) : null);
      const normalizedDelegation = isIndividualScope ? null : (delegation || null);
      const normalizedTeamName = isIndividualScope ? null : (team_name || null);

      if (role === 'Manager') {
        const actorDept = String(actor.dept || '').trim();
        const requestedDept = String(department || '').trim();
        if (!actorDept || !requestedDept || actorDept.toLowerCase() !== requestedDept.toLowerCase()) {
          return res.status(403).json({ error: 'Managers can only create goals in their own department' });
        }
      }
      
      // Department-scoped delegation: Manager can only delegate within their own department
      if (role === 'Manager') {
        if (targetEmployeeId) {
          const allowed = await canManagerAccessEmployee(actor.id, targetEmployeeId);
          if (!allowed) return res.status(403).json({ error: 'Forbidden' });
          // Also check department match for delegation
          const actorCtx = await getActorOrgContext(actor.id);
          const empAllowed = await canActorAccessEmployeeByDept(actorCtx.dept, targetEmployeeId);
          if (!empAllowed) return res.status(403).json({ error: 'Manager can only delegate within their department' });
        }
      }

      const { assignee_ids } = req.body;
      const insertResult: any = await query(
        "INSERT INTO goals (employee_id, statement, metric, target_date, title, status, progress, scope, department, team_name, delegation, priority, quarter, frequency, leader_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
        [targetEmployeeId, statement, metric, target_date, title || statement, status || 'Not Started', progress || 0, normalizedScope, department || null, normalizedTeamName, normalizedDelegation, priority || 'Medium', quarter || null, frequency || 'One-time', normalizedLeaderId]
      );
      const newGoalId = insertResult?.insertId;
      if (newGoalId && Array.isArray(assignee_ids) && assignee_ids.length > 0) {
        const now = new Date().toISOString();
        for (const empId of assignee_ids) {
          const eid = parseInt(String(empId));
          if (!isNaN(eid)) {
            // Department-scoped delegation: only assign within department
            if (role === 'Manager') {
              const actorCtx = await getActorOrgContext(actor.id);
              const empAllowed = await canActorAccessEmployeeByDept(actorCtx.dept, eid);
              if (!empAllowed) continue; // Skip this assignment if not in same dept
            }
            await query("INSERT INTO goal_assignees (goal_id, employee_id, assigned_by, assigned_by_role, assigned_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (goal_id, employee_id) DO NOTHING", [newGoalId, eid, actor.id || null, role || null, now]);
            try {
              const notifyRows: any = await query('SELECT id FROM users WHERE employee_id = ?', [eid]);
              const notifyUser = Array.isArray(notifyRows) ? notifyRows[0] : notifyRows;
              await createNotification({ user_id: notifyUser?.id || null, type: 'info', message: `You were assigned a goal`, source: 'goals' });
            } catch (e) {}
          }
        }
      }
      if (newGoalId && normalizedLeaderId) {
        const lid = parseInt(String(normalizedLeaderId));
        if (!isNaN(lid)) { try { await createNotification({ user_id: lid, type: 'info', message: 'You have been assigned as team leader for a goal', source: 'goals' }); } catch (e) {} }
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  // PUT /api/goals/:id â€” update goal status/progress

  app.put("/api/goals/:id", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;

      const existingRows: any = await query('SELECT id, employee_id, leader_id, department, status, progress, proof_image, proof_review_status, proof_review_rating FROM goals WHERE id = ?', [req.params.id]);
      const existing = Array.isArray(existingRows) ? existingRows[0] : existingRows;
      if (!existing) return res.status(404).json({ error: 'Goal not found' });

      const isGoalLeaderUser = Number(existing?.leader_id || 0) > 0 && Number(existing?.leader_id) === Number(actor?.id || 0);
      if (!isPrivilegedRole(role) && role !== 'Manager' && !isGoalLeaderUser) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const b = req.body || {};
      const existingGoalReviewerRole = String((existing as any)?.proof_reviewed_role || '').trim().toLowerCase();

      const isFinalReviewMutation = b.proof_review_status !== undefined || b.proof_review_note !== undefined || b.proof_review_rating !== undefined;
      if (
        normalizeUserRole(role) === 'Manager'
        && String(existing?.proof_review_status || '').trim() === 'Approved'
        && existingGoalReviewerRole === 'manager'
        && b.proof_review_status !== undefined
        && isFinalReviewMutation
      ) {
        return res.status(409).json({ error: 'Final goal proof decision is locked after manager completion' });
      }

      if (isGoalLeaderUser && !isPrivilegedRole(role) && role !== 'Manager') {
        const currentGoalProofStatus = String(existing?.proof_review_status || 'Not Submitted').trim() || 'Not Submitted';
        if (currentGoalProofStatus === 'Pending Review') {
          return res.status(409).json({ error: 'Final proof is already pending manager review' });
        }
        if (currentGoalProofStatus === 'Approved') {
          return res.status(409).json({ error: 'Final proof already approved by manager' });
        }
        if (currentGoalProofStatus === 'Rejected') {
          return res.status(409).json({ error: 'Final proof is closed. Reopen is allowed only for needs revision' });
        }

        const submittedProofFiles = Array.isArray(b.proof_files)
          ? b.proof_files
              .map((item: any) => ({
                proof_file_data: String(item?.proof_file_data || item?.data || '').trim(),
                proof_file_name: String(item?.proof_file_name || item?.name || '').trim(),
                proof_file_type: String(item?.proof_file_type || item?.type || 'application/octet-stream').trim() || 'application/octet-stream',
              }))
              .filter((item: any) => !!item.proof_file_data)
          : [];

        const disallowedFields = Object.keys(b).filter((key) => ![
          'proof_files',
          'proof_image',
          'proof_file_name',
          'proof_file_type',
          'proof_note',
          'proof_submitted_at',
        ].includes(key));
        if (disallowedFields.length > 0) {
          return res.status(403).json({ error: 'Goal leaders can only submit final proof fields' });
        }

        const proofImagePayload = submittedProofFiles.length > 0
          ? JSON.stringify(submittedProofFiles)
          : String(b.proof_image || '').trim();
        const proofFileName = submittedProofFiles.length > 0
          ? String(submittedProofFiles[0]?.proof_file_name || '').trim() || null
          : (b.proof_file_name !== undefined ? String(b.proof_file_name || '').trim() || null : null);
        const proofFileType = submittedProofFiles.length > 0
          ? String(submittedProofFiles[0]?.proof_file_type || 'application/octet-stream').trim() || 'application/octet-stream'
          : (b.proof_file_type !== undefined ? String(b.proof_file_type || '').trim() || 'application/octet-stream' : null);
        const leaderSets: string[] = [];
        const leaderVals: any[] = [];

        const currentProofFiles = normalizeProofFilesPayload(existing.proof_image);
        const proofRevisionHistory = parseJsonArray((existing as any).proof_revision_history);
        if (currentProofFiles.length > 0 && String(existing?.proof_review_status || '').trim() !== 'Not Submitted') {
          const revisionNumber = proofRevisionHistory.length + 1;
          proofRevisionHistory.push({
            revision_number: revisionNumber,
            revision_label: `${ordinalLabel(revisionNumber)} revision`,
            proof_review_status: String(existing?.proof_review_status || '').trim() || 'Not Submitted',
            proof_review_note: String(existing?.proof_review_note || '').trim() || null,
            proof_review_file_data: String((existing as any).proof_review_file_data || '').trim() || null,
            proof_review_file_name: String((existing as any).proof_review_file_name || '').trim() || null,
            proof_review_file_type: String((existing as any).proof_review_file_type || '').trim() || null,
            proof_submitted_at: existing.proof_submitted_at || null,
            archived_at: new Date().toISOString(),
            proof_files: currentProofFiles,
          });
          leaderSets.push('proof_revision_history = ?');
          leaderVals.push(JSON.stringify(proofRevisionHistory));
        }

        if (b.proof_note !== undefined) {
          leaderSets.push('proof_note = ?');
          leaderVals.push(String(b.proof_note || '').trim() || null);
        }

        if (proofImagePayload) {
          leaderSets.push('proof_image = ?');
          leaderVals.push(proofImagePayload);
          leaderSets.push('proof_file_name = ?');
          leaderVals.push(proofFileName);
          leaderSets.push('proof_file_type = ?');
          leaderVals.push(proofFileType);
          leaderSets.push('proof_submitted_at = ?');
          leaderVals.push(String(b.proof_submitted_at || '').trim() || new Date().toISOString());
          leaderSets.push('proof_review_status = ?');
          leaderVals.push('Pending Review');
          leaderSets.push('proof_review_note = ?');
          leaderVals.push(null);
          leaderSets.push('proof_review_rating = ?');
          leaderVals.push(null);
          leaderSets.push('proof_reviewed_by = ?');
          leaderVals.push(null);
          leaderSets.push('proof_reviewed_at = ?');
          leaderVals.push(null);
        }

        if (leaderSets.length === 0) {
          return res.status(400).json({ error: 'No final proof fields to update' });
        }

        leaderVals.push(req.params.id);
        await query(`UPDATE goals SET ${leaderSets.join(', ')} WHERE id = ?`, leaderVals);
        return res.json({ success: true });
      }

      if (role === 'Manager') {
        const existingEmpId = normalizeEmployeeId(existing.employee_id);
        if (existingEmpId) {
          const allowed = await canManagerAccessEmployee(actor.id, existingEmpId);
          if (!allowed) return res.status(403).json({ error: 'Forbidden' });
        }

        const actorDept = String(actor.dept || '').trim();
        const goalDept = String(existing.department || '').trim();
        if (!goalDept || !actorDept || goalDept.toLowerCase() !== actorDept.toLowerCase()) {
          return res.status(403).json({ error: 'Managers can only modify goals in their own department' });
        }
      }

      const normalizedProgress = b.progress !== undefined ? normalizeProgressValue(b.progress) : undefined;
      const normalizedStatus = b.status !== undefined ? String(b.status || '').trim() : undefined;
      const effectiveStatus = normalizeGoalStatusFromProgress(normalizedStatus ?? existing.status, normalizedProgress ?? existing.progress);
      const sets: string[] = [];
      const vals: any[] = [];
      for (const k of ['statement', 'metric', 'target_date', 'title', 'status', 'progress', 'scope', 'department', 'team_name', 'delegation', 'priority', 'quarter', 'frequency', 'leader_id', 'proof_image', 'proof_file_name', 'proof_file_type', 'proof_note', 'proof_submitted_at']) {
        if (k === 'progress') {
          if (normalizedProgress !== undefined) { sets.push('progress = ?'); vals.push(normalizedProgress); }
          continue;
        }
        if (k === 'status') {
          if (normalizedStatus !== undefined || normalizedProgress !== undefined) { sets.push('status = ?'); vals.push(effectiveStatus); }
          continue;
        }
        if (b[k] !== undefined) { sets.push(`${k} = ?`); vals.push(b[k]); }
      }

      if (b.proof_review_status !== undefined) {
        const reviewedStatus = String(b.proof_review_status || '').trim();
        const normalizedRating = normalizeProofReviewRating(b.proof_review_rating);
        const hasExistingGoalProof = String(existing?.proof_image || '').trim().length > 0;
        const hasIncomingGoalProof = typeof b.proof_image === 'string' && String(b.proof_image || '').trim().length > 0;
        const currentGoalProofStatus = String(existing?.proof_review_status || 'Not Submitted').trim() || 'Not Submitted';
        const currentGoalProofReviewerRole = String((existing as any)?.proof_reviewed_role || '').trim().toLowerCase();
        const isReviewed = reviewedStatus === 'Approved' || reviewedStatus === 'Needs Revision' || reviewedStatus === 'Rejected';

        if (currentGoalProofStatus === 'Approved' && currentGoalProofReviewerRole === 'manager') {
          return res.status(409).json({ error: 'Final proof decision already finalized as Approved' });
        }

        if (reviewedStatus === 'Approved' && !hasExistingGoalProof && !hasIncomingGoalProof) {
          return res.status(400).json({ error: 'Final proof file is required before approval' });
        }

        if (normalizeUserRole(role) === 'Manager' && reviewedStatus === 'Approved') {
          const approvalRows: any = await query(
            `SELECT
               SUM(CASE WHEN COALESCE(TRIM(t.proof_image), '') <> '' THEN 1 ELSE 0 END) AS submitted_count,
               SUM(
                 CASE
                   WHEN COALESCE(TRIM(t.proof_image), '') <> ''
                    AND COALESCE(t.proof_review_status, 'Not Submitted') = 'Approved'
                    AND LOWER(TRIM(COALESCE(t.proof_reviewed_role, ur.role, ''))) = 'manager'
                   THEN 1
                   ELSE 0
                 END
               ) AS manager_approved_count
             FROM goal_member_tasks t
             LEFT JOIN users ur ON ur.id = t.proof_reviewed_by
             WHERE t.goal_id = ?
               AND t.deleted_at IS NULL`,
            [Number(req.params.id)]
          );
          const approvalSummary = Array.isArray(approvalRows) ? approvalRows[0] : approvalRows;
          const submittedCount = Number(approvalSummary?.submitted_count || 0);
          const managerApprovedCount = Number(approvalSummary?.manager_approved_count || 0);
          if (submittedCount > 0 && managerApprovedCount < submittedCount) {
            return res.status(409).json({ error: 'Final goal proof can be approved only after all submitted member proofs are approved by manager' });
          }
        }

        sets.push('proof_review_status = ?');
        vals.push(reviewedStatus || 'Not Submitted');

        sets.push('proof_reviewed_by = ?');
        vals.push(Number(actor?.id || 0) || null);
        sets.push('proof_reviewed_role = ?');
        vals.push(normalizeUserRole(role) || String(role || '') || null);
        sets.push('proof_reviewed_at = ?');
        vals.push(new Date().toISOString());
        sets.push('proof_review_rating = ?');
        vals.push(reviewedStatus === 'Approved' ? normalizedRating : null);

        if (b.proof_review_note !== undefined) {
          sets.push('proof_review_note = ?');
          vals.push(String(b.proof_review_note || '').trim() || null);
        }

        if (b.proof_review_file_data !== undefined) {
          sets.push('proof_review_file_data = ?');
          vals.push(String(b.proof_review_file_data || '').trim() || null);
        }
        if (b.proof_review_file_name !== undefined) {
          sets.push('proof_review_file_name = ?');
          vals.push(String(b.proof_review_file_name || '').trim() || null);
        }
        if (b.proof_review_file_type !== undefined) {
          sets.push('proof_review_file_type = ?');
          vals.push(String(b.proof_review_file_type || '').trim() || null);
        }

        if (reviewedStatus === 'Approved') {
          if (normalizedStatus === undefined) {
            sets.push('status = ?');
            vals.push('Completed');
          }
          if (normalizedProgress === undefined) {
            sets.push('progress = ?');
            vals.push(100);
          }
        } else if (reviewedStatus === 'Needs Revision' || reviewedStatus === 'Rejected') {
          if (normalizedStatus === undefined && String(existing?.status || '').toLowerCase() === 'completed') {
            sets.push('status = ?');
            vals.push('In Progress');
          }
          if (normalizedProgress === undefined) {
            const currentProgress = normalizeProgressValue(existing?.progress);
            if (currentProgress >= 100) {
              sets.push('progress = ?');
              vals.push(75);
            }
          }
        }
      } else if (normalizeUserRole(role) === 'Manager' && b.proof_review_rating !== undefined) {
        const currentGoalProofStatus = String(existing?.proof_review_status || 'Not Submitted').trim() || 'Not Submitted';
        if (currentGoalProofStatus !== 'Approved') {
          return res.status(409).json({ error: 'Manager rating can only be updated after final proof approval' });
        }

        const normalizedRating = normalizeProofReviewRating(b.proof_review_rating);
        if (normalizedRating === null) {
          return res.status(400).json({ error: 'Manager rating (1-5) is required' });
        }

        if (b.proof_review_note !== undefined) {
          sets.push('proof_review_note = ?');
          vals.push(String(b.proof_review_note || '').trim() || null);
        }

        sets.push('proof_reviewed_by = ?');
        vals.push(Number(actor?.id || 0) || null);
        sets.push('proof_reviewed_role = ?');
        vals.push(normalizeUserRole(role) || String(role || '') || null);
        sets.push('proof_reviewed_at = ?');
        vals.push(new Date().toISOString());
        sets.push('proof_review_rating = ?');
        vals.push(normalizedRating);
      }

      if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });
      vals.push(req.params.id);
      await query(`UPDATE goals SET ${sets.join(', ')} WHERE id = ?`, vals);

      if (b.proof_review_status !== undefined || b.proof_review_rating !== undefined) {
        await recomputeGoalProgress(Number(req.params.id));
      }

      if (b.assignee_ids !== undefined) {
        await query("DELETE FROM goal_assignees WHERE goal_id = ?", [req.params.id]);
        if (Array.isArray(b.assignee_ids) && b.assignee_ids.length > 0) {
          for (const empId of b.assignee_ids) {
            const eid = parseInt(String(empId));
            if (!isNaN(eid)) await query("INSERT INTO goal_assignees (goal_id, employee_id) VALUES (?, ?) ON CONFLICT (goal_id, employee_id) DO NOTHING", [req.params.id, eid]);
          }
        }
      }
      res.json({ success: true });
    } catch (err: any) { 
      console.error('PUT /api/goals/:id error:', err);
      res.status(500).json({ error: "Database error", detail: String(err?.message || '') }); 
    }
  });

  app.post("/api/coaching_logs", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      if (!isPrivilegedRole(role) && role !== 'Manager') return res.status(403).json({ error: 'Forbidden' });

      const { employee_id, category, notes, is_positive, logged_by } = req.body;
      
      // Enforce department scoping for managers
      if (role === 'Manager') {
        const actorCtx = await getActorOrgContext(Number(actor.id || 0));
        const actorDept = normalizeDept(actorCtx.dept || actor.dept || actor.department);
        if (!actorDept) return res.status(403).json({ error: 'Manager department not set' });
        const empRows: any = await query('SELECT dept FROM employees WHERE id = ? LIMIT 1', [employee_id]);
        const emp = Array.isArray(empRows) ? empRows[0] : empRows;
        if (!emp || !emp.dept) return res.status(404).json({ error: 'Employee not found' });
        const empDept = normalizeDept(emp.dept || '');
        if (!empDept || empDept.toLowerCase() !== actorDept.toLowerCase()) {
          return res.status(403).json({ error: 'Managers can only log coaching for employees in their own department' });
        }
      }

      await query("INSERT INTO coaching_logs (employee_id, category, notes, is_positive, logged_by) VALUES (?, ?, ?, ?, ?)", 
        [employee_id, category, notes, is_positive ? 1 : 0, logged_by]);
      const empUsers: any = await query("SELECT id FROM users WHERE employee_id = ?", [employee_id]);
      const empUser = Array.isArray(empUsers) ? empUsers[0] : empUsers;
      if (empUser) {
        await createNotification({ user_id: empUser.id, type: 'info', message: `New ${category || 'coaching'} feedback received`, source: 'coaching' });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/appraisals", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      if (!isPrivilegedRole(role) && role !== 'Manager') return res.status(403).json({ error: 'Forbidden' });

      const b = req.body;
      const employeeId = normalizeEmployeeId(b.employee_id);
      if (!employeeId) return res.status(400).json({ error: 'Invalid employee_id' });

      const actorCtx = await getActorOrgContext(Number(actor.id || 0));
      if (role === 'Manager') {
        const allowed = await canManagerAccessEmployee(actor.id, employeeId);
        if (!allowed) {
          // Backward-compatible fallback: some older datasets don't have
          // employees.manager_id mapped to manager user id. Allow same-dept access.
          const allowedByDept = await canActorAccessEmployeeByDept(actorCtx.dept, employeeId);
          if (!allowedByDept) return res.status(403).json({ error: 'Forbidden' });
        }
      }

      const formType = (b.form_type || '').toString().toLowerCase();
      const isPerformanceEval = formType.includes('performance');
      // Performance: creator is the Reviewer (manager reviewing the employee)
      // Achievement: creator is the Supervisor/Manager (signs the supervisor slot)
      const supervisorUserId = isPerformanceEval ? null : (Number(actor.id || 0) || null);
      const reviewerUserId = isPerformanceEval ? (Number(actor.id || 0) || null) : null;
      const employeeRows: any = await query('SELECT dept FROM employees WHERE id = ? LIMIT 1', [employeeId]);
      const employeeRow = Array.isArray(employeeRows) ? employeeRows[0] : employeeRows;
      const hrOwnerUserId = await resolveDeptHrOwnerUserId(employeeRow?.dept || b.employee_department || actorCtx.dept);

      // Auto-resolve print names from user IDs if not provided in payload
      const creatorName = String(actor.full_name || actor.username || actor.email || '').trim() || null;
      const hrOwnerName = hrOwnerUserId ? await resolveUserFullName(hrOwnerUserId) : null;
      const resolvedSupervisorName = b.supervisor_print_name || (isPerformanceEval ? null : creatorName);
      const resolvedReviewerName = b.reviewer_print_name || (isPerformanceEval ? creatorName : null);
      const resolvedHrName = b.hr_print_name || hrOwnerName;
      const requiredSignatures = isPerformanceEval
        ? ['supervisor_signature', 'reviewer_signature', 'employee_signature', 'hr_signature']
        : ['supervisor_signature', 'employee_signature'];
      const computedVerified = requiredSignatures.every((k) => !!(b[k] && `${b[k]}`.trim())) ? 1 : 0;

      await query(`
        INSERT INTO appraisals (employee_id, job_knowledge, productivity, attendance, overall, promotability_status, sign_off_date,
          form_type, eval_type, eval_period_from, eval_period_to, work_quality, communication, dependability,
          quantity_of_work, relationship_with_others, work_habits, promotability_score, employee_goals, additional_comments,
          supervisors_overall_comment, reviewers_comment, employee_acknowledgement,
          supervisor_signature, supervisor_signature_date, reviewer_signature, reviewer_signature_date,
          employee_signature, employee_signature_date, verified,
          hr_signature, hr_signature_date, overall_rating, recommendation, reviewer_agree, revised_rating,
          status, employee_department, employee_title, probationary_period,
          supervisor_print_name, reviewer_print_name, hr_print_name, employee_print_name,
          supervisor_user_id, reviewer_user_id, hr_owner_user_id,
          job_knowledge_comment, work_quality_comment, attendance_comment, productivity_comment, communication_comment, dependability_comment)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [employeeId, b.job_knowledge, b.productivity, b.attendance, b.overall, b.promotability_status, b.sign_off_date,
          b.form_type || null, b.eval_type || null, b.eval_period_from || null, b.eval_period_to || null,
          b.work_quality || null, b.communication || null, b.dependability || null,
          b.quantity_of_work || null, b.relationship_with_others || null, b.work_habits || null,
          b.promotability_score || null, b.employee_goals || null, b.additional_comments || null,
          b.supervisors_overall_comment || null, b.reviewers_comment || null, b.employee_acknowledgement || null,
          b.supervisor_signature || null, b.supervisor_signature_date || null,
          b.reviewer_signature || null, b.reviewer_signature_date || null,
          b.employee_signature || null, b.employee_signature_date || null, computedVerified,
          b.hr_signature || null, b.hr_signature_date || null,
          b.overall_rating || null, b.recommendation || null, b.reviewer_agree || null, b.revised_rating || null,
          b.status || null, b.employee_department || null, b.employee_title || null, b.probationary_period || null,
          resolvedSupervisorName, resolvedReviewerName, resolvedHrName, b.employee_print_name || null,
          supervisorUserId, reviewerUserId, hrOwnerUserId,
          b.job_knowledge_comment || null, b.work_quality_comment || null, b.attendance_comment || null, b.productivity_comment || null, b.communication_comment || null, b.dependability_comment || null]);

      if (isPerformanceEval && hrOwnerUserId) {
        await createNotification({ user_id: hrOwnerUserId, type: 'info', message: `A ${b.form_type || 'performance'} evaluation requires your HR signature`, source: 'appraisal_sign' });
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  // PUT /api/appraisals/:id â€” update verification signatures
  app.put("/api/appraisals/:id", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      const normalizedRole = normalizeUserRole(role);
      const actorCtx = await getActorOrgContext(Number(actor.id || 0));
      const appraisalRows: any = await query('SELECT * FROM appraisals WHERE id = ?', [req.params.id]);
      const appraisal = Array.isArray(appraisalRows) ? appraisalRows[0] : appraisalRows;
      if (!appraisal) return res.status(404).json({ error: 'Appraisal not found' });

      const appraisalEmpId = normalizeEmployeeId(appraisal.employee_id);
      if (isPrivilegedRole(role)) {
        if (normalizedRole === 'HR') {
          const hrDept = normalizeDept(actorCtx.dept);
          if (!hrDept) return res.status(403).json({ error: 'Forbidden' });
          const allowed = await canActorAccessEmployeeByDept(hrDept, appraisalEmpId);
          if (!allowed) return res.status(403).json({ error: 'Forbidden' });
          
          // HR ownership check: if this appraisal is assigned to a specific HR user, only that user can approve
          if (appraisal.hr_owner_user_id && appraisal.hr_owner_user_id !== actor.id) {
            const b = req.body;
            if (b && (b.hr_signature || b.hr_signature_date)) {
              return res.status(403).json({ error: 'This appraisal is assigned to another HR user' });
            }
          }
        }
      } else if (role === 'Manager') {
        const allowedByManagerMap = await canManagerAccessEmployee(actor.id, appraisalEmpId);
        if (!allowedByManagerMap) {
          const managerDept = normalizeDept(actorCtx.dept || actor.dept || actor.department);
          const allowedByDept = managerDept ? await canActorAccessEmployeeByDept(managerDept, appraisalEmpId) : false;
          if (!allowedByDept) return res.status(403).json({ error: 'Forbidden' });
        }
      } else if (role === 'Employee') {
        if (actorCtx.isSupervisor) {
          const supervisorDept = normalizeDept(actorCtx.dept);
          if (!supervisorDept) return res.status(403).json({ error: 'Forbidden' });
          const allowed = await canActorAccessEmployeeByDept(supervisorDept, appraisalEmpId);
          if (!allowed) return res.status(403).json({ error: 'Forbidden' });
        } else {
          const actorEmployeeId = normalizeEmployeeId(actor.employee_id) || normalizeEmployeeId(actorCtx.employeeId);
          if (!actorEmployeeId || actorEmployeeId !== appraisalEmpId) {
            return res.status(403).json({ error: 'Forbidden' });
          }
        }
      } else {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const b = req.body;
      const sets: string[] = [];
      const vals: any[] = [];
      const employeeUpdatable = ['employee_signature','employee_signature_date','employee_acknowledgement','employee_print_name'];
      const supervisorUpdatable = ['supervisor_signature','supervisor_signature_date','supervisor_print_name','supervisors_overall_comment'];
      const hrUpdatable = ['hr_signature','hr_signature_date','hr_print_name'];
      const managerHrUpdatable = ['supervisor_signature','supervisor_signature_date','reviewer_signature','reviewer_signature_date',
        'employee_signature','employee_signature_date','verified','promotability_status',
        'hr_signature','hr_signature_date','overall_rating','recommendation','reviewer_agree','revised_rating',
        'reviewers_comment','employee_acknowledgement','supervisors_overall_comment','status',
        'supervisor_print_name','reviewer_print_name','hr_print_name','employee_print_name'];

      let updatable = managerHrUpdatable;
      if (role === 'Employee') {
        updatable = actorCtx.isSupervisor ? supervisorUpdatable : employeeUpdatable;
      } else if (normalizedRole === 'HR') {
        updatable = hrUpdatable;
      }

      if (role === 'Employee' || normalizedRole === 'HR') {
        const disallowedKeys = Object.keys(b).filter((k) => !updatable.includes(k));
        if (disallowedKeys.length > 0) return res.status(403).json({ error: 'Forbidden fields in employee update' });
      }

      for (const k of updatable) {
        if (b[k] !== undefined) { sets.push(`${k} = ?`); vals.push(b[k]); }
      }

      if (b.supervisor_signature !== undefined && !appraisal.supervisor_user_id) {
        sets.push('supervisor_user_id = ?');
        vals.push(Number(actor.id || 0) || null);
      }
      if (b.reviewer_signature !== undefined && !appraisal.reviewer_user_id) {
        sets.push('reviewer_user_id = ?');
        vals.push(Number(actor.id || 0) || null);
      }

      if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });

      const merged: any = { ...appraisal, ...b };
      const mergedFormType = (merged.form_type || '').toString().toLowerCase();
      const isPerformanceEval = mergedFormType.includes('performance');
      const requiredSignatures = isPerformanceEval
        ? ['supervisor_signature', 'reviewer_signature', 'employee_signature', 'hr_signature']
        : ['supervisor_signature', 'employee_signature'];
      const computedVerified = requiredSignatures.every((k) => !!(merged[k] && `${merged[k]}`.trim())) ? 1 : 0;
      sets.push('verified = ?');
      vals.push(computedVerified);

      vals.push(req.params.id);
      await query(`UPDATE appraisals SET ${sets.join(', ')} WHERE id = ?`, vals);

      const wasReadyForEmployee = isPerformanceEval
        ? !!(appraisal.supervisor_signature && appraisal.reviewer_signature && !appraisal.employee_signature)
        : !!(appraisal.supervisor_signature && !appraisal.employee_signature);
      const isReadyForEmployee = isPerformanceEval
        ? !!(merged.supervisor_signature && merged.reviewer_signature && !merged.employee_signature)
        : !!(merged.supervisor_signature && !merged.employee_signature);

      if (!wasReadyForEmployee && isReadyForEmployee) {
        try {
          const eUsers: any = await query("SELECT id FROM users WHERE employee_id = ?", [appraisalEmpId]);
          const eUser = Array.isArray(eUsers) ? eUsers[0] : eUsers;
          if (eUser?.id) {
            await createNotification({
              user_id: eUser.id,
              type: 'info',
              message: `Your ${merged.form_type || 'performance'} evaluation is ready — please sign in Signature Queue`,
              source: 'appraisal_sign',
              employee_id: appraisalEmpId,
            });
          }
        } catch {}
      }

      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- Goals CRUD ----
  // Helper: enrich goals with assignees from goal_assignees table
  const enrichGoalsWithAssignees = async (goals: any[]): Promise<any[]> => {
    if (!Array.isArray(goals) || goals.length === 0) return goals;
    const goalIds = goals.map((g: any) => g.id).filter(Boolean);
    if (goalIds.length === 0) return goals;
    const aRows: any = await query(
      `SELECT ga.goal_id, ga.employee_id, e.name,
              ga.assigned_by, ga.assigned_by_role, ga.assigned_at,
              u.full_name as assigned_by_name, u.username as assigned_by_username
       FROM goal_assignees ga
       LEFT JOIN employees e ON ga.employee_id = e.id
       LEFT JOIN users u ON ga.assigned_by = u.id
       WHERE ga.goal_id IN (${goalIds.map(() => '?').join(',')})`,
      goalIds
    );
    const map: Record<number, { employee_id: number; name: string; assigned_by?: any; assigned_by_role?: string; assigned_at?: string; assigned_by_name?: string }[]> = {};
    for (const r of (Array.isArray(aRows) ? aRows : [])) {
      if (!map[r.goal_id]) map[r.goal_id] = [];
      map[r.goal_id].push({ employee_id: r.employee_id, name: r.name, assigned_by: r.assigned_by, assigned_by_role: r.assigned_by_role, assigned_at: r.assigned_at, assigned_by_name: r.assigned_by_name || r.assigned_by_username });
    }
    const withAssignees = goals.map((g: any) => ({ ...g, assignees: map[g.id] || [] }));
    const leaderIds = [...new Set(withAssignees.map((g: any) => g.leader_id).filter(Boolean))];
    if (leaderIds.length > 0) {
      const lRows: any = await query(`SELECT id, full_name, username FROM users WHERE id IN (${leaderIds.map(() => '?').join(',')})`, leaderIds);
      const lMap: Record<number, string> = {};
      for (const r of (Array.isArray(lRows) ? lRows : [])) lMap[r.id] = r.full_name || r.username;
      return withAssignees.map((g: any) => ({ ...g, leader_name: lMap[g.leader_id] || null }));
    }
    return withAssignees;
  };

  app.get("/api/goals", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      const queryEmployeeId = normalizeEmployeeId(req.query.employee_id);
      const includeArchived = String(req.query.include_archived || '0') === '1';

      if (isPrivilegedRole(role)) {
        const rows: any = queryEmployeeId
          ? await query(`SELECT g.*, e.name as employee_name, rg.role AS proof_reviewer_role FROM goals g LEFT JOIN employees e ON g.employee_id = e.id LEFT JOIN users rg ON rg.id = g.proof_reviewed_by WHERE g.employee_id = ? ${includeArchived ? '' : 'AND g.deleted_at IS NULL'}`, [queryEmployeeId])
          : await query(`SELECT g.*, e.name as employee_name, rg.role AS proof_reviewer_role FROM goals g LEFT JOIN employees e ON g.employee_id = e.id LEFT JOIN users rg ON rg.id = g.proof_reviewed_by ${includeArchived ? '' : 'WHERE g.deleted_at IS NULL'}`);
        return res.json(await enrichGoalsWithAssignees(Array.isArray(rows) ? rows : []));
      }

      if (role === 'Manager') {
        // Managers can view goals across all departments: Department, Team, and Individual.
        if (queryEmployeeId) {
          const rows: any = await query(`SELECT g.*, e.name as employee_name, rg.role AS proof_reviewer_role FROM goals g LEFT JOIN employees e ON g.employee_id = e.id LEFT JOIN users rg ON rg.id = g.proof_reviewed_by WHERE g.employee_id = ? ${includeArchived ? '' : 'AND g.deleted_at IS NULL'}`, [queryEmployeeId]);
          return res.json(await enrichGoalsWithAssignees(Array.isArray(rows) ? rows : []));
        }
        const rows: any = await query(`SELECT g.*, e.name as employee_name, rg.role AS proof_reviewer_role FROM goals g LEFT JOIN employees e ON g.employee_id = e.id LEFT JOIN users rg ON rg.id = g.proof_reviewed_by ${includeArchived ? '' : 'WHERE g.deleted_at IS NULL'}`);
        return res.json(await enrichGoalsWithAssignees(Array.isArray(rows) ? rows : []));
      }


      if (role === 'Employee') {
        const employeeId = normalizeEmployeeId(actor.employee_id);
        if (!employeeId) return res.json([]);
        const rows: any = await query(
          `SELECT g.*, e.name as employee_name, rg.role AS proof_reviewer_role FROM goals g LEFT JOIN employees e ON g.employee_id = e.id LEFT JOIN users rg ON rg.id = g.proof_reviewed_by WHERE (g.employee_id = ? OR g.id IN (SELECT goal_id FROM goal_assignees WHERE employee_id = ?)) ${includeArchived ? '' : 'AND g.deleted_at IS NULL'}`,
          [employeeId, employeeId]
        );
        return res.json(await enrichGoalsWithAssignees(Array.isArray(rows) ? rows : []));
      }

      return res.status(403).json({ error: 'Forbidden' });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // Consolidated employee performance metrics for manager/HR dashboards.
  app.get('/api/performance/employees', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = normalizeUserRole(actor.role) || String(actor.role || '');
      const actorCtx = await getActorOrgContext(Number(actor.id || 0));
      const queryEmployeeId = normalizeEmployeeId(req.query.employee_id);

      if (!isPrivilegedRole(role) && role !== 'Manager' && role !== 'Employee') {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const whereClauses: string[] = [];
      const params: any[] = [];

      if (role === 'Employee') {
        const actorEmployeeId = normalizeEmployeeId(actor.employee_id) || normalizeEmployeeId(actorCtx.employeeId);
        if (!actorEmployeeId) return res.json({ employees: [], summary: null, generated_at: new Date().toISOString() });
        whereClauses.push('e.id = ?');
        params.push(actorEmployeeId);
      } else if (role === 'Manager') {
        const managerDept = normalizeDept(actorCtx.dept || actor.dept || actor.department);
        const managerEmployeeId = normalizeEmployeeId(actor.employee_id) || normalizeEmployeeId(actorCtx.employeeId);
        if (managerDept && managerEmployeeId) {
          whereClauses.push("(LOWER(TRIM(COALESCE(e.dept, ''))) = LOWER(TRIM(?)) OR e.manager_id = ?)");
          params.push(managerDept, managerEmployeeId);
        } else if (managerDept) {
          whereClauses.push("LOWER(TRIM(COALESCE(e.dept, ''))) = LOWER(TRIM(?))");
          params.push(managerDept);
        } else if (managerEmployeeId) {
          whereClauses.push('e.manager_id = ?');
          params.push(managerEmployeeId);
        }
      } else if (role === 'HR') {
        const hrDept = normalizeDept(actorCtx.dept || actor.dept || actor.department);
        if (hrDept) {
          whereClauses.push("LOWER(TRIM(COALESCE(e.dept, ''))) = LOWER(TRIM(?))");
          params.push(hrDept);
        }
      }

      if (queryEmployeeId) {
        whereClauses.push('e.id = ?');
        params.push(queryEmployeeId);
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
      // Only count goals the employee directly owns or leads, not goals they're assigned to
      const ownedLeadGoalIdsSql = `
            SELECT g.id
            FROM goals g
            WHERE g.employee_id = e.id
            AND g.deleted_at IS NULL
            UNION
            SELECT g3.id
            FROM goals g3
            WHERE g3.deleted_at IS NULL
              AND g3.leader_id IN (
                SELECT u.id
                FROM users u
                WHERE u.employee_id = e.id
              )
      `;
              const assignedGoalIdsSql = `
                SELECT ga.goal_id
                FROM goal_assignees ga
                INNER JOIN goals g2 ON g2.id = ga.goal_id AND g2.deleted_at IS NULL
                WHERE ga.employee_id = e.id
              `;
              const assignedRatedGoalIdsSql = `
                SELECT DISTINCT ga.goal_id
                FROM goal_assignees ga
                INNER JOIN goals g4 ON g4.id = ga.goal_id AND g4.deleted_at IS NULL
                WHERE ga.employee_id = e.id
                  AND EXISTS (
                    SELECT 1
                    FROM goal_member_tasks t
                    WHERE t.goal_id = ga.goal_id
                  AND t.member_employee_id = e.id
                  AND t.deleted_at IS NULL
                  AND t.proof_review_rating IS NOT NULL
                  )
              `;
              const completedGoalIdsSql = `
                SELECT g.id
                FROM goals g
                WHERE g.id IN (
            ${ownedLeadGoalIdsSql}
                )
                  AND COALESCE(g.status, 'Not Started') = 'Completed'
                UNION
                SELECT g.id
                FROM goals g
                WHERE g.id IN (
            ${assignedRatedGoalIdsSql}
                )
              `;
      const scoredGoalIdsSql = `
            SELECT g.id
            FROM goals g
            WHERE g.id IN (
${ownedLeadGoalIdsSql}
            )
            UNION
            SELECT g2.id
            FROM goals g2
            WHERE g2.id IN (
${assignedRatedGoalIdsSql}
            )
      `;
      const relevantGoalIdsSql = `
            SELECT g.id
            FROM goals g
            WHERE g.employee_id = e.id
            AND g.deleted_at IS NULL
            UNION
                SELECT ga.goal_id
                FROM (
            ${assignedGoalIdsSql}
                ) ga
            UNION
            SELECT g3.id
            FROM goals g3
            WHERE g3.deleted_at IS NULL
              AND g3.leader_id IN (
                SELECT u.id
                FROM users u
                WHERE u.employee_id = e.id
              )
      `;
      // Date comparison that works in both PostgreSQL (text vs date) and SQLite
      const todaySql = usePostgres ? `TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')` : `DATE('now')`;

      const rows: any = await query(
        `SELECT
          e.id AS employee_id,
          e.name AS employee_name,
          e.position,
          e.dept,

          (SELECT COUNT(*) FROM goals g WHERE g.id IN (
${relevantGoalIdsSql}
          )) AS goals_total,
          (SELECT COUNT(*) FROM goals g WHERE g.id IN (
${relevantGoalIdsSql}
          ) AND LOWER(TRIM(COALESCE(g.status, 'Not Started'))) = 'in progress') AS goals_active,
          (SELECT COUNT(*) FROM (
            SELECT cg.id FROM goals cg WHERE cg.id IN (
${completedGoalIdsSql}
            )
          ) completed_rows) AS goals_completed,
          (SELECT COUNT(*) FROM goals g WHERE g.id IN (
${relevantGoalIdsSql}
          ) AND COALESCE(g.status, 'Not Started') = 'At Risk') AS goals_at_risk,
          (SELECT COUNT(*) FROM goals g WHERE g.id IN (
${relevantGoalIdsSql}
          ) AND g.target_date IS NOT NULL AND g.target_date < ${todaySql} AND COALESCE(g.status, 'Not Started') <> 'Cancelled' AND COALESCE(g.status, 'Not Started') <> 'Completed') AS goals_overdue,
          (SELECT ROUND(COALESCE(AVG(g.progress), 0), 1) FROM goals g WHERE g.id IN (
${scoredGoalIdsSql}
          )) AS goals_avg_progress,

          (SELECT COUNT(*) FROM goal_assignees ga INNER JOIN goals g ON g.id = ga.goal_id AND g.deleted_at IS NULL WHERE ga.employee_id = e.id) AS delegated_goal_count,
          (SELECT COUNT(*) FROM goal_assignees ga INNER JOIN goals g ON g.id = ga.goal_id AND g.deleted_at IS NULL WHERE ga.employee_id = e.id AND COALESCE(g.scope, 'Individual') = 'Team') AS team_goal_count,
          (SELECT COUNT(*) FROM goal_assignees ga INNER JOIN goals g ON g.id = ga.goal_id AND g.deleted_at IS NULL WHERE ga.employee_id = e.id AND COALESCE(g.scope, 'Individual') = 'Department') AS department_goal_count,
          (SELECT COUNT(*) FROM goal_assignees ga INNER JOIN goals g ON g.id = ga.goal_id AND g.deleted_at IS NULL WHERE ga.employee_id = e.id AND NOT EXISTS (SELECT 1 FROM goal_member_tasks t WHERE t.goal_id = ga.goal_id AND t.member_employee_id = e.id AND t.deleted_at IS NULL AND t.proof_review_rating IS NOT NULL)) AS assigned_unrated_goals_count,

          (SELECT COUNT(*) FROM pip_plans p WHERE p.employee_id = e.id) AS pip_count,
          (SELECT COUNT(*) FROM development_plans d WHERE d.employee_id = e.id) AS idp_count,

          (SELECT COUNT(*) FROM goal_member_tasks t WHERE t.member_employee_id = e.id) AS recovery_tasks_total,
          (SELECT COUNT(*) FROM goal_member_tasks t WHERE t.member_employee_id = e.id AND COALESCE(t.status, 'Not Started') NOT IN ('Completed', 'Cancelled')) AS recovery_tasks_open,
          (SELECT COUNT(*) FROM goal_member_tasks t WHERE t.member_employee_id = e.id AND COALESCE(t.status, 'Not Started') = 'Completed') AS recovery_tasks_completed,
          (SELECT COUNT(*) FROM (
            SELECT t.id
            FROM goal_member_tasks t
            LEFT JOIN users ur ON ur.id = t.proof_reviewed_by
            WHERE t.member_employee_id = e.id
              AND COALESCE(t.proof_review_status, 'Not Submitted') = 'Approved'
              AND LOWER(TRIM(COALESCE(t.proof_reviewed_role, ur.role, ''))) = 'manager'
            UNION ALL
            SELECT g.id
            FROM goals g
            LEFT JOIN users ur ON ur.id = g.proof_reviewed_by
            WHERE g.id IN (
${relevantGoalIdsSql}
            )
              AND COALESCE(g.proof_review_status, 'Not Submitted') = 'Approved'
              AND LOWER(TRIM(COALESCE(g.proof_reviewed_role, ur.role, ''))) = 'manager'
          ) proof_approved_rows) AS proofs_approved,
          (SELECT COUNT(*) FROM (
            SELECT t.id
            FROM goal_member_tasks t
            WHERE t.member_employee_id = e.id AND COALESCE(t.proof_review_status, 'Not Submitted') = 'Rejected'
            UNION ALL
            SELECT g.id
            FROM goals g
            WHERE g.id IN (
${relevantGoalIdsSql}
            ) AND COALESCE(g.proof_review_status, 'Not Submitted') = 'Rejected'
          ) proof_rejected_rows) AS proofs_rejected,
          (SELECT COUNT(*) FROM (
            SELECT t.id
            FROM goal_member_tasks t
            WHERE t.member_employee_id = e.id AND COALESCE(t.proof_review_status, 'Not Submitted') = 'Needs Revision'
            UNION ALL
            SELECT g.id
            FROM goals g
            WHERE g.id IN (
${relevantGoalIdsSql}
            ) AND COALESCE(g.proof_review_status, 'Not Submitted') = 'Needs Revision'
          ) proof_revision_rows) AS proofs_needs_revision,
          (SELECT COUNT(*) FROM (
            SELECT t.id
            FROM goal_member_tasks t
            WHERE t.member_employee_id = e.id AND COALESCE(t.proof_review_status, 'Not Submitted') = 'Needs Revision'
            UNION ALL
            SELECT g.id
            FROM goals g
            WHERE g.id IN (
${relevantGoalIdsSql}
            ) AND COALESCE(g.proof_review_status, 'Not Submitted') = 'Needs Revision'
          ) goal_revision_rows) AS goal_revisions_count,
          (SELECT COUNT(*) FROM goal_member_tasks t WHERE t.member_employee_id = e.id AND t.proof_review_rating IS NOT NULL) AS member_proof_ratings_count,
          (SELECT ROUND(COALESCE(AVG(t.proof_review_rating), 0), 2) FROM goal_member_tasks t WHERE t.member_employee_id = e.id AND t.proof_review_rating IS NOT NULL) AS member_proof_rating_avg,
          (SELECT COUNT(*) FROM goals g WHERE g.deleted_at IS NULL AND g.proof_review_rating IS NOT NULL AND (g.employee_id = e.id OR g.leader_id IN (SELECT u.id FROM users u WHERE u.employee_id = e.id))) AS leader_proof_ratings_count,
          (SELECT ROUND(COALESCE(AVG(g.proof_review_rating), 0), 2) FROM goals g WHERE g.deleted_at IS NULL AND g.proof_review_rating IS NOT NULL AND (g.employee_id = e.id OR g.leader_id IN (SELECT u.id FROM users u WHERE u.employee_id = e.id))) AS leader_proof_rating_avg,
          (SELECT COUNT(*) FROM (
            SELECT t.proof_review_rating AS rating FROM goal_member_tasks t WHERE t.member_employee_id = e.id AND t.proof_review_rating IS NOT NULL
            UNION ALL
            SELECT g.proof_review_rating AS rating FROM goals g WHERE g.deleted_at IS NULL AND g.proof_review_rating IS NOT NULL AND (g.employee_id = e.id OR g.leader_id IN (SELECT u.id FROM users u WHERE u.employee_id = e.id))
          ) proof_ratings) AS proof_ratings_count,
          (SELECT ROUND(COALESCE(AVG(proof_ratings.rating), 0), 2) FROM (
            SELECT t.proof_review_rating AS rating FROM goal_member_tasks t WHERE t.member_employee_id = e.id AND t.proof_review_rating IS NOT NULL
            UNION ALL
            SELECT g.proof_review_rating AS rating FROM goals g WHERE g.deleted_at IS NULL AND g.proof_review_rating IS NOT NULL AND (g.employee_id = e.id OR g.leader_id IN (SELECT u.id FROM users u WHERE u.employee_id = e.id))
          ) proof_ratings) AS proof_rating_avg,

          (SELECT COUNT(*) FROM self_assessments s WHERE s.employee_id = e.id) AS self_assessments_count,
          (SELECT MAX(s.created_at) FROM self_assessments s WHERE s.employee_id = e.id) AS last_self_assessment_at,

          (SELECT COUNT(*) FROM appraisals a WHERE a.employee_id = e.id) AS appraisals_count,
          (SELECT COUNT(*) FROM appraisals a WHERE a.employee_id = e.id) AS performance_evaluation_forms_count,
          (SELECT ROUND(COALESCE(AVG(COALESCE(a.overall, 0)), 0), 2) FROM appraisals a WHERE a.employee_id = e.id) AS appraisals_avg_overall,
          (SELECT MAX(a.sign_off_date) FROM appraisals a WHERE a.employee_id = e.id) AS last_appraisal_signoff,

          (SELECT COUNT(*) FROM discipline_records d WHERE d.employee_id = e.id AND d.deleted_at IS NULL) AS disciplinary_count,
          (SELECT COUNT(*) FROM discipline_records d WHERE d.employee_id = e.id AND d.deleted_at IS NULL AND COALESCE(TRIM(d.violation_type), '') <> '') AS disciplinary_violation_entries_count,
          (SELECT COUNT(*) FROM discipline_records d WHERE d.employee_id = e.id AND d.deleted_at IS NULL AND COALESCE(TRIM(d.action_taken), '') <> '') AS disciplinary_actions_count,
          (SELECT MAX(d.date_of_warning) FROM discipline_records d WHERE d.employee_id = e.id AND d.deleted_at IS NULL) AS last_disciplinary_date,

          (SELECT COUNT(*) FROM feedback_360 f WHERE LOWER(TRIM(COALESCE(f.target_employee_name, ''))) = LOWER(TRIM(COALESCE(e.name, '')))) AS feedback_360_count,

          (SELECT COUNT(*) FROM suggestions s WHERE s.employee_id = e.id) AS suggestions_count,
          (SELECT MAX(s.created_at) FROM suggestions s WHERE s.employee_id = e.id) AS last_suggestion_date,

          (SELECT COUNT(*) FROM onboarding o WHERE o.employee_id = e.id) AS onboarding_count,
          (SELECT COUNT(*) FROM onboarding o WHERE o.employee_id = e.id AND COALESCE(o.employee_signature, '') <> '') AS onboarding_signed_count,

          (SELECT COUNT(*) FROM property_accountability p WHERE p.employee_id = e.id) AS property_forms_count,
          (SELECT COUNT(*) FROM property_accountability p WHERE p.employee_id = e.id AND COALESCE(p.received_by_sig, '') <> '') AS property_signed_count,

          (SELECT COUNT(*) FROM exit_interviews ex WHERE LOWER(TRIM(COALESCE(ex.employee_name, ''))) = LOWER(TRIM(COALESCE(e.name, '')))) AS exit_interviews_count,
          (SELECT COUNT(*) FROM exit_interviews ex WHERE LOWER(TRIM(COALESCE(ex.employee_name, ''))) = LOWER(TRIM(COALESCE(e.name, ''))) AND COALESCE(ex.employee_sig, '') <> '') AS exit_interviews_signed_count,

          (SELECT COUNT(*) FROM coaching_logs cl WHERE cl.employee_id = e.id) AS coaching_logs_count,
          (SELECT MAX(cl.created_at) FROM coaching_logs cl WHERE cl.employee_id = e.id) AS last_coaching_log_at,

          (SELECT COUNT(*) FROM goal_improvement_plans gip LEFT JOIN goals g ON g.id = gip.goal_id WHERE LOWER(TRIM(COALESCE(g.department, ''))) = LOWER(TRIM(COALESCE(e.dept, ''))) AND COALESCE(g.scope, 'Individual') = 'Team') AS team_improvement_plans,
          (SELECT COUNT(*) FROM goal_development_plans gdp LEFT JOIN goals g ON g.id = gdp.goal_id WHERE LOWER(TRIM(COALESCE(g.department, ''))) = LOWER(TRIM(COALESCE(e.dept, ''))) AND COALESCE(g.scope, 'Individual') = 'Team') AS team_development_plans,
          (SELECT COUNT(*) FROM goal_improvement_plans gip LEFT JOIN goals g ON g.id = gip.goal_id WHERE LOWER(TRIM(COALESCE(g.department, ''))) = LOWER(TRIM(COALESCE(e.dept, ''))) AND COALESCE(g.scope, 'Individual') = 'Department') AS department_improvement_plans,
          (SELECT COUNT(*) FROM goal_development_plans gdp LEFT JOIN goals g ON g.id = gdp.goal_id WHERE LOWER(TRIM(COALESCE(g.department, ''))) = LOWER(TRIM(COALESCE(e.dept, ''))) AND COALESCE(g.scope, 'Individual') = 'Department') AS department_development_plans

        FROM employees e
        ${whereSql}
        ORDER BY e.name ASC`,
        params
      );

      const list = (Array.isArray(rows) ? rows : []).map((r: any) => {
        const goalsTotal = Number(r.goals_total || 0);
        const goalsCompleted = Number(r.goals_completed || 0);
        const completionRate = goalsTotal > 0 ? Math.round((goalsCompleted / goalsTotal) * 100) : 0;
        const selfAssessmentsCount = Number(r.self_assessments_count || 0);
        const appraisalsCount = Number(r.appraisals_count || 0);
        const disciplinaryCount = Number(r.disciplinary_count || 0);
        const feedbackCount = Number(r.feedback_360_count || 0);
        const suggestionsCount = Number(r.suggestions_count || 0);
        const onboardingCount = Number(r.onboarding_count || 0);
        const propertyFormsCount = Number(r.property_forms_count || 0);
        const exitInterviewsCount = Number(r.exit_interviews_count || 0);
        const coachingLogsCount = Number(r.coaching_logs_count || 0);
        const formsTotalCount =
          selfAssessmentsCount +
          appraisalsCount +
          disciplinaryCount +
          feedbackCount +
          suggestionsCount +
          onboardingCount +
          propertyFormsCount +
          exitInterviewsCount +
          coachingLogsCount;
        return {
          employee_id: Number(r.employee_id),
          employee_name: r.employee_name || 'Unknown',
          position: r.position || null,
          dept: r.dept || null,
          goals_total: goalsTotal,
          goals_active: Number(r.goals_active || 0),
          goals_completed: goalsCompleted,
          goals_at_risk: Number(r.goals_at_risk || 0),
          goals_overdue: Number(r.goals_overdue || 0),
          goals_avg_progress: Number(r.goals_avg_progress || 0),
          goals_completion_rate: completionRate,
          delegated_goal_count: Number(r.delegated_goal_count || 0),
          team_goal_count: Number(r.team_goal_count || 0),
          department_goal_count: Number(r.department_goal_count || 0),
          assigned_unrated_goals_count: Number(r.assigned_unrated_goals_count || 0),
          pip_count: Number(r.pip_count || 0),
          idp_count: Number(r.idp_count || 0),
          recovery_tasks_total: Number(r.recovery_tasks_total || 0),
          recovery_tasks_open: Number(r.recovery_tasks_open || 0),
          recovery_tasks_completed: Number(r.recovery_tasks_completed || 0),
          proofs_approved: Number(r.proofs_approved || 0),
          proofs_rejected: Number(r.proofs_rejected || 0),
          proofs_needs_revision: Number(r.proofs_needs_revision || 0),
          goal_revisions_count: Number(r.goal_revisions_count || 0),
          member_proof_ratings_count: Number(r.member_proof_ratings_count || 0),
          member_proof_rating_avg: Number(r.member_proof_rating_avg || 0),
          leader_proof_ratings_count: Number(r.leader_proof_ratings_count || 0),
          leader_proof_rating_avg: Number(r.leader_proof_rating_avg || 0),
          proof_ratings_count: Number(r.proof_ratings_count || 0),
          proof_rating_avg: Number(r.proof_rating_avg || 0),
          self_assessments_count: selfAssessmentsCount,
          last_self_assessment_at: r.last_self_assessment_at || null,
          appraisals_count: appraisalsCount,
          performance_evaluation_forms_count: Number(r.performance_evaluation_forms_count || 0),
          appraisals_avg_overall: Number(r.appraisals_avg_overall || 0),
          last_appraisal_signoff: r.last_appraisal_signoff || null,
          disciplinary_count: disciplinaryCount,
          disciplinary_violation_entries_count: Number(r.disciplinary_violation_entries_count || 0),
          disciplinary_actions_count: Number(r.disciplinary_actions_count || 0),
          last_disciplinary_date: r.last_disciplinary_date || null,
          feedback_360_count: feedbackCount,
          suggestions_count: suggestionsCount,
          last_suggestion_date: r.last_suggestion_date || null,
          onboarding_count: onboardingCount,
          onboarding_signed_count: Number(r.onboarding_signed_count || 0),
          property_forms_count: propertyFormsCount,
          property_signed_count: Number(r.property_signed_count || 0),
          exit_interviews_count: exitInterviewsCount,
          exit_interviews_signed_count: Number(r.exit_interviews_signed_count || 0),
          coaching_logs_count: coachingLogsCount,
          last_coaching_log_at: r.last_coaching_log_at || null,
          forms_total_count: formsTotalCount,
          team_improvement_plans: Number(r.team_improvement_plans || 0),
          team_development_plans: Number(r.team_development_plans || 0),
          department_improvement_plans: Number(r.department_improvement_plans || 0),
          department_development_plans: Number(r.department_development_plans || 0),
        };
      });

      const uniqueGoalSummaryRows: any = await query(
        `WITH scoped_employees AS (
           SELECT e.id
           FROM employees e
           ${whereSql}
         ),
         scoped_goals AS (
           SELECT DISTINCT g.id, LOWER(TRIM(COALESCE(g.status, 'Not Started'))) AS status
           FROM goals g
           WHERE g.deleted_at IS NULL
             AND (
               g.employee_id IN (SELECT id FROM scoped_employees)
               OR g.leader_id IN (
                 SELECT u.id
                 FROM users u
                 WHERE u.employee_id IN (SELECT id FROM scoped_employees)
               )
               OR g.id IN (
                 SELECT ga.goal_id
                 FROM goal_assignees ga
                 WHERE ga.employee_id IN (SELECT id FROM scoped_employees)
               )
             )
         )
         SELECT
           COUNT(*) AS total_goals,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS total_completed_goals,
           SUM(CASE WHEN status = 'in progress' THEN 1 ELSE 0 END) AS total_active_goals
         FROM scoped_goals`,
        params
      );
      const uniqueGoalSummary = (Array.isArray(uniqueGoalSummaryRows) ? uniqueGoalSummaryRows[0] : uniqueGoalSummaryRows) || {};

      const summary = list.length === 0 ? null : {
        employees: list.length,
        avg_goal_progress: Math.round(list.reduce((sum: number, item: any) => sum + Number(item.goals_completion_rate || 0), 0) / list.length),
        avg_proof_rating: Number((list.reduce((sum: number, item: any) => sum + Number(item.proof_rating_avg || 0), 0) / list.length).toFixed(2)),
        total_goals: Number(uniqueGoalSummary.total_goals || 0),
        total_completed_goals: Number(uniqueGoalSummary.total_completed_goals || 0),
        total_active_goals: Number(uniqueGoalSummary.total_active_goals || 0),
        total_pips: list.reduce((sum: number, item: any) => sum + Number(item.pip_count || 0), 0),
        total_idps: list.reduce((sum: number, item: any) => sum + Number(item.idp_count || 0), 0),
        total_appraisals: list.reduce((sum: number, item: any) => sum + Number(item.appraisals_count || 0), 0),
        total_disciplinary: list.reduce((sum: number, item: any) => sum + Number(item.disciplinary_count || 0), 0),
        total_self_assessments: list.reduce((sum: number, item: any) => sum + Number(item.self_assessments_count || 0), 0),
        total_forms: list.reduce((sum: number, item: any) => sum + Number(item.forms_total_count || 0), 0),
        total_suggestions: list.reduce((sum: number, item: any) => sum + Number(item.suggestions_count || 0), 0),
        total_onboarding: list.reduce((sum: number, item: any) => sum + Number(item.onboarding_count || 0), 0),
        total_property_forms: list.reduce((sum: number, item: any) => sum + Number(item.property_forms_count || 0), 0),
        total_exit_interviews: list.reduce((sum: number, item: any) => sum + Number(item.exit_interviews_count || 0), 0),
      };

      return res.json({
        employees: list,
        summary,
        generated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('GET /api/performance/employees error:', err);

      // Graceful fallback so the dashboard can still load even when advanced
      // metrics columns/tables are not yet present in a deployed database.
      try {
        const actor = (req as any).user || {};
        const role = normalizeUserRole(actor.role) || String(actor.role || '');
        const actorCtx = await getActorOrgContext(Number(actor.id || 0));
        const queryEmployeeId = normalizeEmployeeId(req.query.employee_id);

        const whereClauses: string[] = [];
        const params: any[] = [];

        if (role === 'Employee') {
          const actorEmployeeId = normalizeEmployeeId(actor.employee_id) || normalizeEmployeeId(actorCtx.employeeId);
          if (actorEmployeeId) {
            whereClauses.push('e.id = ?');
            params.push(actorEmployeeId);
          }
        } else if (role === 'Manager') {
          const managerDept = normalizeDept(actorCtx.dept || actor.dept || actor.department);
          const managerEmployeeId = normalizeEmployeeId(actor.employee_id) || normalizeEmployeeId(actorCtx.employeeId);
          if (managerDept && managerEmployeeId) {
            whereClauses.push("(LOWER(TRIM(COALESCE(e.dept, ''))) = LOWER(TRIM(?)) OR e.manager_id = ?)");
            params.push(managerDept, managerEmployeeId);
          } else if (managerDept) {
            whereClauses.push("LOWER(TRIM(COALESCE(e.dept, ''))) = LOWER(TRIM(?))");
            params.push(managerDept);
          } else if (managerEmployeeId) {
            whereClauses.push('e.manager_id = ?');
            params.push(managerEmployeeId);
          }
        } else if (role === 'HR') {
          const hrDept = normalizeDept(actorCtx.dept || actor.dept || actor.department);
          if (hrDept) {
            whereClauses.push("LOWER(TRIM(COALESCE(e.dept, ''))) = LOWER(TRIM(?))");
            params.push(hrDept);
          }
        }

        if (queryEmployeeId) {
          whereClauses.push('e.id = ?');
          params.push(queryEmployeeId);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        const baseRows: any = await query(
          `SELECT e.id AS employee_id, e.name AS employee_name, e.position, e.dept
           FROM employees e
           ${whereSql}
           ORDER BY e.name ASC`,
          params
        );

        const safeCount = async (sql: string, sqlParams: any[] = []) => {
          try {
            const rows: any = await query(sql, sqlParams);
            const row = Array.isArray(rows) ? rows[0] : rows;
            if (!row) return 0;
            const key = Object.keys(row)[0];
            return Number((row as any)[key] || 0);
          } catch {
            return 0;
          }
        };

        const safeNumber = async (sql: string, sqlParams: any[] = []) => {
          try {
            const rows: any = await query(sql, sqlParams);
            const row = Array.isArray(rows) ? rows[0] : rows;
            if (!row) return 0;
            const key = Object.keys(row)[0];
            return Number((row as any)[key] || 0);
          } catch {
            return 0;
          }
        };

        const safeText = async (sql: string, sqlParams: any[] = []) => {
          try {
            const rows: any = await query(sql, sqlParams);
            const row = Array.isArray(rows) ? rows[0] : rows;
            if (!row) return null;
            const key = Object.keys(row)[0];
            const value = (row as any)[key];
            return value ?? null;
          } catch {
            return null;
          }
        };

        const list = await Promise.all((Array.isArray(baseRows) ? baseRows : []).map(async (r: any) => {
          const employeeId = Number(r.employee_id || 0);
          const employeeName = String(r.employee_name || '');

          // Only count goals the employee directly owns or leads, not goals they're assigned to
          const ownedLeadGoalIdsSql = `
            SELECT g.id FROM goals g WHERE g.employee_id = ? AND g.deleted_at IS NULL
            UNION
            SELECT g3.id FROM goals g3 WHERE g3.deleted_at IS NULL AND g3.leader_id IN (SELECT u.id FROM users u WHERE u.employee_id = ?)
          `;
          const assignedGoalIdsSql = `
            SELECT ga.goal_id
            FROM goal_assignees ga
            INNER JOIN goals g2 ON g2.id = ga.goal_id AND g2.deleted_at IS NULL
            WHERE ga.employee_id = ?
          `;
          const assignedRatedGoalIdsSql = `
            SELECT DISTINCT ga.goal_id
            FROM goal_assignees ga
            INNER JOIN goals g4 ON g4.id = ga.goal_id AND g4.deleted_at IS NULL
            WHERE ga.employee_id = ?
              AND EXISTS (
                SELECT 1
                FROM goal_member_tasks t
                WHERE t.goal_id = ga.goal_id
                  AND t.member_employee_id = ?
                  AND t.deleted_at IS NULL
                  AND t.proof_review_rating IS NOT NULL
              )
          `;
          const relevantGoalIdsSql = `
            SELECT g.id FROM goals g WHERE g.id IN (${ownedLeadGoalIdsSql})
            UNION
            SELECT g2.id FROM goals g2 WHERE g2.id IN (${assignedGoalIdsSql})
          `;
          const completedGoalIdsSql = `
            SELECT g.id FROM goals g WHERE g.id IN (${ownedLeadGoalIdsSql}) AND COALESCE(g.status, 'Not Started') = 'Completed'
            UNION
            SELECT g2.id FROM goals g2 WHERE g2.id IN (${assignedRatedGoalIdsSql})
          `;
          const scoredGoalIdsSql = `
            SELECT g.id FROM goals g WHERE g.id IN (${ownedLeadGoalIdsSql})
            UNION
            SELECT g2.id FROM goals g2 WHERE g2.id IN (${assignedRatedGoalIdsSql})
          `;
          const todaySql = usePostgres ? `TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')` : `DATE('now')`;
          const goalsTotal = await safeCount(`SELECT COUNT(*) AS c FROM goals g WHERE g.id IN (${relevantGoalIdsSql})`, [employeeId, employeeId, employeeId]);
          const goalsCompleted = await safeCount(`SELECT COUNT(*) AS c FROM (SELECT cg.id FROM goals cg WHERE cg.id IN (${completedGoalIdsSql})) completed_rows`, [employeeId, employeeId, employeeId, employeeId]);
          const goalsActive = await safeCount(`SELECT COUNT(*) AS c FROM goals g WHERE g.id IN (${relevantGoalIdsSql}) AND LOWER(TRIM(COALESCE(g.status, 'Not Started'))) = 'in progress'`, [employeeId, employeeId, employeeId]);
          const goalsAtRisk = await safeCount(`SELECT COUNT(*) AS c FROM goals g WHERE g.id IN (${relevantGoalIdsSql}) AND COALESCE(g.status, 'Not Started') = 'At Risk'`, [employeeId, employeeId, employeeId]);
          const goalsOverdue = await safeCount(`SELECT COUNT(*) AS c FROM goals g WHERE g.id IN (${relevantGoalIdsSql}) AND g.target_date IS NOT NULL AND g.target_date < ${todaySql} AND COALESCE(g.status, 'Not Started') <> 'Cancelled' AND COALESCE(g.status, 'Not Started') <> 'Completed'`, [employeeId, employeeId, employeeId]);
          const goalsAvgProgress = await safeNumber(`SELECT ROUND(COALESCE(AVG(g.progress), 0), 1) AS avg_p FROM goals g WHERE g.id IN (${scoredGoalIdsSql})`, [employeeId, employeeId, employeeId, employeeId]);
          const assignedUnratedGoalsCount = await safeCount(`SELECT COUNT(*) AS c FROM goal_assignees ga INNER JOIN goals g ON g.id = ga.goal_id AND g.deleted_at IS NULL WHERE ga.employee_id = ? AND NOT EXISTS (SELECT 1 FROM goal_member_tasks t WHERE t.goal_id = ga.goal_id AND t.member_employee_id = ? AND t.deleted_at IS NULL AND t.proof_review_rating IS NOT NULL)`, [employeeId, employeeId]);
          const appraisalsCount = await safeCount('SELECT COUNT(*) AS c FROM appraisals WHERE employee_id = ?', [employeeId]);
          const appraisalsAvg = await safeNumber('SELECT ROUND(COALESCE(AVG(COALESCE(overall, 0)), 0), 2) AS avg_overall FROM appraisals WHERE employee_id = ?', [employeeId]);
          const disciplinaryCount = await safeCount('SELECT COUNT(*) AS c FROM discipline_records WHERE employee_id = ?', [employeeId]);
          const disciplinaryViolationEntriesCount = await safeCount("SELECT COUNT(*) AS c FROM discipline_records WHERE employee_id = ? AND COALESCE(TRIM(violation_type), '') <> ''", [employeeId]);
          const disciplinaryActionsCount = await safeCount("SELECT COUNT(*) AS c FROM discipline_records WHERE employee_id = ? AND COALESCE(TRIM(action_taken), '') <> ''", [employeeId]);
          const selfAssessmentsCount = await safeCount('SELECT COUNT(*) AS c FROM self_assessments WHERE employee_id = ?', [employeeId]);
          const feedbackCount = await safeCount("SELECT COUNT(*) AS c FROM feedback_360 WHERE LOWER(TRIM(COALESCE(target_employee_name, ''))) = LOWER(TRIM(?))", [employeeName]);
          const suggestionsCount = await safeCount('SELECT COUNT(*) AS c FROM suggestions WHERE employee_id = ?', [employeeId]);
          const onboardingCount = await safeCount('SELECT COUNT(*) AS c FROM onboarding WHERE employee_id = ?', [employeeId]);
          const onboardingSignedCount = await safeCount("SELECT COUNT(*) AS c FROM onboarding WHERE employee_id = ? AND COALESCE(employee_signature, '') <> ''", [employeeId]);
          const propertyFormsCount = await safeCount('SELECT COUNT(*) AS c FROM property_accountability WHERE employee_id = ?', [employeeId]);
          const propertySignedCount = await safeCount("SELECT COUNT(*) AS c FROM property_accountability WHERE employee_id = ? AND COALESCE(received_by_sig, '') <> ''", [employeeId]);
          const exitInterviewsCount = await safeCount("SELECT COUNT(*) AS c FROM exit_interviews WHERE LOWER(TRIM(COALESCE(employee_name, ''))) = LOWER(TRIM(?))", [employeeName]);
          const exitInterviewsSignedCount = await safeCount("SELECT COUNT(*) AS c FROM exit_interviews WHERE LOWER(TRIM(COALESCE(employee_name, ''))) = LOWER(TRIM(?)) AND COALESCE(employee_sig, '') <> ''", [employeeName]);
          const coachingLogsCount = await safeCount('SELECT COUNT(*) AS c FROM coaching_logs WHERE employee_id = ?', [employeeId]);
          const pipCount = await safeCount('SELECT COUNT(*) AS c FROM pip_plans WHERE employee_id = ?', [employeeId]);
          const idpCount = await safeCount('SELECT COUNT(*) AS c FROM development_plans WHERE employee_id = ?', [employeeId]);
          const memberProofRatingsCount = await safeCount(
            `SELECT COUNT(*) AS c FROM goal_member_tasks t WHERE t.member_employee_id = ? AND t.proof_review_rating IS NOT NULL`,
            [employeeId]
          );
          const memberProofRatingAvg = await safeNumber(
            `SELECT ROUND(COALESCE(AVG(t.proof_review_rating), 0), 2) AS avg_rating FROM goal_member_tasks t WHERE t.member_employee_id = ? AND t.proof_review_rating IS NOT NULL`,
            [employeeId]
          );
          const leaderProofRatingsCount = await safeCount(
            `SELECT COUNT(*) AS c FROM goals g WHERE g.deleted_at IS NULL AND g.proof_review_rating IS NOT NULL AND (g.employee_id = ? OR g.leader_id IN (SELECT u.id FROM users u WHERE u.employee_id = ?))`,
            [employeeId, employeeId]
          );
          const leaderProofRatingAvg = await safeNumber(
            `SELECT ROUND(COALESCE(AVG(g.proof_review_rating), 0), 2) AS avg_rating FROM goals g WHERE g.deleted_at IS NULL AND g.proof_review_rating IS NOT NULL AND (g.employee_id = ? OR g.leader_id IN (SELECT u.id FROM users u WHERE u.employee_id = ?))`,
            [employeeId, employeeId]
          );
          const proofRatingsCount = memberProofRatingsCount + leaderProofRatingsCount;
          const proofRatingAvg = proofRatingsCount > 0 ? Number(((memberProofRatingAvg * memberProofRatingsCount + leaderProofRatingAvg * leaderProofRatingsCount) / proofRatingsCount).toFixed(2)) : 0;

          const delegatedGoalCount = await safeCount(`SELECT COUNT(*) AS c FROM goal_assignees ga INNER JOIN goals g ON g.id = ga.goal_id AND g.deleted_at IS NULL WHERE ga.employee_id = ?`, [employeeId]);
          const teamGoalCount = await safeCount(`SELECT COUNT(*) AS c FROM goal_assignees ga INNER JOIN goals g ON g.id = ga.goal_id AND g.deleted_at IS NULL WHERE ga.employee_id = ? AND COALESCE(g.scope, 'Individual') = 'Team'`, [employeeId]);
          const departmentGoalCount = await safeCount(`SELECT COUNT(*) AS c FROM goal_assignees ga INNER JOIN goals g ON g.id = ga.goal_id AND g.deleted_at IS NULL WHERE ga.employee_id = ? AND COALESCE(g.scope, 'Individual') = 'Department'`, [employeeId]);
          const recoveryTasksTotal = await safeCount(`SELECT COUNT(*) AS c FROM goal_member_tasks t WHERE t.member_employee_id = ?`, [employeeId]);
          const recoveryTasksOpen = await safeCount(`SELECT COUNT(*) AS c FROM goal_member_tasks t WHERE t.member_employee_id = ? AND COALESCE(t.status, 'Not Started') NOT IN ('Completed', 'Cancelled')`, [employeeId]);
          const recoveryTasksCompleted = await safeCount(`SELECT COUNT(*) AS c FROM goal_member_tasks t WHERE t.member_employee_id = ? AND COALESCE(t.status, 'Not Started') = 'Completed'`, [employeeId]);
          const proofsApproved = await safeCount(`SELECT COUNT(*) AS c FROM goal_member_tasks t WHERE t.member_employee_id = ? AND COALESCE(t.proof_review_status, 'Not Submitted') = 'Approved'`, [employeeId]);
          const proofsRejected = await safeCount(`SELECT COUNT(*) AS c FROM goal_member_tasks t WHERE t.member_employee_id = ? AND COALESCE(t.proof_review_status, 'Not Submitted') = 'Rejected'`, [employeeId]);
          const proofsNeedsRevision = await safeCount(
            `SELECT COUNT(*) AS c FROM (
               SELECT t.id
               FROM goal_member_tasks t
               WHERE t.member_employee_id = ? AND COALESCE(t.proof_review_status, 'Not Submitted') = 'Needs Revision'
               UNION ALL
               SELECT g.id
               FROM goals g
               WHERE g.id IN (${relevantGoalIdsSql}) AND COALESCE(g.proof_review_status, 'Not Submitted') = 'Needs Revision'
             ) revision_rows`,
            [employeeId, employeeId, employeeId, employeeId]
          );
          const goalRevisionsCount = proofsNeedsRevision;
          const employeeDept = String(r.dept || '');
          const teamImprovementPlans = await safeCount(
            `SELECT COUNT(*) AS c FROM goal_improvement_plans gip INNER JOIN goals g ON g.id = gip.goal_id WHERE LOWER(TRIM(COALESCE(g.department, ''))) = LOWER(TRIM(?)) AND COALESCE(g.scope, 'Individual') = 'Team'`,
            [employeeDept]
          );
          const teamDevelopmentPlans = await safeCount(
            `SELECT COUNT(*) AS c FROM goal_development_plans gdp INNER JOIN goals g ON g.id = gdp.goal_id WHERE LOWER(TRIM(COALESCE(g.department, ''))) = LOWER(TRIM(?)) AND COALESCE(g.scope, 'Individual') = 'Team'`,
            [employeeDept]
          );
          const departmentImprovementPlans = await safeCount(
            `SELECT COUNT(*) AS c FROM goal_improvement_plans gip INNER JOIN goals g ON g.id = gip.goal_id WHERE LOWER(TRIM(COALESCE(g.department, ''))) = LOWER(TRIM(?)) AND COALESCE(g.scope, 'Individual') = 'Department'`,
            [employeeDept]
          );
          const departmentDevelopmentPlans = await safeCount(
            `SELECT COUNT(*) AS c FROM goal_development_plans gdp INNER JOIN goals g ON g.id = gdp.goal_id WHERE LOWER(TRIM(COALESCE(g.department, ''))) = LOWER(TRIM(?)) AND COALESCE(g.scope, 'Individual') = 'Department'`,
            [employeeDept]
          );

          const lastSelfAssessmentAt = await safeText('SELECT MAX(created_at) AS max_created_at FROM self_assessments WHERE employee_id = ?', [employeeId]);
          const lastAppraisalSignoff = await safeText('SELECT MAX(sign_off_date) AS max_sign_off_date FROM appraisals WHERE employee_id = ?', [employeeId]);
          const lastDisciplinaryDate = await safeText('SELECT MAX(date_of_warning) AS max_date_of_warning FROM discipline_records WHERE employee_id = ?', [employeeId]);
          const lastSuggestionDate = await safeText('SELECT MAX(created_at) AS max_created_at FROM suggestions WHERE employee_id = ?', [employeeId]);
          const lastCoachingLogAt = await safeText('SELECT MAX(created_at) AS max_created_at FROM coaching_logs WHERE employee_id = ?', [employeeId]);

          const goalsCompletionRate = goalsTotal > 0 ? Math.round((goalsCompleted / goalsTotal) * 100) : 0;
          const formsTotalCount =
            selfAssessmentsCount +
            appraisalsCount +
            disciplinaryCount +
            feedbackCount +
            suggestionsCount +
            onboardingCount +
            propertyFormsCount +
            exitInterviewsCount +
            coachingLogsCount;

          return {
            employee_id: employeeId,
            employee_name: r.employee_name || 'Unknown',
            position: r.position || null,
            dept: r.dept || null,
            goals_total: goalsTotal,
            goals_active: goalsActive,
            goals_completed: goalsCompleted,
            goals_at_risk: goalsAtRisk,
            goals_overdue: goalsOverdue,
            goals_avg_progress: goalsAvgProgress,
            goals_completion_rate: goalsCompletionRate,
            delegated_goal_count: delegatedGoalCount,
            team_goal_count: teamGoalCount,
            department_goal_count: departmentGoalCount,
            assigned_unrated_goals_count: assignedUnratedGoalsCount,
            pip_count: pipCount,
            idp_count: idpCount,
            recovery_tasks_total: recoveryTasksTotal,
            recovery_tasks_open: recoveryTasksOpen,
            recovery_tasks_completed: recoveryTasksCompleted,
            proofs_approved: proofsApproved,
            proofs_rejected: proofsRejected,
            proofs_needs_revision: proofsNeedsRevision,
            goal_revisions_count: goalRevisionsCount,
            member_proof_ratings_count: memberProofRatingsCount,
            member_proof_rating_avg: memberProofRatingAvg,
            leader_proof_ratings_count: leaderProofRatingsCount,
            leader_proof_rating_avg: leaderProofRatingAvg,
            proof_ratings_count: proofRatingsCount,
            proof_rating_avg: proofRatingAvg,
            self_assessments_count: selfAssessmentsCount,
            last_self_assessment_at: lastSelfAssessmentAt,
            appraisals_count: appraisalsCount,
            performance_evaluation_forms_count: appraisalsCount,
            appraisals_avg_overall: appraisalsAvg,
            last_appraisal_signoff: lastAppraisalSignoff,
            disciplinary_count: disciplinaryCount,
            disciplinary_violation_entries_count: disciplinaryViolationEntriesCount,
            disciplinary_actions_count: disciplinaryActionsCount,
            last_disciplinary_date: lastDisciplinaryDate,
            feedback_360_count: feedbackCount,
            suggestions_count: suggestionsCount,
            last_suggestion_date: lastSuggestionDate,
            onboarding_count: onboardingCount,
            onboarding_signed_count: onboardingSignedCount,
            property_forms_count: propertyFormsCount,
            property_signed_count: propertySignedCount,
            exit_interviews_count: exitInterviewsCount,
            exit_interviews_signed_count: exitInterviewsSignedCount,
            coaching_logs_count: coachingLogsCount,
            last_coaching_log_at: lastCoachingLogAt,
            forms_total_count: formsTotalCount,
            team_improvement_plans: teamImprovementPlans,
            team_development_plans: teamDevelopmentPlans,
            department_improvement_plans: departmentImprovementPlans,
            department_development_plans: departmentDevelopmentPlans,
          };
        }));

        const uniqueGoalSummaryRows: any = await query(
          `WITH scoped_employees AS (
             SELECT e.id
             FROM employees e
             ${whereSql}
           ),
           scoped_goals AS (
             SELECT DISTINCT g.id, LOWER(TRIM(COALESCE(g.status, 'Not Started'))) AS status
             FROM goals g
             WHERE g.deleted_at IS NULL
               AND (
                 g.employee_id IN (SELECT id FROM scoped_employees)
                 OR g.leader_id IN (
                   SELECT u.id
                   FROM users u
                   WHERE u.employee_id IN (SELECT id FROM scoped_employees)
                 )
                 OR g.id IN (
                   SELECT ga.goal_id
                   FROM goal_assignees ga
                   WHERE ga.employee_id IN (SELECT id FROM scoped_employees)
                 )
               )
           )
           SELECT
             COUNT(*) AS total_goals,
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS total_completed_goals,
             SUM(CASE WHEN status = 'in progress' THEN 1 ELSE 0 END) AS total_active_goals
           FROM scoped_goals`,
          params
        );
        const uniqueGoalSummary = (Array.isArray(uniqueGoalSummaryRows) ? uniqueGoalSummaryRows[0] : uniqueGoalSummaryRows) || {};

        return res.json({
          employees: list,
          summary: list.length === 0 ? null : {
            employees: list.length,
            avg_goal_progress: Math.round(list.reduce((sum: number, item: any) => sum + Number(item.goals_completion_rate || 0), 0) / list.length),
            avg_proof_rating: Number((list.reduce((sum: number, item: any) => sum + Number(item.proof_rating_avg || 0), 0) / list.length).toFixed(2)),
            total_goals: Number(uniqueGoalSummary.total_goals || 0),
            total_completed_goals: Number(uniqueGoalSummary.total_completed_goals || 0),
            total_active_goals: Number(uniqueGoalSummary.total_active_goals || 0),
            total_pips: list.reduce((sum: number, item: any) => sum + Number(item.pip_count || 0), 0),
            total_idps: list.reduce((sum: number, item: any) => sum + Number(item.idp_count || 0), 0),
            total_appraisals: list.reduce((sum: number, item: any) => sum + Number(item.appraisals_count || 0), 0),
            total_disciplinary: list.reduce((sum: number, item: any) => sum + Number(item.disciplinary_count || 0), 0),
            total_self_assessments: list.reduce((sum: number, item: any) => sum + Number(item.self_assessments_count || 0), 0),
            total_forms: list.reduce((sum: number, item: any) => sum + Number(item.forms_total_count || 0), 0),
            total_suggestions: list.reduce((sum: number, item: any) => sum + Number(item.suggestions_count || 0), 0),
            total_onboarding: list.reduce((sum: number, item: any) => sum + Number(item.onboarding_count || 0), 0),
            total_property_forms: list.reduce((sum: number, item: any) => sum + Number(item.property_forms_count || 0), 0),
            total_exit_interviews: list.reduce((sum: number, item: any) => sum + Number(item.exit_interviews_count || 0), 0),
          },
          generated_at: new Date().toISOString(),
          degraded: true,
        });
      } catch (fallbackErr) {
        console.error('GET /api/performance/employees fallback error:', fallbackErr);
        return res.json({ employees: [], summary: null, generated_at: new Date().toISOString(), degraded: true });
      }
    }
  });

  app.delete("/api/goals/:id", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      if (!isPrivilegedRole(role) && role !== 'Manager') return res.status(403).json({ error: 'Forbidden' });

      const existingRows: any = await query('SELECT id, employee_id, department FROM goals WHERE id = ?', [req.params.id]);
      const existing = Array.isArray(existingRows) ? existingRows[0] : existingRows;
      if (!existing) return res.status(404).json({ error: 'Goal not found' });

      if (role === 'Manager') {
        const actorDept = String(actor.dept || '').trim();
        const goalDept = String(existing.department || '').trim();
        if (!goalDept || !actorDept || goalDept.toLowerCase() !== actorDept.toLowerCase()) {
          return res.status(403).json({ error: 'Managers can only modify goals in their own department' });
        }
        const existingEmpId = normalizeEmployeeId(existing.employee_id);
        if (existingEmpId) {
          const allowed = await canManagerAccessEmployee(actor.id, existingEmpId);
          if (!allowed) return res.status(403).json({ error: 'Forbidden' });
        }
      }

      await query("DELETE FROM goal_assignees WHERE goal_id = ?", [req.params.id]);
      await softDeleteById('goals', req.params.id);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  app.post('/api/goals/archive-all', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      if (!isPrivilegedRole(role) && role !== 'Manager') return res.status(403).json({ error: 'Forbidden' });

      if (isPrivilegedRole(role)) {
        await query("UPDATE goals SET deleted_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL");
        return res.json({ success: true });
      }

      const actorDept = String(actor.dept || '').trim();
      if (!actorDept) return res.status(403).json({ error: 'Manager department is required' });

      await query(
        "UPDATE goals SET deleted_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL AND LOWER(TRIM(COALESCE(department, ''))) = LOWER(TRIM(?))",
        [actorDept]
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  // Leader management: assign/unassign leaders to members
  app.post('/api/leaders', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      if (!isPrivilegedRole(role) && role !== 'Manager') return res.status(403).json({ error: 'Forbidden' });
      const leaderId = parseInt(String(req.body.leader_id));
      const memberId = normalizeEmployeeId(req.body.member_id);
      if (!leaderId || !memberId) return res.status(400).json({ error: 'Invalid parameters' });

      const leaderRows: any = await query('SELECT id, employee_id FROM users WHERE id = ?', [leaderId]);
      const leaderUser = Array.isArray(leaderRows) ? leaderRows[0] : leaderRows;
      if (!leaderUser) return res.status(400).json({ error: 'Invalid leader' });
      const leaderEmployeeId = normalizeEmployeeId(leaderUser.employee_id);
      if (leaderEmployeeId && leaderEmployeeId === memberId) {
        return res.status(400).json({ error: 'A team leader cannot be assigned as their own member' });
      }

      if (role === 'Manager') {
        const allowed = await canManagerAccessEmployee(actor.id, memberId);
        if (!allowed) return res.status(403).json({ error: 'Forbidden' });
      }
      await query('INSERT INTO team_leaders (leader_id, member_id) VALUES (?, ?) ON CONFLICT (leader_id, member_id) DO NOTHING', [leaderId, memberId]);
      await recordAudit(actor, 'add_leader_mapping', 'team_leaders', null, null, { leader_id: leaderId, member_id: memberId }, { route: req.originalUrl });
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  app.delete('/api/leaders', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      if (!isPrivilegedRole(role) && role !== 'Manager') return res.status(403).json({ error: 'Forbidden' });
      const leaderId = parseInt(String(req.body.leader_id));
      const memberId = normalizeEmployeeId(req.body.member_id);
      if (!leaderId || !memberId) return res.status(400).json({ error: 'Invalid parameters' });
      if (role === 'Manager') {
        const allowed = await canManagerAccessEmployee(actor.id, memberId);
        if (!allowed) return res.status(403).json({ error: 'Forbidden' });
      }
      await query('DELETE FROM team_leaders WHERE leader_id = ? AND member_id = ?', [leaderId, memberId]);
      await recordAudit(actor, 'remove_leader_mapping', 'team_leaders', null, null, { leader_id: leaderId, member_id: memberId }, { route: req.originalUrl });
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  app.get('/api/leaders', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      if (!isPrivilegedRole(role) && role !== 'Manager') return res.status(403).json({ error: 'Forbidden' });
      const rows: any = await query(
        `SELECT l.leader_id,
                u.employee_id,
                COALESCE(u.full_name, u.username, u.email) AS leader_name,
                COUNT(l.member_id) AS member_count
         FROM team_leaders l
         LEFT JOIN users u ON u.id = l.leader_id
         GROUP BY l.leader_id, u.employee_id, u.full_name, u.username, u.email
         ORDER BY leader_name`
      );
      res.json(Array.isArray(rows) ? rows : []);
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  app.get('/api/leaders/:leaderId/members', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      const leaderId = parseInt(String(req.params.leaderId));
      if (!leaderId) return res.status(400).json({ error: 'Invalid leader id' });
      if (!isPrivilegedRole(role) && actor.id !== leaderId && role !== 'Manager') return res.status(403).json({ error: 'Forbidden' });
      const rows: any = await query('SELECT l.*, e.name as member_name FROM team_leaders l LEFT JOIN employees e ON l.member_id = e.id WHERE l.leader_id = ?', [leaderId]);
      res.json(Array.isArray(rows) ? rows : []);
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  // Assign an existing goal to a member (supports Manager/Admin/Leader)
  app.post('/api/goals/:id/assign', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      const goalId = parseInt(String(req.params.id));
      const memberId = normalizeEmployeeId(req.body.employee_id);
      if (!goalId || !memberId) return res.status(400).json({ error: 'Invalid parameters' });
      const goalRows: any = await query('SELECT id, employee_id, department FROM goals WHERE id = ?', [goalId]);
      const goal = Array.isArray(goalRows) ? goalRows[0] : goalRows;
      if (!goal) return res.status(404).json({ error: 'Goal not found' });

      let allowed = false;
      if (isPrivilegedRole(role)) allowed = true;
      else if (role === 'Manager') {
        const actorDept = String(actor.dept || '').trim();
        const goalDept = String(goal.department || '').trim();
        if (!goalDept || !actorDept || goalDept.toLowerCase() !== actorDept.toLowerCase()) {
          return res.status(403).json({ error: 'Managers can only modify goals in their own department' });
        }
        const allowedMgr = await canManagerAccessEmployee(actor.id, memberId);
        if (allowedMgr) allowed = true;
      } else if (role === 'Employee') {
        const allowedLeader = await isLeaderOf(actor.id, memberId);
        if (allowedLeader) allowed = true;
      }
      if (!allowed) return res.status(403).json({ error: 'Forbidden' });

      const now = new Date().toISOString();
      await query('INSERT INTO goal_assignees (goal_id, employee_id, assigned_by, assigned_by_role, assigned_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (goal_id, employee_id) DO NOTHING', [goalId, memberId, actor.id || null, role || null, now]);
      try { const uRows: any = await query('SELECT id FROM users WHERE employee_id = ?', [memberId]); const u = Array.isArray(uRows) ? uRows[0] : uRows; if (u && u.id) await createNotification({ user_id: u.id, type: 'info', message: 'A goal was assigned to you', source: 'goals' }); } catch (e) {}
      await recordAudit(actor, 'assign_goal', 'goal_assignees', goalId, null, { employee_id: memberId, assigned_by: actor.id }, { route: req.originalUrl });
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  app.post('/api/goals/:id/unassign', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      const goalId = parseInt(String(req.params.id));
      const memberId = normalizeEmployeeId(req.body.employee_id);
      if (!goalId || !memberId) return res.status(400).json({ error: 'Invalid parameters' });

      let allowed = false;
      if (isPrivilegedRole(role)) allowed = true;
      else if (role === 'Manager') {
        const goalRows: any = await query('SELECT id, department FROM goals WHERE id = ?', [goalId]);
        const goal = Array.isArray(goalRows) ? goalRows[0] : goalRows;
        if (!goal) return res.status(404).json({ error: 'Goal not found' });
        const actorDept = String(actor.dept || '').trim();
        const goalDept = String(goal.department || '').trim();
        if (!goalDept || !actorDept || goalDept.toLowerCase() !== actorDept.toLowerCase()) {
          return res.status(403).json({ error: 'Managers can only modify goals in their own department' });
        }
        const allowedMgr = await canManagerAccessEmployee(actor.id, memberId);
        if (allowedMgr) allowed = true;
      } else if (role === 'Employee') {
        const allowedLeader = await isLeaderOf(actor.id, memberId);
        if (allowedLeader) allowed = true;
      }
      if (!allowed) return res.status(403).json({ error: 'Forbidden' });

      await query('DELETE FROM goal_assignees WHERE goal_id = ? AND employee_id = ?', [goalId, memberId]);
      await recordAudit(actor, 'unassign_goal', 'goal_assignees', goalId, null, { employee_id: memberId }, { route: req.originalUrl });
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  // ---- Leader Goals ----
  app.get('/api/leader-goals', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const uniqueById = (rows: any[]) => {
        const seen = new Set<string>();
        return (Array.isArray(rows) ? rows : []).filter((row) => {
          const id = String(row?.id ?? '');
          if (!id) return true;
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });
      };
      const memberRows: any = await query(
        'SELECT l.member_id, e.name as member_name FROM team_leaders l LEFT JOIN employees e ON l.member_id = e.id WHERE l.leader_id = ?',
        [actor.id]
      );
      const teamMembers = uniqueById(Array.isArray(memberRows) ? memberRows : []).filter((m: any) => {
        const memberId = normalizeEmployeeId(m?.member_id);
        return !!memberId;
      });
      const allowedMemberIds = new Set(teamMembers.map((m: any) => String(normalizeEmployeeId(m.member_id))));

      const goalRows: any = await query(
        'SELECT g.*, e.name as employee_name FROM goals g LEFT JOIN employees e ON g.employee_id = e.id WHERE g.leader_id = ? AND g.deleted_at IS NULL',
        [actor.id]
      );
      const goals = uniqueById(await enrichGoalsWithAssignees(Array.isArray(goalRows) ? goalRows : []));
      await Promise.all(
        goals.map(async (g: any) => {
          const assignees = uniqueById(Array.isArray(g.assignees) ? g.assignees : []);
          g.assignees = assignees
            .filter((a: any) => {
              const assigneeId = normalizeEmployeeId(a?.employee_id);
              return !!assigneeId && allowedMemberIds.has(String(assigneeId));
            })
            .map((a: any) => ({ ...a, employee_name: a.employee_name || a.name || null }));

          const taskRows: any = await query(
            'SELECT t.*, e.name as member_name FROM goal_member_tasks t LEFT JOIN employees e ON t.member_employee_id = e.id WHERE t.goal_id = ? AND t.deleted_at IS NULL ORDER BY t.created_at DESC',
            [g.id]
          );
          g.member_tasks = uniqueById(Array.isArray(taskRows) ? taskRows : []);
        })
      );
      res.json({ goals, teamMembers });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  app.post('/api/goals/:id/member-tasks', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      const goalId = parseInt(String(req.params.id));
      const memberId = normalizeEmployeeId(req.body.member_employee_id);
      const title = String(req.body.title || '').trim();
      const description = String(req.body.description || '').trim();
      const dueDate = req.body.due_date ? String(req.body.due_date) : null;
      const priority = String(req.body.priority || 'Medium');
      let briefFileData = String(req.body.brief_file_data || '').trim();
      let briefFileName = String(req.body.brief_file_name || '').trim();
      let briefFileType = String(req.body.brief_file_type || '').trim();

      const briefFilesInput = Array.isArray(req.body.brief_files) ? req.body.brief_files : [];
      const normalizedBriefFiles = briefFilesInput
        .map((item: any) => ({
          brief_file_data: String(item?.brief_file_data || item?.data || '').trim(),
          brief_file_name: String(item?.brief_file_name || item?.name || '').trim(),
          brief_file_type: String(item?.brief_file_type || item?.type || '').trim(),
        }))
        .filter((item: any) => !!item.brief_file_data);

      if (normalizedBriefFiles.length > 0) {
        briefFileData = JSON.stringify(normalizedBriefFiles);
        briefFileName = normalizedBriefFiles[0].brief_file_name || briefFileName;
        briefFileType = normalizedBriefFiles[0].brief_file_type || briefFileType;
      }

      if (!goalId || !memberId || !title) return res.status(400).json({ error: 'Invalid task payload' });

      const goalRows: any = await query('SELECT id, employee_id, leader_id, department, target_date, proof_review_status, created_at FROM goals WHERE id = ?', [goalId]);
      const goal = Array.isArray(goalRows) ? goalRows[0] : goalRows;
      if (!goal) return res.status(404).json({ error: 'Goal not found' });

      const normalizedDueDate = normalizeDateOnly(dueDate);
      const normalizedGoalDueDate = normalizeDateOnly(goal.target_date);
      const normalizedGoalStartDate = normalizeDateOnly(goal.created_at);
      if (normalizedDueDate && normalizedGoalStartDate && normalizedDueDate < normalizedGoalStartDate) {
        return res.status(400).json({ error: 'Task due date cannot be before the goal start date' });
      }
      if (normalizedDueDate && normalizedGoalDueDate && normalizedDueDate > normalizedGoalDueDate) {
        return res.status(400).json({ error: 'Task due date cannot be later than the goal due date unless the goal deadline extension is approved' });
      }

      let allowed = false;
      if (isPrivilegedRole(role)) allowed = true;
      else if (role === 'Manager') {
        const actorDept = String(actor.dept || '').trim();
        const goalDept = String(goal.department || '').trim();
        if (!goalDept || !actorDept || goalDept.toLowerCase() !== actorDept.toLowerCase()) {
          return res.status(403).json({ error: 'Managers can only modify goals in their own department' });
        }
        const allowedMgr = await canManagerAccessEmployee(actor.id, normalizeEmployeeId(goal.employee_id));
        if (allowedMgr) allowed = true;
      } else if (role === 'Employee') {
        const isGoalLeader = Number(goal.leader_id) === Number(actor.id);
        const canLeadMember = await isLeaderOf(actor.id, memberId);
        if (isGoalLeader && canLeadMember) allowed = true;
      }
      if (!allowed) return res.status(403).json({ error: 'Forbidden' });

      const memberAssignedRows: any = await query('SELECT 1 FROM goal_assignees WHERE goal_id = ? AND employee_id = ?', [goalId, memberId]);
      const memberAssigned = Array.isArray(memberAssignedRows) ? memberAssignedRows.length > 0 : !!memberAssignedRows;
      if (!memberAssigned) return res.status(400).json({ error: 'Member is not part of this delegated goal team' });

      // Idempotency guard: avoid accidental duplicate task creation from rapid retries/double-submit.
      const duplicateRows: any = await query(
        `SELECT id, title, due_date, created_at
         FROM goal_member_tasks
         WHERE goal_id = ?
           AND member_employee_id = ?
           AND deleted_at IS NULL
           AND LOWER(TRIM(COALESCE(title, ''))) = LOWER(TRIM(COALESCE(?, '')))
           AND COALESCE(due_date, '') = COALESCE(?, '')
         ORDER BY id DESC
         LIMIT 1`,
        [goalId, memberId, title, dueDate]
      );
      const duplicateCandidate = Array.isArray(duplicateRows) ? duplicateRows[0] : duplicateRows;
      if (duplicateCandidate?.id) {
        const createdAtMs = duplicateCandidate?.created_at ? Date.parse(String(duplicateCandidate.created_at)) : NaN;
        const withinRetryWindow = Number.isFinite(createdAtMs) && Math.abs(Date.now() - createdAtMs) <= 2 * 60 * 1000;
        if (withinRetryWindow) {
          return res.json({ success: true, id: Number(duplicateCandidate.id), duplicate_avoided: true });
        }
      }

      const inserted: any = await query(
        'INSERT INTO goal_member_tasks (goal_id, member_employee_id, title, description, due_date, priority, status, progress, brief_file_data, brief_file_name, brief_file_type, proof_review_status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id',
        [goalId, memberId, title, description || null, dueDate, priority || 'Medium', 'Not Started', 0, briefFileData || null, briefFileName || null, briefFileType || null, 'Not Submitted', actor.id || null]
      );

      const avgProgress = await recomputeGoalProgress(goalId);

      try {
        const uRows: any = await query('SELECT id FROM users WHERE employee_id = ?', [memberId]);
        const u = Array.isArray(uRows) ? uRows[0] : uRows;
        if (u && u.id) await createNotification({ user_id: u.id, type: 'info', message: `New task assigned: ${title}`, source: 'goal_member_tasks' });
      } catch (e) {}

      const taskId = inserted?.insertId || null;
      await recordAudit(actor, 'create_goal_member_task', 'goal_member_tasks', taskId, null, { goal_id: goalId, member_employee_id: memberId, title, due_date: dueDate, priority }, { route: req.originalUrl });

      try {
        const payload = {
          goal_id: goalId,
          task_id: taskId,
          action: 'task_created',
          goal_progress: avgProgress,
          task_status: 'Not Started',
          task_progress: 0,
          proof_review_status: 'Not Submitted',
          updated_at: new Date().toISOString(),
        };
        if (goal.leader_id) io.to(`user_${goal.leader_id}`).emit('goals:updated', payload);
        const goalEmployeeId = normalizeEmployeeId(goal.employee_id);
        if (goalEmployeeId) io.to(`employee_${goalEmployeeId}`).emit('goals:updated', payload);
        io.to(`employee_${memberId}`).emit('goals:updated', payload);
        io.to('role_Manager').emit('goals:updated', payload);
        io.to('role_HR').emit('goals:updated', payload);
        io.to('role_Admin').emit('goals:updated', payload);
      } catch (emitErr) {
        console.error('goals:updated emit error (create task):', emitErr);
      }

      res.json({ success: true, id: taskId });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  app.get('/api/member-tasks/recovery-metrics', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      if (!isPrivilegedRole(role) && role !== 'Manager') return res.status(403).json({ error: 'Forbidden' });

      const daysRaw = parseInt(String(req.query.days || '7'), 10);
      const days = Number.isFinite(daysRaw) ? Math.min(90, Math.max(1, daysRaw)) : 7;
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      if (isPrivilegedRole(role)) {
        const rows: any = await query(
          `SELECT COUNT(*) as count
           FROM goal_member_tasks t
           WHERE t.created_at >= ?
             AND LOWER(COALESCE(t.title, '')) LIKE 'recovery:%'`,
          [cutoff]
        );
        const row = Array.isArray(rows) ? rows[0] : rows;
        return res.json({ count: Number(row?.count || 0), days });
      }

      const managedIds = await getManagedEmployeeIds(actor.id);
      if (!Array.isArray(managedIds) || managedIds.length === 0) {
        const rows: any = await query(
          `SELECT COUNT(*) as count
           FROM goal_member_tasks t
           LEFT JOIN goals g ON g.id = t.goal_id
           WHERE t.created_at >= ?
             AND LOWER(COALESCE(t.title, '')) LIKE 'recovery:%'
             AND g.employee_id IS NULL`,
          [cutoff]
        );
        const row = Array.isArray(rows) ? rows[0] : rows;
        return res.json({ count: Number(row?.count || 0), days });
      }

      const placeholders = managedIds.map(() => '?').join(',');
      const rows: any = await query(
        `SELECT COUNT(*) as count
         FROM goal_member_tasks t
         LEFT JOIN goals g ON g.id = t.goal_id
         WHERE t.created_at >= ?
           AND LOWER(COALESCE(t.title, '')) LIKE 'recovery:%'
           AND (g.employee_id IN (${placeholders}) OR g.employee_id IS NULL)`,
        [cutoff, ...managedIds]
      );
      const row = Array.isArray(rows) ? rows[0] : rows;
      return res.json({ count: Number(row?.count || 0), days });
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.get('/api/member-tasks/my', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      let actorEmployeeId = normalizeEmployeeId(actor.employee_id);
      if (!actorEmployeeId && actor.id) {
        const userRows: any = await query(
          'SELECT id, employee_id, full_name, username, email FROM users WHERE id = ? LIMIT 1',
          [Number(actor.id)]
        );
        const userRow = Array.isArray(userRows) ? userRows[0] : userRows;
        const storedEmployeeId = normalizeEmployeeId(userRow?.employee_id);
        if (storedEmployeeId) {
          actorEmployeeId = storedEmployeeId;
        } else {
          const identityHint = String(userRow?.full_name || parseDisplayNameFromEmail(userRow?.email || userRow?.username || '') || '').trim();
          const inferredEmployeeId = identityHint ? await ensureEmployeeIdByFullName(identityHint) : null;
          if (inferredEmployeeId) {
            actorEmployeeId = inferredEmployeeId;
            try {
              await query('UPDATE users SET employee_id = ? WHERE id = ? AND (employee_id IS NULL OR employee_id = 0)', [inferredEmployeeId, Number(actor.id)]);
            } catch {}
          }
        }
      }
      if (!actorEmployeeId) return res.json([]);

      // Backfill stale rows: proof already submitted and pending review should not stay at 0%.
      try {
        await query(
          `UPDATE goal_member_tasks
           SET progress = ?,
               status = CASE WHEN COALESCE(status, 'Not Started') IN ('Not Started', 'Blocked') THEN 'In Progress' ELSE status END,
               updated_at = CURRENT_TIMESTAMP
           WHERE member_employee_id = ?
             AND deleted_at IS NULL
             AND COALESCE(proof_review_status, 'Not Submitted') = 'Pending Review'
             AND COALESCE(progress, 0) < ?
             AND COALESCE(TRIM(proof_image), '') <> ''`,
          [TASK_PROGRESS_SUBMITTED, actorEmployeeId, TASK_PROGRESS_SUBMITTED]
        );
      } catch (backfillErr: any) {
        const msg = String(backfillErr?.message || '').toLowerCase();
        const missingUpdatedAt = String(backfillErr?.code || '') === '42703' || msg.includes('updated_at') || msg.includes('no such column');
        if (missingUpdatedAt) {
          try {
            await query(
              `UPDATE goal_member_tasks
               SET progress = ?,
                   status = CASE WHEN COALESCE(status, 'Not Started') IN ('Not Started', 'Blocked') THEN 'In Progress' ELSE status END
               WHERE member_employee_id = ?
                 AND deleted_at IS NULL
                 AND COALESCE(proof_review_status, 'Not Submitted') = 'Pending Review'
                 AND COALESCE(progress, 0) < ?
                 AND COALESCE(TRIM(proof_image), '') <> ''`,
              [TASK_PROGRESS_SUBMITTED, actorEmployeeId, TASK_PROGRESS_SUBMITTED]
            );
          } catch (fallbackBackfillErr) {
            console.error('GET /api/member-tasks/my backfill fallback error:', fallbackBackfillErr);
          }
        } else {
          console.error('GET /api/member-tasks/my backfill error:', backfillErr);
        }
      }

      try {
        const goalRows: any = await query(
          `SELECT DISTINCT t.goal_id
           FROM goal_member_tasks t
           LEFT JOIN goals g ON g.id = t.goal_id
           WHERE t.member_employee_id = ?
             AND t.deleted_at IS NULL
             AND g.deleted_at IS NULL
             AND t.goal_id IS NOT NULL`,
          [actorEmployeeId]
        );
        const goalIds = (Array.isArray(goalRows) ? goalRows : [goalRows])
          .map((r: any) => Number(r?.goal_id || 0))
          .filter((id: number) => Number.isFinite(id) && id > 0);
        for (const goalId of goalIds) {
          await recomputeGoalProgress(goalId);
        }
      } catch (goalProgressErr: any) {
        console.error('GET /api/member-tasks/my goal progress error:', goalProgressErr);
      }

      const rows: any = await query(
        `SELECT t.*, g.title as goal_title, g.statement as goal_statement,
                COALESCE(e.name, 'Unknown') as member_name,
          COALESCE(u.full_name, u.username, u.email) as reviewer_name,
          u.role as reviewer_role
         FROM goal_member_tasks t
         LEFT JOIN goals g ON g.id = t.goal_id
         LEFT JOIN employees e ON e.id = t.member_employee_id
         LEFT JOIN users u ON u.id = t.proof_reviewed_by
          WHERE (
            t.member_employee_id = ?
            OR EXISTS (
              SELECT 1
              FROM goal_assignees ga
              WHERE ga.goal_id = t.goal_id
                AND ga.employee_id = ?
            )
          )
          AND t.deleted_at IS NULL
          AND g.deleted_at IS NULL
         ORDER BY COALESCE(t.updated_at, t.created_at) DESC`,
        [actorEmployeeId, actorEmployeeId]
      );
      res.json(Array.isArray(rows) ? rows : []);
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.get('/api/goals/:id/member-tasks', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      const goalId = parseInt(String(req.params.id));
      if (!goalId) return res.status(400).json({ error: 'Invalid goal id' });

      const goalRows: any = await query('SELECT id, employee_id, leader_id, department FROM goals WHERE id = ? AND deleted_at IS NULL', [goalId]);
      const goal = Array.isArray(goalRows) ? goalRows[0] : goalRows;
      if (!goal) return res.status(404).json({ error: 'Goal not found' });

      let allowed = false;
      if (isPrivilegedRole(role)) allowed = true;
      else if (role === 'Manager') {
        const actorCtx = await getActorOrgContext(Number(actor.id || 0));
        const goalEmployeeId = normalizeEmployeeId(goal.employee_id);
        if (goalEmployeeId) {
          const allowedMgr = await canManagerAccessEmployee(actor.id, goalEmployeeId);
          if (allowedMgr) allowed = true;
        }
        // Managers can review delegated tasks for goals in their own department,
        // even if the goal owner is not directly mapped by manager_id.
        if (!allowed) {
          const actorDept = String(
            actor.dept ||
            actor.department ||
            actor.employee_dept ||
            actor.employee_department ||
            actor.employee?.dept ||
            actorCtx.dept ||
            ''
          ).trim().toLowerCase();
          const goalDept = String(goal.department || '').trim().toLowerCase();
          if (actorDept && goalDept && actorDept === goalDept) allowed = true;

          // Fallback when goal.department is empty/stale:
          // allow if at least one member task belongs to manager's department.
          if (!allowed && actorDept) {
            const deptTaskRows: any = await query(
              `SELECT 1
               FROM goal_member_tasks t
               LEFT JOIN employees e ON e.id = t.member_employee_id
               WHERE t.goal_id = ?
                 AND LOWER(TRIM(COALESCE(e.dept, ''))) = LOWER(TRIM(?))
                 AND t.deleted_at IS NULL
               LIMIT 1`,
              [goalId, actorDept]
            );
            const deptTask = Array.isArray(deptTaskRows) ? deptTaskRows[0] : deptTaskRows;
            if (deptTask) allowed = true;
          }
        }
      } else if (role === 'Employee') {
        if (Number(goal.leader_id) === Number(actor.id)) allowed = true;
      }
      if (!allowed) return res.status(403).json({ error: 'Forbidden' });

      await recomputeGoalProgress(goalId);

        const rows: any = await query(
          `SELECT t.*, e.name as member_name, COALESCE(u.full_name, u.username, u.email) as reviewer_name, u.role as reviewer_role
         FROM goal_member_tasks t
         LEFT JOIN employees e ON e.id = t.member_employee_id
         LEFT JOIN users u ON u.id = t.proof_reviewed_by
         WHERE t.goal_id = ?
           AND t.deleted_at IS NULL
         ORDER BY COALESCE(t.updated_at, t.created_at) DESC`,
        [goalId]
      );

      res.json(Array.isArray(rows) ? rows : []);
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.put('/api/member-tasks/:id', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = normalizeUserRole(actor.role) || String(actor.role || '');
      const taskId = parseInt(String(req.params.id));
      if (!taskId) return res.status(400).json({ error: 'Invalid task id' });

      let taskRows: any;
      try {
        taskRows = await query(
          'SELECT t.*, g.leader_id, g.employee_id as goal_employee_id, g.department as goal_department, g.target_date as goal_target_date FROM goal_member_tasks t LEFT JOIN goals g ON g.id = t.goal_id WHERE t.id = ? AND t.deleted_at IS NULL AND g.deleted_at IS NULL',
          [taskId]
        );
      } catch (e: any) {
        const msg = String(e?.message || '').toLowerCase();
        const missingGoalDeptColumn = String(e?.code || '') === '42703' || msg.includes('g.department') || msg.includes('goal_department');
        if (!missingGoalDeptColumn) throw e;
        taskRows = await query(
          'SELECT t.*, g.leader_id, g.employee_id as goal_employee_id, g.target_date as goal_target_date FROM goal_member_tasks t LEFT JOIN goals g ON g.id = t.goal_id WHERE t.id = ? AND t.deleted_at IS NULL AND g.deleted_at IS NULL',
          [taskId]
        );
      }
      const task = Array.isArray(taskRows) ? taskRows[0] : taskRows;
      if (!task) {
        return res.json({ success: true, task_id: taskId, already_removed: true });
      }

      const isGoalLeader = Number(task.leader_id) === Number(actor.id);
      let allowed = false;
      if (isPrivilegedRole(role)) allowed = true;
      else if (role === 'Manager') {
        const actorCtx = await getActorOrgContext(Number(actor.id || 0));
        const goalEmployeeId = normalizeEmployeeId(task.goal_employee_id);
        if (goalEmployeeId) {
          const allowedMgr = await canManagerAccessEmployee(actor.id, goalEmployeeId);
          if (allowedMgr) allowed = true;
        }
        // Managers can review task proofs for goals in their department.
        if (!allowed) {
          const actorDept = String(
            actor.dept ||
            actor.department ||
            actor.employee_dept ||
            actor.employee_department ||
            actor.employee?.dept ||
            actorCtx.dept ||
            ''
          ).trim().toLowerCase();
          const goalDept = String(task.goal_department || '').trim().toLowerCase();
          if (actorDept && goalDept && actorDept === goalDept) allowed = true;

          // Fallback when goal department is not set: validate against task assignee department.
          if (!allowed && actorDept) {
            const allowedByMemberDept = await canActorAccessEmployeeByDept(actorDept, normalizeEmployeeId(task.member_employee_id));
            if (allowedByMemberDept) allowed = true;
          }
        }
      } else if (role === 'Employee') {
        const actorEmployeeId = normalizeEmployeeId(actor.employee_id);
        if (isGoalLeader || (actorEmployeeId && actorEmployeeId === normalizeEmployeeId(task.member_employee_id))) allowed = true;
      }
      if (!allowed) return res.status(403).json({ error: 'Forbidden' });

      const b = req.body || {};
      if (b.due_date !== undefined) {
        const normalizedNextDueDate = normalizeDateOnly(b.due_date);
        const normalizedGoalDueDate = normalizeDateOnly(task.goal_target_date);
        if (normalizedNextDueDate && normalizedGoalDueDate && normalizedNextDueDate > normalizedGoalDueDate) {
          return res.status(400).json({ error: 'Task due date cannot be later than the goal due date unless the goal deadline extension is approved' });
        }
      }
      const leaderUpdatable = ['title', 'description', 'due_date', 'priority', 'status', 'progress'];
      const managerReviewUpdatable = ['proof_review_note', 'proof_review_file_data', 'proof_review_file_name', 'proof_review_file_type'];
      // Proof file columns are handled in the assigneeSubmittedProof block below.
      // Keeping them out of this generic updater avoids duplicate SET assignments
      // (e.g., proof_image/proof_file_name/proof_file_type), which Postgres rejects.
      const assigneeUpdatable = ['status', 'progress', 'proof_note'];
      const updatable = role === 'Employee' && !isGoalLeader ? assigneeUpdatable : leaderUpdatable;
      const hasReviewDecisionPayload = b.proof_review_status !== undefined || b.proof_review_note !== undefined || b.proof_review_rating !== undefined;

      if (hasReviewDecisionPayload && !(isPrivilegedRole(role) || role === 'Manager' || isGoalLeader)) {
        return res.status(403).json({ error: 'Only managers or the assigned team leader can review member proofs' });
      }

      const sets: string[] = [];
      const vals: any[] = [];
      for (const k of updatable) {
        if (b[k] !== undefined) {
          sets.push(`${k} = ?`);
          vals.push(k === 'progress' ? Math.max(0, Math.min(100, Number(b[k]) || 0)) : b[k]);
        }
      }

      if ((isPrivilegedRole(role) || role === 'Manager' || isGoalLeader) && b.proof_review_status === undefined) {
        for (const k of managerReviewUpdatable) {
          if (b[k] !== undefined) {
            sets.push(`${k} = ?`);
            vals.push(b[k]);
          }
        }
      }

      const submittedProofFiles = Array.isArray(b.proof_files)
        ? b.proof_files
            .map((item: any) => ({
              proof_file_data: String(item?.proof_file_data || item?.data || '').trim(),
              proof_file_name: String(item?.proof_file_name || item?.name || '').trim(),
              proof_file_type: String(item?.proof_file_type || item?.type || '').trim(),
            }))
            .filter((item: any) => !!item.proof_file_data)
        : [];
      const assigneeSubmittedProof = role === 'Employee' && !isGoalLeader && (b.proof_image !== undefined || b.proof_note !== undefined || submittedProofFiles.length > 0);
      const currentProofReviewStatus = String(task.proof_review_status || 'Not Submitted');
      if (assigneeSubmittedProof && currentProofReviewStatus === 'Approved') {
        return res.status(409).json({ error: 'Task already approved and closed' });
      }
      if (assigneeSubmittedProof && currentProofReviewStatus === 'Rejected') {
        return res.status(409).json({ error: 'Task is closed. Only revision-requested tasks can be reopened' });
      }
      if (assigneeSubmittedProof && currentProofReviewStatus === 'Pending Review') {
        const hasExistingProof = String(task.proof_image || '').trim().length > 0;
        if (hasExistingProof && Number(task.progress || 0) < TASK_PROGRESS_SUBMITTED) {
          await query(
            `UPDATE goal_member_tasks
             SET progress = ?,
                 status = CASE WHEN COALESCE(status, 'Not Started') IN ('Not Started', 'Blocked') THEN 'In Progress' ELSE status END,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [TASK_PROGRESS_SUBMITTED, taskId]
          );

          await recomputeGoalProgress(Number(task.goal_id));
        }

        return res.json({ success: true, task_id: taskId, already_submitted: true, message: 'Proof already submitted and pending review' });
      }
      if (assigneeSubmittedProof) {
        const hasProofImage = submittedProofFiles.length > 0 || (typeof b.proof_image === 'string' && b.proof_image.trim().length > 0);
        const nextProgress = Math.max(0, Math.min(100, Math.max(Number(task.progress || 0), hasProofImage ? TASK_PROGRESS_SUBMITTED : 0)));
        const currentProofFiles = normalizeProofFilesPayload(task.proof_image);
        const proofRevisionHistory = parseJsonArray(task.proof_revision_history);
        if (currentProofFiles.length > 0 && currentProofReviewStatus !== 'Not Submitted') {
          const revisionNumber = proofRevisionHistory.length + 1;
          proofRevisionHistory.push({
            revision_number: revisionNumber,
            revision_label: `${ordinalLabel(revisionNumber)} revision`,
            proof_review_status: currentProofReviewStatus,
            proof_review_note: String(task.proof_review_note || '').trim() || null,
            proof_review_file_data: String(task.proof_review_file_data || '').trim() || null,
            proof_review_file_name: String(task.proof_review_file_name || '').trim() || null,
            proof_review_file_type: String(task.proof_review_file_type || '').trim() || null,
            proof_submitted_at: task.proof_submitted_at || null,
            archived_at: new Date().toISOString(),
            proof_files: currentProofFiles,
          });
          sets.push('proof_revision_history = ?');
          vals.push(JSON.stringify(proofRevisionHistory));
        }
        sets.push('proof_submitted_at = ?');
        vals.push(hasProofImage ? new Date().toISOString() : null);
        sets.push('proof_review_status = ?');
        vals.push(hasProofImage ? 'Pending Review' : 'Not Submitted');
        sets.push('proof_reviewed_by = ?');
        vals.push(null);
        sets.push('proof_reviewed_role = ?');
        vals.push(null);
        sets.push('proof_reviewed_at = ?');
        vals.push(null);
        sets.push('proof_review_rating = ?');
        vals.push(null);
        if (hasProofImage) {
          if (submittedProofFiles.length > 0) {
            sets.push('proof_image = ?');
            vals.push(JSON.stringify(submittedProofFiles));
            sets.push('proof_file_name = ?');
            vals.push(submittedProofFiles[0]?.proof_file_name || null);
            sets.push('proof_file_type = ?');
            vals.push(submittedProofFiles[0]?.proof_file_type || null);
          }
          sets.push('status = ?');
          vals.push('In Progress');
          sets.push('progress = ?');
          vals.push(nextProgress);
        }
      }

      const reviewerSetStatus = !(role === 'Employee' && !isGoalLeader) && b.proof_review_status !== undefined;
      const managerEditingRatingOnly = normalizeUserRole(role) === 'Manager' && b.proof_review_status === undefined && b.proof_review_rating !== undefined;
      const existingTaskReviewerRole = String(task.proof_reviewed_role || '').trim().toLowerCase();
      if (managerEditingRatingOnly && String(task.proof_review_status || '').trim() !== 'Approved') {
        return res.status(409).json({ error: 'Manager rating can only be updated after this proof is approved' });
      }
      if (reviewerSetStatus && isGoalLeader && !(isPrivilegedRole(role) || role === 'Manager') && Number(task.tl_review_locked || 0) === 1) {
        return res.status(403).json({ error: 'Team leader review is locked for this proof. Only manager review actions are allowed.' });
      }
      if (reviewerSetStatus && String(task.proof_review_status || '') === 'Approved' && String(b.proof_review_status || '') !== 'Approved' && !(role === 'Manager' || isPrivilegedRole(role))) {
        return res.status(409).json({ error: 'Proof decision already finalized as Approved' });
      }
      if (reviewerSetStatus) {
        const reviewedStatus = String(b.proof_review_status || '');
        const isReviewed = reviewedStatus === 'Approved' || reviewedStatus === 'Needs Revision' || reviewedStatus === 'Rejected';
        const existingRating = normalizeProofReviewRating(task.proof_review_rating);
        const normalizedRating = normalizeProofReviewRating(b.proof_review_rating);
        const effectiveRating = normalizedRating ?? existingRating ?? ((role === 'Manager' && isReviewed) ? 5 : null);
        const hasExistingProof = String(task.proof_image || '').trim().length > 0;

        sets.push('proof_review_status = ?');
        vals.push(reviewedStatus || 'Not Submitted');

        if (b.proof_review_note !== undefined) {
          sets.push('proof_review_note = ?');
          vals.push(b.proof_review_note);
        }

        if (b.proof_review_file_data !== undefined) {
          sets.push('proof_review_file_data = ?');
          vals.push(String(b.proof_review_file_data || '').trim() || null);
        }
        if (b.proof_review_file_name !== undefined) {
          sets.push('proof_review_file_name = ?');
          vals.push(String(b.proof_review_file_name || '').trim() || null);
        }
        if (b.proof_review_file_type !== undefined) {
          sets.push('proof_review_file_type = ?');
          vals.push(String(b.proof_review_file_type || '').trim() || null);
        }

        if (reviewedStatus === 'Approved' && !hasExistingProof) {
          return res.status(400).json({ error: 'Member proof file is required before approval' });
        }

        if (reviewedStatus === 'Approved') {
          const isManagerApproval = normalizeUserRole(role) === 'Manager';
          const nextProgress = isManagerApproval
            ? TASK_PROGRESS_REVIEW_APPROVED
            : Math.max(Number(task.progress || 0), 75);
          sets.push('status = ?');
          vals.push(isManagerApproval ? 'Completed' : 'In Progress');
          sets.push('progress = ?');
          vals.push(nextProgress);
          if (!isManagerApproval && isGoalLeader && !isPrivilegedRole(role)) {
            sets.push('tl_review_locked = ?');
            vals.push(1);
          }
        } else if (reviewedStatus === 'Needs Revision') {
          const currentProgress = Math.max(0, Math.min(100, Number(task.progress || 0)));
          sets.push('status = ?');
          vals.push('In Progress');
          sets.push('progress = ?');
          vals.push(Math.max(50, Math.min(currentProgress, 75)));
        } else if (reviewedStatus === 'Rejected') {
          const currentProgress = Math.max(0, Math.min(100, Number(task.progress || 0)));
          sets.push('status = ?');
          vals.push('Blocked');
          sets.push('progress = ?');
          vals.push(Math.min(currentProgress, 50));
        }

        sets.push('proof_reviewed_by = ?');
        vals.push(isReviewed ? (actor.id || null) : null);
        sets.push('proof_reviewed_role = ?');
        vals.push(isReviewed ? (normalizeUserRole(role) || String(role || '') || null) : null);
        sets.push('proof_reviewed_at = ?');
        vals.push(isReviewed ? new Date().toISOString() : null);
        sets.push('proof_review_rating = ?');
        vals.push(reviewedStatus === 'Approved' ? null : effectiveRating);
      } else if (managerEditingRatingOnly) {
        const normalizedRating = normalizeProofReviewRating(b.proof_review_rating);
        if (normalizedRating === null) {
          return res.status(400).json({ error: 'Manager rating (1-5) is required' });
        }

        if (Number(task.proof_review_rating || 0) >= 1 && Number(task.proof_review_rating || 0) <= 5) {
          return res.status(409).json({ error: 'Member rating is already locked' });
        }

        if (b.proof_review_note !== undefined) {
          sets.push('proof_review_note = ?');
          vals.push(b.proof_review_note);
        }

        sets.push('proof_reviewed_by = ?');
        vals.push(Number(actor?.id || 0) || null);
        sets.push('proof_reviewed_role = ?');
        vals.push(normalizeUserRole(role) || String(role || '') || null);
        sets.push('proof_reviewed_at = ?');
        vals.push(new Date().toISOString());
        sets.push('proof_review_rating = ?');
        vals.push(normalizedRating);
      }
      if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

      sets.push('updated_at = CURRENT_TIMESTAMP');
      vals.push(taskId);
      await query(`UPDATE goal_member_tasks SET ${sets.join(', ')} WHERE id = ?`, vals);

      const avgProgress = await recomputeGoalProgress(Number(task.goal_id));

      try {
        const updatedTaskRows: any = await query(
          'SELECT id, goal_id, member_employee_id, status, progress, proof_review_status, proof_review_rating FROM goal_member_tasks WHERE id = ?',
          [taskId]
        );
        const updatedTask = Array.isArray(updatedTaskRows) ? updatedTaskRows[0] : updatedTaskRows;
        const payload = {
          goal_id: task.goal_id,
          task_id: taskId,
          action: 'task_updated',
          goal_progress: avgProgress,
          task_status: String(updatedTask?.status || task.status || ''),
          task_progress: Number(updatedTask?.progress ?? task.progress ?? 0),
          proof_review_status: String(updatedTask?.proof_review_status || b?.proof_review_status || task.proof_review_status || ''),
          proof_review_rating: Number(updatedTask?.proof_review_rating ?? b?.proof_review_rating ?? task.proof_review_rating ?? 0),
          updated_at: new Date().toISOString(),
        };
        if (task.leader_id) io.to(`user_${task.leader_id}`).emit('goals:updated', payload);
        const goalEmployeeId = normalizeEmployeeId(task.goal_employee_id);
        if (goalEmployeeId) io.to(`employee_${goalEmployeeId}`).emit('goals:updated', payload);
        const memberEmployeeId = normalizeEmployeeId(updatedTask?.member_employee_id || task.member_employee_id);
        if (memberEmployeeId) io.to(`employee_${memberEmployeeId}`).emit('goals:updated', payload);
        io.to('role_Manager').emit('goals:updated', payload);
        io.to('role_HR').emit('goals:updated', payload);
        io.to('role_Admin').emit('goals:updated', payload);
      } catch (emitErr) {
        console.error('goals:updated emit error (update task):', emitErr);
      }

      await recordAudit(actor, 'update_goal_member_task', 'goal_member_tasks', taskId, null, b, { route: req.originalUrl });
      res.json({ success: true, task_id: taskId });
    } catch (err: any) {
      console.error('PUT /api/member-tasks/:id error:', err);
      res.status(500).json({ error: 'Database error', detail: String(err?.message || '') });
    }
  });

  app.delete('/api/member-tasks/:id', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = normalizeUserRole(actor.role) || String(actor.role || '');
      const taskId = parseInt(String(req.params.id));
      if (!taskId) return res.status(400).json({ error: 'Invalid task id' });

      let taskRows: any;
      try {
        taskRows = await query(
          'SELECT t.*, g.leader_id, g.employee_id as goal_employee_id, g.department as goal_department FROM goal_member_tasks t LEFT JOIN goals g ON g.id = t.goal_id WHERE t.id = ? AND t.deleted_at IS NULL AND g.deleted_at IS NULL',
          [taskId]
        );
      } catch (e: any) {
        const msg = String(e?.message || '').toLowerCase();
        const missingGoalDeptColumn = String(e?.code || '') === '42703' || msg.includes('g.department') || msg.includes('goal_department');
        if (!missingGoalDeptColumn) throw e;
        taskRows = await query(
          'SELECT t.*, g.leader_id, g.employee_id as goal_employee_id FROM goal_member_tasks t LEFT JOIN goals g ON g.id = t.goal_id WHERE t.id = ? AND t.deleted_at IS NULL AND g.deleted_at IS NULL',
          [taskId]
        );
      }
      const task = Array.isArray(taskRows) ? taskRows[0] : taskRows;
      if (!task) return res.json({ success: true, task_id: taskId, already_removed: true });

      let allowed = false;
      if (isPrivilegedRole(role)) allowed = true;
      else if (role === 'Manager') {
        const goalEmployeeId = normalizeEmployeeId(task.goal_employee_id);
        if (goalEmployeeId) {
          const allowedMgr = await canManagerAccessEmployee(actor.id, goalEmployeeId);
          if (allowedMgr) allowed = true;
        } else {
          const actorDept = String(
            actor.dept ||
            actor.department ||
            actor.employee_dept ||
            actor.employee_department ||
            actor.employee?.dept ||
            ''
          ).trim().toLowerCase();
          const goalDept = String(task.goal_department || '').trim().toLowerCase();
          if (actorDept && goalDept && actorDept === goalDept) allowed = true;
        }
      } else if (role === 'Employee') {
        if (Number(task.leader_id) === Number(actor.id)) allowed = true;
      }
      if (!allowed) return res.status(403).json({ error: 'Forbidden' });

      const deleteResult: any = await query(
        'UPDATE goal_member_tasks SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL',
        [taskId]
      );
      if (typeof deleteResult?.affectedRows === 'number' && deleteResult.affectedRows === 0) {
        return res.json({ success: true, task_id: taskId, already_removed: true });
      }

      const avgProgress = await recomputeGoalProgress(Number(task.goal_id));

      try {
        const payload = {
          goal_id: task.goal_id,
          task_id: taskId,
          action: 'task_deleted',
          goal_progress: avgProgress,
          updated_at: new Date().toISOString(),
        };
        if (task.leader_id) io.to(`user_${task.leader_id}`).emit('goals:updated', payload);
        const goalEmployeeId = normalizeEmployeeId(task.goal_employee_id);
        if (goalEmployeeId) io.to(`employee_${goalEmployeeId}`).emit('goals:updated', payload);
        const memberEmployeeId = normalizeEmployeeId(task.member_employee_id);
        if (memberEmployeeId) io.to(`employee_${memberEmployeeId}`).emit('goals:updated', payload);
        io.to('role_Manager').emit('goals:updated', payload);
        io.to('role_HR').emit('goals:updated', payload);
        io.to('role_Admin').emit('goals:updated', payload);
      } catch (emitErr) {
        console.error('goals:updated emit error (delete task):', emitErr);
      }

      await recordAudit(actor, 'delete_goal_member_task', 'goal_member_tasks', taskId, null, null, { route: req.originalUrl });
      res.json({ success: true });
    } catch (err: any) {
      console.error('DELETE /api/member-tasks/:id error:', err);
      res.status(500).json({ error: 'Database error', detail: String(err?.message || '') });
    }
  });

  app.post('/api/deadline-extension-requests', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const normalizedRole = normalizeUserRole(actor.role);
      const actorEmployeeId = normalizeEmployeeId(actor.employee_id);
      const entityType = String(req.body?.entity_type || '').trim().toLowerCase();
      const requestedDueDate = String(req.body?.requested_due_date || '').trim();
      const reason = String(req.body?.reason || '').trim();

      if ((entityType !== 'goal' && entityType !== 'task') || !requestedDueDate) {
        return res.status(400).json({ error: 'Invalid extension request payload' });
      }

      if (entityType === 'goal') {
        const goalId = parseInt(String(req.body?.goal_id));
        if (!goalId) return res.status(400).json({ error: 'Invalid goal id' });

        const goalRows: any = await query('SELECT id, title, target_date, leader_id, employee_id, department FROM goals WHERE id = ?', [goalId]);
        const goal = Array.isArray(goalRows) ? goalRows[0] : goalRows;
        if (!goal) return res.status(404).json({ error: 'Goal not found' });

        if (normalizedRole !== 'Employee' || Number(goal.leader_id) !== Number(actor.id)) {
          return res.status(403).json({ error: 'Only the assigned team leader can request a goal deadline extension' });
        }

        const pendingRows: any = await query(
          "SELECT id FROM deadline_extension_requests WHERE entity_type = 'goal' AND goal_id = ? AND status = 'Pending' LIMIT 1",
          [goalId]
        );
        const pending = Array.isArray(pendingRows) ? pendingRows[0] : pendingRows;
        if (pending?.id) return res.status(409).json({ error: 'A pending goal extension request already exists' });

        const inserted: any = await query(
          `INSERT INTO deadline_extension_requests
             (entity_type, goal_id, requester_user_id, requester_employee_id, requester_role, next_approver_role, status, current_due_date, requested_due_date, reason, created_at, updated_at)
           VALUES ('goal', ?, ?, ?, ?, 'Manager', 'Pending', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           RETURNING id`,
          [goalId, actor.id || null, actorEmployeeId, actor.role || null, goal.target_date || null, requestedDueDate, reason || null]
        );

        await recordAudit(actor, 'create_deadline_extension_request', 'deadline_extension_requests', inserted?.insertId || null, null, {
          entity_type: 'goal',
          goal_id: goalId,
          requested_due_date: requestedDueDate,
          reason,
        }, { route: req.originalUrl });

        return res.json({ success: true });
      }

      const taskId = parseInt(String(req.body?.task_id));
      if (!taskId) return res.status(400).json({ error: 'Invalid task id' });

      const taskRows: any = await query(
        `SELECT t.id, t.goal_id, t.member_employee_id, t.due_date,
                g.leader_id, g.employee_id AS goal_employee_id, g.target_date AS goal_target_date
         FROM goal_member_tasks t
         LEFT JOIN goals g ON g.id = t.goal_id
         WHERE t.id = ?`,
        [taskId]
      );
      const task = Array.isArray(taskRows) ? taskRows[0] : taskRows;
      if (!task) return res.status(404).json({ error: 'Task not found' });

      if (normalizedRole !== 'Employee' || !actorEmployeeId || actorEmployeeId !== normalizeEmployeeId(task.member_employee_id)) {
        return res.status(403).json({ error: 'Only the delegated member can request a task deadline extension' });
      }
      if (!task.leader_id) {
        return res.status(400).json({ error: 'Task has no team leader approver configured' });
      }

      const normalizedRequestedTaskDueDate = normalizeDateOnly(requestedDueDate);
      const normalizedGoalDueDateForTask = normalizeDateOnly(task.goal_target_date);
      if (normalizedRequestedTaskDueDate && normalizedGoalDueDateForTask && normalizedRequestedTaskDueDate > normalizedGoalDueDateForTask) {
        return res.status(400).json({ error: 'Requested task due date cannot exceed the goal due date unless the goal deadline extension is approved' });
      }

      const pendingRows: any = await query(
        "SELECT id FROM deadline_extension_requests WHERE entity_type = 'task' AND task_id = ? AND status = 'Pending' LIMIT 1",
        [taskId]
      );
      const pending = Array.isArray(pendingRows) ? pendingRows[0] : pendingRows;
      if (pending?.id) return res.status(409).json({ error: 'A pending task extension request already exists' });

      const inserted: any = await query(
        `INSERT INTO deadline_extension_requests
           (entity_type, goal_id, task_id, requester_user_id, requester_employee_id, requester_role, next_approver_role, status, current_due_date, requested_due_date, reason, created_at, updated_at)
         VALUES ('task', ?, ?, ?, ?, ?, 'Team Leader', 'Pending', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id`,
        [task.goal_id || null, taskId, actor.id || null, actorEmployeeId, actor.role || null, task.due_date || null, requestedDueDate, reason || null]
      );

      await recordAudit(actor, 'create_deadline_extension_request', 'deadline_extension_requests', inserted?.insertId || null, null, {
        entity_type: 'task',
        goal_id: task.goal_id,
        task_id: taskId,
        requested_due_date: requestedDueDate,
        reason,
      }, { route: req.originalUrl });

      return res.json({ success: true });
    } catch (err: any) {
      console.error('POST /api/deadline-extension-requests error:', err);
      return res.status(500).json({ error: 'Database error', detail: String(err?.message || '') });
    }
  });

  app.get('/api/deadline-extension-requests/mine', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const rows: any = await query(
        `SELECT r.*, g.title AS goal_title,
                t.title AS task_title,
                t.member_employee_id,
                rm.name AS requester_name,
                COALESCE(ru.full_name, ru.username, ru.email) AS requester_user_name,
                COALESCE(au.full_name, au.username, au.email) AS approver_name
         FROM deadline_extension_requests r
         LEFT JOIN goals g ON g.id = r.goal_id
         LEFT JOIN goal_member_tasks t ON t.id = r.task_id
         LEFT JOIN users ureq ON ureq.id = r.requester_user_id
         LEFT JOIN employees rm ON rm.id = ureq.employee_id
         LEFT JOIN users ru ON ru.id = r.requester_user_id
         LEFT JOIN users au ON au.id = r.approver_user_id
         WHERE r.requester_user_id = ?
         ORDER BY COALESCE(r.updated_at, r.created_at) DESC`,
        [actor.id || 0]
      );
      res.json(Array.isArray(rows) ? rows : []);
    } catch (err: any) {
      console.error('GET /api/deadline-extension-requests/mine error:', err);
      res.status(500).json({ error: 'Database error', detail: String(err?.message || '') });
    }
  });

  app.get('/api/deadline-extension-requests/pending', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      const normalizedRole = normalizeUserRole(role);
      const actorCtx = await getActorOrgContext(Number(actor.id || 0));
      const actorDept = normalizeDept(actorCtx.dept);

      const rows: any = await query(
        `SELECT r.*, g.title AS goal_title, g.employee_id AS goal_employee_id, g.leader_id, g.department AS goal_department,
                t.title AS task_title, t.member_employee_id,
                rm.name AS requester_name,
                COALESCE(ru.full_name, ru.username, ru.email) AS requester_user_name
         FROM deadline_extension_requests r
         LEFT JOIN goals g ON g.id = r.goal_id
         LEFT JOIN goal_member_tasks t ON t.id = r.task_id
         LEFT JOIN users ureq ON ureq.id = r.requester_user_id
         LEFT JOIN employees rm ON rm.id = ureq.employee_id
         LEFT JOIN users ru ON ru.id = r.requester_user_id
         WHERE r.status = 'Pending'
         ORDER BY r.created_at ASC`
      );
      const pending = Array.isArray(rows) ? rows : [];

      const out: any[] = [];
      for (const row of pending) {
        if (isPrivilegedRole(role)) {
          out.push(row);
          continue;
        }

        if (normalizedRole === 'Manager') {
          if (String(row?.next_approver_role || '') !== 'Manager') continue;
          const goalEmployeeId = normalizeEmployeeId(row?.goal_employee_id);
          if (goalEmployeeId) {
            const allowedMgr = await canManagerAccessEmployee(actor.id, goalEmployeeId);
            if (allowedMgr) out.push(row);
            continue;
          }
          const goalDept = normalizeDept(row?.goal_department);
          if (actorDept && goalDept && actorDept === goalDept) out.push(row);
          continue;
        }

        if (normalizedRole === 'Employee') {
          if (String(row?.next_approver_role || '') !== 'Team Leader') continue;
          if (Number(row?.leader_id) === Number(actor.id)) out.push(row);
          continue;
        }
      }

      res.json(out);
    } catch (err: any) {
      console.error('GET /api/deadline-extension-requests/pending error:', err);
      res.status(500).json({ error: 'Database error', detail: String(err?.message || '') });
    }
  });

  app.put('/api/deadline-extension-requests/:id/decision', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      const normalizedRole = normalizeUserRole(role);
      const actorCtx = await getActorOrgContext(Number(actor.id || 0));
      const actorDept = normalizeDept(actorCtx.dept);
      const requestId = parseInt(String(req.params.id));
      const decision = String(req.body?.decision || '').trim().toLowerCase();
      const note = String(req.body?.note || '').trim();
      if (!requestId || (decision !== 'approve' && decision !== 'reject')) {
        return res.status(400).json({ error: 'Invalid decision payload' });
      }

      const rows: any = await query(
        `SELECT r.*, g.employee_id AS goal_employee_id, g.leader_id, g.department AS goal_department, g.target_date AS goal_target_date
         FROM deadline_extension_requests r
         LEFT JOIN goals g ON g.id = r.goal_id
         WHERE r.id = ?
         LIMIT 1`,
        [requestId]
      );
      const ext = Array.isArray(rows) ? rows[0] : rows;
      if (!ext) return res.status(404).json({ error: 'Extension request not found' });
      if (String(ext.status || '') !== 'Pending') return res.status(400).json({ error: 'Request is already resolved' });

      let allowed = false;
      if (isPrivilegedRole(role)) {
        allowed = true;
      } else if (normalizedRole === 'Manager' && String(ext.next_approver_role || '') === 'Manager') {
        const goalEmployeeId = normalizeEmployeeId(ext.goal_employee_id);
        if (goalEmployeeId) {
          const allowedMgr = await canManagerAccessEmployee(actor.id, goalEmployeeId);
          if (allowedMgr) allowed = true;
        } else {
          const goalDept = normalizeDept(ext.goal_department);
          if (actorDept && goalDept && actorDept === goalDept) allowed = true;
        }
      } else if (normalizedRole === 'Employee' && String(ext.next_approver_role || '') === 'Team Leader') {
        if (Number(ext.leader_id) === Number(actor.id)) allowed = true;
      }

      if (!allowed) return res.status(403).json({ error: 'Forbidden' });

      if (decision === 'approve') {
        if (String(ext.entity_type) === 'goal') {
          await query('UPDATE goals SET target_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [ext.requested_due_date, ext.goal_id]);
        } else if (String(ext.entity_type) === 'task') {
          const normalizedRequestedTaskDueDate = normalizeDateOnly(ext.requested_due_date);
          const normalizedGoalDueDateForTask = normalizeDateOnly(ext.goal_target_date);
          if (normalizedRequestedTaskDueDate && normalizedGoalDueDateForTask && normalizedRequestedTaskDueDate > normalizedGoalDueDateForTask) {
            return res.status(409).json({ error: 'Cannot approve task deadline extension beyond the goal due date. Approve goal extension first.' });
          }
          await query('UPDATE goal_member_tasks SET due_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [ext.requested_due_date, ext.task_id]);
        }
      }

      const nextStatus = decision === 'approve' ? 'Approved' : 'Rejected';
      await query(
        `UPDATE deadline_extension_requests
         SET status = ?, approver_user_id = ?, decision_note = ?, resolved_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [nextStatus, actor.id || null, note || null, new Date().toISOString(), requestId]
      );

      try {
        if (ext?.requester_user_id) {
          await createNotification({
            user_id: Number(ext.requester_user_id),
            type: decision === 'approve' ? 'success' : 'warning',
            message: `Deadline extension request ${decision === 'approve' ? 'approved' : 'rejected'}`,
            source: 'deadline_extension_requests',
          });
        }
      } catch {}

      await recordAudit(actor, 'resolve_deadline_extension_request', 'deadline_extension_requests', requestId, null, {
        decision: nextStatus,
        note,
        entity_type: ext.entity_type,
        goal_id: ext.goal_id,
        task_id: ext.task_id,
      }, { route: req.originalUrl });

      try {
        const payload = {
          action: 'deadline_extension_resolved',
          entity_type: ext.entity_type,
          request_id: requestId,
          goal_id: ext.goal_id,
          task_id: ext.task_id,
          decision: nextStatus,
          updated_at: new Date().toISOString(),
        };
        if (ext.goal_id) io.to('role_Manager').emit('goals:updated', payload);
        if (ext.goal_id) io.to('role_HR').emit('goals:updated', payload);
        if (ext.goal_id) io.to('role_Admin').emit('goals:updated', payload);
      } catch {}

      res.json({ success: true, status: nextStatus });
    } catch (err: any) {
      console.error('PUT /api/deadline-extension-requests/:id/decision error:', err);
      res.status(500).json({ error: 'Database error', detail: String(err?.message || '') });
    }
  });

  // ---- Coaching Logs CRUD ----
  const canAccessCoachingEmployee = async (actor: any, employeeId: number | null): Promise<boolean> => {
    const role = actor?.role;
    const normalizedRole = normalizeUserRole(role);
    const actorCtx = await getActorOrgContext(Number(actor?.id || 0));

    if (!employeeId) return false;

    if (isPrivilegedRole(role)) {
      if (normalizedRole === 'HR') {
        const hrDept = normalizeDept(actorCtx.dept);
        if (!hrDept) return false;
        return await canActorAccessEmployeeByDept(hrDept, employeeId);
      }
      return true;
    }

    if (role === 'Manager') {
      const allowedByManagerLink = await canManagerAccessEmployee(actor.id, employeeId);
      if (allowedByManagerLink) return true;
      const managerDept = normalizeDept(actorCtx.dept);
      if (!managerDept) return false;
      return await canActorAccessEmployeeByDept(managerDept, employeeId);
    }

    if (role === 'Employee') {
      if (actorCtx.isSupervisor) {
        const supervisorDept = normalizeDept(actorCtx.dept);
        if (!supervisorDept) return false;
        return await canActorAccessEmployeeByDept(supervisorDept, employeeId);
      }
      return normalizeEmployeeId(actor.employee_id) === employeeId;
    }

    return false;
  };

  app.get("/api/coaching_logs", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      const normalizedRole = normalizeUserRole(role);
      const actorCtx = await getActorOrgContext(Number(actor.id || 0));

      // HR is department-scoped; Admin can see all.
      if (isPrivilegedRole(role)) {
        if (normalizedRole === 'HR') {
          const hrDept = normalizeDept(actorCtx.dept);
          if (!hrDept) return res.json([]);
          const rows = await query(
            "SELECT c.*, e.name as employee_name FROM coaching_logs c LEFT JOIN employees e ON c.employee_id = e.id WHERE LOWER(TRIM(COALESCE(e.dept, ''))) = LOWER(TRIM(?)) ORDER BY c.created_at DESC",
            [hrDept]
          );
          return res.json(Array.isArray(rows) ? rows : []);
        }
        const rows = await query("SELECT c.*, e.name as employee_name FROM coaching_logs c LEFT JOIN employees e ON c.employee_id = e.id ORDER BY c.created_at DESC");
        return res.json(rows);
      }

      // Managers see only logs for their department's employees
      if (role === 'Manager') {
        const actorDept = normalizeDept(actorCtx.dept || actor.dept || actor.department);
        if (!actorDept) return res.json([]);
        const rows = await query(
          "SELECT c.*, e.name as employee_name FROM coaching_logs c LEFT JOIN employees e ON c.employee_id = e.id WHERE LOWER(TRIM(COALESCE(e.dept, ''))) = LOWER(TRIM(?)) AND c.deleted_at IS NULL ORDER BY c.created_at DESC",
          [actorDept]
        );
        return res.json(Array.isArray(rows) ? rows : []);
      }

      // Employees see logs about them
      if (role === 'Employee') {
        const actorCtx = await getActorOrgContext(Number(actor.id || 0));
        const empId = normalizeEmployeeId(actor.employee_id) || normalizeEmployeeId(actorCtx.employeeId);
        if (!empId) return res.json([]);
        const rows = await query(
          "SELECT c.*, e.name as employee_name FROM coaching_logs c LEFT JOIN employees e ON c.employee_id = e.id WHERE c.employee_id = ? AND c.deleted_at IS NULL ORDER BY c.created_at DESC",
          [empId]
        );
        return res.json(Array.isArray(rows) ? rows : []);
      }

      return res.json([]);
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.delete("/api/coaching_logs/:id", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      if (!isPrivilegedRole(role) && role !== 'Manager') return res.status(403).json({ error: 'Forbidden' });

      const rows: any = await query('SELECT id, employee_id FROM coaching_logs WHERE id = ?', [req.params.id]);
      const log = Array.isArray(rows) ? rows[0] : rows;
      if (!log) return res.status(404).json({ error: 'Coaching log not found' });

      const employeeId = normalizeEmployeeId(log.employee_id);
      const allowed = await canAccessCoachingEmployee(actor, employeeId);
      if (!allowed) return res.status(403).json({ error: 'Forbidden' });

      await softDeleteById('coaching_logs', req.params.id);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- Coaching Chat Messages ----
  app.get("/api/coaching_chats/:employee_id", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const employeeId = normalizeEmployeeId(req.params.employee_id);
      if (!employeeId) return res.status(400).json({ error: 'Invalid employee_id' });
      const allowed = await canAccessCoachingEmployee(actor, employeeId);
      if (!allowed) return res.status(403).json({ error: 'Forbidden' });

      const rows = await query("SELECT * FROM coaching_chats WHERE employee_id = ? ORDER BY created_at ASC", [employeeId]);
      res.json(rows);
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.post("/api/coaching_chats", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const employeeId = normalizeEmployeeId(req.body?.employee_id);
      if (!employeeId) return res.status(400).json({ error: 'Invalid employee_id' });
      const allowed = await canAccessCoachingEmployee(actor, employeeId);
      if (!allowed) return res.status(403).json({ error: 'Forbidden' });

      const { employee_id, sender_role, sender_name, message } = req.body;
      await query("INSERT INTO coaching_chats (employee_id, sender_role, sender_name, message) VALUES (?, ?, ?, ?)",
        [employeeId, sender_role, sender_name, message]);
      // Notify the other party
      if (sender_role === 'Employee') {
        // Find the user linked to this employee's manager
        const emp: any = await query("SELECT e.name, e.manager_id FROM employees e WHERE e.id = ?", [employeeId]);
        const empRow = Array.isArray(emp) ? emp[0] : emp;
        if (empRow) {
          const mgrUsers: any = await query("SELECT id FROM users WHERE employee_id = ? AND role = 'Manager'", [empRow.manager_id]);
          const mgrUser = Array.isArray(mgrUsers) ? mgrUsers[0] : mgrUsers;
          if (mgrUser) {
            await createNotification({ user_id: mgrUser.id, type: 'info', message: `New chat message from ${sender_name || empRow.name}`, source: 'coaching_chat' });
          }
        }
      } else {
        // Manager sent â€” notify the employee
        const empUsers: any = await query("SELECT id FROM users WHERE employee_id = ?", [employeeId]);
        const empUser = Array.isArray(empUsers) ? empUsers[0] : empUsers;
        if (empUser) {
          await createNotification({ user_id: empUser.id, type: 'info', message: `New chat message from ${sender_name || 'your Manager'}`, source: 'coaching_chat' });
        }
      }
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.delete("/api/coaching_chats/:employee_id", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const employeeId = normalizeEmployeeId(req.params.employee_id);
      if (!employeeId) return res.status(400).json({ error: 'Invalid employee_id' });
      const allowed = await canAccessCoachingEmployee(actor, employeeId);
      if (!allowed) return res.status(403).json({ error: 'Forbidden' });

      await softDeleteWhere('coaching_chats', 'employee_id = ?', [employeeId]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
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
    try { await softDeleteById('elearning_courses', req.params.id); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.get("/api/elearning_recommendations/:employee_id", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const employeeId = normalizeEmployeeId(req.params.employee_id);
      if (!employeeId) return res.status(400).json({ error: 'Invalid employee_id' });
      const allowed = await canAccessCoachingEmployee(actor, employeeId);
      if (!allowed) return res.status(403).json({ error: 'Forbidden' });

      const rows = await query("SELECT * FROM elearning_recommendations WHERE employee_id = ? ORDER BY created_at DESC", [employeeId]);
      res.json(rows);
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.get("/api/elearning_recommendations", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      const normalizedRole = normalizeUserRole(role);
      const actorCtx = await getActorOrgContext(Number(actor.id || 0));

      if (isPrivilegedRole(role)) {
        if (normalizedRole === 'HR') {
          const hrDept = normalizeDept(actorCtx.dept);
          if (!hrDept) return res.json([]);
          const rows = await query(
            "SELECT r.*, e.name as employee_name FROM elearning_recommendations r LEFT JOIN employees e ON r.employee_id = e.id WHERE LOWER(TRIM(COALESCE(e.dept, ''))) = LOWER(TRIM(?)) ORDER BY r.created_at DESC",
            [hrDept]
          );
          return res.json(Array.isArray(rows) ? rows : []);
        }
        const rows = await query("SELECT r.*, e.name as employee_name FROM elearning_recommendations r LEFT JOIN employees e ON r.employee_id = e.id ORDER BY r.created_at DESC");
        return res.json(rows);
      }

      if (role === 'Manager') {
        const managerDept = normalizeDept(actorCtx.dept);
        if (!managerDept) return res.json([]);
        const rows = await query(
          "SELECT r.*, e.name as employee_name FROM elearning_recommendations r LEFT JOIN employees e ON r.employee_id = e.id WHERE LOWER(TRIM(COALESCE(e.dept, ''))) = LOWER(TRIM(?)) ORDER BY r.created_at DESC",
          [managerDept]
        );
        return res.json(Array.isArray(rows) ? rows : []);
      }

      if (role === 'Employee') {
        const actorEmployeeId = normalizeEmployeeId(actor.employee_id);
        if (!actorEmployeeId) return res.json([]);
        const rows = await query(
          "SELECT r.*, e.name as employee_name FROM elearning_recommendations r LEFT JOIN employees e ON r.employee_id = e.id WHERE r.employee_id = ? ORDER BY r.created_at DESC",
          [actorEmployeeId]
        );
        return res.json(Array.isArray(rows) ? rows : []);
      }

      return res.status(403).json({ error: 'Forbidden' });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.post("/api/elearning_recommendations", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const { employee_id, course_id, course_title, reason, weakness, recommended_by } = req.body;
      const employeeId = normalizeEmployeeId(employee_id);
      if (!employeeId) return res.status(400).json({ error: 'Invalid employee_id' });
      const allowed = await canAccessCoachingEmployee(actor, employeeId);
      if (!allowed) return res.status(403).json({ error: 'Forbidden' });

      await query("INSERT INTO elearning_recommendations (employee_id, course_id, course_title, reason, weakness, recommended_by) VALUES (?, ?, ?, ?, ?, ?)",
        [employeeId, course_id, course_title, reason, weakness, recommended_by]);
      // Notify the employee about the new course recommendation
      const recEmpUsers: any = await query("SELECT id FROM users WHERE employee_id = ?", [employeeId]);
      const recEmpUser = Array.isArray(recEmpUsers) ? recEmpUsers[0] : recEmpUsers;
      if (recEmpUser) {
        await createNotification({ user_id: recEmpUser.id, type: 'info', message: `New e-learning recommendation: ${course_title}`, source: 'elearning' });
      }
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.put("/api/elearning_recommendations/:id", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const recRows: any = await query('SELECT id, employee_id FROM elearning_recommendations WHERE id = ?', [req.params.id]);
      const rec = Array.isArray(recRows) ? recRows[0] : recRows;
      if (!rec) return res.status(404).json({ error: 'Recommendation not found' });
      const allowed = await canAccessCoachingEmployee(actor, normalizeEmployeeId(rec.employee_id));
      if (!allowed) return res.status(403).json({ error: 'Forbidden' });

      const { status } = req.body;
      await query("UPDATE elearning_recommendations SET status = ? WHERE id = ?", [status, req.params.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- Appraisals GET/DELETE ----
  app.get("/api/appraisals", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      const normalizedRole = normalizeUserRole(role);
      const includeArchived = String(req.query.include_archived || '0') === '1';
      const archivedFilter = includeArchived
        ? " AND NULLIF(TRIM(COALESCE(a.deleted_at::text, '')), '') IS NOT NULL"
        : " AND NULLIF(TRIM(COALESCE(a.deleted_at::text, '')), '') IS NULL";
      const queryEmployeeId = normalizeEmployeeId(req.query.employee_id);
      const actorCtx = await getActorOrgContext(Number(actor.id || 0));
      // Helper: enrich and send — fills blank print_name fields from linked user IDs
      const sendRows = async (rawRows: any) => {
        const arr = Array.isArray(rawRows) ? rawRows as any[] : (rawRows ? [rawRows] : []);
        return res.json(await enrichAppraisalNames(arr));
      };

      if (isPrivilegedRole(role)) {
        const hrDept = normalizedRole === 'HR' ? normalizeDept(actorCtx.dept) : '';
        if (hrDept) {
          if (queryEmployeeId) {
            const allowed = await canActorAccessEmployeeByDept(hrDept, queryEmployeeId);
            if (!allowed) return res.status(403).json({ error: 'Forbidden' });
            const rows = await query(
              `SELECT a.*, e.name as employee_name FROM appraisals a LEFT JOIN employees e ON a.employee_id = e.id WHERE a.employee_id = ? AND LOWER(TRIM(COALESCE(e.dept, ''))) = LOWER(TRIM(?))${archivedFilter}`,
              [queryEmployeeId, hrDept]
            );
            return sendRows(rows);
          }

          const rows = await query(
            `SELECT a.*, e.name as employee_name FROM appraisals a LEFT JOIN employees e ON a.employee_id = e.id WHERE LOWER(TRIM(COALESCE(e.dept, ''))) = LOWER(TRIM(?))${archivedFilter}`,
            [hrDept]
          );
          return sendRows(rows);
        }

        const rows = queryEmployeeId
          ? await query(`SELECT a.*, e.name as employee_name FROM appraisals a LEFT JOIN employees e ON a.employee_id = e.id WHERE a.employee_id = ?${archivedFilter}`, [queryEmployeeId])
          : await query(`SELECT a.*, e.name as employee_name FROM appraisals a LEFT JOIN employees e ON a.employee_id = e.id WHERE 1=1${archivedFilter}`);
        return sendRows(rows);
      }

      if (role === 'Manager') {
        const managedIds = await getManagedEmployeeIds(actor.id);
        const managerDept = normalizeDept(actorCtx.dept || actor.dept || actor.department);
        if (queryEmployeeId) {
          const allowedByManagerMap = managedIds.includes(queryEmployeeId);
          const allowedByDept = managerDept ? await canActorAccessEmployeeByDept(managerDept, queryEmployeeId) : false;
          if (!allowedByManagerMap && !allowedByDept) return res.status(403).json({ error: 'Forbidden' });

          const rows = allowedByManagerMap
            ? await query(`SELECT a.*, e.name as employee_name FROM appraisals a LEFT JOIN employees e ON a.employee_id = e.id WHERE a.employee_id = ?${archivedFilter}`, [queryEmployeeId])
            : await query(
                `SELECT a.*, e.name as employee_name FROM appraisals a LEFT JOIN employees e ON a.employee_id = e.id WHERE a.employee_id = ? AND LOWER(TRIM(COALESCE(e.dept, ''))) = LOWER(TRIM(?))${archivedFilter}`,
                [queryEmployeeId, managerDept]
              );
          return sendRows(rows);
        }

        if (managedIds.length === 0) {
          if (!managerDept) return res.json([]);
          const rows = await query(
            `SELECT a.*, e.name as employee_name FROM appraisals a LEFT JOIN employees e ON a.employee_id = e.id WHERE LOWER(TRIM(COALESCE(e.dept, ''))) = LOWER(TRIM(?))${archivedFilter}`,
            [managerDept]
          );
          return sendRows(rows);
        }

        const placeholders = managedIds.map(() => '?').join(',');
        const rows = managerDept
          ? await query(
              `SELECT a.*, e.name as employee_name FROM appraisals a LEFT JOIN employees e ON a.employee_id = e.id WHERE (a.employee_id IN (${placeholders}) OR LOWER(TRIM(COALESCE(e.dept, ''))) = LOWER(TRIM(?)))${archivedFilter}`,
              [...managedIds, managerDept]
            )
          : await query(`SELECT a.*, e.name as employee_name FROM appraisals a LEFT JOIN employees e ON a.employee_id = e.id WHERE a.employee_id IN (${placeholders})${archivedFilter}`, managedIds);
        return sendRows(rows);
      }

      if (role === 'Employee') {
        if (actorCtx.isSupervisor) {
          let supervisorDept = normalizeDept(actorCtx.dept);
          if (!supervisorDept) {
            const actorEmployeeId = normalizeEmployeeId(actor.employee_id) || normalizeEmployeeId(actorCtx.employeeId);
            if (actorEmployeeId) {
              const deptRows: any = await query('SELECT dept FROM employees WHERE id = ? LIMIT 1', [actorEmployeeId]);
              const deptRow = Array.isArray(deptRows) ? deptRows[0] : deptRows;
              supervisorDept = normalizeDept(deptRow?.dept || '');
            }
          }
          if (!supervisorDept) return res.json([]);

          if (queryEmployeeId) {
            const allowed = await canActorAccessEmployeeByDept(supervisorDept, queryEmployeeId);
            if (!allowed) return res.status(403).json({ error: 'Forbidden' });
            const rows = await query(
              `SELECT a.*, e.name as employee_name FROM appraisals a LEFT JOIN employees e ON a.employee_id = e.id WHERE a.employee_id = ? AND LOWER(TRIM(COALESCE(e.dept, ''))) = LOWER(TRIM(?))${archivedFilter}`,
              [queryEmployeeId, supervisorDept]
            );
            return sendRows(rows);
          }

          const rows = await query(
            `SELECT a.*, e.name as employee_name FROM appraisals a LEFT JOIN employees e ON a.employee_id = e.id WHERE LOWER(TRIM(COALESCE(e.dept, ''))) = LOWER(TRIM(?))${archivedFilter}`,
            [supervisorDept]
          );
          return sendRows(rows);
        }

        const employeeId = normalizeEmployeeId(actor.employee_id) || normalizeEmployeeId(actorCtx.employeeId);
        if (!employeeId) return res.json([]);
        const rows = await query(`SELECT a.*, e.name as employee_name FROM appraisals a LEFT JOIN employees e ON a.employee_id = e.id WHERE a.employee_id = ?${archivedFilter}`, [employeeId]);
        return sendRows(rows);
      }

      return res.status(403).json({ error: 'Forbidden' });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.delete("/api/appraisals/:id", authenticateToken, async (req, res) => {
    try { await softDeleteById('appraisals', req.params.id); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- Discipline Records CRUD ----
  app.get("/api/discipline_records", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      const actorCtx = await getActorOrgContext(Number(actor.id || 0));
      const includeArchived = String(req.query.include_archived || '0') === '1';
      const archivedFilter = includeArchived
        ? ' AND (COALESCE(d.is_archived, 0) = 1 OR d.archived_at IS NOT NULL OR d.deleted_at IS NOT NULL)'
        : ' AND COALESCE(d.is_archived, 0) = 0 AND d.archived_at IS NULL AND d.deleted_at IS NULL';

      if (role === 'HR') {
        const hrDept = normalizeDept(actorCtx.dept || actor.dept || actor.department);
        if (!hrDept) return res.json([]);
        const rows = await query(
          `SELECT d.*, e.name as employee_name, e.dept as dept FROM discipline_records d LEFT JOIN employees e ON d.employee_id = e.id WHERE LOWER(TRIM(COALESCE(e.dept, ''))) = LOWER(TRIM(?))${archivedFilter}`,
          [hrDept]
        );
        return res.json(rows);
      }

      if (role === 'Manager') {
        const managerDept = normalizeDept(actorCtx.dept || actor.dept || actor.department);
        const managerEmployeeId = normalizeEmployeeId(actor.employee_id) || normalizeEmployeeId(actorCtx.employeeId);
        let rows: any[] = [];
        if (managerDept && managerEmployeeId) {
          rows = await query(
            `SELECT d.*, e.name as employee_name, e.dept as dept FROM discipline_records d LEFT JOIN employees e ON d.employee_id = e.id WHERE (LOWER(TRIM(COALESCE(e.dept, ''))) = LOWER(TRIM(?)) OR e.manager_id = ?)${archivedFilter}`,
            [managerDept, managerEmployeeId]
          ) as any[];
        } else if (managerDept) {
          rows = await query(
            `SELECT d.*, e.name as employee_name, e.dept as dept FROM discipline_records d LEFT JOIN employees e ON d.employee_id = e.id WHERE LOWER(TRIM(COALESCE(e.dept, ''))) = LOWER(TRIM(?))${archivedFilter}`,
            [managerDept]
          ) as any[];
        } else if (managerEmployeeId) {
          rows = await query(
            `SELECT d.*, e.name as employee_name, e.dept as dept FROM discipline_records d LEFT JOIN employees e ON d.employee_id = e.id WHERE e.manager_id = ?${archivedFilter}`,
            [managerEmployeeId]
          ) as any[];
        }
        return res.json(Array.isArray(rows) ? rows : []);
      }

      if (role === 'Employee') {
        if (actorCtx.isSupervisor) {
          let supervisorDept = normalizeDept(actorCtx.dept || actor.dept || actor.department);
          if (!supervisorDept) {
            const actorEmployeeId = normalizeEmployeeId(actor.employee_id) || normalizeEmployeeId(actorCtx.employeeId);
            if (actorEmployeeId) {
              const deptRows: any = await query('SELECT dept FROM employees WHERE id = ? LIMIT 1', [actorEmployeeId]);
              const deptRow = Array.isArray(deptRows) ? deptRows[0] : deptRows;
              supervisorDept = normalizeDept(deptRow?.dept || '');
            }
          }
          if (!supervisorDept) return res.json([]);
          const rows = await query(
            `SELECT d.*, e.name as employee_name, e.dept as dept FROM discipline_records d LEFT JOIN employees e ON d.employee_id = e.id WHERE LOWER(TRIM(COALESCE(e.dept, ''))) = LOWER(TRIM(?))${archivedFilter}`,
            [supervisorDept]
          );
          return res.json(rows);
        }

        const employeeId = normalizeEmployeeId(actor.employee_id) || normalizeEmployeeId(actorCtx.employeeId);
        if (!employeeId) return res.json([]);
        const rows = await query(
          `SELECT d.*, e.name as employee_name, e.dept as dept FROM discipline_records d LEFT JOIN employees e ON d.employee_id = e.id WHERE d.employee_id = ?${archivedFilter}`,
          [employeeId]
        );
        return res.json(rows);
      }

      return res.status(403).json({ error: 'Forbidden' });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.post("/api/discipline_records", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      if (!isPrivilegedRole(role) && role !== 'Manager') return res.status(403).json({ error: 'Forbidden' });

      const {
        employee_id, violation_type, warning_level, date_of_warning,
        violation_date, violation_time, violation_place,
        employer_statement, employee_statement, action_taken,
        supervisor, approved_by_name, approved_by_title, approved_by_date,
        copy_distribution,
        prev_first_date, prev_first_type, prev_second_date, prev_second_type, prev_third_date, prev_third_type,
        employee_signature, employee_signature_date,
      } = req.body;

      const targetEmployeeId = normalizeEmployeeId(employee_id);
      if (!targetEmployeeId) return res.status(400).json({ error: 'Invalid employee_id' });

      const empRows: any = await query("SELECT id, dept FROM employees WHERE id = ? LIMIT 1", [targetEmployeeId]);
      const emp = Array.isArray(empRows) ? empRows[0] : empRows;
      if (!emp) return res.status(404).json({ error: 'Employee not found' });
      const employeeDept = String(emp.dept || '').trim();

      if (role === 'Manager') {
        const actorCtx = await getActorOrgContext(Number(actor.id || 0));
        const allowed = await canActorAccessEmployeeByDept(actorCtx.dept || actor.dept || actor.department, targetEmployeeId);
        if (!allowed) return res.status(403).json({ error: 'Managers can only create disciplinary records for their own department' });
      }

      let supervisorUserId: number | null = null;
      const supervisorName = String(supervisor || '').trim();
      if (supervisorName) {
        const supUserRows: any = await query(
          `SELECT u.id
           FROM users u
           LEFT JOIN employees e ON e.id = u.employee_id
           WHERE (
             LOWER(TRIM(COALESCE(u.full_name, ''))) = LOWER(TRIM(?))
             OR LOWER(TRIM(COALESCE(e.name, ''))) = LOWER(TRIM(?))
             OR LOWER(TRIM(COALESCE(u.username, ''))) = LOWER(TRIM(?))
           )
           AND LOWER(TRIM(COALESCE(u.dept, ''))) = LOWER(TRIM(?))
           LIMIT 1`,
          [supervisorName, supervisorName, supervisorName, employeeDept]
        );
        supervisorUserId = Number((Array.isArray(supUserRows) ? supUserRows[0] : supUserRows)?.id || 0) || null;
      }

      const preparerUserId = Number(actor.id || 0) || null;
      const normalizedActorRole = normalizeUserRole(role);
      const fixedApproverName = normalizedActorRole === 'Manager'
        ? String(actor.full_name || actor.username || approved_by_name || '').trim()
        : String(approved_by_name || '').trim();
      const fixedApproverTitle = normalizedActorRole === 'Manager'
        ? String(actor.position || role || approved_by_title || '').trim()
        : String(approved_by_title || '').trim();

      await query(
        `INSERT INTO discipline_records (
          employee_id, violation_type, warning_level, date_of_warning,
          violation_date, violation_time, violation_place,
          employer_statement, employee_statement, action_taken,
          supervisor, fixedApproverName, fixedApproverTitle, approved_by_date,
          copy_distribution,
          prev_first_date, prev_first_type, prev_second_date, prev_second_type, prev_third_date, prev_third_type,
          employee_signature, employee_signature_date,
          preparer_signature, preparer_signature_date,
          supervisor_signature, supervisor_signature_date,
          preparer_user_id, supervisor_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          targetEmployeeId, violation_type, warning_level, date_of_warning,
          violation_date, violation_time, violation_place,
          employer_statement, employee_statement, action_taken,
          supervisor, approved_by_name, approved_by_title, approved_by_date,
          copy_distribution,
          prev_first_date, prev_first_type, prev_second_date, prev_second_type, prev_third_date, prev_third_type,
          employee_signature || null, employee_signature_date || null,
          null, null,
          null, null,
          preparerUserId, supervisorUserId,
        ]
      );

      try {
        let empUserRows: any = await query('SELECT id FROM users WHERE employee_id = ? LIMIT 1', [targetEmployeeId]);
        let empUser = Array.isArray(empUserRows) ? empUserRows[0] : empUserRows;
        if (!empUser?.id) {
          empUserRows = await query(
            `SELECT u.id
             FROM users u
             INNER JOIN employees e ON e.id = ?
             WHERE LOWER(TRIM(COALESCE(u.full_name, u.username, ''))) = LOWER(TRIM(COALESCE(e.name, '')))
             ORDER BY u.id ASC
             LIMIT 1`,
            [targetEmployeeId]
          );
          empUser = Array.isArray(empUserRows) ? empUserRows[0] : empUserRows;
        }
        if (empUser?.id) {
          await createNotification({
            user_id: Number(empUser.id),
            type: 'info',
            message: `A disciplinary action has been filed for you and will require your acknowledgement after management signatures`,
            source: 'discipline_sign',
            employee_id: targetEmployeeId,
          });
        }
        if (supervisorUserId) {
          await createNotification({
            user_id: supervisorUserId,
            type: 'info',
            message: `A disciplinary action is queued for your supervisor signature once preparer signing is complete`,
            source: 'discipline_sign',
            employee_id: targetEmployeeId,
          });
        }
      } catch {}

      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.put("/api/discipline_records/:id/employee-sign", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      if (actor.role !== 'Employee') return res.status(403).json({ error: 'Only employees can sign this record' });

      const actorCtx = await getActorOrgContext(Number(actor.id || 0));
      const employeeId = normalizeEmployeeId(actor.employee_id) || normalizeEmployeeId(actorCtx.employeeId);
      if (!employeeId) return res.status(400).json({ error: 'Employee profile not linked to this account' });

      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid record id' });

      const rows = await query("SELECT id, employee_id, preparer_signature, supervisor_signature FROM discipline_records WHERE id = ?", [id]) as any[];
      const rec = Array.isArray(rows) ? rows[0] : rows;
      if (!rec) return res.status(404).json({ error: 'Record not found' });
      if (Number(rec.employee_id) !== Number(employeeId)) return res.status(403).json({ error: 'You can only sign your own disciplinary records' });
      if (!String(rec.preparer_signature || '').trim()) return res.status(400).json({ error: 'Preparer signature is required before employee signing' });
      if (!String(rec.supervisor_signature || '').trim()) return res.status(400).json({ error: 'Supervisor signature is required before employee signing' });

      const employee_signature = String(req.body?.employee_signature || '').trim();
      const employee_signature_date = String(req.body?.employee_signature_date || '').trim() || new Date().toISOString().split('T')[0];
      const employee_statement = req.body?.employee_statement !== undefined ? String(req.body.employee_statement || '').trim() : null;

      if (!employee_signature) return res.status(400).json({ error: 'Employee signature is required' });

      if (employee_statement !== null) {
        await query(
          "UPDATE discipline_records SET employee_signature = ?, employee_signature_date = ?, employee_statement = ? WHERE id = ?",
          [employee_signature, employee_signature_date, employee_statement, id]
        );
      } else {
        await query(
          "UPDATE discipline_records SET employee_signature = ?, employee_signature_date = ? WHERE id = ?",
          [employee_signature, employee_signature_date, id]
        );
      }

      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  app.put("/api/discipline_records/:id/preparer-sign", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = String(actor.role || '');
      if (!['HR', 'Manager'].includes(role)) return res.status(403).json({ error: 'Only HR or Manager accounts can sign as preparer' });

      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid record id' });

      const rows = await query("SELECT id, employee_id, preparer_user_id FROM discipline_records WHERE id = ?", [id]) as any[];
      const rec = Array.isArray(rows) ? rows[0] : rows;
      if (!rec) return res.status(404).json({ error: 'Record not found' });

      const actorCtx = await getActorOrgContext(Number(actor.id || 0));
      const allowed = await canActorAccessEmployeeByDept(actorCtx.dept || actor.dept || actor.department, normalizeEmployeeId(rec.employee_id));
      if (!allowed) return res.status(403).json({ error: 'Forbidden' });

      const assignedPreparer = Number(rec.preparer_user_id || 0);
      if (assignedPreparer && Number(actor.id || 0) !== assignedPreparer) {
        return res.status(403).json({ error: 'This preparer signature is assigned to a different user' });
      }

      const preparer_signature = String(req.body?.preparer_signature || '').trim();
      const preparer_signature_date = String(req.body?.preparer_signature_date || '').trim() || new Date().toISOString().split('T')[0];
      if (!preparer_signature) return res.status(400).json({ error: 'Preparer signature is required' });

      await query(
        "UPDATE discipline_records SET preparer_signature = ?, preparer_signature_date = ?, preparer_user_id = COALESCE(preparer_user_id, ?) WHERE id = ?",
        [preparer_signature, preparer_signature_date, Number(actor.id || 0) || null, id]
      );

      try {
        const recRows: any = await query('SELECT employee_id, supervisor_user_id FROM discipline_records WHERE id = ? LIMIT 1', [id]);
        const rec2 = Array.isArray(recRows) ? recRows[0] : recRows;
        const targetEmpId = normalizeEmployeeId(rec2?.employee_id);
        const supUserId = Number(rec2?.supervisor_user_id || 0) || null;
        if (supUserId) {
          await createNotification({
            user_id: supUserId,
            type: 'info',
            message: 'A disciplinary action is now ready for your supervisor signature',
            source: 'discipline_sign',
            employee_id: targetEmpId,
          });
        }
      } catch {}

      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  app.put("/api/discipline_records/:id/supervisor-sign", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const actorRole = String(actor.role || '');
      if (!['Employee', 'Manager', 'Leader', 'HR'].includes(actorRole)) {
        return res.status(403).json({ error: 'Only assigned supervisory signers can sign this record' });
      }

      const actorCtx = await getActorOrgContext(Number(actor.id || 0));
      if (actorRole === 'Employee' && !actorCtx.isSupervisor) {
        return res.status(403).json({ error: 'Only supervisor employee accounts can sign this record' });
      }

      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid record id' });

      const rows = await query("SELECT id, employee_id, preparer_signature, supervisor_user_id FROM discipline_records WHERE id = ?", [id]) as any[];
      const rec = Array.isArray(rows) ? rows[0] : rows;
      if (!rec) return res.status(404).json({ error: 'Record not found' });

      if (!String(rec.preparer_signature || '').trim()) {
        return res.status(400).json({ error: 'Preparer signature is required before supervisor signing' });
      }

      const allowed = await canActorAccessEmployeeByDept(actorCtx.dept, normalizeEmployeeId(rec.employee_id));
      
      // Fallback to token-provided department for accounts that are not fully linked in users/employees mapping
      const allowedByTokenDept = await canActorAccessEmployeeByDept(actor.dept || actor.department, normalizeEmployeeId(rec.employee_id));
      if (!allowed && !allowedByTokenDept) return res.status(403).json({ error: 'Forbidden' });

      const assignedSupervisor = Number(rec.supervisor_user_id || 0);
      const allowDeptSupervisorFallback = actorRole === 'Employee' && !!actorCtx.isSupervisor;
      if (assignedSupervisor && Number(actor.id || 0) !== assignedSupervisor && !allowDeptSupervisorFallback) {
        return res.status(403).json({ error: 'This supervisor signature is assigned to a different user' });
      }

      const supervisor_signature = String(req.body?.supervisor_signature || '').trim();
      const supervisor_signature_date = String(req.body?.supervisor_signature_date || '').trim() || new Date().toISOString().split('T')[0];
      if (!supervisor_signature) return res.status(400).json({ error: 'Supervisor signature is required' });

      await query(
        "UPDATE discipline_records SET supervisor_signature = ?, supervisor_signature_date = ? WHERE id = ?",
        [supervisor_signature, supervisor_signature_date, id]
      );

      try {
        const recRows: any = await query('SELECT employee_id FROM discipline_records WHERE id = ? LIMIT 1', [id]);
        const rec2 = Array.isArray(recRows) ? recRows[0] : recRows;
        const targetEmpId = normalizeEmployeeId(rec2?.employee_id);
        if (targetEmpId) {
          let empUserRows: any = await query('SELECT id FROM users WHERE employee_id = ? LIMIT 1', [targetEmpId]);
          let empUser = Array.isArray(empUserRows) ? empUserRows[0] : empUserRows;
          if (!empUser?.id) {
            empUserRows = await query(
              `SELECT u.id
               FROM users u
               INNER JOIN employees e ON e.id = ?
               WHERE LOWER(TRIM(COALESCE(u.full_name, u.username, ''))) = LOWER(TRIM(COALESCE(e.name, '')))
               ORDER BY u.id ASC
               LIMIT 1`,
              [targetEmpId]
            );
            empUser = Array.isArray(empUserRows) ? empUserRows[0] : empUserRows;
          }
          if (empUser?.id) {
            await createNotification({
              user_id: Number(empUser.id),
              type: 'info',
              message: 'A disciplinary action is now ready for your acknowledgement signature',
              source: 'discipline_sign',
              employee_id: targetEmpId,
            });
          }
        }
      } catch {}

      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  app.delete("/api/discipline_records/:id", authenticateToken, async (req, res) => {
    try { await softDeleteById('discipline_records', req.params.id); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  app.put("/api/discipline_records/:id/acknowledge", authenticateToken, async (req, res) => {
    try {
      const recordId = req.params.id;
      const now = new Date().toISOString();
      await query("UPDATE discipline_records SET is_acknowledged = 1, acknowledged_at = ? WHERE id = ?", [now, recordId]);
      res.json({ success: true, acknowledged_at: now });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  app.put("/api/discipline_records/:id/view", authenticateToken, async (req, res) => {
    try {
      const recordId = req.params.id;
      const now = new Date().toISOString();
      await query("UPDATE discipline_records SET is_viewed = 1, viewed_at = ? WHERE id = ?", [now, recordId]);
      res.json({ success: true, viewed_at: now });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  app.put("/api/discipline_records/:id/archive", authenticateToken, async (req, res) => {
    try {
      const recordId = req.params.id;
      const now = new Date().toISOString();
      await query("UPDATE discipline_records SET is_archived = 1, archived_at = ? WHERE id = ?", [now, recordId]);
      res.json({ success: true, archived_at: now });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
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

      let hrOwnerUserId: number | null = null;
      if (employee_id) {
        try {
          const empRows: any = await query('SELECT dept FROM employees WHERE id = ? LIMIT 1', [employee_id]);
          const empRow = Array.isArray(empRows) ? empRows[0] : empRows;
          hrOwnerUserId = await resolveDeptHrOwnerUserId(empRow?.dept || position_dept || null);
        } catch {}
      }

      // Accept both bulk `items` JSON or per-item `brand`/`serial_no`/`uom_qty`.
      const brand = req.body.brand || null;
      const serial_no = req.body.serial_no || null;
      const uom_qty = req.body.uom_qty !== undefined ? req.body.uom_qty : null;

      await query(`INSERT INTO property_accountability
        (employee_id, employee_name, position_dept, date_prepared, items, brand, serial_no, uom_qty,
         hr_owner_user_id,
         turnover_by_name, turnover_by_date, turnover_by_sig,
         noted_by_name, noted_by_date, noted_by_sig,
         received_by_name, received_by_date, received_by_sig,
         audited_by_name, audited_by_date, audited_by_sig)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [employee_id, employee_name, position_dept, date_prepared, items, brand, serial_no, uom_qty,
         hrOwnerUserId,
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
      await softDeleteById('property_accountability', id);
      try { await recordAudit((req as any).user || null, 'delete', 'property_accountability', id, before || null, null); } catch (e) {}
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  app.put("/api/property_accountability/:id/signature", authenticateToken, async (req, res) => {
    try {
      const actor: any = (req as any).user || {};
      const role = actor.role;
      const actorCtx = await getActorOrgContext(Number(actor.id || 0));
      const { field, signature, date, name } = req.body || {};

      const allowedByRole: Record<string, string[]> = {
        HR: ['turnover_by_sig', 'noted_by_sig', 'received_by_sig', 'audited_by_sig'],
        Manager: ['turnover_by_sig', 'noted_by_sig', 'audited_by_sig'],
        Leader: ['turnover_by_sig', 'noted_by_sig', 'audited_by_sig'],
        Employee: actorCtx.isSupervisor
          ? ['turnover_by_sig', 'noted_by_sig', 'audited_by_sig']
          : ['received_by_sig'],
      };

      const allowedFields = allowedByRole[role] || [];
      if (!allowedFields.includes(field)) return res.status(403).json({ error: 'Forbidden' });

      const prefix = field.replace(/_sig$/, '');
      const dateField = `${prefix}_date`;
      const nameField = `${prefix}_name`;

      const stmt = `UPDATE property_accountability SET ${field} = ?, ${dateField} = ?, ${nameField} = COALESCE(?, ${nameField}) WHERE id = ?`;
      await query(stmt, [signature || null, date || new Date().toISOString().split('T')[0], name || null, req.params.id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  // ---- Suggestions CRUD ----
  app.get("/api/suggestions", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      const actorCtx = await getActorOrgContext(Number(actor.id || 0));

      if (role === 'Manager') {
        const managerDept = normalizeDept(actorCtx.dept);
        if (!managerDept) return res.json([]);
        const rows = await query(
          `SELECT s.*
           FROM suggestions s
           LEFT JOIN employees e ON e.id = s.employee_id
           WHERE LOWER(TRIM(COALESCE(e.dept, s.dept, ''))) = LOWER(TRIM(?))
           ORDER BY s.created_at DESC`,
          [managerDept]
        );
        return res.json(rows);
      }

      if (role === 'HR') {
        const hrDept = normalizeDept(actorCtx.dept);
        if (!hrDept) return res.json([]);
        const rows = await query(
          `SELECT s.*
           FROM suggestions s
           LEFT JOIN employees e ON e.id = s.employee_id
           WHERE LOWER(TRIM(COALESCE(e.dept, s.dept, ''))) = LOWER(TRIM(?))
           ORDER BY s.created_at DESC`,
          [hrDept]
        );
        return res.json(rows);
      }

      if (role === 'Employee') {
        if (actorCtx.isSupervisor) {
          const supervisorDept = normalizeDept(actorCtx.dept);
          if (!supervisorDept) return res.json([]);
          const rows = await query(
            `SELECT s.*
             FROM suggestions s
             LEFT JOIN employees e ON e.id = s.employee_id
             WHERE LOWER(TRIM(COALESCE(e.dept, s.dept, ''))) = LOWER(TRIM(?))
             ORDER BY s.created_at DESC`,
            [supervisorDept]
          );
          return res.json(rows);
        }

        const employeeId = normalizeEmployeeId(actor.employee_id);
        if (!employeeId) return res.json([]);
        const rows = await query("SELECT s.* FROM suggestions s WHERE s.employee_id = ? ORDER BY s.created_at DESC", [employeeId]);
        return res.json(rows);
      }

      return res.status(403).json({ error: 'Forbidden' });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.post("/api/suggestions", authenticateToken, async (req, res) => {
    try {
      const b = req.body;
      const actor = (req as any).user || {};
      const userRole = actor?.role;
      const actorCtx = await getActorOrgContext(Number(actor.id || 0));
      // Managers/HR can specify a target employee_id from the body; employees use their own
      const empId = (userRole === 'Manager' || userRole === 'HR') && b.employee_id ? b.employee_id : (actor?.employee_id || null);
      if (userRole === 'Manager' && empId) {
        const actorDept = normalizeDept(actorCtx.dept);
        if (!actorDept) return res.status(403).json({ error: 'Manager department not set' });
        const allowed = await canActorAccessEmployeeByDept(actorDept, normalizeEmployeeId(empId));
        if (!allowed) return res.status(403).json({ error: 'Managers can only create suggestions for employees in their own department' });
      }
      // resolve supervisor user id (if supervisor name provided) and dept HR owner
      let supervisorUserId: number | null = null;
      if (b.supervisor_name) {
        try { supervisorUserId = await resolveUserIdByFullName(String(b.supervisor_name || '')); } catch (e) { supervisorUserId = null; }
      }
      let hrOwnerUserId: number | null = null;
      try {
        if (empId) {
          const empRows: any = await query('SELECT dept FROM employees WHERE id = ? LIMIT 1', [empId]);
          const empRow = Array.isArray(empRows) ? empRows[0] : empRows;
          hrOwnerUserId = await resolveDeptHrOwnerUserId(empRow?.dept || b.dept || null);
        } else {
          hrOwnerUserId = await resolveDeptHrOwnerUserId(b.dept || null);
        }
      } catch (e) { hrOwnerUserId = null; }
      await query(`INSERT INTO suggestions (employee_id, employee_name, position, dept, date, concern, labor_needed, materials_needed, equipment_needed, capital_needed, estimated_cost, desired_benefit, estimated_financial_benefit, planning_steps, estimated_time, title, other_resource_needed, planning_step_1, planning_step_2, planning_step_3, total_financial_benefit, employee_signature, employee_signature_date, supervisor_name, supervisor_title, date_received, follow_up_date, suggestion_merit, benefit_to_company, cost_to_company, cost_efficient_explanation, suggestion_priority, action_to_be_taken, suggested_reward, supervisor_signature, supervisor_signature_date, supervisor_user_id, hr_owner_user_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
         supervisorUserId || null, hrOwnerUserId || null, b.status || 'Under Review']);
      // If employee submitted, notify assigned manager/owner only
      if (userRole === 'Employee') {
        let managerUserId: number | null = null;
        try {
          if (empId) {
            const mRows: any = await query('SELECT manager_id FROM employees WHERE id = ? LIMIT 1', [empId]);
            const mRow = Array.isArray(mRows) ? mRows[0] : mRows;
            const managerEmployeeId = normalizeEmployeeId(mRow?.manager_id);
            if (managerEmployeeId) {
              const uRows: any = await query("SELECT id FROM users WHERE employee_id = ? AND role = 'Manager' LIMIT 1", [managerEmployeeId]);
              const uRow = Array.isArray(uRows) ? uRows[0] : uRows;
              managerUserId = Number(uRow?.id || 0) || null;
            }
          }
        } catch (e) { managerUserId = null; }

        if (managerUserId) {
          await createNotification({ user_id: managerUserId, type: 'info', message: `New employee suggestion submitted: ${b.title || b.concern || 'Untitled'}`, source: 'suggestion' });
        }
        if (hrOwnerUserId) {
          await createNotification({ user_id: hrOwnerUserId, type: 'info', message: `New employee suggestion submitted: ${b.title || b.concern || 'Untitled'}`, source: 'suggestion' });
        }
      }
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.put("/api/suggestions/:id/status", authenticateToken, async (req, res) => {
    try { await query("UPDATE suggestions SET status = ? WHERE id = ?", [req.body.status, req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.put("/api/suggestions/:id/management", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const actorCtx = await getActorOrgContext(Number(actor.id || 0));
      const role = actor.role;

      if (role !== 'Manager' && role !== 'HR' && !(role === 'Employee' && actorCtx.isSupervisor)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      if (role === 'HR' || (role === 'Employee' && actorCtx.isSupervisor)) {
        const sRows: any = await query(
          `SELECT s.id, s.employee_id, COALESCE(e.dept, s.dept, '') as dept
           FROM suggestions s
           LEFT JOIN employees e ON e.id = s.employee_id
           WHERE s.id = ?
           LIMIT 1`,
          [req.params.id]
        );
        const sRow = Array.isArray(sRows) ? sRows[0] : sRows;
        if (!sRow) return res.status(404).json({ error: 'Suggestion not found' });
        const actorDept = normalizeDept(actorCtx.dept);
        const targetDept = normalizeDept(sRow.dept);
        if (!actorDept || actorDept !== targetDept) return res.status(403).json({ error: 'Forbidden' });
      }

      if (role === 'Manager') {
        const sRows: any = await query(
          `SELECT s.id, s.employee_id, COALESCE(e.dept, s.dept, '') as dept
           FROM suggestions s
           LEFT JOIN employees e ON e.id = s.employee_id
           WHERE s.id = ?
           LIMIT 1`,
          [req.params.id]
        );
        const sRow = Array.isArray(sRows) ? sRows[0] : sRows;
        if (!sRow) return res.status(404).json({ error: 'Suggestion not found' });
        const actorDept = normalizeDept(actorCtx.dept);
        const targetDept = normalizeDept(sRow.dept);
        if (!actorDept || actorDept !== targetDept) return res.status(403).json({ error: 'Forbidden' });
      }

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
    try { await softDeleteById('suggestions', req.params.id); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
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
      await softDeleteById('feedback_360', req.params.id);
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
      // resolve HR reviewer user id and dept HR owner
      let hrReviewerUserId: number | null = null;
      try { hrReviewerUserId = await resolveUserIdByFullName(String(hr_reviewer_name || '')); } catch (e) { hrReviewerUserId = null; }
      let hrOwnerUserId: number | null = null;
      try { hrOwnerUserId = await resolveDeptHrOwnerUserId(dept_fit || null); } catch (e) { hrOwnerUserId = null; }
      await query(`INSERT INTO applicants (name, position, score, status, job_skills, asset_value, communication_skills, teamwork, overall_rating,
        interview_impression, dept_fit, previous_qualifications,
        q_experience, q_why_interested, q_strengths, q_weakness, q_conflict, q_goals, q_teamwork, q_pressure, q_contribution, q_questions,
        additional_comments, interviewer_name, interviewer_title, interview_date, interviewer_signature,
        hr_reviewer_name, hr_reviewer_signature, hr_reviewer_date, hr_reviewer_user_id, hr_owner_user_id, recommendation)
        VALUES (${Array(33).fill('?').join(', ')})`,
        [name, position, score || 0, status || 'Screening', job_skills, asset_value, communication_skills, teamwork, overall_rating,
        interview_impression, dept_fit, previous_qualifications,
        q_experience, q_why_interested, q_strengths, q_weakness, q_conflict, q_goals, q_teamwork, q_pressure, q_contribution, q_questions,
        additional_comments, interviewer_name, interviewer_title, interview_date, interviewer_signature,
        hr_reviewer_name, hr_reviewer_signature, hr_reviewer_date, hrReviewerUserId || null, hrOwnerUserId || null, recommendation]);

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
      await softDeleteById('applicants', id);
      try { await recordAudit((req as any).user || null, 'delete', 'applicants', id, beforeApp, null); } catch (e) {}
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- Requisitions CRUD ----
  app.get("/api/requisitions", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      if (!isPrivilegedRole(actor.role) && actor.role !== 'Manager') return res.status(403).json({ error: 'Forbidden' });

      const rows = await query(
        `SELECT r.*,
                CASE
                  WHEN COALESCE(TRIM(r.supervisor_approval_sig), '') <> ''
                   AND COALESCE(TRIM(r.dept_head_approval_sig), '') <> ''
                   AND COALESCE(TRIM(r.cabinet_approval_sig), '') <> ''
                   AND COALESCE(TRIM(r.vp_approval_sig), '') <> ''
                   AND COALESCE(TRIM(r.president_approval_sig), '') <> ''
                  THEN 'Approved'
                  ELSE 'Pending Approval'
                END AS approval_status
         FROM requisitions r
         ORDER BY r.created_at DESC`
      );
      res.json(rows);
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.post("/api/requisitions", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      if (!isPrivilegedRole(actor.role) && actor.role !== 'Manager') return res.status(403).json({ error: 'Forbidden' });

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
      const hrOwnerUserId = await resolveDeptHrOwnerUserId(department);
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
          hr_owner_user_id,
          comments
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          hrOwnerUserId,
          comments,
        ]
      );
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.put("/api/requisitions/:id/approvals", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      if (!isPrivilegedRole(actor.role) && actor.role !== 'Manager') return res.status(403).json({ error: 'Forbidden' });

      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid requisition id' });

      const {
        supervisor_approval, supervisor_approval_date, supervisor_approval_sig,
        dept_head_approval, dept_head_approval_date, dept_head_approval_sig,
        cabinet_approval, cabinet_approval_date, cabinet_approval_sig,
        vp_approval, vp_approval_date, vp_approval_sig,
        president_approval, president_approval_date, president_approval_sig,
        comments,
      } = req.body || {};

      const normalize = (v: any) => {
        if (v === null || v === undefined) return null;
        const s = String(v).trim();
        return s.length ? s : null;
      };

      await query(
        `UPDATE requisitions
         SET supervisor_approval = ?,
             supervisor_approval_date = ?,
             supervisor_approval_sig = ?,
             dept_head_approval = ?,
             dept_head_approval_date = ?,
             dept_head_approval_sig = ?,
             cabinet_approval = ?,
             cabinet_approval_date = ?,
             cabinet_approval_sig = ?,
             vp_approval = ?,
             vp_approval_date = ?,
             vp_approval_sig = ?,
             president_approval = ?,
             president_approval_date = ?,
             president_approval_sig = ?,
             comments = COALESCE(?, comments)
         WHERE id = ?`,
        [
          normalize(supervisor_approval), normalize(supervisor_approval_date), normalize(supervisor_approval_sig),
          normalize(dept_head_approval), normalize(dept_head_approval_date), normalize(dept_head_approval_sig),
          normalize(cabinet_approval), normalize(cabinet_approval_date), normalize(cabinet_approval_sig),
          normalize(vp_approval), normalize(vp_approval_date), normalize(vp_approval_sig),
          normalize(president_approval), normalize(president_approval_date), normalize(president_approval_sig),
          normalize(comments),
          id,
        ]
      );

      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.delete("/api/requisitions/:id", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      if (!isPrivilegedRole(actor.role) && actor.role !== 'Manager') return res.status(403).json({ error: 'Forbidden' });
      await softDeleteById('requisitions', req.params.id);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
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
      await softDeleteById('offboarding', id);
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
      const hrOwnerUserId = await resolveDeptHrOwnerUserId(b.department || null);
      let supervisorUserId: number | null = null;
      try { supervisorUserId = await resolveUserIdByFullName(String(b.supervisor || '')); } catch (e) { supervisorUserId = null; }

      await query(`INSERT INTO exit_interviews (offboarding_id, employee_name, department, supervisor, reasons, liked_most, liked_least, interview_date, ssn, hire_date, termination_date, starting_position, ending_position, salary, pay_benefits_opinion, satisfaction_ratings, would_recommend, improvement_suggestions, additional_comments, employee_sig, interviewer_name, interviewer_sig, interviewer_date, dismissal_details, supervisor_user_id, hr_owner_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [b.offboarding_id || null, b.employee_name, b.department, b.supervisor, b.reasons, b.liked_most, b.liked_least, b.interview_date,
         b.ssn || null, b.hire_date || null, b.termination_date || null, b.starting_position || null, b.ending_position || null,
         b.salary || null, b.pay_benefits_opinion || null,
         typeof b.satisfaction_ratings === 'object' ? JSON.stringify(b.satisfaction_ratings) : (b.satisfaction_ratings || null),
         b.would_recommend || null, b.improvement_suggestions || null, b.additional_comments || null,
         b.employee_sig || null, b.interviewer_name || null, b.interviewer_sig || null, b.interviewer_date || null, b.dismissal_details || null,
         supervisorUserId || null, hrOwnerUserId || null]);
      try { await recordAudit((req as any).user || null, 'create', 'exit_interviews', null, null, b); } catch (e) {}
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.delete("/api/exit_interviews/:id", authenticateToken, async (req, res) => {
    try {
      const id = req.params.id;
      let before: any = null;
      try { const br: any = await query('SELECT * FROM exit_interviews WHERE id = ?', [id]); before = Array.isArray(br) ? br[0] : br; } catch (e) { before = null; }
      await softDeleteById('exit_interviews', id);
      try { await recordAudit((req as any).user || null, 'delete', 'exit_interviews', id, before, null); } catch (e) {}
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  app.put("/api/exit_interviews/:id/signature", authenticateToken, async (req, res) => {
    try {
      const actor: any = (req as any).user || {};
      const role = actor.role;
      const actorCtx = await getActorOrgContext(Number(actor.id || 0));
      const { field, signature, date, interviewer_name } = req.body || {};

      const canEmployeeSign = role === 'Employee' && !actorCtx.isSupervisor && field === 'employee_sig';
      const canInterviewerSign = (role === 'HR' || role === 'Manager' || role === 'Leader' || (role === 'Employee' && actorCtx.isSupervisor)) && field === 'interviewer_sig';
      if (!canEmployeeSign && !canInterviewerSign) return res.status(403).json({ error: 'Forbidden' });

      if (field === 'employee_sig') {
        await query('UPDATE exit_interviews SET employee_sig = ? WHERE id = ?', [signature || null, req.params.id]);
      } else {
        await query('UPDATE exit_interviews SET interviewer_sig = ?, interviewer_date = COALESCE(?, interviewer_date), interviewer_name = COALESCE(?, interviewer_name) WHERE id = ?',
          [signature || null, date || new Date().toISOString().split('T')[0], interviewer_name || null, req.params.id]);
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
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
      const actor = (req as any).user || {};
      const actorRole = String(actor.role || '').toLowerCase();
      const { employee_id, skill_gap, growth_step, step_order, status, goal_id } = req.body;
      const employeeId = normalizeEmployeeId(employee_id);
      if (!employeeId) return res.status(400).json({ error: 'employee_id is required' });

      // Fetch employee dept
      const empRows: any = await query('SELECT dept FROM employees WHERE id = ?', [employeeId]);
      const employeeDept = empRows && empRows[0] ? String(empRows[0].dept || '').trim() : null;

      // Check department scope (managers can only create for their dept, HR can do all)
      if (actorRole === 'manager') {
        const actorDept = String(actor.dept || '').trim();
        if (!employeeDept || !actorDept || employeeDept.toLowerCase() !== actorDept.toLowerCase()) {
          return res.status(403).json({ error: 'Managers can only create plans for their own department' });
        }
      } else if (!isPrivilegedRole(actorRole)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const goalId = normalizeEmployeeId(goal_id);
      if (goalId) {
        const goalRows: any = await query('SELECT id, scope, employee_id FROM goals WHERE id = ?', [goalId]);
        const goal = Array.isArray(goalRows) ? goalRows[0] : goalRows;
        if (!goal) return res.status(400).json({ error: 'Invalid goal_id' });
        if ((goal.scope || 'Individual') !== 'Individual') {
          return res.status(400).json({ error: 'goal_id must reference an Individual goal' });
        }
        const goalEmployeeId = normalizeEmployeeId(goal.employee_id);
        if (!goalEmployeeId || goalEmployeeId !== employeeId) {
          return res.status(400).json({ error: 'employee_id must match the selected goal owner' });
        }
      }

      await query("INSERT INTO development_plans (employee_id, skill_gap, growth_step, step_order, status, goal_id, department) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [employeeId, skill_gap, growth_step, step_order || 0, status || 'Not Started', goalId || null, employeeDept]);
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
    try { await softDeleteById('development_plans', req.params.id); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- Team/Department Goal Improvement Plans CRUD ----
  app.get('/api/goal_improvement_plans', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = (actor.role || '').toString().toLowerCase();
      if (!isPrivilegedRole(actor.role) && role !== 'manager') return res.status(403).json({ error: 'Forbidden' });
      const rows = await query(
        `SELECT p.*, g.title as goal_title, g.statement as goal_statement, g.scope as linked_goal_scope, g.department, g.team_name
         FROM goal_improvement_plans p
         LEFT JOIN goals g ON p.goal_id = g.id
         ORDER BY p.created_at DESC`
      );
      res.json(rows);
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  app.post('/api/goal_improvement_plans', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = (actor.role || '').toString().toLowerCase();
      if (!isPrivilegedRole(actor.role) && role !== 'manager') return res.status(403).json({ error: 'Forbidden' });

      const goalId = normalizeEmployeeId(req.body.goal_id);
      if (!goalId) return res.status(400).json({ error: 'goal_id is required' });

      const goalRows: any = await query('SELECT id, scope, title, statement, department FROM goals WHERE id = ?', [goalId]);
      const goal = Array.isArray(goalRows) ? goalRows[0] : goalRows;
      if (!goal) return res.status(400).json({ error: 'Invalid goal_id' });
      if (!['Team', 'Department'].includes(goal.scope || 'Individual')) {
        return res.status(400).json({ error: 'goal_id must reference a Team or Department goal' });
      }

      // Check department scope (managers can only create for their dept, HR can do all)
      if (role === 'manager') {
        const actorDept = String(actor.dept || '').trim();
        const goalDept = String(goal.department || '').trim();
        if (!goalDept || !actorDept || goalDept.toLowerCase() !== actorDept.toLowerCase()) {
          return res.status(403).json({ error: 'Managers can only create improvement plans for their own department' });
        }
      }

      await query(
        `INSERT INTO goal_improvement_plans (goal_id, goal_scope, plan_title, issue_summary, improvement_objective, action_steps, review_date, status, created_by, department)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
        [
          goalId,
          goal.scope,
          req.body.plan_title || goal.title || goal.statement || null,
          req.body.issue_summary || null,
          req.body.improvement_objective || null,
          req.body.action_steps || null,
          req.body.review_date || null,
          req.body.status || 'Not Started',
          actor.id || null,
          goal.department || null,
        ]
      );
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  app.put("/api/suggestions/:id/signature", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      if (role !== 'Employee') return res.status(403).json({ error: 'Forbidden' });

      const actorEmpId = normalizeEmployeeId(actor.employee_id);
      if (!actorEmpId) return res.status(400).json({ error: 'Employee account is not linked' });

      const rows: any = await query("SELECT id, employee_id, employee_signature FROM suggestions WHERE id = ? LIMIT 1", [req.params.id]);
      const rec = Array.isArray(rows) ? rows[0] : rows;
      if (!rec) return res.status(404).json({ error: 'Suggestion not found' });

      if (normalizeEmployeeId(rec.employee_id) !== actorEmpId) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const signature = String(req.body?.signature || '').trim();
      const date = String(req.body?.date || new Date().toISOString().split('T')[0]).trim();
      if (!signature) return res.status(400).json({ error: 'signature is required' });

      await query(
        "UPDATE suggestions SET employee_signature = ?, employee_signature_date = ? WHERE id = ?",
        [signature, date || null, req.params.id]
      );

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });


  app.put('/api/goal_improvement_plans/:id', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = (actor.role || '').toString().toLowerCase();
      if (!isPrivilegedRole(actor.role) && role !== 'manager') return res.status(403).json({ error: 'Forbidden' });

      const b = req.body || {};
      const sets: string[] = [];
      const vals: any[] = [];
      for (const k of ['plan_title','issue_summary','improvement_objective','action_steps','review_date','status']) {
        if (b[k] !== undefined) { sets.push(`${k} = ?`); vals.push(b[k]); }
      }
      if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
      vals.push(req.params.id);
      await query(`UPDATE goal_improvement_plans SET ${sets.join(', ')} WHERE id = ?`, vals);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  app.delete('/api/goal_improvement_plans/:id', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = (actor.role || '').toString().toLowerCase();
      if (!isPrivilegedRole(actor.role) && role !== 'manager') return res.status(403).json({ error: 'Forbidden' });
      await softDeleteById('goal_improvement_plans', req.params.id);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  // ---- Team/Department Goal Development Plans CRUD ----
  app.get('/api/goal_development_plans', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = (actor.role || '').toString().toLowerCase();
      if (!isPrivilegedRole(actor.role) && role !== 'manager') return res.status(403).json({ error: 'Forbidden' });
      const rows = await query(
        `SELECT p.*, g.title as goal_title, g.statement as goal_statement, g.scope as linked_goal_scope, g.department, g.team_name
         FROM goal_development_plans p
         LEFT JOIN goals g ON p.goal_id = g.id
         ORDER BY p.created_at DESC`
      );
      res.json(rows);
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  app.post('/api/goal_development_plans', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = (actor.role || '').toString().toLowerCase();
      if (!isPrivilegedRole(actor.role) && role !== 'manager') return res.status(403).json({ error: 'Forbidden' });

      const goalId = normalizeEmployeeId(req.body.goal_id);
      if (!goalId) return res.status(400).json({ error: 'goal_id is required' });

      const goalRows: any = await query('SELECT id, scope, title, statement, department FROM goals WHERE id = ?', [goalId]);
      const goal = Array.isArray(goalRows) ? goalRows[0] : goalRows;
      if (!goal) return res.status(400).json({ error: 'Invalid goal_id' });
      if (!['Team', 'Department'].includes(goal.scope || 'Individual')) {
        return res.status(400).json({ error: 'goal_id must reference a Team or Department goal' });
      }

      // Check department scope (managers can only create for their dept, HR can do all)
      if (role === 'manager') {
        const actorDept = String(actor.dept || '').trim();
        const goalDept = String(goal.department || '').trim();
        if (!goalDept || !actorDept || goalDept.toLowerCase() !== actorDept.toLowerCase()) {
          return res.status(403).json({ error: 'Managers can only create development plans for their own department' });
        }
      }

      await query(
        `INSERT INTO goal_development_plans (goal_id, goal_scope, plan_title, skill_focus, development_actions, review_date, status, created_by, department)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          goalId,
          goal.scope,
          req.body.plan_title || goal.title || goal.statement || null,
          req.body.skill_focus || null,
          req.body.development_actions || null,
          req.body.review_date || null,
          req.body.status || 'Not Started',
          actor.id || null,
          goal.department || null,
        ]
      );
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  app.put('/api/goal_development_plans/:id', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = (actor.role || '').toString().toLowerCase();
      if (!isPrivilegedRole(actor.role) && role !== 'manager') return res.status(403).json({ error: 'Forbidden' });

      const b = req.body || {};
      const sets: string[] = [];
      const vals: any[] = [];
      for (const k of ['plan_title','skill_focus','development_actions','review_date','status']) {
        if (b[k] !== undefined) { sets.push(`${k} = ?`); vals.push(b[k]); }
      }
      if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
      vals.push(req.params.id);
      await query(`UPDATE goal_development_plans SET ${sets.join(', ')} WHERE id = ?`, vals);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
  });

  app.delete('/api/goal_development_plans/:id', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = (actor.role || '').toString().toLowerCase();
      if (!isPrivilegedRole(actor.role) && role !== 'manager') return res.status(403).json({ error: 'Forbidden' });
      await softDeleteById('goal_development_plans', req.params.id);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
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
    try { await softDeleteById('self_assessments', req.params.id); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- PIP (Performance Improvement Plans) CRUD ----
  app.get("/api/pip_plans", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      const targetEmpId = normalizeEmployeeId(req.query.employee_id);

      if (isPrivilegedRole(role)) {
        const rows = targetEmpId
          ? await query("SELECT p.*, e.name as employee_name FROM pip_plans p LEFT JOIN employees e ON p.employee_id = e.id WHERE p.employee_id = ? ORDER BY p.created_at DESC", [targetEmpId])
          : await query("SELECT p.*, e.name as employee_name FROM pip_plans p LEFT JOIN employees e ON p.employee_id = e.id ORDER BY p.created_at DESC");
        return res.json(rows);
      }

      if (role === 'Manager') {
        const managedIds = await getManagedEmployeeIds(actor.id);
        if (targetEmpId) {
          if (!managedIds.includes(targetEmpId)) return res.status(403).json({ error: 'Forbidden' });
          const rows = await query("SELECT p.*, e.name as employee_name FROM pip_plans p LEFT JOIN employees e ON p.employee_id = e.id WHERE p.employee_id = ? ORDER BY p.created_at DESC", [targetEmpId]);
          return res.json(rows);
        }
        if (managedIds.length === 0) return res.json([]);
        const placeholders = managedIds.map(() => '?').join(',');
        const rows = await query(`SELECT p.*, e.name as employee_name FROM pip_plans p LEFT JOIN employees e ON p.employee_id = e.id WHERE p.employee_id IN (${placeholders}) ORDER BY p.created_at DESC`, managedIds);
        return res.json(rows);
      }

      if (role === 'Employee') {
        const employeeId = normalizeEmployeeId(actor.employee_id);
        if (!employeeId) return res.json([]);
        const rows = await query("SELECT p.*, e.name as employee_name FROM pip_plans p LEFT JOIN employees e ON p.employee_id = e.id WHERE p.employee_id = ? ORDER BY p.created_at DESC", [employeeId]);
        return res.json(rows);
      }

      return res.status(403).json({ error: 'Forbidden' });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.post("/api/pip_plans", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      if (!isPrivilegedRole(role) && role !== 'Manager') return res.status(403).json({ error: 'Forbidden' });

      const b = req.body;
      const employeeId = normalizeEmployeeId(b.employee_id);
      if (!employeeId) return res.status(400).json({ error: 'employee_id is required' });

      // Fetch employee dept
      const empRows: any = await query('SELECT dept FROM employees WHERE id = ?', [employeeId]);
      const employeeDept = empRows && empRows[0] ? String(empRows[0].dept || '').trim() : null;

      const goalId = normalizeEmployeeId(b.goal_id);
      if (goalId) {
        const goalRows: any = await query('SELECT id, scope, employee_id FROM goals WHERE id = ?', [goalId]);
        const goal = Array.isArray(goalRows) ? goalRows[0] : goalRows;
        if (!goal) return res.status(400).json({ error: 'Invalid goal_id' });
        if ((goal.scope || 'Individual') !== 'Individual') {
          return res.status(400).json({ error: 'goal_id must reference an Individual goal' });
        }
        const goalEmployeeId = normalizeEmployeeId(goal.employee_id);
        if (!goalEmployeeId || goalEmployeeId !== employeeId) {
          return res.status(400).json({ error: 'employee_id must match the selected goal owner' });
        }
      }

      if (role === 'Manager') {
        const allowed = await canManagerAccessEmployee(actor.id, employeeId);
        if (!allowed) return res.status(403).json({ error: 'Forbidden' });
      }

      await query(`INSERT INTO pip_plans (employee_id, appraisal_id, goal_id, start_date, end_date, deficiency, improvement_objective, action_steps, support_provided, progress_check_date, progress_notes, outcome, supervisor_name, supervisor_signature, employee_signature, department) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [employeeId, b.appraisal_id || null, goalId || null, b.start_date, b.end_date, b.deficiency, b.improvement_objective, b.action_steps, b.support_provided || null, b.progress_check_date || null, b.progress_notes || null, b.outcome || 'In Progress', b.supervisor_name || null, b.supervisor_signature || null, b.employee_signature || null, employeeDept]);
      // Notify the employee about the new PIP
      const pipEmpUsers: any = await query("SELECT id FROM users WHERE employee_id = ?", [employeeId]);
      const pipEmpUser = Array.isArray(pipEmpUsers) ? pipEmpUsers[0] : pipEmpUsers;
      if (pipEmpUser) {
        await createNotification({ user_id: pipEmpUser.id, type: 'info', message: `A Performance Improvement Plan has been created for you: ${b.deficiency}`, source: 'pip' });
      }
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.put("/api/pip_plans/:id", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      if (!isPrivilegedRole(role) && role !== 'Manager') return res.status(403).json({ error: 'Forbidden' });

      const existingRows: any = await query('SELECT id, employee_id FROM pip_plans WHERE id = ?', [req.params.id]);
      const existing = Array.isArray(existingRows) ? existingRows[0] : existingRows;
      if (!existing) return res.status(404).json({ error: 'PIP not found' });

      if (role === 'Manager') {
        const existingEmpId = normalizeEmployeeId(existing.employee_id);
        const newEmpId = normalizeEmployeeId(req.body.employee_id);
        if (existingEmpId) {
          const allowed = await canManagerAccessEmployee(actor.id, existingEmpId);
          if (!allowed) return res.status(403).json({ error: 'Forbidden' });
        }
        if (newEmpId && newEmpId !== existingEmpId) {
          const allowedNew = await canManagerAccessEmployee(actor.id, newEmpId);
          if (!allowedNew) return res.status(403).json({ error: 'Forbidden' });
        }
      }

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
    try {
      const actor = (req as any).user || {};
      const role = actor.role;
      if (!isPrivilegedRole(role) && role !== 'Manager') return res.status(403).json({ error: 'Forbidden' });

      const existingRows: any = await query('SELECT id, employee_id FROM pip_plans WHERE id = ?', [req.params.id]);
      const existing = Array.isArray(existingRows) ? existingRows[0] : existingRows;
      if (!existing) return res.status(404).json({ error: 'PIP not found' });

      if (role === 'Manager') {
        const existingEmpId = normalizeEmployeeId(existing.employee_id);
        if (existingEmpId) {
          const allowed = await canManagerAccessEmployee(actor.id, existingEmpId);
          if (!allowed) return res.status(403).json({ error: 'Forbidden' });
        }
      }

      await softDeleteById('pip_plans', req.params.id);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- Promotability Readiness (Computed) ----
  app.get("/api/promotability/readiness", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user;
      const role = actor?.role;
      const roleLower = (role || '').toString().toLowerCase();
      const employeeOnlyFilter = `NOT EXISTS (
        SELECT 1
        FROM users ux
        WHERE ux.deleted_at IS NULL
          AND COALESCE(TRIM(ux.role), '') <> ''
          AND LOWER(TRIM(COALESCE(ux.role, ''))) <> 'employee'
          AND (
            ux.employee_id = e.id
            OR (
              REGEXP_REPLACE(
                LOWER(
                  COALESCE(
                    NULLIF(TRIM(ux.full_name), ''),
                    NULLIF(TRIM(ux.username), ''),
                    NULLIF(TRIM(SPLIT_PART(COALESCE(ux.email, ''), '@', 1)), ''),
                    ''
                  )
                ),
                '[^a-z0-9]',
                '',
                'g'
              ) = REGEXP_REPLACE(LOWER(COALESCE(e.name, '')), '[^a-z0-9]', '', 'g')
            )
          )
      )`;

      let employeeRows: any[];
      if (isPrivilegedRole(role) || roleLower === 'manager') {
        // Both HR and Manager see all employees for promotability planning
        const rows: any = await query(
          `SELECT e.id, e.name, e.position, e.dept, e.hire_date, e.status, e.salary_base
           FROM employees e
           WHERE ${employeeOnlyFilter}
           ORDER BY e.name`
        );
        employeeRows = Array.isArray(rows) ? rows : [];
      } else if (roleLower === 'employee') {
        const actorEmpId = normalizeEmployeeId(actor?.employee_id);
        if (!actorEmpId) return res.status(400).json({ error: 'Employee account is not linked' });
        const ownRows: any = await query(
          `SELECT e.id, e.name, e.position, e.dept, e.hire_date, e.status, e.salary_base
           FROM employees e
           WHERE e.id = ?
             AND ${employeeOnlyFilter}
           ORDER BY e.name`,
          [actorEmpId]
        );
        employeeRows = Array.isArray(ownRows) ? ownRows : [];
      } else {
        return res.status(403).json({ error: 'Forbidden' });
      }

      if (employeeRows.length === 0) return res.json([]);
      const empIds = employeeRows.map((e: any) => e.id);
      const ph = empIds.map(() => '?').join(',');

      const [appraisals, goals, memberTasks, elearning, activePips, feedbackRows, suggestionRows, selfAssessmentRows, coachingRows, disciplineRows] = await Promise.all([
        query(`SELECT * FROM appraisals WHERE employee_id IN (${ph}) ORDER BY sign_off_date DESC`, empIds),
        query(
          `SELECT g.*, e2.id AS resolved_employee_id
           FROM goals g
           LEFT JOIN users ul ON ul.id = g.leader_id AND ul.deleted_at IS NULL
           LEFT JOIN employees e2 ON e2.id = ul.employee_id
           WHERE g.deleted_at IS NULL
             AND (
               g.employee_id IN (${ph})
               OR ul.employee_id IN (${ph})
             )`,
          [...empIds, ...empIds]
        ),
        query(
          `SELECT t.member_employee_id AS employee_id, t.status, t.progress, t.proof_review_status, t.proof_review_rating
           FROM goal_member_tasks t
           WHERE t.member_employee_id IN (${ph})
             AND t.deleted_at IS NULL`,
          empIds
        ),
        query(`SELECT * FROM elearning_recommendations WHERE employee_id IN (${ph})`, empIds),
        query(`SELECT DISTINCT employee_id FROM pip_plans WHERE employee_id IN (${ph}) AND outcome = 'In Progress'`, empIds),
        query(
          `SELECT e.id AS employee_id, COUNT(*) AS feedback_count
           FROM employees e
           INNER JOIN feedback_360 f ON LOWER(TRIM(COALESCE(f.target_employee_name, ''))) = LOWER(TRIM(COALESCE(e.name, '')))
           WHERE e.id IN (${ph})
           GROUP BY e.id`,
          empIds
        ),
        query(`SELECT employee_id, COUNT(*) AS suggestions_count FROM suggestions WHERE employee_id IN (${ph}) GROUP BY employee_id`, empIds),
        query(`SELECT employee_id, COUNT(*) AS self_assessments_count FROM self_assessments WHERE employee_id IN (${ph}) GROUP BY employee_id`, empIds),
        query(`SELECT employee_id, COUNT(*) AS coaching_count, SUM(CASE WHEN is_positive = 1 THEN 1 ELSE 0 END) AS positive_coaching_count FROM coaching_logs WHERE employee_id IN (${ph}) AND deleted_at IS NULL GROUP BY employee_id`, empIds),
        query(`SELECT employee_id, COUNT(*) AS disciplinary_count FROM discipline_records WHERE employee_id IN (${ph}) AND deleted_at IS NULL GROUP BY employee_id`, empIds),
      ]);

      // Group appraisals by employee â€” take latest
      const appraisalMap: Record<number, any> = {};
      for (const a of (appraisals as any[])) {
        if (!appraisalMap[a.employee_id]) appraisalMap[a.employee_id] = a;
      }
      // Group goals by employee using owned goals only.
      // Assignees must have their own rated member-task evidence to count.
      const goalBucketMap: Record<number, Record<string, { status: string; progress: number }>> = {};
      const isCompletedAndRated = (status: any, reviewStatus: any, rating: any) => {
        const statusNorm = String(status || '').trim().toLowerCase();
        const reviewStatusNorm = String(reviewStatus || '').trim().toLowerCase();
        const statusOk = statusNorm === 'completed' || reviewStatusNorm === 'approved';
        const numericRating = Number(rating || 0);
        const ratingOk = numericRating >= 1 && numericRating <= 5;
        return statusOk && ratingOk;
      };
      const addGoalSignal = (employeeId: number, goalId: number, status: any, reviewStatus: any, progress: any, rating: any) => {
        const eid = Number(employeeId || 0);
        const gid = Number(goalId || 0);
        if (!eid || !gid || !isCompletedAndRated(status, reviewStatus, rating)) return;
        if (!goalBucketMap[eid]) goalBucketMap[eid] = {};
        goalBucketMap[eid][String(gid)] = {
          status: String(status || ''),
          progress: Number(progress || 0),
        };
      };

      for (const g of (goals as any[])) {
        // Use resolved_employee_id (from leader_id join) when employee_id is absent (supervisor-owned goals)
        const ownerEmpId = Number(g.employee_id || g.resolved_employee_id || 0);
        addGoalSignal(ownerEmpId, Number(g.id || 0), g.status, g.proof_review_status, g.progress, g.proof_review_rating);
      }

      const taskMap: Record<number, { total: number; completed: number; avgProgress: number }> = {};
      for (const t of (memberTasks as any[])) {
        const eid = Number(t.employee_id || 0);
        if (!eid || !isCompletedAndRated(t.status, t.proof_review_status, t.proof_review_rating)) continue;
        if (!taskMap[eid]) taskMap[eid] = { total: 0, completed: 0, avgProgress: 0 };
        taskMap[eid].total++;
        taskMap[eid].completed++;
        taskMap[eid].avgProgress += Number(t.progress || 0);
      }
      for (const eid of Object.keys(taskMap)) {
        const key = Number(eid);
        const total = Number(taskMap[key].total || 0);
        taskMap[key].avgProgress = total > 0 ? Math.round(taskMap[key].avgProgress / total) : 0;
      }

      const goalMap: Record<number, { total: number; completed: number; avgProgress: number }> = {};
      for (const eid of empIds) {
        const goalsById = goalBucketMap[eid] || {};
        const goalEntries = Object.values(goalsById);
        if (goalEntries.length > 0) {
          const total = goalEntries.length;
          const completed = goalEntries.filter((g) => String(g.status || '').toLowerCase() === 'completed').length;
          const avgProgress = Math.round(goalEntries.reduce((sum, g) => sum + Number(g.progress || 0), 0) / total);
          goalMap[eid] = { total, completed, avgProgress };
        } else {
          goalMap[eid] = taskMap[eid] || { total: 0, completed: 0, avgProgress: 0 };
        }
      }
      // Group training by employee
      const trainingMap: Record<number, { total: number; completed: number }> = {};
      for (const t of (elearning as any[])) {
        if (!trainingMap[t.employee_id]) trainingMap[t.employee_id] = { total: 0, completed: 0 };
        trainingMap[t.employee_id].total++;
        if ((t.status || '').toLowerCase() === 'completed') trainingMap[t.employee_id].completed++;
      }
      // Active PIPs set
      const pipSet = new Set((activePips as any[]).map((p: any) => p.employee_id));

      const feedbackMap: Record<number, number> = {};
      for (const r of (feedbackRows as any[])) feedbackMap[Number(r.employee_id)] = Number(r.feedback_count || 0);

      const suggestionsMap: Record<number, number> = {};
      for (const r of (suggestionRows as any[])) suggestionsMap[Number(r.employee_id)] = Number(r.suggestions_count || 0);

      const selfAssessMap: Record<number, number> = {};
      for (const r of (selfAssessmentRows as any[])) selfAssessMap[Number(r.employee_id)] = Number(r.self_assessments_count || 0);

      const coachingMap: Record<number, { total: number; positive: number }> = {};
      for (const r of (coachingRows as any[])) {
        coachingMap[Number(r.employee_id)] = {
          total: Number(r.coaching_count || 0),
          positive: Number(r.positive_coaching_count || 0),
        };
      }

      const disciplineMap: Record<number, number> = {};
      for (const r of (disciplineRows as any[])) disciplineMap[Number(r.employee_id)] = Number(r.disciplinary_count || 0);

      const clampPct = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

      const now = Date.now();
      const results = employeeRows.map((emp: any) => {
        const latest = appraisalMap[emp.id];
        const appraisalScoreRaw = latest && latest.overall != null ? ((Number(latest.overall || 0) / 5) * 100) : null;
        const gd = goalMap[emp.id] || { total: 0, completed: 0, avgProgress: 0 };
        const goalScoreRaw = gd.total > 0
          ? ((Number(gd.avgProgress || 0) * 0.7) + ((Number(gd.completed || 0) / Math.max(1, Number(gd.total || 0))) * 100 * 0.3))
          : null;
        const td = trainingMap[emp.id] || { total: 0, completed: 0 };
        const trainingScoreRaw = td.total > 0 ? ((Number(td.completed || 0) / Number(td.total || 1)) * 100) : null;
        const hireDate = emp.hire_date ? new Date(emp.hire_date) : null;
        const tenureMonths = hireDate ? Math.floor((now - hireDate.getTime()) / (30.44 * 24 * 60 * 60 * 1000)) : 0;
        const tenureScoreRaw = Math.max(0, Math.min(100, (tenureMonths / 60) * 100));

        const feedbackCount = Number(feedbackMap[emp.id] || 0);
        const suggestionsCount = Number(suggestionsMap[emp.id] || 0);
        const selfAssessCount = Number(selfAssessMap[emp.id] || 0);
        const coaching = coachingMap[emp.id] || { total: 0, positive: 0 };
        const disciplinaryCount = Number(disciplineMap[emp.id] || 0);

        const feedbackScoreRaw = feedbackCount > 0 ? Math.min(100, feedbackCount * 25) : null;
        const selfAssessScoreRaw = selfAssessCount > 0 ? Math.min(100, selfAssessCount * 25) : null;
        const coachingScoreRaw = coaching.total > 0 ? ((coaching.positive / coaching.total) * 100) : null;
        const disciplineScoreRaw = disciplinaryCount > 0 ? Math.max(0, 100 - (disciplinaryCount * 25)) : null;

        const signals = [
          { key: 'appraisal', score: appraisalScoreRaw, weight: 0.32 },
          { key: 'goals', score: goalScoreRaw, weight: 0.26 },
          { key: 'training', score: trainingScoreRaw, weight: 0.12 },
          { key: 'tenure', score: tenureScoreRaw, weight: 0.12 },
          { key: 'feedback', score: feedbackScoreRaw, weight: 0.07 },
          { key: 'self_assessment', score: selfAssessScoreRaw, weight: 0.05 },
          { key: 'coaching', score: coachingScoreRaw, weight: 0.03 },
          { key: 'discipline', score: disciplineScoreRaw, weight: 0.03 },
        ].filter((s) => s.score !== null && s.score !== undefined) as Array<{ key: string; score: number; weight: number }>;

        const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
        const weightedScore = totalWeight > 0
          ? signals.reduce((sum, s) => sum + (Number(s.score) * s.weight), 0) / totalWeight
          : 0;

        // Small bonus for broad evidence coverage from multiple independent indicators.
        const evidenceCount = signals.length;
        const evidenceBonus = evidenceCount >= 6 ? 4 : evidenceCount >= 4 ? 2 : 0;
        const readinessScore = clampPct(weightedScore + evidenceBonus);

        const appraisalScore = clampPct(appraisalScoreRaw || 0);
        const goalScore = clampPct(goalScoreRaw || 0);
        const trainingScore = clampPct(trainingScoreRaw || 0);
        const tenureScore = clampPct(tenureScoreRaw || 0);
        const successionTier = readinessScore >= 80 ? 'Ready Now' : readinessScore >= 60 ? 'Ready in 1-2 Years' : readinessScore >= 40 ? 'High Potential' : 'Developing';
        return {
          employee_id: emp.id, employee_name: emp.name, position: emp.position, dept: emp.dept,
          hire_date: emp.hire_date, status: emp.status, salary_base: emp.salary_base,
          readiness_score: readinessScore,
          appraisal_score: Math.round(appraisalScore), goal_score: goalScore,
          training_score: trainingScore, tenure_score: tenureScore,
          latest_appraisal: latest ? { overall: latest.overall, promotability_score: latest.promotability_score, promotability_status: latest.promotability_status, sign_off_date: latest.sign_off_date } : null,
          goal_summary: gd, training_summary: td,
          indicator_summary: {
            feedback_count: feedbackCount,
            suggestions_count: suggestionsCount,
            self_assessments_count: selfAssessCount,
            coaching_total: coaching.total,
            coaching_positive: coaching.positive,
            disciplinary_count: disciplinaryCount,
            evidence_count: evidenceCount,
          },
          tenure_months: tenureMonths, has_active_pip: pipSet.has(emp.id), succession_tier: successionTier,
        };
      });
      res.json(results);
    } catch (err) { console.error(err); res.status(500).json({ error: "Database error" }); }
  });

  // ---- Promotion Recommendations CRUD ----
  app.get("/api/promotion_recommendations", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user;
      const role = actor?.role;
      const roleLower = (role || '').toString().toLowerCase();
      const employeeIdParam = (req.query.employee_id as string);
      const actorCtx = await getActorOrgContext(Number(actor?.id || 0));
      
      // If filtering by employee_id (employee viewing their own), honor that
      if (employeeIdParam) {
        const actorEmpId = normalizeEmployeeId(actor?.employee_id);
        if (!actorEmpId) return res.status(400).json({ error: 'Employee account is not linked' });
        // Employees can only see their own
        if (roleLower === 'employee' && String(employeeIdParam) !== String(actorEmpId)) {
          return res.status(403).json({ error: 'Forbidden' });
        }
        const rows = await query("SELECT pr.*, e.name as employee_name, u.full_name as recommended_by_name FROM promotion_recommendations pr LEFT JOIN employees e ON pr.employee_id = e.id LEFT JOIN users u ON pr.recommended_by = u.id WHERE pr.employee_id = ? ORDER BY pr.created_at DESC", [parseInt(employeeIdParam)]);
        return res.json(rows);
      }
      
      // HR sees org-wide recommendations
      if (isPrivilegedRole(role) && roleLower !== 'manager') {
        const rows = await query("SELECT pr.*, e.name as employee_name, u.full_name as recommended_by_name FROM promotion_recommendations pr LEFT JOIN employees e ON pr.employee_id = e.id LEFT JOIN users u ON pr.recommended_by = u.id ORDER BY pr.created_at DESC");
        return res.json(rows);
      }
      // Managers are department-scoped for recommendations
      if (roleLower === 'manager') {
        const managerDept = normalizeDept(actorCtx.dept);
        if (!managerDept) return res.status(403).json({ error: 'Manager department not set' });
        const rows = await query(
          "SELECT pr.*, e.name as employee_name, u.full_name as recommended_by_name FROM promotion_recommendations pr LEFT JOIN employees e ON pr.employee_id = e.id LEFT JOIN users u ON pr.recommended_by = u.id WHERE LOWER(COALESCE(e.dept, '')) = LOWER(?) ORDER BY pr.created_at DESC",
          [managerDept]
        );
        return res.json(rows);
      }
      if (roleLower === 'employee') {
        const actorEmpId = normalizeEmployeeId(actor?.employee_id);
        if (!actorEmpId) return res.status(400).json({ error: 'Employee account is not linked' });
        const rows = await query("SELECT pr.*, e.name as employee_name, u.full_name as recommended_by_name FROM promotion_recommendations pr LEFT JOIN employees e ON pr.employee_id = e.id LEFT JOIN users u ON pr.recommended_by = u.id WHERE pr.employee_id = ? ORDER BY pr.created_at DESC", [actorEmpId]);
        return res.json(rows);
      }
      return res.status(403).json({ error: 'Forbidden' });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  app.post("/api/promotion_recommendations", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user;
      const role = actor?.role;
      const roleLower = (role || '').toString().toLowerCase();
      if (roleLower !== 'manager') return res.status(403).json({ error: 'Only managers can submit promotion recommendations' });
      const { employee_id, recommended_position, justification } = req.body;
      if (!employee_id) return res.status(400).json({ error: 'employee_id is required' });
      const allowed = await canManagerAccessEmployee(actor.id, employee_id);
      if (!allowed) return res.status(403).json({ error: 'Forbidden' });
      const actorCtx = await getActorOrgContext(Number(actor?.id || 0));
      const managerDept = normalizeDept(actorCtx.dept);
      if (!managerDept) return res.status(403).json({ error: 'Manager department not set' });
      // Lookup employee current info
      const empRows: any = await query("SELECT position, dept FROM employees WHERE id = ?", [employee_id]);
      const emp = Array.isArray(empRows) && empRows.length > 0 ? empRows[0] : {};
      if (normalizeDept(emp?.dept) !== managerDept) {
        return res.status(403).json({ error: 'Managers can only recommend employees in their own department' });
      }
      const result: any = await query(
        "INSERT INTO promotion_recommendations (employee_id, recommended_by, recommended_position, current_position, current_dept, justification, status) VALUES (?, ?, ?, ?, ?, ?, 'Proposed') RETURNING id",
        [employee_id, actor.id, recommended_position || null, emp.position || null, emp.dept || null, justification || null]
      );
      await createNotificationForRoleUsers({
        role: 'HR',
        dept: managerDept,
        type: 'info',
        message: `New promotion recommendation submitted for review`,
        source: 'promotability',
      });
      res.json({ success: true, id: result?.id || result?.insertId });
    } catch (err) { console.error(err); res.status(500).json({ error: "Database error" }); }
  });

  app.put("/api/promotion_recommendations/:id", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user;
      const role = actor?.role;
      const roleLower = (role || '').toString().toLowerCase();
      if (!isPrivilegedRole(role) && roleLower !== 'manager') return res.status(403).json({ error: 'Forbidden' });

      const recRows: any = await query("SELECT * FROM promotion_recommendations WHERE id = ?", [req.params.id]);
      const existingRec = Array.isArray(recRows) && recRows.length > 0 ? recRows[0] : null;
      if (!existingRec) return res.status(404).json({ error: 'Recommendation not found' });

      if (roleLower === 'manager') {
        const allowed = await canManagerAccessEmployee(actor.id, existingRec.employee_id);
        if (!allowed || Number(existingRec.recommended_by) !== Number(actor.id)) return res.status(403).json({ error: 'Forbidden' });
      }

      const { status, review_notes, effective_date, recommended_position, justification } = req.body;

      const fields: string[] = [];
      const vals: any[] = [];
      if (recommended_position !== undefined) { fields.push(`recommended_position = ?`); vals.push(recommended_position); }
      if (justification !== undefined) { fields.push(`justification = ?`); vals.push(justification); }

      if (roleLower === 'manager') {
        if ((existingRec.status || 'Proposed') !== 'Proposed') {
          return res.status(400).json({ error: 'Only proposed recommendations can be updated by manager' });
        }
        if (status !== undefined) {
          const nextStatus = String(status || '');
          if (!['Proposed', 'Withdrawn'].includes(nextStatus)) {
            return res.status(400).json({ error: 'Invalid status value' });
          }
          fields.push(`status = ?`);
          vals.push(nextStatus);
        }
        if (review_notes !== undefined || effective_date !== undefined) {
          return res.status(403).json({ error: 'Only HR can review recommendations' });
        }
      }

      if (isPrivilegedRole(role)) {
        if (status !== undefined) {
          const nextStatus = String(status || '');
          if (!['Proposed', 'Under Review', 'Approved', 'Denied', 'Withdrawn'].includes(nextStatus)) {
            return res.status(400).json({ error: 'Invalid status value' });
          }
          fields.push(`status = ?`);
          vals.push(nextStatus);
          fields.push(`reviewed_by = ?`);
          vals.push(actor.id);
          fields.push(`review_date = ?`);
          vals.push(new Date().toISOString().split('T')[0]);
        }
        if (review_notes !== undefined) { fields.push(`review_notes = ?`); vals.push(review_notes); }
        if (effective_date !== undefined) { fields.push(`effective_date = ?`); vals.push(effective_date); }
      }

      if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });
      vals.push(req.params.id);
      await query(`UPDATE promotion_recommendations SET ${fields.join(', ')} WHERE id = ?`, vals);

      // If approved by HR, create promotion record and update employee position.
      if (isPrivilegedRole(role) && status === 'Approved') {
        const recRows2: any = await query("SELECT * FROM promotion_recommendations WHERE id = ?", [req.params.id]);
        const rec = Array.isArray(recRows2) && recRows2.length > 0 ? recRows2[0] : null;
        if (rec) {
          const empRows: any = await query("SELECT position, dept, salary_base FROM employees WHERE id = ?", [rec.employee_id]);
          const emp = Array.isArray(empRows) && empRows.length > 0 ? empRows[0] : {};
          await query(
            "INSERT INTO promotions (employee_id, recommendation_id, previous_position, new_position, previous_dept, new_dept, previous_salary, effective_date, promoted_by, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
            [rec.employee_id, rec.id, emp.position || null, rec.recommended_position || emp.position, emp.dept || null, rec.current_dept || emp.dept, emp.salary_base || null, effective_date || new Date().toISOString().split('T')[0], actor.id, rec.justification || null]
          );
          if (rec.recommended_position) {
            await query("UPDATE employees SET position = ? WHERE id = ?", [rec.recommended_position, rec.employee_id]);
          }
          await createNotification({ user_id: rec.recommended_by, type: 'success', message: `Promotion recommendation approved`, source: 'promotability' });
          const empUser: any = await query("SELECT id FROM users WHERE employee_id = ?", [rec.employee_id]);
          if (Array.isArray(empUser) && empUser.length > 0) {
            await createNotification({ user_id: empUser[0].id, type: 'success', message: `Congratulations! You have been approved for promotion`, source: 'promotability' });
          }
        }
      }

      res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: "Database error" }); }
  });

  app.delete("/api/promotion_recommendations/:id", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user;
      const roleLower = (actor?.role || '').toString().toLowerCase();
      if (isPrivilegedRole(actor?.role)) {
        await softDeleteById('promotion_recommendations', req.params.id);
        return res.json({ success: true });
      }
      if (roleLower !== 'manager') return res.status(403).json({ error: 'Forbidden' });
      const recRows: any = await query("SELECT id, employee_id, recommended_by FROM promotion_recommendations WHERE id = ?", [req.params.id]);
      const rec = Array.isArray(recRows) ? recRows[0] : recRows;
      if (!rec) return res.status(404).json({ error: 'Recommendation not found' });
      const allowed = await canManagerAccessEmployee(actor.id, rec.employee_id);
      if (!allowed || Number(rec.recommended_by) !== Number(actor.id)) return res.status(403).json({ error: 'Forbidden' });
      await softDeleteById('promotion_recommendations', req.params.id);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- Promotions History CRUD ----
  app.get("/api/promotions", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user;
      const role = actor?.role;
      const roleLower = (role || '').toString().toLowerCase();
      // Both HR and Manager see all promotions for org-wide compliance & planning
      if (isPrivilegedRole(role) || roleLower === 'manager') {
        const rows = await query("SELECT p.*, e.name as employee_name FROM promotions p LEFT JOIN employees e ON p.employee_id = e.id ORDER BY p.effective_date DESC");
        return res.json(rows);
      }
      if (roleLower === 'employee') {
        const actorEmpId = normalizeEmployeeId(actor?.employee_id);
        if (!actorEmpId) return res.status(400).json({ error: 'Employee account is not linked' });
        const rows = await query("SELECT p.*, e.name as employee_name FROM promotions p LEFT JOIN employees e ON p.employee_id = e.id WHERE p.employee_id = ? ORDER BY p.effective_date DESC", [actorEmpId]);
        return res.json(rows);
      }
      return res.status(403).json({ error: 'Forbidden' });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  app.post("/api/promotions", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user;
      if (!isPrivilegedRole(actor?.role)) return res.status(403).json({ error: 'Forbidden' });
      const { employee_id, previous_position, new_position, previous_dept, new_dept, previous_salary, new_salary, effective_date, notes } = req.body;
      if (!employee_id || !effective_date) return res.status(400).json({ error: "employee_id and effective_date are required" });
      await query(
        "INSERT INTO promotions (employee_id, previous_position, new_position, previous_dept, new_dept, previous_salary, new_salary, effective_date, promoted_by, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
        [employee_id, previous_position || null, new_position || null, previous_dept || null, new_dept || null, previous_salary || null, new_salary || null, effective_date, actor.id, notes || null]
      );
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  app.delete("/api/promotions/:id", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user;
      if (!isPrivilegedRole(actor?.role)) return res.status(403).json({ error: 'Forbidden' });
      await softDeleteById('promotions', req.params.id);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- Career Paths CRUD ----
  app.get("/api/career_paths", authenticateToken, async (req, res) => {
    try {
      const rows = await query("SELECT * FROM career_paths ORDER BY department, current_role");
      res.json(rows);
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  app.post("/api/career_paths", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user;
      const isManager = ((actor?.role || '').toString().toLowerCase() === 'manager');
      if (!isManager) return res.status(403).json({ error: 'Only managers can manage career paths' });
      const { current_role, next_role, department, min_tenure_months, min_readiness_score, notes } = req.body;
      if (!current_role || !next_role) return res.status(400).json({ error: 'current_role and next_role are required' });
      const result: any = await query(
        "INSERT INTO career_paths (current_role, next_role, department, min_tenure_months, min_readiness_score, notes) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
        [current_role, next_role, department || null, min_tenure_months || 12, min_readiness_score || 60, notes || null]
      );
      res.json({ success: true, id: result?.id || result?.insertId });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  app.delete("/api/career_paths/:id", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user;
      const isManager = ((actor?.role || '').toString().toLowerCase() === 'manager');
      if (!isManager) return res.status(403).json({ error: 'Only managers can manage career paths' });
      await softDeleteById('career_paths', req.params.id);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- Promotion Comments ----
  app.get("/api/promotion_recommendations/:id/comments", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user;
      const role = actor?.role;
      const roleLower = (role || '').toString().toLowerCase();
      const recRows: any = await query("SELECT id, employee_id FROM promotion_recommendations WHERE id = ?", [req.params.id]);
      const rec = Array.isArray(recRows) && recRows.length > 0 ? recRows[0] : null;
      if (!rec) return res.status(404).json({ error: 'Recommendation not found' });
      if (isPrivilegedRole(role)) {
        // allowed
      } else if (roleLower === 'manager') {
        const allowed = await canManagerAccessEmployee(actor.id, rec.employee_id);
        if (!allowed) return res.status(403).json({ error: 'Forbidden' });
      } else if (roleLower === 'employee') {
        const actorEmpId = normalizeEmployeeId(actor?.employee_id);
        if (!actorEmpId || Number(actorEmpId) !== Number(rec.employee_id)) return res.status(403).json({ error: 'Forbidden' });
      } else {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const rows = await query("SELECT * FROM promotion_comments WHERE recommendation_id = ? ORDER BY created_at ASC", [req.params.id]);
      res.json(rows);
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  app.post("/api/promotion_recommendations/:id/comments", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user;
      const role = actor?.role;
      const roleLower = (role || '').toString().toLowerCase();
      const recRows: any = await query("SELECT id, employee_id FROM promotion_recommendations WHERE id = ?", [req.params.id]);
      const rec = Array.isArray(recRows) && recRows.length > 0 ? recRows[0] : null;
      if (!rec) return res.status(404).json({ error: 'Recommendation not found' });
      if (isPrivilegedRole(role)) {
        // allowed
      } else if (roleLower === 'manager') {
        const allowed = await canManagerAccessEmployee(actor.id, rec.employee_id);
        if (!allowed) return res.status(403).json({ error: 'Forbidden' });
      } else if (roleLower === 'employee') {
        const actorEmpId = normalizeEmployeeId(actor?.employee_id);
        if (!actorEmpId || Number(actorEmpId) !== Number(rec.employee_id)) return res.status(403).json({ error: 'Forbidden' });
      } else {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const { comment } = req.body;
      if (!comment || !comment.trim()) return res.status(400).json({ error: 'comment is required' });
      const userName = actor.full_name || actor.email || actor.username || 'Unknown';
      await query(
        "INSERT INTO promotion_comments (recommendation_id, user_id, user_name, comment) VALUES (?, ?, ?, ?)",
        [req.params.id, actor.id, userName, comment.trim()]
      );
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- Promotion Analytics ----
  app.get("/api/promotability/analytics", authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user;
      const role = actor?.role;
      const roleLower = (role || '').toString().toLowerCase();
      let promotions: any[] = [];
      let recommendations: any[] = [];
      let employees: any[] = [];

      if (isPrivilegedRole(role) || roleLower === 'manager') {
        // Both HR and Manager see org-wide analytics
        promotions = await query("SELECT p.*, e.name as employee_name, e.hire_date, e.dept FROM promotions p LEFT JOIN employees e ON p.employee_id = e.id ORDER BY p.effective_date DESC") as any[];
        recommendations = await query("SELECT * FROM promotion_recommendations") as any[];
        employees = await query("SELECT id, name, dept, hire_date FROM employees WHERE status != 'Resigned'") as any[];
      } else if (roleLower === 'employee') {
        const actorEmpId = normalizeEmployeeId(actor?.employee_id);
        if (!actorEmpId) return res.status(400).json({ error: 'Employee account is not linked' });
        promotions = await query("SELECT p.*, e.name as employee_name, e.hire_date, e.dept FROM promotions p LEFT JOIN employees e ON p.employee_id = e.id WHERE p.employee_id = ? ORDER BY p.effective_date DESC", [actorEmpId]) as any[];
        recommendations = await query("SELECT * FROM promotion_recommendations WHERE employee_id = ?", [actorEmpId]) as any[];
        const actorEmpRows: any = await query("SELECT dept FROM employees WHERE id = ?", [actorEmpId]);
        const actorEmp = Array.isArray(actorEmpRows) && actorEmpRows.length > 0 ? actorEmpRows[0] : null;
        const actorDept = actorEmp?.dept || null;
        employees = actorDept
          ? await query("SELECT id, name, dept, hire_date FROM employees WHERE status != 'Resigned' AND dept = ?", [actorDept]) as any[]
          : await query("SELECT id, name, dept, hire_date FROM employees WHERE id = ?", [actorEmpId]) as any[];
      } else {
        return res.status(403).json({ error: 'Forbidden' });
      }

      // Promotions by year
      const byYear: Record<string, number> = {};
      for (const p of promotions) {
        const yr = (p.effective_date || '').slice(0, 4);
        if (yr) byYear[yr] = (byYear[yr] || 0) + 1;
      }

      // Promotions by department
      const byDept: Record<string, number> = {};
      for (const p of promotions) {
        const d = p.new_dept || p.previous_dept || 'Unknown';
        byDept[d] = (byDept[d] || 0) + 1;
      }

      // Time-to-first-promotion (months from hire_date to first promotion effective_date)
      const ttpArr: number[] = [];
      for (const p of promotions) {
        if (p.hire_date && p.effective_date) {
          const hd = new Date(p.hire_date);
          const ed = new Date(p.effective_date);
          const months = Math.round((ed.getTime() - hd.getTime()) / (30.44 * 24 * 60 * 60 * 1000));
          if (months >= 0) ttpArr.push(months);
        }
      }
      const avgTTP = ttpArr.length > 0 ? Math.round(ttpArr.reduce((a, b) => a + b, 0) / ttpArr.length) : null;

      // Recommendation status breakdown
      const recStatus: Record<string, number> = {};
      for (const r of recommendations) {
        recStatus[r.status] = (recStatus[r.status] || 0) + 1;
      }

      // Dept promotion rate (promoted employees / total employees per dept)
      const deptTotal: Record<string, number> = {};
      for (const e of employees) { const d = e.dept || 'Unknown'; deptTotal[d] = (deptTotal[d] || 0) + 1; }
      const deptPromotionRate = Object.entries(byDept).map(([dept, count]) => ({
        dept, promoted: count, total: deptTotal[dept] || 0,
        rate: deptTotal[dept] ? Math.round((count / deptTotal[dept]) * 100) : 0
      })).sort((a, b) => b.rate - a.rate);

      res.json({
        promotions_by_year: Object.entries(byYear).map(([year, count]) => ({ year, count })).sort((a, b) => a.year.localeCompare(b.year)),
        dept_promotion_rate: deptPromotionRate,
        avg_time_to_promotion_months: avgTTP,
        recommendation_status: Object.entries(recStatus).map(([status, count]) => ({ status, count })),
        total_promotions: promotions.length,
        total_recommendations: recommendations.length,
        success_rate: recommendations.length > 0 ? Math.round(((recStatus['Approved'] || 0) / recommendations.length) * 100) : 0,
      });
    } catch (err) { console.error(err); res.status(500).json({ error: "Database error" }); }
  });

  // ---- Onboarding CRUD ----
  app.get("/api/onboarding", async (req, res) => {
    try { const rows = await query("SELECT * FROM onboarding ORDER BY created_at DESC"); res.json(rows); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });
  app.post("/api/onboarding", authenticateToken, async (req, res) => {
    try {
      const { employee_id, employee_name, applicant_id, checklist, hr_signature, employee_signature, notes, status } = req.body;
      // resolve department HR owner for onboarding record when possible
      let hrOwnerUserId: number | null = null;
      try {
        if (employee_id) {
          const er: any = await query('SELECT dept FROM employees WHERE id = ? LIMIT 1', [employee_id]);
          const erow = Array.isArray(er) ? er[0] : er;
          hrOwnerUserId = await resolveDeptHrOwnerUserId(erow?.dept || null);
        }
      } catch (e) { hrOwnerUserId = null; }

      await query("INSERT INTO onboarding (employee_id, employee_name, applicant_id, checklist, hr_signature, employee_signature, notes, hr_owner_user_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [employee_id, employee_name, applicant_id, checklist, hr_signature, employee_signature, notes, hrOwnerUserId || null, status || 'Pending']);
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

  app.put('/api/onboarding/:id/signature', authenticateToken, async (req, res) => {
    try {
      const actor: any = (req as any).user || {};
      const actorCtx = await getActorOrgContext(Number(actor.id || 0));
      const { field, signature } = req.body || {};
      if (field !== 'employee_signature' && field !== 'hr_signature') {
        return res.status(400).json({ error: 'Invalid signature field' });
      }

      if (field === 'employee_signature') {
        if (!(actor.role === 'Employee' && !actorCtx.isSupervisor)) return res.status(403).json({ error: 'Forbidden' });
      }

      if (field === 'hr_signature') {
        if (actor.role !== 'HR') return res.status(403).json({ error: 'Forbidden' });
      }

      await query(`UPDATE onboarding SET ${field} = ? WHERE id = ?`, [signature || null, req.params.id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.put('/api/applicants/:id/signature', authenticateToken, async (req, res) => {
    try {
      const actor: any = (req as any).user || {};
      const actorCtx = await getActorOrgContext(Number(actor.id || 0));
      const { field, signature, name, date, title } = req.body || {};
      if (field !== 'interviewer_signature' && field !== 'hr_reviewer_signature') {
        return res.status(400).json({ error: 'Invalid signature field' });
      }

      const canInterviewer = (actor.role === 'Manager' || actor.role === 'Leader' || actor.role === 'HR' || (actor.role === 'Employee' && actorCtx.isSupervisor)) && field === 'interviewer_signature';
      const canHrReview = actor.role === 'HR' && field === 'hr_reviewer_signature';
      if (!canInterviewer && !canHrReview) return res.status(403).json({ error: 'Forbidden' });

      if (field === 'interviewer_signature') {
        await query('UPDATE applicants SET interviewer_signature = ?, interviewer_name = COALESCE(?, interviewer_name), interviewer_title = COALESCE(?, interviewer_title), interview_date = COALESCE(?, interview_date) WHERE id = ?',
          [signature || null, name || null, title || null, date || new Date().toISOString().split('T')[0], req.params.id]);
      } else {
        await query('UPDATE applicants SET hr_reviewer_signature = ?, hr_reviewer_name = COALESCE(?, hr_reviewer_name), hr_reviewer_date = COALESCE(?, hr_reviewer_date) WHERE id = ?',
          [signature || null, name || null, date || new Date().toISOString().split('T')[0], req.params.id]);
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.put('/api/requisitions/:id/signature', authenticateToken, async (req, res) => {
    try {
      const actor: any = (req as any).user || {};
      const actorCtx = await getActorOrgContext(Number(actor.id || 0));
      const { stage, signature, approver, date } = req.body || {};

      const stageMap: Record<string, { sig: string; name: string; date: string }> = {
        supervisor: { sig: 'supervisor_approval_sig', name: 'supervisor_approval', date: 'supervisor_approval_date' },
        dept_head: { sig: 'dept_head_approval_sig', name: 'dept_head_approval', date: 'dept_head_approval_date' },
        cabinet: { sig: 'cabinet_approval_sig', name: 'cabinet_approval', date: 'cabinet_approval_date' },
        vp: { sig: 'vp_approval_sig', name: 'vp_approval', date: 'vp_approval_date' },
        president: { sig: 'president_approval_sig', name: 'president_approval', date: 'president_approval_date' },
      };

      const target = stageMap[stage || ''];
      if (!target) return res.status(400).json({ error: 'Invalid stage' });

      const isMgmt = actor.role === 'Manager' || actor.role === 'Leader' || actor.role === 'HR' || (actor.role === 'Employee' && actorCtx.isSupervisor);
      if (!isMgmt) return res.status(403).json({ error: 'Forbidden' });

      await query(
        `UPDATE requisitions SET ${target.sig} = ?, ${target.name} = COALESCE(?, ${target.name}), ${target.date} = COALESCE(?, ${target.date}) WHERE id = ?`,
        [signature || null, approver || null, date || new Date().toISOString().split('T')[0], req.params.id]
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });
  app.delete("/api/onboarding/:id", authenticateToken, async (req, res) => {
    try { await softDeleteById('onboarding', req.params.id); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  // ---- Notifications CRUD ----
  // Helper: create a notification for a user or role
  async function createNotification(opts: { user_id?: number | null; role?: string | null; type?: string; message: string; source?: string; employee_id?: number | null }) {
    try {
      const targetUserId = opts.user_id || null;
      const targetRole = opts.role || null;
      const type = opts.type || 'info';
      const source = opts.source || null;
      const message = opts.message;

      // Strict per-user targeting: ignore requests that do not resolve to a user.
      if (!targetUserId) return;

      // Prevent short-window duplicates for the same target and payload.
      const dupRows: any = await query(
        `SELECT id FROM notifications
         WHERE COALESCE(user_id, 0) = COALESCE(?, 0)
           AND COALESCE(type, 'info') = COALESCE(?, 'info')
           AND COALESCE(source, '') = COALESCE(?, '')
           AND message = ?
           AND created_at >= (NOW() - INTERVAL '20 seconds')
         ORDER BY created_at DESC
         LIMIT 1`,
        [targetUserId, type, source || '', message]
      );
      const dup = Array.isArray(dupRows) ? dupRows[0] : dupRows;
      if (dup && dup.id) return;

      const ins: any = await query(
        `INSERT INTO notifications (user_id, role, type, message, source, employee_id)
         VALUES (?, ?, ?, ?, ?, ?)
         ${usePostgres ? 'RETURNING id' : ''}`,
        [targetUserId, targetRole, type, message, source, opts.employee_id || null]
      );

      const notificationId = ins?.insertId || ins?.id || null;
      const payload: any = {
        id: notificationId,
        type,
        message,
        source,
      };
      if (opts.employee_id) payload.employee_id = opts.employee_id;

      if (targetUserId) {
        try { io.to(`user_${targetUserId}`).emit('notification', payload); } catch {}
      }
    } catch (err) { console.error('Failed to create notification:', err); }
  }

  async function createNotificationForRoleUsers(opts: { role: string; type?: string; message: string; source?: string; employee_id?: number | null; dept?: string | null }) {
    try {
      const role = String(opts.role || '').trim();
      if (!role) return;
      const dept = String(opts.dept || '').trim();
      const sql = dept
        ? `SELECT u.id
           FROM users u
           LEFT JOIN employees e ON e.id = u.employee_id
           WHERE u.role = ?
             AND LOWER(COALESCE(e.dept, u.dept, '')) = LOWER(?)`
        : `SELECT id FROM users WHERE role = ?`;
      const params = dept ? [role, dept] : [role];
      const rows: any = await query(sql, params);
      const recipients = (Array.isArray(rows) ? rows : [rows].filter(Boolean))
        .map((r: any) => Number(r?.id || 0))
        .filter((id: number) => id > 0);
      for (const userId of recipients) {
        await createNotification({
          user_id: userId,
          role,
          type: opts.type,
          message: opts.message,
          source: opts.source,
          employee_id: opts.employee_id || null,
        });
      }
    } catch (err) {
      console.error('Failed to create role-targeted notifications:', err);
    }
  }

  app.get("/api/notifications", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      // Strict per-user scope.
      const rows = await query(
        "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
        [userId]
      );
      res.json(rows);
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  app.put("/api/notifications/read", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      await query("UPDATE notifications SET read = 1, read_at = CURRENT_TIMESTAMP WHERE user_id = ?", [userId]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
  });

  app.delete("/api/notifications", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      await query("DELETE FROM notifications WHERE user_id = ?", [userId]);
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

  // HR archive APIs for soft-deleted rows across all supported tables
  app.get('/api/archive/overview', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      if (actor.role !== 'HR') return res.status(403).json({ error: 'Forbidden' });

      const out: any = {};
      for (const t of softDeleteTables) {
        try {
          assertSafeTableName(t);
          const rows: any = await query(
            `SELECT
               COUNT(*)::int AS total_count,
               COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS active_count,
               COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS archived_count
             FROM ${t}`
          );
          const summary = Array.isArray(rows) && rows[0] ? rows[0] : { total_count: 0, active_count: 0, archived_count: 0 };
          out[t] = {
            total_count: Number(summary.total_count || 0),
            active_count: Number(summary.active_count || 0),
            archived_count: Number(summary.archived_count || 0),
          };
        } catch (e) {
          out[t] = { total_count: 0, active_count: 0, archived_count: 0, error: 'Query failed' };
        }
      }
      res.json(out);
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.get('/api/archive/:table', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      if (actor.role !== 'HR') return res.status(403).json({ error: 'Forbidden' });

      const table = String(req.params.table || '').toLowerCase();
      if (!softDeleteTables.includes(table)) return res.status(400).json({ error: 'Unsupported table' });
      assertSafeTableName(table);

      const status = String(req.query.status || 'archived').toLowerCase();
      const limit = Math.max(1, Math.min(200, parseInt(String(req.query.limit || '50'), 10) || 50));
      const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);

      let where = '';
      if (status === 'archived') where = 'WHERE deleted_at IS NOT NULL';
      else if (status === 'active') where = 'WHERE deleted_at IS NULL';

      const rows: any = await query(
        `SELECT *
         FROM ${table}
         ${where}
         ORDER BY COALESCE(deleted_at, created_at, CURRENT_TIMESTAMP) DESC, id DESC
         LIMIT ? OFFSET ?`,
        [limit, offset]
      );

      const countRows: any = await query(
        `SELECT COUNT(*)::int AS count
         FROM ${table}
         ${where}`
      );
      const total = Number((Array.isArray(countRows) && countRows[0]?.count) || 0);

      res.json({ table, status, total, limit, offset, rows: Array.isArray(rows) ? rows : [] });
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.put('/api/archive/:table/:id/restore', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      if (actor.role !== 'HR') return res.status(403).json({ error: 'Forbidden' });

      const table = String(req.params.table || '').toLowerCase();
      const id = req.params.id;
      if (!softDeleteTables.includes(table)) return res.status(400).json({ error: 'Unsupported table' });
      assertSafeTableName(table);

      let before: any = null;
      try {
        const bRows: any = await query(`SELECT * FROM ${table} WHERE id = ?`, [id]);
        before = Array.isArray(bRows) ? bRows[0] : bRows;
      } catch {}

      await query(`UPDATE ${table} SET deleted_at = NULL WHERE id = ?`, [id]);

      let after: any = null;
      try {
        const aRows: any = await query(`SELECT * FROM ${table} WHERE id = ?`, [id]);
        after = Array.isArray(aRows) ? aRows[0] : aRows;
      } catch {}

      try { await recordAudit(actor, 'restore', table, id, before, after); } catch {}
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.delete('/api/archive/:table/:id/purge', authenticateToken, async (req, res) => {
    try {
      const actor = (req as any).user || {};
      if (actor.role !== 'HR') return res.status(403).json({ error: 'Forbidden' });

      const table = String(req.params.table || '').toLowerCase();
      const id = req.params.id;
      if (!softDeleteTables.includes(table)) return res.status(400).json({ error: 'Unsupported table' });
      assertSafeTableName(table);

      let before: any = null;
      try {
        const bRows: any = await query(`SELECT * FROM ${table} WHERE id = ?`, [id]);
        before = Array.isArray(bRows) ? bRows[0] : bRows;
      } catch {}

      await query(`DELETE FROM ${table} WHERE id = ?`, [id]);
      try { await recordAudit(actor, 'delete', table, id, before, null, { source: 'archive_purge' }); } catch {}
      res.json({ success: true });
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
      const qRolesRaw = (req.query.roles || req.query.role || '').toString();
      const qDepartmentsRaw = (req.query.departments || req.query.department || '').toString();
      const hasRoleOrDeptFilter = !!(qRolesRaw.trim() || qDepartmentsRaw.trim());
      const employeeOnly = (req.query.employee === '1' || req.query.employee_activity === '1' || req.query.employee === 'true' || req.query.employee_activity === 'true');
      const limit = Math.min(1000, parseInt((req.query.limit || '50').toString() || '50'));
      const offset = Math.max(0, parseInt((req.query.offset || '0').toString() || '0'));

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
      
      // Role/department filtering is applied after enrichment for better identity fallback reliability.
      if (hasRoleOrDeptFilter) {
        sql += ' ORDER BY created_at DESC, id DESC LIMIT ?';
        params.push(5000);
      } else {
        sql += ' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
      }

      const rows: any = await query(sql, params);
      const mapped = Array.isArray(rows) ? rows : [];

      // Enrich results with user role and a human-friendly action label.
      try {
        const userIds = Array.from(new Set(mapped.map((r: any) => r.user_id).filter(Boolean)));
        const identityNames = Array.from(new Set(
          mapped
            .filter((r: any) => !r.user_id && r.username)
            .map((r: any) => String(r.username).trim().toLowerCase())
            .filter(Boolean)
        ));
        const userMap: any = {};
        const userEmployeeMap: any = {};
        const userIdentityMap: any = {};
        if (userIds.length > 0) {
          const placeholders = userIds.map(() => '?').join(',');
          const urows: any = await query(
            `SELECT id, employee_id, role, dept, full_name, username, email
             FROM users
             WHERE id IN (${placeholders}) OR employee_id IN (${placeholders})`,
            [...userIds, ...userIds]
          );
          for (const u of (Array.isArray(urows) ? urows : [urows].filter(Boolean))) {
            userMap[u.id] = u;
            if (u.employee_id) userEmployeeMap[u.employee_id] = u;
          }
        }
        if (identityNames.length > 0) {
          const placeholders = identityNames.map(() => '?').join(',');
          const irows: any = await query(
            `SELECT id, role, dept, full_name, username, email
             FROM users
             WHERE LOWER(COALESCE(username, '')) IN (${placeholders})
                OR LOWER(COALESCE(full_name, '')) IN (${placeholders})
                OR LOWER(COALESCE(email, '')) IN (${placeholders})`,
            [...identityNames, ...identityNames, ...identityNames]
          );
          for (const u of (Array.isArray(irows) ? irows : [irows].filter(Boolean))) {
            const keys = [u.username, u.full_name, u.email]
              .map((v: any) => (v ? String(v).trim().toLowerCase() : ''))
              .filter(Boolean);
            for (const k of keys) if (!userIdentityMap[k]) userIdentityMap[k] = u;
          }
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
          const identityKey = r.username ? String(r.username).trim().toLowerCase() : '';
          const u = r.user_id ? (userMap[r.user_id] || userEmployeeMap[r.user_id]) : (identityKey ? userIdentityMap[identityKey] : null);
          // derive a short description if available in after_json or meta_json
          let display_description: string | null = null;
          try {
            if (r.after_json) {
              const aj = JSON.parse(r.after_json);
              if (aj && (aj.description || aj.desc || aj.label)) {
                display_description = sanitizeDisplayText(aj.description || aj.desc || aj.label);
              }
              else {
                const keys = ['full_name','employee_name','email','username','message','title','label'];
                const parts: string[] = [];
                for (const k of keys) if (aj[k]) parts.push(sanitizeDisplayText(aj[k]));
                if (parts.length) display_description = sanitizeDisplayText(parts.slice(0,3).join(' - '));
              }
            }
            if (!display_description && r.meta_json) {
              try {
                const mj = JSON.parse(r.meta_json);
                if (mj && mj.description) display_description = sanitizeDisplayText(mj.description);
              } catch (e) { /* ignore */ }
            }
          } catch (e) { display_description = null; }

          return { ...r,
            username: sanitizeDisplayText((u && (u.full_name || u.username || u.email)) || r.username),
            user_role: r.user_role || (u ? u.role : null),
            user_department: r.user_department || (u ? u.dept : null),
            display_action: humanizeAction(r),
            display_description: display_description || null
          };
        });

        // Strictly enforce selected role/department against the final enriched values
        // so displayed rows always match active filters.
        const selectedRoles = qRolesRaw.split(',').map((r: any) => r.trim().toLowerCase()).filter(Boolean);
        const selectedDepts = qDepartmentsRaw.split(',').map((d: any) => d.trim().toLowerCase()).filter(Boolean);
        const roleSet = new Set(selectedRoles);
        const deptSet = new Set(selectedDepts);
        const filteredOut = out.filter((row: any) => {
          const rowRole = (row.user_role || '').toString().trim().toLowerCase();
          const rowDept = (row.user_department || '').toString().trim().toLowerCase();
          const roleOk = roleSet.size === 0 || roleSet.has(rowRole);
          const deptOk = deptSet.size === 0 || deptSet.has(rowDept);
          return roleOk && deptOk;
        });

        const pagedOut = hasRoleOrDeptFilter ? filteredOut.slice(offset, offset + limit) : filteredOut;
        res.json(pagedOut);
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

  // POST /api/activity â€” record a user activity or action (human-friendly)
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

  // Departments API
  app.get('/api/departments', async (req, res) => {
    try {
      const includeDeleted = req.query && (req.query.include_deleted === '1' || req.query.include_deleted === 'true');
      // include a count of active users per department (based on users.dept text)
      const rows = await query(
        `SELECT d.id, d.name, d.slug, d.description, d.created_at, d.deleted_at,
                COALESCE((SELECT COUNT(*) FROM users u WHERE u.dept = d.name AND u.deleted_at IS NULL), 0) AS user_count,
                (SELECT u.full_name FROM users u WHERE u.dept = d.name AND u.deleted_at IS NULL ORDER BY u.created_at LIMIT 1) AS head_name,
                (SELECT COALESCE(json_agg(row_to_json(u2)), '[]'::json) FROM (SELECT full_name, email FROM users u2 WHERE u2.dept = d.name AND u2.deleted_at IS NULL ORDER BY u2.created_at LIMIT 5) u2) AS sample_users
         FROM departments d
         ${includeDeleted ? '' : "WHERE d.deleted_at IS NULL"}
         ORDER BY d.name ASC`
      );
      res.json(rows);
    } catch (err) {
      console.error('GET /api/departments error:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.post('/api/departments', authenticateToken, async (req: any, res) => {
    try {
      const user = req.user;
      if (!isPrivilegedRole(user?.role)) return res.status(403).json({ error: 'Forbidden' });
      const name = (req.body?.name || '').toString().trim();
      if (!name) return res.status(400).json({ error: 'Missing name' });
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      try {
        const desc = (req.body?.description || null);
        await query('INSERT INTO departments (name, slug, description, deleted_at) VALUES (?, ?, ?, NULL) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, deleted_at = COALESCE(departments.deleted_at, NULL)', [name, slug, desc]);
      } catch (e) {
        // ignore duplicate insertion race
      }
      const rows = await query('SELECT id, name, slug, description, created_at FROM departments WHERE slug = ? LIMIT 1', [slug]);
      return res.status(201).json(Array.isArray(rows) ? rows[0] : rows);
    } catch (err) {
      console.error('POST /api/departments error:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });
  app.post('/api/departments/:id/archive', authenticateToken, async (req: any, res) => {
    try {
      const user = req.user;
      if (!isPrivilegedRole(user?.role)) return res.status(403).json({ error: 'Forbidden' });
      await query('UPDATE departments SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error('ARCHIVE /api/departments error:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.post('/api/departments/:id/restore', authenticateToken, async (req: any, res) => {
    try {
      const user = req.user;
      if (!isPrivilegedRole(user?.role)) return res.status(403).json({ error: 'Forbidden' });
      await query('UPDATE departments SET deleted_at = NULL WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error('RESTORE /api/departments error:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // â”€â”€â”€ Socket.io Real-Time Chat â”€â”€â”€
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

  // â”€â”€â”€ Goal Update Request API (creates actionable system message) â”€â”€â”€
  app.post("/api/goal_update_request", authenticateToken, async (req: any, res) => {
    try {
      const { employee_id, goal_id, goal_title, proposed_status, proposed_progress, reason } = req.body;
      const user = req.user;
      const actionPayload = JSON.stringify({ goal_id, goal_title, proposed_status, proposed_progress, reason });
      const sysMessage = `[Goal Update Request] "${goal_title}" -> ${proposed_status || ''}${proposed_progress !== undefined ? ` (${proposed_progress}%)` : ''}${reason ? ` - ${reason}` : ''}`;
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
    admin: ['recruitmentboard','feedback360','onboarding','employee-directory','offboarding','user-accounts','departments','audit-logs','db-viewer','promotability','settings'],
    manager: ['recruitmentboard','feedback360','okr-planner','coaching-journal','disciplinary-action','evaluation-portal','promotability','pip-manager','suggestion-review','settings'],
    employee: ['career-dashboard','feedback','idp','self-assessment','suggestion-form','coaching-chat','verification-of-review','promotions','settings']
  };

  // Exact two-segment routes: /:role/:page â€” always serve SPA so React handles 404s
  app.get('/:role/:page', (req, res, next) => {
    try {
      const role = (req.params.role || '').toString().toLowerCase();
      if (!['admin','manager','employee'].includes(role)) return next();
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

  // Presence map: socketId â†’ { userId, role, username, employeeId }
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
        } catch (err: any) {
          console.log(`Socket handshake auth failed: socket=${socket.id} error=${err?.message || String(err)}`);
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
      } catch (err: any) {
        console.log(`Socket auth failed: socket=${socket.id} error=${err?.message || String(err)}`);
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
              await createNotification({ user_id: mgrUser.id, type: 'info', message: `New chat from ${data.sender_name || empRow.name}`, source: 'coaching_chat', employee_id: data.employee_id });
            }
          }
        } else {
          const empUsers: any = await query("SELECT id FROM users WHERE employee_id = ?", [data.employee_id]);
          const empUser = Array.isArray(empUsers) ? empUsers[0] : empUsers;
          if (empUser) {
            await createNotification({ user_id: empUser.id, type: 'info', message: `New chat from ${data.sender_name || 'your Manager'}`, source: 'coaching_chat', employee_id: data.employee_id });
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
            if (payload.proposed_status) { sets.push('status = ?'); vals.push(payload.proposed_status); }
            if (payload.proposed_progress !== undefined) { sets.push('progress = ?'); vals.push(payload.proposed_progress); }
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
