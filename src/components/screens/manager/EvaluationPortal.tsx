import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Employee } from '../../../types';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { SearchableSelect } from '../../common/SearchableSelect';
import { Star, FileText, X, Download, ArrowLeft, Eye, CheckCircle, Archive } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';
import { appConfirm } from '../../../utils/appDialog';

/* ── rating descriptors matching PDF form ───────────────────────────── */

const PERF_CATEGORIES: { key: string; label: string; desc: string; levels: string[]; group?: string }[] = [
  {
    key: 'work_quality', label: '1a. Quality of Work',
    desc: 'Accuracy, efficiency, and completeness of work, including dependability of results.',
    group: '1. PRODUCTIVITY',
    levels: [
      'Does not meet minimum standards. Frequent and excessive errors. Often unacceptable.',
      'Careless, inclined to make mistakes — barely acceptable work. Improvement needed.',
      'Work generally acceptable. Occasional errors. Good quality.',
      'Work seldom needs checking. Consistently of high quality.',
      'Exceptionally accurate and capable.'
    ]
  },
  {
    key: 'quantity_of_work', label: '1b. Quantity of Work',
    desc: 'Amount of work produced together with the necessity of close supervision.',
    group: '1. PRODUCTIVITY',
    levels: [
      'Does not meet minimum standards. Very slow worker. Requires close supervision.',
      'Works at slow pace. Improvement needed.',
      'Volume of work generally meets standards. Needs normal supervision.',
      'Turns out good volume. Requires little supervision. Accomplishments consistently high.',
      'Unusually high results and volume.'
    ]
  },
  {
    key: 'relationship_with_others', label: '2. Relationship with Others',
    desc: 'Effectiveness in working with supervisors, fellow employees and public — tact, courtesy, self-control, discretion.',
    levels: [
      'Not effective in working with others. Often antagonizes people. Lacks tact. Poor attitude.',
      'Needs improvement in attitude and manner. Has tendency to resent taking direction from supervisor.',
      'Works well with others. Good attitude. Accepts constructive criticism. Tries to be cooperative.',
      'Very effective in dealing with public and associates. Exercises discretion and tact.',
      'Stimulates teamwork and good attitude in others. Exceptional in dealing with public and associates.'
    ]
  },
  {
    key: 'work_habits', label: '3. Work Habits',
    desc: 'Attitude toward work, safe/effective use of resources, compliance with rules, carrying out assignments.',
    levels: [
      'Little interest in work. Does not follow prescribed work procedures. Needs constant watching. Undependable.',
      'Gives up easily. Has some difficulty in following prescribed work procedures. Needs to show more interest.',
      'Generally acceptable work.',
      'Consistently up to and somewhat above work standards.',
      'Exceptional work habits and attitude toward job. Seldom requires supervision.'
    ]
  },
  {
    key: 'job_knowledge', label: '4. Job Knowledge',
    desc: 'Basic knowledge of job; familiarity with departmental functions; understanding and observance of job duties.',
    levels: [
      'Definite lack of knowledge. Very little understanding of job duties. Needs considerable instruction.',
      'Inadequate knowledge of duties. Understanding of job duties not sufficient.',
      'Has adequate knowledge of duties. Needs a little additional instruction.',
      'Good knowledge of duties. Well informed. Occasionally needs direction.',
      'Excellent understanding of job assignments. Requires very little direction. Extremely capable.'
    ]
  },
  {
    key: 'attendance', label: '5. Attendance & Punctuality',
    desc: 'Frequency of absences/lateness, observance of lunch hour and break periods.',
    levels: [
      'Excessive absence or tardiness. Absent without adequate notice or documentation. Abuses lunch hours.',
      'Lax in attendance and reporting for work on time. Improvement needed.',
      'Generally acceptable.',
      'Very good attendance record. Rarely tardy. Prompt in lunch hours and break periods.',
      'Excellent overall attendance record.'
    ]
  },
  {
    key: 'promotability', label: '6. Promotability',
    desc: 'Applicable for Annual Evaluation of Permanent Staff — ability to progress.',
    levels: [
      'Has not demonstrated overall qualities needed for advancement. Unwilling to accept additional responsibilities.',
      'Improvement needed before promotion can be recommended.',
      'Should be considered for promotion.',
      'Willing to accept responsibility — Recommended for promotion.',
      'Excellent candidate for promotion. Can be recommended without reservation.'
    ]
  },
];

const ACH_CATEGORIES = [
  { key: 'job_knowledge', label: 'Job Knowledge' },
  { key: 'work_quality', label: 'Work Quality' },
  { key: 'attendance', label: 'Attendance / Punctuality' },
  { key: 'productivity', label: 'Productivity' },
  { key: 'communication', label: 'Communication / Listening Skills' },
  { key: 'dependability', label: 'Dependability' },
];

/* ── small helper: input class used everywhere ──────────────────────── */
const inp = 'w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100';
const lbl = 'block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1';

/* ════════════════════════════════════════════════════════════════════ */

interface EvaluationPortalProps {
  employees: Employee[];
  currentUser?: any | null;
}

