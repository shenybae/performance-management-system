import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Search, Plus, ChevronRight, X } from 'lucide-react';
import { Employee } from '../../../types';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';

interface EmployeeDirectoryProps {
  employees: Employee[];
  onSelectEmployee: (id: number) => void;
  onCreateEmployee?: () => void;
}

const inputCls = "w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-green/50";
const labelCls = "block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1";

export const EmployeeDirectory = ({ employees, onSelectEmployee, onCreateEmployee }: EmployeeDirectoryProps) => {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    name: '', position: '', dept: '', status: 'Probationary',
    hire_date: '', ssn: '', salary_base: '', manager_id: ''
  });

  const handleSubmit = async () => {
    if (!form.name.trim()) { (window as any).notify?.('Please enter employee name', 'error'); return; }
    if (!form.position.trim()) { (window as any).notify?.('Please enter position/title', 'error'); return; }
    if (!form.dept.trim()) { (window as any).notify?.('Please enter department', 'error'); return; }
    const token = localStorage.getItem('talentflow_token');
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          ...form,
          salary_base: form.salary_base ? parseFloat(form.salary_base) : 0,
          manager_id: form.manager_id ? parseInt(form.manager_id) : null
        })
      });
      if (res.ok) {
        (window as any).notify?.('Employee created successfully', 'success');
        setForm({ name: '', position: '', dept: '', status: 'Probationary', hire_date: '', ssn: '', salary_base: '', manager_id: '' });
        setShowForm(false);
        if (onCreateEmployee) onCreateEmployee();
      } else {
        const err = await res.json();
        (window as any).notify?.(err.error || 'Failed to create employee', 'error');
      }
    } catch (err) {
      (window as any).notify?.('Server error', 'error');
    }
  };

  const filtered = employees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.position?.toLowerCase().includes(search.toLowerCase()) ||
    e.dept?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <SectionHeader title="Employee Master Directory" subtitle="Manage personnel records and status" />

      {/* Add Employee Form */}
      {showForm && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4">
          <Card>
            <div className="flex justify-between items-center mb-4 border-b dark:border-slate-800 pb-2">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Add New Employee</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={20} /></button>
            </div>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); handleSubmit(); }}>
              {/* Identification Section */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Identification</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Employee Name <span className="text-red-500">*</span></label>
                    <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="Full Name" />
                  </div>
                  <div>
                    <label className={labelCls}>Position / Title <span className="text-red-500">*</span></label>
                    <input type="text" value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} className={inputCls} placeholder="e.g. Software Engineer" />
                  </div>
                  <div>
                    <label className={labelCls}>Department <span className="text-red-500">*</span></label>
                    <input type="text" value={form.dept} onChange={e => setForm({ ...form, dept: e.target.value })} className={inputCls} placeholder="e.g. Engineering" />
                  </div>
                  <div>
                    <label className={labelCls}>SSN / ID Number</label>
                    <input type="text" value={form.ssn} onChange={e => setForm({ ...form, ssn: e.target.value })} className={inputCls} placeholder="XXX-XX-XXXX" />
                  </div>
                </div>
              </div>

              {/* Employment Details Section */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Employment Details</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Employment Status</label>
                    <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={inputCls}>
                      <option value="Probationary">Probationary</option>
                      <option value="Permanent">Permanent</option>
                      <option value="Provisional/Temporary">Provisional / Temporary</option>
                      <option value="Hourly">Hourly</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Hire Date</label>
                    <input type="date" value={form.hire_date} onChange={e => setForm({ ...form, hire_date: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Base Salary</label>
                    <input type="number" step="0.01" value={form.salary_base} onChange={e => setForm({ ...form, salary_base: e.target.value })} className={inputCls} placeholder="0.00" />
                  </div>
                  <div>
                    <label className={labelCls}>Reporting Manager</label>
                    <select value={form.manager_id} onChange={e => setForm({ ...form, manager_id: e.target.value })} className={inputCls}>
                      <option value="">None</option>
                      {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} — {emp.position}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">Cancel</button>
                <button type="submit" className="gradient-bg text-white px-6 py-2 rounded-xl text-sm font-bold hover:opacity-90 transition-all shadow-lg shadow-teal-green/10">Create Employee</button>
              </div>
            </form>
          </Card>
        </motion.div>
      )}

      <Card>
        <div className="flex justify-between mb-4">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input 
              type="text" 
              placeholder="Search employees..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-green/50 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>
          <button onClick={() => setShowForm(!showForm)} className="gradient-bg text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:opacity-90 transition-all shadow-lg shadow-teal-green/10">
            {showForm ? <><X size={16} /> Close Form</> : <><Plus size={16} /> Add Employee</>}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Name</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Position</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Department</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Status</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <motion.tbody
              initial="hidden"
              animate="visible"
              variants={{
                visible: { transition: { staggerChildren: 0.05 } }
              }}
            >
              {filtered.map(emp => (
                <motion.tr 
                  key={emp.id} 
                  variants={{
                    hidden: { opacity: 0, x: -10 },
                    visible: { opacity: 1, x: 0 }
                  }}
                  className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors cursor-pointer group" 
                  onClick={() => onSelectEmployee(emp.id)}
                >
                  <td className="py-4 px-4 font-medium text-slate-700 dark:text-slate-100 group-hover:text-teal-deep dark:group-hover:text-teal-green">{emp.name}</td>
                  <td className="py-4 px-4 text-slate-600 dark:text-slate-200">{emp.position}</td>
                  <td className="py-4 px-4 text-slate-600 dark:text-slate-200">{emp.dept}</td>
                  <td className="py-4 px-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                      emp.status === 'Permanent' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                    }`}>
                      {emp.status}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <div className="flex justify-end">
                      <ChevronRight size={16} className="text-slate-400 group-hover:text-teal-deep dark:group-hover:text-teal-green" />
                    </div>
                  </td>
                </motion.tr>
              ))}
            </motion.tbody>
          </table>
        </div>
      </Card>
    </motion.div>
  );
};
