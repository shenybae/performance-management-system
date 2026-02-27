import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Employee } from '../../../types';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { Star, FileText, X, Download, Trash2 } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';

interface EvaluationPortalProps {
  employees: Employee[];
}

export const EvaluationPortal = ({ employees }: EvaluationPortalProps) => {
  const [activeForm, setActiveForm] = useState<'none' | 'achievement' | 'performance'>('none');
  const [appraisals, setAppraisals] = useState<any[]>([]);
  const [achForm, setAchForm] = useState({
    employee_id: '', date: '', review_period_from: '', review_period_to: '',
    job_knowledge: 3, productivity: 3, attendance: 3,
    work_quality: 3, communication: 3, dependability: 3,
    overall: 3, promotability_status: 'Satisfactory',
    additional_comments: '', employee_goals: ''
  });
  const [perfForm, setPerfForm] = useState({
    employee_id: '', eval_period_from: '', eval_period_to: '',
    eval_type: 'Annual',
    job_knowledge: 3, productivity: 3, quantity_of_work: 3,
    relationship_with_others: 3, work_habits: 3, attendance: 3, promotability: 3,
    overall: 3, promotability_status: 'Continued employment',
    supervisors_overall_comment: '', reviewers_comment: '',
    employee_acknowledgement: ''
  });

  useEffect(() => { fetchAppraisals(); }, []);

  const fetchAppraisals = async () => {
    try {
      const res = await fetch('/api/appraisals', { headers: getAuthHeaders() });
      const data = await res.json();
      setAppraisals(Array.isArray(data) ? data : []);
    } catch { setAppraisals([]); }
  };

  const submitAchievement = async () => {
    if (!achForm.employee_id) { window.notify?.('Please select an employee', 'error'); return; }
    try {
      const overall = ((achForm.job_knowledge + achForm.productivity + achForm.attendance) / 3).toFixed(1);
      const res = await fetch('/api/appraisals', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ ...achForm, employee_id: parseInt(achForm.employee_id), overall: parseFloat(overall), sign_off_date: new Date().toISOString().split('T')[0] }),
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Achievement measure saved', 'success');
      setAchForm({ employee_id: '', date: '', review_period_from: '', review_period_to: '', job_knowledge: 3, productivity: 3, attendance: 3, work_quality: 3, communication: 3, dependability: 3, overall: 3, promotability_status: 'Satisfactory', additional_comments: '', employee_goals: '' });
      setActiveForm('none');
      fetchAppraisals();
    } catch { window.notify?.('Failed to save', 'error'); }
  };

  const submitPerformance = async () => {
    if (!perfForm.employee_id) { window.notify?.('Please select an employee', 'error'); return; }
    try {
      const overall = ((perfForm.job_knowledge + perfForm.productivity + perfForm.attendance) / 3).toFixed(1);
      const res = await fetch('/api/appraisals', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ ...perfForm, employee_id: parseInt(perfForm.employee_id), overall: parseFloat(overall), sign_off_date: new Date().toISOString().split('T')[0] }),
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Performance evaluation saved', 'success');
      setPerfForm({ employee_id: '', eval_period_from: '', eval_period_to: '', eval_type: 'Annual', job_knowledge: 3, productivity: 3, quantity_of_work: 3, relationship_with_others: 3, work_habits: 3, attendance: 3, promotability: 3, overall: 3, promotability_status: 'Continued employment', supervisors_overall_comment: '', reviewers_comment: '', employee_acknowledgement: '' });
      setActiveForm('none');
      fetchAppraisals();
    } catch { window.notify?.('Failed to save', 'error'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this appraisal?')) return;
    try { await fetch(`/api/appraisals/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); window.notify?.('Appraisal deleted', 'success'); fetchAppraisals(); } catch { window.notify?.('Failed to delete', 'error'); }
  };

  // Compute average scores for radar chart from real data
  const avgScores: Record<string, number> = { 'Job Knowledge': 0, 'Productivity': 0, 'Attendance': 0 };
  if (appraisals.length > 0) {
    appraisals.forEach(a => { avgScores['Job Knowledge'] += a.job_knowledge || 0; avgScores['Productivity'] += a.productivity || 0; avgScores['Attendance'] += a.attendance || 0; });
    Object.keys(avgScores).forEach(k => { avgScores[k] = parseFloat((avgScores[k] / appraisals.length).toFixed(1)); });
  }
  const radarData = Object.keys(avgScores).map(k => ({ subject: k, A: avgScores[k] || 3, fullMark: 5 }));

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-6">
        <SectionHeader title="Evaluation Portal" subtitle="Formal performance appraisal forms" />
        <div className="flex gap-2">
          <button onClick={() => exportToCSV(appraisals, 'appraisals')} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><Download size={16} /> Export CSV</button>
          <button onClick={() => setActiveForm(activeForm === 'achievement' ? 'none' : 'achievement')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeForm === 'achievement' ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300' : 'bg-teal-deep text-white hover:bg-teal-green'}`}>
            {activeForm === 'achievement' ? <><X size={16} /> Close</> : <><Star size={16} /> Achievement Measure</>}
          </button>
          <button onClick={() => setActiveForm(activeForm === 'performance' ? 'none' : 'performance')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeForm === 'performance' ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300' : 'bg-teal-green text-white hover:bg-teal-deep'}`}>
            {activeForm === 'performance' ? <><X size={16} /> Close</> : <><FileText size={16} /> Performance Evaluation</>}
          </button>
        </div>
      </div>

      {activeForm === 'achievement' && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-6">
          <Card>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">Employee Achievement Measure System</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-4 border-b dark:border-slate-800 pb-3">The purpose of this system is to communicate work expectations, monitor performance, and plan for professional development.</p>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); submitAchievement(); }}>
              {/* Header Fields */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-300 uppercase mb-1">Employee Name</label>
                  <select value={achForm.employee_id} onChange={e => setAchForm({ ...achForm, employee_id: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100">
                    <option value="">Select Employee...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-300 uppercase mb-1">Date</label><input type="date" value={achForm.date} onChange={e => setAchForm({ ...achForm, date: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-300 uppercase mb-1">Promotability</label>
                  <select value={achForm.promotability_status} onChange={e => setAchForm({ ...achForm, promotability_status: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100">
                    <option value="Satisfactory">Satisfactory</option><option value="Recommend Promotion">Recommend Promotion</option><option value="Needs Improvement">Needs Improvement</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-300 uppercase mb-1">Review Period From</label><input type="date" value={achForm.review_period_from} onChange={e => setAchForm({ ...achForm, review_period_from: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-300 uppercase mb-1">Review Period To</label><input type="date" value={achForm.review_period_to} onChange={e => setAchForm({ ...achForm, review_period_to: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
              </div>

              {/* Rating Categories */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Performance Rating</h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">1 = Unsatisfactory, 2 = Below Expectations, 3 = Meets Expectations, 4 = Exceeds Expectations, 5 = Outstanding</p>
                <table className="w-full text-sm">
                  <thead><tr className="border-b dark:border-slate-700">
                    <th className="text-left py-2 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase w-1/3">Category</th>
                    {[1,2,3,4,5].map(n => <th key={n} className="text-center py-2 text-xs font-bold text-slate-500 dark:text-slate-400">{n}</th>)}
                  </tr></thead>
                  <tbody>
                    {[
                      { key: 'job_knowledge', label: 'Job Knowledge' },
                      { key: 'productivity', label: 'Productivity' },
                      { key: 'work_quality', label: 'Work Quality' },
                      { key: 'communication', label: 'Communication / Listening Skills' },
                      { key: 'dependability', label: 'Dependability' },
                      { key: 'attendance', label: 'Attendance' },
                    ].map(({ key, label }) => (
                      <tr key={key} className="border-b dark:border-slate-800">
                        <td className="py-2 text-slate-700 dark:text-slate-300 font-medium">{label}</td>
                        {[1,2,3,4,5].map(n => (
                          <td key={n} className="text-center py-2"><input type="radio" name={`ach-${key}`} checked={(achForm as any)[key] === n} onChange={() => setAchForm({ ...achForm, [key]: n })} /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Employee Goals */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Employee Goals for Next Review Period</h4>
                <textarea rows={3} value={achForm.employee_goals} onChange={e => setAchForm({ ...achForm, employee_goals: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="List specific goals, objectives, and development plans..." />
              </div>

              {/* Additional Comments */}
              <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-300 uppercase mb-1">Additional Comments</label><textarea rows={2} value={achForm.additional_comments} onChange={e => setAchForm({ ...achForm, additional_comments: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>

              <div className="flex justify-end pt-4">
                <button type="submit" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green">Save Achievement Measure</button>
              </div>
            </form>
          </Card>
        </motion.div>
      )}

      {activeForm === 'performance' && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-6">
          <Card>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">Employee Performance Evaluation</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-4 border-b dark:border-slate-800 pb-3">The performance evaluation is designed to foster communication between the supervisor and the employee about the employee's job performance.</p>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); submitPerformance(); }}>
              {/* Header */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employee Name</label>
                  <select value={perfForm.employee_id} onChange={e => setPerfForm({ ...perfForm, employee_id: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100">
                    <option value="">Select Employee...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Type of Evaluation</label>
                  <div className="flex gap-4 mt-2 text-sm text-slate-600 dark:text-slate-300">
                    {['Annual', 'Special', 'Probationary', 'Other'].map(t => (
                      <label key={t} className="flex items-center gap-1"><input type="radio" name="eval_type" checked={perfForm.eval_type === t} onChange={() => setPerfForm({ ...perfForm, eval_type: t })} /> {t}</label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Evaluation Period From</label><input type="date" value={perfForm.eval_period_from} onChange={e => setPerfForm({ ...perfForm, eval_period_from: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Evaluation Period To</label><input type="date" value={perfForm.eval_period_to} onChange={e => setPerfForm({ ...perfForm, eval_period_to: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
              </div>

              {/* Rating Categories */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Performance Categories</h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">1 = Below Standard, 2 = Needs Improvement, 3 = Acceptable, 4 = High Quality, 5 = Exceptional</p>
                <table className="w-full text-sm">
                  <thead><tr className="border-b dark:border-slate-700">
                    <th className="text-left py-2 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase w-2/5">Category</th>
                    {[{ v: 1, l: 'Below' }, { v: 2, l: 'Needs Imp.' }, { v: 3, l: 'Acceptable' }, { v: 4, l: 'High' }, { v: 5, l: 'Exceptional' }].map(({ v, l }) => (
                      <th key={v} className="text-center py-2 text-[10px] font-bold text-slate-400 uppercase">{l}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {[
                      { key: 'productivity', label: 'Productivity (Quality & Quantity of Work)', desc: 'Accuracy, neatness, timeliness, and volume of work produced' },
                      { key: 'quantity_of_work', label: 'Quantity of Work', desc: 'Amount of work produced relative to expectations and peers' },
                      { key: 'job_knowledge', label: 'Job Knowledge', desc: 'Understanding of duties, methods, and procedures of the position' },
                      { key: 'relationship_with_others', label: 'Relationship with Others', desc: 'Cooperation, courtesy, tact in dealing with supervisors, peers, and public' },
                      { key: 'work_habits', label: 'Work Habits', desc: 'Planning, organizing, safety awareness, use of time and materials' },
                      { key: 'attendance', label: 'Attendance & Punctuality', desc: 'Regularity and consistency in attendance and reporting times' },
                      { key: 'promotability', label: 'Promotability', desc: 'Potential and readiness for increased responsibility and advancement' },
                    ].map(({ key, label, desc }) => (
                      <tr key={key} className="border-b dark:border-slate-800">
                        <td className="py-3">
                          <span className="text-slate-700 dark:text-slate-300 font-medium">{label}</span>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{desc}</p>
                        </td>
                        {[1,2,3,4,5].map(n => (
                          <td key={n} className="text-center py-3"><input type="radio" name={`perf-${key}`} checked={(perfForm as any)[key] === n} onChange={() => setPerfForm({ ...perfForm, [key]: n })} /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Recommendation */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Supervisor's Overall Recommendation</label>
                  <select value={perfForm.promotability_status} onChange={e => setPerfForm({ ...perfForm, promotability_status: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100">
                    <option value="Continued employment">Continued employment</option>
                    <option value="Recommend Promotion">Recommend for Promotion</option>
                    <option value="PIP Required">Require Performance Improvement Plan</option>
                    <option value="Probation Extension">Probation Extension</option>
                    <option value="Termination Recommended">Termination Recommended</option>
                  </select>
                </div>
              </div>

              {/* Comments sections */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-4">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest">Comments</h4>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Supervisor's Overall Comments</label><textarea rows={2} value={perfForm.supervisors_overall_comment} onChange={e => setPerfForm({ ...perfForm, supervisors_overall_comment: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="Summarize the employee's overall performance..." /></div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Reviewer's Comments</label><textarea rows={2} value={perfForm.reviewers_comment} onChange={e => setPerfForm({ ...perfForm, reviewers_comment: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="Next-level reviewer comments..." /></div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employee Acknowledgement</label><textarea rows={2} value={perfForm.employee_acknowledgement} onChange={e => setPerfForm({ ...perfForm, employee_acknowledgement: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="I acknowledge that I have reviewed this evaluation..." /></div>
              </div>

              <div className="flex justify-end pt-4">
                <button type="submit" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green">Submit Evaluation</button>
              </div>
            </form>
          </Card>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <h3 className="text-sm font-bold text-slate-500 uppercase mb-3">Team Performance Average</h3>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                <PolarGrid stroke="var(--chart-grid)" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} />
                <PolarRadiusAxis angle={30} domain={[0, 5]} tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} />
                <Radar name="Team Average" dataKey="A" stroke="#0f766e" fill="#14b8a6" fillOpacity={0.5} />
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
                  <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Knowledge</th>
                  <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Productivity</th>
                  <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Attendance</th>
                  <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Overall</th>
                  <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="pb-2"></th>
                </tr></thead>
                <tbody>
                  {appraisals.map(a => (
                    <tr key={a.id} className="border-b border-slate-50 dark:border-slate-800/50">
                      <td className="py-3 font-medium text-slate-700 dark:text-slate-200">{a.employee_name || `#${a.employee_id}`}</td>
                      <td className="py-3 text-slate-600 dark:text-slate-300">{a.job_knowledge}/5</td>
                      <td className="py-3 text-slate-600 dark:text-slate-300">{a.productivity}/5</td>
                      <td className="py-3 text-slate-600 dark:text-slate-300">{a.attendance}/5</td>
                      <td className="py-3 font-bold text-teal-green">{a.overall}</td>
                      <td className="py-3"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{a.promotability_status}</span></td>
                      <td className="py-3"><button onClick={() => handleDelete(a.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                  {appraisals.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-slate-400">No appraisals recorded yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </motion.div>
  );
};
