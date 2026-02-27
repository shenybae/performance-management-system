import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, User, ShieldAlert, TrendingUp, ChevronRight, Sun, Moon } from 'lucide-react';
import { Card } from './Card';

interface UserSession {
  id: number;
  username: string;
  role: 'HR' | 'Manager' | 'Employee';
  employee_id: number | null;
}

export const Login = ({ onLogin }: { onLogin: (user: UserSession) => void }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('talentflow_theme');
    return saved === 'dark';
  });

  React.useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
      localStorage.setItem('talentflow_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
      localStorage.setItem('talentflow_theme', 'light');
    }
  }, [isDarkMode]);

  const handleQuickLogin = async (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      });
      const data = await res.json();
      if (res.ok) {
        onLogin(data);
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError('Could not connect to server');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (res.ok) {
        const user = await res.json();
        onLogin(user);
      } else {
        setError('Invalid username or password');
      }
    } catch (err) {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-transparent p-4 selection:bg-teal-green/30 selection:text-teal-deep transition-colors duration-300">
      <div className="absolute top-4 right-4">
        <button 
          onClick={() => setIsDarkMode(!isDarkMode)}
          className="p-2 system-bg border border-slate-200 dark:border-slate-800 rounded-full text-slate-500 transition-all hover:border-teal-green"
        >
          {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex flex-col items-center mb-2">
            <img src="/logo.png" alt="Maptech Logo" className="h-24 w-full object-contain mb-4" />
          </div>
          <p className="text-slate-500 dark:text-slate-300 mt-6 font-bold uppercase tracking-widest text-[10px]">Performance Management System</p>
        </div>

        <div className="system-bg border border-slate-200 dark:border-slate-800 p-8 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-none transition-colors duration-300">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 text-red-500 text-sm rounded-lg flex items-center gap-2">
                <ShieldAlert size={16} /> {error}
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider mb-2">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-teal-green/50 text-slate-900 dark:text-white transition-all placeholder:text-slate-500 dark:placeholder:text-slate-400"
                  placeholder="Enter your username"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-teal-green/50 text-slate-900 dark:text-white transition-all placeholder:text-slate-500 dark:placeholder:text-slate-400"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full gradient-bg text-white py-4 rounded-xl font-bold shadow-lg shadow-teal-green/30 hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In to Portal'}
            </button>
          </form>
          
          <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center uppercase font-bold tracking-widest mb-4">Quick Demo Access</p>
            <div className="grid grid-cols-1 gap-2">
              <button 
                onClick={() => handleQuickLogin('hr_admin', 'password123')}
                className="flex items-center justify-between p-3 system-bg hover:bg-teal-green/10 dark:hover:bg-teal-green/10 rounded-xl border border-slate-100 dark:border-slate-700 transition-colors group"
              >
                <div className="text-left">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-100 group-hover:text-teal-deep dark:group-hover:text-teal-green">HR Admin Portal</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-300">Manage 201 & Users</p>
                </div>
                <ChevronRight size={14} className="text-slate-400 group-hover:text-teal-deep dark:group-hover:text-teal-green" />
              </button>
              <button 
                onClick={() => handleQuickLogin('manager_bob', 'password123')}
                className="flex items-center justify-between p-3 system-bg hover:bg-teal-green/10 dark:hover:bg-teal-green/10 rounded-xl border border-slate-100 dark:border-slate-700 transition-colors group"
              >
                <div className="text-left">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-100 group-hover:text-teal-deep dark:group-hover:text-teal-green">Manager Dashboard</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-300">OKRs & Coaching</p>
                </div>
                <ChevronRight size={14} className="text-slate-400 group-hover:text-teal-deep dark:group-hover:text-teal-green" />
              </button>
              <button 
                onClick={() => handleQuickLogin('employee_john', 'password123')}
                className="flex items-center justify-between p-3 system-bg hover:bg-teal-green/10 dark:hover:bg-teal-green/10 rounded-xl border border-slate-100 dark:border-slate-700 transition-colors group"
              >
                <div className="text-left">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-100 group-hover:text-teal-deep dark:group-hover:text-teal-green">Employee Self-Service</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-300">Career & Growth</p>
                </div>
                <ChevronRight size={14} className="text-slate-400 group-hover:text-teal-deep dark:group-hover:text-teal-green" />
              </button>
            </div>
          </div>
        </div>
        <p className="text-center text-[10px] text-slate-500 dark:text-slate-400 mt-8 font-medium">
          © {new Date().getFullYear()} Maptech Information Solutions Inc. All rights reserved.
        </p>
      </motion.div>
    </div>
  );
};
