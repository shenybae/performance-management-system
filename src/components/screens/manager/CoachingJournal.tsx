import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, MessageSquare, Plus, X, Download, Trash2 } from 'lucide-react';
import { Employee } from '../../../types';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';

interface CoachingJournalProps {
  employees: Employee[];
}

export const CoachingJournal = ({ employees }: CoachingJournalProps) => {
  const [showForm, setShowForm] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [form, setForm] = useState({ employee_id: '', category: 'achievement', notes: '', is_positive: true, logged_by: '' });

  useEffect(() => { fetchLogs(); }, []);

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/coaching_logs', { headers: getAuthHeaders() });
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch { setLogs([]); }
  };

  const handleSubmit = async () => {
    if (!form.employee_id || !form.notes) { window.notify?.('Please select employee and add notes', 'error'); return; }
    try {
      const user = JSON.parse(localStorage.getItem('talentflow_user') || '{}');
      const res = await fetch('/api/coaching_logs', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ ...form, employee_id: parseInt(form.employee_id), is_positive: form.is_positive ? 1 : 0, logged_by: form.logged_by || user.username || 'Manager' }),
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Coaching entry saved', 'success');
      setForm({ employee_id: '', category: 'achievement', notes: '', is_positive: true, logged_by: '' });
      setShowForm(false);
      fetchLogs();
    } catch { window.notify?.('Failed to save entry', 'error'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this log entry?')) return;
    try { await fetch(`/api/coaching_logs/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); window.notify?.('Entry deleted', 'success'); fetchLogs(); } catch { window.notify?.('Failed to delete', 'error'); }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-4">
        <SectionHeader title="Monitoring & Coaching Journal" subtitle="Daily observations and feedback loop" />
        <div className="flex gap-2">
          <button onClick={() => exportToCSV(logs, 'coaching_logs')} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><Download size={16} /> Export CSV</button>
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 bg-teal-deep text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-teal-green transition-colors">
            {showForm ? <><X size={16} /> Close Form</> : <><Plus size={16} /> Add Entry</>}
          </button>
        </div>
      </div>

      {showForm && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4">
          <Card>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 border-b dark:border-slate-800 pb-2">New Coaching Journal Entry</h3>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); handleSubmit(); }}>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employee</label>
                  <select value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100">
                    <option value="">Select Employee...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Category</label>
                  <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100">
                    <option value="achievement">Achievement / Positive Behavior</option>
                    <option value="intervention">Intervention / Area for Improvement</option>
                    <option value="coaching">Coaching Session</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Type</label>
                <div className="flex gap-4 dark:text-slate-300">
                  <label className="flex items-center gap-2 text-sm"><input type="radio" name="type" checked={form.is_positive} onChange={() => setForm({ ...form, is_positive: true })} /> Positive</label>
                  <label className="flex items-center gap-2 text-sm"><input type="radio" name="type" checked={!form.is_positive} onChange={() => setForm({ ...form, is_positive: false })} /> Constructive</label>
                </div>
              </div>
              <div className="pt-4 border-t dark:border-slate-800">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Observation / Notes</label>
                <textarea rows={4} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="Describe the specific behavior or event..."></textarea>
              </div>
              <div className="flex justify-end pt-4">
                <button type="submit" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green">Save Entry</button>
              </div>
            </form>
          </Card>
        </motion.div>
      )}

      <Card>
        <div className="space-y-6">
          {logs.map((l: any) => (
            <div key={l.id} className="flex gap-4 relative">
              <div className="flex flex-col items-center">
                <div className={`p-2 rounded-full ${l.is_positive ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'}`}>
                  {l.is_positive ? <TrendingUp size={16} /> : <MessageSquare size={16} />}
                </div>
                <div className="w-px h-full bg-slate-100 dark:bg-slate-800 mt-2"></div>
              </div>
              <div className="pb-6 flex-1">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 dark:text-slate-100">{l.employee_name || `Employee #${l.employee_id}`}</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">{l.created_at ? new Date(l.created_at).toLocaleDateString() : ''}</span>
                  </div>
                  <button onClick={() => handleDelete(l.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
                </div>
                <p className="text-xs font-bold text-teal-green uppercase tracking-widest mb-1">{l.category}</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">{l.notes}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 italic">Logged by: {l.logged_by}</p>
              </div>
            </div>
          ))}
          {logs.length === 0 && <p className="text-center text-slate-400 py-10">No coaching logs found.</p>}
        </div>
      </Card>
    </motion.div>
  );
};
