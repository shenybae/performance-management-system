import React, { useEffect, useState } from 'react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';

export const Departments = () => {
  const [depts, setDepts] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchDepts = async () => {
    try {
      const res = await fetch('/api/departments');
      if (!res.ok) return setDepts([]);
      const data = await res.json();
      setDepts(Array.isArray(data) ? data : []);
    } catch (e) { setDepts([]); }
  };

  useEffect(() => { fetchDepts(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return (window as any).notify('Enter a department name', 'error');
    setLoading(true);
    try {
      const token = localStorage.getItem('talentflow_token');
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ name: name.trim() })
      });
      if (res.ok) {
        (window as any).notify('Department created', 'success');
        setName('');
        await fetchDepts();
      } else {
        const err = await res.json().catch(() => ({}));
        (window as any).notify(err.error || 'Failed to create', 'error');
      }
    } catch (e) {
      (window as any).notify('Server error', 'error');
    } finally { setLoading(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this department?')) return;
    try {
      const token = localStorage.getItem('talentflow_token');
      const res = await fetch(`/api/departments/${id}`, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.status === 204) {
        (window as any).notify('Deleted', 'success');
        await fetchDepts();
      } else {
        const err = await res.json().catch(() => ({}));
        (window as any).notify(err.error || 'Failed to delete', 'error');
      }
    } catch (e) { (window as any).notify('Server error', 'error'); }
  };

  return (
    <div className="space-y-6">
      <SectionHeader title="Departments" subtitle="Manage organizational departments" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <h3 className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-300 mb-4 tracking-widest">Department List</h3>
          <div className="space-y-2">
            {depts.length === 0 ? <p className="text-sm text-slate-500">No departments found.</p> : (
              <ul className="space-y-2">
                {depts.map(d => (
                  <li key={d.id} className="flex items-center justify-between p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-black/20">
                    <div>
                      <div className="font-bold">{d.name}</div>
                      <div className="text-xs text-slate-500">{d.slug}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleDelete(d.id)} className="text-sm text-red-500 hover:underline">Delete</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-300 mb-4 tracking-widest">Add Department</h3>
          <form onSubmit={handleAdd} className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Name</label>
              <input value={name} onChange={e => setName(e.target.value)} className="w-full mt-1 p-2 border rounded-lg text-sm" placeholder="e.g. Human Resources" />
            </div>
            <button type="submit" disabled={loading} className="w-full gradient-bg text-white py-2 rounded-lg font-bold text-sm">Add</button>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default Departments;
