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
  const [onboardingRecords, setOnboardingRecords] = useState<any[]>([]);
  const [applicants, setApplicants] = useState<any[]>([]);
  const [requisitions, setRequisitions] = useState<any[]>([]);
  const [propertyRecords, setPropertyRecords] = useState<any[]>([]);
  const [exitInterviews, setExitInterviews] = useState<any[]>([]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeQueueSection, setActiveQueueSection] = useState<string>('');
  const [signature, setSignature] = useState('');
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    fetchAppraisals();
    fetchDisciplineRecords();
    fetchOnboarding();
    fetchApplicants();
    fetchRequisitions();
    fetchPropertyRecords();
    fetchExitInterviews();
    if (isManagementSigner) fetchSuggestions();
  }, [isManagementSigner]);

  const queueDept = String(user?.dept || '').trim().toLowerCase();
  const sameDept = (record: any) => {
    if (!queueDept) return true;
    const recDept = String(record?.employee_department || record?.dept || record?.position_dept || record?.department || '').trim().toLowerCase();
    if (!recDept) return true;
    return recDept === queueDept;
  };

  const userEmpId = Number(user?.employee_id || user?.id || 0);
  const userName = String(user?.employee_name || user?.full_name || '').trim().toLowerCase();

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

  const fetchOnboarding = async () => {
    try {
      const res = await fetch('/api/onboarding', { headers: getAuthHeaders() });
      const data = await res.json();
      setOnboardingRecords(Array.isArray(data) ? data : []);
    } catch {
      setOnboardingRecords([]);
    }
  };

  const fetchApplicants = async () => {
    try {
      const res = await fetch('/api/applicants', { headers: getAuthHeaders() });
      const data = await res.json();
      setApplicants(Array.isArray(data) ? data : []);
    } catch {
      setApplicants([]);
    }
  };

  const fetchRequisitions = async () => {
    try {
      const res = await fetch('/api/requisitions', { headers: getAuthHeaders() });
      const data = await res.json();
      setRequisitions(Array.isArray(data) ? data : []);
    } catch {
      setRequisitions([]);
    }
  };

  const fetchPropertyRecords = async () => {
    try {
      const res = await fetch('/api/property_accountability', { headers: getAuthHeaders() });
      const data = await res.json();
      setPropertyRecords(Array.isArray(data) ? data : []);
    } catch {
      setPropertyRecords([]);
    }
  };

  const fetchExitInterviews = async () => {
    try {
      const res = await fetch('/api/exit_interviews', { headers: getAuthHeaders() });
      const data = await res.json();
      setExitInterviews(Array.isArray(data) ? data : []);
    } catch {
      setExitInterviews([]);
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

  const signPreparerDiscipline = async (id: number) => {
    if (!signature) return window.notify?.('Please provide your signature', 'error');
    try {
      const res = await fetch(`/api/discipline_records/${id}/preparer-sign`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          preparer_signature: signature,
          preparer_signature_date: new Date().toISOString().split('T')[0],
        }),
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Preparer disciplinary signature saved', 'success');
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

  const signOnboarding = async (id: number, field: 'employee_signature' | 'hr_signature') => {
    if (!signature) return window.notify?.('Please provide your signature', 'error');
    try {
      const res = await fetch(`/api/onboarding/${id}/signature`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ field, signature }),
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Onboarding signature saved', 'success');
      setActiveId(null);
      setSignature('');
      fetchOnboarding();
    } catch {
      window.notify?.('Failed to sign onboarding record', 'error');
    }
  };

  const signApplicant = async (id: number, field: 'interviewer_signature' | 'hr_reviewer_signature') => {
    if (!signature) return window.notify?.('Please provide your signature', 'error');
    try {
      const res = await fetch(`/api/applicants/${id}/signature`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          field,
          signature,
          name: user?.full_name || user?.employee_name || null,
          date: new Date().toISOString().split('T')[0],
        }),
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Applicant signature saved', 'success');
      setActiveId(null);
      setSignature('');
      fetchApplicants();
    } catch {
      window.notify?.('Failed to sign applicant record', 'error');
    }
  };

  const signRequisitionStage = async (id: number, stage: 'supervisor' | 'dept_head' | 'cabinet' | 'vp' | 'president') => {
    if (!signature) return window.notify?.('Please provide your signature', 'error');
    try {
      const res = await fetch(`/api/requisitions/${id}/signature`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          stage,
          signature,
          approver: user?.full_name || user?.employee_name || null,
          date: new Date().toISOString().split('T')[0],
        }),
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Requisition signature saved', 'success');
      setActiveId(null);
      setSignature('');
      fetchRequisitions();
    } catch {
      window.notify?.('Failed to sign requisition approval', 'error');
    }
  };

  const signProperty = async (id: number, field: 'turnover_by_sig' | 'noted_by_sig' | 'received_by_sig' | 'audited_by_sig') => {
    if (!signature) return window.notify?.('Please provide your signature', 'error');
    try {
      const res = await fetch(`/api/property_accountability/${id}/signature`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          field,
          signature,
          name: user?.full_name || user?.employee_name || null,
          date: new Date().toISOString().split('T')[0],
        }),
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Property accountability signature saved', 'success');
      setActiveId(null);
      setSignature('');
      fetchPropertyRecords();
    } catch {
      window.notify?.('Failed to sign property accountability record', 'error');
    }
  };

  const signExitInterview = async (id: number, field: 'employee_sig' | 'interviewer_sig') => {
    if (!signature) return window.notify?.('Please provide your signature', 'error');
    try {
      const res = await fetch(`/api/exit_interviews/${id}/signature`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          field,
          signature,
          interviewer_name: user?.full_name || user?.employee_name || null,
          date: new Date().toISOString().split('T')[0],
        }),
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Exit interview signature saved', 'success');
      setActiveId(null);
      setSignature('');
      fetchExitInterviews();
    } catch {
      window.notify?.('Failed to sign exit interview', 'error');
    }
  };

  const pendingEmployeeAppraisals = useMemo(() => appraisals.filter((a) => {
    const isPerformance = String(a.form_type || a.eval_type || '').toLowerCase().includes('performance');
    return !!a.supervisor_signature && (!isPerformance || !!a.reviewer_signature) && !a.employee_signature;
  }), [appraisals]);

  const pendingEmployeeDiscipline = useMemo(
    () => disciplineRecords.filter((d) => !!d.preparer_signature && !!d.supervisor_signature && !d.employee_signature),
    [disciplineRecords]
  );

  const pendingEmployeeOnboarding = useMemo(
    () => onboardingRecords.filter((o) => Number(o.employee_id) === userEmpId && !o.employee_signature),
    [onboardingRecords, userEmpId]
  );

  const pendingEmployeeExitInterviews = useMemo(
    () => exitInterviews.filter((e) => !e.employee_sig && userName && String(e.employee_name || '').trim().toLowerCase() === userName),
    [exitInterviews, userName]
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
    () => disciplineRecords.flatMap((d) => {
      if (!sameDept(d)) return [] as any[];
      const tasks: any[] = [];
      const assignedPreparerId = Number(d.preparer_user_id || 0);
      const assignedSupervisorId = Number(d.supervisor_user_id || 0);
      if (!d.preparer_signature && (!assignedPreparerId || assignedPreparerId === Number(user?.id || 0))) {
        tasks.push({ ...d, queueStage: 'preparer', queueKey: `sup-disc-prep-${d.id}` });
      }
      if (!!d.preparer_signature && !d.supervisor_signature && (!assignedSupervisorId || assignedSupervisorId === Number(user?.id || 0))) {
        tasks.push({ ...d, queueStage: 'supervisor', queueKey: `sup-disc-sup-${d.id}` });
      }
      return tasks;
    }),
    [disciplineRecords, queueDept, user?.id]
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

  const pendingManagementApplicants = useMemo(
    () => applicants.filter((a) => !a.interviewer_signature && sameDept(a)),
    [applicants, queueDept]
  );

  const pendingManagementPropertyTasks = useMemo(
    () => propertyRecords
      .filter((p) => sameDept(p))
      .flatMap((p) => {
        const tasks: any[] = [];
        if (!p.turnover_by_sig) tasks.push({ key: `prop-turn-${p.id}`, id: p.id, field: 'turnover_by_sig', title: 'Turned over by signature', employee_name: p.employee_name });
        if (!p.noted_by_sig) tasks.push({ key: `prop-note-${p.id}`, id: p.id, field: 'noted_by_sig', title: 'Noted by signature', employee_name: p.employee_name });
        if (!p.audited_by_sig) tasks.push({ key: `prop-audit-${p.id}`, id: p.id, field: 'audited_by_sig', title: 'Audited by signature', employee_name: p.employee_name });
        return tasks;
      }),
    [propertyRecords, queueDept]
  );

  const pendingManagementExitInterviews = useMemo(
    () => exitInterviews.filter((e) => !e.interviewer_sig && sameDept(e)),
    [exitInterviews, queueDept]
  );

  const pendingManagementRequisitionStages = useMemo(
    () => requisitions
      .filter((r) => sameDept(r))
      .flatMap((r) => {
        const tasks: any[] = [];
        if (!r.supervisor_approval_sig) tasks.push({ key: `req-sup-${r.id}`, id: r.id, stage: 'supervisor', title: 'Supervisor approval signature', job_title: r.job_title, department: r.department });
        return tasks;
      }),
    [requisitions, queueDept]
  );

  const pendingHrAppraisals = useMemo(() => appraisals.filter((a) => {
    const isPerformance = String(a.form_type || a.eval_type || '').toLowerCase().includes('performance');
    const isReady = isPerformance && !!a.supervisor_signature && !!a.reviewer_signature && !!a.employee_signature && !a.hr_signature;
    if (!isReady) return false;
    
    // If HR ownership is set, only show to assigned HR user
    if (a.hr_owner_user_id) {
      return a.hr_owner_user_id === user?.id;
    }
    
    // Otherwise show to all HR users in department
    return true;
  }), [appraisals, user?.id]);

  const doneHrAppraisals = useMemo(
    () => appraisals.filter((a) => !!a.hr_signature),
    [appraisals]
  );

  const pendingHrOnboarding = useMemo(
    () => onboardingRecords.filter((o) => {
      if (o.hr_signature) return false;
      if (!sameDept(o)) return false;
      // If HR ownership is set, only show to assigned HR user
      if (o.hr_owner_user_id) {
        return o.hr_owner_user_id === user?.id;
      }
      return true;
    }),
    [onboardingRecords, queueDept, user?.id]
  );

  const pendingHrApplicants = useMemo(
    () => applicants.filter((a) => {
      if (a.hr_reviewer_signature) return false;
      if (!sameDept(a)) return false;
      // If HR ownership is set, only show to assigned HR user
      if (a.hr_owner_user_id) {
        return a.hr_owner_user_id === user?.id;
      }
      return true;
    }),
    [applicants, queueDept, user?.id]
  );

  const pendingHrRequisitionStages = useMemo(
    () => requisitions
      .filter((r) => sameDept(r))
      .flatMap((r) => {
        const tasks: any[] = [];
        // Filter based on HR ownership if set
        const hasOwner = r.hr_owner_user_id;
        const isAssignedToMe = !hasOwner || r.hr_owner_user_id === user?.id;
        
        if (!r.dept_head_approval_sig && isAssignedToMe) tasks.push({ key: `req-dept-${r.id}`, id: r.id, stage: 'dept_head', title: 'Department head approval signature', job_title: r.job_title, department: r.department, hr_owner: r.hr_owner_user_id });
        if (!r.cabinet_approval_sig && isAssignedToMe) tasks.push({ key: `req-cab-${r.id}`, id: r.id, stage: 'cabinet', title: 'Cabinet approval signature', job_title: r.job_title, department: r.department, hr_owner: r.hr_owner_user_id });
        if (!r.vp_approval_sig && isAssignedToMe) tasks.push({ key: `req-vp-${r.id}`, id: r.id, stage: 'vp', title: 'VP approval signature', job_title: r.job_title, department: r.department, hr_owner: r.hr_owner_user_id });
        if (!r.president_approval_sig && isAssignedToMe) tasks.push({ key: `req-prez-${r.id}`, id: r.id, stage: 'president', title: 'President approval signature', job_title: r.job_title, department: r.department, hr_owner: r.hr_owner_user_id });
        return tasks;
      }),
    [requisitions, queueDept, user?.id]
  );

  const roleSubtitle = isHR
    ? 'HR department signature queue (department scoped)'
    : isManagementSigner
      ? 'Management signature queue (department scoped)'
      : 'Review and sign records assigned to you';

  const queueSections = useMemo(() => {
    const sections: Array<{ id: string; label: string; count: number }> = [];

    if (isEmployee) {
      sections.push({ id: 'emp-appraisals', label: 'Appraisals', count: pendingEmployeeAppraisals.length });
      sections.push({ id: 'emp-discipline', label: 'Disciplinary', count: pendingEmployeeDiscipline.length });
      sections.push({ id: 'emp-onboarding', label: 'Onboarding', count: pendingEmployeeOnboarding.length });
      sections.push({ id: 'emp-exit', label: 'Exit Interviews', count: pendingEmployeeExitInterviews.length });
    }

    if (isManagementSigner) {
      sections.push({ id: 'mgmt-appraisals', label: 'Appraisals', count: pendingSupervisorAppraisals.length });
      sections.push({ id: 'mgmt-discipline', label: 'Disciplinary', count: pendingSupervisorDiscipline.length });
      sections.push({ id: 'mgmt-suggestions', label: 'Suggestions', count: pendingSupervisorSuggestions.length });
      sections.push({ id: 'mgmt-applicants', label: 'Applicants', count: pendingManagementApplicants.length });
      sections.push({ id: 'mgmt-reqs', label: 'Requisitions', count: pendingManagementRequisitionStages.length });
      sections.push({ id: 'mgmt-property', label: 'Property', count: pendingManagementPropertyTasks.length });
      sections.push({ id: 'mgmt-exit', label: 'Exit Interviews', count: pendingManagementExitInterviews.length });
    }

    if (isHR) {
      sections.push({ id: 'hr-appraisals', label: 'Appraisals', count: pendingHrAppraisals.length });
      sections.push({ id: 'hr-onboarding', label: 'Onboarding', count: pendingHrOnboarding.length });
      sections.push({ id: 'hr-applicants', label: 'Applicants', count: pendingHrApplicants.length });
      sections.push({ id: 'hr-reqs', label: 'Requisitions', count: pendingHrRequisitionStages.length });
    }

    return sections;
  }, [
    isEmployee,
    isManagementSigner,
    isHR,
    pendingEmployeeAppraisals.length,
    pendingEmployeeDiscipline.length,
    pendingEmployeeOnboarding.length,
    pendingEmployeeExitInterviews.length,
    pendingSupervisorAppraisals.length,
    pendingSupervisorDiscipline.length,
    pendingSupervisorSuggestions.length,
    pendingManagementApplicants.length,
    pendingManagementRequisitionStages.length,
    pendingManagementPropertyTasks.length,
    pendingManagementExitInterviews.length,
    pendingHrAppraisals.length,
    pendingHrOnboarding.length,
    pendingHrApplicants.length,
    pendingHrRequisitionStages.length,
  ]);

  useEffect(() => {
    if (!queueSections.length) return;
    const hasActive = queueSections.some((s) => s.id === activeQueueSection);
    if (hasActive) return;
    const firstWithPending = queueSections.find((s) => s.count > 0);
    setActiveQueueSection((firstWithPending || queueSections[0]).id);
  }, [queueSections, activeQueueSection]);

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
      <SignatureUpload label="Digital Signature" value={signature} onChange={setSignature} showQueueReminder={false} />
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

      {queueSections.length > 0 && (
        <Card>
          <div className="flex flex-wrap gap-2">
            {queueSections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveQueueSection(section.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                  activeQueueSection === section.id
                    ? 'bg-teal-deep text-white border-teal-deep'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                }`}
              >
                {section.label} <span className="ml-1">({section.count})</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {isEmployee && (
        <div className="space-y-4">
          {activeQueueSection === 'emp-appraisals' && (
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
          )}

          {activeQueueSection === 'emp-discipline' && (
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
          )}

          {activeQueueSection === 'emp-onboarding' && (
          <Card>
            <h3 className="text-sm font-bold mb-3">Onboarding Records Pending Your Signature</h3>
            {pendingEmployeeOnboarding.length === 0 && <p className="text-sm text-slate-400">No pending onboarding signatures.</p>}
            {pendingEmployeeOnboarding.map((o) => (
              <div key={`emp-onb-${o.id}`} className="border rounded-lg p-3 mb-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{o.employee_name || 'Employee'} - Onboarding</p>
                    <p className="text-xs text-slate-500">Status: {o.status || 'Pending'}</p>
                  </div>
                  <button className="text-sm font-bold text-teal-deep" onClick={() => setActiveId(`emp-onb-${o.id}`)}>Sign</button>
                </div>
                {activeId === `emp-onb-${o.id}` && renderSignBox(() => signOnboarding(o.id, 'employee_signature'))}
              </div>
            ))}
          </Card>
          )}

          {activeQueueSection === 'emp-exit' && (
          <Card>
            <h3 className="text-sm font-bold mb-3">Exit Interviews Pending Your Signature</h3>
            {pendingEmployeeExitInterviews.length === 0 && <p className="text-sm text-slate-400">No pending exit interview signatures.</p>}
            {pendingEmployeeExitInterviews.map((e) => (
              <div key={`emp-exit-${e.id}`} className="border rounded-lg p-3 mb-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{e.employee_name || 'Employee'} - Exit Interview</p>
                    <p className="text-xs text-slate-500">{e.interview_date || '—'}</p>
                  </div>
                  <button className="text-sm font-bold text-teal-deep" onClick={() => setActiveId(`emp-exit-${e.id}`)}>Sign</button>
                </div>
                {activeId === `emp-exit-${e.id}` && renderSignBox(() => signExitInterview(e.id, 'employee_sig'))}
              </div>
            ))}
          </Card>
          )}
        </div>
      )}

      {isManagementSigner && (
        <div className="space-y-4">
          {activeQueueSection === 'mgmt-appraisals' && (
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
          )}

          {activeQueueSection === 'mgmt-discipline' && (
          <Card>
            <h3 className="text-sm font-bold mb-3">Disciplinary Records Needing Management Signature</h3>
            {pendingSupervisorDiscipline.length === 0 && <p className="text-sm text-slate-400">No pending management disciplinary signatures.</p>}
            {pendingSupervisorDiscipline.map((d) => (
              <div key={d.queueKey || `sup-disc-${d.id}`} className="border rounded-lg p-3 mb-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{d.employee_name || 'Employee'} - {d.warning_level || 'Warning'}</p>
                    <p className="text-xs text-slate-500">{d.violation_type || 'Disciplinary Action'} • Stage: {d.queueStage === 'preparer' ? 'Preparer' : 'Supervisor'}</p>
                  </div>
                  <button className="text-sm font-bold text-teal-deep" onClick={() => setActiveId(d.queueKey || `sup-disc-${d.id}`)}>Sign</button>
                </div>
                {activeId === (d.queueKey || `sup-disc-${d.id}`) && renderSignBox(() => d.queueStage === 'preparer' ? signPreparerDiscipline(d.id) : signSupervisorDiscipline(d.id))}
              </div>
            ))}
            <p className="mt-2 text-xs text-emerald-600">Finished: {doneSupervisorDiscipline.length}</p>
          </Card>
          )}

          {activeQueueSection === 'mgmt-suggestions' && (
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
          )}

          {activeQueueSection === 'mgmt-applicants' && (
          <Card>
            <h3 className="text-sm font-bold mb-3">Applicants Needing Interviewer Signature</h3>
            {pendingManagementApplicants.length === 0 && <p className="text-sm text-slate-400">No pending interviewer signatures.</p>}
            {pendingManagementApplicants.map((a) => (
              <div key={`mgmt-app-${a.id}`} className="border rounded-lg p-3 mb-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{a.name || 'Applicant'} - {a.position || 'Position'}</p>
                    <p className="text-xs text-slate-500">Interview appraisal</p>
                  </div>
                  <button className="text-sm font-bold text-teal-deep" onClick={() => setActiveId(`mgmt-app-${a.id}`)}>Sign</button>
                </div>
                {activeId === `mgmt-app-${a.id}` && renderSignBox(() => signApplicant(a.id, 'interviewer_signature'))}
              </div>
            ))}
          </Card>
          )}

          {activeQueueSection === 'mgmt-reqs' && (
          <Card>
            <h3 className="text-sm font-bold mb-3">Requisitions Needing Supervisor Signature</h3>
            {pendingManagementRequisitionStages.length === 0 && <p className="text-sm text-slate-400">No pending requisition signatures.</p>}
            {pendingManagementRequisitionStages.map((t) => (
              <div key={t.key} className="border rounded-lg p-3 mb-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{t.job_title || 'Requisition'} - {t.title}</p>
                    <p className="text-xs text-slate-500">Department: {t.department || '—'}</p>
                  </div>
                  <button className="text-sm font-bold text-teal-deep" onClick={() => setActiveId(t.key)}>Sign</button>
                </div>
                {activeId === t.key && renderSignBox(() => signRequisitionStage(t.id, t.stage))}
              </div>
            ))}
          </Card>
          )}

          {activeQueueSection === 'mgmt-property' && (
          <Card>
            <h3 className="text-sm font-bold mb-3">Property Accountability Signatures</h3>
            {pendingManagementPropertyTasks.length === 0 && <p className="text-sm text-slate-400">No pending property signatures.</p>}
            {pendingManagementPropertyTasks.map((t) => (
              <div key={t.key} className="border rounded-lg p-3 mb-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{t.employee_name || 'Employee'} - {t.title}</p>
                    <p className="text-xs text-slate-500">Property accountability</p>
                  </div>
                  <button className="text-sm font-bold text-teal-deep" onClick={() => setActiveId(t.key)}>Sign</button>
                </div>
                {activeId === t.key && renderSignBox(() => signProperty(t.id, t.field))}
              </div>
            ))}
          </Card>
          )}

          {activeQueueSection === 'mgmt-exit' && (
          <Card>
            <h3 className="text-sm font-bold mb-3">Exit Interviews Needing Interviewer Signature</h3>
            {pendingManagementExitInterviews.length === 0 && <p className="text-sm text-slate-400">No pending interviewer signatures.</p>}
            {pendingManagementExitInterviews.map((e) => (
              <div key={`mgmt-exit-${e.id}`} className="border rounded-lg p-3 mb-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{e.employee_name || 'Employee'} - Exit Interview</p>
                    <p className="text-xs text-slate-500">{e.department || '—'}</p>
                  </div>
                  <button className="text-sm font-bold text-teal-deep" onClick={() => setActiveId(`mgmt-exit-${e.id}`)}>Sign</button>
                </div>
                {activeId === `mgmt-exit-${e.id}` && renderSignBox(() => signExitInterview(e.id, 'interviewer_sig'))}
              </div>
            ))}
          </Card>
          )}
        </div>
      )}

      {isHR && (
        <div className="space-y-4">
          {activeQueueSection === 'hr-appraisals' && (
          <Card>
            <h3 className="text-sm font-bold mb-3">Performance Appraisals Needing HR Signature</h3>
            {pendingHrAppraisals.length === 0 && <p className="text-sm text-slate-400">No pending HR signatures assigned to you.</p>}
            {pendingHrAppraisals.map((a) => {
              const isAssignedToOther = a.hr_owner_user_id && a.hr_owner_user_id !== user?.id;
              const canSign = !isAssignedToOther || a.hr_owner_user_id === user?.id;
              return (
              <div key={`hr-app-${a.id}`} className="border rounded-lg p-3 mb-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1">
                    <p className="font-semibold">{a.employee_name || 'Employee'} - {a.form_type || a.eval_type || 'Performance Evaluation'}</p>
                    <p className="text-xs text-slate-500">All previous signatures complete. Awaiting HR signature.</p>
                    {a.hr_owner_user_id && <p className="text-xs text-orange-600 font-semibold mt-1">🔒 Assigned to specific HR user (ID: {a.hr_owner_user_id})</p>}
                  </div>
                  <button 
                    disabled={!canSign} 
                    className="text-sm font-bold text-teal-deep disabled:text-slate-400 disabled:cursor-not-allowed" 
                    onClick={() => setActiveId(`hr-app-${a.id}`)}
                    title={!canSign ? 'Assigned to another HR user' : 'Sign this appraisal'}
                  >
                    Sign
                  </button>
                </div>
                {activeId === `hr-app-${a.id}` && renderSignBox(() => signHrAppraisal(a.id))}
              </div>
            )})}
            <div className="mt-3 flex items-center gap-2 text-emerald-600 text-sm font-semibold">
              <CheckCircle size={14} /> Finished: {doneHrAppraisals.length}
            </div>
          </Card>
          )}

          {activeQueueSection === 'hr-onboarding' && (
          <Card>
            <h3 className="text-sm font-bold mb-3">Onboarding Records Needing HR Signature</h3>
            {pendingHrOnboarding.length === 0 && <p className="text-sm text-slate-400">No pending onboarding HR signatures.</p>}
            {pendingHrOnboarding.map((o) => (
              <div key={`hr-onb-${o.id}`} className="border rounded-lg p-3 mb-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{o.employee_name || 'Employee'} - Onboarding</p>
                    <p className="text-xs text-slate-500">Status: {o.status || 'Pending'}</p>
                  </div>
                  <button className="text-sm font-bold text-teal-deep" onClick={() => setActiveId(`hr-onb-${o.id}`)}>Sign</button>
                </div>
                {activeId === `hr-onb-${o.id}` && renderSignBox(() => signOnboarding(o.id, 'hr_signature'))}
              </div>
            ))}
          </Card>
          )}

          {activeQueueSection === 'hr-applicants' && (
          <Card>
            <h3 className="text-sm font-bold mb-3">Applicant Reviews Needing HR Signature</h3>
            {pendingHrApplicants.length === 0 && <p className="text-sm text-slate-400">No pending applicant HR reviewer signatures.</p>}
            {pendingHrApplicants.map((a) => (
              <div key={`hr-applicant-${a.id}`} className="border rounded-lg p-3 mb-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{a.name || 'Applicant'} - {a.position || 'Position'}</p>
                    <p className="text-xs text-slate-500">HR reviewer signature needed</p>
                  </div>
                  <button className="text-sm font-bold text-teal-deep" onClick={() => setActiveId(`hr-applicant-${a.id}`)}>Sign</button>
                </div>
                {activeId === `hr-applicant-${a.id}` && renderSignBox(() => signApplicant(a.id, 'hr_reviewer_signature'))}
              </div>
            ))}
          </Card>
          )}

          {activeQueueSection === 'hr-reqs' && (
          <Card>
            <h3 className="text-sm font-bold mb-3">Requisition Approvals Needing HR Signature</h3>
            {pendingHrRequisitionStages.length === 0 && <p className="text-sm text-slate-400">No pending HR requisition approvals.</p>}
            {pendingHrRequisitionStages.map((t) => (
              <div key={t.key} className="border rounded-lg p-3 mb-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{t.job_title || 'Requisition'} - {t.title}</p>
                    <p className="text-xs text-slate-500">Department: {t.department || '—'}</p>
                  </div>
                  <button className="text-sm font-bold text-teal-deep" onClick={() => setActiveId(t.key)}>Sign</button>
                </div>
                {activeId === t.key && renderSignBox(() => signRequisitionStage(t.id, t.stage))}
              </div>
            ))}
          </Card>
          )}
        </div>
      )}

      {!isEmployee && !isManagementSigner && !isHR && (
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
