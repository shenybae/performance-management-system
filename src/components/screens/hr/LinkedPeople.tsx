import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, GitBranch, Link2, Shield, Sparkles, Unlink2, Users } from 'lucide-react';
import { Employee } from '../../../types';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { SearchableSelect } from '../../common/SearchableSelect';
import { appConfirm } from '../../../utils/appDialog';

interface LinkedPeopleProps {
  employees: Employee[];
  users: any[];
  onRefresh: () => void;
}

const normalize = (value?: string | null) => (value || '').toString().trim().toLowerCase();
const sameDept = (a?: string | null, b?: string | null) => normalize(a) === normalize(b) && normalize(a) !== '';

const personLabel = (person: any) => {
  const primary = (person?.full_name || person?.name || person?.employee_name || person?.email || person?.username || '').toString().trim();
  const secondary = (person?.position || person?.dept || '').toString().trim();
  return secondary ? `${primary} • ${secondary}` : primary;
};

const roleLabel = (person: any) => {
  const role = normalize(person?.role);
  const position = normalize(person?.position);
  if (role.includes('hr') || position.includes('hr')) return 'HR Admin';
  if (position.includes('supervisor') || role.includes('supervisor')) return 'Supervisor';
  if (position.includes('manager') || role.includes('manager')) return 'Manager';
  return 'Employee';
};

const roleTone = (label: string) => {
  if (label === 'HR Admin') return 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/60 dark:text-fuchsia-300';
  if (label === 'Manager') return 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300';
  if (label === 'Supervisor') return 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300';
  return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300';
};

