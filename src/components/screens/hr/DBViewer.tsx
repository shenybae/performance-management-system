import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { SearchableSelect } from '../../common/SearchableSelect';
import { appConfirm } from '../../../utils/appDialog';

export const DBViewer = () => {
  const [overview, setOverview] = useState<any>(null);
  const [archiveOverview, setArchiveOverview] = useState<any>(null);
  const [archiveTable, setArchiveTable] = useState<string>('');
  const [archiveRows, setArchiveRows] = useState<any[]>([]);
  const [archiveStatus, setArchiveStatus] = useState<'archived' | 'active' | 'all'>('archived');
  const [search, setSearch] = useState('');
  const [expandedRowId, setExpandedRowId] = useState<string>('');
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem('talentflow_token');
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  const fetchArchiveOverview = async () => {
    try {
      const res = await fetch('/api/archive/overview', { headers });
      if (!res.ok) {
        setArchiveOverview({ error: 'Failed to fetch archive overview' });
        return;
      }
      const data = await res.json();
      setArchiveOverview(data);
      if (!archiveTable) {
        const first = Object.keys(data || {})[0] || '';
        if (first) setArchiveTable(first);
      }
    } catch {
      setArchiveOverview({ error: 'Connection error' });
    }
  };

  const fetchArchiveRows = async (table: string, status: 'archived' | 'active' | 'all') => {
    if (!table) return;
    setArchiveLoading(true);
    try {
      const res = await fetch(`/api/archive/${table}?status=${status}&limit=50`, { headers });
      if (!res.ok) {
        setArchiveRows([]);
        return;
      }
      const data = await res.json();
      setArchiveRows(Array.isArray(data.rows) ? data.rows : []);
    } catch {
      setArchiveRows([]);
    } finally {
      setArchiveLoading(false);
    }
  };

  const restoreRow = async (table: string, id: any) => {
    try {
      const res = await fetch(`/api/archive/${table}/${id}/restore`, { method: 'PUT', headers });
      if (!res.ok) return;
      await fetchArchiveOverview();
      await fetchArchiveRows(table, archiveStatus);
    } catch {
      // no-op
    }
  };

  const purgeRow = async (table: string, id: any) => {
    if (!(await appConfirm('Permanently delete this archived row?', { title: 'Delete Permanently', confirmText: 'Delete' }))) return;
    try {
      const res = await fetch(`/api/archive/${table}/${id}/purge`, { method: 'DELETE', headers });
      if (!res.ok) return;
      await fetchArchiveOverview();
      await fetchArchiveRows(table, archiveStatus);
    } catch {
      // no-op
    }
  };

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const res = await fetch('/api/db/overview', { headers });
        if (!res.ok) {
          const err = await res.json();
          setOverview({ error: err.error || 'Failed to fetch' });
        } else {
          const data = await res.json();
          setOverview(data);
        }
      } catch (err) {
        setOverview({ error: 'Connection error' });
      } finally {
        setLoading(false);
      }
    };
    fetchOverview();
    fetchArchiveOverview();
  }, []);

  useEffect(() => {
    if (!archiveTable) return;
    fetchArchiveRows(archiveTable, archiveStatus);
  }, [archiveTable, archiveStatus]);

  const sortedArchiveTables = useMemo(() => {
    return Object.keys(archiveOverview || {}).sort((a, b) => {
      const av = Number(archiveOverview?.[a]?.archived_count || 0);
      const bv = Number(archiveOverview?.[b]?.archived_count || 0);
      return bv - av;
    });
  }, [archiveOverview]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return archiveRows;
    return archiveRows.filter((row) => JSON.stringify(row).toLowerCase().includes(q));
  }, [archiveRows, search]);

  const totalRows = Object.keys(overview || {}).reduce((sum, t) => sum + Number(overview?.[t]?.count || 0), 0);
  const totalTables = Object.keys(overview || {}).length;

  const archiveTotals = useMemo(() => {
    const values = Object.values(archiveOverview || {}) as any[];
    return {
      total: values.reduce((s, v) => s + Number(v?.total_count || 0), 0),
      active: values.reduce((s, v) => s + Number(v?.active_count || 0), 0),
      archived: values.reduce((s, v) => s + Number(v?.archived_count || 0), 0),
    };
  }, [archiveOverview]);

  const prettyDate = (value: any) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
  };

  const rowPreview = (row: any) => {
    const keys = Object.keys(row || {}).filter((k) => !['id', 'deleted_at', 'created_at', 'updated_at'].includes(k));
    for (const k of keys) {
      const v = row?.[k];
      if (v === null || v === undefined || v === '') continue;
      const text = String(v);
      if (text.length === 0) continue;
      return `${k}: ${text.slice(0, 72)}${text.length > 72 ? '...' : ''}`;
    }
    return 'No preview available';
  };

  if (loading) return <div>Loading DB overview...</div>;
  if (!overview) return <div>No data</div>;
  if (overview.error) return <div className="text-red-500">{overview.error}</div>;

  return (
    <div className="space-y-6">
      <SectionHeader title="Database Overview" subtitle="Operational stats and archive controls" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4 bg-slate-50 border-slate-200">
          <div className="text-xs uppercase tracking-wide text-slate-500">Tables</div>
          <div className="text-2xl font-bold text-slate-800">{totalTables}</div>
        </Card>
        <Card className="p-4 bg-slate-50 border-slate-200">
          <div className="text-xs uppercase tracking-wide text-slate-500">Total Rows</div>
          <div className="text-2xl font-bold text-slate-800">{totalRows.toLocaleString()}</div>
        </Card>
        <Card className="p-4 bg-emerald-50 border-emerald-200">
          <div className="text-xs uppercase tracking-wide text-emerald-600">Active Rows</div>
          <div className="text-2xl font-bold text-emerald-700">{archiveTotals.active.toLocaleString()}</div>
        </Card>
        <Card className="p-4 bg-amber-50 border-amber-200">
          <div className="text-xs uppercase tracking-wide text-amber-600">Archived Rows</div>
          <div className="text-2xl font-bold text-amber-700">{archiveTotals.archived.toLocaleString()}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Object.keys(overview).map(table => (
          <Card key={table} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-sm text-slate-800">{table}</h3>
              <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600">{overview[table].count} rows</span>
            </div>
            <details>
              <summary className="text-xs text-blue-600 cursor-pointer select-none">Show sample</summary>
              <div className="overflow-x-auto text-xs mt-2 max-h-48 border rounded bg-slate-50 p-2">
                <pre className="whitespace-pre-wrap">{JSON.stringify(overview[table].sample, null, 2)}</pre>
              </div>
            </details>
          </Card>
        ))}
      </div>

      <div className="mt-8">
        <SectionHeader title="Archived Data" subtitle="View, restore, or purge soft-archived records" />
        {archiveOverview?.error ? (
          <div className="text-red-500">{archiveOverview.error}</div>
        ) : (
          <>
            <Card className="p-4 mb-4 bg-gradient-to-r from-slate-50 to-blue-50 border-slate-200">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs font-semibold text-slate-600">Table</label>
                <div className="min-w-[260px]">
                <SearchableSelect
                  searchable
                  dropdownVariant="pills-horizontal"
                  placeholder="Select table"
                  options={sortedArchiveTables.map((table) => ({
                    value: table,
                    label: `${table} (${archiveOverview?.[table]?.archived_count ?? 0} archived)`,
                  }))}
                  value={archiveTable}
                  onChange={v => setArchiveTable(String(v))}
                />
                </div>

                <label className="text-xs font-semibold text-slate-600">Status</label>
                <div className="min-w-[220px]">
                <SearchableSelect
                  dropdownVariant="pills-horizontal"
                  options={[
                    { value: 'archived', label: 'Archived only' },
                    { value: 'active', label: 'Active only' },
                    { value: 'all', label: 'All' },
                  ]}
                  value={archiveStatus}
                  onChange={(v) => setArchiveStatus(v as 'archived' | 'active' | 'all')}
                />
                </div>

                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search row content..."
                  className="px-3 py-2 text-xs border rounded-lg bg-white min-w-[220px]"
                />

                {archiveTable && archiveOverview?.[archiveTable] && (
                  <div className="text-xs text-slate-700 font-medium">
                    Total: {archiveOverview[archiveTable].total_count} | Active: {archiveOverview[archiveTable].active_count} | Archived: {archiveOverview[archiveTable].archived_count}
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-4">
              {archiveLoading ? (
                <div className="text-sm text-slate-500">Loading archived rows...</div>
              ) : filteredRows.length === 0 ? (
                <div className="text-xs text-slate-500">No rows for this filter.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="border-b bg-slate-50 text-slate-600">
                        <th className="text-left p-2">ID</th>
                        <th className="text-left p-2">Status</th>
                        <th className="text-left p-2">Archived At</th>
                        <th className="text-left p-2">Created At</th>
                        <th className="text-left p-2">Preview</th>
                        <th className="text-right p-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row: any) => {
                        const key = `${archiveTable}-${row.id}`;
                        const expanded = expandedRowId === key;
                        return (
                          <React.Fragment key={key}>
                            <tr className="border-b hover:bg-slate-50/80 transition-colors">
                              <td className="p-2 font-semibold text-slate-700">#{row.id}</td>
                              <td className="p-2">
                                {row.deleted_at ? (
                                  <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-800">Archived</span>
                                ) : (
                                  <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">Active</span>
                                )}
                              </td>
                              <td className="p-2 text-slate-600">{prettyDate(row.deleted_at)}</td>
                              <td className="p-2 text-slate-600">{prettyDate(row.created_at)}</td>
                              <td className="p-2 text-slate-700">{rowPreview(row)}</td>
                              <td className="p-2">
                                <div className="flex justify-end items-center gap-2">
                                  <button
                                    onClick={() => setExpandedRowId(expanded ? '' : key)}
                                    className="px-2 py-1 text-xs border rounded-md bg-white text-slate-700"
                                  >
                                    {expanded ? 'Hide' : 'Details'}
                                  </button>
                                  {!!row.deleted_at && (
                                    <button
                                      onClick={() => restoreRow(archiveTable, row.id)}
                                      className="px-2 py-1 text-xs bg-emerald-600 text-white rounded-md"
                                    >
                                      Restore
                                    </button>
                                  )}
                                  <button
                                    onClick={() => purgeRow(archiveTable, row.id)}
                                    className="px-2 py-1 text-xs bg-red-600 text-white rounded-md"
                                  >
                                    Purge
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {expanded && (
                              <tr className="border-b bg-slate-50/70">
                                <td colSpan={6} className="p-2">
                                  <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(row, null, 2)}</pre>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
};
