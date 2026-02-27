import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Plus, X, Download, Trash2 } from 'lucide-react';
import { Employee } from '../../../types';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';

interface OKRPlannerProps {
  employees: Employee[];
}

export const OKRPlanner = ({ employees }: OKRPlannerProps) => {
  const [goals, setGoals] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ employee_id: '', statement: '', metric: '', target_date: '' });

  useEffect(() => { fetchGoals(); }, []);

  const fetchGoals = async () => {
    try {
      const res = await fetch('/api/goals', { headers: getAuthHeaders() });
      const data = await res.json();
      setGoals(Array.isArray(data) ? data : []);
    } catch { setGoals([]); }
  };

  const handleSubmit = async () => {
    if (!form.employee_id || !form.statement) { window.notify?.('Please select employee and enter goal statement', 'error'); return; }
    try {
      const res = await fetch('/api/goals', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ ...form, employee_id: parseInt(form.employee_id) }),
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Goal created successfully', 'success');
      setForm({ employee_id: '', statement: '', metric: '', target_date: '' });
      setShowForm(false);
      fetchGoals();
    } catch { window.notify?.('Failed to create goal', 'error'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this goal?')) return;
    try { await fetch(`/api/goals/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); window.notify?.('Goal deleted', 'success'); fetchGoals(); } catch { window.notify?.('Failed to delete', 'error'); }
  };

  // Group goals by employee
  const goalsByEmployee: Record<number, any[]> = {};
  goals.forEach(g => {
    const eid = g.employee_id;
    if (!goalsByEmployee[eid]) goalsByEmployee[eid] = [];
    goalsByEmployee[eid].push(g);
  });

  const chartData = employees.map(emp => ({
    name: emp.name.split(' ')[0],
    goals: (goalsByEmployee[emp.id] || []).length,
  }));

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-4">
        <SectionHeader title="Target & OKR Planner" subtitle="Define success indicators and metrics" />
        <div className="flex gap-2">
          <button onClick={() => exportToCSV(goals, 'goals')} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><Download size={16} /> Export CSV</button>
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 bg-teal-deep text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-teal-green transition-colors">
            {showForm ? <><X size={16} /> Close</> : <><Plus size={16} /> Add Goal</>}
          </button>
        </div>
      </div>

      {showForm && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4">
          <Card>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 border-b dark:border-slate-800 pb-2">New Goal / OKR</h3>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); handleSubmit(); }}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employee</label>
                  <select value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100">
                    <option value="">Select Employee...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Target Date</label>
                  <input type="date" value={form.target_date} onChange={e => setForm({ ...form, target_date: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Goal Statement</label>
                <textarea rows={2} value={form.statement} onChange={e => setForm({ ...form, statement: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="e.g. Increase customer satisfaction by 20%"></textarea>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Key Metric</label>
                <input type="text" value={form.metric} onChange={e => setForm({ ...form, metric: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="e.g. NPS Score" />
              </div>
              <div className="flex justify-end pt-4">
                <button type="submit" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green">Create Goal</button>
              </div>
            </form>
          </Card>
        </motion.div>
      )}

      <div className="mb-4">
        <Card>
          <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">Goals per Employee</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="goals" fill="#0f766e" name="Goals" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {employees.map(emp => {
          const empGoals = goalsByEmployee[emp.id] || [];
          return (
            <Card key={emp.id}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-100">{emp.name}</h3>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-bold">{emp.position}</p>
                </div>
                <button onClick={() => { setForm({ ...form, employee_id: String(emp.id) }); setShowForm(true); }} className="text-teal-green hover:bg-teal-green/10 p-1.5 rounded-lg transition-colors"><Plus size={18} /></button>
              </div>
              <div className="space-y-3">
                {empGoals.map((g: any) => (
                  <div key={g.id} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                    <div className="flex justify-between items-start">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300 flex-1">{g.statement}</p>
                      <button onClick={() => handleDelete(g.id)} className="text-red-400 hover:text-red-600 p-1 ml-2"><Trash2 size={14} /></button>
                    </div>
                    <div className="flex justify-between mt-2 text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 tracking-widest">
                      <span>Metric: {g.metric || 'N/A'}</span>
                      <span>Due: {g.target_date || 'N/A'}</span>
                    </div>
                  </div>
                ))}
                {empGoals.length === 0 && <p className="text-xs text-slate-400 italic">No goals defined for this period.</p>}
              </div>
            </Card>
          );
        })}
      </div>
    </motion.div>
  );
};