export const LinkedPeople = ({ employees, users, onRefresh }: LinkedPeopleProps) => {
  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('talentflow_user') || localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  })();

  const isHR = normalize(currentUser?.role) === 'hr' || normalize(currentUser?.role) === 'hr admin';
  const currentDept = (currentUser?.dept || '').toString().trim();
  const deptLabel = currentDept || 'your department';

  const employeeById = useMemo(() => {
    const map = new Map<number, any>();
    (employees || []).forEach((person: any) => map.set(Number(person.id), person));
    return map;
  }, [employees]);

  const mergedPeople = useMemo(() => {
    const merged = (users || [])
      .map((user: any) => {
        const linkedEmployee = user?.employee_id ? employeeById.get(Number(user.employee_id)) : null;
        const dept = (user?.dept || linkedEmployee?.dept || '').toString().trim();
        if (!dept) return null;
        return {
          ...linkedEmployee,
          ...user,
          id: Number(user.id),
          employee_id: user.employee_id ?? linkedEmployee?.id ?? null,
          full_name: user.full_name || linkedEmployee?.name || linkedEmployee?.full_name || user.username || user.email || '',
          position: user.position || linkedEmployee?.position || '',
          dept,
          manager_id: linkedEmployee?.manager_id ? Number(linkedEmployee.manager_id) : null,
          profile_picture: user.profile_picture || linkedEmployee?.profile_picture || null,
        };
      })
      .filter(Boolean);

    const seenEmployeeIds = new Set<number>();
    merged.forEach((person: any) => {
      if (person?.employee_id) seenEmployeeIds.add(Number(person.employee_id));
    });

    (employees || []).forEach((employee: any) => {
      if (!employee?.dept) return;
      if (seenEmployeeIds.has(Number(employee.id))) return;
      merged.push({
        ...employee,
        id: Number(employee.id),
        employee_id: Number(employee.id),
        full_name: employee.name || employee.full_name || '',
        dept: (employee.dept || '').toString().trim(),
        position: (employee.position || '').toString().trim(),
        manager_id: employee.manager_id ? Number(employee.manager_id) : null,
        role: 'Employee',
        profile_picture: employee.profile_picture || null,
      });
    });

    return merged.filter((person: any) => sameDept(person.dept, person.dept));
  }, [employeeById, employees, users]);

  const hrAdmins = useMemo(
    () => mergedPeople.filter((u: any) => normalize(u?.role) === 'hr'),
    [mergedPeople]
  );

  const departmentOptions = useMemo(() => {
    return [...new Set([...mergedPeople.map((person: any) => person.dept).filter(Boolean)] as string[])].sort((a, b) => a.localeCompare(b));
  }, [mergedPeople]);

  const [selectedDept, setSelectedDept] = useState('');

  useEffect(() => {
    if (selectedDept) return;
    if (currentDept) {
      setSelectedDept(currentDept);
      return;
    }
    if (departmentOptions[0]) setSelectedDept(departmentOptions[0]);
  }, [currentDept, departmentOptions, selectedDept]);

  const activeDept = selectedDept || currentDept;
  const activeDeptLabel = activeDept || 'selected department';
  const activeEmployees = useMemo(
    () => (activeDept ? mergedPeople.filter((person: any) => sameDept(person.dept, activeDept)) : []),
    [activeDept, mergedPeople]
  );

  const activeDeptHrAdmins = useMemo(
    () => (activeDept ? activeEmployees.filter((u: any) => normalize(u?.role) === 'hr') : []),
    [activeDept, activeEmployees]
  );

  const employeeMap = useMemo(() => {
    const map = new Map<number, Employee>();
    activeEmployees.forEach((person) => map.set(Number(person.id), person));
    return map;
  }, [activeEmployees]);

  const childrenByManager = useMemo(() => {
    const map = new Map<number, Employee[]>();
    activeEmployees.forEach((person) => {
      const managerId = Number((person as any).manager_id || 0);
      if (!managerId) return;
      const bucket = map.get(managerId) || [];
      bucket.push(person);
      map.set(managerId, bucket);
    });
    map.forEach((bucket) => bucket.sort((a, b) => personLabel(a).localeCompare(personLabel(b))));
    return map;
  }, [activeEmployees]);

  const treeRoots = useMemo(
    () => activeEmployees.filter((person) => {
      const managerId = Number((person as any).manager_id || 0);
      return !managerId || !employeeMap.has(managerId);
    }),
    [employeeMap, activeEmployees]
  );

  const sortedEmployees = useMemo(
    () => [...activeEmployees].sort((a, b) => personLabel(a).localeCompare(personLabel(b))),
    [activeEmployees]
  );

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | ''>('');
  const [linkedToId, setLinkedToId] = useState<number | ''>('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!selectedEmployeeId && sortedEmployees[0]) {
      setSelectedEmployeeId(sortedEmployees[0].id);
    }
  }, [selectedEmployeeId, sortedEmployees]);

  const selectedEmployee = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return employeeMap.get(Number(selectedEmployeeId)) || null;
  }, [employeeMap, selectedEmployeeId]);

  useEffect(() => {
    if (!selectedEmployee) return;
    setLinkedToId((selectedEmployee as any).manager_id && employeeMap.has(Number((selectedEmployee as any).manager_id)) ? Number((selectedEmployee as any).manager_id) : '');
  }, [employeeMap, selectedEmployee]);

  const chain = useMemo(() => {
    if (!selectedEmployee) return [] as Employee[];
    const path: Employee[] = [selectedEmployee];
    const seen = new Set<number>([Number(selectedEmployee.id)]);
    let cursor = selectedEmployee;
    while ((cursor as any).manager_id) {
      const next = employeeMap.get(Number((cursor as any).manager_id));
      if (!next || seen.has(Number(next.id))) break;
      path.unshift(next);
      seen.add(Number(next.id));
      cursor = next;
    }
    return path;
  }, [employeeMap, selectedEmployee]);

  const filteredRoots = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return treeRoots;
    return treeRoots.filter((person) => {
      const label = personLabel(person).toLowerCase();
      const dept = normalize((person as any).dept);
      const position = normalize((person as any).position);
      return label.includes(query) || dept.includes(query) || position.includes(query);
    });
  }, [search, treeRoots]);

  const selectOptions = useMemo(
    () => sortedEmployees.map((person) => ({ value: person.id, label: personLabel(person), avatarUrl: (person as any).profile_picture || null })),
    [sortedEmployees]
  );

  const selectedRoleType = selectedEmployee ? roleLabel(selectedEmployee) : '';

  const allowedReportToRoles = useMemo(() => {
    if (selectedRoleType === 'Employee') return ['Supervisor', 'Manager', 'HR Admin'];
    if (selectedRoleType === 'Supervisor') return ['Manager', 'HR Admin'];
    if (selectedRoleType === 'Manager') return ['HR Admin'];
    return [] as string[];
  }, [selectedRoleType]);

  const reportToOptions = useMemo(
    () => {
      if (allowedReportToRoles.length === 0) return [] as Array<{ value: number; label: string; avatarUrl: string | null }>;

      return sortedEmployees
        .filter((person) => allowedReportToRoles.includes(roleLabel(person)))
        .map((person) => ({ value: person.id, label: personLabel(person), avatarUrl: (person as any).profile_picture || null }));
    },
    [allowedReportToRoles, sortedEmployees]
  );

  useEffect(() => {
    if (!linkedToId) return;
    const stillAllowed = reportToOptions.some((opt) => Number(opt.value) === Number(linkedToId));
    if (!stillAllowed) setLinkedToId('');
  }, [linkedToId, reportToOptions]);

  const reportToLabel = allowedReportToRoles.length > 0
    ? `Who should they report to in ${activeDeptLabel}?`
    : 'Who should they report to?';

  const reportToPlaceholder = allowedReportToRoles.length > 0
    ? `Choose ${allowedReportToRoles.join(', ')} in ${activeDeptLabel}...`
    : `No report-to target needed for ${selectedRoleType || 'this role'}...`;

  const activeDeptManager = useMemo(
    () => activeEmployees.find((person) => roleLabel(person) === 'Manager') || null,
    [activeEmployees]
  );

  const activeDeptSupervisors = useMemo(
    () => activeEmployees.filter((person) => roleLabel(person) === 'Supervisor'),
    [activeEmployees]
  );

  const renderNode = (person: Employee, depth = 0) => {
    const descendants = childrenByManager.get(Number(person.id)) || [];
    const type = roleLabel(person);
    return (
      <div key={person.id} className={depth > 0 ? 'pl-6 border-l border-dashed border-slate-200 dark:border-slate-700 ml-3' : ''}>
        <motion.button
          type="button"
          whileHover={{ y: -1 }}
          onClick={() => {
            setSelectedEmployeeId(person.id);
            setLinkedToId((person as any).manager_id && employeeMap.has(Number((person as any).manager_id)) ? Number((person as any).manager_id) : '');
          }}
          className={`w-full text-left rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70 px-4 py-3 shadow-sm transition-colors ${Number(selectedEmployeeId) === Number(person.id) ? 'ring-2 ring-teal-green/40 border-teal-green/30' : ''}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{personLabel(person)}</p>
                <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${roleTone(type)}`}>{type}</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">{(person as any).position || 'No position'} • {(person as any).dept || deptLabel}</p>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <GitBranch size={12} />
              <span>{descendants.length} reports</span>
            </div>
          </div>
        </motion.button>

        {descendants.length > 0 && (
          <div className="mt-3 space-y-3">
            {descendants.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const saveLink = async (managerId: number | null) => {
    if (!selectedEmployee) return;
    const employeeTargetId = Number((selectedEmployee as any).employee_id || 0);
    if (!employeeTargetId) {
      window.notify?.('This account is not linked to an employee record, so its reporting line cannot be changed here.', 'error');
      return;
    }
    const targetManager = managerId ? employeeMap.get(managerId) || null : null;
    if (managerId && !targetManager) {
      window.notify?.(`Choose someone from ${activeDeptLabel}.`, 'error');
      return;
    }
    if (managerId && !reportToOptions.some((opt) => Number(opt.value) === Number(managerId))) {
      window.notify?.(`Choose a valid ${allowedReportToRoles.join(', ')} target from ${activeDeptLabel}.`, 'error');
      return;
    }

    const actionText = managerId ? `Link ${personLabel(selectedEmployee)} to ${personLabel(targetManager)} in ${activeDeptLabel}?` : `Remove the current link for ${personLabel(selectedEmployee)}?`;
    if (!(await appConfirm(actionText, { title: 'Update Link', confirmText: managerId ? 'Link' : 'Unlink', icon: 'success' }))) return;

    const payload = {
      name: (selectedEmployee as any).name || selectedEmployee.full_name || '',
      status: (selectedEmployee as any).status || 'Regular',
      position: (selectedEmployee as any).position || '',
      dept: (selectedEmployee as any).dept || activeDept || currentDept || '',
      manager_id: managerId,
      hire_date: (selectedEmployee as any).hire_date || '',
      salary_base: (selectedEmployee as any).salary_base || 0,
      ssn: (selectedEmployee as any).ssn || '',
    };

    try {
      const token = localStorage.getItem('talentflow_token');
      const res = await fetch(`/api/employees/${employeeTargetId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        window.notify?.(err.error || 'Failed to update link', 'error');
        return;
      }
      window.notify?.(managerId ? 'Department link updated' : 'Department link removed', 'success');
      onRefresh();
    } catch {
      window.notify?.('Failed to update link', 'error');
    }
  };

  const selectedManager = selectedEmployee && (selectedEmployee as any).manager_id ? employeeMap.get(Number((selectedEmployee as any).manager_id)) : null;
  const directReports = selectedEmployee ? (childrenByManager.get(Number(selectedEmployee.id)) || []) : [];
  const linkedCount = activeEmployees.filter((person) => Number((person as any).manager_id || 0) > 0).length;
  const managerCount = activeEmployees.filter((person) => roleLabel(person) === 'Manager').length;
  const supervisorCount = activeEmployees.filter((person) => roleLabel(person) === 'Supervisor').length;

  if (!isHR) {
    return (
      <div className="p-6">
        <Card className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <Shield className="text-teal-green" size={20} />
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Linked People</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">This view is available to HR Admin only.</p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <SectionHeader
        title="Linked People"
        subtitle="Pick a department to see the whole team, including HR, manager, supervisor, and linked employees."
      />

      {!currentDept && (
        <Card className="max-w-3xl">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Your account does not have a department set yet, so the department-scoped view cannot load.
          </p>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap gap-2">
          {departmentOptions.map((dept) => {
            const deptEmployees = mergedPeople.filter((person: any) => sameDept(person.dept, dept));
            const deptHrAdmins = deptEmployees.filter((person: any) => normalize(person?.role) === 'hr');
            const deptManagers = deptEmployees.filter((person) => roleLabel(person) === 'Manager');
            const deptSupervisors = deptEmployees.filter((person) => roleLabel(person) === 'Supervisor');
            const deptLinkedCount = deptEmployees.filter((person) => Number((person as any).manager_id || 0) > 0).length;
            return (
              <button
                key={dept}
                type="button"
                onClick={() => setSelectedDept(dept)}
                className={`rounded-full border px-4 py-2 text-xs font-bold transition-colors ${selectedDept === dept ? 'border-teal-green bg-teal-green/10 text-teal-deep dark:border-teal-green dark:bg-teal-green/20 dark:text-teal-green' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800'}`}
              >
                {dept}
                <span className="ml-2 text-[10px] opacity-70">M {deptManagers.length} • S {deptSupervisors.length} • HR {deptHrAdmins.length} • L {deptLinkedCount}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          These buttons switch the view to each department. People in the same department are shown together as one linked group.
        </p>
      </Card>

      {activeDept && (
        <div className="grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-6 items-start">
          <div className="space-y-6">
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <Users size={18} className="text-teal-green" />
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">{activeDeptLabel} Snapshot</h3>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Managers</p>
                  <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">{managerCount}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Supervisors</p>
                  <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">{supervisorCount}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3 col-span-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Linked Accounts</p>
                  <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">{linkedCount}</p>
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center gap-2 mb-4">
                <Shield size={18} className="text-teal-green" />
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">People in this department</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Manager</p>
                  <div className="flex flex-wrap gap-2">
                    {activeDeptManager ? (
                      <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
                        {personLabel(activeDeptManager)}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">No manager assigned</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Supervisors</p>
                  <div className="flex flex-wrap gap-2">
                    {activeDeptSupervisors.length > 0 ? activeDeptSupervisors.map((person) => (
                      <span key={person.id} className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-200">
                        {personLabel(person)}
                      </span>
                    )) : (
                      <span className="text-xs text-slate-400">No supervisors assigned</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">HR</p>
                  <div className="flex flex-wrap gap-2">
                    {activeDeptHrAdmins.length > 0 ? activeDeptHrAdmins.map((admin: any) => (
                      <span key={admin.id} className="inline-flex items-center gap-2 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1.5 text-xs font-bold text-fuchsia-800 dark:border-fuchsia-900/40 dark:bg-fuchsia-950/40 dark:text-fuchsia-200">
                        {personLabel(admin)}
                      </span>
                    )) : (
                      <span className="text-xs text-slate-400">No HR users in this department</span>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center gap-2 mb-4">
                <Link2 size={18} className="text-teal-green" />
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Change reporting line</h3>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Who do you want to update?</label>
                  <SearchableSelect
                    options={selectOptions}
                    value={selectedEmployeeId || ''}
                    onChange={(value) => {
                      const nextId = Number(value);
                      setSelectedEmployeeId(Number.isFinite(nextId) ? nextId : '');
                    }}
                    placeholder="Find a person in this department..."
                    searchable
                    allowEmpty
                    emptyLabel="Choose a person"
                    dropdownVariant="modal"
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">{reportToLabel}</label>
                  <SearchableSelect
                    options={reportToOptions.filter((opt) => Number(opt.value) !== Number(selectedEmployeeId))}
                    value={linkedToId || ''}
                    onChange={(value) => setLinkedToId(value ? Number(value) : '')}
                    placeholder={reportToPlaceholder}
                    searchable
                    allowEmpty
                    emptyLabel="No link"
                    dropdownVariant="modal"
                    className="w-full"
                  />
                </div>

                <p className="rounded-xl bg-teal-green/10 dark:bg-teal-green/15 px-3 py-2 text-xs text-teal-deep dark:text-teal-green">
                  This screen only shows and changes links inside {activeDeptLabel}. Link targets are department-scoped by role: Employee -&gt; Supervisor/Manager/HR, Supervisor -&gt; Manager/HR, Manager -&gt; HR.
                </p>

                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => saveLink(linkedToId ? Number(linkedToId) : null)}
                    className="inline-flex items-center gap-2 rounded-xl bg-teal-green text-white px-4 py-2.5 text-sm font-bold shadow-sm hover:opacity-95 disabled:opacity-50"
                    disabled={!selectedEmployee}
                  >
                    <Sparkles size={16} />
                    Save Link
                  </button>
                  <button
                    type="button"
                    onClick={() => saveLink(null)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                    disabled={!selectedEmployee}
                  >
                    <Unlink2 size={16} />
                    Remove Link
                  </button>
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center gap-2 mb-4">
                <Shield size={18} className="text-teal-green" />
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">HR Admins</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {hrAdmins.length > 0 ? hrAdmins.map((admin: any) => (
                  <span key={admin.id} className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                    <Shield size={12} className="text-teal-green" />
                    {personLabel(admin)}
                  </span>
                )) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No HR accounts found.</p>
                )}
              </div>
            </Card>

            {selectedEmployee && (
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <GitBranch size={18} className="text-teal-green" />
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Reporting path</h3>
                </div>
                <div className="space-y-3">
                  {chain.map((person, index) => (
                    <div key={person.id} className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black ${index === chain.length - 1 ? 'bg-teal-green text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'}`}>
                        {index + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{personLabel(person)}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{roleLabel(person)} • {(person as any).dept || activeDeptLabel}</p>
                      </div>
                      {index < chain.length - 1 && <ArrowRight size={14} className="text-slate-300 dark:text-slate-600 ml-auto flex-shrink-0" />}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          <Card className="min-h-[72vh]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">People in {activeDeptLabel}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Click a person to see their reporting line inside this department.</p>
              </div>
              <div className="w-full sm:w-80">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search a person in this department..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-teal-green/30"
                />
              </div>
            </div>

            <div className="space-y-4">
              {filteredRoots.length > 0 ? filteredRoots.map((person) => renderNode(person)) : (
                <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-8 text-center text-slate-500 dark:text-slate-400">
                  No people found in {activeDeptLabel}.
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {selectedEmployee && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Selected Person</p>
            <h4 className="text-xl font-black text-slate-900 dark:text-slate-100">{personLabel(selectedEmployee)}</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{(selectedEmployee as any).position || 'No position'} • {(selectedEmployee as any).dept || activeDeptLabel}</p>
          </Card>
          <Card className="lg:col-span-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Reports To</p>
            <h4 className="text-xl font-black text-slate-900 dark:text-slate-100">{selectedManager ? personLabel(selectedManager) : 'No current manager'}</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {selectedManager ? `${roleLabel(selectedManager)} • ${(selectedManager as any).dept || activeDeptLabel}` : 'Use the link editor to assign one.'}
            </p>
          </Card>
          <Card className="lg:col-span-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Direct Reports</p>
            <h4 className="text-xl font-black text-slate-900 dark:text-slate-100">{directReports.length}</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">People currently linked below this person.</p>
          </Card>
        </div>
      )}
    </div>
  );
};
