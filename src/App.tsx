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
  Info
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

  useEffect(() => {
    if (user) {
      if (user.role === 'HR') {
        setActiveScreen('A1');
        fetchUsers();
      }
      else if (user.role === 'Manager') { setActiveScreen('B1'); fetchUsers(); }
      else if (user.role === 'Employee') setActiveScreen('C1');
      
      fetchEmployees();
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
    setUser(session);
    localStorage.setItem('talentflow_user', JSON.stringify(session));
    localStorage.setItem('user', JSON.stringify(session));
    if ((session as any).token) localStorage.setItem('talentflow_token', (session as any).token);
  };

  const handleLogout = () => {
    // Force login UI to show dark theme on sign out (temporary flag)
    try { localStorage.setItem('talentflow_login_dark', 'true'); } catch (e) {}
    setUser(null);
    localStorage.removeItem('talentflow_user');
    localStorage.removeItem('user');
    localStorage.removeItem('talentflow_token');
  };

  const fetchEmployees = async () => {
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      const token = localStorage.getItem('talentflow_token');
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/employees', { headers });
      const data = await res.json();
      setEmployees(data);
      setLoading(false);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUsers = async () => {
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      const token = localStorage.getItem('talentflow_token');
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/users', { headers });
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      console.error(err);
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
              case 'A1': return <EmployeeDirectory employees={employees} onSelectEmployee={(id) => { fetchEmployeeDetails(id); setActiveScreen('A2'); }} onCreateEmployee={fetchEmployees} />;
              case 'A2': return <EmployeeJacket employee={selectedEmployee} onBack={() => { setActiveScreen('A1'); fetchEmployees(); }} />;
              case 'A3': return <RecruitmentBoard />;
              case 'A7': return <OnboardingHub employees={employees} onRefresh={fetchEmployees} />;
              case 'A4': return <OffboardingHub employees={employees} />;
              case 'A5': return <UserAccounts employees={employees} users={users} onRefresh={fetchUsers} />;
              case 'A9': return <AuditLogs />;
              case 'A6': return <DBViewer />;
              case 'A8': return <FeedbackBox employees={employees} users={users} />;

              // Manager Screens (The Coach & Evaluator)
              case 'B1': return <OKRPlanner employees={employees} />;
              case 'B2': return <CoachingJournal employees={employees} navContext={navContext} onNavContextClear={() => setNavContext(null)} />;
              case 'B3': return <DisciplinaryLog employees={employees} />;
              case 'B4': return <EvaluationPortal employees={employees} />;
              case 'B5': return <Promotability />;
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
              }} />;
              
              default: return <div className="p-10 text-slate-500 italic">Screen not found.</div>;
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
              <SidebarItem icon={UserPlus} label="Recruitment Board" active={activeScreen === 'A3'} onClick={() => setActiveScreen('A3')} />
              <SidebarItem icon={Users} label="360° Feedback" active={activeScreen === 'A8'} onClick={() => setActiveScreen('A8')} />
              <SidebarItem icon={Briefcase} label="Onboarding Hub" active={activeScreen === 'A7'} onClick={() => setActiveScreen('A7')} />
              <SidebarItem icon={Users} label="Employee Directory" active={activeScreen === 'A1' || activeScreen === 'A2'} onClick={() => setActiveScreen('A1')} />
              <SidebarItem icon={LogOut} label="Offboarding Hub" active={activeScreen === 'A4'} onClick={() => setActiveScreen('A4')} />
              <SidebarItem icon={ShieldCheck} label="User Accounts" active={activeScreen === 'A5'} onClick={() => setActiveScreen('A5')} />
              <SidebarItem icon={ShieldCheck} label="Audit Logs" active={activeScreen === 'A9'} onClick={() => setActiveScreen('A9')} />
              <SidebarItem icon={TrendingUp} label="DB Viewer" active={activeScreen === 'A6'} onClick={() => setActiveScreen('A6')} />
              <SidebarItem icon={SettingsIcon} label="Settings" active={activeScreen === 'S1'} onClick={() => setActiveScreen('S1')} />
            </>
          )}

          {user.role === 'Manager' && (
            <>
              <div className="px-4 mb-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Performance Dashboard</div>
              <SidebarItem icon={Users} label="360° Feedback" active={activeScreen === 'B8'} onClick={() => setActiveScreen('B8')} />
              <SidebarItem icon={Target} label="Target & OKR Planner" active={activeScreen === 'B1'} onClick={() => setActiveScreen('B1')} />
              <SidebarItem icon={MessageSquare} label="Coaching Journal" active={activeScreen === 'B2'} onClick={() => setActiveScreen('B2')} />
              <SidebarItem icon={ShieldAlert} label="Disciplinary Action" active={activeScreen === 'B3'} onClick={() => setActiveScreen('B3')} />
              <SidebarItem icon={ClipboardCheck} label="Evaluation Portal" active={activeScreen === 'B4'} onClick={() => setActiveScreen('B4')} />
              <SidebarItem icon={Award} label="Promotability" active={activeScreen === 'B5'} onClick={() => setActiveScreen('B5')} />
              <SidebarItem icon={TrendingUp} label="IDP / PIP Manager" active={activeScreen === 'B6'} onClick={() => setActiveScreen('B6')} />
              <SidebarItem icon={Lightbulb} label="Suggestion Review" active={activeScreen === 'B7'} onClick={() => setActiveScreen('B7')} />
              <SidebarItem icon={SettingsIcon} label="Settings" active={activeScreen === 'S1'} onClick={() => setActiveScreen('S1')} />
            </>
          )}

          {user.role === 'Employee' && (
            <>
              <div className="px-4 mb-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Self-Service & Growth</div>
              <SidebarItem icon={LayoutDashboard} label="My Career Dashboard" active={activeScreen === 'C1'} onClick={() => setActiveScreen('C1')} />
              <SidebarItem icon={Lightbulb} label="Suggestion Form" active={activeScreen === 'C2'} onClick={() => setActiveScreen('C2')} />
              <SidebarItem icon={ClipboardCheck} label="Self-Assessment" active={activeScreen === 'C3'} onClick={() => setActiveScreen('C3')} />
              <SidebarItem icon={MessageSquare} label="360° Feedback" active={activeScreen === 'C4'} onClick={() => setActiveScreen('C4')} />
              <SidebarItem icon={ShieldCheck} label="Verification of Review" active={activeScreen === 'C5'} onClick={() => setActiveScreen('C5')} />
              <SidebarItem icon={Briefcase} label="Development Plan" active={activeScreen === 'C6'} onClick={() => setActiveScreen('C6')} />
              <SidebarItem icon={GraduationCap} label="Coaching & E-Learning" active={activeScreen === 'C7'} onClick={() => setActiveScreen('C7')} />
              <SidebarItem icon={SettingsIcon} label="Settings" active={activeScreen === 'S1'} onClick={() => setActiveScreen('S1')} />
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-col items-center gap-2 mb-4 px-2">
            {user.profile_picture ? (
              <img src={user.profile_picture} alt="Profile" className="w-14 h-14 rounded-full object-cover border-2 border-slate-200 dark:border-slate-700" />
            ) : (
              <div className="w-14 h-14 system-bg border-2 border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center text-teal-deep dark:text-teal-green font-bold text-lg">
                {((user.employee_name || user.full_name || user.email || user.username || 'U')[0] || 'U').toUpperCase()}
              </div>
            )}
            <div className="text-center min-w-0 w-full">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{user.employee_name || user.full_name || user.email || user.username}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold">{user.role}</p>
              {user.position && <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{user.position}</p>}
              {user.dept && <p className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold truncate">{user.dept}</p>}
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-transparent transition-colors duration-500 relative">
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-40">
          <NotificationBell onNavigate={(screen, ctx) => { setActiveScreen(screen); setNavContext(ctx || null); }} />
        </div>
        <div className="max-w-6xl mx-auto min-h-full">
          {renderScreen()}
        </div>
      </main>
    </div>
    </NotificationProvider>
  );
}
