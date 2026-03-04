import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { SearchableSelect } from '../../common/SearchableSelect';
import { UserPlus, CheckCircle, Package, FileText, ChevronDown, ChevronUp, Trash2, Download } from 'lucide-react';
import { SignatureUpload } from '../../common/SignatureUpload';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';
import { Employee } from '../../../types';

interface OnboardingHubProps {
  employees: Employee[];
  onRefresh: () => void;
}

export const OnboardingHub = ({ employees, onRefresh }: OnboardingHubProps) => {
  const [hiredApplicants, setHiredApplicants] = useState<any[]>([]);
  const [onboardingRecords, setOnboardingRecords] = useState<any[]>([]);
  const [showManualForm, setShowManualForm] = useState(false);
  const [expandedApplicant, setExpandedApplicant] = useState<number | null>(null);
  const [activeOnboard, setActiveOnboard] = useState<any>(null);

  // Manual employee creation form
  const emptyForm = {
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
  };
  const [form, setForm] = useState(emptyForm);

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
      ...emptyForm,
      name: applicant.name,
      position: applicant.position || '',
    });
    setShowManualForm(true);
  };

  const submitOnboarding = async () => {
    if (!form.name) { window.notify?.('Employee name is required', 'error'); return; }
    try {
      // 1. Create employee record (201 file)
      const empRes = await fetch('/api/employees', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({
          name: form.name,
          status: 'Probationary',
          position: form.position,
          dept: form.dept,
          hire_date: form.hire_date,
          salary_base: parseFloat(form.salary_base) || 0,
          ssn: form.ssn,
          manager_id: form.manager_id ? parseInt(form.manager_id) : null,
        }),
      });
      if (!empRes.ok) throw new Error('Failed to create employee');
      const empData = await empRes.json();
      const newEmpId = empData.id || empData.insertId;

      // 2. Issue property items
      for (const item of form.property_items) {
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
          employee_name: form.name,
          applicant_id: activeOnboard?.id || null,
          checklist: JSON.stringify(form.checklist),
          hr_signature: form.hr_signature,
          employee_signature: form.employee_signature,
          notes: form.notes,
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

      window.notify?.(`${form.name} successfully onboarded!`, 'success');
      setForm(emptyForm);
      setShowManualForm(false);
      setActiveOnboard(null);
      fetchData();
      onRefresh();
    } catch (err) {
      window.notify?.('Failed to complete onboarding', 'error');
    }
  };

  const deleteOnboarding = async (id: number) => {
    if (!confirm('Delete this onboarding record?')) return;
    try {
      await fetch(`/api/onboarding/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      window.notify?.('Deleted', 'success');
      fetchData();
    } catch { window.notify?.('Failed', 'error'); }
  };

  const completedCount = onboardingRecords.filter(r => r.status === 'Completed').length;
  const probationaryEmps = employees.filter(e => e.status === 'Probationary');

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-4">
        <SectionHeader title="Onboarding Hub" subtitle="Initialize 201 Employee Files and manage new hire onboarding" />
        <div className="flex gap-2">
          <button onClick={() => exportToCSV(onboardingRecords, 'onboarding')} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><Download size={16} /> CSV</button>
          <button onClick={() => { setActiveOnboard(null); setForm(emptyForm); setShowManualForm(!showManualForm); }} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${showManualForm ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300' : 'bg-teal-deep text-white hover:bg-teal-green'}`}>
            {showManualForm ? <>✕ Close</> : <><UserPlus size={16} /> Manual Onboard</>}
          </button>
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
                      <div className="w-8 h-8 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center text-amber-600 font-bold text-sm">{app.name?.[0]}</div>
                      <div>
                        <p className="font-bold text-slate-700 dark:text-slate-200 text-sm">{app.name}</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider">{app.position} • Score: {app.score || app.overall_rating}/5</p>
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
                    <input type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                  <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Position / Job Title</label>
                    <input type="text" value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                  <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Department</label>
                    <input type="text" value={form.dept} onChange={e => setForm({ ...form, dept: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                  <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Hire Date</label>
                    <input type="date" value={form.hire_date} onChange={e => setForm({ ...form, hire_date: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                  <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Base Salary</label>
                    <input type="text" value={form.salary_base} onChange={e => setForm({ ...form, salary_base: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="e.g. 50000" /></div>
                  <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">SSN / ID Number</label>
                    <input type="text" value={form.ssn} onChange={e => setForm({ ...form, ssn: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                  <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Reporting Manager</label>
                    <SearchableSelect
                      options={employees.map(e => ({ value: String(e.id), label: `${e.name} — ${e.position}` }))}
                      value={form.manager_id}
                      onChange={v => setForm({ ...form, manager_id: v })}
                      placeholder="Select Manager..."
                    /></div>
                  <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Emergency Contact Name</label>
                    <input type="text" value={form.emergency_contact} onChange={e => setForm({ ...form, emergency_contact: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                  <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Emergency Phone</label>
                    <input type="text" value={form.emergency_phone} onChange={e => setForm({ ...form, emergency_phone: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                </div>
                <div className="mt-4">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Address</label>
                  <textarea rows={2} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
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
                          <td className="p-1"><input type="text" value={item.brand} onChange={e => { const items = [...form.property_items]; items[i] = { ...items[i], brand: e.target.value }; setForm({ ...form, property_items: items }); }} className="w-full border-0 bg-transparent text-sm dark:text-slate-100 p-1" placeholder="e.g. Dell Laptop" /></td>
                          <td className="p-1"><input type="text" value={item.serial_no} onChange={e => { const items = [...form.property_items]; items[i] = { ...items[i], serial_no: e.target.value }; setForm({ ...form, property_items: items }); }} className="w-full border-0 bg-transparent text-sm dark:text-slate-100 p-1" placeholder="SN-..." /></td>
                          <td className="p-1"><input type="text" value={item.description} onChange={e => { const items = [...form.property_items]; items[i] = { ...items[i], description: e.target.value }; setForm({ ...form, property_items: items }); }} className="w-full border-0 bg-transparent text-sm dark:text-slate-100 p-1" placeholder="Details..." /></td>
                          <td className="p-1"><input type="number" min={1} value={item.uom_qty} onChange={e => { const items = [...form.property_items]; items[i] = { ...items[i], uom_qty: parseInt(e.target.value) || 1 }; setForm({ ...form, property_items: items }); }} className="w-full border-0 bg-transparent text-sm dark:text-slate-100 p-1 text-center" /></td>
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
                      label="HR Representative Signature"
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
                  <textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="Special accommodations, notes, etc." />
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
              <th className="pb-2"></th>
            </tr></thead>
            <tbody>
              {onboardingRecords.map(rec => {
                let checklist: any = {};
                try { checklist = typeof rec.checklist === 'string' ? JSON.parse(rec.checklist) : (rec.checklist || {}); } catch {}
                const total = Object.keys(checklist).length || 1;
                const done = Object.values(checklist).filter(Boolean).length;
                return (
                  <tr key={rec.id} className="border-b border-slate-50 dark:border-slate-800/50">
                    <td className="py-3 font-medium text-slate-700 dark:text-slate-200">{rec.employee_name}</td>
                    <td className="py-3 text-slate-500 dark:text-slate-400 text-xs">{rec.created_at?.split('T')[0] || rec.created_at}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-slate-200 dark:bg-slate-700 rounded-full h-1.5"><div className="bg-teal-green h-1.5 rounded-full" style={{ width: `${(done/total)*100}%` }}></div></div>
                        <span className="text-[10px] font-bold text-slate-400">{done}/{total}</span>
                      </div>
                    </td>
                    <td className="py-3"><span className={`text-[10px] font-bold uppercase ${rec.status === 'Completed' ? 'text-emerald-600' : 'text-amber-500'}`}>{rec.status}</span></td>
                    <td className="py-3"><button onClick={() => deleteOnboarding(rec.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button></td>
                  </tr>
                );
              })}
              {onboardingRecords.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-400">No onboarding records yet. Hire an applicant or use Manual Onboard to get started.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </motion.div>
  );
};
