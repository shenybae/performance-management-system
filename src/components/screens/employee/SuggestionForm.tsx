import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { SearchableSelect } from '../../common/SearchableSelect';
import {
  Plus, X, Download, Lightbulb, ArrowLeft, Eye, Star, FileText, Archive,
  ChevronDown, ChevronUp, CheckCircle2, Clock, AlertTriangle, Send
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';
import { Employee } from '../../../types';
import { appConfirm } from '../../../utils/appDialog';

type ViewMode = 'dashboard' | 'newForm' | 'viewDetail';

interface SuggestionFormProps {
  employees?: Employee[];
}

export const SuggestionForm = ({ employees = [] }: SuggestionFormProps) => {
  const [view, setView] = useState<ViewMode>('dashboard');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<any>(null);
  const [filterEmployee, setFilterEmployee] = useState('');
  const user = JSON.parse(localStorage.getItem('talentflow_user') || localStorage.getItem('user') || '{}');
  const isManagement = user.role === 'HR' || user.role === 'Manager';
  const actorDept = String(user?.dept || '').trim().toLowerCase();

  // Employee form fields
  const emptyForm = {
    employee_name: '', position: '', dept: '', date: '',
    title: '', concern: '',
    labor_needed: '', materials_needed: '', equipment_needed: '', capital_needed: '',
    other_resource_needed: '', estimated_cost: '',
    desired_benefit: '', total_financial_benefit: '',
    planning_step_1: '', planning_step_2: '', planning_step_3: '', estimated_time: '',
  };
  const [form, setForm] = useState(emptyForm);

  // Management review fields
  const emptyMgmt = {
    supervisor_name: '', supervisor_title: '', date_received: '', follow_up_date: '',
    suggestion_merit: '', benefit_to_company: '', cost_to_company: '',
    cost_efficient_explanation: '', suggestion_priority: 0,
    action_to_be_taken: '', suggested_reward: '',
    supervisor_signature: '', supervisor_signature_date: '', status: '',
  };
  const [mgmtForm, setMgmtForm] = useState(emptyMgmt);

  const parseISODate = (value: string) => {
    if (!value) return null;
    const dt = new Date(value);
    return Number.isNaN(dt.getTime()) ? null : dt;
  };

  const isValidMoneyInput = (value: string) => {
    const v = (value || '').toString().trim();
    if (!v) return true;
    return /^\d+(\.\d{1,2})?$/.test(v);
  };

  const validateSuggestionForm = () => {
    const concern = form.concern.trim();
    if (!concern) return 'Please describe your concern/suggestion';
    if (concern.length < 20) return 'Suggestion details must be at least 20 characters';
    if (concern.length > 2000) return 'Suggestion details must be 2000 characters or less';
    if (!isValidMoneyInput(form.estimated_cost)) return 'Estimated cost must be a valid amount (up to 2 decimals)';
    if (!isValidMoneyInput(form.total_financial_benefit)) return 'Estimated financial benefit must be a valid amount (up to 2 decimals)';
    return null;
  };

  const validateManagementForm = (data: typeof emptyMgmt) => {
    if (data.suggestion_priority && (data.suggestion_priority < 1 || data.suggestion_priority > 5)) {
      return 'Suggestion priority must be between 1 and 5';
    }
    const received = parseISODate(data.date_received);
    const followUp = parseISODate(data.follow_up_date);
    if (received && followUp && followUp < received) {
      return 'Follow-up date cannot be earlier than date received';
    }
    if ((data.suggestion_merit || '').trim().length > 2000) return 'Suggestion merit is too long';
    if ((data.action_to_be_taken || '').trim().length > 1000) return 'Action to be taken is too long';
    if ((data.suggested_reward || '').trim().length > 500) return 'Suggested reward is too long';
    return null;
  };

  const isEmployeeFormValid = () => !validateSuggestionForm();

  useEffect(() => { fetchSuggestions(); }, []);

  const fetchSuggestions = async () => {
    try {
      const r = await fetch('/api/suggestions', { headers: getAuthHeaders() });
      const d = await r.json();
      setSuggestions(Array.isArray(d) ? d : []);
    } catch { setSuggestions([]); }
  };

  const submitSuggestion = async () => {
    const formErr = validateSuggestionForm();
    if (formErr) { window.notify?.(formErr, 'error'); return; }
    const managementErr = isManagement ? validateManagementForm(mgmtForm) : null;
    if (managementErr) { window.notify?.(managementErr, 'error'); return; }
    try {
      const payload: any = { ...form, employee_id: user.employee_id || user.id };
      payload.employee_signature = null;
      payload.employee_signature_date = null;
      // Include management fields if manager/HR filled them
      if (isManagement) {
        Object.assign(payload, mgmtForm);
      }
      const res = await fetch('/api/suggestions', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Suggestion submitted successfully', 'success');
      setForm(emptyForm);
      if (isManagement) setMgmtForm(emptyMgmt);
      setView('dashboard');
      fetchSuggestions();
    } catch { window.notify?.('Failed to submit suggestion', 'error'); }
  };

  const submitManagementReview = async () => {
    if (!selectedSuggestion) return;
    const managementErr = validateManagementForm(mgmtForm);
    if (managementErr) { window.notify?.(managementErr, 'error'); return; }
    try {
      const res = await fetch(`/api/suggestions/${selectedSuggestion.id}/management`, {
        method: 'PUT', headers: getAuthHeaders(),
        body: JSON.stringify(mgmtForm),
      });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Management review saved', 'success');
      fetchSuggestions();
      // Refresh selected suggestion
      const updated = { ...selectedSuggestion, ...mgmtForm };
      setSelectedSuggestion(updated);
    } catch { window.notify?.('Failed to save review', 'error'); }
  };


  const deleteSuggestion = async (id: number) => {
    if (!(await appConfirm('Archive this suggestion?', { title: 'Archive Suggestion', confirmText: 'Archive' }))) return;
    try {
      await fetch(`/api/suggestions/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      window.notify?.('Suggestion archived', 'success');
      fetchSuggestions();
      if (selectedSuggestion?.id === id) setView('dashboard');
    } catch { window.notify?.('Failed to archive', 'error'); }
  };

  const openDetail = (s: any) => {
    setSelectedSuggestion(s);
    setMgmtForm({
      supervisor_name: s.supervisor_name || '', supervisor_title: s.supervisor_title || '',
      date_received: s.date_received || '', follow_up_date: s.follow_up_date || '',
      suggestion_merit: s.suggestion_merit || '', benefit_to_company: s.benefit_to_company || '',
      cost_to_company: s.cost_to_company || '', cost_efficient_explanation: s.cost_efficient_explanation || '',
      suggestion_priority: s.suggestion_priority || 0, action_to_be_taken: s.action_to_be_taken || '',
      suggested_reward: s.suggested_reward || '', supervisor_signature: s.supervisor_signature || '',
      supervisor_signature_date: s.supervisor_signature_date || '', status: s.status || 'Under Review',
    });
    setView('viewDetail');
  };

  // Chart: suggestions by month
  const monthlyCounts: Record<string, number> = {};
  suggestions.forEach(s => {
    const month = s.created_at ? new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : 'Unknown';
    monthlyCounts[month] = (monthlyCounts[month] || 0) + 1;
  });
  const chartData = Object.keys(monthlyCounts).map(k => ({ month: k, count: monthlyCounts[k] }));

  const statusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'approved': return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600';
      case 'reviewed': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-600';
      case 'rejected': return 'bg-red-100 dark:bg-red-900/30 text-red-600';
      default: return 'bg-amber-100 dark:bg-amber-900/30 text-amber-600';
    }
  };

  const inputClass = "w-full p-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-sm dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-green/40 transition-all";
  const labelClass = "block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5";
  const scopedEmployees = isManagement && actorDept
    ? employees.filter((e) => String(e?.dept || '').trim().toLowerCase() === actorDept)
    : employees;
  const normalizedSupervisorCandidates = scopedEmployees.filter(e => String(e?.position || '').toLowerCase().includes('supervisor'));
  const supervisorCandidates = normalizedSupervisorCandidates.length > 0 ? normalizedSupervisorCandidates : scopedEmployees;
  const supervisorOptions = supervisorCandidates.map(e => ({
    value: e.name,
    label: e.name,
    avatarUrl: (e as any).profile_picture || null,
  }));

  const applySupervisorSelection = (supervisorName: any) => {
    const selectedName = String(supervisorName || '');
    const selected = supervisorCandidates.find(e => e.name === selectedName);
    setMgmtForm({
      ...mgmtForm,
      supervisor_name: selectedName,
      supervisor_title: selected?.position || mgmtForm.supervisor_title,
    });
  };

  const initializeSupervisorForEmployee = (employeeIdRaw: any) => {
    const employeeId = String(employeeIdRaw || '');
    const selectedEmployee = scopedEmployees.find((e) => String(e.id) === employeeId);
    if (!selectedEmployee) return;

    const employeeDept = String((selectedEmployee as any).dept || '').trim().toLowerCase();
    let supervisorName = String((selectedEmployee as any).manager || '').trim();
    let supervisorTitle = '';

    // Primary: find supervisor from the same department (e.g., Engineering -> Engineering Supervisor)
    if (employeeDept) {
      const deptSupervisor = scopedEmployees.find((e) => {
        const dept = String((e as any).dept || '').trim().toLowerCase();
        const pos = String((e as any).position || '').trim().toLowerCase();
        return dept === employeeDept && pos.includes('supervisor');
      });
      if (deptSupervisor) {
        supervisorName = String(deptSupervisor.name || '').trim();
        supervisorTitle = String(deptSupervisor.position || '').trim();
      }
    }

    if (!supervisorName && selectedEmployee.manager_id) {
      const managerEmp = employees.find((e) => Number(e.id) === Number(selectedEmployee.manager_id));
      supervisorName = String(managerEmp?.name || '').trim();
      supervisorTitle = String(managerEmp?.position || '').trim();
    }

    if (supervisorName && !supervisorTitle) {
      const supervisorEmp = employees.find((e) => String(e.name).trim().toLowerCase() === supervisorName.toLowerCase());
      supervisorTitle = String(supervisorEmp?.position || '').trim();
    }

    if (!supervisorName) return;

    setMgmtForm((prev) => ({
      ...prev,
      supervisor_name: supervisorName,
      supervisor_title: supervisorTitle || prev.supervisor_title,
    }));
  };


  /* ──────────────────── NEW FORM VIEW (employees only) ──────────────────── */
  if (view === 'newForm' && !isManagement) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => setView('dashboard')} className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-teal-deep dark:hover:text-teal-green transition-colors">
            <ArrowLeft size={18} /> Back
          </button>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center"><FileText size={18} className="text-teal-600" /></div>
            <div>
              <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">Employee Suggestion Form</h2>
              <p className="text-xs text-slate-400">Submit ideas for improving workplace efficiency, safety, revenue, or cost savings</p>
            </div>
          </div>
        </div>

        <form onSubmit={e => { e.preventDefault(); submitSuggestion(); }}>
          {/* IDENTIFICATION */}
          <Card>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="w-7 h-7 rounded-lg bg-teal-deep text-white flex items-center justify-center text-xs font-bold">I</span>
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">Identification</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {isManagement && employees.length > 0 ? (
                <div>
                  <label className={labelClass}>Employee</label>
                  <SearchableSelect
                    options={scopedEmployees.map(e => ({ value: String(e.id), label: e.name, avatarUrl: (e as any).profile_picture || null }))}
                    value={form.employee_name}
                    onChange={v => {
                      const selectedValue = String(v);
                      const emp = scopedEmployees.find(e => String(e.id) === selectedValue);
                      setForm({ ...form, employee_name: emp?.name || selectedValue, position: emp?.position || form.position, dept: emp?.dept || form.dept });
                      initializeSupervisorForEmployee(selectedValue);
                    }}
                    placeholder="Select Employee..."
                    dropdownVariant="pills-horizontal"
                  />
                </div>
              ) : (
                <div>
                  <label className={labelClass}>Employee Name</label>
                  <input type="text" value={form.employee_name} onChange={e => setForm({ ...form, employee_name: e.target.value })} className={inputClass} placeholder="Full name" />
                </div>
              )}
              <div>
                <label className={labelClass}>Position / Title</label>
                <input type="text" value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} className={inputClass} placeholder="Job title" />
              </div>
              <div>
                <label className={labelClass}>Date</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Department</label>
                <input type="text" value={form.dept} onChange={e => setForm({ ...form, dept: e.target.value })} className={inputClass} placeholder="Department" />
              </div>
            </div>
          </Card>

          {/* CONCERN */}
          <Card>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="w-7 h-7 rounded-lg bg-teal-deep text-white flex items-center justify-center text-xs font-bold">II</span>
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">Concern</h3>
            </div>
            <p className="text-xs text-slate-400 mb-3">What is the nature of the suggestion? How does the suggestion improve the job, add value to the customers, and/or what is the concern being addressed?</p>
            <label className={labelClass}>Description <span className="text-red-500 font-black">*</span></label>
            <textarea rows={4} value={form.concern} onChange={e => setForm({ ...form, concern: e.target.value })}
              className={inputClass} placeholder="Describe your suggestion or concern in detail..." minLength={20} maxLength={2000} required />
          </Card>

          {/* RESOURCES NEEDED */}
          <Card>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="w-7 h-7 rounded-lg bg-teal-deep text-white flex items-center justify-center text-xs font-bold">III</span>
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">Resources Needed</h3>
            </div>
            <p className="text-xs text-slate-400 mb-3">Please describe the resources needed to implement the suggestion.</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Labor</label>
                <textarea rows={2} value={form.labor_needed} onChange={e => setForm({ ...form, labor_needed: e.target.value })} className={inputClass} placeholder="Labor requirements..." />
              </div>
              <div>
                <label className={labelClass}>Materials</label>
                <textarea rows={2} value={form.materials_needed} onChange={e => setForm({ ...form, materials_needed: e.target.value })} className={inputClass} placeholder="Materials needed..." />
              </div>
              <div>
                <label className={labelClass}>Equipment</label>
                <textarea rows={2} value={form.equipment_needed} onChange={e => setForm({ ...form, equipment_needed: e.target.value })} className={inputClass} placeholder="Equipment needed..." />
              </div>
              <div>
                <label className={labelClass}>Capital (Money)</label>
                <textarea rows={2} value={form.capital_needed} onChange={e => setForm({ ...form, capital_needed: e.target.value })} className={inputClass} placeholder="Capital requirements..." />
              </div>
              <div>
                <label className={labelClass}>Other</label>
                <textarea rows={2} value={form.other_resource_needed} onChange={e => setForm({ ...form, other_resource_needed: e.target.value })} className={inputClass} placeholder="Other resources..." />
              </div>
              <div>
                <label className={labelClass}>Total Estimated Cost <span className="text-red-500 font-black">*</span></label>
                <input type="number" value={form.estimated_cost} onChange={e => setForm({ ...form, estimated_cost: e.target.value })} className={inputClass} placeholder="0.00" min={0} step="0.01" required />
              </div>
            </div>
          </Card>

          {/* DESIRED BENEFIT */}
          <Card>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="w-7 h-7 rounded-lg bg-teal-deep text-white flex items-center justify-center text-xs font-bold">IV</span>
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">Desired Benefit</h3>
            </div>
            <p className="text-xs text-slate-400 mb-3">What is the total anticipated benefit? (If possible identify the estimated financial benefit of the suggested improvement.)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Anticipated Benefit Description</label>
                <textarea rows={3} value={form.desired_benefit} onChange={e => setForm({ ...form, desired_benefit: e.target.value })} className={inputClass} placeholder="Describe the anticipated benefit..." />
              </div>
              <div>
                <label className={labelClass}>Total Estimated Financial Benefit <span className="text-red-500 font-black">*</span></label>
                <input type="number" value={form.total_financial_benefit} onChange={e => setForm({ ...form, total_financial_benefit: e.target.value })} className={inputClass} placeholder="0.00" min={0} step="0.01" required />
              </div>
            </div>
          </Card>

          {/* PLANNING */}
          <Card>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="w-7 h-7 rounded-lg bg-teal-deep text-white flex items-center justify-center text-xs font-bold">V</span>
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">Planning</h3>
            </div>
            <p className="text-xs text-slate-400 mb-3">List three or more steps for implementing the suggestion.</p>
            <div className="space-y-3 mb-4">
              {[1, 2, 3].map(n => (
                <div key={n} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-teal-deep text-white flex items-center justify-center text-xs font-bold mt-1">{n}</span>
                  <textarea rows={2} value={(form as any)[`planning_step_${n}`]}
                    onChange={e => setForm({ ...form, [`planning_step_${n}`]: e.target.value })}
                    className={inputClass} placeholder={`Step ${n}: Describe this planning step...`} maxLength={500} />
                </div>
              ))}
            </div>
            <div className="max-w-sm">
              <label className={labelClass}>Total Estimated Time to Completion</label>
              <input type="text" value={form.estimated_time} onChange={e => setForm({ ...form, estimated_time: e.target.value })} className={inputClass} placeholder="e.g., 2 weeks, 3 months" />
            </div>
          </Card>

          {/* EMPLOYEE SIGNATURE (QUEUE-ONLY) */}
          <Card>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="w-7 h-7 rounded-lg bg-teal-deep text-white flex items-center justify-center text-xs font-bold">VI</span>
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">Employee Signature</h3>
            </div>
            <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-900/10 p-3">
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                Employee signature is completed from the employee's Signature Queue after this suggestion is submitted.
              </p>
            </div>
          </Card>

          {/* ─── FOR MANAGEMENT USE ONLY (visible for Manager/HR) ─── */}
          {isManagement && (
            <>
              <div className="mt-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-amber-300 dark:bg-amber-700" />
                  <h3 className="text-sm font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest flex items-center gap-2">
                    <Star size={14} /> For Management Use Only <Star size={14} />
                  </h3>
                  <div className="flex-1 h-px bg-amber-300 dark:bg-amber-700" />
                </div>
              </div>

              <Card>
                {/* Row 1: Supervisor Name | Title */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className={labelClass}>Supervisor Name</label>
                    <SearchableSelect
                      options={supervisorOptions}
                      value={mgmtForm.supervisor_name}
                      onChange={applySupervisorSelection}
                      placeholder="Select Supervisor..."
                      dropdownVariant="pills-horizontal"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Title</label>
                    <input type="text" value={mgmtForm.supervisor_title} onChange={e => setMgmtForm({ ...mgmtForm, supervisor_title: e.target.value })} className={inputClass} />
                  </div>
                </div>

                {/* Row 2: Date Received | Follow-up Date */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className={labelClass}>Date Received</label>
                    <input type="date" value={mgmtForm.date_received} onChange={e => setMgmtForm({ ...mgmtForm, date_received: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Follow-up Date</label>
                    <input type="date" value={mgmtForm.follow_up_date} onChange={e => setMgmtForm({ ...mgmtForm, follow_up_date: e.target.value })} className={inputClass} min={mgmtForm.date_received || undefined} />
                  </div>
                </div>

                {/* Suggestion Merit */}
                <div className="mb-4">
                  <label className={labelClass}>Suggestion Merit (Please explain pros and cons in detail)</label>
                  <textarea rows={4} value={mgmtForm.suggestion_merit} onChange={e => setMgmtForm({ ...mgmtForm, suggestion_merit: e.target.value })} className={inputClass} placeholder="Describe the merits of this suggestion..." />
                </div>

                {/* Benefit to Company */}
                <div className="mb-4">
                  <label className={labelClass}>Benefit to Company</label>
                  <textarea rows={3} value={mgmtForm.benefit_to_company} onChange={e => setMgmtForm({ ...mgmtForm, benefit_to_company: e.target.value })} className={inputClass} placeholder="Benefit to the company..." />
                </div>

                {/* Cost to Company */}
                <div className="mb-4">
                  <label className={labelClass}>Cost to Company (include Capital, Equipment, Manpower, etc.)</label>
                  <textarea rows={3} value={mgmtForm.cost_to_company} onChange={e => setMgmtForm({ ...mgmtForm, cost_to_company: e.target.value })} className={inputClass} placeholder="Cost to the company..." />
                </div>

                {/* Cost Efficiency */}
                <div className="mb-4">
                  <label className={labelClass}>Is this suggestion cost efficient and related to the company mission (Please explain in detail)</label>
                  <textarea rows={4} value={mgmtForm.cost_efficient_explanation} onChange={e => setMgmtForm({ ...mgmtForm, cost_efficient_explanation: e.target.value })} className={inputClass} placeholder="Explain cost efficiency and mission relevance..." />
                </div>

                {/* Suggestion Priority */}
                <div className="mb-4">
                  <label className={labelClass}>Suggestion Priority <span className="font-normal normal-case">(1 = Low, 5 = High)</span></label>
                  <div className="flex items-center gap-4 mt-2">
                    {[1, 2, 3, 4, 5].map(n => (
                      <label key={n} className="flex items-center gap-1.5 cursor-pointer group">
                        <input type="radio" name="new_priority" checked={mgmtForm.suggestion_priority === n}
                          onChange={() => setMgmtForm({ ...mgmtForm, suggestion_priority: n })}
                          className="sr-only" />
                        <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold transition-all ${
                          mgmtForm.suggestion_priority === n
                            ? 'bg-teal-deep text-white shadow-lg scale-110'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:bg-teal-50 dark:group-hover:bg-teal-900/20 group-hover:text-teal-600'
                        }`}>{n}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Action to be Taken */}
                <div className="mb-4">
                  <label className={labelClass}>Action to be Taken</label>
                  <textarea rows={3} value={mgmtForm.action_to_be_taken} onChange={e => setMgmtForm({ ...mgmtForm, action_to_be_taken: e.target.value })} className={inputClass} placeholder="Describe the action to be taken..." />
                </div>

                {/* Status */}
                <div className="mb-4">
                  <label className={labelClass}>Status</label>
                  <select value={mgmtForm.status} onChange={e => setMgmtForm({ ...mgmtForm, status: e.target.value })} className={inputClass}>
                    <option value="">Select Status...</option>
                    <option value="Under Review">Under Review</option>
                    <option value="Reviewed">Reviewed</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>
              </Card>

              {/* Suggested Employee Reward */}
              <Card>
                <div className="mb-4">
                  <label className="block text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Suggested Employee Reward</label>
                  <textarea rows={2} value={mgmtForm.suggested_reward} onChange={e => setMgmtForm({ ...mgmtForm, suggested_reward: e.target.value })} className={inputClass} placeholder="Recommended reward for the employee..." />
                </div>
                <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                  <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-900/10 p-3">
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                      Supervisor signature, supervisor identity, and signature date are completed by the assigned supervisor in Signature Queue.
                    </p>
                  </div>
                </div>
              </Card>
            </>
          )}

          <div className="flex justify-end gap-3 mt-2 mb-6">
            <button type="button" onClick={() => setView('dashboard')} className="px-6 py-2.5 rounded-xl text-sm font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={!isEmployeeFormValid()} className="flex items-center gap-2 bg-teal-deep text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-teal-green transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <Send size={16} /> Submit Suggestion
            </button>
          </div>
        </form>
      </motion.div>
    );
  }

  /* ──────────────────── DETAIL VIEW ──────────────────── */
  if (view === 'viewDetail' && selectedSuggestion) {
    const s = selectedSuggestion;
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => setView('dashboard')} className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-teal-deep dark:hover:text-teal-green transition-colors">
            <ArrowLeft size={18} /> Back
          </button>
          <div className="flex items-center gap-2 flex-1">
            <div className="w-9 h-9 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center"><Eye size={18} className="text-teal-600" /></div>
            <div>
              <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">{isManagement ? 'Management Review' : 'Suggestion Detail'}</h2>
              <p className="text-xs text-slate-400">{s.employee_name ? `${s.employee_name} — ` : ''}Submitted {s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}</p>
            </div>
          </div>
          <span className={`text-[10px] font-bold uppercase px-3 py-1 rounded-full ${statusColor(s.status)}`}>{s.status || 'Under Review'}</span>
        </div>

        {/* Employee Section (read-only) — hidden for managers */}
        {!isManagement && (
          <>
        <Card>
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="w-7 h-7 rounded-lg bg-teal-deep text-white flex items-center justify-center text-xs font-bold">I</span>
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">Identification</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><p className={labelClass}>Employee Name</p><p className="text-sm font-medium text-slate-700 dark:text-slate-200">{s.employee_name || '—'}</p></div>
            <div><p className={labelClass}>Position / Title</p><p className="text-sm font-medium text-slate-700 dark:text-slate-200">{s.position || '—'}</p></div>
            <div><p className={labelClass}>Date</p><p className="text-sm font-medium text-slate-700 dark:text-slate-200">{s.date || s.created_at?.split('T')[0] || '—'}</p></div>
            <div><p className={labelClass}>Department</p><p className="text-sm font-medium text-slate-700 dark:text-slate-200">{s.dept || '—'}</p></div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="w-7 h-7 rounded-lg bg-teal-deep text-white flex items-center justify-center text-xs font-bold">II</span>
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">Concern</h3>
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{s.concern || '—'}</p>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="w-7 h-7 rounded-lg bg-teal-deep text-white flex items-center justify-center text-xs font-bold">III</span>
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">Resources Needed</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><p className={labelClass}>Labor</p><p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{s.labor_needed || '—'}</p></div>
            <div><p className={labelClass}>Materials</p><p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{s.materials_needed || '—'}</p></div>
            <div><p className={labelClass}>Equipment</p><p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{s.equipment_needed || '—'}</p></div>
            <div><p className={labelClass}>Capital (Money)</p><p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{s.capital_needed || '—'}</p></div>
            <div><p className={labelClass}>Other</p><p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{s.other_resource_needed || '—'}</p></div>
            <div><p className={labelClass}>Total Estimated Cost</p><p className="text-sm font-bold text-slate-800 dark:text-slate-100">{s.estimated_cost || '—'}</p></div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="w-7 h-7 rounded-lg bg-teal-deep text-white flex items-center justify-center text-xs font-bold">IV</span>
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">Desired Benefit</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><p className={labelClass}>Anticipated Benefit</p><p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{s.desired_benefit || '—'}</p></div>
            <div><p className={labelClass}>Total Estimated Financial Benefit</p><p className="text-sm font-bold text-slate-800 dark:text-slate-100">{s.total_financial_benefit || s.estimated_financial_benefit || '—'}</p></div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="w-7 h-7 rounded-lg bg-teal-deep text-white flex items-center justify-center text-xs font-bold">V</span>
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">Planning</h3>
          </div>
          <div className="space-y-3 mb-4">
            {[1, 2, 3].map(n => {
              const step = (s as any)[`planning_step_${n}`];
              return step ? (
                <div key={n} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-teal-deep text-white flex items-center justify-center text-xs font-bold">{n}</span>
                  <p className="text-sm text-slate-700 dark:text-slate-200 mt-1">{step}</p>
                </div>
              ) : null;
            })}
          </div>
          <div><p className={labelClass}>Total Estimated Time</p><p className="text-sm font-medium text-slate-700 dark:text-slate-200">{s.estimated_time || '—'}</p></div>
        </Card>

        {/* Employee Signature */}
        <Card>
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="w-7 h-7 rounded-lg bg-teal-deep text-white flex items-center justify-center text-xs font-bold">VI</span>
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">Employee Signature</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              {s.employee_signature ? (
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-white dark:bg-slate-900 inline-block">
                  <img src={s.employee_signature} alt="Employee Signature" className="max-h-20" />
                </div>
              ) : <p className="text-sm text-slate-400 italic">No signature provided</p>}
            </div>
            <div><p className={labelClass}>Date</p><p className="text-sm text-slate-700 dark:text-slate-200">{s.employee_signature_date || '—'}</p></div>
          </div>
        </Card>
          </>
        )}

        {/* ─── FOR MANAGEMENT USE ONLY ─── */}
        <div className={isManagement ? '' : 'mt-6'}>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-amber-300 dark:bg-amber-700" />
            <h3 className="text-sm font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest flex items-center gap-2">
              <Star size={14} /> For Management Use Only <Star size={14} />
            </h3>
            <div className="flex-1 h-px bg-amber-300 dark:bg-amber-700" />
          </div>

          {isManagement ? (
            /* Editable management form for HR/Manager */
            <>
              <Card>
                {/* Row 1: Supervisor Name | Title */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className={labelClass}>Supervisor Name</label>
                    <SearchableSelect
                      options={supervisorOptions}
                      value={mgmtForm.supervisor_name}
                      onChange={applySupervisorSelection}
                      placeholder="Select Supervisor..."
                      dropdownVariant="pills-horizontal"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Title</label>
                    <input type="text" value={mgmtForm.supervisor_title} onChange={e => setMgmtForm({ ...mgmtForm, supervisor_title: e.target.value })} className={inputClass} />
                  </div>
                </div>

                {/* Row 2: Date Received | Follow-up Date */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className={labelClass}>Date Received</label>
                    <input type="date" value={mgmtForm.date_received} onChange={e => setMgmtForm({ ...mgmtForm, date_received: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Follow-up Date</label>
                    <input type="date" value={mgmtForm.follow_up_date} onChange={e => setMgmtForm({ ...mgmtForm, follow_up_date: e.target.value })} className={inputClass} min={mgmtForm.date_received || undefined} />
                  </div>
                </div>

                {/* Suggestion Merit */}
                <div className="mb-4">
                  <label className={labelClass}>Suggestion Merit (Please explain pros and cons in detail)</label>
                  <textarea rows={4} value={mgmtForm.suggestion_merit} onChange={e => setMgmtForm({ ...mgmtForm, suggestion_merit: e.target.value })} className={inputClass} placeholder="Describe the merits of this suggestion..." />
                </div>

                {/* Benefit to Company */}
                <div className="mb-4">
                  <label className={labelClass}>Benefit to Company</label>
                  <textarea rows={3} value={mgmtForm.benefit_to_company} onChange={e => setMgmtForm({ ...mgmtForm, benefit_to_company: e.target.value })} className={inputClass} placeholder="Benefit to the company..." />
                </div>

                {/* Cost to Company */}
                <div className="mb-4">
                  <label className={labelClass}>Cost to Company (include Capital, Equipment, Manpower, etc.)</label>
                  <textarea rows={3} value={mgmtForm.cost_to_company} onChange={e => setMgmtForm({ ...mgmtForm, cost_to_company: e.target.value })} className={inputClass} placeholder="Cost to the company..." />
                </div>

                {/* Cost Efficiency */}
                <div className="mb-4">
                  <label className={labelClass}>Is this suggestion cost efficient and related to the company mission (Please explain in detail)</label>
                  <textarea rows={4} value={mgmtForm.cost_efficient_explanation} onChange={e => setMgmtForm({ ...mgmtForm, cost_efficient_explanation: e.target.value })} className={inputClass} placeholder="Explain cost efficiency and mission relevance..." />
                </div>

                {/* Suggestion Priority */}
                <div className="mb-4">
                  <label className={labelClass}>Suggestion Priority <span className="font-normal normal-case">(1 = Low, 5 = High)</span></label>
                  <div className="flex items-center gap-4 mt-2">
                    {[1, 2, 3, 4, 5].map(n => (
                      <label key={n} className="flex items-center gap-1.5 cursor-pointer group">
                        <input type="radio" name="priority" checked={mgmtForm.suggestion_priority === n}
                          onChange={() => setMgmtForm({ ...mgmtForm, suggestion_priority: n })}
                          className="sr-only" />
                        <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold transition-all ${
                          mgmtForm.suggestion_priority === n
                            ? 'bg-teal-deep text-white shadow-lg scale-110'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:bg-teal-50 dark:group-hover:bg-teal-900/20 group-hover:text-teal-600'
                        }`}>{n}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Action to be Taken */}
                <div className="mb-4">
                  <label className={labelClass}>Action to be Taken</label>
                  <textarea rows={3} value={mgmtForm.action_to_be_taken} onChange={e => setMgmtForm({ ...mgmtForm, action_to_be_taken: e.target.value })} className={inputClass} placeholder="Describe the action to be taken..." />
                </div>

                {/* Status */}
                <div className="mb-4">
                  <label className={labelClass}>Status</label>
                  <select value={mgmtForm.status} onChange={e => setMgmtForm({ ...mgmtForm, status: e.target.value })} className={inputClass}>
                    <option value="">Select Status...</option>
                    <option value="Under Review">Under Review</option>
                    <option value="Reviewed">Reviewed</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>
              </Card>

              {/* Suggested Employee Reward */}
              <Card>
                <div className="mb-4">
                  <label className="block text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Suggested Employee Reward</label>
                  <textarea rows={2} value={mgmtForm.suggested_reward} onChange={e => setMgmtForm({ ...mgmtForm, suggested_reward: e.target.value })} className={inputClass} placeholder="Recommended reward for the employee..." />
                </div>
                <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                  <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-900/10 p-3">
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                      Supervisor signature, supervisor identity, and signature date are completed by the assigned supervisor in Signature Queue.
                    </p>
                  </div>
                </div>
              </Card>

              <div className="flex justify-end gap-3 mt-2 mb-6">
                <button onClick={() => setView('dashboard')} className="px-6 py-2.5 rounded-xl text-sm font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                  Back
                </button>
                <button onClick={submitManagementReview} className="flex items-center gap-2 bg-amber-500 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-amber-600 transition-colors">
                  <CheckCircle2 size={16} /> Save Management Review
                </button>
              </div>
            </>
          ) : (
            /* Read-only management view for employees */
            <>
            <Card>
              {s.supervisor_name ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><p className={labelClass}>Supervisor Name</p><p className="text-sm text-slate-700 dark:text-slate-200">{s.supervisor_name}</p></div>
                    <div><p className={labelClass}>Title</p><p className="text-sm text-slate-700 dark:text-slate-200">{s.supervisor_title || '—'}</p></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><p className={labelClass}>Date Received</p><p className="text-sm text-slate-700 dark:text-slate-200">{s.date_received || '—'}</p></div>
                    <div><p className={labelClass}>Follow-up Date</p><p className="text-sm text-slate-700 dark:text-slate-200">{s.follow_up_date || '—'}</p></div>
                  </div>
                  <div><p className={labelClass}>Suggestion Merit (Please explain pros and cons in detail)</p><p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{s.suggestion_merit || '—'}</p></div>
                  <div><p className={labelClass}>Benefit to Company</p><p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{s.benefit_to_company || '—'}</p></div>
                  <div><p className={labelClass}>Cost to Company (include Capital, Equipment, Manpower, etc.)</p><p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{s.cost_to_company || '—'}</p></div>
                  <div><p className={labelClass}>Is this suggestion cost efficient and related to the company mission</p><p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{s.cost_efficient_explanation || '—'}</p></div>
                  <div>
                    <p className={labelClass}>Suggestion Priority <span className="font-normal normal-case">(1 = Low, 5 = High)</span></p>
                    <div className="flex gap-2 mt-1">
                      {[1, 2, 3, 4, 5].map(n => (
                        <span key={n} className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                          s.suggestion_priority === n ? 'bg-teal-deep text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                        }`}>{n}</span>
                      ))}
                    </div>
                  </div>
                  <div><p className={labelClass}>Action to be Taken</p><p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{s.action_to_be_taken || '—'}</p></div>
                </div>
              ) : (
                <div className="py-8 text-center">
                  <Clock size={28} className="mx-auto text-amber-400 mb-2" />
                  <p className="text-sm text-slate-500 dark:text-slate-400 italic">This suggestion is still under management review.</p>
                  <p className="text-[10px] text-slate-400 mt-1">The management response will appear here once reviewed.</p>
                </div>
              )}
            </Card>
            {s.supervisor_name && (
              <Card>
                <div className="mb-3">
                  <p className="block text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">Suggested Employee Reward</p>
                  <p className="text-sm text-slate-700 dark:text-slate-200">{s.suggested_reward || '—'}</p>
                </div>
                <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div><p className={labelClass}>Supervisor Name</p><p className="text-sm text-slate-700 dark:text-slate-200">{s.supervisor_name}</p></div>
                    <div><p className={labelClass}>Date</p><p className="text-sm text-slate-700 dark:text-slate-200">{s.supervisor_signature_date || '—'}</p></div>
                  </div>
                  {s.supervisor_signature && (
                    <div>
                      <p className={labelClass}>Supervisor Signature</p>
                      <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-900 inline-block">
                        <img src={s.supervisor_signature} alt="Supervisor Signature" className="max-h-16" />
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}
            </>
          )}
        </div>
      </motion.div>
    );
  }

  /* ──────────────────── DASHBOARD VIEW ──────────────────── */
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-4">
        <SectionHeader title={isManagement ? 'Suggestion Review' : 'Employee Suggestion Form'} subtitle={isManagement ? 'Review and manage employee suggestions' : 'Submit ideas for improving workplace efficiency, safety, revenue, or cost savings'} />
        <div className="flex gap-2">
          <button onClick={() => exportToCSV(suggestions, 'suggestions')} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            <Download size={16} /> XLSX
          </button>
          {!isManagement ? (
            <button onClick={() => setView('newForm')} className="flex items-center gap-2 bg-teal-deep text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-teal-green transition-colors">
              <Plus size={16} /> New Suggestion
            </button>
          ) : null}
        </div>
      </div>

      {/* Employee Filter (for managers) */}
      {isManagement && employees.length > 0 && (
        <div className="mb-4">
          <Card>
            <div className="flex items-center gap-4 min-w-0">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase shrink-0">Filter by Employee</label>
              <SearchableSelect
                options={employees.map(e => ({ value: String(e.id), label: e.name, avatarUrl: (e as any).profile_picture || null }))}
                value={filterEmployee}
                onChange={v => setFilterEmployee(String(v))}
                placeholder="All Employees"
                allowEmpty
                emptyLabel="All Employees"
                className="flex-1"
              />
            </div>
          </Card>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-teal-600"><Lightbulb size={18} className="text-white" /></div>
            <div><p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Total</p><p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{suggestions.length}</p></div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-500"><Clock size={18} className="text-white" /></div>
            <div><p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Under Review</p><p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{suggestions.filter(s => !s.status || s.status === 'Under Review').length}</p></div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-500"><CheckCircle2 size={18} className="text-white" /></div>
            <div><p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Approved</p><p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{suggestions.filter(s => s.status === 'Approved').length}</p></div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-500"><Star size={18} className="text-white" /></div>
            <div><p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Reviewed</p><p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{suggestions.filter(s => s.status === 'Reviewed').length}</p></div>
          </div>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">Suggestions Over Time</h3>
        <div className="h-36">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#0f766e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-full flex items-center justify-center text-sm text-slate-400">No data yet</div>}
        </div>
      </Card>

      {/* Suggestions Table */}
      <Card>
        <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">{isManagement ? 'All Suggestions' : 'My Suggestions'} ({(filterEmployee ? suggestions.filter(s => String(s.employee_id) === filterEmployee) : suggestions).length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Employee</th>
                <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Concern</th>
                <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Est. Cost</th>
                <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Est. Benefit</th>
                <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date</th>
                <th className="pb-3"></th>
              </tr>
            </thead>
            <tbody>
              {(filterEmployee ? suggestions.filter(s => String(s.employee_id) === filterEmployee) : suggestions).map(s => (
                <tr key={s.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer" onClick={() => openDetail(s)}>
                  <td className="py-3 font-medium text-slate-700 dark:text-slate-200">
                    <div className="min-w-0">
                      <span className="truncate max-w-[220px]" title={s.employee_name || s.title || '—'}>{s.employee_name || s.title || '—'}</span>
                    </div>
                  </td>
                  <td className="py-3 text-slate-500 dark:text-slate-400 max-w-xs truncate">{s.concern || '—'}</td>
                  <td className="py-3 text-slate-500 dark:text-slate-400">{s.estimated_cost || '—'}</td>
                  <td className="py-3 text-slate-500 dark:text-slate-400">{s.total_financial_benefit || s.estimated_financial_benefit || '—'}</td>
                  <td className="py-3"><span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${statusColor(s.status)}`}>{s.status || 'Under Review'}</span></td>
                  <td className="py-3 text-xs text-slate-400">{s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}</td>
                  <td className="py-3 flex items-center gap-2">
                    <button onClick={e => { e.stopPropagation(); openDetail(s); }} className="text-teal-500 hover:text-teal-700"><Eye size={14} /></button>
                    <button onClick={e => { e.stopPropagation(); deleteSuggestion(s.id); }} className="text-red-500 hover:text-red-600 p-1 rounded" title="Archive"><Archive size={15} /></button>
                  </td>
                </tr>
              ))}
              {suggestions.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-slate-400">{isManagement ? 'No suggestions to review yet.' : 'No suggestions submitted yet. Click "New Suggestion" to get started.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </motion.div>
  );
};
