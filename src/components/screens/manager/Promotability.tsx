import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Award, Download, TrendingUp, AlertTriangle, CheckCircle, Users, Clock, FileText, Search, Filter, Plus, XCircle, ArrowRight, Briefcase, BarChart3, Target, BookOpen, Calendar, Star, ChevronRight, X, MessageSquare, TrendingDown, Send, PieChart as PieChartIcon, Layers, Archive } from 'lucide-react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { CircularProgress } from '../../common/CircularProgress';
import { Modal } from '../../common/Modal';
import { SearchableSelect } from '../../common/SearchableSelect';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';
import { appConfirm } from '../../../utils/appDialog';

interface Props { employees: any[]; }

const TIER_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  'Ready Now': { color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-500' },
  'Ready in 1-2 Years': { color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-500' },
  'High Potential': { color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-500' },
  'Developing': { color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-500' },
};
const TIER_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b'];
const REC_STATUS_STYLE: Record<string, string> = {
  'Proposed': 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  'Under Review': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  'Approved': 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  'Denied': 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
};

const ScoreBar = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div className="flex items-center gap-2">
    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase w-16 shrink-0">{label}</span>
    <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
      <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(value, 100)}%` }} transition={{ duration: 0.6, ease: 'easeOut' }}
        className="h-full rounded-full" style={{ backgroundColor: color }} />
    </div>
    <span className="text-[10px] font-black text-slate-600 dark:text-slate-300 w-8 text-right">{Math.round(value)}</span>
  </div>
);

const scoreColor = (v: number) => v >= 75 ? '#10b981' : v >= 50 ? '#0d9488' : v >= 25 ? '#f59e0b' : '#ef4444';

const getReadinessIndicators = (emp: any): string[] => {
  const indicators: string[] = [];
  if (Number(emp?.appraisal_score || 0) > 0 || emp?.latest_appraisal) indicators.push('Appraisal');
  if (Number(emp?.goal_summary?.total || 0) > 0) indicators.push('Goals');
  if (Number(emp?.training_summary?.total || 0) > 0) indicators.push('Training');
  if (Number(emp?.tenure_months || 0) > 0) indicators.push('Tenure');
  if (Number(emp?.indicator_summary?.feedback_count || 0) > 0) indicators.push('Feedback');
  if (Number(emp?.indicator_summary?.self_assessments_count || 0) > 0) indicators.push('Self-Assessment');
  if (Number(emp?.indicator_summary?.coaching_total || 0) > 0) indicators.push('Coaching');
  if (Number(emp?.indicator_summary?.disciplinary_count || 0) > 0) indicators.push('Disciplinary');
  if (Number(emp?.indicator_summary?.suggestions_count || 0) > 0) indicators.push('Suggestions');
  return indicators;
};

export const Promotability = ({ employees }: Props) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'readiness' | 'recommendations' | 'history' | 'succession' | 'analytics' | 'career_paths'>('overview');
  const [readinessData, setReadinessData] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [promotions, setPromotions] = useState<any[]>([]);
  const [careerPaths, setCareerPaths] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [recComments, setRecComments] = useState<Record<number, any[]>>({});
  const [expandedRecId, setExpandedRecId] = useState<number | null>(null);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [showRecModal, setShowRecModal] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState<number | ''>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDept, setFilterDept] = useState('All');
  const [sortBy, setSortBy] = useState<'readiness' | 'name' | 'tenure'>('readiness');
  const [recForm, setRecForm] = useState({ recommended_position: '', justification: '',
    rubric_technical: 0, rubric_leadership: 0, rubric_teamwork: 0, rubric_initiative: 0, rubric_reliability: 0 });
  // Career path form
  const [showCpModal, setShowCpModal] = useState(false);
  const [cpForm, setCpForm] = useState({ current_role: '', next_role: '', department: '', min_tenure_months: 0, min_readiness_score: 0, notes: '' });
  // Review modal (hidden in employee-centered mode)
  const [reviewModal, setReviewModal] = useState<any>(null);
  const [reviewForm, setReviewForm] = useState({ status: '', review_notes: '', effective_date: '' });
  const actorRole = useMemo(() => {
    try {
      const raw = localStorage.getItem('talentflow_user') || localStorage.getItem('user') || '{}';
      const parsed = JSON.parse(raw);
      return (parsed?.role || '').toString().toLowerCase();
    } catch {
      return '';
    }
  }, []);
  const actorDept = useMemo(() => {
    try {
      const raw = localStorage.getItem('talentflow_user') || localStorage.getItem('user') || '{}';
      const parsed = JSON.parse(raw);
      return (parsed?.dept || '').toString().trim().toLowerCase();
    } catch {
      return '';
    }
  }, []);
  const canManageCareerPaths = actorRole === 'manager';
  const canRecommendRecommendations = actorRole === 'manager';
  const canApproveRecommendations = actorRole === 'hr';

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [r1, r2, r3, r4, r5] = await Promise.all([
        fetch('/api/promotability/readiness', { headers: getAuthHeaders() }).then(r => r.json()),
        fetch('/api/promotion_recommendations', { headers: getAuthHeaders() }).then(r => r.json()),
        fetch('/api/promotions', { headers: getAuthHeaders() }).then(r => r.json()),
        fetch('/api/career_paths', { headers: getAuthHeaders() }).then(r => r.json()),
        fetch('/api/promotability/analytics', { headers: getAuthHeaders() }).then(r => r.json()),
      ]);
      setReadinessData(Array.isArray(r1) ? r1 : []);
      setRecommendations(Array.isArray(r2) ? r2 : []);
      setPromotions(Array.isArray(r3) ? r3 : []);
      setCareerPaths(Array.isArray(r4) ? r4 : []);
      setAnalytics(r5 && !r5.error ? r5 : null);
    } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { fetchAll(); }, []);

  // Computed
  const departments = useMemo(() => [...new Set(readinessData.map(e => e.dept).filter(Boolean))].sort(), [readinessData]);
  const avgReadiness = useMemo(() => readinessData.length > 0 ? Math.round(readinessData.reduce((s, e) => s + e.readiness_score, 0) / readinessData.length) : 0, [readinessData]);
  const readyNowCount = useMemo(() => readinessData.filter(e => e.succession_tier === 'Ready Now').length, [readinessData]);
  const pendingRecs = useMemo(() => recommendations.filter(r => r.status === 'Proposed').length, [recommendations]);
  const currentYear = new Date().getFullYear().toString();
  const promotionsThisYear = useMemo(() => promotions.filter(p => (p.effective_date || '').startsWith(currentYear)).length, [promotions, currentYear]);

  const tierDistribution = useMemo(() => {
    const tiers = ['Ready Now', 'Ready in 1-2 Years', 'High Potential', 'Developing'];
    return tiers.map(t => ({ name: t, value: readinessData.filter(e => e.succession_tier === t).length }));
  }, [readinessData]);

  const deptReadiness = useMemo(() => {
    const map: Record<string, { total: number; sum: number }> = {};
    readinessData.forEach(e => {
      const d = e.dept || 'Unknown';
      if (!map[d]) map[d] = { total: 0, sum: 0 };
      map[d].total++; map[d].sum += e.readiness_score;
    });
    return Object.entries(map).map(([name, v]) => ({ name, avg: Math.round(v.sum / v.total) })).sort((a, b) => b.avg - a.avg);
  }, [readinessData]);

  const radarData = useMemo(() => {
    if (readinessData.length === 0) return [];
    const avg = (key: string) => Math.round(readinessData.reduce((s, e) => s + (e[key] || 0), 0) / readinessData.length);
    return [
      { factor: 'Appraisal', score: avg('appraisal_score') },
      { factor: 'Goals', score: avg('goal_score') },
      { factor: 'Training', score: avg('training_score') },
      { factor: 'Tenure', score: avg('tenure_score') },
    ];
  }, [readinessData]);

  // Filtered & sorted readiness
  const filteredReadiness = useMemo(() => {
    let data = [...readinessData];
    if (searchTerm) data = data.filter(e => (e.employee_name || '').toLowerCase().includes(searchTerm.toLowerCase()));
    if (filterDept !== 'All') data = data.filter(e => e.dept === filterDept);
    if (sortBy === 'readiness') data.sort((a, b) => b.readiness_score - a.readiness_score);
    else if (sortBy === 'name') data.sort((a, b) => (a.employee_name || '').localeCompare(b.employee_name || ''));
    else if (sortBy === 'tenure') data.sort((a, b) => b.tenure_months - a.tenure_months);
    return data;
  }, [readinessData, searchTerm, filterDept, sortBy]);

  const recommendationCandidates = useMemo(() => {
    if (actorRole !== 'manager') return readinessData;
    if (!actorDept) return [];
    return readinessData.filter((e) => (e?.dept || '').toString().trim().toLowerCase() === actorDept);
  }, [readinessData, actorRole, actorDept]);

  const handleRecommend = async () => {
    if (!canRecommendRecommendations) return;
    const targetEmployeeId = selectedEmpId;
    if (!targetEmployeeId) return;
    const recommendedPosition = recForm.recommended_position.trim();
    const justification = recForm.justification.trim();
    if (!recommendedPosition) { window.notify?.('Please enter the recommended position', 'error'); return; }
    if (recommendedPosition.length > 120) { window.notify?.('Recommended position must be 120 characters or less', 'error'); return; }
    if (justification.length < 20) { window.notify?.('Justification must be at least 20 characters', 'error'); return; }
    const rubricValues = [recForm.rubric_technical, recForm.rubric_leadership, recForm.rubric_teamwork, recForm.rubric_initiative, recForm.rubric_reliability];
    if (rubricValues.some((v) => v < 1 || v > 5)) { window.notify?.('Please rate all rubric items from 1 to 5', 'error'); return; }
    const rubricAvg = Math.round(((recForm.rubric_technical + recForm.rubric_leadership + recForm.rubric_teamwork + recForm.rubric_initiative + recForm.rubric_reliability) / 5) * 10) / 10;
    try {
      await fetch('/api/promotion_recommendations', {
        method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: targetEmployeeId, recommended_position: recommendedPosition, justification,
          rubric_technical: recForm.rubric_technical, rubric_leadership: recForm.rubric_leadership, rubric_teamwork: recForm.rubric_teamwork,
          rubric_initiative: recForm.rubric_initiative, rubric_reliability: recForm.rubric_reliability, rubric_avg: rubricAvg }),
      });
      setShowRecModal(false); setSelectedEmpId(''); setRecForm({ recommended_position: '', justification: '', rubric_technical: 0, rubric_leadership: 0, rubric_teamwork: 0, rubric_initiative: 0, rubric_reliability: 0 });
      fetchAll();
    } catch { /* ignore */ }
  };

  const handleReview = async () => {
    if (!reviewModal) return;
    if (!canApproveRecommendations) return;
    if (!reviewForm.status) { window.notify?.('Please select a decision', 'error'); return; }
    if (reviewForm.status === 'Approved' && !reviewForm.effective_date) {
      window.notify?.('Effective date is required when approving', 'error');
      return;
    }
    if (reviewForm.effective_date) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const effectiveDate = new Date(reviewForm.effective_date);
      if (!Number.isNaN(effectiveDate.getTime()) && effectiveDate < today) {
        window.notify?.('Effective date cannot be in the past', 'error');
        return;
      }
    }
    if (reviewForm.review_notes.trim().length > 1000) {
      window.notify?.('Review notes must be 1000 characters or less', 'error');
      return;
    }
    try {
      await fetch(`/api/promotion_recommendations/${reviewModal.id}`, {
        method: 'PUT', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...reviewForm, review_notes: reviewForm.review_notes.trim() }),
      });
      setReviewModal(null); setReviewForm({ status: '', review_notes: '', effective_date: '' });
      fetchAll();
    } catch { /* ignore */ }
  };

  const formatTenure = (months: number) => {
    const y = Math.floor(months / 12); const m = months % 12;
    return y > 0 ? `${y}y ${m}m` : `${m}m`;
  };

  const fetchComments = async (recId: number) => {
    try {
      const rows = await fetch(`/api/promotion_recommendations/${recId}/comments`, { headers: getAuthHeaders() }).then(r => r.json());
      setRecComments(prev => ({ ...prev, [recId]: Array.isArray(rows) ? rows : [] }));
    } catch { /* ignore */ }
  };

  const handleAddComment = async (recId: number) => {
    if (!newComment.trim()) return;
    try {
      await fetch(`/api/promotion_recommendations/${recId}/comments`, {
        method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: newComment }),
      });
      setNewComment('');
      fetchComments(recId);
    } catch { /* ignore */ }
  };

  const handleAddCareerPath = async () => {
    if (!canManageCareerPaths) return;
    const currentRole = cpForm.current_role.trim();
    const nextRole = cpForm.next_role.trim();
    if (!currentRole || !nextRole) { window.notify?.('Current and next role are required', 'error'); return; }
    if (currentRole.length > 100 || nextRole.length > 100) { window.notify?.('Role names must be 100 characters or less', 'error'); return; }
    if (cpForm.department.trim().length > 100) { window.notify?.('Department must be 100 characters or less', 'error'); return; }
    if (cpForm.min_tenure_months < 0 || cpForm.min_tenure_months > 600) { window.notify?.('Minimum tenure must be between 0 and 600 months', 'error'); return; }
    if (cpForm.min_readiness_score < 0 || cpForm.min_readiness_score > 100) { window.notify?.('Minimum readiness score must be between 0 and 100', 'error'); return; }
    if (cpForm.notes.trim().length > 1000) { window.notify?.('Notes must be 1000 characters or less', 'error'); return; }
    try {
      await fetch('/api/career_paths', {
        method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cpForm, current_role: currentRole, next_role: nextRole, department: cpForm.department.trim(), notes: cpForm.notes.trim() }),
      });
      setShowCpModal(false); setCpForm({ current_role: '', next_role: '', department: '', min_tenure_months: 0, min_readiness_score: 0, notes: '' });
      fetchAll();
    } catch { /* ignore */ }
  };

  const handleDeleteCp = async (id: number) => {
    if (!canManageCareerPaths) return;
    if (!(await appConfirm('Archive this career path?', { title: 'Archive Career Path', confirmText: 'Archive' }))) return;
    try { await fetch(`/api/career_paths/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); fetchAll(); } catch { /* ignore */ }
  };

  const inp = 'w-full px-3 py-2.5 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-700 dark:text-slate-300 font-medium focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none';

  const TABS = [
    { key: 'overview' as const, label: 'Overview', icon: BarChart3 },
    { key: 'readiness' as const, label: 'Employee Readiness', icon: Users },
    { key: 'recommendations' as const, label: 'Recommendations', icon: FileText },
    { key: 'history' as const, label: 'Promotion History', icon: Clock },
    { key: 'succession' as const, label: 'Succession Pipeline', icon: TrendingUp },
    { key: 'analytics' as const, label: 'Analytics', icon: TrendingDown },
    ...(canManageCareerPaths ? [{ key: 'career_paths' as const, label: 'Career Paths', icon: Layers }] : []),
  ];

  const selectedEmp = readinessData.find(e => e.employee_id === selectedEmpId);

  if (loading) return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center py-20">
      <div className="text-center"><div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" /><p className="text-sm font-bold text-slate-400">Loading promotability data...</p></div>
    </motion.div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
        <SectionHeader title="Promotability & Recommendation" subtitle="Readiness scoring, recommendations, succession planning" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/50 rounded-xl overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${activeTab === key ? 'bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* ───── TAB 1: OVERVIEW ───── */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Avg Readiness</p>
                  <p className="text-3xl font-black text-slate-800 dark:text-slate-100">{avgReadiness}%</p>
                </div>
                <CircularProgress value={avgReadiness} size={56} strokeWidth={6} />
              </div>
            </Card>
            <Card className="gradient-bg text-white border-none shadow-lg shadow-teal-green/20">
              <div className="flex items-center gap-3 mb-2"><TrendingUp size={18} /><p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Ready for Promotion</p></div>
              <p className="text-3xl font-black">{readyNowCount}</p>
            </Card>
            <Card>
              <div className="flex items-center gap-3 mb-2"><FileText size={18} className="text-amber-500" /><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Pending Recs</p></div>
              <p className="text-3xl font-black text-slate-800 dark:text-slate-100">{pendingRecs}</p>
            </Card>
            <Card>
              <div className="flex items-center gap-3 mb-2"><Award size={18} className="text-emerald-500" /><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Promotions ({currentYear})</p></div>
              <p className="text-3xl font-black text-slate-800 dark:text-slate-100">{promotionsThisYear}</p>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">Succession Pipeline</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart><Pie data={tierDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                    {tierDistribution.map((_e, i) => <Cell key={i} fill={TIER_COLORS[i]} />)}
                  </Pie><Tooltip /></PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                {tierDistribution.map((d, i) => (
                  <span key={d.name} className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TIER_COLORS[i] }} />{d.name} ({d.value})
                  </span>
                ))}
              </div>
            </Card>
            <div className="md:col-span-2">
              <Card>
                <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">Readiness by Department</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={deptReadiness} margin={{ top: 8, right: 8, left: 8, bottom: 48 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-15} textAnchor="end" height={44} />
                      <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                      <Tooltip formatter={(v: any) => `${v}%`} />
                      <Bar dataKey="avg" fill="#0f766e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          </div>

          {/* Radar Chart */}
          {radarData.length > 0 && (
            <Card>
              <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">Team Factor Breakdown</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="factor" tick={{ fontSize: 12, fill: '#64748b', fontWeight: 700 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Radar name="Team Avg" dataKey="score" stroke="#0f766e" fill="#0f766e" fillOpacity={0.25} strokeWidth={2} />
                    <Tooltip formatter={(v: any) => `${v}%`} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ───── TAB 2: EMPLOYEE READINESS ───── */}
      {activeTab === 'readiness' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Search employees..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className={`${inp} pl-9`} />
            </div>
            <div className="flex items-center gap-2 sm:min-w-55">
              <Filter size={14} className="text-slate-400 shrink-0" />
              <SearchableSelect
                options={[
                  { value: 'All', label: 'All Departments' },
                  ...departments.map(d => ({ value: d, label: d })),
                ]}
                value={filterDept}
                onChange={v => setFilterDept(String(v))}
                placeholder="All Departments"
                searchable
                dropdownVariant="pills-horizontal"
              />
            </div>
            <div className="sm:min-w-[200px]">
            <SearchableSelect
              options={[
                { value: 'readiness', label: 'Readiness ↓' },
                { value: 'name', label: 'Name A-Z' },
                { value: 'tenure', label: 'Tenure ↓' },
              ]}
              value={sortBy}
              onChange={v => setSortBy(v as any)}
              dropdownVariant="pills-horizontal"
            />
            </div>
          </div>

          {/* Employee Cards */}
          {filteredReadiness.length === 0 ? (
            <Card><p className="text-center py-10 text-slate-400 font-medium">No employees match your filters.</p></Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <AnimatePresence>
                {filteredReadiness.map((emp, idx) => {
                  const tier = TIER_CONFIG[emp.succession_tier] || TIER_CONFIG['Developing'];
                  const indicatorsUsed = getReadinessIndicators(emp);
                  return (
                    <motion.div key={emp.employee_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}>
                      <Card className={`border-l-4 ${tier.border} hover:shadow-md transition-shadow`}>
                        {/* Header */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-sm font-black text-slate-600 dark:text-slate-300 shrink-0">
                              {(emp.employee_name || '?')[0].toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{emp.employee_name}</p>
                              <p className="text-[10px] text-slate-500 truncate">{emp.position || 'No position'} · {emp.dept || 'No dept'}</p>
                            </div>
                          </div>
                          <CircularProgress value={emp.readiness_score} size={56} strokeWidth={5} sublabel="ready" />
                        </div>

                        {/* Score Bars */}
                        <div className="space-y-1.5 mb-3">
                          <ScoreBar label="Appraisal" value={emp.appraisal_score} color="#0f766e" />
                          <ScoreBar label="Goals" value={emp.goal_score} color="#3b82f6" />
                          <ScoreBar label="Training" value={emp.training_score} color="#8b5cf6" />
                          <ScoreBar label="Tenure" value={emp.tenure_score} color="#f59e0b" />
                        </div>

                        {/* Badges */}
                        <div className="flex flex-wrap items-center gap-1.5 mb-3">
                          <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${tier.bg} ${tier.color}`}>
                            {emp.succession_tier}
                          </span>
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                            <Calendar size={9} className="inline mr-0.5" />{formatTenure(emp.tenure_months)}
                          </span>
                          {emp.has_active_pip && (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600">
                              <AlertTriangle size={9} className="inline mr-0.5" />PIP Active
                            </span>
                          )}
                        </div>

                        {/* Summaries */}
                        <div className="flex items-center gap-3 text-[10px] text-slate-500 mb-3">
                          <span><Target size={10} className="inline mr-0.5" />{emp.goal_summary?.completed || 0}/{emp.goal_summary?.total || 0} goals</span>
                          <span><BookOpen size={10} className="inline mr-0.5" />{emp.training_summary?.completed || 0}/{emp.training_summary?.total || 0} courses</span>
                        </div>

                        <div className="mb-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 px-2.5 py-2">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Data indicators used</p>
                          <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed">
                            {indicatorsUsed.length > 0 ? indicatorsUsed.join(' • ') : 'No indicator data yet'}
                          </p>
                        </div>

                        {/* Career Path Next Role */}
                        {(() => {
                          const path = careerPaths.find(cp => cp.current_role && emp.position && cp.current_role.toLowerCase() === (emp.position || '').toLowerCase());
                          return path ? (
                            <div className="flex items-center gap-1.5 text-[10px] mb-3 p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                              <ArrowRight size={10} className="text-indigo-500 shrink-0" />
                              <span className="text-indigo-600 dark:text-indigo-400 font-bold">Next: {path.next_role}</span>
                              {emp.readiness_score >= path.min_readiness_score ? (
                                <span className="ml-auto text-[9px] font-bold px-1.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600">Eligible</span>
                              ) : (
                                <span className="ml-auto text-[9px] font-bold px-1.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600">Need {path.min_readiness_score}%</span>
                              )}
                            </div>
                          ) : null;
                        })()}

                        {/* Action */}
                        {canRecommendRecommendations && (
                          <button
                            onClick={() => {
                              const inDept = (emp?.dept || '').toString().trim().toLowerCase() === actorDept;
                              if (!inDept) {
                                window.notify?.('You can only recommend employees from your department', 'error');
                                return;
                              }
                              setSelectedEmpId(emp.employee_id);
                              setShowRecModal(true);
                            }}
                            className="w-full text-xs font-bold px-3 py-2 rounded-lg bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/40 transition-colors flex items-center justify-center gap-1.5"
                          >
                            <Star size={12} /> Recommend for Promotion
                          </button>
                        )}
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      {/* ───── TAB 3: RECOMMENDATIONS ───── */}
      {activeTab === 'recommendations' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            {canRecommendRecommendations ? (
              <button onClick={() => { setSelectedEmpId(''); setShowRecModal(true); }}
                className="flex items-center gap-2 bg-teal-deep text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-teal-green transition-colors">
                <Plus size={16} /> New Recommendation
              </button>
            ) : (
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Only managers can create recommendations.</span>
            )}
          </div>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                    <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Employee</th>
                    <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Current → Proposed</th>
                    <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Readiness</th>
                    <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Rubric</th>
                    <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Status</th>
                    <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Recommended By</th>
                    <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Date</th>
                    <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recommendations.map((r: any, idx: number) => (
                    <React.Fragment key={r.id}>
                    <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.03 }}
                      className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-teal-100 dark:bg-teal-900/20 text-teal-600 flex items-center justify-center text-[10px] font-black shrink-0">{(r.employee_name || '?')[0].toUpperCase()}</span>
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate max-w-35">{r.employee_name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="text-slate-500 truncate max-w-25">{r.current_position || '—'}</span>
                          <ArrowRight size={12} className="text-slate-400 shrink-0" />
                          <span className="font-bold text-slate-700 dark:text-slate-200 truncate max-w-25">{r.recommended_position || '—'}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        {r.readiness_score != null ? (
                          <span className="text-xs font-black" style={{ color: scoreColor(r.readiness_score) }}>{Math.round(r.readiness_score)}%</span>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="py-3 px-3">
                        {r.rubric_avg != null ? (
                          <span className="flex items-center gap-1">
                            <Star size={11} className="text-amber-400 fill-amber-400" />
                            <span className="text-xs font-black text-amber-600 dark:text-amber-400">{Number(r.rubric_avg).toFixed(1)}/5</span>
                          </span>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${REC_STATUS_STYLE[r.status] || 'bg-slate-100 text-slate-500'}`}>{r.status}</span>
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-500">{r.recommended_by_name || '—'}</td>
                      <td className="py-3 px-3 text-xs text-slate-500">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => {
                            if (expandedRecId === r.id) { setExpandedRecId(null); } else { setExpandedRecId(r.id); fetchComments(r.id); }
                          }} className={`text-[10px] font-bold px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1 ${
                            (recComments[r.id]?.length || 0) > 0 ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                          }`}><MessageSquare size={11} />{recComments[r.id]?.length || 0}</button>
                          {r.status === 'Proposed' && canApproveRecommendations && (
                            <button onClick={() => { setReviewModal(r); setReviewForm({ status: 'Approved', review_notes: '', effective_date: '' }); }}
                              className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/40 transition-colors">
                              Review
                            </button>
                          )}
                          {r.review_notes && r.status !== 'Proposed' && (
                            <span className="text-[10px] text-slate-400 italic truncate max-w-30" title={r.review_notes}>{r.review_notes}</span>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                    {/* Comment Thread */}
                    {expandedRecId === r.id && (
                      <tr key={`${r.id}-comments`}><td colSpan={8} className="p-0 bg-indigo-50/50 dark:bg-indigo-900/10">
                        <div className="p-4 space-y-3">
                          <p className="text-[10px] font-bold uppercase text-indigo-500 tracking-wider">Comments &amp; Feedback</p>
                          {(recComments[r.id] || []).map((c: any) => (
                            <div key={c.id} className="flex items-start gap-2.5">
                              <span className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[10px] font-black shrink-0">{(c.user_name || '?')[0].toUpperCase()}</span>
                              <div className="flex-1 bg-white dark:bg-slate-900 rounded-lg p-2.5 border border-indigo-100 dark:border-indigo-900/30">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200">{c.user_name}</span>
                                  <span className="text-[9px] text-slate-400">{c.created_at ? new Date(c.created_at).toLocaleString() : ''}</span>
                                </div>
                                <p className="text-xs text-slate-600 dark:text-slate-300">{c.comment}</p>
                              </div>
                            </div>
                          ))}
                          {(recComments[r.id] || []).length === 0 && <p className="text-xs text-slate-400 italic">No comments yet.</p>}
                          <div className="flex items-center gap-2 pt-1">
                            <input type="text" value={newComment} onChange={e => setNewComment(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') handleAddComment(r.id); }}
                              placeholder="Add a comment..." className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-700 dark:text-slate-300" />
                            <button onClick={() => handleAddComment(r.id)} className="p-2 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-colors"><Send size={14} /></button>
                          </div>
                        </div>
                      </td></tr>
                    )}
                    </React.Fragment>
                  ))}
                  {recommendations.length === 0 && (
                    <tr><td colSpan={8} className="py-10 text-center text-slate-400 font-medium">{canRecommendRecommendations ? 'No promotion requests yet. Start from the Readiness tab.' : 'No promotion requests available.'}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ───── TAB 4: PROMOTION HISTORY ───── */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => exportToCSV(promotions.map(p => ({ Employee: p.employee_name, From: p.previous_position, To: p.new_position, PrevDept: p.previous_dept, NewDept: p.new_dept, PrevSalary: p.previous_salary, NewSalary: p.new_salary, EffectiveDate: p.effective_date })), 'promotion_history')}
              className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              <Download size={16} /> Export XLSX
            </button>
          </div>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                    <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Employee</th>
                    <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Previous Position</th>
                    <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">New Position</th>
                    <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Department</th>
                    <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Salary Change</th>
                    <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Effective Date</th>
                    <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {promotions.map((p: any, idx: number) => {
                    const salaryIncrease = p.previous_salary && p.new_salary ? Math.round(((p.new_salary - p.previous_salary) / p.previous_salary) * 100) : null;
                    return (
                      <motion.tr key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.03 }}
                        className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <span className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 flex items-center justify-center text-[10px] font-black shrink-0">{(p.employee_name || '?')[0].toUpperCase()}</span>
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{p.employee_name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-500">{p.previous_position || '—'}</td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <ArrowRight size={12} className="text-emerald-500" />
                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{p.new_position || '—'}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-500">
                          {p.previous_dept !== p.new_dept && p.new_dept ? <span>{p.previous_dept} → {p.new_dept}</span> : <span>{p.previous_dept || p.new_dept || '—'}</span>}
                        </td>
                        <td className="py-3 px-3">
                          {salaryIncrease != null ? (
                            <span className={`text-xs font-bold ${salaryIncrease >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {salaryIncrease >= 0 ? '+' : ''}{salaryIncrease}%
                            </span>
                          ) : <span className="text-xs text-slate-400">—</span>}
                        </td>
                        <td className="py-3 px-3 text-xs font-medium text-slate-600 dark:text-slate-300">{p.effective_date || '—'}</td>
                        <td className="py-3 px-3 text-xs text-slate-500 truncate max-w-[150px]" title={p.notes || ''}>{p.notes || '—'}</td>
                      </motion.tr>
                    );
                  })}
                  {promotions.length === 0 && (
                    <tr><td colSpan={7} className="py-10 text-center text-slate-400 font-medium">No promotion history yet. Approved recommendations will appear here.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ───── TAB 5: SUCCESSION PIPELINE ───── */}
      {activeTab === 'succession' && (
        <div className="space-y-4">
          {/* Kanban Columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(['Ready Now', 'Ready in 1-2 Years', 'High Potential', 'Developing'] as const).map(tier => {
              const cfg = TIER_CONFIG[tier];
              const empList = readinessData.filter(e => e.succession_tier === tier).sort((a, b) => b.readiness_score - a.readiness_score);
              return (
                <div key={tier} className={`rounded-xl border-2 ${cfg.border} ${cfg.bg} p-3`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className={`text-xs font-black uppercase tracking-wider ${cfg.color}`}>{tier}</h3>
                    <span className={`text-xs font-black px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>{empList.length}</span>
                  </div>
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {empList.length === 0 && <p className="text-[10px] text-slate-400 text-center py-4">No employees in this tier</p>}
                    {empList.map(emp => (
                      <motion.div key={emp.employee_id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                        className="bg-white dark:bg-slate-900 rounded-lg p-2.5 shadow-sm flex items-center gap-2.5 cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => { setActiveTab('readiness'); setSearchTerm(emp.employee_name); }}>
                        <CircularProgress value={emp.readiness_score} size={36} strokeWidth={4} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{emp.employee_name}</p>
                          <p className="text-[10px] text-slate-400 truncate">{emp.position || 'No position'}</p>
                        </div>
                        <ChevronRight size={12} className="text-slate-400 shrink-0" />
                      </motion.div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tier by Department Chart */}
          {deptReadiness.length > 0 && (
            <Card>
              <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">Succession Distribution by Department</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={departments.map(dept => {
                    const deptEmps = readinessData.filter(e => e.dept === dept);
                    return {
                      dept,
                      'Ready Now': deptEmps.filter(e => e.succession_tier === 'Ready Now').length,
                      'Ready 1-2Y': deptEmps.filter(e => e.succession_tier === 'Ready in 1-2 Years').length,
                      'High Potential': deptEmps.filter(e => e.succession_tier === 'High Potential').length,
                      'Developing': deptEmps.filter(e => e.succession_tier === 'Developing').length,
                    };
                  })}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="dept" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="Ready Now" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Ready 1-2Y" stackId="a" fill="#3b82f6" />
                    <Bar dataKey="High Potential" stackId="a" fill="#8b5cf6" />
                    <Bar dataKey="Developing" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ───── TAB 6: ANALYTICS ───── */}
      {activeTab === 'analytics' && (
        <div className="space-y-4">
          {/* KPI summary row */}
          {analytics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border-l-4 border-teal-500">
                <p className="text-[10px] font-bold uppercase text-slate-500 mb-1">Total Promotions</p>
                <p className="text-3xl font-black text-slate-800 dark:text-slate-100">{analytics.total_promotions}</p>
              </Card>
              <Card className="border-l-4 border-blue-500">
                <p className="text-[10px] font-bold uppercase text-slate-500 mb-1">Total Recommendations</p>
                <p className="text-3xl font-black text-slate-800 dark:text-slate-100">{analytics.total_recommendations}</p>
              </Card>
              <Card className="border-l-4 border-emerald-500">
                <p className="text-[10px] font-bold uppercase text-slate-500 mb-1">Success Rate</p>
                <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{analytics.success_rate}%</p>
              </Card>
              <Card className="border-l-4 border-purple-500">
                <p className="text-[10px] font-bold uppercase text-slate-500 mb-1">Avg Time to Promotion</p>
                <p className="text-3xl font-black text-purple-600 dark:text-purple-400">
                  {analytics.avg_time_to_promotion_months != null ? `${analytics.avg_time_to_promotion_months}mo` : '—'}
                </p>
              </Card>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Promotions by Year */}
            {analytics?.promotions_by_year?.length > 0 && (
              <Card>
                <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">Promotions by Year</h3>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.promotions_by_year}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#0f766e" name="Promotions" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}

            {/* Recommendation Status Pie */}
            {analytics?.recommendation_status?.length > 0 && (
              <Card>
                <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">Recommendation Status</h3>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={analytics.recommendation_status} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="count" nameKey="status">
                        {analytics.recommendation_status.map((_: any, i: number) => <Cell key={i} fill={['#f59e0b','#3b82f6','#10b981','#ef4444'][i % 4]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {analytics.recommendation_status.map((s: any, i: number) => (
                    <span key={s.status} className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ['#f59e0b','#3b82f6','#10b981','#ef4444'][i % 4] }} />{s.status} ({s.count})
                    </span>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Department Promotion Rate */}
          {analytics?.dept_promotion_rate?.length > 0 && (
            <Card>
              <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">Promotion Rate by Department</h3>
              <div className="space-y-3">
                {analytics.dept_promotion_rate.map((d: any) => (
                  <div key={d.dept} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300 w-36 truncate" title={d.dept}>{d.dept}</span>
                    <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${d.rate}%` }} transition={{ duration: 0.6 }}
                        className={`h-3 rounded-full ${d.rate >= 50 ? 'bg-emerald-500' : d.rate >= 20 ? 'bg-teal-500' : 'bg-slate-400'}`} />
                    </div>
                    <span className="text-xs font-black text-slate-600 dark:text-slate-300 w-10 text-right">{d.rate}%</span>
                    <span className="text-[10px] text-slate-400 w-16 text-right">{d.promoted}/{d.total} promoted</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {!analytics && (
            <Card><p className="text-center py-10 text-slate-400">No analytics data available yet.</p></Card>
          )}
        </div>
      )}

      {/* ───── TAB 7: CAREER PATHS ───── */}
      {activeTab === 'career_paths' && canManageCareerPaths && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-500">Define career ladder progressions to guide promotion pathways.</p>
            <button onClick={() => setShowCpModal(true)}
              className="flex items-center gap-2 bg-teal-deep text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-teal-green transition-colors">
              <Plus size={16} /> New Career Path
            </button>
          </div>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                    <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500">Current Role</th>
                    <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500">→ Next Role</th>
                    <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500">Department</th>
                    <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500">Min Tenure</th>
                    <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500">Min Readiness</th>
                    <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500">Notes</th>
                    <th className="py-3 px-3 text-[10px] font-bold uppercase text-slate-500 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {careerPaths.map((cp: any, idx: number) => (
                    <motion.tr key={cp.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.03 }}
                      className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                      <td className="py-3 px-3 text-sm font-medium text-slate-700 dark:text-slate-200">{cp.current_role}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <ArrowRight size={12} className="text-teal-500" />
                          <span className="text-sm font-bold text-teal-600 dark:text-teal-400">{cp.next_role}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-500">{cp.department || '—'}</td>
                      <td className="py-3 px-3 text-xs font-bold text-slate-600 dark:text-slate-300">{Number(cp.min_tenure_months ?? 0)}mo</td>
                      <td className="py-3 px-3">
                        <span className="text-xs font-black" style={{ color: scoreColor(Number(cp.min_readiness_score ?? 0)) }}>{Number(cp.min_readiness_score ?? 0)}%</span>
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-500 truncate max-w-[200px]">{cp.notes || '—'}</td>
                      <td className="py-3 px-3 text-right">
                        <button onClick={() => handleDeleteCp(cp.id)} className="text-red-500 hover:text-red-600 p-1 rounded transition-colors" title="Archive"><Archive size={15} /></button>
                      </td>
                    </motion.tr>
                  ))}
                  {careerPaths.length === 0 && (
                    <tr><td colSpan={7} className="py-10 text-center text-slate-400">No career paths defined yet. Add one to guide promotion ladders.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ───── RECOMMEND MODAL ───── */}
      <Modal open={showRecModal && canRecommendRecommendations} title="Recommend for Promotion" onClose={() => { setShowRecModal(false); setSelectedEmpId(''); }}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Employee *</label>
            <SearchableSelect
              options={recommendationCandidates.map((e) => ({
                value: String(e.employee_id),
                label: `${e.employee_name || 'Employee'} - ${e.position || 'No position'} (${Math.round(e.readiness_score || 0)}%)`,
                avatarUrl: null,
              }))}
              value={selectedEmpId ? String(selectedEmpId) : ''}
              onChange={(v) => setSelectedEmpId(v ? Number(v) : '')}
              placeholder="Select employee..."
              dropdownVariant="pills-horizontal"
            />
            {canRecommendRecommendations && actorDept && recommendationCandidates.length === 0 && (
              <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-300">No employees from your department are available for recommendation.</p>
            )}
          </div>

          {/* Show selected employee readiness */}
          {selectedEmp && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{selectedEmp.employee_name}</p>
                <CircularProgress value={selectedEmp.readiness_score} size={40} strokeWidth={4} />
              </div>
              <ScoreBar label="Appraisal" value={selectedEmp.appraisal_score} color="#0f766e" />
              <ScoreBar label="Goals" value={selectedEmp.goal_score} color="#3b82f6" />
              <ScoreBar label="Training" value={selectedEmp.training_score} color="#8b5cf6" />
              <ScoreBar label="Tenure" value={selectedEmp.tenure_score} color="#f59e0b" />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Recommended Position</label>
            <input type="text" value={recForm.recommended_position} onChange={e => setRecForm({ ...recForm, recommended_position: e.target.value })}
              placeholder="e.g. Senior Software Engineer" className={inp} maxLength={120} required />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Justification *</label>
            <textarea value={recForm.justification} onChange={e => setRecForm({ ...recForm, justification: e.target.value })}
              placeholder="Why should this employee be promoted?" rows={3} className={inp} minLength={20} maxLength={1000} required />
          </div>

          {/* Rubric Scoring */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Competency Rubric (1–5)</label>
            <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
              {([
                { key: 'rubric_technical' as const, label: 'Technical Skills' },
                { key: 'rubric_leadership' as const, label: 'Leadership' },
                { key: 'rubric_teamwork' as const, label: 'Teamwork' },
                { key: 'rubric_initiative' as const, label: 'Initiative' },
                { key: 'rubric_reliability' as const, label: 'Reliability' },
              ]).map(({ key, label }) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-slate-500 w-28">{label}</span>
                  <div className="flex items-center gap-1">
                    {[1,2,3,4,5].map(v => (
                      <button key={v} type="button" onClick={() => setRecForm({ ...recForm, [key]: v })}
                        className={`w-7 h-7 rounded-full text-xs font-black transition-all ${
                          recForm[key] >= v ? 'bg-amber-400 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                        }`}>{v}</button>
                    ))}
                  </div>
                  <span className="text-[10px] font-bold text-amber-600">
                    {['','Poor','Fair','Good','Very Good','Excellent'][recForm[key]]}
                  </span>
                </div>
              ))}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">Overall Rubric Score</span>
                <span className="text-lg font-black text-amber-600">
                  {(((recForm.rubric_technical + recForm.rubric_leadership + recForm.rubric_teamwork + recForm.rubric_initiative + recForm.rubric_reliability) / 5)).toFixed(1)}/5
                </span>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowRecModal(false)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
            <button onClick={handleRecommend} disabled={!selectedEmpId || !recForm.justification}
              className="px-4 py-2 text-sm font-bold bg-teal-deep text-white rounded-xl hover:bg-teal-green disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              Submit Recommendation
            </button>
          </div>
        </div>
      </Modal>

      {/* ───── REVIEW MODAL ───── */}
      <Modal open={!!reviewModal && canApproveRecommendations} title="Review Recommendation" onClose={() => setReviewModal(null)}>
        {reviewModal && (
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-xs space-y-1">
              <p><span className="font-bold text-slate-500">Employee:</span> <span className="text-slate-700 dark:text-slate-200">{reviewModal.employee_name}</span></p>
              <p><span className="font-bold text-slate-500">Current:</span> <span className="text-slate-700 dark:text-slate-200">{reviewModal.current_position || '—'}</span></p>
              <p><span className="font-bold text-slate-500">Proposed:</span> <span className="text-slate-700 dark:text-slate-200">{reviewModal.recommended_position || '—'}</span></p>
              <p><span className="font-bold text-slate-500">Justification:</span> <span className="text-slate-700 dark:text-slate-200">{reviewModal.justification || '—'}</span></p>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Decision *</label>
              <select value={reviewForm.status} onChange={e => setReviewForm({ ...reviewForm, status: e.target.value })} className={inp}>
                <option value="Approved">Approve</option>
                <option value="Under Review">Under Review</option>
                <option value="Denied">Deny</option>
              </select>
            </div>
            {reviewForm.status === 'Approved' && (
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Effective Date</label>
                <input type="date" value={reviewForm.effective_date} onChange={e => setReviewForm({ ...reviewForm, effective_date: e.target.value })} className={inp} min={new Date().toISOString().split('T')[0]} />
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Review Notes</label>
              <textarea value={reviewForm.review_notes} onChange={e => setReviewForm({ ...reviewForm, review_notes: e.target.value })}
                placeholder="Add notes for this decision..." rows={3} className={inp} maxLength={1000} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setReviewModal(null)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
              <button onClick={handleReview} disabled={!reviewForm.status}
                className="px-4 py-2 text-sm font-bold bg-teal-deep text-white rounded-xl hover:bg-teal-green disabled:opacity-50 transition-colors">
                Submit Review
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ───── CAREER PATH MODAL ───── */}
      <Modal open={showCpModal && canManageCareerPaths} title="New Career Path" onClose={() => setShowCpModal(false)}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Current Role *</label>
              <input type="text" value={cpForm.current_role} onChange={e => setCpForm({ ...cpForm, current_role: e.target.value })} placeholder="e.g. Junior Developer" className={inp} maxLength={100} required />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Next Role *</label>
              <input type="text" value={cpForm.next_role} onChange={e => setCpForm({ ...cpForm, next_role: e.target.value })} placeholder="e.g. Senior Developer" className={inp} maxLength={100} required />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Department</label>
              <input type="text" value={cpForm.department} onChange={e => setCpForm({ ...cpForm, department: e.target.value })} className={inp} placeholder="Optional" maxLength={100} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Min Tenure (months)</label>
              <input type="number" value={cpForm.min_tenure_months} onChange={e => setCpForm({ ...cpForm, min_tenure_months: Number(e.target.value) })} className={inp} min={0} max={600} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Min Readiness Score (%)</label>
              <input type="number" value={cpForm.min_readiness_score} onChange={e => setCpForm({ ...cpForm, min_readiness_score: Number(e.target.value) })} className={inp} min={0} max={100} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notes / Requirements</label>
            <textarea value={cpForm.notes} onChange={e => setCpForm({ ...cpForm, notes: e.target.value })} rows={2} className={inp} placeholder="Additional requirements or notes" maxLength={1000} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowCpModal(false)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
            <button onClick={handleAddCareerPath} disabled={!cpForm.current_role || !cpForm.next_role}
              className="px-4 py-2 text-sm font-bold bg-teal-deep text-white rounded-xl hover:bg-teal-green disabled:opacity-50 transition-colors">
              Save Career Path
            </button>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
};
