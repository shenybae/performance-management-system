import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Target, Users, TrendingUp, CheckCircle2, Clock, AlertCircle, Plus, ChevronDown, ChevronRight, User, Image as ImageIcon } from 'lucide-react';
import { SectionHeader } from '../../common/SectionHeader';
import Modal from '../../common/Modal';
import { getAuthHeaders } from '../../../utils/csv';
import { appAlert } from '../../../utils/appDialog';
import { ProofAttachment } from '../../common/ProofAttachment';

interface Goal {
  id: number;
  title: string;
  statement: string;
  metric: string;
  target_date: string;
  status: string;
  progress: number;
  frequency: string;
  scope: string;
  department: string;
  team_name: string;
  priority: string;
  quarter: string;
  assignees?: { id: number; name: string; position: string; progress: number }[];
  subtasks?: Goal[];
  member_tasks?: any[];
  proof_image?: string;
  proof_file_name?: string;
  proof_file_type?: string;
  proof_note?: string;
  proof_submitted_at?: string;
  proof_review_status?: string;
  proof_review_note?: string;
}

interface TeamMember {
  id: number;
  name: string;
  position: string;
  email: string;
  profile_picture: string | null;
}

const statusColors = {
  'Not Started': 'text-slate-400 bg-slate-100 dark:bg-slate-800',
  'In Progress': 'text-amber-600 bg-amber-100 dark:bg-amber-900/30',
  'At Risk': 'text-red-600 bg-red-100 dark:bg-red-900/30',
  'Completed': 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30',
};

const priorityColors = {
  'Critical': 'text-red-600 bg-red-100 dark:bg-red-900/30',
  'High': 'text-orange-600 bg-orange-100 dark:bg-orange-900/30',
  'Medium': 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
  'Low': 'text-slate-600 bg-slate-100 dark:bg-slate-800',
};

const safeParseSession = (raw: string | null) => {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const normalizeArray = (value: any) => (Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []);

type GoalProofFile = {
  proof_file_data: string;
  proof_file_name: string;
  proof_file_type: string;
};

type ProofRevisionEntry = {
  revision_number?: number;
  revision_label?: string;
  proof_review_status?: string;
  proof_review_note?: string;
  proof_review_file_data?: string;
  proof_review_file_name?: string;
  proof_review_file_type?: string;
  proof_files?: GoalProofFile[];
  archived_at?: string;
};

type ReviewAttachment = {
  file_data: string;
  file_name: string;
  file_type: string;
};

const parseGoalProofFiles = (goal: any): GoalProofFile[] => {
  const rawData = String(goal?.proof_image || '').trim();
  const fallbackName = String(goal?.proof_file_name || 'Final proof').trim();
  const fallbackType = String(goal?.proof_file_type || 'application/octet-stream').trim();
  if (!rawData) return [];

  if (rawData.startsWith('[')) {
    try {
      const parsed = JSON.parse(rawData);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item: any) => ({
            proof_file_data: String(item?.proof_file_data || item?.data || '').trim(),
            proof_file_name: String(item?.proof_file_name || item?.name || 'Final proof').trim(),
            proof_file_type: String(item?.proof_file_type || item?.type || 'application/octet-stream').trim(),
          }))
          .filter((item: GoalProofFile) => !!item.proof_file_data);
      }
    } catch {}
  }

  return [{
    proof_file_data: rawData,
    proof_file_name: fallbackName,
    proof_file_type: fallbackType,
  }];
};

const parseProofRevisionHistory = (value: any): ProofRevisionEntry[] => {
  const rawData = String(value || '').trim();
  if (!rawData || !rawData.startsWith('[')) return [];
  try {
    const parsed = JSON.parse(rawData);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: any, index: number) => ({
      revision_number: Number(item?.revision_number || index + 1),
      revision_label: String(item?.revision_label || '').trim(),
      proof_review_status: String(item?.proof_review_status || '').trim(),
      proof_review_note: String(item?.proof_review_note || '').trim(),
      proof_review_file_data: String(item?.proof_review_file_data || '').trim(),
      proof_review_file_name: String(item?.proof_review_file_name || '').trim(),
      proof_review_file_type: String(item?.proof_review_file_type || '').trim(),
      proof_files: Array.isArray(item?.proof_files)
        ? item.proof_files.map((file: any) => ({
            proof_file_data: String(file?.proof_file_data || file?.data || '').trim(),
            proof_file_name: String(file?.proof_file_name || file?.name || '').trim(),
            proof_file_type: String(file?.proof_file_type || file?.type || 'application/octet-stream').trim(),
          })).filter((file: any) => !!file.proof_file_data)
        : [],
      archived_at: String(item?.archived_at || '').trim(),
    }));
  } catch {
    return [];
  }
};

const ordinalLabel = (value: number) => {
  const n = Math.max(1, Math.trunc(Number(value) || 0));
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
};

