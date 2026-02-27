import React from 'react';
import { motion } from 'motion/react';
import { Target } from 'lucide-react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';

export const IDP = () => {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <SectionHeader title="Individual Development Plan (IDP)" subtitle="Identified skill gaps and steps for career growth" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <h3 className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-4 tracking-widest">Identified Skill Gaps</h3>
          <ul className="space-y-2">
            {['Advanced React Patterns', 'System Design', 'Public Speaking'].map(skill => (
              <li key={skill} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <div className="w-1.5 h-1.5 bg-teal-green rounded-full shadow-[0_0_5px_rgba(31,175,142,0.3)]"></div>
                {skill}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h3 className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-4 tracking-widest">Growth Steps</h3>
          <div className="space-y-3">
            <div className="p-3 bg-teal-green/10 dark:bg-teal-green/20 border border-teal-green/20 dark:border-teal-green/30 rounded-lg">
              <p className="text-[10px] font-bold text-teal-green uppercase tracking-wider">Step 1</p>
              <p className="text-sm text-slate-800 dark:text-slate-100 font-medium">Enroll in System Design Course</p>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-lg">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Step 2</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Lead a technical workshop</p>
            </div>
          </div>
        </Card>
      </div>
    </motion.div>
  );
};
