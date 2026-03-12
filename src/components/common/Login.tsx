import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, User, ShieldAlert, Sun, Moon, Eye, EyeOff } from 'lucide-react';
import { Card } from './Card';

interface UserSession {
  id: number;
  username?: string;
  email?: string;
  role: 'HR' | 'Manager' | 'Employee';
  employee_id: number | null;
}

export const Login = ({ onLogin }: { onLogin: (user: UserSession) => void }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      const forced = localStorage.getItem('talentflow_login_dark');
      if (forced === 'true') return true;
      const saved = localStorage.getItem('talentflow_theme');
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
      // If there's no saved preference, initialize the login UI as dark
      // so the credentials card appears dark on first open. Do NOT persist
      // this here; persistence is handled by the app after login.
      return true;
    } catch (e) { return true; }
  });

  // Clear the temporary login-only flag so it doesn't persist beyond showing
  React.useEffect(() => {
    try { localStorage.removeItem('talentflow_login_dark'); } catch (e) {}
  }, []);

  React.useEffect(() => {
    try {
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
        document.body.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
        document.body.classList.remove('dark');
      }
    } catch (e) {}
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
        body: JSON.stringify({ email, password })
      });
      if (res.ok) {
        const user = await res.json();
        onLogin(user);
        (window as any).notify('Signed in', 'success');
      } else {
        setError('Invalid credentials');
        (window as any).notify('Invalid credentials', 'error');
      }
    } catch (err) {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    const mail = window.prompt('Enter your email for password reset');
    if (!mail) return;
    try {
      const res = await fetch('/api/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: mail }) });
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
    <div className="relative min-h-screen flex items-center justify-center bg-transparent p-4 selection:bg-teal-green/30 selection:text-teal-deep transition-colors duration-300 overflow-hidden">
      {/* Video background (public/loginBackground.mp4) */}
      <video autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none" aria-hidden="true">
        <source src="/loginBackground.mp4" type="video/mp4" />
      </video>
      {/* Dim overlay for contrast */}
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60 z-10 pointer-events-none" />

      <div className="absolute top-4 right-4 z-30">
        <button 
          onClick={() => setIsDarkMode(!isDarkMode)}
          className="p-2 system-bg border border-slate-200 dark:border-slate-800 rounded-full text-slate-500 transition-all hover:border-teal-green"
        >
          {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md relative z-20">
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
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider mb-2">Email</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-teal-green/50 text-slate-900 dark:text-white transition-all placeholder:text-slate-500 dark:placeholder:text-slate-400"
                  placeholder="you@company.com"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-teal-green/50 text-slate-900 dark:text-white transition-all placeholder:text-slate-500 dark:placeholder:text-slate-400"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 p-1"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
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
