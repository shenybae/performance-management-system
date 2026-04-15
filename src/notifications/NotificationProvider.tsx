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
  const [authToken, setAuthToken] = useState<string | null>(() => {
    try { return localStorage.getItem('talentflow_token'); } catch { return null; }
  });
  const seenServerIds = useRef<Set<string>>(new Set());
  const initialServerSyncDone = useRef(false);
  const recentToastKeys = useRef<Map<string, number>>(new Map());
  const lastNotify = useRef<{ msg: string; time: number }>({ msg: '', time: 0 });

  const shouldSuppressToast = useCallback((type: NotificationType, message: string, source?: string) => {
    const now = Date.now();
    const key = `${type}|${(source || '').toLowerCase()}|${message.trim().toLowerCase()}`;
    const prev = recentToastKeys.current.get(key) || 0;
    recentToastKeys.current.set(key, now);
    for (const [k, ts] of recentToastKeys.current.entries()) {
      if (now - ts > 120000) recentToastKeys.current.delete(k);
    }
    return now - prev < 10000;
  }, []);

  const pushToast = useCallback((id: string, type: NotificationType, message: string, source?: string) => {
    if (shouldSuppressToast(type, message, source)) return;
    setList(s => {
      if (s.some(n => n.id === id)) return s;
      return [...s, { id, type, message }];
    });
  }, [shouldSuppressToast]);

  const notify = useCallback((message: string, type: NotificationType = 'info') => {
    // Suppress duplicate messages within 2 seconds
    const now = Date.now();
    if (message === lastNotify.current.msg && now - lastNotify.current.time < 2000) return;
    lastNotify.current = { msg: message, time: now };
    const id = Math.random().toString(36).slice(2, 9);
    pushToast(id, type, message, 'local');
    setHistory(h => [{ id, type, message, timestamp: Date.now(), read: false }, ...h].slice(0, 100));
    return id;
  }, [pushToast]);

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

  useEffect(() => {
    const syncAuthToken = () => {
      try {
        setAuthToken(localStorage.getItem('talentflow_token'));
      } catch {
        setAuthToken(null);
      }
    };

    syncAuthToken();
    window.addEventListener('talentflow-auth-changed', syncAuthToken as EventListener);
    return () => window.removeEventListener('talentflow-auth-changed', syncAuthToken as EventListener);
  }, []);

  // Poll server notifications every 15 seconds
  useEffect(() => {
    if (!authToken) return;

    const fetchNotifications = async () => {
      try {
        const res = await fetch('/api/notifications', { headers: getAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        if (!Array.isArray(data)) return;

        const isInitialFetch = !initialServerSyncDone.current;
        const newItems: NotificationHistoryItem[] = [];
        for (const n of data) {
          const serverId = `srv_${n.id}`;
          if (!seenServerIds.current.has(serverId)) {
            seenServerIds.current.add(serverId);
            const itemType = (n.type || 'info') as NotificationType;
            newItems.push({
              id: serverId,
              type: itemType,
              message: n.message,
              timestamp: n.created_at ? new Date(n.created_at).getTime() : Date.now(),
              read: n.read === 1,
              fromServer: true,
              source: n.source,
            });
            // Show toast only for newly-arrived unread notifications after initial sync.
            if (!isInitialFetch && !n.read) {
              pushToast(serverId, itemType, n.message, n.source);
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

        initialServerSyncDone.current = true;
      } catch {}
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [authToken, pushToast]);

  // Real-time socket notifications
  useEffect(() => {
    if (!authToken) return;

    const socket = io({ path: '/socket.io', autoConnect: true, auth: { token: authToken } });
    // still emit an explicit 'auth' as a safe fallback after connect
    socket.on('connect', () => { try { socket.emit('auth', { token: authToken }); } catch (e) {} });
    socket.on('notification', (n: { id?: number; type?: string; message: string; source?: string; employee_id?: number }) => {
      const id = n.id ? `srv_${n.id}` : `sock_${Math.random().toString(36).slice(2, 9)}`;
      const type = (n.type || 'info') as NotificationType;
      if (n.id && seenServerIds.current.has(id)) return;
      if (n.id) seenServerIds.current.add(id);
      pushToast(id, type, n.message, n.source);
      setHistory(h => {
        if (h.some(existing => existing.id === id)) return h;
        return [{ id, type, message: n.message, timestamp: Date.now(), read: false, source: n.source, employee_id: n.employee_id }, ...h].slice(0, 100);
      });
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
      window.dispatchEvent(new Event('talentflow-auth-changed'));
      setTimeout(() => { window.location.href = '/login'; }, 900);
    });
    return () => { socket.disconnect(); };
  }, [authToken, notify]);

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
