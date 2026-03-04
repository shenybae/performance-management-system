import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Users, Package, History, ChevronRight, Edit3, Save, X, ShieldAlert } from 'lucide-react';
import { Employee } from '../../../types';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';

interface EmployeeJacketProps {
  employee: Employee | null;
  onBack: () => void;
}

export const EmployeeJacket = ({ employee, onBack }: EmployeeJacketProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '', position: '', dept: '', hire_date: '', salary_base: 0, ssn: '', status: ''
  });

  if (!employee) return <div>Select an employee from the directory.</div>;

  const startEdit = () => {
    setEditForm({
      name: employee.name || '', position: employee.position || '', dept: employee.dept || '',
      hire_date: employee.hire_date || '', salary_base: employee.salary_base || 0,
      ssn: employee.ssn || '', status: employee.status || ''
    });
    setIsEditing(true);
  };

  const saveEdit = async () => {
    const token = localStorage.getItem('talentflow_token');
    try {
      const res = await fetch(`/api/employees/${employee.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(editForm)
      });
      if (res.ok) {
        (window as any).notify?.('Employee updated', 'success');
        setIsEditing(false);
        onBack(); // go back to directory to refresh data
      } else {
        const err = await res.json();
        (window as any).notify?.(err.error || 'Failed to update', 'error');
      }
    } catch { (window as any).notify?.('Server error', 'error'); }
  };

  const InputField = ({ label, field, type = 'text' }: { label: string; field: string; type?: string }) => (
    <div>
      <label className="text-xs text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wider">{label}</label>
      {isEditing ? (
        <input type={type} value={(editForm as any)[field]} onChange={e => setEditForm(prev => ({ ...prev, [field]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))}
          className="w-full mt-1 p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" />
      ) : (
        <p className="text-slate-700 dark:text-slate-300 font-medium">{field === 'salary_base' ? `$${(employee as any)[field]?.toLocaleString()}` : (employee as any)[field]}</p>
      )}
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
      <div className="flex items-center gap-2 mb-4 text-slate-500 dark:text-slate-400 cursor-pointer hover:text-teal-deep transition-colors" onClick={onBack}>
        <ChevronRight className="rotate-180" size={16} /> Back to Directory
      </div>
      <SectionHeader title={`Digital 201 Jacket: ${employee.name}`} subtitle="Comprehensive employee profile and history" />
      
      <div className="flex items-center justify-end gap-2 mb-4">
        {isEditing ? (
          <>
            <button onClick={saveEdit} className="flex items-center gap-1 px-4 py-2 text-sm font-bold text-white bg-teal-deep hover:bg-teal-green rounded-xl transition-colors"><Save size={14} /> Save Changes</button>
            <button onClick={() => setIsEditing(false)} className="flex items-center gap-1 px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"><X size={14} /> Cancel</button>
          </>
        ) : (
          <button onClick={startEdit} className="flex items-center gap-1 px-4 py-2 text-sm font-bold text-teal-deep dark:text-teal-green hover:bg-teal-deep/10 rounded-xl transition-colors"><Edit3 size={14} /> Edit Profile</button>
        )}
        <button onClick={async () => {
          if (!confirm('Delete this employee? This action cannot be undone.')) return;
          const token = localStorage.getItem('talentflow_token');
          try {
            const res = await fetch(`/api/employees/${employee.id}`, { method: 'DELETE', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
            if (res.ok) { (window as any).notify('Employee deleted', 'success'); onBack(); }
            else { const err = await res.json(); (window as any).notify(err.error || 'Failed to delete', 'error'); }
          } catch { (window as any).notify('Server error', 'error'); }
        }} className="px-3 py-2 text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">Delete Employee</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-teal-deep dark:text-teal-green"><Users size={18} className="text-teal-green" /> Personal Profile</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {isEditing && <InputField label="Full Name" field="name" />}
            <InputField label="Position" field="position" />
            <InputField label="Department" field="dept" />
            <InputField label="Hire Date" field="hire_date" type="date" />
            <InputField label="SSN" field="ssn" />
            <InputField label="Base Salary" field="salary_base" type="number" />
            {isEditing && (
              <div>
                <label className="text-xs text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wider">Status</label>
                <select value={editForm.status} onChange={e => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full mt-1 p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100">
                  <option value="">Select Status...</option><option>Probationary</option><option>Regular</option><option>Resigned</option><option>Terminated</option>
                </select>
              </div>
            )}
            {!isEditing && (
              <div>
                <label className="text-xs text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wider">Status</label>
                <p className={`font-medium ${employee.status === 'Regular' ? 'text-emerald-600' : employee.status === 'Probationary' ? 'text-amber-500' : 'text-red-500'}`}>{employee.status}</p>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-teal-deep dark:text-teal-green"><Package size={18} className="text-teal-green" /> Property Accountability</h3>
          <div className="space-y-3">
            {employee.property?.length ? employee.property.map(p => (
              <div key={p.id} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{p.brand}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">SN: {p.serial_no} | Qty: {p.uom_qty}</p>
              </div>
            )) : <p className="text-sm text-slate-400 dark:text-slate-500 italic">No assets assigned.</p>}
          </div>
        </Card>

        {/* Discipline History */}
        {employee.discipline && employee.discipline.length > 0 && (
          <Card className="md:col-span-3">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-teal-deep dark:text-teal-green"><ShieldAlert size={18} className="text-amber-500" /> Disciplinary Records</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="pb-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Date</th>
                  <th className="pb-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Violation</th>
                  <th className="pb-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Warning Level</th>
                  <th className="pb-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Action</th>
                </tr></thead>
                <tbody>
                  {employee.discipline.map(d => (
                    <tr key={d.id} className="border-b border-slate-50 dark:border-slate-800/50">
                      <td className="py-2 text-slate-600 dark:text-slate-400">{(d as any).date_of_warning || '—'}</td>
                      <td className="py-2 text-slate-700 dark:text-slate-300">{d.violation_type}</td>
                      <td className="py-2"><span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${d.warning_level === 'Written Warning' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700' : d.warning_level === 'Final Warning' ? 'bg-red-100 dark:bg-red-900/30 text-red-700' : 'bg-slate-100 dark:bg-slate-800 text-slate-600'}`}>{d.warning_level}</span></td>
                      <td className="py-2 text-xs text-slate-500 dark:text-slate-400">{d.action_taken}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <Card className="md:col-span-3">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-teal-deep dark:text-teal-green"><History size={18} className="text-teal-green" /> Career History & Appraisals</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="pb-2 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px]">Date</th>
                  <th className="pb-2 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px]">Type</th>
                  <th className="pb-2 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px]">Overall Rating</th>
                  <th className="pb-2 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px]">Status</th>
                  <th className="pb-2 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px]">Verified</th>
                </tr>
              </thead>
              <tbody>
                {employee.appraisals?.map(a => (
                  <tr key={a.id} className="border-b border-slate-50 dark:border-slate-800/50">
                    <td className="py-2 text-slate-600 dark:text-slate-400">{a.sign_off_date}</td>
                    <td className="py-2 text-xs text-slate-500">{(a as any).form_type || (a as any).eval_type || '—'}</td>
                    <td className="py-2 font-bold text-teal-green">{a.overall}/5.0</td>
                    <td className="py-2 text-slate-600 dark:text-slate-400">{a.promotability_status}</td>
                    <td className="py-2">{(a as any).verified ? <span className="text-[10px] font-bold text-emerald-600">VERIFIED</span> : <span className="text-[10px] font-bold text-amber-500">PENDING</span>}</td>
                  </tr>
                ))}
                {(!employee.appraisals || employee.appraisals.length === 0) && <tr><td colSpan={5} className="py-6 text-center text-sm text-slate-400">No appraisals on record.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </motion.div>
  );
};
