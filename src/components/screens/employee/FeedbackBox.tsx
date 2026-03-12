import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Card } from '../../common/Card';
import Modal from '../../common/Modal';
import { SearchableSelect } from '../../common/SearchableSelect';
import { Plus, Download, Trash2, Eye } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
  LabelList,
} from 'recharts';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';
import { Employee } from '../../../types';

interface FeedbackBoxProps {
  employees?: Employee[];
  users?: any[];
}

const subjects = [
  { key: 'job_knowledge', label: 'Job Knowledge' },
  { key: 'work_quality', label: 'Work Quality' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'productivity', label: 'Productivity' },
  { key: 'communication', label: 'Communication' },
  { key: 'dependability', label: 'Dependability' },
];

const COLORS = ['#0f766e', '#0891b2', '#60a5fa', '#f97316', '#ef4444', '#a78bfa', '#f472b6'];

const ScoreSelect: React.FC<{ label: string; field: string; form: any; setFn: any }> = ({ label, field, form, setFn }) => (
  <div>
    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">{label}</label>
    <select
      value={form[field]}
      onChange={e => setFn({ ...form, [field]: Number(e.target.value) })}
      className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100"
    >
      <option value={0}>0</option>
      <option value={1}>1</option>
      <option value={2}>2</option>
      <option value={3}>3</option>
      <option value={4}>4</option>
      <option value={5}>5</option>
    </select>
  </div>
);

