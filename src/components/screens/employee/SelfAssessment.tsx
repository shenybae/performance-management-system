import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

export const SelfAssessment = () => {
  const [scores, setScores] = useState({
    'Job Knowledge': 4,
    'Productivity': 4,
    'Attendance': 5,
    'Communication': 3,
    'Dependability': 4,
  });

  const radarData = Object.keys(scores).map(key => ({
    subject: key,
    A: scores[key as keyof typeof scores],
    fullMark: 5,
  }));

  const handleScoreChange = (key: string, value: string) => {
    setScores(prev => ({ ...prev, [key]: parseInt(value) }));
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <SectionHeader title="Self-Assessment Portal" subtitle="Provide your own evaluation and rebuttal statements" />
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Card>
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Key Achievements this Period</label>
              <textarea className="w-full p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 h-32 focus:ring-2 focus:ring-teal-green/50 outline-none" placeholder="Describe your major contributions..."></textarea>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Object.keys(scores).map(label => (
                <div key={label}>
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{label} (1-5)</label>
                  <select 
                    value={scores[label as keyof typeof scores]}
                    onChange={(e) => handleScoreChange(label, e.target.value)}
                    className="w-full mt-1 p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-teal-green/50"
                  >
                    {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <button className="w-full gradient-bg text-white py-3 rounded-xl font-bold hover:opacity-90 transition-all shadow-lg shadow-teal-green/20">Submit Self-Assessment</button>
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">My Self-Assessment Profile</h3>
          <div className="h-64 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                <PolarGrid stroke="#e2e8f0" className="dark:opacity-20" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 10 }} />
                <PolarRadiusAxis angle={30} domain={[0, 5]} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Radar name="Self Assessment" dataKey="A" stroke="#0f766e" fill="#14b8a6" fillOpacity={0.5} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </motion.div>
  );
};
