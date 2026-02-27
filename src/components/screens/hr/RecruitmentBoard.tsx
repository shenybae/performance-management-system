import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { Plus, X, Users, FileText } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export const RecruitmentBoard = () => {
  const [activeForm, setActiveForm] = useState<'none' | 'requisition' | 'appraisal'>('none');

  const applicants = [
    { name: 'Alice Johnson', position: 'Senior Designer', score: 4.8, status: 'Shortlisted' },
    { name: 'Charlie Brown', position: 'Backend Engineer', score: 3.9, status: 'Interviewing' },
    { name: 'Diana Prince', position: 'Product Manager', score: 4.5, status: 'Offer Sent' },
    { name: 'Evan Wright', position: 'Frontend Developer', score: 4.2, status: 'Interviewing' },
    { name: 'Fiona Gallagher', position: 'HR Specialist', score: 3.5, status: 'Rejected' },
  ];

  const statusCounts = applicants.reduce((acc: any, curr) => {
    acc[curr.status] = (acc[curr.status] || 0) + 1;
    return acc;
  }, {});

  const chartData = Object.keys(statusCounts).map(key => ({
    status: key,
    count: statusCounts[key]
  }));

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-4">
        <SectionHeader title="Recruitment & Hiring Board" subtitle="Track applicants and pre-employment appraisals" />
        <div className="flex gap-2">
          <button 
            onClick={() => setActiveForm(activeForm === 'requisition' ? 'none' : 'requisition')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeForm === 'requisition' ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300' : 'bg-teal-deep text-white hover:bg-teal-green'}`}
          >
            {activeForm === 'requisition' ? <><X size={16} /> Close</> : <><FileText size={16} /> Staff Requisition</>}
          </button>
          <button 
            onClick={() => setActiveForm(activeForm === 'appraisal' ? 'none' : 'appraisal')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeForm === 'appraisal' ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300' : 'bg-teal-green text-white hover:bg-teal-deep'}`}
          >
            {activeForm === 'appraisal' ? <><X size={16} /> Close</> : <><Users size={16} /> Applicant Appraisal</>}
          </button>
        </div>
      </div>

      {activeForm === 'requisition' && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4">
          <Card>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 border-b dark:border-slate-800 pb-2">Staff Requisition Form</h3>
            <form className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Job Title</label>
                  <input type="text" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="e.g. Office Coordinator I" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Department/Office</label>
                  <input type="text" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Supervisor</label>
                  <input type="text" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Hiring Contact</label>
                  <input type="text" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 pt-4 border-t dark:border-slate-800">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Position Status</label>
                  <div className="space-y-2 text-sm dark:text-slate-300">
                    <label className="flex items-center gap-2"><input type="radio" name="status" /> Full-time Regular</label>
                    <label className="flex items-center gap-2"><input type="radio" name="status" /> Part-Time Regular</label>
                    <label className="flex items-center gap-2"><input type="radio" name="status" /> Temporary</label>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Months per year</label>
                    <input type="number" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Hours per week</label>
                    <input type="number" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Desired start date</label>
                    <input type="date" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t dark:border-slate-800 space-y-3">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Type of Position</label>
                <div className="flex items-start gap-2">
                  <input type="radio" name="type" className="mt-1" />
                  <div className="flex-1">
                    <span className="text-sm font-bold dark:text-slate-200">New:</span>
                    <input type="text" placeholder="Why is this position needed?" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm mt-1 dark:text-slate-100" />
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <input type="radio" name="type" className="mt-1" />
                  <div className="flex-1">
                    <span className="text-sm font-bold dark:text-slate-200">Replacement:</span>
                    <input type="text" placeholder="Person who is leaving" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm mt-1 dark:text-slate-100" />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button type="button" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green">
                  Submit Requisition
                </button>
              </div>
            </form>
          </Card>
        </motion.div>
      )}

      {activeForm === 'appraisal' && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4">
          <Card>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 border-b dark:border-slate-800 pb-2">Applicant Appraisal Form</h3>
            <form className="space-y-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Applicant Name</label>
                  <input type="text" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Position Applied For</label>
                  <input type="text" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t dark:border-slate-800">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">1. Impression of job skills and knowledge</label>
                  <textarea rows={2} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100"></textarea>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">2. Valuable asset to company? Explain.</label>
                  <textarea rows={2} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100"></textarea>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">3. Communication skills</label>
                  <textarea rows={2} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100"></textarea>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">4. Ability to work with department/team</label>
                  <textarea rows={2} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100"></textarea>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">5. Overall Rating (1-5)</label>
                  <div className="flex gap-4 dark:text-slate-300">
                    {[1, 2, 3, 4, 5].map(num => (
                      <label key={num} className="flex items-center gap-1">
                        <input type="radio" name="rating" value={num} /> {num}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button type="button" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green">
                  Save Appraisal
                </button>
              </div>
            </form>
          </Card>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="md:col-span-2">
          <Card>
            <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">Applicant Pipeline</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="status" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="count" fill="#0f766e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
        <div className="md:col-span-1">
          <Card>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">Recent Applicants</h3>
            <div className="space-y-4 overflow-y-auto h-64 pr-2 custom-scrollbar">
              {applicants.map((app, i) => (
                <div key={i} className="p-3 border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-bold text-slate-700 dark:text-slate-200 text-sm">{app.name}</span>
                    <span className="text-[10px] font-bold text-teal-green">{app.score}/5.0</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{app.position}</p>
                  <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 mt-1">{app.status}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </motion.div>
  );
};
