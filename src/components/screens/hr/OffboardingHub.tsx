import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { Plus, X, Box, LogOut } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

export const OffboardingHub = () => {
  const [activeForm, setActiveForm] = useState<'none' | 'property' | 'exit'>('none');

  const offboardingData = [
    { name: 'Sarah Miller', lastDay: 'March 15, 2024', clearance: 'Completed', reason: 'Resignation' },
    { name: 'James Wilson', lastDay: 'April 02, 2024', clearance: 'Pending', reason: 'Relocation' },
    { name: 'Emily Chen', lastDay: 'April 10, 2024', clearance: 'Pending', reason: 'Better Opportunity' },
  ];

  const reasonCounts = offboardingData.reduce((acc: any, curr) => {
    acc[curr.reason] = (acc[curr.reason] || 0) + 1;
    return acc;
  }, {});

  const pieData = Object.keys(reasonCounts).map(key => ({
    name: key,
    value: reasonCounts[key]
  }));

  const COLORS = ['#0f766e', '#14b8a6', '#f59e0b', '#ef4444'];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-4">
        <SectionHeader title="Offboarding & Exit Hub" subtitle="Process final clearances and exit interviews" />
        <div className="flex gap-2">
          <button 
            onClick={() => setActiveForm(activeForm === 'property' ? 'none' : 'property')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeForm === 'property' ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300' : 'bg-teal-deep text-white hover:bg-teal-green'}`}
          >
            {activeForm === 'property' ? <><X size={16} /> Close</> : <><Box size={16} /> Property Accountability</>}
          </button>
          <button 
            onClick={() => setActiveForm(activeForm === 'exit' ? 'none' : 'exit')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeForm === 'exit' ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300' : 'bg-teal-green text-white hover:bg-teal-deep'}`}
          >
            {activeForm === 'exit' ? <><X size={16} /> Close</> : <><LogOut size={16} /> Exit Interview</>}
          </button>
        </div>
      </div>

      {activeForm === 'property' && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4">
          <Card>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 border-b dark:border-slate-800 pb-2">Property Accountability Form</h3>
            <form className="space-y-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employee Name</label>
                  <input type="text" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Date Prepared</label>
                  <input type="date" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Position / Dept.</label>
                  <input type="text" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-2 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">Property Number</th>
                      <th className="p-2 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">Asset Category</th>
                      <th className="p-2 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">Brand</th>
                      <th className="p-2 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">Description</th>
                      <th className="p-2 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">Serial No.</th>
                      <th className="p-2 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">UOM / QTY</th>
                      <th className="p-2 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3].map((row) => (
                      <tr key={row} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                        <td className="p-2"><input type="text" className="w-full border-0 bg-transparent text-sm dark:text-slate-100" placeholder="..." /></td>
                        <td className="p-2"><input type="text" className="w-full border-0 bg-transparent text-sm dark:text-slate-100" placeholder="..." /></td>
                        <td className="p-2"><input type="text" className="w-full border-0 bg-transparent text-sm dark:text-slate-100" placeholder="..." /></td>
                        <td className="p-2"><input type="text" className="w-full border-0 bg-transparent text-sm dark:text-slate-100" placeholder="..." /></td>
                        <td className="p-2"><input type="text" className="w-full border-0 bg-transparent text-sm dark:text-slate-100" placeholder="..." /></td>
                        <td className="p-2"><input type="text" className="w-full border-0 bg-transparent text-sm dark:text-slate-100" placeholder="..." /></td>
                        <td className="p-2"><input type="text" className="w-full border-0 bg-transparent text-sm dark:text-slate-100" placeholder="..." /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end pt-4">
                <button type="button" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green">
                  Save Accountability Form
                </button>
              </div>
            </form>
          </Card>
        </motion.div>
      )}

      {activeForm === 'exit' && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4">
          <Card>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 border-b dark:border-slate-800 pb-2">Employee Exit Interview Form</h3>
            <form className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employee Name</label>
                  <input type="text" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Date</label>
                  <input type="date" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Location/Department</label>
                  <input type="text" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Supervisor</label>
                  <input type="text" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                </div>
              </div>

              <div className="pt-4 border-t dark:border-slate-800">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Reasons for Leaving</label>
                <div className="grid grid-cols-2 gap-4 text-sm dark:text-slate-300">
                  <div>
                    <p className="font-bold mb-2">Resignation</p>
                    <label className="flex items-center gap-2 mb-1"><input type="checkbox" /> Took another position</label>
                    <label className="flex items-center gap-2 mb-1"><input type="checkbox" /> Pregnancy/home/family needs</label>
                    <label className="flex items-center gap-2 mb-1"><input type="checkbox" /> Poor health/physical disability</label>
                    <label className="flex items-center gap-2 mb-1"><input type="checkbox" /> Relocation to another city</label>
                  </div>
                  <div>
                    <p className="font-bold mb-2">&nbsp;</p>
                    <label className="flex items-center gap-2 mb-1"><input type="checkbox" /> Dissatisfaction with salary</label>
                    <label className="flex items-center gap-2 mb-1"><input type="checkbox" /> Dissatisfaction with type of work</label>
                    <label className="flex items-center gap-2 mb-1"><input type="checkbox" /> Dissatisfaction with supervisor</label>
                    <label className="flex items-center gap-2 mb-1"><input type="checkbox" /> Dissatisfaction with co-workers</label>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t dark:border-slate-800">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">What did you like most about your job?</label>
                <textarea rows={2} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100"></textarea>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">What did you like least about your job?</label>
                <textarea rows={2} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100"></textarea>
              </div>

              <div className="flex justify-end pt-4">
                <button type="button" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green">
                  Save Exit Interview
                </button>
              </div>
            </form>
          </Card>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="md:col-span-1">
          <Card>
            <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">Reasons for Leaving</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
        <div className="md:col-span-2">
          <Card>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">Recent Offboarding</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Employee</th>
                    <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Last Day</th>
                    <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Clearance</th>
                    <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Exit Interview</th>
                  </tr>
                </thead>
                <tbody>
                  {offboardingData.map((data, i) => (
                    <tr key={i} className="border-b border-slate-50 dark:border-slate-800/50">
                      <td className="py-4 font-medium text-slate-700 dark:text-slate-200">{data.name}</td>
                      <td className="py-4 text-sm text-slate-500 dark:text-slate-400">{data.lastDay}</td>
                      <td className="py-4">
                        <span className={`font-bold text-[10px] uppercase tracking-wider ${data.clearance === 'Completed' ? 'text-emerald-600' : 'text-amber-500'}`}>
                          {data.clearance}
                        </span>
                      </td>
                      <td className="py-4"><button className="text-teal-green text-[10px] font-bold underline uppercase tracking-wider">View Form</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </motion.div>
  );
};
