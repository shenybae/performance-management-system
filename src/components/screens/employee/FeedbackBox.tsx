import React, { useState } from 'react';
import { motion } from 'motion/react';
import { MessageSquare, Plus, X, Users } from 'lucide-react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export const FeedbackBox = () => {
  const [activeForm, setActiveForm] = useState<'none' | 'suggestion' | 'feedback'>('none');

  const chartData = [
    { month: 'Jan', suggestions: 4 },
    { month: 'Feb', suggestions: 7 },
    { month: 'Mar', suggestions: 5 },
    { month: 'Apr', suggestions: 12 },
    { month: 'May', suggestions: 8 },
    { month: 'Jun', suggestions: 15 },
  ];

  const recentSuggestions = [
    { title: 'Improve cafeteria menu', status: 'Under Review', date: 'Jun 12, 2024' },
    { title: 'New software tools for dev team', status: 'Approved', date: 'Jun 05, 2024' },
    { title: 'Flexible working hours policy', status: 'Implemented', date: 'May 28, 2024' },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-4">
        <SectionHeader title="Suggestion & Feedback Box" subtitle="Submit suggestions and 360-degree feedback" />
        <div className="flex gap-2">
          <button 
            onClick={() => setActiveForm(activeForm === 'suggestion' ? 'none' : 'suggestion')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeForm === 'suggestion' ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300' : 'bg-teal-deep text-white hover:bg-teal-green'}`}
          >
            {activeForm === 'suggestion' ? <><X size={16} /> Close Form</> : <><Plus size={16} /> New Suggestion</>}
          </button>
          <button 
            onClick={() => setActiveForm(activeForm === 'feedback' ? 'none' : 'feedback')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeForm === 'feedback' ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300' : 'bg-teal-green text-white hover:bg-teal-deep'}`}
          >
            {activeForm === 'feedback' ? <><X size={16} /> Close Form</> : <><Users size={16} /> 360 Feedback</>}
          </button>
        </div>
      </div>

      {activeForm === 'suggestion' && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4">
          <Card>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 border-b dark:border-slate-800 pb-2">Employee Suggestion Form</h3>
            <form className="space-y-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employee Name</label>
                  <input type="text" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Date</label>
                  <input type="date" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Position/Title</label>
                  <input type="text" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Dept</label>
                  <input type="text" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                </div>
              </div>

              <div className="pt-4 border-t dark:border-slate-800">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Concern / Suggestion</label>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-2">Please state the nature of your suggestion, including how it improves your job, the job of others, value to the customers, etc.</p>
                <textarea rows={3} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100"></textarea>
              </div>

              <div className="pt-4 border-t dark:border-slate-800">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Resources Needed</label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">Labor Needed:</label>
                    <input type="text" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">Materials Needed:</label>
                    <input type="text" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">Equipment Needed:</label>
                    <input type="text" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">Capital (Money) Needed:</label>
                    <input type="text" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">Total Estimated Cost to Address Concern:</label>
                  <input type="text" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                </div>
              </div>

              <div className="pt-4 border-t dark:border-slate-800">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Desired Benefit</label>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-2">Please explain the anticipated total benefit to the company.</p>
                <textarea rows={2} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100 mb-4"></textarea>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">Total Estimated Financial Benefit to Company:</label>
                  <input type="text" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                </div>
              </div>

              <div className="pt-4 border-t dark:border-slate-800">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Planning</label>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-2">Please outline the steps needed to accomplish the suggestion.</p>
                <div className="space-y-2 mb-4">
                  <div className="flex gap-2"><span className="text-sm font-bold text-slate-400 dark:text-slate-500">1.</span><input type="text" className="w-full p-1 border-b border-slate-200 dark:border-slate-700 bg-transparent text-sm outline-none dark:text-slate-100" /></div>
                  <div className="flex gap-2"><span className="text-sm font-bold text-slate-400 dark:text-slate-500">2.</span><input type="text" className="w-full p-1 border-b border-slate-200 dark:border-slate-700 bg-transparent text-sm outline-none dark:text-slate-100" /></div>
                  <div className="flex gap-2"><span className="text-sm font-bold text-slate-400 dark:text-slate-500">3.</span><input type="text" className="w-full p-1 border-b border-slate-200 dark:border-slate-700 bg-transparent text-sm outline-none dark:text-slate-100" /></div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">Total Estimated Time to Completion:</label>
                  <input type="text" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button type="button" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green">
                  Submit Suggestion
                </button>
              </div>
            </form>
          </Card>
        </motion.div>
      )}

      {activeForm === 'feedback' && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4">
          <Card>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 border-b dark:border-slate-800 pb-2">360-Degree Feedback Form</h3>
            <form className="space-y-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employee Being Evaluated</label>
                  <input type="text" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="Name of colleague..." />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Your Relationship</label>
                  <select className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100">
                    <option value="">Select...</option>
                    <option value="peer">Peer / Co-worker</option>
                    <option value="subordinate">Subordinate</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t dark:border-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Please rate the employee on the following competencies (1 = Needs Improvement, 5 = Excellent).</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {['Job Knowledge', 'Work Quality', 'Attendance', 'Productivity', 'Communication', 'Dependability'].map(label => (
                    <div key={label}>
                      <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{label}</label>
                      <select className="w-full mt-1 p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-teal-green/50">
                        <option value="">Select rating...</option>
                        {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t dark:border-slate-800">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Strengths</label>
                <textarea rows={2} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="What does this person do well?"></textarea>
              </div>

              <div className="pt-4 border-t dark:border-slate-800">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Areas for Improvement</label>
                <textarea rows={2} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="Where could this person improve?"></textarea>
              </div>

              <div className="flex justify-end pt-4">
                <button type="button" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green">
                  Submit Feedback
                </button>
              </div>
            </form>
          </Card>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="md:col-span-2">
          <Card>
            <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">Suggestion Trend</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorSuggestions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0f766e" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#0f766e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Area type="monotone" dataKey="suggestions" stroke="#0f766e" strokeWidth={3} fillOpacity={1} fill="url(#colorSuggestions)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
        <div className="md:col-span-1">
          <Card>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">My Recent Suggestions</h3>
            <div className="space-y-4 overflow-y-auto h-64 pr-2 custom-scrollbar">
              {recentSuggestions.map((sugg, i) => (
                <div key={i} className="p-3 border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                  <p className="font-bold text-slate-700 dark:text-slate-200 text-sm mb-1">{sugg.title}</p>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">{sugg.date}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      sugg.status === 'Implemented' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
                      sugg.status === 'Approved' ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400' :
                      'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                    }`}>
                      {sugg.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </motion.div>
  );
};
