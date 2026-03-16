import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Employee } from '../../../types';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { SearchableSelect } from '../../common/SearchableSelect';
import { SignatureUpload } from '../../common/SignatureUpload';
import { Star, FileText, X, Download, Trash2, ArrowLeft, Eye, CheckCircle } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';

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
}

export const EvaluationPortal = ({ employees }: EvaluationPortalProps) => {
  const [view, setView] = useState<'dashboard' | 'achievement' | 'performance' | 'detail'>('dashboard');
  const [appraisals, setAppraisals] = useState<any[]>([]);
  const [detailRecord, setDetailRecord] = useState<any>(null);

  /* ── Achievement Measure form state ─────────────────────────────── */
  const freshAch = () => ({
    employee_id: '', date: '', review_period_from: '', review_period_to: '',
    job_knowledge: 0, work_quality: 0, attendance: 0, productivity: 0, communication: 0, dependability: 0,
    job_knowledge_comment: '', work_quality_comment: '', attendance_comment: '', productivity_comment: '', communication_comment: '', dependability_comment: '',
    additional_comments: '', employee_goals: '',
    supervisor_signature: '', supervisor_signature_date: '',
    employee_signature: '', employee_signature_date: '',
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
    employee_signature: '', employee_signature_date: '',
    // Section IV — HR Officer
    hr_print_name: '',
    hr_signature: '', hr_signature_date: '',
  });
  const [perfForm, setPerfForm] = useState(freshPerf());

  /* ── data fetch ─────────────────────────────────────────────────── */
  useEffect(() => { fetchAppraisals(); }, []);

  const fetchAppraisals = async () => {
    try {
      const res = await fetch('/api/appraisals', { headers: getAuthHeaders() });
      const data = await res.json();
      setAppraisals(Array.isArray(data) ? data : []);
    } catch { setAppraisals([]); }
  };

  /* ── submit handlers ────────────────────────────────────────────── */
  const submitAchievement = async () => {
    if (!achForm.employee_id) { window.notify?.('Please select an employee', 'error'); return; }
    const achRatingKeys = ['job_knowledge','productivity','attendance','work_quality','communication','dependability'] as const;
    if (achRatingKeys.some(k => (achForm as any)[k] === 0)) { window.notify?.('Please rate all categories before submitting', 'error'); return; }
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
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Achievement measure saved', 'success');
      setAchForm(freshAch());
      setView('dashboard');
      fetchAppraisals();
    } catch { window.notify?.('Failed to save', 'error'); }
  };

  const submitPerformance = async () => {
    if (!perfForm.employee_id) { window.notify?.('Please select an employee', 'error'); return; }
    const perfRatingKeys = ['work_quality','quantity_of_work','relationship_with_others','work_habits','job_knowledge','attendance','promotability'] as const;
    if (perfRatingKeys.some(k => (perfForm as any)[k] === 0)) { window.notify?.('Please rate all performance factors before submitting', 'error'); return; }
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
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Performance evaluation saved', 'success');
      setPerfForm(freshPerf());
      setView('dashboard');
      fetchAppraisals();
    } catch { window.notify?.('Failed to save', 'error'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this appraisal?')) return;
    try {
      await fetch(`/api/appraisals/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      window.notify?.('Appraisal deleted', 'success');
      fetchAppraisals();
    } catch { window.notify?.('Failed to delete', 'error'); }
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
  if (view === 'achievement') return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <button onClick={() => setView('dashboard')} className="flex items-center gap-2 text-sm text-slate-500 hover:text-teal-deep dark:hover:text-teal-green transition-colors mb-4">
        <ArrowLeft size={16} /> Back to Dashboard
      </button>
      <Card>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Employee Achievement Measure System</h2>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-5 border-b dark:border-slate-800 pb-3">
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
                  options={employees.map(e => ({ value: String(e.id), label: e.name }))}
                  value={achForm.employee_id}
                  onChange={v => setAchForm({ ...achForm, employee_id: v })}
                  placeholder="Select Employee..."
                />
              </div>
              <div><label className={lbl}>Employee ID</label><input type="text" value={achForm.employee_id ? `#${achForm.employee_id}` : ''} disabled className={inp + ' bg-slate-50 dark:bg-slate-900 text-slate-500'} /></div>
              <div><label className={lbl}>Job Title</label><input type="text" value={achForm.employee_id ? (employees.find(e => String(e.id) === achForm.employee_id)?.title || '') : ''} disabled className={inp + ' bg-slate-50 dark:bg-slate-900 text-slate-500'} /></div>
              <div><label className={lbl}>Date</label><input type="date" value={achForm.date} onChange={e => setAchForm({ ...achForm, date: e.target.value })} className={inp} /></div>
              <div><label className={lbl}>Department</label><input type="text" value={achForm.employee_id ? (employees.find(e => String(e.id) === achForm.employee_id)?.dept || '') : ''} disabled className={inp + ' bg-slate-50 dark:bg-slate-900 text-slate-500'} /></div>
              <div><label className={lbl}>Manager</label><input type="text" value={achForm.employee_id ? (employees.find(e => String(e.id) === achForm.employee_id)?.manager || '') : ''} disabled className={inp + ' bg-slate-50 dark:bg-slate-900 text-slate-500'} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div><label className={lbl}>Review Period From</label><input type="date" value={achForm.review_period_from} onChange={e => setAchForm({ ...achForm, review_period_from: e.target.value })} className={inp} /></div>
              <div><label className={lbl}>Review Period To</label><input type="date" value={achForm.review_period_to} onChange={e => setAchForm({ ...achForm, review_period_to: e.target.value })} className={inp} /></div>
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
                <textarea rows={2} value={(achForm as any)[`${key}_comment`] || ''} onChange={e => setAchForm({ ...achForm, [`${key}_comment`]: e.target.value })} className={inp} placeholder={`Comments for ${label}...`} />
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
            <textarea rows={3} value={achForm.additional_comments} onChange={e => setAchForm({ ...achForm, additional_comments: e.target.value })} className={inp} placeholder="Any additional comments or observations..." />
          </div>

          {/* ── Employee Goals ── */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
            <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Employee Goals</h4>
            <textarea rows={3} value={achForm.employee_goals} onChange={e => setAchForm({ ...achForm, employee_goals: e.target.value })} className={inp} placeholder="List specific goals, objectives, and development plans for the next review period..." />
          </div>

          {/* ── Verification of Review ── */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-4">
            <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest">Verification of Review</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 italic">
              Signing this form confirms that you have discussed this review in detail with your supervisor. Signing this form does not necessarily indicate that you agree with this evaluation.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <SignatureUpload label="Employee Signature" value={achForm.employee_signature} onChange={v => setAchForm({ ...achForm, employee_signature: v })} />
                <div><label className={lbl}>Employee Signature Date</label><input type="date" value={achForm.employee_signature_date} onChange={e => setAchForm({ ...achForm, employee_signature_date: e.target.value })} className={inp} /></div>
              </div>
              <div className="space-y-3">
                <SignatureUpload label="Manager Signature" value={achForm.supervisor_signature} onChange={v => setAchForm({ ...achForm, supervisor_signature: v })} />
                <div><label className={lbl}>Manager Signature Date</label><input type="date" value={achForm.supervisor_signature_date} onChange={e => setAchForm({ ...achForm, supervisor_signature_date: e.target.value })} className={inp} /></div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button type="submit" className="bg-teal-deep text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-teal-green transition-colors">Save Achievement Measure</button>
          </div>
        </form>
      </Card>
    </motion.div>
  );

  /* ════════════════════════════════════════════════════════════════ */
  /* ── Performance Evaluation full-screen view  (PDF-based)──────── */
  /* ════════════════════════════════════════════════════════════════ */
  if (view === 'performance') return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <button onClick={() => setView('dashboard')} className="flex items-center gap-2 text-sm text-slate-500 hover:text-teal-deep dark:hover:text-teal-green transition-colors mb-4">
        <ArrowLeft size={16} /> Back to Dashboard
      </button>
      <Card>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-0">Employee Performance Evaluation Form</h2>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 mb-5 border-b dark:border-slate-800 pb-3">
          The following evaluation of your work performance has been completed by your supervisor. This evaluation was based on factors applicable to your duties and responsibilities.
        </p>

        <form className="space-y-6" onSubmit={e => { e.preventDefault(); submitPerformance(); }}>

          {/* ── Header Info ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className={lbl}>Name of Employee</label>
              <SearchableSelect
                options={employees.map(e => ({ value: String(e.id), label: e.name }))}
                value={perfForm.employee_id}
                onChange={v => setPerfForm({ ...perfForm, employee_id: v })}
                placeholder="Select Employee..."
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
            <div><label className={lbl}>Evaluation Period From</label><input type="date" value={perfForm.eval_period_from} onChange={e => setPerfForm({ ...perfForm, eval_period_from: e.target.value })} className={inp} /></div>
            <div><label className={lbl}>Evaluation Period To</label><input type="date" value={perfForm.eval_period_to} onChange={e => setPerfForm({ ...perfForm, eval_period_to: e.target.value })} className={inp} /></div>
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
              <textarea rows={3} value={perfForm.additional_comments} onChange={e => setPerfForm({ ...perfForm, additional_comments: e.target.value })} className={inp} placeholder="Add any comments which you feel will help in making a fair appraisal..." />
            </div>
          </div>

          {/* ── Section I: Supervisor's Overall Rating & Recommendation ── */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest">I. Supervisor's Overall Rating and Recommendation</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Overall Rating</label>
                <div className="flex gap-4 mt-1 text-sm text-slate-700 dark:text-slate-300">
                  {['Satisfactory', 'Unsatisfactory'].map(r => (
                    <label key={r} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="overall_rating" checked={perfForm.overall_rating === r} onChange={() => setPerfForm({ ...perfForm, overall_rating: r })} className="accent-teal-600" /> {r}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className={lbl}>Recommendation</label>
                <select value={perfForm.recommendation} onChange={e => setPerfForm({ ...perfForm, recommendation: e.target.value })} className={inp}>
                  <option value="">Optional — select if applicable</option>
                  <option value="Continued employment">Continued employment</option>
                  <option value="Employment be discontinued">Employment be discontinued</option>
                  <option value="Tenure">Tenure (for final report only)</option>
                </select>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
              This employee performance evaluation is based on demonstrated job skills observed by me during the indicated evaluation period.
              The overall rating and recommendation (if any) were determined by assessing all factors listed. I have discussed the evaluation with the employee.
            </p>

            <div><label className={lbl}>Supervisor's Comments</label><textarea rows={3} value={perfForm.supervisors_overall_comment} onChange={e => setPerfForm({ ...perfForm, supervisors_overall_comment: e.target.value })} className={inp} placeholder="Summarize the employee's overall performance..." /></div>

            <div><label className={lbl}>Print Name / Title</label><input type="text" value={perfForm.supervisor_print_name} onChange={e => setPerfForm({ ...perfForm, supervisor_print_name: e.target.value })} className={inp} placeholder="e.g. John Doe / Senior Manager" /></div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SignatureUpload label="Supervisor Signature" value={perfForm.supervisor_signature} onChange={v => setPerfForm({ ...perfForm, supervisor_signature: v })} />
              <div><label className={lbl}>Signature Date</label><input type="date" value={perfForm.supervisor_signature_date} onChange={e => setPerfForm({ ...perfForm, supervisor_signature_date: e.target.value })} className={inp} /></div>
            </div>
          </div>

          {/* ── Section II: Reviewer's Comments ──────────────────── */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest">II. Reviewer's Comments</h3>

            <div className="flex gap-6 text-sm text-slate-700 dark:text-slate-300">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="reviewer_agree" checked={perfForm.reviewer_agree === 'agree'} onChange={() => setPerfForm({ ...perfForm, reviewer_agree: 'agree', revised_rating: '' })} className="accent-teal-600" />
                I agree with the overall rating
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="reviewer_agree" checked={perfForm.reviewer_agree === 'disagree'} onChange={() => setPerfForm({ ...perfForm, reviewer_agree: 'disagree' })} className="accent-teal-600" />
                I do not agree with the overall rating
              </label>
            </div>

            {perfForm.reviewer_agree === 'disagree' && (
              <div>
                <label className={lbl}>Revised Overall Rating</label>
                <div className="flex gap-4 mt-1 text-sm text-slate-700 dark:text-slate-300">
                  {['Satisfactory', 'Unsatisfactory'].map(r => (
                    <label key={r} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="revised_rating" checked={perfForm.revised_rating === r} onChange={() => setPerfForm({ ...perfForm, revised_rating: r })} className="accent-teal-600" /> {r}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div><label className={lbl}>Comments (attach additional pages if necessary)</label><textarea rows={3} value={perfForm.reviewers_comment} onChange={e => setPerfForm({ ...perfForm, reviewers_comment: e.target.value })} className={inp} placeholder="Reviewer's comments..." /></div>

            <div><label className={lbl}>Print Name / Title</label><input type="text" value={perfForm.reviewer_print_name} onChange={e => setPerfForm({ ...perfForm, reviewer_print_name: e.target.value })} className={inp} placeholder="e.g. Jane Smith / Department Head" /></div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SignatureUpload label="Reviewer Signature" value={perfForm.reviewer_signature} onChange={v => setPerfForm({ ...perfForm, reviewer_signature: v })} />
              <div><label className={lbl}>Signature Date</label><input type="date" value={perfForm.reviewer_signature_date} onChange={e => setPerfForm({ ...perfForm, reviewer_signature_date: e.target.value })} className={inp} /></div>
            </div>
          </div>

          {/* ── Section III: Employee's Acknowledgement ──────────── */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest">III. Employee's Acknowledgement</h3>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
              I have reviewed this report on the date indicated and have had the opportunity to discuss it with my rating supervisor(s).
              My signature does not necessarily signify agreement. I understand that I may submit a written rebuttal, which will be attached to this evaluation and placed in my personnel file.
            </p>

            <div><label className={lbl}>Employee Statement (optional rebuttal)</label><textarea rows={2} value={perfForm.employee_acknowledgement} onChange={e => setPerfForm({ ...perfForm, employee_acknowledgement: e.target.value })} className={inp} placeholder="Optional: write a rebuttal or statement..." /></div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SignatureUpload label="Employee Signature" value={perfForm.employee_signature} onChange={v => setPerfForm({ ...perfForm, employee_signature: v })} />
              <div><label className={lbl}>Signature Date</label><input type="date" value={perfForm.employee_signature_date} onChange={e => setPerfForm({ ...perfForm, employee_signature_date: e.target.value })} className={inp} /></div>
            </div>
          </div>

          {/* ── Section IV: Human Resources Officer's Certification ── */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest">IV. Human Resources Officer's Certification</h3>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
              I have reviewed the supervisor's evaluation, reviewer's comments, and the employee's statement (if any). I believe this form to be complete and in accordance with the guidelines provided for evaluations of employees serving in this title. This form shall be made part of the employee's official Personnel File.
            </p>

            <div><label className={lbl}>Print Name / Title</label><input type="text" value={perfForm.hr_print_name} onChange={e => setPerfForm({ ...perfForm, hr_print_name: e.target.value })} className={inp} placeholder="e.g. Maria Cruz / HR Director" /></div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SignatureUpload label="HR Officer Signature" value={perfForm.hr_signature} onChange={v => setPerfForm({ ...perfForm, hr_signature: v })} />
              <div><label className={lbl}>Signature Date</label><input type="date" value={perfForm.hr_signature_date} onChange={e => setPerfForm({ ...perfForm, hr_signature_date: e.target.value })} className={inp} /></div>
            </div>
          </div>

          {/* ── Submit ───────────────────────────────────────────── */}
          <div className="flex justify-end pt-2">
            <button type="submit" className="bg-teal-deep text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-teal-green transition-colors">Submit Performance Evaluation</button>
          </div>
        </form>
      </Card>
    </motion.div>
  );

  /* ════════════════════════════════════════════════════════════════ */
  /* ── Detail view — read-only record preview ───────────────────── */
  /* ════════════════════════════════════════════════════════════════ */
  if (view === 'detail' && detailRecord) {
    const a = detailRecord;
    const isPerf = a.form_type === 'Performance Evaluation';
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
        <button onClick={() => { setView('dashboard'); setDetailRecord(null); }} className="flex items-center gap-2 text-sm text-slate-500 hover:text-teal-deep dark:hover:text-teal-green transition-colors mb-4">
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{a.form_type || 'Appraisal'}</h2>
              <p className="text-xs text-slate-400">{a.employee_name || `Employee #${a.employee_id}`} · {a.eval_period_from || '—'} to {a.eval_period_to || '—'}</p>
            </div>
            <span className={`text-xs font-bold uppercase px-3 py-1 rounded-full ${a.verified ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'}`}>
              {a.verified ? 'Verified' : 'Pending'}
            </span>
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
                { label: 'Employee', sig: a.employee_signature, date: a.employee_signature_date },
                { label: 'HR Officer', sig: a.hr_signature, date: a.hr_signature_date, printName: a.hr_print_name },
              ] : [
                { label: 'Employee', sig: a.employee_signature, date: a.employee_signature_date },
                { label: 'Manager', sig: a.supervisor_signature, date: a.supervisor_signature_date },
              ]).map(s => (
                <div key={s.label} className="text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">{s.label}</span>
                  {s.printName && <span className="text-[10px] text-slate-500 dark:text-slate-400 block">{s.printName}</span>}
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
          <button onClick={() => exportToCSV(appraisals, 'appraisals')} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><Download size={16} /> Export CSV</button>
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
                  <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Knowledge</th>
                  <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Prod.</th>
                  <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Overall</th>
                  <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Signed</th>
                  <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Verified</th>
                  <th className="pb-2"></th>
                </tr></thead>
                <tbody>
                  {appraisals.map(a => {
                    const isAchievement = a.form_type === 'Achievement Measure';
                    const sigCount = isAchievement
                      ? [a.supervisor_signature, a.employee_signature].filter(Boolean).length
                      : [a.supervisor_signature, a.reviewer_signature, a.employee_signature, a.hr_signature].filter(Boolean).length;
                    const sigTotal = isAchievement ? 2 : 4;
                    return (
                      <tr key={a.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 font-medium text-slate-700 dark:text-slate-200">
                          <div className="min-w-0">
                            <span className="truncate max-w-[220px]" title={a.employee_name || `#${a.employee_id}`}>{a.employee_name || `#${a.employee_id}`}</span>
                          </div>
                        </td>
                        <td className="py-3 text-[10px] font-bold uppercase text-slate-500">{a.form_type || a.eval_type || '—'}</td>
                        <td className="py-3 text-slate-600 dark:text-slate-300">{a.job_knowledge}/5</td>
                        <td className="py-3 text-slate-600 dark:text-slate-300">{a.productivity}/5</td>
                        <td className="py-3 font-bold text-teal-green">{a.overall}</td>
                        <td className="py-3"><span className={`text-[10px] font-bold ${sigCount >= sigTotal ? 'text-emerald-600' : sigCount > 0 ? 'text-amber-500' : 'text-slate-400'}`}>{sigCount}/{sigTotal}</span></td>
                        <td className="py-3">
                          {a.verified ? (
                            <span className="text-[10px] font-bold text-emerald-600 uppercase flex items-center gap-1"><CheckCircle size={12} /> Verified</span>
                          ) : (
                            <button onClick={async () => {
                              try {
                                const res = await fetch(`/api/appraisals/${a.id}`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify({ verified: 1, supervisor_signature_date: new Date().toISOString().split('T')[0] }) });
                                if (res.ok) { window.notify?.('Appraisal verified', 'success'); fetchAppraisals(); }
                              } catch { window.notify?.('Failed to verify', 'error'); }
                            }} className="text-[10px] font-bold text-amber-500 hover:text-emerald-600 uppercase transition-colors">Click to Verify</button>
                          )}
                        </td>
                        <td className="py-3 flex items-center gap-2">
                          <button onClick={() => { setDetailRecord(a); setView('detail'); }} className="text-slate-400 hover:text-teal-deep dark:hover:text-teal-green transition-colors"><Eye size={14} /></button>
                          <button onClick={() => handleDelete(a.id)} className="text-red-400 hover:text-red-600 transition-colors"><Trash2 size={14} /></button>
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
