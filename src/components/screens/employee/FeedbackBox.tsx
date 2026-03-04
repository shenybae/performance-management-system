import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { SearchableSelect } from '../../common/SearchableSelect';
import { Plus, X, Download, Trash2, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';
import { Employee } from '../../../types';

interface FeedbackBoxProps {
  employees?: Employee[];
}

export const FeedbackBox = ({ employees = [] }: FeedbackBoxProps) => {
  const [showForm, setShowForm] = useState(false);
  const [feedback360, setFeedback360] = useState<any[]>([]);
  const user = JSON.parse(localStorage.getItem('talentflow_user') || localStorage.getItem('user') || '{}');

  const [fbForm, setFbForm] = useState({
    target_employee_name: '', relationship: '',
    job_knowledge: 0, work_quality: 0, attendance: 0, productivity: 0, communication: 0, dependability: 0,
    strengths: '', improvements: ''
  });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try { const r = await fetch('/api/feedback_360', { headers: getAuthHeaders() }); const d = await r.json(); setFeedback360(Array.isArray(d) ? d : []); } catch { setFeedback360([]); }
  };

  const submitFeedback = async () => {
    if (!fbForm.target_employee_name.trim()) { window.notify?.('Please enter employee name', 'error'); return; }
    try {
      const res = await fetch('/api/feedback_360', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ ...fbForm, evaluator_id: user.employee_id || user.id }) });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('360 Feedback submitted', 'success');
      setFbForm({ target_employee_name: '', relationship: '', job_knowledge: 0, work_quality: 0, attendance: 0, productivity: 0, communication: 0, dependability: 0, strengths: '', improvements: '' });
      setShowForm(false); fetchData();
    } catch { window.notify?.('Failed to submit', 'error'); }
  };

  const deleteFeedback = async (id: number) => {
    if (!confirm('Delete?')) return;
    try { await fetch(`/api/feedback_360/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); window.notify?.('Deleted', 'success'); fetchData(); } catch { window.notify?.('Failed', 'error'); }
  };

  const avgScores = feedback360.length > 0 ? [
    { subject: 'Job Knowledge', avg: +(feedback360.reduce((a: number, b: any) => a + (b.job_knowledge || 0), 0) / feedback360.length).toFixed(1) },
    { subject: 'Work Quality', avg: +(feedback360.reduce((a: number, b: any) => a + (b.work_quality || 0), 0) / feedback360.length).toFixed(1) },
    { subject: 'Attendance', avg: +(feedback360.reduce((a: number, b: any) => a + (b.attendance || 0), 0) / feedback360.length).toFixed(1) },
    { subject: 'Productivity', avg: +(feedback360.reduce((a: number, b: any) => a + (b.productivity || 0), 0) / feedback360.length).toFixed(1) },
    { subject: 'Communication', avg: +(feedback360.reduce((a: number, b: any) => a + (b.communication || 0), 0) / feedback360.length).toFixed(1) },
    { subject: 'Dependability', avg: +(feedback360.reduce((a: number, b: any) => a + (b.dependability || 0), 0) / feedback360.length).toFixed(1) },
  ] : [];

  const ScoreSelect = ({ label, field, form, setFn }: any) => (
    <div>
      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">{label}</label>
      <select value={form[field]} onChange={e => setFn({ ...form, [field]: parseInt(e.target.value) })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100">
        <option value={0} disabled>— Select Rating —</option>
        {[5, 4, 3, 2, 1].map(v => <option key={v} value={v}>{v}</option>)}
      </select>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-4">
        <SectionHeader title="360° Feedback" subtitle="Provide confidential feedback for peers and supervisors" />
        <div className="flex gap-2">
          <button onClick={() => exportToCSV(feedback360, 'feedback_360')} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><Download size={16} /> CSV</button>
          <button onClick={() => setShowForm(!showForm)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${showForm ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300' : 'bg-teal-deep text-white hover:bg-teal-green'}`}>
            {showForm ? <><X size={16} /> Close</> : <><Users size={16} /> New Feedback</>}
          </button>
        </div>
      </div>

      {showForm && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4">
          <Card>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 border-b dark:border-slate-800 pb-2">360° Feedback Form</h3>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); submitFeedback(); }}>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employee Being Evaluated</label>
                  {employees.length > 0 ? (
                    <SearchableSelect
                      options={employees.map(e => ({ value: e.name, label: e.name }))}
                      value={fbForm.target_employee_name}
                      onChange={v => setFbForm({ ...fbForm, target_employee_name: v })}
                      placeholder="Select Employee..."
                    />
                  ) : (
                    <input type="text" value={fbForm.target_employee_name} onChange={e => setFbForm({ ...fbForm, target_employee_name: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                  )}
                </div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Relationship</label><select value={fbForm.relationship} onChange={e => setFbForm({ ...fbForm, relationship: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100"><option value="">Select Relationship...</option><option>Peer</option><option>Supervisor</option><option>Subordinate</option><option>Self</option></select></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <ScoreSelect label="Job Knowledge" field="job_knowledge" form={fbForm} setFn={setFbForm} />
                <ScoreSelect label="Work Quality" field="work_quality" form={fbForm} setFn={setFbForm} />
                <ScoreSelect label="Attendance" field="attendance" form={fbForm} setFn={setFbForm} />
                <ScoreSelect label="Productivity" field="productivity" form={fbForm} setFn={setFbForm} />
                <ScoreSelect label="Communication" field="communication" form={fbForm} setFn={setFbForm} />
                <ScoreSelect label="Dependability" field="dependability" form={fbForm} setFn={setFbForm} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Strengths</label><textarea rows={2} value={fbForm.strengths} onChange={e => setFbForm({ ...fbForm, strengths: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Areas for Improvement</label><textarea rows={2} value={fbForm.improvements} onChange={e => setFbForm({ ...fbForm, improvements: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
              </div>
              <div className="flex justify-end"><button type="submit" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green">Submit Feedback</button></div>
            </form>
          </Card>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {avgScores.length > 0 && (
          <Card>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">Avg 360 Scores</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={avgScores} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 5]} />
                  <YAxis dataKey="subject" type="category" width={90} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="avg" fill="#0f766e" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}
        <div className={avgScores.length > 0 ? 'md:col-span-2' : 'md:col-span-3'}>
          <Card>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">360° Feedback Records ({feedback360.length})</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left"><thead><tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase">Employee</th>
                <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase">Relationship</th>
                <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase">Knowledge</th>
                <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase">Quality</th>
                <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase">Communication</th>
                <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase">Strengths</th>
                <th className="pb-3"></th></tr></thead>
                <tbody>{feedback360.map(f => (
                  <tr key={f.id} className="border-b border-slate-50 dark:border-slate-800/50">
                    <td className="py-3 font-medium text-slate-700 dark:text-slate-200">{f.target_employee_name}</td>
                    <td className="py-3 text-sm text-slate-500">{f.relationship}</td>
                    <td className="py-3 text-sm font-bold text-slate-700 dark:text-slate-200">{f.job_knowledge}</td>
                    <td className="py-3 text-sm font-bold text-slate-700 dark:text-slate-200">{f.work_quality}</td>
                    <td className="py-3 text-sm font-bold text-slate-700 dark:text-slate-200">{f.communication}</td>
                    <td className="py-3 text-xs text-slate-500 max-w-[200px] truncate">{f.strengths}</td>
                    <td className="py-3"><button onClick={() => deleteFeedback(f.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button></td>
                  </tr>
                ))}</tbody>
              </table>
              {feedback360.length === 0 && <p className="text-center text-sm text-slate-400 py-6">No feedback records yet</p>}
            </div>
          </Card>
        </div>
      </div>
    </motion.div>
  );
};
