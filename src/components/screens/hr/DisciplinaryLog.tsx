import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ShieldAlert, Plus, X, Download, Trash2 } from 'lucide-react';
import { Employee } from '../../../types';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';

interface DisciplinaryLogProps {
  employees: Employee[];
}

export const DisciplinaryLog = ({ employees }: DisciplinaryLogProps) => {
  const [showForm, setShowForm] = useState(false);
  const [records, setRecords] = useState<any[]>([]);
  const [form, setForm] = useState({
    employee_id: '', violation_type: [] as string[], warning_level: '1st',
    date_of_warning: new Date().toISOString().split('T')[0],
    violation_date: '', violation_time: '', violation_place: '',
    employer_statement: '', employee_statement: '', action_taken: '',
    approved_by_name: '', approved_by_title: '',
    copy_distribution: [] as string[],
    supervisor: ''
  });

  useEffect(() => { fetchRecords(); }, []);

  const fetchRecords = async () => {
    try {
      const res = await fetch('/api/discipline_records', { headers: getAuthHeaders() });
      const data = await res.json();
      setRecords(Array.isArray(data) ? data : []);
    } catch { setRecords([]); }
  };

  const handleSubmit = async () => {
    if (!form.employee_id || form.violation_type.length === 0) {
      window.notify?.('Please select an employee and violation type', 'error');
      return;
    }
    try {
      const res = await fetch('/api/discipline_records', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ ...form, employee_id: parseInt(form.employee_id), violation_type: form.violation_type.join(', ') }),
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Disciplinary action saved', 'success');
      setForm({
        employee_id: '', violation_type: [], warning_level: '1st',
        date_of_warning: new Date().toISOString().split('T')[0],
        violation_date: '', violation_time: '', violation_place: '',
        employer_statement: '', employee_statement: '', action_taken: '',
        approved_by_name: '', approved_by_title: '',
        copy_distribution: [],
        supervisor: ''
      });
      setShowForm(false);
      fetchRecords();
    } catch { window.notify?.('Failed to save disciplinary action', 'error'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this record?')) return;
    try {
      await fetch(`/api/discipline_records/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      window.notify?.('Record deleted', 'success');
      fetchRecords();
    } catch { window.notify?.('Failed to delete', 'error'); }
  };

  const toggleViolation = (v: string) => {
    setForm(prev => ({ ...prev, violation_type: prev.violation_type.includes(v) ? prev.violation_type.filter(x => x !== v) : [...prev.violation_type, v] }));
  };

  const violationTypes = records.reduce((acc: any, curr: any) => {
    (curr.violation_type || '').split(', ').forEach((v: string) => { if (v) acc[v] = (acc[v] || 0) + 1; });
    return acc;
  }, {});
  const pieData = Object.keys(violationTypes).map(key => ({ name: key, value: violationTypes[key] }));
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#ef4444'];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-4">
        <SectionHeader title="Disciplinary & Warning Log" subtitle="Track behavioral issues and corrective actions" />
        <div className="flex gap-2">
          <button onClick={() => exportToCSV(records, 'discipline_records')} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            <Download size={16} /> Export CSV
          </button>
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 bg-teal-deep text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-teal-green transition-colors">
            {showForm ? <><X size={16} /> Close Form</> : <><Plus size={16} /> New Action Form</>}
          </button>
        </div>
      </div>

      {showForm && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4">
          <Card>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 border-b dark:border-slate-800 pb-2">Employee Disciplinary Action Form</h3>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); handleSubmit(); }}>
              {/* Header Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employee Name</label>
                  <select value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100">
                    <option value="">Select Employee...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Date of Warning</label>
                  <input type="date" value={form.date_of_warning} onChange={e => setForm({ ...form, date_of_warning: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Department</label>
                  <input type="text" value={form.employee_id ? (employees.find(e => e.id === parseInt(form.employee_id))?.dept || '') : ''} disabled className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 rounded-lg text-sm text-slate-500 dark:text-slate-400" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Supervisor</label>
                  <input type="text" value={form.supervisor} onChange={e => setForm({ ...form, supervisor: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" placeholder="Supervisor name" />
                </div>
              </div>

              {/* Type of Violation & Warning */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t dark:border-slate-800">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Type of Violation</label>
                  <div className="grid grid-cols-2 gap-2 text-sm text-slate-600 dark:text-slate-300">
                    {['Attendance', 'Carelessness', 'Disobedience', 'Safety', 'Tardiness', 'Work Quality', 'Other'].map(v => (
                      <label key={v} className="flex items-center gap-2"><input type="checkbox" checked={form.violation_type.includes(v)} onChange={() => toggleViolation(v)} className="rounded" /> {v}</label>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Warning Level</label>
                    <select value={form.warning_level} onChange={e => setForm({ ...form, warning_level: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100">
                      <option value="1st">1st Warning</option>
                      <option value="2nd">2nd Warning</option>
                      <option value="3rd">3rd Warning</option>
                      <option value="Final">Final Warning</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Violation Date</label>
                    <input type="date" value={form.violation_date} onChange={e => setForm({ ...form, violation_date: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Violation Time (a.m./p.m.)</label>
                    <input type="time" value={form.violation_time} onChange={e => setForm({ ...form, violation_time: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Place Violation Occurred</label>
                    <input type="text" value={form.violation_place} onChange={e => setForm({ ...form, violation_place: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" />
                  </div>
                </div>
              </div>

              {/* Statements */}
              <div className="pt-4 border-t dark:border-slate-800">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employer Statement</label>
                <textarea rows={3} value={form.employer_statement} onChange={e => setForm({ ...form, employer_statement: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" placeholder="Describe the violation and circumstances..."></textarea>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employee Statement</label>
                <textarea rows={3} value={form.employee_statement} onChange={e => setForm({ ...form, employee_statement: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" placeholder="Employee's response or explanation..."></textarea>
              </div>

              {/* Warning Decision */}
              <div className="pt-4 border-t dark:border-slate-800">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Warning Decision</h4>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Action Taken / Decision</label>
                  <textarea rows={2} value={form.action_taken} onChange={e => setForm({ ...form, action_taken: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100"></textarea>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Approved By (Name)</label>
                    <input type="text" value={form.approved_by_name} onChange={e => setForm({ ...form, approved_by_name: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Title</label>
                    <input type="text" value={form.approved_by_title} onChange={e => setForm({ ...form, approved_by_title: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" />
                  </div>
                </div>
              </div>

              {/* Copy Distribution */}
              <div className="pt-4 border-t dark:border-slate-800">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Copy Distribution</label>
                <div className="flex gap-4 text-sm text-slate-600 dark:text-slate-300">
                  {['Employee', 'HR Dept', 'Supervisor'].map(c => (
                    <label key={c} className="flex items-center gap-2"><input type="checkbox" checked={form.copy_distribution.includes(c)} onChange={() => setForm(prev => ({ ...prev, copy_distribution: prev.copy_distribution.includes(c) ? prev.copy_distribution.filter(x => x !== c) : [...prev.copy_distribution, c] }))} className="rounded" /> {c}</label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button type="submit" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green">Save Disciplinary Action</button>
              </div>
            </form>
          </Card>
        </motion.div>
      )}

      {records.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <Card>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">Violations by Type</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {pieData.map((_e, i) => (<Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />))}
                </Pie><Tooltip /></PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">Recent Actions</h3>
            <div className="space-y-4 overflow-y-auto h-64 pr-2 custom-scrollbar">
              {records.slice(0, 5).map((d: any) => (
                <div key={d.id} className="p-3 border border-slate-100 dark:border-slate-800 bg-white dark:bg-black rounded-lg">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-bold text-slate-700 dark:text-slate-200 text-sm">{d.employee_name || `Employee #${d.employee_id}`}</span>
                    <span className="text-[10px] bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded uppercase font-bold">{d.warning_level}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{d.violation_type}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <Card>
        <div className="space-y-4">
          {records.map((d: any) => (
            <div key={d.id} className="p-4 border border-red-100 dark:border-red-900/30 bg-red-50 dark:bg-red-900/10 rounded-xl flex gap-4">
              <div className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-3 rounded-full h-fit"><ShieldAlert size={20} /></div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-slate-800 dark:text-slate-100">{d.employee_name || `Employee #${d.employee_id}`}</span>
                  <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded uppercase font-bold tracking-wider">{d.warning_level} Warning</span>
                </div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{d.violation_type}</p>
                {d.employer_statement && <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 italic">"{d.employer_statement}"</p>}
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex gap-2">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Action Taken:</span>
                    <span className="text-[10px] font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest">{d.action_taken || 'N/A'}</span>
                  </div>
                  <button onClick={() => handleDelete(d.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
          {records.length === 0 && <p className="text-center text-slate-400 py-10">No disciplinary records found.</p>}
        </div>
      </Card>
    </motion.div>
  );
};
