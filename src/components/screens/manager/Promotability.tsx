import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Award, Download, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';

export const Promotability = () => {
  const [appraisals, setAppraisals] = useState<any[]>([]);

  useEffect(() => { fetchAppraisals(); }, []);

  const fetchAppraisals = async () => {
    try {
      const res = await fetch('/api/appraisals', { headers: getAuthHeaders() });
      const data = await res.json();
      setAppraisals(Array.isArray(data) ? data : []);
    } catch { setAppraisals([]); }
  };

  const statusCounts = appraisals.reduce((acc: any, a: any) => {
    const s = a.promotability_status || 'Unrated';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  const pieData = Object.keys(statusCounts).map(k => ({ name: k, value: statusCounts[k] }));
  const COLORS = ['#0f766e', '#14b8a6', '#f59e0b', '#ef4444', '#6366f1'];

  const promoted = appraisals.filter(a => (a.promotability_status || '').toLowerCase().includes('promot'));
  const needsImprovement = appraisals.filter(a => (a.promotability_status || '').toLowerCase().includes('improv') || (a.promotability_status || '').toLowerCase().includes('pip'));
  const satisfactory = appraisals.filter(a => !promoted.includes(a) && !needsImprovement.includes(a));

  const barData = [
    { name: 'Promotion', count: promoted.length },
    { name: 'Satisfactory', count: satisfactory.length },
    { name: 'Needs Improvement', count: needsImprovement.length },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-4">
        <SectionHeader title="Promotability & Recommendation" subtitle="Recommend tenure, promotion, or discontinuation" />
        <button onClick={() => exportToCSV(appraisals, 'promotability_report')} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><Download size={16} /> Export CSV</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Card className="gradient-bg text-white border-none shadow-lg shadow-teal-green/20">
          <div className="flex items-center gap-3 mb-2"><TrendingUp size={20} /><h3 className="text-xs font-bold uppercase tracking-widest opacity-80">Recommended for Promotion</h3></div>
          <p className="text-4xl font-bold">{promoted.length}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-3 mb-2"><CheckCircle size={20} className="text-emerald-500" /><h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Satisfactory</h3></div>
          <p className="text-4xl font-bold text-slate-800 dark:text-slate-100">{satisfactory.length}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-3 mb-2"><AlertTriangle size={20} className="text-amber-500" /><h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Needs Improvement</h3></div>
          <p className="text-4xl font-bold text-slate-800 dark:text-slate-100">{needsImprovement.length}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Card>
          <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">Recommendation Breakdown</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                {pieData.map((_e, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
              </Pie><Tooltip /></PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 mt-2 justify-center">
            {pieData.map((d, i) => (
              <span key={d.name} className="flex items-center gap-1 text-[10px] font-bold text-slate-500"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></span>{d.name} ({d.value})</span>
            ))}
          </div>
        </Card>
        <div className="md:col-span-2">
          <Card>
            <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">Status Distribution</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#0f766e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">All Appraisal Records</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-slate-100 dark:border-slate-800">
              <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase">Employee</th>
              <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase">Knowledge</th>
              <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase">Prod.</th>
              <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase">Attend.</th>
              <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase">Overall</th>
              <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase">Recommendation</th>
              <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase">Date</th>
            </tr></thead>
            <tbody>
              {appraisals.map(a => (
                <tr key={a.id} className="border-b border-slate-50 dark:border-slate-800/50">
                  <td className="py-3 font-medium text-slate-700 dark:text-slate-200">{a.employee_name || `#${a.employee_id}`}</td>
                  <td className="py-3 text-slate-600 dark:text-slate-300">{a.job_knowledge}/5</td>
                  <td className="py-3 text-slate-600 dark:text-slate-300">{a.productivity}/5</td>
                  <td className="py-3 text-slate-600 dark:text-slate-300">{a.attendance}/5</td>
                  <td className="py-3 font-bold text-teal-green">{a.overall}</td>
                  <td className="py-3">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                      (a.promotability_status || '').toLowerCase().includes('promot') ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
                      (a.promotability_status || '').toLowerCase().includes('improv') || (a.promotability_status || '').toLowerCase().includes('pip') ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                      'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}>{a.promotability_status}</span>
                  </td>
                  <td className="py-3 text-xs text-slate-500">{a.sign_off_date || 'N/A'}</td>
                </tr>
              ))}
              {appraisals.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-slate-400">No appraisal data available. Submit evaluations from the Evaluation Portal.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </motion.div>
  );
};
