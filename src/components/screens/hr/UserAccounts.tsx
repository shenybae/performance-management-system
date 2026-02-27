import React from 'react';
import { motion } from 'motion/react';
import { Employee } from '../../../types';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';

interface UserAccountsProps {
  employees: Employee[];
  users: any[];
  onRefresh: () => void;
}

export const UserAccounts = ({ employees, users, onRefresh }: UserAccountsProps) => {
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        alert('User created successfully');
        onRefresh();
        (e.target as HTMLFormElement).reset();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to create user');
      }
    } catch (err) {
      alert('Error connecting to server');
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <SectionHeader title="User Accounts Management" subtitle="Create and manage login credentials for staff" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <h3 className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-300 mb-4 tracking-widest">Create New Account</h3>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Username</label>
              <input name="username" type="text" className="w-full mt-1 p-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-green/50" required />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Password</label>
              <input name="password" type="password" className="w-full mt-1 p-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-green/50" required />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Role</label>
              <select name="role" className="w-full mt-1 p-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-green/50" required>
                <option value="Employee">Employee</option>
                <option value="Manager">Manager</option>
                <option value="HR">HR</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Link to Employee</label>
              <select name="employee_id" className="w-full mt-1 p-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-green/50">
                <option value="">None (Admin Only)</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="w-full gradient-bg text-white py-2 rounded-lg font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-teal-green/10">Create User</button>
          </form>
        </Card>

        <Card className="lg:col-span-2">
          <h3 className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-300 mb-4 tracking-widest">Existing Accounts</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="pb-2 font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Username</th>
                  <th className="pb-2 font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Role</th>
                  <th className="pb-2 font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Linked Employee</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-slate-50 dark:border-slate-800/50">
                    <td className="py-3 font-medium text-slate-700 dark:text-slate-100">{u.username}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        u.role === 'HR' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 
                        u.role === 'Manager' ? 'bg-teal-green/10 dark:bg-teal-green/20 text-teal-green' : 
                        'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 text-slate-600 dark:text-slate-200">{u.employee_name || 'N/A'}</td>
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
