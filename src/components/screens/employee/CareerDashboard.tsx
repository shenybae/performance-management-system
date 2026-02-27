import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { Download, Target, TrendingUp, Award, BarChart3 } from 'lucide-react';
import { LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';

export const CareerDashboard = () => {
  const [appraisals, setAppraisals] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [selfAssessments, setSelfAssessments] = useState<any[]>([]);
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try { const r = await fetch('/api/appraisals', { headers: getAuthHeaders() }); const d = await r.json(); setAppraisals(Array.isArray(d) ? d.filter((a: any) => a.employee_id === (user.employee_id || user.id) || !user.employee_id) : []); } catch { setAppraisals([]); }
    try { const r = await fetch('/api/goals', { headers: getAuthHeaders() }); const d = await r.json(); setGoals(Array.isArray(d) ? d.filter((g: any) => g.employee_id === (user.employee_id || user.id) || !user.employee_id) : []); } catch { setGoals([]); }
    try { const r = await fetch('/api/self_assessments', { headers: getAuthHeaders() }); const d = await r.json(); setSelfAssessments(Array.isArray(d) ? d.filter((s: any) => s.employee_id === (user.employee_id || user.id) || !user.employee_id) : []); } catch { setSelfAssessments([]); }
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
        <button onClick={() => exportToCSV([...appraisals.map(a => ({ ...a, type: 'Appraisal' })), ...goals.map(g => ({ ...g, type: 'Goal' }))], 'career_data')} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><Download size={16} /> CSV</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <StatCard icon={Award} label="Avg Rating" value={avgScore || '—'} color="bg-teal-600" />
        <StatCard icon={Target} label="Total Goals" value={totalGoals} color="bg-blue-500" />
        <StatCard icon={TrendingUp} label="Completed Goals" value={completedGoals} color="bg-emerald-500" />
        <StatCard icon={BarChart3} label="Appraisals" value={appraisals.length} color="bg-amber-500" />
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

      {goals.length > 0 && (
        <Card>
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">My Goals ({goals.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left"><thead><tr className="border-b border-slate-100 dark:border-slate-800">
              <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Goal</th>
              <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Target</th>
              <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
              <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Progress</th></tr></thead>
              <tbody>{goals.map(g => (
                <tr key={g.id} className="border-b border-slate-50 dark:border-slate-800/50">
                  <td className="py-3 font-medium text-slate-700 dark:text-slate-200">{g.title}</td>
                  <td className="py-3 text-sm text-slate-500 dark:text-slate-400">{g.target_date}</td>
                  <td className="py-3"><span className={`text-[10px] font-bold uppercase ${g.status === 'Completed' ? 'text-emerald-600' : g.status === 'In Progress' ? 'text-amber-500' : 'text-slate-400'}`}>{g.status}</span></td>
                  <td className="py-3"><div className="w-24 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-teal-500 rounded-full" style={{ width: `${g.progress || 0}%` }}></div></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
      )}
    </motion.div>
  );
};
