import React, { useState } from 'react';
import { SectionHeader } from '../../common/SectionHeader';
import { Card } from '../../common/Card';

export const Settings = ({ onPasswordChanged }: { onPasswordChanged?: () => void }) => {
  const [current, setCurrent] = useState('');
  const [newPass, setNewPass] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('talentflow_token');
      const res = await fetch('/api/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ currentPassword: current, newPassword: newPass }) });
      const data = await res.json();
      if (res.ok) { (window as any).notify('Password changed', 'success'); setCurrent(''); setNewPass(''); if (onPasswordChanged) onPasswordChanged(); }
      else (window as any).notify(data.error || 'Failed to change password', 'error');
    } catch (err) { (window as any).notify('Connection error', 'error'); }
    setLoading(false);
  };

  return (
    <div>
      <SectionHeader title="Settings" subtitle="Your account and preferences" />
      <div className="grid grid-cols-1 gap-4">
        <Card className="p-4">
          <h3 className="font-bold mb-2">Change Password</h3>
          <form onSubmit={handleChange} className="space-y-3">
            <input type="password" placeholder="Current password" value={current} onChange={e => setCurrent(e.target.value)} className="w-full p-2 border rounded" required />
            <input type="password" placeholder="New password" value={newPass} onChange={e => setNewPass(e.target.value)} className="w-full p-2 border rounded" required />
            <button type="submit" className="px-4 py-2 bg-teal-600 text-white rounded" disabled={loading}>{loading ? 'Saving...' : 'Change Password'}</button>
          </form>
        </Card>

        <Card className="p-4">
          <h3 className="font-bold mb-2">Preferences</h3>
          <p className="text-sm text-slate-500">Theme toggle is available in the top-right of the login and app header.</p>
        </Card>
      </div>
    </div>
  );
};

export default Settings;
