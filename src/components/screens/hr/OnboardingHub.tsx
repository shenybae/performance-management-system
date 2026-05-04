import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { SearchableSelect } from '../../common/SearchableSelect';
import { UserPlus, CheckCircle, Package, FileText, ChevronDown, ChevronUp, Download, Eye, Archive } from 'lucide-react';
import { SignatureUpload } from '../../common/SignatureUpload';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';
import { Employee } from '../../../types';
import { appConfirm } from '../../../utils/appDialog';

interface OnboardingHubProps {
  employees: Employee[];
  users: any[];
  onRefresh: () => void;
}

const normalize = (value?: string | null) => (value || '').toString().trim().toLowerCase();
const sameDept = (a?: string | null, b?: string | null) => normalize(a) === normalize(b) && normalize(a) !== '';

export const OnboardingHub = ({ employees, users, onRefresh }: OnboardingHubProps) => {
  const [hiredApplicants, setHiredApplicants] = useState<any[]>([]);
  const [onboardingRecords, setOnboardingRecords] = useState<any[]>([]);
  const [showManualForm, setShowManualForm] = useState(false);
  const [expandedApplicant, setExpandedApplicant] = useState<number | null>(null);
  const [activeOnboard, setActiveOnboard] = useState<any>(null);

  // Manual employee creation form
  const buildEmptyForm = () => ({
    name: '', position: '', dept: '', hire_date: '',
    salary_base: '', ssn: '', manager_id: '',
    emergency_contact: '', emergency_phone: '', address: '',
    // Property issuance
    property_items: [{ brand: '', serial_no: '', description: '', uom_qty: 1 }],
    // Onboarding checklist
    checklist: {
      contract_signed: false,
      id_photo_taken: false,
      nda_signed: false,
      handbook_received: false,
      system_access_created: false,
      workstation_assigned: false,
      orientation_scheduled: false,
      benefits_enrolled: false,
    },
    hr_signature: '',
    employee_signature: '',
    notes: '',
  });
  const [form, setForm] = useState(buildEmptyForm);
  const todayISO = new Date().toISOString().split('T')[0];

  const trimText = (value: string) => value.trim();

  const departmentManagerOptions = useMemo(() => {
    const dept = trimText(form.dept);
    if (!dept) return [];
    return (Array.isArray(users) ? users : [])
      .filter((user: any) => sameDept(user?.dept, dept))
      .filter((user: any) => ['hr', 'manager'].includes(normalize(user?.role)) || normalize(user?.position).includes('supervisor'))
      .map((user: any) => ({
        value: String(user.id),
        label: `${user.full_name || user.employee_name || user.username || user.email || 'User'}${user.position ? ` — ${user.position}` : ''}`,
        avatarUrl: user.profile_picture || null,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [form.dept, users]);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    // Fetch hired applicants (status = Hired but not yet onboarded)
    try {
      const res = await fetch('/api/applicants', { headers: getAuthHeaders() });
      const data = await res.json();
      const hired = (Array.isArray(data) ? data : []).filter((a: any) => a.status === 'Hired');
      setHiredApplicants(hired);
    } catch { setHiredApplicants([]); }

    // Fetch onboarding records
    try {
      const res = await fetch('/api/onboarding', { headers: getAuthHeaders() });
      const data = await res.json();
      setOnboardingRecords(Array.isArray(data) ? data : []);
    } catch { setOnboardingRecords([]); }
  };

  const startOnboardFromApplicant = (applicant: any) => {
    setActiveOnboard(applicant);
    setForm({
      ...buildEmptyForm(),
      name: applicant.name,
      position: applicant.position || '',
    });
    setShowManualForm(true);
  };

  const submitOnboarding = async () => {
    const cleaned = {
      ...form,
      name: trimText(form.name),
      position: trimText(form.position),
      dept: trimText(form.dept),
      hire_date: trimText(form.hire_date),
      salary_base: trimText(form.salary_base),
      ssn: trimText(form.ssn),
      manager_id: trimText(form.manager_id),
      emergency_contact: trimText(form.emergency_contact),
      emergency_phone: trimText(form.emergency_phone),
      address: trimText(form.address),
      notes: trimText(form.notes),
      property_items: form.property_items.map(item => ({
        brand: trimText(item.brand),
        serial_no: trimText(item.serial_no),
        description: trimText(item.description),
        uom_qty: Number.isFinite(Number(item.uom_qty)) ? Math.max(1, Math.round(Number(item.uom_qty))) : 1,
      })),
    };

    if (!cleaned.name || !cleaned.position || !cleaned.dept || !cleaned.hire_date) {
      window.notify?.('Name, position, department, and hire date are required', 'error');
      return;
    }

    const salary = Number(cleaned.salary_base);
    if (!Number.isFinite(salary) || salary <= 0) {
      window.notify?.('Please enter a valid base salary greater than 0', 'error');
      return;
    }

    if (!cleaned.ssn || !cleaned.emergency_contact || !cleaned.emergency_phone || !cleaned.address) {
      window.notify?.('SSN/ID, emergency contact, emergency phone, and address are required', 'error');
      return;
    }

    if (!/^[0-9+()\-\s]{7,20}$/.test(cleaned.emergency_phone)) {
      window.notify?.('Emergency phone must be 7 to 20 characters and contain only phone symbols', 'error');
      return;
    }

    const hasIncompletePropertyRow = cleaned.property_items.some(item => {
      const hasAny = Boolean(item.brand || item.serial_no || item.description);
      if (!hasAny) return false;
      return !item.brand || !item.serial_no || !item.description || item.uom_qty < 1;
    });
    if (hasIncompletePropertyRow) {
      window.notify?.('Each property row must include brand, serial number, description, and quantity', 'error');
      return;
    }

    if (!Object.values(cleaned.checklist).every(Boolean)) {
      window.notify?.('Please complete the onboarding checklist before submission', 'error');
      return;
    }

    if (!cleaned.hr_signature || !cleaned.employee_signature) {
      window.notify?.('HR and employee signatures are required', 'error');
      return;
    }

    try {
      // 1. Create employee record (201 file)
      const empRes = await fetch('/api/employees', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({
          name: cleaned.name,
          status: 'Probationary',
          position: cleaned.position,
          dept: cleaned.dept,
          hire_date: cleaned.hire_date,
          salary_base: salary,
          ssn: cleaned.ssn,
          manager_id: cleaned.manager_id ? parseInt(cleaned.manager_id) : null,
        }),
      });
      if (!empRes.ok) throw new Error('Failed to create employee');
      const empData = await empRes.json();
      const newEmpId = empData.id || empData.insertId;

      // 2. Issue property items
      for (const item of cleaned.property_items) {
        if (item.brand || item.serial_no || item.description) {
          await fetch('/api/property_accountability', {
            method: 'POST', headers: getAuthHeaders(),
            body: JSON.stringify({
              employee_id: newEmpId,
              brand: item.brand,
              serial_no: item.serial_no,
              uom_qty: item.uom_qty,
            }),
          });
        }
      }

      // 3. Save onboarding record
      await fetch('/api/onboarding', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({
          employee_id: newEmpId,
          employee_name: cleaned.name,
          applicant_id: activeOnboard?.id || null,
          checklist: JSON.stringify(cleaned.checklist),
          hr_signature: cleaned.hr_signature,
          employee_signature: cleaned.employee_signature,
          notes: cleaned.notes,
          status: 'Completed',
        }),
      });

      // 4. Mark applicant as Onboarded if came from applicant
      if (activeOnboard?.id) {
        await fetch(`/api/applicants/${activeOnboard.id}`, {
          method: 'PUT', headers: getAuthHeaders(),
          body: JSON.stringify({ ...activeOnboard, status: 'Onboarded' }),
        });
      }

      window.notify?.(`${cleaned.name} successfully onboarded!`, 'success');
      setForm(buildEmptyForm());
      setShowManualForm(false);
      setActiveOnboard(null);
      fetchData();
      onRefresh();
    } catch (err) {
      window.notify?.('Failed to complete onboarding', 'error');
    }
  };

  const deleteOnboarding = async (id: number) => {
    if (!(await appConfirm('Archive this onboarding record?', { title: 'Archive Onboarding Record', confirmText: 'Archive' }))) return;
    try {
      await fetch(`/api/onboarding/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      window.notify?.('Archived', 'success');
      fetchData();
    } catch { window.notify?.('Failed', 'error'); }
  };

  const exportOnboardingPdf = async (rec: any) => {
    if (!(await appConfirm('Export this onboarding record as PDF?', { title: 'Export Onboarding PDF', confirmText: 'Export', icon: 'export' }))) return;
    let checklist: Record<string, boolean> = {};
    try { checklist = typeof rec.checklist === 'string' ? JSON.parse(rec.checklist) : (rec.checklist || {}); } catch {}
    const checklistRows = Object.entries(checklist).map(([k, v]) => `
      <tr>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;">${k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center;">${v ? 'Completed' : 'Pending'}</td>
      </tr>
    `).join('');
    const w = window.open('', '_blank');
    if (!w) { window.notify?.('Please allow popups to export PDF', 'error'); return; }
    w.document.write(`<!DOCTYPE html><html><head><title>Onboarding Record — ${rec.employee_name || ''}</title></head><body style="font-family:Arial,sans-serif;padding:24px;color:#0f172a;">
      <h2 style="margin:0 0 6px;color:#0f766e;">Onboarding Record</h2>
      <p style="margin:0 0 16px;color:#64748b;">Employee: ${rec.employee_name || '—'} | Date: ${(rec.created_at || '').toString().split('T')[0] || '—'}</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:12px;">
        <tr><td style="padding:6px 8px;border:1px solid #e2e8f0;width:220px;"><b>Status</b></td><td style="padding:6px 8px;border:1px solid #e2e8f0;">${rec.status || '—'}</td></tr>
        <tr><td style="padding:6px 8px;border:1px solid #e2e8f0;"><b>Applicant ID</b></td><td style="padding:6px 8px;border:1px solid #e2e8f0;">${rec.applicant_id || '—'}</td></tr>
      </table>
      <h3 style="margin:0 0 8px;font-size:14px;color:#334155;">Checklist</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:12px;">
        <thead><tr><th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:left;background:#f8fafc;">Item</th><th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center;background:#f8fafc;">Status</th></tr></thead>
        <tbody>${checklistRows || '<tr><td colspan="2" style="padding:8px;border:1px solid #e2e8f0;text-align:center;color:#64748b;">No checklist data</td></tr>'}</tbody>
      </table>
      <div style="display:flex;gap:24px;align-items:flex-start;">
        <div style="flex:1;">
          <div style="font-size:11px;font-weight:bold;color:#475569;text-transform:uppercase;margin-bottom:6px;">HR Admin Signature</div>
          ${rec.hr_signature ? `<img src="${rec.hr_signature}" alt="HR Admin Signature" style="max-height:64px;border-bottom:1px solid #94a3b8;padding-bottom:4px;" />` : '<div style="height:64px;border-bottom:1px solid #94a3b8;"></div>'}
        </div>
        <div style="flex:1;">
          <div style="font-size:11px;font-weight:bold;color:#475569;text-transform:uppercase;margin-bottom:6px;">Employee Signature</div>
          ${rec.employee_signature ? `<img src="${rec.employee_signature}" alt="Employee Signature" style="max-height:64px;border-bottom:1px solid #94a3b8;padding-bottom:4px;" />` : '<div style="height:64px;border-bottom:1px solid #94a3b8;"></div>'}
        </div>
      </div>
    </body></html>`);
    w.document.close();
    setTimeout(() => {
      w.print();
      try { fetch('/api/activity', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ action: 'export_pdf', description: `Onboarding PDF — ${rec.employee_name || ''}`, entity: 'onboarding', entity_id: rec.id || null, meta: { source: 'OnboardingHub' } }) }).catch(() => {}); } catch {};
    }, 300);
  };

  const viewOnboardingRecord = (rec: any) => {
    let checklist: Record<string, boolean> = {};
    try { checklist = typeof rec.checklist === 'string' ? JSON.parse(rec.checklist) : (rec.checklist || {}); } catch {}
    const rows = Object.entries(checklist).map(([k, v]) => `<li style="margin-bottom:4px;">${k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}: <b>${v ? 'Completed' : 'Pending'}</b></li>`).join('');
    const w = window.open('', '_blank');
    if (!w) { window.notify?.('Please allow popups to view records', 'error'); return; }
    w.document.write(`<!DOCTYPE html><html><head><title>View Onboarding Record — ${rec.employee_name || ''}</title></head><body style="font-family:Arial,sans-serif;padding:24px;color:#0f172a;">
      <h2 style="margin:0 0 6px;color:#0f766e;">Onboarding Record</h2>
      <p style="margin:0 0 12px;color:#64748b;">Employee: ${rec.employee_name || '—'}</p>
      <p style="margin:0 0 8px;"><b>Status:</b> ${rec.status || '—'}</p>
      <p style="margin:0 0 16px;"><b>Created:</b> ${(rec.created_at || '').toString().split('T')[0] || '—'}</p>
      <h3 style="margin:0 0 8px;font-size:14px;color:#334155;">Checklist</h3>
      <ul style="padding-left:18px;">${rows || '<li>No checklist data</li>'}</ul>
    </body></html>`);
    w.document.close();
  };

  const completedCount = onboardingRecords.filter(r => r.status === 'Completed').length;
  const probationaryEmps = employees.filter(e => e.status === 'Probationary');

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-4">
        <SectionHeader title="Onboarding Hub" subtitle="Initialize 201 Employee Files and manage new hire onboarding" />
        <div className="flex gap-2">
          <button onClick={() => exportToCSV(onboardingRecords, 'onboarding')} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><Download size={16} /> XLSX</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        {[
          { label: 'Hired & Waiting', value: hiredApplicants.length, color: 'text-amber-500' },
          { label: 'Onboarded Total', value: completedCount, color: 'text-emerald-600' },
          { label: 'Probationary', value: probationaryEmps.length, color: 'text-blue-500' },
          { label: 'Total Employees', value: employees.length, color: 'text-teal-green' },
        ].map(s => (
          <Card key={s.label}>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{s.label}</p>
            <p className={`text-3xl font-black mt-1 ${s.color}`}>{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Hired Applicants Ready for Onboarding */}
      {hiredApplicants.length > 0 && (
        <div className="mb-4">
          <Card>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4 flex items-center gap-2">
              <UserPlus size={16} className="text-amber-500" /> Hired Applicants — Ready for Onboarding ({hiredApplicants.length})
            </h3>
            <div className="space-y-3">
              {hiredApplicants.map(app => (
                <div key={app.id} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 cursor-pointer" onClick={() => setExpandedApplicant(expandedApplicant === app.id ? null : app.id)}>
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center text-amber-600 font-bold text-sm">{app.name?.[0]}</div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider">{app.position}</p>
                      </div>
                      <div>
                        <p className="font-bold text-slate-700 dark:text-slate-200 text-sm">{app.name}</p>
                        <p className="text-[10px] text-slate-400">Score: {app.score || app.overall_rating}/5</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={e => { e.stopPropagation(); startOnboardFromApplicant(app); }} className="bg-teal-deep text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-teal-green transition-colors">
                        Initialize 201 File →
                      </button>
                      {expandedApplicant === app.id ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                    </div>
                  </div>
                  {expandedApplicant === app.id && (
                    <div className="p-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 grid grid-cols-3 gap-2">
                      <p><strong>Interview Date:</strong> {app.interview_date || 'N/A'}</p>
                      <p><strong>Interviewer:</strong> {app.interviewer_name || 'N/A'}</p>
                      <p><strong>Recommendation:</strong> {app.recommendation || app.status}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Onboarding Form */}
      {showManualForm && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4">
          <Card>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">
              {activeOnboard ? `Onboarding: ${activeOnboard.name}` : 'New Employee Onboarding'}
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-4 border-b dark:border-slate-800 pb-3">
              Initialize the 201 Employee Master File and complete onboarding checklist
            </p>

            <form className="space-y-4" onSubmit={e => { e.preventDefault(); submitOnboarding(); }}>
              {/* Section 1: Employee Information */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3 flex items-center gap-2">
                  <FileText size={14} /> Section 1 — Employee Information (201 File)
                </h4>
                <div className="grid grid-cols-3 gap-4">
                  <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Full Name *</label>
                    <input type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" maxLength={120} /></div>
                  <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Position / Job Title</label>
                    <input type="text" value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" maxLength={120} required /></div>
                  <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Department</label>
                    <SearchableSelect
                      options={['Accounting/Financing','Sales Admin','Marketing','Pre-Technical','Post-Technical','Executives','Engineering','HR','Operations','IT'].map(d => ({ value: d, label: d }))}
                      value={form.dept}
                      onChange={v => setForm({ ...form, dept: String(v) })}
                      placeholder="Select department..."
                      allowEmpty
                      emptyLabel="Select department..."
                      searchable
                      dropdownVariant="pills-horizontal"
                      className="w-full"
                    /></div>
                  <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Hire Date</label>
                    <input type="date" value={form.hire_date} onChange={e => setForm({ ...form, hire_date: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" max={todayISO} required /></div>
                  <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Base Salary</label>
                    <input type="number" min="0.01" step="0.01" value={form.salary_base} onChange={e => setForm({ ...form, salary_base: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="50000" required /></div>
                  <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">SSN / ID Number</label>
                    <input type="text" value={form.ssn} onChange={e => setForm({ ...form, ssn: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" maxLength={64} required /></div>
                  <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Reporting Manager</label>
                    <SearchableSelect
                      options={departmentManagerOptions}
                      value={form.manager_id}
                      onChange={v => setForm({ ...form, manager_id: String(v) })}
                      placeholder={form.dept ? 'Select manager / HR / supervisor...' : 'Select department first'}
                      allowEmpty
                      emptyLabel="No reporting link"
                      searchable
                      dropdownVariant="pills-horizontal"
                    /></div>
                  <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Emergency Contact Name</label>
                    <input type="text" value={form.emergency_contact} onChange={e => setForm({ ...form, emergency_contact: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" maxLength={120} required /></div>
                  <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Emergency Phone</label>
                    <input type="tel" value={form.emergency_phone} onChange={e => setForm({ ...form, emergency_phone: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" maxLength={20} pattern="[0-9+()\-\s]{7,20}" required /></div>
                </div>
                <div className="mt-4">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Address</label>
                  <textarea rows={2} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" minLength={5} maxLength={300} required />
                </div>
              </div>

              {/* Section 2: Onboarding Checklist */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3 flex items-center gap-2">
                  <CheckCircle size={14} /> Section 2 — Onboarding Checklist
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'contract_signed', label: 'Employment Contract Signed' },
                    { key: 'id_photo_taken', label: 'ID Photo Taken / Badge Issued' },
                    { key: 'nda_signed', label: 'NDA / Confidentiality Agreement Signed' },
                    { key: 'handbook_received', label: 'Employee Handbook Received' },
                    { key: 'system_access_created', label: 'System Access / Email Created' },
                    { key: 'workstation_assigned', label: 'Workstation / Equipment Assigned' },
                    { key: 'orientation_scheduled', label: 'Orientation Session Scheduled' },
                    { key: 'benefits_enrolled', label: 'Benefits Enrollment Completed' },
                  ].map(item => (
                    <label key={item.key} className="flex items-center gap-3 p-2 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                      <input type="checkbox" checked={(form.checklist as any)[item.key]} onChange={() => setForm(prev => ({ ...prev, checklist: { ...prev.checklist, [item.key]: !(prev.checklist as any)[item.key] } }))}
                        className="w-4 h-4 rounded text-teal-green" />
                      <span className={`text-sm ${(form.checklist as any)[item.key] ? 'text-teal-green font-bold line-through' : 'text-slate-600 dark:text-slate-300'}`}>{item.label}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                    <div className="bg-teal-green h-2 rounded-full transition-all" style={{ width: `${(Object.values(form.checklist).filter(Boolean).length / Object.values(form.checklist).length) * 100}%` }}></div>
                  </div>
                  <span className="font-bold whitespace-nowrap">{Object.values(form.checklist).filter(Boolean).length}/{Object.values(form.checklist).length}</span>
                </div>
              </div>

              {/* Section 3: Property Issuance */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Package size={14} /> Section 3 — Property / Equipment Issuance
                </h4>
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/50">
                      <tr>
                        <th className="p-2 text-[10px] font-bold text-slate-500 uppercase">Brand / Item</th>
                        <th className="p-2 text-[10px] font-bold text-slate-500 uppercase">Serial No.</th>
                        <th className="p-2 text-[10px] font-bold text-slate-500 uppercase">Description</th>
                        <th className="p-2 text-[10px] font-bold text-slate-500 uppercase w-20">Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.property_items.map((item, i) => (
                        <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="p-1"><input type="text" value={item.brand} onChange={e => { const items = [...form.property_items]; items[i] = { ...items[i], brand: e.target.value }; setForm({ ...form, property_items: items }); }} className="w-full border-0 bg-transparent text-sm dark:text-slate-100 p-1" placeholder="e.g. Dell Laptop" maxLength={120} /></td>
                          <td className="p-1"><input type="text" value={item.serial_no} onChange={e => { const items = [...form.property_items]; items[i] = { ...items[i], serial_no: e.target.value }; setForm({ ...form, property_items: items }); }} className="w-full border-0 bg-transparent text-sm dark:text-slate-100 p-1" placeholder="SN-..." maxLength={120} /></td>
                          <td className="p-1"><input type="text" value={item.description} onChange={e => { const items = [...form.property_items]; items[i] = { ...items[i], description: e.target.value }; setForm({ ...form, property_items: items }); }} className="w-full border-0 bg-transparent text-sm dark:text-slate-100 p-1" placeholder="Details..." maxLength={200} /></td>
                          <td className="p-1"><input type="number" min={1} max={1000} value={item.uom_qty} onChange={e => { const items = [...form.property_items]; items[i] = { ...items[i], uom_qty: parseInt(e.target.value) || 1 }; setForm({ ...form, property_items: items }); }} className="w-full border-0 bg-transparent text-sm dark:text-slate-100 p-1 text-center" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button type="button" onClick={() => setForm({ ...form, property_items: [...form.property_items, { brand: '', serial_no: '', description: '', uom_qty: 1 }] })} className="text-xs text-teal-deep dark:text-teal-green font-bold hover:underline mt-2">+ Add Row</button>
              </div>

              {/* Section 4: Signatures & Notes */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Section 4 — Signatures & Notes</h4>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <SignatureUpload
                      label="HR Admin Representative Signature"
                      value={form.hr_signature}
                      onChange={dataUrl => setForm(prev => ({ ...prev, hr_signature: dataUrl }))}
                    />
                  </div>
                  <div>
                    <SignatureUpload
                      label="Employee Signature"
                      value={form.employee_signature}
                      onChange={dataUrl => setForm(prev => ({ ...prev, employee_signature: dataUrl }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Additional Notes</label>
                  <textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="Special accommodations, notes, etc." maxLength={2000} />
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button type="submit" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green flex items-center gap-2">
                  <CheckCircle size={16} /> Complete Onboarding & Create 201 File
                </button>
              </div>
            </form>
          </Card>
        </motion.div>
      )}

      {/* Onboarding Records History */}
      <Card>
        <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">Onboarding Records ({onboardingRecords.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-slate-100 dark:border-slate-800">
              <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Employee</th>
              <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date</th>
              <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Checklist</th>
              <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
              <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
            </tr></thead>
            <tbody>
              {onboardingRecords.map(rec => {
                let checklist: any = {};
                try { checklist = typeof rec.checklist === 'string' ? JSON.parse(rec.checklist) : (rec.checklist || {}); } catch {}
                const total = Object.keys(checklist).length || 1;
                const done = Object.values(checklist).filter(Boolean).length;
                return (
                  <tr key={rec.id} className="border-b border-slate-50 dark:border-slate-800/50">
                    <td className="py-3 font-medium text-slate-700 dark:text-slate-200">
                      <div className="min-w-0"><span className="truncate max-w-55" title={rec.employee_name}>{rec.employee_name}</span></div>
                    </td>
                    <td className="py-3 text-slate-500 dark:text-slate-400 text-xs">{rec.created_at?.split('T')[0] || rec.created_at}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-slate-200 dark:bg-slate-700 rounded-full h-1.5"><div className="bg-teal-green h-1.5 rounded-full" style={{ width: `${(done/total)*100}%` }}></div></div>
                        <span className="text-[10px] font-bold text-slate-400">{done}/{total}</span>
                      </div>
                    </td>
                    <td className="py-3"><span className={`text-[10px] font-bold uppercase ${rec.status === 'Completed' ? 'text-emerald-600' : 'text-amber-500'}`}>{rec.status}</span></td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => viewOnboardingRecord(rec)} className="text-blue-500 hover:text-blue-700" title="View"><Eye size={14} /></button>
                        <button onClick={() => exportOnboardingPdf(rec)} className="text-blue-500 hover:text-blue-700" title="Export PDF"><FileText size={14} /></button>
                        <button onClick={() => deleteOnboarding(rec.id)} className="text-red-500 hover:text-red-600 p-1 rounded" title="Archive"><Archive size={15} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {onboardingRecords.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-400">No onboarding records yet. Hire an applicant to initialize a 201 file.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </motion.div>
  );
};
