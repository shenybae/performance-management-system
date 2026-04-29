import React, { useState, useEffect, useRef } from 'react';
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
  Layers,
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
  WifiOff,
  Menu,
  PanelLeftClose,
  GitBranch
} from 'lucide-react';

// --- Types ---
import { Employee } from './types';

// --- Common Components ---
import { SidebarItem } from './components/common/SidebarItem';
import { NotificationBell } from './components/common/NotificationBell';
import { Login } from './components/common/Login';
import { NotificationProvider, useNotifications } from './notifications/NotificationProvider';

const isSoftDeleted = (row: any) => {
  const status = String(row?.status || '').toLowerCase();
  return Boolean(
    row?.deleted_at ||
    row?.archived_at ||
    row?.is_deleted ||
    row?.is_archived ||
    status === 'archived' ||
    status === 'deleted'
  );
};
import AppDialogHost from './components/common/AppDialogHost';
import { DBViewer } from './components/screens/hr/DBViewer';
import { Departments } from './components/screens/hr/Departments';

// --- HR Screens ---
import { EmployeeDirectory } from './components/screens/hr/EmployeeDirectory';
import { EmployeeJacket } from './components/screens/hr/EmployeeJacket';
import { DisciplinaryLog } from './components/screens/hr/DisciplinaryLog';
import { RecruitmentBoard } from './components/screens/hr/RecruitmentBoard';
import { OffboardingHub } from './components/screens/hr/OffboardingHub';
import { OnboardingHub } from './components/screens/hr/OnboardingHub';
import { UserAccounts } from './components/screens/hr/UserAccounts';
import { LinkedPeople } from './components/screens/hr/LinkedPeople';
import { AuditLogs } from './components/screens/hr/AuditLogs';
import { PayrollAnalytics } from './components/screens/hr/PayrollAnalytics';
import { PayrollManagement } from './components/screens/hr/PayrollManagement';

// --- Manager Screens ---
import { OKRPlanner } from './components/screens/manager/OKRPlanner';
import { EmployeeMetricsDashboard } from './components/screens/manager/EmployeeMetricsDashboard';
import { CoachingJournal } from './components/screens/manager/CoachingJournal';
import { EvaluationPortal } from './components/screens/manager/EvaluationPortal';
import { Promotability } from './components/screens/manager/Promotability';

// --- Leader Screens ---
import { TeamLeaderDashboard } from './components/screens/leader/TeamLeaderDashboard';

// --- Employee Screens ---
import { CareerDashboard } from './components/screens/employee/CareerDashboard';
import { SelfAssessment } from './components/screens/employee/SelfAssessment';
import { FeedbackBox } from './components/screens/employee/FeedbackBox';
import { SuggestionForm } from './components/screens/employee/SuggestionForm';
import { VerificationOfReview } from './components/screens/employee/VerificationOfReview';
import { CoachingChat } from './components/screens/employee/CoachingChat';
import CareerGrowth from './components/screens/employee/CareerGrowth';
import { Settings } from './components/screens/common/Settings';
import { NotFound } from './components/common/NotFound';

interface UserSession {
  id: number;
  username?: string;
  email?: string;
  role: 'HR' | 'Manager' | 'Employee' | 'Leader';
  employee_id: number | null;
  token?: string;
  profile_picture?: string | null;
  employee_name?: string | null;
  position?: string | null;
  dept?: string | null;
  full_name?: string | null;
}

const isSupervisorPosition = (session: UserSession | null) => {
  const pos = String(session?.position || '').toLowerCase();
  return session?.role === 'Employee' && pos.includes('supervisor');
};

const getHomeScreenForUser = (session: UserSession | null) => {
  if (!session) return 'C1';
  if (session.role === 'HR') return 'C5';
  if (session.role === 'Manager') return 'B1';
  if (session.role === 'Leader') return 'D1';
  if (isSupervisorPosition(session)) return 'C5';
  return 'C1';
};

const getHomeRouteForUser = (session: UserSession | null) => {
  if (!session) return '/employee/career-dashboard';
  if (session.role === 'HR') return '/admin/signature-queue';
  if (session.role === 'Manager') return '/manager/okr-planner';
  if (session.role === 'Leader') return '/leader/team-goals';
  if (isSupervisorPosition(session)) return '/employee/signature-queue';
  return '/employee/career-dashboard';
};

