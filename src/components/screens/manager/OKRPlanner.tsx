import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, X, Download, Trash2, ChevronDown, ChevronUp, Search, AlertTriangle, Target, Users, User, Building2, TrendingDown, Printer, Check, ArrowLeft } from 'lucide-react';
import { Employee } from '../../../types';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { SearchableSelect } from '../../common/SearchableSelect';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend } from 'recharts';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';

const DEPARTMENTS = ['Accounting/Financing', 'Sales Admin', 'Marketing', 'Pre-Technical', 'Post-Technical', 'Executives'] as const;
const SCOPES = ['Department', 'Team', 'Individual'] as const;
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'] as const;
const STATUSES = ['Not Started', 'In Progress', 'At Risk', 'Completed', 'Cancelled'] as const;
const QUARTERS = ['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026'] as const;
const COLORS = ['#0f766e', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

interface OKRPlannerProps {
  employees: Employee[];
}

export const OKRPlanner = ({ employees }: OKRPlannerProps) => {
  const [goals, setGoals] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'Department' | 'Team' | 'Individual'>('Department');
  const [filterDept, setFilterDept] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedGoal, setExpandedGoal] = useState<number | null>(null);
  const [showUnderperforming, setShowUnderperforming] = useState(false);
  const [form, setForm] = useState({
    employee_id: '', title: '', statement: '', metric: '', target_date: '',
    status: '', progress: 0, scope: '' as string,
    department: '', team_name: '', delegation: '', priority: '', quarter: ''
  });

  const defaultForm = {
    employee_id: '', title: '', statement: '', metric: '', target_date: '',
    status: '', progress: 0, scope: '' as string,
    department: '', team_name: '', delegation: '', priority: '', quarter: ''
  };

  useEffect(() => { fetchGoals(); }, []);

  const fetchGoals = async () => {
    try {
      const res = await fetch('/api/goals', { headers: getAuthHeaders() });
      const data = await res.json();
      setGoals(Array.isArray(data) ? data : []);
    } catch { setGoals([]); }
  };

  const handleSubmit = async () => {
    if (!form.statement) { window.notify?.('Please enter a goal statement', 'error'); return; }
    if (form.scope === 'Individual' && !form.employee_id) { window.notify?.('Please select an employee for individual goals', 'error'); return; }
    if (form.scope === 'Department' && !form.department) { window.notify?.('Please select a department', 'error'); return; }
    try {
      const res = await fetch('/api/goals', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ ...form, employee_id: form.employee_id ? parseInt(form.employee_id) : null, progress: Number(form.progress) }),
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Goal created successfully', 'success');
      setForm({ ...defaultForm });
      setShowForm(false);
      fetchGoals();
    } catch { window.notify?.('Failed to create goal', 'error'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this goal?')) return;
    try { await fetch(`/api/goals/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); window.notify?.('Goal deleted', 'success'); fetchGoals(); } catch { window.notify?.('Failed to delete', 'error'); }
  };

  const updateGoal = async (id: number, updates: Record<string, any>) => {
    try {
      const res = await fetch(`/api/goals/${id}`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify(updates) });
      if (res.ok) { window.notify?.('Goal updated', 'success'); fetchGoals(); }
    } catch { window.notify?.('Failed to update goal', 'error'); }
  };

  const statusColor = (s: string) => {
    if (s === 'Completed') return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800';
    if (s === 'In Progress') return 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800';
    if (s === 'At Risk') return 'text-red-600 bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800';
    if (s === 'Cancelled') return 'text-slate-400 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
    return 'text-slate-500 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
  };

  const priorityColor = (p: string) => {
    if (p === 'Critical') return 'text-red-700 bg-red-100 dark:bg-red-900/40';
    if (p === 'High') return 'text-orange-700 bg-orange-100 dark:bg-orange-900/40';
    if (p === 'Medium') return 'text-blue-700 bg-blue-100 dark:bg-blue-900/40';
    return 'text-slate-500 bg-slate-100 dark:bg-slate-800';
  };

  // Filtered goals
  const filtered = useMemo(() => {
    return goals.filter(g => {
      const scope = g.scope || 'Individual';
      if (scope !== activeTab) return false;
      if (filterDept !== 'All' && g.department !== filterDept) return false;
      if (filterStatus !== 'All' && g.status !== filterStatus) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return (g.title || '').toLowerCase().includes(q) || (g.statement || '').toLowerCase().includes(q) ||
          (g.employee_name || '').toLowerCase().includes(q) || (g.department || '').toLowerCase().includes(q) ||
          (g.team_name || '').toLowerCase().includes(q) || (g.delegation || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [goals, activeTab, filterDept, filterStatus, searchTerm]);

  // Underperforming metrics
  const underperforming = useMemo(() => {
    const now = new Date();
    return goals.filter(g => {
      if (g.status === 'Completed' || g.status === 'Cancelled') return false;
      const progress = g.progress || 0;
      if (g.status === 'At Risk') return true;
      if (g.target_date && new Date(g.target_date) < now && progress < 100) return true;
      if ((g.priority === 'Critical' || g.priority === 'High') && progress < 25 && g.target_date) {
        const created = new Date(g.created_at || now);
        const due = new Date(g.target_date);
        const total = due.getTime() - created.getTime();
        const elapsed = now.getTime() - created.getTime();
        if (total > 0 && elapsed / total > 0.5) return true;
      }
      if (progress < 10 && g.status === 'In Progress') return true;
      return false;
    });
  }, [goals]);

  // Stats
  const stats = useMemo(() => {
    const total = goals.length;
    const completed = goals.filter(g => g.status === 'Completed').length;
    const atRisk = goals.filter(g => g.status === 'At Risk').length;
    const avgProgress = total > 0 ? Math.round(goals.reduce((s, g) => s + (g.progress || 0), 0) / total) : 0;
    const byDept: Record<string, { total: number; completed: number; avgProg: number }> = {};
    DEPARTMENTS.forEach(d => { byDept[d] = { total: 0, completed: 0, avgProg: 0 }; });
    goals.forEach(g => {
      const dept = g.department;
      if (dept && byDept[dept]) {
        byDept[dept].total++;
        if (g.status === 'Completed') byDept[dept].completed++;
        byDept[dept].avgProg += (g.progress || 0);
      }
    });
    Object.values(byDept).forEach(v => { if (v.total > 0) v.avgProg = Math.round(v.avgProg / v.total); });
    return { total, completed, atRisk, avgProgress, byDept, underperformingCount: underperforming.length };
  }, [goals, underperforming]);

  // Chart data
  const deptChartData = DEPARTMENTS.map(d => ({
    name: d.length > 12 ? d.slice(0, 12) + '\u2026' : d,
    fullName: d,
    total: stats.byDept[d]?.total || 0,
    completed: stats.byDept[d]?.completed || 0,
    progress: stats.byDept[d]?.avgProg || 0,
  }));

  const scopePieData = [
    { name: 'Department', value: goals.filter(g => (g.scope || 'Individual') === 'Department').length },
    { name: 'Team', value: goals.filter(g => g.scope === 'Team').length },
    { name: 'Individual', value: goals.filter(g => (g.scope || 'Individual') === 'Individual').length },
  ].filter(d => d.value > 0);

  const statusPieData = STATUSES.map(s => ({ name: s, value: goals.filter(g => (g.status || 'Not Started') === s).length })).filter(d => d.value > 0);

  const printGoal = (g: any) => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>OKR - ${g.title}</title><style>
      body{font-family:Arial,Helvetica,sans-serif;padding:40px;color:#1e293b;max-width:800px;margin:0 auto}
      h1{font-size:20px;border-bottom:2px solid #0f766e;padding-bottom:8px}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}
      .field{margin-bottom:8px}.label{font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;display:block}.val{font-size:13px;margin-top:2px}
      .bar{height:8px;background:#e2e8f0;border-radius:4px;margin-top:4px}.fill{height:100%;background:#0f766e;border-radius:4px}
      .badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700}
    </style></head><body>
    <h1>OKR / Goal: ${g.title || g.statement}</h1>
    <div class="grid">
      <div class="field"><span class="label">Scope</span><span class="val">${g.scope || 'Individual'}</span></div>
      <div class="field"><span class="label">Department</span><span class="val">${g.department || '\u2014'}</span></div>
      <div class="field"><span class="label">Team</span><span class="val">${g.team_name || '\u2014'}</span></div>
      <div class="field"><span class="label">Assigned To</span><span class="val">${g.employee_name || '\u2014'}</span></div>
      <div class="field"><span class="label">Delegation</span><span class="val">${g.delegation || '\u2014'}</span></div>
      <div class="field"><span class="label">Priority</span><span class="val">${g.priority || 'Medium'}</span></div>
      <div class="field"><span class="label">Quarter</span><span class="val">${g.quarter || '\u2014'}</span></div>
      <div class="field"><span class="label">Target Date</span><span class="val">${g.target_date || '\u2014'}</span></div>
      <div class="field"><span class="label">Status</span><span class="val"><span class="badge">${g.status || 'Not Started'}</span></span></div>
      <div class="field"><span class="label">Key Metric</span><span class="val">${g.metric || '\u2014'}</span></div>
    </div>
    <div class="field"><span class="label">Goal Statement</span><p class="val">${g.statement || ''}</p></div>
    <div class="field"><span class="label">Progress</span><div class="bar"><div class="fill" style="width:${g.progress || 0}%"></div></div><span style="font-size:11px;color:#64748b">${g.progress || 0}%</span></div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const inp = "w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-black rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-green/50";

  /* ─── UNDERPERFORMING FULL-SCREEN VIEW ─── */
  if (showUnderperforming) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => setShowUnderperforming(false)} className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-teal-deep dark:hover:text-teal-green transition-colors"><ArrowLeft size={18} /> Back to Dashboard</button>
        </div>
        <div className="flex items-center gap-2 mb-5">
          <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center"><AlertTriangle size={18} className="text-red-500" /></div>
          <div>
            <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">Underperforming Goals & Metrics</h2>
            <p className="text-xs text-slate-400">Goals that are at risk, overdue, or stalled</p>
          </div>
        </div>
        {underperforming.length === 0 ? (
          <Card>
            <div className="py-12 text-center">
              <Check size={40} className="mx-auto text-emerald-400 mb-3" />
              <p className="text-sm text-slate-400 italic">No underperforming goals detected. All targets are on track.</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Summary metrics */}
            <div className="grid grid-cols-4 gap-3">
              <Card><div className="p-1">
                <p className="text-[10px] font-bold uppercase text-red-500">Overdue Goals</p>
                <p className="text-2xl font-black text-red-600">{underperforming.filter(g => g.target_date && new Date(g.target_date) < new Date()).length}</p>
              </div></Card>
              <Card><div className="p-1">
                <p className="text-[10px] font-bold uppercase text-orange-500">At Risk</p>
                <p className="text-2xl font-black text-orange-600">{underperforming.filter(g => g.status === 'At Risk').length}</p>
              </div></Card>
              <Card><div className="p-1">
                <p className="text-[10px] font-bold uppercase text-amber-500">Stalled (0-10%)</p>
                <p className="text-2xl font-black text-amber-600">{underperforming.filter(g => (g.progress || 0) <= 10).length}</p>
              </div></Card>
              <Card><div className="p-1">
                <p className="text-[10px] font-bold uppercase text-slate-500">Avg. Progress</p>
                <p className="text-2xl font-black text-slate-600 dark:text-slate-300">{underperforming.length > 0 ? Math.round(underperforming.reduce((s, g) => s + (g.progress || 0), 0) / underperforming.length) : 0}%</p>
              </div></Card>
            </div>
            {/* By department breakdown */}
            <Card>
              <p className="text-[10px] font-bold uppercase text-slate-500 mb-2">By Department</p>
              <div className="flex flex-wrap gap-2">
                {DEPARTMENTS.map(d => {
                  const count = underperforming.filter(g => g.department === d).length;
                  if (count === 0) return null;
                  return <span key={d} className="px-2 py-1 text-xs font-bold rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">{d}: {count}</span>;
                })}
              </div>
            </Card>
            {/* Table */}
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead><tr className="bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-900/50">
                    <th className="py-2.5 px-3 text-[10px] font-bold uppercase text-red-500">Goal</th>
                    <th className="py-2.5 px-3 text-[10px] font-bold uppercase text-red-500">Scope</th>
                    <th className="py-2.5 px-3 text-[10px] font-bold uppercase text-red-500">Department</th>
                    <th className="py-2.5 px-3 text-[10px] font-bold uppercase text-red-500">Assigned</th>
                    <th className="py-2.5 px-3 text-[10px] font-bold uppercase text-red-500">Priority</th>
                    <th className="py-2.5 px-3 text-[10px] font-bold uppercase text-red-500">Progress</th>
                    <th className="py-2.5 px-3 text-[10px] font-bold uppercase text-red-500">Due</th>
                    <th className="py-2.5 px-3 text-[10px] font-bold uppercase text-red-500">Issue</th>
                  </tr></thead>
                  <tbody>
                    {underperforming.map(g => {
                      const overdue = g.target_date && new Date(g.target_date) < new Date();
                      const stalled = (g.progress || 0) <= 10 && g.status === 'In Progress';
                      return (
                        <tr key={g.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-red-50/50 dark:hover:bg-red-900/10">
                          <td className="py-2 px-3 text-xs font-medium text-slate-700 dark:text-slate-200 max-w-[200px] truncate">{g.title || g.statement}</td>
                          <td className="py-2 px-3 text-xs text-slate-500">{g.scope || 'Individual'}</td>
                          <td className="py-2 px-3 text-xs text-slate-500">{g.department || '\u2014'}</td>
                          <td className="py-2 px-3 text-xs text-slate-500">{g.employee_name || g.delegation || '\u2014'}</td>
                          <td className="py-2 px-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${priorityColor(g.priority)}`}>{g.priority || 'Medium'}</span></td>
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2">
                              <div className="w-16 bg-slate-200 dark:bg-slate-700 rounded-full h-1.5"><div className="bg-red-500 h-1.5 rounded-full" style={{ width: `${g.progress || 0}%` }}></div></div>
                              <span className="text-[10px] font-bold text-red-500">{g.progress || 0}%</span>
                            </div>
                          </td>
                          <td className={`py-2 px-3 text-xs font-medium ${overdue ? 'text-red-600' : 'text-slate-500'}`}>{g.target_date || '\u2014'}</td>
                          <td className="py-2 px-3">
                            <div className="flex gap-1">
                              {overdue && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-600">OVERDUE</span>}
                              {g.status === 'At Risk' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/40 text-orange-600">AT RISK</span>}
                              {stalled && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-600">STALLED</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </motion.div>
    );
  }

  /* ─── ADD GOAL FULL-SCREEN VIEW ─── */
  if (showForm) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => setShowForm(false)} className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-teal-deep dark:hover:text-teal-green transition-colors"><ArrowLeft size={18} /> Back to Dashboard</button>
        </div>
        <div className="flex items-center gap-2 mb-5">
          <div className="w-9 h-9 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center"><Target size={18} className="text-teal-600" /></div>
          <div>
            <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">New Goal / OKR</h2>
            <p className="text-xs text-slate-400">Define targets for department, team, or individual</p>
          </div>
        </div>
        <Card>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); handleSubmit(); }}>
            {/* Scope & Department */}
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Scope *</label>
                <select value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value })} className={inp}>
                  <option value="">Select Scope...</option>
                  {SCOPES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Department *</label>
                <select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} className={inp}>
                  <option value="">Select Department...</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Quarter</label>
                <select value={form.quarter} onChange={e => setForm({ ...form, quarter: e.target.value })} className={inp}>
                  <option value="">Select Quarter...</option>
                  {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Priority</label>
                <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} className={inp}>
                  <option value="">Select Priority...</option>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            {/* Team / Employee / Delegation */}
            <div className="grid grid-cols-3 gap-4">
              {(form.scope === 'Team' || form.scope === 'Department') && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Team Name</label>
                  <input type="text" value={form.team_name} onChange={e => setForm({ ...form, team_name: e.target.value })} className={inp} placeholder="e.g. Sales Team A" />
                </div>
              )}
              {form.scope === 'Individual' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employee *</label>
                  <SearchableSelect
                    options={employees.map(e => ({ value: String(e.id), label: e.name }))}
                    value={form.employee_id}
                    onChange={v => setForm({ ...form, employee_id: v })}
                    placeholder="Select Employee..."
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Delegation / Owner</label>
                <input type="text" value={form.delegation} onChange={e => setForm({ ...form, delegation: e.target.value })} className={inp} placeholder="Person or role responsible" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Target Date</label>
                <input type="date" value={form.target_date} onChange={e => setForm({ ...form, target_date: e.target.value })} className={inp} />
              </div>
            </div>
            {/* Goal Details */}
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Goal Title *</label>
              <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className={inp} placeholder="Short title for the goal/OKR" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Goal Statement / Key Result *</label>
              <textarea rows={2} value={form.statement} onChange={e => setForm({ ...form, statement: e.target.value })} className={inp} placeholder="e.g. Increase department revenue by 20% through cross-selling initiatives"></textarea>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Key Metric</label>
                <input type="text" value={form.metric} onChange={e => setForm({ ...form, metric: e.target.value })} className={inp} placeholder="e.g. Revenue, NPS Score" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Initial Status</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={inp}>
                  <option value="">Select Status...</option>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Progress ({form.progress}%)</label>
                <input type="range" min={0} max={100} step={5} value={form.progress} onChange={e => setForm({ ...form, progress: Number(e.target.value) })} className="w-full mt-3 accent-teal-600" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">Cancel</button>
              <button type="submit" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green transition-colors">Create Goal</button>
            </div>
          </form>
        </Card>
      </motion.div>
    );
  }

  /* ─── MAIN DASHBOARD VIEW ─── */
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-4">
        <SectionHeader title="Target & OKR Planner" subtitle="Goals and delegations \u2014 Department, Team & Individual" />
        <div className="flex gap-2">
          <button onClick={() => exportToCSV(goals.map(g => ({
            scope: g.scope, department: g.department, team: g.team_name, employee: g.employee_name,
            title: g.title, statement: g.statement, metric: g.metric, status: g.status,
            progress: g.progress, priority: g.priority, quarter: g.quarter, delegation: g.delegation, target_date: g.target_date
          })), 'okr_goals')} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><Download size={16} /> CSV</button>
          <button onClick={() => setShowUnderperforming(true)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50`}>
            <AlertTriangle size={16} /> Underperforming ({stats.underperformingCount})
          </button>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-teal-deep text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-teal-green transition-colors">
            <Plus size={16} /> Add Goal
          </button>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        {[
          { label: 'Total Goals', val: stats.total, icon: Target, color: 'text-teal-deep dark:text-teal-green' },
          { label: 'Avg. Progress', val: `${stats.avgProgress}%`, icon: TrendingDown, color: 'text-blue-600 dark:text-blue-400' },
          { label: 'Completed', val: stats.completed, icon: Check, color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'At Risk', val: stats.atRisk, icon: AlertTriangle, color: 'text-red-500 dark:text-red-400' },
          { label: 'Underperforming', val: stats.underperformingCount, icon: TrendingDown, color: 'text-orange-500 dark:text-orange-400' },
        ].map((c, i) => (
          <Card key={i}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">{c.label}</p>
                <p className={`text-2xl font-black mt-1 ${c.color}`}>{c.val}</p>
              </div>
              <c.icon size={22} className={`${c.color} opacity-40`} />
            </div>
          </Card>
        ))}
      </div>

      {/* CHARTS ROW */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <Card>
          <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-3">Goals by Department</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptChartData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} width={90} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: 12 }} />
                <Bar dataKey="total" fill="#0f766e" name="Total" radius={[0, 4, 4, 0]} />
                <Bar dataKey="completed" fill="#10b981" name="Completed" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-3">By Scope</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={scopePieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={4} dataKey="value" label={({ name, value }) => `${name} (${value})`} labelLine={false} style={{ fontSize: 11 }}>
                  {scopePieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-3">By Status</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={4} dataKey="value" label={({ name, value }) => `${name} (${value})`} labelLine={false} style={{ fontSize: 10 }}>
                  {statusPieData.map((_, i) => <Cell key={i} fill={['#94a3b8','#f59e0b','#ef4444','#10b981','#cbd5e1'][i % 5]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* DEPARTMENT RADAR */}
      <div className="mb-4">
        <Card>
          <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-3">Department Performance Radar</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={deptChartData.map(d => ({ ...d, name: d.fullName.split('/')[0] }))}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={{ fontSize: 9 }} />
                <Radar name="Avg Progress" dataKey="progress" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.15} />
                <Radar name="Total Goals" dataKey="total" stroke="#0f766e" fill="#0f766e" fillOpacity={0.15} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* SCOPE TABS & FILTERS */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 gap-1">
          {SCOPES.map(s => {
            const Icon = s === 'Department' ? Building2 : s === 'Team' ? Users : User;
            const count = goals.filter(g => (g.scope || 'Individual') === s).length;
            return (
              <button key={s} onClick={() => { setActiveTab(s); setExpandedGoal(null); }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === s ? 'bg-white dark:bg-slate-900 text-teal-deep dark:text-teal-green shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                <Icon size={14} /> {s} <span className="text-[10px] font-black ml-0.5 opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Search goals..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-green/50 placeholder:text-slate-400" />
          </div>
          <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="px-3 py-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 font-bold">
            <option value="All">All Departments</option>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 font-bold">
            <option value="All">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* GOALS TABLE */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead><tr className="border-b border-slate-100 dark:border-slate-800">
              <th className="py-3 px-4 text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider w-6"></th>
              <th className="py-3 px-4 text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Title</th>
              <th className="py-3 px-4 text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Department</th>
              {activeTab === 'Team' && <th className="py-3 px-4 text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Team</th>}
              {activeTab === 'Individual' && <th className="py-3 px-4 text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Employee</th>}
              <th className="py-3 px-4 text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Delegation</th>
              <th className="py-3 px-4 text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Priority</th>
              <th className="py-3 px-4 text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Progress</th>
              <th className="py-3 px-4 text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Status</th>
              <th className="py-3 px-4 text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider text-right">Actions</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={activeTab === 'Department' ? 8 : 9} className="py-12 text-center text-sm text-slate-400 italic">
                  No {activeTab.toLowerCase()} goals found. Click &quot;Add Goal&quot; to create one.
                </td></tr>
              )}
              {filtered.map((g: any) => {
                const isExpanded = expandedGoal === g.id;
                const overdue = g.target_date && new Date(g.target_date) < new Date() && g.status !== 'Completed' && g.status !== 'Cancelled';
                return (
                  <React.Fragment key={g.id}>
                    <tr className={`border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors cursor-pointer ${overdue ? 'bg-red-50/30 dark:bg-red-900/5' : ''}`}
                      onClick={() => setExpandedGoal(isExpanded ? null : g.id)}>
                      <td className="py-3 px-4 text-slate-400">{isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-700 dark:text-slate-100 text-sm">{g.title || g.statement}</span>
                          {overdue && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-600">OVERDUE</span>}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400">{g.department || '\u2014'}</td>
                      {activeTab === 'Team' && <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400">{g.team_name || '\u2014'}</td>}
                      {activeTab === 'Individual' && <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400">{g.employee_name || '\u2014'}</td>}
                      <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400">{g.delegation || '\u2014'}</td>
                      <td className="py-3 px-4"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${priorityColor(g.priority || 'Medium')}`}>{g.priority || 'Medium'}</span></td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 min-w-[100px]">
                          <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full transition-all ${(g.progress || 0) >= 100 ? 'bg-emerald-500' : (g.progress || 0) >= 50 ? 'bg-teal-500' : (g.progress || 0) >= 25 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${g.progress || 0}%` }}></div>
                          </div>
                          <span className="text-[10px] font-bold text-slate-400 w-8 text-right">{g.progress || 0}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <select value={g.status || 'Not Started'} onClick={e => e.stopPropagation()}
                          onChange={e => { e.stopPropagation(); updateGoal(g.id, { status: e.target.value, progress: e.target.value === 'Completed' ? 100 : g.progress || 0 }); }}
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border cursor-pointer ${statusColor(g.status || 'Not Started')}`}>
                          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                          <button onClick={() => printGoal(g)} className="text-blue-500 hover:text-blue-700 p-1" title="Print"><Printer size={14} /></button>
                          <button onClick={() => handleDelete(g.id)} className="text-red-400 hover:text-red-600 p-1" title="Delete"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                    {/* Expanded Detail */}
                    <AnimatePresence>
                      {isExpanded && (
                        <tr><td colSpan={activeTab === 'Department' ? 8 : 9} className="p-0">
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                            <div className="bg-slate-50 dark:bg-slate-900/50 p-5 border-b border-slate-200 dark:border-slate-700 space-y-4">
                              {/* Info Grid */}
                              <div className="grid grid-cols-6 gap-3 text-xs">
                                <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Scope</span><span className="text-slate-700 dark:text-slate-200">{g.scope || 'Individual'}</span></div>
                                <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Department</span><span className="text-slate-700 dark:text-slate-200">{g.department || '\u2014'}</span></div>
                                <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Team</span><span className="text-slate-700 dark:text-slate-200">{g.team_name || '\u2014'}</span></div>
                                <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Employee</span><span className="text-slate-700 dark:text-slate-200">{g.employee_name || '\u2014'}</span></div>
                                <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Quarter</span><span className="text-slate-700 dark:text-slate-200">{g.quarter || '\u2014'}</span></div>
                                <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Target Date</span><span className={`${overdue ? 'text-red-600 font-bold' : 'text-slate-700 dark:text-slate-200'}`}>{g.target_date || '\u2014'}</span></div>
                              </div>
                              {/* Goal Statement */}
                              <div>
                                <span className="font-bold text-teal-deep dark:text-teal-green text-xs block mb-1">Goal Statement</span>
                                <p className="text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">{g.statement || '\u2014'}</p>
                              </div>
                              {/* Metrics & Delegation */}
                              <div className="grid grid-cols-3 gap-4">
                                <div>
                                  <span className="font-bold text-teal-deep dark:text-teal-green text-xs block mb-1">Key Metric</span>
                                  <p className="text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">{g.metric || '\u2014'}</p>
                                </div>
                                <div>
                                  <span className="font-bold text-teal-deep dark:text-teal-green text-xs block mb-1">Delegation / Owner</span>
                                  <p className="text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">{g.delegation || '\u2014'}</p>
                                </div>
                                <div>
                                  <span className="font-bold text-teal-deep dark:text-teal-green text-xs block mb-1">Progress</span>
                                  <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                                    <div className="flex items-center gap-3">
                                      <input type="range" min={0} max={100} step={5} value={g.progress || 0}
                                        onChange={e => updateGoal(g.id, { progress: Number(e.target.value), status: Number(e.target.value) === 100 ? 'Completed' : Number(e.target.value) > 0 ? 'In Progress' : 'Not Started' })}
                                        className="flex-1 accent-teal-600" />
                                      <span className="text-sm font-bold text-slate-700 dark:text-slate-200 w-10 text-right">{g.progress || 0}%</span>
                                    </div>
                                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 mt-2">
                                      <div className={`h-2 rounded-full transition-all ${(g.progress || 0) >= 100 ? 'bg-emerald-500' : (g.progress || 0) >= 50 ? 'bg-teal-500' : 'bg-amber-500'}`} style={{ width: `${g.progress || 0}%` }}></div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        </td></tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </motion.div>
  );
};
