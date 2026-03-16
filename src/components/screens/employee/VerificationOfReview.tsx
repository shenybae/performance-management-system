import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { Download, CheckCircle, XCircle, FileCheck } from 'lucide-react';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';
import { SignatureUpload } from '../../common/SignatureUpload';

export const VerificationOfReview = () => {
  const [appraisals, setAppraisals] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [signature, setSignature] = useState('');
  const [rebuttal, setRebuttal] = useState('');
  const user = JSON.parse(localStorage.getItem('talentflow_user') || localStorage.getItem('user') || '{}');

  useEffect(() => { fetchAppraisals(); }, []);

  const fetchAppraisals = async () => {
    try {
      const res = await fetch('/api/appraisals', { headers: getAuthHeaders() });
      const data = await res.json();
      const mine = Array.isArray(data) ? data.filter((a: any) => a.employee_id === (user.employee_id || user.id)) : [];
      setAppraisals(mine);
    } catch { setAppraisals([]); }
  };

  const verifyReview = async (id: number) => {
    if (!signature) { window.notify?.('Please provide your signature to verify', 'error'); return; }
    try {
      const res = await fetch(`/api/appraisals/${id}`, {
        method: 'PUT', headers: getAuthHeaders(),
        body: JSON.stringify({
          employee_signature: signature,
          employee_signature_date: new Date().toISOString().split('T')[0],
          employee_acknowledgement: rebuttal || 'Acknowledged',
          verified: 1
        })
      });
      if (res.ok) {
        window.notify?.('Review verified successfully', 'success');
        setSignature(''); setRebuttal(''); setExpandedId(null);
        fetchAppraisals();
      }
    } catch { window.notify?.('Failed to verify review', 'error'); }
  };

  const scoreColor = (score: number) => score >= 4 ? 'text-emerald-600' : score >= 3 ? 'text-teal-600' : score >= 2 ? 'text-amber-600' : 'text-red-600';

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-4">
        <SectionHeader title="Verification of Review" subtitle="Review and digitally verify your manager's evaluation" />
        <button onClick={() => exportToCSV(appraisals, 'my_reviews')} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><Download size={16} /> CSV</button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-500"><FileCheck size={18} className="text-white" /></div>
            <div><p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Total Reviews</p><p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{appraisals.length}</p></div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-500"><CheckCircle size={18} className="text-white" /></div>
            <div><p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Verified</p><p className="text-2xl font-bold text-emerald-600">{appraisals.filter(a => a.employee_signature).length}</p></div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-500"><XCircle size={18} className="text-white" /></div>
            <div><p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Pending</p><p className="text-2xl font-bold text-amber-600">{appraisals.filter(a => !a.employee_signature).length}</p></div>
          </div>
        </Card>
      </div>

      {/* Reviews List */}
      <div className="space-y-4">
        {appraisals.map(a => (
          <Card key={a.id}>
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-bold text-slate-800 dark:text-slate-100">{a.form_type || a.eval_type || 'Performance Evaluation'}</h3>
                  {a.employee_signature ? (
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full uppercase flex items-center gap-1"><CheckCircle size={10} /> Verified</span>
                  ) : (
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full uppercase">Pending Verification</span>
                  )}
                </div>
                <div className="flex gap-6 text-xs text-slate-500 dark:text-slate-400">
                  <span>Date: {a.sign_off_date || a.created_at?.split('T')[0] || '—'}</span>
                  {a.eval_period_from && <span>Period: {a.eval_period_from} → {a.eval_period_to}</span>}
                  <span>Status: {a.promotability_status || '—'}</span>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-3xl font-bold ${scoreColor(a.overall || 0)}`}>{a.overall || '—'}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Overall</p>
              </div>
            </div>

            {/* Scores Grid */}
            <div className="grid grid-cols-5 gap-3 mt-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
              {[
                { label: 'Job Knowledge', val: a.job_knowledge },
                { label: 'Productivity', val: a.productivity },
                { label: 'Attendance', val: a.attendance },
                { label: 'Communication', val: a.communication },
                { label: 'Dependability', val: a.dependability },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className={`text-lg font-bold ${scoreColor(s.val || 0)}`}>{s.val || '—'}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Manager's Comments */}
            {(a.supervisors_overall_comment || a.employee_goals || a.additional_comments) && (
              <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg space-y-2">
                {a.supervisors_overall_comment && <p className="text-xs text-slate-600 dark:text-slate-300"><strong className="text-slate-500">Supervisor's Comment:</strong> {a.supervisors_overall_comment}</p>}
                {a.employee_goals && <p className="text-xs text-slate-600 dark:text-slate-300"><strong className="text-slate-500">Goals for Next Period:</strong> {a.employee_goals}</p>}
                {a.additional_comments && <p className="text-xs text-slate-600 dark:text-slate-300"><strong className="text-slate-500">Additional Comments:</strong> {a.additional_comments}</p>}
              </div>
            )}

            {/* Verification Section */}
            {!a.employee_signature && (
              <div className="mt-4">
                {expandedId === a.id ? (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="border-t dark:border-slate-700 pt-4 space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Comments / Rebuttal (Optional)</label>
                      <textarea rows={2} value={rebuttal} onChange={e => setRebuttal(e.target.value)} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="Add your comments, agreement, or rebuttal to the evaluation..." />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Digital Signature (Required)</label>
                      <SignatureUpload label="Employee Signature" value={signature} onChange={(val) => setSignature(val)} />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => { setExpandedId(null); setSignature(''); setRebuttal(''); }} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">Cancel</button>
                      <button onClick={() => verifyReview(a.id)} className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors">
                        <CheckCircle size={16} /> Verify & Sign
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <button onClick={() => setExpandedId(a.id)} className="flex items-center gap-2 text-sm font-bold text-teal-deep dark:text-teal-green hover:underline">
                    <FileCheck size={16} /> Click to Review & Verify
                  </button>
                )}
              </div>
            )}

            {/* Already verified */}
            {a.employee_signature && a.employee_acknowledgement && (
              <div className="mt-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-100 dark:border-emerald-800">
                <p className="text-xs text-emerald-700 dark:text-emerald-400"><strong>Your Response:</strong> {a.employee_acknowledgement}</p>
                <p className="text-[10px] text-emerald-500 mt-1">Signed on {a.employee_signature_date || '—'}</p>
              </div>
            )}
          </Card>
        ))}

        {appraisals.length === 0 && (
          <Card>
            <div className="py-12 text-center text-slate-400">
              <FileCheck size={48} className="mx-auto mb-4 opacity-30" />
              <p className="font-bold text-lg mb-1">No Reviews Yet</p>
              <p className="text-sm">Your manager's evaluations will appear here for your review and verification.</p>
            </div>
          </Card>
        )}
      </div>
    </motion.div>
  );
};
