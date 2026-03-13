import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { Modal } from '../../common/Modal';
import { getAuthHeaders } from '../../../utils/csv';

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

export const AuditLogs = () => {
  const [logs, setLogs] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [tableFilter, setTableFilter] = useState('');
  const [usernameFilter, setUsernameFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [limit, setLimit] = useState(200);
  const [employeeOnly, setEmployeeOnly] = useState(true);

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
    } catch (err) {
      setLogs([]);
    } finally { setLoading(false); }
  };

  const openJsonModal = (title: string, jsonStr?: string | null) => {
    let pretty = '';
    try { if (jsonStr) pretty = JSON.stringify(JSON.parse(jsonStr), null, 2); else pretty = 'No data'; } catch (e) { pretty = jsonStr || 'Invalid JSON'; }
    setModalTitle(title);
    setModalContent(pretty);
    setModalOpen(true);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-4">
        <SectionHeader title="Audit Logs" subtitle="System action audit trail" />
        <div className="flex items-center gap-2">
          <button onClick={fetchLogs} className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm font-bold">Refresh</button>
        </div>
      </div>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Table</label>
            <input value={tableFilter} onChange={e => setTableFilter(e.target.value)} className="w-full mt-1 p-2 border rounded-lg text-sm" placeholder="e.g. users" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">User</label>
            <input value={usernameFilter} onChange={e => setUsernameFilter(e.target.value)} className="w-full mt-1 p-2 border rounded-lg text-sm" placeholder="username or full_name" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Action</label>
            <input value={actionFilter} onChange={e => setActionFilter(e.target.value)} className="w-full mt-1 p-2 border rounded-lg text-sm" placeholder="create / update / delete" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Limit</label>
            <input type="number" value={limit} onChange={e => setLimit(Math.max(10, Math.min(1000, Number(e.target.value) || 200)))} className="w-full mt-1 p-2 border rounded-lg text-sm" />
          </div>
        </div>
        <div className="mb-3">
          <label className="text-xs font-bold text-slate-500 uppercase mr-3">Employee activities</label>
          <input type="checkbox" checked={employeeOnly} onChange={e => setEmployeeOnly(e.target.checked)} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-teal-deep text-white">
                <th className="py-2 font-bold uppercase">When</th>
                <th className="py-2 font-bold uppercase">User</th>
                <th className="py-2 font-bold uppercase">Role</th>
                <th className="py-2 font-bold uppercase">Action</th>
                <th className="py-2 font-bold uppercase">Description</th>
                <th className="py-2 font-bold uppercase">Table</th>
                <th className="py-2 font-bold uppercase">Source</th>
                <th className="py-2 font-bold uppercase">Row</th>
                <th className="py-2 font-bold uppercase">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && !loading ? (
                <tr><td colSpan={9} className="py-6 text-center text-slate-500">No audit entries found — try different filters or toggle Employee activities.</td></tr>
              ) : (
                logs.map(l => (
                  <tr key={l.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-teal-50 dark:hover:bg-teal-900/10 transition-colors">
                    <td className="py-2">{l.created_at ? new Date(l.created_at).toLocaleString() : '-'}</td>
                    <td className="py-2">{l.username || (l.user_id ? `#${l.user_id}` : '-')}</td>
                    <td className="py-2">{l.user_role || '-'}</td>
                    <td className="py-2 font-bold">{(l as any).display_action || l.action}</td>
                    <td className="py-2 text-slate-600">{(l as any).display_description || '-'}</td>
                    <td className="py-2">{l.table_name}</td>
                    <td className="py-2">{l.source || '-'}</td>
                    <td className="py-2">{l.row_id || '-'}</td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button onClick={() => openJsonModal('Before', l.before_json)} className="px-2 py-1 rounded bg-teal-50 text-teal-700 text-xs">Before</button>
                        <button onClick={() => openJsonModal('After', l.after_json)} className="px-2 py-1 rounded bg-teal-50 text-teal-700 text-xs">After</button>
                      <button onClick={() => openJsonModal('Meta', l.meta_json)} className="px-2 py-1 rounded bg-teal-50 text-teal-700 text-xs">Meta</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {loading && <div className="mt-3 text-sm text-slate-500">Loading…</div>}
      </Card>

      <Modal open={modalOpen} title={modalTitle} onClose={() => setModalOpen(false)}>
        <pre className="max-h-[60vh] overflow-auto text-xs"><code>{modalContent}</code></pre>
      </Modal>
    </motion.div>
  );
};

export default AuditLogs;
