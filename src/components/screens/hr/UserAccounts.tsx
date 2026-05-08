import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Employee } from '../../../types';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { Modal } from '../../common/Modal';
import { SearchableSelect } from '../../common/SearchableSelect';
import { Eye, EyeOff, AlertCircle, CheckCircle, Archive } from 'lucide-react';
import { appConfirm } from '../../../utils/appDialog';

const ACCOUNT_EMAIL_DOMAIN = 'maptech.com';

const isAllowedAccountEmail = (email: string) => {
  const normalized = (email || '').toString().trim().toLowerCase();
  return normalized.endsWith(`@${ACCOUNT_EMAIL_DOMAIN}`);
};

const emailLocalFromName = (value: string) => {
  const base = (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s._-]+/g, ' ')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.|\.$/g, '');
  return base || 'user';
};

const splitFirstLastName = (fullName: string) => {
  const parts = (fullName || '').toString().trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
};

const pwStrength = (pw: string) => {
  if (!pw) return null;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { label: 'Weak', color: 'bg-red-500', width: '20%', text: 'text-red-500' };
  if (score === 2) return { label: 'Fair', color: 'bg-amber-500', width: '50%', text: 'text-amber-500' };
  if (score === 3) return { label: 'Good', color: 'bg-blue-500', width: '75%', text: 'text-blue-500' };
  return { label: 'Strong', color: 'bg-emerald-500', width: '100%', text: 'text-emerald-500' };
};

interface UserAccountsProps {
  employees: Employee[];
  users: any[];
  onRefresh: () => void;
}