export const EvaluationPortal = ({ employees, currentUser }: EvaluationPortalProps) => {
  const [view, setView] = useState<'dashboard' | 'achievement' | 'performance' | 'detail'>('dashboard');
  const [appraisals, setAppraisals] = useState<any[]>([]);
  const [detailRecord, setDetailRecord] = useState<any>(null);

  /* ── Achievement Measure form state ─────────────────────────────── */
  const freshAch = () => ({
    employee_id: '', date: '', review_period_from: '', review_period_to: '',
    job_knowledge: 0, work_quality: 0, attendance: 0, productivity: 0, communication: 0, dependability: 0,
    job_knowledge_comment: '', work_quality_comment: '', attendance_comment: '', productivity_comment: '', communication_comment: '', dependability_comment: '',
    additional_comments: '', employee_goals: '',
    supervisor_print_name: '',
    supervisor_signature: '', supervisor_signature_date: '',
  });
  const [achForm, setAchForm] = useState(freshAch());

  /* ── Performance Evaluation form state ──────────────────────────── */
  const freshPerf = () => ({
    employee_id: '', employee_department: '', employee_title: '', status: '',
    eval_period_from: '', eval_period_to: '',
    eval_type: '', probationary_period: '',
    // ratings
    work_quality: 0, quantity_of_work: 0, relationship_with_others: 0, work_habits: 0,
    job_knowledge: 0, attendance: 0, promotability: 0,
    // comments on rating factors
    additional_comments: '',
    // Section I — Supervisor
    overall_rating: '', recommendation: '',
    supervisors_overall_comment: '',
    supervisor_print_name: '',
    supervisor_signature: '', supervisor_signature_date: '',
    // Section II — Reviewer
    reviewer_agree: '', revised_rating: '',
    reviewers_comment: '',
    reviewer_print_name: '',
    reviewer_signature: '', reviewer_signature_date: '',
    // Section III — Employee
    employee_acknowledgement: '',
    employee_print_name: '',
    employee_signature: '', employee_signature_date: '',
    // Section IV — HR Officer
    hr_print_name: '',
    hr_signature: '', hr_signature_date: '',
  });
  const [perfForm, setPerfForm] = useState(freshPerf());

  const userRole = String(currentUser?.role || '').toLowerCase();
  const isManager = userRole === 'manager';
  const managerDept = String(
    currentUser?.dept ||
    currentUser?.department ||
    currentUser?.employee?.dept ||
    currentUser?.employee_department ||
    ''
  ).trim();

  const scopedEmployees = useMemo(() => {
    if (!isManager || !managerDept) return employees;
    return employees.filter((e) => String(e.dept || '').trim().toLowerCase() === managerDept.toLowerCase());
  }, [employees, isManager, managerDept]);

  const achSelectedEmployee = useMemo(
    () => scopedEmployees.find((e) => String(e.id) === achForm.employee_id) || null,
    [scopedEmployees, achForm.employee_id]
  );

  const getManagerNameForEmployee = (emp: Employee | null) => {
    if (!emp) return '';
    if ((emp as any).manager) return String((emp as any).manager);
    if ((emp as any).manager_id) {
      const mgr = employees.find((e) => e.id === (emp as any).manager_id);
      if (mgr?.name) return mgr.name;
    }
    return String(currentUser?.full_name || currentUser?.username || '').trim();
  };

  /* ── data fetch ─────────────────────────────────────────────────── */
  useEffect(() => { fetchAppraisals(); }, []);

  const fetchAppraisals = async () => {
    try {
      const res = await fetch('/api/appraisals', { headers: getAuthHeaders() });
      const data = await res.json();
      setAppraisals(Array.isArray(data) ? data : []);
    } catch { setAppraisals([]); }
  };

  /* ── Form validation helpers ────────────────────────────────────── */
  const isAchievementFormValid = () => {
    if (!achForm.employee_id || !achForm.date || !achForm.review_period_from || !achForm.review_period_to) return false;
    if (new Date(achForm.review_period_to) < new Date(achForm.review_period_from)) return false;
    const achRatingKeys = ['job_knowledge','productivity','attendance','work_quality','communication','dependability'] as const;
    if (achRatingKeys.some(k => (achForm as any)[k] === 0)) return false;
    return true;
  };

  const isPerformanceFormValid = () => {
    if (!perfForm.employee_id || !perfForm.eval_period_from || !perfForm.eval_period_to) return false;
    if (new Date(perfForm.eval_period_to) < new Date(perfForm.eval_period_from)) return false;
    const perfRatingKeys = ['work_quality','quantity_of_work','relationship_with_others','work_habits','job_knowledge','attendance','promotability'] as const;
    if (perfRatingKeys.some(k => (perfForm as any)[k] === 0)) return false;
    return true;
  };

  /* ── submit handlers ────────────────────────────────────────────── */
  const submitAchievement = async () => {
    if (!achForm.employee_id) { window.notify?.('Please select an employee', 'error'); return; }
    const confirmed = await appConfirm('Are you sure you want to save this Achievement Measure?', { title: 'Save Achievement Measure', confirmText: 'Save' });
    if (!confirmed) return;
    if (!achForm.date || !achForm.review_period_from || !achForm.review_period_to) {
      window.notify?.('Please complete the date and review period fields', 'error');
      return;
    }
    if (new Date(achForm.review_period_to) < new Date(achForm.review_period_from)) {
      window.notify?.('Review period end date cannot be earlier than start date', 'error');
      return;
    }
    const achRatingKeys = ['job_knowledge','productivity','attendance','work_quality','communication','dependability'] as const;
    if (achRatingKeys.some(k => (achForm as any)[k] === 0)) { window.notify?.('Please rate all categories before submitting', 'error'); return; }
    const longTextFields = [
      achForm.job_knowledge_comment,
      achForm.work_quality_comment,
      achForm.attendance_comment,
      achForm.productivity_comment,
      achForm.communication_comment,
      achForm.dependability_comment,
      achForm.additional_comments,
      achForm.employee_goals,
    ];
    if (longTextFields.some((txt) => (txt || '').trim().length > 2000)) {
      window.notify?.('One or more comment fields exceed the 2000-character limit', 'error');
      return;
    }
    try {
      const overall = ((achForm.job_knowledge + achForm.productivity + achForm.attendance + achForm.work_quality + achForm.communication + achForm.dependability) / 6).toFixed(1);
      const res = await fetch('/api/appraisals', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({
          ...achForm, employee_id: parseInt(achForm.employee_id), overall: parseFloat(overall),
          sign_off_date: new Date().toISOString().split('T')[0],
          form_type: 'Achievement Measure',
          eval_period_from: achForm.review_period_from, eval_period_to: achForm.review_period_to,
        }),
      });
      if (!res.ok) {
        let msg = 'Failed to save';
        try {
          const err = await res.json();
          msg = err?.error || msg;
        } catch {}
        throw new Error(msg);
      }
      window.notify?.('Achievement measure saved', 'success');
      setAchForm(freshAch());
      setView('dashboard');
      fetchAppraisals();
    } catch (e: any) { window.notify?.(e?.message || 'Failed to save', 'error'); }
  };

  const submitPerformance = async () => {
    if (!perfForm.employee_id) { window.notify?.('Please select an employee', 'error'); return; }
    const confirmed = await appConfirm('Are you sure you want to save this Performance Evaluation?', { title: 'Save Performance Evaluation', confirmText: 'Save' });
    if (!confirmed) return;
    if (!perfForm.eval_period_from || !perfForm.eval_period_to) {
      window.notify?.('Please complete the evaluation period', 'error');
      return;
    }
    if (new Date(perfForm.eval_period_to) < new Date(perfForm.eval_period_from)) {
      window.notify?.('Evaluation period end date cannot be earlier than start date', 'error');
      return;
    }
    const perfRatingKeys = ['work_quality','quantity_of_work','relationship_with_others','work_habits','job_knowledge','attendance','promotability'] as const;
    if (perfRatingKeys.some(k => (perfForm as any)[k] === 0)) { window.notify?.('Please rate all performance factors before submitting', 'error'); return; }
    const perfTextFields = [
      perfForm.additional_comments,
      perfForm.supervisors_overall_comment,
      perfForm.reviewers_comment,
      perfForm.employee_acknowledgement,
    ];
    if (perfTextFields.some((txt) => (txt || '').trim().length > 2000)) {
      window.notify?.('One or more comment fields exceed the 2000-character limit', 'error');
      return;
    }
    try {
      const productivity = parseFloat(((perfForm.work_quality + perfForm.quantity_of_work) / 2).toFixed(1));
      const overall = ((perfForm.work_quality + perfForm.quantity_of_work + perfForm.relationship_with_others + perfForm.work_habits + perfForm.job_knowledge + perfForm.attendance + perfForm.promotability) / 7).toFixed(1);
      const res = await fetch('/api/appraisals', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({
          ...perfForm, employee_id: parseInt(perfForm.employee_id), overall: parseFloat(overall),
          productivity,
          sign_off_date: new Date().toISOString().split('T')[0],
          form_type: 'Performance Evaluation',
          promotability_score: perfForm.promotability,
          promotability_status: perfForm.overall_rating,
        }),
      });
      if (!res.ok) {
        let msg = 'Failed to save';
        try {
          const err = await res.json();
          msg = err?.error || msg;
        } catch {}
        throw new Error(msg);
      }
      window.notify?.('Performance evaluation saved', 'success');
      setPerfForm(freshPerf());
      setView('dashboard');
      fetchAppraisals();
    } catch (e: any) { window.notify?.(e?.message || 'Failed to save', 'error'); }
  };

  const handleDelete = async (id: number) => {
    if (!(await appConfirm('Archive this appraisal?', { title: 'Archive Appraisal', confirmText: 'Archive' }))) return;
    try {
      await fetch(`/api/appraisals/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      window.notify?.('Appraisal archived', 'success');
      fetchAppraisals();
    } catch { window.notify?.('Failed to archive', 'error'); }
  };

  /* ── PDF export ─────────────────────────────────────────────────── */
  const exportPDF = async (rec: any) => {
    if (!(await appConfirm('Export this appraisal as PDF?', { title: 'Export Appraisal PDF', confirmText: 'Export', icon: 'export' }))) return;
    const formType = (rec.form_type || rec.eval_type || '').toString();
    const isAch = formType.toLowerCase().includes('achievement');
    const verified = isAch
      ? !!(rec.supervisor_signature && rec.employee_signature)
      : !!(rec.supervisor_signature && rec.reviewer_signature && rec.employee_signature && rec.hr_signature);
    const ratingLabel = (v: number) => (['', 'Poor', 'Fair', 'Satisfactory', 'Good', 'Excellent'][v] || '');
    const ratingRows: [string, number][] = isAch
      ? [['Job Knowledge', rec.job_knowledge], ['Work Quality', rec.work_quality], ['Attendance', rec.attendance], ['Productivity', rec.productivity], ['Communication', rec.communication], ['Dependability', rec.dependability]]
      : [['Quality of Work', rec.work_quality], ['Quantity of Work', rec.quantity_of_work], ['Relationship w/ Others', rec.relationship_with_others], ['Work Habits', rec.work_habits], ['Job Knowledge', rec.job_knowledge], ['Attendance', rec.attendance], ['Promotability', rec.promotability_score || rec.promotability]];
    const sigCell = (label: string, name: string, sig: string, date: string) =>
      '<td style="text-align:center;padding:0 10px;min-width:120px;">'
      + '<div style="font-size:9px;font-weight:bold;text-transform:uppercase;color:#64748b;letter-spacing:1px;">' + label + '</div>'
      + (name ? '<div style="font-size:9px;color:#475569;margin-bottom:2px;">' + name + '</div>' : '')
      + '<div style="border:1px solid #cbd5e1;border-radius:4px;height:52px;display:flex;align-items:center;justify-content:center;background:#fff;margin:4px 0;">'
      + (sig ? '<img src="' + sig + '" style="max-height:46px;max-width:110px;object-fit:contain;"/>' : '<span style="font-size:9px;color:#94a3b8;">Not signed</span>')
      + '</div><div style="font-size:9px;color:#64748b;">' + (date || '—') + '</div></td>';
    const sigsHtml = isAch
      ? sigCell('Manager', rec.supervisor_print_name || '', rec.supervisor_signature || '', rec.supervisor_signature_date || '')
        + sigCell('Employee', rec.employee_name || '', rec.employee_signature || '', rec.employee_signature_date || '')
      : sigCell('Supervisor', rec.supervisor_print_name || '', rec.supervisor_signature || '', rec.supervisor_signature_date || '')
        + sigCell('Reviewer', rec.reviewer_print_name || '', rec.reviewer_signature || '', rec.reviewer_signature_date || '')
        + sigCell('Employee', rec.employee_print_name || rec.employee_name || '', rec.employee_signature || '', rec.employee_signature_date || '')
        + sigCell('HR Admin', rec.hr_print_name || '', rec.hr_signature || '', rec.hr_signature_date || '');
    const css = '*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;color:#1e293b;padding:24px 32px}'
      + 'h2{font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#0f766e;border-bottom:1px solid #e2e8f0;padding-bottom:4px;margin:14px 0 8px}'
      + '.sec{border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;margin-bottom:12px}'
      + '.fl{font-size:9px;font-weight:bold;text-transform:uppercase;color:#64748b}.fv{font-size:11px}'
      + '.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:6px}'
      + '.g2{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px}'
      + '.rr{display:flex;align-items:center;padding:3px 6px;border-bottom:1px solid #f1f5f9}'
      + '.cb{background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:5px 8px;font-size:10px;color:#334155;margin-top:3px;white-space:pre-wrap}'
      + '@media print{body{padding:12px 20px}}';
    const pFrom = rec.eval_period_from || rec.review_period_from || '—';
    const pTo = rec.eval_period_to || rec.review_period_to || '—';
    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>' + formType + '</title><style>' + css + '</style></head><body>'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">'
      + '<div><div style="font-size:16px;font-weight:bold;margin-bottom:2px;">' + formType + '</div>'
      + '<div style="font-size:10px;color:#64748b;">' + (rec.employee_name || '') + ' &nbsp;&middot;&nbsp; Period: ' + pFrom + ' to ' + pTo + '</div></div>'
      + '<span style="font-size:10px;font-weight:bold;text-transform:uppercase;padding:2px 10px;border-radius:20px;' + (verified ? 'background:#d1fae5;color:#065f46' : 'background:#fef3c7;color:#92400e') + '">' + (verified ? 'Verified' : 'Pending') + '</span></div>'
      + '<div class="sec"><h2 style="margin-top:0">Employee Information</h2><div class="g3">'
      + '<div><div class="fl">Employee</div><div class="fv">' + (rec.employee_name || '—') + '</div></div>'
      + (!isAch
          ? '<div><div class="fl">Department</div><div class="fv">' + (rec.employee_department || '—') + '</div></div>'
            + '<div><div class="fl">Title</div><div class="fv">' + (rec.employee_title || '—') + '</div></div>'
            + '<div><div class="fl">Status</div><div class="fv">' + (rec.status || '—') + '</div></div>'
            + '<div><div class="fl">Eval Type</div><div class="fv">' + (rec.eval_type || '—') + '</div></div>'
          : '')
      + '<div><div class="fl">Period</div><div class="fv">' + pFrom + ' – ' + pTo + '</div></div>'
      + '</div></div>'
      + '<div class="sec"><h2 style="margin-top:0">Performance Ratings</h2>'
      + ratingRows.map(([label, val]) =>
          '<div class="rr"><span style="flex:1">' + label + '</span>'
          + '<div style="width:90px;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;margin:0 8px"><div style="width:' + ((val || 0) / 5 * 100) + '%;height:6px;background:#0f766e;border-radius:3px"></div></div>'
          + '<span style="font-weight:bold;width:30px;text-align:right">' + (val || 0) + '/5</span>'
          + '<span style="font-size:9px;color:#64748b;width:80px;text-align:right">' + ratingLabel(val || 0) + '</span></div>'
        ).join('')
      + '<div class="rr" style="background:#f0fdf4;border-radius:4px;margin-top:4px;font-weight:bold"><span style="flex:1">Overall</span><span style="color:#0f766e">' + (rec.overall || '—') + '</span></div></div>'
      + (rec.additional_comments ? '<div class="sec"><h2 style="margin-top:0">Comments</h2><div class="cb">' + rec.additional_comments + '</div></div>' : '')
      + (rec.employee_goals ? '<div class="sec"><h2 style="margin-top:0">Employee Goals</h2><div class="cb">' + rec.employee_goals + '</div></div>' : '')
      + (!isAch && rec.overall_rating
          ? '<div class="sec"><h2 style="margin-top:0">Supervisor Overall Rating</h2><div class="g2">'
            + '<div><div class="fl">Overall Rating</div><div class="fv">' + rec.overall_rating + '</div></div>'
            + '<div><div class="fl">Recommendation</div><div class="fv">' + (rec.recommendation || '—') + '</div></div></div>'
            + (rec.supervisors_overall_comment ? '<div class="fl">Comments</div><div class="cb">' + rec.supervisors_overall_comment + '</div>' : '') + '</div>'
          : '')
      + (!isAch && rec.reviewer_agree
          ? '<div class="sec"><h2 style="margin-top:0">Reviewer Comments</h2>'
            + '<div><div class="fl">Agreement</div><div class="fv">' + (rec.reviewer_agree === 'agree' ? 'Agrees with overall rating' : 'Disagrees' + (rec.revised_rating ? ' — Revised: ' + rec.revised_rating : '')) + '</div></div>'
            + (rec.reviewers_comment ? '<div class="fl" style="margin-top:4px">Comments</div><div class="cb">' + rec.reviewers_comment + '</div>' : '') + '</div>'
          : '')
      + (!isAch && rec.employee_acknowledgement ? '<div class="sec"><h2 style="margin-top:0">Employee Acknowledgement</h2><div class="cb">' + rec.employee_acknowledgement + '</div></div>' : '')
      + '<div class="sec"><h2 style="margin-top:0">Signatures</h2><table style="width:100%;border-collapse:collapse"><tr>' + sigsHtml + '</tr></table></div>'
      + '<div style="margin-top:16px;text-align:center;font-size:9px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:8px;">Printed on ' + new Date().toLocaleDateString() + ' &nbsp;&middot;&nbsp; Performance Management System</div>'
      + '</body></html>';
    const win = window.open('', '_blank');
    if (!win) { window.notify?.('Please allow popups to export as PDF', 'error'); return; }
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.print(); }, 600);
  };

  /* ── radar data ─────────────────────────────────────────────────── */
  const avgScores: Record<string, number> = { 'Quality': 0, 'Quantity': 0, 'Job Knowledge': 0, 'Attendance': 0, 'Work Habits': 0, 'Relationships': 0, 'Promotability': 0 };
  if (appraisals.length > 0) {
    appraisals.forEach(a => {
      avgScores['Quality'] += a.work_quality || 0;
      avgScores['Quantity'] += a.quantity_of_work || 0;
      avgScores['Job Knowledge'] += a.job_knowledge || 0;
      avgScores['Attendance'] += a.attendance || 0;
      avgScores['Work Habits'] += a.work_habits || 0;
      avgScores['Relationships'] += a.relationship_with_others || 0;
      avgScores['Promotability'] += a.promotability_score || a.promotability || 0;
    });
    Object.keys(avgScores).forEach(k => { avgScores[k] = parseFloat((avgScores[k] / appraisals.length).toFixed(1)); });
  }
  const radarData = Object.keys(avgScores).map(k => ({ subject: k, A: avgScores[k] || 3, fullMark: 5 }));

  /* ════════════════════════════════════════════════════════════════ */
  /* ── Achievement Measure full-screen view ─────────────────────── */
  /* ════════════════════════════════════════════════════════════════ */
  if (view === 'achievement') {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <button onClick={() => setView('dashboard')} className="flex items-center gap-2 text-sm text-slate-500 hover:text-teal-deep dark:hover:text-teal-green transition-colors mb-4">
          <ArrowLeft size={16} /> Back to Dashboard
      </button>
      <Card>
        <div className="flex items-center justify-between mb-1">
          <h2 className="screen-heading">Employee Achievement Measure System</h2>
        </div>
        <p className="screen-subheading mb-5 border-b dark:border-slate-800 pb-3">
          Ratings: <strong>1</strong> = Poor · <strong>2</strong> = Fair · <strong>3</strong> = Satisfactory · <strong>4</strong> = Good · <strong>5</strong> = Excellent
        </p>
        <form className="space-y-5" onSubmit={e => { e.preventDefault(); submitAchievement(); }}>
          {/* ── Employee Information ── */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
            <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Employee Information</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className={lbl}>Employee Name</label>
                <SearchableSelect
                  options={scopedEmployees.map(e => ({ value: String(e.id), label: e.name, avatarUrl: (e as any).profile_picture || null }))}
                  value={achForm.employee_id}
                  onChange={v => setAchForm({
                    ...achForm,
                    employee_id: String(v),
                    supervisor_print_name: achForm.supervisor_print_name || String(currentUser?.full_name || currentUser?.username || '').trim(),
                  })}
                  placeholder="Select Employee..."
                  dropdownVariant="pills-horizontal"
                />
              </div>
              <div><label className={lbl}>Employee ID</label><input type="text" value={achForm.employee_id ? `#${achForm.employee_id}` : ''} disabled className={inp + ' bg-slate-50 dark:bg-slate-900 text-slate-500'} /></div>
              <div><label className={lbl}>Job Title</label><input type="text" value={achSelectedEmployee ? (achSelectedEmployee.position || (achSelectedEmployee as any).title || '') : ''} disabled className={inp + ' bg-slate-50 dark:bg-slate-900 text-slate-500'} /></div>
              <div><label className={lbl}>Date</label><input type="date" value={achForm.date} onChange={e => setAchForm({ ...achForm, date: e.target.value })} className={inp} required /></div>
              <div><label className={lbl}>Department</label><input type="text" value={achSelectedEmployee ? (achSelectedEmployee.dept || '') : managerDept} disabled className={inp + ' bg-slate-50 dark:bg-slate-900 text-slate-500'} /></div>
              <div><label className={lbl}>Manager</label><input type="text" value={getManagerNameForEmployee(achSelectedEmployee)} disabled className={inp + ' bg-slate-50 dark:bg-slate-900 text-slate-500'} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div><label className={lbl}>Review Period From</label><input type="date" value={achForm.review_period_from} onChange={e => setAchForm({ ...achForm, review_period_from: e.target.value })} className={inp} required /></div>
              <div><label className={lbl}>Review Period To</label><input type="date" value={achForm.review_period_to} onChange={e => setAchForm({ ...achForm, review_period_to: e.target.value })} className={inp} min={achForm.review_period_from || undefined} required /></div>
            </div>
          </div>

          {/* ── Rating Categories with Comments ── */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
            <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-1">Performance Ratings</h4>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">1 = Poor · 2 = Fair · 3 = Satisfactory · 4 = Good · 5 = Excellent</p>
            {ACH_CATEGORIES.map(({ key, label }) => (
              <div key={key} className="mb-4 pb-4 border-b border-slate-100 dark:border-slate-800 last:border-0 last:mb-0 last:pb-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{label}</span>
                  <div className="flex items-center gap-3">
                    {[1,2,3,4,5].map(n => (
                      <label key={n} className="flex items-center gap-1 cursor-pointer">
                        <input type="radio" name={`ach-${key}`} checked={(achForm as any)[key] === n} onChange={() => setAchForm({ ...achForm, [key]: n })} className="accent-teal-600" />
                        <span className={`text-xs ${(achForm as any)[key] === n ? 'font-bold text-teal-deep dark:text-teal-green' : 'text-slate-400'}`}>{n}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <textarea rows={2} value={(achForm as any)[`${key}_comment`] || ''} onChange={e => setAchForm({ ...achForm, [`${key}_comment`]: e.target.value })} className={inp} placeholder={`Comments for ${label}...`} maxLength={2000} />
              </div>
            ))}
            {/* Overall Rating (auto-computed) */}
            {(() => {
              const keys = ACH_CATEGORIES.map(c => c.key);
              const rated = keys.filter(k => (achForm as any)[k] > 0);
              const avg = rated.length > 0 ? (rated.reduce((s, k) => s + (achForm as any)[k], 0) / rated.length) : 0;
              return (
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">Overall Rating (Average)</span>
                  <span className={`text-2xl font-black ${avg >= 4 ? 'text-teal-deep dark:text-teal-green' : avg >= 3 ? 'text-amber-500' : avg > 0 ? 'text-red-500' : 'text-slate-300'}`}>
                    {avg > 0 ? avg.toFixed(1) : '—'}
                  </span>
                </div>
              );
            })()}
          </div>

          {/* ── Additional Comments ── */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
            <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Additional Comments</h4>
            <textarea rows={3} value={achForm.additional_comments} onChange={e => setAchForm({ ...achForm, additional_comments: e.target.value })} className={inp} placeholder="Any additional comments or observations..." maxLength={2000} />
          </div>

          {/* ── Employee Goals ── */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
            <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Employee Goals</h4>
            <textarea rows={3} value={achForm.employee_goals} onChange={e => setAchForm({ ...achForm, employee_goals: e.target.value })} className={inp} placeholder="List specific goals, objectives, and development plans for the next review period..." maxLength={2000} />
          </div>

          {/* ── Verification of Review ── */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-4">
            <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest">Verification of Review</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 italic">
              Signing this form confirms that you have discussed this review in detail with your supervisor. Signing this form does not necessarily indicate that you agree with this evaluation.
            </p>
            <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-900/10 p-3">
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                Review check is completed in Signature Queue by the assigned signers.
              </p>
            </div>
            <div className="space-y-3">
              <div className="text-[11px] text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 rounded-lg px-3 py-2">
                Manager signature is completed in the assigned manager's Signature Queue after this form is saved.
              </div>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 italic mt-2">
              Signatures are completed through Signature Queue by assigned users (manager/reviewer/employee/HR).
            </p>
          </div>

          <div className="flex justify-end pt-4">
            <button type="submit" disabled={!isAchievementFormValid()} className="bg-teal-deep text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-teal-green transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              Save Achievement Measure
            </button>
          </div>
        </form>
      </Card>
      </motion.div>
    );
  }

  /* ════════════════════════════════════════════════════════════════ */
  /* ── Performance Evaluation full-screen view  (PDF-based)──────── */
  /* ════════════════════════════════════════════════════════════════ */
  if (view === 'performance') {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <button onClick={() => setView('dashboard')} className="flex items-center gap-2 text-sm text-slate-500 hover:text-teal-deep dark:hover:text-teal-green transition-colors mb-4">
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
        <Card>
          <h2 className="screen-heading mb-0">Employee Performance Evaluation Form</h2>
          <p className="screen-subheading mt-1 mb-5 border-b dark:border-slate-800 pb-3">
            The following evaluation of your work performance has been completed by your supervisor. This evaluation was based on factors applicable to your duties and responsibilities.
          </p>

          <form className="space-y-6" onSubmit={e => { e.preventDefault(); submitPerformance(); }}>

          {/* ── Header Info ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className={lbl}>Name of Employee</label>
              <SearchableSelect
                options={scopedEmployees.map(e => ({ value: String(e.id), label: e.name, avatarUrl: (e as any).profile_picture || null }))}
                value={perfForm.employee_id}
                onChange={v => {
                  const selected = scopedEmployees.find((e) => String(e.id) === String(v));
                  setPerfForm({
                    ...perfForm,
                    employee_id: String(v),
                    employee_department: selected?.dept || managerDept,
                    employee_title: selected?.position || (selected as any)?.title || '',
                    status: selected?.status || perfForm.status,
                    supervisor_print_name: perfForm.supervisor_print_name || String(currentUser?.full_name || currentUser?.username || '').trim(),
                  });
                }}
                placeholder="Select Employee..."
                dropdownVariant="pills-horizontal"
              />
            </div>
            <div><label className={lbl}>Department</label><input value={perfForm.employee_department} onChange={e => setPerfForm({ ...perfForm, employee_department: e.target.value })} className={inp} placeholder="e.g. Operations" /></div>
            <div><label className={lbl}>Title</label><input value={perfForm.employee_title} onChange={e => setPerfForm({ ...perfForm, employee_title: e.target.value })} className={inp} placeholder="e.g. Analyst II" /></div>
            <div>
              <label className={lbl}>Status</label>
              <select value={perfForm.status} onChange={e => setPerfForm({ ...perfForm, status: e.target.value })} className={inp}>
                <option value="">Select Status...</option>
                <option value="Permanent">Permanent</option>
                <option value="Probationary">Probationary</option>
                <option value="Provisional/Temporary">Provisional / Temporary</option>
                <option value="Hourly">Hourly</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><label className={lbl}>Evaluation Period From</label><input type="date" value={perfForm.eval_period_from} onChange={e => setPerfForm({ ...perfForm, eval_period_from: e.target.value })} className={inp} required /></div>
            <div><label className={lbl}>Evaluation Period To</label><input type="date" value={perfForm.eval_period_to} onChange={e => setPerfForm({ ...perfForm, eval_period_to: e.target.value })} className={inp} min={perfForm.eval_period_from || undefined} required /></div>
            <div>
              <label className={lbl}>Type of Evaluation</label>
              <select value={perfForm.eval_type} onChange={e => setPerfForm({ ...perfForm, eval_type: e.target.value })} className={inp}>
                <option value="">Select Type...</option>
                <option value="Annual">Annual</option>
                <option value="Special">Special</option>
                <option value="Probable Permanent">Probable Permanent</option>
                <option value="Provisional/Temporary">Provisional / Temporary</option>
                <option value="Probationary">Probationary</option>
              </select>
            </div>
            {perfForm.eval_type === 'Probationary' && (
              <div>
                <label className={lbl}>Probationary Period</label>
                <select value={perfForm.probationary_period} onChange={e => setPerfForm({ ...perfForm, probationary_period: e.target.value })} className={inp}>
                  <option value="">Select...</option>
                  <option value="1st">1st</option>
                  <option value="2nd">2nd</option>
                  <option value="3rd">3rd</option>
                  <option value="Final">Final</option>
                </select>
              </div>
            )}
          </div>

          {/* ── Rating Factors (Page 2–3 of PDF) ─────────────────── */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-800/60 px-4 py-3 border-b dark:border-slate-700">
              <h3 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest">Performance Rating Factors</h3>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Check the statement(s) that best describe the employee's performance. More than one statement may be applicable.</p>
            </div>
            <div className="divide-y dark:divide-slate-700/50">
              {PERF_CATEGORIES.map((cat, catIdx) => (
                <div key={cat.key} className="p-4">
                  {/* Group header for sub-indicators */}
                  {cat.group && (catIdx === 0 || PERF_CATEGORIES[catIdx - 1]?.group !== cat.group) && (
                    <div className="mb-3 pb-2 border-b border-slate-200 dark:border-slate-700">
                      <h3 className="font-bold text-sm text-teal-deep dark:text-teal-green">{cat.group}</h3>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500">Considered were accuracy, efficiency, completeness, dependability, amount of work produced, and necessity of close supervision.</p>
                    </div>
                  )}
                  <h4 className="font-bold text-sm text-slate-700 dark:text-slate-200 mb-0.5">{cat.label}</h4>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-3">{cat.desc}</p>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                    {cat.levels.map((desc, idx) => {
                      const val = idx + 1;
                      const checked = (perfForm as any)[cat.key] === val;
                      return (
                        <label key={val}
                          className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-all text-[11px] leading-tight ${
                            checked
                              ? 'border-teal-deep dark:border-teal-green bg-teal-50 dark:bg-teal-900/20 text-slate-800 dark:text-slate-100'
                              : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                        >
                          <input type="radio" name={`perf-${cat.key}`} checked={checked}
                            onChange={() => setPerfForm({ ...perfForm, [cat.key]: val })}
                            className="mt-0.5 shrink-0 accent-teal-600" />
                          <span><span className="font-bold text-[10px] text-slate-400 dark:text-slate-500 mr-1">{val}.</span>{desc}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* COMMENTS field after rating factors — per PDF */}
            <div className="p-4 border-t dark:border-slate-700">
              <label className={lbl}>Comments</label>
              <textarea rows={3} value={perfForm.additional_comments} onChange={e => setPerfForm({ ...perfForm, additional_comments: e.target.value })} className={inp} placeholder="Add any comments which you feel will help in making a fair appraisal..." maxLength={2000} />
            </div>
          </div>

          <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/70 dark:bg-blue-900/10 p-4">
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Sections I–IV are completed in Signature Queue after submission.</p>
            <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
              Input fields and signatures for Supervisor, Reviewer, Employee Acknowledgement, and HR Certification are assigned to specific users in their queues. Each signer can review the submitted form before signing.
            </p>
          </div>

          {/* ── Submit ───────────────────────────────────────────── */}
          <div className="flex justify-end pt-2">
            <button type="submit" disabled={!isPerformanceFormValid()} className="bg-teal-deep text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-teal-green transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              Submit Performance Evaluation
            </button>
          </div>
        </form>
      </Card>
      </motion.div>
    );
  }

  /* ════════════════════════════════════════════════════════════════ */
  /* ── Detail view — read-only record preview ───────────────────── */
  /* ════════════════════════════════════════════════════════════════ */
  if (view === 'detail' && detailRecord) {
    const a = detailRecord;
    const recordType = (a.form_type || a.eval_type || '').toString().toLowerCase();
    const isPerf = !recordType.includes('achievement');
    const allSigned = isPerf
      ? !!(a.supervisor_signature && a.reviewer_signature && a.employee_signature && a.hr_signature)
      : !!(a.supervisor_signature && a.employee_signature);
    const ratingFields = isPerf
      ? [
          { key: 'work_quality', label: 'Quality of Work' },
          { key: 'quantity_of_work', label: 'Quantity of Work' },
          { key: 'relationship_with_others', label: 'Relationship with Others' },
          { key: 'work_habits', label: 'Work Habits' },
          { key: 'job_knowledge', label: 'Job Knowledge' },
          { key: 'attendance', label: 'Attendance & Punctuality' },
          { key: 'promotability_score', label: 'Promotability' },
        ]
      : [
          { key: 'job_knowledge', label: 'Job Knowledge' },
          { key: 'productivity', label: 'Productivity' },
          { key: 'work_quality', label: 'Work Quality' },
          { key: 'communication', label: 'Communication' },
          { key: 'dependability', label: 'Dependability' },
          { key: 'attendance', label: 'Attendance' },
        ];

    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => { setView('dashboard'); setDetailRecord(null); }} className="flex items-center gap-2 text-sm text-slate-500 hover:text-teal-deep dark:hover:text-teal-green transition-colors">
            <ArrowLeft size={16} /> Back to Dashboard
          </button>
          <button onClick={() => exportPDF(a)} className="flex items-center gap-2 bg-teal-deep text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-teal-green transition-colors">
            <FileText size={16} /> Export PDF
          </button>
        </div>
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{a.form_type || 'Appraisal'}</h2>
              <p className="text-xs text-slate-400">{a.employee_name || `Employee #${a.employee_id}`} · {a.eval_period_from || '—'} to {a.eval_period_to || '—'}</p>
            </div>
            <span className={`text-xs font-bold uppercase px-3 py-1 rounded-full ${allSigned ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'}`}>
              {allSigned ? 'Verified' : 'Pending'}
            </span>
          </div>

          <div className={`mb-4 rounded-lg border px-3 py-2 text-xs ${allSigned ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-300' : 'border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-300'}`}>
            {allSigned
              ? 'Reminder: this form is completed and acknowledged because all required signatures were finished in Signature Queue.'
              : 'Reminder: this form will only be completed and acknowledged after all required signatures are finished in Signature Queue.'}
          </div>

          {/* Info row */}
          {isPerf && (
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="text-xs"><span className="font-bold text-slate-400 uppercase block">Department</span><span className="text-slate-700 dark:text-slate-300">{a.employee_department || '—'}</span></div>
              <div className="text-xs"><span className="font-bold text-slate-400 uppercase block">Title</span><span className="text-slate-700 dark:text-slate-300">{a.employee_title || '—'}</span></div>
              <div className="text-xs"><span className="font-bold text-slate-400 uppercase block">Status</span><span className="text-slate-700 dark:text-slate-300">{a.status || '—'}</span></div>
              <div className="text-xs"><span className="font-bold text-slate-400 uppercase block">Eval Type</span><span className="text-slate-700 dark:text-slate-300">{a.eval_type || '—'}</span></div>
            </div>
          )}

          {/* Ratings */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 mb-4">
            <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Ratings</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {ratingFields.map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2">
                  <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">{label}</span>
                  <span className="text-sm font-bold text-teal-green">{a[key] ?? '—'}/5</span>
                </div>
              ))}
              <div className="flex items-center justify-between bg-teal-50 dark:bg-teal-900/20 rounded-lg px-3 py-2 border border-teal-200 dark:border-teal-800">
                <span className="text-xs text-teal-700 dark:text-teal-400 font-bold">Overall</span>
                <span className="text-sm font-bold text-teal-deep dark:text-teal-green">{a.overall}</span>
              </div>
            </div>
          </div>

          {/* Comments */}
          <div className="space-y-3 mb-4">
            {a.supervisors_overall_comment && <div><span className="text-[10px] font-bold text-slate-400 uppercase">Supervisor's Comments</span><p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">{a.supervisors_overall_comment}</p></div>}
            {a.reviewers_comment && <div><span className="text-[10px] font-bold text-slate-400 uppercase">Reviewer's Comments</span><p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">{a.reviewers_comment}</p></div>}
            {a.employee_acknowledgement && <div><span className="text-[10px] font-bold text-slate-400 uppercase">Employee Acknowledgement</span><p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">{a.employee_acknowledgement}</p></div>}
            {a.employee_goals && <div><span className="text-[10px] font-bold text-slate-400 uppercase">Employee Goals</span><p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">{a.employee_goals}</p></div>}
            {a.additional_comments && <div><span className="text-[10px] font-bold text-slate-400 uppercase">Additional Comments</span><p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">{a.additional_comments}</p></div>}
          </div>

          {/* Signatures preview */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
            <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">{isPerf ? 'Signatures' : 'Verification of Review'}</h4>
            {!isPerf && <p className="text-xs text-slate-500 dark:text-slate-400 italic mb-3">Signing this form confirms that you have discussed this review in detail with your supervisor. Signing this form does not necessarily indicate that you agree with this evaluation.</p>}
            <div className={`grid gap-4 ${isPerf ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-1 md:grid-cols-2'}`}>
              {(isPerf ? [
                { label: 'Supervisor', sig: a.supervisor_signature, date: a.supervisor_signature_date, printName: a.supervisor_print_name },
                { label: 'Reviewer', sig: a.reviewer_signature, date: a.reviewer_signature_date, printName: a.reviewer_print_name },
                { label: 'Employee', sig: a.employee_signature, date: a.employee_signature_date, printName: a.employee_print_name || a.employee_name },
                { label: 'HR Admin', sig: a.hr_signature, date: a.hr_signature_date, printName: a.hr_print_name },
              ] : [
                { label: 'Employee', sig: a.employee_signature, date: a.employee_signature_date, printName: a.employee_name },
                { label: 'Manager', sig: a.supervisor_signature, date: a.supervisor_signature_date, printName: a.supervisor_print_name },
              ]).map(s => (
                <div key={s.label} className="text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">{s.label}</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block">{s.printName || '—'}</span>
                  {s.sig ? (
                    <div className="mt-1 border border-slate-200 dark:border-slate-700 rounded-lg p-1 bg-white dark:bg-slate-800">
                      <img src={s.sig} alt={`${s.label} signature`} className="h-10 mx-auto object-contain" />
                    </div>
                  ) : (
                    <div className="mt-1 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg h-12 flex items-center justify-center text-[10px] text-slate-400">No signature</div>
                  )}
                  <span className="text-[10px] text-slate-400 mt-1 block">{s.date || '—'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Overall Rating & Recommendation for performance */}
          {isPerf && (a.overall_rating || a.recommendation) && (
            <div className="mt-4 grid grid-cols-3 gap-3">
              {a.overall_rating && <div className="text-xs"><span className="font-bold text-slate-400 uppercase block">Overall Rating</span><span className={`font-bold ${a.overall_rating === 'Satisfactory' ? 'text-emerald-600' : 'text-red-500'}`}>{a.overall_rating}</span></div>}
              {a.recommendation && <div className="text-xs"><span className="font-bold text-slate-400 uppercase block">Recommendation</span><span className="text-slate-700 dark:text-slate-300">{a.recommendation}</span></div>}
              {a.reviewer_agree && <div className="text-xs"><span className="font-bold text-slate-400 uppercase block">Reviewer Agreement</span><span className="text-slate-700 dark:text-slate-300">{a.reviewer_agree === 'agree' ? 'Agrees' : `Disagrees${a.revised_rating ? ` — Revised: ${a.revised_rating}` : ''}`}</span></div>}
            </div>
          )}
        </Card>
      </motion.div>
    );
  }

  /* ════════════════════════════════════════════════════════════════ */
  /* ── Dashboard ────────────────────────────────────────────────── */
  /* ════════════════════════════════════════════════════════════════ */
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-6">
        <SectionHeader title="Evaluation Portal" subtitle="Formal performance appraisal forms" />
        <div className="flex gap-2">
          <button onClick={() => exportToCSV(appraisals, 'appraisals')} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><Download size={16} /> Export XLSX</button>
          <button onClick={() => setView('achievement')} className="flex items-center gap-2 bg-teal-deep text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-teal-green transition-colors"><Star size={16} /> Achievement Measure</button>
          <button onClick={() => setView('performance')} className="flex items-center gap-2 bg-teal-green text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-teal-deep transition-colors"><FileText size={16} /> Performance Evaluation</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <h3 className="text-sm font-bold text-slate-500 uppercase mb-3">Team Performance Average</h3>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                <PolarGrid stroke="var(--chart-grid)" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
                <PolarRadiusAxis angle={30} domain={[0, 5]} tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
                <Radar name="Team Average" dataKey="A" stroke="#0f766e" fill="#14b8a6" fillOpacity={0.5} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <div className="md:col-span-2">
          <Card>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-300 uppercase mb-4">Appraisal Records</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Employee</th>
                  <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Type</th>
                  <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Period</th>
                  <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Knowledge</th>
                  <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Prod.</th>
                  <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Overall</th>
                  <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Signed</th>
                  <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Verified</th>
                  <th className="pb-2"></th>
                </tr></thead>
                <tbody>
                  {appraisals.map(a => {
                    const formTypeStr = (a.form_type || a.eval_type || '').toString().toLowerCase();
                    const isPerformanceEval = formTypeStr.includes('performance');
                    const sigCount = isPerformanceEval
                      ? [a.supervisor_signature, a.reviewer_signature, a.employee_signature, a.hr_signature].filter(Boolean).length
                      : [a.supervisor_signature, a.employee_signature].filter(Boolean).length;
                    const sigTotal = isPerformanceEval ? 4 : 2;
                    return (
                      <tr key={a.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 font-medium text-slate-700 dark:text-slate-200">
                          <div className="min-w-0">
                            <span className="truncate max-w-55" title={a.employee_name || `#${a.employee_id}`}>{a.employee_name || `#${a.employee_id}`}</span>
                          </div>
                        </td>
                        <td className="py-3 text-[10px] font-bold uppercase text-slate-500">{a.form_type || a.eval_type || '—'}</td>
                        <td className="py-3 text-[10px] text-slate-500 whitespace-nowrap">{(a.eval_period_from || a.review_period_from) ? `${a.eval_period_from || a.review_period_from} – ${a.eval_period_to || a.review_period_to}` : '—'}</td>
                        <td className="py-3 text-slate-600 dark:text-slate-300">{a.job_knowledge}/5</td>
                        <td className="py-3 text-slate-600 dark:text-slate-300">{a.productivity}/5</td>
                        <td className="py-3 font-bold text-teal-green">{a.overall}</td>
                        <td className="py-3"><span className={`text-[10px] font-bold ${sigCount >= sigTotal ? 'text-emerald-600' : sigCount > 0 ? 'text-amber-500' : 'text-slate-400'}`}>{sigCount}/{sigTotal}</span></td>
                        <td className="py-3">
                          {(() => {
                            const ft = (a.form_type || a.eval_type || '').toString().toLowerCase();
                            const ip = ft.includes('performance');
                            const v = ip
                              ? !!(a.supervisor_signature && a.reviewer_signature && a.employee_signature && a.hr_signature)
                              : !!(a.supervisor_signature && a.employee_signature);
                            return v
                              ? <span className="text-[10px] font-bold text-emerald-600 uppercase flex items-center gap-1"><CheckCircle size={12} /> Verified</span>
                              : <span className="text-[10px] font-bold text-amber-500 uppercase">Pending</span>;
                          })()}
                        </td>
                        <td className="py-3 flex items-center gap-2">
                          <button onClick={() => { setDetailRecord(a); setView('detail'); }} className="text-slate-400 hover:text-teal-deep dark:hover:text-teal-green transition-colors" title="View"><Eye size={14} /></button>
                          {(() => {
                            const ft2 = (a.form_type || a.eval_type || '').toString().toLowerCase();
                            const ip2 = ft2.includes('performance');
                            const fullySignedForExport = ip2
                              ? !!(a.supervisor_signature && a.reviewer_signature && a.employee_signature && a.hr_signature)
                              : !!(a.supervisor_signature && a.employee_signature);
                            return fullySignedForExport
                              ? <button onClick={() => exportPDF(a)} className="text-teal-600 hover:text-teal-800 transition-colors" title="Export PDF"><Download size={14} /></button>
                              : null;
                          })()}
                          <button onClick={() => handleDelete(a.id)} className="text-red-500 hover:text-red-600 p-1 rounded transition-colors" title="Archive"><Archive size={15} /></button>
                        </td>
                      </tr>
                    );
                  })}
                  {appraisals.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-slate-400">No appraisals recorded yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </motion.div>
  );
};
