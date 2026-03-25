import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { SignatureUpload } from '../../common/SignatureUpload';
import { CheckCircle, FileCheck, ShieldAlert } from 'lucide-react';
import { getAuthHeaders } from '../../../utils/csv';

export const VerificationOfReview = () => {
  const user = JSON.parse(localStorage.getItem('talentflow_user') || localStorage.getItem('user') || '{}');
  const isSupervisor = user?.role === 'Employee' && String(user?.position || '').toLowerCase().includes('supervisor');
  const isManager = user?.role === 'Manager';
  const isLeader = user?.role === 'Leader';
  const isHR = user?.role === 'HR';
  const isEmployee = user?.role === 'Employee' && !isSupervisor;
  const isManagementSigner = isSupervisor || isManager || isLeader;

  const [appraisals, setAppraisals] = useState<any[]>([]);
  const [disciplineRecords, setDisciplineRecords] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [signature, setSignature] = useState('');
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    fetchAppraisals();
    fetchDisciplineRecords();
    if (isManagementSigner) fetchSuggestions();
  }, []);

  const queueDept = String(user?.dept || '').trim().toLowerCase();
  const sameDept = (record: any) => {
    if (!queueDept) return true;
    const recDept = String(record?.employee_department || record?.dept || '').trim().toLowerCase();
    if (!recDept) return true;
    return recDept === queueDept;
  };

  const fetchAppraisals = async () => {
    try {
      const res = await fetch('/api/appraisals', { headers: getAuthHeaders() });
      const data = await res.json();
      setAppraisals(Array.isArray(data) ? data : []);
    } catch {
      setAppraisals([]);
    }
  };

  const fetchDisciplineRecords = async () => {
    try {
      const res = await fetch('/api/discipline_records', { headers: getAuthHeaders() });
      const data = await res.json();
      setDisciplineRecords(Array.isArray(data) ? data : []);
    } catch {
      setDisciplineRecords([]);
    }
  };

  const fetchSuggestions = async () => {
    try {
      const res = await fetch('/api/suggestions', { headers: getAuthHeaders() });
      const data = await res.json();
      setSuggestions(Array.isArray(data) ? data : []);
    } catch {
      setSuggestions([]);
    }
  };

  const signEmployeeAppraisal = async (id: number) => {
    if (!signature) return window.notify?.('Please provide your signature', 'error');
    try {
      const res = await fetch(`/api/appraisals/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          employee_signature: signature,
          employee_signature_date: new Date().toISOString().split('T')[0],
          employee_acknowledgement: remarks || 'Acknowledged',
          employee_print_name: user?.full_name || user?.employee_name || null,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Employee signature saved', 'success');
      setActiveId(null);
      setSignature('');
      setRemarks('');
      fetchAppraisals();
    } catch {
      window.notify?.('Failed to sign appraisal', 'error');
    }
  };

  const signSupervisorAppraisal = async (id: number) => {
    if (!signature) return window.notify?.('Please provide your signature', 'error');
    try {
      const res = await fetch(`/api/appraisals/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          supervisor_signature: signature,
          supervisor_signature_date: new Date().toISOString().split('T')[0],
          supervisor_print_name: user?.full_name || user?.employee_name || null,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Supervisor signature saved', 'success');
      setActiveId(null);
      setSignature('');
      fetchAppraisals();
    } catch {
      window.notify?.('Failed to sign appraisal', 'error');
    }
  };

  const signHrAppraisal = async (id: number) => {
    if (!signature) return window.notify?.('Please provide your signature', 'error');
    try {
      const res = await fetch(`/api/appraisals/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          hr_signature: signature,
          hr_signature_date: new Date().toISOString().split('T')[0],
          hr_print_name: user?.full_name || user?.employee_name || null,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('HR signature saved', 'success');
      setActiveId(null);
      setSignature('');
      fetchAppraisals();
    } catch {
      window.notify?.('Failed to sign appraisal', 'error');
    }
  };

  const signEmployeeDiscipline = async (id: number) => {
    if (!signature) return window.notify?.('Please provide your signature', 'error');
    try {
      const res = await fetch(`/api/discipline_records/${id}/employee-sign`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          employee_signature: signature,
          employee_signature_date: new Date().toISOString().split('T')[0],
          employee_statement: remarks || undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Disciplinary acknowledgement saved', 'success');
      setActiveId(null);
      setSignature('');
      setRemarks('');
      fetchDisciplineRecords();
    } catch {
      window.notify?.('Failed to sign disciplinary record', 'error');
    }
  };

  const signSupervisorDiscipline = async (id: number) => {
    if (!signature) return window.notify?.('Please provide your signature', 'error');
    try {
      const res = await fetch(`/api/discipline_records/${id}/supervisor-sign`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          supervisor_signature: signature,
          supervisor_signature_date: new Date().toISOString().split('T')[0],
        }),
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Supervisor disciplinary signature saved', 'success');
      setActiveId(null);
      setSignature('');
      fetchDisciplineRecords();
    } catch {
      window.notify?.('Failed to sign disciplinary record', 'error');
    }
  };

  const signSupervisorSuggestion = async (s: any) => {
    if (!signature) return window.notify?.('Please provide your signature', 'error');
    try {
      const res = await fetch(`/api/suggestions/${s.id}/management`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          supervisor_name: s.supervisor_name || user?.full_name || user?.employee_name || null,
          supervisor_title: s.supervisor_title || user?.position || 'Supervisor',
          date_received: s.date_received || new Date().toISOString().split('T')[0],
          follow_up_date: s.follow_up_date || null,
          suggestion_merit: s.suggestion_merit || null,
          benefit_to_company: s.benefit_to_company || null,
          cost_to_company: s.cost_to_company || null,
          cost_efficient_explanation: s.cost_efficient_explanation || null,
          suggestion_priority: s.suggestion_priority || null,
          action_to_be_taken: s.action_to_be_taken || null,
          suggested_reward: s.suggested_reward || null,
          supervisor_signature: signature,
          supervisor_signature_date: new Date().toISOString().split('T')[0],
          status: s.status || 'Reviewed',
        }),
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Supervisor suggestion signature saved', 'success');
      setActiveId(null);
      setSignature('');
      fetchSuggestions();
    } catch {
      window.notify?.('Failed to sign suggestion', 'error');
    }
  };

  const pendingEmployeeAppraisals = useMemo(() => appraisals.filter((a) => {
    const isPerformance = String(a.form_type || a.eval_type || '').toLowerCase().includes('performance');
    return !!a.supervisor_signature && (!isPerformance || !!a.reviewer_signature) && !a.employee_signature;
  }), [appraisals]);

  const pendingEmployeeDiscipline = useMemo(
    () => disciplineRecords.filter((d) => !!d.supervisor_signature && !d.employee_signature),
    [disciplineRecords]
  );

  const pendingSupervisorAppraisals = useMemo(
    () => appraisals.filter((a) => !a.supervisor_signature && sameDept(a)),
    [appraisals, queueDept]
  );
  const doneSupervisorAppraisals = useMemo(
    () => appraisals.filter((a) => !!a.supervisor_signature && sameDept(a)),
    [appraisals, queueDept]
  );

  const pendingSupervisorDiscipline = useMemo(
    () => disciplineRecords.filter((d) => !d.supervisor_signature && sameDept(d)),
    [disciplineRecords, queueDept]
  );
  const doneSupervisorDiscipline = useMemo(
    () => disciplineRecords.filter((d) => !!d.supervisor_signature && sameDept(d)),
    [disciplineRecords, queueDept]
  );

  const pendingSupervisorSuggestions = useMemo(
    () => suggestions.filter((s) => !s.supervisor_signature && sameDept(s)),
    [suggestions, queueDept]
  );
  const doneSupervisorSuggestions = useMemo(
    () => suggestions.filter((s) => !!s.supervisor_signature && sameDept(s)),
    [suggestions, queueDept]
  );

  const pendingHrAppraisals = useMemo(() => appraisals.filter((a) => {
    const isPerformance = String(a.form_type || a.eval_type || '').toLowerCase().includes('performance');
    return isPerformance && !!a.supervisor_signature && !!a.reviewer_signature && !!a.employee_signature && !a.hr_signature;
  }), [appraisals]);

  const doneHrAppraisals = useMemo(
    () => appraisals.filter((a) => !!a.hr_signature),
    [appraisals]
  );

  const roleSubtitle = isHR
    ? 'HR department signature queue (department scoped)'
    : isManagementSigner
      ? 'Management signature queue (department scoped)'
      : 'Review and sign records assigned to you';

  const renderSignBox = (action: () => void, withRemarks = false) => (
    <div className="mt-3 border-t dark:border-slate-700 pt-3 space-y-3">
      {withRemarks && (
        <textarea
          rows={2}
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100"
          placeholder="Optional remarks"
        />
      )}
      <SignatureUpload label="Digital Signature" value={signature} onChange={setSignature} />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => { setActiveId(null); setSignature(''); setRemarks(''); }}
          className="px-3 py-1.5 text-sm text-slate-500"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={action}
          disabled={!signature}
          className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-50"
        >
          Sign
        </button>
      </div>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <SectionHeader title="Signature Queue" subtitle={roleSubtitle} />

      {isEmployee && (
        <div className="space-y-4">
          <Card>
            <h3 className="text-sm font-bold mb-3">Appraisals Pending Your Signature</h3>
            {pendingEmployeeAppraisals.length === 0 && <p className="text-sm text-slate-400">No pending appraisal signatures.</p>}
            {pendingEmployeeAppraisals.map((a) => (
              <div key={`emp-app-${a.id}`} className="border rounded-lg p-3 mb-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{a.form_type || a.eval_type || 'Appraisal'}</p>
                    <p className="text-xs text-slate-500">{a.employee_name || 'Employee'} • {a.sign_off_date || a.created_at?.split('T')[0] || '—'}</p>
                  </div>
                  <button className="text-sm font-bold text-teal-deep" onClick={() => setActiveId(`emp-app-${a.id}`)}>Sign</button>
                </div>
                {activeId === `emp-app-${a.id}` && renderSignBox(() => signEmployeeAppraisal(a.id), true)}
              </div>
            ))}
          </Card>

          <Card>
            <h3 className="text-sm font-bold mb-3">Disciplinary Records Pending Your Signature</h3>
            {pendingEmployeeDiscipline.length === 0 && <p className="text-sm text-slate-400">No pending disciplinary signatures.</p>}
            {pendingEmployeeDiscipline.map((d) => (
              <div key={`emp-disc-${d.id}`} className="border rounded-lg p-3 mb-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{d.warning_level || 'Warning'} - {d.violation_type || 'Disciplinary Action'}</p>
                    <p className="text-xs text-slate-500">{d.employee_name || 'Employee'} • {d.date_of_warning || '—'}</p>
                  </div>
                  <button className="text-sm font-bold text-teal-deep" onClick={() => setActiveId(`emp-disc-${d.id}`)}>Sign</button>
                </div>
                {activeId === `emp-disc-${d.id}` && renderSignBox(() => signEmployeeDiscipline(d.id), true)}
              </div>
            ))}
          </Card>
        </div>
      )}

      {isManagementSigner && (
        <div className="space-y-4">
          <Card>
            <h3 className="text-sm font-bold mb-3">Appraisals Needing Management Signature</h3>
            {pendingSupervisorAppraisals.length === 0 && <p className="text-sm text-slate-400">No pending management signatures.</p>}
            {pendingSupervisorAppraisals.map((a) => (
              <div key={`sup-app-${a.id}`} className="border rounded-lg p-3 mb-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{a.employee_name || 'Employee'} - {a.form_type || a.eval_type || 'Appraisal'}</p>
                    <p className="text-xs text-slate-500">Department: {a.employee_department || a.dept || user?.dept || '—'}</p>
                  </div>
                  <button className="text-sm font-bold text-teal-deep" onClick={() => setActiveId(`sup-app-${a.id}`)}>Sign</button>
                </div>
                {activeId === `sup-app-${a.id}` && renderSignBox(() => signSupervisorAppraisal(a.id))}
              </div>
            ))}
            <p className="mt-2 text-xs text-emerald-600">Finished: {doneSupervisorAppraisals.length}</p>
          </Card>

          <Card>
            <h3 className="text-sm font-bold mb-3">Disciplinary Records Needing Management Signature</h3>
            {pendingSupervisorDiscipline.length === 0 && <p className="text-sm text-slate-400">No pending management disciplinary signatures.</p>}
            {pendingSupervisorDiscipline.map((d) => (
              <div key={`sup-disc-${d.id}`} className="border rounded-lg p-3 mb-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{d.employee_name || 'Employee'} - {d.warning_level || 'Warning'}</p>
                    <p className="text-xs text-slate-500">{d.violation_type || 'Disciplinary Action'}</p>
                  </div>
                  <button className="text-sm font-bold text-teal-deep" onClick={() => setActiveId(`sup-disc-${d.id}`)}>Sign</button>
                </div>
                {activeId === `sup-disc-${d.id}` && renderSignBox(() => signSupervisorDiscipline(d.id))}
              </div>
            ))}
            <p className="mt-2 text-xs text-emerald-600">Finished: {doneSupervisorDiscipline.length}</p>
          </Card>

          <Card>
            <h3 className="text-sm font-bold mb-3">Suggestions Needing Management Signature</h3>
            {pendingSupervisorSuggestions.length === 0 && <p className="text-sm text-slate-400">No pending suggestion signatures.</p>}
            {pendingSupervisorSuggestions.map((s) => (
              <div key={`sup-sug-${s.id}`} className="border rounded-lg p-3 mb-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{s.employee_name || 'Employee'} - Suggestion</p>
                    <p className="text-xs text-slate-500 truncate">{s.title || s.concern || 'Untitled suggestion'}</p>
                  </div>
                  <button className="text-sm font-bold text-teal-deep" onClick={() => setActiveId(`sup-sug-${s.id}`)}>Sign</button>
                </div>
                {activeId === `sup-sug-${s.id}` && renderSignBox(() => signSupervisorSuggestion(s))}
              </div>
            ))}
            <p className="mt-2 text-xs text-emerald-600">Finished: {doneSupervisorSuggestions.length}</p>
          </Card>
        </div>
      )}

      {isHR && (
        <Card>
          <h3 className="text-sm font-bold mb-3">Performance Appraisals Needing HR Signature</h3>
          {pendingHrAppraisals.length === 0 && <p className="text-sm text-slate-400">No pending HR signatures.</p>}
          {pendingHrAppraisals.map((a) => (
            <div key={`hr-app-${a.id}`} className="border rounded-lg p-3 mb-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{a.employee_name || 'Employee'} - {a.form_type || a.eval_type || 'Performance Evaluation'}</p>
                  <p className="text-xs text-slate-500">All previous signatures complete. Awaiting HR signature.</p>
                </div>
                <button className="text-sm font-bold text-teal-deep" onClick={() => setActiveId(`hr-app-${a.id}`)}>Sign</button>
              </div>
              {activeId === `hr-app-${a.id}` && renderSignBox(() => signHrAppraisal(a.id))}
            </div>
          ))}
          <div className="mt-3 flex items-center gap-2 text-emerald-600 text-sm font-semibold">
            <CheckCircle size={14} /> Finished: {doneHrAppraisals.length}
          </div>
        </Card>
      )}

      {!isEmployee && !isSupervisor && !isHR && (
        <Card>
          <div className="py-10 text-center text-slate-400">
            <ShieldAlert size={42} className="mx-auto mb-3 opacity-30" />
            <p className="font-bold">No signature queue for your role.</p>
          </div>
        </Card>
      )}

      <div className="mt-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1"><FileCheck size={12} /> Records marked as signed are treated as finished.</span>
      </div>
    </motion.div>
  );
};
