import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Building2, RefreshCw, TrendingUp, Users } from 'lucide-react';
import { Card } from '../../common/Card';
import { getAuthHeaders } from '../../../utils/csv';

const statusChip = (status: string) => {
  const s = (status || 'Not Started').toLowerCase();
  if (s === 'completed') return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400';
  if (s === 'in progress') return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
  if (s === 'at risk') return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400';
  return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
};

const scopeBadge = (scope: string) => {
  if ((scope || '').toLowerCase() === 'department') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400">
        <Building2 size={10} /> Department
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400">
      <Users size={10} /> Team
    </span>
  );
};

export const GoalScopePlanManager = () => {
  const [improvementPlans, setImprovementPlans] = useState<any[]>([]);
  const [developmentPlans, setDevelopmentPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scopeTab, setScopeTab] = useState<'Team' | 'Department'>('Team');

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [impRes, devRes] = await Promise.all([
        fetch('/api/goal_improvement_plans', { headers: getAuthHeaders() }),
        fetch('/api/goal_development_plans', { headers: getAuthHeaders() }),
      ]);
      const [imp, dev] = await Promise.all([impRes.json(), devRes.json()]);
      setImprovementPlans(Array.isArray(imp) ? imp : []);
      setDevelopmentPlans(Array.isArray(dev) ? dev : []);
    } catch {
      setImprovementPlans([]);
      setDevelopmentPlans([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const summary = useMemo(() => {
    const impTeam = improvementPlans.filter((p) => (p.goal_scope || '').toLowerCase() === 'team').length;
    const impDept = improvementPlans.filter((p) => (p.goal_scope || '').toLowerCase() === 'department').length;
    const devTeam = developmentPlans.filter((p) => (p.goal_scope || '').toLowerCase() === 'team').length;
    const devDept = developmentPlans.filter((p) => (p.goal_scope || '').toLowerCase() === 'department').length;
    return { impTeam, impDept, devTeam, devDept };
  }, [improvementPlans, developmentPlans]);

  const selectedScope = scopeTab.toLowerCase();
  const filteredImprovementPlans = useMemo(() => {
    return improvementPlans.filter((p) => ((p.goal_scope || p.linked_goal_scope || '').toLowerCase() === selectedScope));
  }, [improvementPlans, selectedScope]);

  const filteredDevelopmentPlans = useMemo(() => {
    return developmentPlans.filter((p) => ((p.goal_scope || p.linked_goal_scope || '').toLowerCase() === selectedScope));
  }, [developmentPlans, selectedScope]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black text-slate-700 dark:text-slate-200">Goal Plans Manager</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Team and Department goal plans separated by scope.</p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-60"
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 gap-1">
        <button
          onClick={() => setScopeTab('Team')}
          className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${scopeTab === 'Team' ? 'bg-white dark:bg-slate-900 text-cyan-700 dark:text-cyan-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
        >
          Team Plans
        </button>
        <button
          onClick={() => setScopeTab('Department')}
          className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${scopeTab === 'Department' ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
        >
          Department Plans
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <p className="text-[10px] font-bold uppercase text-slate-500">{scopeTab} Improvement</p>
          <p className="text-2xl font-black text-cyan-600 dark:text-cyan-400">{scopeTab === 'Team' ? summary.impTeam : summary.impDept}</p>
        </Card>
        <Card>
          <p className="text-[10px] font-bold uppercase text-slate-500">{scopeTab} Development</p>
          <p className="text-2xl font-black text-teal-700 dark:text-teal-400">{scopeTab === 'Team' ? summary.devTeam : summary.devDept}</p>
        </Card>
        <Card>
          <p className="text-[10px] font-bold uppercase text-slate-500">{scopeTab} Total Plans</p>
          <p className="text-2xl font-black text-slate-700 dark:text-slate-200">{(scopeTab === 'Team' ? summary.impTeam + summary.devTeam : summary.impDept + summary.devDept)}</p>
        </Card>
        <Card>
          <p className="text-[10px] font-bold uppercase text-slate-500">All Scope Plans</p>
          <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{summary.impTeam + summary.impDept + summary.devTeam + summary.devDept}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Card>
          <h4 className="text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-3 flex items-center gap-1.5">
            <AlertTriangle size={14} /> {scopeTab} Performance Improvement Plans ({filteredImprovementPlans.length})
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="py-2 text-[10px] font-bold uppercase text-slate-500">Goal</th>
                  <th className="py-2 text-[10px] font-bold uppercase text-slate-500">Scope</th>
                  <th className="py-2 text-[10px] font-bold uppercase text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-xs text-slate-400 text-center">Loading improvement plans...</td>
                  </tr>
                ) : filteredImprovementPlans.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-xs text-slate-400 text-center">No {scopeTab.toLowerCase()} improvement plans yet.</td>
                  </tr>
                ) : (
                  filteredImprovementPlans.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 dark:border-slate-800/50">
                      <td className="py-2 text-xs text-slate-700 dark:text-slate-200 max-w-[220px] truncate" title={p.goal_title || p.goal_statement || 'Goal'}>
                        {p.goal_title || p.goal_statement || 'Untitled goal'}
                      </td>
                      <td className="py-2">{scopeBadge(p.goal_scope || p.linked_goal_scope || '')}</td>
                      <td className="py-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusChip(p.status || 'Not Started')}`}>
                          {p.status || 'Not Started'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h4 className="text-xs font-black uppercase tracking-wider text-teal-700 dark:text-teal-400 mb-3 flex items-center gap-1.5">
            <TrendingUp size={14} /> {scopeTab} Development Plans ({filteredDevelopmentPlans.length})
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="py-2 text-[10px] font-bold uppercase text-slate-500">Goal</th>
                  <th className="py-2 text-[10px] font-bold uppercase text-slate-500">Scope</th>
                  <th className="py-2 text-[10px] font-bold uppercase text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-xs text-slate-400 text-center">Loading development plans...</td>
                  </tr>
                ) : filteredDevelopmentPlans.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-xs text-slate-400 text-center">No {scopeTab.toLowerCase()} development plans yet.</td>
                  </tr>
                ) : (
                  filteredDevelopmentPlans.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 dark:border-slate-800/50">
                      <td className="py-2 text-xs text-slate-700 dark:text-slate-200 max-w-[220px] truncate" title={p.goal_title || p.goal_statement || 'Goal'}>
                        {p.goal_title || p.goal_statement || 'Untitled goal'}
                      </td>
                      <td className="py-2">{scopeBadge(p.goal_scope || p.linked_goal_scope || '')}</td>
                      <td className="py-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusChip(p.status || 'Not Started')}`}>
                          {p.status || 'Not Started'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
};
