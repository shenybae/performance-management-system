import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Plus, X, Download, Search, Lock, FileText, Eye, Archive, CheckCircle } from 'lucide-react';
import { Employee } from '../../../types';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { SearchableSelect } from '../../common/SearchableSelect';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';
import { sigBlockHtml } from '../../../utils/print';
import { appConfirm } from '../../../utils/appDialog';

interface DisciplinaryLogProps {
  employees: Employee[];
  currentUser?: any | null;
}

export const DisciplinaryLog = ({ employees, currentUser }: DisciplinaryLogProps) => {
  const [showForm, setShowForm] = useState(false);
  const [records, setRecords] = useState<any[]>([]);
  const buildEmptyForm = () => ({
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
  const [form, setForm] = useState(buildEmptyForm);
  const todayISO = new Date().toISOString().split('T')[0];

  const userRole = String(currentUser?.role || '').toLowerCase();
  const isManager = userRole === 'manager';
  const managerDept = String(
    currentUser?.dept ||
    currentUser?.department ||
    currentUser?.employee?.dept ||
    currentUser?.employee_department ||
    ''
  ).trim();

  const scopedEmployees = useMemo(() => {
    if (!isManager || !managerDept) return employees;
    return employees.filter((e) => String(e.dept || '').trim().toLowerCase() === managerDept.toLowerCase());
  }, [employees, isManager, managerDept]);

  const selectedEmployee = useMemo(
    () => scopedEmployees.find((e) => e.id === Number(form.employee_id)) || null,
    [scopedEmployees, form.employee_id]
  );

  const currentManagerName = String(currentUser?.full_name || currentUser?.username || '').trim();

  const findDepartmentSupervisorName = (deptRaw: string) => {
    const deptNorm = String(deptRaw || '').trim().toLowerCase();
    if (!deptNorm) return '';
    const deptPeople = scopedEmployees.filter((e) => String(e.dept || '').trim().toLowerCase() === deptNorm);
    const byPosition = deptPeople.find((e) => String(e.position || '').toLowerCase().includes('supervisor'));
    if (byPosition?.name) return byPosition.name;
    const byName = deptPeople.find((e) => String(e.name || '').toLowerCase().includes('supervisor'));
    return byName?.name || '';
  };

  const derivedSupervisorName = useMemo(() => {
    const employeeDept = String(selectedEmployee?.dept || managerDept || '').trim();
    const deptSupervisor = findDepartmentSupervisorName(employeeDept);
    if (deptSupervisor) return deptSupervisor;

    const employeeManager = String((selectedEmployee as any)?.manager || '').trim();
    if (employeeManager) return employeeManager;

    const managerId = Number((selectedEmployee as any)?.manager_id || 0);
    if (managerId > 0) {
      const managerPerson = scopedEmployees.find((e) => e.id === managerId) || employees.find((e) => e.id === managerId);
      if (managerPerson?.name) return managerPerson.name;
    }

    return currentManagerName || '';
  }, [selectedEmployee, managerDept, scopedEmployees, employees, currentManagerName]);

  const trimText = (value: string) => value.trim();

  useEffect(() => { fetchRecords(); }, []);

  useEffect(() => {
    if (!showForm) return;
    if (!derivedSupervisorName) return;
    setForm((prev) => (prev.supervisor === derivedSupervisorName ? prev : { ...prev, supervisor: derivedSupervisorName }));
  }, [showForm, derivedSupervisorName]);

  const fetchRecords = async () => {
    try {
      const res = await fetch('/api/discipline_records', { headers: getAuthHeaders() });
      const data = await res.json();
      setRecords(Array.isArray(data) ? data : []);
    } catch { setRecords([]); }
  };

  const handleSubmit = async () => {
    if (!(await appConfirm('Save this disciplinary action?', { title: 'Save Disciplinary Action', confirmText: 'Save', icon: 'warning' }))) return;
    
    const cleaned = {
      ...form,
      violation_type: form.violation_type.filter(Boolean),
      copy_distribution: form.copy_distribution.filter(Boolean),
      warning_level: trimText(form.warning_level),
      date_of_warning: trimText(form.date_of_warning),
      violation_date: trimText(form.violation_date),
      violation_time: trimText(form.violation_time),
      violation_place: trimText(form.violation_place),
      employer_statement: trimText(form.employer_statement),
      employee_statement: trimText(form.employee_statement),
      action_taken: trimText(form.action_taken),
      approved_by_name: trimText(form.approved_by_name),
      approved_by_title: trimText(form.approved_by_title),
      approved_by_date: trimText(form.approved_by_date),
      supervisor: trimText(form.supervisor),
      prev_first_date: trimText(form.prev_first_date),
      prev_first_type: trimText(form.prev_first_type),
      prev_second_date: trimText(form.prev_second_date),
      prev_second_type: trimText(form.prev_second_type),
      prev_third_date: trimText(form.prev_third_date),
      prev_third_type: trimText(form.prev_third_type),
      employee_signature: trimText(form.employee_signature),
      employee_signature_date: trimText(form.employee_signature_date),
      preparer_signature: trimText(form.preparer_signature),
      preparer_signature_date: trimText(form.preparer_signature_date),
      supervisor_signature: trimText(form.supervisor_signature),
      supervisor_signature_date: trimText(form.supervisor_signature_date),
    };

    if (!cleaned.employee_id || cleaned.violation_type.length === 0) {
      window.notify?.('Please select an employee and at least one violation type', 'error');
      return;
    }
    if (!cleaned.warning_level) {
      window.notify?.('Please select warning level', 'error');
      return;
    }
    if (!cleaned.date_of_warning || !cleaned.violation_date || !cleaned.violation_time) {
      window.notify?.('Please provide warning date, violation date, and violation time', 'error');
      return;
    }
    if (cleaned.violation_date > cleaned.date_of_warning) {
      window.notify?.('Violation date cannot be after warning date', 'error');
      return;
    }
    if (!cleaned.violation_place) {
      window.notify?.('Please provide where the violation occurred', 'error');
      return;
    }
    if (!cleaned.supervisor) {
      window.notify?.('Please select the supervisor', 'error');
      return;
    }
    const selectedEmployeeName = (scopedEmployees.find(e => e.id === Number(cleaned.employee_id))?.name || '').trim().toLowerCase();
    if (selectedEmployeeName && cleaned.supervisor.trim().toLowerCase() === selectedEmployeeName) {
      window.notify?.('Employee and supervisor cannot be the same person', 'error');
      return;
    }
    if (cleaned.employer_statement.length < 10) {
      window.notify?.('Employer statement must be at least 10 characters', 'error');
      return;
    }
    if (!cleaned.action_taken || cleaned.action_taken.length < 10) {
      window.notify?.('Please provide action taken with at least 10 characters', 'error');
      return;
    }

    const approvedFields = [cleaned.approved_by_name, cleaned.approved_by_title, cleaned.approved_by_date];
    const hasAnyApprovedField = approvedFields.some(Boolean);
    if (hasAnyApprovedField && (!cleaned.approved_by_name || !cleaned.approved_by_title || !cleaned.approved_by_date)) {
      window.notify?.('Complete approver name, title, and date', 'error');
      return;
    }

    const previousWarningPairs = [
      ['1st', cleaned.prev_first_date, cleaned.prev_first_type],
      ['2nd', cleaned.prev_second_date, cleaned.prev_second_type],
      ['3rd', cleaned.prev_third_date, cleaned.prev_third_type],
    ] as const;
    for (const [label, date, type] of previousWarningPairs) {
      if ((date && !type) || (!date && type)) {
        window.notify?.(`${label} warning requires both date and type`, 'error');
        return;
      }
    }

    if (cleaned.copy_distribution.length === 0) {
      window.notify?.('Please select at least one copy distribution recipient', 'error');
      return;
    }

    try {
      const res = await fetch('/api/discipline_records', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({
          ...cleaned,
          employee_id: parseInt(cleaned.employee_id),
          violation_type: cleaned.violation_type.join(', '),
          copy_distribution: cleaned.copy_distribution.join(', '),
        }),
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Disciplinary action saved', 'success');
      setForm(buildEmptyForm());
      setShowForm(false);
      fetchRecords();
    } catch { window.notify?.('Failed to save disciplinary action', 'error'); }
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
  const [search, setSearch] = useState('');

  const filteredRecords = useMemo(() => {
    if (!search.trim()) return records;
    const q = search.toLowerCase();
    return records.filter((r: any) => (
      (r.employee_name || '').toLowerCase().includes(q) ||
      (r.violation_type || '').toLowerCase().includes(q) ||
      (r.warning_level || '').toLowerCase().includes(q) ||
      (r.dept || '').toLowerCase().includes(q) ||
      (r.supervisor || '').toLowerCase().includes(q) ||
      (r.action_taken || '').toLowerCase().includes(q)
    ));
  }, [records, search]);

  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const isFullyAcknowledged = (d: any) => {
    return !!d.preparer_signature && !!d.supervisor_signature && !!d.employee_signature;
  };

  const handleAcknowledge = async (id: number) => {
    if (!(await appConfirm('Mark this record as acknowledged?', { title: 'Acknowledge Record', confirmText: 'Acknowledge', icon: 'info' }))) return;
    setActionLoading(prev => ({ ...prev, [`ack-${id}`]: true }));
    try {
      await fetch(`/api/discipline_records/${id}/acknowledge`, { method: 'PUT', headers: getAuthHeaders() });
      window.notify?.('Record acknowledged', 'success');
      fetchRecords();
    } catch { window.notify?.('Failed to acknowledge', 'error'); }
    finally { setActionLoading(prev => ({ ...prev, [`ack-${id}`]: false })); }
  };

  const handleView = async (id: number) => {
    setActionLoading(prev => ({ ...prev, [`view-${id}`]: true }));
    try {
      const res = await fetch(`/api/discipline_records/${id}/view`, { method: 'PUT', headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Record marked as viewed', 'success');
      fetchRecords();
    } catch { window.notify?.('Failed to mark as viewed', 'error'); }
    finally { setActionLoading(prev => ({ ...prev, [`view-${id}`]: false })); }
  };

  const handleArchive = async (id: number) => {
    if (!(await appConfirm('Archive this disciplinary record?', { title: 'Archive Record', confirmText: 'Archive', icon: 'warning' }))) return;
    setActionLoading(prev => ({ ...prev, [`arch-${id}`]: true }));
    try {
      await fetch(`/api/discipline_records/${id}/archive`, { method: 'PUT', headers: getAuthHeaders() });
      window.notify?.('Record archived', 'success');
      fetchRecords();
    } catch { window.notify?.('Failed to archive', 'error'); }
    finally { setActionLoading(prev => ({ ...prev, [`arch-${id}`]: false })); }
  };

  const exportRecordAsPDF = (d: any) => {
    if (!isFullyAcknowledged(d)) {
      window.notify?.('PDF export is only available after all three parties have signed (Preparer, Supervisor, Employee).', 'error');
      return;
    }
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Disciplinary Action - ${d.employee_name || ''}</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:24px 32px}h1{font-size:17px;font-weight:900;margin-bottom:2px}h2{font-size:13px;font-weight:700;margin:16px 0 6px;border-bottom:1px solid #ccc;padding-bottom:3px}table{width:100%;border-collapse:collapse;margin-bottom:8px}td,th{padding:5px 8px;border:1px solid #ccc;font-size:11px;vertical-align:top}th{background:#f3f4f6;font-weight:700;text-align:left}.label{font-weight:700;width:30%}.sig-row{display:flex;gap:24px;margin-top:16px}.sig-block{flex:1;text-align:center}.sig-block img{max-height:44px;max-width:100%;object-fit:contain;display:block;margin:0 auto}.sig-line{width:80%;height:1px;border-bottom:1px solid #000;margin:0 auto 2px}.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:#dcfce7;color:#166534}</style></head>
<body>
<h1>Employee Disciplinary Action Form</h1>
<p style="color:#555;font-size:11px;">Generated ${new Date().toLocaleDateString()}</p>
<h2>Employee Information</h2>
<table><tr><td class="label">Employee Name</td><td>${d.employee_name || '—'}</td><td class="label">Department</td><td>${d.dept || '—'}</td></tr>
<tr><td class="label">Supervisor</td><td>${d.supervisor || '—'}</td><td class="label">Date of Warning</td><td>${d.date_of_warning || '—'}</td></tr></table>
<h2>Violation Details</h2>
<table><tr><td class="label">Violation Type</td><td>${d.violation_type || '—'}</td><td class="label">Warning Level</td><td>${d.warning_level || '—'}</td></tr>
<tr><td class="label">Violation Date</td><td>${d.violation_date || '—'}</td><td class="label">Time</td><td>${d.violation_time || '—'}</td></tr>
<tr><td class="label">Place</td><td colspan="3">${d.violation_place || '—'}</td></tr></table>
<h2>Statements</h2>
<table><tr><th>Employer Statement</th><th>Employee Statement</th></tr><tr><td>${d.employer_statement || '—'}</td><td>${d.employee_statement || '—'}</td></tr></table>
<h2>Warning Decision</h2>
<table><tr><td class="label">Action Taken</td><td>${d.action_taken || '—'}</td></tr>
<tr><td class="label">Approved By</td><td>${d.approved_by_name ? `${d.approved_by_name}${d.approved_by_title ? ', ' + d.approved_by_title : ''}` : '—'}</td></tr></table>
<h2>Signatures <span class="badge">Fully Acknowledged</span></h2>
<div class="sig-row">
${sigBlockHtml(d.preparer_signature, 'Preparer', d.preparer_signature_date)}
${sigBlockHtml(d.supervisor_signature, 'Supervisor', d.supervisor_signature_date)}
${sigBlockHtml(d.employee_signature, 'Employee', d.employee_signature_date)}
</div>
</body></html>`;
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); win.print(); }
  };

  const getSignatureStatus = (record: any) => {
    const hasPreparer = !!String(record?.preparer_signature || '').trim();
    const hasSupervisor = !!String(record?.supervisor_signature || '').trim();
    const hasEmployee = !!String(record?.employee_signature || '').trim();
    const progress = [hasPreparer, hasSupervisor, hasEmployee].filter(Boolean).length;
    if (!hasPreparer) return { label: `Awaiting Preparer (${progress}/3)`, className: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300' };
    if (!hasSupervisor) return { label: `Awaiting Supervisor (${progress}/3)`, className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' };
    if (!hasEmployee) return { label: `Awaiting Employee Acknowledgement (${progress}/3)`, className: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' };
    return { label: `Acknowledged (${progress}/3)`, className: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' };
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
                    options={scopedEmployees.map(e => ({ value: String(e.id), label: e.name, avatarUrl: (e as any).profile_picture || null }))}
                    value={form.employee_id}
                    onChange={v => {
                      setForm((prev) => ({ ...prev, employee_id: String(v) }));
                    }}
                    placeholder="Select Employee..."
                    dropdownVariant="pills-horizontal"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Date of Warning</label>
                  <input type="date" value={form.date_of_warning} onChange={e => setForm({ ...form, date_of_warning: e.target.value })} max={todayISO} required className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Department</label>
                  <input type="text" value={selectedEmployee?.dept || managerDept || ''} disabled className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 rounded-lg text-sm text-slate-500 dark:text-slate-400" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Supervisor</label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={form.supervisor || derivedSupervisorName || 'No supervisor mapped for this department'}
                      readOnly
                      disabled
                      className="w-full pl-9 pr-3 p-2 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-300"
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Automatically assigned from employee department.</p>
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
                    <select value={form.warning_level} onChange={e => setForm({ ...form, warning_level: e.target.value })} required className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100">
                      <option value="">Select Warning Level...</option>
                      <option value="1st">1st Warning</option>
                      <option value="2nd">2nd Warning</option>
                      <option value="3rd">3rd Warning</option>
                      <option value="Final">Final Warning</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Violation Date</label>
                    <input type="date" value={form.violation_date} onChange={e => setForm({ ...form, violation_date: e.target.value })} max={todayISO} required className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Violation Time (a.m./p.m.)</label>
                    <input type="time" value={form.violation_time} onChange={e => setForm({ ...form, violation_time: e.target.value })} required className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Place Violation Occurred</label>
                    <input type="text" value={form.violation_place} onChange={e => setForm({ ...form, violation_place: e.target.value })} required maxLength={160} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" />
                  </div>
                </div>
              </div>

              {/* Statements */}
              <div className="pt-4 border-t dark:border-slate-800">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employer Statement</label>
                <textarea rows={3} value={form.employer_statement} onChange={e => setForm({ ...form, employer_statement: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" placeholder="Describe the violation and circumstances..." minLength={10} maxLength={2000} required></textarea>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employee Statement</label>
                <textarea rows={3} value={form.employee_statement} onChange={e => setForm({ ...form, employee_statement: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" placeholder="Employee's response or explanation..." maxLength={2000}></textarea>
              </div>

              {/* Warning Decision */}
              <div className="pt-4 border-t dark:border-slate-800">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Warning Decision</h4>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Action Taken / Decision</label>
                  <textarea rows={2} value={form.action_taken} onChange={e => setForm({ ...form, action_taken: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" minLength={10} maxLength={2000} required></textarea>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Approved By (Name)</label>
                    <input type="text" value={form.approved_by_name} onChange={e => setForm({ ...form, approved_by_name: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" maxLength={120} required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Title</label>
                    <input type="text" value={form.approved_by_title} onChange={e => setForm({ ...form, approved_by_title: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" maxLength={120} required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Date</label>
                    <input type="date" value={form.approved_by_date} onChange={e => setForm({ ...form, approved_by_date: e.target.value })} max={todayISO} required className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" />
                  </div>
                </div>
              </div>

              {/* Copy Distribution */}
              <div className="pt-4 border-t dark:border-slate-800">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Copy Distribution</label>
                <div className="flex gap-4 text-sm text-slate-600 dark:text-slate-300">
                  {['Employee', 'HR Admin Dept', 'Supervisor'].map(c => (
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
                      <input type="date" value={(form as any)[row.dateKey]} onChange={e => setForm({ ...form, [row.dateKey]: e.target.value })} max={todayISO} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" />
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
                <p className="text-xs text-amber-700 dark:text-amber-400 mb-4">
                  Preparer, supervisor, and employee signatures are completed from each assigned user's Signature Queue after this disciplinary action is saved.
                </p>
                <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-900/10 p-3 text-[11px] text-amber-700 dark:text-amber-300">
                  This form no longer captures preparer/supervisor signatures directly. Save first, then signatures will appear in the assigned users' Signature Queue.
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button type="submit" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green">Save Disciplinary Action</button>
              </div>
            </form>
          </Card>
        </motion.div>
      )}

      {!showForm && records.length > 0 && (
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

      {!showForm && (
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

          <div className="overflow-x-auto">
            <table className="w-full min-w-245 text-sm">
              <thead>
                <tr className="border-b dark:border-slate-700 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="text-left py-2 pr-4">Employee</th>
                  <th className="text-left py-2 pr-4">Dept</th>
                  <th className="text-left py-2 pr-4">Warning</th>
                  <th className="text-left py-2 pr-4">Acknowledgement Status</th>
                  <th className="text-left py-2 pr-4">Violation Type</th>
                  <th className="text-left py-2 pr-4">Violation Date</th>
                  <th className="text-left py-2 pr-4">Place</th>
                  <th className="text-left py-2 pr-4">Supervisor</th>
                  <th className="text-left py-2 pr-4">Approved By</th>
                  <th className="text-left py-2 pr-4">Action Taken</th>
                  <th className="text-left py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((d: any) => {
                  const sigStatus = getSignatureStatus(d);
                  return (
                  <tr key={d.id} className="border-b dark:border-slate-800">
                    <td className="py-3 pr-4 font-semibold text-slate-800 dark:text-slate-100">{d.employee_name || `#${d.employee_id}`}</td>
                    <td className="py-3 pr-4 text-slate-500 dark:text-slate-400">{d.dept || '—'}</td>
                    <td className="py-3 pr-4">
                      <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold ${
                        d.warning_level === 'Final' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                        d.warning_level === '3rd' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' :
                        d.warning_level === '2nd' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
                        'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400'
                      }`}
                      >
                        {d.warning_level || '—'}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${sigStatus.className}`}>
                        {sigStatus.label}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{d.violation_type || '—'}</td>
                    <td className="py-3 pr-4 text-slate-500 dark:text-slate-400">{d.violation_date || '—'}</td>
                    <td className="py-3 pr-4 text-slate-500 dark:text-slate-400">{d.violation_place || '—'}</td>
                    <td className="py-3 pr-4 text-slate-500 dark:text-slate-400">{d.supervisor || '—'}</td>
                    <td className="py-3 pr-4 text-slate-500 dark:text-slate-400">{d.approved_by_name ? `${d.approved_by_name}${d.approved_by_title ? `, ${d.approved_by_title}` : ''}` : '—'}</td>
                    <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{d.action_taken || '—'}</td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { handleView(d.id); exportRecordAsPDF(d); }}
                          disabled={!isFullyAcknowledged(d)}
                          title={isFullyAcknowledged(d) ? 'Export PDF Report' : 'PDF available only after all signatures are collected'}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                            isFullyAcknowledged(d)
                              ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/40 border border-teal-200 dark:border-teal-700'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600 border border-slate-200 dark:border-slate-700 cursor-not-allowed'
                          }`}
                        >
                          <FileText size={12} />
                        </button>
                        <button
                          onClick={() => !d.is_viewed && handleView(d.id)}
                          disabled={!!d.is_viewed || !!actionLoading[`view-${d.id}`]}
                          title={d.is_viewed ? 'Already marked as viewed' : actionLoading[`view-${d.id}`] ? 'Marking...' : 'Mark as Viewed'}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-colors border ${
                            d.is_viewed
                              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 border-blue-200 dark:border-blue-700 cursor-default'
                              : actionLoading[`view-${d.id}`]
                                ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 border-slate-200 dark:border-slate-600 cursor-wait'
                                : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-300'
                          }`}
                        >
                          <Eye size={12} />
                        </button>
                        <button
                          onClick={() => handleArchive(d.id)}
                          disabled={!!d.is_archived}
                          title={d.is_archived ? 'Already archived' : 'Archive Record'}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-colors border ${
                            d.is_archived
                              ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300 border-amber-200 dark:border-amber-700 cursor-default'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-600 dark:hover:text-amber-300'
                          }`}
                        >
                          <Archive size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
                {filteredRecords.length === 0 && (
                  <tr>
                    <td colSpan={11} className="py-10 text-center text-slate-400">{search ? 'No records match your search.' : 'No disciplinary records found.'}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </motion.div>
  );
};
