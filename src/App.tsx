import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users,
  Target,
  ClipboardCheck,
  ShieldAlert,
  UserPlus,
  LogOut,
  TrendingUp,
  Award,
  MessageSquare,
  ShieldCheck,
  Sun,
  Moon,
  LayoutDashboard,
  Briefcase,
  Lightbulb,
  GraduationCap,
  Settings as SettingsIcon,
  Bell,
  X,
  CheckCircle,
  AlertTriangle,
  Info,
  DollarSign,
  Wallet,
  WifiOff
} from 'lucide-react';

// --- Types ---
import { Employee } from './types';

// --- Common Components ---
import { SidebarItem } from './components/common/SidebarItem';
import { NotificationBell } from './components/common/NotificationBell';
import { Login } from './components/common/Login';
import { NotificationProvider, useNotifications } from './notifications/NotificationProvider';
import { DBViewer } from './components/screens/hr/DBViewer';

// --- HR Screens ---
import { EmployeeDirectory } from './components/screens/hr/EmployeeDirectory';
import { EmployeeJacket } from './components/screens/hr/EmployeeJacket';
import { DisciplinaryLog } from './components/screens/hr/DisciplinaryLog';
import { RecruitmentBoard } from './components/screens/hr/RecruitmentBoard';
import { OffboardingHub } from './components/screens/hr/OffboardingHub';
import { OnboardingHub } from './components/screens/hr/OnboardingHub';
import { UserAccounts } from './components/screens/hr/UserAccounts';
import { AuditLogs } from './components/screens/hr/AuditLogs';
import { PayrollAnalytics } from './components/screens/hr/PayrollAnalytics';
import { PayrollManagement } from './components/screens/hr/PayrollManagement';

// --- Manager Screens ---
import { OKRPlanner } from './components/screens/manager/OKRPlanner';
import { CoachingJournal } from './components/screens/manager/CoachingJournal';
import { EvaluationPortal } from './components/screens/manager/EvaluationPortal';
import { Promotability } from './components/screens/manager/Promotability';
import { PIPManager } from './components/screens/manager/PIPManager';

// --- Employee Screens ---
import { CareerDashboard } from './components/screens/employee/CareerDashboard';
import { SelfAssessment } from './components/screens/employee/SelfAssessment';
import { FeedbackBox } from './components/screens/employee/FeedbackBox';
import { SuggestionForm } from './components/screens/employee/SuggestionForm';
import { VerificationOfReview } from './components/screens/employee/VerificationOfReview';
import { IDP } from './components/screens/employee/IDP';
import { CoachingChat } from './components/screens/employee/CoachingChat';
import { Settings } from './components/screens/common/Settings';
import { NotFound } from './components/common/NotFound';

interface UserSession {
  id: number;
  username?: string;
  email?: string;
  role: 'HR' | 'Manager' | 'Employee';
  employee_id: number | null;
  token?: string;
  profile_picture?: string | null;
  employee_name?: string | null;
  position?: string | null;
  dept?: string | null;
  full_name?: string | null;
}

