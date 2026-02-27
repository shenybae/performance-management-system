import React from 'react';
import { motion } from 'motion/react';
import { Plus } from 'lucide-react';
import { Employee } from '../../../types';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface OKRPlannerProps {
  employees: Employee[];
}

export const OKRPlanner = ({ employees }: OKRPlannerProps) => {
  const chartData = employees.map(emp => ({
    name: emp.name.split(' ')[0],
    completed: Math.floor(Math.random() * 5),
    pending: Math.floor(Math.random() * 5) + 1,
  }));

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <SectionHeader title="Target & OKR Planner" subtitle="Define success indicators and metrics" />
      
      <div className="mb-4">
        <Card>
          <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">Team OKR Progress Overview</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="completed" stackId="a" fill="#0f766e" name="Completed" radius={[0, 0, 0, 0]} />
                <Bar dataKey="pending" stackId="a" fill="#cbd5e1" name="Pending" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {employees.map(emp => (
          <Card key={emp.id}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100">{emp.name}</h3>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-bold">{emp.position}</p>
              </div>
              <button className="text-teal-green hover:bg-teal-green/10 p-1.5 rounded-lg transition-colors"><Plus size={18} /></button>
            </div>
            <div className="space-y-3">
              {emp.goals?.map(g => (
                <div key={g.id} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{g.statement}</p>
                  <div className="flex justify-between mt-2 text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 tracking-widest">
                    <span>Metric: {g.metric}</span>
                    <span>Due: {g.target_date}</span>
                  </div>
                </div>
              ))}
              {!emp.goals?.length && <p className="text-xs text-slate-400 italic">No goals defined for this period.</p>}
            </div>
          </Card>
        ))}
      </div>
    </motion.div>
  );
};
