import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { getAuthHeaders } from '../utils/csv';

type NotificationType = 'info' | 'error' | 'success';
type Notification = { id: string; type: NotificationType; message: string };
export type NotificationHistoryItem = { id: string; type: NotificationType; message: string; timestamp: number; read: boolean; fromServer?: boolean; source?: string; employee_id?: number };

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
  const seenServerIds = useRef<Set<string>>(new Set());
  const lastNotify = useRef<{ msg: string; time: number }>({ msg: '', time: 0 });

  const notify = useCallback((message: string, type: NotificationType = 'info') => {
    // Suppress duplicate messages within 2 seconds
    const now = Date.now();
    if (message === lastNotify.current.msg && now - lastNotify.current.time < 2000) return;
    lastNotify.current = { msg: message, time: now };
    const id = Math.random().toString(36).slice(2, 9);
    setList(s => [...s, { id, type, message }]);
    setHistory(h => [{ id, type, message, timestamp: Date.now(), read: false }, ...h].slice(0, 100));
    return id;
  }, []);

  const unreadCount = history.filter(h => !h.read).length;

  const markAllRead = useCallback(() => {
    setHistory(h => h.map(n => ({ ...n, read: true })));
    // Also mark server notifications as read
    const token = localStorage.getItem('talentflow_token');
    if (token) {
      fetch('/api/notifications/read', { method: 'PUT', headers: getAuthHeaders() }).catch(() => {});
    }
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    seenServerIds.current.clear();
    const token = localStorage.getItem('talentflow_token');
    if (token) {
      fetch('/api/notifications', { method: 'DELETE', headers: getAuthHeaders() }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    (window as any).notify = (m: string, t: NotificationType = 'info') => notify(m, t);
  }, [notify]);

  // Poll server notifications every 15 seconds
  useEffect(() => {
    const token = localStorage.getItem('talentflow_token');
    if (!token) return;

    const fetchNotifications = async () => {
      try {
        const res = await fetch('/api/notifications', { headers: getAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        if (!Array.isArray(data)) return;

        const newItems: NotificationHistoryItem[] = [];
        for (const n of data) {
          const serverId = `srv_${n.id}`;
          if (!seenServerIds.current.has(serverId)) {
            seenServerIds.current.add(serverId);
            newItems.push({
              id: serverId,
              type: (n.type || 'info') as NotificationType,
              message: n.message,
              timestamp: n.created_at ? new Date(n.created_at).getTime() : Date.now(),
              read: n.read === 1,
              fromServer: true,
              source: n.source,
            });
            // Show toast for unread server notifications
            if (!n.read) {
              setList(s => [...s, { id: serverId, type: (n.type || 'info') as NotificationType, message: n.message }]);
            }
          }
        }

        if (newItems.length > 0) {
          setHistory(h => {
            const merged = [...newItems.filter(ni => !h.some(existing => existing.id === ni.id)), ...h];
            merged.sort((a, b) => b.timestamp - a.timestamp);
            return merged.slice(0, 100);
          });
        }
      } catch {}
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, []);

  // Real-time socket notifications
  useEffect(() => {
    const token = localStorage.getItem('talentflow_token');
    if (!token) return;

    const socket = io({ path: '/socket.io', autoConnect: true, auth: { token } });
    // still emit an explicit 'auth' as a safe fallback after connect
    socket.on('connect', () => { try { socket.emit('auth', { token }); } catch (e) {} });
    socket.on('notification', (n: { type?: string; message: string; source?: string; employee_id?: number }) => {
      const id = `sock_${Math.random().toString(36).slice(2, 9)}`;
      const type = (n.type || 'info') as NotificationType;
      setList(s => [...s, { id, type, message: n.message }]);
      setHistory(h => [{ id, type, message: n.message, timestamp: Date.now(), read: false, source: n.source, employee_id: n.employee_id }, ...h].slice(0, 100));
    });
    socket.on('auth_error', (err: any) => {
      notify('Authentication failed — please login again', 'error');
      localStorage.removeItem('talentflow_token');
      setTimeout(() => { window.location.href = '/login'; }, 600);
    });
    socket.on('force_logout', (info: any) => {
      notify(info?.message || 'Your session was ended because you signed in elsewhere', 'info');
      localStorage.removeItem('talentflow_token');
      localStorage.removeItem('talentflow_user');
      setTimeout(() => { window.location.href = '/login'; }, 900);
    });
    return () => { socket.disconnect(); };
  }, [notify]);

  useEffect(() => {
    if (list.length === 0) return;
    // Dismiss faster when many toasts are queued, max 3 visible at a time
    const delay = list.length > 3 ? 500 : 3000;
    const timer = setTimeout(() => setList(s => s.slice(1)), delay);
    return () => clearTimeout(timer);
  }, [list]);

  return (
    <NotificationContext.Provider value={{ notify, history, unreadCount, markAllRead, clearHistory }}>
      {children}
      <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none' }}>
        {list.slice(0, 3).map(n => (
          <div key={n.id} style={{ marginBottom: 8, minWidth: 280, maxWidth: 420, padding: '10px 16px', borderRadius: 8, color: '#fff', background: n.type === 'error' ? '#dc2626' : n.type === 'success' ? '#16a34a' : '#2563eb', boxShadow: '0 6px 18px rgba(2,6,23,0.3)', textAlign: 'center', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {n.message}
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

export default NotificationProvider;
