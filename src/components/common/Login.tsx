import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Lock, User, ShieldAlert, Sun, Moon, Eye, EyeOff, AlertCircle, WifiOff } from 'lucide-react';

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
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [lockDisplay, setLockDisplay] = useState(0);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
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

  // Online/Offline detection
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => { window.removeEventListener('offline', goOffline); window.removeEventListener('online', goOnline); };
  }, []);

  // Countdown timer for lockout display
  useEffect(() => {
    if (!lockUntil) return;
    const id = setInterval(() => {
      const remaining = Math.ceil((lockUntil - Date.now()) / 1000);
      if (remaining <= 0) { setLockUntil(null); setLockDisplay(0); setError(null); clearInterval(id); }
      else setLockDisplay(remaining);
    }, 1000);
    return () => clearInterval(id);
  }, [lockUntil]);

  const validate = () => {
    const errs: { email?: string; password?: string } = {};
    if (!email.trim()) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'Enter a valid email address';
    if (!password) errs.password = 'Password is required';
    else if (password.length < 6) errs.password = 'Password must be at least 6 characters';
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockUntil && Date.now() < lockUntil) return;
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password })
      });
      if (res.ok) {
        const user = await res.json();
        setAttempts(0); setLockUntil(null);
        onLogin(user);
        (window as any).notify('Signed in', 'success');
      } else {
        const next = attempts + 1;
        setAttempts(next);
        if (next >= 5) {
          const until = Date.now() + 30000;
          setLockUntil(until);
          setLockDisplay(30);
          setError('Too many failed attempts. Please wait 30 seconds before trying again.');
        } else {
          setError(`Invalid credentials. ${5 - next} attempt${5 - next !== 1 ? 's' : ''} remaining before lockout.`);
        }
        (window as any).notify?.('Invalid credentials', 'error');
      }
    } catch (err) {
      setError('Connection error. Please check your network and try again.');
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
    <div className="relative min-h-screen flex items-center justify-center bg-transparent px-4 py-6 md:px-8 md:py-10 selection:bg-teal-green/30 selection:text-teal-deep transition-colors duration-300 overflow-hidden">
      {/* Video background (public/loginBackground.mp4) */}
      <video autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none" aria-hidden="true">
        <source src="/loginBackground.mp4" type="video/mp4" />
      </video>
      {/* Dim overlay for contrast */}
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60 z-10 pointer-events-none" />
      <div className="absolute inset-0 z-10 pointer-events-none bg-[radial-gradient(circle_at_50%_20%,rgba(45,212,191,0.16),transparent_38%)]" />
      <div className="absolute inset-0 z-10 pointer-events-none bg-[radial-gradient(circle_at_50%_120%,rgba(15,118,110,0.22),transparent_45%)]" />

      <div className="absolute top-4 right-4 z-30">
        <button 
          onClick={() => setIsDarkMode(!isDarkMode)}
          className="p-2.5 bg-white/75 dark:bg-black/45 backdrop-blur-md border border-slate-200/80 dark:border-slate-700 rounded-full text-slate-500 dark:text-slate-300 transition-all hover:border-teal-green"
        >
          {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[460px] relative z-20">
        <div className="text-center mb-6 md:mb-7">
          <div className="flex flex-col items-center mb-3">
            <img src="/logo.png" alt="Maptech Logo" className="h-20 md:h-24 w-full object-contain" />
          </div>
          <p className="text-slate-200/95 dark:text-slate-300 font-extrabold uppercase tracking-[0.24em] text-[10px]">Performance Management System</p>
          <p className="text-slate-300/80 dark:text-slate-400 text-xs mt-2">Secure sign-in for HR, managers, and employees</p>
        </div>

        <div className="relative border border-teal-400/25 dark:border-teal-500/20 bg-white/90 dark:bg-slate-950/72 backdrop-blur-xl p-6 md:p-7 rounded-3xl shadow-[0_24px_70px_-22px_rgba(15,118,110,0.55)] transition-colors duration-300">
          <div className="absolute inset-0 rounded-3xl pointer-events-none bg-[linear-gradient(140deg,rgba(45,212,191,0.10),transparent_38%,rgba(14,116,144,0.10))]" />
          <div className="relative">
            <div className="mb-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-600 dark:text-teal-400">Portal Access</p>
              <h2 className="text-lg md:text-xl font-black text-slate-800 dark:text-slate-100">Sign in to your account</h2>
            </div>
          <form onSubmit={handleSubmit} className="space-y-5">
            {isOffline && (
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/30 text-amber-600 dark:text-amber-400 text-sm rounded-lg flex items-center gap-2">
                <WifiOff size={16} className="shrink-0" /> You are offline. Please check your internet connection.
              </div>
            )}
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 text-red-500 text-sm rounded-lg flex items-center gap-2">
                <ShieldAlert size={16} className="shrink-0" /> {error}
                {lockUntil && lockDisplay > 0 && <span className="ml-auto font-black">{lockDisplay}s</span>}
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider mb-2">Email</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); if (fieldErrors.email) setFieldErrors(p => ({ ...p, email: undefined })); }}
                  onBlur={() => { if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) setFieldErrors(p => ({ ...p, email: 'Enter a valid email address' })); }}
                  className={`w-full pl-10 pr-4 py-3 bg-white dark:bg-black border ${fieldErrors.email ? 'border-red-400 dark:border-red-500' : 'border-slate-200 dark:border-slate-700'} rounded-xl outline-none focus:ring-2 focus:ring-teal-green/50 text-slate-900 dark:text-white transition-all placeholder:text-slate-500 dark:placeholder:text-slate-400`}
                  placeholder="you@company.com"
                  maxLength={254}
                  autoComplete="email"
                  spellCheck={false}
                  required
                />
              </div>
              {fieldErrors.email && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11} />{fieldErrors.email}</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); if (fieldErrors.password) setFieldErrors(p => ({ ...p, password: undefined })); }}
                  onBlur={() => { if (password && password.length < 6) setFieldErrors(p => ({ ...p, password: 'At least 6 characters required' })); }}
                  className={`w-full pl-10 pr-10 py-3 bg-white dark:bg-black border ${fieldErrors.password ? 'border-red-400 dark:border-red-500' : 'border-slate-200 dark:border-slate-700'} rounded-xl outline-none focus:ring-2 focus:ring-teal-green/50 text-slate-900 dark:text-white transition-all placeholder:text-slate-500 dark:placeholder:text-slate-400`}
                  placeholder="••••••••"
                  minLength={6}
                  maxLength={128}
                  autoComplete="current-password"
                  required
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 p-1">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {fieldErrors.password && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11} />{fieldErrors.password}</p>}
            </div>
            <button
              type="submit"
              disabled={loading || isOffline || !!(lockUntil && Date.now() < lockUntil)}
              className="w-full gradient-bg text-white py-4 rounded-xl font-bold shadow-lg shadow-teal-green/30 hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isOffline ? 'No Connection' : loading ? 'Signing in...' : lockUntil && Date.now() < lockUntil ? `Locked (${lockDisplay}s)` : 'Sign In to Portal'}
            </button>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleForgot}
                className="text-xs font-bold text-teal-700 dark:text-teal-300 hover:underline underline-offset-4"
              >
                Forgot password?
              </button>
            </div>
          </form>
          </div>
          
          {/* Quick demo access removed — use seeded accounts and the main sign-in form. */}
        </div>
        <p className="text-center text-[10px] text-slate-300/90 dark:text-slate-400 mt-6 font-medium">
          © {new Date().getFullYear()} Maptech Information Solutions Inc. All rights reserved.
        </p>
      </motion.div>
    </div>
  );
};
