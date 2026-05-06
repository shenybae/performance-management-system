import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { Modal } from '../../common/Modal';
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
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);
  const [disciplineReviewRecord, setDisciplineReviewRecord] = useState<any | null>(null);
  const [disciplineReviewedKeys, setDisciplineReviewedKeys] = useState<Record<string, boolean>>({});
  const [signature, setSignature] = useState('');
  const [remarks, setRemarks] = useState('');
  const [signerPrintTitle, setSignerPrintTitle] = useState('');
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [reviewerAgree, setReviewerAgree] = useState<'agree' | 'disagree' | ''>('');
  const [reviewerRevisedRating, setReviewerRevisedRating] = useState<'Satisfactory' | 'Unsatisfactory' | ''>('');
  const [reviewerComments, setReviewerComments] = useState('');
  const [employeeAcknowledgement, setEmployeeAcknowledgement] = useState('');
  const [supervisorOverallRating, setSupervisorOverallRating] = useState<'Satisfactory' | 'Unsatisfactory' | ''>('');
  const [supervisorRecommendation, setSupervisorRecommendation] = useState('');
  const [supervisorComments, setSupervisorComments] = useState('');
  const [applicantSignerName, setApplicantSignerName] = useState('');
  const [applicantSignerTitle, setApplicantSignerTitle] = useState('');
  const [applicantSignerDate, setApplicantSignerDate] = useState(new Date().toISOString().split('T')[0]);

  const resetQueueSignerState = () => {
    setActiveId(null);
    setSignature('');
    setRemarks('');
    setSignerPrintTitle('');
    setReviewConfirmed(false);
    setReviewerAgree('');
    setReviewerRevisedRating('');
    setReviewerComments('');
    setEmployeeAcknowledgement('');
    setSupervisorOverallRating('');
    setSupervisorRecommendation('');
    setSupervisorComments('');
    setApplicantSignerName('');
    setApplicantSignerTitle('');
    setApplicantSignerDate(new Date().toISOString().split('T')[0]);
  };

  useEffect(() => {
    fetchAppraisals();
    fetchDisciplineRecords();
    fetchOnboarding();
    fetchApplicants();
    fetchRequisitions();
    fetchPropertyRecords();
    fetchExitInterviews();
    if (isManagementSigner || isEmployee) fetchSuggestions();
  }, [isManagementSigner, isEmployee]);

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
    if (!reviewConfirmed) return window.notify?.('Please confirm you reviewed the form before signing', 'error');
    if (!signerPrintTitle.trim()) return window.notify?.('Please provide print name / title', 'error');
    if (!employeeAcknowledgement.trim()) return window.notify?.('Please provide acknowledgement statement', 'error');
    if (!signature) return window.notify?.('Please provide your signature', 'error');
    try {
      const res = await fetch(`/api/appraisals/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          employee_signature: signature,
          employee_signature_date: new Date().toISOString().split('T')[0],
          employee_acknowledgement: employeeAcknowledgement.trim(),
          employee_print_name: signerPrintTitle.trim(),
        }),
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Employee signature saved', 'success');
      resetQueueSignerState();
      fetchAppraisals();
    } catch {
      window.notify?.('Failed to sign appraisal', 'error');
    }
  };

  const signManagementAppraisal = async (a: any) => {
    if (!reviewConfirmed) return window.notify?.('Please confirm you reviewed the form before signing', 'error');
    if (!signerPrintTitle.trim()) return window.notify?.('Please provide print name / title', 'error');
    if (!signature) return window.notify?.('Please provide your signature', 'error');
    const stage = String(a?.queueStage || 'supervisor');
    if (stage !== 'reviewer' && !supervisorOverallRating) {
      return window.notify?.('Please select supervisor overall rating', 'error');
    }
    if (stage === 'reviewer' && !reviewerAgree) return window.notify?.('Please select reviewer agreement', 'error');
    if (stage === 'reviewer' && reviewerAgree === 'disagree' && !reviewerRevisedRating) {
      return window.notify?.('Please select revised rating for disagreement', 'error');
    }
    const payload: any = {};
    if (stage === 'reviewer') {
      payload.reviewer_signature = signature;
      payload.reviewer_signature_date = new Date().toISOString().split('T')[0];
      payload.reviewer_print_name = signerPrintTitle.trim();
      payload.reviewer_agree = reviewerAgree;
      payload.revised_rating = reviewerAgree === 'disagree' ? reviewerRevisedRating : null;
      payload.reviewers_comment = reviewerComments.trim() || null;
    } else {
      payload.supervisor_signature = signature;
      payload.supervisor_signature_date = new Date().toISOString().split('T')[0];
      payload.supervisor_print_name = signerPrintTitle.trim();
      payload.overall_rating = supervisorOverallRating;
      payload.recommendation = supervisorRecommendation || null;
      payload.supervisors_overall_comment = supervisorComments.trim() || null;
    }
    try {
      const res = await fetch(`/api/appraisals/${a.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.(`${stage === 'reviewer' ? 'Reviewer' : 'Supervisor'} signature saved`, 'success');
      resetQueueSignerState();
      fetchAppraisals();
    } catch {
      window.notify?.('Failed to sign appraisal', 'error');
    }
  };

  const signHrAppraisal = async (id: number) => {
    if (!reviewConfirmed) return window.notify?.('Please confirm you reviewed the form before signing', 'error');
    if (!signerPrintTitle.trim()) return window.notify?.('Please provide print name / title', 'error');
    if (!signature) return window.notify?.('Please provide your signature', 'error');
    try {
      const res = await fetch(`/api/appraisals/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          hr_signature: signature,
          hr_signature_date: new Date().toISOString().split('T')[0],
          hr_print_name: signerPrintTitle.trim(),
        }),
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('HR signature saved', 'success');
      resetQueueSignerState();
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
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as any));
        throw new Error(err?.error || 'Failed to sign disciplinary record');
      }
      window.notify?.('Disciplinary acknowledgement saved', 'success');
      setActiveId(null);
      setSignature('');
      setRemarks('');
      fetchDisciplineRecords();
    } catch (e: any) {
      window.notify?.(e?.message || 'Failed to sign disciplinary record', 'error');
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

  const signEmployeeSuggestion = async (id: number) => {
    if (!signature) return window.notify?.('Please provide your signature', 'error');
    try {
      const res = await fetch(`/api/suggestions/${id}/signature`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          signature,
          date: new Date().toISOString().split('T')[0],
        }),
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Suggestion signature saved', 'success');
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

  const signApplicant = async (
    id: number,
    field: 'interviewer_signature' | 'hr_reviewer_signature',
    details?: { name?: string; date?: string; title?: string }
  ) => {
    if (!signature) return window.notify?.('Please provide your signature', 'error');
    try {
      const res = await fetch(`/api/applicants/${id}/signature`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          field,
          signature,
          name: details?.name || user?.full_name || user?.employee_name || null,
          date: details?.date || new Date().toISOString().split('T')[0],
          title: details?.title || null,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Applicant signature saved', 'success');
      resetQueueSignerState();
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
    () => disciplineRecords.filter((d) => !d.employee_signature),
    [disciplineRecords]
  );

  const pendingEmployeeOnboarding = useMemo(
    () => onboardingRecords.filter((o) => Number(o.employee_id) === userEmpId && !o.employee_signature),
    [onboardingRecords, userEmpId]
  );

  const pendingEmployeeSuggestions = useMemo(
    () => suggestions.filter((s) => Number(s.employee_id) === userEmpId && !s.employee_signature),
    [suggestions, userEmpId]
  );

  const pendingEmployeeExitInterviews = useMemo(
    () => exitInterviews.filter((e) => !e.employee_sig && userName && String(e.employee_name || '').trim().toLowerCase() === userName),
    [exitInterviews, userName]
  );

  const pendingEmployeePropertyTasks = useMemo(
    () => propertyRecords.filter((p) => {
      if (p.received_by_sig) return false;
      const byId = userEmpId > 0 && Number(p.employee_id || 0) === userEmpId;
      const byName = userName && String(p.employee_name || '').trim().toLowerCase() === userName;
      return byId || byName;
    }),
    [propertyRecords, userEmpId, userName]
  );

  const pendingSupervisorAppraisals = useMemo(
    () => appraisals.flatMap((a) => {
      if (!sameDept(a)) return [] as any[];
      const isPerformance = String(a.form_type || a.eval_type || '').toLowerCase().includes('performance');
      const tasks: any[] = [];
      const assignedSupervisor = Number(a.supervisor_user_id || 0);
      const assignedReviewer = Number(a.reviewer_user_id || 0);
      const me = Number(user?.id || 0);

      if (!a.supervisor_signature && (!assignedSupervisor || assignedSupervisor === me)) {
        tasks.push({ ...a, queueStage: isPerformance ? 'supervisor' : 'manager', queueKey: `sup-app-sup-${a.id}` });
      } else if (isPerformance && !!a.supervisor_signature && !a.reviewer_signature && (!assignedReviewer || assignedReviewer === me)) {
        tasks.push({ ...a, queueStage: 'reviewer', queueKey: `sup-app-rev-${a.id}` });
      }

      return tasks;
    }),
    [appraisals, queueDept, user?.id]
  );
  const doneSupervisorAppraisals = useMemo(
    () => appraisals.filter((a) => {
      if (!sameDept(a)) return false;
      const isPerformance = String(a.form_type || a.eval_type || '').toLowerCase().includes('performance');
      return isPerformance ? (!!a.supervisor_signature && !!a.reviewer_signature) : !!a.supervisor_signature;
    }),
    [appraisals, queueDept]
  );

  const pendingSupervisorDiscipline = useMemo(
    () => disciplineRecords.flatMap((d) => {
      if (!sameDept(d)) return [] as any[];
      const tasks: any[] = [];
      const assignedPreparerId = Number(d.preparer_user_id || 0);
      const assignedSupervisorId = Number(d.supervisor_user_id || 0);
      const me = Number(user?.id || 0);
      if (!d.preparer_signature && (!assignedPreparerId || assignedPreparerId === Number(user?.id || 0))) {
        tasks.push({ ...d, queueStage: 'preparer', queueKey: `sup-disc-prep-${d.id}`, queueReady: true });
      }
      const canSignAsSupervisor = !assignedSupervisorId || assignedSupervisorId === me || isSupervisor;
      if (!d.supervisor_signature && canSignAsSupervisor) {
        tasks.push({ ...d, queueStage: 'supervisor', queueKey: `sup-disc-sup-${d.id}`, queueReady: !!d.preparer_signature });
      }
      return tasks;
    }),
    [disciplineRecords, queueDept, user?.id, isSupervisor]
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
      sections.push({ id: 'emp-suggestions', label: 'Suggestions', count: pendingEmployeeSuggestions.length });
      sections.push({ id: 'emp-property', label: 'Property', count: pendingEmployeePropertyTasks.length });
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
    pendingEmployeeSuggestions.length,
    pendingEmployeePropertyTasks.length,
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
          onClick={resetQueueSignerState}
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

  const renderApplicantSignBox = (
    action: () => void,
    stage: 'interviewer' | 'hr',
  ) => (
    <div className="mt-3 border-t dark:border-slate-700 pt-3 space-y-3">
      <label className="inline-flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
        <input
          type="checkbox"
          checked={reviewConfirmed}
          onChange={(e) => setReviewConfirmed(e.target.checked)}
          className="accent-amber-600"
        />
        I have reviewed this applicant appraisal before signing.
      </label>
      <div className={`grid gap-3 ${stage === 'interviewer' ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
        <input
          type="text"
          value={applicantSignerName}
          onChange={(e) => setApplicantSignerName(e.target.value)}
          className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100"
          placeholder="Printed Name"
          maxLength={120}
        />
        {stage === 'interviewer' && (
          <input
            type="text"
            value={applicantSignerTitle}
            onChange={(e) => setApplicantSignerTitle(e.target.value)}
            className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100"
            placeholder="Title"
            maxLength={120}
          />
        )}
        <input
          type="date"
          value={applicantSignerDate}
          onChange={(e) => setApplicantSignerDate(e.target.value)}
          className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100"
          max={new Date().toISOString().split('T')[0]}
        />
      </div>
      <SignatureUpload label="Digital Signature" value={signature} onChange={setSignature} showQueueReminder={false} />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={resetQueueSignerState}
          className="px-3 py-1.5 text-sm text-slate-500"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={action}
          disabled={!reviewConfirmed || !applicantSignerName.trim() || !applicantSignerDate || !signature}
          className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-50"
        >
          Sign
        </button>
      </div>
    </div>
  );

  const renderAppraisalSignBox = (action: () => void, stage: 'supervisor' | 'reviewer' | 'employee' | 'hr') => (
    <div className="mt-3 border-t dark:border-slate-700 pt-3 space-y-3">
      <label className="inline-flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
        <input
          type="checkbox"
          checked={reviewConfirmed}
          onChange={(e) => setReviewConfirmed(e.target.checked)}
          className="accent-amber-600"
        />
        I have reviewed this evaluation before signing.
      </label>
      <input
        type="text"
        value={signerPrintTitle}
        onChange={(e) => setSignerPrintTitle(e.target.value)}
        className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100"
        placeholder="Print Name / Title"
        maxLength={120}
      />

      {stage === 'supervisor' && (
        <>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Overall Rating</label>
            <div className="flex gap-4 text-sm text-slate-700 dark:text-slate-300">
              {['Satisfactory', 'Unsatisfactory'].map((r) => (
                <label key={r} className="inline-flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="queue-supervisor-overall-rating"
                    checked={supervisorOverallRating === r}
                    onChange={() => setSupervisorOverallRating(r as 'Satisfactory' | 'Unsatisfactory')}
                    className="accent-teal-600"
                  />
                  {r}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Recommendation</label>
            <select
              value={supervisorRecommendation}
              onChange={(e) => setSupervisorRecommendation(e.target.value)}
              className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100"
            >
              <option value="">Optional — select if applicable</option>
              <option value="Continued employment">Continued employment</option>
              <option value="Employment be discontinued">Employment be discontinued</option>
              <option value="Tenure">Tenure (for final report only)</option>
            </select>
          </div>

          <textarea
            rows={3}
            value={supervisorComments}
            onChange={(e) => setSupervisorComments(e.target.value)}
            className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100"
            placeholder="Supervisor comments"
            maxLength={2000}
          />
        </>
      )}

      {stage === 'reviewer' && (
        <>
          <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
            <label className="inline-flex items-center gap-2 mr-5">
              <input
                type="radio"
                name="queue-reviewer-agree"
                checked={reviewerAgree === 'agree'}
                onChange={() => { setReviewerAgree('agree'); setReviewerRevisedRating(''); }}
                className="accent-teal-600"
              />
              I agree with the overall rating
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="queue-reviewer-agree"
                checked={reviewerAgree === 'disagree'}
                onChange={() => setReviewerAgree('disagree')}
                className="accent-teal-600"
              />
              I do not agree with the overall rating
            </label>
          </div>

          {reviewerAgree === 'disagree' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Revised Overall Rating</label>
              <div className="flex gap-4 text-sm text-slate-700 dark:text-slate-300">
                {['Satisfactory', 'Unsatisfactory'].map((r) => (
                  <label key={r} className="inline-flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="queue-revised-rating"
                      checked={reviewerRevisedRating === r}
                      onChange={() => setReviewerRevisedRating(r as 'Satisfactory' | 'Unsatisfactory')}
                      className="accent-teal-600"
                    />
                    {r}
                  </label>
                ))}
              </div>
            </div>
          )}

          <textarea
            rows={3}
            value={reviewerComments}
            onChange={(e) => setReviewerComments(e.target.value)}
            className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100"
            placeholder="Reviewer comments (optional)"
            maxLength={2000}
          />
        </>
      )}

      {stage === 'employee' && (
        <textarea
          rows={3}
          value={employeeAcknowledgement}
          onChange={(e) => setEmployeeAcknowledgement(e.target.value)}
          className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100"
          placeholder="Employee acknowledgement statement"
          maxLength={2000}
        />
      )}

      <SignatureUpload label="Digital Signature" value={signature} onChange={setSignature} showQueueReminder={false} />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={resetQueueSignerState}
          className="px-3 py-1.5 text-sm text-slate-500"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={action}
          disabled={
            !signature
            || !reviewConfirmed
            || !signerPrintTitle.trim()
            || (stage === 'supervisor' && !supervisorOverallRating)
            || (stage === 'employee' && !employeeAcknowledgement.trim())
            || (stage === 'reviewer' && !reviewerAgree)
            || (stage === 'reviewer' && reviewerAgree === 'disagree' && !reviewerRevisedRating)
          }
          className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-50"
        >
          Sign
        </button>
      </div>
    </div>
  );

  const renderAppraisalPreview = (a: any) => (
    <div className="mt-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-3 text-xs text-slate-700 dark:text-slate-300 space-y-1">
      <div><span className="font-bold">Form:</span> {a.form_type || a.eval_type || 'Appraisal'}</div>
      <div><span className="font-bold">Employee:</span> {a.employee_name || '—'}</div>
      <div><span className="font-bold">Period:</span> {a.eval_period_from || '—'} to {a.eval_period_to || '—'}</div>
      <div><span className="font-bold">Overall:</span> {a.overall ?? '—'}</div>
      {(a.supervisors_overall_comment || a.reviewers_comment || a.additional_comments) && (
        <div className="pt-1 border-t border-slate-200 dark:border-slate-700">
          <span className="font-bold">Notes:</span> {a.supervisors_overall_comment || a.reviewers_comment || a.additional_comments}
        </div>
      )}
    </div>
  );

  const getDisciplineSignProgress = (d: any) => {
    const done = [d?.preparer_signature, d?.supervisor_signature, d?.employee_signature]
      .filter((v) => !!String(v || '').trim())
      .length;
    return { done, total: 3 };
  };

  const renderDisciplineReview = (d: any) => {
    const progress = getDisciplineSignProgress(d);
    return (
      <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
        <div className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-bold bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300">
          Signature Progress: {progress.done}/{progress.total}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><span className="font-bold">Employee:</span> {d.employee_name || `#${d.employee_id || '—'}`}</div>
          <div><span className="font-bold">Warning Level:</span> {d.warning_level || '—'}</div>
          <div><span className="font-bold">Date of Warning:</span> {d.date_of_warning || '—'}</div>
          <div><span className="font-bold">Violation Date:</span> {d.violation_date || '—'}</div>
          <div><span className="font-bold">Violation Time:</span> {d.violation_time || '—'}</div>
          <div><span className="font-bold">Place:</span> {d.violation_place || '—'}</div>
          <div className="sm:col-span-2"><span className="font-bold">Violation Type:</span> {d.violation_type || '—'}</div>
          <div className="sm:col-span-2"><span className="font-bold">Action Taken:</span> {d.action_taken || '—'}</div>
          <div className="sm:col-span-2"><span className="font-bold">Employer Statement:</span> {d.employer_statement || '—'}</div>
          <div className="sm:col-span-2"><span className="font-bold">Employee Statement:</span> {d.employee_statement || '—'}</div>
        </div>
        <div className="grid sm:grid-cols-3 gap-2 text-xs">
          <div className={`px-2 py-1 rounded ${d.preparer_signature ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
            Preparer: {d.preparer_signature ? `Signed (${d.preparer_signature_date || 'date not set'})` : 'Pending'}
          </div>
          <div className={`px-2 py-1 rounded ${d.supervisor_signature ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
            Supervisor: {d.supervisor_signature ? `Signed (${d.supervisor_signature_date || 'date not set'})` : 'Pending'}
          </div>
          <div className={`px-2 py-1 rounded ${d.employee_signature ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
            Employee: {d.employee_signature ? `Signed (${d.employee_signature_date || 'date not set'})` : 'Pending'}
          </div>
        </div>
      </div>
    );
  };

  const openDisciplineReview = (key: string, record: any) => {
    setDisciplineReviewRecord(record);
    setDisciplineReviewedKeys((prev) => ({ ...prev, [key]: true }));
  };

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
                  <div className="flex items-center gap-3">
                    <button className="text-xs font-bold text-slate-500 hover:text-teal-deep" onClick={() => setActivePreviewId(activePreviewId === `emp-app-${a.id}` ? null : `emp-app-${a.id}`)}>View Form</button>
                    <button
                      className="text-sm font-bold text-teal-deep"
                      onClick={() => {
                        setActiveId(`emp-app-${a.id}`);
                        setSignerPrintTitle(String(user?.full_name || user?.employee_name || user?.username || ''));
                      }}
                    >
                      Sign
                    </button>
                  </div>
                </div>
                {activePreviewId === `emp-app-${a.id}` && renderAppraisalPreview(a)}
                {activeId === `emp-app-${a.id}` && renderAppraisalSignBox(() => signEmployeeAppraisal(a.id), 'employee')}
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
                {(() => {
                  const disciplineKey = `emp-disc-${d.id}`;
                  const reviewed = !!disciplineReviewedKeys[disciplineKey];
                  const readyForEmployeeSign = !!d.preparer_signature && !!d.supervisor_signature;
                  return (
                <>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{d.warning_level || 'Warning'} - {d.violation_type || 'Disciplinary Action'}</p>
                    <p className="text-xs text-slate-500">{d.employee_name || 'Employee'} • {d.date_of_warning || '—'}</p>
                    <p className="text-[11px] text-teal-700 dark:text-teal-300 font-semibold mt-0.5">Progress: {getDisciplineSignProgress(d).done}/{getDisciplineSignProgress(d).total} signed</p>
                    {!readyForEmployeeSign && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">Waiting for preparer and supervisor signatures before you can sign.</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button className="text-xs font-bold text-slate-500 hover:text-teal-deep" onClick={() => openDisciplineReview(disciplineKey, d)}>Review</button>
                    <button
                      className="text-sm font-bold text-teal-deep disabled:text-slate-400 disabled:cursor-not-allowed"
                      disabled={!reviewed || !readyForEmployeeSign}
                      title={!reviewed ? 'Review the form first' : !readyForEmployeeSign ? 'Awaiting preparer and supervisor signatures' : 'Sign this disciplinary record'}
                      onClick={() => setActiveId(disciplineKey)}
                    >
                      Sign
                    </button>
                  </div>
                </div>
                {activeId === disciplineKey && renderSignBox(() => signEmployeeDiscipline(d.id), true)}
                </>
                  );
                })()}
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

          {activeQueueSection === 'emp-suggestions' && (
          <Card>
            <h3 className="text-sm font-bold mb-3">Suggestions Pending Your Signature</h3>
            {pendingEmployeeSuggestions.length === 0 && <p className="text-sm text-slate-400">No pending suggestion signatures.</p>}
            {pendingEmployeeSuggestions.map((s) => (
              <div key={`emp-sug-${s.id}`} className="border rounded-lg p-3 mb-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{s.employee_name || 'Employee'} - Suggestion</p>
                    <p className="text-xs text-slate-500 truncate">{s.title || s.concern || 'Untitled suggestion'}</p>
                  </div>
                  <button className="text-sm font-bold text-teal-deep" onClick={() => setActiveId(`emp-sug-${s.id}`)}>Sign</button>
                </div>
                {activeId === `emp-sug-${s.id}` && renderSignBox(() => signEmployeeSuggestion(s.id))}
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

          {activeQueueSection === 'emp-property' && (
          <Card>
            <h3 className="text-sm font-bold mb-3">Property Accountability Pending Your Signature</h3>
            {pendingEmployeePropertyTasks.length === 0 && <p className="text-sm text-slate-400">No pending property signatures.</p>}
            {pendingEmployeePropertyTasks.map((p) => (
              <div key={`emp-prop-${p.id}`} className="border rounded-lg p-3 mb-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{p.employee_name || 'Employee'} - Received by signature</p>
                    <p className="text-xs text-slate-500">Property accountability</p>
                  </div>
                  <button className="text-sm font-bold text-teal-deep" onClick={() => setActiveId(`emp-prop-${p.id}`)}>Sign</button>
                </div>
                {activeId === `emp-prop-${p.id}` && renderSignBox(() => signProperty(p.id, 'received_by_sig'))}
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
              <div key={a.queueKey || `sup-app-${a.id}`} className="border rounded-lg p-3 mb-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{a.employee_name || 'Employee'} - {a.form_type || a.eval_type || 'Appraisal'}</p>
                    <p className="text-xs text-slate-500">Department: {a.employee_department || a.dept || user?.dept || '—'} • Stage: {a.queueStage === 'reviewer' ? 'Reviewer' : 'Supervisor'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button className="text-xs font-bold text-slate-500 hover:text-teal-deep" onClick={() => setActivePreviewId(activePreviewId === (a.queueKey || `sup-app-${a.id}`) ? null : (a.queueKey || `sup-app-${a.id}`))}>View Form</button>
                    <button
                      className="text-sm font-bold text-teal-deep"
                      onClick={() => {
                        setActiveId(a.queueKey || `sup-app-${a.id}`);
                        setSignerPrintTitle(String(user?.full_name || user?.employee_name || user?.username || ''));
                        setSupervisorOverallRating((a?.overall_rating || '') as 'Satisfactory' | 'Unsatisfactory' | '');
                        setSupervisorRecommendation(String(a?.recommendation || ''));
                        setSupervisorComments(String(a?.supervisors_overall_comment || ''));
                        setReviewerAgree((a?.reviewer_agree || '') as 'agree' | 'disagree' | '');
                        setReviewerRevisedRating((a?.revised_rating || '') as 'Satisfactory' | 'Unsatisfactory' | '');
                        setReviewerComments(String(a?.reviewers_comment || ''));
                      }}
                    >
                      Sign
                    </button>
                  </div>
                </div>
                {activePreviewId === (a.queueKey || `sup-app-${a.id}`) && renderAppraisalPreview(a)}
                {activeId === (a.queueKey || `sup-app-${a.id}`) && renderAppraisalSignBox(() => signManagementAppraisal(a), a.queueStage === 'reviewer' ? 'reviewer' : 'supervisor')}
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
                {(() => {
                  const disciplineKey = d.queueKey || `sup-disc-${d.id}`;
                  const reviewed = !!disciplineReviewedKeys[disciplineKey];
                  const readyForSign = d.queueStage === 'preparer' ? true : !!d.queueReady;
                  return (
                <>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{d.employee_name || 'Employee'} - {d.warning_level || 'Warning'}</p>
                    <p className="text-xs text-slate-500">{d.violation_type || 'Disciplinary Action'} • Stage: {d.queueStage === 'preparer' ? 'Preparer' : 'Supervisor'}</p>
                    <p className="text-[11px] text-teal-700 dark:text-teal-300 font-semibold mt-0.5">Progress: {getDisciplineSignProgress(d).done}/{getDisciplineSignProgress(d).total} signed</p>
                    {!readyForSign && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">Waiting for preparer signature before supervisor can sign.</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button className="text-xs font-bold text-slate-500 hover:text-teal-deep" onClick={() => openDisciplineReview(disciplineKey, d)}>Review</button>
                    <button
                      className="text-sm font-bold text-teal-deep disabled:text-slate-400 disabled:cursor-not-allowed"
                      disabled={!reviewed || !readyForSign}
                      title={!reviewed ? 'Review the form first' : !readyForSign ? 'Awaiting preparer signature' : 'Sign this disciplinary record'}
                      onClick={() => setActiveId(disciplineKey)}
                    >
                      Sign
                    </button>
                  </div>
                </div>
                {activeId === disciplineKey && renderSignBox(() => d.queueStage === 'preparer' ? signPreparerDiscipline(d.id) : signSupervisorDiscipline(d.id))}
                </>
                  );
                })()}
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
                  <button
                    className="text-sm font-bold text-teal-deep"
                    onClick={() => {
                      setActiveId(`mgmt-app-${a.id}`);
                      setReviewConfirmed(false);
                      setApplicantSignerName(String(a?.interviewer_name || user?.full_name || user?.employee_name || user?.username || ''));
                      setApplicantSignerTitle(String(a?.interviewer_title || user?.position || ''));
                      setApplicantSignerDate(String(a?.interview_date || new Date().toISOString().split('T')[0]));
                    }}
                  >
                    Sign
                  </button>
                </div>
                {activeId === `mgmt-app-${a.id}` && renderApplicantSignBox(() => signApplicant(a.id, 'interviewer_signature', {
                  name: applicantSignerName.trim(),
                  title: applicantSignerTitle.trim(),
                  date: applicantSignerDate,
                }), 'interviewer')}
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
                  <div className="flex items-center gap-3">
                    <button className="text-xs font-bold text-slate-500 hover:text-teal-deep" onClick={() => setActivePreviewId(activePreviewId === `hr-app-${a.id}` ? null : `hr-app-${a.id}`)}>View Form</button>
                    <button 
                      disabled={!canSign} 
                      className="text-sm font-bold text-teal-deep disabled:text-slate-400 disabled:cursor-not-allowed" 
                      onClick={() => {
                        setActiveId(`hr-app-${a.id}`);
                        setSignerPrintTitle(String(user?.full_name || user?.employee_name || user?.username || ''));
                      }}
                      title={!canSign ? 'Assigned to another HR user' : 'Sign this appraisal'}
                    >
                      Sign
                    </button>
                  </div>
                </div>
                {activePreviewId === `hr-app-${a.id}` && renderAppraisalPreview(a)}
                {activeId === `hr-app-${a.id}` && renderAppraisalSignBox(() => signHrAppraisal(a.id), 'hr')}
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
                  <button
                    className="text-sm font-bold text-teal-deep"
                    onClick={() => {
                      setActiveId(`hr-applicant-${a.id}`);
                      setReviewConfirmed(false);
                      setApplicantSignerName(String(a?.hr_reviewer_name || user?.full_name || user?.employee_name || user?.username || ''));
                      setApplicantSignerTitle('');
                      setApplicantSignerDate(String(a?.hr_reviewer_date || new Date().toISOString().split('T')[0]));
                    }}
                  >
                    Sign
                  </button>
                </div>
                {activeId === `hr-applicant-${a.id}` && renderApplicantSignBox(() => signApplicant(a.id, 'hr_reviewer_signature', {
                  name: applicantSignerName.trim(),
                  date: applicantSignerDate,
                }), 'hr')}
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

      <Modal
        open={!!disciplineReviewRecord}
        title="Disciplinary Form Review"
        onClose={() => setDisciplineReviewRecord(null)}
        maxWidthClassName="max-w-3xl"
      >
        {disciplineReviewRecord && renderDisciplineReview(disciplineReviewRecord)}
      </Modal>

      <div className="mt-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1"><FileCheck size={12} /> Records marked as signed are treated as finished.</span>
      </div>
    </motion.div>
  );
};
