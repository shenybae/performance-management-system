import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Plus, X, Download, Search, AlertTriangle, Target, Users, User, Building2, TrendingDown, TrendingUp, FileText, Check, ArrowLeft, Clock, Filter, MessageSquare, DollarSign, Eye, Archive, MoreHorizontal } from 'lucide-react';
import { Employee } from '../../../types';
import { Card } from '../../common/Card';
import { Modal } from '../../common/Modal';
import { SectionHeader } from '../../common/SectionHeader';
import { PIPManager } from './PIPManager';
import { GoalScopePlanManager } from './GoalScopePlanManager';
import { SearchableSelect } from '../../common/SearchableSelect';
import { CircularProgress } from '../../common/CircularProgress';
import { ProofAttachment } from '../../common/ProofAttachment';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend } from 'recharts';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';
import { appConfirm } from '../../../utils/appDialog';
import { io } from 'socket.io-client';

const DEPARTMENTS = ['Accounting/Financing', 'Sales Admin', 'Marketing', 'Pre-Technical', 'Post-Technical', 'Executives'] as const;
const SCOPES = ['Department', 'Team', 'Individual'] as const;
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'] as const;
const STATUSES = ['Not Started', 'In Progress', 'At Risk', 'Completed', 'Cancelled'] as const;
const QUARTERS = ['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026'] as const;
const FREQUENCIES = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annually', 'One-time'] as const;
const COLORS = ['#0f766e', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

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

const parseTaskProofFiles = (task: any): TaskProofFile[] => {
  const rawData = String(task?.proof_image || '').trim();
  const fallbackName = String(task?.proof_file_name || 'Submitted proof').trim();
  const fallbackType = String(task?.proof_file_type || 'application/octet-stream').trim();
  if (!rawData) return [];

  if (rawData.startsWith('[')) {
    try {
      const parsed = JSON.parse(rawData);
      if (Array.isArray(parsed)) {
        return parsed
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

interface OKRPlannerProps {
  employees: Employee[];
}

export const OKRPlanner = ({ employees }: OKRPlannerProps) => {
  const [goals, setGoals] = useState<any[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'Department' | 'Team' | 'Individual'>('Department');
  const [plannerView, setPlannerView] = useState<'overview' | 'analytics' | 'goals'>('goals');
  const [filterDept, setFilterDept] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewGoalId, setViewGoalId] = useState<number | null>(null);
  const [showUnderperforming, setShowUnderperforming] = useState(false);
  // States used by the Underperforming view. Move to top-level to comply with Rules of Hooks.
  const [empFilter, setEmpFilter] = useState('All');
  const [quickEdit, setQuickEdit] = useState<number | null>(null);
  const [editProgress, setEditProgress] = useState(0);
  const [editStatus, setEditStatus] = useState('');
  const [underperfTopTab, setUnderperfTopTab] = useState<'summary'|'table'|'plans'>('summary');
  const [plansNavigator, setPlansNavigator] = useState<'employee' | 'scope'>('employee');
  const [underperfView, setUnderperfView] = useState<'employee'|'team'|'department'>('employee');
  const [underperfScopeFilter, setUnderperfScopeFilter] = useState<'all'|'Department'|'Team'|'Individual'>('all');
  const [underperfQuickFilter, setUnderperfQuickFilter] = useState<'all'|'overdue'|'highPriority'|'stalled'>('all');
  const [underperfActionsGoalId, setUnderperfActionsGoalId] = useState<number | null>(null);
  const [underperfPlanGoalId, setUnderperfPlanGoalId] = useState<number | null>(null);
  const [recoveryTaskCount7d, setRecoveryTaskCount7d] = useState(0);
  const [recoveryTaskOpenGoal, setRecoveryTaskOpenGoal] = useState<number | null>(null);
  const [recoveryTaskSavingGoal, setRecoveryTaskSavingGoal] = useState<number | null>(null);
  const [recoveryTaskDrafts, setRecoveryTaskDrafts] = useState<Record<number, { member_employee_id: string; title: string; description: string; due_date: string; priority: string }>>({});
  const [proofReviewOpenGoal, setProofReviewOpenGoal] = useState<number | null>(null);
  const [proofReviewLoadingGoal, setProofReviewLoadingGoal] = useState<number | null>(null);
  const [proofReviewTasksByGoal, setProofReviewTasksByGoal] = useState<Record<number, any[]>>({});
  const [proofReviewActionsOpen, setProofReviewActionsOpen] = useState<Record<number, boolean>>({});
  const [proofUploadingTaskId, setProofUploadingTaskId] = useState<number | null>(null);
  const [proofUploadNotes, setProofUploadNotes] = useState<Record<number, string>>({});
  const [proofReviewNotes, setProofReviewNotes] = useState<Record<number, string>>({});
  const [proofReviewRatings, setProofReviewRatings] = useState<Record<number, number>>({});
  const [proofReviewSubmittingTaskId, setProofReviewSubmittingTaskId] = useState<number | null>(null);
  const [proofFileViewer, setProofFileViewer] = useState<{ src: string; fileName?: string; mimeType?: string } | null>(null);
  const [lastRealtimeSyncAt, setLastRealtimeSyncAt] = useState<number>(Date.now());
  const [proofRealtimeSyncAt, setProofRealtimeSyncAt] = useState<number>(Date.now());
  const [pendingDeadlineExtensionRequests, setPendingDeadlineExtensionRequests] = useState<any[]>([]);
  const [pendingDeadlineExtensionLoading, setPendingDeadlineExtensionLoading] = useState(false);
  const [pendingDeadlineExtensionDecisionId, setPendingDeadlineExtensionDecisionId] = useState<number | null>(null);
  const [form, setForm] = useState({
    employee_id: '', title: '', statement: '', metric: '', target_date: '',
    scope: '' as string,
    department: '', team_name: '', delegation: '', priority: '', quarter: '', frequency: '', leader_id: '',
    assignee_ids: [] as string[]
  });

  const [usersList, setUsersList] = useState<any[]>([]);

  const defaultForm = {
    employee_id: '', title: '', statement: '', metric: '', target_date: '',
    scope: '' as string,
    department: '', team_name: '', delegation: '', priority: '', quarter: '', frequency: '', leader_id: '',
    assignee_ids: [] as string[]
  };

  useEffect(() => { fetchGoals(); }, [showArchived]);

  useEffect(() => {
    void fetchPendingDeadlineExtensionRequests();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      void fetchPendingDeadlineExtensionRequests();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Real-time polling for goal updates (every 5 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchGoals();
    }, 5000);
    return () => clearInterval(interval);
  }, [showArchived]);

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
        void fetchGoals();
        if (proofReviewOpenGoal) {
          void refreshProofReviewTasks(proofReviewOpenGoal);
        }
      }, 250);
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      socket.disconnect();
    };
  }, [proofReviewOpenGoal, showArchived]);

  useEffect(() => { // fetch current user and all users for Team Leader selection
    (async () => {
      try {
        const acctRes = await fetch('/api/account-info', { headers: getAuthHeaders() });
        if (acctRes.ok) {
          const acctData = await acctRes.json();
          setCurrentUser(acctData);
        }
        const usersRes = await fetch('/api/users', { headers: getAuthHeaders() });
        const usersData = await usersRes.json();
        setUsersList(Array.isArray(usersData) ? usersData : []);
      } catch {
        setUsersList([]);
      }
    })();
  }, []);

  const selectedLeaderEmployeeId = useMemo(() => {
    if (!form.leader_id) return null;
    const row = usersList.find(u => String(u.id) === String(form.leader_id));
    const eid = Number(row?.employee_id);
    return Number.isFinite(eid) && eid > 0 ? eid : null;
  }, [usersList, form.leader_id]);

  const selectedLeaderName = useMemo(() => {
    if (!form.leader_id) return '';
    const row = usersList.find(u => String(u.id) === String(form.leader_id));
    return String(row?.full_name || row?.employee_name || row?.username || '').trim();
  }, [usersList, form.leader_id]);

  const userRole = String(currentUser?.role || '').toLowerCase();
  const isManager = userRole === 'manager';
  const managerDept = String(
    currentUser?.dept ||
    currentUser?.department ||
    currentUser?.employee?.dept ||
    currentUser?.employee_department ||
    ''
  ).trim();
  const isDepartmentLocked = isManager && !!managerDept;

  const employeeById = useMemo(() => {
    const map = new Map<number, Employee>();
    for (const emp of employees) map.set(Number(emp.id), emp);
    return map;
  }, [employees]);

  const getGoalDepartment = (goal: any) => {
    const emp = employeeById.get(Number(goal?.employee_id));
    return String(goal?.department || goal?.dept || emp?.dept || '').trim() || 'Unassigned';
  };

  const getGoalTeam = (goal: any) => {
    const explicit = String(goal?.team_name || goal?.team || '').trim();
    if (explicit) return explicit;
    if (String(goal?.scope || '').trim() === 'Team') {
      return String(goal?.delegation || goal?.leader_name || goal?.employee_name || '').trim() || 'Unassigned Team';
    }
    return 'Unassigned Team';
  };

  const getGoalOwner = (goal: any) => {
    return String(goal?.employee_name || goal?.delegation || goal?.owner_name || '').trim() || 'Unassigned';
  };

  const normalizeGoalScope = (goal: any): 'Department' | 'Team' | 'Individual' => {
    const raw = String(goal?.scope || '').trim().toLowerCase();
    if (raw === 'department' || raw === 'dept-wide' || raw === 'deptwide' || raw === 'dept') return 'Department';
    if (raw === 'team') return 'Team';
    return 'Individual';
  };

  useEffect(() => {
    if (!isDepartmentLocked) return;
    setForm(prev => (prev.department === managerDept ? prev : { ...prev, department: managerDept }));
  }, [isDepartmentLocked, managerDept]);

  const availableAssignees = useMemo(() => {
    let filtered = employees.filter(emp => {
      if (selectedLeaderEmployeeId && emp.id === selectedLeaderEmployeeId) return false;
      return true;
    });
    if (isDepartmentLocked) {
      filtered = filtered.filter(emp => (emp.dept || '').toLowerCase() === managerDept.toLowerCase());
    }
    return filtered;
  }, [employees, selectedLeaderEmployeeId, isDepartmentLocked, managerDept]);

  const teamLeaderOptions = useMemo(() => {
    return usersList
      .filter(u => String(u.role || '') === 'Employee' && Number(u.employee_id) > 0)
      .filter(u => {
        if (!form.department) return true;
        return String(u.employee_dept || '').toLowerCase() === String(form.department).toLowerCase();
      })
      .map(u => ({
        value: String(u.id),
        label: `${u.full_name || u.username || `User ${u.id}`}${u.employee_name ? ` (${u.employee_name})` : ''}`,
        avatarUrl: u.profile_picture || null,
      }));
  }, [usersList, form.department]);

  const selectedAssignees = useMemo(() => {
    const selected = new Set((form.assignee_ids || []).map(String));
    return availableAssignees.filter(emp => selected.has(String(emp.id)));
  }, [availableAssignees, form.assignee_ids]);

  const assigneePickerOptions = useMemo(() => {
    const selected = new Set((form.assignee_ids || []).map(String));
    return availableAssignees
      .filter(emp => !selected.has(String(emp.id)))
      .map(emp => ({
        value: String(emp.id),
        label: `${emp.name}${emp.position ? ` (${emp.position})` : ''}`,
        avatarUrl: (emp as any).profile_picture || null,
      }));
  }, [availableAssignees, form.assignee_ids]);

  useEffect(() => {
    setForm(prev => {
      if (!(prev.scope === 'Team' || prev.scope === 'Department')) return prev;
      const allowed = new Set(availableAssignees.map(e => String(e.id)));
      const nextAssignees = prev.assignee_ids.filter(id => allowed.has(String(id)));
      if (nextAssignees.length === prev.assignee_ids.length) return prev;
      return { ...prev, assignee_ids: nextAssignees };
    });
  }, [availableAssignees]);

  const fetchGoals = async () => {
    try {
      const [goalsRes, recoveryRes] = await Promise.all([
        fetch(`/api/goals?include_archived=${showArchived ? '1' : '0'}`, { headers: getAuthHeaders() }),
        fetch('/api/member-tasks/recovery-metrics?days=7', { headers: getAuthHeaders() })
      ]);

      const goalsData = await goalsRes.json();
      const normalizedGoals = (Array.isArray(goalsData) ? goalsData : []).map((goal: any) => {
        const progress = Math.max(0, Math.min(100, Number(goal?.progress || 0)));
        const statusRaw = String(goal?.status || '').trim();
        const statusLower = statusRaw.toLowerCase();
        const lockedStatus = statusLower === 'completed' || statusLower === 'cancelled' || statusLower === 'at risk';
        const status = lockedStatus
          ? (statusRaw || goal?.status)
          : progress >= 100
            ? 'Completed'
            : progress > 0
              ? 'In Progress'
              : 'Not Started';
        return { ...goal, progress, status };
      });
      setGoals(normalizedGoals);

      if (recoveryRes.ok) {
        const recoveryData = await recoveryRes.json();
        setRecoveryTaskCount7d(Number(recoveryData?.count || 0));
      } else {
        setRecoveryTaskCount7d(0);
      }
      setLastRealtimeSyncAt(Date.now());
    } catch {
      setGoals([]);
      setRecoveryTaskCount7d(0);
      setLastRealtimeSyncAt(Date.now());
    }
  };

  const fetchPendingDeadlineExtensionRequests = async () => {
    setPendingDeadlineExtensionLoading(true);
    try {
      const res = await fetch('/api/deadline-extension-requests/pending', { headers: getAuthHeaders() });
      const data = res.ok ? await res.json() : [];
      setPendingDeadlineExtensionRequests(Array.isArray(data) ? data : []);
    } catch {
      setPendingDeadlineExtensionRequests([]);
    } finally {
      setPendingDeadlineExtensionLoading(false);
    }
  };

  const decideDeadlineExtensionRequest = async (requestId: number, decision: 'approve' | 'reject') => {
    const note = prompt(decision === 'approve' ? 'Approval note (optional):' : 'Rejection note (optional):') || '';
    setPendingDeadlineExtensionDecisionId(requestId);
    try {
      const res = await fetch(`/api/deadline-extension-requests/${requestId}/decision`, {
        method: 'PUT',
        headers: getAuthHeaders(),
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
      await Promise.all([fetchPendingDeadlineExtensionRequests(), fetchGoals()]);
    } catch (e: any) {
      window.notify?.(e?.message || 'Failed to update extension request', 'error');
    } finally {
      setPendingDeadlineExtensionDecisionId(null);
    }
  };

  const handleSubmit = async () => {
    if (!(await appConfirm('Create this goal/OKR?', { title: 'Create Goal', confirmText: 'Create', icon: 'success' }))) return;
    
    const title = form.title.trim();
    const statement = form.statement.trim();
    const metric = form.metric.trim();
    if (!form.scope) { window.notify?.('Please select a goal level', 'error'); return; }
    if (!form.department) { window.notify?.('Please select a department', 'error'); return; }
    if (!title) { window.notify?.('Please enter a goal title', 'error'); return; }
    if (title.length > 120) { window.notify?.('Goal title must be 120 characters or less', 'error'); return; }
    if (!statement) { window.notify?.('Please enter a goal statement', 'error'); return; }
    if (statement.length < 10) { window.notify?.('Goal statement must be at least 10 characters', 'error'); return; }
    if (statement.length > 1000) { window.notify?.('Goal statement must be 1000 characters or less', 'error'); return; }
    if (metric.length > 120) { window.notify?.('Key metric must be 120 characters or less', 'error'); return; }
    if (form.target_date) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const targetDate = new Date(form.target_date);
      if (!Number.isNaN(targetDate.getTime()) && targetDate < today) {
        window.notify?.('Target date cannot be in the past', 'error');
        return;
      }
    }
    if (form.scope === 'Individual' && !form.employee_id) { window.notify?.('Please select an employee for individual goals', 'error'); return; }
    if ((form.scope === 'Team' || form.scope === 'Department') && form.team_name.trim().length > 100) {
      window.notify?.('Team name must be 100 characters or less', 'error');
      return;
    }
    try {
      const leaderIdNum = form.leader_id ? parseInt(String(form.leader_id), 10) : null;
      const assigneeIds = (Array.isArray(form.assignee_ids) ? form.assignee_ids : [])
        .map((id) => parseInt(String(id), 10))
        .filter((id) => Number.isFinite(id) && id > 0);

      if (form.scope === 'Team' || form.scope === 'Department') {
        if (!leaderIdNum) { window.notify?.('Please select a Team Leader', 'error'); return; }
        if (assigneeIds.length === 0) { window.notify?.('Please select at least one team member', 'error'); return; }
        if (selectedLeaderEmployeeId && assigneeIds.includes(selectedLeaderEmployeeId)) {
          window.notify?.('A Team Leader cannot be selected as a team member', 'error');
          return;
        }
      }

      const res = await fetch('/api/goals', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({
          ...form,
          title,
          statement,
          metric,
          delegation: (form.scope === 'Team' || form.scope === 'Department') ? selectedLeaderName : '',
          employee_id: form.employee_id ? parseInt(form.employee_id) : null,
          leader_id: leaderIdNum,
        }),
      });
      if (!res.ok) {
        let msg = 'Failed to review proof';
        try {
          const err = await res.json();
          if (err?.error) msg = String(err.error);
        } catch {}
        throw new Error(msg);
      }

      // Keep leader-member mapping in one place: when creating a Team/Department goal.
      if ((form.scope === 'Team' || form.scope === 'Department') && leaderIdNum && assigneeIds.length > 0) {
        const uniqueMemberIds = [...new Set(assigneeIds)];
        await Promise.allSettled(
          uniqueMemberIds.map((memberId) =>
            fetch('/api/leaders', {
              method: 'POST',
              headers: getAuthHeaders(),
              body: JSON.stringify({ leader_id: leaderIdNum, member_id: memberId }),
            })
          )
        );
      }

      window.notify?.('Goal created successfully', 'success');
      setForm({ ...defaultForm, department: isDepartmentLocked ? managerDept : '' });
      setShowForm(false);
      fetchGoals();
    } catch { window.notify?.('Failed to create goal', 'error'); }
  };

  const handleDelete = async (id: number) => {
    if (!(await appConfirm('Archive this goal?', { title: 'Archive Goal', confirmText: 'Archive', icon: 'archive' }))) return;
    try { await fetch(`/api/goals/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); window.notify?.('Goal archived', 'success'); fetchGoals(); } catch { window.notify?.('Failed to archive', 'error'); }
  };

  const updateGoal = async (id: number, updates: Record<string, any>, silent = true) => {
    try {
      const res = await fetch(`/api/goals/${id}`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify(updates) });
      if (res.ok) { if (!silent) window.notify?.('Goal updated', 'success'); fetchGoals(); }
    } catch { window.notify?.('Failed to update goal', 'error'); }
  };

  const updateRecoveryTaskDraft = (goalId: number, patch: Partial<{ member_employee_id: string; title: string; description: string; due_date: string; priority: string }>) => {
    setRecoveryTaskDrafts(prev => ({
      ...prev,
      [goalId]: {
        member_employee_id: '',
        title: '',
        description: '',
        due_date: '',
        priority: 'High',
        ...(prev[goalId] || {}),
        ...patch,
      }
    }));
  };

  const handleCreateRecoveryTask = async (goal: any) => {
    const goalId = Number(goal?.id || 0);
    if (!goalId) return;

    const draft = recoveryTaskDrafts[goalId] || { member_employee_id: '', title: '', description: '', due_date: '', priority: 'High' };
    const memberId = Number(draft.member_employee_id);
    const title = String(draft.title || '').trim();
    const description = String(draft.description || '').trim();
    const dueDate = String(draft.due_date || '').trim();
    const priority = String(draft.priority || 'High');

    if (!memberId) { window.notify?.('Select a delegated member for the recovery task', 'error'); return; }
    if (!title) { window.notify?.('Enter a recovery task title', 'error'); return; }
    if (!dueDate) { window.notify?.('Set a recovery deadline', 'error'); return; }

    if (!(await appConfirm('Assign this recovery task now?', { title: 'Assign Recovery Task', confirmText: 'Assign', icon: 'warning' }))) return;

    setRecoveryTaskSavingGoal(goalId);
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
        }),
      });
      if (!res.ok) {
        let msg = 'Failed to create recovery task';
        try { const err = await res.json(); msg = err.error || msg; } catch {}
        throw new Error(msg);
      }
      window.notify?.('Recovery task assigned', 'success');
      setRecoveryTaskOpenGoal(null);
      setRecoveryTaskDrafts(prev => {
        const next = { ...prev };
        delete next[goalId];
        return next;
      });
      fetchGoals();
    } catch (e: any) {
      window.notify?.(e?.message || 'Failed to create recovery task', 'error');
    } finally {
      setRecoveryTaskSavingGoal(null);
    }
  };

  const handleCreatePIPFromGoal = async (goal: any) => {
    const goalId = Number(goal?.id || 0);
    const employeeId = Number(goal?.employee_id || 0);
    const title = String(goal?.title || goal?.statement || 'Goal').trim();
    if (!goalId || !employeeId) {
      window.notify?.('PIP can only be created from an individual goal with an owner', 'error');
      return;
    }

    if (!(await appConfirm(`Create a PIP for \"${title}\"?`, { title: 'Create PIP', confirmText: 'Create', icon: 'warning' }))) return;

    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 30);

    try {
      const res = await fetch('/api/pip_plans', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          employee_id: employeeId,
          goal_id: goalId,
          start_date: start.toISOString().slice(0, 10),
          end_date: end.toISOString().slice(0, 10),
          deficiency: `Underperforming goal: ${title}`,
          improvement_objective: `Raise completion performance for ${title}`,
          action_steps: '1) Weekly coaching checkpoints 2) Remove blockers 3) Track progress daily',
          outcome: 'In Progress',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as any));
        throw new Error(err?.error || 'Failed to create PIP');
      }
      window.notify?.('PIP created from goal', 'success');
    } catch (e: any) {
      window.notify?.(e?.message || 'Failed to create PIP', 'error');
    }
  };

  const handleCreateIDPFromGoal = async (goal: any) => {
    const goalId = Number(goal?.id || 0);
    const employeeId = Number(goal?.employee_id || 0);
    const title = String(goal?.title || goal?.statement || 'Goal').trim();
    if (!goalId || !employeeId) {
      window.notify?.('IDP can only be created from an individual goal with an owner', 'error');
      return;
    }

    if (!(await appConfirm(`Create an IDP for \"${title}\"?`, { title: 'Create IDP', confirmText: 'Create', icon: 'info' }))) return;

    try {
      const res = await fetch('/api/development_plans', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          employee_id: employeeId,
          goal_id: goalId,
          skill_gap: `Capability gap observed from goal: ${title}`,
          growth_step: 'Define learning milestones and schedule coaching sessions.',
          step_order: 1,
          status: 'Not Started',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as any));
        throw new Error(err?.error || 'Failed to create IDP');
      }
      window.notify?.('IDP created from goal', 'success');
    } catch (e: any) {
      window.notify?.(e?.message || 'Failed to create IDP', 'error');
    }
  };

  const handleCreateImprovementPlanFromGoal = async (goal: any) => {
    const goalId = Number(goal?.id || 0);
    const scope = normalizeGoalScope(goal);
    const title = String(goal?.title || goal?.statement || 'Goal').trim();
    if (!goalId || !['Team', 'Department'].includes(scope)) {
      window.notify?.('Performance plan can only be created from Team or Department goals', 'error');
      return;
    }

    if (!(await appConfirm(`Create a ${scope} performance plan for \"${title}\"?`, { title: 'Create Performance Plan', confirmText: 'Create', icon: 'warning' }))) return;

    const review = new Date();
    review.setDate(review.getDate() + 30);

    try {
      const res = await fetch('/api/goal_improvement_plans', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          goal_id: goalId,
          plan_title: `${scope} Performance Plan: ${title}`,
          issue_summary: `Underperformance indicators detected for ${title}`,
          improvement_objective: 'Stabilize execution and return to expected progress trajectory.',
          action_steps: '1) Assign ownership 2) Weekly checkpoints 3) Escalate blockers quickly',
          review_date: review.toISOString().slice(0, 10),
          status: 'Not Started',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as any));
        throw new Error(err?.error || 'Failed to create performance plan');
      }
      window.notify?.(`${scope} performance plan created`, 'success');
    } catch (e: any) {
      window.notify?.(e?.message || 'Failed to create performance plan', 'error');
    }
  };

  const handleCreateDevelopmentPlanFromGoal = async (goal: any) => {
    const goalId = Number(goal?.id || 0);
    const scope = normalizeGoalScope(goal);
    const title = String(goal?.title || goal?.statement || 'Goal').trim();
    if (!goalId || !['Team', 'Department'].includes(scope)) {
      window.notify?.('Development plan can only be created from Team or Department goals', 'error');
      return;
    }

    if (!(await appConfirm(`Create a ${scope} development plan for \"${title}\"?`, { title: 'Create Development Plan', confirmText: 'Create', icon: 'info' }))) return;

    const review = new Date();
    review.setDate(review.getDate() + 30);

    try {
      const res = await fetch('/api/goal_development_plans', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          goal_id: goalId,
          plan_title: `${scope} Development Plan: ${title}`,
          skill_focus: `Development focus for ${title}`,
          development_actions: '1) Skills workshops 2) Peer mentoring 3) Monthly capability review',
          review_date: review.toISOString().slice(0, 10),
          status: 'Not Started',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as any));
        throw new Error(err?.error || 'Failed to create development plan');
      }
      window.notify?.(`${scope} development plan created`, 'success');
    } catch (e: any) {
      window.notify?.(e?.message || 'Failed to create development plan', 'error');
    }
  };

  const triggerQuickAction = async (action: string, goal: any, assignees: any[]) => {
    const canEditProgressStatus = !isManager || !managerDept || String(goal?.department || '').trim().toLowerCase() === managerDept.toLowerCase();

    if (action === 'update') {
      if (!canEditProgressStatus) {
        window.notify?.('Managers can only update goals in their own department', 'error');
        return;
      }
      setQuickEdit(goal.id);
      setEditProgress(goal.progress || 0);
      setEditStatus(goal.status || 'In Progress');
      return;
    }

    if (action === 'pip') {
      await handleCreatePIPFromGoal(goal);
      return;
    }
    if (action === 'idp') {
      await handleCreateIDPFromGoal(goal);
      return;
    }
    if (action === 'perf') {
      await handleCreateImprovementPlanFromGoal(goal);
      return;
    }
    if (action === 'dpip') {
      await handleCreateImprovementPlanFromGoal(goal);
      return;
    }
    if (action === 'dev') {
      await handleCreateDevelopmentPlanFromGoal(goal);
      return;
    }
    if (action === 'tdp') {
      await handleCreateDevelopmentPlanFromGoal(goal);
      return;
    }
    if (action === 'recovery') {
      if (!assignees.length) {
        window.notify?.('No assignees available for recovery task', 'error');
        return;
      }
      if (!recoveryTaskDrafts[goal.id]) {
        const due = new Date();
        due.setDate(due.getDate() + 7);
        updateRecoveryTaskDraft(goal.id, {
          member_employee_id: String(assignees[0]?.employee_id || ''),
          title: `Recovery: ${goal.title || goal.statement || 'Goal task'}`,
          due_date: due.toISOString().slice(0, 10),
          priority: 'High',
          description: '',
        });
      }
      setRecoveryTaskOpenGoal(prev => prev === goal.id ? null : goal.id);
      return;
    }
    if (action === 'proofs') {
      await openProofReview(goal.id);
    }
  };

  const openUnderperformingMonitor = () => {
    setUnderperfTopTab('table');
    setShowUnderperforming(true);
  };

  const openUnderperformingPlans = (navigator: 'employee' | 'scope') => {
    setPlansNavigator(navigator);
    setUnderperfTopTab('plans');
    setShowUnderperforming(true);
  };

  const openProofReview = async (goalId: number) => {
    if (proofReviewOpenGoal === goalId) {
      setProofReviewOpenGoal(null);
      return;
    }
    setProofReviewLoadingGoal(goalId);
    try {
      const res = await fetch(`/api/goals/${goalId}/member-tasks`, { headers: getAuthHeaders() });
      if (!res.ok) {
        let msg = 'Failed to load proof tasks';
        try {
          const err = await res.json();
          if (err?.error) msg = String(err.error);
        } catch {}
        throw new Error(msg);
      }
      const data = await res.json();
      const tasks = Array.isArray(data) ? data : [];
      setProofReviewTasksByGoal(prev => ({ ...prev, [goalId]: tasks }));
      setProofReviewRatings((prev) => {
        const next = { ...prev };
        tasks.forEach((task: any) => {
          const existing = Number(next[Number(task?.id)] || 0);
          if (existing > 0) return;
          const rating = Number(task?.proof_review_rating || 0);
          if (rating > 0) next[Number(task?.id)] = rating;
        });
        return next;
      });
      setProofReviewOpenGoal(goalId);
    } catch (e: any) {
      window.notify?.(e?.message || 'Failed to load proof tasks', 'error');
    } finally {
      setProofReviewLoadingGoal(null);
    }
  };

  const refreshProofReviewTasks = async (goalId: number) => {
    try {
      const res = await fetch(`/api/goals/${goalId}/member-tasks`, { headers: getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const tasks = Array.isArray(data) ? data : [];
      setProofReviewTasksByGoal(prev => ({ ...prev, [goalId]: tasks }));
      setProofReviewRatings((prev) => {
        const next = { ...prev };
        tasks.forEach((task: any) => {
          const existing = Number(next[Number(task?.id)] || 0);
          if (existing > 0) return;
          const rating = Number(task?.proof_review_rating || 0);
          if (rating > 0) next[Number(task?.id)] = rating;
        });
        return next;
      });
      setProofRealtimeSyncAt(Date.now());
    } catch {
      // Keep existing panel data if refresh fails.
    }
  };

  const approveGoalCompletion = async (goalId: number) => {
    if (!(await appConfirm('Approve this goal as completed? This will set goal progress to 100%.', { title: 'Manager Goal Approval', confirmText: 'Approve Goal', icon: 'success' }))) return;
    await updateGoal(goalId, { status: 'Completed', progress: 100 }, false);
    if (proofReviewOpenGoal === goalId) {
      await refreshProofReviewTasks(goalId);
    }
  };

  const reviewGoalFinalProof = async (goalId: number, status: 'Approved' | 'Needs Revision' | 'Rejected') => {
    const actionText = status === 'Approved' ? 'approve' : status === 'Needs Revision' ? 'request revision for' : 'reject';
    if (!(await appConfirm(`Are you sure you want to ${actionText} the final proof?`, { title: 'Confirm Final Proof Decision', confirmText: 'Confirm', icon: 'warning' }))) return;

    const note = String(proofReviewNotes[goalId] || '').trim();
    const rating = Math.max(1, Math.min(5, Number(proofReviewGoal?.proof_review_rating || proofReviewRatings[goalId] || 5)));
    setProofReviewSubmittingTaskId(goalId);
    try {
      const res = await fetch(`/api/goals/${goalId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ proof_review_status: status, proof_review_note: note, proof_review_rating: rating })
      });
      if (!res.ok) {
        let msg = 'Failed to review final proof';
        try {
          const err = await res.json();
          if (err?.error) msg = String(err.error);
        } catch {}
        throw new Error(msg);
      }
      window.notify?.(`Final proof ${status.toLowerCase()}`, 'success');
      await Promise.all([fetchGoals(), refreshProofReviewTasks(goalId)]);
    } catch (e: any) {
      window.notify?.(e?.message || 'Failed to review final proof', 'error');
    } finally {
      setProofReviewSubmittingTaskId(null);
    }
  };

  // Keep proof review panel synced in real time while it is open.
  useEffect(() => {
    if (!proofReviewOpenGoal) return;
    const interval = setInterval(() => {
      void refreshProofReviewTasks(proofReviewOpenGoal);
    }, 5000);
    return () => clearInterval(interval);
  }, [proofReviewOpenGoal]);

  const reviewTaskProof = async (taskId: number, goalId: number, status: 'Approved' | 'Needs Revision' | 'Rejected') => {
    const actionText = status === 'Approved' ? 'approve' : status === 'Needs Revision' ? 'request revision for' : 'reject';
    if (!(await appConfirm(`Are you sure you want to ${actionText} this proof?`, { title: 'Confirm Proof Decision', confirmText: 'Confirm', icon: 'warning' }))) return;

    const note = String(proofReviewNotes[taskId] || '').trim();
    const task = (proofReviewTasksByGoal[goalId] || []).find((item: any) => Number(item?.id) === Number(taskId));
    const rating = Math.max(1, Math.min(5, Number(task?.proof_review_rating || proofReviewRatings[taskId] || 5)));
    const isCurrentManager = userRole === 'manager';
    setProofReviewSubmittingTaskId(taskId);
    try {
      const res = await fetch(`/api/member-tasks/${taskId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ proof_review_status: status, proof_review_note: note, proof_review_rating: rating })
      });
      if (!res.ok) throw new Error('Failed');
      setProofReviewTasksByGoal(prev => ({
        ...prev,
        [goalId]: (prev[goalId] || []).map((task: any) => {
          if (Number(task?.id) !== Number(taskId)) return task;
          if (status === 'Approved') {
            return {
              ...task,
              proof_review_status: status,
              proof_review_note: note,
              proof_review_rating: rating,
              status: isCurrentManager ? 'Completed' : 'In Progress',
              progress: isCurrentManager ? 100 : Math.max(Number(task?.progress || 0), 75)
            };
          }
          if (status === 'Needs Revision') {
            const currentProgress = Math.max(0, Math.min(100, Number(task?.progress || 0)));
            return { ...task, proof_review_status: status, proof_review_note: note, proof_review_rating: rating, status: 'In Progress', progress: currentProgress >= 75 ? 75 : Math.max(currentProgress, 50) };
          }
          const currentProgress = Math.max(0, Math.min(100, Number(task?.progress || 0)));
          return { ...task, proof_review_status: status, proof_review_note: note, proof_review_rating: rating, status: 'Blocked', progress: Math.min(currentProgress, 50) };
        })
      }));
      window.notify?.(`Proof ${status.toLowerCase()}`, 'success');
      await refreshProofReviewTasks(goalId);
    } catch (e: any) {
      window.notify?.(e?.message || 'Failed to review proof', 'error');
      await refreshProofReviewTasks(goalId);
    } finally {
      setProofReviewSubmittingTaskId(null);
    }
  };

  const uploadTaskProof = async (taskId: number, goalId: number, file: File, note: string) => {
    setProofUploadingTaskId(taskId);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = String(e.target?.result || '');
        const res = await fetch(`/api/member-tasks/${taskId}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            proof_image: base64,
            proof_file_name: file.name,
            proof_file_type: file.type || 'application/octet-stream',
            proof_note: note,
            proof_submitted_at: new Date().toISOString()
          })
        });
        if (!res.ok) throw new Error('Failed to upload proof');
        window.notify?.('Proof uploaded successfully', 'success');
        await refreshProofReviewTasks(goalId);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      window.notify?.(err?.message || 'Failed to upload proof', 'error');
    } finally {
      setProofUploadingTaskId(null);
    }
  };

  const statusColor = (s: string) => {
    if (s === 'Completed') return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800';
    if (s === 'In Progress') return 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800';
    if (s === 'At Risk') return 'text-red-600 bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800';
    if (s === 'Cancelled') return 'text-slate-400 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
    return 'text-slate-500 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
  };

  const priorityColor = (p: string) => {
    if (p === 'Critical') return 'text-red-700 bg-red-100 dark:bg-red-900/40';
    if (p === 'High') return 'text-orange-700 bg-orange-100 dark:bg-orange-900/40';
    if (p === 'Medium') return 'text-blue-700 bg-blue-100 dark:bg-blue-900/40';
    return 'text-slate-500 bg-slate-100 dark:bg-slate-800';
  };

  const progressBarColor = (p: number) => {
    if (p >= 100) return 'bg-emerald-500';
    if (p >= 50) return 'bg-teal-500';
    if (p >= 25) return 'bg-amber-500';
    return 'bg-red-500';
  };

  const autoStatusFromProgress = (progress: number): string => {
    if (progress === 100) return 'Completed';
    if (progress > 0) return 'In Progress';
    return 'Not Started';
  };

  const scopeStyleMap: Record<string, { bg: string; text: string; iconBg: string; border: string }> = {
    Department: { bg: 'bg-teal-600/10', text: 'text-teal-600 dark:text-teal-400', iconBg: 'bg-teal-600/15 dark:bg-teal-500/15', border: 'border-teal-500 dark:border-teal-400' },
    Team: { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', iconBg: 'bg-blue-500/15 dark:bg-blue-400/15', border: 'border-blue-500 dark:border-blue-400' },
    Individual: { bg: 'bg-indigo-500/10', text: 'text-indigo-600 dark:text-indigo-400', iconBg: 'bg-indigo-500/15 dark:bg-indigo-400/15', border: 'border-indigo-500 dark:border-indigo-400' },
  };

  // Filtered goals
  const filtered = useMemo(() => {
    return goals.filter(g => {
      const isArchived = !!g.deleted_at;
      if (!showArchived && isArchived) return false;
      const scope = g.scope || 'Individual';
      if (scope !== activeTab) return false;
      if (filterDept && filterDept !== 'All' && g.department !== filterDept) return false;
      if (filterStatus && filterStatus !== 'All' && g.status !== filterStatus) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return (g.title || '').toLowerCase().includes(q) || (g.statement || '').toLowerCase().includes(q) ||
          (g.employee_name || '').toLowerCase().includes(q) || (g.department || '').toLowerCase().includes(q) ||
          (g.team_name || '').toLowerCase().includes(q) || (g.delegation || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [goals, activeTab, filterDept, filterStatus, searchTerm, showArchived]);

  const proofReviewGoal = useMemo(() => {
    if (!proofReviewOpenGoal) return null;
    return goals.find((goal: any) => Number(goal?.id) === Number(proofReviewOpenGoal)) || null;
  }, [goals, proofReviewOpenGoal]);

  // Underperforming metrics
  const underperforming = useMemo(() => {
    const now = new Date();
    return goals.filter(g => {
      const normalizedScope = normalizeGoalScope(g);
      if (g.status === 'Completed' || g.status === 'Cancelled') return false;
      const progress = g.progress || 0;
      if (g.status === 'At Risk') return true;
      if (g.target_date && new Date(g.target_date) < now && progress < 100) return true;
      if ((g.priority === 'Critical' || g.priority === 'High') && progress < 25 && g.target_date) {
        const created = new Date(g.created_at || now);
        const due = new Date(g.target_date);
        const total = due.getTime() - created.getTime();
        const elapsed = now.getTime() - created.getTime();
        if (total > 0 && elapsed / total > 0.5) return true;
      }
      if ((normalizedScope === 'Team' || normalizedScope === 'Department') && g.target_date) {
        const created = new Date(g.created_at || now);
        const due = new Date(g.target_date);
        const total = due.getTime() - created.getTime();
        const elapsed = now.getTime() - created.getTime();
        if (total > 0 && elapsed / total > 0.35 && progress < 35) return true;
      }
      if (progress < 10 && g.status === 'In Progress') return true;
      return false;
    });
  }, [goals]);

  // Aggregations for underperforming metrics by employee, team, department
  const underperfAggregations = useMemo(() => {
    const now = new Date();
    const msDay = 1000 * 60 * 60 * 24;

    const classifyReasons = (g: any) => {
      const reasons: string[] = [];
      const progress = Number(g.progress || 0);
      if (g.status === 'At Risk') reasons.push('AT RISK');
      if (g.target_date && new Date(g.target_date) < now && progress < 100) reasons.push('OVERDUE');
      if ((g.priority === 'Critical' || g.priority === 'High') && progress < 25 && g.target_date) {
        const created = new Date(g.created_at || now);
        const due = new Date(g.target_date);
        const total = due.getTime() - created.getTime();
        const elapsed = now.getTime() - created.getTime();
        if (total > 0 && elapsed / total > 0.5) reasons.push('HIGH_PRIORITY_DELAY');
      }
      if (progress < 10 && g.status === 'In Progress') reasons.push('STALLED');
      if (reasons.length === 0) reasons.push('OTHER');
      return reasons;
    };

    const empMap = new Map<string, any>();
    const teamMap = new Map<string, any>();
    const deptMap = new Map<string, any>();

    // initialize totals from all goals
    for (const g of goals) {
      const emp = getGoalOwner(g);
      const team = getGoalTeam(g);
      const dept = getGoalDepartment(g);
      const progress = Number(g.progress || 0);

      if (!empMap.has(emp)) empMap.set(emp, { name: emp, total: 0, progressSum: 0, under: 0, overdueDaysSum: 0, reasons: {} });
      const e = empMap.get(emp);
      e.total++;
      e.progressSum += progress;

      if (!teamMap.has(team)) teamMap.set(team, { name: team, total: 0, progressSum: 0, under: 0, overdueDaysSum: 0, reasons: {} });
      const t = teamMap.get(team);
      t.total++;
      t.progressSum += progress;

      if (!deptMap.has(dept)) deptMap.set(dept, { name: dept, total: 0, progressSum: 0, under: 0, overdueDaysSum: 0, reasons: {} });
      const d = deptMap.get(dept);
      d.total++;
      d.progressSum += progress;
    }

    // fill underperforming-specific counts
    for (const g of underperforming) {
      const emp = getGoalOwner(g);
      const team = getGoalTeam(g);
      const dept = getGoalDepartment(g);
      const reasons = classifyReasons(g);
      const days = (g.target_date && new Date(g.target_date) < now) ? Math.ceil((now.getTime() - new Date(g.target_date).getTime()) / msDay) : 0;

      const e = empMap.get(emp) || { name: emp, total: 0, progressSum: 0, under: 0, overdueDaysSum: 0, reasons: {} };
      e.under = (e.under || 0) + 1;
      e.overdueDaysSum = (e.overdueDaysSum || 0) + days;
      for (const r of reasons) e.reasons[r] = (e.reasons[r] || 0) + 1;
      empMap.set(emp, e);

      const t = teamMap.get(team) || { name: team, total: 0, progressSum: 0, under: 0, overdueDaysSum: 0, reasons: {} };
      t.under = (t.under || 0) + 1;
      t.overdueDaysSum = (t.overdueDaysSum || 0) + days;
      for (const r of reasons) t.reasons[r] = (t.reasons[r] || 0) + 1;
      teamMap.set(team, t);

      const d = deptMap.get(dept) || { name: dept, total: 0, progressSum: 0, under: 0, overdueDaysSum: 0, reasons: {} };
      d.under = (d.under || 0) + 1;
      d.overdueDaysSum = (d.overdueDaysSum || 0) + days;
      for (const r of reasons) d.reasons[r] = (d.reasons[r] || 0) + 1;
      deptMap.set(dept, d);
    }

    const mapToArray = (m: Map<string, any>) => Array.from(m.values()).map(v => ({
      name: v.name,
      total: v.total || 0,
      under: v.under || 0,
      pctUnder: v.total > 0 ? Math.round(100 * (v.under || 0) / v.total) : 0,
      avgProgress: v.total > 0 ? Math.round((v.progressSum || 0) / v.total) : 0,
      avgDaysOverdue: (v.under || 0) > 0 ? Math.round((v.overdueDaysSum || 0) / (v.under || 0)) : 0,
      reasons: v.reasons || {}
    })).sort((a: any, b: any) => b.under - a.under);

    const employeesAgg = mapToArray(empMap);
    const teamsAgg = mapToArray(teamMap).filter((row: any) => row.total > 0);
    const departmentsAgg = mapToArray(deptMap).filter((row: any) => row.total > 0);
    return { employees: employeesAgg, teams: teamsAgg, departments: departmentsAgg };
  }, [goals, underperforming, employeeById]);

  // Stats
  const stats = useMemo(() => {
    const total = goals.length;
    const completed = goals.filter(g => g.status === 'Completed').length;
    const atRisk = goals.filter(g => g.status === 'At Risk').length;
    const avgProgress = total > 0 ? Math.round(goals.reduce((s, g) => s + (g.progress || 0), 0) / total) : 0;
    const byDept: Record<string, { total: number; completed: number; avgProg: number }> = {};
    DEPARTMENTS.forEach(d => { byDept[d] = { total: 0, completed: 0, avgProg: 0 }; });
    goals.forEach(g => {
      const dept = g.department;
      if (dept && byDept[dept]) {
        byDept[dept].total++;
        if (g.status === 'Completed') byDept[dept].completed++;
        byDept[dept].avgProg += (g.progress || 0);
      }
    });
    Object.values(byDept).forEach(v => { if (v.total > 0) v.avgProg = Math.round(v.avgProg / v.total); });
    return { total, completed, atRisk, avgProgress, byDept, underperformingCount: underperforming.length };
  }, [goals, underperforming]);

  // Scope-based stats for hero cards
  const scopeStats = useMemo(() => {
    return SCOPES.map(scope => {
      const scopeGoals = goals.filter(g => (g.scope || 'Individual') === scope);
      const total = scopeGoals.length;
      const completed = scopeGoals.filter(g => g.status === 'Completed').length;
      const inProgress = scopeGoals.filter(g => g.status === 'In Progress').length;
      const atRisk = scopeGoals.filter(g => g.status === 'At Risk').length;
      const notStarted = total - completed - inProgress - atRisk;
      const avgProgress = total > 0
        ? Math.round(scopeGoals.reduce((s, g) => s + (g.progress || 0), 0) / total)
        : 0;
      const owners = [...new Set(scopeGoals.map(g => g.delegation).filter(Boolean))] as string[];
      return { scope, total, completed, inProgress, atRisk, notStarted: Math.max(0, notStarted), avgProgress, owners };
    });
  }, [goals]);

  // Chart data
  const deptChartData = DEPARTMENTS.map(d => ({
    name: d.length > 12 ? d.slice(0, 12) + '\u2026' : d,
    fullName: d,
    total: stats.byDept[d]?.total || 0,
    completed: stats.byDept[d]?.completed || 0,
    progress: stats.byDept[d]?.avgProg || 0,
  }));

  const scopePieData = [
    { name: 'Department', value: goals.filter(g => (g.scope || 'Individual') === 'Department').length },
    { name: 'Team', value: goals.filter(g => g.scope === 'Team').length },
    { name: 'Individual', value: goals.filter(g => (g.scope || 'Individual') === 'Individual').length },
  ].filter(d => d.value > 0);

  const statusPieData = STATUSES.map(s => ({ name: s, value: goals.filter(g => (g.status || 'Not Started') === s).length })).filter(d => d.value > 0);

  const FREQ_META: Record<string, { color: string; bg: string; ring: string; icon: string }> = {
    Daily:     { color: '#8b5cf6', bg: 'bg-violet-50 dark:bg-violet-900/20',  ring: 'ring-violet-300 dark:ring-violet-700', icon: 'D' },
    Weekly:    { color: '#0ea5e9', bg: 'bg-sky-50 dark:bg-sky-900/20',        ring: 'ring-sky-300 dark:ring-sky-700',      icon: 'W' },
    Monthly:   { color: '#0f766e', bg: 'bg-teal-50 dark:bg-teal-900/20',      ring: 'ring-teal-300 dark:ring-teal-700',    icon: 'M' },
    Quarterly: { color: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-900/20',    ring: 'ring-amber-300 dark:ring-amber-700',  icon: 'Q' },
    Annually:  { color: '#ef4444', bg: 'bg-red-50 dark:bg-red-900/20',        ring: 'ring-red-300 dark:ring-red-700',      icon: 'A' },
    'One-time':{ color: '#64748b', bg: 'bg-slate-50 dark:bg-slate-800',       ring: 'ring-slate-200 dark:ring-slate-700',  icon: '1x' },
  };

  const freqChartData = FREQUENCIES.map(f => {
    const fg = goals.filter(g => (g.frequency || 'One-time') === f);
    const total = fg.length;
    const completed = fg.filter(g => g.status === 'Completed').length;
    const inProg = fg.filter(g => g.status === 'In Progress').length;
    const atRisk = fg.filter(g => g.status === 'At Risk').length;
    const avgProg = total > 0 ? Math.round(fg.reduce((s, g) => s + (g.progress || 0), 0) / total) : 0;
    return { name: f, total, completed, inProg, atRisk, avgProg, color: FREQ_META[f]?.color || '#64748b' };
  }).filter(d => d.total > 0);

  const exportGoalPdf = async (g: any) => {
    if (!(await appConfirm('Export this goal as PDF?', { title: 'Export Goal PDF', confirmText: 'Export', icon: 'export' }))) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>OKR - ${g.title}</title><style>
      body{font-family:Arial,Helvetica,sans-serif;padding:40px;color:#1e293b;max-width:800px;margin:0 auto}
      h1{font-size:20px;border-bottom:2px solid #0f766e;padding-bottom:8px}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}
      .field{margin-bottom:8px}.label{font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;display:block}.val{font-size:13px;margin-top:2px}
      .bar{height:8px;background:#e2e8f0;border-radius:4px;margin-top:4px}.fill{height:100%;background:#0f766e;border-radius:4px}
      .badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700}
    </style></head><body>
    <h1>OKR / Goal: ${g.title || g.statement}</h1>
    <div class="grid">
      <div class="field"><span class="label">Goal Level</span><span class="val">${g.scope === 'Department' ? 'Dept-wide' : g.scope === 'Team' ? 'Team' : 'Individual'}</span></div>
      <div class="field"><span class="label">Department</span><span class="val">${g.department || '\u2014'}</span></div>
      <div class="field"><span class="label">Team</span><span class="val">${g.team_name || '\u2014'}</span></div>
      <div class="field"><span class="label">Assigned To</span><span class="val">${g.employee_name || '\u2014'}</span></div>
      <div class="field"><span class="label">Team Leader (Owner)</span><span class="val">${g.delegation || '\u2014'}</span></div>
      <div class="field"><span class="label">Priority</span><span class="val">${g.priority || 'Medium'}</span></div>
      <div class="field"><span class="label">Quarter</span><span class="val">${g.quarter || '\u2014'}</span></div>
      <div class="field"><span class="label">Frequency</span><span class="val">${g.frequency || 'One-time'}</span></div>
      <div class="field"><span class="label">Target Date</span><span class="val">${g.target_date || '\u2014'}</span></div>
      <div class="field"><span class="label">Status</span><span class="val"><span class="badge">${g.status || 'Not Started'}</span></span></div>
      <div class="field"><span class="label">Key Metric</span><span class="val">${g.metric || '\u2014'}</span></div>
    </div>
    <div class="field"><span class="label">Goal Statement</span><p class="val">${g.statement || ''}</p></div>
    <div class="field"><span class="label">Progress</span><div class="bar"><div class="fill" style="width:${g.progress || 0}%"></div></div><span style="font-size:11px;color:#64748b">${g.progress || 0}%</span></div>
    </body></html>`);
    w.document.close();
    setTimeout(() => {
      w.print();
      try { fetch('/api/activity', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ action: 'export_pdf', description: `OKR PDF — ${g.title || g.statement}`, entity: 'goal', entity_id: g.id || null, meta: { source: 'OKRPlanner' } }) }).catch(() => {}); } catch {};
    }, 300);
  };

  const inp = "w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-black rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-green/50";

  /* ─── UNDERPERFORMING FULL-SCREEN VIEW ─── */
  if (showUnderperforming) {
    const now = new Date();
    const daysOverdue = (d: string) => { const diff = Math.ceil((now.getTime() - new Date(d).getTime()) / (1000 * 60 * 60 * 24)); return diff > 0 ? diff : 0; };
    const uniqueEmployees = [...new Set(underperforming.map(g => getGoalOwner(g)).filter(Boolean))];

    const baseDisplayGoals = empFilter === 'All'
      ? underperforming
      : underperforming.filter(g => getGoalOwner(g) === empFilter);

    const employeeFilterOptions = [
      { value: 'All', label: `All Employees (${underperforming.length})` },
      ...uniqueEmployees.map((n) => ({ value: n, label: `${n} (${underperforming.filter(g => getGoalOwner(g) === n).length})` })),
    ];

    const scopeFilterOptions = [
      { value: 'all', label: 'All Scopes' },
      { value: 'Department', label: 'Dept-wide' },
      { value: 'Team', label: 'Team' },
      { value: 'Individual', label: 'Individual' },
    ];

    const quickFilterOptions = [
      { value: 'all', label: `All (${baseDisplayGoals.length})` },
      { value: 'overdue', label: `Overdue (${baseDisplayGoals.filter(g => g.target_date && new Date(g.target_date) < now).length})` },
      { value: 'highPriority', label: `High Priority (${baseDisplayGoals.filter(g => g.priority === 'Critical' || g.priority === 'High').length})` },
      { value: 'stalled', label: `Stalled (${baseDisplayGoals.filter(g => (g.progress || 0) <= 10 && g.status === 'In Progress').length})` },
    ];

    const displayGoals = baseDisplayGoals.filter(g => {
      const scopeLabel = normalizeGoalScope(g);
      const isOverdue = !!(g.target_date && new Date(g.target_date) < now);
      const isHighPriority = g.priority === 'Critical' || g.priority === 'High';
      const isStalled = (g.progress || 0) <= 10 && g.status === 'In Progress';
      if (underperfScopeFilter !== 'all' && scopeLabel !== underperfScopeFilter) return false;
      if (underperfQuickFilter === 'overdue') return isOverdue;
      if (underperfQuickFilter === 'highPriority') return isHighPriority;
      if (underperfQuickFilter === 'stalled') return isStalled;
      return true;
    });

    const filteredActiveGoals = goals.filter((g: any) => {
      if (g.status === 'Completed' || g.status === 'Cancelled') return false;
      if (underperfScopeFilter !== 'all' && normalizeGoalScope(g) !== underperfScopeFilter) return false;
      const isOverdue = !!(g.target_date && new Date(g.target_date) < now);
      const isHighPriority = g.priority === 'Critical' || g.priority === 'High';
      const isStalled = (g.progress || 0) <= 10 && g.status === 'In Progress';
      if (underperfQuickFilter === 'overdue') return isOverdue;
      if (underperfQuickFilter === 'highPriority') return isHighPriority;
      if (underperfQuickFilter === 'stalled') return isStalled;
      return true;
    });

    const hasTeamInDisplay = displayGoals.some((g: any) => normalizeGoalScope(g) === 'Team');
    const hasDeptInDisplay = displayGoals.some((g: any) => normalizeGoalScope(g) === 'Department');

    const seededScopeRows: any[] = [];
    if ((underperfScopeFilter === 'all' || underperfScopeFilter === 'Team') && !hasTeamInDisplay) {
      const teamSeed = filteredActiveGoals
        .filter((g: any) => normalizeGoalScope(g) === 'Team')
        .sort((a: any, b: any) => Number(a.progress || 0) - Number(b.progress || 0))[0];
      if (teamSeed) {
        seededScopeRows.push({ ...teamSeed, __seedUnderperfRow: true });
      } else {
        seededScopeRows.push({
          id: -10001,
          title: 'TEST Team Goal - Improve Weekly Close Rate',
          scope: 'Team',
          department: managerDept || 'Sales Admin',
          team_name: 'Revenue Ops Team',
          delegation: 'Team Lead (Test)',
          employee_name: 'Team Lead (Test)',
          assignees: [{ employee_id: -10002, name: 'Team Member (Test)' }],
          priority: 'High',
          progress: 18,
          status: 'In Progress',
          target_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          __seedUnderperfRow: true,
          __syntheticScopeSeed: true,
        });
      }
    }
    if ((underperfScopeFilter === 'all' || underperfScopeFilter === 'Department') && !hasDeptInDisplay) {
      const deptSeed = filteredActiveGoals
        .filter((g: any) => normalizeGoalScope(g) === 'Department')
        .sort((a: any, b: any) => Number(a.progress || 0) - Number(b.progress || 0))[0];
      if (deptSeed && !seededScopeRows.some((g: any) => Number(g.id) === Number(deptSeed.id))) {
        seededScopeRows.push({ ...deptSeed, __seedUnderperfRow: true });
      }
    }

    const monitorDisplayGoals = [
      ...displayGoals,
      ...seededScopeRows.filter((seed: any) => !displayGoals.some((g: any) => Number(g.id) === Number(seed.id))),
    ];

    // Priority heatmap data
    const heatmapData: Record<string, Record<string, number>> = {};
    ['Critical', 'High', 'Medium', 'Low'].forEach(p => { heatmapData[p] = { OVERDUE: 0, 'AT RISK': 0, STALLED: 0 }; });
    underperforming.forEach(g => {
      const p = g.priority || 'Medium';
      if (!heatmapData[p]) return;
      if (g.target_date && new Date(g.target_date) < now) heatmapData[p].OVERDUE++;
      if (g.status === 'At Risk') heatmapData[p]['AT RISK']++;
      if ((g.progress || 0) <= 10 && g.status === 'In Progress') heatmapData[p].STALLED++;
    });
    const heatColor = (v: number) => v === 0 ? 'bg-slate-50 dark:bg-slate-800/50 text-slate-300 dark:text-slate-600' : v <= 2 ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
    const underperfActionsGoal = underperfActionsGoalId
      ? (monitorDisplayGoals.find((goal: any) => Number(goal?.id) === Number(underperfActionsGoalId)) || goals.find((goal: any) => Number(goal?.id) === Number(underperfActionsGoalId)) || null)
      : null;
    const underperfPlanGoal = underperfPlanGoalId
      ? (monitorDisplayGoals.find((goal: any) => Number(goal?.id) === Number(underperfPlanGoalId)) || goals.find((goal: any) => Number(goal?.id) === Number(underperfPlanGoalId)) || null)
      : null;

    const goalModals = (
      <>
        <Modal
          open={!!viewGoalId}
          title="Goal Details"
          onClose={() => setViewGoalId(null)}
          maxWidthClassName="max-w-7xl"
          bodyClassName="space-y-4"
        >
          {viewGoalId && (() => {
            const g = goals.find((goal: any) => Number(goal?.id) === Number(viewGoalId));
            if (!g) return <p className="text-sm text-slate-500">Goal not found.</p>;
            const overdue = g.target_date && new Date(g.target_date) < new Date() && g.status !== 'Completed' && g.status !== 'Cancelled';
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 text-xs">
                  <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Goal Level</span><span className="text-slate-700 dark:text-slate-200">{g.scope === 'Department' ? 'Dept-wide' : g.scope === 'Team' ? 'Team' : 'Individual'}</span></div>
                  <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Department</span><span className="text-slate-700 dark:text-slate-200">{g.department || '\u2014'}</span></div>
                  <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Team</span><span className="text-slate-700 dark:text-slate-200">{g.team_name || '\u2014'}</span></div>
                  <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Employee</span><div className="min-w-0"><span className="text-slate-700 dark:text-slate-200 truncate max-w-[220px]" title={g.employee_name || '\u2014'}>{g.employee_name || '\u2014'}</span></div></div>
                  <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Quarter</span><span className="text-slate-700 dark:text-slate-200">{g.quarter || '\u2014'}</span></div>
                  <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Frequency</span><span className="text-slate-700 dark:text-slate-200">{g.frequency || 'One-time'}</span></div>
                  <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Team Leader</span><span className="text-slate-700 dark:text-slate-200">{g.leader_name || '\u2014'}</span></div>
                  <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Target Date</span><span className={`${overdue ? 'text-red-600 font-bold' : 'text-slate-700 dark:text-slate-200'}`}>{g.target_date || '\u2014'}</span></div>
                </div>

                <div className="flex items-center justify-end">
                  <button
                    onClick={() => void openProofReview(Number(g.id))}
                    className="h-8 px-2.5 rounded-lg text-[10px] font-bold border transition-colors bg-blue-50 dark:bg-blue-900/25 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                  >
                    Open Proof Review
                  </button>
                </div>
              </div>
            );
          })()}
        </Modal>

        <Modal
          open={!!proofReviewOpenGoal}
          title={`Task Proof Review${proofReviewGoal?.title ? ` - ${proofReviewGoal.title}` : ''}`}
          onClose={() => setProofReviewOpenGoal(null)}
          maxWidthClassName="max-w-7xl"
          bodyClassName="space-y-3"
        >
          {proofReviewOpenGoal && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-100 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-900/20 px-3 py-2">
                <p className="text-xs font-bold text-blue-700 dark:text-blue-300">Live sync every 5s • Last sync {Math.max(0, Math.floor((Date.now() - proofRealtimeSyncAt) / 1000))}s ago</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => void refreshProofReviewTasks(proofReviewOpenGoal)} className="text-[11px] font-bold px-2.5 py-1.5 rounded bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30">Refresh proofs</button>
                </div>
              </div>

              {proofReviewGoal && (() => {
                const goalProofFiles = parseGoalProofFiles(proofReviewGoal);
                const goalProofStatus = String(proofReviewGoal.proof_review_status || 'Not Submitted');
                const goalProofApproved = goalProofStatus === 'Approved';
                const goalProofReviewerRole = String((proofReviewGoal as any).proof_reviewer_role || (proofReviewGoal as any).proof_reviewed_role || '').trim().toLowerCase();
                const goalProofStatusLabel = goalProofApproved ? (goalProofReviewerRole === 'manager' ? 'Approved by Team Leader and Manager' : goalProofReviewerRole === 'team_leader' ? 'Approved by Team Leader' : 'Approved') : goalProofStatus;
                const hasGoalProof = goalProofFiles.length > 0;
                return (
                  <div className="rounded-lg border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-900/15 p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Final Goal Proof</p>
                        <p className="text-[10px] text-emerald-700/80 dark:text-emerald-300/80">Manager review actions are applied to this final proof.</p>
                      </div>
                      <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${goalProofStatus === 'Approved' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : goalProofStatus === 'Pending Review' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : goalProofStatus === 'Needs Revision' || goalProofStatus === 'Rejected' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'}`}>
                        {goalProofStatusLabel}
                      </span>
                    </div>

                    {!hasGoalProof ? (
                      <p className="text-[11px] text-slate-500">No final proof has been submitted yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {goalProofFiles.map((file, fileIndex) => (
                          <div key={`${proofReviewGoal.id}-goal-proof-${fileIndex}`} className="rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-white dark:bg-slate-900 p-2">
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate">{file.proof_file_name || `Final proof ${fileIndex + 1}`}</p>
                              <button
                                type="button"
                                onClick={() => setProofFileViewer({ src: String(file.proof_file_data || ''), fileName: file.proof_file_name, mimeType: file.proof_file_type })}
                                className="text-[10px] font-bold text-teal-600 hover:text-teal-700"
                              >
                                View Full File
                              </button>
                            </div>
                            <ProofAttachment src={file.proof_file_data} fileName={file.proof_file_name} mimeType={file.proof_file_type} compact />
                          </div>
                        ))}
                      </div>
                    )}

                    {proofReviewGoal.proof_note && <p className="text-[10px] text-slate-600 dark:text-slate-300"><span className="font-bold">Note:</span> {proofReviewGoal.proof_note}</p>}
                    {proofReviewGoal.proof_submitted_at && <p className="text-[10px] text-slate-500">Submitted: {new Date(proofReviewGoal.proof_submitted_at).toLocaleDateString()}</p>}
                    {proofReviewGoal.proof_review_note && <p className="text-[10px] text-slate-500 italic">Latest manager note: {proofReviewGoal.proof_review_note}</p>}
                    {goalProofApproved && Number(proofReviewGoal.proof_review_rating || 0) > 0 && <p className="text-[10px] text-slate-500">Latest manager rating: <span className="font-bold">{Number(proofReviewGoal.proof_review_rating || 0)}/5</span></p>}

                    {hasGoalProof && (
                      <div className="space-y-2">
                        <textarea
                          rows={2}
                          value={proofReviewNotes[proofReviewGoal.id] ?? String(proofReviewGoal.proof_review_note || '')}
                          onChange={(e) => setProofReviewNotes(prev => ({ ...prev, [proofReviewGoal.id]: e.target.value }))}
                          className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]"
                          placeholder="Final proof review note (optional)"
                          disabled={proofReviewSubmittingTaskId === proofReviewGoal.id || !goalProofApproved}
                        />
                        {goalProofApproved && Number(proofReviewGoal.proof_review_rating || 0) > 0 && (
                          <p className="text-[10px] text-slate-500">Manager rating: <span className="font-bold">{Number(proofReviewGoal.proof_review_rating || 0)}/5</span></p>
                        )}
                        {goalProofApproved ? (
                          <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">Final proof already approved. Decision is locked.</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => void reviewGoalFinalProof(Number(proofReviewGoal.id), 'Approved')}
                              disabled={proofReviewSubmittingTaskId === proofReviewGoal.id}
                              className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                              Approve Final Proof
                            </button>
                            <button
                              onClick={() => void reviewGoalFinalProof(Number(proofReviewGoal.id), 'Needs Revision')}
                              disabled={proofReviewSubmittingTaskId === proofReviewGoal.id}
                              className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60"
                            >
                              Needs Revision
                            </button>
                            <button
                              onClick={() => void reviewGoalFinalProof(Number(proofReviewGoal.id), 'Rejected')}
                              disabled={proofReviewSubmittingTaskId === proofReviewGoal.id}
                              className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {proofReviewLoadingGoal === proofReviewOpenGoal ? (
                <p className="text-sm text-slate-500">Loading task proofs...</p>
              ) : ((proofReviewTasksByGoal[proofReviewOpenGoal] || []).length === 0 ? (
                <p className="text-sm text-slate-500">No delegated tasks found for this goal yet.</p>
              ) : (
                (proofReviewTasksByGoal[proofReviewOpenGoal] || []).map((t: any) => {
                  const reviewStatus = t.proof_review_status || 'Not Submitted';
                  const reviewRole = String((t as any).reviewer_role || (t as any).proof_reviewed_role || '').trim().toLowerCase();
                  const goalLeaderId = Number((proofReviewGoal as any)?.leader_id || 0);
                  const reviewedByLeader = goalLeaderId > 0 && Number((t as any).proof_reviewed_by || 0) === goalLeaderId;
                  const effectiveProgress = reviewStatus === 'Approved'
                    ? (reviewRole === 'manager' ? 100 : Math.min(Math.max(0, Math.min(100, Number(t.progress || 0))), 75))
                    : Math.max(0, Math.min(100, Number(t.progress || 0)));
                  const reviewLabel = reviewStatus === 'Approved'
                    ? (reviewRole === 'manager' ? 'Approved by Team Leader and Manager' : (reviewedByLeader || reviewRole === 'team_leader' ? 'Approved by Team Leader' : 'Approved'))
                    : reviewStatus;
                  const proofFiles = parseTaskProofFiles(t);
                  const hasProof = proofFiles.length > 0;
                  return (
                    <div key={t.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{t.title || 'Untitled Task'}</p>
                          <p className="text-[10px] text-slate-500">{t.member_name || `#${t.member_employee_id}`} • Status: <span className="font-bold">{t.status || 'Not Started'}</span> • Progress: <span className="font-bold">{effectiveProgress}%</span></p>
                        </div>
                        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full whitespace-nowrap ${reviewStatus === 'Approved' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : reviewStatus === 'Pending Review' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : reviewStatus === 'Needs Revision' || reviewStatus === 'Rejected' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'}`}>
                          {reviewLabel}
                        </span>
                      </div>

                      {!hasProof && <p className="mb-2 text-[10px] text-slate-500">No delegated task proof uploaded yet.</p>}

                      {hasProof && (
                        <div className="mb-2 space-y-2 max-w-2xl">
                          {proofFiles.map((file, fileIndex) => (
                            <div key={`${file.proof_file_name}-${fileIndex}`} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-2">
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate">{file.proof_file_name || `Proof ${fileIndex + 1}`}</p>
                                <button
                                  type="button"
                                  onClick={() => setProofFileViewer({ src: String(file.proof_file_data || ''), fileName: file.proof_file_name, mimeType: file.proof_file_type })}
                                  className="text-[10px] font-bold text-teal-600 hover:text-teal-700"
                                >
                                  View Full File
                                </button>
                              </div>
                              <ProofAttachment src={file.proof_file_data} fileName={file.proof_file_name} mimeType={file.proof_file_type} compact />
                            </div>
                          ))}
                        </div>
                      )}

                      {reviewStatus === 'Approved' && (
                        <>
                          {t.proof_note && <p className="mb-1 text-[10px] text-slate-600 dark:text-slate-300"><span className="font-bold">Note:</span> {t.proof_note}</p>}
                          {t.proof_submitted_at && <p className="mb-1 text-[10px] text-slate-500">Submitted: {new Date(t.proof_submitted_at).toLocaleDateString()}</p>}
                          {t.proof_review_note && <p className="mb-2 text-[10px] text-slate-500 italic">Feedback: {t.proof_review_note}</p>}
                          {Number(t.proof_review_rating || 0) > 0 && <p className="mb-2 text-[10px] text-slate-500">Latest manager rating: <span className="font-bold">{Number(t.proof_review_rating || 0)}/5</span></p>}

                          {hasProof && (
                            <div className="space-y-2">
                              <textarea
                                rows={2}
                                value={proofReviewNotes[t.id] ?? String(t.proof_review_note || '')}
                                onChange={(e) => setProofReviewNotes((prev) => ({ ...prev, [t.id]: e.target.value }))}
                                className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]"
                                placeholder="Member proof review note (optional)"
                                disabled={proofReviewSubmittingTaskId === t.id}
                              />
                              <p className="text-[10px] text-slate-500">Manager rating: <span className="font-bold">{Math.max(1, Math.min(5, Number(t.proof_review_rating || proofReviewRatings[t.id] || 5)))}/5</span></p>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={() => void reviewTaskProof(Number(t.id), Number(proofReviewOpenGoal), 'Approved')}
                                  disabled={proofReviewSubmittingTaskId === t.id}
                                  className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                                >
                                  Approve Proof
                                </button>
                                <button
                                  onClick={() => void reviewTaskProof(Number(t.id), Number(proofReviewOpenGoal), 'Needs Revision')}
                                  disabled={proofReviewSubmittingTaskId === t.id}
                                  className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60"
                                >
                                  Needs Revision
                                </button>
                                <button
                                  onClick={() => void reviewTaskProof(Number(t.id), Number(proofReviewOpenGoal), 'Rejected')}
                                  disabled={proofReviewSubmittingTaskId === t.id}
                                  className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60"
                                >
                                  Reject
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })
              ))}
            </div>
          )}
        </Modal>

        <Modal
          open={!!proofFileViewer}
          title={proofFileViewer ? `File Viewer: ${proofFileViewer.fileName || 'Attachment'}` : 'File Viewer'}
          onClose={() => setProofFileViewer(null)}
          maxWidthClassName="max-w-[900px]"
          bodyClassName="space-y-3 !max-h-[92vh]"
        >
          {proofFileViewer?.src ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
              <ProofAttachment src={proofFileViewer.src} fileName={proofFileViewer.fileName} mimeType={proofFileViewer.mimeType} viewer />
            </div>
          ) : (
            <p className="text-sm text-slate-500">No file selected.</p>
          )}
        </Modal>

        <Modal
          open={!!underperfActionsGoal}
          title={`Quick Actions${underperfActionsGoal?.title ? ` - ${underperfActionsGoal.title}` : ''}`}
          onClose={() => setUnderperfActionsGoalId(null)}
          maxWidthClassName="max-w-2xl"
          bodyClassName="space-y-3"
        >
          {underperfActionsGoal && (() => {
            const goal = underperfActionsGoal;
            const assignees = (goal.assignees || []) as any[];
            return (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button onClick={() => { setViewGoalId(goal.id); setUnderperfActionsGoalId(null); }} className="h-9 px-3 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center justify-center gap-1.5"><Eye size={13} /> View</button>
                  <button onClick={() => { void triggerQuickAction('proofs', goal, assignees); setUnderperfActionsGoalId(null); }} className="h-9 px-3 rounded-lg text-xs font-bold border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/25 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors inline-flex items-center justify-center gap-1.5"><Check size={13} /> Proofs</button>
                  <button onClick={() => { void triggerQuickAction('recovery', goal, assignees); setUnderperfActionsGoalId(null); }} className="h-9 px-3 rounded-lg text-xs font-bold border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/25 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors inline-flex items-center justify-center gap-1.5"><MessageSquare size={13} /> Recovery</button>
                  <button onClick={() => { setUnderperfPlanGoalId(goal.id); setUnderperfActionsGoalId(null); }} className="h-9 px-3 rounded-lg text-xs font-bold border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/25 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/40 transition-colors inline-flex items-center justify-center gap-1.5"><FileText size={13} /> Create Plan</button>
                </div>
              </div>
            );
          })()}
        </Modal>

        <Modal
          open={!!underperfPlanGoal}
          title={`Create Plan${underperfPlanGoal?.title ? ` - ${underperfPlanGoal.title}` : ''}`}
          onClose={() => setUnderperfPlanGoalId(null)}
          maxWidthClassName="max-w-2xl"
          bodyClassName="space-y-3"
        >
          {underperfPlanGoal && (() => {
            const goal = underperfPlanGoal;
            const normalizedScope = normalizeGoalScope(goal);
            const assignees = (goal.assignees || []) as any[];
            const isScopeGoal = normalizedScope === 'Department' || normalizedScope === 'Team';
            const isTeamGoal = normalizedScope === 'Team';
            const isDepartmentGoal = normalizedScope === 'Department';
            const isIndividualGoal = normalizedScope === 'Individual';

            return (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  Choose a plan type to generate. A confirmation prompt will appear before creation.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {isIndividualGoal && (
                    <>
                      <button
                        onClick={() => { void triggerQuickAction('pip', goal, assignees); setUnderperfPlanGoalId(null); }}
                        className="h-9 px-3 rounded-lg text-xs font-bold border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/25 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors inline-flex items-center justify-center gap-1.5"
                      >
                        <FileText size={13} /> PIP
                      </button>
                      <button
                        onClick={() => { void triggerQuickAction('idp', goal, assignees); setUnderperfPlanGoalId(null); }}
                        className="h-9 px-3 rounded-lg text-xs font-bold border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/25 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors inline-flex items-center justify-center gap-1.5"
                      >
                        <Target size={13} /> IDP
                      </button>
                    </>
                  )}
                  {isTeamGoal && (
                    <>
                      <button
                        onClick={() => { void triggerQuickAction('perf', goal, assignees); setUnderperfPlanGoalId(null); }}
                        className="h-9 px-3 rounded-lg text-xs font-bold border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/25 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors inline-flex items-center justify-center gap-1.5"
                      >
                        <TrendingDown size={13} /> TPIP
                      </button>
                      <button
                        onClick={() => { void triggerQuickAction('tdp', goal, assignees); setUnderperfPlanGoalId(null); }}
                        className="h-9 px-3 rounded-lg text-xs font-bold border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/25 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors inline-flex items-center justify-center gap-1.5"
                      >
                        <TrendingUp size={13} /> TDP
                      </button>
                    </>
                  )}
                  {isDepartmentGoal && (
                    <>
                      <button
                        onClick={() => { void triggerQuickAction('dpip', goal, assignees); setUnderperfPlanGoalId(null); }}
                        className="h-9 px-3 rounded-lg text-xs font-bold border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/25 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors inline-flex items-center justify-center gap-1.5"
                      >
                        <TrendingDown size={13} /> DPIP
                      </button>
                      <button
                        onClick={() => { void triggerQuickAction('dev', goal, assignees); setUnderperfPlanGoalId(null); }}
                        className="h-9 px-3 rounded-lg text-xs font-bold border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/25 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors inline-flex items-center justify-center gap-1.5"
                      >
                        <TrendingUp size={13} /> DDP
                      </button>
                    </>
                  )}
                </div>

                {!isScopeGoal && (
                  <p className="text-[11px] text-slate-400">
                    Scope plans (TPIP/TDP/DPIP/DDP) are available only for Team or Department goals.
                  </p>
                )}
              </div>
            );
          })()}
        </Modal>
      </>
    );

    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-5">
          <button onClick={() => setShowUnderperforming(false)} className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-teal-deep dark:hover:text-teal-green transition-colors"><ArrowLeft size={18} /> Back to Dashboard</button>
          <div className="flex gap-2">
            <button onClick={() => exportToCSV(monitorDisplayGoals.map(g => ({
              goal: g.title || g.statement, scope: g.scope || 'Individual', department: g.department,
              assigned: g.employee_name || g.delegation, priority: g.priority || 'Medium',
              assignees: (g.assignees || []).map((a: any) => a.name).join('; '),
              progress: `${g.progress || 0}%`, target_date: g.target_date,
              days_overdue: g.target_date && new Date(g.target_date) < now ? daysOverdue(g.target_date) : 0,
              issue: [g.target_date && new Date(g.target_date) < now ? 'OVERDUE' : '', g.status === 'At Risk' ? 'AT RISK' : '', (g.progress || 0) <= 10 && g.status === 'In Progress' ? 'STALLED' : ''].filter(Boolean).join(', ')
            })), 'underperforming_goals')} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><Download size={16} /> Export XLSX</button>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <motion.div
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
            className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center"
          >
            <AlertTriangle size={24} className="text-red-500" />
          </motion.div>
          <div>
            <h2 className="screen-heading">Underperforming Goals & Metrics</h2>
            <p className="screen-subheading">
              <span className="text-red-500 font-bold">{underperforming.length}</span> goal{underperforming.length !== 1 ? 's' : ''} need attention — at risk, overdue, or stalled
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 mb-5 w-fit">
          <button
            onClick={() => setUnderperfTopTab('summary')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${underperfTopTab === 'summary' ? 'bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            Summary
          </button>
          <button
            onClick={() => setUnderperfTopTab('table')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${underperfTopTab === 'table' ? 'bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            Monitor Table
          </button>
          <button
            onClick={() => setUnderperfTopTab('plans')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${underperfTopTab === 'plans' ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            Plans Manager
          </button>
        </div>

        {underperfTopTab === 'plans' && (
          <div className="space-y-5">
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 w-fit">
              <button
                onClick={() => setPlansNavigator('employee')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${plansNavigator === 'employee' ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                Employee Plans (IDP & PIP)
              </button>
              <button
                onClick={() => setPlansNavigator('scope')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${plansNavigator === 'scope' ? 'bg-white dark:bg-slate-900 text-cyan-700 dark:text-cyan-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                Team / Department Plans
              </button>
            </div>

            {plansNavigator === 'employee' ? (
              <PIPManager employees={employees} />
            ) : (
              <GoalScopePlanManager />
            )}
          </div>
        )}

        {underperfTopTab === 'summary' && (
          <div className="space-y-5">
            <Card>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-xl bg-red-50 dark:bg-red-900/20 p-3">
                  <p className="text-[10px] font-bold uppercase text-red-500">Overdue</p>
                  <p className="text-2xl font-black text-red-600 dark:text-red-400">{underperforming.filter(g => g.target_date && new Date(g.target_date) < now).length}</p>
                </div>
                <div className="rounded-xl bg-orange-50 dark:bg-orange-900/20 p-3">
                  <p className="text-[10px] font-bold uppercase text-orange-500">At Risk</p>
                  <p className="text-2xl font-black text-orange-600 dark:text-orange-400">{underperforming.filter(g => g.status === 'At Risk').length}</p>
                </div>
                <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 p-3">
                  <p className="text-[10px] font-bold uppercase text-amber-500">Stalled</p>
                  <p className="text-2xl font-black text-amber-600 dark:text-amber-400">{underperforming.filter(g => (g.progress || 0) <= 10).length}</p>
                </div>
                <div className="rounded-xl bg-teal-50 dark:bg-teal-900/20 p-3">
                  <p className="text-[10px] font-bold uppercase text-teal-600">Recovery (7d)</p>
                  <p className="text-2xl font-black text-teal-600 dark:text-teal-400">{recoveryTaskCount7d}</p>
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <Card className="xl:col-span-2">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-500">Priority Risk Heatmap</p>
                  <button onClick={() => setUnderperfTopTab('table')} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/25 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">Open Monitor Table</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700">
                        <th className="py-2 px-2 text-[10px] font-bold uppercase text-slate-500">Priority</th>
                        <th className="py-2 px-2 text-[10px] font-bold uppercase text-slate-500">Overdue</th>
                        <th className="py-2 px-2 text-[10px] font-bold uppercase text-slate-500">At Risk</th>
                        <th className="py-2 px-2 text-[10px] font-bold uppercase text-slate-500">Stalled</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(['Critical', 'High', 'Medium', 'Low'] as const).map((p) => (
                        <tr key={p} className="border-b border-slate-100 dark:border-slate-800/60">
                          <td className="py-2 px-2 text-xs font-bold text-slate-700 dark:text-slate-200">{p}</td>
                          <td className="py-2 px-2"><span className={`inline-flex min-w-8 justify-center px-2 py-1 rounded text-[10px] font-bold ${heatColor(heatmapData[p]?.OVERDUE || 0)}`}>{heatmapData[p]?.OVERDUE || 0}</span></td>
                          <td className="py-2 px-2"><span className={`inline-flex min-w-8 justify-center px-2 py-1 rounded text-[10px] font-bold ${heatColor(heatmapData[p]?.['AT RISK'] || 0)}`}>{heatmapData[p]?.['AT RISK'] || 0}</span></td>
                          <td className="py-2 px-2"><span className={`inline-flex min-w-8 justify-center px-2 py-1 rounded text-[10px] font-bold ${heatColor(heatmapData[p]?.STALLED || 0)}`}>{heatmapData[p]?.STALLED || 0}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card>
                <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">Hotspots</p>
                <div className="space-y-2">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-900/50">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Top Employee</p>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{underperfAggregations.employees[0]?.name || '—'}</p>
                    <p className="text-[10px] text-red-500 font-bold">{underperfAggregations.employees[0]?.under || 0} underperforming goals</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-900/50">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Top Team</p>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{underperfAggregations.teams[0]?.name || '—'}</p>
                    <p className="text-[10px] text-red-500 font-bold">{underperfAggregations.teams[0]?.under || 0} underperforming goals</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-900/50">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Top Department</p>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{underperfAggregations.departments[0]?.name || '—'}</p>
                    <p className="text-[10px] text-red-500 font-bold">{underperfAggregations.departments[0]?.under || 0} underperforming goals</p>
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    <button onClick={() => openUnderperformingPlans('employee')} className="flex-1 text-[10px] font-bold px-2 py-1.5 rounded-lg bg-teal-50 dark:bg-teal-900/25 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/40 transition-colors">Employee Plans</button>
                    <button onClick={() => openUnderperformingPlans('scope')} className="flex-1 text-[10px] font-bold px-2 py-1.5 rounded-lg bg-cyan-50 dark:bg-cyan-900/25 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-100 dark:hover:bg-cyan-900/40 transition-colors">Scope Plans</button>
                  </div>
                </div>
              </Card>
            </div>

            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 w-fit">
              <button
                onClick={() => setUnderperfView('employee')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${underperfView === 'employee' ? 'bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                By Employee
              </button>
              <button
                onClick={() => setUnderperfView('team')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${underperfView === 'team' ? 'bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                By Team
              </button>
              <button
                onClick={() => setUnderperfView('department')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${underperfView === 'department' ? 'bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                By Department
              </button>
            </div>

            {underperfView === 'employee' && (
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                        <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Employee</th>
                        <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Goals</th>
                        <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Underperforming</th>
                        <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Avg Progress</th>
                        <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Top Issue</th>
                        <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {underperfAggregations.employees.map((e: any) => {
                        const top = Object.entries(e.reasons || {}).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || '';
                        return (
                          <tr key={e.name} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                            <td className="py-3 px-3 text-sm font-medium text-slate-700 dark:text-slate-200">{e.name}</td>
                            <td className="py-3 px-3 text-sm font-bold text-slate-600 dark:text-slate-300">{e.total}</td>
                            <td className="py-3 px-3"><span className="text-sm font-black text-red-500">{e.under}</span><span className="text-[10px] text-slate-400 ml-1">({e.pctUnder}%)</span></td>
                            <td className="py-3 px-3 text-xs font-bold text-slate-500">{e.avgProgress}%</td>
                            <td className="py-3 px-3 text-xs text-slate-500">{top ? top.replace(/_/g, ' ') : '—'}</td>
                            <td className="py-3 px-3 text-right"><button onClick={() => openUnderperformingPlans('employee')} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-teal-50 dark:bg-teal-900/25 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/40 transition-colors">Open Plans</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {underperfView === 'team' && (
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                        <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Team</th>
                        <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Goals</th>
                        <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Underperforming</th>
                        <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Avg Progress</th>
                        <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Top Issue</th>
                        <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {underperfAggregations.teams.map((t: any) => {
                        const top = Object.entries(t.reasons || {}).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || '';
                        return (
                          <tr key={t.name} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                            <td className="py-3 px-3 text-sm font-medium text-slate-700 dark:text-slate-200">{t.name}</td>
                            <td className="py-3 px-3 text-sm font-bold text-slate-600 dark:text-slate-300">{t.total}</td>
                            <td className="py-3 px-3"><span className="text-sm font-black text-red-500">{t.under}</span><span className="text-[10px] text-slate-400 ml-1">({t.pctUnder}%)</span></td>
                            <td className="py-3 px-3 text-xs font-bold text-slate-500">{t.avgProgress}%</td>
                            <td className="py-3 px-3 text-xs text-slate-500">{top ? top.replace(/_/g, ' ') : '—'}</td>
                            <td className="py-3 px-3 text-right"><button onClick={() => openUnderperformingPlans('scope')} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-teal-50 dark:bg-teal-900/25 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/40 transition-colors">Open Plans</button></td>
                          </tr>
                        );
                      })}
                      {underperfAggregations.teams.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-8 px-3 text-center text-xs text-slate-400">No team data available for underperforming goals yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {underperfView === 'department' && (
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                        <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Department</th>
                        <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Goals</th>
                        <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Underperforming</th>
                        <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Avg Progress</th>
                        <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Top Issue</th>
                        <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {underperfAggregations.departments.map((d: any) => {
                        const top = Object.entries(d.reasons || {}).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || '';
                        return (
                          <tr key={d.name} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                            <td className="py-3 px-3 text-sm font-medium text-slate-700 dark:text-slate-200">{d.name}</td>
                            <td className="py-3 px-3 text-sm font-bold text-slate-600 dark:text-slate-300">{d.total}</td>
                            <td className="py-3 px-3"><span className="text-sm font-black text-red-500">{d.under}</span><span className="text-[10px] text-slate-400 ml-1">({d.pctUnder}%)</span></td>
                            <td className="py-3 px-3 text-xs font-bold text-slate-500">{d.avgProgress}%</td>
                            <td className="py-3 px-3 text-xs text-slate-500">{top ? top.replace(/_/g, ' ') : '—'}</td>
                            <td className="py-3 px-3 text-right"><button onClick={() => openUnderperformingPlans('scope')} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-teal-50 dark:bg-teal-900/25 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/40 transition-colors">Open Plans</button></td>
                          </tr>
                        );
                      })}
                      {underperfAggregations.departments.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-8 px-3 text-center text-xs text-slate-400">No department data available for underperforming goals yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}

        {underperfTopTab === 'table' && (
          <div className="space-y-4">
            <Card>
              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-red-500">Monitor Table</p>
                  <p className="text-xs text-slate-500">{monitorDisplayGoals.length} goal{monitorDisplayGoals.length !== 1 ? 's' : ''} visible after filters{seededScopeRows.length > 0 ? ` (${seededScopeRows.length} scope test row${seededScopeRows.length > 1 ? 's' : ''} injected)` : ''}</p>
                </div>
                <div className="text-[10px] text-slate-400">Live sync every 5s • last sync {Math.max(0, Math.floor((Date.now() - lastRealtimeSyncAt) / 1000))}s ago</div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <Filter size={14} className="text-slate-400" />
                <SearchableSelect
                  className="w-72"
                  options={employeeFilterOptions}
                  value={empFilter}
                  onChange={(v) => setEmpFilter(String(v))}
                  placeholder="All Employees"
                  pill
                  searchable
                  dropdownVariant="pills-horizontal"
                />
                <SearchableSelect
                  className="w-56"
                  options={scopeFilterOptions}
                  value={underperfScopeFilter}
                  onChange={(v) => setUnderperfScopeFilter(v as 'all'|'Department'|'Team'|'Individual')}
                  placeholder="All Scopes"
                  pill
                  searchable={false}
                  dropdownVariant="pills-horizontal"
                />
                <SearchableSelect
                  className="w-72"
                  options={quickFilterOptions}
                  value={underperfQuickFilter}
                  onChange={(v) => setUnderperfQuickFilter(v as 'all'|'overdue'|'highPriority'|'stalled')}
                  placeholder="All"
                  pill
                  searchable={false}
                  dropdownVariant="pills-horizontal"
                />
              </div>
            </Card>

            {monitorDisplayGoals.length === 0 ? (
              <Card>
                <div className="py-14 text-center">
                  <Check size={40} className="mx-auto text-emerald-500 mb-3" />
                  <p className="text-base font-black text-slate-700 dark:text-slate-200">No rows match the current filters</p>
                  <p className="text-sm text-slate-400 mt-1">Clear the employee or status filter to show the live monitor table again.</p>
                </div>
              </Card>
            ) : (
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-900/50">
                        <th className="py-2.5 px-3 text-[10px] font-bold uppercase text-red-500 w-[220px]">Goal</th>
                        <th className="py-2.5 px-3 text-[10px] font-bold uppercase text-red-500 w-[92px]">Level</th>
                        <th className="py-2.5 px-3 text-[10px] font-bold uppercase text-red-500 w-[120px]">Department</th>
                        <th className="py-2.5 px-3 text-[10px] font-bold uppercase text-red-500 w-[120px]">Team</th>
                        <th className="py-2.5 px-3 text-[10px] font-bold uppercase text-red-500 w-[140px]">Owner</th>
                        <th className="py-2.5 px-3 text-[10px] font-bold uppercase text-red-500 w-[94px]">Priority</th>
                        <th className="py-2.5 px-3 text-[10px] font-bold uppercase text-red-500 w-[172px]">Progress / Status</th>
                        <th className="py-2.5 px-3 text-[10px] font-bold uppercase text-red-500 w-[112px]">Due</th>
                        <th className="py-2.5 px-3 text-[10px] font-bold uppercase text-red-500 w-[88px]">Overdue</th>
                        <th className="py-2.5 px-3 text-[10px] font-bold uppercase text-red-500 w-[128px]">Issue</th>
                        <th className="py-2.5 px-3 text-[10px] font-bold uppercase text-red-500 text-center w-[390px]">Quick Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monitorDisplayGoals.map(g => {
                        const isOverdue = g.target_date && new Date(g.target_date) < now;
                        const stalled = (g.progress || 0) <= 10 && g.status === 'In Progress';
                        const normalizedScope = normalizeGoalScope(g);
                        const scopeLabel = normalizedScope === 'Department' ? 'Dept-wide' : normalizedScope === 'Team' ? 'Team' : 'Individual';
                        const assignees = (g.assignees || []) as any[];
                        const goalDept = getGoalDepartment(g);
                        const goalTeam = getGoalTeam(g);
                        const goalOwner = getGoalOwner(g);
                        const recoveryDraft = recoveryTaskDrafts[g.id] || {
                          member_employee_id: String(assignees[0]?.employee_id || ''),
                          title: `Recovery: ${g.title || g.statement || 'Goal task'}`,
                          description: '',
                          due_date: '',
                          priority: 'High',
                        };
                        return (
                          <React.Fragment key={g.id}>
                            <tr className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-red-50/50 dark:hover:bg-red-900/10">
                              <td className="py-2.5 px-3 text-xs font-medium text-slate-700 dark:text-slate-200 align-top min-w-0"><span className="block min-w-0 truncate" title={g.title || g.statement}>{g.title || g.statement}</span></td>
                              <td className="py-2.5 px-3 align-top"><span className="text-[10px] font-bold text-slate-500" title={g.scope || 'Individual'}>{scopeLabel}</span></td>
                              <td className="py-2.5 px-3 text-xs text-slate-500 align-top truncate">{goalDept}</td>
                              <td className="py-2.5 px-3 text-xs text-slate-500 align-top truncate">{goalTeam}</td>
                              <td className="py-2.5 px-3 text-xs text-slate-600 dark:text-slate-300 font-medium align-top truncate">{goalOwner}</td>
                              <td className="py-2.5 px-3 align-top"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${priorityColor(g.priority || 'Medium')}`}>{g.priority || 'Medium'}</span></td>
                              <td className="py-2.5 px-3 align-top">
                                <div className="flex items-center gap-2">
                                  <div className="w-24 bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                                    <motion.div initial={{ width: 0 }} animate={{ width: `${g.progress || 0}%` }} transition={{ duration: 0.45 }} className="bg-red-500 h-2 rounded-full" />
                                  </div>
                                  <span className="text-[10px] font-black text-red-500 w-8">{g.progress || 0}%</span>
                                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${statusColor(g.status || 'Not Started')}`}>{g.status || 'Not Started'}</span>
                                </div>
                              </td>
                              <td className={`py-2.5 px-3 text-xs font-medium align-top ${isOverdue ? 'text-red-600' : 'text-slate-500'}`}>{g.target_date || '—'}</td>
                              <td className="py-2.5 px-3 align-top">{isOverdue ? <span className="flex items-center gap-1 text-[10px] font-black text-red-600"><Clock size={11} /> +{daysOverdue(g.target_date)}d</span> : <span className="text-[10px] text-slate-400">—</span>}</td>
                              <td className="py-2.5 px-3 align-top">
                                <div className="flex gap-1 flex-wrap">
                                  {g.__seedUnderperfRow && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-teal-100 dark:bg-teal-900/35 text-teal-700 dark:text-teal-300">TEST SCOPE</span>}
                                  {isOverdue && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-600">OVERDUE</span>}
                                  {g.status === 'At Risk' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/40 text-orange-600">AT RISK</span>}
                                  {stalled && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-600">STALLED</span>}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-center align-top">
                                <button
                                  title="Open quick actions"
                                  onClick={() => setUnderperfActionsGoalId(g.id)}
                                  className="h-8 px-3 rounded-lg text-[10px] font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5"
                                >
                                  <MoreHorizontal size={12} /> Actions
                                </button>
                              </td>
                            </tr>
                            {recoveryTaskOpenGoal === g.id && (
                              <tr className="bg-amber-50/60 dark:bg-amber-900/10 border-b border-amber-100 dark:border-amber-900/40">
                                <td colSpan={11} className="px-3 py-3">
                                  <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5 items-end">
                                    <div>
                                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Assignee</label>
                                      <select
                                        value={recoveryDraft.member_employee_id}
                                        onChange={(e) => updateRecoveryTaskDraft(g.id, { member_employee_id: e.target.value })}
                                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2 text-xs"
                                      >
                                        <option value="">Select</option>
                                        {assignees.map((a: any) => (
                                          <option key={a.employee_id} value={String(a.employee_id)}>{a.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Task Title</label>
                                      <input
                                        value={recoveryDraft.title}
                                        onChange={(e) => updateRecoveryTaskDraft(g.id, { title: e.target.value })}
                                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2 text-xs"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Due Date</label>
                                      <input
                                        type="date"
                                        value={recoveryDraft.due_date}
                                        onChange={(e) => updateRecoveryTaskDraft(g.id, { due_date: e.target.value })}
                                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2 text-xs"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Priority</label>
                                      <select
                                        value={recoveryDraft.priority}
                                        onChange={(e) => updateRecoveryTaskDraft(g.id, { priority: e.target.value })}
                                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2 text-xs"
                                      >
                                        {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                                      </select>
                                    </div>
                                    <div className="flex gap-2 justify-end">
                                      <button onClick={() => setRecoveryTaskOpenGoal(null)} className="h-8 px-3 rounded-lg text-[10px] font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
                                      <button
                                        onClick={() => void handleCreateRecoveryTask(g)}
                                        disabled={recoveryTaskSavingGoal === g.id}
                                        className="h-8 px-3 rounded-lg text-[10px] font-bold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60 transition-colors"
                                      >
                                        {recoveryTaskSavingGoal === g.id ? 'Saving...' : 'Assign Recovery'}
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
            {goalModals}
          </div>
        )}
      </motion.div>
    );
  }

  /* ─── ADD GOAL FULL-SCREEN VIEW ─── */
  if (showForm) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => setShowForm(false)} className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-teal-deep dark:hover:text-teal-green transition-colors"><ArrowLeft size={18} /> Back to Dashboard</button>
        </div>
        <div className="flex items-center gap-2 mb-5">
          <div className="w-9 h-9 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center"><Target size={18} className="text-teal-600" /></div>
          <div>
            <h2 className="screen-heading text-lg">New Goal / OKR</h2>
            <p className="screen-subheading">Define targets for department, team, or individual</p>
          </div>
        </div>
        <Card>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); handleSubmit(); }}>
            {/* Scope & Department */}
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Goal Level</label>
                <select value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value })} className={inp} required>
                  <option value="">Select Goal Level...</option>
                  <option value="Department">Dept-wide — Entire department</option>
                  <option value="Team">Team — Specific group/team</option>
                  <option value="Individual">Individual — Single employee</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Department *</label>
                {isDepartmentLocked ? (
                  <>
                    <div className={`${inp} bg-slate-100 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 cursor-not-allowed`}>{managerDept}</div>
                    <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1">Locked to your department.</p>
                  </>
                ) : (
                  <SearchableSelect
                    options={DEPARTMENTS.map(d => ({ value: d, label: d }))}
                    value={form.department}
                    onChange={v => setForm({ ...form, department: String(v) })}
                    placeholder="Select Department..."
                    allowEmpty
                    emptyLabel="Select Department..."
                    searchable
                    dropdownVariant="pills-horizontal"
                    className="w-full"
                  />
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Quarter</label>
                <select value={form.quarter} onChange={e => setForm({ ...form, quarter: e.target.value })} className={inp}>
                  <option value="">Select Quarter...</option>
                  {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Frequency</label>
                <select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} className={inp}>
                  {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Priority</label>
                <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} className={inp}>
                  <option value="">Select Priority...</option>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            {/* Team / Employee / Leader */}
            <div className="grid grid-cols-3 gap-4">
              {(form.scope === 'Team' || form.scope === 'Department') && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Team Name</label>
                  <input type="text" value={form.team_name} onChange={e => setForm({ ...form, team_name: e.target.value })} className={inp} placeholder="e.g. Sales Team A" maxLength={100} />
                </div>
              )}
              {form.scope === 'Individual' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employee *</label>
                  <SearchableSelect
                    options={employees.map(e => ({ value: String(e.id), label: e.name, avatarUrl: (e as any).profile_picture || null }))}
                    value={form.employee_id}
                    onChange={v => setForm({ ...form, employee_id: String(v) })}
                    placeholder="Select Employee..."
                    dropdownVariant="pills-horizontal"
                  />
                </div>
              )}
              {(form.scope === 'Team' || form.scope === 'Department') && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Team Leader</label>
                  <SearchableSelect
                    options={teamLeaderOptions}
                    value={form.leader_id}
                    onChange={v => {
                      setForm({ ...form, leader_id: String(v), assignee_ids: [] });
                    }}
                    placeholder="Select Team Leader..."
                    searchable
                    dropdownVariant="pills-horizontal"
                    className="w-full"
                  />
                  <p className="mt-1 text-[10px] text-slate-400">Choose the leader once here. Team members are assigned below and linked automatically.</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Target Date</label>
                <input type="date" value={form.target_date} onChange={e => setForm({ ...form, target_date: e.target.value })} className={inp} min={new Date().toISOString().split('T')[0]} />
              </div>
            </div>
            {/* Assignees for Team/Department goals */}
            {(form.scope === 'Team' || form.scope === 'Department') && (
              <div>
                {String(currentUser?.role || '').toLowerCase() === 'manager' && (
                  <div className="mb-3 p-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-start gap-2">
                    <span className="text-blue-600 dark:text-blue-400 font-bold text-sm leading-none mt-0.5">ℹ️</span>
                    <p className="text-[10px] font-md text-blue-700 dark:text-blue-300">
                      <span className="font-bold">Department Scope:</span> Managers may only assign employees within their department (<strong>{currentUser?.dept || 'your department'}</strong>). Employees from other departments are not shown.
                    </p>
                  </div>
                )}
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                  Team Members <span className="text-slate-400 font-normal normal-case text-[11px]">— manager-defined roster for this leader</span>
                </label>
                <div className="space-y-2">
                  <SearchableSelect
                    options={availableAssignees.map(emp => ({
                      value: String(emp.id),
                      label: `${emp.name}${emp.position ? ` (${emp.position})` : ''}`,
                      avatarUrl: (emp as any).profile_picture || null,
                    }))}
                    value={form.assignee_ids}
                    onChange={(v) => {
                      if (!form.leader_id) {
                        window.notify?.('Select Team Leader first to enable member selection.', 'error');
                        return;
                      }
                      const allowedIds = new Set(availableAssignees.map(emp => String(emp.id)));
                      const selectedIds = (Array.isArray(v) ? v.map(String) : [String(v)])
                        .filter(id => allowedIds.has(id));
                      setForm({ ...form, assignee_ids: selectedIds });
                    }}
                    placeholder={!form.leader_id ? 'Select Team Leader first...' : 'Search and add team members...'}
                    searchable
                    multiSelect
                    dropdownVariant="pills-horizontal"
                    className="w-full"
                  />

                  {form.leader_id && assigneePickerOptions.length === 0 && (
                    <p className="text-[10px] text-slate-400 px-1">No available members found for the selected leader/department.</p>
                  )}

                  <div className="min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/30 p-2">
                    {selectedAssignees.length === 0 ? (
                      <div className="text-xs text-slate-400 px-1 py-1">No assignees selected</div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {selectedAssignees.map(emp => (
                          <button
                            key={emp.id}
                            type="button"
                            onClick={() => setForm({ ...form, assignee_ids: form.assignee_ids.filter(x => x !== String(emp.id)) })}
                            className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/20 px-3 py-1 text-xs font-bold text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/30"
                          >
                            <span>{emp.name}</span>
                            <X size={12} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="px-1 text-xs font-bold text-slate-500 flex items-center justify-between">
                    <span>{form.assignee_ids.length === 0 ? 'No assignees selected' : `${form.assignee_ids.length} assignee${form.assignee_ids.length !== 1 ? 's' : ''} selected`}</span>
                    {form.assignee_ids.length > 0 && (
                      <button type="button" onClick={() => setForm({ ...form, assignee_ids: [] })} className="text-red-400 hover:text-red-600 text-[10px] font-bold">Clear all</button>
                    )}
                  </div>
                </div>
                {!form.leader_id && <p className="mt-1 text-[10px] text-slate-400">Select Team Leader first to enable member selection.</p>}
              </div>
            )}
            {/* Goal Details */}
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Goal Title</label>
              <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className={inp} placeholder="Short title for the goal/OKR" maxLength={120} required />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Goal Statement / Key Result</label>
              <textarea rows={2} value={form.statement} onChange={e => setForm({ ...form, statement: e.target.value })} className={inp} placeholder="e.g. Increase department revenue by 20% through cross-selling initiatives" minLength={10} maxLength={1000} required></textarea>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Key Metric</label>
                <input type="text" value={form.metric} onChange={e => setForm({ ...form, metric: e.target.value })} className={inp} placeholder="e.g. Revenue, NPS Score" maxLength={120} />
              </div>
              <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-bold text-slate-600 dark:text-slate-300">Status and progress are automatic.</span> They will update in real time from proof submission and leader approval.
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">Cancel</button>
              <button type="submit" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green transition-colors">Create Goal</button>
            </div>
          </form>
        </Card>
      </motion.div>
    );
  }

  /* ─── MAIN DASHBOARD VIEW ─── */
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-4">
        <SectionHeader title="Target & OKR Planner" subtitle="Set and track goals by level: Dept-wide, Team, or Individual" />
        <div className="flex gap-2">
          <button onClick={() => exportToCSV(goals.map(g => ({
            scope: g.scope === 'Department' ? 'Dept-wide' : g.scope === 'Team' ? 'Team' : 'Individual', department: g.department, team: g.team_name, employee: g.employee_name,
            title: g.title, statement: g.statement, metric: g.metric, status: g.status,
            progress: g.progress, priority: g.priority, quarter: g.quarter, frequency: g.frequency || 'One-time', owner: g.delegation, target_date: g.target_date
          })), 'okr_goals')} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><Download size={16} /> XLSX</button>
          <button onClick={openUnderperformingMonitor} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50`}>
            <AlertTriangle size={16} /> Underperforming ({stats.underperformingCount})
          </button>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-teal-deep text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-teal-green transition-colors">
            <Plus size={16} /> Add Goal
          </button>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex flex-wrap gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
          {[
            { key: 'overview', label: 'Overview', icon: Target },
            { key: 'analytics', label: 'Analytics', icon: TrendingDown },
            { key: 'goals', label: `Goals (${filtered.length})`, icon: Users },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = plannerView === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setPlannerView(tab.key as 'overview' | 'analytics' | 'goals')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-all ${active ? 'bg-white dark:bg-slate-900 text-teal-deep dark:text-teal-green shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                <Icon size={14} /> {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* SCOPE HERO CARDS */}
      {plannerView === 'overview' && (
      <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {scopeStats.map(({ scope, total, completed, inProgress, atRisk, notStarted, avgProgress, owners }) => {
          const Icon = scope === 'Department' ? Building2 : scope === 'Team' ? Users : User;
          const style = scopeStyleMap[scope];
          const isActive = activeTab === scope;
          return (
            <motion.div
              key={scope}
              whileHover={{ y: -4, scale: 1.015 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <Card
                className={`cursor-pointer border-2 transition-all duration-300 ${isActive ? style.border + ' shadow-lg' : 'border-transparent hover:border-slate-200 dark:hover:border-slate-700'}`}
                onClick={() => { setActiveTab(scope as any); setViewGoalId(null); }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <motion.div
                      animate={isActive ? { scale: [1, 1.1, 1] } : {}}
                      transition={{ duration: 0.4 }}
                      className={`w-14 h-14 rounded-2xl ${style.iconBg} flex items-center justify-center`}
                    >
                      <Icon size={28} className={style.text} />
                    </motion.div>
                    <div>
                      <p className="text-lg font-black text-slate-800 dark:text-slate-100">
                        {scope === 'Department' ? 'Dept-wide' : scope}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{total} goal{total !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <CircularProgress value={avgProgress} size={72} strokeWidth={7} sublabel="avg" />
                </div>

                {/* Status breakdown bar */}
                {total > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15, duration: 0.4 }}
                    className="mt-4"
                  >
                    <div className="flex h-3 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                      {completed > 0 && (
                        <motion.div
                          initial={{ width: 0 }} animate={{ width: `${(completed / total) * 100}%` }}
                          transition={{ duration: 0.6 }}
                          className="bg-emerald-500"
                        />
                      )}
                      {inProgress > 0 && (
                        <motion.div
                          initial={{ width: 0 }} animate={{ width: `${(inProgress / total) * 100}%` }}
                          transition={{ duration: 0.6, delay: 0.1 }}
                          className="bg-amber-500"
                        />
                      )}
                      {atRisk > 0 && (
                        <motion.div
                          initial={{ width: 0 }} animate={{ width: `${(atRisk / total) * 100}%` }}
                          transition={{ duration: 0.6, delay: 0.2 }}
                          className="bg-red-500"
                        />
                      )}
                      {notStarted > 0 && (
                        <motion.div
                          initial={{ width: 0 }} animate={{ width: `${(notStarted / total) * 100}%` }}
                          transition={{ duration: 0.6, delay: 0.3 }}
                          className="bg-slate-300 dark:bg-slate-600"
                        />
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-2">
                      <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Completed ({completed})</span>
                      <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400"><span className="w-2 h-2 rounded-full bg-amber-500" /> In Progress ({inProgress})</span>
                      {atRisk > 0 && <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400"><span className="w-2 h-2 rounded-full bg-red-500" /> At Risk ({atRisk})</span>}
                    </div>
                  </motion.div>
                )}
                {total === 0 && (
                  <p className="mt-4 text-[10px] text-slate-400 italic">No {scope.toLowerCase()} goals yet</p>
                )}

                {/* Team Leaders (Owners) */}
                {owners.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800"
                  >
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Team Leaders (Owners)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {owners.slice(0, 4).map(name => (
                        <span key={name} className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300">
                          <span className="w-5 h-5 rounded-full bg-teal-600/20 dark:bg-teal-500/20 text-teal-700 dark:text-teal-400 flex items-center justify-center text-[9px] font-bold">{name[0]?.toUpperCase()}</span>
                          {name}
                        </span>
                      ))}
                      {owners.length > 4 && <span className="text-[10px] text-slate-400 self-center">+{owners.length - 4} more</span>}
                    </div>
                  </motion.div>
                )}
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-4">
        {[
          { label: 'Total Goals', val: stats.total, icon: Target, color: 'text-teal-deep dark:text-teal-green' },
          { label: 'Avg. Progress', val: `${stats.avgProgress}%`, icon: TrendingDown, color: 'text-blue-600 dark:text-blue-400' },
          { label: 'Completed', val: stats.completed, icon: Check, color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'At Risk', val: stats.atRisk, icon: AlertTriangle, color: 'text-red-500 dark:text-red-400' },
          { label: 'Underperforming', val: stats.underperformingCount, icon: TrendingDown, color: 'text-orange-500 dark:text-orange-400' },
          { label: 'Team Payroll', val: (() => { const t = employees.reduce((s, e) => s + (e.salary_base || 0), 0); return t >= 1000 ? `$${(t / 1000).toFixed(0)}k` : `$${t}`; })(), icon: DollarSign, color: 'text-indigo-600 dark:text-indigo-400' },
        ].map((c, i) => (
          <Card key={i}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">{c.label}</p>
                <p className={`text-2xl font-black mt-1 ${c.color}`}>{c.val}</p>
              </div>
              <c.icon size={22} className={`${c.color} opacity-40`} />
            </div>
          </Card>
        ))}
      </div>
      </>
      )}

      {/* CHARTS ROW */}
      {plannerView === 'analytics' && (
      <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Card>
          <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-3">Goals by Department</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptChartData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} width={90} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: 12 }} />
                <Bar dataKey="total" fill="#0f766e" name="Total" radius={[0, 4, 4, 0]} />
                <Bar dataKey="completed" fill="#10b981" name="Completed" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-3">By Scope</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={scopePieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={4} dataKey="value" label={({ name, value }) => `${name} (${value})`} labelLine={false} style={{ fontSize: 11 }}>
                  {scopePieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-3">By Status</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={4} dataKey="value" label={({ name, value }) => `${name} (${value})`} labelLine={false} style={{ fontSize: 10 }}>
                  {statusPieData.map((_, i) => <Cell key={i} fill={['#94a3b8','#f59e0b','#ef4444','#10b981','#cbd5e1'][i % 5]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* DEPARTMENT RADAR */}
      <div className="mb-4">
        <Card>
          <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-3">Department Performance Radar</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={deptChartData.map(d => ({ ...d, name: d.fullName.split('/')[0] }))}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={{ fontSize: 9 }} />
                <Radar name="Avg Progress" dataKey="progress" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.15} />
                <Radar name="Total Goals" dataKey="total" stroke="#0f766e" fill="#0f766e" fillOpacity={0.15} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* FREQUENCY BREAKDOWN — large standalone cards per frequency */}
      {freqChartData.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Goal Frequency Breakdown</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {freqChartData.map((d, idx) => {
              const meta = FREQ_META[d.name] || FREQ_META['One-time'];
              const freqGoals = goals.filter(g => (g.frequency || 'One-time') === d.name);
              return (
                <motion.div key={d.name} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.06 }}>
                  <Card className={`ring-2 ${meta.ring} h-full`}>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black text-white shrink-0" style={{ backgroundColor: meta.color }}>{meta.icon}</span>
                        <div>
                          <h3 className="text-base font-black text-slate-800 dark:text-slate-100">{d.name} Goals</h3>
                          <p className="text-[10px] text-slate-400">{d.total} goal{d.total !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <CircularProgress value={d.avgProg} size={60} strokeWidth={6} />
                    </div>
                    {/* Stats row */}
                    <div className="flex gap-4 mb-3 text-[10px] font-bold">
                      <span className="text-emerald-600">{d.completed} completed</span>
                      <span className="text-amber-500">{d.inProg} in progress</span>
                      {d.atRisk > 0 && <span className="text-red-500">{d.atRisk} at risk</span>}
                    </div>
                    {/* Progress bar */}
                    <div className={`w-full rounded-full h-3 overflow-hidden mb-4 ${meta.bg}`}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${d.avgProg}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        className="h-3 rounded-full"
                        style={{ backgroundColor: meta.color }}
                      />
                    </div>
                    {/* Goal list */}
                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                      {freqGoals.map(g => (
                        <div key={g.id} className="flex items-start gap-2 p-2 rounded-lg bg-white/70 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{g.title || g.statement}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                g.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
                                g.status === 'At Risk' ? 'bg-red-100 text-red-700' :
                                g.status === 'In Progress' ? 'bg-amber-100 text-amber-700' :
                                'bg-slate-100 text-slate-500'
                              }`}>{g.status || 'Not Started'}</span>
                              {g.department && <span className="text-[9px] text-slate-400">{g.department}</span>}
                              {/* Assignee avatars */}
                              {(g.assignees || []).length > 0 && (
                                <div className="flex -space-x-1">
                                  {(g.assignees || []).slice(0, 4).map((a: any) => (
                                    <span key={a.employee_id} title={a.name}
                                      className="w-5 h-5 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 flex items-center justify-center text-[8px] font-black ring-1 ring-white dark:ring-slate-900">
                                      {(a.name || '?')[0].toUpperCase()}
                                    </span>
                                  ))}
                                  {(g.assignees || []).length > 4 && (
                                    <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-[8px] font-black ring-1 ring-white">
                                      +{(g.assignees || []).length - 4}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
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
      )}
      </>
      )}

      {/* SCOPE TABS & FILTERS */}
      {plannerView === 'goals' && (
      <>
      <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-slate-500">Deadline Extension Approvals</p>
            <p className="text-[11px] text-slate-500 mt-1">Team leaders request whole-goal extensions here. You approve or reject.</p>
          </div>
          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
            {pendingDeadlineExtensionRequests.length} pending
          </span>
        </div>
        {pendingDeadlineExtensionLoading ? (
          <p className="text-xs text-slate-400">Loading pending requests...</p>
        ) : pendingDeadlineExtensionRequests.length === 0 ? (
          <p className="text-xs text-slate-400">No pending deadline extension requests.</p>
        ) : (
          <div className="space-y-2">
            {pendingDeadlineExtensionRequests.slice(0, 6).map((req: any) => (
              <div key={req.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-2.5">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
                  {req.entity_type === 'goal' ? (req.goal_title || 'Goal') : (req.task_title || 'Task')}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Requested by {req.requester_name || req.requester_user_name || 'Unknown'} • {req.current_due_date || 'N/A'} → {req.requested_due_date || 'N/A'}
                </p>
                {req.reason && <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">Reason: {req.reason}</p>}
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => { void decideDeadlineExtensionRequest(Number(req.id), 'approve'); }}
                    disabled={pendingDeadlineExtensionDecisionId === Number(req.id)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => { void decideDeadlineExtensionRequest(Number(req.id), 'reject'); }}
                    disabled={pendingDeadlineExtensionDecisionId === Number(req.id)}
                    className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-bold disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="mb-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
        <div className="flex items-center justify-between gap-3">
        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 gap-1 overflow-x-auto whitespace-nowrap">
          {([{ scope: 'Department' as const, icon: Building2, label: 'Dept-wide', desc: 'Whole department goals' },
            { scope: 'Team' as const, icon: Users, label: 'Team', desc: 'Group / team goals' },
            { scope: 'Individual' as const, icon: User, label: 'Individual', desc: 'Personal employee goals' },
          ]).map(({ scope: s, icon: Icon, label, desc }) => {
            const count = goals.filter(g => (g.scope || 'Individual') === s).length;
            return (
              <button key={s} onClick={() => { setActiveTab(s); setViewGoalId(null); }} title={desc}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === s ? 'bg-white dark:bg-slate-900 text-teal-deep dark:text-teal-green shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                <Icon size={14} /> {label} <span className="text-[10px] font-black ml-0.5 opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="relative w-56 shrink-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Search goals..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-green/50 placeholder:text-slate-400" />
        </div>
        </div>

        <div className="mt-3 flex items-center gap-2 min-w-0 overflow-hidden">
          <SearchableSelect
            className="w-[210px] shrink-0"
            options={[{ value: 'All', label: 'All Departments' }, ...DEPARTMENTS.map(d => ({ value: d, label: d }))]}
            value={filterDept}
            onChange={v => setFilterDept(String(v))}
            placeholder="All Departments"
            pill
            searchable
            dropdownVariant="pills-horizontal"
          />
          <SearchableSelect
            className="w-[190px] shrink-0"
            options={[{ value: 'All', label: 'All Statuses' }, ...STATUSES.map(s => ({ value: s, label: s }))]}
            value={filterStatus}
            onChange={v => setFilterStatus(String(v))}
            placeholder="All Statuses"
            pill
            searchable
            dropdownVariant="pills-horizontal"
          />
          <SearchableSelect
            className="w-[180px] shrink-0"
            options={[
              { value: 'active', label: 'Active Only' },
              { value: 'include', label: 'Show Archived' },
            ]}
            value={showArchived ? 'include' : 'active'}
            onChange={v => setShowArchived(String(v) === 'include')}
            pill
            searchable={false}
            dropdownVariant="pills-horizontal"
          />
        </div>
      </div>

      {/* GOALS TABLE */}
      <Card>
        <div className="overflow-x-auto pb-1">
          <table className="w-full text-left border-collapse table-fixed">
            <thead><tr className="border-b border-slate-100 dark:border-slate-800">
              <th className="py-3 px-3 text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider w-[320px]">Title</th>
              <th className="py-3 px-3 text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider w-[170px]">Department</th>
              {activeTab === 'Team' && <th className="py-3 px-3 text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider w-[170px]">Team</th>}
              {activeTab === 'Individual' && <th className="py-3 px-3 text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider w-[170px]">Employee</th>}
              <th className="py-3 px-3 text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider w-[220px]">Owner</th>
              <th className="py-3 px-3 text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider w-[96px]">Priority</th>
              <th className="py-3 px-3 text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider w-[170px]">Progress</th>
              <th className="py-3 px-3 text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider w-[130px]">Status</th>
              <th className="py-3 px-3 text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider text-right w-[120px]">Actions</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={activeTab === 'Department' ? 7 : 8} className="py-12 text-center text-sm text-slate-400 italic">
                  No {activeTab.toLowerCase()} goals found. Click &quot;Add Goal&quot; to create one.
                </td></tr>
              )}
              {filtered.map((g: any) => {
                const isArchived = !!g.deleted_at;
                const overdue = g.target_date && new Date(g.target_date) < new Date() && g.status !== 'Completed' && g.status !== 'Cancelled';
                return (
                  <React.Fragment key={g.id}>
                    <tr className={`border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors ${overdue ? 'bg-red-50/30 dark:bg-red-900/5' : ''} ${isArchived ? 'opacity-60' : ''}`}>
                      <td className="py-3 px-3 align-top">
                        <div className="space-y-0.5 min-w-0">
                          <span className="block min-w-0 truncate font-medium text-slate-700 dark:text-slate-100 text-sm" title={g.title || g.statement}>{g.title || g.statement}</span>
                          <div className="flex flex-wrap items-center gap-1">
                            {overdue && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-600">OVERDUE</span>}
                            {isArchived && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">ARCHIVED</span>}
                            {g.frequency && g.frequency !== 'One-time' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">{g.frequency}</span>}
                          </div>
                          {g.assignees && g.assignees.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap pt-0.5">
                              {(g.assignees as any[]).slice(0, 5).map((a: any) => (
                                <span key={a.employee_id} title={a.name} className="w-5 h-5 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 text-[9px] font-black flex items-center justify-center">{(a.name || '?')[0]}</span>
                              ))}
                              {g.assignees.length > 5 && <span className="text-[9px] text-slate-400 font-bold ml-0.5">+{g.assignees.length - 5}</span>}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-500 dark:text-slate-400 truncate" title={g.department || '\u2014'}>{g.department || '\u2014'}</td>
                      {activeTab === 'Team' && <td className="py-3 px-3 text-xs text-slate-500 dark:text-slate-400 truncate" title={g.team_name || '\u2014'}>{g.team_name || '\u2014'}</td>}
                      {activeTab === 'Individual' && <td className="py-3 px-3 text-xs text-slate-500 dark:text-slate-400">
                        <div className="min-w-0"><span className="truncate max-w-[220px]" title={g.employee_name || '\u2014'}>{g.employee_name || '\u2014'}</span></div>
                      </td>}
                      <td className="py-3 px-3">
                        {g.delegation ? (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-6 h-6 rounded-full bg-teal-600/15 dark:bg-teal-500/15 text-teal-700 dark:text-teal-400 flex items-center justify-center text-[10px] font-black shrink-0">
                              {g.delegation.charAt(0).toUpperCase()}
                            </span>
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate min-w-0" title={g.delegation}>
                              {g.delegation}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3 px-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${priorityColor(g.priority || 'Medium')}`}>{g.priority || 'Medium'}</span></td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-2 rounded-full transition-all ${progressBarColor(g.progress || 0)}`}
                              style={{ width: `${g.progress || 0}%` }}
                            ></div>
                          </div>
                          <span className="text-xs font-bold text-slate-600 dark:text-slate-300 w-9 text-right shrink-0">{g.progress || 0}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {isArchived ? (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border text-slate-500 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700">Archived</span>
                        ) : (
                        <div className="flex items-center gap-1 whitespace-nowrap">
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${statusColor(g.status || 'Not Started')}`}>
                            {g.status || 'Not Started'}
                          </span>
                        </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                          <button onClick={() => setViewGoalId(g.id)} className="text-slate-500 hover:text-blue-700 p-1" title="View"><Eye size={14} /></button>
                          <button
                            onClick={() => {
                              void openProofReview(g.id);
                            }}
                            className={`p-1 rounded ${proofReviewOpenGoal === g.id ? 'text-blue-700 bg-blue-100 dark:bg-blue-900/30' : 'text-blue-500 hover:text-blue-700'}`}
                            title={proofReviewOpenGoal === g.id ? 'Hide Proof Review' : 'Open Proof Review'}
                          >
                            <Check size={14} />
                          </button>
                          <button onClick={() => exportGoalPdf(g)} className="text-blue-500 hover:text-blue-700 p-1" title="Export PDF"><FileText size={14} /></button>
                          {!isArchived && <button onClick={() => handleDelete(g.id)} className="text-red-500 hover:text-red-600 p-1 rounded" title="Archive"><Archive size={15} /></button>}
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      </div>
      </>
      )}

      <Modal
        open={!!viewGoalId}
        title="Goal Details"
        onClose={() => setViewGoalId(null)}
        maxWidthClassName="max-w-5xl"
        bodyClassName="space-y-4"
      >
        {viewGoalId && (() => {
          const g = goals.find((goal: any) => Number(goal?.id) === Number(viewGoalId));
          if (!g) return <p className="text-sm text-slate-500">Goal not found.</p>;
          const overdue = g.target_date && new Date(g.target_date) < new Date() && g.status !== 'Completed' && g.status !== 'Cancelled';
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Goal Level</span><span className="text-slate-700 dark:text-slate-200">{g.scope === 'Department' ? 'Dept-wide' : g.scope === 'Team' ? 'Team' : 'Individual'}</span></div>
                <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Department</span><span className="text-slate-700 dark:text-slate-200">{g.department || '\u2014'}</span></div>
                <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Team</span><span className="text-slate-700 dark:text-slate-200">{g.team_name || '\u2014'}</span></div>
                <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Employee</span>
                  <div className="min-w-0"><span className="text-slate-700 dark:text-slate-200 truncate max-w-[220px]" title={g.employee_name || '\u2014'}>{g.employee_name || '\u2014'}</span></div>
                </div>
                <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Quarter</span><span className="text-slate-700 dark:text-slate-200">{g.quarter || '\u2014'}</span></div>
                <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Frequency</span><span className="text-slate-700 dark:text-slate-200">{g.frequency || 'One-time'}</span></div>
                <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Team Leader</span><span className="text-slate-700 dark:text-slate-200">{g.leader_name || '\u2014'}</span></div>
                <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Target Date</span><span className={`${overdue ? 'text-red-600 font-bold' : 'text-slate-700 dark:text-slate-200'}`}>{g.target_date || '\u2014'}</span></div>
              </div>

              {g.assignees && g.assignees.length > 0 && (
                <div>
                  <span className="font-bold text-teal-deep dark:text-teal-green text-xs block mb-2">Assignees ({g.assignees.length})</span>
                  <div className="flex flex-wrap gap-2">
                    {(g.assignees as any[]).map((a: any) => (
                      <span key={a.employee_id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 text-xs font-bold border border-teal-200 dark:border-teal-800">
                        <span className="w-4 h-4 rounded-full bg-teal-200 dark:bg-teal-800 text-teal-600 dark:text-teal-300 flex items-center justify-center text-[9px] font-black">{(a.name || '?')[0]}</span>
                        {a.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <span className="font-bold text-teal-deep dark:text-teal-green text-xs block mb-1">Goal Statement</span>
                <p className="text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">{g.statement || '\u2014'}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="font-bold text-teal-deep dark:text-teal-green text-xs block mb-1">Key Metric</span>
                  <p className="text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">{g.metric || '\u2014'}</p>
                </div>
                <div>
                  <span className="font-bold text-teal-deep dark:text-teal-green text-xs block mb-1">Team Leader (Owner)</span>
                  <p className="text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">{g.delegation || '\u2014'}</p>
                </div>
              </div>

              <div className="flex items-center justify-end">
                <button
                  onClick={() => void openProofReview(Number(g.id))}
                  className="h-8 px-2.5 rounded-lg text-[10px] font-bold border transition-colors bg-blue-50 dark:bg-blue-900/25 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                >
                  Open Proof Review
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      <Modal
        open={!!proofReviewOpenGoal}
        title={`Task Proof Review${proofReviewGoal?.title ? ` - ${proofReviewGoal.title}` : ''}`}
        onClose={() => setProofReviewOpenGoal(null)}
        maxWidthClassName="max-w-5xl"
        bodyClassName="space-y-3"
      >
        {proofReviewOpenGoal && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-100 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-900/20 px-3 py-2">
              <p className="text-xs font-bold text-blue-700 dark:text-blue-300">
                Live sync every 5s • Last sync {Math.max(0, Math.floor((Date.now() - proofRealtimeSyncAt) / 1000))}s ago
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void refreshProofReviewTasks(proofReviewOpenGoal)}
                  className="text-[11px] font-bold px-2.5 py-1.5 rounded bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                >
                  Refresh proofs
                </button>
              </div>
            </div>

            {proofReviewGoal && (() => {
              const goalProofFiles = parseGoalProofFiles(proofReviewGoal);
              const goalProofStatus = String(proofReviewGoal.proof_review_status || 'Not Submitted');
              const goalProofApproved = goalProofStatus === 'Approved';
              const hasGoalProof = goalProofFiles.length > 0;
              return (
                <div className="rounded-lg border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-900/15 p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Final Goal Proof</p>
                      <p className="text-[10px] text-emerald-700/80 dark:text-emerald-300/80">Manager review actions are applied to this final proof.</p>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${goalProofStatus === 'Approved' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : goalProofStatus === 'Pending Review' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : goalProofStatus === 'Needs Revision' || goalProofStatus === 'Rejected' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'}`}>
                      {goalProofStatus}
                    </span>
                  </div>

                  {!hasGoalProof ? (
                    <p className="text-[11px] text-slate-500">No final proof has been submitted yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {goalProofFiles.map((file, fileIndex) => (
                        <div key={`${proofReviewGoal.id}-goal-proof-${fileIndex}`} className="rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-white dark:bg-slate-900 p-2">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate">{file.proof_file_name || `Final proof ${fileIndex + 1}`}</p>
                            <button
                              type="button"
                              onClick={() => setProofFileViewer({ src: String(file.proof_file_data || ''), fileName: file.proof_file_name, mimeType: file.proof_file_type })}
                              className="text-[10px] font-bold text-teal-600 hover:text-teal-700"
                            >
                              View Full File
                            </button>
                          </div>
                          <ProofAttachment src={file.proof_file_data} fileName={file.proof_file_name} mimeType={file.proof_file_type} compact />
                        </div>
                      ))}
                    </div>
                  )}

                  {proofReviewGoal.proof_note && <p className="text-[10px] text-slate-600 dark:text-slate-300"><span className="font-bold">Note:</span> {proofReviewGoal.proof_note}</p>}
                  {proofReviewGoal.proof_submitted_at && <p className="text-[10px] text-slate-500">Submitted: {new Date(proofReviewGoal.proof_submitted_at).toLocaleDateString()}</p>}
                  {proofReviewGoal.proof_review_note && <p className="text-[10px] text-slate-500 italic">Latest manager note: {proofReviewGoal.proof_review_note}</p>}
                    {goalProofApproved && Number(proofReviewGoal.proof_review_rating || 0) > 0 && <p className="text-[10px] text-slate-500">Latest manager rating: <span className="font-bold">{Number(proofReviewGoal.proof_review_rating || 0)}/5</span></p>}

                  {hasGoalProof && (
                    <div className="space-y-2">
                      <textarea
                        rows={2}
                        value={proofReviewNotes[proofReviewGoal.id] ?? String(proofReviewGoal.proof_review_note || '')}
                        onChange={(e) => setProofReviewNotes(prev => ({ ...prev, [proofReviewGoal.id]: e.target.value }))}
                        className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]"
                        placeholder="Final proof review note (optional)"
                          disabled={proofReviewSubmittingTaskId === proofReviewGoal.id || !goalProofApproved}
                      />
                      {goalProofApproved && Number(proofReviewGoal.proof_review_rating || 0) > 0 && (
                        <p className="text-[10px] text-slate-500">Manager rating: <span className="font-bold">{Number(proofReviewGoal.proof_review_rating || 0)}/5</span></p>
                      )}
                      {goalProofApproved ? (
                        <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">Final proof already approved. Decision is locked.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => void reviewGoalFinalProof(Number(proofReviewGoal.id), 'Approved')}
                            disabled={proofReviewSubmittingTaskId === proofReviewGoal.id}
                            className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                          >
                            Approve Final Proof
                          </button>
                          <button
                            onClick={() => void reviewGoalFinalProof(Number(proofReviewGoal.id), 'Needs Revision')}
                            disabled={proofReviewSubmittingTaskId === proofReviewGoal.id}
                            className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60"
                          >
                            Needs Revision
                          </button>
                          <button
                            onClick={() => void reviewGoalFinalProof(Number(proofReviewGoal.id), 'Rejected')}
                            disabled={proofReviewSubmittingTaskId === proofReviewGoal.id}
                            className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {proofReviewLoadingGoal === proofReviewOpenGoal ? (
              <p className="text-sm text-slate-500">Loading task proofs...</p>
            ) : ((proofReviewTasksByGoal[proofReviewOpenGoal] || []).length === 0 ? (
              <p className="text-sm text-slate-500">No delegated tasks found for this goal yet.</p>
            ) : (
              (proofReviewTasksByGoal[proofReviewOpenGoal] || []).map((t: any) => {
                const reviewStatus = t.proof_review_status || 'Not Submitted';
                const reviewRole = String((t as any).reviewer_role || (t as any).proof_reviewed_role || '').trim().toLowerCase();
                const effectiveProgress = reviewStatus === 'Approved'
                  ? (reviewRole === 'manager' ? 100 : Math.min(Math.max(0, Math.min(100, Number(t.progress || 0))), 75))
                  : Math.max(0, Math.min(100, Number(t.progress || 0)));
                const effectiveStatus = t.status || 'Not Started';
                const proofFiles = parseTaskProofFiles(t);
                const hasProof = proofFiles.length > 0;
                const goalLeaderId = Number((proofReviewGoal as any)?.leader_id || 0);
                const reviewedByLeader = goalLeaderId > 0 && Number((t as any).proof_reviewed_by || 0) === goalLeaderId;
                const reviewLabel = reviewStatus === 'Approved'
                  ? (reviewRole === 'manager' ? 'Approved by Team Leader and Manager' : (reviewedByLeader || reviewRole === 'team_leader' ? 'Approved by Team Leader' : 'Approved'))
                  : reviewStatus;
                return (
                  <div key={t.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{t.title || 'Untitled Task'}</p>
                        <p className="text-[10px] text-slate-500">{t.member_name || `#${t.member_employee_id}`} • Status: <span className="font-bold">{effectiveStatus}</span> • Progress: <span className="font-bold">{effectiveProgress}%</span></p>
                      </div>
                      <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full whitespace-nowrap ${reviewStatus === 'Approved' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : reviewStatus === 'Pending Review' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : reviewStatus === 'Needs Revision' || reviewStatus === 'Rejected' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'}`}>
                        {reviewLabel}
                      </span>
                    </div>

                    {reviewStatus === 'Approved' && (
                      <>
                        {!hasProof && <p className="mb-2 text-[10px] text-slate-500">No delegated task proof uploaded yet.</p>}
                        {hasProof && (
                          <div className="mb-2 space-y-2 max-w-xl">
                            {proofFiles.map((file, fileIndex) => (
                              <div key={`${file.proof_file_name}-${fileIndex}`} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-2">
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate">{file.proof_file_name || `Proof ${fileIndex + 1}`}</p>
                                  <button
                                    type="button"
                                    onClick={() => setProofFileViewer({ src: String(file.proof_file_data || ''), fileName: file.proof_file_name, mimeType: file.proof_file_type })}
                                    className="text-[10px] font-bold text-teal-600 hover:text-teal-700"
                                  >
                                    View Full File
                                  </button>
                                </div>
                                <ProofAttachment src={file.proof_file_data} fileName={file.proof_file_name} mimeType={file.proof_file_type} compact />
                              </div>
                            ))}
                          </div>
                        )}

                        {t.proof_note && <p className="mb-1 text-[10px] text-slate-600 dark:text-slate-300"><span className="font-bold">Note:</span> {t.proof_note}</p>}
                        {t.proof_submitted_at && <p className="mb-1 text-[10px] text-slate-500">Submitted: {new Date(t.proof_submitted_at).toLocaleDateString()}</p>}
                        {t.proof_review_note && <p className="mb-2 text-[10px] text-slate-500 italic">Feedback: {t.proof_review_note}</p>}
                        {reviewRole === 'manager' && Number(t.proof_review_rating || 0) > 0 && <p className="mb-2 text-[10px] text-slate-500">Latest manager rating: <span className="font-bold">{Number(t.proof_review_rating || 0)}/5</span></p>}

                        {hasProof && (
                          <div className="space-y-2">
                            <textarea
                              rows={2}
                              value={proofReviewNotes[t.id] ?? String(t.proof_review_note || '')}
                              onChange={(e) => setProofReviewNotes((prev) => ({ ...prev, [t.id]: e.target.value }))}
                              className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]"
                              placeholder="Member proof review note (optional)"
                              disabled={proofReviewSubmittingTaskId === t.id}
                            />
                              {Number(t.proof_review_rating || 0) > 0 && <p className="text-[10px] text-slate-500">Manager rating: <span className="font-bold">{Number(t.proof_review_rating || 0)}/5</span></p>}
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => void reviewTaskProof(Number(t.id), Number(proofReviewOpenGoal), 'Approved')}
                                disabled={proofReviewSubmittingTaskId === t.id}
                                className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                              >
                                Approve Proof
                              </button>
                              <button
                                onClick={() => void reviewTaskProof(Number(t.id), Number(proofReviewOpenGoal), 'Needs Revision')}
                                disabled={proofReviewSubmittingTaskId === t.id}
                                className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60"
                              >
                                Needs Revision
                              </button>
                              <button
                                onClick={() => void reviewTaskProof(Number(t.id), Number(proofReviewOpenGoal), 'Rejected')}
                                disabled={proofReviewSubmittingTaskId === t.id}
                                className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60"
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={!!proofFileViewer}
        title={proofFileViewer ? `File Viewer: ${proofFileViewer.fileName || 'Attachment'}` : 'File Viewer'}
        onClose={() => setProofFileViewer(null)}
        maxWidthClassName="max-w-[900px]"
        bodyClassName="space-y-3 !max-h-[92vh]"
      >
        {proofFileViewer?.src ? (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
            <ProofAttachment src={proofFileViewer.src} fileName={proofFileViewer.fileName} mimeType={proofFileViewer.mimeType} viewer />
          </div>
        ) : (
          <p className="text-sm text-slate-500">No file selected.</p>
        )}
      </Modal>
    </motion.div>
  );
};
