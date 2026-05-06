import React, { useEffect, useMemo, useState } from 'react';
import { Users, Search, RefreshCcw, AlertTriangle, CheckCircle2, BarChart3, ClipboardList, HelpCircle } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { Employee } from '../../../types';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { getAuthHeaders } from '../../../utils/csv';
import { appConfirm } from '../../../utils/appDialog';

interface EmployeeMetricsDashboardProps {
  employees: Employee[];
}

interface EmployeePerformanceSnapshot {
  employee_id: number;
  employee_name: string;
  position: string | null;
  dept: string | null;
  goals_total: number;
  goals_active: number;
  goals_completed: number;
  goals_at_risk: number;
  goals_overdue: number;
  goals_avg_progress: number;
  goals_completion_rate: number;
  delegated_goal_count: number;
  assigned_unrated_goals_count: number;
  team_goal_count: number;
  department_goal_count: number;
  pip_count: number;
  idp_count: number;
  recovery_tasks_total: number;
  recovery_tasks_open: number;
  recovery_tasks_completed: number;
  proofs_approved: number;
  proofs_rejected: number;
  proofs_needs_revision: number;
  goal_revisions_count: number;
  member_proof_ratings_count: number;
  member_proof_rating_avg: number;
  leader_proof_ratings_count: number;
  leader_proof_rating_avg: number;
  proof_ratings_count: number;
  proof_rating_avg: number;
  self_assessments_count: number;
  last_self_assessment_at: string | null;
  appraisals_count: number;
  performance_evaluation_forms_count: number;
  appraisals_avg_overall: number;
  last_appraisal_signoff: string | null;
  disciplinary_count: number;
  disciplinary_violation_entries_count: number;
  disciplinary_actions_count: number;
  last_disciplinary_date: string | null;
  feedback_360_count: number;
  suggestions_count: number;
  last_suggestion_date: string | null;
  onboarding_count: number;
  onboarding_signed_count: number;
  property_forms_count: number;
  property_signed_count: number;
  exit_interviews_count: number;
  exit_interviews_signed_count: number;
  coaching_logs_count: number;
  last_coaching_log_at: string | null;
  forms_total_count: number;
  team_improvement_plans: number;
  team_development_plans: number;
  department_improvement_plans: number;
  department_development_plans: number;
}

