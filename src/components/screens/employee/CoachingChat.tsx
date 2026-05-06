import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  MessageSquare, Send, ArrowLeft, GraduationCap, BookOpen, Clock, CheckCircle2,
  AlertTriangle, Lightbulb, Brain, ClipboardList, ThumbsUp, AlertCircle, Calendar,
  Check, CheckCheck, Reply, CircleDot, Wifi, WifiOff
} from 'lucide-react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { ChoicePills } from '../../common/ChoicePills';
import { getAuthHeaders } from '../../../utils/csv';
import { io, Socket } from 'socket.io-client';

type ViewMode = 'main' | 'chat' | 'courses' | 'journal';

export const CoachingChat = ({ navContext, onNavContextClear }: { navContext?: { source?: string; employee_id?: number } | null; onNavContextClear?: () => void }) => {
  const [view, setView] = useState<ViewMode>('main');
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [coachingLogs, setCoachingLogs] = useState<any[]>([]);
  const [replyTo, setReplyTo] = useState<any>(null);
  const [managerOnline, setManagerOnline] = useState(false);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const typingTimeout = useRef<any>(null);

  const user = JSON.parse(localStorage.getItem('talentflow_user') || '{}');
  const employeeId = user.employee_id;

  // Socket.io connection
  useEffect(() => {
    const token = localStorage.getItem('talentflow_token');
    if (!token) return;
    const socket = io(window.location.origin, { path: '/socket.io', transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => { socket.emit('auth', { token }); });

    socket.on('chat:message', (msg: any) => {
      if (msg.employee_id === employeeId || msg.employee_id === Number(employeeId)) {
        setChatMessages(prev => {
          if (msg.id != null && prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    });

    socket.on('chat:read_ack', (data: any) => {
      if (data.employee_id === employeeId || data.employee_id === Number(employeeId)) {
        setChatMessages(prev => prev.map(m =>
          m.sender_role === 'Employee' && m.status !== 'read' ? { ...m, status: 'read' } : m
        ));
      }
    });

    socket.on('chat:action_update', (msg: any) => {
      setChatMessages(prev => prev.map(m => m.id === msg.id ? msg : m));
    });

    socket.on('chat:typing', (data: any) => {
      if ((data.employee_id === employeeId || data.employee_id === Number(employeeId)) && data.sender_role === 'Manager') {
        setTypingUser(data.sender_name || 'Manager');
      }
    });
    socket.on('chat:stop_typing', (data: any) => {
      if (data.sender_role === 'Manager') setTypingUser(null);
    });

    socket.on('presence', (users: any[]) => {
      setManagerOnline(users.some(u => u.role === 'Manager'));
    });

    return () => { socket.disconnect(); socketRef.current = null; };
  }, [employeeId]);

  useEffect(() => { if (employeeId) { fetchChat(); fetchRecs(); fetchCourses(); fetchCoachingLogs(); } }, [employeeId]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  // Auto-navigate to chat from notification
  useEffect(() => {
    if (navContext?.source === 'coaching_chat') {
      setView('chat');
      onNavContextClear?.();
    }
  }, [navContext]);

  // Mark messages as read when viewing chat
  useEffect(() => {
    if (view === 'chat' && employeeId && socketRef.current) {
      socketRef.current.emit('chat:read', { employee_id: employeeId, reader_role: 'Employee' });
    }
  }, [view, employeeId, chatMessages.length]);

  const fetchChat = async () => {
    if (!employeeId) return;
    try { const res = await fetch(`/api/coaching_chats/${employeeId}`, { headers: getAuthHeaders() }); const data = await res.json(); setChatMessages(Array.isArray(data) ? data : []); } catch { setChatMessages([]); }
  };
  const fetchRecs = async () => {
    if (!employeeId) return;
    try { const res = await fetch(`/api/elearning_recommendations/${employeeId}`, { headers: getAuthHeaders() }); const data = await res.json(); setRecommendations(Array.isArray(data) ? data : []); } catch { setRecommendations([]); }
  };
  const fetchCourses = async () => {
    try { const res = await fetch('/api/elearning_courses', { headers: getAuthHeaders() }); const data = await res.json(); setCourses(Array.isArray(data) ? data : []); } catch { setCourses([]); }
  };
  const fetchCoachingLogs = async () => {
    try {
      const res = await fetch('/api/coaching_logs', { headers: getAuthHeaders() });
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      const myLogs = employeeId
        ? list.filter((l: any) => Number(l.employee_id) === Number(employeeId))
        : list;
      setCoachingLogs(myLogs);
    } catch { setCoachingLogs([]); }
  };

  const sendMessage = async () => {
    if (!chatInput.trim() || !employeeId) return;
    if (socketRef.current) {
      socketRef.current.emit('chat:send', {
        employee_id: employeeId,
        sender_role: 'Employee',
        sender_name: user.full_name || user.email || user.username || 'Employee',
        message: chatInput.trim(),
        reply_to: replyTo?.id || null
      });
      socketRef.current.emit('chat:stop_typing', { employee_id: employeeId, sender_role: 'Employee' });
    } else {
      // Fallback to HTTP
      try {
        await fetch('/api/coaching_chats', {
          method: 'POST', headers: getAuthHeaders(),
          body: JSON.stringify({ employee_id: employeeId, sender_role: 'Employee', sender_name: user.full_name || user.email || user.username || 'Employee', message: chatInput.trim() }),
        });
        fetchChat();
      } catch { window.notify?.('Failed to send message', 'error'); return; }
    }
    setChatInput('');
    setReplyTo(null);
  };

  const handleTyping = () => {
    if (!socketRef.current || !employeeId) return;
    socketRef.current.emit('chat:typing', { employee_id: employeeId, sender_role: 'Employee', sender_name: user.full_name || user.email || user.username || 'Employee' });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socketRef.current?.emit('chat:stop_typing', { employee_id: employeeId, sender_role: 'Employee' });
    }, 2000);
  };

  const statusIcon = (status: string, senderRole: string) => {
    if (senderRole !== 'Employee') return null;
    if (status === 'read') return <CheckCheck size={12} className="text-blue-400" />;
    if (status === 'delivered') return <CheckCheck size={12} className="text-slate-400" />;
    return <Check size={12} className="text-slate-400" />;
  };

  const updateRecStatus = async (id: number, status: string) => {
    try { await fetch(`/api/elearning_recommendations/${id}`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify({ status }) }); window.notify?.('Status updated', 'success'); fetchRecs(); } catch { window.notify?.('Failed to update status', 'error'); }
  };

  const activeRecs = recommendations.filter(r => r.status !== 'Completed' && r.status !== 'Declined');
  const completedRecs = recommendations.filter(r => r.status === 'Completed');

  const positiveLogs = coachingLogs.filter(l => l.is_positive === 1 || l.is_positive === true);
  const constructiveLogs = coachingLogs.filter(l => l.is_positive === 0 || l.is_positive === false);

  /* ─── JOURNAL VIEW ─── */
  if (view === 'journal') {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => setView('main')} className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-teal-deep dark:hover:text-teal-green transition-colors"><ArrowLeft size={18} /> Back</button>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center"><ClipboardList size={18} className="text-amber-600" /></div>
            <div>
              <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">Monitoring & Coaching Journal</h2>
              <p className="text-xs text-slate-400">Daily observations and feedback from your manager</p>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><ClipboardList size={18} className="text-slate-500" /></div>
              <div><p className="text-[10px] font-bold text-slate-400 uppercase">Total Entries</p><p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{coachingLogs.length}</p></div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center"><ThumbsUp size={18} className="text-emerald-500" /></div>
              <div><p className="text-[10px] font-bold text-slate-400 uppercase">Positive</p><p className="text-2xl font-bold text-emerald-600">{positiveLogs.length}</p></div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center"><AlertCircle size={18} className="text-amber-500" /></div>
              <div><p className="text-[10px] font-bold text-slate-400 uppercase">Constructive</p><p className="text-2xl font-bold text-amber-600">{constructiveLogs.length}</p></div>
            </div>
          </Card>
        </div>

        {coachingLogs.length === 0 ? (
          <Card>
            <div className="py-12 text-center">
              <ClipboardList size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm text-slate-400 italic">No coaching journal entries yet.</p>
              <p className="text-[10px] text-slate-400 mt-1">Your manager's observations and feedback will appear here.</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {coachingLogs.map((log: any) => {
              const isPositive = log.is_positive === 1 || log.is_positive === true;
              return (
                <Card key={log.id}>
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center ${
                      isPositive ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-amber-100 dark:bg-amber-900/30'
                    }`}>
                      {isPositive ? <ThumbsUp size={16} className="text-emerald-500" /> : <AlertCircle size={16} className="text-amber-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          isPositive ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600'
                        }`}>{isPositive ? 'Positive' : 'Constructive'}</span>
                        {log.category && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">{log.category}</span>}
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{log.notes}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[10px] text-slate-400 flex items-center gap-1"><Calendar size={10} /> {log.created_at ? new Date(log.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span>
                        {log.logged_by && <span className="text-[10px] text-slate-400">By: {log.logged_by}</span>}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </motion.div>
    );
  }

  /* ─── CHAT VIEW ─── */
  if (view === 'chat') {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col h-[calc(100vh-3rem)]">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => setView('main')} className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-teal-deep dark:hover:text-teal-green transition-colors"><ArrowLeft size={18} /> Back</button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center"><MessageSquare size={16} className="text-teal-600" /></div>
            <div>
              <h2 className="text-base font-black text-slate-800 dark:text-slate-100">Coaching Chat</h2>
              <p className="text-[10px] text-slate-400">Real-time conversation with your manager</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {managerOnline ? <Wifi size={12} className="text-emerald-500" /> : <WifiOff size={12} className="text-slate-400" />}
            <span className={`text-[10px] font-bold ${managerOnline ? 'text-emerald-500' : 'text-slate-400'}`}>
              Manager {managerOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>

        <Card>
          <div className="flex flex-col h-[calc(100vh-12rem)]">
            <div className="flex-1 overflow-y-auto space-y-3 pr-2 mb-3 custom-scrollbar">
              {chatMessages.length === 0 && (
                <div className="text-center py-12">
                  <MessageSquare size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-sm text-slate-400 italic">No messages yet.</p>
                  <p className="text-[10px] text-slate-400 mt-1">Start a conversation with your manager about your goals, concerns, or development needs.</p>
                </div>
              )}
              {chatMessages.map((msg: any) => {
                const isEmployee = msg.sender_role === 'Employee';
                const isSystem = msg.sender_role === 'System';
                const repliedMsg = msg.reply_to ? chatMessages.find(m => m.id === msg.reply_to) : null;

                if (isSystem) {
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <div className="max-w-[80%] rounded-xl px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                        <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">{msg.message}</p>
                        {msg.action_type === 'goal_update' && msg.action_status === 'pending' && (
                          <p className="text-[10px] text-amber-500 mt-2 italic">Waiting for manager approval...</p>
                        )}
                        {msg.action_status === 'approved' && (
                          <p className="text-[10px] text-emerald-600 font-bold mt-2 flex items-center gap-1"><CheckCircle2 size={10} /> Approved by Manager</p>
                        )}
                        {msg.action_status === 'rejected' && (
                          <p className="text-[10px] text-red-600 font-bold mt-2 flex items-center gap-1"><AlertCircle size={10} /> Rejected by Manager</p>
                        )}
                        <p className="text-[9px] text-amber-400 mt-1">{msg.created_at ? new Date(msg.created_at).toLocaleString() : ''}</p>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={msg.id} className={`flex ${isEmployee ? 'justify-end' : 'justify-start'} group`}>
                    <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${isEmployee
                      ? 'bg-teal-deep text-white rounded-br-md'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-bl-md'
                    }`}>
                      {repliedMsg && (
                        <div className={`text-[10px] mb-1.5 px-2 py-1 rounded-lg border-l-2 ${
                          isEmployee ? 'bg-teal-700/30 border-teal-300 text-teal-200' : 'bg-slate-200 dark:bg-slate-700 border-slate-400 text-slate-500'
                        }`}>
                          <span className="font-bold">{repliedMsg.sender_name || repliedMsg.sender_role}: </span>
                          {(repliedMsg.message || '').substring(0, 60)}{repliedMsg.message?.length > 60 ? '...' : ''}
                        </div>
                      )}
                      <p className={`text-[10px] font-bold mb-1 ${isEmployee ? 'text-teal-200' : 'text-slate-400'}`}>
                        {msg.sender_name || msg.sender_role} · {msg.created_at ? new Date(msg.created_at).toLocaleString() : ''}
                      </p>
                      <p className="text-sm leading-relaxed">{msg.message}</p>
                      <div className="flex items-center justify-end gap-1 mt-1">
                        {statusIcon(msg.status, msg.sender_role)}
                      </div>
                    </div>
                    {!isEmployee && (
                      <button onClick={() => setReplyTo(msg)} className="opacity-0 group-hover:opacity-100 ml-1 mt-1 text-slate-400 hover:text-teal-500 transition-all" title="Reply">
                        <Reply size={14} />
                      </button>
                    )}
                    {isEmployee && (
                      <button onClick={() => setReplyTo(msg)} className="opacity-0 group-hover:opacity-100 mr-1 mt-1 text-slate-400 hover:text-teal-500 transition-all order-first" title="Reply">
                        <Reply size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
              {typingUser && (
                <div className="flex justify-start">
                  <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-2 rounded-bl-md">
                    <p className="text-[10px] text-slate-400 animate-pulse">{typingUser} is typing...</p>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {replyTo && (
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 mb-2">
                <Reply size={12} className="text-teal-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-teal-600">Replying to {replyTo.sender_name || replyTo.sender_role}</p>
                  <p className="text-[10px] text-slate-500 truncate">{replyTo.message}</p>
                </div>
                <button onClick={() => setReplyTo(null)} className="text-slate-400 hover:text-red-400"><AlertCircle size={12} /></button>
              </div>
            )}

            <div className="flex gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
              <input type="text" value={chatInput} onChange={e => { setChatInput(e.target.value); handleTyping(); }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Type your message to your manager..."
                className="flex-1 p-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-black rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-green/50" />
              <button onClick={sendMessage} disabled={!chatInput.trim()} className="bg-teal-deep text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-teal-green transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
                <Send size={16} /> Send
              </button>
            </div>
          </div>
        </Card>
      </motion.div>
    );
  }

  /* ─── E-LEARNING COURSES VIEW ─── */
  if (view === 'courses') {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => setView('main')} className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-teal-deep dark:hover:text-teal-green transition-colors"><ArrowLeft size={18} /> Back</button>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center"><GraduationCap size={18} className="text-purple-600" /></div>
            <div>
              <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">My E-Learning Courses</h2>
              <p className="text-xs text-slate-400">Recommended training to help you grow and improve</p>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        {activeRecs.length > 0 && (
          <div className="mb-5">
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 mb-4">
              <Lightbulb size={16} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                <span className="font-bold">Your manager has recommended these courses</span> to help you develop skills in identified areas. Completing these courses shows initiative and commitment to growth.
              </p>
            </div>

            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2"><AlertTriangle size={14} className="text-amber-500" /> Recommended For You</h3>
            <div className="space-y-3">
              {activeRecs.map((r: any) => {
                const course = courses.find(c => c.title === r.course_title);
                return (
                  <Card key={r.id}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <BookOpen size={16} className="text-purple-500" />
                          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">{r.course_title}</h4>
                        </div>
                        {course && <p className="text-xs text-slate-500 mb-2">{course.description}</p>}
                        <div className="flex items-center gap-3 mb-2">
                          {r.weakness && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600">Weakness: {r.weakness}</span>}
                          {course && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600">{course.difficulty}</span>}
                          {course && <span className="text-[10px] text-slate-400"><Clock size={10} className="inline mr-0.5" />{course.duration_hours}h</span>}
                        </div>
                        {r.reason && <p className="text-xs text-slate-500 italic">Reason: {r.reason}</p>}
                        <p className="text-[10px] text-slate-400 mt-1">Recommended by: {r.recommended_by} · {r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</p>
                      </div>
                      <div className="flex flex-col gap-1.5 ml-4">
                        <ChoicePills
                          value={r.status}
                          compact
                          wrap={false}
                          onChange={(v) => updateRecStatus(r.id, v)}
                          options={[
                            { value: 'Recommended', label: 'Recommended', activeClassName: 'border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300' },
                            { value: 'In Progress', label: 'In Progress', activeClassName: 'border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300' },
                            { value: 'Completed', label: 'Completed', activeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300' },
                          ]}
                        />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {activeRecs.length === 0 && (
          <Card>
            <div className="py-8 text-center">
              <CheckCircle2 size={36} className="mx-auto text-emerald-400 mb-2" />
              <p className="text-sm text-slate-400 italic">No pending course recommendations. Great job!</p>
            </div>
          </Card>
        )}

        {/* Completed */}
        {completedRecs.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-500" /> Completed Courses</h3>
            <Card>
              <div className="space-y-2">
                {completedRecs.map((r: any) => (
                  <div key={r.id} className="flex items-center gap-3 p-2 bg-emerald-50 dark:bg-emerald-900/10 rounded-lg">
                    <CheckCircle2 size={14} className="text-emerald-500" />
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{r.course_title}</span>
                    <span className="text-[10px] text-slate-400 ml-auto">{r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* All Available Courses (browse) */}
        <div className="mt-5">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2"><BookOpen size={14} /> All Available Courses</h3>
          <div className="grid grid-cols-2 gap-3">
            {courses.map((c: any) => (
              <Card key={c.id}>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">{c.title}</h4>
                <p className="text-xs text-slate-500 mt-0.5">{c.description}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">{c.category}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">{c.difficulty}</span>
                  <span className="text-[10px] text-slate-400"><Clock size={10} className="inline mr-0.5" />{c.duration_hours}h</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </motion.div>
    );
  }

  /* ─── MAIN VIEW ─── */
  const positivePercent = coachingLogs.length > 0 ? Math.round((positiveLogs.length / coachingLogs.length) * 100) : 0;
  const recentLogs = coachingLogs.slice(-5).reverse();
  const metricCardClass = 'h-full rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm shadow-slate-200/40 dark:shadow-none transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-teal-200 dark:hover:border-teal-700 !p-2.5 sm:!p-3 bg-white/95 dark:bg-slate-900/80';
  const navigationItems = [
    { key: 'chat', label: 'Coaching Chat', icon: MessageSquare, accent: 'teal' },
    { key: 'courses', label: 'E-Learning', icon: GraduationCap, accent: 'purple' },
    { key: 'journal', label: 'Journal', icon: ClipboardList, accent: 'amber' },
  ] as const;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <SectionHeader title="Coaching & Development" subtitle="Your personalized coaching dashboard with progress tracking and development insights" />

      {/* Analytics Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 mb-3">
        <Card className={metricCardClass}>
          <div className="flex items-center gap-2.5 min-h-[68px]">
            <div className="w-9 h-9 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center shrink-0"><MessageSquare size={17} className="text-teal-600" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Chat Messages</p>
              <p className="text-xl font-black leading-none text-slate-800 dark:text-slate-100 mt-1">{chatMessages.length}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{chatMessages.filter((m: any) => m.sender_role === 'Manager').length} from manager</p>
            </div>
          </div>
        </Card>

        <Card className={metricCardClass}>
          <div className="flex items-center gap-2.5 min-h-[68px]">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0"><ThumbsUp size={17} className="text-emerald-600" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Positive Feedback</p>
              <p className="text-xl font-black leading-none text-emerald-600 mt-1">{positiveLogs.length}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">of {coachingLogs.length} journal entries</p>
            </div>
          </div>
        </Card>

        <Card className={metricCardClass}>
          <div className="flex items-center gap-2.5 min-h-[68px]">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0"><ClipboardList size={17} className="text-amber-600" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Journal Entries</p>
              <p className="text-xl font-black leading-none text-slate-800 dark:text-slate-100 mt-1">{coachingLogs.length}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{positivePercent}% positive tone</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Top Navigator */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/80 dark:bg-slate-900/70 backdrop-blur-sm px-2 py-2 shadow-sm shadow-slate-200/30 dark:shadow-none">
        <div className="flex w-full flex-wrap items-center gap-2">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = view === item.key;
            const activeText = isActive ? 'text-white' : 'text-slate-700 dark:text-slate-100';
            const buttonClasses = {
              teal: isActive ? 'bg-teal-deep shadow-md shadow-teal-200/30 dark:shadow-none' : 'bg-slate-50/90 dark:bg-slate-950 hover:bg-teal-50 dark:hover:bg-teal-900/20',
              purple: isActive ? 'bg-purple-600 shadow-md shadow-purple-200/30 dark:shadow-none' : 'bg-slate-50/90 dark:bg-slate-950 hover:bg-purple-50 dark:hover:bg-purple-900/20',
              amber: isActive ? 'bg-amber-500 shadow-md shadow-amber-200/30 dark:shadow-none' : 'bg-slate-50/90 dark:bg-slate-950 hover:bg-amber-50 dark:hover:bg-amber-900/20',
            }[item.accent];
            const iconClasses = {
              teal: isActive ? 'bg-white/15 text-white' : 'bg-teal-50 text-teal-600 dark:bg-teal-900/20 dark:text-teal-300',
              purple: isActive ? 'bg-white/15 text-white' : 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-300',
              amber: isActive ? 'bg-white/15 text-white' : 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300',
            }[item.accent];
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setView(item.key)}
                className={`group inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-left transition-all duration-150 ${buttonClasses} ${isActive ? '' : 'border border-slate-200/60 dark:border-slate-800/60'}`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors ${iconClasses}`}>
                  <Icon size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-[12px] font-black leading-none whitespace-nowrap ${activeText}`}>{item.label}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mode Selection and Visualizations */}
      <div className="grid grid-cols-1 gap-2 mb-3">
        {/* Coaching Sentiment */}
        <Card>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-sm font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">Coaching Journal Sentiment</h3>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{coachingLogs.length} entries</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="text-center p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/30">
              <p className="text-2xl font-black text-emerald-600">{positiveLogs.length}</p>
              <p className="text-xs font-bold text-emerald-600 mt-1">Positive</p>
              <p className="text-[10px] text-slate-400">{positivePercent}% of entries</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30">
              <p className="text-2xl font-black text-amber-600">{constructiveLogs.length}</p>
              <p className="text-xs font-bold text-amber-600 mt-1">Constructive</p>
              <p className="text-[10px] text-slate-400">{100 - positivePercent}% of entries</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Journal Summary Table */}
      {recentLogs.length > 0 && (
        <Card>
          <div className="mb-3">
            <h3 className="text-sm font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">Recent Coaching Observations</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-slate-500">Date</th>
                  <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-slate-500">Type</th>
                  <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-slate-500">Category</th>
                  <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-slate-500">Logged By</th>
                  <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-slate-500">Note</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((log: any) => {
                  const isPositive = log.is_positive === 1 || log.is_positive === true;
                  return (
                    <tr key={log.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/30">
                      <td className="px-3 py-2 text-[11px] text-slate-600 dark:text-slate-400">{log.created_at ? new Date(log.created_at).toLocaleDateString() : '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isPositive ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600'
                        }`}>
                          {isPositive ? <ThumbsUp size={10} /> : <AlertCircle size={10} />} {isPositive ? 'Positive' : 'Constructive'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[11px] text-slate-600 dark:text-slate-400">{log.category || '—'}</td>
                      <td className="px-3 py-2 text-[11px] text-slate-600 dark:text-slate-400">{log.logged_by || 'Manager'}</td>
                      <td className="px-3 py-2 text-[11px] text-slate-600 dark:text-slate-400 max-w-xs truncate">{log.notes || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {coachingLogs.length > 5 && (
            <button onClick={() => setView('journal')} className="text-xs font-bold text-amber-500 hover:text-amber-700 mt-3 block">View all {coachingLogs.length} entries →</button>
          )}
        </Card>
      )}

      {/* Course Recommendations Table */}
      {recommendations.length > 0 && (
        <Card>
          <div className="mb-3">
            <h3 className="text-sm font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">All Course Recommendations</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-slate-500">Course</th>
                  <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-slate-500">Status</th>
                  <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-slate-500">Weakness</th>
                  <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-slate-500">Recommended By</th>
                  <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-slate-500">Date</th>
                </tr>
              </thead>
              <tbody>
                {recommendations.map((r: any) => (
                  <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/30">
                    <td className="px-3 py-2 text-[11px] font-medium text-slate-700 dark:text-slate-200">{r.course_title}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        r.status === 'Completed' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' :
                        r.status === 'In Progress' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' :
                        'bg-amber-100 dark:bg-amber-900/30 text-amber-600'
                      }`}>{r.status}</span>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-slate-600 dark:text-slate-400">{r.weakness || '—'}</td>
                    <td className="px-3 py-2 text-[11px] text-slate-600 dark:text-slate-400">{r.recommended_by || 'Manager'}</td>
                    <td className="px-3 py-2 text-[11px] text-slate-600 dark:text-slate-400">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </motion.div>
  );
};
