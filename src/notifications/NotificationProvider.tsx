import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';

type NotificationType = 'info' | 'error' | 'success';
type Notification = { id: string; type: NotificationType; message: string };
export type NotificationHistoryItem = { id: string; type: NotificationType; message: string; timestamp: number; read: boolean };

interface NotificationCtx {
  notify: (m: string, t?: NotificationType) => void;
  history: NotificationHistoryItem[];
  unreadCount: number;
  markAllRead: () => void;
  clearHistory: () => void;
}

const NotificationContext = createContext<NotificationCtx | null>(null);

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationProvider');
  return ctx;
};

export const useNotify = () => useNotifications().notify;

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const [list, setList] = useState<Notification[]>([]);
  const [history, setHistory] = useState<NotificationHistoryItem[]>([]);

  const notify = useCallback((message: string, type: NotificationType = 'info') => {
    const id = Math.random().toString(36).slice(2, 9);
    setList(s => [...s, { id, type, message }]);
    setHistory(h => [{ id, type, message, timestamp: Date.now(), read: false }, ...h].slice(0, 50));
    return id;
  }, []);

  const unreadCount = history.filter(h => !h.read).length;

  const markAllRead = useCallback(() => {
    setHistory(h => h.map(n => ({ ...n, read: true })));
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  useEffect(() => {
    (window as any).notify = (m: string, t: NotificationType = 'info') => notify(m, t);
  }, [notify]);

  useEffect(() => {
    if (list.length === 0) return;
    const timer = setTimeout(() => setList(s => s.slice(1)), 4000);
    return () => clearTimeout(timer);
  }, [list]);

  return (
    <NotificationContext.Provider value={{ notify, history, unreadCount, markAllRead, clearHistory }}>
      {children}
      <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999 }}>
        {list.map(n => (
          <div key={n.id} style={{ marginBottom: 8, minWidth: 240, padding: '10px 14px', borderRadius: 8, color: '#fff', background: n.type === 'error' ? '#e11' : n.type === 'success' ? '#16a34a' : '#2563eb', boxShadow: '0 6px 18px rgba(2,6,23,0.3)' }}>
            {n.message}
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

export default NotificationProvider;
