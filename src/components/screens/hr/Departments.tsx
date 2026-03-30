import React, { useEffect, useState } from 'react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { Modal } from '../../common/Modal';
import { Search } from 'lucide-react';

export const Departments = () => {
  const [depts, setDepts] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingName, setPendingName] = useState('');
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState('');

  const fetchDepts = async () => {
    try {
      const res = await fetch('/api/departments' + (showArchived ? '?include_deleted=1' : ''));
      if (!res.ok) return setDepts([]);
      const data = await res.json();
      setDepts(Array.isArray(data) ? data : []);
    } catch (e) { setDepts([]); }
  };

  useEffect(() => { fetchDepts(); }, [showArchived]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return (window as any).notify('Enter a department name', 'error');
    setPendingName(name.trim());
    setConfirmOpen(true);
  };

  const handleConfirmAdd = async () => {
    setConfirmOpen(false);
    setLoading(true);
    try {
      const token = localStorage.getItem('talentflow_token');
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ name: pendingName })
      });
      if (res.ok) {
        (window as any).notify('Department created', 'success');
        setName('');
        setPendingName('');
        await fetchDepts();
      } else {
        const err = await res.json().catch(() => ({}));
        (window as any).notify(err.error || 'Failed to create', 'error');
      }
    } catch (e) {
      (window as any).notify('Server error', 'error');
    } finally { setLoading(false); }
  };

  const handleConfirmArchive = async () => {
    if (!pendingId) return setConfirmOpen(false);
    setConfirmOpen(false);
    try {
      const token = localStorage.getItem('talentflow_token');
      const res = await fetch(`/api/departments/${pendingId}/archive`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) {
        (window as any).notify('Archived', 'success');
        setPendingId(null); setPendingName('');
        await fetchDepts();
      } else {
        (window as any).notify('Archive failed', 'error');
      }
    } catch (e) { (window as any).notify('Server error', 'error'); }
  };

  return (
    <>
    <div className="space-y-6">
      <SectionHeader title="Departments" subtitle="Manage organizational departments" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <h3 className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-300 mb-4 tracking-widest">Department List</h3>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-2 w-64">
              <Search className="text-slate-400" />
              <input placeholder="Search departments" value={query} onChange={e=>setQuery(e.target.value)} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <label className="text-sm inline-flex items-center gap-2"><input type="checkbox" checked={showArchived} onChange={e=>{ setShowArchived(e.target.checked); }} /> Show archived</label>
          </div>
          <div className="space-y-2">
            {depts.length === 0 ? <p className="text-sm text-slate-500">No departments found.</p> : (
              <ul className="space-y-2">
                {depts
                  .filter(d => (d.name || '').toLowerCase().includes(query.toLowerCase()))
                  .map(d => (
                  <li key={d.id} className={`flex items-center justify-between p-3 rounded-lg border ${d.deleted_at ? 'opacity-60 bg-slate-50/60' : 'bg-white/80'} border-slate-200 dark:border-slate-700`}>
                    <div>
                      <div className="font-bold">{d.name}</div>
                      <div className="text-xs text-slate-500">slug: {d.slug} • users: {d.user_count || 0} • created: {d.created_at ? new Date(d.created_at).toLocaleDateString() : '-'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!d.deleted_at ? (
                        <button onClick={() => { setPendingName(d.name); setPendingId(d.id); setConfirmOpen(true); }} className="text-sm text-red-500 hover:underline">Archive</button>
                      ) : (
                        <button onClick={async () => {
                          if (!confirm('Restore this department?')) return;
                          try { const token = localStorage.getItem('talentflow_token'); const res = await fetch(`/api/departments/${d.id}/restore`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} }); if (res.ok) { (window as any).notify('Restored', 'success'); fetchDepts(); } else { (window as any).notify('Restore failed','error'); } } catch (e) { (window as any).notify('Server error','error'); }
                        }} className="text-sm text-emerald-600 hover:underline">Restore</button>
                      )}
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
    <Modal open={confirmOpen} title="Confirm archive" onClose={() => setConfirmOpen(false)}>
      <div className="space-y-4">
        <p>Are you sure you want to archive the department <strong>{pendingName}</strong>?</p>
        <div className="flex gap-2 justify-end">
          <button onClick={() => setConfirmOpen(false)} className="px-3 py-2 rounded-lg border">Cancel</button>
          <button onClick={handleConfirmArchive} className="px-3 py-2 rounded-lg gradient-bg text-white">Archive</button>
        </div>
      </div>
    </Modal>
    </>
  );
};

export default Departments;
