import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { CircularProgress } from '../../common/CircularProgress';
import { ProofAttachment } from '../../common/ProofAttachment';
import { Download, Target, TrendingUp, Award, BarChart3, SendHorizonal, AlertTriangle, DollarSign, Building2, Users, User, ClipboardList, CalendarDays, Flag, Save, Archive, Upload, Image as ImageIcon, CheckCircle2 } from 'lucide-react';
import { LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';

const safeParseSession = (raw: string | null) => {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const normalizeArray = (value: any) => (Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []);

export const CareerDashboard = () => {
  const [appraisals, setAppraisals] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [pips, setPips] = useState<any[]>([]);
  const [idps, setIdps] = useState<any[]>([]);
  const [requesting, setRequesting] = useState<number | null>(null);
  const [selfAssessments, setSelfAssessments] = useState<any[]>([]);
  const [salary, setSalary] = useState<number | null>(null);
  const [leaderGoals, setLeaderGoals] = useState<any[]>([]);
  const [leaderTeamMembers, setLeaderTeamMembers] = useState<any[]>([]);
  const [dashboardTab, setDashboardTab] = useState<'overview' | 'goals' | 'leaderGoals' | 'pips' | 'idps'>('overview');
  const [taskDrafts, setTaskDrafts] = useState<Record<number, any>>({});
  const [taskProgressEdits, setTaskProgressEdits] = useState<Record<number, number>>({});
  const [taskReviewNotes, setTaskReviewNotes] = useState<Record<number, string>>({});
  const [taskProgressOpenTaskId, setTaskProgressOpenTaskId] = useState<number | null>(null);
  const [taskSavingGoal, setTaskSavingGoal] = useState<number | null>(null);
  const [myMemberTasks, setMyMemberTasks] = useState<any[]>([]);
  const [proofDrafts, setProofDrafts] = useState<Record<number, { proof_image: string; proof_file_name: string; proof_file_type: string; proof_note: string }>>({});
  const [proofSubmittingTaskId, setProofSubmittingTaskId] = useState<number | null>(null);
  const [closedProofEditors, setClosedProofEditors] = useState<Record<number, boolean>>({});
  const localUser = safeParseSession(localStorage.getItem('talentflow_user') || localStorage.getItem('user'));

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      void fetchData();
    }, 5000);
    return () => clearInterval(interval);
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
    setProofDrafts(prev => {
      const next = { ...prev };
      for (const t of myMemberTasks) {
        if (!next[t.id]) {
          next[t.id] = {
            proof_image: t.proof_image || '',
            proof_file_name: t.proof_file_name || '',
            proof_file_type: t.proof_file_type || '',
            proof_note: t.proof_note || '',
          };
        }
      }
      return next;
    });
  }, [myMemberTasks]);

  useEffect(() => {
    setClosedProofEditors(prev => {
      const next = { ...prev };
      for (const t of myMemberTasks) {
        const rs = String(t?.proof_review_status || 'Not Submitted');
        if (rs === 'Pending Review' || rs === 'Approved') {
          next[t.id] = true;
        }
      }
      return next;
    });
  }, [myMemberTasks]);

  const fetchData = async () => {
    let account: any = {};
    try {
      const accountRes = await fetch('/api/account-info', { headers: getAuthHeaders() });
      account = accountRes.ok ? await accountRes.json() : {};
    } catch {
      account = {};
    }

    const employeeId = Number(account?.employee_id || localUser?.employee_id || localUser?.id || 0) || null;

    // Goals endpoint already enforces access control for Employee role; do not over-filter with potentially stale local IDs.
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
      setLeaderGoals(normalizeArray(d?.goals));
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
      setIdps(normalizeArray(d).filter((i: any) => !employeeId || Number(i.employee_id) === employeeId));
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

    try {
      const r = await fetch('/api/member-tasks/my', { headers: getAuthHeaders() });
      const d = await r.json();
      setMyMemberTasks(normalizeArray(d));
    } catch {
      setMyMemberTasks([]);
    }
    if (employeeId) {
      try {
        const r = await fetch(`/api/employees/${employeeId}`, { headers: getAuthHeaders() });
        const d = await r.json();
        setSalary(d.salary_base || null);
      } catch {
        setSalary(null);
      }
    } else {
      setSalary(null);
    }
  };

  const handleProofDraftChange = (taskId: number, patch: Partial<{ proof_image: string; proof_file_name: string; proof_file_type: string; proof_note: string }>) => {
    setProofDrafts(prev => ({
      ...prev,
      [taskId]: {
        proof_image: prev[taskId]?.proof_image || '',
        proof_file_name: prev[taskId]?.proof_file_name || '',
        proof_file_type: prev[taskId]?.proof_file_type || '',
        proof_note: prev[taskId]?.proof_note || '',
        ...patch,
      }
    }));
  };

  const handleProofImageUpload = async (taskId: number, file?: File | null) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      window.notify?.('File must be under 10 MB', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => handleProofDraftChange(taskId, {
      proof_image: String(reader.result || ''),
      proof_file_name: file.name,
      proof_file_type: file.type || 'application/octet-stream',
    });
    reader.readAsDataURL(file);
  };

  const submitTaskProof = async (taskId: number) => {
    const draft = proofDrafts[taskId] || { proof_image: '', proof_file_name: '', proof_file_type: '', proof_note: '' };
    if (!draft.proof_image) {
      window.notify?.('Please attach a proof file first', 'error');
      return;
    }
    setProofSubmittingTaskId(taskId);
    try {
      const res = await fetch(`/api/member-tasks/${taskId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          proof_image: draft.proof_image,
          proof_file_name: draft.proof_file_name,
          proof_file_type: draft.proof_file_type,
          proof_note: draft.proof_note,
        })
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Proof submitted for review', 'success');
      setClosedProofEditors(prev => ({ ...prev, [taskId]: true }));
      fetchData();
    } catch {
      window.notify?.('Failed to submit proof', 'error');
    } finally {
      setProofSubmittingTaskId(null);
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
      }
    }));
  };

  const handleCreateLeaderTask = async (goalId: number) => {
    const draft = taskDrafts[goalId] || {};
    const memberId = Number(draft.member_id);
    const title = String(draft.title || '').trim();
    const description = String(draft.description || '').trim();
    const dueDate = String(draft.due_date || '').trim();
    const priority = String(draft.priority || 'Medium');

    if (!memberId) { window.notify?.('Select a member for this task', 'error'); return; }
    if (!title) { window.notify?.('Please enter a task title', 'error'); return; }
    if (!dueDate) { window.notify?.('Please set a deadline', 'error'); return; }

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
        })
      });
      if (!res.ok) {
        let msg = 'Failed to assign task';
        try { const err = await res.json(); msg = err.error || msg; } catch {}
        throw new Error(msg);
      }
      window.notify?.('Detailed task assigned', 'success');
      setTaskDrafts(prev => ({
        ...prev,
        [goalId]: { member_id: '', title: '', description: '', due_date: '', priority: 'Medium' }
      }));
      fetchData();
    } catch (e: any) {
      window.notify?.(e?.message || 'Failed to assign task', 'error');
    } finally {
      setTaskSavingGoal(null);
    }
  };

  const handleUpdateLeaderTask = async (taskId: number, updates: Record<string, any>, successMessage = 'Task updated') => {
    try {
      const res = await fetch(`/api/member-tasks/${taskId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.(successMessage, 'success');
      setTaskProgressOpenTaskId(prev => (prev === taskId ? null : prev));
      fetchData();
    } catch {
      window.notify?.('Failed to update task', 'error');
    }
  };

  const handleDeleteLeaderTask = async (taskId: number) => {
    try {
      const res = await fetch(`/api/member-tasks/${taskId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Task removed', 'success');
      fetchData();
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
        <button onClick={() => exportToCSV([...appraisals.map(a => ({ ...a, type: 'Appraisal' })), ...goals.map(g => ({ ...g, type: 'Goal' })), ...pips.map(p => ({ ...p, type: 'PIP' })), ...idps.map(i => ({ ...i, type: 'IDP' }))], 'career_data')} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><Download size={16} /> XLSX</button>
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
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">My Goals ({goals.length})</h3>
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
              {goals.map((g, idx) => (
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
                    {g.status !== 'Completed' && (
                      <button
                        disabled={requesting === g.id}
                        onClick={async () => {
                          setRequesting(g.id);
                          try {
                            const user = safeParseSession(localStorage.getItem('talentflow_user'));
                            await fetch('/api/goal_update_request', {
                              method: 'POST', headers: getAuthHeaders(),
                              body: JSON.stringify({ employee_id: user.employee_id, goal_id: g.id, goal_title: g.title || g.statement, proposed_status: g.status === 'In Progress' ? 'Completed' : 'In Progress', proposed_progress: g.status === 'In Progress' ? 100 : 50, reason: 'Progress update requested' }),
                            });
                            window.notify?.('Goal update request sent to your manager', 'success');
                          } catch { window.notify?.('Failed to send request', 'error'); }
                          setRequesting(null);
                        }}
                        className="text-[10px] font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
                      >
                        <SendHorizonal size={12} /> Request Approval
                      </button>
                    )}
                  </td>
                </motion.tr>
              ))}
              </AnimatePresence>
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
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">Delegated Tasks Requiring Proof ({myMemberTasks.length})</h3>
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
          ) : (
            <div className="space-y-3">
              {myMemberTasks.map((t: any) => {
                const draft = proofDrafts[t.id] || { proof_image: t.proof_image || '', proof_file_name: t.proof_file_name || '', proof_file_type: t.proof_file_type || '', proof_note: t.proof_note || '' };
                const reviewStatus = t.proof_review_status || 'Not Submitted';
                const isEditorClosed = !!closedProofEditors[t.id] || reviewStatus === 'Pending Review' || reviewStatus === 'Approved';
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

                    <div className="mt-2 flex justify-end">
                      {isEditorClosed ? (
                        <button
                          onClick={() => setClosedProofEditors(prev => ({ ...prev, [t.id]: false }))}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300"
                        >
                          Open Proof Details
                        </button>
                      ) : (
                        <button
                          onClick={() => setClosedProofEditors(prev => ({ ...prev, [t.id]: true }))}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300"
                        >
                          Close
                        </button>
                      )}
                    </div>

                    {!isEditorClosed && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                      <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-3 bg-white/70 dark:bg-slate-900/50">
                        <ProofAttachment src={draft.proof_image} fileName={draft.proof_file_name} mimeType={draft.proof_file_type} compact />
                        <label className="mt-2 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700">
                          <Upload size={12} /> Attach Proof File
                          <input type="file" accept="*/*" className="hidden" onChange={(e) => handleProofImageUpload(t.id, e.target.files?.[0])} />
                        </label>
                        {draft.proof_file_name && (
                          <p className="mt-2 text-[10px] text-slate-500 truncate">Selected file: {draft.proof_file_name}</p>
                        )}
                      </div>

                      <div>
                        <textarea
                          rows={5}
                          value={draft.proof_note}
                          onChange={(e) => handleProofDraftChange(t.id, { proof_note: e.target.value })}
                          className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                          placeholder="Add notes explaining the attached proof"
                        />
                        <div className="mt-2 flex justify-end">
                          <button
                            onClick={() => submitTaskProof(t.id)}
                            disabled={proofSubmittingTaskId === t.id}
                            className="px-3 py-1.5 rounded-lg bg-teal-deep text-white text-xs font-bold hover:bg-teal-green disabled:opacity-50"
                          >
                            {proofSubmittingTaskId === t.id ? 'Submitting...' : 'Submit For Review'}
                          </button>
                        </div>
                      </div>
                    </div>
                    )}
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
          <p className="text-xs text-slate-400 mb-4">Your manager defines your team members. You can delegate goal tasks to that roster and track progress here.</p>
          <div className="space-y-3">
            {leaderGoals.map((g) => {
              const assignees = (Array.isArray(g.assignees) ? g.assignees : []).filter((a: any) => leaderTeamMemberIdSet.has(String(a?.employee_id ?? '')));
              const memberTasks = (Array.isArray(g.member_tasks) ? g.member_tasks : []).filter((t: any) => leaderTeamMemberIdSet.has(String(t?.member_employee_id ?? '')));
              const taskDraft = taskDrafts[g.id] || { member_id: '', title: '', description: '', due_date: '', priority: 'Medium' };
              return (
                <div key={g.id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 bg-white/70 dark:bg-slate-900/40">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{g.title || g.statement || 'Untitled Goal'}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{(g.scope || 'Individual')} • {g.target_date || 'No target date'}</p>
                    </div>
                    <span className={`text-[10px] font-bold uppercase ${g.status === 'Completed' ? 'text-emerald-600' : g.status === 'In Progress' ? 'text-amber-500' : g.status === 'At Risk' ? 'text-red-500' : 'text-slate-400'}`}>{g.status || 'Not Started'}</span>
                  </div>

                  <div className="mb-3">
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                      <div className={`h-2.5 rounded-full transition-all ${progressBarColor(g.progress || 0)}`} style={{ width: `${g.progress || 0}%` }} />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">Progress: {g.progress || 0}%</p>
                  </div>

                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Team Members (Set By Manager)</p>
                    {assignees.length === 0 ? (
                      <p className="text-xs text-slate-400">No team members are configured for this goal yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {assignees.map((a: any, index: number) => (
                          <div key={a.employee_id || `assignee-${g.id}-${index}`} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">
                            <span className="text-slate-700 dark:text-slate-300">{getMemberDisplayName(a)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2 flex items-center gap-1.5">
                      <ClipboardList size={12} /> Detailed Task Assignment
                    </p>

                    {assignees.length === 0 ? (
                      <p className="text-xs text-slate-400">No manager-assigned members for this goal yet.</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                          <select
                            value={taskDraft.member_id}
                            onChange={(e) => handleTaskDraftChange(g.id, { member_id: e.target.value })}
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
                            onChange={(e) => handleTaskDraftChange(g.id, { title: e.target.value })}
                            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                            placeholder="Task title (e.g., Prepare Q2 lead report)"
                          />

                          <input
                            type="date"
                            value={taskDraft.due_date}
                            onChange={(e) => handleTaskDraftChange(g.id, { due_date: e.target.value })}
                            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                          />

                          <select
                            value={taskDraft.priority}
                            onChange={(e) => handleTaskDraftChange(g.id, { priority: e.target.value })}
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
                            onChange={(e) => handleTaskDraftChange(g.id, { description: e.target.value })}
                            className="md:col-span-2 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                            placeholder="Task details / expected output"
                          />
                        </div>

                        <div className="flex justify-end">
                          <button
                            onClick={() => handleCreateLeaderTask(g.id)}
                            disabled={taskSavingGoal === g.id}
                            className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold disabled:opacity-50"
                          >
                            {taskSavingGoal === g.id ? 'Saving...' : 'Assign Task'}
                          </button>
                        </div>
                      </>
                    )}

                    <div className="mt-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Task Board ({memberTasks.length})</p>
                      {memberTasks.length === 0 ? (
                        <p className="text-xs text-slate-400">No detailed tasks yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {memberTasks.map((t: any, index: number) => {
                            const progressValue = taskProgressEdits[t.id] ?? Number(t.progress || 0);
                            const isProgressOpen = taskProgressOpenTaskId === t.id;
                            const proofReviewStatus = String(t.proof_review_status || 'Not Submitted');
                            const hasProof = !!t.proof_image;
                            const reviewNoteValue = taskReviewNotes[t.id] ?? String(t.proof_review_note || '');
                            return (
                              <div key={t.id || `task-${g.id}-${index}`} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 bg-slate-50 dark:bg-slate-900/40">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{t.title || 'Untitled Task'}</p>
                                    {t.description && <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>}
                                    <div className="flex flex-wrap gap-2 mt-1">
                                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{getMemberDisplayName(t)}</span>
                                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 inline-flex items-center gap-1"><Flag size={10} />{t.priority || 'Medium'}</span>
                                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 inline-flex items-center gap-1"><CalendarDays size={10} />{t.due_date || 'No deadline'}</span>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => handleDeleteLeaderTask(Number(t.id))}
                                    className="text-red-500 hover:text-red-600 p-1 rounded"
                                    title="Archive task"
                                  >
                                    <Archive size={15} />
                                  </button>
                                </div>

                                {!isProgressOpen ? (
                                  <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                      <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden max-w-[220px]">
                                        <div className={`h-2 rounded-full ${progressValue >= 100 ? 'bg-emerald-500' : progressValue >= 50 ? 'bg-teal-500' : 'bg-amber-500'}`} style={{ width: `${progressValue}%` }} />
                                      </div>
                                      <span className="text-sm font-bold text-slate-700 dark:text-slate-200 w-10 text-right">{progressValue}%</span>
                                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColors[t.status || 'Not Started']}`}>{t.status || 'Not Started'}</span>
                                    </div>
                                    <button
                                      onClick={() => setTaskProgressOpenTaskId(t.id)}
                                      className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700"
                                    >
                                      Update
                                    </button>
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
                                    <select
                                      value={t.status || 'Not Started'}
                                      onChange={(e) => handleUpdateLeaderTask(Number(t.id), { status: e.target.value }, 'Task status updated')}
                                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                                    >
                                      <option value="Not Started">Not Started</option>
                                      <option value="In Progress">In Progress</option>
                                      <option value="Blocked">Blocked</option>
                                      <option value="Completed">Completed</option>
                                    </select>

                                    <div className="flex items-center gap-2 md:col-span-2">
                                      <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={progressValue}
                                        onChange={(e) => setTaskProgressEdits(prev => ({ ...prev, [t.id]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))}
                                        className="w-24 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                                      />
                                      <span className="text-xs text-slate-500">%</span>
                                      <button
                                        onClick={() => handleUpdateLeaderTask(Number(t.id), { progress: progressValue }, 'Task progress updated')}
                                        className="px-2.5 py-2 rounded-lg bg-teal-deep text-white text-xs font-bold inline-flex items-center gap-1"
                                      >
                                        <Save size={12} /> Save Progress
                                      </button>
                                      <button
                                        onClick={() => setTaskProgressOpenTaskId(null)}
                                        className="px-2.5 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold"
                                      >
                                        Close
                                      </button>
                                    </div>
                                  </div>
                                )}

                                <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Proof Review</p>
                                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${proofReviewStatus === 'Approved' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : proofReviewStatus === 'Pending Review' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : proofReviewStatus === 'Needs Revision' || proofReviewStatus === 'Rejected' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'}`}>
                                      {proofReviewStatus}
                                    </span>
                                  </div>

                                  {hasProof ? (
                                    <>
                                      <ProofAttachment
                                        src={t.proof_image}
                                        fileName={t.proof_file_name}
                                        mimeType={t.proof_file_type}
                                        compact
                                      />
                                      <textarea
                                        rows={2}
                                        value={reviewNoteValue}
                                        onChange={(e) => setTaskReviewNotes(prev => ({ ...prev, [t.id]: e.target.value }))}
                                        className="w-full mt-2 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                                        placeholder="Add review note (optional)"
                                      />
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        <button
                                          onClick={() => handleUpdateLeaderTask(Number(t.id), { proof_review_status: 'Approved', proof_review_note: reviewNoteValue }, 'Proof approved')}
                                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold"
                                        >
                                          Approve
                                        </button>
                                        <button
                                          onClick={() => handleUpdateLeaderTask(Number(t.id), { proof_review_status: 'Needs Revision', proof_review_note: reviewNoteValue }, 'Revision requested')}
                                          className="px-2.5 py-1.5 rounded-lg bg-amber-500 text-white text-[11px] font-bold"
                                        >
                                          Needs Revision
                                        </button>
                                        <button
                                          onClick={() => handleUpdateLeaderTask(Number(t.id), { proof_review_status: 'Rejected', proof_review_note: reviewNoteValue }, 'Proof rejected')}
                                          className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-[11px] font-bold"
                                        >
                                          Reject
                                        </button>
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
                  </div>
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
    </motion.div>
  );
};
