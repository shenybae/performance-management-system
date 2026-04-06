import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Target, Users, TrendingUp, CheckCircle2, Clock, AlertCircle, Plus, ChevronDown, ChevronRight, User, Image as ImageIcon } from 'lucide-react';
import { SectionHeader } from '../../common/SectionHeader';
import Modal from '../../common/Modal';
import { getAuthHeaders } from '../../../utils/csv';
import { appAlert } from '../../../utils/appDialog';

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

export const TeamLeaderDashboard = () => {
  const [leaderGoals, setLeaderGoals] = useState<Goal[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [expandedGoals, setExpandedGoals] = useState<Set<number>>(new Set());
  const [showSubtaskModal, setShowSubtaskModal] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState<number>(Date.now());

  const [subtaskForm, setSubtaskForm] = useState({
    title: '',
    statement: '',
    metric: '',
    target_date: '',
    assignee_id: '',
    priority: 'Medium',
  });

  const user = JSON.parse(localStorage.getItem('talentflow_user') || '{}');

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
      setLeaderGoals(Array.isArray(data?.goals) ? data.goals : Array.isArray(data) ? data : []);
      setTeamMembers(Array.isArray(data?.teamMembers) ? data.teamMembers : []);
      setLastSyncAt(Date.now());
    } catch (error) {
      console.error('Error fetching leader goals:', error);
      setLeaderGoals([]);
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  const reviewTaskProof = async (taskId: number, status: 'Approved' | 'Needs Revision' | 'Rejected') => {
    const note = status === 'Approved' ? '' : prompt('Add review note (optional):') || '';
    try {
      const res = await fetch(`/api/member-tasks/${taskId}`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ proof_review_status: status, proof_review_note: note })
      });
      if (!res.ok) throw new Error('Failed to update review');
      window.notify?.(`Proof ${status.toLowerCase()}`, 'success');
      fetchLeaderGoals();
    } catch (error) {
      window.notify?.('Failed to update proof review', 'error');
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
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
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
                          <span className="text-xs font-black text-slate-600 dark:text-slate-400 min-w-[45px] text-right">
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
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
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
                                        <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 min-w-[32px]">
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
                          {Array.isArray(goal.member_tasks) && goal.member_tasks.length > 0 && (
                            <div>
                              <h5 className="text-[10px] font-bold uppercase text-slate-500 mb-2 tracking-wider">
                                Delegated Tasks Proof Review ({goal.member_tasks.length})
                              </h5>
                              <div className="space-y-2">
                                {goal.member_tasks.map((task: any) => {
                                  const reviewStatus = task.proof_review_status || 'Not Submitted';
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
                                        <a href={task.proof_image} target="_blank" rel="noreferrer" className="mt-2 inline-block">
                                          <img src={task.proof_image} alt="Task proof" className="w-44 h-28 object-cover rounded border border-slate-200 dark:border-slate-700" />
                                        </a>
                                      ) : (
                                        <div className="mt-2 text-[10px] text-slate-400 inline-flex items-center gap-1"><ImageIcon size={12} /> No proof uploaded yet</div>
                                      )}

                                      {task.proof_note && (
                                        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{task.proof_note}</p>
                                      )}

                                      {task.proof_review_note && (
                                        <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Review note: {task.proof_review_note}</p>
                                      )}

                                      {task.proof_image && (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                          <button onClick={() => reviewTaskProof(task.id, 'Approved')} className="text-[10px] font-bold px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">Approve</button>
                                          <button onClick={() => reviewTaskProof(task.id, 'Needs Revision')} className="text-[10px] font-bold px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">Needs Revision</button>
                                          <button onClick={() => reviewTaskProof(task.id, 'Rejected')} className="text-[10px] font-bold px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">Reject</button>
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
