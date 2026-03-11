import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, X, CheckCircle, AlertTriangle, Info, Trash2 } from 'lucide-react';
import { useNotifications } from '../../notifications/NotificationProvider';

const SOURCE_SCREEN_MAP: Record<string, Record<string, string>> = {
  coaching_chat: { Employee: 'C7', Manager: 'B2' },
  coaching_log:  { Employee: 'C7', Manager: 'B2' },
  elearning:     { Employee: 'C7', Manager: 'B2' },
  goal_update:   { Employee: 'C1', Manager: 'B2' },
  goal_action:   { Employee: 'C1', Manager: 'B2' },
  appraisal:     { Employee: 'C1', Manager: 'B4' },
  pip:           { Employee: 'C1', Manager: 'B6' },
  suggestion:    { Employee: 'C2', Manager: 'B7', HR: 'A1' },
};

export const NotificationBell = ({ onNavigate }: { onNavigate?: (screen: string, context?: { source?: string; employee_id?: number }) => void }) => {
  const { history, unreadCount, markAllRead, clearHistory } = useNotifications();
  const userRole: string = (() => { try { return JSON.parse(localStorage.getItem('talentflow_user') || '{}')?.role || ''; } catch { return ''; } })();
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpen = () => {
    setIsOpen(!isOpen);
    if (!isOpen) markAllRead();
  };

  const icon = (type: string) => {
    if (type === 'success') return <CheckCircle size={14} className="text-emerald-500 shrink-0 mt-0.5" />;
    if (type === 'error') return <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />;
    return <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />;
  };

  const timeAgo = (ts: number) => {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={handleOpen}
        className="relative w-9 h-9 flex items-center justify-center rounded-full system-bg border border-slate-200 dark:border-slate-700 transition-all hover:border-teal-green hover:shadow-lg hover:shadow-teal-green/10"
      >
        <Bell size={16} className="text-slate-500 dark:text-slate-400" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-[16px] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden"
            style={{ maxHeight: 380 }}
          >
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 dark:border-slate-700">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">Notifications</h4>
              <div className="flex items-center gap-1">
                {history.length > 0 && (
                  <button
                    onClick={clearHistory}
                    className="text-[10px] font-bold text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded transition-colors"
                    title="Clear all"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
                <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5">
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto custom-scrollbar" style={{ maxHeight: 320 }}>
              {history.length === 0 ? (
                <div className="py-8 text-center">
                  <Bell size={24} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-xs text-slate-400 dark:text-slate-500">No notifications yet</p>
                </div>
              ) : (
                history.map(n => {
                  const targetScreen = n.source ? (SOURCE_SCREEN_MAP[n.source]?.[userRole] ?? null) : null;
                  return (
                    <div
                      key={n.id}
                      onClick={() => { if (targetScreen && onNavigate) { onNavigate(targetScreen, { source: n.source, employee_id: n.employee_id }); setIsOpen(false); } }}
                      className={`flex items-start gap-2.5 px-3 py-2.5 border-b border-slate-50 dark:border-slate-700/50 transition-colors ${
                        !n.read ? 'bg-teal-50/50 dark:bg-teal-900/10' : ''
                      } ${targetScreen && onNavigate ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60' : ''}`}
                    >
                      {icon(n.type)}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-700 dark:text-slate-200 leading-snug">{n.message}</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{timeAgo(n.timestamp)}</p>
                      </div>
                      {!n.read && (
                        <span className="w-2 h-2 rounded-full bg-teal-green shrink-0 mt-1" />
                      )}
                      {targetScreen && onNavigate && (
                        <span className="text-[9px] text-teal-600 dark:text-teal-400 font-semibold shrink-0 mt-1">→</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
