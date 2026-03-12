import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Employee } from '../../../types';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { SearchableSelect } from '../../common/SearchableSelect';
import { Modal } from '../../common/Modal';

interface UserAccountsProps {
  employees: Employee[];
  users: any[];
  onRefresh: () => void;
}

export const UserAccounts = ({ employees, users, onRefresh }: UserAccountsProps) => {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [linkTarget, setLinkTarget] = useState('employee');
  const [selectedLinkedUserId, setSelectedLinkedUserId] = useState('');
  const [createRole, setCreateRole] = useState('');

  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalName, setModalName] = useState('');
  const [modalRole, setModalRole] = useState('');
  const [modalEmployeeId, setModalEmployeeId] = useState('');
  const [modalLinkTarget, setModalLinkTarget] = useState('');
  const [modalLinkedUserId, setModalLinkedUserId] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const email = (fd.get('email') || '').toString().trim();
    const password = (fd.get('password') || '').toString().trim();
    const full_name = (fd.get('full_name') || '').toString().trim();
    const role = (fd.get('role') || '').toString();
    if ((!email && !username) || !password || !role) { (window as any).notify('Missing required fields', 'error'); return; }

    const body: any = { email, password, role };
    if (full_name) body.full_name = full_name;

    if (linkTarget === 'employee' && createRole !== 'HR' && createRole !== 'Manager') {
      if (selectedEmployeeId) body.employee_id = selectedEmployeeId;
    } else if (linkTarget === 'hr' || linkTarget === 'manager') {
      if (selectedLinkedUserId) body.linked_user_id = selectedLinkedUserId;
    }

    try {
      const token = localStorage.getItem('talentflow_token');
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        (window as any).notify('User created successfully', 'success');
        onRefresh();
        form.reset();
        setSelectedEmployeeId('');
        setSelectedLinkedUserId('');
        setCreateRole('');
        setLinkTarget('employee');
      } else {
        const err = await res.json();
        (window as any).notify(err.error || 'Failed to create user', 'error');
      }
    } catch (err) {
      (window as any).notify('Error connecting to server', 'error');
    }
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    try {
      const token = localStorage.getItem('talentflow_token');
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const body: any = {};
      const origName = editingUser.full_name || editingUser.employee_name || '';
      if (modalName !== origName) body.full_name = modalName || null;
      if (modalRole && modalRole !== editingUser.role) body.role = modalRole;
      if (modalRole !== 'Manager') {
        if (modalEmployeeId !== (editingUser.employee_id ? String(editingUser.employee_id) : '')) body.employee_id = modalEmployeeId || null;
      }
      if (modalLinkedUserId !== (editingUser.linked_user_id ? String(editingUser.linked_user_id) : '')) body.linked_user_id = modalLinkedUserId || null;
      if (Object.keys(body).length === 0) { (window as any).notify('No changes to save', 'info'); return; }
      const res = await fetch(`/api/users/${editingUser.id}`, { method: 'PUT', headers, body: JSON.stringify(body) });
      if (res.ok) { (window as any).notify('User updated', 'success'); setModalOpen(false); setEditingUser(null); onRefresh(); } else { const err = await res.json(); (window as any).notify(err.error || 'Failed', 'error'); }
    } catch (err) { (window as any).notify('Server error', 'error'); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <SectionHeader title="User Accounts Management" subtitle="Create and manage login credentials for staff" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <h3 className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-300 mb-4 tracking-widest">Create New Account</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Email</label>
              <input name="email" type="email" className="w-full mt-1 p-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-green/50" placeholder="e.g. jane@company.com" required />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Full name</label>
              <input name="full_name" type="text" className="w-full mt-1 p-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-green/50" placeholder="e.g. Jane Smith" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Password</label>
              <input name="password" type="password" className="w-full mt-1 p-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-green/50" required />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Role</label>
              <select name="role" value={createRole} onChange={e => setCreateRole(e.target.value)} className="w-full mt-1 p-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-green/50" required>
                <option value="">Select Role...</option>
                <option value="Employee">Employee</option>
                <option value="Manager">Manager</option>
                <option value="HR">HR</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Link</label>
              <select value={linkTarget} onChange={e => {
                const v = e.target.value;
                setLinkTarget(v);
                if (v !== 'employee') setSelectedEmployeeId('');
                if (!['hr','manager'].includes(v)) setSelectedLinkedUserId('');
              }} className="w-full mt-1 p-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-green/50">
                <option value="employee">Employee</option>
                <option value="hr">HR</option>
                <option value="manager">Manager</option>
              </select>
            </div>

            {linkTarget === 'employee' && createRole !== 'HR' && createRole !== 'Manager' && (
              <div>
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Link to Employee</label>
                <input type="hidden" name="employee_id" value={selectedEmployeeId} />
                <SearchableSelect
                  options={employees.map(e => ({ value: String(e.id), label: e.name }))}
                  value={selectedEmployeeId}
                  onChange={v => setSelectedEmployeeId(v)}
                  placeholder="None"
                  allowEmpty
                  emptyLabel="None"
                />
              </div>
            )}

            {['hr','manager'].includes(linkTarget) && (
              <div>
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Link to User</label>
                <input type="hidden" name="linked_user_id" value={selectedLinkedUserId} />
                <SearchableSelect
                  options={(users || []).filter((u: any) => (u.role || '').toLowerCase() === linkTarget.toLowerCase()).map((u: any) => ({ value: String(u.id), label: u.full_name || u.email || u.username }))}
                  value={selectedLinkedUserId}
                  onChange={v => setSelectedLinkedUserId(v)}
                  placeholder={`Select ${linkTarget.toUpperCase()}`}
                />
              </div>
            )}

            <button type="submit" className="w-full gradient-bg text-white py-2 rounded-lg font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-teal-green/10">Create User</button>
          </form>
        </Card>

        <Card className="lg:col-span-2">
          <h3 className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-300 mb-4 tracking-widest">Existing Accounts</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="pb-2 font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Name</th>
                  <th className="pb-2 font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Email</th>
                  <th className="pb-2 font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Role</th>
                  <th className="pb-2 font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Linked Employee</th>
                  <th className="pb-2 font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-slate-50 dark:border-slate-800/50">
                    <td className="py-3 font-medium text-slate-700 dark:text-slate-100">{u.full_name || u.employee_name || '-'}</td>
                    <td className="py-3 font-medium text-slate-700 dark:text-slate-100">{u.email || u.username}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        u.role === 'HR' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 
                        u.role === 'Manager' ? 'bg-teal-green/10 dark:bg-teal-green/20 text-teal-green' : 
                        'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 text-slate-600 dark:text-slate-200">{u.employee_name || u.linked_user_full_name || 'N/A'}</td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => {
                          setEditingUser(u);
                          setModalName(u.full_name || u.employee_name || '');
                          setModalRole(u.role || '');
                          setModalEmployeeId(u.employee_id ? String(u.employee_id) : '');
                          setModalLinkedUserId(u.linked_user_id ? String(u.linked_user_id) : '');
                          setModalLinkTarget(u.employee_id ? 'employee' : (u.linked_user_id ? (u.linked_user_role ? u.linked_user_role.toLowerCase() : 'user') : ''));
                          setModalOpen(true);
                        }} className="text-xs text-amber-600 font-bold">Edit</button>
                        <button onClick={async () => {
                          if (!confirm('Delete user?')) return;
                          const token = localStorage.getItem('talentflow_token');
                          try {
                            const res = await fetch(`/api/users/${u.id}`, { method: 'DELETE', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
                            if (res.ok) { (window as any).notify('User deleted', 'success'); onRefresh(); } else { const err = await res.json(); (window as any).notify(err.error || 'Failed', 'error'); }
                          } catch (err) { (window as any).notify('Server error', 'error'); }
                        }} className="text-xs text-red-500 font-bold">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Modal open={modalOpen} title={editingUser ? 'Edit User' : 'Edit User'} onClose={() => setModalOpen(false)}>
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Full name</label>
            <input value={modalName} onChange={e => setModalName(e.target.value)} className="w-full mt-1 p-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-green/50" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Role</label>
            <select value={modalRole} onChange={e => {
              const v = e.target.value;
              setModalRole(v);
              if (v === 'Manager') setModalEmployeeId('');
            }} className="w-full mt-1 p-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-green/50">
              <option value="">Select Role...</option>
              <option value="Employee">Employee</option>
              <option value="Manager">Manager</option>
              <option value="HR">HR</option>
            </select>
          </div>
          {modalRole !== 'Manager' && (
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Linked Employee</label>
              <SearchableSelect
                options={employees.map(e => ({ value: String(e.id), label: e.name }))}
                value={modalEmployeeId}
                onChange={v => setModalEmployeeId(v)}
                placeholder="None"
                allowEmpty
                emptyLabel="None"
              />
            </div>
          )}
          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Link</label>
            <select value={modalLinkTarget} onChange={e => {
              const v = e.target.value;
              setModalLinkTarget(v);
              if (v !== 'employee') setModalEmployeeId('');
              if (!['hr','manager'].includes(v)) setModalLinkedUserId('');
            }} className="w-full mt-1 p-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-green/50">
              <option value="">None</option>
              <option value="employee">Employee</option>
              <option value="hr">HR</option>
              <option value="manager">Manager</option>
            </select>

            {modalLinkTarget === 'employee' && modalRole !== 'HR' && modalRole !== 'Manager' && (
              <div className="mt-2">
                <input type="hidden" name="employee_id" value={modalEmployeeId} />
                <SearchableSelect
                  options={employees.map(e => ({ value: String(e.id), label: e.name }))}
                  value={modalEmployeeId}
                  onChange={v => setModalEmployeeId(v)}
                  placeholder="None"
                  allowEmpty
                  emptyLabel="None"
                />
              </div>
            )}

            {['hr','manager'].includes(modalLinkTarget) && (
              <div className="mt-2">
                <input type="hidden" name="linked_user_id" value={modalLinkedUserId} />
                <SearchableSelect
                  options={(users || []).filter((u: any) => (u.role || '').toLowerCase() === modalLinkTarget.toLowerCase()).map((u: any) => ({ value: String(u.id), label: u.full_name || u.email || u.username }))}
                  value={modalLinkedUserId}
                  onChange={v => setModalLinkedUserId(v)}
                  placeholder={`Select ${modalLinkTarget.toUpperCase()}`}
                />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800">Cancel</button>
            <button onClick={handleSaveEdit} className="px-4 py-2 rounded-lg bg-teal-deep text-white">Save</button>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
};

export default UserAccounts;
