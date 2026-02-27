import React from 'react';
import { motion } from 'motion/react';
import { Users, Package, History, ChevronRight } from 'lucide-react';
import { Employee } from '../../../types';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';

interface EmployeeJacketProps {
  employee: Employee | null;
  onBack: () => void;
}

export const EmployeeJacket = ({ employee, onBack }: EmployeeJacketProps) => {
  if (!employee) return <div>Select an employee from the directory.</div>;

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
      <div className="flex items-center gap-2 mb-4 text-slate-500 dark:text-slate-400 cursor-pointer hover:text-teal-deep transition-colors" onClick={onBack}>
        <ChevronRight className="rotate-180" size={16} /> Back to Directory
      </div>
      <SectionHeader title={`Digital 201 Jacket: ${employee.name}`} subtitle="Comprehensive employee profile and history" />
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-teal-deep dark:text-teal-green"><Users size={18} className="text-teal-green" /> Personal Profile</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wider">Position</label>
              <p className="text-slate-700 dark:text-slate-300 font-medium">{employee.position}</p>
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wider">Department</label>
              <p className="text-slate-700 dark:text-slate-300 font-medium">{employee.dept}</p>
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wider">Hire Date</label>
              <p className="text-slate-700 dark:text-slate-300 font-medium">{employee.hire_date}</p>
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wider">SSN</label>
              <p className="text-slate-700 dark:text-slate-300 font-medium">{employee.ssn}</p>
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wider">Base Salary</label>
              <p className="text-slate-700 dark:text-slate-300 font-medium">${employee.salary_base?.toLocaleString()}</p>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-teal-deep dark:text-teal-green"><Package size={18} className="text-teal-green" /> Property Accountability</h3>
          <div className="space-y-3">
            {employee.property?.length ? employee.property.map(p => (
              <div key={p.id} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{p.brand}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">SN: {p.serial_no} | Qty: {p.uom_qty}</p>
              </div>
            )) : <p className="text-sm text-slate-400 dark:text-slate-500 italic">No assets assigned.</p>}
          </div>
        </Card>

        <Card className="md:col-span-3">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-teal-deep dark:text-teal-green"><History size={18} className="text-teal-green" /> Career History & Appraisals</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="pb-2 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                  <th className="pb-2 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Overall Rating</th>
                  <th className="pb-2 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {employee.appraisals?.map(a => (
                  <tr key={a.id} className="border-b border-slate-50 dark:border-slate-800/50">
                    <td className="py-2 text-slate-600 dark:text-slate-400">{a.sign_off_date}</td>
                    <td className="py-2 font-bold text-teal-green">{a.overall}/5.0</td>
                    <td className="py-2 text-slate-600 dark:text-slate-400">{a.promotability_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </motion.div>
  );
};
