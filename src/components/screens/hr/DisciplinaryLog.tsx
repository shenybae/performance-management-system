import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ShieldAlert, Plus, X } from 'lucide-react';
import { Employee } from '../../../types';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

interface DisciplinaryLogProps {
  employees: Employee[];
}

export const DisciplinaryLog = ({ employees }: DisciplinaryLogProps) => {
  const [showForm, setShowForm] = useState(false);
  const allRecords = employees.flatMap(e => (e.discipline || []).map(d => ({ ...d, empName: e.name })));

  const violationTypes = allRecords.reduce((acc: any, curr: any) => {
    acc[curr.violation_type] = (acc[curr.violation_type] || 0) + 1;
    return acc;
  }, {});

  const pieData = Object.keys(violationTypes).map(key => ({
    name: key,
    value: violationTypes[key]
  }));

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#ef4444'];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-4">
        <SectionHeader title="Disciplinary & Warning Log" subtitle="Track behavioral issues and corrective actions" />
        <button 
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-teal-deep text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-teal-green transition-colors"
        >
          {showForm ? <><X size={16} /> Close Form</> : <><Plus size={16} /> New Action Form</>}
        </button>
      </div>

      {showForm && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4">
          <Card>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 border-b dark:border-slate-800 pb-2">Employee Disciplinary Action Form</h3>
            <form className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employee Name</label>
                  <select className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100">
                    <option value="">Select Employee...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Date of Warning</label>
                  <input type="date" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Department</label>
                  <input type="text" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Supervisor</label>
                  <input type="text" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t dark:border-slate-800">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Type of Violation</label>
                  <div className="grid grid-cols-2 gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <label className="flex items-center gap-2"><input type="checkbox" /> Attendance</label>
                    <label className="flex items-center gap-2"><input type="checkbox" /> Carelessness</label>
                    <label className="flex items-center gap-2"><input type="checkbox" /> Disobedience</label>
                    <label className="flex items-center gap-2"><input type="checkbox" /> Safety</label>
                    <label className="flex items-center gap-2"><input type="checkbox" /> Tardiness</label>
                    <label className="flex items-center gap-2"><input type="checkbox" /> Work Quality</label>
                    <label className="flex items-center gap-2"><input type="checkbox" /> Other</label>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Violation Date</label>
                    <input type="date" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Violation Time</label>
                    <input type="time" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Place Violation Occurred</label>
                    <input type="text" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100" />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t dark:border-slate-800">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employer Statement</label>
                <textarea rows={3} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100"></textarea>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employee Statement</label>
                <textarea rows={3} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100"></textarea>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Warning Decision</label>
                <textarea rows={2} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100"></textarea>
              </div>

              <div className="flex justify-end pt-4">
                <button type="button" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green">
                  Save Disciplinary Action
                </button>
              </div>
            </form>
          </Card>
        </motion.div>
      )}

      {allRecords.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <Card>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">Violations by Type</h3>
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
          <Card>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">Recent Actions</h3>
            <div className="space-y-4 overflow-y-auto h-64 pr-2 custom-scrollbar">
              {allRecords.slice(0, 5).map((d: any) => (
                <div key={d.id} className="p-3 border border-slate-100 dark:border-slate-800 bg-white dark:bg-black rounded-lg">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-bold text-slate-700 dark:text-slate-200 text-sm">{d.empName}</span>
                    <span className="text-[10px] bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded uppercase font-bold">{d.warning_level}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{d.violation_type}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <Card>
        <div className="space-y-4">
          {allRecords.map((d: any) => (
            <div key={d.id} className="p-4 border border-red-100 dark:border-red-900/30 bg-red-50 dark:bg-red-900/10 rounded-xl flex gap-4">
              <div className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-3 rounded-full h-fit">
                <ShieldAlert size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-slate-800 dark:text-slate-100">{d.empName}</span>
                  <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded uppercase font-bold tracking-wider">{d.warning_level} Warning</span>
                </div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{d.violation_type}</p>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 italic">"{d.employer_statement}"</p>
                <div className="mt-3 flex gap-2">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Action Taken:</span>
                  <span className="text-[10px] font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest">{d.action_taken}</span>
                </div>
              </div>
            </div>
          ))}
          {allRecords.length === 0 && <p className="text-center text-slate-400 py-10">No disciplinary records found.</p>}
        </div>
      </Card>
    </motion.div>
  );
};
