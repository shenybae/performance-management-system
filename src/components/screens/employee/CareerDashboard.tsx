import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { CircularProgress } from '../../common/CircularProgress';
import { Download, Target, TrendingUp, Award, BarChart3, SendHorizonal, AlertTriangle, DollarSign, Building2, Users, User } from 'lucide-react';
import { LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';

export const CareerDashboard = () => {
  const [appraisals, setAppraisals] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [pips, setPips] = useState<any[]>([]);
  const [requesting, setRequesting] = useState<number | null>(null);
  const [selfAssessments, setSelfAssessments] = useState<any[]>([]);
  const [salary, setSalary] = useState<number | null>(null);
  const [leaderGoals, setLeaderGoals] = useState<any[]>([]);
  const [leaderTeamMembers, setLeaderTeamMembers] = useState<any[]>([]);
  const [assignSelections, setAssignSelections] = useState<Record<number, number>>({});
  const user = JSON.parse(localStorage.getItem('talentflow_user') || localStorage.getItem('user') || '{}');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try { const r = await fetch('/api/appraisals', { headers: getAuthHeaders() }); const d = await r.json(); setAppraisals(Array.isArray(d) ? d.filter((a: any) => a.employee_id === (user.employee_id || user.id)) : []); } catch { setAppraisals([]); }
    try { const r = await fetch('/api/goals', { headers: getAuthHeaders() }); const d = await r.json(); const empId = String(user.employee_id || user.id || ''); setGoals(Array.isArray(d) ? d.filter((g: any) => String(g.employee_id) === empId || (g.assignees || []).some((a: any) => String(a.employee_id) === empId)) : []); } catch { setGoals([]); }
    try {
      const r = await fetch('/api/leader-goals', { headers: getAuthHeaders() });
      const d = await r.json();
      setLeaderGoals(Array.isArray(d.goals) ? d.goals : []);
      setLeaderTeamMembers(Array.isArray(d.teamMembers) ? d.teamMembers : []);
    } catch {
      setLeaderGoals([]);
      setLeaderTeamMembers([]);
    }
    try { const r = await fetch('/api/pip_plans', { headers: getAuthHeaders() }); const d = await r.json(); setPips(Array.isArray(d) ? d.filter((p: any) => p.employee_id === (user.employee_id || user.id)) : []); } catch { setPips([]); }
    try { const r = await fetch('/api/self_assessments', { headers: getAuthHeaders() }); const d = await r.json(); setSelfAssessments(Array.isArray(d) ? d.filter((s: any) => s.employee_id === (user.employee_id || user.id)) : []); } catch { setSelfAssessments([]); }
    if (user.employee_id) { try { const r = await fetch(`/api/employees/${user.employee_id}`, { headers: getAuthHeaders() }); const d = await r.json(); setSalary(d.salary_base || null); } catch { /* ignore */ } }
  };

  const handleLeaderAssign = async (goalId: number) => {
    const employeeId = assignSelections[goalId];
    if (!employeeId) { window.notify?.('Select a member to assign', 'error'); return; }
    try {
      const res = await fetch(`/api/goals/${goalId}/assign`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ employee_id: employeeId })
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Member assigned to goal', 'success');
      setAssignSelections(prev => {
        const next = { ...prev };
        delete next[goalId];
        return next;
      });
      fetchData();
    } catch { window.notify?.('Failed to assign member', 'error'); }
  };

  const handleLeaderUnassign = async (goalId: number, employeeId: number) => {
    try {
      const res = await fetch(`/api/goals/${goalId}/unassign`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ employee_id: employeeId })
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Member unassigned from goal', 'success');
      fetchData();
    } catch { window.notify?.('Failed to unassign member', 'error'); }
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

  const progressBarColor = (p: number) => {
    if (p >= 100) return 'bg-emerald-500';
    if (p >= 50) return 'bg-teal-500';
    if (p >= 25) return 'bg-amber-500';
    return 'bg-red-400';
  };

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
        <button onClick={() => exportToCSV([...appraisals.map(a => ({ ...a, type: 'Appraisal' })), ...goals.map(g => ({ ...g, type: 'Goal' })), ...pips.map(p => ({ ...p, type: 'PIP' }))], 'career_data')} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><Download size={16} /> XLSX</button>
      </div>

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

      {goals.length > 0 && (
        <Card>
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">My Goals ({goals.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left"><thead><tr className="border-b border-slate-100 dark:border-slate-800">
              <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Goal</th>
              <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Scope</th>
              <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Target</th>
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
                    <div className="min-w-0">
                      <span className="truncate max-w-[220px] block" title={g.title || g.statement}>{g.title || g.statement}</span>
                      {g.frequency && g.frequency !== 'One-time' && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600">{g.frequency}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${scopeStyleMap[g.scope || 'Individual']?.badgeBg || scopeStyleMap.Individual.badgeBg}`}>
                      {(g.scope || 'Individual') === 'Department' ? <Building2 size={10} /> : (g.scope || 'Individual') === 'Team' ? <Users size={10} /> : <User size={10} />}
                      {(g.scope || 'Individual') === 'Department' ? 'Dept' : g.scope || 'Individual'}
                    </span>
                  </td>
                  <td className="py-3 text-sm text-slate-500 dark:text-slate-400">{g.target_date || '—'}</td>
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
                            const user = JSON.parse(localStorage.getItem('talentflow_user') || '{}');
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
      )}

      {leaderGoals.length > 0 && (
        <Card className="mt-4">
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">Goals You Lead ({leaderGoals.length})</h3>
          <div className="space-y-3">
            {leaderGoals.map((g) => {
              const assignees = Array.isArray(g.assignees) ? g.assignees : [];
              const remainingMembers = leaderTeamMembers.filter((m: any) => !assignees.some((a: any) => String(a.employee_id) === String(m.member_id)));
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
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Assigned Members</p>
                    {assignees.length === 0 ? (
                      <p className="text-xs text-slate-400">No members assigned yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {assignees.map((a: any) => (
                          <div key={a.employee_id} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">
                            <span className="text-slate-700 dark:text-slate-300">{a.employee_name || `Employee ${a.employee_id}`}</span>
                            <button
                              onClick={() => handleLeaderUnassign(g.id, Number(a.employee_id))}
                              className="text-red-500 hover:text-red-600 font-bold"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    <select
                      value={assignSelections[g.id] ?? ''}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        setAssignSelections(prev => {
                          const copy = { ...prev };
                          if (!next) delete copy[g.id];
                          else copy[g.id] = next;
                          return copy;
                        });
                      }}
                      className="flex-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                    >
                      <option value="">Select team member to assign...</option>
                      {remainingMembers.map((m: any) => (
                        <option key={m.member_id} value={m.member_id}>{m.member_name || `Employee ${m.member_id}`}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleLeaderAssign(g.id)}
                      disabled={!assignSelections[g.id]}
                      className="px-3 py-2 rounded-lg bg-teal-deep text-white text-sm font-bold disabled:opacity-50"
                    >
                      Assign Member
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

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
    </motion.div>
  );
};
