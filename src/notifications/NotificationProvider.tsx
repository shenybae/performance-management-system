import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';

type Notification = { id: string; type: 'info'|'error'|'success'; message: string };

const NotificationContext = createContext<{ notify: (m: string, t?: Notification['type']) => void } | null>(null);

export const useNotify = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotify must be used inside NotificationProvider');
  return ctx.notify;
};

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const [list, setList] = useState<Notification[]>([]);

  const notify = (message: string, type: Notification['type'] = 'info') => {
    const id = Math.random().toString(36).slice(2,9);
    setList(s => [...s, { id, type, message }]);
    return id;
  };

  useEffect(() => {
    (window as any).notify = (m: string, t: Notification['type']='info') => notify(m, t);
  }, []);

  useEffect(() => {
    if (list.length === 0) return;
    const timer = setTimeout(() => setList(s => s.slice(1)), 4000);
    return () => clearTimeout(timer);
  }, [list]);

  return (
    <NotificationContext.Provider value={{ notify }}>
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
