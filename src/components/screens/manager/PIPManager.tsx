import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { SearchableSelect } from '../../common/SearchableSelect';
import { ChoicePills } from '../../common/ChoicePills';
import { Plus, X, Download, Edit3, Save, AlertTriangle, TrendingUp, CheckCircle, Archive } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';
import { Employee } from '../../../types';
import { appConfirm } from '../../../utils/appDialog';

const Input = ({ label, value, onChange, type = 'text', placeholder = '', required = false, min, max, minLength, maxLength }: any) => (
  <div>
    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">{label}</label>
    <input type={type} value={value} onChange={onChange} placeholder={placeholder} required={required} min={min} max={max} minLength={minLength} maxLength={maxLength} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
  </div>
);

interface PIPManagerProps {
  employees: Employee[];
}

export const PIPManager = ({ employees }: PIPManagerProps) => {
  const [plans, setPlans] = useState<any[]>([]);
  const [devPlans, setDevPlans] = useState<any[]>([]);
  const [showForm, setShowForm] = useState<'none' | 'pip' | 'idp'>('none');
  const [editingId, setEditingId] = useState<number | null>(null);

  const [pipForm, setPipForm] = useState({
    employee_id: '', appraisal_id: '', start_date: '', end_date: '',
    deficiency: '', improvement_objective: '', action_steps: '', support_provided: '',
    progress_check_date: '', progress_notes: '', outcome: '',
    supervisor_name: ''
  });

  const [idpForm, setIdpForm] = useState({
    employee_id: '', skill_gap: '', growth_step: '', status: ''
  });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try { const r = await fetch('/api/pip_plans', { headers: getAuthHeaders() }); const d = await r.json(); setPlans(Array.isArray(d) ? d : []); } catch { setPlans([]); }
    try { const r = await fetch('/api/development_plans', { headers: getAuthHeaders() }); const d = await r.json(); setDevPlans(Array.isArray(d) ? d : []); } catch { setDevPlans([]); }
  };

  const submitPIP = async () => {
    const title = editingId ? 'Update PIP' : 'Create PIP';
    const icon = 'warning' as const;
    if (!(await appConfirm(`${title}?`, { title, confirmText: 'Confirm', icon }))) return;
    
    const deficiency = pipForm.deficiency.trim();
    if (!pipForm.employee_id || !deficiency) { window.notify?.('Please select employee and describe deficiency', 'error'); return; }
    if (deficiency.length < 10) { window.notify?.('Deficiency details should be at least 10 characters', 'error'); return; }
    if (pipForm.start_date && pipForm.end_date && new Date(pipForm.end_date) < new Date(pipForm.start_date)) {
      window.notify?.('End date cannot be earlier than start date', 'error');
      return;
    }
    if (pipForm.progress_check_date && pipForm.start_date && new Date(pipForm.progress_check_date) < new Date(pipForm.start_date)) {
      window.notify?.('Progress check date cannot be before start date', 'error');
      return;
    }
    try {
      const url = editingId ? `/api/pip_plans/${editingId}` : '/api/pip_plans';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...pipForm, deficiency, employee_id: parseInt(pipForm.employee_id) })
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.(editingId ? 'PIP updated' : 'PIP created', 'success');
      resetPipForm(); setShowForm('none'); setEditingId(null); fetchData();
    } catch { window.notify?.('Failed to save PIP', 'error'); }
  };

  const submitIDP = async () => {
    if (!(await appConfirm('Create IDP (Individual Development Plan)?', { title: 'Create IDP', confirmText: 'Create', icon: 'info' }))) return;
    
    const skillGap = idpForm.skill_gap.trim();
    const growthStep = idpForm.growth_step.trim();
    if (!idpForm.employee_id || !skillGap) { window.notify?.('Please select employee and describe skill gap', 'error'); return; }
    if (skillGap.length < 3 || skillGap.length > 120) { window.notify?.('Skill gap must be between 3 and 120 characters', 'error'); return; }
    if (growthStep && growthStep.length > 500) { window.notify?.('Growth step must be 500 characters or less', 'error'); return; }
    try {
      const res = await fetch('/api/development_plans', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...idpForm, skill_gap: skillGap, growth_step: growthStep, employee_id: parseInt(idpForm.employee_id), step_order: devPlans.length + 1 })
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('IDP created for employee', 'success');
      setIdpForm({ employee_id: '', skill_gap: '', growth_step: '', status: '' });
      setShowForm('none'); fetchData();
    } catch { window.notify?.('Failed to create IDP', 'error'); }
  };

  const deletePIP = async (id: number) => {
    if (!(await appConfirm('Archive this PIP?', { title: 'Archive PIP', confirmText: 'Archive', icon: 'archive' }))) return;
    try { await fetch(`/api/pip_plans/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); window.notify?.('PIP archived', 'success'); fetchData(); } catch { window.notify?.('Failed', 'error'); }
  };

  const deleteIDP = async (id: number) => {
    if (!(await appConfirm('Archive this IDP?', { title: 'Archive IDP', confirmText: 'Archive', icon: 'archive' }))) return;
    try { await fetch(`/api/development_plans/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); window.notify?.('IDP archived', 'success'); fetchData(); } catch { window.notify?.('Failed', 'error'); }
  };

  const editPIP = (p: any) => {
    setPipForm({
      employee_id: String(p.employee_id), appraisal_id: String(p.appraisal_id || ''),
      start_date: p.start_date || '', end_date: p.end_date || '',
      deficiency: p.deficiency || '', improvement_objective: p.improvement_objective || '',
      action_steps: p.action_steps || '', support_provided: p.support_provided || '',
      progress_check_date: p.progress_check_date || '', progress_notes: p.progress_notes || '',
      outcome: p.outcome || 'In Progress', supervisor_name: p.supervisor_name || ''
    });
    setEditingId(p.id);
    setShowForm('pip');
  };

  const updateIDPStatus = async (id: number, status: string) => {
    try { await fetch(`/api/development_plans/${id}`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify({ status }) }); window.notify?.('Status updated', 'success'); fetchData(); } catch { window.notify?.('Failed', 'error'); }
  };

  const resetPipForm = () => setPipForm({ employee_id: '', appraisal_id: '', start_date: '', end_date: '', deficiency: '', improvement_objective: '', action_steps: '', support_provided: '', progress_check_date: '', progress_notes: '', outcome: '', supervisor_name: '' });

  const isPIPFormValid = () => {
    if (!pipForm.employee_id || !pipForm.start_date || !pipForm.end_date) return false;
    const deficiency = pipForm.deficiency.trim();
    if (!deficiency || deficiency.length < 10) return false;
    if (pipForm.end_date && new Date(pipForm.end_date) < new Date(pipForm.start_date)) return false;
    return true;
  };

  const isIDPFormValid = () => {
    if (!idpForm.employee_id || !idpForm.skill_gap || !idpForm.status) return false;
    return true;
  };

  const getEmployeeName = (id: number) => employees.find(e => e.id === id)?.name || `#${id}`;

  // Analytics
  const pipOutcomes = plans.reduce((acc: any, p: any) => { const o = p.outcome || 'In Progress'; acc[o] = (acc[o] || 0) + 1; return acc; }, {});
  const pipPieData = Object.keys(pipOutcomes).map(k => ({ name: k, value: pipOutcomes[k] }));
  const idpStatuses = devPlans.reduce((acc: any, p: any) => { const s = p.status || 'Not Started'; acc[s] = (acc[s] || 0) + 1; return acc; }, {});
  const idpPieData = Object.keys(idpStatuses).map(k => ({ name: k, value: idpStatuses[k] }));
  const PIP_COLORS: Record<string, string> = { 'In Progress': '#f59e0b', 'Improved': '#10b981', 'Escalated': '#ef4444', 'Completed': '#0f766e' };
  const IDP_COLORS: Record<string, string> = { 'Not Started': '#94a3b8', 'In Progress': '#f59e0b', 'Completed': '#10b981' };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-4">
        <SectionHeader title="IDP & PIP Manager" subtitle="Create development plans (IDP) for growth or improvement plans (PIP) for correction" />
      </div>

      {/* Analytics */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <Card>
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">PIP Outcomes ({plans.length})</h3>
          <div className="h-48">
            {pipPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart><Pie data={pipPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={5} dataKey="value">
                  {pipPieData.map(entry => (<Cell key={entry.name} fill={PIP_COLORS[entry.name] || '#94a3b8'} />))}
                </Pie><Tooltip /></PieChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center text-sm text-slate-400">No PIPs yet</div>}
          </div>
          <div className="flex flex-wrap gap-2 mt-2 justify-center">{pipPieData.map(d => (<span key={d.name} className="flex items-center gap-1 text-[10px] font-bold text-slate-500"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: PIP_COLORS[d.name] || '#94a3b8' }}></span>{d.name} ({d.value})</span>))}</div>
        </Card>
        <Card>
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">IDP Status ({devPlans.length})</h3>
          <div className="h-48">
            {idpPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart><Pie data={idpPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={5} dataKey="value">
                  {idpPieData.map(entry => (<Cell key={entry.name} fill={IDP_COLORS[entry.name] || '#94a3b8'} />))}
                </Pie><Tooltip /></PieChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center text-sm text-slate-400">No IDPs yet</div>}
          </div>
          <div className="flex flex-wrap gap-2 mt-2 justify-center">{idpPieData.map(d => (<span key={d.name} className="flex items-center gap-1 text-[10px] font-bold text-slate-500"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: IDP_COLORS[d.name] || '#94a3b8' }}></span>{d.name} ({d.value})</span>))}</div>
        </Card>
      </div>

      {/* PIP Records Table */}
      <Card>
        <h3 className="text-sm font-bold text-amber-600 uppercase mb-4 flex items-center gap-2"><AlertTriangle size={14} /> Performance Improvement Plans ({plans.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm"><thead><tr className="border-b border-slate-100 dark:border-slate-800">
            <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Employee</th>
            <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Deficiency</th>
            <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Period</th>
            <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Outcome</th>
            <th className="pb-3"></th>
          </tr></thead><tbody>
            {plans.map(p => (
                <tr key={p.id} className="border-b border-slate-50 dark:border-slate-800/50">
                <td className="py-3 px-1.5 font-medium text-slate-700 dark:text-slate-200">
                  <div className="min-w-0">
                    <span className="truncate max-w-[280px]" title={getEmployeeName(p.employee_id)}>{getEmployeeName(p.employee_id)}</span>
                  </div>
                </td>
                <td className="py-3 px-1.5 text-slate-500 dark:text-slate-400 max-w-sm truncate">{p.deficiency}</td>
                <td className="py-3 px-1.5 text-xs text-slate-400">{p.start_date || '—'} → {p.end_date || '—'}</td>
                <td className="py-3">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${p.outcome === 'Improved' || p.outcome === 'Completed' ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30' : p.outcome === 'Escalated' ? 'text-red-600 bg-red-50 dark:bg-red-900/30' : 'text-amber-600 bg-amber-50 dark:bg-amber-900/30'}`}>
                    {p.outcome || 'In Progress'}
                  </span>
                </td>
                <td className="py-3 flex gap-2">
                  <button onClick={() => editPIP(p)} className="text-teal-500 hover:text-teal-700"><Edit3 size={14} /></button>
                  <button onClick={() => deletePIP(p.id)} className="text-red-500 hover:text-red-600 p-1 rounded" title="Archive"><Archive size={15} /></button>
                </td>
              </tr>
            ))}
            {plans.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-400">No PIPs created yet.</td></tr>}
          </tbody></table>
        </div>
      </Card>

      {/* IDP Records Table */}
      <div className="mt-4">
        <Card>
          <h3 className="text-sm font-bold text-teal-deep dark:text-teal-green uppercase mb-4 flex items-center gap-2"><TrendingUp size={14} /> Individual Development Plans ({devPlans.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm"><thead><tr className="border-b border-slate-100 dark:border-slate-800">
              <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Employee</th>
              <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Skill Gap</th>
              <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Growth Step</th>
              <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
              <th className="pb-3"></th>
            </tr></thead><tbody>
              {devPlans.map(p => (
                <tr key={p.id} className="border-b border-slate-50 dark:border-slate-800/50">
                  <td className="py-3 px-1.5 font-medium text-slate-700 dark:text-slate-200">
                    <div className="min-w-0">
                      <span className="truncate max-w-[280px]" title={getEmployeeName(p.employee_id)}>{getEmployeeName(p.employee_id)}</span>
                    </div>
                  </td>
                  <td className="py-3 px-1.5 text-slate-500 dark:text-slate-400">
                    <div className="min-w-0"><span className="truncate max-w-[260px]" title={p.skill_gap}>{p.skill_gap}</span></div>
                  </td>
                  <td className="py-3 px-1.5 text-slate-500 dark:text-slate-400">
                    <div className="min-w-0"><span className="truncate max-w-[260px]" title={p.growth_step}>{p.growth_step}</span></div>
                  </td>
                  <td className="py-3">
                    <ChoicePills
                      value={p.status || 'Not Started'}
                      compact
                      onChange={(v) => updateIDPStatus(p.id, v)}
                      options={[
                        { value: 'Not Started', label: 'Not Started', activeClassName: 'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300' },
                        { value: 'In Progress', label: 'In Progress', activeClassName: 'border-amber-300 bg-amber-50 text-amber-600 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
                        { value: 'Completed', label: 'Completed', activeClassName: 'border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
                      ]}
                    />
                  </td>
                  <td className="py-3 flex gap-2">
                    {p.status !== 'Completed' && <button onClick={() => updateIDPStatus(p.id, 'Completed')} className="text-emerald-400 hover:text-emerald-600"><CheckCircle size={14} /></button>}
                    <button onClick={() => deleteIDP(p.id)} className="text-red-500 hover:text-red-600 p-1 rounded" title="Archive"><Archive size={15} /></button>
                  </td>
                </tr>
              ))}
              {devPlans.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-400">No IDPs created yet.</td></tr>}
            </tbody></table>
          </div>
        </Card>
      </div>
    </motion.div>
  );
};
