import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { Plus, X, Box, LogOut, Download, Trash2 } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';

export const OffboardingHub = () => {
  const [activeForm, setActiveForm] = useState<'none' | 'property' | 'exit' | 'offboard'>('none');
  const [offboardingData, setOffboardingData] = useState<any[]>([]);
  const [exitInterviews, setExitInterviews] = useState<any[]>([]);
  const [offForm, setOffForm] = useState({ employee_name: '', last_day: '', reason: '' });
  const emptyItem = { property_no: '', asset_category: '', brand: '', description: '', serial_no: '', uom_qty: 1, dr_si_no: '', amount: '', remarks: '' };
  const [propForm, setPropForm] = useState({
    employee_name: '', position_dept: '', date_prepared: new Date().toISOString().split('T')[0],
    turnover_by: '', received_by: '', noted_by: '', audited_by: '',
    items: [{ ...emptyItem }, { ...emptyItem }, { ...emptyItem }, { ...emptyItem }, { ...emptyItem }]
  });
  const [exitForm, setExitForm] = useState({
    employee_name: '', department: '', supervisor: '', interview_date: '',
    ssn: '', hire_date: '', termination_date: '', starting_position: '', ending_position: '', salary: '',
    reason_category: '' as string, reason_details: [] as string[],
    liked_most: '', liked_least: '', pay_benefits_opinion: '',
    satisfaction_ratings: {
      opportunity_use_abilities: 3, recognition: 3, career_goals: 3,
      supervisor_relationship: 3, info_accuracy: 3, clear_expectations: 3,
      training_provided: 3, coworker_relations: 3, discipline_policies: 3,
      physical_conditions: 3, benefits: 3
    } as Record<string, number>,
    would_recommend: '', improvement_suggestions: '', additional_comments: ''
  });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try { const r1 = await fetch('/api/offboarding', { headers: getAuthHeaders() }); const d1 = await r1.json(); setOffboardingData(Array.isArray(d1) ? d1 : []); } catch { setOffboardingData([]); }
    try { const r2 = await fetch('/api/exit_interviews', { headers: getAuthHeaders() }); const d2 = await r2.json(); setExitInterviews(Array.isArray(d2) ? d2 : []); } catch { setExitInterviews([]); }
  };

  const submitOffboarding = async () => {
    if (!offForm.employee_name) { window.notify?.('Please enter employee name', 'error'); return; }
    try {
      const res = await fetch('/api/offboarding', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ ...offForm, clearance_status: 'Pending' }) });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Offboarding record created', 'success');
      setOffForm({ employee_name: '', last_day: '', reason: '' });
      setActiveForm('none'); fetchData();
    } catch { window.notify?.('Failed to create', 'error'); }
  };

  const submitProperty = async () => {
    if (!propForm.employee_name) { window.notify?.('Please enter employee name', 'error'); return; }
    try {
      for (const item of propForm.items) {
        if (item.brand || item.serial_no || item.property_no) {
          await fetch('/api/property_accountability', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ employee_id: null, brand: item.brand, serial_no: item.serial_no, uom_qty: item.uom_qty }) });
        }
      }
      window.notify?.('Property accountability saved', 'success');
      setPropForm({
        employee_name: '', position_dept: '', date_prepared: new Date().toISOString().split('T')[0],
        turnover_by: '', received_by: '', noted_by: '', audited_by: '',
        items: [{ ...emptyItem }, { ...emptyItem }, { ...emptyItem }, { ...emptyItem }, { ...emptyItem }]
      });
      setActiveForm('none');
    } catch { window.notify?.('Failed to save', 'error'); }
  };

  const submitExitInterview = async () => {
    if (!exitForm.employee_name) { window.notify?.('Please enter employee name', 'error'); return; }
    try {
      const res = await fetch('/api/exit_interviews', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({
        employee_name: exitForm.employee_name, department: exitForm.department, supervisor: exitForm.supervisor,
        interview_date: exitForm.interview_date, reasons: `${exitForm.reason_category}: ${exitForm.reason_details.join(', ')}`,
        liked_most: exitForm.liked_most, liked_least: exitForm.liked_least
      }) });
      if (!res.ok) throw new Error('Failed');
      window.notify?.('Exit interview saved', 'success');
      setExitForm({
        employee_name: '', department: '', supervisor: '', interview_date: '',
        ssn: '', hire_date: '', termination_date: '', starting_position: '', ending_position: '', salary: '',
        reason_category: '', reason_details: [],
        liked_most: '', liked_least: '', pay_benefits_opinion: '',
        satisfaction_ratings: {
          opportunity_use_abilities: 3, recognition: 3, career_goals: 3,
          supervisor_relationship: 3, info_accuracy: 3, clear_expectations: 3,
          training_provided: 3, coworker_relations: 3, discipline_policies: 3,
          physical_conditions: 3, benefits: 3
        },
        would_recommend: '', improvement_suggestions: '', additional_comments: ''
      });
      setActiveForm('none'); fetchData();
    } catch { window.notify?.('Failed to save', 'error'); }
  };

  const deleteOffboarding = async (id: number) => {
    if (!confirm('Delete?')) return;
    try { await fetch(`/api/offboarding/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); window.notify?.('Deleted', 'success'); fetchData(); } catch { window.notify?.('Failed', 'error'); }
  };

  const markCleared = async (id: number) => {
    try { await fetch(`/api/offboarding/${id}`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify({ clearance_status: 'Completed' }) }); window.notify?.('Marked as cleared', 'success'); fetchData(); } catch { window.notify?.('Failed', 'error'); }
  };

  const reasonCounts = offboardingData.reduce((acc: any, curr) => { const r = curr.reason || 'Other'; acc[r] = (acc[r] || 0) + 1; return acc; }, {});
  const pieData = Object.keys(reasonCounts).map(k => ({ name: k, value: reasonCounts[k] }));
  const COLORS = ['#0f766e', '#14b8a6', '#f59e0b', '#ef4444'];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-4">
        <SectionHeader title="Offboarding & Exit Hub" subtitle="Process final clearances and exit interviews" />
        <div className="flex gap-2">
          <button onClick={() => exportToCSV(offboardingData, 'offboarding')} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><Download size={16} /> CSV</button>
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
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employee Name</label><input type="text" value={offForm.employee_name} onChange={e => setOffForm({ ...offForm, employee_name: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Last Day</label><input type="date" value={offForm.last_day} onChange={e => setOffForm({ ...offForm, last_day: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Reason</label><select value={offForm.reason} onChange={e => setOffForm({ ...offForm, reason: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100"><option value="">Select...</option><option>Resignation</option><option>Relocation</option><option>Better Opportunity</option><option>Retirement</option><option>Termination</option><option>Other</option></select></div>
              </div>
              <div className="flex justify-end"><button type="submit" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green">Create Record</button></div>
            </form>
          </Card>
        </motion.div>
      )}

      {activeForm === 'property' && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4">
          <Card>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 border-b dark:border-slate-800 pb-2">Property Accountability Form</h3>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); submitProperty(); }}>
              {/* Header */}
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employee Name</label><input type="text" value={propForm.employee_name} onChange={e => setPropForm({ ...propForm, employee_name: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Position / Dept.</label><input type="text" value={propForm.position_dept} onChange={e => setPropForm({ ...propForm, position_dept: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Date Prepared</label><input type="date" value={propForm.date_prepared} onChange={e => setPropForm({ ...propForm, date_prepared: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
              </div>
              {/* Property Table */}
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      <th className="p-2 text-[10px] font-bold text-slate-500 uppercase">Prop. No.</th>
                      <th className="p-2 text-[10px] font-bold text-slate-500 uppercase">Asset Category</th>
                      <th className="p-2 text-[10px] font-bold text-slate-500 uppercase">Brand</th>
                      <th className="p-2 text-[10px] font-bold text-slate-500 uppercase">Description</th>
                      <th className="p-2 text-[10px] font-bold text-slate-500 uppercase">Serial No.</th>
                      <th className="p-2 text-[10px] font-bold text-slate-500 uppercase">UOM/QTY</th>
                      <th className="p-2 text-[10px] font-bold text-slate-500 uppercase">DR/SI No.</th>
                      <th className="p-2 text-[10px] font-bold text-slate-500 uppercase">Amount</th>
                      <th className="p-2 text-[10px] font-bold text-slate-500 uppercase">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {propForm.items.map((item, i) => (
                      <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="p-1"><input type="text" value={item.property_no} onChange={e => { const items = [...propForm.items]; items[i] = { ...items[i], property_no: e.target.value }; setPropForm({ ...propForm, items }); }} className="w-full border-0 bg-transparent text-sm dark:text-slate-100 p-1" placeholder="..." /></td>
                        <td className="p-1"><input type="text" value={item.asset_category} onChange={e => { const items = [...propForm.items]; items[i] = { ...items[i], asset_category: e.target.value }; setPropForm({ ...propForm, items }); }} className="w-full border-0 bg-transparent text-sm dark:text-slate-100 p-1" placeholder="..." /></td>
                        <td className="p-1"><input type="text" value={item.brand} onChange={e => { const items = [...propForm.items]; items[i] = { ...items[i], brand: e.target.value }; setPropForm({ ...propForm, items }); }} className="w-full border-0 bg-transparent text-sm dark:text-slate-100 p-1" placeholder="..." /></td>
                        <td className="p-1"><input type="text" value={item.description} onChange={e => { const items = [...propForm.items]; items[i] = { ...items[i], description: e.target.value }; setPropForm({ ...propForm, items }); }} className="w-full border-0 bg-transparent text-sm dark:text-slate-100 p-1" placeholder="..." /></td>
                        <td className="p-1"><input type="text" value={item.serial_no} onChange={e => { const items = [...propForm.items]; items[i] = { ...items[i], serial_no: e.target.value }; setPropForm({ ...propForm, items }); }} className="w-full border-0 bg-transparent text-sm dark:text-slate-100 p-1" placeholder="..." /></td>
                        <td className="p-1"><input type="number" value={item.uom_qty} onChange={e => { const items = [...propForm.items]; items[i] = { ...items[i], uom_qty: parseInt(e.target.value) || 0 }; setPropForm({ ...propForm, items }); }} className="w-16 border-0 bg-transparent text-sm dark:text-slate-100 p-1" /></td>
                        <td className="p-1"><input type="text" value={item.dr_si_no} onChange={e => { const items = [...propForm.items]; items[i] = { ...items[i], dr_si_no: e.target.value }; setPropForm({ ...propForm, items }); }} className="w-full border-0 bg-transparent text-sm dark:text-slate-100 p-1" placeholder="..." /></td>
                        <td className="p-1"><input type="text" value={item.amount} onChange={e => { const items = [...propForm.items]; items[i] = { ...items[i], amount: e.target.value }; setPropForm({ ...propForm, items }); }} className="w-full border-0 bg-transparent text-sm dark:text-slate-100 p-1" placeholder="0.00" /></td>
                        <td className="p-1"><input type="text" value={item.remarks} onChange={e => { const items = [...propForm.items]; items[i] = { ...items[i], remarks: e.target.value }; setPropForm({ ...propForm, items }); }} className="w-full border-0 bg-transparent text-sm dark:text-slate-100 p-1" placeholder="..." /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={() => setPropForm({ ...propForm, items: [...propForm.items, { ...emptyItem }] })} className="text-xs text-teal-deep dark:text-teal-green font-bold hover:underline">+ Add Row</button>
              {/* Signatures */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t dark:border-slate-800">
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Turnover by</label><input type="text" value={propForm.turnover_by} onChange={e => setPropForm({ ...propForm, turnover_by: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="Signature over printed name w/ date" /></div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Noted by</label><input type="text" value={propForm.noted_by} onChange={e => setPropForm({ ...propForm, noted_by: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="Signature over printed name w/ date" /></div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Received by</label><input type="text" value={propForm.received_by} onChange={e => setPropForm({ ...propForm, received_by: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="Signature over printed name w/ date" /></div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Audited by</label><input type="text" value={propForm.audited_by} onChange={e => setPropForm({ ...propForm, audited_by: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" placeholder="Signature over printed name w/ date" /></div>
              </div>
              <div className="flex justify-end"><button type="submit" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green">Save Property Accountability</button></div>
            </form>
          </Card>
        </motion.div>
      )}

      {activeForm === 'exit' && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4">
          <Card>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">Confidential Employee Exit Interview Form</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-4 border-b dark:border-slate-800 pb-3">All information provided is strictly confidential</p>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); submitExitInterview(); }}>
              {/* Header Info */}
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employee Name</label><input type="text" value={exitForm.employee_name} onChange={e => setExitForm({ ...exitForm, employee_name: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">SSN</label><input type="text" value={exitForm.ssn} onChange={e => setExitForm({ ...exitForm, ssn: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Interview Date</label><input type="date" value={exitForm.interview_date} onChange={e => setExitForm({ ...exitForm, interview_date: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Department</label><input type="text" value={exitForm.department} onChange={e => setExitForm({ ...exitForm, department: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Supervisor</label><input type="text" value={exitForm.supervisor} onChange={e => setExitForm({ ...exitForm, supervisor: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Hire Date</label><input type="date" value={exitForm.hire_date} onChange={e => setExitForm({ ...exitForm, hire_date: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Termination Date</label><input type="date" value={exitForm.termination_date} onChange={e => setExitForm({ ...exitForm, termination_date: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Starting Position</label><input type="text" value={exitForm.starting_position} onChange={e => setExitForm({ ...exitForm, starting_position: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Ending Position</label><input type="text" value={exitForm.ending_position} onChange={e => setExitForm({ ...exitForm, ending_position: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Salary</label><input type="text" value={exitForm.salary} onChange={e => setExitForm({ ...exitForm, salary: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
              </div>

              {/* Part I: Reasons for Leaving */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Part I — Reasons for Leaving</h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="font-bold text-slate-600 dark:text-slate-300 mb-2">Resignation</p>
                    {['Dissatisfaction with salary', 'Found better opportunity', 'Dissatisfaction with type of work', 'Relocation / transfer city', 'Dissatisfaction with co-workers', 'Dissatisfaction with supervisor'].map(r => (
                      <label key={r} className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1"><input type="checkbox" checked={exitForm.reason_details.includes(r)} onChange={() => setExitForm(prev => ({ ...prev, reason_category: 'Resignation', reason_details: prev.reason_details.includes(r) ? prev.reason_details.filter(x => x !== r) : [...prev.reason_details, r] }))} className="rounded" /> {r}</label>
                    ))}
                  </div>
                  <div>
                    <p className="font-bold text-slate-600 dark:text-slate-300 mb-2">Layoff</p>
                    {['Abolition of position', 'Lack of funds', 'Other (specify)'].map(r => (
                      <label key={r} className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1"><input type="checkbox" checked={exitForm.reason_details.includes(r)} onChange={() => setExitForm(prev => ({ ...prev, reason_category: 'Layoff', reason_details: prev.reason_details.includes(r) ? prev.reason_details.filter(x => x !== r) : [...prev.reason_details, r] }))} className="rounded" /> {r}</label>
                    ))}
                    <p className="font-bold text-slate-600 dark:text-slate-300 mb-2 mt-3">Retirement</p>
                    {['Disability retirement', 'Regular retirement'].map(r => (
                      <label key={r} className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1"><input type="checkbox" checked={exitForm.reason_details.includes(r)} onChange={() => setExitForm(prev => ({ ...prev, reason_category: 'Retirement', reason_details: prev.reason_details.includes(r) ? prev.reason_details.filter(x => x !== r) : [...prev.reason_details, r] }))} className="rounded" /> {r}</label>
                    ))}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Plans After Leaving</label>
                    <textarea rows={4} value={exitForm.additional_comments} onChange={e => setExitForm({ ...exitForm, additional_comments: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-xs dark:text-slate-100" placeholder="Describe plans..." />
                  </div>
                </div>
              </div>

              {/* Part II: Satisfaction Ratings */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h4 className="text-xs font-bold text-teal-deep dark:text-teal-green uppercase tracking-widest mb-3">Part II — Comments / Suggestions for Improvement</h4>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">What did you like best about your job?</label><textarea rows={2} value={exitForm.liked_most} onChange={e => setExitForm({ ...exitForm, liked_most: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                  <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">What did you like least about your job?</label><textarea rows={2} value={exitForm.liked_least} onChange={e => setExitForm({ ...exitForm, liked_least: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                  <div className="col-span-2"><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">How did you feel about the pay and benefits?</label><textarea rows={2} value={exitForm.pay_benefits_opinion} onChange={e => setExitForm({ ...exitForm, pay_benefits_opinion: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
                </div>

                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Rate the following (1=Very Dissatisfied, 5=Very Satisfied)</p>
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/50">
                      <tr>
                        <th className="p-2 text-left font-bold text-slate-500 uppercase">Factor</th>
                        {[1,2,3,4,5].map(n => <th key={n} className="p-2 text-center font-bold text-slate-500">{n}</th>)}
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
                        <tr key={item.key} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="p-2 text-slate-600 dark:text-slate-300">{item.label}</td>
                          {[1,2,3,4,5].map(n => (
                            <td key={n} className="p-2 text-center"><input type="radio" name={`exit-${item.key}`} checked={exitForm.satisfaction_ratings[item.key] === n} onChange={() => setExitForm(prev => ({ ...prev, satisfaction_ratings: { ...prev.satisfaction_ratings, [item.key]: n } }))} /></td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Would you recommend this organization? If seeking another job, what kind?</label><textarea rows={2} value={exitForm.would_recommend} onChange={e => setExitForm({ ...exitForm, would_recommend: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
              <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Improvement suggestions that might have influenced you to stay?</label><textarea rows={2} value={exitForm.improvement_suggestions} onChange={e => setExitForm({ ...exitForm, improvement_suggestions: e.target.value })} className="w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm dark:text-slate-100" /></div>
              <div className="flex justify-end"><button type="submit" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green">Save Exit Interview</button></div>
            </form>
          </Card>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Card>
          <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">Reasons for Leaving</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">{pieData.map((_e, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}</Pie><Tooltip /></PieChart></ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 mt-2 justify-center">{pieData.map((d, i) => (<span key={d.name} className="flex items-center gap-1 text-[10px] font-bold text-slate-500"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></span>{d.name}</span>))}</div>
        </Card>
        <div className="md:col-span-2">
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
                  <tr key={data.id} className="border-b border-slate-50 dark:border-slate-800/50">
                    <td className="py-4 font-medium text-slate-700 dark:text-slate-200">{data.employee_name}</td>
                    <td className="py-4 text-sm text-slate-500 dark:text-slate-400">{data.last_day}</td>
                    <td className="py-4 text-sm text-slate-500 dark:text-slate-400">{data.reason}</td>
                    <td className="py-4">
                      {data.clearance_status === 'Completed' ? (
                        <span className="font-bold text-[10px] uppercase tracking-wider text-emerald-600">Completed</span>
                      ) : (
                        <button onClick={() => markCleared(data.id)} className="font-bold text-[10px] uppercase tracking-wider text-amber-500 hover:text-emerald-600">Pending (click to clear)</button>
                      )}
                    </td>
                    <td className="py-4"><button onClick={() => deleteOffboarding(data.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button></td>
                  </tr>
                ))}
                {offboardingData.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-400">No offboarding records</td></tr>}
              </tbody></table>
            </div>
          </Card>
        </div>
      </div>

      {exitInterviews.length > 0 && (
        <Card>
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-4">Exit Interviews ({exitInterviews.length})</h3>
          <div className="space-y-3">
            {exitInterviews.map(ei => (
              <div key={ei.id} className="p-4 border border-slate-100 dark:border-slate-800 rounded-xl">
                <div className="flex justify-between items-start mb-2"><span className="font-bold text-slate-700 dark:text-slate-200">{ei.employee_name}</span><span className="text-[10px] text-slate-400">{ei.interview_date}</span></div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1"><strong>Reasons:</strong> {ei.reasons}</p>
                {ei.liked_most && <p className="text-xs text-slate-500 dark:text-slate-400"><strong>Liked most:</strong> {ei.liked_most}</p>}
                {ei.liked_least && <p className="text-xs text-slate-500 dark:text-slate-400"><strong>Liked least:</strong> {ei.liked_least}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </motion.div>
  );
};
