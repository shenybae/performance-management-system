import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { Plus, X, Users, FileText, Download, Trash2 } from 'lucide-react';
import { SignatureUpload } from '../../common/SignatureUpload';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';

export const RecruitmentBoard = () => {
  const [activeForm, setActiveForm] = useState<'none' | 'requisition' | 'appraisal'>('none');
  const [applicants, setApplicants] = useState<any[]>([]);
  const [requisitions, setRequisitions] = useState<any[]>([]);
  const [reqForm, setReqForm] = useState({
    job_title: '', department: '', supervisor: '', hiring_contact: '',
    position_status: '', months_per_year: '' as any, hours_per_week: '' as any,
    start_date: '', position_type: '', type_reason: '',
    office_assignment: '',
    recruitment_web: '', recruitment_newspapers: '', recruitment_listserv: '', recruitment_other: '',
    classification: 'Exempt', hiring_range: '', hourly_rate: '',
    supervisor_approval: '', supervisor_approval_date: '', supervisor_approval_sig: '',
    dept_head_approval: '', dept_head_approval_date: '', dept_head_approval_sig: '',
    cabinet_approval: '', cabinet_approval_date: '', cabinet_approval_sig: '',
    vp_approval: '', vp_approval_date: '', vp_approval_sig: '',
    president_approval: '', president_approval_date: '', president_approval_sig: '',
    comments: ''
  });
  const [appForm, setAppForm] = useState({
    name: '', position: '', job_skills: '', asset_value: '',
    communication_skills: '', interview_impression: '',
    teamwork: '', dept_fit: '', previous_qualifications: '',
    overall_rating: 0, status: '',
    // Interview Questions
    q_experience: '', q_why_interested: '', q_strengths: '', q_weakness: '',
    q_conflict: '', q_goals: '', q_teamwork: '', q_pressure: '',
    q_contribution: '', q_questions: '',
    // Comments / Signatures
    additional_comments: '',
    interviewer_name: '', interviewer_title: '', interview_date: '', interviewer_signature: '',
    hr_reviewer_name: '', hr_reviewer_signature: '', hr_reviewer_date: '',
    recommendation: ''
  });

  useEffect(() => { fetchApplicants(); fetchRequisitions(); }, []);

  const fetchApplicants = async () => {
    try { const res = await fetch('/api/applicants', { headers: getAuthHeaders() }); const data = await res.json(); setApplicants(Array.isArray(data) ? data : []); } catch { setApplicants([]); }
  };
  const fetchRequisitions = async () => {
    try { const res = await fetch('/api/requisitions', { headers: getAuthHeaders() }); const data = await res.json(); setRequisitions(Array.isArray(data) ? data : []); } catch { setRequisitions([]); }
  };

  const submitRequisition = async () => {
    if (!reqForm.job_title) { window.notify?.('Please enter a job title', 'error'); return; }
    try {
      const res = await fetch('/api/requisitions', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(reqForm) });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Requisition submitted', 'success');
      setReqForm({
        job_title: '', department: '', supervisor: '', hiring_contact: '',
        position_status: '', months_per_year: '' as any, hours_per_week: '' as any,
        start_date: '', position_type: '', type_reason: '',
        office_assignment: '',
        recruitment_web: '', recruitment_newspapers: '', recruitment_listserv: '', recruitment_other: '',
        classification: '', hiring_range: '', hourly_rate: '',
        supervisor_approval: '', supervisor_approval_date: '', supervisor_approval_sig: '',
        dept_head_approval: '', dept_head_approval_date: '', dept_head_approval_sig: '',
        cabinet_approval: '', cabinet_approval_date: '', cabinet_approval_sig: '',
        vp_approval: '', vp_approval_date: '', vp_approval_sig: '',
        president_approval: '', president_approval_date: '', president_approval_sig: '',
        comments: ''
      });
      setActiveForm('none');
      fetchRequisitions();
    } catch { window.notify?.('Failed to submit', 'error'); }
  };

  const submitAppraisal = async () => {
    if (!appForm.name || !appForm.position) { window.notify?.('Please enter applicant name and position', 'error'); return; }
    try {
      const res = await fetch('/api/applicants', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ ...appForm, score: appForm.overall_rating }) });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Applicant appraisal saved', 'success');
      setAppForm({
        name: '', position: '', job_skills: '', asset_value: '',
        communication_skills: '', interview_impression: '',
        teamwork: '', dept_fit: '', previous_qualifications: '',
        overall_rating: 0, status: '',
        q_experience: '', q_why_interested: '', q_strengths: '', q_weakness: '',
        q_conflict: '', q_goals: '', q_teamwork: '', q_pressure: '',
        q_contribution: '', q_questions: '',
        additional_comments: '',
        interviewer_name: '', interviewer_title: '', interview_date: '', interviewer_signature: '',
        hr_reviewer_name: '', hr_reviewer_signature: '', hr_reviewer_date: '',
        recommendation: ''
      });
      setActiveForm('none');
      fetchApplicants();
    } catch { window.notify?.('Failed to save', 'error'); }
  };

  const deleteApplicant = async (id: number) => {
    if (!confirm('Delete this applicant?')) return;
    try { await fetch(`/api/applicants/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); window.notify?.('Deleted', 'success'); fetchApplicants(); } catch { window.notify?.('Failed', 'error'); }
  };

  const deleteRequisition = async (id: number) => {
    if (!confirm('Delete this requisition?')) return;
    try { await fetch(`/api/requisitions/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); window.notify?.('Deleted', 'success'); fetchRequisitions(); } catch { window.notify?.('Failed', 'error'); }
  };

  const statusCounts = applicants.reduce((acc: any, curr) => { acc[curr.status] = (acc[curr.status] || 0) + 1; return acc; }, {});
  const chartData = Object.keys(statusCounts).map(key => ({ status: key, count: statusCounts[key] }));

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-4">
        <SectionHeader title="Recruitment & Hiring Board" subtitle="Track applicants and pre-employment appraisals" />
        <div className="flex gap-2">
          <button onClick={() => exportToCSV([...applicants.map(a => ({ ...a, type: 'Applicant' })), ...requisitions.map(r => ({ ...r, type: 'Requisition' }))], 'recruitment')} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><Download size={16} /> CSV</button>
          <button onClick={() => setActiveForm(activeForm === 'requisition' ? 'none' : 'requisition')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeForm === 'requisition' ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300' : 'bg-teal-deep text-white hover:bg-teal-green'}`}>
            {activeForm === 'requisition' ? <><X size={16} /> Close</> : <><FileText size={16} /> Staff Requisition</>}
          </button>
          <button onClick={() => setActiveForm(activeForm === 'appraisal' ? 'none' : 'appraisal')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeForm === 'appraisal' ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300' : 'bg-teal-green text-white hover:bg-teal-deep'}`}>
            {activeForm === 'appraisal' ? <><X size={16} /> Close</> : <><Users size={16} /> Applicant Appraisal</>}
          </button>
        </div>
      </div>

      {activeForm === 'requisition' && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4">
          <Card>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">Staff Requisition Form</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-4 border-b dark:border-slate-800 pb-3">Complete this form when requesting to hire new staff or requesting a change in current staffing</p>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); submitRequisition(); }}>
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Job Title</label><input type="text" value={reqForm.job_title} onChange={e => setReqForm({ ...reqForm, job_title: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="e.g. Office Coordinator I" /></div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Department / Office</label><input type="text" value={reqForm.department} onChange={e => setReqForm({ ...reqForm, department: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Supervisor</label><input type="text" value={reqForm.supervisor} onChange={e => setReqForm({ ...reqForm, supervisor: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Hiring Contact (if other than supervisor)</label><input type="text" value={reqForm.hiring_contact} onChange={e => setReqForm({ ...reqForm, hiring_contact: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
              </div>

              {/* Position Status & Work Schedule */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 pt-4 border-t dark:border-slate-800">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Position Status and Work Schedule <span className="font-normal text-slate-400 normal-case">(check one)</span></h4>
                <div className="flex flex-wrap gap-4 mb-4 text-sm text-slate-600 dark:text-slate-300">
                  {['Full-time Regular', 'Part-Time Regular', 'Temporary'].map(s => (
                    <label key={s} className="flex items-center gap-2">
                      <input type="radio" name="position_status" checked={reqForm.position_status === s} onChange={() => setReqForm({ ...reqForm, position_status: s })} />
                      {s}
                    </label>
                  ))}
                </div>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-3">Please indicate the number of months to be worked and hours per week:</p>
                <div className="grid grid-cols-3 gap-4">
                  <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Months per Year</label><input type="number" value={reqForm.months_per_year} onChange={e => setReqForm({ ...reqForm, months_per_year: parseInt(e.target.value) || 0 })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                  <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Hours per Week</label><input type="number" value={reqForm.hours_per_week} onChange={e => setReqForm({ ...reqForm, hours_per_week: parseInt(e.target.value) || 0 })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                  <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Desired Start Date</label><input type="date" value={reqForm.start_date} onChange={e => setReqForm({ ...reqForm, start_date: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                </div>
              </div>

              {/* Type of Position & Office */}
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                  <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Type of Position</h4>
                  <div className="flex gap-4 text-sm text-slate-600 dark:text-slate-300 mb-2">
                    {['New', 'Replacement', 'Reclassification', 'Temporary'].map(t => (
                      <label key={t} className="flex items-center gap-2"><input type="radio" name="position_type" checked={reqForm.position_type === t} onChange={() => setReqForm({ ...reqForm, position_type: t })} /> {t}</label>
                    ))}
                  </div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1 mt-2">Reason / Justification</label>
                  <textarea rows={2} value={reqForm.type_reason} onChange={e => setReqForm({ ...reqForm, type_reason: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="Why is this position needed?" />
                </div>
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                  <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Office Assignment</h4>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Building and Room Number</label>
                  <input type="text" value={reqForm.office_assignment} onChange={e => setReqForm({ ...reqForm, office_assignment: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                </div>
              </div>

              {/* Recruitment Plan */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Recruitment Plan</h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">If approved, this position will be posted internally for at least one week. Ideas for advertising externally:</p>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Web Sites</label><input type="text" value={reqForm.recruitment_web} onChange={e => setReqForm({ ...reqForm, recruitment_web: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                  <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Newspapers</label><input type="text" value={reqForm.recruitment_newspapers} onChange={e => setReqForm({ ...reqForm, recruitment_newspapers: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                  <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">List Server</label><input type="text" value={reqForm.recruitment_listserv} onChange={e => setReqForm({ ...reqForm, recruitment_listserv: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                  <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Other</label><input type="text" value={reqForm.recruitment_other} onChange={e => setReqForm({ ...reqForm, recruitment_other: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                </div>
              </div>

              {/* Approvals */}
              <div className="pt-4 border-t dark:border-slate-800">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Approvals</h4>
                {([
                  { label: 'Supervisor Approval', nameKey: 'supervisor_approval', dateKey: 'supervisor_approval_date', sigKey: 'supervisor_approval_sig' },
                  { label: 'Department Head Approval', nameKey: 'dept_head_approval', dateKey: 'dept_head_approval_date', sigKey: 'dept_head_approval_sig' },
                  { label: 'Cabinet Member Approval', nameKey: 'cabinet_approval', dateKey: 'cabinet_approval_date', sigKey: 'cabinet_approval_sig' },
                  { label: 'V.P. for Business and Finance Approval', nameKey: 'vp_approval', dateKey: 'vp_approval_date', sigKey: 'vp_approval_sig' },
                  { label: 'President Approval', nameKey: 'president_approval', dateKey: 'president_approval_date', sigKey: 'president_approval_sig' },
                ] as const).map(row => (
                  <div key={row.label} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 mb-3">
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">{row.label}</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Printed Name</label>
                        <input type="text" value={(reqForm as any)[row.nameKey]} onChange={e => setReqForm({ ...reqForm, [row.nameKey]: e.target.value })} placeholder="Full name" className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                      </div>
                      <div>
                        <SignatureUpload
                          label="Signature"
                          value={(reqForm as any)[row.sigKey]}
                          onChange={dataUrl => setReqForm({ ...reqForm, [row.sigKey]: dataUrl })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Date</label>
                        <input type="date" value={(reqForm as any)[row.dateKey]} onChange={e => setReqForm({ ...reqForm, [row.dateKey]: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                      </div>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-slate-400 dark:text-slate-500 italic mt-2">
                  If approved, the Human Resources Specialist will begin the recruitment process and contact the requestor. If not approved, the Associate Vice President of Human Resources will contact the requestor.
                </p>
              </div>

              {/* Classification */}
              <div className="pt-4 border-t dark:border-slate-800">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Classification</h4>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                    <input type="radio" name="classification" checked={reqForm.classification === 'Exempt'} onChange={() => setReqForm({ ...reqForm, classification: 'Exempt' })} />
                    <span className="font-bold w-28">Exempt:</span>
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mr-1">Hiring Range</span>
                    <input type="text" value={reqForm.hiring_range} onChange={e => setReqForm({ ...reqForm, hiring_range: e.target.value })} disabled={reqForm.classification !== 'Exempt'} className="flex-1 p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100 disabled:opacity-40" placeholder="e.g. $40,000–$50,000" />
                  </label>
                  <label className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                    <input type="radio" name="classification" checked={reqForm.classification === 'Non-Exempt'} onChange={() => setReqForm({ ...reqForm, classification: 'Non-Exempt' })} />
                    <span className="font-bold w-28">Non-Exempt:</span>
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mr-1">Hourly Pay Rate</span>
                    <input type="text" value={reqForm.hourly_rate} onChange={e => setReqForm({ ...reqForm, hourly_rate: e.target.value })} disabled={reqForm.classification !== 'Non-Exempt'} className="flex-1 p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100 disabled:opacity-40" placeholder="e.g. $18.50/hr" />
                  </label>
                </div>
              </div>

              {/* Comments */}
              <div className="pt-4 border-t dark:border-slate-800">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Comments</label>
                <textarea rows={3} value={reqForm.comments} onChange={e => setReqForm({ ...reqForm, comments: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
              </div>

              <div className="flex justify-end pt-4"><button type="submit" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green">Submit Requisition</button></div>
            </form>
          </Card>
        </motion.div>
      )}

      {activeForm === 'appraisal' && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4">
          <Card>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">Applicant Appraisal Form</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-4 border-b dark:border-slate-800 pb-3">To be completed by each person interviewing an applicant for employment</p>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); submitAppraisal(); }}>
              {/* Applicant Info */}
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Applicant Name</label><input type="text" value={appForm.name} onChange={e => setAppForm({ ...appForm, name: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Position Applied For</label><input type="text" value={appForm.position} onChange={e => setAppForm({ ...appForm, position: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Interview Date</label><input type="date" value={appForm.interview_date} onChange={e => setAppForm({ ...appForm, interview_date: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
              </div>

              {/* Part I: Interview Questions */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Part I — Interview Questions</h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Record key points of applicant's responses below</p>
                <div className="space-y-4">
                  {[
                    { key: 'q_experience', q: '1. Tell us about your relevant experience and qualifications for this position.' },
                    { key: 'q_why_interested', q: '2. Why are you interested in this position / organization?' },
                    { key: 'q_strengths', q: '3. What do you consider to be your greatest strengths?' },
                    { key: 'q_weakness', q: '4. What area(s) do you feel you need improvement?' },
                    { key: 'q_conflict', q: '5. Describe a conflict you experienced at work and how you handled it.' },
                    { key: 'q_goals', q: '6. What are your professional goals for the next 3-5 years?' },
                    { key: 'q_teamwork', q: '7. Tell us about a time you worked as part of a team to accomplish a goal.' },
                    { key: 'q_pressure', q: '8. How do you handle pressure, tight deadlines, or multiple priorities?' },
                    { key: 'q_contribution', q: '9. What unique contributions can you bring to this role?' },
                    { key: 'q_questions', q: '10. Do you have any questions about the position or organization?' },
                  ].map(({ key, q }) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{q}</label>
                      <textarea rows={2} value={(appForm as any)[key]} onChange={e => setAppForm({ ...appForm, [key]: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="Record applicant's response..." />
                    </div>
                  ))}
                </div>
              </div>

              {/* Part II: Rating Table */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Part II — Evaluation Criteria</h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">Rate the applicant 1-5 for each area. 1 = Poor, 2 = Below Average, 3 = Average, 4 = Above Average, 5 = Excellent</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b dark:border-slate-700">
                      <th className="text-left py-2 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase w-1/3">Criteria</th>
                      {[1,2,3,4,5].map(n => <th key={n} className="text-center py-2 text-xs font-bold text-slate-500 dark:text-slate-400">{n}</th>)}
                    </tr></thead>
                    <tbody>
                      {[
                        { key: 'job_skills', label: 'Job Skills / Technical Knowledge' },
                        { key: 'communication_skills', label: 'Communication Skills (verbal & written)' },
                        { key: 'interview_impression', label: 'Interview Impression / Professionalism' },
                        { key: 'previous_qualifications', label: 'Previous Experience & Qualifications' },
                        { key: 'teamwork', label: 'Teamwork & Interpersonal Skills' },
                        { key: 'dept_fit', label: 'Department / Organizational Fit' },
                        { key: 'asset_value', label: 'Potential Value / Growth Capacity' },
                      ].map(({ key, label }) => (
                        <tr key={key} className="border-b dark:border-slate-800">
                          <td className="py-2 text-slate-700 dark:text-slate-300">{label}</td>
                          {[1,2,3,4,5].map(n => (
                            <td key={n} className="text-center py-2"><input type="radio" name={`appraisal_${key}`} checked={(appForm as any)[key] === String(n)} onChange={() => setAppForm({ ...appForm, [key]: String(n) })} /></td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Part III: Overall Rating */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Part III — Overall Rating & Recommendation</h4>
                <div className="flex flex-wrap items-center gap-6 mb-4">
                  {[
                    { v: 1, l: '1 – Poor' }, { v: 2, l: '2 – Below Average' }, { v: 3, l: '3 – Average' }, { v: 4, l: '4 – Above Average' }, { v: 5, l: '5 – Excellent' }
                  ].map(({ v, l }) => (
                    <label key={v} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><input type="radio" name="overall_rating" checked={appForm.overall_rating === v} onChange={() => setAppForm({ ...appForm, overall_rating: v })} /> {l}</label>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Recommendation</label>
                    <select value={appForm.recommendation || appForm.status} onChange={e => setAppForm({ ...appForm, recommendation: e.target.value, status: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100">
                      <option value="">Select Recommendation...</option>
                      <option value="Screening">Screening — Needs Further Review</option>
                      <option value="Shortlisted">Shortlisted — Recommend for Next Round</option>
                      <option value="Interviewing">Interviewing — In Progress</option>
                      <option value="Offer Sent">Offer Sent — Recommended for Hire</option>
                      <option value="Hired">Hired</option>
                      <option value="Rejected">Not Recommended</option>
                    </select>
                  </div>
                  <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Additional Comments</label>
                    <textarea rows={2} value={appForm.additional_comments} onChange={e => setAppForm({ ...appForm, additional_comments: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="Final remarks or notes..." />
                  </div>
                </div>
              </div>

              {/* Part IV: Signatures */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Part IV — Signatures</h4>
                {/* Interviewer */}
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 mb-3">
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">Interviewer</p>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Printed Name</label>
                      <input type="text" value={appForm.interviewer_name} onChange={e => setAppForm({ ...appForm, interviewer_name: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Title</label>
                      <input type="text" value={appForm.interviewer_title} onChange={e => setAppForm({ ...appForm, interviewer_title: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                    </div>
                    <div>
                      <SignatureUpload
                        label="Interviewer Signature"
                        value={appForm.interviewer_signature}
                        onChange={dataUrl => setAppForm(prev => ({ ...prev, interviewer_signature: dataUrl }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Date</label>
                      <input type="date" value={appForm.interview_date} onChange={e => setAppForm({ ...appForm, interview_date: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                    </div>
                  </div>
                </div>
                {/* HR Reviewer */}
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">HR Reviewer</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Printed Name</label>
                      <input type="text" value={appForm.hr_reviewer_name} onChange={e => setAppForm({ ...appForm, hr_reviewer_name: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                    </div>
                    <div>
                      <SignatureUpload
                        label="HR Reviewer Signature"
                        value={appForm.hr_reviewer_signature}
                        onChange={dataUrl => setAppForm(prev => ({ ...prev, hr_reviewer_signature: dataUrl }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Date</label>
                      <input type="date" value={appForm.hr_reviewer_date} onChange={e => setAppForm({ ...appForm, hr_reviewer_date: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4"><button type="submit" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green">Save Appraisal</button></div>
            </form>
          </Card>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="md:col-span-2">
          <Card>
            <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">Applicant Pipeline</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="status" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} /><Tooltip /><Bar dataKey="count" fill="#0f766e" radius={[4, 4, 0, 0]} /></BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
        <Card>
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">Applicants ({applicants.length})</h3>
          <div className="space-y-4 overflow-y-auto h-64 pr-2 custom-scrollbar">
            {applicants.map(app => (
              <div key={app.id} className="p-3 border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-bold text-slate-700 dark:text-slate-200 text-sm">{app.name}</span>
                  <div className="flex items-center gap-2"><span className="text-[10px] font-bold text-teal-green">{app.score || app.overall_rating}/5</span><button onClick={() => deleteApplicant(app.id)} className="text-red-400 hover:text-red-600"><Trash2 size={12} /></button></div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{app.position}</p>
                <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 mt-1">{app.status}</p>
              </div>
            ))}
            {applicants.length === 0 && <p className="text-xs text-slate-400 text-center py-8">No applicants yet</p>}
          </div>
        </Card>
      </div>

      {requisitions.length > 0 && (
        <Card>
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">Open Requisitions ({requisitions.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase">Job Title</th>
                <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase">Department</th>
                <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase">Status</th>
                <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase">Start Date</th>
                <th className="pb-2"></th>
              </tr></thead>
              <tbody>{requisitions.map(r => (
                <tr key={r.id} className="border-b border-slate-50 dark:border-slate-800/50">
                  <td className="py-3 font-medium text-slate-700 dark:text-slate-200">{r.job_title}</td>
                  <td className="py-3 text-slate-500 dark:text-slate-400">{r.department}</td>
                  <td className="py-3 text-xs font-bold text-teal-green uppercase">{r.position_status}</td>
                  <td className="py-3 text-xs text-slate-500">{r.start_date || 'TBD'}</td>
                  <td className="py-3"><button onClick={() => deleteRequisition(r.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
      )}
    </motion.div>
  );
};