const CHART_COLORS = ['#0f766e', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6'];

export const EmployeeMetricsDashboard = (_props: EmployeeMetricsDashboardProps) => {
  const [employeePerformance, setEmployeePerformance] = useState<EmployeePerformanceSnapshot[]>([]);
  const [employeePerformanceSummary, setEmployeePerformanceSummary] = useState<any>(null);
  const [employeePerformanceLoading, setEmployeePerformanceLoading] = useState(false);
  const [employeePerformanceError, setEmployeePerformanceError] = useState<string | null>(null);
  const [employeePerformanceSearch, setEmployeePerformanceSearch] = useState('');
  const [selectedPerformanceEmployeeId, setSelectedPerformanceEmployeeId] = useState<number | null>(null);
  const [metricsSidebarOpen, setMetricsSidebarOpen] = useState(true);
  const [metricsPlanSubmitting, setMetricsPlanSubmitting] = useState<'pip' | 'idp' | null>(null);

  const fetchEmployeePerformanceMetrics = async () => {
    setEmployeePerformanceLoading(true);
    setEmployeePerformanceError(null);
    try {
      const res = await fetch('/api/performance/employees', { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to load employee metrics');
      const payload = await res.json();
      const list = Array.isArray(payload?.employees) ? payload.employees : [];
      setEmployeePerformance(list);
      setEmployeePerformanceSummary(payload?.summary || null);
      setSelectedPerformanceEmployeeId((prev) => {
        if (!list.length) return null;
        if (prev && list.some((item: any) => Number(item?.employee_id) === Number(prev))) return prev;
        return Number(list[0]?.employee_id || 0) || null;
      });
    } catch (e: any) {
      setEmployeePerformanceError(e?.message || 'Unable to load employee metrics');
      setEmployeePerformance([]);
      setEmployeePerformanceSummary(null);
      setSelectedPerformanceEmployeeId(null);
    } finally {
      setEmployeePerformanceLoading(false);
    }
  };

  useEffect(() => {
    void fetchEmployeePerformanceMetrics();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      void fetchEmployeePerformanceMetrics();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const filteredPerformanceEmployees = useMemo(() => {
    const term = employeePerformanceSearch.trim().toLowerCase();
    if (!term) return employeePerformance;
    return employeePerformance.filter((item) => {
      const name = String(item?.employee_name || '').toLowerCase();
      const dept = String(item?.dept || '').toLowerCase();
      const position = String(item?.position || '').toLowerCase();
      return name.includes(term) || dept.includes(term) || position.includes(term);
    });
  }, [employeePerformance, employeePerformanceSearch]);

  const selectedPerformanceEmployee = useMemo(() => {
    if (!selectedPerformanceEmployeeId) return null;
    return employeePerformance.find((item) => Number(item.employee_id) === Number(selectedPerformanceEmployeeId)) || null;
  }, [employeePerformance, selectedPerformanceEmployeeId]);

  const getDisplayedPercent = (item: EmployeePerformanceSnapshot) => {
    const completionRate = Number(item.goals_completion_rate || 0);
    if (completionRate > 0) return completionRate;

    const proofBasedRating = Math.max(
      Number(item.proof_rating_avg || 0),
      Number(item.member_proof_rating_avg || 0),
      Number(item.leader_proof_rating_avg || 0)
    );
    if (proofBasedRating > 0) return Math.round((proofBasedRating / 5) * 100);

    return 0;
  };

  const progressChartData = useMemo(() => {
    return [...employeePerformance]
      .sort((a, b) => getDisplayedPercent(b) - getDisplayedPercent(a))
      .slice(0, 8)
      .map((item) => ({
        name: item.employee_name.length > 12 ? `${item.employee_name.slice(0, 12)}...` : item.employee_name,
        progress: getDisplayedPercent(item),
      }));
  }, [employeePerformance]);

  const riskBreakdownData = useMemo(() => {
    const atRisk = employeePerformance.reduce((sum, row) => sum + Number(row.goals_at_risk || 0), 0);
    const overdue = employeePerformance.reduce((sum, row) => sum + Number(row.goals_overdue || 0), 0);
    const recoveryOpen = employeePerformance.reduce((sum, row) => sum + Number(row.recovery_tasks_open || 0), 0);
    const disciplinary = employeePerformance.reduce((sum, row) => sum + Number(row.disciplinary_count || 0), 0);
    return [
      { name: 'At Risk Goals', value: atRisk },
      { name: 'Overdue Goals', value: overdue },
      { name: 'Recovery Open', value: recoveryOpen },
      { name: 'Disciplinary', value: disciplinary },
    ].filter((item) => item.value > 0);
  }, [employeePerformance]);

  const employeePerformanceSignals = useMemo(() => {
    return [...employeePerformance]
      .map((employee) => {
        const goalsTotal = Number(employee.goals_total || 0);
        const goalsCompleted = Number(employee.goals_completed || 0);
        const goalsAtRisk = Number(employee.goals_at_risk || 0);
        const goalsOverdue = Number(employee.goals_overdue || 0);
        const avgProgress = Number(employee.goals_avg_progress || 0);
        const completionRate = Number(employee.goals_completion_rate || 0);
        const pipCount = Number(employee.pip_count || 0);
        const idpCount = Number(employee.idp_count || 0);
        const recoveryOpen = Number(employee.recovery_tasks_open || 0);
        const recoveryCompleted = Number(employee.recovery_tasks_completed || 0);
        const proofsApproved = Number(employee.proofs_approved || 0);
        const proofsRejected = Number(employee.proofs_rejected || 0);
        const proofsNeedsRevision = Number(employee.proofs_needs_revision || 0);
        const proofRatingAvg = Number(employee.proof_rating_avg || 0);
        const memberProofRatingAvg = Number(employee.member_proof_rating_avg || 0);
        const leaderProofRatingAvg = Number(employee.leader_proof_rating_avg || 0);
        const memberProofRatingsCount = Number(employee.member_proof_ratings_count || 0);
        const selfAssessments = Number(employee.self_assessments_count || 0);
        const appraisalsCount = Number(employee.appraisals_count || 0);
        const performanceEvaluationFormsCount = Number(employee.performance_evaluation_forms_count || appraisalsCount);
        const appraisalsAvg = Number(employee.appraisals_avg_overall || 0);
        const disciplinaryCount = Number(employee.disciplinary_count || 0);
        const disciplinaryViolationEntriesCount = Number(employee.disciplinary_violation_entries_count || 0);
        const disciplinaryActionsCount = Number(employee.disciplinary_actions_count || 0);
        const goalRevisionsCount = Number(employee.goal_revisions_count || employee.proofs_needs_revision || 0);
        const feedback360 = Number(employee.feedback_360_count || 0);
        const suggestionsCount = Number(employee.suggestions_count || 0);
        const onboardingCount = Number(employee.onboarding_count || 0);
        const propertyFormsCount = Number(employee.property_forms_count || 0);
        const exitInterviewsCount = Number(employee.exit_interviews_count || 0);
        const coachingLogsCount = Number(employee.coaching_logs_count || 0);
        const formsTotalCount = Number(employee.forms_total_count || 0);
        const delegatedGoals = Number(employee.delegated_goal_count || 0);
        const unratedDelegatedGoals = Number(employee.assigned_unrated_goals_count ?? Math.max(0, delegatedGoals - Math.min(delegatedGoals, memberProofRatingsCount)));
        const ratedDelegatedGoals = Math.max(0, delegatedGoals - unratedDelegatedGoals);
        const teamGoals = Number(employee.team_goal_count || 0);
        const departmentGoals = Number(employee.department_goal_count || 0);
        const teamImprovementPlans = Number(employee.team_improvement_plans || 0);
        const teamDevelopmentPlans = Number(employee.team_development_plans || 0);
        const departmentImprovementPlans = Number(employee.department_improvement_plans || 0);
        const departmentDevelopmentPlans = Number(employee.department_development_plans || 0);

        const positiveScore = (
          (goalsCompleted * 6) +
          (avgProgress * 1.5) +
          (completionRate * 1.5) +
          (recoveryCompleted * 3) +
          (proofsApproved * 2) +
          (proofRatingAvg * 4) +
          (memberProofRatingAvg * 1.5) +
          (leaderProofRatingAvg * 1.5) +
          (selfAssessments * 2) +
          (performanceEvaluationFormsCount * 2) +
          (appraisalsAvg * 4) +
          (feedback360 * 2) +
          (suggestionsCount * 1.5) +
          (onboardingCount * 1) +
          (propertyFormsCount * 1) +
          (exitInterviewsCount * 1) +
          (coachingLogsCount * 1.5) +
          (formsTotalCount * 0.3) +
          (ratedDelegatedGoals * 1.5) +
          (teamGoals * 1) +
          (departmentGoals * 1) +
          (teamImprovementPlans * 1) +
          (teamDevelopmentPlans * 1) +
          (departmentImprovementPlans * 1) +
          (departmentDevelopmentPlans * 1)
        );

        // A rated proof means the employee has real goal signal even if they are
        // contributing as an assignee rather than goal owner.
        const hasRatedGoalSignal = proofRatingAvg > 0 || memberProofRatingAvg > 0 || leaderProofRatingAvg > 0;
        const effectiveProofRating = proofRatingAvg > 0 ? proofRatingAvg : Math.max(memberProofRatingAvg, leaderProofRatingAvg);
        const hasLowProofRating = effectiveProofRating > 0 && effectiveProofRating < 3.5;

        const negativeScore = (
          (goalsAtRisk * 5) +
          (goalsOverdue * 8) +
          (pipCount * 12) +
          (idpCount * 4) +
          (recoveryOpen * 4) +
          (proofsRejected * 3) +
          (proofsNeedsRevision * 4) +
          (unratedDelegatedGoals * 12) +
          (disciplinaryCount * 10) +
          (disciplinaryViolationEntriesCount * 3) +
          (disciplinaryActionsCount * 4) +
          (goalRevisionsCount * 4) +
          (hasRatedGoalSignal ? 0 : (Math.max(0, 70 - completionRate) * 0.5)) +
          (hasRatedGoalSignal ? 0 : (Math.max(0, 65 - avgProgress) * 0.5)) +
          (effectiveProofRating > 0 ? Math.max(0, 3.5 - effectiveProofRating) * 8 : 2) +
          (appraisalsAvg > 0 ? Math.max(0, 3.5 - appraisalsAvg) * 5 : 3) +
          (selfAssessments === 0 ? 3 : 0) +
          (formsTotalCount === 0 ? 5 : 0) +
          (appraisalsCount === 0 ? 4 : 0) +
          (!hasRatedGoalSignal && goalsTotal === 0 ? 4 : 0)
        );

        const rawScore = 50 + positiveScore - negativeScore;
        const performanceScore = Math.max(0, Math.min(100, Number(rawScore.toFixed(1))));

        return {
          employee,
          goalsAtRisk,
          goalsOverdue,
          avgProgress,
          completionRate,
          unratedDelegatedGoals,
          hasLowProofRating,
          performanceScore,
          severity: 100 - performanceScore,
        };
      })
      .sort((a, b) => b.performanceScore - a.performanceScore || a.goalsOverdue - b.goalsOverdue || a.goalsAtRisk - b.goalsAtRisk || b.avgProgress - a.avgProgress);
  }, [employeePerformance]);

  // Minimum-signal gate: employee must have at least one meaningful data point
  // before being classified as underperforming. Without signal → "Needs Data".
  const hasMinimumSignal = (row: (typeof employeePerformanceSignals)[number]) => {
    const e = row.employee;
    const hasGoal           = Number(e.goals_total            || 0) >= 1;
    const hasAppraisal      = Number(e.appraisals_count       || 0) >= 1;
    const hasSelfAssess     = Number(e.self_assessments_count || 0) >= 1;
    const hasProof          = Math.max(Number(e.proof_rating_avg || 0), Number(e.member_proof_rating_avg || 0), Number(e.leader_proof_rating_avg || 0)) > 0;
    const hasFeedback       = Number(e.feedback_360_count     || 0) >= 1;
    const hasAnyForm        = Number(e.forms_total_count      || 0) >= 1;
    // Being assigned to a goal (rated or unrated) is itself a signal
    const hasDelegatedGoal  = Number(e.delegated_goal_count   || 0) >= 1;
    return hasGoal || hasAppraisal || hasSelfAssess || hasProof || hasFeedback || hasAnyForm || hasDelegatedGoal;
  };

  const underperformingEmployees = useMemo(() => {
    const list = employeePerformanceSignals.filter(
      (row) =>
        hasMinimumSignal(row) &&
        (
          row.goalsOverdue > 0 ||
          row.goalsAtRisk > 0 ||
          row.unratedDelegatedGoals > 0 ||
          row.hasLowProofRating ||
          Number(row.employee.goal_revisions_count || 0) > 0 ||
          Number(row.employee.disciplinary_actions_count || 0) > 0 ||
          Number(row.employee.disciplinary_violation_entries_count || 0) > 0
        )
    );
    return list.sort((a, b) => a.performanceScore - b.performanceScore || b.goalsOverdue - a.goalsOverdue || b.goalsAtRisk - a.goalsAtRisk || a.avgProgress - b.avgProgress);
  }, [employeePerformanceSignals]);

  const needsDataEmployees = useMemo(() => {
    return employeePerformanceSignals
      .filter((row) => !hasMinimumSignal(row))
      .sort((a, b) => a.employee.employee_name.localeCompare(b.employee.employee_name));
  }, [employeePerformanceSignals]);

  const performingEmployees = useMemo(() => {
    const list = employeePerformanceSignals.filter((row) => {
      if (!hasMinimumSignal(row)) return false;
      if (row.goalsOverdue > 0 || row.goalsAtRisk > 0 || row.unratedDelegatedGoals > 0 || row.hasLowProofRating) return false;
      if (Number(row.employee.goal_revisions_count || 0) > 0) return false;
      if (Number(row.employee.disciplinary_actions_count || 0) > 0) return false;
      if (Number(row.employee.disciplinary_violation_entries_count || 0) > 0) return false;
      // Score threshold OR a strong proof rating (assignee who was rated highly)
      const proofRatingAvg = Number(row.employee.proof_rating_avg || 0);
      const meetsScoreThreshold = row.performanceScore >= 70;
      const hasStrongProofRating = proofRatingAvg >= 4.0;
      return meetsScoreThreshold || hasStrongProofRating;
    });
    return list.sort((a, b) => b.performanceScore - a.performanceScore || a.goalsOverdue - b.goalsOverdue || a.goalsAtRisk - b.goalsAtRisk || b.avgProgress - a.avgProgress);
  }, [employeePerformanceSignals]);

  const createPIPFromMetrics = async (employee: EmployeePerformanceSnapshot) => {
    const employeeId = Number(employee?.employee_id || 0);
    if (!employeeId) {
      window.notify?.('Unable to identify employee for PIP creation', 'error');
      return;
    }

    const employeeName = String(employee?.employee_name || 'Employee').trim();
    const avgProgress = Number(employee?.goals_avg_progress || 0);
    const atRisk = Number(employee?.goals_at_risk || 0);
    const overdue = Number(employee?.goals_overdue || 0);
    const disciplinary = Number(employee?.disciplinary_count || 0);

    if (!(await appConfirm(`Create a PIP for ${employeeName} from overall metrics?`, { title: 'Create PIP from Metrics', confirmText: 'Create', icon: 'warning' }))) return;

    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 30);

    setMetricsPlanSubmitting('pip');
    try {
      const deficiencySummary = [
        `Average goal progress: ${avgProgress}%`,
        `At risk goals: ${atRisk}`,
        `Overdue goals: ${overdue}`,
        `Disciplinary records: ${disciplinary}`,
      ].join(' | ');

      const res = await fetch('/api/pip_plans', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          employee_id: employeeId,
          start_date: start.toISOString().slice(0, 10),
          end_date: end.toISOString().slice(0, 10),
          deficiency: `Overall metrics trigger: ${deficiencySummary}`,
          improvement_objective: 'Raise goal execution consistency and reduce risk indicators.',
          action_steps: '1) Weekly check-ins 2) Prioritize overdue goals 3) Daily execution tracking',
          outcome: 'In Progress',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as any));
        throw new Error(err?.error || 'Failed to create PIP from metrics');
      }
      window.notify?.('PIP created from overall metrics', 'success');
      void fetchEmployeePerformanceMetrics();
    } catch (e: any) {
      window.notify?.(e?.message || 'Failed to create PIP from metrics', 'error');
    } finally {
      setMetricsPlanSubmitting(null);
    }
  };

  const createIDPFromMetrics = async (employee: EmployeePerformanceSnapshot) => {
    const employeeId = Number(employee?.employee_id || 0);
    if (!employeeId) {
      window.notify?.('Unable to identify employee for IDP creation', 'error');
      return;
    }

    const employeeName = String(employee?.employee_name || 'Employee').trim();
    const completionRate = Number(employee?.goals_completion_rate || 0);
    const appraisalsAvg = Number(employee?.appraisals_avg_overall || 0);
    const needsRevision = Number(employee?.proofs_needs_revision || 0);

    if (!(await appConfirm(`Create an IDP for ${employeeName} from overall metrics?`, { title: 'Create IDP from Metrics', confirmText: 'Create', icon: 'info' }))) return;

    setMetricsPlanSubmitting('idp');
    try {
      const skillGap = `Metrics-based gap: completion ${completionRate}%, appraisal avg ${appraisalsAvg.toFixed(1)}, proofs needing revision ${needsRevision}`;
      const res = await fetch('/api/development_plans', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          employee_id: employeeId,
          skill_gap: skillGap,
          growth_step: 'Define skill milestones, assign learning modules, and schedule coaching reviews.',
          step_order: 1,
          status: 'Not Started',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as any));
        throw new Error(err?.error || 'Failed to create IDP from metrics');
      }
      window.notify?.('IDP created from overall metrics', 'success');
      void fetchEmployeePerformanceMetrics();
    } catch (e: any) {
      window.notify?.(e?.message || 'Failed to create IDP from metrics', 'error');
    } finally {
      setMetricsPlanSubmitting(null);
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Employee Metrics & Analytics"
        subtitle="Dedicated performance intelligence screen for managers"
      />

      <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-4 items-start">
        <Card>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Employee Sidebar</p>
              <p className="text-xs text-slate-400">Own analytics panel for employee performance</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => void fetchEmployeePerformanceMetrics()}
                className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300"
              >
                <RefreshCcw size={11} /> Refresh
              </button>
              <button
                onClick={() => setMetricsSidebarOpen((prev) => !prev)}
                className="text-[10px] font-bold px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300"
              >
                {metricsSidebarOpen ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {metricsSidebarOpen && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-teal-50 dark:bg-teal-900/20 px-2.5 py-2">
                  <p className="text-[10px] font-bold uppercase text-teal-700 dark:text-teal-300">Employees</p>
                  <p className="text-lg font-black text-teal-700 dark:text-teal-300">{employeePerformanceSummary?.employees ?? employeePerformance.length}</p>
                </div>
                <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 px-2.5 py-2">
                  <p className="text-[10px] font-bold uppercase text-blue-700 dark:text-blue-300">Avg Progress</p>
                  <p className="text-lg font-black text-blue-700 dark:text-blue-300">{employeePerformanceSummary?.avg_goal_progress ?? 0}%</p>
                </div>
                <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 px-2.5 py-2">
                  <p className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">Total Appraisals</p>
                  <p className="text-lg font-black text-amber-700 dark:text-amber-300">{employeePerformanceSummary?.total_appraisals ?? 0}</p>
                </div>
                <div className="rounded-lg bg-rose-50 dark:bg-rose-900/20 px-2.5 py-2">
                  <p className="text-[10px] font-bold uppercase text-rose-700 dark:text-rose-300">Disciplinary</p>
                  <p className="text-lg font-black text-rose-700 dark:text-rose-300">{employeePerformanceSummary?.total_disciplinary ?? 0}</p>
                </div>
                <div className="rounded-lg bg-violet-50 dark:bg-violet-900/20 px-2.5 py-2">
                  <p className="text-[10px] font-bold uppercase text-violet-700 dark:text-violet-300">Avg Proof Rating</p>
                  <p className="text-lg font-black text-violet-700 dark:text-violet-300">{Number(employeePerformanceSummary?.avg_proof_rating ?? 0).toFixed(2)} / 5</p>
                </div>
                <div className="rounded-lg bg-cyan-50 dark:bg-cyan-900/20 px-2.5 py-2">
                  <p className="text-[10px] font-bold uppercase text-cyan-700 dark:text-cyan-300">Total Forms</p>
                  <p className="text-lg font-black text-cyan-700 dark:text-cyan-300">{employeePerformanceSummary?.total_forms ?? 0}</p>
                </div>
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                <input
                  type="text"
                  value={employeePerformanceSearch}
                  onChange={(e) => setEmployeePerformanceSearch(e.target.value)}
                  placeholder="Find employee, dept, role..."
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                />
              </div>

              {employeePerformanceError && (
                <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                  {employeePerformanceError}
                </div>
              )}

              {employeePerformanceLoading ? (
                <p className="text-xs text-slate-400">Loading metrics...</p>
              ) : (
                <div className="max-h-105 overflow-y-auto pr-1 space-y-1.5">
                  {filteredPerformanceEmployees.map((item) => {
                    const active = Number(item.employee_id) === Number(selectedPerformanceEmployeeId);
                    return (
                      <button
                        key={item.employee_id}
                        onClick={() => setSelectedPerformanceEmployeeId(item.employee_id)}
                        className={`w-full text-left rounded-lg border px-2.5 py-2 transition-colors ${active ? 'border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{item.employee_name}</p>
                            <p className="text-[10px] text-slate-400 truncate">{item.position || 'N/A'} • {item.dept || 'N/A'}</p>
                          </div>
                          <span className="text-[10px] font-black text-teal-600 dark:text-teal-300">{getDisplayedPercent(item)}%</span>
                        </div>
                      </button>
                    );
                  })}
                  {filteredPerformanceEmployees.length === 0 && (
                    <p className="text-xs text-slate-400 px-1 py-3">No matching employees.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-red-500">Underperforming Employees</p>
                  <p className="text-xs text-slate-500">Composite score from goals, forms, feedback, discipline, and plans.</p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-red-50 dark:bg-red-900/25 text-red-600 dark:text-red-300">
                  <AlertTriangle size={12} /> {underperformingEmployees.length} employee{underperformingEmployees.length !== 1 ? 's' : ''}
                </span>
              </div>
              {underperformingEmployees.length === 0 ? (
                <p className="text-xs text-slate-400">No underperforming employees found for the current metrics.</p>
              ) : (
                <div className="max-h-82.5 overflow-y-auto pr-1 space-y-2">
                  {underperformingEmployees.map(({ employee, goalsAtRisk, goalsOverdue, avgProgress, performanceScore, unratedDelegatedGoals }) => (
                    <button
                      key={`employee-metrics-underperf-${employee.employee_id}`}
                      onClick={() => setSelectedPerformanceEmployeeId(employee.employee_id)}
                      className={`w-full inline-flex flex-col items-start gap-1 px-3 py-2 rounded-xl border text-left transition-colors ${Number(selectedPerformanceEmployeeId) === Number(employee.employee_id) ? 'border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/20' : 'border-red-200 dark:border-red-900/40 bg-white dark:bg-slate-900 hover:bg-red-50/60 dark:hover:bg-red-900/20'}`}
                    >
                      <div className="flex items-center justify-between gap-2 w-full">
                        <span className="font-bold text-xs text-slate-700 dark:text-slate-200 truncate max-w-45" title={employee.employee_name}>{employee.employee_name}</span>
                        <span className="text-[10px] font-black text-red-600 dark:text-red-300">{performanceScore.toFixed(0)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        <span>{employee.position || 'N/A'}</span>
                        <span>•</span>
                        <span>{employee.dept || 'N/A'}</span>
                        <span>•</span>
                        <span>{avgProgress}% avg</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-500">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 text-amber-700 dark:text-amber-300">{goalsAtRisk} at risk</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 dark:bg-rose-900/20 px-2 py-0.5 text-rose-700 dark:text-rose-300">{goalsOverdue} overdue</span>
                          {unratedDelegatedGoals > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 dark:bg-orange-900/20 px-2 py-0.5 text-orange-700 dark:text-orange-300">{unratedDelegatedGoals} unrated goal{unratedDelegatedGoals !== 1 ? 's' : ''}</span>
                          )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-emerald-500">Performing Employees</p>
                  <p className="text-xs text-slate-500">Employees with strong signals across the same composite score.</p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/25 text-emerald-600 dark:text-emerald-300">
                  <CheckCircle2 size={12} /> {performingEmployees.length} employee{performingEmployees.length !== 1 ? 's' : ''}
                </span>
              </div>
              {performingEmployees.length === 0 ? (
                <p className="text-xs text-slate-400">No performing employees found for the current metrics.</p>
              ) : (
                <div className="max-h-82.5 overflow-y-auto pr-1 space-y-2">
                  {performingEmployees.map(({ employee, goalsAtRisk, goalsOverdue, avgProgress, performanceScore }) => (
                    <button
                      key={`employee-metrics-performing-${employee.employee_id}`}
                      onClick={() => setSelectedPerformanceEmployeeId(employee.employee_id)}
                      className={`w-full inline-flex flex-col items-start gap-1 px-3 py-2 rounded-xl border text-left transition-colors ${Number(selectedPerformanceEmployeeId) === Number(employee.employee_id) ? 'border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/20' : 'border-emerald-200 dark:border-emerald-900/40 bg-white dark:bg-slate-900 hover:bg-emerald-50/60 dark:hover:bg-emerald-900/20'}`}
                    >
                      <div className="flex items-center justify-between gap-2 w-full">
                        <span className="font-bold text-xs text-slate-700 dark:text-slate-200 truncate max-w-45" title={employee.employee_name}>{employee.employee_name}</span>
                        <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-300">{performanceScore.toFixed(0)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        <span>{employee.position || 'N/A'}</span>
                        <span>•</span>
                        <span>{employee.dept || 'N/A'}</span>
                        <span>•</span>
                        <span>{avgProgress}% avg</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-500">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">{employee.goals_completed} completed</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 dark:bg-sky-900/20 px-2 py-0.5 text-sky-700 dark:text-sky-300">{Math.max(0, Number(employee.goals_completion_rate || 0)).toFixed(0)}% completion</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 dark:bg-slate-800 px-2 py-0.5 text-slate-600 dark:text-slate-300">{goalsAtRisk} at risk</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 dark:bg-slate-800 px-2 py-0.5 text-slate-600 dark:text-slate-300">{goalsOverdue} overdue</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Needs Data — employees with no signal yet, excluded from scoring */}
          {needsDataEmployees.length > 0 && (
            <Card>
              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-slate-500 inline-flex items-center gap-1.5"><HelpCircle size={12} /> Needs Data</p>
                  <p className="text-xs text-slate-400 mt-0.5">These employees have no goals, appraisals, assessments, proof ratings, or feedback yet. They are excluded from performance scoring until at least one signal is recorded.</p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  {needsDataEmployees.length} employee{needsDataEmployees.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {needsDataEmployees.map(({ employee }) => (
                  <button
                    key={`needs-data-${employee.employee_id}`}
                    onClick={() => setSelectedPerformanceEmployeeId(employee.employee_id)}
                    className={`inline-flex flex-col items-start gap-0.5 px-3 py-2 rounded-xl border text-left transition-colors text-xs ${Number(selectedPerformanceEmployeeId) === Number(employee.employee_id) ? 'border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    <span className="font-bold text-slate-700 dark:text-slate-200">{employee.employee_name}</span>
                    <span className="text-[10px] text-slate-400">{employee.position || 'N/A'} · {employee.dept || 'N/A'}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3 inline-flex items-center gap-1.5">
                <BarChart3 size={13} /> Top Progress Leaders
              </p>
              <div className="h-64">
                {progressChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={progressChartData} margin={{ top: 8, right: 8, left: -12, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="progress" radius={[6, 6, 0, 0]} fill="#0f766e" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-slate-400">No progress data yet</div>
                )}
              </div>
            </Card>

            <Card>
              <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3 inline-flex items-center gap-1.5">
                <AlertTriangle size={13} /> Risk Composition
              </p>
              <div className="h-64">
                {riskBreakdownData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={riskBreakdownData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={44} outerRadius={74}>
                        {riskBreakdownData.map((entry, index) => (
                          <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-slate-400">No risk data yet</div>
                )}
              </div>
            </Card>
          </div>

          <Card>
            <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3 inline-flex items-center gap-1.5">
              <ClipboardList size={13} /> Selected Employee Analytics
            </p>
            {!selectedPerformanceEmployee ? (
              <p className="text-sm text-slate-400">Select an employee from the sidebar to view details.</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-black text-slate-800 dark:text-slate-100">{selectedPerformanceEmployee.employee_name}</p>
                  <p className="text-[11px] text-slate-500">{selectedPerformanceEmployee.position || 'N/A'} • {selectedPerformanceEmployee.dept || 'N/A'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => void createPIPFromMetrics(selectedPerformanceEmployee)}
                    disabled={metricsPlanSubmitting !== null}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/30 disabled:opacity-60"
                  >
                    {metricsPlanSubmitting === 'pip' ? 'Creating PIP...' : 'Create PIP from Metrics'}
                  </button>
                  <button
                    onClick={() => void createIDPFromMetrics(selectedPerformanceEmployee)}
                    disabled={metricsPlanSubmitting !== null}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-900/30 disabled:opacity-60"
                  >
                    {metricsPlanSubmitting === 'idp' ? 'Creating IDP...' : 'Create IDP from Metrics'}
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900/30"><p className="text-slate-500 font-bold">Goals</p><p className="font-black text-slate-700 dark:text-slate-200">{selectedPerformanceEmployee.goals_total}</p></div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900/30"><p className="text-slate-500 font-bold">Completion</p><p className="font-black text-slate-700 dark:text-slate-200">{selectedPerformanceEmployee.goals_completion_rate}%</p></div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900/30"><p className="text-slate-500 font-bold">PIP / IDP</p><p className="font-black text-slate-700 dark:text-slate-200">{selectedPerformanceEmployee.pip_count} / {selectedPerformanceEmployee.idp_count}</p></div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900/30"><p className="text-slate-500 font-bold">Appraisals</p><p className="font-black text-slate-700 dark:text-slate-200">{selectedPerformanceEmployee.appraisals_count}</p></div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900/30"><p className="text-slate-500 font-bold">At Risk / Overdue</p><p className="font-black text-slate-700 dark:text-slate-200">{selectedPerformanceEmployee.goals_at_risk} / {selectedPerformanceEmployee.goals_overdue}</p></div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900/30"><p className="text-slate-500 font-bold">Recovery Open</p><p className="font-black text-slate-700 dark:text-slate-200">{selectedPerformanceEmployee.recovery_tasks_open}</p></div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900/30"><p className="text-slate-500 font-bold">Proof Outcomes</p><p className="font-black text-slate-700 dark:text-slate-200">+{selectedPerformanceEmployee.proofs_approved} / -{selectedPerformanceEmployee.proofs_rejected}</p></div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900/30"><p className="text-slate-500 font-bold">Goal Revisions</p><p className="font-black text-slate-700 dark:text-slate-200">{selectedPerformanceEmployee.goal_revisions_count || 0}</p></div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900/30"><p className="text-slate-500 font-bold">Proof Rating</p><p className="font-black text-slate-700 dark:text-slate-200">{Number(selectedPerformanceEmployee.proof_rating_avg || 0).toFixed(2)} / 5</p></div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900/30"><p className="text-slate-500 font-bold">Feedback 360</p><p className="font-black text-slate-700 dark:text-slate-200">{selectedPerformanceEmployee.feedback_360_count}</p></div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900/30"><p className="text-slate-500 font-bold">Violation Types</p><p className="font-black text-slate-700 dark:text-slate-200">{selectedPerformanceEmployee.disciplinary_violation_entries_count || 0}</p></div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900/30"><p className="text-slate-500 font-bold">Disciplinary Actions</p><p className="font-black text-slate-700 dark:text-slate-200">{selectedPerformanceEmployee.disciplinary_actions_count || 0}</p></div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900/30"><p className="text-slate-500 font-bold">Eval Forms</p><p className="font-black text-slate-700 dark:text-slate-200">{selectedPerformanceEmployee.performance_evaluation_forms_count || selectedPerformanceEmployee.appraisals_count || 0}</p></div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900/30"><p className="text-slate-500 font-bold">Total Forms</p><p className="font-black text-slate-700 dark:text-slate-200">{selectedPerformanceEmployee.forms_total_count}</p></div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900/30"><p className="text-slate-500 font-bold">Suggestions</p><p className="font-black text-slate-700 dark:text-slate-200">{selectedPerformanceEmployee.suggestions_count}</p></div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900/30"><p className="text-slate-500 font-bold">Onboarding</p><p className="font-black text-slate-700 dark:text-slate-200">{selectedPerformanceEmployee.onboarding_signed_count} / {selectedPerformanceEmployee.onboarding_count}</p></div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900/30"><p className="text-slate-500 font-bold">Property</p><p className="font-black text-slate-700 dark:text-slate-200">{selectedPerformanceEmployee.property_signed_count} / {selectedPerformanceEmployee.property_forms_count}</p></div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900/30"><p className="text-slate-500 font-bold">Exit Interviews</p><p className="font-black text-slate-700 dark:text-slate-200">{selectedPerformanceEmployee.exit_interviews_signed_count} / {selectedPerformanceEmployee.exit_interviews_count}</p></div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900/30"><p className="text-slate-500 font-bold">Coaching Logs</p><p className="font-black text-slate-700 dark:text-slate-200">{selectedPerformanceEmployee.coaching_logs_count}</p></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] text-slate-500">
                  <p><span className="font-bold">Last Self-Assessment:</span> {selectedPerformanceEmployee.last_self_assessment_at ? new Date(selectedPerformanceEmployee.last_self_assessment_at).toLocaleDateString() : 'N/A'}</p>
                  <p><span className="font-bold">Last Appraisal:</span> {selectedPerformanceEmployee.last_appraisal_signoff || 'N/A'}</p>
                  <p><span className="font-bold">Last Disciplinary:</span> {selectedPerformanceEmployee.last_disciplinary_date || 'N/A'}</p>
                  <p><span className="font-bold">Last Suggestion:</span> {selectedPerformanceEmployee.last_suggestion_date ? new Date(selectedPerformanceEmployee.last_suggestion_date).toLocaleDateString() : 'N/A'}</p>
                  <p><span className="font-bold">Last Coaching Log:</span> {selectedPerformanceEmployee.last_coaching_log_at ? new Date(selectedPerformanceEmployee.last_coaching_log_at).toLocaleDateString() : 'N/A'}</p>
                  <p><span className="font-bold">Rated Proofs:</span> {selectedPerformanceEmployee.proof_ratings_count || 0}</p>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3 inline-flex items-center gap-1.5">
              <Users size={13} /> Team Health Snapshot
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-2.5">
                <p className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300">Completed Goals</p>
                <p className="text-lg font-black text-emerald-700 dark:text-emerald-300">{Number(employeePerformanceSummary?.total_completed_goals ?? employeePerformance.reduce((sum, r) => sum + Number(r.goals_completed || 0), 0))}</p>
              </div>
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-2.5">
                <p className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">Active Goals</p>
                <p className="text-lg font-black text-amber-700 dark:text-amber-300">{Number(employeePerformanceSummary?.total_active_goals ?? employeePerformance.reduce((sum, r) => sum + Number(r.goals_active || 0), 0))}</p>
              </div>
              <div className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 p-2.5">
                <p className="text-[10px] font-bold uppercase text-sky-700 dark:text-sky-300">Total Self-Assessments</p>
                <p className="text-lg font-black text-sky-700 dark:text-sky-300">{employeePerformance.reduce((sum, r) => sum + Number(r.self_assessments_count || 0), 0)}</p>
              </div>
              <div className="rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 p-2.5">
                <p className="text-[10px] font-bold uppercase text-violet-700 dark:text-violet-300">PIP + IDP</p>
                <p className="text-lg font-black text-violet-700 dark:text-violet-300">{employeePerformance.reduce((sum, r) => sum + Number(r.pip_count || 0) + Number(r.idp_count || 0), 0)}</p>
              </div>
              <div className="rounded-lg border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-900/20 p-2.5">
                <p className="text-[10px] font-bold uppercase text-cyan-700 dark:text-cyan-300">Total Forms</p>
                <p className="text-lg font-black text-cyan-700 dark:text-cyan-300">{employeePerformance.reduce((sum, r) => sum + Number(r.forms_total_count || 0), 0)}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default EmployeeMetricsDashboard;
