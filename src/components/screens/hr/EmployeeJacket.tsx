import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { Users, Package, History, ChevronRight, Edit3, Save, X, ShieldAlert, FileCheck } from 'lucide-react';
import { Employee } from '../../../types';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { SignatureUpload } from '../../common/SignatureUpload';
import { getAuthHeaders } from '../../../utils/csv';
import { appConfirm } from '../../../utils/appDialog';

interface EmployeeJacketProps {
  employee: Employee | null;
  onBack: () => void;
}

export const EmployeeJacket = ({ employee, onBack }: EmployeeJacketProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '', position: '', dept: '', hire_date: '', salary_base: 0, ssn: '', status: ''
  });
  const [fallbackPropertyRows, setFallbackPropertyRows] = useState<any[] | null>(null);
  const [hrSignatures, setHrSignatures] = useState<Record<number, string>>({});
  const [signingId, setSigningId] = useState<number | null>(null);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [hrReviewed, setHrReviewed] = useState<Record<number, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    if (!employee) {
      setFallbackPropertyRows(null);
      return () => { cancelled = true; };
    }
    // If server didn't include property rows on the employee payload, try
    // fetching property_accountability by employee name as a fallback.
    const propertyRows = Array.isArray((employee as any).property) ? (employee as any).property : [];
    if (propertyRows.length === 0 && employee.name) {
      fetch(`/api/property_accountability?employee_name=${encodeURIComponent(employee.name)}`)
        .then(r => r.json())
        .then(rows => { if (!cancelled && Array.isArray(rows) && rows.length > 0) setFallbackPropertyRows(rows); })
        .catch(() => {});
    } else {
      setFallbackPropertyRows(null);
    }
    return () => { cancelled = true; };
  }, [employee?.id, employee?.name]);

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

  const signAsHR = async (appraisalId: number) => {
    if (!hrReviewed[appraisalId]) {
      (window as any).notify?.('Please review this appraisal before signing as HR Admin', 'error');
      return;
    }
    const sig = hrSignatures[appraisalId];
    if (!sig) { (window as any).notify?.('Please provide your signature', 'error'); return; }
    try {
      const res = await fetch(`/api/appraisals/${appraisalId}`, {
        method: 'PUT', headers: getAuthHeaders(),
        body: JSON.stringify({
          hr_signature: sig,
          hr_signature_date: new Date().toISOString().split('T')[0],
        })
      });
      if (res.ok) {
        (window as any).notify?.('HR Admin signature saved', 'success');
        setHrSignatures(prev => { const n = { ...prev }; delete n[appraisalId]; return n; });
        setSigningId(null);
        onBack(); // refresh data
      } else {
        const err = await res.json();
        (window as any).notify?.(err.error || 'Failed to sign', 'error');
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
          if (!(await appConfirm('Archive this employee? You can restore it from archive.', { title: 'Archive Employee', confirmText: 'Archive' }))) return;
          const token = localStorage.getItem('talentflow_token');
          try {
            const res = await fetch(`/api/employees/${employee.id}`, { method: 'DELETE', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
            if (res.ok) { (window as any).notify('Employee archived', 'success'); onBack(); }
            else { const err = await res.json(); (window as any).notify(err.error || 'Failed to archive', 'error'); }
          } catch { (window as any).notify('Server error', 'error'); }
        }} className="px-3 py-2 text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">Archive Employee</button>
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
          <div className="space-y-4">
            {(() => {
              const propRows = (fallbackPropertyRows && fallbackPropertyRows.length > 0) ? fallbackPropertyRows : (employee.property || []);
              const onboardingItems: any[] = [];
              const accountabilityRecords: any[] = [];

              propRows.forEach((p: any) => {
                // Bulk records (offboarding / audits) usually store a JSON `items` array.
                if (p.items) {
                  accountabilityRecords.push(p);
                  return;
                }
                // Onboarding typically creates per-item rows with brand/serial_no.
                if (p.brand || p.serial_no) {
                  onboardingItems.push(p);
                  return;
                }
              });

              return (
                <>
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Issued (Onboarding)</h4>
                    {onboardingItems.length === 0 ? (
                      <p className="text-sm text-slate-400 dark:text-slate-500 italic">No issued items recorded.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-2">
                        {onboardingItems.map(it => (
                          <div key={it.id} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{it.brand}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">SN: {it.serial_no || '—'} | Qty: {it.uom_qty ?? '1'}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold mb-2 mt-4">Property / Accountability Records (Offboarding & Audits)</h4>
                    {accountabilityRecords.length === 0 ? (
                      <p className="text-sm text-slate-400 dark:text-slate-500 italic">No accountability records found.</p>
                    ) : (
                      <div className="space-y-3">
                        {accountabilityRecords.map((rec: any) => {
                          let parsedItems: any[] = [];
                          try {
                            const parsed = JSON.parse(rec.items || '[]');
                            if (Array.isArray(parsed)) parsedItems = parsed;
                          } catch { /* ignore parse errors */ }

                          return (
                            <div key={rec.id} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{rec.title || rec.type || `Record ${rec.id}`}</p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">{rec.sign_off_date || rec.created_at || rec.date || ''}</p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">Signed: {rec.signed_by || rec.signatory || rec.accepted_by || '—'}</p>
                                </div>
                              </div>

                              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {parsedItems.length === 0 ? (
                                  <p className="text-xs text-slate-500 italic">No item details.</p>
                                ) : parsedItems.map((it: any, i: number) => (
                                  <div key={i} className="p-2 bg-white dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-800 text-xs">
                                    <p className="font-medium">{it.brand || it.description || '—'}</p>
                                    <p className="text-slate-500">SN: {it.serial_no || '—'}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </Card>

        {/* Discipline History */}
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
                {(employee.discipline || []).map(d => (
                  <tr key={d.id} className="border-b border-slate-50 dark:border-slate-800/50">
                    <td className="py-2 text-slate-600 dark:text-slate-400">{(d as any).date_of_warning || '—'}</td>
                    <td className="py-2 text-slate-700 dark:text-slate-300">
                      <div className="min-w-0"><span className="truncate max-w-55" title={d.violation_type}>{d.violation_type}</span></div>
                    </td>
                    <td className="py-2"><span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${d.warning_level === 'Written Warning' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700' : d.warning_level === 'Final Warning' ? 'bg-red-100 dark:bg-red-900/30 text-red-700' : 'bg-slate-100 dark:bg-slate-800 text-slate-600'}`}>{d.warning_level}</span></td>
                    <td className="py-2 text-xs text-slate-500 dark:text-slate-400">
                      <div className="min-w-0"><span className="truncate max-w-[260px]" title={d.action_taken}>{d.action_taken}</span></div>
                    </td>
                  </tr>
                ))}
                {(!employee.discipline || employee.discipline.length === 0) && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-sm text-slate-400">No disciplinary records on file.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

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
                  <th className="pb-2 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px]">HR Admin Signature</th>
                </tr>
              </thead>
              <tbody>
                {employee.appraisals?.map(a => {
                  const isPerf = ((a as any).form_type || '').toLowerCase().includes('performance');
                  const hasHrSig = !!(a as any).hr_signature;
                  const hasSupervisorSig = !!(a as any).supervisor_signature;
                  const hasReviewerSig = !!(a as any).reviewer_signature;
                  const hasEmployeeSig = !!(a as any).employee_signature;
                  const canHrSign = isPerf && hasSupervisorSig && hasReviewerSig && hasEmployeeSig && !hasHrSig;
                  return (
                  <React.Fragment key={a.id}>
                  <tr className="border-b border-slate-50 dark:border-slate-800/50">
                    <td className="py-2 text-slate-600 dark:text-slate-400">{a.sign_off_date}</td>
                    <td className="py-2 text-xs text-slate-500">{(a as any).form_type || (a as any).eval_type || '—'}</td>
                    <td className="py-2 font-bold text-teal-green">{a.overall}/5.0</td>
                    <td className="py-2 text-slate-600 dark:text-slate-400">{a.promotability_status}</td>
                    <td className="py-2">{((a as any).supervisor_signature && (a as any).employee_signature) ? <span className="text-[10px] font-bold text-emerald-600">VERIFIED</span> : <span className="text-[10px] font-bold text-amber-500">PENDING</span>}</td>
                    <td className="py-2">
                      {hasHrSig ? (
                        <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1"><FileCheck size={12} /> Signed</span>
                      ) : canHrSign ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setReviewingId(reviewingId === a.id ? null : a.id)}
                            className="text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:underline"
                          >
                            {reviewingId === a.id ? 'Hide Review' : 'Review'}
                          </button>
                          <button
                            onClick={() => {
                              if (!hrReviewed[a.id]) {
                                (window as any).notify?.('Review this appraisal first before HR signing', 'error');
                                setReviewingId(a.id);
                                return;
                              }
                              setSigningId(signingId === a.id ? null : a.id);
                            }}
                            className="text-[10px] font-bold text-teal-deep dark:text-teal-green hover:underline"
                          >
                            Sign Now
                          </button>
                        </div>
                      ) : isPerf && !hasHrSig ? (
                        <span className="text-[10px] text-amber-600">Waiting for supervisor/reviewer/employee signature</span>
                      ) : (
                        <span className="text-[10px] text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                  {reviewingId === a.id && (
                    <tr><td colSpan={6} className="py-3 px-2">
                      <div className="border border-amber-200 dark:border-amber-900/50 rounded-lg p-4 space-y-3 bg-amber-50/70 dark:bg-amber-900/10">
                        <h4 className="text-xs font-bold text-amber-700 dark:text-amber-300 uppercase">HR Review Before Signature</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="font-bold text-slate-500 dark:text-slate-400 uppercase">Evaluation Type</span>
                            <p className="text-slate-700 dark:text-slate-300">{(a as any).form_type || (a as any).eval_type || '—'}</p>
                          </div>
                          <div>
                            <span className="font-bold text-slate-500 dark:text-slate-400 uppercase">Review Period</span>
                            <p className="text-slate-700 dark:text-slate-300">{(a as any).eval_period_from || (a as any).review_period_from || '—'} to {(a as any).eval_period_to || (a as any).review_period_to || '—'}</p>
                          </div>
                          <div>
                            <span className="font-bold text-slate-500 dark:text-slate-400 uppercase">Supervisor Signature</span>
                            <p className={(a as any).supervisor_signature ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold'}>{(a as any).supervisor_signature ? 'Available' : 'Missing'}</p>
                          </div>
                          <div>
                            <span className="font-bold text-slate-500 dark:text-slate-400 uppercase">Employee Signature</span>
                            <p className={(a as any).employee_signature ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold'}>{(a as any).employee_signature ? 'Available' : 'Missing'}</p>
                          </div>
                        </div>
                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                          <input
                            type="checkbox"
                            className="accent-amber-600"
                            checked={!!hrReviewed[a.id]}
                            onChange={(e) => setHrReviewed(prev => ({ ...prev, [a.id]: e.target.checked }))}
                          />
                          I reviewed this appraisal and the required signatures before HR sign-off.
                        </label>
                      </div>
                    </td></tr>
                  )}
                  {signingId === a.id && (
                    <tr><td colSpan={6} className="py-3 px-2">
                      <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-3 bg-slate-50 dark:bg-slate-800/50">
                        <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase">HR Admin Signature</h4>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">I have reviewed the supervisor's evaluation, reviewer's comments, and the employee's statement (if any). This form shall be made part of the employee's official Personnel File.</p>
                        <SignatureUpload label="HR Admin Signature" value={hrSignatures[a.id] || ''} onChange={v => setHrSignatures(prev => ({ ...prev, [a.id]: v }))} />
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => { setSigningId(null); setHrSignatures(prev => { const n = { ...prev }; delete n[a.id]; return n; }); }} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">Cancel</button>
                          <button onClick={() => signAsHR(a.id)} className="flex items-center gap-2 bg-teal-deep text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-teal-green transition-colors"><FileCheck size={14} /> Submit HR Admin Signature</button>
                        </div>
                      </div>
                    </td></tr>
                  )}
                  </React.Fragment>
                )})}
                {(!employee.appraisals || employee.appraisals.length === 0) && <tr><td colSpan={6} className="py-6 text-center text-sm text-slate-400">No appraisals on record.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </motion.div>
  );
};