const safeParseSession = (raw: string | null) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export default function App() {
  const [user, setUser] = useState<UserSession | null>(() => {
    return safeParseSession(localStorage.getItem('talentflow_user'));
  });
  const [activeScreen, setActiveScreen] = useState<string>('');
  const [navContext, setNavContext] = useState<{ source?: string; employee_id?: number } | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const sidebarHoverEnterTimerRef = useRef<number | null>(null);
  const sidebarHoverLeaveTimerRef = useRef<number | null>(null);
  const [isDesktopViewport, setIsDesktopViewport] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1024;
  });
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

  useEffect(() => {
    const onResize = () => setIsDesktopViewport(window.innerWidth >= 1024);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (isDesktopViewport) setIsSidebarOpen(false);
  }, [isDesktopViewport]);

  useEffect(() => {
    if (!isDesktopViewport) setIsSidebarHovered(false);
  }, [isDesktopViewport]);

  useEffect(() => {
    return () => {
      if (sidebarHoverEnterTimerRef.current !== null) {
        window.clearTimeout(sidebarHoverEnterTimerRef.current);
      }
      if (sidebarHoverLeaveTimerRef.current !== null) {
        window.clearTimeout(sidebarHoverLeaveTimerRef.current);
      }
    };
  }, []);

  const handleDesktopSidebarMouseEnter = () => {
    if (!isDesktopViewport) return;
    if (sidebarHoverEnterTimerRef.current !== null) {
      window.clearTimeout(sidebarHoverEnterTimerRef.current);
      sidebarHoverEnterTimerRef.current = null;
    }
    if (sidebarHoverLeaveTimerRef.current !== null) {
      window.clearTimeout(sidebarHoverLeaveTimerRef.current);
      sidebarHoverLeaveTimerRef.current = null;
    }
    // Small hover-intent delay avoids abrupt instant-open feeling.
    sidebarHoverEnterTimerRef.current = window.setTimeout(() => {
      setIsSidebarHovered(true);
      sidebarHoverEnterTimerRef.current = null;
    }, 56);
  };

  const handleDesktopSidebarMouseLeave = () => {
    if (!isDesktopViewport) return;
    if (sidebarHoverEnterTimerRef.current !== null) {
      window.clearTimeout(sidebarHoverEnterTimerRef.current);
      sidebarHoverEnterTimerRef.current = null;
    }
    if (sidebarHoverLeaveTimerRef.current !== null) {
      window.clearTimeout(sidebarHoverLeaveTimerRef.current);
    }
    // Slight delay prevents rapid collapse/expand jitter near the edge.
    sidebarHoverLeaveTimerRef.current = window.setTimeout(() => {
      setIsSidebarHovered(false);
      sidebarHoverLeaveTimerRef.current = null;
    }, 100);
  };

  // --- Routing helpers: map screens to role-based URL paths and vice-versa ---
  const roleSlug = (r: string) => (r === 'HR' ? 'admin' : r.toLowerCase());

  const screenRouteMap: Record<string, string> = {
    // HR
    A1: '/admin/employee-directory',
    A2: '/admin/employee',
    A3: '/admin/recruitmentboard',
    A4: '/admin/offboarding',
    A5: '/admin/user-accounts',
    A14: '/admin/linked-people',
    A6: '/admin/db-viewer',
    A7: '/admin/onboarding',
    A8: '/admin/feedback360',
    A9: '/admin/audit-logs',
    A10: '/admin/payroll-analytics',
    A11: '/admin/payroll-management',
    A12: '/admin/promotability',
    // Manager
    B1: '/manager/okr-planner',
    B6: '/manager/employee-metrics',
    B2: '/manager/coaching-journal',
    B3: '/manager/disciplinary-action',
    B4: '/manager/evaluation-portal',
    B5: '/manager/promotability',
    B7: '/manager/suggestion-review',
    B8: '/manager/feedback360',
    // Employee
    C1: '/employee/career-dashboard',
    C2: '/employee/suggestion-form',
    C3: '/employee/self-assessment',
    C4: '/employee/feedback',
    C5: '/employee/verification-of-review',
    C6: '/employee/career-growth',
    C7: '/employee/coaching-chat',
    D1: '/leader/team-goals',
    D2: '/leader/team-progress',
  };

  const pathToScreenMap: Record<string, Record<string, string>> = {
    admin: {
      'employee-directory': 'A1',
      'employee': 'A2',
      'recruitmentboard': 'A3',
      'onboarding': 'A7',
      'offboarding': 'A4',
      'user-accounts': 'A5',
      'linked-people': 'A14',
      'audit-logs': 'A9',
      'payroll-analytics': 'A10',
      'payroll-management': 'A11',
      'promotability': 'A12',
      'db-viewer': 'A6',
      'feedback360': 'A8',
      'signature-queue': 'C5',
      'settings': 'S1',
    },
    manager: {
      'okr-planner': 'B1',
      'employee-metrics': 'B6',
      'coaching-journal': 'B2',
      'disciplinary-action': 'B3',
      'evaluation-portal': 'B4',
      'promotability': 'B5',
      'suggestion-review': 'B7',
      'feedback360': 'B8',
      'signature-queue': 'C5',
      'settings': 'S1',
    },
    employee: {
      'career-dashboard': 'C1',
      'suggestion-form': 'C2',
      'self-assessment': 'C3',
      'feedback': 'C4',
      'verification-of-review': 'C5',
      'signature-queue': 'C5',
      'career-growth': 'C6',
      'coaching-chat': 'C7',
      'settings': 'S1',
    },
    leader: {
      'team-goals': 'D1',
      'team-progress': 'D2',
      'signature-queue': 'C5',
      'settings': 'S1',
    }
  };

  function routeForScreen(screenCode: string) {
    if (screenCode === 'S1') {
      // settings path is role-specific
      const base = user ? roleSlug(user.role) : 'admin';
      return `/${base}/settings`;
    }
    if (screenCode === 'C5') {
      const base = user ? roleSlug(user.role) : 'employee';
      return `/${base}/signature-queue`;
    }
    return screenRouteMap[screenCode] || null;
  }

  function setScreenFromPath() {
    try {
      const parts = window.location.pathname.split('/').filter(Boolean);
      if (parts.length === 0) return null;
      const role = parts[0];
      const page = parts[1] || '';
      if (!['admin','manager','employee','leader'].includes(role)) {
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
      if (screen === 'A2') {
        const params = new URLSearchParams(window.location.search || '');
        const idRaw = params.get('id') || params.get('employee_id') || '';
        const employeeId = Number(idRaw);
        if (Number.isFinite(employeeId) && employeeId > 0) {
          fetchEmployeeDetails(employeeId);
        }
      }
      return screen;
    } catch (e) { return null; }
  }

  function goToScreen(screenCode: string, ctx?: any) {
    setActiveScreen(screenCode);
    if (user) {
      const r = routeForScreen(screenCode);
      if (r) {
        let target = r;
        if (screenCode === 'A2' && ctx?.employee_id) {
          target = `${r}?id=${encodeURIComponent(String(ctx.employee_id))}`;
        }
        try {
          const current = `${window.location.pathname}${window.location.search}`;
          if (current !== target) window.history.pushState({}, '', target);
        } catch (e) {}
      }
    }
    if (ctx) setNavContext(ctx || null);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) setIsSidebarOpen(false);
  }

  useEffect(() => {
    if (user) {
      // Fetch required data
      fetchEmployees();
      if (user.role === 'HR' || user.role === 'Manager') fetchUsers();

      // If URL contains a role/page, honor it. Otherwise fall back to default
      const fromPath = setScreenFromPath();
      if (!fromPath) {
        goToScreen(getHomeScreenForUser(user));
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
    const homeRoute = getHomeRouteForUser(session);
    const homeScreen = getHomeScreenForUser(session);

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
    window.dispatchEvent(new Event('talentflow-auth-changed'));
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
    window.dispatchEvent(new Event('talentflow-auth-changed'));
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
        const home = getHomeScreenForUser(user);
        setActiveScreen(home);
        const route = getHomeRouteForUser(user);
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
            const searchableUsers = (Array.isArray(users) ? users : []).filter((u: any) => !isSoftDeleted(u));
            const searchableEmployees = (Array.isArray(employees) ? employees : []).filter((e: any) => !isSoftDeleted(e));
            switch (activeScreen) {
              // HR Screens (The Architect)
              case 'A1': return <EmployeeDirectory employees={employees} onSelectEmployee={(id) => { fetchEmployeeDetails(id); goToScreen('A2', { employee_id: id }); }} onCreateEmployee={fetchEmployees} />;
              case 'A2': return <EmployeeJacket employee={selectedEmployee} onBack={() => { goToScreen('A1'); fetchEmployees(); }} />;
              case 'A3': return <RecruitmentBoard />;
              case 'A7': return <OnboardingHub employees={employees} onRefresh={fetchEmployees} />;
              case 'A4': return <OffboardingHub employees={employees} />;
              case 'A5': return <UserAccounts employees={employees} users={users} onRefresh={fetchUsers} />;
              case 'A14': return <LinkedPeople employees={employees} users={users} onRefresh={fetchEmployees} />;
              case 'A9': return <AuditLogs />;
              case 'A6': return <DBViewer />;
              case 'A8': return <FeedbackBox employees={searchableEmployees} users={searchableUsers} />;
              case 'A10': return <PayrollAnalytics />;
              case 'A11': return <PayrollManagement employees={employees} />;
              case 'A12': return <Promotability employees={employees} />;
              case 'A13': return <Departments />;

              // Manager Screens (The Coach & Evaluator)
              case 'B1': return <OKRPlanner employees={employees} />;
              case 'B6': return <EmployeeMetricsDashboard employees={employees} />;
              case 'B2': return <CoachingJournal employees={employees} currentUser={user} navContext={navContext} onNavContextClear={() => setNavContext(null)} />;
              case 'B3': return <DisciplinaryLog employees={employees} currentUser={user} />;
              case 'B4': return <EvaluationPortal employees={employees} currentUser={user} />;
              case 'B5': return <Promotability employees={employees} />;
              case 'B7': return <SuggestionForm employees={employees} />;
              case 'B8': return <FeedbackBox employees={searchableEmployees} users={searchableUsers} />;

              // Employee Screens (The Performer)
              case 'C1': return <CareerDashboard />;
              case 'C2': return <SuggestionForm />;
              case 'C3': return <SelfAssessment />;
              case 'C4': return <FeedbackBox employees={searchableEmployees} users={searchableUsers} />;
              case 'C5': return <VerificationOfReview />;
              case 'C6': return <CareerGrowth />;
              case 'C7': return <CoachingChat navContext={navContext} onNavContextClear={() => setNavContext(null)} />;

              // Leader Screens (Team Leadership)
              case 'D1': return <TeamLeaderDashboard />;
              case 'D2': return <div className="glass-card p-4 text-center text-slate-500">Team Progress Tracker (Coming Soon)</div>;

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

  const screenTitleMap: Record<string, string> = {
    A1: 'Employee Directory',
    A2: 'Employee Jacket',
    A3: 'Recruitment Board',
    A4: 'Offboarding Hub',
    A5: 'User Accounts',
    A14: 'Linked People',
    A6: 'Database Viewer',
    A7: 'Onboarding Hub',
    A8: 'Feedback 360',
    A9: 'Audit Logs',
    A10: 'Payroll Analytics',
    A11: 'Payroll Management',
    A12: 'Promotability',
    A13: 'Departments',
    B1: 'OKR Planner',
    B6: 'Employee Metrics',
    B2: 'Coaching Journal',
    B3: 'Disciplinary Action',
    B4: 'Evaluation Portal',
    B5: 'Promotability',
    B7: 'Suggestion Review',
    B8: 'Feedback 360',
    C1: 'My Career Dashboard',
    C2: 'Suggestion Form',
    C3: 'Self-Assessment',
    C4: 'Feedback',
    C5: 'Verification of Review',    C6: 'Career Growth & Promotability',    C7: 'Coaching & E-Learning',
    D1: 'Team Goals',
    D2: 'Team Progress',
    S1: 'Settings',
  };

  const roleScreenNavItems: Record<string, Array<{ screen: string; label: string; icon: any; active?: (screen: string) => boolean }>> = {
    HR: [
      { screen: 'A1', label: 'Directory', icon: Users, active: (screen) => screen === 'A1' || screen === 'A2' },
      { screen: 'A5', label: 'User Accounts', icon: ShieldCheck },
      { screen: 'A14', label: 'Linked People', icon: GitBranch },
      { screen: 'A3', label: 'Recruitment', icon: UserPlus },
      { screen: 'A7', label: 'Onboarding', icon: Briefcase },
      { screen: 'A4', label: 'Offboarding', icon: LogOut },
      { screen: 'A13', label: 'Departments', icon: Layers },
      { screen: 'A9', label: 'Audit Logs', icon: ClipboardCheck },
      { screen: 'A10', label: 'Payroll Analytics', icon: DollarSign },
      { screen: 'A11', label: 'Payroll Mgmt', icon: Wallet },
      { screen: 'A12', label: 'Promotability', icon: Award },
      { screen: 'A6', label: 'DB Viewer', icon: TrendingUp },
      { screen: 'S1', label: 'Settings', icon: SettingsIcon },
    ],
    Manager: [
      { screen: 'B1', label: 'OKR Planner', icon: Target },
      { screen: 'B6', label: 'Metrics', icon: LayoutDashboard },
      { screen: 'B2', label: 'Coaching Journal', icon: MessageSquare },
      { screen: 'B4', label: 'Evaluation', icon: ClipboardCheck },
      { screen: 'B3', label: 'Discipline', icon: ShieldAlert },
      { screen: 'B8', label: 'Feedback', icon: MessageSquare },
      { screen: 'B7', label: 'Suggestions', icon: Lightbulb },
      { screen: 'B5', label: 'Promotability', icon: Award },
      { screen: 'C5', label: 'Signature Queue', icon: CheckCircle },
      { screen: 'S1', label: 'Settings', icon: SettingsIcon },
    ],
    Employee: [
      { screen: 'C1', label: 'Dashboard', icon: LayoutDashboard },
      { screen: 'C2', label: 'Suggestions', icon: Lightbulb },
      { screen: 'C3', label: 'Self-Assessment', icon: ClipboardCheck },
      { screen: 'C4', label: 'Feedback', icon: MessageSquare },
      { screen: 'C5', label: 'Verification', icon: CheckCircle },
      { screen: 'C6', label: 'Growth', icon: Award },
      { screen: 'C7', label: 'E-Learning', icon: GraduationCap },
      { screen: 'S1', label: 'Settings', icon: SettingsIcon },
    ],
    Leader: [
      { screen: 'D1', label: 'Team Goals', icon: Target },
      { screen: 'D2', label: 'Team Progress', icon: TrendingUp },
      { screen: 'C5', label: 'Signature Queue', icon: CheckCircle },
      { screen: 'S1', label: 'Settings', icon: SettingsIcon },
    ],
  };
  const activeTitle = screenTitleMap[activeScreen] || 'Dashboard';
  const userDisplay = user.employee_name || user.full_name || user.username || user.email || 'User';
  const roleDisplay = (role?: string | null) => role === 'HR' ? 'HR Admin' : (role || '');
  const topNavItems = roleScreenNavItems[user.role] || [];
  // Desktop: icon-only by default, expand on hover. Mobile: always expanded when open.
  const isSidebarExpanded = !isDesktopViewport || isSidebarHovered;

  return (
    <NotificationProvider>
    <AppDialogHost />
    <div className="relative flex h-screen bg-transparent overflow-hidden selection:bg-teal-green/30 selection:text-teal-deep transition-colors duration-500">
      <AnimatePresence>
        {!isDesktopViewport && isSidebarOpen && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px]"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Close sidebar"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{
          x: isDesktopViewport || isSidebarOpen ? 0 : -320,
          opacity: isDesktopViewport || isSidebarOpen ? 1 : 0.96,
          width: isDesktopViewport ? (isSidebarExpanded ? 272 : 88) : 288,
        }}
        transition={{
          x: { duration: 0.24, ease: 'easeOut' },
          opacity: { duration: 0.2, ease: 'easeOut' },
          width: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
        }}
        onMouseEnter={handleDesktopSidebarMouseEnter}
        onMouseLeave={handleDesktopSidebarMouseLeave}
        className="fixed inset-y-0 left-0 z-50 system-bg border-r border-slate-200 dark:border-slate-800 flex flex-col lg:static lg:z-auto overflow-hidden"
      >
        <div className="border-b border-slate-100 dark:border-slate-800 px-4 py-6">
          <div className="flex items-start justify-between gap-2">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col mb-1 items-center flex-1 min-w-0 pt-2"
          >
            <img src="/logo.png" alt="Maptech Logo" className="h-40 w-40 object-contain mb-1" />
            <motion.p
              initial={false}
              animate={{
                opacity: isSidebarExpanded ? 1 : 0,
                maxHeight: isSidebarExpanded ? 24 : 0,
              }}
              transition={{
                opacity: { duration: isSidebarExpanded ? 0.16 : 0.1, ease: 'easeOut' },
                maxHeight: { duration: isSidebarExpanded ? 0.22 : 0.12, ease: [0.22, 1, 0.36, 1] },
              }}
              className="overflow-hidden text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest whitespace-nowrap"
            >
              Performance System
            </motion.p>
          </motion.div>
          <button
            type="button"
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden mt-1 p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close navigation"
          >
            <PanelLeftClose size={16} />
          </button>
          </div>
        </div>

        <nav className="flex-1 pt-12 pb-4 overflow-y-auto custom-scrollbar">
          <div className="mb-4 px-3">
            <div
              className={`w-full flex items-center py-2 system-bg border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 ${isSidebarExpanded ? 'justify-between px-3' : 'justify-center px-2'}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {isDarkMode ? <Moon size={14} className="text-teal-green" /> : <Sun size={14} className="text-amber-500" />}
                <motion.span
                  initial={false}
                  animate={{
                    opacity: isSidebarExpanded ? 1 : 0,
                    maxWidth: isSidebarExpanded ? 120 : 0,
                  }}
                  transition={{
                    opacity: { duration: isSidebarExpanded ? 0.16 : 0.1, ease: 'easeOut' },
                    maxWidth: { duration: isSidebarExpanded ? 0.22 : 0.12, ease: [0.22, 1, 0.36, 1] },
                  }}
                  className="overflow-hidden whitespace-nowrap"
                >
                  {isDarkMode ? 'Dark Mode' : 'Light Mode'}
                </motion.span>
              </div>
              {isSidebarExpanded && (
                <button
                  type="button"
                  onClick={() => setIsDarkMode(!isDarkMode)}
                  aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                  className={`w-8 h-4 rounded-full relative transition-colors ${isDarkMode ? 'bg-teal-green' : 'bg-slate-300'}`}
                  title={isDarkMode ? 'Dark Mode On' : 'Light Mode On'}
                >
                  <motion.div 
                    animate={{ x: isDarkMode ? 16 : 0 }}
                    className="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow-sm"
                  />
                </button>
              )}
            </div>
          </div>
          {user.role === 'HR' && (
            <>
              {isSidebarExpanded && <div className="px-4 mb-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">HR Admin Command Center</div>}
              <SidebarItem expanded={isSidebarExpanded} icon={UserPlus} label="Recruitment Board" active={activeScreen === 'A3'} onClick={() => goToScreen('A3')} />
              <SidebarItem expanded={isSidebarExpanded} icon={MessageSquare} label="360° Feedback" active={activeScreen === 'A8'} onClick={() => goToScreen('A8')} />
              <SidebarItem expanded={isSidebarExpanded} icon={Briefcase} label="Onboarding Hub" active={activeScreen === 'A7'} onClick={() => goToScreen('A7')} />
              <SidebarItem expanded={isSidebarExpanded} icon={Users} label="Employee Directory" active={activeScreen === 'A1' || activeScreen === 'A2'} onClick={() => goToScreen('A1')} />
              <SidebarItem expanded={isSidebarExpanded} icon={LogOut} label="Offboarding Hub" active={activeScreen === 'A4'} onClick={() => goToScreen('A4')} />
              <SidebarItem expanded={isSidebarExpanded} icon={ShieldCheck} label="User Accounts" active={activeScreen === 'A5'} onClick={() => goToScreen('A5')} />
              <SidebarItem expanded={isSidebarExpanded} icon={GitBranch} label="Linked People" active={activeScreen === 'A14'} onClick={() => goToScreen('A14')} />
              <SidebarItem expanded={isSidebarExpanded} icon={Layers} label="Departments" active={activeScreen === 'A13'} onClick={() => goToScreen('A13')} />
              <SidebarItem expanded={isSidebarExpanded} icon={ClipboardCheck} label="Audit Logs" active={activeScreen === 'A9'} onClick={() => goToScreen('A9')} />
              <SidebarItem expanded={isSidebarExpanded} icon={DollarSign} label="Payroll Analytics" active={activeScreen === 'A10'} onClick={() => goToScreen('A10')} />
              <SidebarItem expanded={isSidebarExpanded} icon={Wallet} label="Payroll Management" active={activeScreen === 'A11'} onClick={() => goToScreen('A11')} />
              <SidebarItem expanded={isSidebarExpanded} icon={Award} label="Promotability" active={activeScreen === 'A12'} onClick={() => goToScreen('A12')} />
              <SidebarItem expanded={isSidebarExpanded} icon={CheckCircle} label="Signature Queue" active={activeScreen === 'C5'} onClick={() => goToScreen('C5')} />
              <SidebarItem expanded={isSidebarExpanded} icon={TrendingUp} label="DB Viewer" active={activeScreen === 'A6'} onClick={() => goToScreen('A6')} />
              <SidebarItem expanded={isSidebarExpanded} icon={SettingsIcon} label="Settings" active={activeScreen === 'S1'} onClick={() => goToScreen('S1')} />
            </>
          )}

          {user.role === 'Manager' && (
            <>
              {isSidebarExpanded && <div className="px-4 mb-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Performance Dashboard</div>}
              <SidebarItem expanded={isSidebarExpanded} icon={MessageSquare} label="360° Feedback" active={activeScreen === 'B8'} onClick={() => goToScreen('B8')} />
              <SidebarItem expanded={isSidebarExpanded} icon={Target} label="Target & OKR Planner" active={activeScreen === 'B1'} onClick={() => goToScreen('B1')} />
              <SidebarItem expanded={isSidebarExpanded} icon={LayoutDashboard} label="Employee Metrics" active={activeScreen === 'B6'} onClick={() => goToScreen('B6')} />
              <SidebarItem expanded={isSidebarExpanded} icon={MessageSquare} label="Coaching Journal" active={activeScreen === 'B2'} onClick={() => goToScreen('B2')} />
              <SidebarItem expanded={isSidebarExpanded} icon={ShieldAlert} label="Disciplinary Action" active={activeScreen === 'B3'} onClick={() => goToScreen('B3')} />
              <SidebarItem expanded={isSidebarExpanded} icon={ClipboardCheck} label="Evaluation Portal" active={activeScreen === 'B4'} onClick={() => goToScreen('B4')} />
              <SidebarItem expanded={isSidebarExpanded} icon={Award} label="Promotability" active={activeScreen === 'B5'} onClick={() => goToScreen('B5')} />
              <SidebarItem expanded={isSidebarExpanded} icon={Lightbulb} label="Suggestion Review" active={activeScreen === 'B7'} onClick={() => goToScreen('B7')} />
              <SidebarItem expanded={isSidebarExpanded} icon={CheckCircle} label="Signature Queue" active={activeScreen === 'C5'} onClick={() => goToScreen('C5')} />
              <SidebarItem expanded={isSidebarExpanded} icon={SettingsIcon} label="Settings" active={activeScreen === 'S1'} onClick={() => goToScreen('S1')} />
            </>
          )}

          {user.role === 'Employee' && (
            <>
              {isSidebarExpanded && <div className="px-4 mb-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Self-Service & Growth</div>}
              <SidebarItem expanded={isSidebarExpanded} icon={LayoutDashboard} label="My Career Dashboard" active={activeScreen === 'C1'} onClick={() => goToScreen('C1')} />
              <SidebarItem expanded={isSidebarExpanded} icon={Lightbulb} label="Suggestion Form" active={activeScreen === 'C2'} onClick={() => goToScreen('C2')} />
              <SidebarItem expanded={isSidebarExpanded} icon={ClipboardCheck} label="Self-Assessment" active={activeScreen === 'C3'} onClick={() => goToScreen('C3')} />
              <SidebarItem expanded={isSidebarExpanded} icon={MessageSquare} label="360° Feedback" active={activeScreen === 'C4'} onClick={() => goToScreen('C4')} />
              <SidebarItem expanded={isSidebarExpanded} icon={CheckCircle} label="Verification of Review" active={activeScreen === 'C5'} onClick={() => goToScreen('C5')} />
              <SidebarItem expanded={isSidebarExpanded} icon={Award} label="Career Growth" active={activeScreen === 'C6'} onClick={() => goToScreen('C6')} />
              <SidebarItem expanded={isSidebarExpanded} icon={GraduationCap} label="Coaching & E-Learning" active={activeScreen === 'C7'} onClick={() => goToScreen('C7')} />
              <SidebarItem expanded={isSidebarExpanded} icon={SettingsIcon} label="Settings" active={activeScreen === 'S1'} onClick={() => goToScreen('S1')} />
            </>
          )}

          {user.role === 'Leader' && (
            <>
              {isSidebarExpanded && <div className="px-4 mb-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Team Leader</div>}
              <SidebarItem expanded={isSidebarExpanded} icon={Target} label="Team Goals" active={activeScreen === 'D1'} onClick={() => goToScreen('D1')} />
              <SidebarItem expanded={isSidebarExpanded} icon={TrendingUp} label="Team Progress" active={activeScreen === 'D2'} onClick={() => goToScreen('D2')} />
              <SidebarItem expanded={isSidebarExpanded} icon={CheckCircle} label="Signature Queue" active={activeScreen === 'C5'} onClick={() => goToScreen('C5')} />
              <SidebarItem expanded={isSidebarExpanded} icon={SettingsIcon} label="Settings" active={activeScreen === 'S1'} onClick={() => goToScreen('S1')} />
            </>
          )}
        </nav>

        <div className="border-t border-slate-100 dark:border-slate-800 p-3">
          <div className="mb-3 px-1">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/30 p-2.5">
              <div className={`flex items-center min-w-0 ${isSidebarExpanded ? 'gap-3' : 'gap-0 justify-center'}`}>
                {user.profile_picture ? (
                  <img src={user.profile_picture} alt="Profile" className="w-10 h-10 rounded-full object-cover border-2 border-slate-200 dark:border-slate-700 shrink-0" />
                ) : (
                  <div className="w-10 h-10 system-bg border-2 border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center text-teal-deep dark:text-teal-green font-bold text-base shrink-0">
                    {((user.employee_name || user.full_name || user.username || user.email || 'U')[0] || 'U').toUpperCase()}
                  </div>
                )}
                <motion.div
                  initial={false}
                  animate={{
                    opacity: isSidebarExpanded ? 1 : 0,
                    maxWidth: isSidebarExpanded ? 180 : 0,
                    marginLeft: isSidebarExpanded ? 0 : 0,
                  }}
                  transition={{
                    opacity: { duration: isSidebarExpanded ? 0.16 : 0.1, ease: 'easeOut' },
                    maxWidth: { duration: isSidebarExpanded ? 0.22 : 0.12, ease: [0.22, 1, 0.36, 1] },
                  }}
                  className="min-w-0 flex-1 overflow-hidden"
                >
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{user.employee_name || user.full_name || user.username || user.email}</p>
                </motion.div>
              </div>
              {isSidebarExpanded && <div className="mt-2.5 flex gap-1 w-full">
                <span className="flex-1 min-w-0 flex items-center justify-center px-1.5 py-0.5 rounded-md text-[9px] font-medium bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 truncate">
                  {user.position || 'N/A'}
                </span>
                <span className="flex-1 min-w-0 flex items-center justify-center px-1.5 py-0.5 rounded-md text-[9px] font-semibold bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border border-teal-100 dark:border-teal-800/40 truncate">
                  {user.dept || 'N/A'}
                </span>
              </div>}
            </div>
          </div>
          <button
            onClick={() => setShowLogoutConfirm(true)}
            title={!isSidebarExpanded ? 'Sign Out' : undefined}
            className={`w-full flex items-center py-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors ${isSidebarExpanded ? 'gap-2 px-3 justify-start' : 'gap-0 px-2 justify-center'}`}
          >
            <LogOut size={14} /> {isSidebarExpanded && 'Sign Out'}
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-y-auto p-2 sm:p-3 lg:p-4 bg-transparent transition-colors duration-500 relative">
        <AnimatePresence>
          {isOffline && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="relative z-30 mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-sm rounded-xl flex items-center gap-2 font-medium"
            >
              <WifiOff size={16} className="shrink-0" /> You are offline. Some features may not work until your connection is restored.
            </motion.div>
          )}
        </AnimatePresence>
        <div className="w-full min-h-full pb-3 mx-auto max-w-[1560px] px-1 sm:px-2 lg:px-3">
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
