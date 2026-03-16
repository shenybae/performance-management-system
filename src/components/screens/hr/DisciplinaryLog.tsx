import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ShieldAlert, Plus, X, Download, Trash2, Search, FileText } from 'lucide-react';
import { Employee } from '../../../types';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { SearchableSelect } from '../../common/SearchableSelect';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';
import { SignatureUpload } from '../../common/SignatureUpload';
import { sigBlockHtml } from '../../../utils/print';

interface DisciplinaryLogProps {
  employees: Employee[];
}

export const DisciplinaryLog = ({ employees }: DisciplinaryLogProps) => {
  const [showForm, setShowForm] = useState(false);
  const [records, setRecords] = useState<any[]>([]);
  const [form, setForm] = useState({
    employee_id: '', violation_type: [] as string[], warning_level: '',
    date_of_warning: '',
    violation_date: '', violation_time: '', violation_place: '',
    employer_statement: '', employee_statement: '', action_taken: '',
    approved_by_name: '', approved_by_title: '', approved_by_date: '',
    copy_distribution: [] as string[],
    supervisor: '',
    prev_first_date: '', prev_first_type: '',
    prev_second_date: '', prev_second_type: '',
    prev_third_date: '', prev_third_type: '',
    employee_signature: '', employee_signature_date: '',
    preparer_signature: '', preparer_signature_date: '',
    supervisor_signature: '', supervisor_signature_date: '',
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
        body: JSON.stringify({
          ...form,
          employee_id: parseInt(form.employee_id),
          violation_type: form.violation_type.join(', '),
          copy_distribution: form.copy_distribution.join(', '),
        }),
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Disciplinary action saved', 'success');
      setForm({
        employee_id: '', violation_type: [], warning_level: '',
        date_of_warning: '',
        violation_date: '', violation_time: '', violation_place: '',
        employer_statement: '', employee_statement: '', action_taken: '',
        approved_by_name: '', approved_by_title: '', approved_by_date: '',
        copy_distribution: [],
        supervisor: '',
        prev_first_date: '', prev_first_type: '',
        prev_second_date: '', prev_second_type: '',
        prev_third_date: '', prev_third_type: '',
        employee_signature: '', employee_signature_date: '',
        preparer_signature: '', preparer_signature_date: '',
        supervisor_signature: '', supervisor_signature_date: '',
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

  // --- computed analytics ---
  const violationTypes = records.reduce((acc: any, curr: any) => {
    (curr.violation_type || '').split(', ').forEach((v: string) => { if (v) acc[v] = (acc[v] || 0) + 1; });
    return acc;
  }, {});
  const pieData = Object.keys(violationTypes).map(key => ({ name: key, value: violationTypes[key] }));
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#ef4444', '#8b5cf6', '#f59e0b'];

  const warningLevelData = ['1st', '2nd', '3rd', 'Final'].map(level => ({
    level,
    count: records.filter(r => r.warning_level === level).length,
  }));

  const employeeCounts = records.reduce((acc: any, r: any) => {
    const name = r.employee_name || `#${r.employee_id}`;
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});
  const topEmployees = Object.entries(employeeCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a: any, b: any) => b.count - a.count)
    .slice(0, 6);

  const mostCommonViolation = pieData.sort((a, b) => b.value - a.value)[0]?.name || '—';
  const mostWarnedEmployee = topEmployees[0]?.name || '—';
  const finalWarnings = records.filter(r => r.warning_level === 'Final').length;

  const [expandedRecord, setExpandedRecord] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const filteredRecords = records.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (r.employee_name || '').toLowerCase().includes(q) ||
      (r.violation_type || '').toLowerCase().includes(q) ||
      (r.warning_level || '').toLowerCase().includes(q) ||
      (r.dept || '').toLowerCase().includes(q) ||
      (r.supervisor || '').toLowerCase().includes(q) ||
      (r.action_taken || '').toLowerCase().includes(q)
    );
  });

  const exportPersonPdf = (record: any) => {
    const empName = record.employee_name || `Employee #${record.employee_id}`;
    const personRecords = records.filter(r => r.employee_id === record.employee_id);
    const w = window.open('', '_blank');
    if (!w) { (window as any).notify?.('Please allow popups to export PDF', 'error'); return; }
    const sigBlock = (src: string | null, label: string, date: string | null, printedName?: string) => sigBlockHtml(src, label, date, printedName, 0);
    const rows = personRecords.map((r: any) => `
      <div style="border:1px solid #ddd;border-radius:8px;padding:20px;margin-bottom:20px;page-break-inside:avoid;">
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
          <tr><td style="padding:4px 8px;font-weight:bold;width:180px;color:#555;">Date of Warning</td><td style="padding:4px 8px;">${r.date_of_warning || '—'}</td><td style="padding:4px 8px;font-weight:bold;width:180px;color:#555;">Warning Level</td><td style="padding:4px 8px;"><span style="background:${r.warning_level === 'Final' ? '#fecaca' : r.warning_level === '3rd' ? '#fed7aa' : r.warning_level === '2nd' ? '#fef3c7' : '#ccfbf1'};color:${r.warning_level === 'Final' ? '#b91c1c' : r.warning_level === '3rd' ? '#c2410c' : r.warning_level === '2nd' ? '#b45309' : '#0f766e'};padding:2px 10px;border-radius:12px;font-weight:bold;font-size:11px;text-transform:uppercase;">${r.warning_level}</span></td></tr>
          <tr><td style="padding:4px 8px;font-weight:bold;color:#555;">Violation Type</td><td style="padding:4px 8px;">${r.violation_type || '—'}</td><td style="padding:4px 8px;font-weight:bold;color:#555;">Violation Date</td><td style="padding:4px 8px;">${r.violation_date || '—'}</td></tr>
          <tr><td style="padding:4px 8px;font-weight:bold;color:#555;">Time</td><td style="padding:4px 8px;">${r.violation_time || '—'}</td><td style="padding:4px 8px;font-weight:bold;color:#555;">Place</td><td style="padding:4px 8px;">${r.violation_place || '—'}</td></tr>
          <tr><td style="padding:4px 8px;font-weight:bold;color:#555;">Supervisor</td><td style="padding:4px 8px;">${r.supervisor || '—'}</td><td style="padding:4px 8px;font-weight:bold;color:#555;">Approved By</td><td style="padding:4px 8px;">${r.approved_by_name || '—'}${r.approved_by_title ? ', ' + r.approved_by_title : ''}</td></tr>
        </table>
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid #eee;">
          <p style="font-weight:bold;color:#555;font-size:12px;text-transform:uppercase;margin-bottom:4px;">Employer Statement</p>
          <p style="font-size:13px;color:#333;white-space:pre-wrap;">${r.employer_statement || '—'}</p>
        </div>
        <div style="margin-top:8px;">
          <p style="font-weight:bold;color:#555;font-size:12px;text-transform:uppercase;margin-bottom:4px;">Employee Statement</p>
          <p style="font-size:13px;color:#333;white-space:pre-wrap;">${r.employee_statement || '—'}</p>
        </div>
        <div style="margin-top:8px;">
          <p style="font-weight:bold;color:#555;font-size:12px;text-transform:uppercase;margin-bottom:4px;">Action Taken</p>
          <p style="font-size:13px;color:#333;white-space:pre-wrap;">${r.action_taken || '—'}</p>
        </div>
        ${(r.prev_first_date || r.prev_second_date || r.prev_third_date) ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #eee;"><p style="font-weight:bold;color:#555;font-size:12px;text-transform:uppercase;margin-bottom:4px;">Previous Warnings</p><div style="display:flex;gap:12px;font-size:12px;">${r.prev_first_date ? '<div style="border:1px solid #ddd;padding:6px 10px;border-radius:6px;"><strong>1st</strong> — ' + r.prev_first_date + ' (' + (r.prev_first_type || '—') + ')</div>' : ''}${r.prev_second_date ? '<div style="border:1px solid #ddd;padding:6px 10px;border-radius:6px;"><strong>2nd</strong> — ' + r.prev_second_date + ' (' + (r.prev_second_type || '—') + ')</div>' : ''}${r.prev_third_date ? '<div style="border:1px solid #ddd;padding:6px 10px;border-radius:6px;"><strong>3rd</strong> — ' + r.prev_third_date + ' (' + (r.prev_third_type || '—') + ')</div>' : ''}</div></div>` : ''}
        <div style="margin-top:16px;padding-top:16px;border-top:1px solid #eee;">
          <p style="font-size:11px;color:#666;font-style:italic;margin:0 0 12px;">"I have read this warning decision. My signature does not necessarily indicate agreement."</p>
          <div style="display:flex;gap:8px;overflow:hidden;">
            ${sigBlock(r.employee_signature, 'Employee Signature', r.employee_signature_date, r.employee_name || '')}
            ${sigBlock(r.preparer_signature, 'Preparer Signature', r.preparer_signature_date, r.approved_by_name || '')}
            ${sigBlock(r.supervisor_signature, 'Supervisor Signature', r.supervisor_signature_date, r.supervisor || '')}
          </div>
        </div>
      </div>
    `).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>Disciplinary Report — ${empName}</title><style>@media print{body{margin:0;padding:20px;}}</style></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:900px;margin:0 auto;padding:30px;color:#1e293b;">
      <div style="text-align:center;margin-bottom:24px;border-bottom:2px solid #0d9488;padding-bottom:16px;">
        <h1 style="margin:0;font-size:22px;color:#0d9488;">Disciplinary Action Report</h1>
        <p style="margin:4px 0 0;font-size:14px;color:#64748b;">${empName} — ${personRecords.length} record(s)</p>
      </div>
      <div style="display:flex;gap:16px;margin-bottom:20px;font-size:13px;">
        <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;"><strong>Department:</strong> ${personRecords[0]?.dept || '—'}</div>
        <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;"><strong>Position:</strong> ${(employees.find(e => e.id === record.employee_id) || {} as any).position || '—'}</div>
      </div>
      ${rows}
      <div style="text-align:center;margin-top:30px;font-size:11px;color:#94a3b8;">Generated on ${new Date().toLocaleDateString()} — Performance Management System</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => {
      w.print();
      try { fetch('/api/activity', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ action: 'print', description: `Disciplinary Report — ${empName}`, entity: 'discipline_record', entity_id: record.employee_id || null, meta: { source: 'DisciplinaryLog', rows: personRecords.length } }) }).catch(() => {}); } catch {};
    }, 400);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-4">
        <SectionHeader title="Disciplinary & Warning Log" subtitle="Track behavioral issues and corrective actions" />
        <div className="flex gap-2">
          <button onClick={() => exportToCSV(records, 'discipline_records')} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            <Download size={16} /> Export XLSX
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
                  <SearchableSelect
                    options={employees.map(e => ({ value: String(e.id), label: e.name }))}
                    value={form.employee_id}
                    onChange={v => setForm({ ...form, employee_id: v })}
                    placeholder="Select Employee..."
                  />
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
                  <SearchableSelect options={employees.map(e => ({ value: e.id, label: e.name }))} value={employees.find(e => e.name === form.supervisor)?.id || ''} onChange={(id: any) => setForm({ ...form, supervisor: employees.find(e => e.id === id)?.name || '' })} placeholder="Select supervisor..." />
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
                      <option value="">Select Warning Level...</option>
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
                <div className="grid grid-cols-3 gap-4 mt-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Approved By (Name)</label>
                    <input type="text" value={form.approved_by_name} onChange={e => setForm({ ...form, approved_by_name: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Title</label>
                    <input type="text" value={form.approved_by_title} onChange={e => setForm({ ...form, approved_by_title: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Date</label>
                    <input type="date" value={form.approved_by_date} onChange={e => setForm({ ...form, approved_by_date: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" />
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

              {/* Previous Warnings */}
              <div className="pt-4 border-t dark:border-slate-800">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Previous Warnings</h4>
                <div className="w-full text-sm">
                  <div className="grid grid-cols-3 gap-2 mb-2 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase px-1">
                    <span>Warning</span>
                    <span>Date</span>
                    <span>Type (Verbal / Written)</span>
                  </div>
                  {([
                    { label: '1st Warning', dateKey: 'prev_first_date', typeKey: 'prev_first_type' },
                    { label: '2nd Warning', dateKey: 'prev_second_date', typeKey: 'prev_second_type' },
                    { label: '3rd Warning', dateKey: 'prev_third_date', typeKey: 'prev_third_type' },
                  ] as const).map(row => (
                    <div key={row.label} className="grid grid-cols-3 gap-2 mb-2 items-center">
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-300 px-1">{row.label}</span>
                      <input type="date" value={(form as any)[row.dateKey]} onChange={e => setForm({ ...form, [row.dateKey]: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" />
                      <select value={(form as any)[row.typeKey]} onChange={e => setForm({ ...form, [row.typeKey]: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100">
                        <option value="">—</option>
                        <option value="Verbal">Verbal</option>
                        <option value="Written">Written</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Signatures */}
              <div className="pt-4 border-t dark:border-slate-800">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-2">Signatures</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 italic mb-4">
                  "I have read this warning decision. My signature does not necessarily indicate agreement. I understand that continued violation may result in further disciplinary action."
                </p>
                {([
                  { label: 'Employee Signature', sigKey: 'employee_signature', dateKey: 'employee_signature_date' },
                  { label: 'Signature of Person Who Prepared Warning', sigKey: 'preparer_signature', dateKey: 'preparer_signature_date' },
                  { label: "Supervisor's Signature", sigKey: 'supervisor_signature', dateKey: 'supervisor_signature_date' },
                ] as const).map(sig => (
                  <div key={sig.label} className="grid grid-cols-2 gap-4 mb-3">
                    <SignatureUpload
                      label={sig.label}
                      value={(form as any)[sig.sigKey]}
                      onChange={dataUrl => setForm(prev => ({ ...prev, [sig.sigKey]: dataUrl }))}
                    />
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Date</label>
                      <input type="date" value={(form as any)[sig.dateKey]} onChange={e => setForm(prev => ({ ...prev, [sig.dateKey]: e.target.value }))} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-4">
                <button type="submit" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green">Save Disciplinary Action</button>
              </div>
            </form>
          </Card>
        </motion.div>
      )}

      {records.length > 0 && (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {[
              { label: 'Total Records', value: records.length, color: 'text-slate-700 dark:text-slate-100' },
              { label: 'Final Warnings', value: finalWarnings, color: 'text-red-600 dark:text-red-400' },
              { label: 'Most Common Violation', value: mostCommonViolation, color: 'text-amber-600 dark:text-amber-400' },
              { label: 'Most Warned Employee', value: mostWarnedEmployee, color: 'text-teal-deep dark:text-teal-green' },
            ].map(s => (
              <Card key={s.label}>
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">{s.label}</p>
                <p className={`text-xl font-bold truncate ${s.color}`}>{s.value}</p>
              </Card>
            ))}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Card>
              <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">Violations by Type</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={62} paddingAngle={4} dataKey="value">
                      {pieData.map((_e, i) => (<Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [`${value} record(s)`, 'Count']} />
                    <Legend layout="horizontal" verticalAlign="bottom" align="center" iconType="circle" iconSize={8} formatter={(value: string) => { const item = pieData.find(p => p.name === value); const total = pieData.reduce((s, p) => s + p.value, 0); return `${value} ${item && total ? Math.round((item.value / total) * 100) : 0}%`; }} wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">Warning Level Distribution</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={warningLevelData} barSize={32}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="level" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Records" radius={[4, 4, 0, 0]}>
                      {warningLevelData.map((entry, i) => (
                        <Cell key={i} fill={entry.level === 'Final' ? '#ef4444' : entry.level === '3rd' ? '#f97316' : entry.level === '2nd' ? '#f59e0b' : '#0d9488'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">Top Employees by Violations</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topEmployees} layout="vertical" barSize={16}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Violations" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </>
      )}

      {/* Full Records Table */}
      <Card>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase">All Disciplinary Records</h3>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Search records..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-green/50 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>
        </div>
        {filteredRecords.length === 0 ? (
          <p className="text-center text-slate-400 py-10">{search ? 'No records match your search.' : 'No disciplinary records found.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="border-b dark:border-slate-700 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="text-left py-2 pr-4">Employee</th>
                  <th className="text-left py-2 pr-4">Dept</th>
                  <th className="text-left py-2 pr-4">Warning</th>
                  <th className="text-left py-2 pr-4">Violation Type</th>
                  <th className="text-left py-2 pr-4">Violation Date</th>
                  <th className="text-left py-2 pr-4">Place</th>
                  <th className="text-left py-2 pr-4">Supervisor</th>
                  <th className="text-left py-2 pr-4">Approved By</th>
                  <th className="text-left py-2 pr-4">Action Taken</th>
                  <th className="text-left py-2 pr-4">Signatures</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((d: any) => (
                  <>
                    <tr
                      key={d.id}
                      className="border-b dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                      onClick={() => setExpandedRecord(expandedRecord === d.id ? null : d.id)}
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2 min-w-0">
                          <ShieldAlert size={14} className="text-red-400 shrink-0" />
                          <span
                            className="font-semibold text-slate-800 dark:text-slate-100 truncate max-w-[180px]"
                            title={d.employee_name || `#${d.employee_id}`}
                          >
                            {d.employee_name || `#${d.employee_id}`}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="max-w-[70px] truncate text-slate-500 dark:text-slate-400" title={d.dept || undefined}>{d.dept || '—'}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold ${
                          d.warning_level === 'Final' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                          d.warning_level === '3rd'   ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' :
                          d.warning_level === '2nd'   ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
                                                        'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400'
                        }`}>{d.warning_level}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="max-w-[130px] truncate text-slate-600 dark:text-slate-300" title={d.violation_type || undefined}>{d.violation_type || '—'}</div>
                      </td>
                      <td className="py-3 pr-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">{d.violation_date || '—'}</td>
                      <td className="py-3 pr-4">
                        <div className="max-w-[90px] truncate text-slate-500 dark:text-slate-400" title={d.violation_place || undefined}>{d.violation_place || '—'}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="max-w-[110px] truncate text-slate-500 dark:text-slate-400" title={d.supervisor || undefined}>{d.supervisor || '—'}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="max-w-[130px] truncate text-slate-500 dark:text-slate-400" title={d.approved_by_name ? `${d.approved_by_name}${d.approved_by_title ? `, ${d.approved_by_title}` : ''}` : undefined}>{d.approved_by_name ? `${d.approved_by_name}${d.approved_by_title ? `, ${d.approved_by_title}` : ''}` : '—'}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="max-w-[130px] truncate text-slate-600 dark:text-slate-300" title={d.action_taken || undefined}>{d.action_taken || '—'}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-row gap-1">
                          {d.employee_signature && <img src={d.employee_signature} alt="emp" className="h-6 w-10 object-contain rounded border border-slate-200 dark:border-slate-700" title="Employee Signature" />}
                          {d.preparer_signature && <img src={d.preparer_signature} alt="prep" className="h-6 w-10 object-contain rounded border border-slate-200 dark:border-slate-700" title="Preparer Signature" />}
                          {d.supervisor_signature && <img src={d.supervisor_signature} alt="sup" className="h-6 w-10 object-contain rounded border border-slate-200 dark:border-slate-700" title="Supervisor Signature" />}
                          {!d.employee_signature && !d.preparer_signature && !d.supervisor_signature && <span className="text-slate-400 text-xs">—</span>}
                        </div>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={e => { e.stopPropagation(); exportPersonPdf(d); }} className="text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 p-1" title="Export PDF Report"><FileText size={14} /></button>
                          <button onClick={e => { e.stopPropagation(); handleDelete(d.id); }} className="text-red-400 hover:text-red-600 p-1" title="Delete Record"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                    {expandedRecord === d.id && (
                      <tr key={`${d.id}-expanded`} className="bg-slate-50 dark:bg-slate-800/40">
                        <td colSpan={11} className="px-4 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                            <div className="space-y-2">
                              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Employer Statement</p>
                              <p className="text-slate-700 dark:text-slate-200 italic">{d.employer_statement || '—'}</p>
                              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-3">Employee Statement</p>
                              <p className="text-slate-700 dark:text-slate-200 italic">{d.employee_statement || '—'}</p>
                              {(d.prev_first_date || d.prev_second_date || d.prev_third_date) && (
                                <>
                                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-3">Previous Warnings</p>
                                  <div className="grid grid-cols-3 gap-2 text-xs text-slate-600 dark:text-slate-300">
                                    {[['1st', d.prev_first_date, d.prev_first_type], ['2nd', d.prev_second_date, d.prev_second_type], ['3rd', d.prev_third_date, d.prev_third_type]]
                                      .filter(([, date]) => date)
                                      .map(([label, date, type]) => (
                                        <div key={label as string} className="p-2 border border-slate-200 dark:border-slate-700 rounded-lg">
                                          <span className="font-bold">{label} Warning</span><br />{date}<br /><span className="text-slate-400">{type || '—'}</span>
                                        </div>
                                      ))}
                                  </div>
                                </>
                              )}
                              {d.copy_distribution && (
                                <>
                                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-3">Copy Distribution</p>
                                  <p className="text-slate-600 dark:text-slate-300">{d.copy_distribution}</p>
                                </>
                              )}
                            </div>
                            <div className="space-y-3">
                              {[['Employee Signature', d.employee_signature, d.employee_signature_date], ['Preparer Signature', d.preparer_signature, d.preparer_signature_date], ["Supervisor's Signature", d.supervisor_signature, d.supervisor_signature_date]].map(([label, sig, date]) => (
                                <div key={label as string}>
                                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                                  {sig ? (
                                    <div className="flex items-end gap-3">
                                      <img src={sig as string} alt={label as string} className="max-h-12 rounded border border-slate-200 dark:border-slate-700 bg-white" />
                                      {date && <span className="text-xs text-slate-500 dark:text-slate-400">{date as string}</span>}
                                    </div>
                                  ) : <span className="text-xs text-slate-400">Not signed</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </motion.div>
  );
};
