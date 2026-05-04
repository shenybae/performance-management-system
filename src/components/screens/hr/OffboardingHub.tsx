import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { SearchableSelect } from '../../common/SearchableSelect';
import { Plus, X, Box, LogOut, Download, Trash2, ChevronDown, ChevronUp, Package, FileText, Search, Eye, Archive } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';
import { sigBlockHtml } from '../../../utils/print';
import { Employee } from '../../../types';
import { appConfirm } from '../../../utils/appDialog';

interface PropertyRow {
  property_number: string; asset_category: string; brand: string; description: string;
  serial_no: string; uom_qty: string; dr_si_no: string; amount: string; remarks: string;
}

const emptyPropRow: PropertyRow = {
  property_number: '', asset_category: '', brand: '', description: '',
  serial_no: '', uom_qty: '', dr_si_no: '', amount: '', remarks: ''
};

const inputCls = "w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-green/50";
const labelCls = "block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1";

interface OffboardingHubProps {
  employees?: Employee[];
  users?: any[];
}

const normalize = (value?: string | null) => (value || '').toString().trim().toLowerCase();
const sameDept = (a?: string | null, b?: string | null) => normalize(a) === normalize(b) && normalize(a) !== '';

export const OffboardingHub = ({ employees = [], users = [] }: OffboardingHubProps) => {
  const [activeForm, setActiveForm] = useState<'none' | 'property' | 'exit' | 'offboard'>('none');
  const [offboardingData, setOffboardingData] = useState<any[]>([]);
  const [exitInterviews, setExitInterviews] = useState<any[]>([]);
  const [propertyRecords, setPropertyRecords] = useState<any[]>([]);
  const [expandedOffboarding, setExpandedOffboarding] = useState<number | null>(null);
  const [expandedProp, setExpandedProp] = useState<number | null>(null);
  const [propSearch, setPropSearch] = useState('');
  const [offForm, setOffForm] = useState({ employee_name: '', last_day: '', reason: '' });
  const emptyItem = { property_no: '', asset_category: '', brand: '', description: '', serial_no: '', uom_qty: 1, dr_si_no: '', amount: '', remarks: '' };
  const [propForm, setPropForm] = useState({
    employee_name: '', position_dept: '', date_prepared: '',
    items: [{ ...emptyPropRow }] as PropertyRow[],
    turnover_by_name: '', turnover_by_date: '', turnover_by_sig: '',
    noted_by_name: '', noted_by_date: '', noted_by_sig: '',
    received_by_name: '', received_by_date: '', received_by_sig: '',
    audited_by_name: '', audited_by_date: '', audited_by_sig: '',
  });
  const [exitForm, setExitForm] = useState({
    employee_name: '', department: '', supervisor: '', interview_date: '',
    ssn: '', hire_date: '', termination_date: '', starting_position: '', ending_position: '', salary: '',
    reason_category: '' as string, reason_details: [] as string[], dismissal_details: '',
    liked_most: '', liked_least: '', pay_benefits_opinion: '',
    satisfaction_ratings: {
      opportunity_use_abilities: 0, recognition: 0, career_goals: 0,
      supervisor_relationship: 0, info_accuracy: 0, clear_expectations: 0,
      training_provided: 0, coworker_relations: 0, discipline_policies: 0,
      physical_conditions: 0, benefits: 0
    } as Record<string, number>,
    would_recommend: '', improvement_suggestions: '', additional_comments: '',
    employee_sig: '', interviewer_name: '', interviewer_sig: '', interviewer_date: ''
  });
  const todayISO = new Date().toISOString().split('T')[0];
  const departmentSupervisorOptions = useMemo(() => {
    const dept = String(exitForm.department || '').trim();
    if (!dept) return [];
    return (Array.isArray(users) ? users : [])
      .filter((user: any) => sameDept(user?.dept, dept))
      .filter((user: any) => ['hr', 'manager'].includes(normalize(user?.role)) || normalize(user?.position).includes('supervisor'))
      .map((user: any) => ({
        value: user.name || user.full_name || user.username || user.email || '',
        label: `${user.name || user.full_name || user.username || user.email || 'User'}${user.position ? ` — ${user.position}` : ''}`,
        avatarUrl: user.profile_picture || null,
      }))
      .filter((option: any) => option.value)
      .sort((a: any, b: any) => a.label.localeCompare(b.label));
  }, [exitForm.department, users]);

  const trimText = (value: string) => value.trim();

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try { const r1 = await fetch('/api/offboarding', { headers: getAuthHeaders() }); const d1 = await r1.json(); setOffboardingData(Array.isArray(d1) ? d1 : []); } catch { setOffboardingData([]); }
    try { const r2 = await fetch('/api/exit_interviews', { headers: getAuthHeaders() }); const d2 = await r2.json(); setExitInterviews(Array.isArray(d2) ? d2 : []); } catch { setExitInterviews([]); }
    try { const r3 = await fetch('/api/property_accountability'); const d3 = await r3.json(); setPropertyRecords(Array.isArray(d3) ? d3 : []); } catch { setPropertyRecords([]); }
  };

  const submitOffboarding = async () => {
    const cleaned = {
      employee_name: trimText(offForm.employee_name),
      last_day: trimText(offForm.last_day),
      reason: trimText(offForm.reason),
    };
    if (!cleaned.employee_name || !cleaned.last_day || !cleaned.reason) {
      window.notify?.('Employee name, last day, and reason are required', 'error');
      return;
    }
    try {
      const res = await fetch('/api/offboarding', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ ...cleaned, clearance_status: 'Pending' }) });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Offboarding record created', 'success');
      setOffForm({ employee_name: '', last_day: '', reason: '' });
      setActiveForm('none'); fetchData();
    } catch { window.notify?.('Failed to create', 'error'); }
  };

  const resetPropForm = () => setPropForm({
    employee_name: '', position_dept: '', date_prepared: '',
    items: [{ ...emptyPropRow }],
    turnover_by_name: '', turnover_by_date: '', turnover_by_sig: '',
    noted_by_name: '', noted_by_date: '', noted_by_sig: '',
    received_by_name: '', received_by_date: '', received_by_sig: '',
    audited_by_name: '', audited_by_date: '', audited_by_sig: '',
  });

  const submitProperty = async () => {
    if (!(await appConfirm('Save this property accountability form?', { title: 'Save Property Form', confirmText: 'Save', icon: 'success' }))) return;
    
    const cleaned = {
      ...propForm,
      employee_name: trimText(propForm.employee_name),
      position_dept: trimText(propForm.position_dept),
      date_prepared: trimText(propForm.date_prepared),
      items: propForm.items.map(item => ({
        property_number: trimText(item.property_number),
        asset_category: trimText(item.asset_category),
        brand: trimText(item.brand),
        description: trimText(item.description),
        serial_no: trimText(item.serial_no),
        uom_qty: trimText(item.uom_qty),
        dr_si_no: trimText(item.dr_si_no),
        amount: trimText(item.amount),
        remarks: trimText(item.remarks),
      })),
    };

    if (!cleaned.employee_name || !cleaned.position_dept || !cleaned.date_prepared) {
      window.notify?.('Employee name, position/department, and date prepared are required', 'error');
      return;
    }
    if (cleaned.items.length === 0) {
      window.notify?.('Please add at least one property item', 'error');
      return;
    }

    const hasAtLeastOneFilledRow = cleaned.items.some(item => Object.values(item).some(Boolean));
    if (!hasAtLeastOneFilledRow) {
      window.notify?.('Please complete at least one property item row', 'error');
      return;
    }

    const invalidRowIndex = cleaned.items.findIndex(item => {
      const hasAny = Object.values(item).some(Boolean);
      if (!hasAny) return false;
      const quantity = Number.parseFloat(item.uom_qty);
      const amount = item.amount ? Number.parseFloat(item.amount) : 0;
      return (
        !item.property_number ||
        !item.asset_category ||
        !item.brand ||
        !item.description ||
        !item.serial_no ||
        !item.uom_qty ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        (item.amount !== '' && (!Number.isFinite(amount) || amount < 0))
      );
    });
    if (invalidRowIndex >= 0) {
      window.notify?.(`Property item row ${invalidRowIndex + 1} is incomplete or has invalid quantity/amount`, 'error');
      return;
    }

    try {
      // try to resolve an employee id from the entered name so records attach to the employee file
      const matched = (employees || []).find(e => (e.name || '').toString().trim().toLowerCase() === cleaned.employee_name.toLowerCase());
      const employeeId = matched ? matched.id : null;

      const res = await fetch('/api/property_accountability', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          employee_id: employeeId,
          employee_name: cleaned.employee_name,
          position_dept: cleaned.position_dept,
          date_prepared: cleaned.date_prepared,
          items: JSON.stringify(cleaned.items),
          turnover_by_name: null, turnover_by_date: null, turnover_by_sig: null,
          noted_by_name: null, noted_by_date: null, noted_by_sig: null,
          received_by_name: null, received_by_date: null, received_by_sig: null,
          audited_by_name: null, audited_by_date: null, audited_by_sig: null,
        })
      });
      if (res.ok) {
        window.notify?.('Property accountability saved', 'success');
        resetPropForm(); setActiveForm('none'); fetchData();
      } else { window.notify?.('Failed to save', 'error'); }
    } catch { window.notify?.('Failed to save', 'error'); }
  };

  const deletePropRecord = async (id: number) => {
    if (!(await appConfirm('Archive this property record?', { title: 'Archive Property Record', confirmText: 'Archive' }))) return;
    try { await fetch(`/api/property_accountability/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); window.notify?.('Archived', 'success'); fetchData(); } catch { window.notify?.('Failed to archive', 'error'); }
  };

  const printPropRecord = async (rec: any) => {
    if (!(await appConfirm('Export this property accountability form as PDF?', { title: 'Export Property PDF', confirmText: 'Export', icon: 'export' }))) return;
    const items: PropertyRow[] = (() => { try { return JSON.parse(rec.items || '[]'); } catch { return []; } })();
    const sigBlock = (label: string, name: string, sig: string, date: string) => sigBlockHtml(sig, label, date, name);
    const w = window.open('', '_blank'); if (!w) return;
    w.document.write(`<html><head><title>Property Accountability Form</title><style>
      body{font-family:Arial,sans-serif;padding:20px;color:#000;}
      table{width:100%;border-collapse:collapse;margin:12px 0;}
      th,td{border:1px solid #333;padding:5px 8px;font-size:12px;text-align:left;}
      th{background:#f0f0f0;font-weight:bold;}
      .hdr{text-align:center;margin-bottom:16px;}
      .sig-row{display:flex;gap:30px;margin-top:24px;}
      @media print{body{padding:0;}}
    </style></head><body>
    <div class="hdr"><h2 style="margin:0;">ABC CORP.</h2><h3 style="margin:4px 0 0;">PROPERTY ACCOUNTABILITY FORM</h3></div>
    <table style="border:none;"><tr style="border:none;">
      <td style="border:none;"><b>Employee Name:</b> ${rec.employee_name}</td>
      <td style="border:none;"><b>Date Prepared:</b> ${rec.date_prepared}</td>
    </tr><tr style="border:none;"><td style="border:none;" colspan="2"><b>Position / Dept.:</b> ${rec.position_dept}</td></tr></table>
    <table><thead><tr>
      <th>Property Number</th><th>Asset Category</th><th>Brand</th><th>Description</th><th>Serial No.</th>
      <th>UOM / QTY</th><th>DR / SI No.</th><th>Amount</th><th>Remarks</th>
    </tr></thead><tbody>${items.map(it => `<tr>
      <td>${it.property_number}</td><td>${it.asset_category}</td><td>${it.brand}</td><td>${it.description}</td><td>${it.serial_no}</td>
      <td>${it.uom_qty}</td><td>${it.dr_si_no}</td><td>${it.amount}</td><td>${it.remarks}</td>
    </tr>`).join('')}${items.length < 10 ? Array(10 - items.length).fill('<tr>' + '<td>&nbsp;</td>'.repeat(9) + '</tr>').join('') : ''}</tbody></table>
    <div class="sig-row">${sigBlock('Turnover by:', rec.turnover_by_name, rec.turnover_by_sig, rec.turnover_by_date)}${sigBlock('Noted by:', rec.noted_by_name, rec.noted_by_sig, rec.noted_by_date)}</div>
    <div class="sig-row" style="margin-top:16px;">${sigBlock('Received by:', rec.received_by_name, rec.received_by_sig, rec.received_by_date)}${sigBlock('Audited by:', rec.audited_by_name, rec.audited_by_sig, rec.audited_by_date)}</div>
    <div style="text-align:right;font-size:10px;margin-top:16px;color:#666;">CC: 201 File / Audit / Employee</div>
    </body></html>`);
    w.document.close(); setTimeout(() => {
      w.print();
      try { fetch('/api/activity', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ action: 'export_pdf', description: `Property Accountability PDF — ${rec.employee_name || ''}`, entity: 'property_accountability', entity_id: rec.id || null, meta: { source: 'OffboardingHub', exportType: 'property_accountability' } }) }).catch(() => {}); } catch {};
    }, 300);
  };

  const addPropRow = () => setPropForm(f => ({ ...f, items: [...f.items, { ...emptyPropRow }] }));
  const removePropRow = (idx: number) => setPropForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  const updatePropRow = (idx: number, field: keyof PropertyRow, value: string) => {
    setPropForm(f => ({ ...f, items: f.items.map((r, i) => i === idx ? { ...r, [field]: value } : r) }));
  };

  const submitExitInterview = async () => {
    if (!(await appConfirm('Submit this exit interview?', { title: 'Submit Exit Interview', confirmText: 'Submit', icon: 'success' }))) return;
    
    const cleaned = {
      ...exitForm,
      employee_name: trimText(exitForm.employee_name),
      department: trimText(exitForm.department),
      supervisor: trimText(exitForm.supervisor),
      interview_date: trimText(exitForm.interview_date),
      ssn: trimText(exitForm.ssn),
      hire_date: trimText(exitForm.hire_date),
      termination_date: trimText(exitForm.termination_date),
      starting_position: trimText(exitForm.starting_position),
      ending_position: trimText(exitForm.ending_position),
      salary: trimText(exitForm.salary),
      reason_category: trimText(exitForm.reason_category),
      reason_details: exitForm.reason_details.map(trimText).filter(Boolean),
      dismissal_details: trimText(exitForm.dismissal_details),
      liked_most: trimText(exitForm.liked_most),
      liked_least: trimText(exitForm.liked_least),
      pay_benefits_opinion: trimText(exitForm.pay_benefits_opinion),
      would_recommend: trimText(exitForm.would_recommend),
      improvement_suggestions: trimText(exitForm.improvement_suggestions),
      additional_comments: trimText(exitForm.additional_comments),
    };

    if (!cleaned.employee_name || !cleaned.department || !cleaned.supervisor || !cleaned.interview_date) {
      window.notify?.('Employee, department, supervisor, and interview date are required', 'error');
      return;
    }
    if (!cleaned.hire_date || !cleaned.termination_date) {
      window.notify?.('Please provide hire date and termination date', 'error');
      return;
    }
    if (cleaned.termination_date < cleaned.hire_date) {
      window.notify?.('Termination date cannot be earlier than hire date', 'error');
      return;
    }
    if (!cleaned.starting_position || !cleaned.ending_position) {
      window.notify?.('Please provide starting and ending positions', 'error');
      return;
    }
    if (!cleaned.reason_category || cleaned.reason_details.length === 0) {
      window.notify?.('Please select at least one reason for leaving', 'error');
      return;
    }
    if (cleaned.reason_category === 'Dismissal' && cleaned.dismissal_details.length < 5) {
      window.notify?.('Please provide dismissal details', 'error');
      return;
    }
    if (!cleaned.liked_most || !cleaned.liked_least || !cleaned.pay_benefits_opinion) {
      window.notify?.('Please complete Part II comments', 'error');
      return;
    }
    const ratings = Object.values(cleaned.satisfaction_ratings);
    if (ratings.some(v => v < 1 || v > 5)) {
      window.notify?.('Please complete all satisfaction ratings from 1 to 5', 'error');
      return;
    }
    if (!cleaned.would_recommend || !cleaned.improvement_suggestions) {
      window.notify?.('Please complete Part IV additional comments', 'error');
      return;
    }
    try {
      const res = await fetch('/api/exit_interviews', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({
        employee_name: cleaned.employee_name, department: cleaned.department, supervisor: cleaned.supervisor,
        interview_date: cleaned.interview_date, reasons: `${cleaned.reason_category}: ${cleaned.reason_details.join(', ')}`,
        liked_most: cleaned.liked_most, liked_least: cleaned.liked_least,
        ssn: cleaned.ssn, hire_date: cleaned.hire_date, termination_date: cleaned.termination_date,
        starting_position: cleaned.starting_position, ending_position: cleaned.ending_position, salary: cleaned.salary,
        pay_benefits_opinion: cleaned.pay_benefits_opinion,
        satisfaction_ratings: JSON.stringify(cleaned.satisfaction_ratings),
        would_recommend: cleaned.would_recommend, improvement_suggestions: cleaned.improvement_suggestions,
        additional_comments: cleaned.additional_comments,
        employee_sig: null, interviewer_name: null,
        interviewer_sig: null, interviewer_date: null,
        dismissal_details: cleaned.dismissal_details
      }) });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Exit interview saved', 'success');
      setExitForm({
        employee_name: '', department: '', supervisor: '', interview_date: '',
        ssn: '', hire_date: '', termination_date: '', starting_position: '', ending_position: '', salary: '',
        reason_category: '', reason_details: [], dismissal_details: '',
        liked_most: '', liked_least: '', pay_benefits_opinion: '',
        satisfaction_ratings: {
          opportunity_use_abilities: 0, recognition: 0, career_goals: 0,
          supervisor_relationship: 0, info_accuracy: 0, clear_expectations: 0,
          training_provided: 0, coworker_relations: 0, discipline_policies: 0,
          physical_conditions: 0, benefits: 0
        },
        would_recommend: '', improvement_suggestions: '', additional_comments: '',
        employee_sig: '', interviewer_name: '', interviewer_sig: '', interviewer_date: ''
      });
      setActiveForm('none'); fetchData();
    } catch { window.notify?.('Failed to save', 'error'); }
  };

  const deleteOffboarding = async (id: number) => {
    if (!(await appConfirm('Archive this offboarding record?', { title: 'Archive Offboarding Record', confirmText: 'Archive' }))) return;
    try { await fetch(`/api/offboarding/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); window.notify?.('Archived', 'success'); fetchData(); } catch { window.notify?.('Failed', 'error'); }
  };

  const markCleared = async (id: number) => {
    try { await fetch(`/api/offboarding/${id}`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify({ clearance_status: 'Completed' }) }); window.notify?.('Marked as cleared', 'success'); fetchData(); } catch { window.notify?.('Failed', 'error'); }
  };

  const [exitSearch, setExitSearch] = useState('');
  const [expandedExit, setExpandedExit] = useState<number | null>(null);

  const deleteExitInterview = async (id: number) => {
    if (!(await appConfirm('Archive this exit interview?', { title: 'Archive Exit Interview', confirmText: 'Archive' }))) return;
    try { await fetch(`/api/exit_interviews/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); window.notify?.('Archived', 'success'); fetchData(); } catch { window.notify?.('Failed to archive', 'error'); }
  };

  const printExitInterview = async (rec: any) => {
    if (!(await appConfirm('Export this exit interview as PDF?', { title: 'Export Exit Interview PDF', confirmText: 'Export', icon: 'export' }))) return;
    const ratings: Record<string, number> = (() => { try { return JSON.parse(rec.satisfaction_ratings || '{}'); } catch { return {}; } })();
    const ratingLabels: Record<string, string> = {
      opportunity_use_abilities: 'Opportunity to use your abilities',
      recognition: 'Recognition for work you did',
      career_goals: 'Progress toward career goals',
      supervisor_relationship: 'Relationship with supervisor',
      info_accuracy: 'Information you received was accurate',
      clear_expectations: 'Clear expectations from supervisor',
      training_provided: 'Training provided for your job',
      coworker_relations: 'Co-worker relations',
      discipline_policies: 'Discipline policies and practices',
      physical_conditions: 'Physical working conditions',
      benefits: 'Benefits'
    };
    const sigBlock = (label: string, sig: string, printedName?: string) => sigBlockHtml(sig, label, null, printedName);
    const w = window.open('', '_blank'); if (!w) return;
    w.document.write(`<html><head><title>Exit Interview — ${rec.employee_name}</title><style>
      body{font-family:Arial,sans-serif;padding:20px;color:#000;font-size:12px;}
      table{width:100%;border-collapse:collapse;margin:10px 0;}
      th,td{border:1px solid #333;padding:4px 8px;font-size:11px;text-align:left;}
      th{background:#f0f0f0;font-weight:bold;}
      .hdr{text-align:center;margin-bottom:16px;}
      .section{font-weight:bold;font-size:12px;margin:12px 0 6px;text-decoration:underline;}
      .sig-row{display:flex;gap:40px;margin-top:24px;align-items:flex-start;}
      @media print{body{padding:0;}}
    </style></head><body>
    <div class="hdr"><h2 style="margin:0;">CONFIDENTIAL EMPLOYEE EXIT INTERVIEW FORM</h2>
    <p style="font-size:10px;color:#666;margin:4px 0 0;">All information provided is strictly confidential</p></div>

    <table style="border:none;">
      <tr style="border:none;"><td style="border:none;width:50%;"><b>Employee Name:</b> ${rec.employee_name || ''}</td><td style="border:none;"><b>SSN:</b> ${rec.ssn || ''}</td></tr>
      <tr style="border:none;"><td style="border:none;"><b>Department:</b> ${rec.department || ''}</td><td style="border:none;"><b>Supervisor:</b> ${rec.supervisor || ''}</td></tr>
      <tr style="border:none;"><td style="border:none;"><b>Hire Date:</b> ${rec.hire_date || ''}</td><td style="border:none;"><b>Termination Date:</b> ${rec.termination_date || ''}</td></tr>
      <tr style="border:none;"><td style="border:none;"><b>Starting Position:</b> ${rec.starting_position || ''}</td><td style="border:none;"><b>Ending Position:</b> ${rec.ending_position || ''}</td></tr>
      <tr style="border:none;"><td style="border:none;"><b>Salary:</b> ${rec.salary || ''}</td><td style="border:none;"><b>Interview Date:</b> ${rec.interview_date || ''}</td></tr>
    </table>

    <div class="section">PART I — REASONS FOR LEAVING</div>
    <p>${rec.reasons || 'N/A'}</p>
    ${rec.dismissal_details ? `<p><b>Dismissal Details:</b> ${rec.dismissal_details}</p>` : ''}
    ${rec.additional_comments ? `<p><b>Plans After Leaving:</b> ${rec.additional_comments}</p>` : ''}

    <div class="section">PART II — COMMENTS / SUGGESTIONS FOR IMPROVEMENT</div>
    <table>
      <tr><td style="width:50%;"><b>Liked best about job:</b><br/>${rec.liked_most || 'N/A'}</td><td><b>Liked least about job:</b><br/>${rec.liked_least || 'N/A'}</td></tr>
      <tr><td colspan="2"><b>Pay & Benefits opinion:</b><br/>${rec.pay_benefits_opinion || 'N/A'}</td></tr>
    </table>

    <div class="section">PART III — SATISFACTION RATINGS</div>
    <table><thead><tr><th>Factor</th><th style="text-align:center;">1</th><th style="text-align:center;">2</th><th style="text-align:center;">3</th><th style="text-align:center;">4</th><th style="text-align:center;">5</th></tr></thead><tbody>
    ${Object.keys(ratingLabels).map(k => `<tr><td>${ratingLabels[k]}</td>${[1,2,3,4,5].map(n => `<td style="text-align:center;">${(ratings[k] || 3) === n ? '●' : '○'}</td>`).join('')}</tr>`).join('')}
    </tbody></table>

    <div class="section">PART IV — ADDITIONAL</div>
    <p><b>Would you recommend this organization?</b><br/>${rec.would_recommend || 'N/A'}</p>
    <p><b>Improvement suggestions:</b><br/>${rec.improvement_suggestions || 'N/A'}</p>

    <div class="sig-row">
      ${sigBlock('Employee Signature:', rec.employee_sig, rec.employee_name)}
      ${sigBlock(`Interviewer (${rec.interviewer_name || ''})${rec.interviewer_date ? ' — ' + rec.interviewer_date : ''}:`, rec.interviewer_sig, rec.interviewer_name)}
    </div>
    </body></html>`);
    w.document.close(); setTimeout(() => {
      w.print();
      try { fetch('/api/activity', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ action: 'export_pdf', description: `Exit Interview PDF — ${rec.employee_name || ''}`, entity: 'exit_interview', entity_id: rec.id || null, meta: { source: 'OffboardingHub' } }) }).catch(() => {}); } catch {};
    }, 300);
  };

  const reasonCounts = offboardingData.reduce((acc: any, curr) => { const r = curr.reason || 'Other'; acc[r] = (acc[r] || 0) + 1; return acc; }, {});
  const pieData = Object.keys(reasonCounts).map(k => ({ name: k, value: reasonCounts[k] }));
  const COLORS = ['#0f766e', '#14b8a6', '#f59e0b', '#ef4444'];
  const filteredExitInterviews = exitInterviews.filter(ei => !exitSearch || ei.employee_name?.toLowerCase().includes(exitSearch.toLowerCase()) || ei.department?.toLowerCase().includes(exitSearch.toLowerCase()));
  const filteredPropertyRecords = propertyRecords.filter(r => !propSearch || r.employee_name?.toLowerCase().includes(propSearch.toLowerCase()) || r.position_dept?.toLowerCase().includes(propSearch.toLowerCase()));

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-4">
        <SectionHeader title="Offboarding & Exit Hub" subtitle="Process final clearances and exit interviews" />
        <div className="flex gap-2">
          <button onClick={() => exportToCSV(offboardingData, 'offboarding')} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><Download size={16} /> XLSX</button>
          <button onClick={() => setActiveForm(activeForm === 'offboard' ? 'none' : 'offboard')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeForm === 'offboard' ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300' : 'bg-red-500 text-white hover:bg-red-600'}`}>
            {activeForm === 'offboard' ? <><X size={16} /> Close</> : <><Plus size={16} /> New Offboarding</>}
          </button>
          <button onClick={() => setActiveForm(activeForm === 'property' ? 'none' : 'property')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeForm === 'property' ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300' : 'bg-teal-deep text-white hover:bg-teal-green'}`}>
            {activeForm === 'property' ? <><X size={16} /> Close</> : <><Box size={16} /> Property</>}
          </button>
          <button onClick={() => setActiveForm(activeForm === 'exit' ? 'none' : 'exit')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeForm === 'exit' ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300' : 'bg-teal-green text-white hover:bg-teal-deep'}`}>
            {activeForm === 'exit' ? <><X size={16} /> Close</> : <><LogOut size={16} /> Exit Interview</>}
          </button>
        </div>
      </div>

      {activeForm === 'offboard' && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4">
          <Card>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 border-b dark:border-slate-800 pb-2">New Offboarding Record</h3>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); submitOffboarding(); }}>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employee Name</label>
                  {employees.length > 0 ? (
                    <SearchableSelect
                      options={employees.map(e => ({ value: e.name, label: e.name, avatarUrl: (e as any).profile_picture || null }))}
                      value={offForm.employee_name}
                      onChange={v => setOffForm({ ...offForm, employee_name: String(v) })}
                      placeholder="Select Employee..."
                      dropdownVariant="pills-horizontal"
                    />
                  ) : (
                    <input type="text" value={offForm.employee_name} onChange={e => setOffForm({ ...offForm, employee_name: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" maxLength={120} required />
                  )}
                </div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Last Day</label><input type="date" value={offForm.last_day} onChange={e => setOffForm({ ...offForm, last_day: e.target.value })} max={todayISO} required className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Reason</label><select value={offForm.reason} onChange={e => setOffForm({ ...offForm, reason: e.target.value })} required className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100"><option value="">Select...</option><option>Resignation</option><option>Relocation</option><option>Better Opportunity</option><option>Retirement</option><option>Termination</option><option>Other</option></select></div>
              </div>
              <div className="flex justify-end"><button type="submit" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green">Create Record</button></div>
            </form>
          </Card>
        </motion.div>
      )}

      {activeForm === 'property' && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4">
          <Card>
            <div className="text-center mb-4 border-b border-slate-200 dark:border-slate-700 pb-4">
              <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 uppercase">ABC Corp.</h2>
              <h3 className="text-sm font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest">Property Accountability Form</h3>
            </div>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); submitProperty(); }}>
              {/* Employee Info */}
              <div className="grid grid-cols-3 gap-4">
                <div><label className={labelCls}>Employee Name <span className="text-red-500">*</span></label>
                  {employees.length > 0 ? (
                    <SearchableSelect
                      options={employees.map(e => ({ value: e.name, label: e.name, avatarUrl: (e as any).profile_picture || null }))}
                      value={propForm.employee_name}
                      onChange={v => {
                        const employeeName = String(v);
                        const selected = employees.find(e => String(e.name || '') === employeeName);
                        setPropForm(prev => ({
                          ...prev,
                          employee_name: employeeName,
                          position_dept: String((selected as any)?.dept || prev.position_dept || ''),
                        }));
                      }}
                      placeholder="Select Employee..."
                      dropdownVariant="pills-horizontal"
                    />
                  ) : (
                    <input type="text" value={propForm.employee_name} onChange={e => setPropForm({ ...propForm, employee_name: e.target.value })} className={inputCls} maxLength={120} required />
                  )}
                </div>
                <div><label className={labelCls}>Position / Dept.</label><input type="text" value={propForm.position_dept} onChange={e => setPropForm({ ...propForm, position_dept: e.target.value })} className={inputCls} maxLength={120} required /></div>
                <div><label className={labelCls}>Date Prepared</label><input type="date" value={propForm.date_prepared} onChange={e => setPropForm({ ...propForm, date_prepared: e.target.value })} max={todayISO} className={inputCls} required /></div>
              </div>

              {/* Property Items Table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest flex items-center gap-2"><Package size={14} /> Property Items</h4>
                  <button type="button" onClick={addPropRow} className="text-xs font-bold text-teal-deep dark:text-teal-green hover:underline flex items-center gap-1"><Plus size={12} /> Add Row</button>
                </div>
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800">
                        <th className="py-2 px-2 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700" style={{ minWidth: 90 }}>Property No.</th>
                        <th className="py-2 px-2 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700" style={{ minWidth: 100 }}>Asset Category</th>
                        <th className="py-2 px-2 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700">Brand</th>
                        <th className="py-2 px-2 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700">Description</th>
                        <th className="py-2 px-2 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700">Serial No.</th>
                        <th className="py-2 px-2 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700" style={{ minWidth: 70 }}>UOM/QTY</th>
                        <th className="py-2 px-2 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700" style={{ minWidth: 80 }}>DR/SI No.</th>
                        <th className="py-2 px-2 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700" style={{ minWidth: 80 }}>Amount</th>
                        <th className="py-2 px-2 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700">Remarks</th>
                        <th className="py-2 px-2 border-b border-slate-200 dark:border-slate-700" style={{ width: 32 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {propForm.items.map((item, idx) => (
                        <tr key={idx} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="p-1"><input type="text" value={item.property_number} onChange={e => updatePropRow(idx, 'property_number', e.target.value)} className={inputCls + ' !p-1 !text-xs'} placeholder="PN-001" maxLength={80} /></td>
                          <td className="p-1">
                            <SearchableSelect
                              options={[
                                { value: '', label: 'Category...' },
                                { value: 'IT Equipment', label: 'IT Equipment' },
                                { value: 'Office Furniture', label: 'Office Furniture' },
                                { value: 'Vehicle', label: 'Vehicle' },
                                { value: 'Tools', label: 'Tools' },
                                { value: 'Supplies', label: 'Supplies' },
                                { value: 'Other', label: 'Other' },
                              ]}
                              value={item.asset_category}
                              onChange={(v) => updatePropRow(idx, 'asset_category', String(v))}
                              placeholder="Category..."
                              searchable
                              dropdownVariant="pills-horizontal"
                            />
                          </td>
                          <td className="p-1"><input type="text" value={item.brand} onChange={e => updatePropRow(idx, 'brand', e.target.value)} className={inputCls + ' !p-1 !text-xs'} placeholder="Brand" maxLength={120} /></td>
                          <td className="p-1"><input type="text" value={item.description} onChange={e => updatePropRow(idx, 'description', e.target.value)} className={inputCls + ' !p-1 !text-xs'} placeholder="Description" maxLength={200} /></td>
                          <td className="p-1"><input type="text" value={item.serial_no} onChange={e => updatePropRow(idx, 'serial_no', e.target.value)} className={inputCls + ' !p-1 !text-xs'} placeholder="SN-XXX" maxLength={120} /></td>
                          <td className="p-1"><input type="number" min="0.01" step="0.01" value={item.uom_qty} onChange={e => updatePropRow(idx, 'uom_qty', e.target.value)} className={inputCls + ' !p-1 !text-xs'} placeholder="1" /></td>
                          <td className="p-1"><input type="text" value={item.dr_si_no} onChange={e => updatePropRow(idx, 'dr_si_no', e.target.value)} className={inputCls + ' !p-1 !text-xs'} placeholder="DR-001" maxLength={80} /></td>
                          <td className="p-1"><input type="number" min="0" step="0.01" value={item.amount} onChange={e => updatePropRow(idx, 'amount', e.target.value)} className={inputCls + ' !p-1 !text-xs'} placeholder="0.00" /></td>
                          <td className="p-1"><input type="text" value={item.remarks} onChange={e => updatePropRow(idx, 'remarks', e.target.value)} className={inputCls + ' !p-1 !text-xs'} placeholder="Remarks" maxLength={200} /></td>
                          <td className="p-1 text-center">{propForm.items.length > 1 && <button type="button" onClick={() => removePropRow(idx)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Signatures are completed in Signature Queue */}
              <div>
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3 flex items-center gap-2"><FileText size={14} /> Signatures</h4>
                <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-3 bg-slate-50 dark:bg-slate-800/40">
                  <p className="text-xs text-slate-500 dark:text-slate-300">
                    Signature fields (Turnover, Noted, Received, Audited) are completed after saving from the <span className="font-bold">Signature Queue</span>.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
                <span className="text-[10px] text-slate-400 dark:text-slate-500 italic">CC: 201 File / Audit / Employee</span>
                <div className="flex gap-3">
                  <button type="button" onClick={() => { resetPropForm(); setActiveForm('none'); }} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">Cancel</button>
                  <button type="submit" className="gradient-bg text-white px-6 py-2 rounded-xl text-sm font-bold hover:opacity-90 transition-all shadow-lg shadow-teal-green/10">Save Property Accountability</button>
                </div>
              </div>
            </form>
          </Card>
        </motion.div>
      )}

      {activeForm === 'exit' && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4">
          <Card>
            {/* Form Header */}
            <div className="text-center mb-4 border-b border-slate-200 dark:border-slate-700 pb-4">
              <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 uppercase">Confidential Employee Exit Interview Form</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">All information provided is strictly confidential</p>
            </div>
            <form className="space-y-5" onSubmit={e => { e.preventDefault(); submitExitInterview(); }}>
              {/* Employee Information */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3 flex items-center gap-2"><FileText size={14} /> Employee Information</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div><label className={labelCls}>Employee Name <span className="text-red-500">*</span></label>
                    {employees.length > 0 ? (
                      <SearchableSelect
                        options={employees.map(e => ({ value: e.name, label: e.name, avatarUrl: (e as any).profile_picture || null }))}
                        value={exitForm.employee_name}
                        onChange={v => setExitForm({ ...exitForm, employee_name: String(v) })}
                        placeholder="Select Employee..."
                        dropdownVariant="pills-horizontal"
                      />
                    ) : (
                      <input type="text" value={exitForm.employee_name} onChange={e => setExitForm({ ...exitForm, employee_name: e.target.value })} className={inputCls} maxLength={120} required />
                    )}
                  </div>
                  <div><label className={labelCls}>SSN</label><input type="text" value={exitForm.ssn} onChange={e => setExitForm({ ...exitForm, ssn: e.target.value })} className={inputCls} maxLength={64} required /></div>
                  <div><label className={labelCls}>Interview Date</label><input type="date" value={exitForm.interview_date} onChange={e => setExitForm({ ...exitForm, interview_date: e.target.value })} max={todayISO} className={inputCls} required /></div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div><label className={labelCls}>Department</label><SearchableSelect options={['Accounting/Financing','Sales Admin','Marketing','Pre-Technical','Post-Technical','Executives','Engineering','HR','Operations','IT'].map(d => ({ value: d, label: d }))} value={exitForm.department} onChange={v => setExitForm({ ...exitForm, department: String(v) })} placeholder="Select department..." allowEmpty emptyLabel="Select department..." searchable dropdownVariant="pills-horizontal" className="w-full" /></div>
                  <div><label className={labelCls}>Supervisor</label><SearchableSelect options={departmentSupervisorOptions} value={exitForm.supervisor} onChange={(value: any) => setExitForm({ ...exitForm, supervisor: String(value) })} placeholder={exitForm.department ? 'Select HR / manager / supervisor...' : 'Select department first'} allowEmpty emptyLabel="No supervisor" searchable dropdownVariant="pills-horizontal" /></div>
                </div>
                <div className="grid grid-cols-4 gap-4 mt-3">
                  <div><label className={labelCls}>Hire Date</label><input type="date" value={exitForm.hire_date} onChange={e => setExitForm({ ...exitForm, hire_date: e.target.value })} max={todayISO} className={inputCls} required /></div>
                  <div><label className={labelCls}>Termination Date</label><input type="date" value={exitForm.termination_date} onChange={e => setExitForm({ ...exitForm, termination_date: e.target.value })} max={todayISO} className={inputCls} required /></div>
                  <div><label className={labelCls}>Starting Position</label><input type="text" value={exitForm.starting_position} onChange={e => setExitForm({ ...exitForm, starting_position: e.target.value })} className={inputCls} maxLength={120} required /></div>
                  <div><label className={labelCls}>Ending Position</label><input type="text" value={exitForm.ending_position} onChange={e => setExitForm({ ...exitForm, ending_position: e.target.value })} className={inputCls} maxLength={120} required /></div>
                </div>
                <div className="grid grid-cols-4 gap-4 mt-3">
                  <div><label className={labelCls}>Salary</label><input type="number" min="0.01" step="0.01" value={exitForm.salary} onChange={e => setExitForm({ ...exitForm, salary: e.target.value })} className={inputCls} placeholder="0.00" required /></div>
                </div>
              </div>

              {/* Part I: Reasons for Leaving */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Part I — Reasons for Leaving</h4>
                <div className="grid grid-cols-4 gap-4 text-sm">
                  {/* Column 1: Resignation */}
                  <div>
                    <p className="font-bold text-slate-700 dark:text-slate-200 mb-2 text-xs uppercase tracking-wide">Resignation</p>
                    {['Dissatisfaction with salary', 'Found better opportunity', 'Dissatisfaction with type of work', 'Relocation / transfer city', 'Dissatisfaction with co-workers', 'Dissatisfaction with supervisor'].map(r => (
                      <label key={r} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 mb-1.5 cursor-pointer"><input type="checkbox" checked={exitForm.reason_details.includes(r)} onChange={() => setExitForm(prev => ({ ...prev, reason_category: 'Resignation', reason_details: prev.reason_details.includes(r) ? prev.reason_details.filter(x => x !== r) : [...prev.reason_details, r] }))} className="rounded mt-0.5 accent-teal-600" /> {r}</label>
                    ))}
                  </div>
                  {/* Column 2: Layoff */}
                  <div>
                    <p className="font-bold text-slate-700 dark:text-slate-200 mb-2 text-xs uppercase tracking-wide">Layoff</p>
                    {['Abolition of position', 'Lack of funds', 'Other layoff reason'].map(r => (
                      <label key={r} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 mb-1.5 cursor-pointer"><input type="checkbox" checked={exitForm.reason_details.includes(r)} onChange={() => setExitForm(prev => ({ ...prev, reason_category: 'Layoff', reason_details: prev.reason_details.includes(r) ? prev.reason_details.filter(x => x !== r) : [...prev.reason_details, r] }))} className="rounded mt-0.5 accent-teal-600" /> {r}</label>
                    ))}
                    <p className="font-bold text-slate-700 dark:text-slate-200 mb-2 mt-3 text-xs uppercase tracking-wide">Retirement</p>
                    {['Disability retirement', 'Regular retirement'].map(r => (
                      <label key={r} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 mb-1.5 cursor-pointer"><input type="checkbox" checked={exitForm.reason_details.includes(r)} onChange={() => setExitForm(prev => ({ ...prev, reason_category: 'Retirement', reason_details: prev.reason_details.includes(r) ? prev.reason_details.filter(x => x !== r) : [...prev.reason_details, r] }))} className="rounded mt-0.5 accent-teal-600" /> {r}</label>
                    ))}
                  </div>
                  {/* Column 3: Dismissal */}
                  <div>
                    <p className="font-bold text-slate-700 dark:text-slate-200 mb-2 text-xs uppercase tracking-wide">Dismissal</p>
                    {['Misconduct', 'Poor performance', 'Policy violation', 'Other dismissal reason'].map(r => (
                      <label key={r} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 mb-1.5 cursor-pointer"><input type="checkbox" checked={exitForm.reason_details.includes(r)} onChange={() => setExitForm(prev => ({ ...prev, reason_category: 'Dismissal', reason_details: prev.reason_details.includes(r) ? prev.reason_details.filter(x => x !== r) : [...prev.reason_details, r] }))} className="rounded mt-0.5 accent-teal-600" /> {r}</label>
                    ))}
                    <div className="mt-2">
                      <label className={labelCls}>Specify Details</label>
                      <input type="text" value={exitForm.dismissal_details} onChange={e => setExitForm({ ...exitForm, dismissal_details: e.target.value })} className={inputCls} placeholder="Specify if other..." maxLength={250} required={exitForm.reason_category === 'Dismissal'} />
                    </div>
                  </div>
                  {/* Column 4: Plans */}
                  <div>
                    <p className="font-bold text-slate-700 dark:text-slate-200 mb-2 text-xs uppercase tracking-wide">Plans After Leaving</p>
                    <textarea rows={6} value={exitForm.additional_comments} onChange={e => setExitForm({ ...exitForm, additional_comments: e.target.value })} className={inputCls} placeholder="Describe your plans after leaving the organization..." maxLength={2000} />
                  </div>
                </div>
              </div>

              {/* Part II: Comments / Suggestions */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Part II — Comments / Suggestions for Improvement</h4>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div><label className={labelCls}>What did you like best about your job?</label><textarea rows={2} value={exitForm.liked_most} onChange={e => setExitForm({ ...exitForm, liked_most: e.target.value })} className={inputCls} minLength={5} maxLength={1000} required /></div>
                  <div><label className={labelCls}>What did you like least about your job?</label><textarea rows={2} value={exitForm.liked_least} onChange={e => setExitForm({ ...exitForm, liked_least: e.target.value })} className={inputCls} minLength={5} maxLength={1000} required /></div>
                  <div className="col-span-2"><label className={labelCls}>How did you feel about the pay and benefits?</label><textarea rows={2} value={exitForm.pay_benefits_opinion} onChange={e => setExitForm({ ...exitForm, pay_benefits_opinion: e.target.value })} className={inputCls} minLength={5} maxLength={1000} required /></div>
                </div>
              </div>

              {/* Part III: Satisfaction Ratings */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-1">Part III — Satisfaction Ratings</h4>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-3">Rate the following: 1 = Very Dissatisfied, 2 = Dissatisfied, 3 = Neutral, 4 = Satisfied, 5 = Very Satisfied</p>
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/50">
                      <tr>
                        <th className="p-2.5 text-left font-bold text-slate-500 uppercase text-[10px]">Factor</th>
                        {['1 — Very Dissatisfied', '2 — Dissatisfied', '3 — Neutral', '4 — Satisfied', '5 — Very Satisfied'].map((h, i) => (
                          <th key={i} className="p-2 text-center font-bold text-slate-500 text-[10px] whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { key: 'opportunity_use_abilities', label: 'Opportunity to use your abilities' },
                        { key: 'recognition', label: 'Recognition for work you did' },
                        { key: 'career_goals', label: 'Progress toward career goals' },
                        { key: 'supervisor_relationship', label: 'Relationship with supervisor' },
                        { key: 'info_accuracy', label: 'Information you received was accurate' },
                        { key: 'clear_expectations', label: 'Clear expectations from supervisor' },
                        { key: 'training_provided', label: 'Training provided for your job' },
                        { key: 'coworker_relations', label: 'Co-worker relations' },
                        { key: 'discipline_policies', label: 'Discipline policies and practices' },
                        { key: 'physical_conditions', label: 'Physical working conditions' },
                        { key: 'benefits', label: 'Benefits' },
                      ].map(item => (
                        <tr key={item.key} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                          <td className="p-2.5 text-slate-600 dark:text-slate-300 font-medium">{item.label}</td>
                          {[1,2,3,4,5].map(n => (
                            <td key={n} className="p-2 text-center">
                              <input type="radio" name={`exit-${item.key}`} checked={exitForm.satisfaction_ratings[item.key] === n}
                                onChange={() => setExitForm(prev => ({ ...prev, satisfaction_ratings: { ...prev.satisfaction_ratings, [item.key]: n } }))}
                                className="w-4 h-4 accent-teal-600 cursor-pointer" required={n === 1} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Part IV: Recommendation & Improvements */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Part IV — Additional Comments</h4>
                <div className="space-y-3">
                  <div><label className={labelCls}>Would you recommend this organization to a friend? If seeking another job, what kind?</label><textarea rows={2} value={exitForm.would_recommend} onChange={e => setExitForm({ ...exitForm, would_recommend: e.target.value })} className={inputCls} minLength={5} maxLength={1000} required /></div>
                  <div><label className={labelCls}>What changes or improvement would you suggest that might have influenced your decision to stay?</label><textarea rows={2} value={exitForm.improvement_suggestions} onChange={e => setExitForm({ ...exitForm, improvement_suggestions: e.target.value })} className={inputCls} minLength={5} maxLength={1000} required /></div>
                </div>
              </div>

              {/* Signatures */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3 flex items-center gap-2"><FileText size={14} /> Signatures</h4>
                <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-3 bg-slate-50 dark:bg-slate-800/40">
                  <p className="text-xs text-slate-500 dark:text-slate-300">
                    Signature fields (Employee and Interviewer/HR) are completed after saving from the <span className="font-bold">Signature Queue</span>.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
                <span className="text-[10px] text-slate-400 dark:text-slate-500 italic">For official HR Admin use only — file in 201 Employee Folder</span>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setActiveForm('none')} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">Cancel</button>
                  <button type="submit" className="gradient-bg text-white px-6 py-2 rounded-xl text-sm font-bold hover:opacity-90 transition-all shadow-lg shadow-teal-green/10">Save Exit Interview</button>
                </div>
              </div>
            </form>
          </Card>
        </motion.div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <Card>
          <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">Reasons for Leaving</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">{pieData.map((_e, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}</Pie><Tooltip /></PieChart></ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 mt-2 justify-center">{pieData.map((d, i) => (<span key={d.name} className="flex items-center gap-1 text-[10px] font-bold text-slate-500"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></span>{d.name}</span>))}</div>
        </Card>
        <div className="xl:col-span-2">
          <Card>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">Offboarding Records ({offboardingData.length})</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left"><thead><tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Employee</th>
                <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Last Day</th>
                <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reason</th>
                <th className="pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Clearance</th>
                <th className="pb-3"></th>
              </tr></thead><tbody>
                {offboardingData.map(data => (
                  <React.Fragment key={data.id}>
                    <tr className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors cursor-pointer" onClick={() => setExpandedOffboarding(expandedOffboarding === data.id ? null : data.id)}>
                      <td className="py-4 font-medium text-slate-700 dark:text-slate-200">
                        <div className="flex items-center gap-2">
                          {expandedOffboarding === data.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          {data.employee_name}
                        </div>
                      </td>
                      <td className="py-4 text-sm text-slate-500 dark:text-slate-400">{data.last_day}</td>
                      <td className="py-4 text-sm text-slate-500 dark:text-slate-400">{data.reason}</td>
                      <td className="py-4">
                        {data.clearance_status === 'Completed' ? (
                          <span className="font-bold text-[10px] uppercase tracking-wider text-emerald-600">Completed</span>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); markCleared(data.id); }} className="font-bold text-[10px] uppercase tracking-wider text-amber-500 hover:text-emerald-600">Pending (click to clear)</button>
                        )}
                      </td>
                      <td className="py-4">
                        <div className="flex justify-end gap-2" onClick={e => e.stopPropagation()}>
                          <button onClick={() => setExpandedOffboarding(expandedOffboarding === data.id ? null : data.id)} className="text-blue-500 hover:text-blue-700" title="View Record"><Eye size={15} /></button>
                          <button onClick={() => deleteOffboarding(data.id)} className="text-red-500 hover:text-red-600 p-1 rounded" title="Archive"><Archive size={15} /></button>
                        </div>
                      </td>
                    </tr>
                    <AnimatePresence>
                      {expandedOffboarding === data.id && (
                        <tr>
                          <td colSpan={5} className="p-0">
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                              <div className="bg-slate-50 dark:bg-slate-900/50 p-4 border-b border-slate-200 dark:border-slate-700 grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                                <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Employee</span><span className="text-slate-700 dark:text-slate-200">{data.employee_name || '—'}</span></div>
                                <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Last Day</span><span className="text-slate-700 dark:text-slate-200">{data.last_day || '—'}</span></div>
                                <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Reason</span><span className="text-slate-700 dark:text-slate-200">{data.reason || '—'}</span></div>
                                <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Clearance</span><span className="text-slate-700 dark:text-slate-200">{data.clearance_status || 'Pending'}</span></div>
                              </div>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                ))}
                {offboardingData.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-400">No offboarding records</td></tr>}
              </tbody></table>
            </div>
          </Card>
        </div>
      </div>

      <Card>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase">Exit Interviews ({exitInterviews.length})</h3>
            <div className="flex gap-2 items-center">
              <div className="relative w-48">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input type="text" placeholder="Search..." value={exitSearch} onChange={e => setExitSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-green/50 placeholder:text-slate-400" />
              </div>
              <button onClick={() => exportToCSV(exitInterviews.map(ei => ({
                employee: ei.employee_name, department: ei.department, supervisor: ei.supervisor,
                interview_date: ei.interview_date, reasons: ei.reasons, hire_date: ei.hire_date,
                termination_date: ei.termination_date, would_recommend: ei.would_recommend
              })), 'exit_interviews')}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                <Download size={13} /> XLSX
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead><tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Employee</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Department</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Date</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Reasons</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider text-right">Actions</th>
              </tr></thead>
              <tbody>
                {filteredExitInterviews.map((ei: any) => {
                  const isExpanded = expandedExit === ei.id;
                  const ratings: Record<string, number> = (() => { try { return JSON.parse(ei.satisfaction_ratings || '{}'); } catch { return {}; } })();
                  return (
                    <React.Fragment key={ei.id}>
                      <tr className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors cursor-pointer"
                        onClick={() => setExpandedExit(isExpanded ? null : ei.id)}>
                        <td className="py-3 px-4 font-medium text-slate-700 dark:text-slate-100 flex items-center gap-2">
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {ei.employee_name}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{ei.department}</td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{ei.interview_date}</td>
                        <td className="py-3 px-4 text-slate-500 dark:text-slate-400 text-xs max-w-[200px] truncate">{ei.reasons}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex justify-end gap-2" onClick={e => e.stopPropagation()}>
                            <button onClick={() => setExpandedExit(isExpanded ? null : ei.id)} className="text-blue-500 hover:text-blue-700" title="View"><Eye size={15} /></button>
                            <button onClick={() => printExitInterview(ei)} className="text-blue-500 hover:text-blue-700" title="Export PDF"><FileText size={15} /></button>
                            <button onClick={() => deleteExitInterview(ei.id)} className="text-red-500 hover:text-red-600 p-1 rounded" title="Archive"><Archive size={15} /></button>
                          </div>
                        </td>
                      </tr>
                      <AnimatePresence>
                        {isExpanded && (
                          <tr><td colSpan={5} className="p-0">
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                              <div className="bg-slate-50 dark:bg-slate-900/50 p-5 border-b border-slate-200 dark:border-slate-700">
                                {/* Employee Info */}
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs mb-4">
                                  <div><span className="font-bold text-slate-500 uppercase block text-[10px]">SSN</span><span className="text-slate-700 dark:text-slate-200">{ei.ssn || '—'}</span></div>
                                  <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Hire Date</span><span className="text-slate-700 dark:text-slate-200">{ei.hire_date || '—'}</span></div>
                                  <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Termination Date</span><span className="text-slate-700 dark:text-slate-200">{ei.termination_date || '—'}</span></div>
                                  <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Supervisor</span><span className="text-slate-700 dark:text-slate-200">{ei.supervisor || '—'}</span></div>
                                  <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Starting Position</span><span className="text-slate-700 dark:text-slate-200">{ei.starting_position || '—'}</span></div>
                                  <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Ending Position</span><span className="text-slate-700 dark:text-slate-200">{ei.ending_position || '—'}</span></div>
                                  <div><span className="font-bold text-slate-500 uppercase block text-[10px]">Salary</span><span className="text-slate-700 dark:text-slate-200">{ei.salary || '—'}</span></div>
                                </div>
                                {/* Comments */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs mb-4">
                                  {ei.liked_most && <div><span className="font-bold text-teal-deep dark:text-teal-green block mb-1">Liked Best</span><p className="text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700">{ei.liked_most}</p></div>}
                                  {ei.liked_least && <div><span className="font-bold text-teal-deep dark:text-teal-green block mb-1">Liked Least</span><p className="text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700">{ei.liked_least}</p></div>}
                                  {ei.pay_benefits_opinion && <div className="col-span-2"><span className="font-bold text-teal-deep dark:text-teal-green block mb-1">Pay & Benefits</span><p className="text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700">{ei.pay_benefits_opinion}</p></div>}
                                </div>
                                {/* Ratings */}
                                {Object.keys(ratings).length > 0 && (
                                  <div className="mb-4">
                                    <span className="font-bold text-teal-deep dark:text-teal-green block mb-2 text-xs">Satisfaction Ratings</span>
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                                      {Object.entries(ratings).map(([k, v]) => (
                                        <div key={k} className="flex items-center justify-between">
                                          <span className="text-slate-600 dark:text-slate-300 capitalize">{k.replace(/_/g, ' ')}</span>
                                          <div className="flex gap-0.5">{[1,2,3,4,5].map(n => <span key={n} className={`w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold ${n <= v ? 'bg-teal-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}>{n}</span>)}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {(ei.would_recommend || ei.improvement_suggestions) && (
                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs mb-4">
                                    {ei.would_recommend && <div><span className="font-bold text-teal-deep dark:text-teal-green block mb-1">Would Recommend</span><p className="text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700">{ei.would_recommend}</p></div>}
                                    {ei.improvement_suggestions && <div><span className="font-bold text-teal-deep dark:text-teal-green block mb-1">Improvement Suggestions</span><p className="text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700">{ei.improvement_suggestions}</p></div>}
                                  </div>
                                )}
                                {/* Signatures */}
                                <div className="grid grid-cols-2 gap-6 mt-4">
                                  <div className="text-center">
                                    <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employee Signature</div>
                                    {ei.employee_sig ? <img src={ei.employee_sig} alt="Employee sig" className="h-12 mx-auto" /> : <div className="h-12 border-b border-slate-300 dark:border-slate-600" />}
                                  </div>
                                  <div className="text-center">
                                    <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Interviewer</div>
                                    {ei.interviewer_sig ? <img src={ei.interviewer_sig} alt="Interviewer sig" className="h-12 mx-auto" /> : <div className="h-12 border-b border-slate-300 dark:border-slate-600" />}
                                    <div className="text-xs text-slate-700 dark:text-slate-200 mt-1">{ei.interviewer_name || '—'}</div>
                                    <div className="text-[10px] text-slate-400">{ei.interviewer_date || ''}</div>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          </td></tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  );
                })}
                {filteredExitInterviews.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-400">{exitSearch ? 'No exit interviews match your search.' : 'No exit interviews yet.'}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
      </Card>

      {/* Property Accountability Records */}
      <Card>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase">Property Accountability Records ({propertyRecords.length})</h3>
          <div className="flex gap-2 items-center">
            <div className="relative w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input type="text" placeholder="Search..." value={propSearch} onChange={e => setPropSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-green/50 placeholder:text-slate-400" />
            </div>
            {propertyRecords.length > 0 && (
              <button onClick={() => exportToCSV(propertyRecords.map(r => {
                const items: PropertyRow[] = (() => { try { return JSON.parse(r.items || '[]'); } catch { return []; } })();
                return { employee: r.employee_name, position_dept: r.position_dept, date: r.date_prepared, items_count: items.length, total_amount: items.reduce((s: number, it: PropertyRow) => s + (parseFloat(it.amount) || 0), 0) };
              }), 'property_accountability')}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                <Download size={13} /> XLSX
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead><tr className="border-b border-slate-100 dark:border-slate-800">
              <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Employee</th>
              <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Position / Dept.</th>
              <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Date</th>
              <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider text-center">Items</th>
              <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider text-right">Total</th>
              <th className="py-3 px-4 text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider text-right">Actions</th>
            </tr></thead>
            <tbody>
              {filteredPropertyRecords.length === 0 && (
                <tr><td colSpan={6} className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">No property accountability records</td></tr>
              )}
              {filteredPropertyRecords.map((rec: any) => {
                const items: PropertyRow[] = (() => { try { return JSON.parse(rec.items || '[]'); } catch { return []; } })();
                const total = items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
                const isExpanded = expandedProp === rec.id;
                return (
                  <React.Fragment key={rec.id}>
                    <tr className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors cursor-pointer"
                      onClick={() => setExpandedProp(isExpanded ? null : rec.id)}>
                      <td className="py-3 px-4 font-medium text-slate-700 dark:text-slate-100 flex items-center gap-2">
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        <div className="min-w-0">
                          <span className="truncate max-w-55" title={rec.employee_name}>{rec.employee_name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        <div className="min-w-0"><span className="truncate max-w-55" title={rec.position_dept}>{rec.position_dept}</span></div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{rec.date_prepared}</td>
                      <td className="py-3 px-4 text-center"><span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full text-[10px] font-bold">{items.length}</span></td>
                      <td className="py-3 px-4 text-right font-mono text-sm text-slate-700 dark:text-slate-200">₱{total.toLocaleString('en', { minimumFractionDigits: 2 })}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex justify-end gap-2" onClick={e => e.stopPropagation()}>
                          <button onClick={() => setExpandedProp(isExpanded ? null : rec.id)} className="text-blue-500 hover:text-blue-700" title="View"><Eye size={15} /></button>
                          <button onClick={() => printPropRecord(rec)} className="text-blue-500 hover:text-blue-700" title="Export PDF"><FileText size={15} /></button>
                          <button onClick={() => deletePropRecord(rec.id)} className="text-red-500 hover:text-red-600 p-1 rounded" title="Archive"><Archive size={15} /></button>
                        </div>
                      </td>
                    </tr>
                    <AnimatePresence>
                      {isExpanded && (
                        <tr><td colSpan={6} className="p-0">
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 border-b border-slate-200 dark:border-slate-700">
                              <table className="w-full text-left border-collapse border border-slate-200 dark:border-slate-700 text-xs">
                                <thead><tr className="bg-slate-100 dark:bg-slate-800">
                                  {['Property No.','Asset Category','Brand','Description','Serial No.','UOM/QTY','DR/SI No.','Amount','Remarks'].map(h => (
                                    <th key={h} className="py-1.5 px-2 border border-slate-200 dark:border-slate-700">{h}</th>
                                  ))}
                                </tr></thead>
                                <tbody>{items.map((it, i) => (
                                  <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                                    <td className="py-1 px-2 border border-slate-200 dark:border-slate-700">{it.property_number}</td>
                                    <td className="py-1 px-2 border border-slate-200 dark:border-slate-700">{it.asset_category}</td>
                                    <td className="py-1 px-2 border border-slate-200 dark:border-slate-700">{it.brand}</td>
                                    <td className="py-1 px-2 border border-slate-200 dark:border-slate-700">
                                      <div className="min-w-0"><span className="truncate max-w-[240px]" title={it.description}>{it.description}</span></div>
                                    </td>
                                    <td className="py-1 px-2 border border-slate-200 dark:border-slate-700">{it.serial_no}</td>
                                    <td className="py-1 px-2 border border-slate-200 dark:border-slate-700">{it.uom_qty}</td>
                                    <td className="py-1 px-2 border border-slate-200 dark:border-slate-700">{it.dr_si_no}</td>
                                    <td className="py-1 px-2 border border-slate-200 dark:border-slate-700 text-right font-mono">{parseFloat(it.amount) ? `₱${parseFloat(it.amount).toLocaleString('en', { minimumFractionDigits: 2 })}` : ''}</td>
                                    <td className="py-1 px-2 border border-slate-200 dark:border-slate-700">
                                      <div className="min-w-0"><span className="truncate max-w-55" title={it.remarks}>{it.remarks}</span></div>
                                    </td>
                                  </tr>
                                ))}</tbody>
                              </table>
                              <div className="grid grid-cols-4 gap-4 mt-4">
                                {[
                                  { l: 'Turnover by', n: rec.turnover_by_name, s: rec.turnover_by_sig, d: rec.turnover_by_date },
                                  { l: 'Noted by', n: rec.noted_by_name, s: rec.noted_by_sig, d: rec.noted_by_date },
                                  { l: 'Received by', n: rec.received_by_name, s: rec.received_by_sig, d: rec.received_by_date },
                                  { l: 'Audited by', n: rec.audited_by_name, s: rec.audited_by_sig, d: rec.audited_by_date },
                                ].map((sig, i) => (
                                  <div key={i} className="text-center">
                                    <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">{sig.l}</div>
                                    {sig.s ? <img src={sig.s} alt={sig.l} className="h-10 mx-auto" /> : <div className="h-10 border-b border-slate-300 dark:border-slate-600" />}
                                    <div className="text-xs text-slate-700 dark:text-slate-200 mt-1">{sig.n || '—'}</div>
                                    <div className="text-[10px] text-slate-400">{sig.d || ''}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </motion.div>
                        </td></tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </motion.div>
  );
};
