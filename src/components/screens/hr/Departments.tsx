import React, { useEffect, useState } from 'react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { Modal } from '../../common/Modal';
import { AnimatePresence, motion } from 'motion/react';
import { Building2, CalendarClock, Crown, Search, Sparkles, Users } from 'lucide-react';

export const Departments = () => {
  const [depts, setDepts] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<'add' | 'archive'>('archive');
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
    setConfirmMode('add');
    setPendingName(name.trim());
    setPendingDescription(description.trim());
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
        body: JSON.stringify({ name: pendingName, description: (pendingDescription || null) })
      });
      if (res.ok) {
        (window as any).notify('Department created', 'success');
        setName('');
        setDescription('');
        setPendingName('');
        setPendingDescription('');
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

  const [pendingDescription, setPendingDescription] = useState('');

  const visibleDepts = depts
    .filter(d => (d.name || '').toLowerCase().includes(query.toLowerCase()))
    .filter(d => showArchived ? true : !d.deleted_at);

  const totalUsers = visibleDepts.reduce((sum, d) => sum + Number(d.user_count || 0), 0);
  const activeCount = visibleDepts.filter(d => !d.deleted_at).length;
  const archivedCount = visibleDepts.filter(d => !!d.deleted_at).length;

  const initials = (value: string) => {
    if (!value) return 'DP';
    const chunks = value.trim().split(/\s+/).slice(0, 2);
    return chunks.map((c) => c[0]?.toUpperCase() || '').join('') || 'DP';
  };

  const formatDate = (value?: string | null) => {
    if (!value) return 'Not available';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return 'Not available';
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <>
    <div className="space-y-6">
      <SectionHeader title="Departments" subtitle="Design and manage your org structure with richer visibility" />
      <Card className="overflow-hidden border-0 bg-gradient-to-r from-slate-900 via-teal-900 to-emerald-700 text-white relative">
        <div className="absolute -top-16 -right-10 w-48 h-48 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-16 -left-12 w-44 h-44 rounded-full bg-emerald-300/20 blur-3xl" />
        <div className="relative grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/70 mb-2">Workspace Snapshot</p>
            <h3 className="text-2xl font-black leading-tight">Department map with clearer ownership and staffing insight</h3>
            <p className="mt-2 text-sm text-white/80">Open any card to view headcount, ownership, status, and sample members in one larger profile.</p>
          </div>
          <div className="rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
            <div className="text-xs text-white/75">Visible Departments</div>
            <div className="mt-1 text-3xl font-black">{visibleDepts.length}</div>
            <div className="mt-2 text-xs text-white/75">Active {activeCount} • Archived {archivedCount}</div>
          </div>
          <div className="rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
            <div className="text-xs text-white/75">Users In View</div>
            <div className="mt-1 text-3xl font-black">{totalUsers}</div>
            <div className="mt-2 text-xs text-white/75">Cross-check staffing distribution by team</div>
          </div>
        </div>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <h3 className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-300 mb-4 tracking-widest">Department Directory</h3>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-2 w-72 p-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900">
              <Search className="text-slate-400" />
              <input placeholder="Search departments" value={query} onChange={e=>setQuery(e.target.value)} className="w-full text-sm bg-transparent outline-none" />
            </div>
            <label className="text-sm inline-flex items-center gap-2"><input type="checkbox" checked={showArchived} onChange={e=>{ setShowArchived(e.target.checked); }} /> Show archived</label>
          </div>
          <div>
            {depts.length === 0 ? <p className="text-sm text-slate-500">No departments found.</p> : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 gap-4">
                <AnimatePresence mode="popLayout">
                  {visibleDepts.map((d, idx) => (
                    <motion.button
                      key={d.id}
                      type="button"
                      onClick={() => { setSelectedDept(d); setDetailOpen(true); }}
                      initial={{ opacity: 0, y: 16, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -12, scale: 0.98 }}
                      transition={{ duration: 0.28, delay: idx * 0.03 }}
                      whileHover={{ y: -4 }}
                      className={`text-left p-5 rounded-2xl border cursor-pointer transition-all duration-300 ${d.deleted_at ? 'opacity-65 bg-slate-50/60 dark:bg-slate-900/50' : 'bg-gradient-to-br from-white to-teal-50/50 dark:from-slate-900 dark:to-slate-900/90 hover:shadow-lg'} border-slate-200 dark:border-slate-700 min-h-[198px]`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-200">
                          <Building2 size={13} />
                          {d.deleted_at ? 'Archived' : 'Active'}
                        </div>
                        <div className="text-xs text-slate-500">{d.slug || 'No slug'}</div>
                      </div>

                      <div className="mt-3">
                        <div className="font-black text-xl leading-tight text-slate-800 dark:text-slate-100">{d.name}</div>
                        <div className="mt-1 text-sm text-slate-500 line-clamp-2">{d.description || 'No description yet. Add responsibilities to improve discoverability.'}</div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 bg-white/70 dark:bg-slate-900/50">
                          <div className="text-[11px] text-slate-500">Users</div>
                          <div className="text-lg font-black text-slate-800 dark:text-slate-100">{d.user_count || 0}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 bg-white/70 dark:bg-slate-900/50">
                          <div className="text-[11px] text-slate-500">Head</div>
                          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{d.head_name || 'Unassigned'}</div>
                        </div>
                      </div>

                      <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-teal-700 dark:text-teal-300">
                        Open profile
                        <Sparkles size={14} />
                      </div>
                    </motion.button>
                  ))}
                </AnimatePresence>
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
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="w-full mt-1 p-2 border rounded-lg text-sm" placeholder="Short description or responsibilities (optional)" />
            </div>
            <button type="submit" disabled={loading} className="w-full gradient-bg text-white py-2 rounded-lg font-bold text-sm">Add</button>
          </form>
        </Card>
      </div>
    </div>
    <Modal open={confirmOpen} title={confirmMode === 'add' ? 'Confirm department creation' : 'Confirm archive'} onClose={() => setConfirmOpen(false)}>
      <div className="space-y-4">
        {confirmMode === 'add' ? (
          <p>Create the department <strong>{pendingName}</strong>{pendingDescription ? ` with description: "${pendingDescription}"` : ''}?</p>
        ) : (
          <p>Are you sure you want to archive the department <strong>{pendingName}</strong>?</p>
        )}
        <div className="flex gap-2 justify-end">
          <button onClick={() => setConfirmOpen(false)} className="px-3 py-2 rounded-lg border">Cancel</button>
          <button onClick={confirmMode === 'add' ? handleConfirmAdd : handleConfirmArchive} className="px-3 py-2 rounded-lg gradient-bg text-white">{confirmMode === 'add' ? 'Create' : 'Archive'}</button>
        </div>
      </div>
    </Modal>
    <Modal open={detailOpen} maxWidthClassName="max-w-5xl" title={selectedDept ? selectedDept.name : 'Department'} onClose={() => { setDetailOpen(false); setSelectedDept(null); }}>
      {selectedDept ? (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-slate-800 dark:to-slate-900 p-5">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${selectedDept.deleted_at ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                {selectedDept.deleted_at ? 'Archived' : 'Active'}
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200">Slug: {selectedDept.slug || 'Not set'}</span>
            </div>
            <p className="text-slate-700 dark:text-slate-200 text-sm leading-relaxed">{selectedDept.description || 'No description provided yet for this department.'}</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
              <div className="text-[11px] uppercase tracking-widest text-slate-500">Headcount</div>
              <div className="mt-2 flex items-center gap-2 text-3xl font-black text-slate-800 dark:text-slate-100">
                <Users size={22} className="text-teal-600" />
                {selectedDept.user_count || 0}
              </div>
              <div className="text-xs text-slate-500 mt-1">Active users assigned</div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
              <div className="text-[11px] uppercase tracking-widest text-slate-500">Department Head</div>
              <div className="mt-2 flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
                <Crown size={18} className="text-amber-500" />
                {selectedDept.head_name || 'Unassigned'}
              </div>
              <div className="text-xs text-slate-500 mt-1">Owner of team operations</div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
              <div className="text-[11px] uppercase tracking-widest text-slate-500">Last Updated</div>
              <div className="mt-2 flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
                <CalendarClock size={18} className="text-indigo-500" />
                {formatDate(selectedDept.updated_at || selectedDept.created_at)}
              </div>
              <div className="text-xs text-slate-500 mt-1">Created: {formatDate(selectedDept.created_at)}</div>
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-500 mb-2 uppercase tracking-wider">Sample Members</div>
            {Array.isArray(selectedDept.sample_users) && selectedDept.sample_users.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {selectedDept.sample_users.map((u: any, idx: number) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-900 flex items-center gap-3"
                  >
                    <div className="w-10 h-10 rounded-full gradient-bg text-white flex items-center justify-center font-bold text-sm">
                      {initials(u.full_name || u.email || 'User')}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{u.full_name || 'Unnamed User'}</div>
                      <div className="text-xs text-slate-500 truncate">{u.email || 'No email available'}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : <div className="text-sm text-slate-500 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4">No members found for preview.</div>}
          </div>

          <div className="flex justify-end gap-2">
            {!selectedDept.deleted_at ? (
              <button onClick={() => { setConfirmMode('archive'); setPendingName(selectedDept.name); setPendingId(selectedDept.id); setConfirmOpen(true); setDetailOpen(false); }} className="px-3 py-2 rounded-lg border text-red-600">Archive</button>
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
