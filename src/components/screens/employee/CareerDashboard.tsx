import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from '../../common/Card';
import { Modal } from '../../common/Modal';
import { SectionHeader } from '../../common/SectionHeader';
import { CircularProgress } from '../../common/CircularProgress';
import { ProofAttachment } from '../../common/ProofAttachment';
import { Target, TrendingUp, Award, BarChart3, AlertTriangle, DollarSign, Building2, Users, User, ClipboardList, CalendarDays, Flag, Trash2, Upload, Image as ImageIcon, CheckCircle2, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';
import { appConfirm } from '../../../utils/appDialog';
import { io } from 'socket.io-client';

const safeParseSession = (raw: string | null) => {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const normalizeArray = (value: any) => (Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []);

const uniqueById = (items: any[]) => {
  const seen = new Set<string>();
  return (Array.isArray(items) ? items : []).filter((item) => {
    const id = String(item?.id ?? '');
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

const uniqueTasksBySignature = (items: any[]) => {
  const seen = new Set<string>();
  const sorted = [...(Array.isArray(items) ? items : [])].sort((a: any, b: any) => {
    const aTime = Date.parse(String(a?.updated_at || a?.created_at || 0));
    const bTime = Date.parse(String(b?.updated_at || b?.created_at || 0));
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return bTime - aTime;
    return Number(b?.id || 0) - Number(a?.id || 0);
  });
  return sorted.filter((item: any) => {
    const id = String(item?.id ?? '').trim();
    const goalId = String(item?.goal_id ?? '').trim();
    const memberId = String(item?.member_employee_id ?? '').trim();
    const title = String(item?.title ?? '').trim().toLowerCase();
    const dueDate = String(item?.due_date ?? '').trim();
    const signature = `${goalId}|${memberId}|${title}|${dueDate}`;
    const key = signature !== '|||' ? signature : (id ? `id:${id}` : '');
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const isImageMime = (mimeType?: string, src?: string) => {
  const value = String(mimeType || '').toLowerCase();
  if (value.startsWith('image/')) return true;
  return String(src || '').toLowerCase().startsWith('data:image/');
};

const isPdfMime = (mimeType?: string, src?: string) => {
  const value = String(mimeType || '').toLowerCase();
  if (value === 'application/pdf') return true;
  return String(src || '').toLowerCase().startsWith('data:application/pdf');
};

const normalizeAttachmentSrc = (src?: string, mimeType?: string) => {
  const value = String(src || '').trim();
  if (!value) return '';

  const lower = value.toLowerCase();
  const hasScheme =
    lower.startsWith('data:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('file:') ||
    lower.startsWith('/');

  if (hasScheme) return value;

  const likelyBase64 = /^[a-z0-9+/=\s]+$/i.test(value) && value.length > 40;
  if (likelyBase64) {
    const contentType = String(mimeType || 'application/octet-stream').trim() || 'application/octet-stream';
    return `data:${contentType};base64,${value.replace(/\s+/g, '')}`;
  }

  return value;
};

type TaskBriefFile = {
  brief_file_data: string;
  brief_file_name: string;
  brief_file_type: string;
};

type TaskProofFile = {
  proof_file_data: string;
  proof_file_name: string;
  proof_file_type: string;
};

type GoalProofFile = {
  proof_file_data: string;
  proof_file_name: string;
  proof_file_type: string;
};

type ReviewAttachment = {
  file_data: string;
  file_name: string;
  file_type: string;
};

type ProofRevisionEntry = {
  revision_number?: number;
  revision_label?: string;
  proof_review_status?: string;
  proof_review_note?: string;
  proof_review_file_data?: string;
  proof_review_file_name?: string;
  proof_review_file_type?: string;
  proof_files?: TaskProofFile[] | GoalProofFile[];
  archived_at?: string;
};

const parseTaskBriefFiles = (task: any): TaskBriefFile[] => {
  const rawData = String(task?.brief_file_data || '').trim();
  const fallbackName = String(task?.brief_file_name || 'Task brief').trim();
  const fallbackType = String(task?.brief_file_type || 'application/octet-stream').trim();
  if (!rawData) return [];

  if (rawData.startsWith('[')) {
    try {
      const arr = JSON.parse(rawData);
      if (Array.isArray(arr)) {
        return arr
          .map((item: any) => ({
            brief_file_data: String(item?.brief_file_data || item?.data || '').trim(),
            brief_file_name: String(item?.brief_file_name || item?.name || 'Task brief').trim(),
            brief_file_type: String(item?.brief_file_type || item?.type || 'application/octet-stream').trim(),
          }))
          .filter((item: TaskBriefFile) => !!item.brief_file_data);
      }
    } catch {}
  }

  return [{
    brief_file_data: rawData,
    brief_file_name: fallbackName,
    brief_file_type: fallbackType,
  }];
};

const parseTaskProofFiles = (task: any): TaskProofFile[] => {
  const rawData = String(task?.proof_image || '').trim();
  const fallbackName = String(task?.proof_file_name || 'Submitted proof').trim();
  const fallbackType = String(task?.proof_file_type || 'application/octet-stream').trim();
  if (!rawData) return [];

  if (rawData.startsWith('[')) {
    try {
      const arr = JSON.parse(rawData);
      if (Array.isArray(arr)) {
        return arr
          .map((item: any) => ({
            proof_file_data: String(item?.proof_file_data || item?.data || '').trim(),
            proof_file_name: String(item?.proof_file_name || item?.name || 'Submitted proof').trim(),
            proof_file_type: String(item?.proof_file_type || item?.type || 'application/octet-stream').trim(),
          }))
          .filter((item: TaskProofFile) => !!item.proof_file_data);
      }
    } catch {}
  }

  return [{
    proof_file_data: rawData,
    proof_file_name: fallbackName,
    proof_file_type: fallbackType,
  }];
};

const parseGoalProofFiles = (goal: any): GoalProofFile[] => {
  const rawData = String(goal?.proof_image || '').trim();
  const fallbackName = String(goal?.proof_file_name || 'Final proof').trim();
  const fallbackType = String(goal?.proof_file_type || 'application/octet-stream').trim();
  if (!rawData) return [];

  if (rawData.startsWith('[')) {
    try {
      const arr = JSON.parse(rawData);
      if (Array.isArray(arr)) {
        return arr
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

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(String(e.target?.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

export const CareerDashboard = () => {
  const [appraisals, setAppraisals] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [pips, setPips] = useState<any[]>([]);
  const [idps, setIdps] = useState<any[]>([]);
  const [goalDetailsOpenId, setGoalDetailsOpenId] = useState<number | null>(null);
  const [selfAssessments, setSelfAssessments] = useState<any[]>([]);
  const [salary, setSalary] = useState<number | null>(null);
  const [leaderGoals, setLeaderGoals] = useState<any[]>([]);
  const [leaderTeamMembers, setLeaderTeamMembers] = useState<any[]>([]);
  const [dashboardTab, setDashboardTab] = useState<'overview' | 'goals' | 'leaderGoals' | 'pips' | 'idps'>('overview');
  const [goalsSearch, setGoalsSearch] = useState('');
  const [delegatedTasksSearch, setDelegatedTasksSearch] = useState('');
  const [leaderGoalsSearch, setLeaderGoalsSearch] = useState('');
  const [leaderGoalOpenId, setLeaderGoalOpenId] = useState<number | null>(null);
  const [taskAssignmentOpenGoalId, setTaskAssignmentOpenGoalId] = useState<number | null>(null);
  const [taskBoardOpenGoalId, setTaskBoardOpenGoalId] = useState<number | null>(null);
  const [taskDrafts, setTaskDrafts] = useState<Record<number, any>>({});
  const [taskBriefDrafts, setTaskBriefDrafts] = useState<Record<number, TaskBriefFile[]>>({});
  const [taskReviewNotes, setTaskReviewNotes] = useState<Record<number, string>>({});
  const [taskReviewAttachments, setTaskReviewAttachments] = useState<Record<number, ReviewAttachment | null>>({});
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
  const [proofViewerTaskId, setProofViewerTaskId] = useState<number | null>(null);
  const [taskBriefViewer, setTaskBriefViewer] = useState<{ src: string; fileName?: string; mimeType?: string } | null>(null);
  const [delegatedTaskOpenId, setDelegatedTaskOpenId] = useState<number | null>(null);
  const [extensionTaskOpenId, setExtensionTaskOpenId] = useState<number | null>(null);
  const [taskSavingGoal, setTaskSavingGoal] = useState<number | null>(null);
  const [taskReviewActionOpen, setTaskReviewActionOpen] = useState<Record<number, boolean>>({});
  const [myMemberTasks, setMyMemberTasks] = useState<any[]>([]);
  const [myDeadlineExtensionRequests, setMyDeadlineExtensionRequests] = useState<any[]>([]);
  const [taskExtensionDrafts, setTaskExtensionDrafts] = useState<Record<number, { requested_due_date: string; reason: string }>>({});
  const [taskExtensionSubmittingId, setTaskExtensionSubmittingId] = useState<number | null>(null);
  const [proofDrafts, setProofDrafts] = useState<Record<number, { proof_files: TaskProofFile[]; proof_note: string }>>({});
  const [proofSubmittingTaskId, setProofSubmittingTaskId] = useState<number | null>(null);
  const [goalProofDrafts, setGoalProofDrafts] = useState<Record<number, { files: GoalProofFile[]; note: string }>>({});
  const [goalProofSubmittingId, setGoalProofSubmittingId] = useState<number | null>(null);
  const localUser = safeParseSession(localStorage.getItem('talentflow_user') || localStorage.getItem('user'));

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      void fetchData();
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('talentflow_token');
    if (!token) return;

    const socket = io({ path: '/socket.io', autoConnect: true, auth: { token } });
    socket.on('connect', () => { try { socket.emit('auth', { token }); } catch {} });

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    socket.on('goals:updated', () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void fetchData();
      }, 250);
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    setTaskDrafts(prev => {
      const next = { ...prev };
      for (const g of leaderGoals) {
        if (!next[g.id]) {
          next[g.id] = { member_id: '', title: '', description: '', due_date: '', priority: 'Medium' };
        }
      }
      return next;
    });
  }, [leaderGoals]);

  useEffect(() => {
    setTaskBriefDrafts(prev => {
      const next = { ...prev };
      for (const g of leaderGoals) {
        if (!next[g.id]) {
          next[g.id] = [];
        }
      }
      return next;
    });
  }, [leaderGoals]);

  useEffect(() => {
    setProofDrafts(prev => {
      const next = { ...prev };
      for (const t of myMemberTasks) {
        if (!next[t.id]) {
          next[t.id] = {
            proof_files: parseTaskProofFiles(t),
            proof_note: t.proof_note || '',
          };
        }
      }
      return next;
    });
  }, [myMemberTasks]);

  useEffect(() => {
    setTaskExtensionDrafts(prev => {
      const next = { ...prev };
      for (const t of myMemberTasks) {
        if (!next[t.id]) {
          next[t.id] = { requested_due_date: '', reason: '' };
        }
      }
      return next;
    });
  }, [myMemberTasks]);

  useEffect(() => {
    setGoalProofDrafts(prev => {
      const next = { ...prev };
      for (const g of leaderGoals) {
        if (!next[g.id]) {
          next[g.id] = { files: [], note: '' };
        }
      }
      return next;
    });
  }, [leaderGoals]);

  const fetchData = async () => {
    let account: any = {};
    try {
      const accountRes = await fetch('/api/account-info', { headers: getAuthHeaders() });
      account = accountRes.ok ? await accountRes.json() : {};
    } catch {
      account = {};
    }

    const employeeId = Number(account?.employee_id || localUser?.employee_id || localUser?.id || 0) || null;

    try {
      const r = await fetch('/api/goals', { headers: getAuthHeaders() });
      const d = await r.json();
      setGoals(normalizeArray(d));
    } catch {
      setGoals([]);
    }

    try {
      const r = await fetch('/api/leader-goals', { headers: getAuthHeaders() });
      const d = await r.json();
      const dedupedGoals = uniqueById(normalizeArray(d?.goals)).map((goal: any) => ({
        ...goal,
        assignees: uniqueById(normalizeArray(goal?.assignees)),
        member_tasks: uniqueTasksBySignature(uniqueById(normalizeArray(goal?.member_tasks))),
      }));
      setLeaderGoals(dedupedGoals);
      setLeaderTeamMembers(normalizeArray(d?.teamMembers));
    } catch {
      setLeaderGoals([]);
      setLeaderTeamMembers([]);
    }

    try {
      const r = await fetch('/api/appraisals', { headers: getAuthHeaders() });
      const d = await r.json();
      setAppraisals(normalizeArray(d).filter((a: any) => !employeeId || Number(a.employee_id) === employeeId));
    } catch {
      setAppraisals([]);
    }

    try {
      const r = await fetch('/api/pip_plans', { headers: getAuthHeaders() });
      const d = await r.json();
      setPips(normalizeArray(d).filter((p: any) => !employeeId || Number(p.employee_id) === employeeId));
    } catch {
      setPips([]);
    }

    try {
      const r = await fetch('/api/development_plans', { headers: getAuthHeaders() });
      const d = await r.json();
      setIdps(normalizeArray(d).filter((p: any) => !employeeId || Number(p.employee_id) === employeeId));
    } catch {
      setIdps([]);
    }

    try {
      const r = await fetch('/api/self_assessments', { headers: getAuthHeaders() });
      const d = await r.json();
      setSelfAssessments(normalizeArray(d).filter((s: any) => !employeeId || Number(s.employee_id) === employeeId));
    } catch {
      setSelfAssessments([]);
    }

    if (employeeId) {
      const employee = goals.find((g: any) => Number(g?.employee_id) === Number(employeeId));
      setSalary(employee && Number.isFinite(Number(employee?.salary_base)) ? Number(employee.salary_base) : null);
    } else {
      setSalary(null);
    }

    try {
      const r = await fetch('/api/member-tasks/my', { headers: getAuthHeaders() });
      const d = await r.json();
      setMyMemberTasks(uniqueTasksBySignature(uniqueById(normalizeArray(d))));
    } catch {
      setMyMemberTasks([]);
    }

    try {
      const r = await fetch('/api/deadline-extension-requests/mine', { headers: getAuthHeaders() });
      const d = await r.json();
      setMyDeadlineExtensionRequests(normalizeArray(d));
    } catch {
      setMyDeadlineExtensionRequests([]);
    }
  };

  const updateTaskExtensionDraft = (taskId: number, patch: Partial<{ requested_due_date: string; reason: string }>) => {
    setTaskExtensionDrafts(prev => ({
      ...prev,
      [taskId]: {
        requested_due_date: '',
        reason: '',
        ...(prev[taskId] || {}),
        ...patch,
      },
    }));
  };

  const submitTaskExtensionRequest = async (task: any) => {
    const taskId = Number(task?.id || 0);
    if (!taskId) return;
    const draft = taskExtensionDrafts[taskId] || { requested_due_date: '', reason: '' };
    const requestedDueDate = String(draft.requested_due_date || '').trim();
    const reason = String(draft.reason || '').trim();
    if (!requestedDueDate) { window.notify?.('Please set a requested due date', 'error'); return; }
    if (!reason) { window.notify?.('Please provide a reason for extension', 'error'); return; }
    if (!(await appConfirm('Send this deadline extension request to your team leader?', { title: 'Request Extension', confirmText: 'Send Request', icon: 'warning' }))) return;

    setTaskExtensionSubmittingId(taskId);
    try {
      const res = await fetch('/api/deadline-extension-requests', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          entity_type: 'task',
          task_id: taskId,
          requested_due_date: requestedDueDate,
          reason,
        }),
      });
      if (!res.ok) {
        let msg = 'Failed to submit extension request';
        try {
          const err = await res.json();
          if (err?.error) msg = String(err.error);
        } catch {}
        throw new Error(msg);
      }
      window.notify?.('Extension request sent to your team leader', 'success');
      setTaskExtensionDrafts(prev => ({ ...prev, [taskId]: { requested_due_date: '', reason: '' } }));
      await fetchData();
    } catch (e: any) {
      window.notify?.(e?.message || 'Failed to submit extension request', 'error');
    } finally {
      setTaskExtensionSubmittingId(null);
    }
  };

  const handleTaskDraftChange = (goalId: number, patch: Record<string, any>) => {
    setTaskDrafts(prev => ({
      ...prev,
      [goalId]: {
        member_id: '',
        title: '',
        description: '',
        due_date: '',
        priority: 'Medium',
        ...(prev[goalId] || {}),
        ...patch,
      },
    }));
  };

  const handleTaskBriefUpload = async (goalId: number, files?: FileList | File[]) => {
    const selected = Array.from(files || []);
    if (!selected.length) return;

    const validFiles = selected.filter((file) => {
      const isAllowed = file.type === 'application/pdf' || file.type === 'image/png' || file.name.toLowerCase().endsWith('.pdf') || file.name.toLowerCase().endsWith('.png');
      return isAllowed;
    });

    if (!validFiles.length) {
      window.notify?.('Please upload PDF or PNG files only', 'error');
      return;
    }

    if (validFiles.length !== selected.length) {
      window.notify?.('Some files were skipped. Only PDF and PNG are supported.', 'error');
    }

    try {
      const converted = await Promise.all(validFiles.map(async (file) => ({
        brief_file_data: await readFileAsDataUrl(file),
        brief_file_name: file.name,
        brief_file_type: file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png'),
      })));

      setTaskBriefDrafts(prev => ({
        ...prev,
        [goalId]: [
          ...((prev[goalId] || []).filter((f) => !!f.brief_file_data)),
          ...converted,
        ],
      }));
    } catch {
      window.notify?.('Failed to read selected brief files', 'error');
    }
  };

  const clearTaskBriefDraft = (goalId: number) => {
    setTaskBriefDrafts(prev => ({
      ...prev,
      [goalId]: [],
    }));
  };

  const removeTaskBriefDraftFile = (goalId: number, index: number) => {
    setTaskBriefDrafts(prev => ({
      ...prev,
      [goalId]: (prev[goalId] || []).filter((_, i) => i !== index),
    }));
  };

  const handleCreateLeaderTask = async (goalId: number) => {
    const draft = taskDrafts[goalId] || {};
    const briefDraft = taskBriefDrafts[goalId] || [];
    const firstBrief = briefDraft[0] || { brief_file_data: '', brief_file_name: '', brief_file_type: '' };
    const memberId = Number(draft.member_id);
    const title = String(draft.title || '').trim();
    const description = String(draft.description || '').trim();
    const dueDate = String(draft.due_date || '').trim();
    const priority = String(draft.priority || 'Medium');

    if (!memberId) { window.notify?.('Select a member for this task', 'error'); return; }
    if (!title) { window.notify?.('Please enter a task title', 'error'); return; }
    if (!dueDate) { window.notify?.('Please set a deadline', 'error'); return; }
    if (!(await appConfirm('Assign this task now?', { title: 'Assign Task', confirmText: 'Assign', icon: 'success' }))) return;

    setTaskSavingGoal(goalId);
    try {
      const res = await fetch(`/api/goals/${goalId}/member-tasks`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          member_employee_id: memberId,
          title,
          description,
          due_date: dueDate,
          priority,
          brief_files: briefDraft,
          brief_file_data: String(firstBrief.brief_file_data || ''),
          brief_file_name: String(firstBrief.brief_file_name || ''),
          brief_file_type: String(firstBrief.brief_file_type || ''),
        }),
      });
      if (!res.ok) {
        let msg = 'Failed to assign task';
        try { const err = await res.json(); msg = err.error || msg; } catch {}
        throw new Error(msg);
      }
      window.notify?.('Detailed task assigned', 'success');
      setTaskDrafts(prev => ({ ...prev, [goalId]: { member_id: '', title: '', description: '', due_date: '', priority: 'Medium' } }));
      setTaskBriefDrafts(prev => ({ ...prev, [goalId]: [] }));
      setTaskAssignmentOpenGoalId(null);
      await fetchData();
    } catch (e: any) {
      window.notify?.(e?.message || 'Failed to assign task', 'error');
    } finally {
      setTaskSavingGoal(null);
    }
  };

  const handleProofDraftChange = (
    taskId: number,
    patch: Partial<{ proof_files: TaskProofFile[]; proof_note: string }>
  ) => {
    setProofDrafts(prev => ({
      ...prev,
      [taskId]: {
        proof_files: [],
        proof_note: '',
        ...(prev[taskId] || {}),
        ...patch,
      },
    }));
  };

  const handleProofImageUpload = async (taskId: number, files?: FileList | File[]) => {
    const selected = Array.from(files || []);
    if (!selected.length) return;

    const validFiles = selected.filter((file) => file.type === 'application/pdf' || file.type === 'image/png' || file.name.toLowerCase().endsWith('.pdf') || file.name.toLowerCase().endsWith('.png'));
    if (!validFiles.length) {
      window.notify?.('Please upload PDF or PNG files only', 'error');
      return;
    }
    if (validFiles.length !== selected.length) {
      window.notify?.('Some files were skipped. Only PDF and PNG are supported.', 'error');
    }

    try {
      const uploadedFiles = await Promise.all(validFiles.map(async (file) => ({
        proof_file_data: await readFileAsDataUrl(file),
        proof_file_name: file.name,
        proof_file_type: file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png'),
      })));

      setProofDrafts(prev => {
        const current = prev[taskId] || { proof_files: [], proof_note: '' };
        return {
          ...prev,
          [taskId]: {
            ...current,
            proof_files: [
              ...(current.proof_files || []),
              ...uploadedFiles,
            ],
          },
        };
      });
    } catch {
      window.notify?.('Failed to read selected proof files', 'error');
    }
  };

  const removeProofAttachmentDraft = async (taskId: number) => {
    const confirmed = await appConfirm('Remove the attached proof file from this draft?', {
      title: 'Remove Proof File',
      confirmText: 'Remove',
      icon: 'warning',
    });
    if (!confirmed) return;

    handleProofDraftChange(taskId, { proof_files: [] });
  };

  const removeProofAttachmentDraftFile = (taskId: number, index: number) => {
    setProofDrafts(prev => {
      const current = prev[taskId] || { proof_files: [], proof_note: '' };
      return {
        ...prev,
        [taskId]: {
          ...current,
          proof_files: (current.proof_files || []).filter((_, i) => i !== index),
        },
      };
    });
  };

  const submitTaskProof = async (taskId: number) => {
    const currentTask = myMemberTasks.find((t: any) => Number(t?.id) === Number(taskId)) || null;
    const currentReviewStatus = String(currentTask?.proof_review_status || 'Not Submitted');
    const currentProofFiles = parseTaskProofFiles(currentTask);
    if (currentReviewStatus === 'Pending Review' && currentProofFiles.length > 0) {
      window.notify?.('Proof already submitted and pending review', 'success');
      return;
    }

    const draft = proofDrafts[taskId] || {
      proof_files: [],
      proof_note: '',
    };
    const proofFiles = Array.isArray(draft.proof_files) ? draft.proof_files : [];
    const proofNote = String(draft.proof_note || '').trim();
    if (!proofFiles.length) { window.notify?.('Please attach at least one proof file first', 'error'); return; }
    if (!(await appConfirm('Submit this proof for review now?', { title: 'Submit Proof', confirmText: 'Submit', icon: 'success' }))) return;

    const firstProof = proofFiles[0];

    setProofSubmittingTaskId(taskId);
    try {
      const res = await fetch(`/api/member-tasks/${taskId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          proof_files: proofFiles,
          proof_image: JSON.stringify(proofFiles),
          proof_file_name: String(firstProof.proof_file_name || ''),
          proof_file_type: String(firstProof.proof_file_type || 'application/octet-stream'),
          proof_note: proofNote,
        }),
      });
      if (!res.ok) {
        let msg = 'Failed to submit proof';
        try {
          const err = await res.json();
          if (err?.error) msg = String(err.error);
        } catch {}
        throw new Error(msg);
      }
      window.notify?.('Proof submitted for review', 'success');
      await fetchData();
    } catch (e: any) {
      window.notify?.(e?.message || 'Failed to submit proof', 'error');
    } finally {
      setProofSubmittingTaskId(null);
    }
  };

  const handleGoalProofUpload = async (goalId: number, files?: FileList | File[]) => {
    const selected = Array.from(files || []);
    if (!selected.length) return;

    try {
      const uploadedFiles = await Promise.all(selected.map(async (file) => ({
        proof_file_data: await readFileAsDataUrl(file),
        proof_file_name: file.name,
        proof_file_type: file.type || 'application/octet-stream',
      })));

      setGoalProofDrafts(prev => {
        const current = prev[goalId] || { files: [], note: '' };
        return {
          ...prev,
          [goalId]: {
            ...current,
            files: [...(current.files || []), ...uploadedFiles],
          },
        };
      });
    } catch {
      window.notify?.('Failed to read selected final proof files', 'error');
    }
  };

  const removeGoalProofDraftFile = (goalId: number, index: number) => {
    setGoalProofDrafts(prev => {
      const current = prev[goalId] || { files: [], note: '' };
      return {
        ...prev,
        [goalId]: {
          ...current,
          files: (current.files || []).filter((_, i) => i !== index),
        },
      };
    });
  };

  const submitGoalFinalProof = async (goal: any) => {
    const goalId = Number(goal?.id || 0);
    if (!goalId) return;

    const goalProofStatus = String(goal?.proof_review_status || 'Not Submitted');
    const canEditFinalProof = goalProofStatus === 'Not Submitted' || goalProofStatus === 'Needs Revision';
    if (!canEditFinalProof) {
      window.notify?.('Final proof can only be edited when status is Not Submitted or Needs Revision', 'error');
      return;
    }

    const draft = goalProofDrafts[goalId] || { files: [], note: '' };
    const files = Array.isArray(draft.files) ? draft.files : [];
    const note = String(draft.note || '').trim();
    if (!files.length) {
      window.notify?.('Please attach at least one final proof file', 'error');
      return;
    }
    if (!(await appConfirm('Submit this final proof to your manager for review?', { title: 'Submit Final Proof', confirmText: 'Submit', icon: 'success' }))) return;

    setGoalProofSubmittingId(goalId);
    try {
      const res = await fetch(`/api/goals/${goalId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          proof_files: files,
          proof_image: JSON.stringify(files),
          proof_file_name: String(files[0]?.proof_file_name || ''),
          proof_file_type: String(files[0]?.proof_file_type || 'application/octet-stream'),
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

      window.notify?.('Final proof submitted to manager', 'success');
      setGoalProofDrafts(prev => ({
        ...prev,
        [goalId]: { files: [], note: '' },
      }));
      await fetchData();
    } catch (e: any) {
      window.notify?.(e?.message || 'Failed to submit final proof', 'error');
    } finally {
      setGoalProofSubmittingId(null);
    }
  };
  const handleUpdateLeaderTask = async (
    taskId: number,
    updates: Record<string, any>,
    successMessage = 'Task updated',
    confirmMessage?: string
  ) => {
    if (confirmMessage) {
      const confirmed = await appConfirm(confirmMessage, { title: 'Confirm Update', confirmText: 'Confirm', icon: 'warning' });
      if (!confirmed) return;
    }

    const actorRole = String(localUser?.role || '').trim().toLowerCase();
    const isManagerActor = actorRole === 'manager' || actorRole === 'hr' || actorRole === 'admin';
    const applyReviewOutcomeLocally = (task: any) => {
      const reviewStatus = String(updates?.proof_review_status || '');
      if (reviewStatus === 'Approved') {
        return {
          ...task,
          ...updates,
          status: isManagerActor ? 'Completed' : 'In Progress',
          progress: isManagerActor ? 100 : Math.max(75, Math.min(100, Number(task?.progress || 0))),
          tl_review_locked: !isManagerActor ? 1 : Number(task?.tl_review_locked || 0),
        };
      }
      if (reviewStatus === 'Needs Revision') {
        const currentProgress = Math.max(0, Math.min(100, Number(task?.progress || 0)));
        return { ...task, ...updates, status: 'In Progress', progress: currentProgress >= 75 ? 75 : Math.max(currentProgress, 50) };
      }
      if (reviewStatus === 'Rejected') {
        const currentProgress = Math.max(0, Math.min(100, Number(task?.progress || 0)));
        return { ...task, ...updates, status: 'Blocked', progress: Math.min(currentProgress, 50) };
      }
      return { ...task, ...updates };
    };

    try {
      const res = await fetch(`/api/member-tasks/${taskId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(updates)
      });
      if (!res.ok) {
        let msg = 'Failed to update task';
        try {
          const err = await res.json();
          if (err?.error) msg = String(err.error);
        } catch {}
        throw new Error(msg);
      }

      setLeaderGoals(prev => prev.map((goal: any) => ({
        ...goal,
        member_tasks: Array.isArray(goal?.member_tasks)
          ? goal.member_tasks.map((task: any) => (Number(task?.id) === Number(taskId) ? applyReviewOutcomeLocally(task) : task))
          : goal.member_tasks,
      })));

      window.notify?.(successMessage, 'success');
      fetchData();
    } catch (e: any) {
      window.notify?.(e?.message || 'Failed to update task', 'error');
    }
  };

  const openNeedsRevisionModal = (task: any, currentNote?: string) => {
    const taskId = Number(task?.id || 0);
    if (!taskId) return;
    const existingAttachment = taskReviewAttachments[taskId]
      || (String(task?.proof_review_file_data || '').trim()
        ? {
            file_data: String(task?.proof_review_file_data || '').trim(),
            file_name: String(task?.proof_review_file_name || '').trim() || 'Revision attachment',
            file_type: String(task?.proof_review_file_type || '').trim() || 'application/octet-stream',
          }
        : null);

    setNeedsRevisionModal({
      open: true,
      taskId,
      taskTitle: String(task?.title || '').trim() || `Task #${taskId}`,
      note: String(currentNote ?? taskReviewNotes[taskId] ?? task?.proof_review_note ?? '').trim(),
      attachment: existingAttachment,
      submitting: false,
    });
  };

  const closeNeedsRevisionModal = () => {
    setNeedsRevisionModal((prev) => ({ ...prev, open: false, submitting: false }));
  };

  const submitNeedsRevisionModal = async () => {
    const taskId = Number(needsRevisionModal.taskId || 0);
    const note = String(needsRevisionModal.note || '').trim();
    if (!taskId) return;
    if (!note) {
      window.notify?.('Please add revision instructions before sending', 'error');
      return;
    }

    setNeedsRevisionModal((prev) => ({ ...prev, submitting: true }));
    const attachment = needsRevisionModal.attachment;
    try {
      setTaskReviewNotes((prev) => ({ ...prev, [taskId]: note }));
      setTaskReviewAttachments((prev) => ({ ...prev, [taskId]: attachment || null }));
      await handleUpdateLeaderTask(
        taskId,
        {
          proof_review_status: 'Needs Revision',
          proof_review_note: note,
          proof_review_file_data: attachment?.file_data || null,
          proof_review_file_name: attachment?.file_name || null,
          proof_review_file_type: attachment?.file_type || null,
        },
        'Revision requested'
      );
      closeNeedsRevisionModal();
    } finally {
      setNeedsRevisionModal((prev) => ({ ...prev, submitting: false }));
    }
  };

  const handleDeleteLeaderTask = async (taskId: number) => {
    const confirmed = await appConfirm('Remove this task from the board?', { title: 'Remove Task', confirmText: 'Remove', icon: 'warning' });
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/member-tasks/${taskId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (!res.ok && res.status !== 404) throw new Error('Failed');

      setLeaderGoals(prev => prev.map((goal: any) => ({
        ...goal,
        member_tasks: Array.isArray(goal?.member_tasks)
          ? goal.member_tasks.filter((task: any) => Number(task?.id) !== Number(taskId))
          : goal.member_tasks,
      })));

      window.notify?.('Task removed', 'success');
      try {
        await fetchData();
      } catch {
        // Keep the success state if the refresh fails after a successful delete.
      }
    } catch {
      window.notify?.('Failed to remove task', 'error');
    }
  };

  // Performance trend from appraisals
  const performanceTrend = appraisals
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((a, i) => ({
      period: `Review ${i + 1}`,
      score: a.overall_rating || a.rating || ((a.job_knowledge || 0) + (a.productivity || 0) + (a.communication || 0) + (a.dependability || 0) + (a.attendance || 0)) / 5
    }));

  // Latest appraisal radar
  const latest = appraisals[appraisals.length - 1];
  const radarData = latest ? [
    { subject: 'Job Knowledge', value: latest.job_knowledge || 0 },
    { subject: 'Productivity', value: latest.productivity || 0 },
    { subject: 'Attendance', value: latest.attendance || 0 },
    { subject: 'Communication', value: latest.communication || 0 },
    { subject: 'Dependability', value: latest.dependability || 0 },
  ] : [];

  // Goals summary
  const totalGoals = goals.length;
  const completedGoals = goals.filter(g => g.status === 'Completed').length;
  const inProgressGoals = goals.filter(g => g.status === 'In Progress').length;
  const goalPie = [
    { name: 'Completed', value: completedGoals },
    { name: 'In Progress', value: inProgressGoals },
    { name: 'Not Started', value: totalGoals - completedGoals - inProgressGoals },
  ].filter(g => g.value > 0);
  const GOAL_COLORS = ['#10b981', '#f59e0b', '#94a3b8'];

  // Scope breakdown for hero cards
  const scopeBreakdown = useMemo(() => {
    const scopes = ['Department', 'Team', 'Individual'] as const;
    return scopes.map(scope => {
      const scopeGoals = goals.filter(g => (g.scope || 'Individual') === scope);
      const total = scopeGoals.length;
      const completed = scopeGoals.filter(g => g.status === 'Completed').length;
      const inProgress = scopeGoals.filter(g => g.status === 'In Progress').length;
      const atRisk = scopeGoals.filter(g => g.status === 'At Risk').length;
      const avgProgress = total > 0
        ? Math.round(scopeGoals.reduce((s, g) => s + (g.progress || 0), 0) / total)
        : 0;
      return { scope, total, completed, inProgress, atRisk, avgProgress };
    });
  }, [goals]);

  const scopeStyleMap: Record<string, { iconBg: string; text: string; badgeBg: string }> = {
    Department: { iconBg: 'bg-teal-600/15 dark:bg-teal-500/15', text: 'text-teal-600 dark:text-teal-400', badgeBg: 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400' },
    Team: { iconBg: 'bg-blue-500/15 dark:bg-blue-400/15', text: 'text-blue-600 dark:text-blue-400', badgeBg: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' },
    Individual: { iconBg: 'bg-indigo-500/15 dark:bg-indigo-400/15', text: 'text-indigo-600 dark:text-indigo-400', badgeBg: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400' },
  };

  const statusColors: Record<string, string> = {
    'Not Started': 'text-slate-400 bg-slate-100 dark:bg-slate-800',
    'In Progress': 'text-amber-600 bg-amber-100 dark:bg-amber-900/30',
    'At Risk': 'text-red-600 bg-red-100 dark:bg-red-900/30',
    'Blocked': 'text-red-600 bg-red-100 dark:bg-red-900/30',
    'Completed': 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30',
  };

  const progressBarColor = (p: number) => {
    if (p >= 100) return 'bg-emerald-500';
    if (p >= 50) return 'bg-teal-500';
    if (p >= 25) return 'bg-amber-500';
    return 'bg-red-400';
  };

  const memberNameById = useMemo(() => {
    const map: Record<string, string> = {};

    for (const m of leaderTeamMembers) {
      const id = String(m?.member_id ?? '').trim();
      const name = String(m?.member_name || '').trim();
      if (id && name) map[id] = name;
    }

    for (const g of leaderGoals) {
      const assignees = Array.isArray(g?.assignees) ? g.assignees : [];
      for (const a of assignees) {
        const id = String(a?.employee_id ?? '').trim();
        const name = String(a?.name || a?.employee_name || a?.member_name || '').trim();
        if (id && name && !map[id]) map[id] = name;
      }
    }

    return map;
  }, [leaderGoals, leaderTeamMembers]);

  const getMemberDisplayName = (member: any, explicitId?: any) => {
    const directName = String(member?.member_name || member?.employee_name || member?.name || '').trim();
    if (directName) return directName;
    const memberId = String(member?.member_id ?? member?.member_employee_id ?? member?.employee_id ?? explicitId ?? '').trim();
    if (memberId && memberNameById[memberId]) return memberNameById[memberId];
    return 'Unnamed team member';
  };

  const leaderTeamMemberIdSet = useMemo(() => {
    const ids = new Set<string>();
    for (const m of leaderTeamMembers) {
      const id = String(m?.member_id ?? '').trim();
      if (id) ids.add(id);
    }
    return ids;
  }, [leaderTeamMembers]);

  const allLeaderTasks = useMemo(() => {
    const tasks: any[] = [];
    for (const g of leaderGoals) {
      const gTasks = uniqueTasksBySignature(Array.isArray(g?.member_tasks) ? g.member_tasks : []);
      for (const t of gTasks) tasks.push(t);
    }
    return tasks;
  }, [leaderGoals]);

  const leaderGoalsVisible = useMemo(() => {
    const q = leaderGoalsSearch.trim().toLowerCase();
    const goalsList = uniqueById(leaderGoals).map((goal: any) => ({
      ...goal,
      assignees: uniqueById(normalizeArray(goal?.assignees)),
      member_tasks: uniqueTasksBySignature(uniqueById(normalizeArray(goal?.member_tasks))),
    }));

    if (!q) return goalsList;

    return goalsList.filter((goal: any) => {
      const assigneeNames = (Array.isArray(goal?.assignees) ? goal.assignees : []).map((a: any) => getMemberDisplayName(a)).join(' ');
      const taskTitles = (Array.isArray(goal?.member_tasks) ? goal.member_tasks : []).map((t: any) => String(t?.title || '')).join(' ');
      return [goal.title, goal.statement, goal.department, goal.team_name, goal.delegation, assigneeNames, taskTitles]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [leaderGoals, leaderGoalsSearch, getMemberDisplayName]);

  const proofViewerTask = useMemo(() => {
    if (!proofViewerTaskId) return null;
    return allLeaderTasks.find((t: any) => Number(t?.id) === proofViewerTaskId) || null;
  }, [allLeaderTasks, proofViewerTaskId]);

  const visibleGoals = useMemo(() => {
    const q = goalsSearch.trim().toLowerCase();
    if (!q) return goals;
    return goals.filter((g: any) => {
      return [
        g?.title,
        g?.statement,
        g?.scope,
        g?.target_date,
        g?.frequency,
        g?.status,
        g?.delegation,
        String(g?.progress ?? ''),
      ].join(' ').toLowerCase().includes(q);
    });
  }, [goals, goalsSearch]);

  const visibleDelegatedTasks = useMemo(() => {
    const q = delegatedTasksSearch.trim().toLowerCase();
    if (!q) return myMemberTasks;
    return myMemberTasks.filter((t: any) => {
      return [
        t?.title,
        t?.goal_title,
        t?.goal_statement,
        t?.due_date,
        t?.proof_review_status,
        t?.brief_file_name,
      ].join(' ').toLowerCase().includes(q);
    });
  }, [myMemberTasks, delegatedTasksSearch]);
  
  const delegatedTaskOpen = useMemo(() => {
    if (!delegatedTaskOpenId) return null;
    return myMemberTasks.find((t: any) => Number(t?.id) === Number(delegatedTaskOpenId)) || null;
  }, [myMemberTasks, delegatedTaskOpenId]);

  const extensionTaskOpen = useMemo(() => {
    if (!extensionTaskOpenId) return null;
    return myMemberTasks.find((t: any) => Number(t?.id) === Number(extensionTaskOpenId)) || null;
  }, [myMemberTasks, extensionTaskOpenId]);

  const getGoalAssignees = (goal: any) => {
    return (Array.isArray(goal?.assignees) ? goal.assignees : []).filter((a: any) => leaderTeamMemberIdSet.has(String(a?.employee_id ?? '')));
  };

  const getGoalAssigneeIdSet = (goal: any) => {
    const ids = new Set<string>();
    for (const assignee of getGoalAssignees(goal)) {
      const id = String(assignee?.employee_id ?? '').trim();
      if (id) ids.add(id);
    }
    return ids;
  };

  const getGoalMemberTasks = (goal: any) => {
    const goalAssigneeIds = getGoalAssigneeIdSet(goal);
    return uniqueTasksBySignature(Array.isArray(goal?.member_tasks) ? goal.member_tasks : []).filter((t: any) => goalAssigneeIds.has(String(t?.member_employee_id ?? '')));
  };

  const selectedAssignmentGoal = useMemo(
    () => leaderGoals.find((goal: any) => Number(goal?.id) === Number(taskAssignmentOpenGoalId)) || null,
    [leaderGoals, taskAssignmentOpenGoalId]
  );

  const selectedTaskBoardGoal = useMemo(
    () => leaderGoals.find((goal: any) => Number(goal?.id) === Number(taskBoardOpenGoalId)) || null,
    [leaderGoals, taskBoardOpenGoalId]
  );

  // Self assessment scores over time
  const assessmentTrend = selfAssessments
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((s, i) => ({
      period: `Assessment ${i + 1}`,
      avg: +((s.job_knowledge + s.productivity + s.attendance + s.communication + s.dependability) / 5).toFixed(1)
    }));

  const avgScore = appraisals.length > 0
    ? +(appraisals.reduce((sum, a) => sum + (a.overall_rating || a.rating || ((a.job_knowledge || 0) + (a.productivity || 0) + (a.communication || 0) + (a.dependability || 0) + (a.attendance || 0)) / 5), 0) / appraisals.length).toFixed(1)
    : 0;

  const StatCard = ({ icon: Icon, label, value, color }: any) => (
    <Card>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}><Icon size={18} className="text-white" /></div>
        <div><p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">{label}</p><p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{value}</p></div>
      </div>
    </Card>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-4">
        <SectionHeader title="Career Dashboard" subtitle="Your performance overview and career trajectory" />
      </div>

      <div className="mb-4">
        <div className="flex flex-wrap gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
          {[
            { key: 'overview', label: 'Overview', icon: BarChart3 },
            { key: 'goals', label: `My Goals (${goals.length})`, icon: Target },
            { key: 'leaderGoals', label: `Goals You Lead (${leaderGoals.length})`, icon: ClipboardList },
            { key: 'pips', label: `PIPs (${pips.length})`, icon: AlertTriangle },
            { key: 'idps', label: `Development Plans (${idps.length})`, icon: TrendingUp },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = dashboardTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setDashboardTab(tab.key as 'overview' | 'goals' | 'leaderGoals' | 'pips' | 'idps')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-all ${active ? 'bg-white dark:bg-slate-900 text-teal-deep dark:text-teal-green shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                <Icon size={14} /> {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {dashboardTab === 'overview' && (
      <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-4">
        <StatCard icon={Award} label="Avg Rating" value={avgScore || '—'} color="bg-teal-600" />
        <StatCard icon={Target} label="Total Goals" value={totalGoals} color="bg-blue-500" />
        <StatCard icon={TrendingUp} label="Completed Goals" value={completedGoals} color="bg-emerald-500" />
        <StatCard icon={BarChart3} label="Appraisals" value={appraisals.length} color="bg-amber-500" />
        <StatCard icon={DollarSign} label="Base Salary" value={salary ? `$${salary.toLocaleString()}` : '—'} color="bg-indigo-500" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Card>
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">Performance Trend</h3>
          <div className="h-64">
            {performanceTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={performanceTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 5]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="score" stroke="#0f766e" strokeWidth={3} dot={{ fill: '#0f766e', r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center text-sm text-slate-400">No appraisal data yet</div>}
          </div>
        </Card>
        <Card>
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">Latest Competency Radar</h3>
          <div className="h-64">
            {radarData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <PolarRadiusAxis domain={[0, 5]} tickCount={6} tick={{ fontSize: 9 }} />
                  <Radar name="Score" dataKey="value" stroke="#0f766e" fill="#14b8a6" fillOpacity={0.3} />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center text-sm text-slate-400">No appraisal data yet</div>}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Card>
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">Goals Status</h3>
          <div className="h-48">
            {goalPie.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart><Pie data={goalPie} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={5} dataKey="value">
                  {goalPie.map((_e, i) => (<Cell key={i} fill={GOAL_COLORS[i % GOAL_COLORS.length]} />))}
                </Pie><Tooltip /></PieChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center text-sm text-slate-400">No goals yet</div>}
          </div>
          <div className="flex flex-wrap gap-2 mt-2 justify-center">{goalPie.map((d, i) => (<span key={d.name} className="flex items-center gap-1 text-[10px] font-bold text-slate-500"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: GOAL_COLORS[i % GOAL_COLORS.length] }}></span>{d.name} ({d.value})</span>))}</div>
        </Card>
        <div className="md:col-span-2">
          <Card>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">Self Assessment Trend</h3>
            <div className="h-48">
              {assessmentTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={assessmentTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 5]} />
                    <Tooltip />
                    <Bar dataKey="avg" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="h-full flex items-center justify-center text-sm text-slate-400">No self assessments yet</div>}
            </div>
          </Card>
        </div>
      </div>

      {/* SCOPE OVERVIEW CARDS */}
      {goals.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          {scopeBreakdown.map(({ scope, total, completed, inProgress, atRisk, avgProgress }) => {
            const Icon = scope === 'Department' ? Building2 : scope === 'Team' ? Users : User;
            const style = scopeStyleMap[scope];
            return (
              <motion.div
                key={scope}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: scope === 'Department' ? 0 : scope === 'Team' ? 0.1 : 0.2, duration: 0.4 }}
              >
                <Card>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-xl ${style.iconBg} flex items-center justify-center`}>
                        <Icon size={22} className={style.text} />
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-800 dark:text-slate-100">{scope}</p>
                        <p className="text-[10px] text-slate-400">{total} goal{total !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <CircularProgress value={avgProgress} size={56} strokeWidth={6} />
                  </div>
                  {total > 0 && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 }}
                      className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800"
                    >
                      <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                        {completed > 0 && (
                          <motion.div initial={{ width: 0 }} animate={{ width: `${(completed / total) * 100}%` }} transition={{ duration: 0.6 }} className="bg-emerald-500" />
                        )}
                        {inProgress > 0 && (
                          <motion.div initial={{ width: 0 }} animate={{ width: `${(inProgress / total) * 100}%` }} transition={{ duration: 0.6, delay: 0.1 }} className="bg-amber-500" />
                        )}
                        {atRisk > 0 && (
                          <motion.div initial={{ width: 0 }} animate={{ width: `${(atRisk / total) * 100}%` }} transition={{ duration: 0.6, delay: 0.2 }} className="bg-red-500" />
                        )}
                      </div>
                      <div className="flex gap-3 mt-1.5">
                        <span className="text-[9px] font-bold text-emerald-600">{completed} done</span>
                        <span className="text-[9px] font-bold text-amber-500">{inProgress} active</span>
                        {atRisk > 0 && <span className="text-[9px] font-bold text-red-500">{atRisk} at risk</span>}
                      </div>
                    </motion.div>
                  )}
                  {total === 0 && (
                    <p className="mt-3 text-[10px] text-slate-400 italic">No {scope.toLowerCase()} goals assigned</p>
                  )}
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* FREQUENCY CARDS — per-frequency view of assigned goals */}
      {goals.length > 0 && (() => {
        const FREQ_META_L: Record<string, { color: string; bg: string; ring: string; icon: string }> = {
          Daily:      { color: '#8b5cf6', bg: 'bg-violet-50 dark:bg-violet-900/20', ring: 'ring-2 ring-violet-300 dark:ring-violet-700', icon: 'D' },
          Weekly:     { color: '#0ea5e9', bg: 'bg-sky-50 dark:bg-sky-900/20',       ring: 'ring-2 ring-sky-300 dark:ring-sky-700',       icon: 'W' },
          Monthly:    { color: '#0f766e', bg: 'bg-teal-50 dark:bg-teal-900/20',     ring: 'ring-2 ring-teal-300 dark:ring-teal-700',     icon: 'M' },
          Quarterly:  { color: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-900/20',   ring: 'ring-2 ring-amber-300 dark:ring-amber-700',   icon: 'Q' },
          Annually:   { color: '#ef4444', bg: 'bg-red-50 dark:bg-red-900/20',       ring: 'ring-2 ring-red-300 dark:ring-red-700',       icon: 'A' },
          'One-time': { color: '#64748b', bg: 'bg-slate-50 dark:bg-slate-800',      ring: 'ring-2 ring-slate-200 dark:ring-slate-700',   icon: '1x' },
        };
        const freqBuckets = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annually', 'One-time']
          .map(f => ({ freq: f, items: goals.filter(g => (g.frequency || 'One-time') === f) }))
          .filter(b => b.items.length > 0);
        if (freqBuckets.length === 0) return null;
        return (
          <div className="mb-4">
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">My Goals by Frequency</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {freqBuckets.map(({ freq, items }, idx) => {
                const meta = FREQ_META_L[freq];
                const completed = items.filter(g => g.status === 'Completed').length;
                const atRisk = items.filter(g => g.status === 'At Risk').length;
                const inProg = items.filter(g => g.status === 'In Progress').length;
                const avgProg = Math.round(items.reduce((s, g) => s + (g.progress || 0), 0) / items.length);
                return (
                  <motion.div key={freq} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.06 }}>
                    <Card className={meta.ring}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black text-white shrink-0" style={{ backgroundColor: meta.color }}>{meta.icon}</span>
                          <div>
                            <h4 className="text-sm font-black text-slate-800 dark:text-slate-100">{freq} Goals</h4>
                            <p className="text-[10px] text-slate-400">{items.length} goal{items.length !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                        <CircularProgress value={avgProg} size={56} strokeWidth={6} />
                      </div>
                      <div className="flex gap-3 mb-3 text-[10px] font-bold">
                        <span className="text-emerald-600">{completed} done</span>
                        <span className="text-amber-500">{inProg} active</span>
                        {atRisk > 0 && <span className="text-red-500">{atRisk} at risk</span>}
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden mb-3">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${avgProg}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                          className="h-2.5 rounded-full"
                          style={{ backgroundColor: meta.color }}
                        />
                      </div>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {items.map(g => (
                          <div key={g.id} className="flex items-center gap-2 p-1.5 rounded-lg bg-white/70 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{g.title || g.statement}</p>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                g.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
                                g.status === 'At Risk' ? 'bg-red-100 text-red-700' :
                                g.status === 'In Progress' ? 'bg-amber-100 text-amber-700' :
                                'bg-slate-100 text-slate-500'
                              }`}>{g.status || 'Not Started'}</span>
                            </div>
                            <span className="text-[10px] font-black text-slate-500 shrink-0">{g.progress || 0}%</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </div>
        );
      })()}
      </>
      )}

      {dashboardTab === 'goals' && (
        goals.length > 0 ? (
        <Card>
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">My Goals ({visibleGoals.length}/{goals.length})</h3>
          <div className="mb-3">
            <input
              type="text"
              value={goalsSearch}
              onChange={(e) => setGoalsSearch(e.target.value)}
              placeholder="Search goal title, scope, status, or delegation"
              className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left"><thead><tr className="border-b border-slate-100 dark:border-slate-800">
              <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Goal</th>
              <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Scope</th>
              <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Target</th>
              <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Frequency</th>
              <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
              <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Progress</th>
              <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Delegated By</th>
              <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Action</th></tr></thead>
              <tbody>
              <AnimatePresence>
              {visibleGoals.map((g, idx) => (
                <motion.tr
                  key={g.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.04, duration: 0.3 }}
                  className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors"
                >
                  <td className="py-3 font-medium text-slate-700 dark:text-slate-200">
                    <span className="truncate max-w-[220px] block" title={g.title || g.statement}>{g.title || g.statement}</span>
                  </td>
                  <td className="py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${scopeStyleMap[g.scope || 'Individual']?.badgeBg || scopeStyleMap.Individual.badgeBg}`}>
                      {(g.scope || 'Individual') === 'Department' ? <Building2 size={10} /> : (g.scope || 'Individual') === 'Team' ? <Users size={10} /> : <User size={10} />}
                      {(g.scope || 'Individual') === 'Department' ? 'Dept' : g.scope || 'Individual'}
                    </span>
                  </td>
                  <td className="py-3 text-sm text-slate-500 dark:text-slate-400">{g.target_date || '—'}</td>
                  <td className="py-3">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600">
                      {g.frequency || 'One-time'}
                    </span>
                  </td>
                  <td className="py-3"><span className={`text-[10px] font-bold uppercase ${g.status === 'Completed' ? 'text-emerald-600' : g.status === 'In Progress' ? 'text-amber-500' : g.status === 'At Risk' ? 'text-red-500' : 'text-slate-400'}`}>{g.status || 'Not Started'}</span></td>
                  <td className="py-3">
                    <div className="flex items-center gap-2 min-w-[120px]">
                      <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden relative">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${g.progress || 0}%` }}
                          transition={{ duration: 0.5, delay: idx * 0.04 }}
                          className={`h-3 rounded-full ${progressBarColor(g.progress || 0)}`}
                        />
                        {(g.progress || 0) >= 25 && (
                          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-white drop-shadow-sm">
                            {g.progress || 0}%
                          </span>
                        )}
                      </div>
                      {(g.progress || 0) < 25 && (
                        <span className="text-[10px] font-bold text-slate-500">{g.progress || 0}%</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3">
                    {g.delegation ? (
                      <div className="flex items-center gap-1.5">
                        <span className="w-6 h-6 rounded-full bg-teal-600/15 dark:bg-teal-500/15 text-teal-700 dark:text-teal-400 flex items-center justify-center text-[9px] font-black shrink-0">
                          {g.delegation.charAt(0).toUpperCase()}
                        </span>
                        <span className="text-xs text-slate-600 dark:text-slate-300 truncate max-w-[100px]" title={g.delegation}>
                          {g.delegation}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-3">
                    <button
                      onClick={() => setGoalDetailsOpenId(Number(g.id))}
                      className="text-[10px] font-bold text-teal-600 hover:text-teal-700 whitespace-nowrap"
                      title="View goal details"
                    >
                      View Goal
                    </button>
                  </td>
                </motion.tr>
              ))}
              </AnimatePresence>
              {visibleGoals.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-sm text-slate-400">
                    No goals match your search.
                  </td>
                </tr>
              )}
              </tbody>
            </table>
          </div>
        </Card>
        ) : (
        <Card>
          <div className="py-10 text-center text-slate-400">
            <Target size={20} className="mx-auto mb-2 opacity-40" />
            No goals assigned yet.
          </div>
        </Card>
        )
      )}

      {dashboardTab === 'goals' && (
        <Card className="mt-4">
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Delegated Tasks Requiring Proof ({visibleDelegatedTasks.length}/{myMemberTasks.length})</h3>
          <div className="mb-3">
            <input
              type="text"
              value={delegatedTasksSearch}
              onChange={(e) => setDelegatedTasksSearch(e.target.value)}
              placeholder="Search task title, goal, due date, or review status"
              className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
            />
          </div>
          <div className="mb-4 rounded-xl border border-teal-100 dark:border-teal-900/40 bg-teal-50/70 dark:bg-teal-900/20 px-4 py-3">
            <p className="text-xs font-black uppercase text-teal-700 dark:text-teal-300 tracking-wider">How real-time proof tracking works</p>
            <p className="text-[11px] text-teal-700/80 dark:text-teal-300/80 mt-1">
              Attach any proof file, submit it for review, and the task moves into review so progress updates right away. Your leader or manager can open the file and review it on their dashboard, and this screen refreshes every 5 seconds.
            </p>
          </div>
          {myMemberTasks.length === 0 ? (
            <div className="py-8 text-center text-slate-400">
              <CheckCircle2 size={20} className="mx-auto mb-2 opacity-40" />
              No delegated tasks available for proof submission.
            </div>
          ) : visibleDelegatedTasks.length === 0 ? (
            <div className="py-8 text-center text-slate-400">
              No delegated tasks match your search.
            </div>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {visibleDelegatedTasks.map((t: any) => {
                const reviewStatus = t.proof_review_status || 'Not Submitted';
                const canOpenWorkspace = reviewStatus !== 'Approved';
                const briefFiles = parseTaskBriefFiles(t);
                return (
                  <div key={t.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-900/40">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{t.title || 'Untitled Task'}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{t.goal_title || t.goal_statement || 'Goal task'} • Due {t.due_date || 'N/A'}</p>
                      </div>
                      <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${reviewStatus === 'Approved' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : reviewStatus === 'Pending Review' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : reviewStatus === 'Needs Revision' || reviewStatus === 'Rejected' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'}`}>
                        {reviewStatus}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[10px] text-slate-500">{briefFiles.length > 0 ? `${briefFiles.length} brief file${briefFiles.length > 1 ? 's' : ''} attached` : 'No task brief attached'}</span>
                      <button
                        onClick={() => setDelegatedTaskOpenId(Number(t.id))}
                        disabled={!canOpenWorkspace}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300"
                      >
                        {canOpenWorkspace ? 'Open Task Workspace' : 'Task Closed'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {dashboardTab === 'leaderGoals' && (
        leaderGoals.length > 0 ? (
        <Card className="mt-4">
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Goals You Lead ({leaderGoals.length})</h3>
          <p className="text-xs text-slate-400 mb-4">Compact view: expand only what you need, and manage assignments/task boards in focused modals.</p>
          <div className="mb-3">
            <input
              type="text"
              value={leaderGoalsSearch}
              onChange={(e) => setLeaderGoalsSearch(e.target.value)}
              placeholder="Search goals, team members, or task titles"
              className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
            />
          </div>
          <div className="space-y-3">
            {leaderGoalsVisible.map((g) => {
              const assignees = getGoalAssignees(g);
              const memberTasks = getGoalMemberTasks(g);
              const expanded = Number(leaderGoalOpenId) === Number(g.id);
              return (
                <div key={g.id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 bg-white/70 dark:bg-slate-900/40">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      onClick={() => setLeaderGoalOpenId((prev) => (Number(prev) === Number(g.id) ? null : Number(g.id)))}
                      className="flex items-center gap-2 text-left"
                    >
                      {expanded ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
                      <div>
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{g.title || g.statement || 'Untitled Goal'}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{(g.scope || 'Individual')} • {g.target_date || 'No target date'}</p>
                      </div>
                    </button>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600">{assignees.length} member{assignees.length !== 1 ? 's' : ''}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700">{memberTasks.length} task{memberTasks.length !== 1 ? 's' : ''}</span>
                      <span className={`text-[10px] font-bold uppercase ${g.status === 'Completed' ? 'text-emerald-600' : g.status === 'In Progress' ? 'text-amber-500' : g.status === 'At Risk' ? 'text-red-500' : 'text-slate-400'}`}>{g.status || 'Not Started'}</span>
                    </div>
                  </div>

                  <div className="mt-2">
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div className={`h-2 rounded-full transition-all ${progressBarColor(g.progress || 0)}`} style={{ width: `${g.progress || 0}%` }} />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">Progress: {g.progress || 0}%</p>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => setTaskAssignmentOpenGoalId(Number(g.id))}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
                    >
                      <Plus size={12} /> Assign Task
                    </button>
                    <button
                      onClick={() => setTaskBoardOpenGoalId(Number(g.id))}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700"
                    >
                      <ClipboardList size={12} /> Open Task Board
                    </button>
                  </div>

                  {expanded && (
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Team Members (Set By Manager)</p>
                      {assignees.length === 0 ? (
                        <p className="text-xs text-slate-400">No team members configured for this goal.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {assignees.map((a: any, index: number) => (
                            <div key={a.employee_id || `assignee-${g.id}-${index}`} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">
                              <span className="text-slate-700 dark:text-slate-300">{getMemberDisplayName(a)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">Recent Tasks</p>
                      {memberTasks.length === 0 ? (
                        <p className="text-xs text-slate-400">No detailed tasks yet.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {memberTasks.slice(0, 3).map((t: any, index: number) => (
                            <div key={t.id || `task-preview-${g.id}-${index}`} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900/40">
                              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{t.title || 'Untitled Task'}</p>
                              <p className="text-[11px] text-slate-500">{getMemberDisplayName(t)} • {t.status || 'Not Started'} • {Number(t.progress || 0)}%</p>
                            </div>
                          ))}
                          {memberTasks.length > 3 && (
                            <p className="text-[11px] text-slate-500">+{memberTasks.length - 3} more tasks in Task Board</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
        ) : (
        <Card className="mt-4">
          <div className="py-10 text-center text-slate-400">
            <ClipboardList size={20} className="mx-auto mb-2 opacity-40" />
            No goals assigned to you as team leader yet.
          </div>
        </Card>
        )
      )}

      {dashboardTab === 'pips' && (
      <Card className="mt-4">
        <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">My Performance Improvement Plans ({pips.length})</h3>
        {pips.length === 0 ? (
          <div className="py-8 text-center text-slate-400">
            <AlertTriangle size={20} className="mx-auto mb-2 opacity-40" />
            No active PIP records.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Deficiency</th>
                  <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Improvement Objective</th>
                  <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Period</th>
                  <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Outcome</th>
                  <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Supervisor</th>
                </tr>
              </thead>
              <tbody>
                {pips.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 dark:border-slate-800/50">
                    <td className="py-3 text-sm text-slate-700 dark:text-slate-200">{p.deficiency || '—'}</td>
                    <td className="py-3 text-sm text-slate-600 dark:text-slate-300">{p.improvement_objective || '—'}</td>
                    <td className="py-3 text-sm text-slate-500 dark:text-slate-400">{p.start_date || '—'} to {p.end_date || '—'}</td>
                    <td className="py-3 text-sm font-bold text-amber-600 dark:text-amber-400">{p.outcome || 'In Progress'}</td>
                    <td className="py-3 text-sm text-slate-500 dark:text-slate-400">{p.supervisor_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      )}

      {dashboardTab === 'idps' && (
      <Card className="mt-4">
        <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">My Development Plans ({idps.length})</h3>
        {idps.length === 0 ? (
          <div className="py-8 text-center text-slate-400">
            <TrendingUp size={20} className="mx-auto mb-2 opacity-40" />
            No active development plans yet.
          </div>
        ) : (
          <div className="space-y-3">
            {idps.map((idp) => (
              <div key={idp.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Skill Gap</p>
                    <p className="text-sm text-slate-700 dark:text-slate-200">{idp.skill_gap || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Status</p>
                    <p className="text-sm font-bold text-teal-600 dark:text-teal-400">{idp.status || 'In Progress'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Growth Step</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{idp.growth_step || '—'}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      )}

      <Modal
        open={!!selectedAssignmentGoal}
        title={selectedAssignmentGoal ? `Assign Task: ${selectedAssignmentGoal.title || selectedAssignmentGoal.statement || 'Goal'}` : 'Assign Task'}
        onClose={() => setTaskAssignmentOpenGoalId(null)}
        maxWidthClassName="max-w-3xl"
      >
        {selectedAssignmentGoal && (() => {
          const goalId = Number(selectedAssignmentGoal.id);
          const assignees = getGoalAssignees(selectedAssignmentGoal);
          const taskDraft = taskDrafts[goalId] || { member_id: '', title: '', description: '', due_date: '', priority: 'Medium' };
          const briefDraft = taskBriefDrafts[goalId] || [];
          return (
            <div>
              {assignees.length === 0 ? (
                <p className="text-sm text-slate-500">No manager-assigned members for this goal yet.</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                    <select
                      value={taskDraft.member_id}
                      onChange={(e) => handleTaskDraftChange(goalId, { member_id: e.target.value })}
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                    >
                      <option value="">Select team member...</option>
                      {assignees.map((a: any) => (
                        <option key={a.employee_id} value={a.employee_id}>{getMemberDisplayName(a)}</option>
                      ))}
                    </select>

                    <input
                      type="text"
                      value={taskDraft.title}
                      onChange={(e) => handleTaskDraftChange(goalId, { title: e.target.value })}
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                      placeholder="Task title (e.g., Prepare Q2 lead report)"
                    />

                    <input
                      type="date"
                      value={taskDraft.due_date}
                      onChange={(e) => handleTaskDraftChange(goalId, { due_date: e.target.value })}
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                    />

                    <select
                      value={taskDraft.priority}
                      onChange={(e) => handleTaskDraftChange(goalId, { priority: e.target.value })}
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                    >
                      <option value="Critical">Critical</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>

                    <textarea
                      rows={2}
                      value={taskDraft.description}
                      onChange={(e) => handleTaskDraftChange(goalId, { description: e.target.value })}
                      className="md:col-span-2 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                      placeholder="Task details / expected output"
                    />

                    <div className="md:col-span-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-3">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Optional task brief</p>
                          <p className="text-[11px] text-slate-500">Upload a PDF or PNG showing what needs to be done.</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700">
                            <Upload size={12} /> Add Files
                            <input type="file" accept="application/pdf,image/png" multiple className="hidden" onChange={(e) => handleTaskBriefUpload(goalId, e.target.files || [])} />
                          </label>
                          {briefDraft.length > 0 && (
                            <button
                              type="button"
                              onClick={() => clearTaskBriefDraft(goalId)}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30"
                            >
                              Remove All
                            </button>
                          )}
                        </div>
                      </div>
                      {briefDraft.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {briefDraft.map((file, index) => (
                            <div key={`${file.brief_file_name}-${index}`} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 p-2">
                              <div className="mb-1.5 flex items-center justify-between gap-2">
                                <span className="text-[10px] text-slate-500">Brief file {index + 1}</span>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setTaskBriefViewer({ src: String(file.brief_file_data || ''), fileName: file.brief_file_name, mimeType: file.brief_file_type })}
                                    className="text-[10px] font-bold text-teal-600 hover:text-teal-700"
                                  >
                                    View Full File
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeTaskBriefDraftFile(goalId, index)}
                                    className="text-[10px] font-bold text-red-600 hover:text-red-700"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                              <ProofAttachment src={file.brief_file_data} fileName={file.brief_file_name} mimeType={file.brief_file_type} compact />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-[11px] text-slate-400">No brief attached.</p>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={() => handleCreateLeaderTask(goalId)}
                      disabled={taskSavingGoal === goalId}
                      className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold disabled:opacity-50"
                    >
                      {taskSavingGoal === goalId ? 'Saving...' : 'Assign Task'}
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })()}
      </Modal>

      <Modal
        open={!!selectedTaskBoardGoal}
        title={selectedTaskBoardGoal ? `Task Board: ${selectedTaskBoardGoal.title || selectedTaskBoardGoal.statement || 'Goal'}` : 'Task Board'}
        onClose={() => setTaskBoardOpenGoalId(null)}
        maxWidthClassName="max-w-4xl"
      >
        {selectedTaskBoardGoal && (() => {
          const goalId = Number(selectedTaskBoardGoal.id);
          const memberTasks = getGoalMemberTasks(selectedTaskBoardGoal);
          const effectiveTaskStatus = (task: any) => {
            const reviewStatus = String(task?.proof_review_status || 'Not Submitted');
            const progress = Number(task?.progress || 0);
            if (reviewStatus === 'Approved' && progress < 100) return 'In Progress';
            return String(task?.status || 'Not Started');
          };
          const completedCount = memberTasks.filter((t: any) => effectiveTaskStatus(t) === 'Completed').length;
          const inProgressCount = memberTasks.filter((t: any) => effectiveTaskStatus(t) === 'In Progress').length;
          const blockedCount = memberTasks.filter((t: any) => effectiveTaskStatus(t) === 'Blocked').length;
          const pendingProofCount = memberTasks.filter((t: any) => String(t?.proof_review_status || '') === 'Pending Review').length;
          const withBriefCount = memberTasks.filter((t: any) => parseTaskBriefFiles(t).length > 0).length;
          return (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_320px] gap-4 items-start">
              <div>
                {(() => {
                  const goalProofStatus = String(selectedTaskBoardGoal?.proof_review_status || 'Not Submitted');
                  const canEditFinalProof = goalProofStatus === 'Not Submitted' || goalProofStatus === 'Needs Revision';
                  const taskBoardProgress = Math.max(0, Math.min(100, Number(selectedTaskBoardGoal?.progress || 0)));
                  const taskBoardStatus = String(selectedTaskBoardGoal?.status || 'Not Started');
                  const submittedGoalProofFiles = parseGoalProofFiles(selectedTaskBoardGoal);
                  const goalProofHistory = parseProofRevisionHistory(selectedTaskBoardGoal?.proof_revision_history);
                  const goalCurrentRevisionNumber = goalProofHistory.length + 1;
                  const goalCurrentRevisionLabel = goalProofHistory.length > 0 ? `${ordinalLabel(goalCurrentRevisionNumber)} revision` : 'Initial submission';
                  const goalDraft = goalProofDrafts[goalId] || { files: [], note: '' };
                  const isGoalProofSubmitting = goalProofSubmittingId === goalId;
                  return (
                    <div className="mb-4 p-4 rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-900/10">
                      <div className="mb-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Task Board Progress</p>
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${statusColors[taskBoardStatus] || statusColors['Not Started']}`}>
                            {taskBoardStatus}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-2 rounded-full ${taskBoardProgress >= 100 ? 'bg-emerald-500' : taskBoardProgress >= 50 ? 'bg-teal-500' : taskBoardProgress >= 25 ? 'bg-amber-500' : 'bg-red-400'}`}
                              style={{ width: `${taskBoardProgress}%` }}
                            />
                          </div>

                        {goalProofHistory.length > 0 && (
                          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-2">
                            <p className="text-xs font-black uppercase tracking-wider text-slate-500">Closed Proof Revisions</p>
                            {goalProofHistory.map((entry, entryIndex) => (
                              <div key={`goal-proof-history-${entryIndex}`} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-2.5 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300">{entry.revision_label || `${ordinalLabel(Number(entry.revision_number || entryIndex + 1))} revision`}</p>
                                  <span className="text-[10px] font-bold uppercase text-slate-500">{entry.proof_review_status || 'Closed'}</span>
                                </div>
                                <div className="space-y-2">
                                  {(entry.proof_files || []).map((file: any, fileIndex: number) => (
                                    <div key={`goal-proof-history-${entryIndex}-${fileIndex}`} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2">
                                      <p className="mb-1 text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate">{file.proof_file_name || `Revision file ${fileIndex + 1}`}</p>
                                      <ProofAttachment src={file.proof_file_data} fileName={file.proof_file_name} mimeType={file.proof_file_type} compact />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                          <span className="text-sm font-black text-slate-700 dark:text-slate-200 min-w-[48px] text-right">{taskBoardProgress}%</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 mb-3">
                        <h3 className="text-sm font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Final Proof for Manager Review</h3>
                        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${
                          goalProofStatus === 'Approved'
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                            : goalProofStatus === 'Pending Review'
                              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                              : goalProofStatus === 'Needs Revision' || goalProofStatus === 'Rejected'
                                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'
                        }`}>
                          {goalProofStatus}
                        </span>
                      </div>

                      {submittedGoalProofFiles.length > 0 ? (
                        <div className="space-y-2 mb-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] font-bold uppercase text-slate-500">Submitted Final Proof</p>
                            <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300">{goalProofHistory.length > 0 ? 'Revised file' : 'Current file'}</span>
                          </div>
                          {submittedGoalProofFiles.map((file, fileIndex) => (
                            <div key={`goal-proof-${fileIndex}`} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2">
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate">{`${goalCurrentRevisionLabel} - ${file.proof_file_name || `Final proof ${fileIndex + 1}`}`}</p>
                                <button
                                  type="button"
                                  onClick={() => setTaskBriefViewer({ src: file.proof_file_data, fileName: file.proof_file_name, mimeType: file.proof_file_type })}
                                  className="text-[10px] font-bold text-teal-600 hover:text-teal-700"
                                >
                                  View Full File
                                </button>
                              </div>
                              <ProofAttachment src={file.proof_file_data} fileName={file.proof_file_name} mimeType={file.proof_file_type} compact />
                            </div>
                          ))}
                          {selectedTaskBoardGoal.proof_note && (
                            <p className="text-[10px] text-slate-600 dark:text-slate-300"><span className="font-bold">Submitted note:</span> {selectedTaskBoardGoal.proof_note}</p>
                          )}
                          {selectedTaskBoardGoal.proof_submitted_at && (
                            <p className="text-[10px] text-slate-500">Submitted: {new Date(selectedTaskBoardGoal.proof_submitted_at).toLocaleDateString()}</p>
                          )}
                          {selectedTaskBoardGoal.proof_review_note && (
                            <p className="text-[10px] text-slate-500 italic">
                              {String(selectedTaskBoardGoal?.proof_review_status || '') === 'Needs Revision'
                                ? `Requested revision from ${String(selectedTaskBoardGoal?.proof_reviewed_role || '').toLowerCase().includes('team') ? 'your team leader' : 'your manager'}`
                                : `${String(selectedTaskBoardGoal?.proof_reviewed_role || '').toLowerCase().includes('team') ? 'Team leader note' : 'Manager note'}`
                              }: {selectedTaskBoardGoal.proof_review_note}
                            </p>
                          )}
                          {Number(selectedTaskBoardGoal.proof_review_rating || 0) > 0 && (
                            <p className="text-[10px] text-slate-500">Manager rating: <span className="font-bold">{Number(selectedTaskBoardGoal.proof_review_rating || 0)}/5</span></p>
                          )}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-500 mb-3">No final proof submitted yet. Upload files and add notes below.</p>
                      )}

                      {goalProofHistory.length > 0 && (
                        <div className="mb-3 space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Closed Revisions</p>
                          {goalProofHistory.map((entry, entryIndex) => (
                            <div key={`goal-proof-history-${entryIndex}`} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-2">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300">{entry.revision_label || `${ordinalLabel(Number(entry.revision_number || entryIndex + 1))} revision`}</p>
                                <span className="text-[10px] font-bold uppercase text-slate-500">Closed</span>
                              </div>
                              <div className="space-y-2">
                                {(entry.proof_files || []).map((file: any, fileIndex: number) => (
                                  <div key={`goal-proof-history-${entryIndex}-${fileIndex}`} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2">
                                    <p className="mb-1 text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate">{file.proof_file_name || `Revision file ${fileIndex + 1}`}</p>
                                    <ProofAttachment src={file.proof_file_data} fileName={file.proof_file_name} mimeType={file.proof_file_type} compact />
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {!canEditFinalProof && (
                        <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300 mb-3">
                          Final proof is locked while under manager review. You can edit and resubmit only when manager marks it Needs Revision.
                        </p>
                      )}

                      <div className="rounded-lg border border-dashed border-emerald-300 dark:border-emerald-800 bg-white/70 dark:bg-slate-900/40 p-3 space-y-2">
                        <label className="block text-[10px] font-bold uppercase text-slate-500">Upload Final Proof Files</label>
                        <div className="flex items-center gap-2 flex-wrap">
                          <label
                            htmlFor={`goal-final-proof-${goalId}`}
                            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold ${canEditFinalProof ? 'bg-emerald-600 text-white cursor-pointer hover:bg-emerald-700' : 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed'}`}
                          >
                            <Upload size={12} /> Choose Files
                          </label>
                          <span className="text-[11px] text-slate-500">
                            {goalDraft.files.length > 0
                              ? `${goalDraft.files.length} file${goalDraft.files.length > 1 ? 's' : ''} selected`
                              : 'No files selected'}
                          </span>
                        </div>
                        <input
                          id={`goal-final-proof-${goalId}`}
                          type="file"
                          multiple
                          accept="*/*"
                          disabled={!canEditFinalProof}
                          onChange={(e) => {
                            void handleGoalProofUpload(goalId, e.target.files || []);
                            e.currentTarget.value = '';
                          }}
                          className="hidden"
                        />

                        {goalDraft.files.length > 0 && (
                          <div className="space-y-2">
                            {goalDraft.files.map((file, index) => (
                              <div key={`goal-draft-${index}`} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2">
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate">{file.proof_file_name || `Draft file ${index + 1}`}</p>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setTaskBriefViewer({ src: file.proof_file_data, fileName: file.proof_file_name, mimeType: file.proof_file_type })}
                                      className="text-[10px] font-bold text-teal-600 hover:text-teal-700"
                                    >
                                      View Full File
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => removeGoalProofDraftFile(goalId, index)}
                                      disabled={!canEditFinalProof}
                                      className="text-[10px] font-bold text-red-600 hover:text-red-700"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                                <ProofAttachment src={file.proof_file_data} fileName={file.proof_file_name} mimeType={file.proof_file_type} compact />
                              </div>
                            ))}
                          </div>
                        )}

                        <label className="block text-[10px] font-bold uppercase text-slate-500 mt-1">Final Proof Note</label>
                        <textarea
                          rows={2}
                          value={goalDraft.note}
                          disabled={!canEditFinalProof}
                          onChange={(e) => setGoalProofDrafts(prev => ({
                            ...prev,
                            [goalId]: {
                              files: prev[goalId]?.files || [],
                              note: e.target.value,
                            },
                          }))}
                          className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs disabled:opacity-60"
                          placeholder="What did the team complete? Add context for manager review."
                        />

                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => void submitGoalFinalProof(selectedTaskBoardGoal)}
                            disabled={isGoalProofSubmitting || goalDraft.files.length === 0 || !canEditFinalProof}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {isGoalProofSubmitting ? 'Submitting...' : 'Submit Final Proof to Manager'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Task Board ({memberTasks.length})</p>
                {memberTasks.length === 0 ? (
                  <p className="text-xs text-slate-400">No detailed tasks yet.</p>
                ) : (
                  <div className="space-y-3">
                  {memberTasks.map((t: any, index: number) => {
                    const progressValue = Number(t.progress || 0);
                    const proofReviewStatus = String(t.proof_review_status || 'Not Submitted');
                    const taskStatusValue = proofReviewStatus === 'Approved' && progressValue < 100 ? 'In Progress' : (t.status || 'Not Started');
                    const actorRole = String(localUser?.role || '').trim().toLowerCase();
                    const isTeamLeaderActor = actorRole === 'team leader' || actorRole === 'team_leader';
                    const teamLeaderReviewLocked = isTeamLeaderActor && Number((t as any).tl_review_locked || 0) === 1;
                    const awaitingRevisionResubmission = proofReviewStatus === 'Needs Revision';
                    const proofDecisionFinalized = proofReviewStatus === 'Approved' || teamLeaderReviewLocked;
                    const proofFiles = parseTaskProofFiles(t);
                    const taskProofHistory = parseProofRevisionHistory(t?.proof_revision_history);
                    const taskCurrentRevisionNumber = taskProofHistory.length + 1;
                    const taskCurrentRevisionLabel = taskProofHistory.length > 0 ? `${ordinalLabel(taskCurrentRevisionNumber)} revision` : 'Initial submission';
                    const reviewerRole = String((t as any)?.proof_reviewed_role || (t as any)?.reviewer_role || '').trim().toLowerCase();
                    const reviewerLabel = reviewerRole.includes('team') ? 'your team leader' : reviewerRole.includes('manager') ? 'your manager' : 'reviewer';
                    const reviewAttachment = String((t as any)?.proof_review_file_data || '').trim()
                      ? {
                          proof_file_data: String((t as any)?.proof_review_file_data || '').trim(),
                          proof_file_name: String((t as any)?.proof_review_file_name || '').trim() || 'Revision attachment',
                          proof_file_type: String((t as any)?.proof_review_file_type || '').trim() || 'application/octet-stream',
                        }
                      : null;
                    const hasProof = proofFiles.length > 0;
                    const reviewNoteValue = taskReviewNotes[t.id] ?? String(t.proof_review_note || '');
                    const briefFiles = parseTaskBriefFiles(t);
                    return (
                      <div key={t.id || `task-${goalId}-${index}`} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-900/40">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-base sm:text-lg font-bold text-slate-700 dark:text-slate-200">{t.title || 'Untitled Task'}</p>
                            {t.description && <p className="text-sm text-slate-500 mt-1">{t.description}</p>}
                            <div className="flex flex-wrap gap-2 mt-2">
                              <span className="text-xs px-2.5 py-1 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{getMemberDisplayName(t)}</span>
                              <span className="text-xs px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 inline-flex items-center gap-1"><Flag size={11} />{t.priority || 'Medium'}</span>
                              <span className="text-xs px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 inline-flex items-center gap-1"><CalendarDays size={11} />{t.due_date || 'No deadline'}</span>
                            </div>
                            {briefFiles.length > 0 && (
                              <div className="mt-2">
                                <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Task Brief ({briefFiles.length})</p>
                                <div className="space-y-2">
                                  {briefFiles.map((file, fileIndex) => (
                                    <div key={`${file.brief_file_name}-${fileIndex}`} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 p-2">
                                      <div className="mb-1 flex items-center justify-between gap-2">
                                        <span className="text-[10px] text-slate-500">File {fileIndex + 1}</span>
                                        <button
                                          type="button"
                                          onClick={() => setTaskBriefViewer({ src: file.brief_file_data, fileName: file.brief_file_name, mimeType: file.brief_file_type })}
                                          className="text-[10px] font-bold text-teal-600 hover:text-teal-700"
                                        >
                                          View Full File
                                        </button>
                                      </div>
                                      <ProofAttachment src={file.brief_file_data} fileName={file.brief_file_name} mimeType={file.brief_file_type} compact />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => handleDeleteLeaderTask(Number(t.id))}
                            className="text-red-500 hover:text-red-600 p-1.5 rounded"
                            title="Remove task"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>

                        <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Proof Review</p>
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${proofReviewStatus === 'Approved' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : proofReviewStatus === 'Pending Review' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : proofReviewStatus === 'Needs Revision' || proofReviewStatus === 'Rejected' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'}`}>
                              {proofReviewStatus}
                            </span>
                          </div>

                          {hasProof ? (
                            <>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2">
                                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">
                                    {`${taskCurrentRevisionLabel} • ${proofFiles.length} proof file${proofFiles.length > 1 ? 's' : ''} submitted`}
                                  </p>
                                  <button
                                    onClick={() => setProofViewerTaskId(Number(t.id))}
                                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold hover:bg-slate-200 dark:hover:bg-slate-700"
                                  >
                                    View Proof
                                  </button>
                                </div>
                                <div className="space-y-2">
                                  {proofFiles.map((file, fileIndex) => (
                                    <div key={`${file.proof_file_name}-${fileIndex}`} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2">
                                      <p className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">{file.proof_file_name || `Proof file ${fileIndex + 1}`}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {String(t.proof_note || '').trim() && (
                                <div className="mt-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2">
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Member Note</p>
                                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{String(t.proof_note || '').trim()}</p>
                                </div>
                              )}
                              {(awaitingRevisionResubmission && (String(t.proof_review_note || '').trim() || reviewAttachment)) && (
                                <div className="mt-2 rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-900/20 p-2.5 space-y-2">
                                  <p className="text-[10px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-300">Requested revision from {reviewerLabel}</p>
                                  {String(t.proof_review_note || '').trim() && (
                                    <p className="text-[11px] text-amber-800 dark:text-amber-200 whitespace-pre-wrap">{String(t.proof_review_note || '').trim()}</p>
                                  )}
                                  {reviewAttachment && (
                                    <div className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-white/80 dark:bg-slate-900 p-2">
                                      <div className="mb-1 flex items-center justify-between gap-2">
                                        <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate">{reviewAttachment.proof_file_name}</p>
                                        <button
                                          type="button"
                                          onClick={() => setTaskBriefViewer({ src: reviewAttachment.proof_file_data, fileName: reviewAttachment.proof_file_name, mimeType: reviewAttachment.proof_file_type })}
                                          className="text-[10px] font-bold text-teal-600 hover:text-teal-700"
                                        >
                                          View Full File
                                        </button>
                                      </div>
                                      <ProofAttachment src={reviewAttachment.proof_file_data} fileName={reviewAttachment.proof_file_name} mimeType={reviewAttachment.proof_file_type} compact />
                                    </div>
                                  )}
                                </div>
                              )}
                              {Number(t.proof_review_rating || 0) > 0 && (
                                <p className="text-[10px] text-slate-500">Manager rating: <span className="font-bold">{Number(t.proof_review_rating || 0)}/5</span></p>
                              )}
                              <textarea
                                rows={2}
                                value={reviewNoteValue}
                                onChange={(e) => setTaskReviewNotes(prev => ({ ...prev, [t.id]: e.target.value }))}
                                readOnly={proofDecisionFinalized}
                                className="w-full mt-2 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                                placeholder="Add review note (optional)"
                              />
                              <div className="mt-2">
                                {proofDecisionFinalized ? (
                                  <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">{teamLeaderReviewLocked ? 'Team leader review is locked. Waiting for manager decision.' : 'Review finalized as Approved. Actions are locked.'}</p>
                                ) : awaitingRevisionResubmission ? (
                                  <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300">Review actions are locked until the assignee submits a revised proof file.</p>
                                ) : (
                                  <button
                                    onClick={() => setTaskReviewActionOpen(prev => ({ ...prev, [Number(t.id)]: !prev[Number(t.id)] }))}
                                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold hover:bg-slate-200 dark:hover:bg-slate-700"
                                  >
                                    {taskReviewActionOpen[Number(t.id)] ? 'Hide Review Actions' : 'Open Review Actions'}
                                  </button>
                                )}
                                {!awaitingRevisionResubmission && taskReviewActionOpen[Number(t.id)] && (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <button
                                      onClick={() => handleUpdateLeaderTask(Number(t.id), { proof_review_status: 'Approved', proof_review_note: reviewNoteValue }, 'Proof approved', 'Approve this submitted proof?')}
                                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      onClick={() => openNeedsRevisionModal(t, reviewNoteValue)}
                                      className="px-2.5 py-1.5 rounded-lg bg-amber-500 text-white text-[11px] font-bold"
                                    >
                                      Needs Revision
                                    </button>
                                    <button
                                      onClick={() => handleUpdateLeaderTask(Number(t.id), { proof_review_status: 'Rejected', proof_review_note: reviewNoteValue }, 'Proof rejected', 'Reject this submitted proof?')}
                                      className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-[11px] font-bold"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            <p className="text-xs text-slate-400">No proof submitted yet by assignee.</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  </div>
                )}
              </div>

              <aside className="lg:sticky lg:top-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-3">
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Board Summary</p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3">
                    <p className="text-xs text-slate-400">Total</p>
                    <p className="text-base font-black text-slate-700 dark:text-slate-200">{memberTasks.length}</p>
                  </div>
                  <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3">
                    <p className="text-xs text-slate-400">Completed</p>
                    <p className="text-base font-black text-emerald-600">{completedCount}</p>
                  </div>
                  <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3">
                    <p className="text-xs text-slate-400">In Progress</p>
                    <p className="text-base font-black text-teal-600">{inProgressCount}</p>
                  </div>
                  <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3">
                    <p className="text-xs text-slate-400">Blocked</p>
                    <p className="text-base font-black text-rose-600">{blockedCount}</p>
                  </div>
                </div>
                <div className="mt-3 space-y-3">
                  <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3">
                    <p className="text-xs text-slate-400">Pending Proof Review</p>
                    <p className="text-base font-black text-amber-600">{pendingProofCount}</p>
                  </div>
                  <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3">
                    <p className="text-xs text-slate-400">Tasks With Brief Files</p>
                    <p className="text-base font-black text-indigo-600">{withBriefCount}</p>
                  </div>
                </div>
              </aside>
            </div>
          );
        })()}
      </Modal>

      <Modal
        open={!!delegatedTaskOpen}
        title={delegatedTaskOpen ? `Task Workspace: ${delegatedTaskOpen.title || 'Task'}` : 'Task Workspace'}
        onClose={() => setDelegatedTaskOpenId(null)}
        maxWidthClassName="max-w-4xl"
        bodyClassName="!max-h-[90vh]"
      >
        {delegatedTaskOpen && (() => {
          const t = delegatedTaskOpen;
          const draft = proofDrafts[t.id] || { proof_files: parseTaskProofFiles(t), proof_note: t.proof_note || '' };
          const sentProofFiles = parseTaskProofFiles(t);
          const taskProofHistory = parseProofRevisionHistory(t.proof_revision_history);
          const taskCurrentRevisionNumber = taskProofHistory.length + 1;
          const taskCurrentRevisionLabel = taskProofHistory.length > 0 ? `${ordinalLabel(taskCurrentRevisionNumber)} revision` : 'Initial submission';
          const extensionDraft = taskExtensionDrafts[t.id] || { requested_due_date: '', reason: '' };
          const reviewStatus = t.proof_review_status || 'Not Submitted';
          const proofLocked = reviewStatus !== 'Not Submitted' && reviewStatus !== 'Needs Revision';
          const proofFiles = proofLocked ? sentProofFiles : (Array.isArray(draft.proof_files) ? draft.proof_files : []);
          const proofNeedsRevision = reviewStatus === 'Needs Revision';
          const proofApproved = reviewStatus === 'Approved';
          const proofPending = reviewStatus === 'Pending Review';
          const proofRejected = reviewStatus === 'Rejected';
          const reviewActorRole = String((t as any)?.proof_reviewed_role || (t as any)?.reviewer_role || '').trim().toLowerCase();
          const reviewActorLabel = reviewActorRole.includes('team') ? 'your team leader' : reviewActorRole.includes('manager') ? 'your manager' : 'reviewer';
          const reviewAttachment = String((t as any)?.proof_review_file_data || '').trim()
            ? {
                proof_file_data: String((t as any)?.proof_review_file_data || '').trim(),
                proof_file_name: String((t as any)?.proof_review_file_name || '').trim() || 'Revision attachment',
                proof_file_type: String((t as any)?.proof_review_file_type || '').trim() || 'application/octet-stream',
              }
            : null;
          const pendingTaskExtension = myDeadlineExtensionRequests.find((r: any) => String(r.entity_type || '') === 'task' && Number(r.task_id) === Number(t.id) && String(r.status || '') === 'Pending');
          const briefFiles = parseTaskBriefFiles(t);

          return (
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg sm:text-xl font-bold text-slate-700 dark:text-slate-200">{t.title || 'Untitled Task'}</p>
                    <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-1">{t.goal_title || t.goal_statement || 'Goal task'} • Due {t.due_date || 'N/A'}</p>
                  </div>
                  <span className={`text-xs sm:text-sm font-bold uppercase px-3 py-1.5 rounded-full ${reviewStatus === 'Approved' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : reviewStatus === 'Pending Review' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : reviewStatus === 'Needs Revision' || reviewStatus === 'Rejected' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'}`}>
                    {reviewStatus}
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-500">Task Brief ({briefFiles.length})</p>
                </div>
                {briefFiles.length > 0 ? (
                  <div className="space-y-2">
                    {briefFiles.map((file, fileIndex) => (
                      <div key={`${file.brief_file_name}-${fileIndex}`} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 p-2">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="text-xs text-slate-500">File {fileIndex + 1}</span>
                          <button
                            type="button"
                            onClick={() => setTaskBriefViewer({ src: file.brief_file_data, fileName: file.brief_file_name, mimeType: file.brief_file_type })}
                            className="text-xs font-bold text-teal-600 hover:text-teal-700"
                          >
                            View Full File
                          </button>
                        </div>
                        <ProofAttachment src={file.brief_file_data} fileName={file.brief_file_name} mimeType={file.brief_file_type} compact />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">No brief attachment was added to this task.</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-4 bg-white/70 dark:bg-slate-900/50">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-500">Submitted Proof ({proofFiles.length})</p>
                  </div>
                  {proofFiles.length > 0 ? (
                    <div className="space-y-2">
                      {proofFiles.map((file, index) => (
                        <div key={`${file.proof_file_name}-${index}`} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 p-2">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="text-xs text-slate-500">File {index + 1}</span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setTaskBriefViewer({ src: file.proof_file_data, fileName: file.proof_file_name, mimeType: file.proof_file_type })}
                                className="text-xs font-bold text-teal-600 hover:text-teal-700"
                              >
                                View Full File
                              </button>
                              {!proofLocked && (
                                <button
                                  type="button"
                                  onClick={() => removeProofAttachmentDraftFile(t.id, index)}
                                  className="text-xs font-bold text-red-600 hover:text-red-700"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </div>
                          <ProofAttachment src={file.proof_file_data} fileName={file.proof_file_name} mimeType={file.proof_file_type} compact />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">No proof file selected yet.</p>
                  )}
                  {!proofLocked && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700">
                        <Upload size={13} /> Attach Proof Files
                        <input
                          type="file"
                          accept="*/*"
                          multiple
                          className="hidden"
                          onClick={(e) => { e.currentTarget.value = ''; }}
                          onChange={(e) => handleProofImageUpload(t.id, e.target.files || [])}
                        />
                      </label>
                      {!!proofFiles.length && (
                        <button
                          type="button"
                          onClick={() => removeProofAttachmentDraft(t.id)}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-bold bg-red-50 dark:bg-red-900/25 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/35"
                        >
                          <Trash2 size={12} /> Remove All
                        </button>
                      )}
                    </div>
                  )}
                  {proofFiles.length > 0 && (
                    <p className="mt-2 text-xs text-slate-500 truncate">Selected file{proofFiles.length > 1 ? 's' : ''}: {proofFiles.map((f) => f.proof_file_name).join(', ')}</p>
                  )}
                  {proofLocked && (
                    <div className="mt-3 rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/80 dark:bg-emerald-900/20 px-3 py-2">
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{proofApproved ? 'Task approved. This task is now closed.' : proofPending ? 'Proof already submitted successfully and is pending review.' : 'Task closed. This task can be reopened only when revision is requested.'}</p>
                    </div>
                  )}
                  {proofNeedsRevision && (
                    <div className="mt-3 rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/80 dark:bg-amber-900/20 px-3 py-2">
                      <p className="text-xs font-bold text-amber-700 dark:text-amber-300">Requested revision from {reviewActorLabel}. Update the proof and resubmit.</p>
                    </div>
                  )}
                </div>

                <div>
                  <textarea
                    rows={6}
                    value={draft.proof_note}
                    onChange={(e) => handleProofDraftChange(t.id, { proof_note: e.target.value })}
                    readOnly={proofLocked}
                    className={`w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 text-base ${proofLocked ? 'bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 cursor-not-allowed' : 'bg-white dark:bg-slate-900'}`}
                    placeholder="Add notes explaining the attached proof"
                  />
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => {
                        if (proofApproved) {
                          window.notify?.('Task already approved and closed', 'success');
                          return;
                        }
                        if (proofPending) {
                          window.notify?.('Proof already submitted and pending review', 'success');
                          return;
                        }
                        if (proofRejected) {
                          window.notify?.('Task is closed. Only revision-requested tasks can be reopened.', 'error');
                          return;
                        }
                        submitTaskProof(t.id);
                      }}
                      disabled={proofSubmittingTaskId === t.id || proofLocked}
                      className="px-4 py-2 rounded-lg bg-teal-deep text-white text-sm font-bold hover:bg-teal-green disabled:opacity-50"
                    >
                      {proofSubmittingTaskId === t.id ? 'Submitting...' : proofApproved ? 'Approved - Closed' : proofPending ? 'Pending Review' : proofRejected ? 'Closed' : proofNeedsRevision ? 'Resubmit For Review' : 'Submit For Review'}
                    </button>
                  </div>
                </div>
              </div>

              {(proofNeedsRevision || proofRejected) && (String(t.proof_review_note || '').trim() || reviewAttachment) && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-900/20 p-3 sm:p-4 space-y-2">
                  <p className="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    {proofNeedsRevision ? `Requested revision from ${reviewActorLabel}` : `Feedback from ${reviewActorLabel}`}
                  </p>
                  {String(t.proof_review_note || '').trim() && (
                    <p className="text-sm text-amber-800 dark:text-amber-200 whitespace-pre-wrap">{String(t.proof_review_note || '').trim()}</p>
                  )}
                  {reviewAttachment && (
                    <div className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-white/80 dark:bg-slate-900 p-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-slate-600 dark:text-slate-300 truncate">{reviewAttachment.proof_file_name}</p>
                        <button
                          type="button"
                          onClick={() => setTaskBriefViewer({ src: reviewAttachment.proof_file_data, fileName: reviewAttachment.proof_file_name, mimeType: reviewAttachment.proof_file_type })}
                          className="text-xs font-bold text-teal-600 hover:text-teal-700"
                        >
                          View Full File
                        </button>
                      </div>
                      <ProofAttachment src={reviewAttachment.proof_file_data} fileName={reviewAttachment.proof_file_name} mimeType={reviewAttachment.proof_file_type} compact />
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-lg border border-blue-200 dark:border-blue-900/40 bg-blue-50/70 dark:bg-blue-900/20 p-3 sm:p-4">
                <p className="text-xs sm:text-sm font-black uppercase tracking-wider text-blue-700 dark:text-blue-300">Need More Time?</p>
                {pendingTaskExtension ? (
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-blue-700/85 dark:text-blue-300/85">
                      Pending team leader decision. Requested due date: {pendingTaskExtension.requested_due_date || 'N/A'}
                    </p>
                    <button
                      type="button"
                      onClick={() => setExtensionTaskOpenId(Number(t.id))}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 text-[10px] font-bold text-blue-700 dark:text-blue-300"
                    >
                      View Request
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-sm text-blue-700/85 dark:text-blue-300/85">Send a separate deadline extension request without affecting proof submission.</p>
                    <button
                      type="button"
                      onClick={() => setExtensionTaskOpenId(Number(t.id))}
                      className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700"
                    >
                      Request Deadline Extension
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>

      <Modal
        open={!!extensionTaskOpen}
        title={extensionTaskOpen ? `Deadline Extension: ${extensionTaskOpen.title || 'Task'}` : 'Deadline Extension'}
        onClose={() => setExtensionTaskOpenId(null)}
        maxWidthClassName="max-w-2xl"
      >
        {extensionTaskOpen && (() => {
          const t = extensionTaskOpen;
          const extensionDraft = taskExtensionDrafts[t.id] || { requested_due_date: '', reason: '' };
          const pendingTaskExtension = myDeadlineExtensionRequests.find((r: any) => String(r.entity_type || '') === 'task' && Number(r.task_id) === Number(t.id) && String(r.status || '') === 'Pending');

          return (
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-3">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{t.title || 'Untitled Task'}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Current due date: {t.due_date || 'N/A'}</p>
              </div>

              {pendingTaskExtension ? (
                <div className="rounded-lg border border-blue-200 dark:border-blue-900/40 bg-blue-50/70 dark:bg-blue-900/20 p-3">
                  <p className="text-xs font-bold text-blue-700 dark:text-blue-300">A request is already pending leader approval.</p>
                  <p className="text-xs text-blue-700/85 dark:text-blue-300/85 mt-1">Requested due date: {pendingTaskExtension.requested_due_date || 'N/A'}</p>
                </div>
              ) : (
                <div className="rounded-lg border border-blue-200 dark:border-blue-900/40 bg-blue-50/70 dark:bg-blue-900/20 p-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <input
                      type="date"
                      value={extensionDraft.requested_due_date}
                      onChange={(e) => updateTaskExtensionDraft(t.id, { requested_due_date: e.target.value })}
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                    />
                    <input
                      type="text"
                      value={extensionDraft.reason}
                      onChange={(e) => updateTaskExtensionDraft(t.id, { reason: e.target.value })}
                      placeholder="Reason for extension"
                      className="md:col-span-2 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                    />
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={() => submitTaskExtensionRequest(t)}
                      disabled={taskExtensionSubmittingId === Number(t.id)}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-700 disabled:opacity-50"
                    >
                      {taskExtensionSubmittingId === Number(t.id) ? 'Requesting...' : 'Submit Extension Request'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </Modal>

      <Modal
        open={!!goalDetailsOpenId}
        title={goalDetailsOpenId ? `Goal Details: ${goals.find((goal: any) => Number(goal?.id) === Number(goalDetailsOpenId))?.title || goals.find((goal: any) => Number(goal?.id) === Number(goalDetailsOpenId))?.statement || 'Goal'}` : 'Goal Details'}
        onClose={() => setGoalDetailsOpenId(null)}
        maxWidthClassName="max-w-3xl"
      >
        {goalDetailsOpenId ? (() => {
          const g = goals.find((goal: any) => Number(goal?.id) === Number(goalDetailsOpenId));
          if (!g) return <p className="text-sm text-slate-500">Goal not found.</p>;
          return (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-[10px] font-bold uppercase text-slate-400">Goal</p><p className="text-slate-700 dark:text-slate-200">{g.title || g.statement || '—'}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-slate-400">Scope</p><p className="text-slate-700 dark:text-slate-200">{g.scope || 'Individual'}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-slate-400">Target Date</p><p className="text-slate-700 dark:text-slate-200">{g.target_date || '—'}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-slate-400">Frequency</p><p className="text-slate-700 dark:text-slate-200">{g.frequency || 'One-time'}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-slate-400">Status</p><p className="text-slate-700 dark:text-slate-200">{g.status || 'Not Started'}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-slate-400">Progress</p><p className="text-slate-700 dark:text-slate-200">{g.progress || 0}%</p></div>
                <div className="col-span-2"><p className="text-[10px] font-bold uppercase text-slate-400">Delegated By</p><p className="text-slate-700 dark:text-slate-200">{g.delegation || '—'}</p></div>
              </div>
              {g.metric && (
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-400">Metric</p>
                  <p className="text-slate-700 dark:text-slate-200">{g.metric}</p>
                </div>
              )}
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Statement</p>
                <p className="text-slate-700 dark:text-slate-200">{g.statement || '—'}</p>
              </div>
            </div>
          );
        })() : null}
      </Modal>

      <Modal
        open={!!proofViewerTask}
        title={proofViewerTask ? `Proof: ${proofViewerTask.proof_file_name || proofViewerTask.title || 'Task proof'}` : 'Proof Viewer'}
        onClose={() => setProofViewerTaskId(null)}
        maxWidthClassName="max-w-4xl"
        bodyClassName="!max-h-[90vh]"
      >
        {proofViewerTask ? (() => {
          const proofFiles = parseTaskProofFiles(proofViewerTask);
          return proofFiles.length > 0 ? (
            <div className="space-y-3">
              {proofFiles.map((file, index) => (
                <div key={`${file.proof_file_name}-${index}`} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">File {index + 1}</p>
                    <button
                      type="button"
                      onClick={() => setTaskBriefViewer({ src: file.proof_file_data, fileName: file.proof_file_name, mimeType: file.proof_file_type })}
                      className="text-[10px] font-bold text-teal-600 hover:text-teal-700"
                    >
                      View Full File
                    </button>
                  </div>
                  <ProofAttachment src={file.proof_file_data} fileName={file.proof_file_name} mimeType={file.proof_file_type} compact />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No proof file available.</p>
          );
        })() : (
          <p className="text-sm text-slate-500">No proof file available.</p>
        )}
      </Modal>

      <Modal
        open={!!taskBriefViewer}
        title={taskBriefViewer ? `Task Brief: ${taskBriefViewer.fileName || 'Attachment'}` : 'Task Brief'}
        onClose={() => setTaskBriefViewer(null)}
        maxWidthClassName="max-w-7xl"
      >
        {taskBriefViewer?.src ? (() => {
          const resolvedTaskBriefSrc = normalizeAttachmentSrc(taskBriefViewer.src, taskBriefViewer.mimeType);
          if (!resolvedTaskBriefSrc) {
            return <p className="text-sm text-slate-500">No task brief file available.</p>;
          }

          return (
          <div className="h-[82vh]">
            {isImageMime(taskBriefViewer.mimeType, resolvedTaskBriefSrc) ? (
              <div className="h-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-2 overflow-auto">
                <img
                  src={resolvedTaskBriefSrc}
                  alt={taskBriefViewer.fileName || 'Task brief'}
                  className="max-w-full max-h-full mx-auto object-contain"
                />
              </div>
            ) : isPdfMime(taskBriefViewer.mimeType, resolvedTaskBriefSrc) ? (
              <object
                data={resolvedTaskBriefSrc}
                type="application/pdf"
                className="w-full h-full rounded-lg border border-slate-200 dark:border-slate-700"
              />
            ) : (
              <div className="h-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Preview for this file type is limited.</p>
                  <p className="text-xs text-slate-500 mt-1">Open or download the full file for complete viewing.</p>
                  <div className="mt-3 flex justify-center gap-2">
                    <a
                      href={resolvedTaskBriefSrc}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-teal-deep text-white text-xs font-bold hover:bg-teal-green"
                    >
                      Open Full File
                    </a>
                    <a
                      href={resolvedTaskBriefSrc}
                      download={taskBriefViewer.fileName || undefined}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold"
                    >
                      Download
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
          );
        })() : (
          <p className="text-sm text-slate-500">No task brief file available.</p>
        )}
      </Modal>

      <Modal
        open={needsRevisionModal.open}
        title={needsRevisionModal.taskTitle ? `Needs Revision: ${needsRevisionModal.taskTitle}` : 'Needs Revision'}
        onClose={closeNeedsRevisionModal}
        maxWidthClassName="max-w-xl"
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Specify what needs to be revised before the employee re-submits proof.</p>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
              Revision Instructions <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={4}
              value={needsRevisionModal.note}
              onChange={(event) => setNeedsRevisionModal((prev) => ({ ...prev, note: event.target.value }))}
              disabled={needsRevisionModal.submitting}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-sm"
              placeholder="Example: Add date-stamped evidence and include signed confirmation."
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
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
              className="text-[11px] text-slate-600 dark:text-slate-300"
            />
            {needsRevisionModal.attachment?.file_name && (
              <p className="mt-1 text-[10px] text-slate-500">Attached: {needsRevisionModal.attachment.file_name}</p>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={closeNeedsRevisionModal}
              disabled={needsRevisionModal.submitting}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submitNeedsRevisionModal()}
              disabled={needsRevisionModal.submitting}
              className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 disabled:opacity-60"
            >
              {needsRevisionModal.submitting ? 'Sending...' : 'Send Revision Request'}
            </button>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
};
