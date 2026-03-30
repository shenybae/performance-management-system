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
  const [selectedDept, setSelectedDept] = useState<any | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchDepts = async () => {
    try {
      // Always fetch all departments (including archived) and filter client-side
      const res = await fetch('/api/departments?include_deleted=1');
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
          <div>
            {depts.length === 0 ? <p className="text-sm text-slate-500">No departments found.</p> : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {depts
                  .filter(d => (d.name || '').toLowerCase().includes(query.toLowerCase()))
                  .filter(d => showArchived ? true : !d.deleted_at)
                  .map(d => (
                    <div key={d.id} role="button" onClick={() => { setSelectedDept(d); setDetailOpen(true); }} className={`p-4 rounded-lg border cursor-pointer hover:shadow-md ${d.deleted_at ? 'opacity-60 bg-slate-50/60' : 'bg-white/80'} border-slate-200 dark:border-slate-700`}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="font-bold text-lg">{d.name}</div>
                          <div className="text-xs text-slate-500">{d.description || d.slug}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm">Users: <span className="font-medium">{d.user_count || 0}</span></div>
                          <div className="text-xs text-slate-400">Head: {d.head_name || '-'}</div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
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
    <Modal open={detailOpen} title={selectedDept ? selectedDept.name : 'Department'} onClose={() => { setDetailOpen(false); setSelectedDept(null); }}>
      {selectedDept ? (
        <div className="space-y-4">
          <div className="text-sm text-slate-600">{selectedDept.description || 'No description provided.'}</div>
          <div>
            <div className="text-xs text-slate-500 mb-2">Sample members</div>
            {Array.isArray(selectedDept.sample_users) && selectedDept.sample_users.length > 0 ? (
              <ul className="space-y-1">
                {selectedDept.sample_users.map((u: any, idx: number) => (
                  <li key={idx} className="text-sm">{u.full_name || u.email} <span className="text-xs text-slate-400">{u.email ? `· ${u.email}` : ''}</span></li>
                ))}
              </ul>
            ) : <div className="text-sm text-slate-500">No members found.</div>}
          </div>
          <div className="flex justify-end gap-2">
            {!selectedDept.deleted_at ? (
              <button onClick={() => { setPendingName(selectedDept.name); setPendingId(selectedDept.id); setConfirmOpen(true); setDetailOpen(false); }} className="px-3 py-2 rounded-lg border text-red-600">Archive</button>
            ) : (
              <button onClick={async () => { if (!confirm('Restore this department?')) return; try { const token = localStorage.getItem('talentflow_token'); const res = await fetch(`/api/departments/${selectedDept.id}/restore`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} }); if (res.ok) { (window as any).notify('Restored', 'success'); fetchDepts(); setDetailOpen(false); } else { (window as any).notify('Restore failed','error'); } } catch (e) { (window as any).notify('Server error','error'); } }} className="px-3 py-2 rounded-lg gradient-bg text-white">Restore</button>
            )}
            <button onClick={() => { setDetailOpen(false); setSelectedDept(null); }} className="px-3 py-2 rounded-lg border">Close</button>
          </div>
        </div>
      ) : null}
    </Modal>
    </>
  );
};

export default Departments;
