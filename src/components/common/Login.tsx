import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, User, ShieldAlert, Sun, Moon } from 'lucide-react';
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

  // Quick demo access removed — use seeded accounts and the main sign-in form.

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
        (window as any).notify('Signed in', 'success');
      } else {
        setError('Invalid username or password');
        (window as any).notify('Invalid username or password', 'error');
      }
    } catch (err) {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    const uname = window.prompt('Enter your username for password reset');
    if (!uname) return;
    try {
      const res = await fetch('/api/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: uname }) });
      const data = await res.json();
      if (res.ok) {
        (window as any).notify('Password reset requested. Check console or copy token shown.', 'info');
        if (data.token) {
          // In dev we return token — allow immediate reset
          const token = data.token;
          const newPass = window.prompt('Enter new password (token provided)');
          if (!newPass) return;
          const r = await fetch('/api/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, newPassword: newPass }) });
          if (r.ok) (window as any).notify('Password reset successful', 'success'); else { const j = await r.json(); (window as any).notify(j.error || 'Reset failed', 'error'); }
        }
      } else {
        (window as any).notify(data.error || 'Failed to request reset', 'error');
      }
    } catch (err) {
      (window as any).notify('Connection error', 'error');
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
          
          {/* Quick demo access removed — use seeded accounts and the main sign-in form. */}
        </div>
        <p className="text-center text-[10px] text-slate-500 dark:text-slate-400 mt-8 font-medium">
          © {new Date().getFullYear()} Maptech Information Solutions Inc. All rights reserved.
        </p>
      </motion.div>
    </div>
  );
};
