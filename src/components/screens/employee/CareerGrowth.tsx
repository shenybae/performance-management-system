import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, Target, CheckCircle, Star, ArrowRight, Briefcase, Trophy, Zap, BookOpen, Users, Calendar, Sparkles } from 'lucide-react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { CircularProgress } from '../../common/CircularProgress';
import { getAuthHeaders } from '../../../utils/csv';

const CareerGrowth = () => {
  const [readinessData, setReadinessData] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [careerPaths, setCareerPaths] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const actorId = useMemo(() => {
    try {
      const raw = localStorage.getItem('talentflow_user') || localStorage.getItem('user') || '{}';
      const parsed = JSON.parse(raw);
      return parsed?.id;
    } catch {
      return null;
    }
  }, []);

  const fetchData = async () => {
    if (!actorId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Get this employee's readiness data
      const readiness = await fetch(`/api/promotability/readiness`, { headers: getAuthHeaders() }).then(r => r.json());
      const myReadiness = Array.isArray(readiness) ? readiness.find((e: any) => e.employee_id === actorId) : null;
      setReadinessData(myReadiness);

      // Get recommendations for this employee
      const recs = await fetch(`/api/promotion_recommendations?employee_id=${actorId}`, { headers: getAuthHeaders() }).then(r => r.json());
      setRecommendations(Array.isArray(recs) ? recs : []);

      // Get all career paths (they apply organizationally)
      const paths = await fetch(`/api/career_paths`, { headers: getAuthHeaders() }).then(r => r.json());
      setCareerPaths(Array.isArray(paths) ? paths : []);
    } catch (e) {
      console.error('Error fetching career growth data:', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [actorId]);

  const scoreColor = (v: number) => v >= 75 ? '#10b981' : v >= 50 ? '#0d9488' : v >= 25 ? '#f59e0b' : '#ef4444';
  const scoreLabel = (v: number) => v >= 75 ? 'Excellent' : v >= 50 ? 'Good' : v >= 25 ? 'Fair' : 'Developing';
  const tierColor = (tier: string) => {
    switch (tier) {
      case 'Ready Now': return 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800';
      case 'Ready in 1-2 Years': return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800';
      case 'High Potential': return 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800';
      default: return 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800';
    }
  };

  const readinessScore = Math.max(0, Math.min(100, Number(readinessData?.readiness_score || 0)));
  const readinessStatusLabel = readinessData ? scoreLabel(readinessScore) : 'Pending';
  const approvedRecommendations = recommendations.filter((r) => r?.status === 'Approved').length;
  const reviewedRecommendations = recommendations.filter((r) => r?.status === 'Reviewed' || r?.status === 'Under Review').length;

  if (loading) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-400">Loading your career growth data...</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Header */}
      <SectionHeader title="Your Career Growth" subtitle="Track your promotability readiness and explore growth opportunities" />

      {/* Snapshot Strip */}
      <Card className="relative overflow-hidden border border-teal-100 dark:border-teal-900/50 bg-gradient-to-r from-teal-50 via-cyan-50 to-emerald-50 dark:from-teal-950/20 dark:via-cyan-950/20 dark:to-emerald-950/20">
        <div className="absolute -right-12 -top-12 w-40 h-40 rounded-full bg-teal-400/10" />
        <div className="relative grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300 mb-1">Career Snapshot</p>
            <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <TrendingUp size={18} className="text-teal-600" />
              {readinessData ? `Readiness ${Math.round(readinessScore)}%` : 'Awaiting First Assessment'}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              {readinessData
                ? `Current status: ${readinessStatusLabel}. Keep building consistency across goals, appraisal, and training.`
                : 'Your manager will publish your first promotability readiness assessment here.'}
            </p>
          </div>
          <div className="rounded-xl bg-white/70 dark:bg-slate-900/40 border border-white/60 dark:border-slate-700/60 p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Recommendations</p>
            <p className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1">{recommendations.length}</p>
          </div>
          <div className="rounded-xl bg-white/70 dark:bg-slate-900/40 border border-white/60 dark:border-slate-700/60 p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Career Paths</p>
            <p className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1">{careerPaths.length}</p>
          </div>
        </div>
      </Card>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column: Readiness & Current Status */}
        <div className="lg:col-span-2 space-y-4">
          {/* Readiness Card */}
          {readinessData ? (
            <Card className="relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/5 rounded-full -mr-16 -mt-16" />
              <div className="relative">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Promotability Readiness</h3>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400">Your overall career progression score</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <CircularProgress value={readinessData.readiness_score} size={64} strokeWidth={5} />
                  </div>
                </div>

                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                    <Sparkles size={12} className="text-amber-500" />
                    {scoreLabel(readinessData.readiness_score)}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300">
                    <Trophy size={12} />
                    {approvedRecommendations} approved recommendation{approvedRecommendations === 1 ? '' : 's'}
                  </span>
                </div>

                {/* Tier Badge */}
                <div className="mb-4 p-3 rounded-lg bg-slate-50/50 dark:bg-slate-900/50">
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Succession Tier</p>
                  <div className={`inline-block px-3 py-1.5 rounded-full text-sm font-bold ${tierColor(readinessData.succession_tier)}`}>
                    {readinessData.succession_tier || 'Pending Assessment'}
                  </div>
                </div>

                {/* Component Scores */}
                <div className="space-y-2 mb-4 p-3 bg-slate-50/50 dark:bg-slate-900/50 rounded-lg">
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">Score Components</p>
                  <div className="space-y-2">
                    {[
                      { label: 'Appraisal Performance', value: readinessData.appraisal_score, icon: CheckCircle },
                      { label: 'Goal Achievement', value: readinessData.goal_score, icon: Target },
                      { label: 'Training & Development', value: readinessData.training_score, icon: BookOpen },
                      { label: 'Tenure & Experience', value: readinessData.tenure_score, icon: Calendar },
                    ].map(({ label, value, icon: Icon }) => (
                      <div key={label} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <Icon size={12} className="text-teal-500" />
                          <span className="text-slate-600 dark:text-slate-400">{label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(value, 100)}%` }}
                              transition={{ duration: 0.6, ease: 'easeOut' }}
                              className="h-full rounded-full"
                              style={{ backgroundColor: scoreColor(value) }}
                            />
                          </div>
                          <span className="font-bold text-slate-700 dark:text-slate-300 w-8 text-right">{Math.round(value)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Additional Info */}
                <div className="grid grid-cols-2 gap-2 p-3 bg-teal-50/50 dark:bg-teal-900/20 rounded-lg border border-teal-100 dark:border-teal-900/40">
                  <div>
                    <p className="text-[10px] font-bold text-teal-700 dark:text-teal-300 uppercase tracking-widest">Tenure</p>
                    <p className="text-sm font-black text-slate-700 dark:text-slate-300 mt-1">
                      {Math.floor(readinessData.tenure_months / 12)}y {readinessData.tenure_months % 12}m
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-teal-700 dark:text-teal-300 uppercase tracking-widest">Position</p>
                    <p className="text-sm font-black text-slate-700 dark:text-slate-300 mt-1 truncate">{readinessData.position}</p>
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="text-center p-8 border border-dashed border-slate-300 dark:border-slate-700 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900/30 dark:to-slate-900/10">
              <Zap size={32} className="mx-auto text-amber-500 mb-2" />
              <p className="text-sm font-black text-slate-700 dark:text-slate-300 mb-1">No Assessment Yet</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Your manager will assess your promotability readiness based on your performance, goals, and development.</p>
            </Card>
          )}

          {/* Recommendations Section */}
          {recommendations.length > 0 && (
            <Card>
              <div className="mb-4">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Trophy size={16} className="text-amber-500" /> Promotion Recommendations
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Opportunities your manager has identified for you</p>
                <div className="mt-2 flex items-center gap-2 text-[11px]">
                  <span className="px-2 py-1 rounded-full font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">Approved: {approvedRecommendations}</span>
                  <span className="px-2 py-1 rounded-full font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">Active Review: {reviewedRecommendations}</span>
                </div>
              </div>
              
              <div className="space-y-3">
                {recommendations.map((rec, idx) => (
                  <motion.div
                    key={rec.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="p-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50/50 dark:bg-slate-900/30"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1">
                        <p className="font-bold text-sm text-slate-700 dark:text-slate-300">{rec.recommended_position}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{rec.justification}</p>
                      </div>
                      <div className={`px-2 py-1 rounded-md text-xs font-bold whitespace-nowrap ${
                        rec.status === 'Approved' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
                        rec.status === 'Under Review' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                        rec.status === 'Proposed' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
                        'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}>
                        {rec.status}
                      </div>
                    </div>
                    
                    {/* Rubric Scores */}
                    <div className="grid grid-cols-5 gap-1.5 mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                      {[
                        { label: 'Tech', val: rec.rubric_technical },
                        { label: 'Lead', val: rec.rubric_leadership },
                        { label: 'Team', val: rec.rubric_teamwork },
                        { label: 'Init', val: rec.rubric_initiative },
                        { label: 'Rel', val: rec.rubric_reliability },
                      ].map(({ label, val }) => (
                        <div key={label} className="text-center">
                          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{label}</p>
                          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 text-xs font-bold mt-1">
                            {val}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Right Column: Career Paths & Opportunities */}
        <div className="space-y-4">
          {/* Career Paths Card */}
          {careerPaths.length > 0 ? (
            <Card>
              <div className="mb-4">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Briefcase size={16} className="text-blue-500" /> Career Paths
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Explore available progression routes</p>
              </div>
              
              <div className="space-y-2">
                {careerPaths.map((path, idx) => (
                  <motion.div
                    key={path.id}
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="p-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-gradient-to-br from-slate-50 to-slate-50/50 dark:from-slate-900/50 dark:to-slate-900/30 hover:border-teal-300 dark:hover:border-teal-700 transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <ArrowRight size={14} className="text-teal-500 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{path.current_role}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">→</span>
                          <p className="text-xs font-semibold text-teal-600 dark:text-teal-400 truncate">{path.next_role}</p>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {path.min_tenure_months > 0 && (
                            <span className="text-[9px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded">
                              {Math.ceil(path.min_tenure_months / 12)}y tenure
                            </span>
                          )}
                          {path.min_readiness_score > 0 && (
                            <span className="text-[9px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded">
                              {path.min_readiness_score}% readiness
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </Card>
          ) : (
            <Card className="text-center p-5 border border-dashed border-slate-300 dark:border-slate-700">
              <Briefcase size={24} className="mx-auto text-slate-400 mb-2" />
              <p className="text-xs font-bold text-slate-600 dark:text-slate-400">No career paths available yet</p>
            </Card>
          )}

          {/* Growth Tips Card */}
          <Card className="bg-gradient-to-br from-teal-50 to-teal-50/50 dark:from-teal-900/20 dark:to-teal-900/10 border border-teal-100 dark:border-teal-800/40">
            <div className="mb-3">
              <h3 className="text-sm font-bold text-teal-700 dark:text-teal-300 flex items-center gap-2">
                <Star size={14} /> Growth Tips
              </h3>
            </div>
            <div className="space-y-2 text-xs text-teal-700 dark:text-teal-300">
              <p>✓ Complete your development goals</p>
              <p>✓ Maintain strong appraisal scores</p>
              <p>✓ Take relevant training courses</p>
              <p>✓ Seek regular feedback from managers</p>
            </div>
          </Card>

          {/* Contact Info */}
          <Card className="p-3 border-l-4 border-l-blue-500">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-2">
              <Users size={12} /> Have Questions?
            </p>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              Reach out to your manager or HR team to discuss your career advancement opportunities.
            </p>
          </Card>
        </div>
      </div>
    </motion.div>
  );
};

export default CareerGrowth;