export const UserAccounts = ({ employees, users, onRefresh }: UserAccountsProps) => {
  const normalizeRoleValue = (role?: string | null) => {
    const r = (role || '').toString().trim().toLowerCase();
    if (r === 'hr admin') return 'HR';
    if (r === 'hr') return 'HR';
    if (r === 'manager') return 'Manager';
    if (r === 'employee') return 'Employee';
    return role || '';
  };
  const normalizeDeptValue = (value?: string | null) => (value || '').toString().trim().toLowerCase();

  // Detect current user role from localStorage so we can show HR-only controls
  const currentUser = (() => {
    try {
      const s = localStorage.getItem('talentflow_user') || localStorage.getItem('user');
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  })();
  const currentRoleNormalized = normalizeRoleValue(currentUser?.role || '');
  const isHR = currentRoleNormalized === 'HR';
  const actorDeptNormalized = normalizeDeptValue(currentUser?.dept || '');
  const creatorDept = (currentUser?.dept || '').toString().trim();
  const [createRole, setCreateRole] = useState('');
  const [createEmployeeId, setCreateEmployeeId] = useState('');
  const [createFirstName, setCreateFirstName] = useState('');
  const [createLastName, setCreateLastName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPosition, setCreatePosition] = useState('');
  const [createDept, setCreateDept] = useState(creatorDept);
  const createFormRef = useRef<HTMLFormElement | null>(null);

  // Controlled password state for create form
  const [createPassword, setCreatePassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCreatePw, setShowCreatePw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [activeAccountScreen, setActiveAccountScreen] = useState<'existing' | 'tracker'>('existing');

  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'edit' | 'view'>('edit');
  const [modalName, setModalName] = useState('');
  const [modalEmail, setModalEmail] = useState('');
  const [modalRole, setModalRole] = useState('');
  const [modalPosition, setModalPosition] = useState('');
  const [modalDept, setModalDept] = useState('');
  const [modalPhone, setModalPhone] = useState('');
  const [modalAddress, setModalAddress] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [accountSearchSelection, setAccountSearchSelection] = useState<Array<string | number>>([]);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [activePage, setActivePage] = useState(1);

  const displayRole = (role?: string | null) => role === 'HR' ? 'HR Admin' : (role || '');

  const accountPositionDept = (u: any) => {
    const position = (u?.position || u?.employee_position || '').toString().trim();
    const dept = (u?.dept || u?.employee_dept || '').toString().trim();
    return [position, dept].filter(Boolean).join(' - ') || '-';
  };

  const canEditUserAccount = (u: any) => {
    if (!isHR) return false;
    if (Number(u?.id) === Number(currentUser?.id)) return true;
    const targetDept = normalizeDeptValue(u?.employee_dept || u?.dept || '');
    if (!actorDeptNormalized || !targetDept) return false;
    return actorDeptNormalized === targetDept;
  };

  const toReadableName = (raw: string) => {
    return raw
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ')
      .trim();
  };

  const accountCreatorName = (u: any) => {
    const full = (u?.creator_full_name || '').toString().trim();
    if (full) return full;

    const email = (u?.creator_email || '').toString().trim();
    if (email.includes('@')) {
      const derivedFromEmail = toReadableName(email.split('@')[0]);
      if (derivedFromEmail) return derivedFromEmail;
    }

    const username = (u?.creator_username || '').toString().trim();
    if (username) {
      const derivedFromUsername = toReadableName(username);
      if (derivedFromUsername) return derivedFromUsername;
    }

    return 'No recorded admin';
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return 'Unknown';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return 'Unknown';
    return dt.toLocaleString();
  };

  const allUsers = users || [];
  const selectedAccountIds = useMemo(() => new Set((accountSearchSelection || []).map(String)), [accountSearchSelection]);
  const linkedEmployeeIds = useMemo(() => {
    return new Set(
      (allUsers || [])
        .filter((u: any) => !u?.deleted_at)
        .map((u: any) => Number(u?.employee_id || 0))
        .filter((id: number) => Number.isFinite(id) && id > 0)
    );
  }, [allUsers]);
  const existingEmailSet = useMemo(() => {
    return new Set(
      (allUsers || [])
        .map((u: any) => String(u?.email || '').trim().toLowerCase())
        .filter(Boolean)
    );
  }, [allUsers]);
  const accountOptions = useMemo(() => {
    return [...allUsers]
      .map((u: any) => {
        const primary = (u?.full_name || u?.employee_name || u?.email || u?.username || '').toString().trim();
        const secondary = (u?.email || u?.username || '').toString().trim();
        return {
          value: String(u.id),
          label: secondary && secondary !== primary ? `${primary} • ${secondary}` : primary,
        };
      })
      .filter((opt) => opt.label)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allUsers]);

  const matchesAccountSelection = (u: any) => selectedAccountIds.size === 0 || selectedAccountIds.has(String(u.id));
  const activeUsers = allUsers.filter((u: any) => !u.deleted_at && matchesAccountSelection(u));
  const archivedUsers = allUsers.filter((u: any) => !!u.deleted_at && matchesAccountSelection(u));
  const byLatestCreated = [...allUsers].sort((a: any, b: any) => {
    const aTime = Date.parse(a?.created_at || '');
    const bTime = Date.parse(b?.created_at || '');
    const aSafe = Number.isFinite(aTime) ? aTime : 0;
    const bSafe = Number.isFinite(bTime) ? bTime : 0;
    if (aSafe !== bSafe) return bSafe - aSafe;
    return Number(b?.id || 0) - Number(a?.id || 0);
  });

  const strength = pwStrength(createPassword);

  const employeeDirectoryOptions = useMemo(() => {
    const allowedStatuses = new Set(['PROBATIONARY', 'REGULAR', 'PERMANENT', 'HIRED']);
    return (Array.isArray(employees) ? employees : [])
      .filter((emp: any) => !linkedEmployeeIds.has(Number(emp?.id || 0)))
      .filter((emp: any) => allowedStatuses.has(String(emp?.status || '').trim().toUpperCase()))
      .map((emp: any) => {
        const name = String(emp?.name || '').trim();
        const dept = String(emp?.dept || '').trim();
        const position = String(emp?.position || emp?.title || '').trim();
        const meta = [dept, position].filter(Boolean).join(' • ');
        return {
          value: String(emp?.id || ''),
          label: `${name}${meta ? ` • ${meta}` : ''} • #${emp?.id}`,
          avatarUrl: (emp as any)?.profile_picture || null,
        };
      })
      .filter((opt: any) => opt.value && opt.label)
      .sort((a: any, b: any) => a.label.localeCompare(b.label));
  }, [employees, linkedEmployeeIds]);

  const selectedCreateEmployee = useMemo(() => {
    return (Array.isArray(employees) ? employees : []).find((emp: any) => String(emp?.id) === String(createEmployeeId)) || null;
  }, [employees, createEmployeeId]);

  useEffect(() => {
    if (!createEmployeeId) return;
    const stillAvailable = employeeDirectoryOptions.some((opt: any) => String(opt.value) === String(createEmployeeId));
    if (!stillAvailable) setCreateEmployeeId('');
  }, [createEmployeeId, employeeDirectoryOptions]);

  useEffect(() => {
    if (createRole !== 'Employee' || !selectedCreateEmployee?.name) return;
    const parts = splitFirstLastName(String(selectedCreateEmployee.name || ''));
    setCreateFirstName(parts.firstName);
    setCreateLastName(parts.lastName);
  }, [createRole, selectedCreateEmployee?.name]);

  const generatedCreateEmail = useMemo(() => {
    const fullNameSeed = `${createFirstName} ${createLastName}`.trim() || String(selectedCreateEmployee?.name || '').trim() || 'user';
    const localBase = emailLocalFromName(fullNameSeed);
    let suffix = 1;
    let candidateLocal = localBase;
    while (existingEmailSet.has(`${candidateLocal}@${ACCOUNT_EMAIL_DOMAIN}`.toLowerCase())) {
      suffix += 1;
      candidateLocal = `${localBase}${suffix}`;
    }
    return `${candidateLocal}@${ACCOUNT_EMAIL_DOMAIN}`;
  }, [createFirstName, createLastName, selectedCreateEmployee?.name, existingEmailSet]);

  useEffect(() => {
    setCreateEmail(generatedCreateEmail);
  }, [generatedCreateEmail]);

  const pageCount = (count: number) => Math.max(1, Math.ceil(count / rowsPerPage));
  const paginate = <T,>(items: T[], page: number) => {
    const total = pageCount(items.length);
    const safePage = Math.min(Math.max(page, 1), total);
    const start = (safePage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    return {
      rows: items.slice(start, end),
      safePage,
      total,
      start: items.length === 0 ? 0 : start + 1,
      end: Math.min(end, items.length),
    };
  };

  const activePageData = paginate(activeUsers, activePage);
  const existingUsers = showArchived ? [...activeUsers, ...archivedUsers] : activeUsers;
  const existingPageData = paginate(existingUsers, activePage);

  useEffect(() => {
    setActivePage(1);
  }, [accountSearchSelection, showArchived]);

  useEffect(() => {
    if (!modalOpen || !editingUser?.id) return;
    const refreshedUser = allUsers.find((u: any) => String(u.id) === String(editingUser.id));
    if (!refreshedUser) return;

    setEditingUser(refreshedUser);
    setModalName(refreshedUser.full_name || refreshedUser.employee_name || '');
    setModalEmail((refreshedUser.email || refreshedUser.username || '').toString());
    setModalRole(normalizeRoleValue(refreshedUser.role || ''));
    setModalPosition((refreshedUser.position || refreshedUser.employee_position || '').toString());
    setModalDept((refreshedUser.dept || refreshedUser.employee_dept || '').toString());
    setModalPhone((refreshedUser.employee_phone || refreshedUser.phone || '').toString());
    setModalAddress((refreshedUser.employee_address || refreshedUser.address || '').toString());
  }, [allUsers, modalOpen, editingUser?.id]);

  const validateCreateForm = (email: string, firstName: string, lastName: string, role: string, position: string, dept: string, employeeId: string): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!email) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Enter a valid email address';
    else if (!isAllowedAccountEmail(email)) errs.email = `Email must use @${ACCOUNT_EMAIL_DOMAIN}`;
    if (!firstName.trim()) errs.first_name = 'First name is required';
    if (!lastName.trim()) errs.last_name = 'Last name is required';
    if ((`${firstName} ${lastName}`).trim().length > 120) errs.full_name = 'Combined first and last name must be 120 characters or less';
    if (!createPassword) errs.password = 'Password is required';
    else if (createPassword.length < 8) errs.password = 'Minimum 8 characters';
    else if (createPassword.length > 128) errs.password = 'Password must be 128 characters or less';
    else if (!/[A-Z]/.test(createPassword)) errs.password = 'Must contain an uppercase letter';
    else if (!/[0-9]/.test(createPassword)) errs.password = 'Must contain a number';
    else if (!/[^A-Za-z0-9]/.test(createPassword)) errs.password = 'Must contain a special character';
    if (!confirmPassword) errs.confirm = 'Confirm password is required';
    else if (confirmPassword !== createPassword) errs.confirm = 'Passwords do not match';
    if (!role) errs.role = 'Role is required';
    if (role === 'Employee' && !String(employeeId || '').trim()) errs.employee_id = 'Select an employee from the Employee Directory';
    if ((role === 'Manager' || role === 'HR') && !position.trim()) errs.position = 'Position is required for Manager/HR';
    if ((role === 'Manager' || role === 'HR') && position.trim().length > 100) errs.position = 'Position must be 100 characters or less';
    if ((role === 'Manager' || role === 'HR') && !dept.trim()) errs.dept = 'Your account must have a department to create Manager/HR users';
    if ((role === 'Manager' || role === 'HR') && dept.trim().length > 100) errs.dept = 'Department must be 100 characters or less';
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const email = createEmail.trim().toLowerCase();
    const full_name = `${createFirstName} ${createLastName}`.trim();
    const role = createRole;

    const effectiveCreateDept = createDept.trim() || creatorDept;
    const errs = validateCreateForm(email, createFirstName, createLastName, role, createPosition, effectiveCreateDept, createEmployeeId);
    setCreateErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const body: any = { email, password: createPassword, role };
    body.first_name = createFirstName.trim();
    body.last_name = createLastName.trim();
    if (full_name) body.full_name = full_name;
    if (role === 'Employee') body.employee_id = Number(createEmployeeId);
    if (role === 'Manager' || role === 'HR') {
      body.position = createPosition.trim();
      body.dept = effectiveCreateDept.trim();
    }

    try {
      const token = localStorage.getItem('talentflow_token');
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        (window as any).notify('User created successfully', 'success');
        onRefresh();
        form.reset();
        setCreateRole('');
        setCreateEmployeeId('');
        setCreateFirstName('');
        setCreateLastName('');
        setCreateEmail('');
        setCreatePosition('');
        setCreateDept(creatorDept);
        setCreatePassword('');
        setConfirmPassword('');
        setCreateErrors({});
        setShowCreatePw(false);
        setShowConfirmPw(false);
        setCreateModalOpen(false);
        createFormRef.current?.reset();
      } else {
        const err = await res.json();
        (window as any).notify(err.error || 'Failed to create user', 'error');
      }
    } catch (err) {
      (window as any).notify('Error connecting to server', 'error');
    }
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    if (!canEditUserAccount(editingUser)) {
      (window as any).notify('You can only edit users in your department', 'error');
      return;
    }
    const confirmed = await appConfirm('Are you sure you want to save these changes?', {
      title: 'Confirm Save Changes',
      confirmText: 'Save Changes',
      icon: 'warning',
    });
    if (!confirmed) return;
    try {
      const token = localStorage.getItem('talentflow_token');
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const normalizedRole = normalizeRoleValue(modalRole || editingUser.role || '');
      const normalizedModalEmail = modalEmail.trim().toLowerCase();
      if (normalizedModalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedModalEmail)) {
        (window as any).notify('Enter a valid email address', 'error');
        return;
      }
      if (normalizedModalEmail && !isAllowedAccountEmail(normalizedModalEmail)) {
        (window as any).notify(`Email must use @${ACCOUNT_EMAIL_DOMAIN}`, 'error');
        return;
      }
      const body: any = {
        full_name: modalName.trim() || null,
        email: normalizedModalEmail || null,
        phone: modalPhone.trim() || null,
        address: modalAddress.trim() || null,
      };
      if (normalizedRole) body.role = normalizedRole;
      const canEditMeta = normalizedRole === 'HR' || normalizedRole === 'Manager';
      body.position = canEditMeta ? (modalPosition.trim() || null) : null;
      body.dept = canEditMeta ? (modalDept.trim() || null) : null;
      const res = await fetch(`/api/users/${editingUser.id}`, { method: 'PUT', headers, body: JSON.stringify(body) });
      if (res.ok) {
        const currentUserId = Number(currentUser?.id || 0);
        if (currentUserId && Number(editingUser.id) === currentUserId) {
          const cached = JSON.parse(localStorage.getItem('talentflow_user') || '{}');
          cached.email = normalizedModalEmail || cached.email;
          cached.full_name = modalName.trim() || cached.full_name;
          cached.employee_name = modalName.trim() || cached.employee_name;
          cached.position = body.position || cached.position;
          cached.dept = body.dept || cached.dept;
          cached.phone = modalPhone.trim() || cached.phone;
          cached.address = modalAddress.trim() || cached.address;
          localStorage.setItem('talentflow_user', JSON.stringify(cached));
          localStorage.setItem('user', JSON.stringify(cached));
        }
        await Promise.resolve(onRefresh());
        window.dispatchEvent(new CustomEvent('talentflow-profile-updated', { detail: { userId: Number(editingUser.id) } }));
        (window as any).notify('User updated', 'success');
        setModalOpen(false);
        setEditingUser(null);
      } else { const err = await res.json(); (window as any).notify(err.error || 'Failed', 'error'); }
    } catch (err) { (window as any).notify('Server error', 'error'); }
  };

  const openUserModal = (u: any, mode: 'edit' | 'view') => {
    setEditingUser(u);
    setModalMode(mode);
    setModalName(u.full_name || u.employee_name || '');
    setModalEmail((u.email || u.username || '').toString());
    setModalRole(normalizeRoleValue(u.role || ''));
    setModalPosition((u.position || u.employee_position || '').toString());
    setModalDept((u.dept || u.employee_dept || '').toString());
    setModalPhone((u.employee_phone || u.phone || '').toString());
    setModalAddress((u.employee_address || u.address || '').toString());
    setModalOpen(true);
  };

  const openCreateModal = () => {
    setCreateErrors({});
    setCreateRole('');
    setCreateEmployeeId('');
    setCreateFirstName('');
    setCreateLastName('');
    setCreateEmail('');
    setCreatePosition('');
    setCreateDept(creatorDept);
    setCreatePassword('');
    setConfirmPassword('');
    setShowCreatePw(false);
    setShowConfirmPw(false);
    setCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    setCreateModalOpen(false);
    setCreateErrors({});
    setCreateRole('');
    setCreateEmployeeId('');
    setCreateFirstName('');
    setCreateLastName('');
    setCreateEmail('');
    setCreatePosition('');
    setCreateDept(creatorDept);
    setCreatePassword('');
    setConfirmPassword('');
    setShowCreatePw(false);
    setShowConfirmPw(false);
    createFormRef.current?.reset();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <SectionHeader title="User Accounts Management" subtitle="Create and manage login credentials for staff" />
      <div className="sticky top-3 z-20">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-3 py-3 shadow-sm">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveAccountScreen('tracker')}
              className={`inline-flex items-center rounded-full border px-4 py-2 text-xs font-bold transition-colors ${
                activeAccountScreen === 'tracker'
                  ? 'border-teal-green bg-teal-green/10 text-teal-deep dark:border-teal-green dark:bg-teal-green/20 dark:text-teal-green'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800'
              }`}
            >
              Account Creation Tracker
            </button>
            <button
              type="button"
              onClick={() => setActiveAccountScreen('existing')}
              className={`inline-flex items-center rounded-full border px-4 py-2 text-xs font-bold transition-colors ${
                activeAccountScreen === 'existing'
                  ? 'border-teal-green bg-teal-green/10 text-teal-deep dark:border-teal-green dark:bg-teal-green/20 dark:text-teal-green'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800'
              }`}
            >
              Existing Accounts
            </button>
          </div>
        </div>
      </div>
      <div className="space-y-6">
        {activeAccountScreen === 'tracker' && (
          <Card className="min-h-[72vh]">
            <h3 className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-300 mb-4 tracking-widest">Account Creation Tracker</h3>
            {byLatestCreated.length > 0 ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/80 dark:bg-slate-900/40">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">Created Accounts</p>
                  <div className="mt-2 max-h-[55vh] overflow-y-auto pr-1 space-y-2">
                    {byLatestCreated.map((u: any) => (
                      <div key={u.id} className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5 bg-white/70 dark:bg-black/20">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate" title={u.full_name || u.email || u.username || '-'}>
                          {u.full_name || u.email || u.username || '-'}
                        </p>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate" title={accountCreatorName(u)}>
                          By: {accountCreatorName(u)}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">At: {formatDateTime(u.created_at)}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">Active Accounts</p>
                    <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{activeUsers.length}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">Archived</p>
                    <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{archivedUsers.length}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4 text-sm text-slate-500 dark:text-slate-400">
                No account creation activity yet.
              </div>
            )}
          </Card>
        )}

        {activeAccountScreen === 'existing' && (
        <Card className="min-h-[64vh]">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-300 tracking-widest">Existing Accounts</h3>
            {isHR && (
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center rounded-xl bg-teal-green px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-95"
              >
                Create New Account
              </button>
            )}
          </div>
          <div className="mb-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300 mb-1">Search Accounts</p>
            <SearchableSelect
              options={accountOptions}
              value={accountSearchSelection}
              onChange={(value) => setAccountSearchSelection(Array.isArray(value) ? value : (value ? [value] : []))}
              placeholder="Search users/accounts..."
              searchable
              multiSelect
              allowEmpty
              emptyLabel="All accounts"
              dropdownVariant="pills-horizontal"
              className="w-full"
            />
          </div>
          <div className="flex justify-between items-center mb-3 gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-300">
              <span>Rows</span>
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  const next = Number(e.target.value) || 10;
                  setRowsPerPage(next);
                  setActivePage(1);
                }}
                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <span className="text-slate-400">{existingPageData.start}-{existingPageData.end} of {existingUsers.length}</span>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-300">
              <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="w-4 h-4" />
              <span>Show archived accounts</span>
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="w-[16%] pb-2 px-2 font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Name</th>
                  <th className="w-[24%] pb-2 px-2 font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Email</th>
                  <th className="w-[10%] pb-2 px-2 font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Role</th>
                  <th className="w-[20%] pb-2 px-2 font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Position / Department</th>
                  <th className="w-[20%] pb-2 px-2 font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Matched User</th>
                  <th className="w-[10%] pb-2 px-2 font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {existingPageData.rows.map(u => {
                  const isArchivedRow = !!u.deleted_at;
                  return (
                  <tr key={u.id} className={`border-b border-slate-50 dark:border-slate-800/50 ${isArchivedRow ? 'opacity-80 italic' : ''}`}>
                    <td className="py-2 px-2 font-medium text-slate-700 dark:text-slate-100">
                      <div className="min-w-0 truncate max-w-55" title={u.full_name || u.employee_name || '-'}>{u.full_name || u.employee_name || '-'}</div>
                    </td>
                    <td className="py-2 px-2 font-medium text-slate-700 dark:text-slate-100">
                      <div className="min-w-0 truncate" title={u.email || u.username || '-'}>{u.email || u.username || '-'}</div>
                    </td>
                    <td className="py-2 px-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        u.role === 'HR' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 
                        u.role === 'Manager' ? 'bg-teal-green/10 dark:bg-teal-green/20 text-teal-green' : 
                        'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200'
                      }`}>
                        {displayRole(u.role)}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-slate-600 dark:text-slate-200">
                      <div className="min-w-0 truncate" title={accountPositionDept(u)}>
                        {accountPositionDept(u)}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-slate-600 dark:text-slate-200">
                      <div className="min-w-0 truncate" title={u.full_name || u.email || u.username || 'N/A'}>{u.full_name || u.email || u.username || 'N/A'}</div>
                    </td>
                    <td className="py-2 px-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <>
                          <button
                            onClick={() => openUserModal(u, 'view')}
                            title="View"
                            aria-label="View user"
                            className="inline-flex items-center justify-center p-1.5 rounded-md transition-colors"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            onClick={() => openUserModal(u, 'edit')}
                            disabled={isArchivedRow || !canEditUserAccount(u)}
                            title={isArchivedRow ? 'Archived accounts are view-only' : (canEditUserAccount(u) ? 'Edit user account information' : 'Out of scope: different department')}
                            className="text-xs text-amber-600 font-bold disabled:text-slate-400 disabled:cursor-not-allowed"
                          >
                            Edit
                          </button>
                          {isArchivedRow ? (
                            isHR ? (
                              <button
                                onClick={async () => {
                                  if (!(await appConfirm('Restore user?', { title: 'Restore User Account', confirmText: 'Restore' }))) return;
                                  const token = localStorage.getItem('talentflow_token');
                                  try {
                                    const res = await fetch(`/api/users/${u.id}/restore`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
                                    if (res.ok) { (window as any).notify('User restored', 'success'); onRefresh(); } else { const err = await res.json(); (window as any).notify(err.error || 'Failed', 'error'); }
                                  } catch (err) { (window as any).notify('Server error', 'error'); }
                                }}
                                className="text-xs text-green-600 font-bold"
                              >
                                Restore
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">Archived</span>
                            )
                          ) : (
                            <button onClick={async () => {
                              if (!(await appConfirm('Archive this user account?', { title: 'Archive User Account', confirmText: 'Archive' }))) return;
                              const token = localStorage.getItem('talentflow_token');
                              try {
                                const res = await fetch(`/api/users/${u.id}`, { method: 'DELETE', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
                                if (res.ok) { (window as any).notify('User archived', 'success'); onRefresh(); } else { const err = await res.json(); (window as any).notify(err.error || 'Failed', 'error'); }
                              } catch (err) { (window as any).notify('Server error', 'error'); }
                            }}
                            title="Archive user"
                            aria-label="Archive user"
                            className="inline-flex items-center justify-center p-1.5 rounded-md transition-colors">
                              <Archive size={14} />
                            </button>
                          )}
                        </>
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-300">
            <span>Page {existingPageData.safePage} of {existingPageData.total}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActivePage((p) => Math.max(1, p - 1))}
                disabled={existingPageData.safePage <= 1}
                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setActivePage((p) => Math.min(existingPageData.total, p + 1))}
                disabled={existingPageData.safePage >= existingPageData.total}
                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </Card>
        )}
      </div>

      <Modal open={modalOpen} title={modalMode === 'view' ? 'View User' : 'Edit User'} onClose={() => setModalOpen(false)}>
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Full name</label>
            <input value={modalName} disabled={modalMode === 'view'} onChange={e => setModalName(e.target.value)} className="w-full mt-1 p-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-green/50 disabled:opacity-70 disabled:cursor-not-allowed" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Email</label>
            <input value={modalEmail} disabled={modalMode === 'view'} onChange={e => setModalEmail(e.target.value)} className="w-full mt-1 p-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-green/50 disabled:opacity-70 disabled:cursor-not-allowed" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Role</label>
            <select value={modalRole} disabled={modalMode === 'view'} onChange={e => setModalRole(e.target.value)} className="w-full mt-1 p-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-green/50 disabled:opacity-70 disabled:cursor-not-allowed">
              <option value="">Select Role...</option>
              <option value="Employee">Employee</option>
              <option value="Manager">Manager</option>
              <option value="HR">HR Admin</option>
            </select>
          </div>
          {(normalizeRoleValue(modalRole) === 'HR' || normalizeRoleValue(modalRole) === 'Manager') && (
            <>
              <div>
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Position</label>
                <input value={modalPosition} disabled={modalMode === 'view'} onChange={e => setModalPosition(e.target.value)} className="w-full mt-1 p-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-green/50 disabled:opacity-70 disabled:cursor-not-allowed" placeholder="e.g. HR Specialist" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Department</label>
                <input
                  value={modalDept}
                  readOnly
                  disabled
                  className="w-full mt-1 p-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 disabled:opacity-100 disabled:cursor-not-allowed"
                  placeholder="Department is locked"
                />
              </div>
            </>
          )}
          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Phone</label>
            <input value={modalPhone} disabled={modalMode === 'view'} onChange={e => setModalPhone(e.target.value)} className="w-full mt-1 p-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-green/50 disabled:opacity-70 disabled:cursor-not-allowed" placeholder="e.g. +1 555 123 4567" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Address</label>
            <input value={modalAddress} disabled={modalMode === 'view'} onChange={e => setModalAddress(e.target.value)} className="w-full mt-1 p-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-green/50 disabled:opacity-70 disabled:cursor-not-allowed" placeholder="e.g. Office or home address" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Matched User</label>
            <p className="mt-1 text-xs text-slate-400">Linked by selected employee directory record for employee accounts. Phone/address are editable for linked employee profiles.</p>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800">{modalMode === 'view' ? 'Close' : 'Cancel'}</button>
            {modalMode === 'edit' && <button onClick={handleSaveEdit} className="px-4 py-2 rounded-lg bg-teal-deep text-white">Save</button>}
          </div>
        </div>
      </Modal>

      <Modal open={createModalOpen} title="Create New Account" onClose={closeCreateModal}>
        <form ref={createFormRef} onSubmit={handleSubmit} className="space-y-4 max-w-3xl">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {createRole === 'Employee' && (
              <div>
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Employee Directory Record</label>
                <div className="mt-1">
                  <SearchableSelect
                    options={employeeDirectoryOptions}
                    value={createEmployeeId}
                    onChange={(v) => {
                      setCreateEmployeeId(String(v || ''));
                      if (createErrors.employee_id) setCreateErrors((p) => ({ ...p, employee_id: '' }));
                    }}
                    placeholder="Select employee from directory..."
                    dropdownVariant="pills-horizontal"
                    searchable
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">Only employees without existing user accounts are listed.</p>
                {createErrors.employee_id && <p className="mt-1 text-sm text-red-500 flex items-center gap-1"><AlertCircle size={12} />{createErrors.employee_id}</p>}
              </div>
            )}
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Role</label>
              <select name="role" value={createRole} onChange={e => {
                const nextRole = e.target.value;
                setCreateRole(nextRole);
                if (createErrors.role) setCreateErrors(p => ({ ...p, role: '' }));
                if (nextRole !== 'Manager' && nextRole !== 'HR') {
                  setCreatePosition('');
                  setCreateDept(creatorDept);
                  setCreateErrors(p => ({ ...p, position: '', dept: '' }));
                } else if (!createDept.trim() && creatorDept) {
                  setCreateDept(creatorDept);
                }
                if (nextRole !== 'Employee') {
                  setCreateEmployeeId('');
                  setCreateErrors(p => ({ ...p, employee_id: '' }));
                }
              }} className={`w-full mt-1 p-3 bg-white dark:bg-black border ${createErrors.role ? 'border-red-400 dark:border-red-500' : 'border-slate-200 dark:border-slate-700'} rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-green/50`} required>
                <option value="">Select Role...</option>
                <option value="Employee">Employee</option>
                <option value="Manager">Manager</option>
                <option value="HR">HR Admin</option>
              </select>
              {createErrors.role && <p className="mt-1 text-sm text-red-500 flex items-center gap-1"><AlertCircle size={12} />{createErrors.role}</p>}
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">First name</label>
              <input
                type="text"
                value={createFirstName}
                onChange={(e) => {
                  setCreateFirstName(e.target.value);
                  setCreateErrors((p) => ({ ...p, first_name: '', full_name: '' }));
                }}
                className={`w-full mt-1 p-3 bg-white dark:bg-black border ${(createErrors.first_name || createErrors.full_name) ? 'border-red-400 dark:border-red-500' : 'border-slate-200 dark:border-slate-700'} rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-green/50`}
                placeholder="e.g. Jane"
                maxLength={60}
                required
              />
              {createErrors.first_name && <p className="mt-1 text-sm text-red-500 flex items-center gap-1"><AlertCircle size={12} />{createErrors.first_name}</p>}
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Last name</label>
              <input
                type="text"
                value={createLastName}
                onChange={(e) => {
                  setCreateLastName(e.target.value);
                  setCreateErrors((p) => ({ ...p, last_name: '', full_name: '' }));
                }}
                className={`w-full mt-1 p-3 bg-white dark:bg-black border ${(createErrors.last_name || createErrors.full_name) ? 'border-red-400 dark:border-red-500' : 'border-slate-200 dark:border-slate-700'} rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-green/50`}
                placeholder="e.g. Smith"
                maxLength={60}
                required
              />
              {createErrors.last_name && <p className="mt-1 text-sm text-red-500 flex items-center gap-1"><AlertCircle size={12} />{createErrors.last_name}</p>}
              {createErrors.full_name && <p className="mt-1 text-sm text-red-500 flex items-center gap-1"><AlertCircle size={12} />{createErrors.full_name}</p>}
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Email (Auto-generated)</label>
              <input
                type="email"
                value={createEmail}
                readOnly
                className={`w-full mt-1 p-3 bg-slate-50 dark:bg-slate-900/40 border ${createErrors.email ? 'border-red-400 dark:border-red-500' : 'border-slate-200 dark:border-slate-700'} rounded-xl text-sm text-slate-700 dark:text-slate-200`}
              />
              <p className="mt-1 text-[11px] text-slate-400">Generated uniquely under @maptech.com.</p>
              {createErrors.email && <p className="mt-1 text-sm text-red-500 flex items-center gap-1"><AlertCircle size={12} />{createErrors.email}</p>}
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Password</label>
              <div className="relative">
                <input
                  type={showCreatePw ? 'text' : 'password'}
                  value={createPassword}
                  onChange={e => { setCreatePassword(e.target.value); if (createErrors.password) setCreateErrors(p => ({ ...p, password: '' })); }}
                  className={`w-full mt-1 p-3 pr-10 bg-white dark:bg-black border ${createErrors.password ? 'border-red-400 dark:border-red-500' : 'border-slate-200 dark:border-slate-700'} rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-green/50`}
                  placeholder="Min 8 chars, uppercase, number, special"
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  required
                />
                <button type="button" onClick={() => setShowCreatePw(!showCreatePw)} className="absolute right-3 top-1/2 -translate-y-1/2 mt-0.5 text-slate-400 p-0.5">
                  {showCreatePw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {createErrors.password && <p className="mt-1 text-sm text-red-500 flex items-center gap-1"><AlertCircle size={12} />{createErrors.password}</p>}
              {strength && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full ${strength.color} rounded-full transition-all duration-300`} style={{ width: strength.width }} />
                    </div>
                    <span className={`text-xs font-bold ${strength.text}`}>{strength.label}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                    <span className={createPassword.length >= 8 ? 'text-emerald-500' : 'text-slate-400'}>{createPassword.length >= 8 ? <CheckCircle size={11} className="inline mr-0.5" /> : null}8+ chars</span>
                    <span className={/[A-Z]/.test(createPassword) ? 'text-emerald-500' : 'text-slate-400'}>{/[A-Z]/.test(createPassword) ? <CheckCircle size={11} className="inline mr-0.5" /> : null}Uppercase</span>
                    <span className={/[0-9]/.test(createPassword) ? 'text-emerald-500' : 'text-slate-400'}>{/[0-9]/.test(createPassword) ? <CheckCircle size={11} className="inline mr-0.5" /> : null}Number</span>
                    <span className={/[^A-Za-z0-9]/.test(createPassword) ? 'text-emerald-500' : 'text-slate-400'}>{/[^A-Za-z0-9]/.test(createPassword) ? <CheckCircle size={11} className="inline mr-0.5" /> : null}Special</span>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Confirm Password</label>
              <div className="relative">
                <input
                  type={showConfirmPw ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); if (createErrors.confirm) setCreateErrors(p => ({ ...p, confirm: '' })); }}
                  className={`w-full mt-1 p-3 pr-10 bg-white dark:bg-black border ${createErrors.confirm ? 'border-red-400 dark:border-red-500' : confirmPassword && confirmPassword === createPassword ? 'border-emerald-400 dark:border-emerald-500' : 'border-slate-200 dark:border-slate-700'} rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-green/50`}
                  placeholder="Re-enter password"
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  required
                />
                <button type="button" onClick={() => setShowConfirmPw(!showConfirmPw)} className="absolute right-3 top-1/2 -translate-y-1/2 mt-0.5 text-slate-400 p-0.5">
                  {showConfirmPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {createErrors.confirm && <p className="mt-1 text-sm text-red-500 flex items-center gap-1"><AlertCircle size={12} />{createErrors.confirm}</p>}
              {confirmPassword && confirmPassword === createPassword && <p className="mt-1 text-sm text-emerald-500 flex items-center gap-1"><CheckCircle size={12} />Passwords match</p>}
            </div>
            {(createRole === 'Manager' || createRole === 'HR') && (
              <>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Position</label>
                  <input
                    type="text"
                    value={createPosition}
                    onChange={e => {
                      setCreatePosition(e.target.value);
                      if (createErrors.position) setCreateErrors(p => ({ ...p, position: '' }));
                    }}
                    className={`w-full mt-1 p-3 bg-white dark:bg-black border ${createErrors.position ? 'border-red-400 dark:border-red-500' : 'border-slate-200 dark:border-slate-700'} rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-green/50`}
                    placeholder="e.g. HR Specialist"
                    maxLength={100}
                    required
                  />
                  {createErrors.position && <p className="mt-1 text-sm text-red-500 flex items-center gap-1"><AlertCircle size={12} />{createErrors.position}</p>}
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Department</label>
                  <input
                    type="text"
                    value={createDept}
                    readOnly
                    className={`w-full mt-1 p-3 bg-slate-50 dark:bg-slate-900/40 border ${createErrors.dept ? 'border-red-400 dark:border-red-500' : 'border-slate-200 dark:border-slate-700'} rounded-xl text-sm text-slate-700 dark:text-slate-200`}
                    placeholder="e.g. Human Resources"
                    maxLength={100}
                    required
                  />
                  <p className="mt-1 text-[11px] text-slate-400">Locked to your department.</p>
                  {createErrors.dept && <p className="mt-1 text-sm text-red-500 flex items-center gap-1"><AlertCircle size={12} />{createErrors.dept}</p>}
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button type="button" onClick={closeCreateModal} className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800">Cancel</button>
            <button
              type="submit"
              disabled={createRole === 'Employee' && employeeDirectoryOptions.length === 0}
              className="px-4 py-2 rounded-lg bg-teal-deep text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              title={createRole === 'Employee' && employeeDirectoryOptions.length === 0 ? 'All employee directory records already have user accounts' : 'Create User'}
            >
              Create User
            </button>
          </div>
        </form>
      </Modal>
    </motion.div>
  );
};

export default UserAccounts;