export default function App() {
  const [user, setUser] = useState<UserSession | null>(() => {
    const saved = localStorage.getItem('talentflow_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [activeScreen, setActiveScreen] = useState<string>('');
  const [navContext, setNavContext] = useState<{ source?: string; employee_id?: number } | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem('talentflow_theme');
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
      // default to light when no saved preference
      return false;
    } catch (e) {
      return false;
    }
  });

  useEffect(() => {
    // Only apply persistent theme when a user is logged in to avoid overriding the login screen.
    if (!user) return;
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
      localStorage.setItem('talentflow_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
      localStorage.setItem('talentflow_theme', 'light');
    }
  }, [isDarkMode, user]);

  // Online/Offline detection
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => { window.removeEventListener('offline', goOffline); window.removeEventListener('online', goOnline); };
  }, []);

  // --- Routing helpers: map screens to role-based URL paths and vice-versa ---
  const roleSlug = (r: string) => (r === 'HR' ? 'admin' : r.toLowerCase());

  const screenRouteMap: Record<string, string> = {
    // HR
    A1: '/admin/employee-directory',
    A2: '/admin/employee',
    A3: '/admin/recruitmentboard',
    A4: '/admin/offboarding',
    A5: '/admin/user-accounts',
    A6: '/admin/db-viewer',
    A7: '/admin/onboarding',
    A8: '/admin/feedback360',
    A9: '/admin/audit-logs',
    A10: '/admin/payroll-analytics',
    A11: '/admin/payroll-management',
    // Manager
    B1: '/manager/okr-planner',
    B2: '/manager/coaching-journal',
    B3: '/manager/disciplinary-action',
    B4: '/manager/evaluation-portal',
    B5: '/manager/promotability',
    B6: '/manager/pip-manager',
    B7: '/manager/suggestion-review',
    B8: '/manager/feedback360',
    // Employee
    C1: '/employee/career-dashboard',
    C2: '/employee/suggestion-form',
    C3: '/employee/self-assessment',
    C4: '/employee/feedback',
    C5: '/employee/verification-of-review',
    C6: '/employee/idp',
    C7: '/employee/coaching-chat',
  };

  const pathToScreenMap: Record<string, Record<string, string>> = {
    admin: {
      'employee-directory': 'A1',
      'recruitmentboard': 'A3',
      'onboarding': 'A7',
      'offboarding': 'A4',
      'user-accounts': 'A5',
      'audit-logs': 'A9',
      'payroll-analytics': 'A10',
      'payroll-management': 'A11',
      'db-viewer': 'A6',
      'feedback360': 'A8',
      'settings': 'S1',
    },
    manager: {
      'okr-planner': 'B1',
      'coaching-journal': 'B2',
      'disciplinary-action': 'B3',
      'evaluation-portal': 'B4',
      'promotability': 'B5',
      'pip-manager': 'B6',
      'suggestion-review': 'B7',
      'feedback360': 'B8',
      'settings': 'S1',
    },
    employee: {
      'career-dashboard': 'C1',
      'suggestion-form': 'C2',
      'self-assessment': 'C3',
      'feedback': 'C4',
      'verification-of-review': 'C5',
      'idp': 'C6',
      'coaching-chat': 'C7',
      'settings': 'S1',
    }
  };

  function routeForScreen(screenCode: string) {
    if (screenCode === 'S1') {
      // settings path is role-specific
      const base = user ? roleSlug(user.role) : 'admin';
      return `/${base}/settings`;
    }
    return screenRouteMap[screenCode] || null;
  }

  function setScreenFromPath() {
    try {
      const parts = window.location.pathname.split('/').filter(Boolean);
      if (parts.length === 0) return null;
      const role = parts[0];
      const page = parts[1] || '';
      if (!['admin','manager','employee'].includes(role)) {
        if (parts[0] !== 'login') { setActiveScreen('404'); return '404'; }
        return null;
      }
      const map = pathToScreenMap[role];
      if (!map) { setActiveScreen('404'); return '404'; }
      const screen = map[page];
      if (!screen) { setActiveScreen('404'); return '404'; }
      // If logged in, ensure role matches the URL role (e.g., HR => admin)
      if (user) {
        const expected = roleSlug(user.role);
        if (expected !== role) return null; // role mismatch — don't 404, just ignore stale URL
      }
      setActiveScreen(screen);
      return screen;
    } catch (e) { return null; }
  }

  function goToScreen(screenCode: string, ctx?: any) {
    setActiveScreen(screenCode);
    if (user) {
      const r = routeForScreen(screenCode);
      if (r) {
        try { if (window.location.pathname !== r) window.history.pushState({}, '', r); } catch (e) {}
      }
    }
    if (ctx) setNavContext(ctx || null);
  }

  useEffect(() => {
    if (user) {
      // Fetch required data
      fetchEmployees();
      if (user.role === 'HR' || user.role === 'Manager') fetchUsers();

      // If URL contains a role/page, honor it. Otherwise fall back to default
      const fromPath = setScreenFromPath();
      if (!fromPath) {
        if (user.role === 'HR') goToScreen('A1');
        else if (user.role === 'Manager') goToScreen('B1');
        else if (user.role === 'Employee') goToScreen('C1');
      }

      const onPop = () => { setScreenFromPath(); };
      window.addEventListener('popstate', onPop);
      return () => window.removeEventListener('popstate', onPop);
    }
  }, [user]);

  // On mount, refresh account info to pick up `full_name` or employee_name for existing sessions
  useEffect(() => {
    const token = localStorage.getItem('talentflow_token');
    if (!token) return;
    const fetchAccount = async () => {
      try {
        const headers: any = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
        const res = await fetch('/api/account-info', { headers });
        if (!res.ok) return;
        const account = await res.json();
        const saved = localStorage.getItem('talentflow_user');
        const existing = saved ? JSON.parse(saved) : {};
        const merged = { ...existing, ...account };
        setUser(merged);
        localStorage.setItem('talentflow_user', JSON.stringify(merged));
        localStorage.setItem('user', JSON.stringify(merged));
      } catch (err) {
        console.error('Failed to refresh account info', err);
      }
    };
    fetchAccount();
  }, []);

  const handleLogin = (session: UserSession) => {
    const slug = session.role === 'HR' ? 'admin' : session.role.toLowerCase();
    const homeRoute = session.role === 'HR' ? '/admin/employee-directory' : session.role === 'Manager' ? '/manager/okr-planner' : '/employee/career-dashboard';
    const homeScreen = session.role === 'HR' ? 'A1' : session.role === 'Manager' ? 'B1' : 'C1';

    // Only restore pre-login path if it belongs to the same role
    try {
      const redirect = sessionStorage.getItem('pre_login_path');
      sessionStorage.removeItem('pre_login_path');
      const validRedirect = redirect && redirect.startsWith(`/${slug}/`) ? redirect : null;
      window.history.replaceState({}, '', validRedirect || homeRoute);
    } catch (e) {}

    setActiveScreen(homeScreen);
    setUser(session);
    localStorage.setItem('talentflow_user', JSON.stringify(session));
    localStorage.setItem('user', JSON.stringify(session));
    if ((session as any).token) localStorage.setItem('talentflow_token', (session as any).token);
  };

  const handleLogout = async () => {
    // Notify server of logout for audit recording (best-effort)
    try {
      const token = localStorage.getItem('talentflow_token');
      if (token) {
        await fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } }).catch(() => {});
      }
    } catch (e) {}
    // Force login UI to show dark theme on sign out (temporary flag)
    try { localStorage.setItem('talentflow_login_dark', 'true'); } catch (e) {}
    setUser(null);
    localStorage.removeItem('talentflow_user');
    localStorage.removeItem('user');
    localStorage.removeItem('talentflow_token');
  };

  // When unauthenticated, ensure the URL shows /login and remember the
  // originally requested path so we can redirect after successful login.
  useEffect(() => {
    try {
      if (!user) {
        const pathname = window.location.pathname || '/';
        if (pathname !== '/login') {
          // Store the intended destination so we can restore after login
          sessionStorage.setItem('pre_login_path', pathname + (window.location.search || '') + (window.location.hash || ''));
          // Replace the URL with /login (no reload)
          window.history.replaceState({}, '', '/login');
        }
      }
    } catch (e) {}
  }, [user]);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      const token = localStorage.getItem('talentflow_token');
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/employees', { headers });
      if (res.status === 401) {
        // Token invalid or expired — force local sign-out
        handleLogout();
        return;
      }
      const data = await res.json();
      setEmployees(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      const token = localStorage.getItem('talentflow_token');
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const url = user && user.role === 'HR' ? '/api/users?include_deleted=1' : '/api/users';
      const res = await fetch(url, { headers });
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      console.error(err);
    } finally {
      // Ensure any UI loading state is cleared if this was part of initial load
      try { setLoading(false); } catch (e) {}
    }
  };

  const fetchEmployeeDetails = async (id: number) => {
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      const token = localStorage.getItem('talentflow_token');
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`/api/employees/${id}`, { headers });
      const data = await res.json();
      setSelectedEmployee(data);
    } catch (err) {
      console.error(err);
    }
  };

  if (!user) {
    return (
      <NotificationProvider>
        <Login onLogin={handleLogin} />
      </NotificationProvider>
    );
  }

  if (activeScreen === '404') {
    return (
      <NotFound onGoHome={() => {
        const home = user.role === 'HR' ? 'A1' : user.role === 'Manager' ? 'B1' : 'C1';
        setActiveScreen(home);
        const route = user.role === 'HR' ? '/admin/employee-directory' : user.role === 'Manager' ? '/manager/okr-planner' : '/employee/career-dashboard';
        try { window.history.pushState({}, '', route); } catch (e) {}
      }} />
    );
  }

  const renderScreen = () => {
    if (loading && employees.length === 0) return (
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        className="flex items-center justify-center h-full text-lime-bright font-bold tracking-widest uppercase text-xs"
      >
        Loading System Data...
      </motion.div>
    );

    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={activeScreen}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="w-full"
        >
          {(() => {
            switch (activeScreen) {
              // HR Screens (The Architect)
              case 'A1': return <EmployeeDirectory employees={employees} onSelectEmployee={(id) => { fetchEmployeeDetails(id); goToScreen('A2', { employee_id: id }); }} onCreateEmployee={fetchEmployees} />;
              case 'A2': return <EmployeeJacket employee={selectedEmployee} onBack={() => { goToScreen('A1'); fetchEmployees(); }} />;
              case 'A3': return <RecruitmentBoard />;
              case 'A7': return <OnboardingHub employees={employees} onRefresh={fetchEmployees} />;
              case 'A4': return <OffboardingHub employees={employees} />;
              case 'A5': return <UserAccounts employees={employees} users={users} onRefresh={fetchUsers} />;
              case 'A9': return <AuditLogs />;
              case 'A6': return <DBViewer />;
              case 'A8': return <FeedbackBox employees={employees} users={users} />;
              case 'A10': return <PayrollAnalytics />;
              case 'A11': return <PayrollManagement employees={employees} />;

              // Manager Screens (The Coach & Evaluator)
              case 'B1': return <OKRPlanner employees={employees} />;
              case 'B2': return <CoachingJournal employees={employees} navContext={navContext} onNavContextClear={() => setNavContext(null)} />;
              case 'B3': return <DisciplinaryLog employees={employees} />;
              case 'B4': return <EvaluationPortal employees={employees} />;
              case 'B5': return <Promotability employees={employees} />;
              case 'B6': return <PIPManager employees={employees} />;
              case 'B7': return <SuggestionForm employees={employees} />;
              case 'B8': return <FeedbackBox employees={employees} users={users} />;

              // Employee Screens (The Performer)
              case 'C1': return <CareerDashboard />;
              case 'C2': return <SuggestionForm />;
              case 'C3': return <SelfAssessment />;
              case 'C4': return <FeedbackBox employees={employees} users={users} />;
              case 'C5': return <VerificationOfReview />;
              case 'C6': return <IDP />;
              case 'C7': return <CoachingChat navContext={navContext} onNavContextClear={() => setNavContext(null)} />;
              case 'S1': return <Settings onProfilePictureChanged={(pic) => {
                const updated = { ...user, profile_picture: pic };
                setUser(updated);
                localStorage.setItem('talentflow_user', JSON.stringify(updated));
                localStorage.setItem('user', JSON.stringify(updated));
              }} onAccountInfoChanged={(info) => {
                const updated = { ...user, ...info };
                setUser(updated);
                localStorage.setItem('talentflow_user', JSON.stringify(updated));
                localStorage.setItem('user', JSON.stringify(updated));
              }} />;
              
              default: return null;
            }
          })()}
        </motion.div>
      </AnimatePresence>
    );
  };

  return (
    <NotificationProvider>
    <div className="flex h-screen bg-transparent overflow-hidden selection:bg-teal-green/30 selection:text-teal-deep transition-colors duration-500">
      {/* Sidebar */}
      <aside className="w-64 system-bg border-r border-slate-200 dark:border-slate-800 flex flex-col transition-all duration-500">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col mb-1 items-center"
          >
            <img src="/logo.png" alt="Maptech Logo" className="h-14 w-full object-contain mb-2" />
          </motion.div>
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-4 text-center">Performance System</p>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto custom-scrollbar">
          <div className="px-4 mb-4">
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="w-full flex items-center justify-between px-4 py-2 system-bg border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 transition-all hover:border-teal-green hover:shadow-lg hover:shadow-teal-green/5"
            >
              <div className="flex items-center gap-2">
                {isDarkMode ? <Moon size={14} className="text-teal-green" /> : <Sun size={14} className="text-amber-500" />}
                {isDarkMode ? 'Dark Mode' : 'Light Mode'}
              </div>
              <div className={`w-8 h-4 rounded-full relative transition-colors ${isDarkMode ? 'bg-teal-green' : 'bg-slate-300'}`}>
                <motion.div 
                  animate={{ x: isDarkMode ? 16 : 0 }}
                  className="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow-sm"
                />
              </div>
            </motion.button>
          </div>
          {user.role === 'HR' && (
            <>
              <div className="px-4 mb-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">HR Command Center</div>
              <SidebarItem icon={UserPlus} label="Recruitment Board" active={activeScreen === 'A3'} onClick={() => goToScreen('A3')} />
              <SidebarItem icon={Users} label="360° Feedback" active={activeScreen === 'A8'} onClick={() => goToScreen('A8')} />
              <SidebarItem icon={Briefcase} label="Onboarding Hub" active={activeScreen === 'A7'} onClick={() => goToScreen('A7')} />
              <SidebarItem icon={Users} label="Employee Directory" active={activeScreen === 'A1' || activeScreen === 'A2'} onClick={() => goToScreen('A1')} />
              <SidebarItem icon={LogOut} label="Offboarding Hub" active={activeScreen === 'A4'} onClick={() => goToScreen('A4')} />
              <SidebarItem icon={ShieldCheck} label="User Accounts" active={activeScreen === 'A5'} onClick={() => goToScreen('A5')} />
              <SidebarItem icon={ShieldCheck} label="Audit Logs" active={activeScreen === 'A9'} onClick={() => goToScreen('A9')} />
              <SidebarItem icon={DollarSign} label="Payroll Analytics" active={activeScreen === 'A10'} onClick={() => goToScreen('A10')} />
              <SidebarItem icon={Wallet} label="Payroll Management" active={activeScreen === 'A11'} onClick={() => goToScreen('A11')} />
              <SidebarItem icon={TrendingUp} label="DB Viewer" active={activeScreen === 'A6'} onClick={() => goToScreen('A6')} />
              <SidebarItem icon={SettingsIcon} label="Settings" active={activeScreen === 'S1'} onClick={() => goToScreen('S1')} />
            </>
          )}

          {user.role === 'Manager' && (
            <>
              <div className="px-4 mb-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Performance Dashboard</div>
              <SidebarItem icon={Users} label="360° Feedback" active={activeScreen === 'B8'} onClick={() => goToScreen('B8')} />
              <SidebarItem icon={Target} label="Target & OKR Planner" active={activeScreen === 'B1'} onClick={() => goToScreen('B1')} />
              <SidebarItem icon={MessageSquare} label="Coaching Journal" active={activeScreen === 'B2'} onClick={() => goToScreen('B2')} />
              <SidebarItem icon={ShieldAlert} label="Disciplinary Action" active={activeScreen === 'B3'} onClick={() => goToScreen('B3')} />
              <SidebarItem icon={ClipboardCheck} label="Evaluation Portal" active={activeScreen === 'B4'} onClick={() => goToScreen('B4')} />
              <SidebarItem icon={Award} label="Promotability" active={activeScreen === 'B5'} onClick={() => goToScreen('B5')} />
              <SidebarItem icon={TrendingUp} label="IDP / PIP Manager" active={activeScreen === 'B6'} onClick={() => goToScreen('B6')} />
              <SidebarItem icon={Lightbulb} label="Suggestion Review" active={activeScreen === 'B7'} onClick={() => goToScreen('B7')} />
              <SidebarItem icon={SettingsIcon} label="Settings" active={activeScreen === 'S1'} onClick={() => goToScreen('S1')} />
            </>
          )}

          {user.role === 'Employee' && (
            <>
              <div className="px-4 mb-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Self-Service & Growth</div>
              <SidebarItem icon={LayoutDashboard} label="My Career Dashboard" active={activeScreen === 'C1'} onClick={() => goToScreen('C1')} />
              <SidebarItem icon={Lightbulb} label="Suggestion Form" active={activeScreen === 'C2'} onClick={() => goToScreen('C2')} />
              <SidebarItem icon={ClipboardCheck} label="Self-Assessment" active={activeScreen === 'C3'} onClick={() => goToScreen('C3')} />
              <SidebarItem icon={MessageSquare} label="360° Feedback" active={activeScreen === 'C4'} onClick={() => goToScreen('C4')} />
              <SidebarItem icon={ShieldCheck} label="Verification of Review" active={activeScreen === 'C5'} onClick={() => goToScreen('C5')} />
              <SidebarItem icon={Briefcase} label="Development Plan" active={activeScreen === 'C6'} onClick={() => goToScreen('C6')} />
              <SidebarItem icon={GraduationCap} label="Coaching & E-Learning" active={activeScreen === 'C7'} onClick={() => goToScreen('C7')} />
              <SidebarItem icon={SettingsIcon} label="Settings" active={activeScreen === 'S1'} onClick={() => goToScreen('S1')} />
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-col items-center gap-2 mb-4 px-2">
            {user.profile_picture ? (
              <img src={user.profile_picture} alt="Profile" className="w-14 h-14 rounded-full object-cover border-2 border-slate-200 dark:border-slate-700" />
            ) : (
              <div className="w-14 h-14 system-bg border-2 border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center text-teal-deep dark:text-teal-green font-bold text-lg">
                {((user.employee_name || user.full_name || user.username || user.email || 'U')[0] || 'U').toUpperCase()}
              </div>
            )}
            <div className="text-center min-w-0 w-full">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{user.employee_name || user.full_name || user.username || user.email}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">{user.role}</p>
              {user.position && <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{user.position}</p>}
              {user.dept && <p className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold truncate">{user.dept}</p>}
            </div>
          </div>
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-transparent transition-colors duration-500 relative">
        <AnimatePresence>
          {isOffline && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="sticky top-0 z-50 mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-sm rounded-xl flex items-center gap-2 font-medium"
            >
              <WifiOff size={16} className="shrink-0" /> You are offline. Some features may not work until your connection is restored.
            </motion.div>
          )}
        </AnimatePresence>
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-40">
          <NotificationBell onNavigate={(screen, ctx) => { goToScreen(screen); setNavContext(ctx || null); }} />
        </div>
        <div className="max-w-6xl mx-auto min-h-full">
          {renderScreen()}
        </div>
      </main>

      {/* Sign Out Confirmation Modal */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
          >
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowLogoutConfirm(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-sm mx-4"
            >
              <div className="glass-card p-6 text-center">
                <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
                  <LogOut size={24} className="text-red-500" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">Sign Out</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Are you sure you want to sign out of your account?</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowLogoutConfirm(false)}
                    className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { setShowLogoutConfirm(false); handleLogout(); }}
                    className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </NotificationProvider>
  );
}
