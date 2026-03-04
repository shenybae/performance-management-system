import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Search, ChevronRight } from 'lucide-react';
import { Employee } from '../../../types';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';

interface EmployeeDirectoryProps {
  employees: Employee[];
  onSelectEmployee: (id: number) => void;
  onCreateEmployee?: () => void;
}

export const EmployeeDirectory = ({ employees, onSelectEmployee }: EmployeeDirectoryProps) => {
  const [search, setSearch] = useState('');

  const filtered = employees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.position?.toLowerCase().includes(search.toLowerCase()) ||
    e.dept?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <SectionHeader title="Employee Master Directory" subtitle="View personnel records and status" />

      <Card>
        <div className="flex justify-between mb-4">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input 
              type="text" 
              placeholder="Search employees..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-green/50 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Name</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Position</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Department</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Status</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(emp => (
                <tr 
                  key={emp.id} 
                  className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors cursor-pointer group" 
                  onClick={() => onSelectEmployee(emp.id)}
                >
                  <td className="py-4 px-4 font-medium text-slate-700 dark:text-slate-100 group-hover:text-teal-deep dark:group-hover:text-teal-green">{emp.name}</td>
                  <td className="py-4 px-4 text-slate-600 dark:text-slate-200">{emp.position}</td>
                  <td className="py-4 px-4 text-slate-600 dark:text-slate-200">{emp.dept}</td>
                  <td className="py-4 px-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                      emp.status === 'Permanent' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                    }`}>
                      {emp.status}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <div className="flex justify-end">
                      <ChevronRight size={16} className="text-slate-400 group-hover:text-teal-deep dark:group-hover:text-teal-green" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </motion.div>
  );
};
