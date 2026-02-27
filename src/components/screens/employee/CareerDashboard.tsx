import React from 'react';
import { motion } from 'motion/react';
import { FileText, MessageSquare } from 'lucide-react';
import { Employee } from '../../../types';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

interface CareerDashboardProps {
  employee: Employee | null;
  onNavigate: (screen: string) => void;
}

export const CareerDashboard = ({ employee, onNavigate }: CareerDashboardProps) => {
  if (!employee) return <div>Loading your profile...</div>;

  const performanceData = [
    { period: 'Q1 2023', score: 3.8 },
    { period: 'Q2 2023', score: 3.9 },
    { period: 'Q3 2023', score: 4.0 },
    { period: 'Q4 2023', score: 4.1 },
    { period: 'Q1 2024', score: 4.2 },
  ];

  const radarData = [
    { subject: 'Job Knowledge', Self: 4, Manager: 4.5, Peer: 4.2 },
    { subject: 'Work Quality', Self: 4, Manager: 4.0, Peer: 4.5 },
    { subject: 'Attendance', Self: 5, Manager: 4.8, Peer: 4.9 },
    { subject: 'Productivity', Self: 4, Manager: 3.8, Peer: 4.0 },
    { subject: 'Communication', Self: 3, Manager: 3.5, Peer: 3.8 },
    { subject: 'Dependability', Self: 4, Manager: 4.5, Peer: 4.6 },
  ];

  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
      <SectionHeader title={`Welcome back, ${employee.name}`} subtitle="Your career progress at a glance" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Card className="gradient-bg text-white border-none shadow-lg shadow-teal-green/20">
          <h3 className="text-[10px] font-bold uppercase opacity-80 mb-2 tracking-widest">Latest Rating</h3>
          <div className="text-4xl font-bold">4.2<span className="text-lg opacity-60">/5.0</span></div>
          <p className="text-[10px] mt-4 bg-white/20 w-fit px-2 py-1 rounded font-bold uppercase tracking-wider">Next Review: July 2026</p>
        </Card>
        <Card>
          <h3 className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-300 mb-4 tracking-widest">Goal Progress</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-600 dark:text-slate-300 font-medium">Project Delivery</span>
                <span className="font-bold text-teal-green">80%</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-teal-green h-full w-[80%] shadow-[0_0_10px_rgba(31,175,142,0.3)]"></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-600 dark:text-slate-300 font-medium">Skill Acquisition</span>
                <span className="font-bold text-teal-green">45%</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-teal-green h-full w-[45%] shadow-[0_0_10px_rgba(31,175,142,0.3)]"></div>
              </div>
            </div>
          </div>
        </Card>
        <Card>
          <h3 className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-300 mb-4 tracking-widest">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => onNavigate('C2')} className="p-3 bg-white dark:bg-black hover:bg-teal-green/10 hover:text-teal-deep rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex flex-col items-center gap-2 text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-800">
              <FileText size={16} /> Self-Assess
            </button>
            <button onClick={() => onNavigate('C3')} className="p-3 bg-white dark:bg-black hover:bg-teal-green/10 hover:text-teal-deep rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex flex-col items-center gap-2 text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-800">
              <MessageSquare size={16} /> Feedback
            </button>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-300 uppercase mb-4">Performance Trend</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--chart-tick)' }} />
                <YAxis domain={[0, 5]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--chart-tick)' }} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--system-bg-color)', borderColor: 'var(--border-color)', borderRadius: '8px' }} />
                <Line type="monotone" dataKey="score" stroke="#0f766e" strokeWidth={3} dot={{ r: 4, fill: '#0f766e', strokeWidth: 2, stroke: 'var(--chart-grid)' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-300 uppercase mb-4">Finalized 360-Degree Feedback</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                <PolarGrid stroke="var(--chart-grid)" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} />
                <PolarRadiusAxis angle={30} domain={[0, 5]} tick={false} />
                <Radar name="Self" dataKey="Self" stroke="#cbd5e1" fill="#cbd5e1" fillOpacity={0.1} />
                <Radar name="Manager" dataKey="Manager" stroke="#0f766e" fill="#14b8a6" fillOpacity={0.3} />
                <Radar name="Peer" dataKey="Peer" stroke="#f59e0b" fill="#fbbf24" fillOpacity={0.3} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-300 text-center mt-2 italic">This chart is finalized and signed by your manager.</p>
        </Card>
      </div>
    </motion.div>
  );
};
