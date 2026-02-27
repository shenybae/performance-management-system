import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { Download, Trash2 } from 'lucide-react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';

const scoreLabels: Record<number, string> = { 5: 'Outstanding', 4: 'Exceeds', 3: 'Meets', 2: 'Below', 1: 'Poor' };

export const SelfAssessment = () => {
  const [assessments, setAssessments] = useState<any[]>([]);
  const [form, setForm] = useState({
    achievements: '',
    job_knowledge: 3,
    productivity: 3,
    attendance: 3,
    communication: 3,
    dependability: 3
  });

  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => { fetchAssessments(); }, []);

  const fetchAssessments = async () => {
    try {
      const res = await fetch('/api/self_assessments', { headers: getAuthHeaders() });
      const data = await res.json();
      const mine = Array.isArray(data) ? data.filter((a: any) => a.employee_id === user.employee_id || !user.employee_id) : [];
      setAssessments(mine);
    } catch { setAssessments([]); }
  };

  const submitAssessment = async () => {
    if (!form.achievements.trim()) { window.notify?.('Please enter your achievements', 'error'); return; }
    try {
      const res = await fetch('/api/self_assessments', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...form, employee_id: user.employee_id || user.id })
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Self assessment submitted', 'success');
      setForm({ achievements: '', job_knowledge: 3, productivity: 3, attendance: 3, communication: 3, dependability: 3 });
      fetchAssessments();
    } catch { window.notify?.('Failed to submit', 'error'); }
  };

  const deleteAssessment = async (id: number) => {
    if (!confirm('Delete this assessment?')) return;
    try { await fetch(`/api/self_assessments/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); window.notify?.('Deleted', 'success'); fetchAssessments(); } catch { window.notify?.('Failed', 'error'); }
  };

  const radarData = [
    { subject: 'Job Knowledge', value: form.job_knowledge },
    { subject: 'Productivity', value: form.productivity },
    { subject: 'Attendance', value: form.attendance },
    { subject: 'Communication', value: form.communication },
    { subject: 'Dependability', value: form.dependability },
  ];

  const SelectScore = ({ label, field }: { label: string; field: string }) => (
    <div>
      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">{label}</label>
      <select value={(form as any)[field]} onChange={e => setForm({ ...form, [field]: parseInt(e.target.value) })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100">
        {[5, 4, 3, 2, 1].map(v => <option key={v} value={v}>{v} — {scoreLabels[v]}</option>)}
      </select>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-4">
        <SectionHeader title="Self Assessment" subtitle="Evaluate your own performance" />
        <button onClick={() => exportToCSV(assessments, 'self_assessments')} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><Download size={16} /> CSV</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Card>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 border-b dark:border-slate-800 pb-2">New Self Assessment</h3>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); submitAssessment(); }}>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Key Achievements</label>
              <textarea rows={3} value={form.achievements} onChange={e => setForm({ ...form, achievements: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="Describe your key accomplishments..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <SelectScore label="Job Knowledge" field="job_knowledge" />
              <SelectScore label="Productivity" field="productivity" />
              <SelectScore label="Attendance" field="attendance" />
              <SelectScore label="Communication" field="communication" />
              <SelectScore label="Dependability" field="dependability" />
            </div>
            <div className="flex justify-end"><button type="submit" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green">Submit Assessment</button></div>
          </form>
        </Card>
        <Card>
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">Current Scores Preview</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <PolarRadiusAxis domain={[0, 5]} tickCount={6} tick={{ fontSize: 9 }} />
                <Radar name="Self Score" dataKey="value" stroke="#0f766e" fill="#14b8a6" fillOpacity={0.3} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {assessments.length > 0 && (
        <Card>
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">Assessment History ({assessments.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left"><thead><tr className="border-b border-slate-100 dark:border-slate-800">
              <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date</th>
              <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Knowledge</th>
              <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Productivity</th>
              <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Attendance</th>
              <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Communication</th>
              <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dependability</th>
              <th className="pb-3"></th></tr></thead>
              <tbody>{assessments.map(a => (
                <tr key={a.id} className="border-b border-slate-50 dark:border-slate-800/50">
                  <td className="py-3 text-sm text-slate-500 dark:text-slate-400">{new Date(a.created_at).toLocaleDateString()}</td>
                  <td className="py-3 text-sm font-bold text-slate-700 dark:text-slate-200">{a.job_knowledge}</td>
                  <td className="py-3 text-sm font-bold text-slate-700 dark:text-slate-200">{a.productivity}</td>
                  <td className="py-3 text-sm font-bold text-slate-700 dark:text-slate-200">{a.attendance}</td>
                  <td className="py-3 text-sm font-bold text-slate-700 dark:text-slate-200">{a.communication}</td>
                  <td className="py-3 text-sm font-bold text-slate-700 dark:text-slate-200">{a.dependability}</td>
                  <td className="py-3"><button onClick={() => deleteAssessment(a.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
      )}
    </motion.div>
  );
};
