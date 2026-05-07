import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { Modal } from '../../common/Modal';
import { SignatureUpload } from '../../common/SignatureUpload';
import { CheckCircle, FileCheck, ShieldAlert, Eye, PenLine, User, Calendar, BarChart2, FileText, Clock, Building2, AlertTriangle, Lightbulb, UserCheck, Package, LogOut, ClipboardList, Briefcase, Users } from 'lucide-react';
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
  const [appraisalSignModal, setAppraisalSignModal] = useState<{ record: any; stage: 'supervisor' | 'manager' | 'reviewer' } | null>(null);
  const [genericViewModal, setGenericViewModal] = useState<{ title: string; type: string; record: any } | null>(null);
  const [genericSignModal, setGenericSignModal] = useState<{ title: string; signType: 'simple' | 'remarks' | 'appraisalEmployee' | 'appraisalHr' | 'applicantInterviewer' | 'applicantHr'; actionId: string; record: any } | null>(null);

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
    setGenericSignModal(null);
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
    return !a.employee_signature;
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

      // Supervisor slot: for Performance forms, show to any dept-matched management signer
      // (supervisor_user_id may have been set to the manager's ID by old records — don't enforce it)
      const canSignSupervisorSlot = isPerformance
        ? true  // any management signer in same dept can sign the supervisor slot
        : (!assignedSupervisor || assignedSupervisor === me);

      if (!a.supervisor_signature && canSignSupervisorSlot) {
        tasks.push({ ...a, queueStage: isPerformance ? 'supervisor' : 'manager', queueKey: `sup-app-sup-${a.id}`, queueReady: true });
      }
      // Reviewer slot: always show when not yet reviewed; ready only after supervisor has signed
      if (isPerformance && !a.reviewer_signature && (!assignedReviewer || assignedReviewer === me)) {
        tasks.push({ ...a, queueStage: 'reviewer', queueKey: `sup-app-rev-${a.id}`, queueReady: !!a.supervisor_signature });
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
    if (!isPerformance || !!a.hr_signature) return false;
    // Show to assigned HR user (or any dept HR if unassigned)
    if (a.hr_owner_user_id) return Number(a.hr_owner_user_id) === Number(user?.id || 0);
    return sameDept(a);
  }).map((a) => ({
    ...a,
    // queueReady: all prior signatures must be present before HR can sign
    queueReady: !!a.supervisor_signature && !!a.reviewer_signature && !!a.employee_signature,
  })), [appraisals, user?.id, queueDept]);

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
        return Number(o.hr_owner_user_id) === Number(user?.id || 0);
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
        return Number(a.hr_owner_user_id) === Number(user?.id || 0);
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

  const renderAppraisalSignBox = (action: () => void, stage: 'supervisor' | 'manager' | 'reviewer' | 'employee' | 'hr') => (
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
        readOnly
        className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 rounded-lg text-sm dark:text-slate-100 cursor-default select-none"
        placeholder="Print Name / Title"
      />

      {(stage === 'supervisor' || stage === 'manager') && (
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
            placeholder={stage === 'manager' ? 'Manager comments' : 'Supervisor comments'}
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

  const renderAppraisalPreview = (a: any) => {
    const isAch = (a.form_type || '').toLowerCase().includes('achievement');
    const deptValue = a.employee_department || a.dept || a.department || user?.dept || user?.department || '—';
    const ratingRows: [string, number][] = isAch
      ? [['Job Knowledge', a.job_knowledge], ['Work Quality', a.work_quality], ['Attendance', a.attendance], ['Productivity', a.productivity], ['Communication', a.communication], ['Dependability', a.dependability]]
      : [['Quality of Work', a.work_quality], ['Quantity of Work', a.quantity_of_work], ['Relationship w/ Others', a.relationship_with_others], ['Work Habits', a.work_habits], ['Job Knowledge', a.job_knowledge], ['Attendance', a.attendance], ['Promotability', a.promotability_score ?? a.promotability]];
    const ratingLabel = (v: number) => (['', 'Poor', 'Fair', 'Satisfactory', 'Good', 'Excellent'][v] || '');
    return (
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
          <div><p className="text-[10px] font-bold uppercase text-slate-400 mb-0.5">Employee</p><p className="font-semibold text-slate-700 dark:text-slate-200">{a.employee_name || '—'}</p></div>
          <div><p className="text-[10px] font-bold uppercase text-slate-400 mb-0.5">Department</p><p className="text-slate-600 dark:text-slate-300">{deptValue}</p></div>
          <div><p className="text-[10px] font-bold uppercase text-slate-400 mb-0.5">Period</p><p className="text-slate-600 dark:text-slate-300">{a.eval_period_from || a.review_period_from || '—'} – {a.eval_period_to || a.review_period_to || '—'}</p></div>
          <div><p className="text-[10px] font-bold uppercase text-slate-400 mb-0.5">Overall Score</p><p className="font-bold text-teal-600 dark:text-teal-400 text-base">{a.overall ?? '—'}</p></div>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Performance Ratings</p>
          <div className="space-y-1.5">
            {ratingRows.map(([label, val]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-xs text-slate-600 dark:text-slate-300 w-36 shrink-0">{label}</span>
                <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-500 rounded-full" style={{ width: `${((Number(val) || 0) / 5) * 100}%` }} />
                </div>
                <span className="text-xs font-bold text-teal-700 dark:text-teal-300 w-8 text-right">{val || 0}/5</span>
                <span className="text-[10px] text-slate-400 w-20 text-right">{ratingLabel(Number(val) || 0)}</span>
              </div>
            ))}
          </div>
        </div>
        {(a.employee_goals || a.additional_comments || a.supervisors_overall_comment || a.reviewers_comment) && (
          <div className="space-y-2">
            {a.employee_goals && <div><p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Employee Goals</p><p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded p-2 whitespace-pre-line">{a.employee_goals}</p></div>}
            {a.additional_comments && <div><p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Additional Comments</p><p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded p-2 whitespace-pre-line">{a.additional_comments}</p></div>}
            {a.supervisors_overall_comment && <div><p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Supervisor Comments</p><p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded p-2 whitespace-pre-line">{a.supervisors_overall_comment}</p></div>}
            {a.reviewers_comment && <div><p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Reviewer Comments</p><p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded p-2 whitespace-pre-line">{a.reviewers_comment}</p></div>}
          </div>
        )}
        {/* Signatures section — same layout across all roles */}
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
          <p className="text-[10px] font-bold uppercase text-slate-400 mb-3">Signatures</p>
          <div className={`grid gap-3 ${isAch ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
            {(isAch ? [
              { label: 'Manager', printName: a.supervisor_print_name, sig: a.supervisor_signature, date: a.supervisor_signature_date },
              { label: 'Employee', printName: a.employee_print_name || a.employee_name, sig: a.employee_signature, date: a.employee_signature_date },
            ] : [
              { label: 'Supervisor', printName: a.supervisor_print_name, sig: a.supervisor_signature, date: a.supervisor_signature_date },
              { label: 'Reviewer', printName: a.reviewer_print_name, sig: a.reviewer_signature, date: a.reviewer_signature_date },
              { label: 'Employee', printName: a.employee_print_name || a.employee_name, sig: a.employee_signature, date: a.employee_signature_date },
              { label: 'HR Admin', printName: a.hr_print_name, sig: a.hr_signature, date: a.hr_signature_date },
            ]).map(s => (
              <div key={s.label} className="text-center">
                <p className="text-[10px] font-bold uppercase text-slate-400">{s.label}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mb-1">{s.printName || '—'}</p>
                {s.sig ? (
                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-1 bg-white dark:bg-slate-800">
                    <img src={s.sig} alt={`${s.label} signature`} className="h-10 mx-auto object-contain" />
                  </div>
                ) : (
                  <div className="border border-dashed border-slate-300 dark:border-slate-600 rounded-lg h-12 flex items-center justify-center text-[10px] text-slate-400">No signature</div>
                )}
                <p className="text-[10px] text-slate-400 mt-1">{s.date || '—'}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

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

  const openGenericSign = (
    title: string,
    signType: 'simple' | 'remarks' | 'appraisalEmployee' | 'appraisalHr' | 'applicantInterviewer' | 'applicantHr',
    actionId: string,
    record: any,
    signerName?: string,
    applicantName?: string,
    applicantTitle?: string,
    applicantDate?: string,
  ) => {
    resetQueueSignerState();
    setSignerPrintTitle(signerName ?? String(user?.full_name || user?.employee_name || user?.username || ''));
    if (applicantName !== undefined) setApplicantSignerName(applicantName);
    if (applicantTitle !== undefined) setApplicantSignerTitle(applicantTitle);
    if (applicantDate !== undefined) setApplicantSignerDate(applicantDate);
    setGenericSignModal({ title, signType, actionId, record });
  };

  const getGenericSignAction = (actionId: string, record: any): (() => void) => {
    const close = () => setGenericSignModal(null);
    switch (actionId) {
      case 'emp-app': return () => signEmployeeAppraisal(record.id).then(close);
      case 'emp-disc': return () => signEmployeeDiscipline(record.id).then(close);
      case 'emp-onb': return () => signOnboarding(record.id, 'employee_signature').then(close);
      case 'emp-sug': return () => signEmployeeSuggestion(record.id).then(close);
      case 'emp-exit': return () => signExitInterview(record.id, 'employee_sig').then(close);
      case 'emp-prop': return () => signProperty(record.id, 'received_by_sig').then(close);
      case 'hr-app': return () => signHrAppraisal(record.id).then(close);
      case 'hr-onb': return () => signOnboarding(record.id, 'hr_signature').then(close);
      case 'hr-applicant': return () => signApplicant(record.id, 'hr_reviewer_signature', { name: applicantSignerName.trim(), date: applicantSignerDate }).then(close);
      case 'hr-req': return () => signRequisitionStage(record.id, record.stage).then(close);
      case 'mgmt-disc-prep': return () => signPreparerDiscipline(record.id).then(close);
      case 'mgmt-disc-sup': return () => signSupervisorDiscipline(record.id).then(close);
      case 'mgmt-sug': return () => signSupervisorSuggestion(record).then(close);
      case 'mgmt-app': return () => signApplicant(record.id, 'interviewer_signature', { name: applicantSignerName.trim(), title: applicantSignerTitle.trim(), date: applicantSignerDate }).then(close);
      case 'mgmt-req': return () => signRequisitionStage(record.id, record.stage).then(close);
      case 'mgmt-prop': return () => signProperty(record.id, record.field).then(close);
      case 'mgmt-exit': return () => signExitInterview(record.id, 'interviewer_sig').then(close);
      default: return () => {};
    }
  };

  const renderQueueCard = ({
    id, icon, iconColorClass, iconBgClass, title, subtitle,
    badge, badgeColorClass, pills, warningText,
    onView, signDisabled, signTitle, onSign,
  }: {
    id: string;
    icon: React.ReactNode;
    iconColorClass: string;
    iconBgClass: string;
    title: string;
    subtitle: string;
    badge?: string;
    badgeColorClass?: string;
    pills?: Array<{ icon?: React.ReactNode; text: string }>;
    warningText?: string;
    onView?: () => void;
    signDisabled?: boolean;
    signTitle?: string;
    onSign: () => void;
  }) => (
    <div key={id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 mb-3 bg-white dark:bg-slate-800/50 hover:border-teal-300 dark:hover:border-teal-700 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-full ${iconBgClass} flex items-center justify-center flex-shrink-0`}>
            <span className={iconColorClass}>{icon}</span>
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">{title}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {badge && (
            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${badgeColorClass || 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
              {badge}
            </span>
          )}
          {onView && (
            <button type="button" onClick={onView}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors px-2 py-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700">
              <Eye size={12} /> View
            </button>
          )}
          <button type="button" onClick={onSign} disabled={signDisabled} title={signTitle}
            className="inline-flex items-center gap-1 text-xs font-bold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors px-3 py-1.5 rounded-lg bg-teal-50 dark:bg-teal-900/20 hover:bg-teal-100 dark:hover:bg-teal-900/40 disabled:opacity-40 disabled:cursor-not-allowed">
            <PenLine size={12} /> Sign
          </button>
        </div>
      </div>
      {pills && pills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {pills.map((p, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50 rounded-md px-2 py-0.5">
              {p.icon}<span>{p.text}</span>
            </span>
          ))}
        </div>
      )}
      {warningText && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-md px-2 py-1">
          <AlertTriangle size={11} />{warningText}
        </div>
      )}
    </div>
  );

  const renderEmptyQueueState = (label: string) => (
    <div className="flex flex-col items-center py-8 text-slate-400 gap-2">
      <CheckCircle size={32} className="text-emerald-400" />
      <p className="text-sm">{label}</p>
    </div>
  );

  const renderGenericViewContent = () => {
    if (!genericViewModal) return null;
    const { type, record: r } = genericViewModal;
    const F = ({ label, value }: { label: string; value?: string | number | null }) => (
      <div>
        <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">{label}</p>
        <p className="mt-0.5 text-sm text-slate-800 dark:text-slate-100 font-medium">{value ?? '—'}</p>
      </div>
    );
    const TB = ({ label, value }: { label: string; value?: string | null }) => value ? (
      <div>
        <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">{label}</p>
        <p className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">{value}</p>
      </div>
    ) : null;
    const Sigs = ({ items }: { items: Array<{ label: string; signed: boolean; date?: string }> }) => (
      <div>
        <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">Signature Status</p>
        <div className="flex flex-wrap gap-2">
          {items.map((s) => (
            <span key={s.label} className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-semibold ${s.signed ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
              {s.signed ? <CheckCircle size={11} /> : <Clock size={11} />}
              {s.label}{s.signed && s.date ? ` · ${s.date}` : s.signed ? '' : ' · Pending'}
            </span>
          ))}
        </div>
      </div>
    );

    if (type === 'appraisal') return renderAppraisalPreview(r);
    if (type === 'discipline') return renderDisciplineReview(r);

    if (type === 'suggestion') return (
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <F label="Employee" value={r.employee_name} />
          <F label="Department" value={r.department || r.employee_department} />
          <F label="Date" value={r.date || r.created_at?.split('T')[0]} />
          <F label="Status" value={r.status || 'Pending'} />
        </div>
        <TB label="Title / Subject" value={r.title} />
        <TB label="Concern / Suggestion" value={r.concern} />
        <TB label="Action to be Taken" value={r.action_to_be_taken} />
        <Sigs items={[
          { label: 'Employee', signed: !!r.employee_signature, date: r.employee_signature_date },
          { label: 'Supervisor', signed: !!r.supervisor_signature, date: r.supervisor_signature_date },
        ]} />
      </div>
    );

    if (type === 'onboarding') return (
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <F label="Employee" value={r.employee_name} />
          <F label="Department" value={r.department || r.employee_department} />
          <F label="Start Date" value={r.start_date} />
          <F label="Status" value={r.status || 'Pending'} />
          <F label="Position" value={r.position} />
          <F label="Employment Type" value={r.employment_type} />
        </div>
        <TB label="Notes" value={r.notes} />
        <TB label="Checklist / Instructions" value={r.checklist} />
        <Sigs items={[
          { label: 'Employee', signed: !!r.employee_signature, date: r.employee_signature_date },
          { label: 'HR', signed: !!r.hr_signature, date: r.hr_signature_date },
        ]} />
      </div>
    );

    if (type === 'exit') return (
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <F label="Employee" value={r.employee_name} />
          <F label="Department" value={r.department || r.employee_department} />
          <F label="Position" value={r.position} />
          <F label="Interview Date" value={r.interview_date} />
          <F label="Last Day" value={r.last_day} />
          <F label="Interviewer" value={r.interviewer_name} />
        </div>
        <TB label="Reason for Leaving" value={r.reason_for_leaving} />
        <TB label="What did you like about working here?" value={r.liked_about_work} />
        <TB label="What could be improved?" value={r.improvements} />
        <TB label="Additional Comments" value={r.comments} />
        <Sigs items={[
          { label: 'Employee', signed: !!r.employee_sig, date: r.employee_sig_date },
          { label: 'Interviewer', signed: !!r.interviewer_sig, date: r.interviewer_sig_date },
        ]} />
      </div>
    );

    if (type === 'applicant') return (
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <F label="Applicant Name" value={r.name} />
          <F label="Position Applied" value={r.position} />
          <F label="Department" value={r.department || r.employee_department} />
          <F label="Interview Date" value={r.interview_date} />
          <F label="Status" value={r.status} />
          <F label="Source" value={r.source} />
        </div>
        <TB label="Notes / Evaluation" value={r.notes} />
        <TB label="Interviewer Remarks" value={r.interviewer_remarks} />
        <Sigs items={[
          { label: 'Interviewer', signed: !!r.interviewer_signature, date: r.interview_date },
          { label: 'HR Reviewer', signed: !!r.hr_reviewer_signature, date: r.hr_reviewer_date },
        ]} />
      </div>
    );

    if (type === 'property') return (
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <F label="Employee" value={r.employee_name} />
          <F label="Department" value={r.department || r.employee_department} />
          <F label="Date Issued" value={r.date_issued || r.created_at?.split('T')[0]} />
          <F label="Property Type" value={r.property_type} />
        </div>
        <TB label="Items / Description" value={r.items || r.description} />
        <TB label="Remarks" value={r.remarks} />
        <Sigs items={[
          { label: 'Turned Over By', signed: !!r.turnover_by_sig },
          { label: 'Noted By', signed: !!r.noted_by_sig },
          { label: 'Received By', signed: !!r.received_by_sig },
          { label: 'Audited By', signed: !!r.audited_by_sig },
        ]} />
      </div>
    );

    if (type === 'requisition') return (
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <F label="Job Title" value={r.job_title} />
          <F label="Department" value={r.department} />
          <F label="Date Requested" value={r.date_requested || r.created_at?.split('T')[0]} />
          <F label="Headcount" value={r.headcount} />
          <F label="Employment Type" value={r.employment_type} />
          <F label="Reason" value={r.reason} />
        </div>
        <TB label="Job Description / Requirements" value={r.job_description || r.requirements} />
        <TB label="Remarks" value={r.remarks} />
        <Sigs items={[
          { label: 'Supervisor', signed: !!r.supervisor_approval_sig },
          { label: 'Dept Head', signed: !!r.dept_head_approval_sig },
          { label: 'Cabinet', signed: !!r.cabinet_approval_sig },
          { label: 'VP', signed: !!r.vp_approval_sig },
          { label: 'President', signed: !!r.president_approval_sig },
        ]} />
      </div>
    );
    return null;
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
            {pendingEmployeeAppraisals.length === 0 && renderEmptyQueueState('No pending appraisal signatures.')}
            {pendingEmployeeAppraisals.map((a) => {
              const isPerformance = String(a.form_type || a.eval_type || '').toLowerCase().includes('performance');
              const readyForEmployeeSign = !!a.supervisor_signature && (!isPerformance || !!a.reviewer_signature);
              return renderQueueCard({
                id: `emp-app-${a.id}`,
                icon: <FileText size={16} />,
                iconColorClass: 'text-teal-600 dark:text-teal-400',
                iconBgClass: 'bg-teal-50 dark:bg-teal-900/30',
                title: a.form_type || a.eval_type || 'Appraisal',
                subtitle: `${a.employee_name || 'Employee'} • ${a.sign_off_date || a.created_at?.split('T')[0] || '—'}`,
                badge: 'Your Signature',
                badgeColorClass: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300',
                pills: [
                  { icon: <Building2 size={10} />, text: a.employee_department || a.dept || '—' },
                  { icon: <Calendar size={10} />, text: `${a.eval_period_from || '—'} – ${a.eval_period_to || '—'}` },
                  { icon: <BarChart2 size={10} />, text: `Overall: ${a.overall ?? '—'}` },
                ],
                warningText: !readyForEmployeeSign
                  ? (isPerformance ? 'Waiting for supervisor and reviewer signatures before you can sign.' : 'Waiting for manager signature before you can sign.')
                  : undefined,
                onView: () => setGenericViewModal({ title: `${a.form_type || 'Appraisal'} — ${a.employee_name || 'Employee'}`, type: 'appraisal', record: a }),
                signDisabled: !readyForEmployeeSign,
                signTitle: !readyForEmployeeSign ? 'Management signatures required first' : undefined,
                onSign: () => {
                  if (readyForEmployeeSign) {
                    openGenericSign(`Sign — ${a.form_type || 'Appraisal'} (${a.employee_name || 'Employee'})`, 'appraisalEmployee', 'emp-app', a);
                  } else {
                    setGenericViewModal({ title: `${a.form_type || 'Appraisal'} — ${a.employee_name || 'Employee'}`, type: 'appraisal', record: a });
                  }
                },
              });
            })}
          </Card>
          )}

          {activeQueueSection === 'emp-discipline' && (
          <Card>
            <h3 className="text-sm font-bold mb-3">Disciplinary Records Pending Your Signature</h3>
            {pendingEmployeeDiscipline.length === 0 && renderEmptyQueueState('No pending disciplinary signatures.')}
            {pendingEmployeeDiscipline.map((d) => {
              const disciplineKey = `emp-disc-${d.id}`;
              const reviewed = !!disciplineReviewedKeys[disciplineKey];
              const readyForEmployeeSign = !!d.preparer_signature && !!d.supervisor_signature;
              const prog = getDisciplineSignProgress(d);
              return renderQueueCard({
                id: disciplineKey,
                icon: <AlertTriangle size={16} />,
                iconColorClass: 'text-red-500 dark:text-red-400',
                iconBgClass: 'bg-red-50 dark:bg-red-900/20',
                title: `${d.warning_level || 'Warning'} — ${d.violation_type || 'Disciplinary Action'}`,
                subtitle: `${d.employee_name || 'Employee'} • ${d.date_of_warning || '—'}`,
                badge: 'Your Signature',
                badgeColorClass: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300',
                pills: [
                  { icon: <Clock size={10} />, text: `${prog.done}/${prog.total} signed` },
                ],
                warningText: !readyForEmployeeSign ? 'Waiting for preparer and supervisor signatures before you can sign.' : !reviewed ? 'Please review the form first before signing.' : undefined,
                onView: () => { openDisciplineReview(disciplineKey, d); },
                signDisabled: !reviewed || !readyForEmployeeSign,
                signTitle: !reviewed ? 'Review the form first' : !readyForEmployeeSign ? 'Awaiting preparer and supervisor signatures' : undefined,
                onSign: () => { if (reviewed && readyForEmployeeSign) openGenericSign(`Sign — Disciplinary (${d.employee_name || 'Employee'})`, 'remarks', 'emp-disc', d); else openDisciplineReview(disciplineKey, d); },
              });
            })}
          </Card>
          )}

          {activeQueueSection === 'emp-onboarding' && (
          <Card>
            <h3 className="text-sm font-bold mb-3">Onboarding Records Pending Your Signature</h3>
            {pendingEmployeeOnboarding.length === 0 && renderEmptyQueueState('No pending onboarding signatures.')}
            {pendingEmployeeOnboarding.map((o) => renderQueueCard({
              id: `emp-onb-${o.id}`,
              icon: <UserCheck size={16} />,
              iconColorClass: 'text-blue-600 dark:text-blue-400',
              iconBgClass: 'bg-blue-50 dark:bg-blue-900/20',
              title: `Onboarding — ${o.employee_name || 'Employee'}`,
              subtitle: `Status: ${o.status || 'Pending'} • ${o.start_date || '—'}`,
              badge: 'Your Signature',
              badgeColorClass: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300',
              pills: [
                { icon: <Building2 size={10} />, text: o.department || o.employee_department || '—' },
              ],
              onView: () => setGenericViewModal({ title: `Onboarding — ${o.employee_name || 'Employee'}`, type: 'onboarding', record: o }),
              onSign: () => openGenericSign(`Sign — Onboarding (${o.employee_name || 'Employee'})`, 'simple', 'emp-onb', o),
            }))}
          </Card>
          )}

          {activeQueueSection === 'emp-suggestions' && (
          <Card>
            <h3 className="text-sm font-bold mb-3">Suggestions Pending Your Signature</h3>
            {pendingEmployeeSuggestions.length === 0 && renderEmptyQueueState('No pending suggestion signatures.')}
            {pendingEmployeeSuggestions.map((s) => renderQueueCard({
              id: `emp-sug-${s.id}`,
              icon: <Lightbulb size={16} />,
              iconColorClass: 'text-yellow-600 dark:text-yellow-400',
              iconBgClass: 'bg-yellow-50 dark:bg-yellow-900/20',
              title: s.title || s.concern?.slice(0, 50) || 'Suggestion',
              subtitle: `${s.employee_name || 'Employee'} • ${s.date || s.created_at?.split('T')[0] || '—'}`,
              badge: 'Your Signature',
              badgeColorClass: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300',
              onView: () => setGenericViewModal({ title: `Suggestion — ${s.employee_name || 'Employee'}`, type: 'suggestion', record: s }),
              onSign: () => openGenericSign(`Sign — Suggestion (${s.employee_name || 'Employee'})`, 'simple', 'emp-sug', s),
            }))}
          </Card>
          )}

          {activeQueueSection === 'emp-exit' && (
          <Card>
            <h3 className="text-sm font-bold mb-3">Exit Interviews Pending Your Signature</h3>
            {pendingEmployeeExitInterviews.length === 0 && renderEmptyQueueState('No pending exit interview signatures.')}
            {pendingEmployeeExitInterviews.map((e) => renderQueueCard({
              id: `emp-exit-${e.id}`,
              icon: <LogOut size={16} />,
              iconColorClass: 'text-slate-600 dark:text-slate-400',
              iconBgClass: 'bg-slate-100 dark:bg-slate-700',
              title: `Exit Interview — ${e.employee_name || 'Employee'}`,
              subtitle: `Interview date: ${e.interview_date || '—'}`,
              badge: 'Your Signature',
              badgeColorClass: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300',
              pills: [
                { icon: <Building2 size={10} />, text: e.department || e.employee_department || '—' },
              ],
              onView: () => setGenericViewModal({ title: `Exit Interview — ${e.employee_name || 'Employee'}`, type: 'exit', record: e }),
              onSign: () => openGenericSign(`Sign — Exit Interview (${e.employee_name || 'Employee'})`, 'simple', 'emp-exit', e),
            }))}
          </Card>
          )}

          {activeQueueSection === 'emp-property' && (
          <Card>
            <h3 className="text-sm font-bold mb-3">Property Accountability Pending Your Signature</h3>
            {pendingEmployeePropertyTasks.length === 0 && renderEmptyQueueState('No pending property signatures.')}
            {pendingEmployeePropertyTasks.map((p) => renderQueueCard({
              id: `emp-prop-${p.id}`,
              icon: <Package size={16} />,
              iconColorClass: 'text-orange-600 dark:text-orange-400',
              iconBgClass: 'bg-orange-50 dark:bg-orange-900/20',
              title: `Property Accountability — ${p.employee_name || 'Employee'}`,
              subtitle: 'Received by signature required',
              badge: 'Your Signature',
              badgeColorClass: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300',
              onView: () => setGenericViewModal({ title: `Property — ${p.employee_name || 'Employee'}`, type: 'property', record: p }),
              onSign: () => openGenericSign(`Sign — Property Accountability (${p.employee_name || 'Employee'})`, 'simple', 'emp-prop', p),
            }))}
          </Card>
          )}
        </div>
      )}

      {isManagementSigner && (
        <div className="space-y-4">
          {activeQueueSection === 'mgmt-appraisals' && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Appraisals Needing Management Signature</h3>
              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300">{pendingSupervisorAppraisals.length} pending</span>
            </div>
            {pendingSupervisorAppraisals.length === 0 && renderEmptyQueueState('No pending management signatures.')}
            <div className="space-y-3">
            {pendingSupervisorAppraisals.map((a) => {
              const key = a.queueKey || `sup-app-${a.id}`;
              const isAch = (a.form_type || '').toLowerCase().includes('achievement');
              const stageLabel = a.queueStage === 'reviewer' ? 'Reviewer' : a.queueStage === 'manager' ? 'Manager' : 'Supervisor';
              const stageColor = a.queueStage === 'reviewer' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
              const overall = a.overall ?? '—';
              const ratingColor = Number(a.overall) >= 4 ? 'text-emerald-600' : Number(a.overall) >= 3 ? 'text-amber-500' : 'text-red-500';
              return (
              <div key={key} className="group relative rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 hover:border-teal-300 dark:hover:border-teal-700 hover:shadow-md transition-all duration-200">
                <div className="p-4">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center">
                        {isAch ? <BarChart2 size={16} className="text-teal-600 dark:text-teal-400" /> : <FileText size={16} className="text-teal-600 dark:text-teal-400" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight truncate">{a.employee_name || 'Employee'}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">{a.form_type || a.eval_type || 'Appraisal'}</p>
                      </div>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${stageColor}`}>{stageLabel}</span>
                    </div>
                  </div>

                  {/* Info pills */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400"><Building2 size={11} /> {a.employee_department || a.dept || user?.dept || '—'}</span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400"><Calendar size={11} /> {a.eval_period_from || a.review_period_from || '—'} – {a.eval_period_to || a.review_period_to || '—'}</span>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${ratingColor}`}><BarChart2 size={11} /> Overall: {overall}</span>
                  </div>

                  {/* Actions */}
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-end gap-2">
                    <button
                      onClick={() => setGenericViewModal({ title: `${a.form_type || a.eval_type || 'Appraisal'} — ${a.employee_name || 'Employee'}`, type: 'appraisal', record: a })}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                    >
                      <Eye size={13} /> View Form
                    </button>
                    <button
                      onClick={() => {
                        setAppraisalSignModal({ record: a, stage: a.queueStage === 'reviewer' ? 'reviewer' : a.queueStage === 'manager' ? 'manager' : 'supervisor' });
                        setActiveId(key);
                        setSignerPrintTitle(String(user?.full_name || user?.employee_name || user?.username || ''));
                        setSupervisorOverallRating((a?.overall_rating || '') as 'Satisfactory' | 'Unsatisfactory' | '');
                        setSupervisorRecommendation(String(a?.recommendation || ''));
                        setSupervisorComments(String(a?.supervisors_overall_comment || ''));
                        setReviewerAgree((a?.reviewer_agree || '') as 'agree' | 'disagree' | '');
                        setReviewerRevisedRating((a?.revised_rating || '') as 'Satisfactory' | 'Unsatisfactory' | '');
                        setReviewerComments(String(a?.reviewers_comment || ''));
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 transition-colors"
                      disabled={a.queueReady === false}
                      title={a.queueReady === false ? 'Waiting for supervisor to sign first' : undefined}
                    >
                      <PenLine size={13} /> {a.queueReady === false ? 'Awaiting Supervisor' : 'Sign'}
                    </button>
                  </div>
                </div>
              </div>
              );
            })}
            </div>
            {doneSupervisorAppraisals.length > 0 && (
              <p className="mt-4 text-xs text-emerald-600 flex items-center gap-1"><CheckCircle size={12} /> {doneSupervisorAppraisals.length} completed</p>
            )}
          </Card>
          )}

          {/* Sign Modal */}
          <Modal
            open={!!appraisalSignModal}
            title={appraisalSignModal ? `Sign — ${appraisalSignModal.record.form_type || 'Appraisal'} (${appraisalSignModal.record.employee_name || 'Employee'})` : ''}
            onClose={() => { setAppraisalSignModal(null); resetQueueSignerState(); }}
            maxWidthClassName="max-w-lg"
          >
            {appraisalSignModal && (
              <div>
                <div className="mb-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
                  <ShieldAlert size={14} className="mt-0.5 flex-shrink-0" />
                  By signing, you confirm you have reviewed this form. Your digital signature will be recorded.
                </div>
                {renderAppraisalSignBox(
                  () => signManagementAppraisal(appraisalSignModal.record).then(() => setAppraisalSignModal(null)),
                  appraisalSignModal.stage
                )}
              </div>
            )}
          </Modal>

          {activeQueueSection === 'mgmt-discipline' && (
          <Card>
            <h3 className="text-sm font-bold mb-3">Disciplinary Records Needing Management Signature</h3>
            {pendingSupervisorDiscipline.length === 0 && renderEmptyQueueState('No pending disciplinary signatures.')}
            {pendingSupervisorDiscipline.map((d) => {
              const disciplineKey = d.queueKey || `sup-disc-${d.id}`;
              const reviewed = !!disciplineReviewedKeys[disciplineKey];
              const readyForSign = d.queueStage === 'preparer' ? true : !!d.queueReady;
              const prog = getDisciplineSignProgress(d);
              const stageLabel = d.queueStage === 'preparer' ? 'Preparer' : 'Supervisor';
              const actionId = d.queueStage === 'preparer' ? 'mgmt-disc-prep' : 'mgmt-disc-sup';
              return renderQueueCard({
                id: disciplineKey,
                icon: <AlertTriangle size={16} />,
                iconColorClass: 'text-red-500 dark:text-red-400',
                iconBgClass: 'bg-red-50 dark:bg-red-900/20',
                title: `${d.employee_name || 'Employee'} — ${d.warning_level || 'Warning'}`,
                subtitle: `${d.violation_type || 'Disciplinary Action'} • ${d.date_of_warning || '—'}`,
                badge: stageLabel,
                badgeColorClass: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
                pills: [
                  { icon: <Clock size={10} />, text: `${prog.done}/${prog.total} signed` },
                  { icon: <Building2 size={10} />, text: d.employee_department || d.dept || '—' },
                ],
                warningText: !readyForSign ? 'Waiting for preparer signature before supervisor can sign.' : !reviewed ? 'Please review the form first before signing.' : undefined,
                onView: () => openDisciplineReview(disciplineKey, d),
                signDisabled: !reviewed || !readyForSign,
                signTitle: !reviewed ? 'Review the form first' : !readyForSign ? 'Awaiting preparer signature' : undefined,
                onSign: () => { if (reviewed && readyForSign) openGenericSign(`Sign — Disciplinary (${d.employee_name || 'Employee'}) [${stageLabel}]`, 'simple', actionId, d); else openDisciplineReview(disciplineKey, d); },
              });
            })}
            <p className="mt-2 text-xs text-emerald-600">Finished: {doneSupervisorDiscipline.length}</p>
          </Card>
          )}

          {activeQueueSection === 'mgmt-suggestions' && (
          <Card>
            <h3 className="text-sm font-bold mb-3">Suggestions Needing Management Signature</h3>
            {pendingSupervisorSuggestions.length === 0 && renderEmptyQueueState('No pending suggestion signatures.')}
            {pendingSupervisorSuggestions.map((s) => renderQueueCard({
              id: `sup-sug-${s.id}`,
              icon: <Lightbulb size={16} />,
              iconColorClass: 'text-yellow-600 dark:text-yellow-400',
              iconBgClass: 'bg-yellow-50 dark:bg-yellow-900/20',
              title: s.title || s.concern?.slice(0, 50) || 'Suggestion',
              subtitle: `${s.employee_name || 'Employee'} • ${s.date || s.created_at?.split('T')[0] || '—'}`,
              badge: 'Management',
              badgeColorClass: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
              pills: [{ icon: <Building2 size={10} />, text: s.department || s.employee_department || '—' }],
              onView: () => setGenericViewModal({ title: `Suggestion — ${s.employee_name || 'Employee'}`, type: 'suggestion', record: s }),
              onSign: () => openGenericSign(`Sign — Suggestion (${s.employee_name || 'Employee'})`, 'simple', 'mgmt-sug', s),
            }))}
            <p className="mt-2 text-xs text-emerald-600">Finished: {doneSupervisorSuggestions.length}</p>
          </Card>
          )}

          {activeQueueSection === 'mgmt-applicants' && (
          <Card>
            <h3 className="text-sm font-bold mb-3">Applicants Needing Interviewer Signature</h3>
            {pendingManagementApplicants.length === 0 && renderEmptyQueueState('No pending interviewer signatures.')}
            {pendingManagementApplicants.map((a) => renderQueueCard({
              id: `mgmt-app-${a.id}`,
              icon: <Users size={16} />,
              iconColorClass: 'text-indigo-600 dark:text-indigo-400',
              iconBgClass: 'bg-indigo-50 dark:bg-indigo-900/20',
              title: `${a.name || 'Applicant'} — ${a.position || 'Position'}`,
              subtitle: `Interview appraisal • ${a.interview_date || '—'}`,
              badge: 'Interviewer',
              badgeColorClass: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
              pills: [{ icon: <Building2 size={10} />, text: a.department || a.employee_department || '—' }],
              onView: () => setGenericViewModal({ title: `Applicant — ${a.name || 'Applicant'}`, type: 'applicant', record: a }),
              onSign: () => openGenericSign(
                `Sign — Applicant Interview (${a.name || 'Applicant'})`,
                'applicantInterviewer', 'mgmt-app', a,
                undefined,
                String(a?.interviewer_name || user?.full_name || user?.employee_name || ''),
                String(a?.interviewer_title || user?.position || ''),
                String(a?.interview_date || new Date().toISOString().split('T')[0]),
              ),
            }))}
          </Card>
          )}

          {activeQueueSection === 'mgmt-reqs' && (
          <Card>
            <h3 className="text-sm font-bold mb-3">Requisitions Needing Supervisor Signature</h3>
            {pendingManagementRequisitionStages.length === 0 && renderEmptyQueueState('No pending requisition signatures.')}
            {pendingManagementRequisitionStages.map((t) => renderQueueCard({
              id: t.key,
              icon: <ClipboardList size={16} />,
              iconColorClass: 'text-cyan-600 dark:text-cyan-400',
              iconBgClass: 'bg-cyan-50 dark:bg-cyan-900/20',
              title: t.job_title || 'Requisition',
              subtitle: t.title,
              badge: 'Supervisor',
              badgeColorClass: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
              pills: [{ icon: <Building2 size={10} />, text: t.department || '—' }],
              onView: () => setGenericViewModal({ title: `Requisition — ${t.job_title || 'Requisition'}`, type: 'requisition', record: t }),
              onSign: () => openGenericSign(`Sign — Requisition (${t.job_title || 'Requisition'})`, 'simple', 'mgmt-req', t),
            }))}
          </Card>
          )}

          {activeQueueSection === 'mgmt-property' && (
          <Card>
            <h3 className="text-sm font-bold mb-3">Property Accountability Signatures</h3>
            {pendingManagementPropertyTasks.length === 0 && renderEmptyQueueState('No pending property signatures.')}
            {pendingManagementPropertyTasks.map((t) => renderQueueCard({
              id: t.key,
              icon: <Package size={16} />,
              iconColorClass: 'text-orange-600 dark:text-orange-400',
              iconBgClass: 'bg-orange-50 dark:bg-orange-900/20',
              title: `Property — ${t.employee_name || 'Employee'}`,
              subtitle: t.title,
              badge: 'Management',
              badgeColorClass: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
              onView: () => setGenericViewModal({ title: `Property — ${t.employee_name || 'Employee'}`, type: 'property', record: t }),
              onSign: () => openGenericSign(`Sign — Property Accountability (${t.employee_name || 'Employee'})`, 'simple', 'mgmt-prop', t),
            }))}
          </Card>
          )}

          {activeQueueSection === 'mgmt-exit' && (
          <Card>
            <h3 className="text-sm font-bold mb-3">Exit Interviews Needing Interviewer Signature</h3>
            {pendingManagementExitInterviews.length === 0 && renderEmptyQueueState('No pending exit interview signatures.')}
            {pendingManagementExitInterviews.map((e) => renderQueueCard({
              id: `mgmt-exit-${e.id}`,
              icon: <LogOut size={16} />,
              iconColorClass: 'text-slate-600 dark:text-slate-400',
              iconBgClass: 'bg-slate-100 dark:bg-slate-700',
              title: `Exit Interview — ${e.employee_name || 'Employee'}`,
              subtitle: `Interview date: ${e.interview_date || '—'}`,
              badge: 'Interviewer',
              badgeColorClass: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
              pills: [{ icon: <Building2 size={10} />, text: e.department || e.employee_department || '—' }],
              onView: () => setGenericViewModal({ title: `Exit Interview — ${e.employee_name || 'Employee'}`, type: 'exit', record: e }),
              onSign: () => openGenericSign(`Sign — Exit Interview (${e.employee_name || 'Employee'})`, 'simple', 'mgmt-exit', e),
            }))}
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
              const canSign = !!a.queueReady;
              const statusText = !a.supervisor_signature
                ? 'Waiting for supervisor signature'
                : !a.reviewer_signature
                  ? 'Waiting for reviewer signature'
                  : !a.employee_signature
                    ? 'Waiting for employee signature'
                    : 'All prior signatures complete. Awaiting HR signature.';
              return renderQueueCard({
                id: `hr-app-${a.id}`,
                icon: <FileText size={16} />,
                iconColorClass: 'text-teal-600 dark:text-teal-400',
                iconBgClass: 'bg-teal-50 dark:bg-teal-900/30',
                title: `${a.form_type || a.eval_type || 'Performance Evaluation'} — ${a.employee_name || 'Employee'}`,
                subtitle: statusText,
                badge: 'HR',
                badgeColorClass: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
                pills: [
                  { icon: <Building2 size={10} />, text: a.employee_department || a.dept || '—' },
                  { icon: <Calendar size={10} />, text: `${a.eval_period_from || '—'} – ${a.eval_period_to || '—'}` },
                  { icon: <BarChart2 size={10} />, text: `Overall: ${a.overall ?? '—'}` },
                ],
                onView: () => setGenericViewModal({ title: `${a.form_type || 'Appraisal'} — ${a.employee_name || 'Employee'}`, type: 'appraisal', record: a }),
                signDisabled: !canSign,
                signTitle: !canSign ? statusText : undefined,
                onSign: () => { if (canSign) openGenericSign(`Sign — ${a.form_type || 'Appraisal'} (${a.employee_name || 'Employee'})`, 'appraisalHr', 'hr-app', a); },
              });
            })}
            <div className="mt-3 flex items-center gap-2 text-emerald-600 text-sm font-semibold">
              <CheckCircle size={14} /> Finished: {doneHrAppraisals.length}
            </div>
          </Card>
          )}

          {activeQueueSection === 'hr-onboarding' && (
          <Card>
            <h3 className="text-sm font-bold mb-3">Onboarding Records Needing HR Signature</h3>
            {pendingHrOnboarding.length === 0 && renderEmptyQueueState('No pending onboarding signatures.')}
            {pendingHrOnboarding.map((o) => renderQueueCard({
              id: `hr-onb-${o.id}`,
              icon: <UserCheck size={16} />,
              iconColorClass: 'text-blue-600 dark:text-blue-400',
              iconBgClass: 'bg-blue-50 dark:bg-blue-900/20',
              title: `Onboarding — ${o.employee_name || 'Employee'}`,
              subtitle: `Status: ${o.status || 'Pending'} • ${o.start_date || '—'}`,
              badge: 'HR',
              badgeColorClass: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
              pills: [{ icon: <Building2 size={10} />, text: o.department || o.employee_department || '—' }],
              onView: () => setGenericViewModal({ title: `Onboarding — ${o.employee_name || 'Employee'}`, type: 'onboarding', record: o }),
              onSign: () => openGenericSign(`Sign — Onboarding HR (${o.employee_name || 'Employee'})`, 'simple', 'hr-onb', o),
            }))}
          </Card>
          )}

          {activeQueueSection === 'hr-applicants' && (
          <Card>
            <h3 className="text-sm font-bold mb-3">Applicant Reviews Needing HR Signature</h3>
            {pendingHrApplicants.length === 0 && renderEmptyQueueState('No pending applicant reviewer signatures.')}
            {pendingHrApplicants.map((a) => renderQueueCard({
              id: `hr-applicant-${a.id}`,
              icon: <Users size={16} />,
              iconColorClass: 'text-indigo-600 dark:text-indigo-400',
              iconBgClass: 'bg-indigo-50 dark:bg-indigo-900/20',
              title: `${a.name || 'Applicant'} — ${a.position || 'Position'}`,
              subtitle: 'HR reviewer signature needed',
              badge: 'HR Reviewer',
              badgeColorClass: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
              pills: [{ icon: <Building2 size={10} />, text: a.department || a.employee_department || '—' }],
              onView: () => setGenericViewModal({ title: `Applicant — ${a.name || 'Applicant'}`, type: 'applicant', record: a }),
              onSign: () => openGenericSign(
                `Sign — HR Review (${a.name || 'Applicant'})`,
                'applicantHr', 'hr-applicant', a,
                undefined,
                String(a?.hr_reviewer_name || user?.full_name || user?.employee_name || ''),
                '',
                String(a?.hr_reviewer_date || new Date().toISOString().split('T')[0]),
              ),
            }))}
          </Card>
          )}

          {activeQueueSection === 'hr-reqs' && (
          <Card>
            <h3 className="text-sm font-bold mb-3">Requisition Approvals Needing HR Signature</h3>
            {pendingHrRequisitionStages.length === 0 && renderEmptyQueueState('No pending requisition approvals.')}
            {pendingHrRequisitionStages.map((t) => renderQueueCard({
              id: t.key,
              icon: <ClipboardList size={16} />,
              iconColorClass: 'text-cyan-600 dark:text-cyan-400',
              iconBgClass: 'bg-cyan-50 dark:bg-cyan-900/20',
              title: t.job_title || 'Requisition',
              subtitle: t.title,
              badge: 'HR Approval',
              badgeColorClass: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
              pills: [{ icon: <Building2 size={10} />, text: t.department || '—' }],
              onView: () => setGenericViewModal({ title: `Requisition — ${t.job_title || 'Requisition'}`, type: 'requisition', record: t }),
              onSign: () => openGenericSign(`Sign — Requisition (${t.job_title || 'Requisition'})`, 'simple', 'hr-req', t),
            }))}
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

      {/* Generic View Modal */}
      <Modal
        open={!!genericViewModal}
        title={genericViewModal?.title || 'Record Details'}
        onClose={() => setGenericViewModal(null)}
        maxWidthClassName="max-w-2xl"
      >
        {genericViewModal && renderGenericViewContent()}
      </Modal>

      {/* Generic Sign Modal */}
      <Modal
        open={!!genericSignModal}
        title={genericSignModal?.title || 'Sign Record'}
        onClose={() => { resetQueueSignerState(); setGenericSignModal(null); }}
        maxWidthClassName="max-w-lg"
      >
        {genericSignModal && (() => {
          const { signType, record, actionId } = genericSignModal;
          const action = getGenericSignAction(actionId, record);
          return (
            <div>
              <div className="mb-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
                <ShieldAlert size={14} className="mt-0.5 flex-shrink-0" />
                By signing, you confirm you have reviewed this form. Your digital signature will be recorded.
              </div>
              {signType === 'appraisalEmployee' && renderAppraisalSignBox(action, 'employee')}
              {signType === 'appraisalHr' && renderAppraisalSignBox(action, 'hr')}
              {signType === 'applicantInterviewer' && renderApplicantSignBox(action, 'interviewer')}
              {signType === 'applicantHr' && renderApplicantSignBox(action, 'hr')}
              {(signType === 'simple' || signType === 'remarks') && renderSignBox(action, signType === 'remarks')}
            </div>
          );
        })()}
      </Modal>

      <div className="mt-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1"><FileCheck size={12} /> Records marked as signed are treated as finished.</span>
      </div>
    </motion.div>
  );
};
