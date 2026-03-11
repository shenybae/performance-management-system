import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { SearchableSelect } from '../../common/SearchableSelect';
import { Plus, X, Download, Trash2, Edit3, Save, AlertTriangle, TrendingUp, CheckCircle } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';
import { Employee } from '../../../types';

const Input = ({ label, value, onChange, type = 'text', placeholder = '' }: any) => (
  <div>
    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">{label}</label>
    <input type={type} value={value} onChange={onChange} placeholder={placeholder} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
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
    if (!pipForm.employee_id || !pipForm.deficiency) { window.notify?.('Please select employee and describe deficiency', 'error'); return; }
    try {
      const url = editingId ? `/api/pip_plans/${editingId}` : '/api/pip_plans';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify({ ...pipForm, employee_id: parseInt(pipForm.employee_id) }) });
      if (!res.ok) throw new Error('Failed');
      window.notify?.(editingId ? 'PIP updated' : 'PIP created', 'success');
      resetPipForm(); setShowForm('none'); setEditingId(null); fetchData();
    } catch { window.notify?.('Failed to save PIP', 'error'); }
  };

  const submitIDP = async () => {
    if (!idpForm.employee_id || !idpForm.skill_gap) { window.notify?.('Please select employee and describe skill gap', 'error'); return; }
    try {
      const res = await fetch('/api/development_plans', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ ...idpForm, employee_id: parseInt(idpForm.employee_id), step_order: devPlans.length + 1 }) });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('IDP created for employee', 'success');
      setIdpForm({ employee_id: '', skill_gap: '', growth_step: '', status: '' });
      setShowForm('none'); fetchData();
    } catch { window.notify?.('Failed to create IDP', 'error'); }
  };

  const deletePIP = async (id: number) => {
    if (!confirm('Delete this PIP?')) return;
    try { await fetch(`/api/pip_plans/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); window.notify?.('PIP deleted', 'success'); fetchData(); } catch { window.notify?.('Failed', 'error'); }
  };

  const deleteIDP = async (id: number) => {
    if (!confirm('Delete this IDP?')) return;
    try { await fetch(`/api/development_plans/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); window.notify?.('IDP deleted', 'success'); fetchData(); } catch { window.notify?.('Failed', 'error'); }
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
        <div className="flex gap-2">
          <button onClick={() => exportToCSV([...plans.map(p => ({ ...p, type: 'PIP' })), ...devPlans.map(d => ({ ...d, type: 'IDP' }))], 'idp_pip')} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><Download size={16} /> CSV</button>
          <button onClick={() => { setShowForm(showForm === 'idp' ? 'none' : 'idp'); setEditingId(null); }} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${showForm === 'idp' ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300' : 'bg-teal-deep text-white hover:bg-teal-green'}`}>
            {showForm === 'idp' ? <><X size={16} /> Close</> : <><TrendingUp size={16} /> New IDP</>}
          </button>
          <button onClick={() => { setShowForm(showForm === 'pip' ? 'none' : 'pip'); setEditingId(null); resetPipForm(); }} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${showForm === 'pip' ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300' : 'bg-amber-500 text-white hover:bg-amber-600'}`}>
            {showForm === 'pip' ? <><X size={16} /> Close</> : <><AlertTriangle size={16} /> New PIP</>}
          </button>
        </div>
      </div>

      {/* PIP Form */}
      {showForm === 'pip' && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4">
          <Card>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 border-b dark:border-slate-800 pb-2">
              {editingId ? 'Edit Performance Improvement Plan' : 'New Performance Improvement Plan (PIP)'}
            </h3>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); submitPIP(); }}>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employee</label>
                  <SearchableSelect
                    options={employees.map(e => ({ value: String(e.id), label: e.name }))}
                    value={pipForm.employee_id}
                    onChange={v => setPipForm({ ...pipForm, employee_id: v })}
                    placeholder="Select Employee..."
                  />
                </div>
                <Input label="Start Date" type="date" value={pipForm.start_date} onChange={(e: any) => setPipForm({ ...pipForm, start_date: e.target.value })} />
                <Input label="End Date" type="date" value={pipForm.end_date} onChange={(e: any) => setPipForm({ ...pipForm, end_date: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Deficiency / Performance Gap</label>
                  <textarea rows={2} value={pipForm.deficiency} onChange={e => setPipForm({ ...pipForm, deficiency: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="Describe the performance issue..." />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Improvement Objective</label>
                  <textarea rows={2} value={pipForm.improvement_objective} onChange={e => setPipForm({ ...pipForm, improvement_objective: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="What must improve..." />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Action Steps</label>
                  <textarea rows={2} value={pipForm.action_steps} onChange={e => setPipForm({ ...pipForm, action_steps: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="Steps to achieve improvement..." />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Support Provided</label>
                  <textarea rows={2} value={pipForm.support_provided} onChange={e => setPipForm({ ...pipForm, support_provided: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="Training, mentoring, etc..." />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Input label="Progress Check Date" type="date" value={pipForm.progress_check_date} onChange={(e: any) => setPipForm({ ...pipForm, progress_check_date: e.target.value })} />
                <Input label="Supervisor Name" value={pipForm.supervisor_name} onChange={(e: any) => setPipForm({ ...pipForm, supervisor_name: e.target.value })} />
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Outcome</label>
                  <select value={pipForm.outcome} onChange={e => setPipForm({ ...pipForm, outcome: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100">
                    <option value="">Select Outcome...</option><option>In Progress</option><option>Improved</option><option>Escalated</option><option>Completed</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Progress Notes</label>
                <textarea rows={2} value={pipForm.progress_notes} onChange={e => setPipForm({ ...pipForm, progress_notes: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="Notes from check-in meetings..." />
              </div>
              <div className="flex justify-end">
                <button type="submit" className="bg-amber-500 text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-amber-600">{editingId ? 'Update PIP' : 'Create PIP'}</button>
              </div>
            </form>
          </Card>
        </motion.div>
      )}

      {/* IDP Form */}
      {showForm === 'idp' && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4">
          <Card>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 border-b dark:border-slate-800 pb-2">New Individual Development Plan (IDP)</h3>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); submitIDP(); }}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employee</label>
                  <SearchableSelect
                    options={employees.map(e => ({ value: String(e.id), label: e.name }))}
                    value={idpForm.employee_id}
                    onChange={v => setIdpForm({ ...idpForm, employee_id: v })}
                    placeholder="Select Employee..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Status</label>
                  <select value={idpForm.status} onChange={e => setIdpForm({ ...idpForm, status: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100">
                    <option value="">Select Status...</option><option>Not Started</option><option>In Progress</option><option>Completed</option>
                  </select>
                </div>
              </div>
              <Input label="Skill Gap" value={idpForm.skill_gap} onChange={(e: any) => setIdpForm({ ...idpForm, skill_gap: e.target.value })} placeholder="e.g. Leadership, Communication, Technical..." />
              <Input label="Growth Step / Action Plan" value={idpForm.growth_step} onChange={(e: any) => setIdpForm({ ...idpForm, growth_step: e.target.value })} placeholder="Training, mentoring, course, certification..." />
              <div className="flex justify-end">
                <button type="submit" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green">Create IDP</button>
              </div>
            </form>
          </Card>
        </motion.div>
      )}

      {/* Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
                <td className="py-3 font-medium text-slate-700 dark:text-slate-200">{getEmployeeName(p.employee_id)}</td>
                <td className="py-3 text-slate-500 dark:text-slate-400 max-w-xs truncate">{p.deficiency}</td>
                <td className="py-3 text-xs text-slate-400">{p.start_date || '—'} → {p.end_date || '—'}</td>
                <td className="py-3">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${p.outcome === 'Improved' || p.outcome === 'Completed' ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30' : p.outcome === 'Escalated' ? 'text-red-600 bg-red-50 dark:bg-red-900/30' : 'text-amber-600 bg-amber-50 dark:bg-amber-900/30'}`}>
                    {p.outcome || 'In Progress'}
                  </span>
                </td>
                <td className="py-3 flex gap-2">
                  <button onClick={() => editPIP(p)} className="text-teal-500 hover:text-teal-700"><Edit3 size={14} /></button>
                  <button onClick={() => deletePIP(p.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
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
                  <td className="py-3 font-medium text-slate-700 dark:text-slate-200">{getEmployeeName(p.employee_id)}</td>
                  <td className="py-3 text-slate-500 dark:text-slate-400">{p.skill_gap}</td>
                  <td className="py-3 text-slate-500 dark:text-slate-400">{p.growth_step}</td>
                  <td className="py-3">
                    <select value={p.status || 'Not Started'} onChange={e => updateIDPStatus(p.id, e.target.value)} className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border-0 cursor-pointer ${p.status === 'Completed' ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30' : p.status === 'In Progress' ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/30' : 'text-slate-500 bg-slate-100 dark:bg-slate-800'}`}>
                      <option value="Not Started">Not Started</option><option value="In Progress">In Progress</option><option value="Completed">Completed</option>
                    </select>
                  </td>
                  <td className="py-3 flex gap-2">
                    {p.status !== 'Completed' && <button onClick={() => updateIDPStatus(p.id, 'Completed')} className="text-emerald-400 hover:text-emerald-600"><CheckCircle size={14} /></button>}
                    <button onClick={() => deleteIDP(p.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
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