export const FeedbackBox: React.FC<FeedbackBoxProps> = ({ employees = [], users = [] }) => {
  const [showForm, setShowForm] = useState(false);
  const [feedback360, setFeedback360] = useState<any[]>([]);
  const user = JSON.parse(localStorage.getItem('talentflow_user') || localStorage.getItem('user') || '{}');
  const [usersList, setUsersList] = useState<any[]>(users || []);

  const [fbForm, setFbForm] = useState({
    target_employee_name: '',
    relationship: '',
    job_knowledge: 0,
    work_quality: 0,
    attendance: 0,
    productivity: 0,
    communication: 0,
    dependability: 0,
    strengths: '',
    improvements: '',
  });

  const [viewItem, setViewItem] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const [personFilter, setPersonFilter] = useState('');

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (!users || users.length === 0) {
      (async () => {
        try {
          const r = await fetch('/api/users', { headers: getAuthHeaders() });
          const d = await r.json();
          setUsersList(Array.isArray(d) ? d : []);
        } catch (err) {
          setUsersList([]);
        }
      })();
    } else {
      setUsersList(users);
    }
  }, [users]);

  const fetchData = async () => {
    try {
      const r = await fetch('/api/feedback_360', { headers: getAuthHeaders() });
      const d = await r.json();
      setFeedback360(Array.isArray(d) ? d : []);
    } catch (err) {
      setFeedback360([]);
    }
  };

  const submitFeedback = async () => {
    if (!fbForm.target_employee_name.trim()) {
      window.notify?.('Please enter employee name', 'error');
      return;
    }
    try {
      const res = await fetch('/api/feedback_360', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ ...fbForm, evaluator_id: user.employee_id || user.id }) });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('360 Feedback submitted', 'success');
      setFbForm({ target_employee_name: '', relationship: '', job_knowledge: 0, work_quality: 0, attendance: 0, productivity: 0, communication: 0, dependability: 0, strengths: '', improvements: '' });
      setShowForm(false);
      fetchData();
    } catch {
      window.notify?.('Failed to submit', 'error');
    }
  };

  const deleteFeedback = async (id: number) => {
    if (!confirm('Delete?')) return;
    try {
      await fetch(`/api/feedback_360/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      window.notify?.('Deleted', 'success');
      fetchData();
    } catch {
      window.notify?.('Failed', 'error');
    }
  };

  const openView = (item: any) => setViewItem(item);
  const closeView = () => setViewItem(null);

  const personOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string }>();
    (usersList || []).forEach(u => {
      const base = u.full_name || u.employee_name || u.email || u.username || `ID ${u.id || ''}`;
      const role = u.role || u.position || '';
      const label = role ? `${base} (${role})` : base;
      if (!map.has(base)) map.set(base, { value: base, label });
    });
    (employees || []).forEach(e => {
      const base = e.name || e.full_name || '';
      if (!base) return;
      if (!map.has(base)) map.set(base, { value: base, label: base });
    });
    return Array.from(map.values());
  }, [usersList, employees]);

  const avgScores = useMemo(() => {
    if (feedback360.length === 0) return [];
    return subjects.map(s => ({ subject: s.label, avg: +(feedback360.reduce((a: number, b: any) => a + (Number(b[s.key]) || 0), 0) / feedback360.length).toFixed(1) }));
  }, [feedback360]);

  const radarData = avgScores.map(s => ({ subject: s.subject, A: s.avg }));

  const trendData = useMemo(() => {
    const m = new Map<string, { month: string; total: number; count: number }>();
    feedback360.forEach(f => {
      if (!f.created_at) return;
      const d = new Date(f.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const avg = (Number(f.job_knowledge || 0) + Number(f.work_quality || 0) + Number(f.attendance || 0) + Number(f.productivity || 0) + Number(f.communication || 0) + Number(f.dependability || 0)) / subjects.length;
      const cur = m.get(key) || { month: key, total: 0, count: 0 };
      cur.total += avg;
      cur.count += 1;
      m.set(key, cur);
    });
    return Array.from(m.values()).sort((a, b) => a.month.localeCompare(b.month)).map(x => ({ month: x.month, avg: +(x.total / x.count).toFixed(2) }));
  }, [feedback360]);

  const distributionStackData = useMemo(() => {
    return subjects.map(s => {
      const counts: any = { subject: s.label, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
      feedback360.forEach(f => {
        const val = Math.max(1, Math.min(5, Math.round(Number(f[s.key] || 0)) || 1));
        counts[String(val)] = (counts[String(val)] || 0) + 1;
      });
      return counts;
    });
  }, [feedback360]);

  const ratingLegendPayload = [
    { value: '5', id: '5', color: '#ef4444' },
    { value: '4', id: '4', color: '#f97316' },
    { value: '3', id: '3', color: '#60a5fa' },
    { value: '2', id: '2', color: '#0891b2' },
    { value: '1', id: '1', color: '#0f766e' },
  ];

  const relationData = useMemo(() => {
    const agg: any = {};
    feedback360.forEach(f => {
      const r = (f.relationship || 'Unknown');
      agg[r] = (agg[r] || 0) + 1;
    });
    return Object.entries(agg).map(([name, value]) => ({ name, value }));
  }, [feedback360]);

  const strengthsTop = useMemo(() => {
    const stop = new Set(['the', 'and', 'with', 'for', 'that', 'this', 'is', 'a', 'an', 'to', 'of', 'in', 'on', 'be', 'are']);
    const counts: any = {};
    feedback360.forEach(f => {
      const txt = (f.strengths || '').toString();
      txt.split(/\W+/).map(w => w.toLowerCase()).filter(w => w && w.length > 2 && !stop.has(w)).forEach(w => counts[w] = (counts[w] || 0) + 1);
    });
    return Object.entries(counts).sort((a: any, b: any) => b[1] - a[1]).slice(0, 8).map(([word, count]) => ({ word, count }));
  }, [feedback360]);

  const overallAvg = useMemo(() => {
    if (!avgScores || avgScores.length === 0) return 0;
    return +(avgScores.reduce((s, a) => s + (a.avg || 0), 0) / avgScores.length).toFixed(1);
  }, [avgScores]);

  const totalResponses = feedback360.length;

  const uniqueTargets = useMemo(() => {
    return new Set(feedback360.map(f => f.target_employee_name)).size;
  }, [feedback360]);

  // normalize names by removing trailing role suffixes like " (Employee)", collapsing spaces and lowercasing
  const normalizeName = (s: any) => {
    if (!s) return '';
    return s.toString().replace(/\s*\(.*\)\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
  };

  const applyPersonFilterFrom = (name: any) => {
    const opt = personOptions.find(o => normalizeName(o.value) === normalizeName(name) || normalizeName(o.label) === normalizeName(name));
    if (opt) setPersonFilter(opt.value);
    else setPersonFilter((name || '').toString());
  };

  const visibleFeedback = useMemo(() => {
    return feedback360.filter(f => {
      if (personFilter) {
        const pf = normalizeName(personFilter);
        const fn = normalizeName(f.target_employee_name);
        if (pf !== fn) return false;
      }
      if (search) {
        const s = search.toLowerCase();
        if ((f.strengths || '').toString().toLowerCase().includes(s)) return true;
        if ((f.improvements || '').toString().toLowerCase().includes(s)) return true;
        if ((f.target_employee_name || '').toString().toLowerCase().includes(s)) return true;
        return false;
      }
      return true;
    });
  }, [feedback360, personFilter, search]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">360° Feedback</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowForm(s => !s)} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><Plus size={14} /> New</button>
          <button onClick={() => exportToCSV(feedback360, 'feedback_360')} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><Download size={14} /> CSV</button>
        </div>
      </div>

      {showForm && (
        <Card className="mb-4">
          <form onSubmit={e => { e.preventDefault(); submitFeedback(); }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Person</label>
                {personOptions.length > 0 ? (
                  <SearchableSelect
                    options={personOptions}
                    value={fbForm.target_employee_name}
                    onChange={v => setFbForm({ ...fbForm, target_employee_name: v })}
                    placeholder="Select Person..."
                  />
                ) : (
                  <input type="text" value={fbForm.target_employee_name} onChange={e => setFbForm({ ...fbForm, target_employee_name: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Relationship</label>
                <select value={fbForm.relationship} onChange={e => setFbForm({ ...fbForm, relationship: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100">
                  <option value="">Select Relationship...</option>
                  <option>Peer</option>
                  <option>Supervisor</option>
                  <option>Subordinate</option>
                  <option>Self</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              {subjects.map(s => <ScoreSelect key={s.key} label={s.label} field={s.key} form={fbForm} setFn={setFbForm} />)}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Strengths</label>
                <textarea rows={2} value={fbForm.strengths} onChange={e => setFbForm({ ...fbForm, strengths: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Areas for Improvement</label>
                <textarea rows={2} value={fbForm.improvements} onChange={e => setFbForm({ ...fbForm, improvements: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
              </div>
            </div>

            <div className="flex justify-end"><button type="submit" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green">Submit Feedback</button></div>
          </form>
        </Card>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <div className="text-xs text-slate-500 uppercase font-bold mb-2">Total Responses</div>
          <div className="text-2xl font-black">{totalResponses}</div>
          <div className="text-xs text-slate-400">Feedback entries</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 uppercase font-bold mb-2">Average Score</div>
          <div className="text-2xl font-black">{overallAvg}</div>
          <div className="text-xs text-slate-400">Avg across categories</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 uppercase font-bold mb-2">Unique People</div>
          <div className="text-2xl font-black">{uniqueTargets}</div>
          <div className="text-xs text-slate-400">Receivers</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 uppercase font-bold mb-2">KPI</div>
          <div className="text-2xl font-black">{avgScores.length > 0 ? avgScores[0].avg : '—'}</div>
          <div className="text-xs text-slate-400">Snapshot</div>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <h4 className="text-sm font-bold text-slate-600 mb-3">Rating distribution</h4>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distributionStackData} layout="vertical" margin={{ right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="subject" type="category" width={140} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey={'5'} stackId="a" fill="#ef4444" />
                <Bar dataKey={'4'} stackId="a" fill="#f97316" />
                <Bar dataKey={'3'} stackId="a" fill="#60a5fa" />
                <Bar dataKey={'2'} stackId="a" fill="#0891b2" />
                <Bar dataKey={'1'} stackId="a" fill="#0f766e" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h4 className="text-sm font-bold text-slate-600 mb-3">Average by Category</h4>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={avgScores} layout="vertical" margin={{ right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 5]} />
                <YAxis dataKey="subject" type="category" width={140} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="avg" fill="#0f766e" radius={[0, 8, 8, 0]}>
                  <LabelList dataKey="avg" position="right" offset={8} formatter={(v: any) => v} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h4 className="text-sm font-bold text-slate-600 mb-3">By Relationship</h4>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={relationData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label>
                  {relationData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend layout="horizontal" verticalAlign="bottom" align="center" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Large radar / overview */}
      <Card className="mb-6">
        <h4 className="text-sm font-bold text-slate-600 mb-3">Category Radar</h4>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius={110}>
              <PolarGrid />
              <PolarAngleAxis dataKey="subject" />
              <PolarRadiusAxis domain={[0, 5]} />
              <Radar name="Avg" dataKey="A" stroke="#0f766e" fill="#0f766e" fillOpacity={0.6} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Filters + search */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="text-xs font-bold bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">All Feedback ({feedback360.length})</div>
          <div className="min-w-[220px]"><SearchableSelect options={personOptions} value={personFilter} onChange={v => setPersonFilter(v)} placeholder="Filter by person" /></div>
        </div>

        <div className="flex items-center gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search strengths or names..." className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm" />
          <select className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm" onChange={e => { /* future */ }}>
            <option value="">All relationships</option>
            <option>Peer</option>
            <option>Supervisor</option>
            <option>Subordinate</option>
            <option>Self</option>
          </select>
        </div>
      </div>

      {/* Records table (full width) */}
      <Card>
        <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-4">360° Feedback Records</h3>
        <div className="overflow-auto max-h-[560px]">
          <table className="w-full text-left feedback-table min-w-[760px]">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="py-2 text-sm font-semibold text-slate-500 uppercase min-w-[140px]">Employee</th>
                <th className="py-2 text-sm font-semibold text-slate-500 uppercase">Relationship</th>
                <th className="py-2 text-sm font-semibold text-slate-500 uppercase">Knowledge</th>
                <th className="py-2 text-sm font-semibold text-slate-500 uppercase">Quality</th>
                <th className="py-2 text-sm font-semibold text-slate-500 uppercase">Communication</th>
                <th className="py-2 text-sm font-semibold text-slate-500 uppercase min-w-[220px]">Strengths</th>
                <th className="py-2 text-sm font-semibold text-slate-500 uppercase min-w-[200px]">Improvements</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {visibleFeedback.map(f => (
                <tr key={f.id} className={`border-b border-slate-50 dark:border-slate-800/50 ${personFilter && normalizeName(f.target_employee_name) === normalizeName(personFilter) ? 'bg-teal-50/30' : ''}`}>
                  <td onClick={() => applyPersonFilterFrom(f.target_employee_name)} className="py-3 font-medium text-sm text-slate-700 dark:text-slate-200 min-w-[140px] cursor-pointer">{f.target_employee_name}</td>
                  <td className="py-3 text-sm text-slate-500">{f.relationship}</td>
                  <td className="py-3 text-sm font-bold text-slate-700 dark:text-slate-200">{f.job_knowledge}</td>
                  <td className="py-3 text-sm font-bold text-slate-700 dark:text-slate-200">{f.work_quality}</td>
                  <td className="py-3 text-sm font-bold text-slate-700 dark:text-slate-200">{f.communication}</td>
                  <td className="py-3 text-sm text-slate-500 max-w-[480px] truncate" title={f.strengths || undefined}>{f.strengths}</td>
                  <td className="py-3 text-sm text-slate-500 max-w-[480px] truncate" title={f.improvements || undefined}>{f.improvements}</td>
                  <td className="py-3"><div className="flex items-center gap-3"><button onClick={() => openView(f)} title="View" className="text-slate-600 hover:text-slate-800"><Eye size={16} /></button><button onClick={() => deleteFeedback(f.id)} title="Delete" className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button></div></td>
                </tr>
              ))}
              {visibleFeedback.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-sm text-slate-400">No feedback matches your filters.</td>
                </tr>
              )}
            </tbody>
          </table>
          {feedback360.length === 0 && <p className="text-center text-sm text-slate-400 py-6">No feedback records yet</p>}
        </div>
      </Card>

      {viewItem && (
        <Modal open={!!viewItem} title={`360 Feedback — ${viewItem.target_employee_name || ''}`} onClose={closeView}>
          <div className="space-y-3 text-sm text-slate-700 dark:text-slate-200">
            <div className="grid grid-cols-2 gap-4">
              <div><strong>Person:</strong> <div className="font-medium">{viewItem.target_employee_name}</div></div>
              <div><strong>Evaluator:</strong> <div className="font-medium">{(usersList || []).find((u: any) => u.id === viewItem.evaluator_id)?.full_name || (usersList || []).find((u: any) => u.id === viewItem.evaluator_id)?.username || `ID ${viewItem.evaluator_id || 'N/A'}`}</div></div>
            </div>
            <div><strong>Relationship:</strong> <span className="font-medium">{viewItem.relationship || '-'}</span></div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div><strong>Job Knowledge:</strong> <div className="font-bold text-slate-800 dark:text-slate-100">{viewItem.job_knowledge}</div></div>
              <div><strong>Work Quality:</strong> <div className="font-bold text-slate-800 dark:text-slate-100">{viewItem.work_quality}</div></div>
              <div><strong>Attendance:</strong> <div className="font-bold text-slate-800 dark:text-slate-100">{viewItem.attendance}</div></div>
              <div><strong>Productivity:</strong> <div className="font-bold text-slate-800 dark:text-slate-100">{viewItem.productivity}</div></div>
              <div><strong>Communication:</strong> <div className="font-bold text-slate-800 dark:text-slate-100">{viewItem.communication}</div></div>
              <div><strong>Dependability:</strong> <div className="font-bold text-slate-800 dark:text-slate-100">{viewItem.dependability}</div></div>
            </div>
            <div>
              <strong>Strengths:</strong>
              <div className="mt-1 p-2 bg-slate-50 dark:bg-slate-900 rounded text-sm">{viewItem.strengths || '-'}</div>
            </div>
            <div>
              <strong>Areas for Improvement:</strong>
              <div className="mt-1 p-2 bg-slate-50 dark:bg-slate-900 rounded text-sm">{viewItem.improvements || '-'}</div>
            </div>
            <div className="text-xs text-slate-500">Submitted: {viewItem.created_at ? new Date(viewItem.created_at).toLocaleString() : 'Unknown'}</div>
          </div>
        </Modal>
      )}
    </motion.div>
  );
};

export default FeedbackBox;
