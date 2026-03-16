import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { Modal } from '../../common/Modal';
import { getAuthHeaders } from '../../../utils/csv';
import { RefreshCw, Search, Filter, ChevronDown, ChevronUp, Plus, Edit3, Trash2, Eye, Clock, Shield, Database, Activity } from 'lucide-react';

interface AuditRecord {
  id: number;
  user_id?: number;
  username?: string;
  user_role?: string;
  display_action?: string;
  action: string;
  table_name: string;
  row_id?: number;
  before_json?: string;
  after_json?: string;
  created_at?: string;
  source?: string;
  ip?: string;
  user_agent?: string;
  route?: string;
  method?: string;
  meta_json?: string;
}

const ACTION_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  create: { label: 'Created', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30', icon: Plus },
  insert: { label: 'Created', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30', icon: Plus },
  update: { label: 'Updated', color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30', icon: Edit3 },
  delete: { label: 'Deleted', color: 'text-red-700 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30', icon: Trash2 },
};

const timeAgo = (dateStr: string) => {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
};

export const AuditLogs = () => {
  const [logs, setLogs] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [tableFilter, setTableFilter] = useState('');
  const [usernameFilter, setUsernameFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [limit, setLimit] = useState(200);
  const [employeeOnly, setEmployeeOnly] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalContent, setModalContent] = useState('');

  useEffect(() => { fetchLogs(); }, [employeeOnly]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (employeeOnly) params.set('employee_activity', '1');
      if (tableFilter) params.set('table_name', tableFilter);
      if (usernameFilter) params.set('username', usernameFilter);
      if (actionFilter) params.set('action', actionFilter);
      if (limit) params.set('limit', String(limit));
      const res = await fetch('/api/audit_logs?' + params.toString(), { headers: getAuthHeaders() });
      if (!res.ok) { setLogs([]); setLoading(false); return; }
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch {
      setLogs([]);
    } finally { setLoading(false); }
  };

  const openJsonModal = (title: string, jsonStr?: string | null) => {
    let pretty = '';
    try { if (jsonStr) pretty = JSON.stringify(JSON.parse(jsonStr), null, 2); else pretty = 'No data'; } catch { pretty = jsonStr || 'Invalid JSON'; }
    setModalTitle(title);
    setModalContent(pretty);
    setModalOpen(true);
  };

  const getActionConfig = (action: string) => {
    const key = (action || '').toLowerCase();
    return ACTION_CONFIG[key] || { label: action || '—', color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800', icon: Activity };
  };

  // Stats
  const creates = logs.filter(l => ['create', 'insert'].includes((l.action || '').toLowerCase())).length;
  const updates = logs.filter(l => (l.action || '').toLowerCase() === 'update').length;
  const deletes = logs.filter(l => (l.action || '').toLowerCase() === 'delete').length;

  const inp = 'w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100';

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-4">
        <SectionHeader title="Audit Logs" subtitle="System action audit trail" />
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-colors ${showFilters ? 'bg-teal-deep text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
          >
            <Filter size={14} /> Filters
          </button>
          <button
            onClick={fetchLogs}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-teal-deep text-white text-sm font-bold hover:bg-teal-green transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Total Events', value: logs.length, icon: Activity, color: 'bg-teal-600' },
          { label: 'Creates', value: creates, icon: Plus, color: 'bg-emerald-500' },
          { label: 'Updates', value: updates, icon: Edit3, color: 'bg-blue-500' },
          { label: 'Deletes', value: deletes, icon: Trash2, color: 'bg-red-500' },
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}>
                  <s.icon size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{s.label}</p>
                  <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{s.value}</p>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Filters Panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-4"
          >
            <Card>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Table</label>
                  <div className="relative mt-1">
                    <Database size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                    <input value={tableFilter} onChange={e => setTableFilter(e.target.value)} className={inp + ' pl-8'} placeholder="e.g. users" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">User</label>
                  <div className="relative mt-1">
                    <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                    <input value={usernameFilter} onChange={e => setUsernameFilter(e.target.value)} className={inp + ' pl-8'} placeholder="username" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Action</label>
                  <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} className={inp + ' mt-1'}>
                    <option value="">All Actions</option>
                    <option value="create">Create</option>
                    <option value="update">Update</option>
                    <option value="delete">Delete</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Limit</label>
                  <input type="number" value={limit} onChange={e => setLimit(Math.max(10, Math.min(1000, Number(e.target.value) || 200)))} className={inp + ' mt-1'} />
                </div>
                <div className="flex items-end gap-3 pb-0.5">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 dark:text-slate-300">
                    <input type="checkbox" checked={employeeOnly} onChange={e => setEmployeeOnly(e.target.checked)} className="accent-teal-600 w-4 h-4" />
                    Employee only
                  </label>
                  <button onClick={fetchLogs} className="ml-auto px-4 py-2 bg-teal-deep text-white text-sm font-bold rounded-lg hover:bg-teal-green transition-colors">Apply</button>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Logs Table */}
      <Card>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3 text-slate-400">
              <RefreshCw size={18} className="animate-spin" />
              <span className="text-sm">Loading audit trail...</span>
            </div>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12">
            <Shield size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400">No audit entries found</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Try different filters or toggle Employee activities</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200 dark:border-slate-700">
                  <th className="pb-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">When</th>
                  <th className="pb-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">User</th>
                  <th className="pb-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Action</th>
                  <th className="pb-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Description</th>
                  <th className="pb-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Table</th>
                  <th className="pb-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Source</th>
                  <th className="pb-3 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l, idx) => {
                  const ac = getActionConfig(l.action);
                  const ActionIcon = ac.icon;
                  const isExpanded = expandedRow === l.id;
                  return (
                    <React.Fragment key={l.id}>
                      <motion.tr
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(idx * 0.02, 0.5) }}
                        className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
                        onClick={() => setExpandedRow(isExpanded ? null : l.id)}
                      >
                        <td className="py-2.5">
                          <div className="flex items-center gap-1.5">
                            <Clock size={12} className="text-slate-400 shrink-0" />
                            <span className="text-xs text-slate-600 dark:text-slate-400" title={l.created_at ? new Date(l.created_at).toLocaleString() : ''}>
                              {l.created_at ? timeAgo(l.created_at) : '—'}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5">
                          <div>
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{l.username || `#${l.user_id || '—'}`}</span>
                            {l.user_role && <span className="ml-1.5 text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">{l.user_role}</span>}
                          </div>
                        </td>
                        <td className="py-2.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${ac.color} ${ac.bg}`}>
                            <ActionIcon size={10} /> {(l as any).display_action || ac.label}
                          </span>
                        </td>
                        <td className="py-2.5 text-xs text-slate-600 dark:text-slate-400 max-w-[200px] truncate">{(l as any).display_description || '—'}</td>
                        <td className="py-2.5">
                          <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded">{l.table_name}</span>
                        </td>
                        <td className="py-2.5 text-xs text-slate-500 dark:text-slate-400">{l.source || '—'}</td>
                        <td className="py-2.5 text-slate-400">
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </td>
                      </motion.tr>

                      {/* Expanded Detail */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.tr
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                          >
                            <td colSpan={7} className="px-4 pb-4 pt-1">
                              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                                <div className="grid grid-cols-4 gap-3 mb-3">
                                  <div className="text-xs">
                                    <span className="font-bold text-slate-400 uppercase text-[10px] block">Row ID</span>
                                    <span className="text-slate-600 dark:text-slate-300">{l.row_id || '—'}</span>
                                  </div>
                                  <div className="text-xs">
                                    <span className="font-bold text-slate-400 uppercase text-[10px] block">Method</span>
                                    <span className="text-slate-600 dark:text-slate-300">{l.method || '—'}</span>
                                  </div>
                                  <div className="text-xs">
                                    <span className="font-bold text-slate-400 uppercase text-[10px] block">Route</span>
                                    <span className="font-mono text-slate-600 dark:text-slate-300 text-[11px]">{l.route || '—'}</span>
                                  </div>
                                  <div className="text-xs">
                                    <span className="font-bold text-slate-400 uppercase text-[10px] block">Timestamp</span>
                                    <span className="text-slate-600 dark:text-slate-300">{l.created_at ? new Date(l.created_at).toLocaleString() : '—'}</span>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  {l.before_json && (
                                    <button onClick={(e) => { e.stopPropagation(); openJsonModal('Before State', l.before_json); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-bold hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors">
                                      <Eye size={12} /> Before
                                    </button>
                                  )}
                                  {l.after_json && (
                                    <button onClick={(e) => { e.stopPropagation(); openJsonModal('After State', l.after_json); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors">
                                      <Eye size={12} /> After
                                    </button>
                                  )}
                                  {l.meta_json && (
                                    <button onClick={(e) => { e.stopPropagation(); openJsonModal('Metadata', l.meta_json); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
                                      <Eye size={12} /> Meta
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>
                          </motion.tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modalOpen} title={modalTitle} onClose={() => setModalOpen(false)}>
        <pre className="max-h-[60vh] overflow-auto text-xs bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-700"><code className="text-slate-700 dark:text-slate-300">{modalContent}</code></pre>
      </Modal>
    </motion.div>
  );
};

export default AuditLogs;
