import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { DollarSign, Users, Building2, TrendingUp, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';

const DEPT_COLORS = ['#0f766e', '#14b8a6', '#f59e0b', '#6366f1', '#ec4899', '#8b5cf6', '#ef4444', '#06b6d4'];
const RANGE_COLORS = ['#94a3b8', '#14b8a6', '#0f766e', '#6366f1', '#f59e0b'];

const fmt = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toLocaleString()}`;
};

export const PayrollAnalytics = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedDept, setExpandedDept] = useState<string | null>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/payroll-analytics', { headers: getAuthHeaders() });
      const d = await res.json();
      setData(d);
    } catch { setData(null); }
    setLoading(false);
  };

  if (loading) return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center h-64">
      <div className="animate-pulse text-slate-400">Loading payroll data...</div>
    </motion.div>
  );

  if (!data) return (
    <div className="text-center py-12 text-slate-400">Failed to load payroll analytics.</div>
  );

  const StatCard = ({ icon: Icon, label, value, sub, color }: any) => (
    <Card>
      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={20} className="text-white" />
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{value}</p>
          {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
        </div>
      </div>
    </Card>
  );

  const deptBar = (data.byDepartment || []).map((d: any) => ({
    dept: d.dept, avg: d.avgSalary, total: d.totalSalary, headcount: d.headcount,
  }));

  const headcountPie = (data.byDepartment || []).map((d: any) => ({
    name: d.dept, value: d.headcount,
  }));

  const salaryDist = data.salaryDistribution || [];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-6">
        <SectionHeader title="Payroll Analytics" subtitle="Compensation overview and salary distribution" />
        <button
          onClick={() => exportToCSV(
            (data.byDepartment || []).flatMap((d: any) => d.employees.map((e: any) => ({ ...e, dept: d.dept }))),
            'payroll_data'
          )}
          className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          <Download size={16} /> Export XLSX
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={DollarSign} label="Total Payroll" value={fmt(data.totalPayroll)} sub="Annual cost" color="bg-teal-600" />
        <StatCard icon={TrendingUp} label="Avg Salary" value={fmt(data.avgSalary)} sub="Per employee" color="bg-indigo-500" />
        <StatCard icon={Users} label="Total Headcount" value={data.headcount} sub="Active employees" color="bg-amber-500" />
        <StatCard icon={Building2} label="Departments" value={data.departmentCount} sub="Active departments" color="bg-pink-500" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Avg Salary by Department - Bar */}
        <Card className="md:col-span-2">
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-300 uppercase mb-4">Average Salary by Department</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptBar} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #e2e8f0)" />
                <XAxis dataKey="dept" tick={{ fill: 'var(--chart-tick, #94a3b8)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--chart-tick, #94a3b8)', fontSize: 11 }} tickFormatter={(v: number) => fmt(v)} />
                <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, '']} />
                <Bar dataKey="avg" name="Avg Salary" radius={[6, 6, 0, 0]}>
                  {deptBar.map((_: any, i: number) => (
                    <Cell key={i} fill={DEPT_COLORS[i % DEPT_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Headcount by Department - Pie */}
        <Card>
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-300 uppercase mb-4">Headcount by Dept</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={headcountPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="70%" innerRadius="40%" paddingAngle={3}>
                  {headcountPie.map((_: any, i: number) => (
                    <Cell key={i} fill={DEPT_COLORS[i % DEPT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Salary Distribution + Department Table */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Salary Distribution */}
        <Card>
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-300 uppercase mb-4">Salary Distribution</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salaryDist} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #e2e8f0)" />
                <XAxis type="number" tick={{ fill: 'var(--chart-tick, #94a3b8)', fontSize: 11 }} />
                <YAxis dataKey="label" type="category" tick={{ fill: 'var(--chart-tick, #94a3b8)', fontSize: 10 }} width={80} />
                <Tooltip />
                <Bar dataKey="count" name="Employees" radius={[0, 6, 6, 0]}>
                  {salaryDist.map((_: any, i: number) => (
                    <Cell key={i} fill={RANGE_COLORS[i % RANGE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Department Breakdown Table */}
        <Card className="md:col-span-2">
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-300 uppercase mb-4">Department Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Department</th>
                  <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Headcount</th>
                  <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Avg Salary</th>
                  <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Total Cost</th>
                  <th className="pb-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {(data.byDepartment || []).map((d: any) => (
                  <React.Fragment key={d.dept}>
                    <tr
                      className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
                      onClick={() => setExpandedDept(expandedDept === d.dept ? null : d.dept)}
                    >
                      <td className="py-2.5 font-medium text-slate-700 dark:text-slate-200">{d.dept}</td>
                      <td className="py-2.5 text-right text-slate-600 dark:text-slate-400">{d.headcount}</td>
                      <td className="py-2.5 text-right font-bold text-teal-600 dark:text-teal-400">{fmt(d.avgSalary)}</td>
                      <td className="py-2.5 text-right text-slate-600 dark:text-slate-400">{fmt(d.totalSalary)}</td>
                      <td className="py-2.5 text-slate-400">
                        {expandedDept === d.dept ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </td>
                    </tr>
                    {expandedDept === d.dept && d.employees.map((e: any) => (
                      <tr key={e.id} className="bg-slate-50/50 dark:bg-slate-800/20">
                        <td className="py-1.5 pl-6 text-xs text-slate-500 dark:text-slate-400">{e.name}</td>
                        <td className="py-1.5 text-right text-[10px] text-slate-400">{e.position || '—'}</td>
                        <td className="py-1.5 text-right text-xs font-medium text-slate-600 dark:text-slate-300">{e.salary_base ? fmt(e.salary_base) : '—'}</td>
                        <td className="py-1.5 text-right text-[10px] text-slate-400">{e.status || '—'}</td>
                        <td></td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </motion.div>
  );
};

export default PayrollAnalytics;
