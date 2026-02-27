import React, { useState } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, MessageSquare, Plus, X } from 'lucide-react';
import { Employee } from '../../../types';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';

interface CoachingJournalProps {
  employees: Employee[];
}

export const CoachingJournal = ({ employees }: CoachingJournalProps) => {
  const [showForm, setShowForm] = useState(false);

  const allLogs = employees.flatMap(e => (e.logs || []).map(l => ({ ...l, empName: e.name })))
    .sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-4">
        <SectionHeader title="Monitoring & Coaching Journal" subtitle="Daily observations and feedback loop" />
        <button 
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-teal-deep text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-teal-green transition-colors"
        >
          {showForm ? <><X size={16} /> Close Form</> : <><Plus size={16} /> Add Entry</>}
        </button>
      </div>

      {showForm && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4">
          <Card>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 border-b dark:border-slate-800 pb-2">New Coaching Journal Entry</h3>
            <form className="space-y-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employee</label>
                  <select className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100">
                    <option value="">Select Employee...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Date</label>
                  <input type="date" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Category</label>
                  <select className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100">
                    <option value="achievement">Achievement / Positive Behavior</option>
                    <option value="intervention">Intervention / Area for Improvement</option>
                    <option value="coaching">Coaching Session</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Type</label>
                  <div className="flex gap-4 mt-2 dark:text-slate-300">
                    <label className="flex items-center gap-2 text-sm"><input type="radio" name="type" value="positive" defaultChecked /> Positive</label>
                    <label className="flex items-center gap-2 text-sm"><input type="radio" name="type" value="constructive" /> Constructive</label>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t dark:border-slate-800">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Observation / Notes</label>
                <textarea rows={4} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="Describe the specific behavior or event..."></textarea>
              </div>

              <div className="pt-4 border-t dark:border-slate-800">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Action Plan / Next Steps</label>
                <textarea rows={2} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="What are the agreed upon next steps?"></textarea>
              </div>

              <div className="flex justify-end pt-4">
                <button type="button" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green">
                  Save Entry
                </button>
              </div>
            </form>
          </Card>
        </motion.div>
      )}

      <Card>
        <div className="space-y-6">
          {allLogs.map((l: any) => (
            <div key={l.id} className="flex gap-4 relative">
              <div className="flex flex-col items-center">
                <div className={`p-2 rounded-full ${l.is_positive ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'}`}>
                  {l.is_positive ? <TrendingUp size={16} /> : <MessageSquare size={16} />}
                </div>
                <div className="w-px h-full bg-slate-100 dark:bg-slate-800 mt-2"></div>
              </div>
              <div className="pb-6">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-slate-800 dark:text-slate-100">{l.empName}</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">{new Date(l.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-xs font-bold text-teal-green uppercase tracking-widest mb-1">{l.category}</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">{l.notes}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 italic">Logged by: {l.logged_by}</p>
              </div>
            </div>
          ))}
          {allLogs.length === 0 && <p className="text-center text-slate-400 py-10">No coaching logs found.</p>}
        </div>
      </Card>
    </motion.div>
  );
};
