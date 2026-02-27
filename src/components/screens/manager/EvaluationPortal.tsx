import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Employee } from '../../../types';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { Plus, X, Star, FileText } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';

interface EvaluationPortalProps {
  employees: Employee[];
}

export const EvaluationPortal = ({ employees }: EvaluationPortalProps) => {
  const [activeForm, setActiveForm] = useState<'none' | 'achievement' | 'performance'>('none');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const radarData = [
    { subject: 'Job Knowledge', A: 4.2, fullMark: 5 },
    { subject: 'Work Quality', A: 3.8, fullMark: 5 },
    { subject: 'Attendance', A: 4.5, fullMark: 5 },
    { subject: 'Productivity', A: 4.0, fullMark: 5 },
    { subject: 'Communication', A: 3.5, fullMark: 5 },
    { subject: 'Dependability', A: 4.8, fullMark: 5 },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-6">
        <SectionHeader title="Evaluation Portal" subtitle="Formal performance appraisal forms" />
        <div className="flex gap-2">
          <button 
            onClick={() => setActiveForm(activeForm === 'achievement' ? 'none' : 'achievement')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeForm === 'achievement' ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300' : 'bg-teal-deep text-white hover:bg-teal-green'}`}
          >
            {activeForm === 'achievement' ? <><X size={16} /> Close</> : <><Star size={16} /> Achievement Measure</>}
          </button>
          <button 
            onClick={() => setActiveForm(activeForm === 'performance' ? 'none' : 'performance')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeForm === 'performance' ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300' : 'bg-teal-green text-white hover:bg-teal-deep'}`}
          >
            {activeForm === 'performance' ? <><X size={16} /> Close</> : <><FileText size={16} /> Performance Evaluation</>}
          </button>
        </div>
      </div>

      {activeForm === 'achievement' && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-8">
          <Card>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 border-b dark:border-slate-800 pb-2">Employee Achievement Measure System</h3>
            <form className="space-y-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-300 uppercase mb-1">Employee Name</label>
                  <select className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100">
                    <option value="">Select Employee...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-300 uppercase mb-1">Review Period</label>
                  <input type="text" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" placeholder="e.g. Q1 2024" />
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                <table className="w-full text-left text-sm">
                  <thead className="bg-white dark:bg-black border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-2 font-bold text-slate-500 dark:text-slate-300 uppercase text-[10px] w-1/3">Category</th>
                      <th className="p-2 font-bold text-slate-500 dark:text-slate-300 uppercase text-[10px] text-center">1 (Poor)</th>
                      <th className="p-2 font-bold text-slate-500 dark:text-slate-300 uppercase text-[10px] text-center">2 (Fair)</th>
                      <th className="p-2 font-bold text-slate-500 dark:text-slate-300 uppercase text-[10px] text-center">3 (Sat.)</th>
                      <th className="p-2 font-bold text-slate-500 dark:text-slate-300 uppercase text-[10px] text-center">4 (Good)</th>
                      <th className="p-2 font-bold text-slate-500 dark:text-slate-300 uppercase text-[10px] text-center">5 (Exc.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {['Job Knowledge', 'Work Quality', 'Attendance/Punctuality', 'Productivity', 'Communication/Listening', 'Dependability'].map((cat, i) => (
                      <React.Fragment key={i}>
                        <tr className="border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-black">
                          <td className="p-2 font-bold text-slate-700 dark:text-slate-200">{cat}</td>
                          {[1, 2, 3, 4, 5].map(num => (
                            <td key={num} className="p-2 text-center"><input type="radio" name={`cat-${i}`} value={num} /></td>
                          ))}
                        </tr>
                        <tr className="border-b border-slate-200 dark:border-slate-700">
                          <td colSpan={6} className="p-2">
                            <input type="text" className="w-full p-1 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded text-xs text-slate-900 dark:text-slate-100" placeholder="Comments..." />
                          </td>
                        </tr>
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pt-4 border-t dark:border-slate-800">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Additional Comments</label>
                <textarea rows={2} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100"></textarea>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employee Goals</label>
                <textarea rows={2} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100"></textarea>
              </div>

              <div className="flex justify-end pt-4">
                <button type="button" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green">
                  Save Achievement Measure
                </button>
              </div>
            </form>
          </Card>
        </motion.div>
      )}

      {activeForm === 'performance' && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left Column: Comparison View */}
            <div className="space-y-4">
              <Card className="bg-white dark:bg-black border-slate-200 dark:border-slate-700 p-4">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3 border-b dark:border-slate-700 pb-2 flex items-center gap-2">
                  <Star size={16} className="text-teal-green" /> 360-Degree Feedback Summary
                </h3>
                <div className="h-40 mb-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={[
                      { subject: 'Job Knowledge', Self: 4, Manager: 4.5, Peer: 4.2 },
                      { subject: 'Work Quality', Self: 4, Manager: 4.0, Peer: 4.5 },
                      { subject: 'Attendance', Self: 5, Manager: 4.8, Peer: 4.9 },
                      { subject: 'Productivity', Self: 4, Manager: 3.8, Peer: 4.0 },
                      { subject: 'Communication', Self: 3, Manager: 3.5, Peer: 3.8 },
                      { subject: 'Dependability', Self: 4, Manager: 4.5, Peer: 4.6 },
                    ]}>
                      <PolarGrid stroke="var(--chart-grid)" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 5]} tick={false} />
                      <Radar name="Manager" dataKey="Manager" stroke="#0f766e" fill="#14b8a6" fillOpacity={0.3} />
                      <Radar name="Peer/Subordinate" dataKey="Peer" stroke="#f59e0b" fill="#fbbf24" fillOpacity={0.3} />
                      <Tooltip contentStyle={{ backgroundColor: 'var(--system-bg-color)', borderColor: 'var(--border-color)' }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  <div className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Peer Feedback</p>
                    <p className="text-xs text-slate-700 dark:text-slate-300 italic">"Great team player, always willing to help out with complex tasks."</p>
                  </div>
                  <div className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Subordinate Feedback</p>
                    <p className="text-xs text-slate-700 dark:text-slate-300 italic">"Provides clear direction but could improve on regular check-ins."</p>
                  </div>
                </div>
              </Card>

              <Card className="bg-white dark:bg-black border-slate-200 dark:border-slate-700">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-4 border-b dark:border-slate-700 pb-2 flex items-center gap-2">
                  <FileText size={16} className="text-teal-green" /> Monitoring & Coaching Journal Entries
                </h3>
                <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                  <div className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mar 15, 2024</span>
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded uppercase tracking-wider">Achievement</span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300">Successfully delivered the Q1 project ahead of schedule.</p>
                  </div>
                  <div className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Feb 02, 2024</span>
                      <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded uppercase tracking-wider">Intervention</span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300">Discussed communication gaps during team meetings. Agreed on a new update format.</p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Right Column: Evaluation Form */}
            <Card>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 border-b dark:border-slate-800 pb-2">Employee Performance Evaluation Form</h3>
              <form className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employee Name</label>
                    <select className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100">
                      <option value="">Select Employee...</option>
                      {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Evaluation Period</label>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 font-bold w-10 shrink-0">FROM:</span>
                        <input type="date" className="w-full p-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 font-bold w-10 shrink-0">TO:</span>
                        <input type="date" className="w-full p-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t dark:border-slate-800 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                  {[
                    { title: '1. PRODUCTIVITY', desc: 'Quality and Quantity of Work' },
                    { title: '2. RELATIONSHIP WITH OTHERS', desc: 'Effectiveness in working with supervisors, fellow employees' },
                    { title: '3. WORK HABITS', desc: 'Attitude toward work, safe and effective use of resources' },
                    { title: '4. JOB KNOWLEDGE', desc: 'Basic knowledge of job; familiarity with other departmental functions' },
                    { title: '5. ATTENDANCE AND PUNCTUALITY', desc: 'Frequency and number of absences and lateness' }
                  ].map((section, i) => (
                    <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                      <p className="font-bold text-slate-800 dark:text-slate-100 text-sm mb-1">{section.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-300 mb-3">{section.desc}</p>
                      <div className="flex flex-col gap-2 text-xs mb-3 text-slate-600 dark:text-slate-200">
                        <label className="flex items-start gap-2"><input type="radio" name={`sec-${i}`} className="mt-0.5" /> Does not meet minimum standards</label>
                        <label className="flex items-start gap-2"><input type="radio" name={`sec-${i}`} className="mt-0.5" /> Needs improvement</label>
                        <label className="flex items-start gap-2"><input type="radio" name={`sec-${i}`} className="mt-0.5" /> Generally acceptable</label>
                        <label className="flex items-start gap-2"><input type="radio" name={`sec-${i}`} className="mt-0.5" /> Consistently high quality</label>
                      </div>
                      <input type="text" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-xs text-slate-900 dark:text-slate-100" placeholder="Manager Comments..." />
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t dark:border-slate-800">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-300 uppercase mb-2">Overall Rating & Recommendation</label>
                  <div className="flex gap-4 text-sm mb-4 text-slate-600 dark:text-slate-200">
                    <label className="flex items-center gap-2"><input type="radio" name="overall" /> Satisfactory</label>
                    <label className="flex items-center gap-2"><input type="radio" name="overall" /> Unsatisfactory</label>
                  </div>
                  <div className="space-y-2 text-slate-600 dark:text-slate-200">
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" /> Continued employment</label>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" /> Recommend for Promotion (Promotability)</label>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" /> Require Performance Improvement Plan (PIP)</label>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t dark:border-slate-800">
                  <button type="button" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green">
                    Submit & Sign Evaluation
                  </button>
                </div>
              </form>
            </Card>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="md:col-span-1">
          <Card className="p-4">
            <h3 className="text-sm font-bold text-slate-500 uppercase mb-3">Team Performance Average</h3>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                  <PolarGrid stroke="var(--chart-grid)" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 5]} tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} />
                  <Radar name="Team Average" dataKey="A" stroke="#0f766e" fill="#14b8a6" fillOpacity={0.5} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
        <div className="md:col-span-2">
          <Card>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-300 uppercase mb-4">Direct Reports</h3>
            <motion.div 
              initial="hidden"
              animate="visible"
              variants={{
                visible: { transition: { staggerChildren: 0.05 } }
              }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              {employees.map(emp => (
                  <motion.div 
                    key={emp.id} 
                    variants={{
                      hidden: { opacity: 0, scale: 0.95 },
                      visible: { opacity: 1, scale: 1 }
                    }}
                    className="p-4 border border-slate-100 dark:border-slate-800 bg-white dark:bg-black rounded-xl hover:border-teal-green/30 transition-colors cursor-pointer group"
                  >
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-slate-800 dark:text-slate-100 group-hover:text-teal-deep dark:group-hover:text-teal-green transition-colors">{emp.name}</h3>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">{emp.position}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Last Review</p>
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Q4 2023</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </Card>
        </div>
      </div>
    </motion.div>
  );
};