export const TeamLeaderDashboard = () => {
  const [leaderGoals, setLeaderGoals] = useState<Goal[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [expandedGoals, setExpandedGoals] = useState<Set<number>>(new Set());
  const [showSubtaskModal, setShowSubtaskModal] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState<number>(Date.now());
  const [pendingExtensionRequests, setPendingExtensionRequests] = useState<any[]>([]);
  const [goalExtensionDrafts, setGoalExtensionDrafts] = useState<Record<number, { requested_due_date: string; reason: string }>>({});
  const [goalExtensionSubmittingId, setGoalExtensionSubmittingId] = useState<number | null>(null);
  const [extensionDecisionId, setExtensionDecisionId] = useState<number | null>(null);
  const [goalProofDrafts, setGoalProofDrafts] = useState<Record<number, { files: GoalProofFile[]; note: string }>>({});
  const [goalProofSubmittingId, setGoalProofSubmittingId] = useState<number | null>(null);
  const [proofReviewNotes, setProofReviewNotes] = useState<Record<number, string>>({});
  const [proofReviewAttachments, setProofReviewAttachments] = useState<Record<number, ReviewAttachment | null>>({});
  const [needsRevisionModal, setNeedsRevisionModal] = useState<{
    open: boolean;
    taskId: number | null;
    taskTitle: string;
    note: string;
    attachment: ReviewAttachment | null;
    submitting: boolean;
  }>({
    open: false,
    taskId: null,
    taskTitle: '',
    note: '',
    attachment: null,
    submitting: false,
  });

  const [subtaskForm, setSubtaskForm] = useState({
    title: '',
    statement: '',
    metric: '',
    target_date: '',
    assignee_id: '',
    priority: 'Medium',
  });

  const user = safeParseSession(localStorage.getItem('talentflow_user'));

  useEffect(() => {
    fetchLeaderGoals();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      void fetchLeaderGoals(true);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchLeaderGoals = async (quiet = false) => {
    try {
      if (!quiet) setLoading(true);
      const res = await fetch('/api/leader-goals', { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to fetch leader goals');
      const data = await res.json();
      setLeaderGoals(normalizeArray(data?.goals).length > 0 ? normalizeArray(data?.goals) : normalizeArray(data));
      setTeamMembers(normalizeArray(data?.teamMembers));
      setLastSyncAt(Date.now());
      try {
        const pendingRes = await fetch('/api/deadline-extension-requests/pending', { headers: getAuthHeaders() });
        const pendingData = pendingRes.ok ? await pendingRes.json() : [];
        setPendingExtensionRequests(normalizeArray(pendingData));
      } catch {
        setPendingExtensionRequests([]);
      }
    } catch (error) {
      console.error('Error fetching leader goals:', error);
      setLeaderGoals([]);
      setPendingExtensionRequests([]);
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    setGoalExtensionDrafts(prev => {
      const next = { ...prev };
      for (const g of leaderGoals) {
        if (!next[g.id]) next[g.id] = { requested_due_date: '', reason: '' };
      }
      return next;
    });
  }, [leaderGoals]);

  const submitGoalExtensionRequest = async (goal: Goal) => {
    const goalId = Number(goal?.id || 0);
    if (!goalId) return;
    const draft = goalExtensionDrafts[goalId] || { requested_due_date: '', reason: '' };
    const requestedDueDate = String(draft.requested_due_date || '').trim();
    const reason = String(draft.reason || '').trim();
    if (!requestedDueDate) {
      window.notify?.('Please set the requested new goal due date', 'error');
      return;
    }

    setGoalExtensionSubmittingId(goalId);
    try {
      const res = await fetch('/api/deadline-extension-requests', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: 'goal',
          goal_id: goalId,
          requested_due_date: requestedDueDate,
          reason,
        }),
      });
      if (!res.ok) {
        let msg = 'Failed to submit goal extension request';
        try {
          const err = await res.json();
          if (err?.error) msg = String(err.error);
        } catch {}
        throw new Error(msg);
      }
      window.notify?.('Goal extension request sent to manager', 'success');
      setGoalExtensionDrafts(prev => ({
        ...prev,
        [goalId]: { requested_due_date: '', reason: '' },
      }));
      fetchLeaderGoals(true);
    } catch (e: any) {
      window.notify?.(e?.message || 'Failed to submit goal extension request', 'error');
    } finally {
      setGoalExtensionSubmittingId(null);
    }
  };

  const decideExtensionRequest = async (requestId: number, decision: 'approve' | 'reject') => {
    const note = prompt(decision === 'approve' ? 'Approval note (optional):' : 'Rejection note (optional):') || '';
    setExtensionDecisionId(requestId);
    try {
      const res = await fetch(`/api/deadline-extension-requests/${requestId}/decision`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note }),
      });
      if (!res.ok) {
        let msg = 'Failed to update extension request';
        try {
          const err = await res.json();
          if (err?.error) msg = String(err.error);
        } catch {}
        throw new Error(msg);
      }
      window.notify?.(`Extension request ${decision === 'approve' ? 'approved' : 'rejected'}`, 'success');
      fetchLeaderGoals(true);
    } catch (e: any) {
      window.notify?.(e?.message || 'Failed to update extension request', 'error');
    } finally {
      setExtensionDecisionId(null);
    }
  };

  const handleProofReviewAttachmentChange = async (taskId: number, file: File | null) => {
    if (!file) {
      setProofReviewAttachments((prev) => ({ ...prev, [taskId]: null }));
      return;
    }
    try {
      const fileData = await readFileAsDataUrl(file);
      setProofReviewAttachments((prev) => ({
        ...prev,
        [taskId]: {
          file_data: fileData,
          file_name: file.name,
          file_type: file.type || 'application/octet-stream',
        },
      }));
    } catch {
      window.notify?.('Failed to read review attachment', 'error');
    }
  };

  const openNeedsRevisionModal = (task: any) => {
    const taskId = Number(task?.id || 0);
    if (!taskId) return;
    setNeedsRevisionModal({
      open: true,
      taskId,
      taskTitle: String(task?.title || '').trim() || `Task #${taskId}`,
      note: String(proofReviewNotes[taskId] || '').trim(),
      attachment: proofReviewAttachments[taskId] || null,
      submitting: false,
    });
  };

  const closeNeedsRevisionModal = () => {
    setNeedsRevisionModal((prev) => ({ ...prev, open: false, submitting: false }));
  };

  const reviewTaskProof = async (
    taskId: number,
    status: 'Approved' | 'Needs Revision' | 'Rejected',
    options?: { note?: string; attachment?: ReviewAttachment | null }
  ) => {
    const note = String(options?.note ?? proofReviewNotes[taskId] ?? '').trim();
    const attachment = options?.attachment ?? proofReviewAttachments[taskId];
    try {
      const res = await fetch(`/api/member-tasks/${taskId}`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proof_review_status: status,
          proof_review_note: note,
          ...(attachment && status !== 'Approved' ? {
            proof_review_file_data: attachment.file_data,
            proof_review_file_name: attachment.file_name,
            proof_review_file_type: attachment.file_type,
          } : {}),
        })
      });
      if (!res.ok) throw new Error('Failed to update review');
      window.notify?.(`Proof ${status.toLowerCase()}`, 'success');
      setProofReviewNotes((prev) => ({ ...prev, [taskId]: '' }));
      setProofReviewAttachments((prev) => ({ ...prev, [taskId]: null }));
      fetchLeaderGoals();
    } catch (error) {
      window.notify?.('Failed to update proof review', 'error');
    }
  };

  const submitNeedsRevisionRequest = async () => {
    const taskId = Number(needsRevisionModal.taskId || 0);
    const note = String(needsRevisionModal.note || '').trim();
    if (!taskId) return;
    if (!note) {
      window.notify?.('Please describe what needs to be revised', 'error');
      return;
    }

    setNeedsRevisionModal((prev) => ({ ...prev, submitting: true }));
    try {
      setProofReviewNotes((prev) => ({ ...prev, [taskId]: note }));
      setProofReviewAttachments((prev) => ({ ...prev, [taskId]: needsRevisionModal.attachment || null }));
      await reviewTaskProof(taskId, 'Needs Revision', { note, attachment: needsRevisionModal.attachment });
      closeNeedsRevisionModal();
    } finally {
      setNeedsRevisionModal((prev) => ({ ...prev, submitting: false }));
    }
  };

  const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(String(event.target?.result || ''));
    reader.onerror = () => reject(new Error('Failed to read proof file'));
    reader.readAsDataURL(file);
  });

  const handleGoalProofUpload = async (goalId: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const payload = await Promise.all(Array.from(files).map(async (file) => ({
        proof_file_data: await readFileAsDataUrl(file),
        proof_file_name: file.name,
        proof_file_type: file.type || 'application/octet-stream',
      })));
      setGoalProofDrafts((prev) => {
        const existing = prev[goalId] || { files: [], note: '' };
        return {
          ...prev,
          [goalId]: {
            ...existing,
            files: [...existing.files, ...payload],
          },
        };
      });
    } catch {
      window.notify?.('Failed to read selected proof file', 'error');
    }
  };

  const removeGoalProofDraftFile = (goalId: number, index: number) => {
    setGoalProofDrafts((prev) => {
      const existing = prev[goalId] || { files: [], note: '' };
      return {
        ...prev,
        [goalId]: {
          ...existing,
          files: existing.files.filter((_, fileIndex) => fileIndex !== index),
        },
      };
    });
  };

  const submitGoalFinalProof = async (goal: Goal) => {
    const goalId = Number(goal?.id || 0);
    if (!goalId) return;
    const draft = goalProofDrafts[goalId] || { files: [], note: '' };
    const note = String(draft.note || '').trim();
    if (draft.files.length === 0) {
      window.notify?.('Please attach at least one final proof file', 'error');
      return;
    }

    setGoalProofSubmittingId(goalId);
    try {
      const res = await fetch(`/api/goals/${goalId}`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proof_files: draft.files,
          proof_image: JSON.stringify(draft.files),
          proof_file_name: draft.files[0]?.proof_file_name || null,
          proof_file_type: draft.files[0]?.proof_file_type || null,
          proof_note: note,
          proof_submitted_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        let msg = 'Failed to submit final proof';
        try {
          const err = await res.json();
          if (err?.error) msg = String(err.error);
        } catch {}
        throw new Error(msg);
      }

      window.notify?.('Final proof sent to manager for review', 'success');
      setGoalProofDrafts((prev) => ({
        ...prev,
        [goalId]: { files: [], note: '' },
      }));
      fetchLeaderGoals(true);
    } catch (e: any) {
      window.notify?.(e?.message || 'Failed to submit final proof', 'error');
    } finally {
      setGoalProofSubmittingId(null);
    }
  };

  const fetchTeamMembers = async () => {
    try {
      const res = await fetch(`/api/leaders/${user.id}/members`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to fetch team members');
      const data = await res.json();
      setTeamMembers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching team members:', error);
      setTeamMembers([]);
    }
  };

  const handleCreateSubtask = async () => {
    if (!selectedGoal || !subtaskForm.title || !subtaskForm.assignee_id) {
      await appAlert('Please fill all required fields', { title: 'Required Fields' });
      return;
    }

    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: parseInt(subtaskForm.assignee_id),
          title: subtaskForm.title,
          statement: subtaskForm.statement,
          metric: subtaskForm.metric,
          target_date: subtaskForm.target_date,
          status: 'Not Started',
          progress: 0,
          scope: 'Individual',
          priority: subtaskForm.priority,
          frequency: selectedGoal.frequency,
          parent_goal_id: selectedGoal.id,
          delegation: user.full_name || user.username,
        }),
      });

      if (!res.ok) throw new Error('Failed to create subtask');

      await appAlert('Subtask created successfully!', { title: 'Subtask Created' });
      setShowSubtaskModal(false);
      setSubtaskForm({ title: '', statement: '', metric: '', target_date: '', assignee_id: '', priority: 'Medium' });
      fetchLeaderGoals();
    } catch (error) {
      console.error('Error creating subtask:', error);
      await appAlert('Failed to create subtask', { title: 'Action Failed' });
    }
  };

  const handleUpdateProgress = async (goalId: number, newProgress: number) => {
    try {
      const res = await fetch(`/api/goals/${goalId}`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress: newProgress }),
      });

      if (!res.ok) throw new Error('Failed to update progress');
      fetchLeaderGoals();
    } catch (error) {
      console.error('Error updating progress:', error);
      await appAlert('Failed to update progress', { title: 'Action Failed' });
    }
  };

  const toggleGoalExpansion = (goalId: number) => {
    setExpandedGoals(prev => {
      const newSet = new Set(prev);
      if (newSet.has(goalId)) {
        newSet.delete(goalId);
      } else {
        newSet.add(goalId);
      }
      return newSet;
    });
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 80) return 'bg-emerald-500';
    if (progress >= 50) return 'bg-blue-500';
    if (progress >= 25) return 'bg-amber-500';
    return 'bg-slate-400';
  };

  const inProgressGoals = leaderGoals.filter(g => g.status === 'In Progress');
  const completedGoals = leaderGoals.filter(g => g.status === 'Completed');
  const atRiskGoals = leaderGoals.filter(g => g.status === 'At Risk');
  const proofReviewQueue = leaderGoals.flatMap(goal => {
    const tasks = Array.isArray(goal.member_tasks) ? goal.member_tasks : [];
    return tasks.map((task: any) => ({ ...task, goal_title: goal.title || goal.statement || 'Untitled Goal' }));
  }).filter((task: any) => {
    const status = String(task.proof_review_status || 'Not Submitted');
    return status === 'Pending Review' || status === 'Needs Revision' || status === 'Rejected' || !!task.proof_image;
  });
  const pendingProofCount = proofReviewQueue.filter((task: any) => String(task.proof_review_status || 'Not Submitted') === 'Pending Review').length;

  const overallProgress = leaderGoals.length > 0
    ? Math.round(leaderGoals.reduce((sum, g) => sum + (g.progress || 0), 0) / leaderGoals.length)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      <SectionHeader
        title="Team Leadership Dashboard"
        subtitle="Manage goals, delegate tasks, and track team progress"
      />

      <div className="rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/70 dark:bg-blue-900/20 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase text-blue-700 dark:text-blue-300 tracking-wider">Real-Time Proof Tracker</p>
          <p className="text-[11px] text-blue-700/80 dark:text-blue-300/80 mt-1">
            Employee uploads proof on a delegated task. The task turns Pending Review, then you approve, request revision, or reject it here.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold text-blue-700 dark:text-blue-300">
          <span className="inline-flex h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          Live sync every 5 seconds
          <span className="text-blue-500/70 dark:text-blue-300/70">•</span>
          Last sync {Math.max(0, Math.floor((Date.now() - lastSyncAt) / 1000))}s ago
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4">
          <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Proofs waiting</div>
          <div className="text-2xl font-black text-slate-800 dark:text-slate-100">{pendingProofCount}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Submitted by employees and ready for your review.</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Proofs with files</div>
          <div className="text-2xl font-black text-slate-800 dark:text-slate-100">{proofReviewQueue.filter((task: any) => !!task.proof_image).length}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Click a goal and review the uploaded proof image.</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Review workflow</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Pending Review means the employee submitted proof. Approve, request revision, or reject it here.
          </div>
        </div>
      </div>

      {proofReviewQueue.length > 0 && (
        <div className="glass-card p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Recent Proof Submissions</h3>
            <span className="text-[10px] font-bold text-blue-600 dark:text-blue-300">Auto-updates every 5 seconds</span>
          </div>
          <div className="space-y-2">
            {proofReviewQueue.slice(0, 5).map((task: any) => (
              <button
                key={task.id}
                type="button"
                onClick={() => {
                  const goal = leaderGoals.find(g => Array.isArray(g.member_tasks) && g.member_tasks.some((t: any) => t.id === task.id));
                  if (goal) toggleGoalExpansion(goal.id);
                }}
                className="w-full text-left rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{task.title || 'Untitled Task'}</p>
                    <p className="text-[10px] text-slate-500 truncate">{task.goal_title} • {task.member_name || `#${task.member_employee_id}`}</p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${String(task.proof_review_status || 'Not Submitted') === 'Pending Review' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : String(task.proof_review_status || 'Not Submitted') === 'Approved' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
                    {task.proof_review_status || 'Not Submitted'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {pendingExtensionRequests.length > 0 && (
        <div className="glass-card p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Task Deadline Extension Approvals</h3>
            <span className="text-[10px] font-bold text-blue-600 dark:text-blue-300">{pendingExtensionRequests.length} pending</span>
          </div>
          <div className="space-y-2">
            {pendingExtensionRequests.map((req: any) => (
              <div key={req.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  {req.entity_type === 'task' ? (req.task_title || 'Delegated task') : (req.goal_title || 'Goal')}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Requested by {req.requester_name || req.requester_user_name || 'Unknown'} • {req.current_due_date || 'N/A'} → {req.requested_due_date || 'N/A'}
                </p>
                {req.reason && <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">Reason: {req.reason}</p>}
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => decideExtensionRequest(Number(req.id), 'approve')}
                    disabled={extensionDecisionId === Number(req.id)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => decideExtensionRequest(Number(req.id), 'reject')}
                    disabled={extensionDecisionId === Number(req.id)}
                    className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-bold disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-4 flex items-start gap-3"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
            <Target className="text-blue-600" size={20} />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-800 dark:text-slate-100">{leaderGoals.length}</div>
            <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Total Goals</div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 }}
          className="glass-card p-4 flex items-start gap-3"
        >
          <div className="w-10 h-10 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center shrink-0">
            <Users className="text-teal-600" size={20} />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-800 dark:text-slate-100">{teamMembers.length}</div>
            <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Team Members</div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-4 flex items-start gap-3"
        >
          <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
            <Clock className="text-amber-600" size={20} />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-800 dark:text-slate-100">{inProgressGoals.length}</div>
            <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">In Progress</div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25 }}
          className="glass-card p-4 flex items-start gap-3"
        >
          <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
            <CheckCircle2 className="text-emerald-600" size={20} />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-800 dark:text-slate-100">{completedGoals.length}</div>
            <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Completed</div>
          </div>
        </motion.div>
      </div>

      {/* Overall Progress Bar */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Overall Team Progress</span>
          <span className="text-lg font-black text-slate-800 dark:text-slate-100">{overallProgress}%</span>
        </div>
        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-4 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${overallProgress}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
            className={`h-4 rounded-full ${getProgressColor(overallProgress)}`}
          />
        </div>
      </div>

      {/* Team Members Section */}
      {teamMembers.length > 0 && (
        <div className="glass-card p-4">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wide">Your Team</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {teamMembers.map((member, idx) => (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50"
              >
                {member.profile_picture ? (
                  <img src={member.profile_picture} alt={member.name} className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                    {member.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{member.name}</div>
                  <div className="text-[10px] text-slate-500 truncate">{member.position || 'No position'}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Goals Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Your Assigned Goals</h3>
          {atRiskGoals.length > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/30">
              <AlertCircle className="text-red-600" size={14} />
              <span className="text-[10px] font-bold text-red-600">{atRiskGoals.length} At Risk</span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="glass-card p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-300 border-t-blue-600"></div>
            <div className="mt-2 text-sm text-slate-500">Loading goals...</div>
          </div>
        ) : leaderGoals.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <Target className="mx-auto text-slate-300 dark:text-slate-700 mb-3" size={48} />
            <div className="text-sm font-bold text-slate-500">No goals assigned yet</div>
            <div className="text-xs text-slate-400 mt-1">You'll see goals here once a manager assigns you as team leader</div>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {leaderGoals.map((goal, idx) => (
                <motion.div
                  key={goal.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: idx * 0.05, duration: 0.3 }}
                  className="glass-card overflow-hidden"
                >
                  {/* Goal Header */}
                  <div
                    className="p-4 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors"
                    onClick={() => toggleGoalExpansion(goal.id)}
                  >
                    <div className="flex items-start gap-3">
                      <button className="mt-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                        {expandedGoals.has(goal.id) ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">
                              {goal.title || goal.statement}
                            </h4>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColors[goal.status as keyof typeof statusColors] || statusColors['Not Started']}`}>
                                {goal.status || 'Not Started'}
                              </span>
                              {goal.priority && (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${priorityColors[goal.priority as keyof typeof priorityColors] || priorityColors.Medium}`}>
                                  {goal.priority}
                                </span>
                              )}
                              {goal.frequency && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600">
                                  {goal.frequency}
                                </span>
                              )}
                              {goal.target_date && (
                                <span className="text-[10px] font-bold text-slate-500">
                                  Due: {goal.target_date}
                                </span>
                              )}
                            </div>
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedGoal(goal);
                              setShowSubtaskModal(true);
                            }}
                            className="shrink-0 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold uppercase tracking-wide transition-colors flex items-center gap-1.5"
                          >
                            <Plus size={14} />
                            Add Subtask
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleGoalExpansion(goal.id);
                            }}
                            className="shrink-0 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 text-[11px] font-bold uppercase tracking-wide transition-colors flex items-center gap-1.5"
                          >
                            <ImageIcon size={14} />
                            {expandedGoals.has(goal.id) ? 'Hide Proofs' : 'Review Proofs'}
                          </button>
                        </div>

                        <div className="mt-2 rounded-lg border border-blue-200 dark:border-blue-900/40 bg-blue-50/70 dark:bg-blue-900/20 p-2.5">
                          <p className="text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-300">Goal Deadline Extension (Manager Approval)</p>
                          <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
                            <input
                              type="date"
                              value={goalExtensionDrafts[goal.id]?.requested_due_date || ''}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setGoalExtensionDrafts(prev => ({
                                ...prev,
                                [goal.id]: {
                                  requested_due_date: e.target.value,
                                  reason: prev[goal.id]?.reason || '',
                                },
                              }))}
                              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                            />
                            <input
                              type="text"
                              value={goalExtensionDrafts[goal.id]?.reason || ''}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setGoalExtensionDrafts(prev => ({
                                ...prev,
                                [goal.id]: {
                                  requested_due_date: prev[goal.id]?.requested_due_date || '',
                                  reason: e.target.value,
                                },
                              }))}
                              placeholder="Reason for extending goal deadline"
                              className="md:col-span-2 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                            />
                          </div>
                          <div className="mt-2 flex justify-end">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                void submitGoalExtensionRequest(goal);
                              }}
                              disabled={goalExtensionSubmittingId === goal.id}
                              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[11px] font-bold disabled:opacity-50"
                            >
                              {goalExtensionSubmittingId === goal.id ? 'Requesting...' : 'Request Goal Deadline Extension'}
                            </button>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="flex items-center gap-3">
                          <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${goal.progress || 0}%` }}
                              transition={{ duration: 0.5 }}
                              className={`h-3 rounded-full ${getProgressColor(goal.progress || 0)}`}
                            />
                          </div>
                          <span className="text-xs font-black text-slate-600 dark:text-slate-400 min-w-11.25 text-right">
                            {goal.progress || 0}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  <AnimatePresence>
                    {expandedGoals.has(goal.id) && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-t border-slate-100 dark:border-slate-800"
                      >
                        <div className="p-4 space-y-4">
                          {/* Goal Details */}
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            {goal.statement && (
                              <div className="col-span-2">
                                <span className="font-bold text-slate-500 uppercase text-[10px] block mb-1">Statement</span>
                                <span className="text-slate-700 dark:text-slate-200">{goal.statement}</span>
                              </div>
                            )}
                            {goal.metric && (
                              <div>
                                <span className="font-bold text-slate-500 uppercase text-[10px] block mb-1">Metric</span>
                                <span className="text-slate-700 dark:text-slate-200">{goal.metric}</span>
                              </div>
                            )}
                            {goal.department && (
                              <div>
                                <span className="font-bold text-slate-500 uppercase text-[10px] block mb-1">Department</span>
                                <span className="text-slate-700 dark:text-slate-200">{goal.department}</span>
                              </div>
                            )}
                            {goal.team_name && (
                              <div>
                                <span className="font-bold text-slate-500 uppercase text-[10px] block mb-1">Team</span>
                                <span className="text-slate-700 dark:text-slate-200">{goal.team_name}</span>
                              </div>
                            )}
                            {goal.quarter && (
                              <div>
                                <span className="font-bold text-slate-500 uppercase text-[10px] block mb-1">Quarter</span>
                                <span className="text-slate-700 dark:text-slate-200">{goal.quarter}</span>
                              </div>
                            )}
                          </div>

                          {/* Assigned Team Members */}
                          {goal.assignees && goal.assignees.length > 0 && (
                            <div>
                              <h5 className="text-[10px] font-bold uppercase text-slate-500 mb-2 tracking-wider">
                                Assigned Team Members ({goal.assignees.length})
                              </h5>
                              <div className="space-y-2">
                                {goal.assignees.map((assignee) => (
                                  <div key={assignee.id} className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                                    <div className="w-8 h-8 rounded-full bg-linear-to-br from-teal-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                      {assignee.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-bold text-slate-700 dark:text-slate-200">{assignee.name}</div>
                                      <div className="text-[10px] text-slate-500">{assignee.position || 'No position'}</div>
                                    </div>
                                    {assignee.progress !== undefined && (
                                      <div className="flex items-center gap-2">
                                        <div className="w-20 bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                                          <div
                                            className={`h-2 rounded-full ${getProgressColor(assignee.progress)}`}
                                            style={{ width: `${assignee.progress}%` }}
                                          />
                                        </div>
                                        <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 min-w-8">
                                          {assignee.progress}%
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Subtasks */}
                          {goal.subtasks && goal.subtasks.length > 0 && (
                            <div>
                              <h5 className="text-[10px] font-bold uppercase text-slate-500 mb-2 tracking-wider">
                                Subtasks ({goal.subtasks.length})
                              </h5>
                              <div className="space-y-2">
                                {goal.subtasks.map((subtask) => (
                                  <div key={subtask.id} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border-l-2 border-blue-500">
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                                          {subtask.title || subtask.statement}
                                        </div>
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${statusColors[subtask.status as keyof typeof statusColors] || statusColors['Not Started']}`}>
                                          {subtask.status || 'Not Started'}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                                        <div
                                          className={`h-2 rounded-full ${getProgressColor(subtask.progress || 0)}`}
                                          style={{ width: `${subtask.progress || 0}%` }}
                                        />
                                      </div>
                                      <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">
                                        {subtask.progress || 0}%
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Delegated Member Tasks */}
                          <div>
                            <h5 className="text-[10px] font-bold uppercase text-slate-500 mb-2 tracking-wider">
                              Final Proof for Manager Review
                            </h5>
                            {(() => {
                              const goalProofFiles = parseGoalProofFiles(goal);
                              const draft = goalProofDrafts[goal.id] || { files: [], note: '' };
                              const goalProofStatus = String(goal.proof_review_status || 'Not Submitted');
                              const isSubmitting = goalProofSubmittingId === Number(goal.id);
                              const goalMemberTasks = Array.isArray(goal.member_tasks) ? goal.member_tasks : [];
                              const submittedMemberProofs = goalMemberTasks.filter((task: any) => String(task?.proof_image || '').trim().length > 0);
                              const allSubmittedMemberProofsApproved = submittedMemberProofs.length === 0 || submittedMemberProofs.every((task: any) => String(task?.proof_review_status || '').trim() === 'Approved');
                              return (
                                <div className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-900/10 space-y-2">
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                      <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Submit final project proof</p>
                                      <p className="text-[10px] text-slate-500">Manager review actions are applied to this final proof.</p>
                                    </div>
                                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${goalProofStatus === 'Approved' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : goalProofStatus === 'Pending Review' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : goalProofStatus === 'Needs Revision' || goalProofStatus === 'Rejected' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300'}`}>
                                      {goalProofStatus}
                                    </span>
                                  </div>

                                  {goalProofFiles.length > 0 && (
                                    <div className="space-y-2">
                                      <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Submitted final proof</p>
                                      {goalProofFiles.map((file, fileIndex) => (
                                        <div key={`${goal.id}-goal-proof-${fileIndex}`} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2">
                                          <p className="mb-1 text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate">{file.proof_file_name || `Final proof ${fileIndex + 1}`}</p>
                                          <ProofAttachment src={file.proof_file_data} fileName={file.proof_file_name} mimeType={file.proof_file_type} compact />
                                        </div>
                                      ))}
                                      {goal.proof_note && <p className="text-[10px] text-slate-600 dark:text-slate-300"><span className="font-bold">Note:</span> {goal.proof_note}</p>}
                                      {goal.proof_submitted_at && <p className="text-[10px] text-slate-500">Submitted: {new Date(goal.proof_submitted_at).toLocaleDateString()}</p>}
                                      {goal.proof_review_note && <p className="text-[10px] text-slate-500 italic">Manager note: {goal.proof_review_note}</p>}
                                    </div>
                                  )}

                                  <p className={`text-[10px] ${allSubmittedMemberProofsApproved ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                    {allSubmittedMemberProofsApproved
                                      ? 'Manager final-goal rating chooser is now eligible when final proof is reviewed.'
                                      : 'Manager final-goal rating chooser stays hidden until all submitted delegated proofs are approved.'}
                                  </p>

                                  <div className="space-y-2">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Add final proof files</label>
                                    <input
                                      type="file"
                                      multiple
                                      accept="*/*"
                                      onChange={(event) => {
                                        void handleGoalProofUpload(Number(goal.id), event.target.files);
                                        event.currentTarget.value = '';
                                      }}
                                      className="block w-full text-[11px] text-slate-600 dark:text-slate-300"
                                    />
                                    {draft.files.length > 0 && (
                                      <div className="space-y-2">
                                        {draft.files.map((file, fileIndex) => (
                                          <div key={`${goal.id}-goal-draft-${fileIndex}`} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2">
                                            <div className="flex items-start justify-between gap-2 mb-1">
                                              <p className="text-[10px] font-bold text-slate-700 dark:text-slate-200 truncate">{file.proof_file_name || `Draft file ${fileIndex + 1}`}</p>
                                              <button
                                                type="button"
                                                onClick={() => removeGoalProofDraftFile(Number(goal.id), fileIndex)}
                                                className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-300"
                                              >
                                                Remove
                                              </button>
                                            </div>
                                            <ProofAttachment src={file.proof_file_data} fileName={file.proof_file_name} mimeType={file.proof_file_type} compact />
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    <textarea
                                      rows={2}
                                      value={draft.note}
                                      onChange={(event) => setGoalProofDrafts((prev) => ({
                                        ...prev,
                                        [goal.id]: {
                                          files: prev[goal.id]?.files || [],
                                          note: event.target.value,
                                        },
                                      }))}
                                      className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]"
                                      placeholder="Final proof note (optional)"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => void submitGoalFinalProof(goal)}
                                      disabled={isSubmitting || draft.files.length === 0}
                                      className="text-[10px] font-bold px-3 py-1.5 rounded bg-teal-deep text-white hover:bg-teal-green disabled:opacity-50"
                                    >
                                      {isSubmitting ? 'Submitting...' : 'Submit Final Proof to Manager'}
                                    </button>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>

                          {Array.isArray(goal.member_tasks) && goal.member_tasks.length > 0 && (
                            <div>
                              <h5 className="text-[10px] font-bold uppercase text-slate-500 mb-2 tracking-wider">
                                Delegated Tasks Proof Review ({goal.member_tasks.length})
                              </h5>
                              <div className="space-y-2">
                                {goal.member_tasks.map((task: any) => {
                                  const reviewStatus = task.proof_review_status || 'Not Submitted';
                                  const taskProofHistory = parseProofRevisionHistory((task as any).proof_revision_history);
                                  const taskCurrentRevisionLabel = taskProofHistory.length > 0 ? `${ordinalLabel(taskProofHistory.length + 1)} revision` : 'Initial submission';
                                  return (
                                    <div key={task.id} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                                      <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div>
                                          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{task.title || 'Untitled Task'}</p>
                                          <p className="text-[10px] text-slate-500">Assignee: {task.member_name || `#${task.member_employee_id}`} • Due: {task.due_date || 'N/A'}</p>
                                        </div>
                                        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${reviewStatus === 'Approved' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : reviewStatus === 'Pending Review' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : reviewStatus === 'Needs Revision' || reviewStatus === 'Rejected' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300'}`}>
                                          {reviewStatus}
                                        </span>
                                      </div>

                                        <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-slate-500">
                                          <span className={`h-2 w-2 rounded-full ${reviewStatus === 'Approved' ? 'bg-emerald-500' : reviewStatus === 'Pending Review' ? 'bg-amber-500' : reviewStatus === 'Needs Revision' || reviewStatus === 'Rejected' ? 'bg-red-500' : 'bg-slate-300'}`} />
                                          {reviewStatus === 'Pending Review' ? 'Waiting for your review' : reviewStatus === 'Approved' ? 'Approved and reflected in progress' : reviewStatus === 'Needs Revision' ? 'Needs employee changes' : reviewStatus === 'Rejected' ? 'Rejected and returned' : 'No proof submitted yet'}
                                        </div>

                                      {task.proof_image ? (
                                        <div className="mt-2 max-w-xl">
                                          <ProofAttachment src={task.proof_image} fileName={task.proof_file_name} mimeType={task.proof_file_type} />
                                        </div>
                                      ) : (
                                        <div className="mt-2 text-[10px] text-slate-400 inline-flex items-center gap-1"><ImageIcon size={12} /> No proof uploaded yet</div>
                                      )}

                                      {task.proof_note && (
                                        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{task.proof_note}</p>
                                      )}

                                      {task.proof_review_note && (
                                        <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{reviewStatus === 'Needs Revision' ? 'Requested revision from leader' : 'Review note'}: {task.proof_review_note}</p>
                                      )}

                                      {task.proof_image && (
                                        <div className="mt-2 space-y-2">
                                          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-2 py-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                                            Current round: <span className="text-emerald-700 dark:text-emerald-300">{taskCurrentRevisionLabel}</span>
                                          </div>
                                          <textarea
                                            rows={2}
                                            value={proofReviewNotes[task.id] || ''}
                                            onChange={(event) => setProofReviewNotes((prev) => ({ ...prev, [task.id]: event.target.value }))}
                                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-[11px]"
                                            placeholder="Revision note or review feedback (optional)"
                                          />
                                          <div className="flex flex-wrap items-center gap-2">
                                            <input
                                              type="file"
                                              onChange={(event) => void handleProofReviewAttachmentChange(task.id, event.target.files?.[0] || null)}
                                              className="text-[10px] text-slate-500 dark:text-slate-400"
                                            />
                                            {proofReviewAttachments[task.id]?.file_name && (
                                              <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-55">
                                                Attached: {proofReviewAttachments[task.id]?.file_name}
                                              </span>
                                            )}
                                          </div>
                                          {taskProofHistory.length > 0 && (
                                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 space-y-2">
                                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Closed submission rounds</p>
                                              {taskProofHistory.map((entry, entryIndex) => (
                                                <div key={`leader-task-proof-history-${task.id}-${entryIndex}`} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-2 space-y-2">
                                                  <div className="flex items-center justify-between gap-2">
                                                    <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300">{entry.revision_label || `${ordinalLabel(Number(entry.revision_number || entryIndex + 1))} revision`}</p>
                                                    <span className="text-[10px] font-bold uppercase text-slate-500">Closed</span>
                                                  </div>
                                                  {(entry.proof_files || []).map((file: any, fileIndex: number) => (
                                                    <div key={`leader-task-proof-history-${task.id}-${entryIndex}-${fileIndex}`} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2">
                                                      <p className="mb-1 text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate">{file.proof_file_name || `Revision file ${fileIndex + 1}`}</p>
                                                      <ProofAttachment src={file.proof_file_data} fileName={file.proof_file_name} mimeType={file.proof_file_type} compact />
                                                    </div>
                                                  ))}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                          <div className="flex flex-wrap gap-2">
                                          <button onClick={() => reviewTaskProof(task.id, 'Approved')} className="text-[10px] font-bold px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">Approve</button>
                                          <button onClick={() => openNeedsRevisionModal(task)} className="text-[10px] font-bold px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">Needs Revision</button>
                                          <button onClick={() => reviewTaskProof(task.id, 'Rejected')} className="text-[10px] font-bold px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">Reject</button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <Modal
        open={needsRevisionModal.open}
        title={needsRevisionModal.taskTitle ? `Needs Revision - ${needsRevisionModal.taskTitle}` : 'Needs Revision'}
        onClose={closeNeedsRevisionModal}
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Specify what should be corrected before the employee resubmits proof.
          </p>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
              Revision Instructions <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={4}
              value={needsRevisionModal.note}
              onChange={(event) => setNeedsRevisionModal((prev) => ({ ...prev, note: event.target.value }))}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-sm"
              placeholder="Example: Upload the signed document and include before/after photos for this task."
              disabled={needsRevisionModal.submitting}
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
              Attachment (optional)
            </label>
            <input
              type="file"
              disabled={needsRevisionModal.submitting}
              onChange={async (event) => {
                const file = event.target.files?.[0] || null;
                if (!file) {
                  setNeedsRevisionModal((prev) => ({ ...prev, attachment: null }));
                  return;
                }
                try {
                  const fileData = await readFileAsDataUrl(file);
                  setNeedsRevisionModal((prev) => ({
                    ...prev,
                    attachment: {
                      file_data: fileData,
                      file_name: file.name,
                      file_type: file.type || 'application/octet-stream',
                    },
                  }));
                } catch {
                  window.notify?.('Failed to read review attachment', 'error');
                }
              }}
              className="text-[11px] text-slate-500 dark:text-slate-400"
            />
            {needsRevisionModal.attachment?.file_name && (
              <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Attached: {needsRevisionModal.attachment.file_name}</p>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={closeNeedsRevisionModal}
              disabled={needsRevisionModal.submitting}
              className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submitNeedsRevisionRequest()}
              disabled={needsRevisionModal.submitting}
              className="px-3 py-1.5 rounded bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 disabled:opacity-60"
            >
              {needsRevisionModal.submitting ? 'Sending...' : 'Send Revision Request'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Subtask Creation Modal */}
      <Modal
        open={showSubtaskModal}
        title={`Create Subtask for: ${selectedGoal?.title || selectedGoal?.statement || ''}`}
        onClose={() => {
          setShowSubtaskModal(false);
          setSubtaskForm({ title: '', statement: '', metric: '', target_date: '', assignee_id: '', priority: 'Medium' });
        }}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
              Subtask Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={subtaskForm.title}
              onChange={(e) => setSubtaskForm({ ...subtaskForm, title: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              placeholder="Enter subtask title..."
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
              Description
            </label>
            <textarea
              value={subtaskForm.statement}
              onChange={(e) => setSubtaskForm({ ...subtaskForm, statement: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm resize-none"
              rows={3}
              placeholder="Enter detailed description..."
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
              Success Metric
            </label>
            <input
              type="text"
              value={subtaskForm.metric}
              onChange={(e) => setSubtaskForm({ ...subtaskForm, metric: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              placeholder="How will success be measured?"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                Target Date
              </label>
              <input
                type="date"
                value={subtaskForm.target_date}
                onChange={(e) => setSubtaskForm({ ...subtaskForm, target_date: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                Priority
              </label>
              <select
                value={subtaskForm.priority}
                onChange={(e) => setSubtaskForm({ ...subtaskForm, priority: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
              Assign To <span className="text-red-500">*</span>
            </label>
            <select
              value={subtaskForm.assignee_id}
              onChange={(e) => setSubtaskForm({ ...subtaskForm, assignee_id: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            >
              <option value="">Select team member...</option>
              {teamMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} — {member.position || 'No position'}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleCreateSubtask}
              className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold uppercase tracking-wide transition-colors"
            >
              Create Subtask
            </button>
            <button
              onClick={() => {
                setShowSubtaskModal(false);
                setSubtaskForm({ title: '', statement: '', metric: '', target_date: '', assignee_id: '', priority: 'Medium' });
              }}
              className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-bold uppercase tracking-wide transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
};

export default TeamLeaderDashboard;
