import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { Plus, X, Download, Trash2, CheckCircle, AlertTriangle } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';

export const IDP = () => {
  const [showForm, setShowForm] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);
  const [pips, setPips] = useState<any[]>([]);
  const [form, setForm] = useState({ skill_gap: '', growth_step: '', status: '' });
  const user = JSON.parse(localStorage.getItem('talentflow_user') || localStorage.getItem('user') || '{}');

  useEffect(() => { fetchPlans(); }, []);

  const fetchPlans = async () => {
    try {
      const res = await fetch('/api/development_plans', { headers: getAuthHeaders() });
      const data = await res.json();
      const mine = Array.isArray(data) ? data.filter((p: any) => p.employee_id === (user.employee_id || user.id) || user.role === 'HR' || user.role === 'Manager') : [];
      setPlans(mine);
    } catch { setPlans([]); }
    try {
      const pipRes = await fetch('/api/pip_plans', { headers: getAuthHeaders() });
      const pipData = await pipRes.json();
      const myPips = Array.isArray(pipData) ? pipData.filter((p: any) => p.employee_id === (user.employee_id || user.id)) : [];
      setPips(myPips);
    } catch { setPips([]); }
  };

  const submitPlan = async () => {
    if (!form.skill_gap.trim() || !form.growth_step.trim()) { window.notify?.('Please fill in both fields', 'error'); return; }
    try {
      const res = await fetch('/api/development_plans', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ ...form, employee_id: user.employee_id || user.id, step_order: plans.length + 1 }) });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Development plan added', 'success');
      setForm({ skill_gap: '', growth_step: '', status: '' });
      setShowForm(false); fetchPlans();
    } catch { window.notify?.('Failed to create', 'error'); }
  };

  const deletePlan = async (id: number) => {
    if (!confirm('Delete this plan?')) return;
    try { await fetch(`/api/development_plans/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); window.notify?.('Deleted', 'success'); fetchPlans(); } catch { window.notify?.('Failed', 'error'); }
  };

  const updateStatus = async (id: number, status: string) => {
    try { await fetch(`/api/development_plans/${id}`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify({ status }) }); window.notify?.('Status updated', 'success'); fetchPlans(); } catch { window.notify?.('Failed', 'error'); }
  };

  const statusCounts = plans.reduce((acc: any, p: any) => { const s = p.status || 'Not Started'; acc[s] = (acc[s] || 0) + 1; return acc; }, {});
  const pieData = Object.keys(statusCounts).map(k => ({ name: k, value: statusCounts[k] }));
  const COLORS: Record<string, string> = { 'Not Started': '#94a3b8', 'In Progress': '#f59e0b', 'Completed': '#10b981' };

  const skillCounts = plans.reduce((acc: any, p: any) => { const s = p.skill_gap || 'Other'; acc[s] = (acc[s] || 0) + 1; return acc; }, {});
  const barData = Object.keys(skillCounts).map(k => ({ skill: k, count: skillCounts[k] }));

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-4">
        <SectionHeader title="Individual Development Plan" subtitle="Track your skill gaps and growth steps" />
        <div className="flex gap-2">
          <button onClick={() => exportToCSV(plans, 'development_plans')} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><Download size={16} /> CSV</button>
          <button onClick={() => setShowForm(!showForm)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${showForm ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300' : 'bg-teal-deep text-white hover:bg-teal-green'}`}>
            {showForm ? <><X size={16} /> Close</> : <><Plus size={16} /> Add Plan</>}
          </button>
        </div>
      </div>

      {showForm && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4">
          <Card>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 border-b dark:border-slate-800 pb-2">New Development Plan Entry</h3>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); submitPlan(); }}>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Skill Gap</label><input type="text" value={form.skill_gap} onChange={e => setForm({ ...form, skill_gap: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="e.g. Leadership, Communication..." /></div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Growth Step</label><input type="text" value={form.growth_step} onChange={e => setForm({ ...form, growth_step: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="Action to take..." /></div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Status</label><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100"><option value="">Select Status...</option><option>Not Started</option><option>In Progress</option><option>Completed</option></select></div>
              </div>
              <div className="flex justify-end"><button type="submit" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green">Add Plan</button></div>
            </form>
          </Card>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Card>
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">Plan Status</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={5} dataKey="value">
                {pieData.map((entry) => (<Cell key={entry.name} fill={COLORS[entry.name] || '#94a3b8'} />))}
              </Pie><Tooltip /></PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 mt-2 justify-center">{pieData.map(d => (<span key={d.name} className="flex items-center gap-1 text-[10px] font-bold text-slate-500"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[d.name] || '#94a3b8' }}></span>{d.name} ({d.value})</span>))}</div>
        </Card>
        <div className="md:col-span-2">
          <Card>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">Skill Gap Focus Areas</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="skill" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#0f766e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">Development Plans ({plans.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left"><thead><tr className="border-b border-slate-100 dark:border-slate-800">
            <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">#</th>
            <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Skill Gap</th>
            <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Growth Step</th>
            <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
            <th className="pb-3"></th></tr></thead>
            <tbody>{plans.map((p, i) => (
                <tr key={p.id} className="border-b border-slate-50 dark:border-slate-800/50">
                <td className="py-3 text-sm text-slate-400">{i + 1}</td>
                <td className="py-3 font-medium text-slate-700 dark:text-slate-200">
                  <div className="min-w-0"><span className="truncate max-w-[260px]" title={p.skill_gap}>{p.skill_gap}</span></div>
                </td>
                <td className="py-3 text-sm text-slate-500 dark:text-slate-400">
                  <div className="min-w-0"><span className="truncate max-w-[260px]" title={p.growth_step}>{p.growth_step}</span></div>
                </td>
                <td className="py-3">
                  <select value={p.status} onChange={e => updateStatus(p.id, e.target.value)} className="text-xs font-bold uppercase px-2 py-1 rounded-lg border-0 bg-slate-50 dark:bg-slate-800 dark:text-slate-200" style={{ color: p.status === 'Completed' ? '#10b981' : p.status === 'In Progress' ? '#f59e0b' : '#94a3b8' }}>
                    <option>Not Started</option><option>In Progress</option><option>Completed</option>
                  </select>
                </td>
                <td className="py-3 flex gap-2">
                  {p.status !== 'Completed' && <button onClick={() => updateStatus(p.id, 'Completed')} className="text-emerald-400 hover:text-emerald-600"><CheckCircle size={14} /></button>}
                  <button onClick={() => deletePlan(p.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {plans.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-400">No development plans yet. Click "Add Plan" to create one.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {pips.length > 0 && (
        <Card className="mt-4">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} className="text-amber-500" />
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase">Performance Improvement Plans ({pips.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Start Date</th>
                  <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">End Date</th>
                  <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Deficiency</th>
                  <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Improvement Objective</th>
                  <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {pips.map(p => (
                  <tr key={p.id} className="border-b border-slate-50 dark:border-slate-800/50">
                    <td className="py-3 text-slate-600 dark:text-slate-400">{p.start_date || '—'}</td>
                    <td className="py-3 text-slate-600 dark:text-slate-400">{p.end_date || '—'}</td>
                    <td className="py-3 text-slate-700 dark:text-slate-300 max-w-xs">
                      <div className="truncate" title={p.deficiency}>{p.deficiency || '—'}</div>
                    </td>
                    <td className="py-3 text-slate-700 dark:text-slate-300 max-w-xs">
                      <div className="truncate" title={p.improvement_objective}>{p.improvement_objective || '—'}</div>
                    </td>
                    <td className="py-3">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${p.outcome === 'Completed' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700' : p.outcome === 'Terminated' ? 'bg-red-100 dark:bg-red-900/30 text-red-700' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700'}`}>
                        {p.outcome || 'In Progress'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </motion.div>
  );
};
