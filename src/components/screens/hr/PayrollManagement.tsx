import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DollarSign, Plus, Edit3, Check, X, Search, Download, Filter, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Award, Clock, Archive } from 'lucide-react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { Modal } from '../../common/Modal';
import { ChoicePills } from '../../common/ChoicePills';
import { getAuthHeaders, exportToCSV } from '../../../utils/csv';

interface Adjustment {
  id: number;
  employee_id: number;
  employee_name?: string;
  employee_dept?: string;
  employee_position?: string;
  type: string;
  category?: string;
  description?: string;
  amount: number;
  effective_date?: string;
  pay_period?: string;
  status: string;
  approved_by?: number;
  approved_at?: string;
  created_by?: number;
  created_at?: string;
}

interface Employee {
  id: number;
  name: string;
  dept?: string;
  position?: string;
  salary_base?: number;
}

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any; sign: string }> = {
  bonus: { label: 'Bonus', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30', icon: Award, sign: '+' },
  deduction: { label: 'Deduction', color: 'text-red-700 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30', icon: TrendingDown, sign: '-' },
  allowance: { label: 'Allowance', color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30', icon: TrendingUp, sign: '+' },
  overtime: { label: 'Overtime', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30', icon: Clock, sign: '+' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30' },
  approved: { label: 'Approved', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  rejected: { label: 'Rejected', color: 'text-red-700 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' },
};

const fmt = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toLocaleString()}`;
};

export const PayrollManagement = ({ employees = [] }: { employees?: Employee[] }) => {
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAdj, setEditingAdj] = useState<Adjustment | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Form state
  const [form, setForm] = useState({
    employee_id: '', type: 'bonus', category: '', description: '', amount: '',
    effective_date: '', pay_period: '', status: 'pending'
  });

  useEffect(() => { fetchAdjustments(); }, []);

  const fetchAdjustments = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/payroll-adjustments', { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); setAdjustments(Array.isArray(data) ? data : []); }
    } catch {} finally { setLoading(false); }
  };

  const openNew = () => {
    setEditingAdj(null);
    setForm({ employee_id: '', type: 'bonus', category: '', description: '', amount: '', effective_date: '', pay_period: '', status: 'pending' });
    setModalOpen(true);
  };

  const openEdit = (adj: Adjustment) => {
    setEditingAdj(adj);
    setForm({
      employee_id: String(adj.employee_id), type: adj.type, category: adj.category || '',
      description: adj.description || '', amount: String(adj.amount), effective_date: adj.effective_date || '',
      pay_period: adj.pay_period || '', status: adj.status
    });
    setModalOpen(true);
  };

  const saveAdjustment = async () => {
    const body = { ...form, employee_id: Number(form.employee_id), amount: Number(form.amount) };
    if (!body.employee_id || !body.type || isNaN(body.amount)) return;
    try {
      const url = editingAdj ? `/api/payroll-adjustments/${editingAdj.id}` : '/api/payroll-adjustments';
      const method = editingAdj ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { setModalOpen(false); fetchAdjustments(); (window as any).notify?.(editingAdj ? 'Adjustment updated' : 'Adjustment created', 'success'); }
    } catch { (window as any).notify?.('Error saving adjustment', 'error'); }
  };

  const deleteAdjustment = async (id: number) => {
    try {
      const res = await fetch(`/api/payroll-adjustments/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (res.ok) { fetchAdjustments(); setDeleteConfirm(null); (window as any).notify?.('Adjustment archived', 'success'); }
    } catch { (window as any).notify?.('Error deleting adjustment', 'error'); }
  };

  const approveAdjustment = async (id: number) => {
    try {
      const res = await fetch(`/api/payroll-adjustments/${id}`, { method: 'PUT', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) });
      if (res.ok) { fetchAdjustments(); (window as any).notify?.('Adjustment approved', 'success'); }
    } catch {}
  };

  // Filter
  const filtered = adjustments.filter(a => {
    if (typeFilter && a.type !== typeFilter) return false;
    if (statusFilter && a.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(a.employee_name || '').toLowerCase().includes(q) && !(a.description || '').toLowerCase().includes(q) && !(a.category || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Stats
  const totalBonuses = adjustments.filter(a => a.type === 'bonus' && a.status === 'approved').reduce((s, a) => s + a.amount, 0);
  const totalDeductions = adjustments.filter(a => a.type === 'deduction' && a.status === 'approved').reduce((s, a) => s + a.amount, 0);
  const totalAllowances = adjustments.filter(a => a.type === 'allowance' && a.status === 'approved').reduce((s, a) => s + a.amount, 0);
  const pendingCount = adjustments.filter(a => a.status === 'pending').length;

  const inp = 'w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-green/40';

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-4">
        <SectionHeader title="Payroll Management" subtitle="Manage bonuses, deductions, allowances and overtime" />
        <div className="flex gap-2">
          <button onClick={() => exportToCSV(filtered.map(a => ({ Employee: a.employee_name, Type: a.type, Category: a.category, Amount: a.amount, Status: a.status, Date: a.effective_date, Period: a.pay_period })), 'payroll_adjustments')} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            <Download size={14} /> Export
          </button>
          <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-deep text-white text-sm font-bold hover:bg-teal-green transition-colors">
            <Plus size={14} /> New Adjustment
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Total Bonuses', value: fmt(totalBonuses), icon: Award, color: 'bg-emerald-500' },
          { label: 'Total Deductions', value: fmt(totalDeductions), icon: TrendingDown, color: 'bg-red-500' },
          { label: 'Total Allowances', value: fmt(totalAllowances), icon: TrendingUp, color: 'bg-blue-500' },
          { label: 'Pending Approval', value: pendingCount, icon: Clock, color: 'bg-amber-500' },
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}>
                  <s.icon size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{s.label}</p>
                  <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{s.value}</p>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} className={inp + ' pl-9'} placeholder="Search employee, description..." />
          </div>
          <ChoicePills
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: '', label: 'All Types' },
              { value: 'bonus', label: 'Bonus' },
              { value: 'deduction', label: 'Deduction' },
              { value: 'allowance', label: 'Allowance' },
              { value: 'overtime', label: 'Overtime' },
            ]}
          />
          <ChoicePills
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
            ]}
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b-2 border-slate-200 dark:border-slate-700">
                <th className="pb-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Employee</th>
                <th className="pb-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Type</th>
                <th className="pb-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Category</th>
                <th className="pb-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Amount</th>
                <th className="pb-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Period</th>
                <th className="pb-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                <th className="pb-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <div className="animate-pulse text-slate-400 text-sm">Loading payroll data...</div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <DollarSign size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                    <p className="text-sm text-slate-500 dark:text-slate-400">No payroll adjustments found</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Click "New Adjustment" to create one</p>
                  </td>
                </tr>
              ) : (
                filtered.map((a, idx) => {
                  const tc = TYPE_CONFIG[a.type] || TYPE_CONFIG.bonus;
                  const sc = STATUS_CONFIG[a.status] || STATUS_CONFIG.pending;
                  const TypeIcon = tc.icon;
                  return (
                    <React.Fragment key={a.id}>
                      <motion.tr
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(idx * 0.02, 0.5) }}
                        className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="py-2.5">
                          <div>
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{a.employee_name || `#${a.employee_id}`}</span>
                            {a.employee_dept && <span className="ml-1.5 text-[9px] text-slate-400 uppercase">{a.employee_dept}</span>}
                          </div>
                        </td>
                        <td className="py-2.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${tc.color} ${tc.bg}`}>
                            <TypeIcon size={10} /> {tc.label}
                          </span>
                        </td>
                        <td className="py-2.5 text-xs text-slate-600 dark:text-slate-400">{a.category || '—'}</td>
                        <td className="py-2.5 text-right">
                          <span className={`text-sm font-bold ${a.type === 'deduction' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {tc.sign}${a.amount.toLocaleString()}
                          </span>
                        </td>
                        <td className="py-2.5 text-xs text-slate-500 dark:text-slate-400">{a.pay_period || a.effective_date || '—'}</td>
                        <td className="py-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${sc.color} ${sc.bg}`}>
                            {sc.label}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {a.status === 'pending' && (
                              <button onClick={() => approveAdjustment(a.id)} className="p-1.5 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 transition-colors" title="Approve">
                                <Check size={14} />
                              </button>
                            )}
                            <button onClick={() => openEdit(a)} className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 transition-colors" title="Edit">
                              <Edit3 size={14} />
                            </button>
                            {deleteConfirm === a.id ? (
                              <div className="flex items-center gap-1">
                                <button onClick={() => deleteAdjustment(a.id)} className="p-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[10px] font-bold">Yes</button>
                                <button onClick={() => setDeleteConfirm(null)} className="p-1.5 rounded-lg text-slate-500 text-[10px] font-bold">No</button>
                              </div>
                            ) : (
                              <button onClick={() => setDeleteConfirm(a.id)} className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-colors" title="Archive">
                                <Archive size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create/Edit Modal */}
      <Modal open={modalOpen} title={editingAdj ? 'Edit Adjustment' : 'New Payroll Adjustment'} onClose={() => setModalOpen(false)}>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Employee</label>
            <select value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} className={inp + ' mt-1'}>
              <option value="">Select Employee</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name} — {e.dept || 'No Dept'}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Type</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className={inp + ' mt-1'}>
                <option value="bonus">Bonus</option>
                <option value="deduction">Deduction</option>
                <option value="allowance">Allowance</option>
                <option value="overtime">Overtime</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Category</label>
              <input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={inp + ' mt-1'} placeholder="e.g. Performance, Tax, Transport" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Description</label>
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={inp + ' mt-1'} placeholder="Brief description" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Amount ($)</label>
              <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className={inp + ' mt-1'} placeholder="0.00" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={inp + ' mt-1'}>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Effective Date</label>
              <input type="date" value={form.effective_date} onChange={e => setForm({ ...form, effective_date: e.target.value })} className={inp + ' mt-1'} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Pay Period</label>
              <input value={form.pay_period} onChange={e => setForm({ ...form, pay_period: e.target.value })} className={inp + ' mt-1'} placeholder="e.g. March 2026" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={saveAdjustment} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-deep text-white rounded-xl text-sm font-bold hover:bg-teal-green transition-colors">
              <Check size={14} /> {editingAdj ? 'Update' : 'Create'}
            </button>
            <button onClick={() => setModalOpen(false)} className="px-4 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
};

export default PayrollManagement;
