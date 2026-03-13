import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  TrendingUp, MessageSquare, Plus, X, Download, Trash2, Send, ArrowLeft, Search,
  AlertTriangle, BookOpen, GraduationCap, Target, Clock, Brain, Lightbulb, BarChart3,
  Check, CheckCheck, Reply, Wifi, WifiOff, ThumbsUp as ThumbsUpIcon, ThumbsDown, CheckCircle2, AlertCircle
} from 'lucide-react';
import { Employee } from '../../../types';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { SearchableSelect } from '../../common/SearchableSelect';
import { exportToCSV, getAuthHeaders } from '../../../utils/csv';
import { io, Socket } from 'socket.io-client';

const WEAKNESS_CATEGORIES = [
  'Communication', 'Time Management', 'Technical Skills', 'Leadership',
  'Teamwork', 'Problem Solving', 'Attendance', 'Work Quality',
  'Customer Service', 'Adaptability', 'Initiative', 'Productivity'
] as const;

const DEFAULT_COURSES = [
  { title: 'Effective Communication Skills', category: 'Communication', description: 'Build professional communication skills for workplace success', difficulty: 'Beginner', duration_hours: 2, weakness_tags: 'Communication' },
  { title: 'Advanced Time Management', category: 'Time Management', description: 'Master prioritization, scheduling, and productivity frameworks', difficulty: 'Intermediate', duration_hours: 3, weakness_tags: 'Time Management,Productivity' },
  { title: 'Technical Fundamentals Bootcamp', category: 'Technical Skills', description: 'Strengthen core technical competencies and tools', difficulty: 'Beginner', duration_hours: 8, weakness_tags: 'Technical Skills' },
  { title: 'Leadership Essentials', category: 'Leadership', description: 'Develop leadership mindset, delegation, and team motivation', difficulty: 'Intermediate', duration_hours: 4, weakness_tags: 'Leadership,Initiative' },
  { title: 'Collaborative Teamwork Workshop', category: 'Teamwork', description: 'Improve collaboration, conflict resolution, and group dynamics', difficulty: 'Beginner', duration_hours: 2, weakness_tags: 'Teamwork,Communication' },
  { title: 'Critical Thinking & Problem Solving', category: 'Problem Solving', description: 'Analytical frameworks for tackling complex workplace challenges', difficulty: 'Advanced', duration_hours: 5, weakness_tags: 'Problem Solving,Adaptability' },
  { title: 'Workplace Professionalism & Attendance', category: 'Attendance', description: 'Understand workplace expectations and professional accountability', difficulty: 'Beginner', duration_hours: 1, weakness_tags: 'Attendance,Work Quality' },
  { title: 'Quality Assurance Mindset', category: 'Work Quality', description: 'Precision, attention to detail, and self-review techniques', difficulty: 'Intermediate', duration_hours: 3, weakness_tags: 'Work Quality,Productivity' },
  { title: 'Customer Service Excellence', category: 'Customer Service', description: 'Deliver outstanding customer experiences and handle complaints', difficulty: 'Beginner', duration_hours: 2, weakness_tags: 'Customer Service,Communication' },
  { title: 'Change Management & Adaptability', category: 'Adaptability', description: 'Thrive in changing environments and embrace new processes', difficulty: 'Intermediate', duration_hours: 3, weakness_tags: 'Adaptability,Initiative' },
];

interface CoachingJournalProps {
  employees: Employee[];
  navContext?: { source?: string; employee_id?: number } | null;
  onNavContextClear?: () => void;
}

type ViewMode = 'dashboard' | 'chat' | 'elearning' | 'addEntry' | 'weaknessAnalysis';

export const CoachingJournal = ({ employees, navContext, onNavContextClear }: CoachingJournalProps) => {
  const [view, setView] = useState<ViewMode>('dashboard');
  const [logs, setLogs] = useState<any[]>([]);
  const [form, setForm] = useState({ employee_id: '', category: '', notes: '', is_positive: true, logged_by: '', weakness_tags: '' as string });
  const [searchTerm, setSearchTerm] = useState('');

  // Chat state
  const [chatEmployee, setChatEmployee] = useState<Employee | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [replyTo, setReplyTo] = useState<any>(null);
  const [employeeOnlineIds, setEmployeeOnlineIds] = useState<Set<number>>(new Set());
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const typingTimeout = useRef<any>(null);
  const chatEmployeeRef = useRef<Employee | null>(null);
  useEffect(() => { chatEmployeeRef.current = chatEmployee; }, [chatEmployee]);

  // E-learning state
  const [courses, setCourses] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [recForm, setRecForm] = useState({ employee_id: '', course_title: '', reason: '', weakness: '' });
  const [showRecForm, setShowRecForm] = useState(false);

  // Weakness-analysis selected employee
  const [analysisEmployee, setAnalysisEmployee] = useState<string>('');

  useEffect(() => { fetchLogs(); fetchCourses(); fetchRecommendations(); }, []);
  useEffect(() => { if (chatEmployee) fetchChatMessages(chatEmployee.id); }, [chatEmployee]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  // Auto-navigate to chat from notification
  useEffect(() => {
    if (navContext?.source === 'coaching_chat' && navContext.employee_id) {
      const emp = employees.find(e => e.id === navContext.employee_id);
      if (emp) {
        setView('chat');
        setChatEmployee(emp);
      }
      onNavContextClear?.();
    }
  }, [navContext]);

  // Socket.io connection
  useEffect(() => {
    const token = localStorage.getItem('talentflow_token');
    if (!token) return;
    const socket = io(window.location.origin, { path: '/socket.io', transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => { socket.emit('auth', { token }); });

    socket.on('chat:message', (msg: any) => {
      const currentEmp = chatEmployeeRef.current;
      setChatMessages(prev => {
        if (!currentEmp || currentEmp.id !== msg.employee_id) return prev;
        if (msg.id != null && prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });

    socket.on('chat:read_ack', (data: any) => {
      setChatMessages(prev => prev.map(m =>
        m.sender_role === 'Manager' && m.status !== 'read' && m.employee_id === data.employee_id ? { ...m, status: 'read' } : m
      ));
    });

    socket.on('chat:action_update', (msg: any) => {
      setChatMessages(prev => prev.map(m => m.id === msg.id ? msg : m));
    });

    socket.on('chat:typing', (data: any) => {
      if (data.sender_role === 'Employee') setTypingUser(data.sender_name || 'Employee');
    });
    socket.on('chat:stop_typing', (data: any) => {
      if (data.sender_role === 'Employee') setTypingUser(null);
    });

    socket.on('presence', (users: any[]) => {
      const ids = new Set(users.filter(u => u.role === 'Employee' && u.employeeId).map(u => u.employeeId as number));
      setEmployeeOnlineIds(ids);
    });

    return () => { socket.disconnect(); socketRef.current = null; };
  }, []);

  // Mark messages as read when viewing chat
  useEffect(() => {
    if (view === 'chat' && chatEmployee && socketRef.current) {
      socketRef.current.emit('chat:read', { employee_id: chatEmployee.id, reader_role: 'Manager' });
    }
  }, [view, chatEmployee, chatMessages.length]);

  const fetchLogs = async () => {
    try { const res = await fetch('/api/coaching_logs', { headers: getAuthHeaders() }); const data = await res.json(); setLogs(Array.isArray(data) ? data : []); } catch { setLogs([]); }
  };
  const fetchCourses = async () => {
    try {
      const res = await fetch('/api/elearning_courses', { headers: getAuthHeaders() }); const data = await res.json();
      if (Array.isArray(data) && data.length === 0) {
        for (const c of DEFAULT_COURSES) {
          await fetch('/api/elearning_courses', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(c) });
        }
        const res2 = await fetch('/api/elearning_courses', { headers: getAuthHeaders() }); const data2 = await res2.json();
        setCourses(Array.isArray(data2) ? data2 : []);
      } else { setCourses(Array.isArray(data) ? data : []); }
    } catch { setCourses([]); }
  };
  const fetchRecommendations = async () => {
    try { const res = await fetch('/api/elearning_recommendations', { headers: getAuthHeaders() }); const data = await res.json(); setRecommendations(Array.isArray(data) ? data : []); } catch { setRecommendations([]); }
  };
  const fetchChatMessages = async (empId: number) => {
    try { const res = await fetch(`/api/coaching_chats/${empId}`, { headers: getAuthHeaders() }); const data = await res.json(); setChatMessages(Array.isArray(data) ? data : []); } catch { setChatMessages([]); }
  };

  const handleSubmit = async () => {
    if (!form.employee_id || !form.notes) { window.notify?.('Please select employee and add notes', 'error'); return; }
    try {
      const user = JSON.parse(localStorage.getItem('talentflow_user') || '{}');
      await fetch('/api/coaching_logs', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ ...form, employee_id: parseInt(form.employee_id), is_positive: form.is_positive ? 1 : 0, logged_by: form.logged_by || user.full_name || user.email || user.username || 'Manager' }),
      });
      window.notify?.('Coaching entry saved', 'success');

      // Auto-recommend e-learning if constructive / weakness found
      if (!form.is_positive && form.weakness_tags) {
        const weaknesses = form.weakness_tags.split(',').map(w => w.trim()).filter(Boolean);
        for (const weakness of weaknesses) {
          const matchedCourse = courses.find(c => (c.weakness_tags || '').toLowerCase().includes(weakness.toLowerCase()));
          if (matchedCourse) {
            await fetch('/api/elearning_recommendations', {
              method: 'POST', headers: getAuthHeaders(),
              body: JSON.stringify({
                employee_id: parseInt(form.employee_id),
                course_id: matchedCourse.id,
                course_title: matchedCourse.title,
                reason: `Identified weakness in ${weakness} from coaching observation: "${form.notes.substring(0, 100)}..."`,
                weakness,
                recommended_by: user.full_name || user.email || user.username || 'Manager'
              }),
            });
          }
        }
        fetchRecommendations();
      }

      setForm({ employee_id: '', category: '', notes: '', is_positive: true, logged_by: '', weakness_tags: '' });
      setView('dashboard');
      fetchLogs();
    } catch { window.notify?.('Failed to save entry', 'error'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this log entry?')) return;
    try { await fetch(`/api/coaching_logs/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); window.notify?.('Entry deleted', 'success'); fetchLogs(); } catch { window.notify?.('Failed to delete', 'error'); }
  };

  const sendChat = async () => {
    if (!chatInput.trim() || !chatEmployee) return;
    const user = JSON.parse(localStorage.getItem('talentflow_user') || '{}');
      if (socketRef.current) {
      socketRef.current.emit('chat:send', {
        employee_id: chatEmployee.id,
        sender_role: 'Manager',
        sender_name: user.full_name || user.email || user.username || 'Manager',
        message: chatInput.trim(),
        reply_to: replyTo?.id || null
      });
      socketRef.current.emit('chat:stop_typing', { employee_id: chatEmployee.id, sender_role: 'Manager' });
    } else {
      try {
        await fetch('/api/coaching_chats', {
          method: 'POST', headers: getAuthHeaders(),
          body: JSON.stringify({ employee_id: chatEmployee.id, sender_role: 'Manager', sender_name: user.full_name || user.email || user.username || 'Manager', message: chatInput.trim() }),
        });
        fetchChatMessages(chatEmployee.id);
      } catch { window.notify?.('Failed to send message', 'error'); return; }
    }
    setChatInput('');
    setReplyTo(null);
  };

  const handleManagerTyping = () => {
    if (!socketRef.current || !chatEmployee) return;
    const user = JSON.parse(localStorage.getItem('talentflow_user') || '{}');
    socketRef.current.emit('chat:typing', { employee_id: chatEmployee.id, sender_role: 'Manager', sender_name: user.full_name || user.email || user.username || 'Manager' });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socketRef.current?.emit('chat:stop_typing', { employee_id: chatEmployee!.id, sender_role: 'Manager' });
    }, 2000);
  };

  const handleGoalAction = (msgId: number, action: 'approved' | 'rejected') => {
    if (socketRef.current) {
      socketRef.current.emit('chat:action', { message_id: msgId, action });
    }
  };

  const statusIcon = (status: string, senderRole: string) => {
    if (senderRole !== 'Manager') return null;
    if (status === 'read') return <CheckCheck size={12} className="text-blue-400" />;
    if (status === 'delivered') return <CheckCheck size={12} className="text-slate-400" />;
    return <Check size={12} className="text-slate-400" />;
  };

  const handleRecommend = async () => {
    if (!recForm.employee_id || !recForm.course_title) { window.notify?.('Select employee and course', 'error'); return; }
    const user = JSON.parse(localStorage.getItem('talentflow_user') || '{}');
    try {
      await fetch('/api/elearning_recommendations', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ ...recForm, employee_id: parseInt(recForm.employee_id), recommended_by: user.full_name || user.email || user.username || 'Manager' }),
      });
      window.notify?.('E-Learning recommended', 'success');
      setRecForm({ employee_id: '', course_title: '', reason: '', weakness: '' });
      setShowRecForm(false);
      fetchRecommendations();
    } catch { window.notify?.('Failed to recommend', 'error'); }
  };

  const updateRecStatus = async (id: number, status: string) => {
    try { await fetch(`/api/elearning_recommendations/${id}`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify({ status }) }); window.notify?.('Status updated', 'success'); fetchRecommendations(); } catch { window.notify?.('Failed to update status', 'error'); }
  };

  // Weakness analysis memos
  const employeeWeaknesses = useMemo(() => {
    const targetId = analysisEmployee ? parseInt(analysisEmployee) : null;
    const relevantLogs = targetId ? logs.filter(l => l.employee_id === targetId && !l.is_positive) : logs.filter(l => !l.is_positive);
    const weakMap: Record<string, number> = {};
    for (const log of relevantLogs) {
      const text = `${log.category} ${log.notes}`.toLowerCase();
      for (const w of WEAKNESS_CATEGORIES) {
        if (text.includes(w.toLowerCase())) weakMap[w] = (weakMap[w] || 0) + 1;
      }
    }
    return Object.entries(weakMap).sort((a, b) => b[1] - a[1]);
  }, [logs, analysisEmployee]);

  const employeeRecs = useMemo(() => {
    if (!analysisEmployee) return recommendations;
    return recommendations.filter(r => r.employee_id === parseInt(analysisEmployee));
  }, [recommendations, analysisEmployee]);

  const filteredLogs = useMemo(() => {
    if (!searchTerm) return logs;
    const term = searchTerm.toLowerCase();
    return logs.filter(l => (l.employee_name || '').toLowerCase().includes(term) || (l.notes || '').toLowerCase().includes(term) || (l.category || '').toLowerCase().includes(term));
  }, [logs, searchTerm]);

  const stats = useMemo(() => {
    const positive = logs.filter(l => l.is_positive).length;
    const constructive = logs.filter(l => !l.is_positive).length;
    const uniqueEmployees = new Set(logs.map(l => l.employee_id)).size;
    return { total: logs.length, positive, constructive, uniqueEmployees, recsCount: recommendations.length };
  }, [logs, recommendations]);

  const inp = "w-full p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-black rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-green/50";

  /* ─── CHAT VIEW ─── */
  if (view === 'chat') {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col h-[calc(100vh-3rem)]">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => { setView('dashboard'); setChatEmployee(null); }} className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-teal-deep dark:hover:text-teal-green transition-colors"><ArrowLeft size={18} /> Back</button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center"><MessageSquare size={16} className="text-teal-600" /></div>
            <div>
              <h2 className="text-base font-black text-slate-800 dark:text-slate-100">Coaching Q&A Chat</h2>
              <p className="text-[10px] text-slate-400">Real-time coaching conversation</p>
            </div>
          </div>
        </div>

        {!chatEmployee ? (
          <Card>
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">Select Employee to Start Chat</h3>
            <div className="grid grid-cols-3 gap-2">
              {employees.map(e => {
                const isOnline = employeeOnlineIds.has(e.id);
                return (
                  <button key={e.id} onClick={() => setChatEmployee(e)}
                    className="flex flex-col items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-teal-50 dark:hover:bg-teal-900/20 border border-slate-200 dark:border-slate-700 hover:border-teal-400 transition-all text-center relative">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center text-sm font-bold text-teal-700 dark:text-teal-400">{e.name.charAt(0)}</div>
                      <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-800 ${isOnline ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{e.name}</p>
                      <p className="text-[10px] text-slate-400">{e.position || 'Employee'}</p>
                      {e.dept && <p className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold">{e.dept}</p>}
                      <p className={`text-[10px] ${isOnline ? 'text-emerald-500' : 'text-slate-400'}`}>{isOnline ? 'Online' : 'Offline'}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center text-xs font-bold text-teal-700 dark:text-teal-400">{chatEmployee.name.charAt(0)}</div>
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-800 ${employeeOnlineIds.has(chatEmployee.id) ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                </div>
                <div>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{chatEmployee.name}</span>
                  <span className="text-[10px] ml-2">{employeeOnlineIds.has(chatEmployee.id)
                    ? <span className="text-emerald-500 flex items-center gap-1 inline-flex"><Wifi size={10} /> Online</span>
                    : <span className="text-slate-400 flex items-center gap-1 inline-flex"><WifiOff size={10} /> Offline</span>
                  }</span>
                </div>
              </div>
              <button onClick={() => setChatEmployee(null)} className="text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">Switch Employee</button>
            </div>

            <Card>
              <div className="flex flex-col h-[calc(100vh-16rem)]">
                <div className="flex-1 overflow-y-auto space-y-3 pr-2 mb-3 custom-scrollbar">
                  {chatMessages.length === 0 && (
                    <div className="text-center py-12">
                      <MessageSquare size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                      <p className="text-sm text-slate-400 italic">No messages yet. Start the coaching conversation.</p>
                    </div>
                  )}
                  {chatMessages.map((msg: any) => {
                    const isManager = msg.sender_role === 'Manager';
                    const isSystem = msg.sender_role === 'System';
                    const repliedMsg = msg.reply_to ? chatMessages.find((m: any) => m.id === msg.reply_to) : null;

                    if (isSystem) {
                      return (
                        <div key={msg.id} className="flex justify-center">
                          <div className="max-w-[85%] rounded-xl px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">{msg.message}</p>
                            {msg.action_type === 'goal_update' && msg.action_status === 'pending' && (
                              <div className="flex items-center gap-2 mt-2">
                                <button onClick={() => handleGoalAction(msg.id, 'approved')}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold hover:bg-emerald-200 transition-colors">
                                  <ThumbsUpIcon size={12} /> Approve
                                </button>
                                <button onClick={() => handleGoalAction(msg.id, 'rejected')}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-bold hover:bg-red-200 transition-colors">
                                  <ThumbsDown size={12} /> Reject
                                </button>
                              </div>
                            )}
                            {msg.action_status === 'approved' && (
                              <p className="text-[10px] text-emerald-600 font-bold mt-2 flex items-center gap-1"><CheckCircle2 size={10} /> Approved</p>
                            )}
                            {msg.action_status === 'rejected' && (
                              <p className="text-[10px] text-red-600 font-bold mt-2 flex items-center gap-1"><AlertCircle size={10} /> Rejected</p>
                            )}
                            <p className="text-[9px] text-amber-400 mt-1">{msg.created_at ? new Date(msg.created_at).toLocaleString() : ''}</p>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={msg.id} className={`flex ${isManager ? 'justify-end' : 'justify-start'} group`}>
                        {!isManager && (
                          <button onClick={() => setReplyTo(msg)} className="opacity-0 group-hover:opacity-100 mr-1 mt-1 text-slate-400 hover:text-teal-500 transition-all" title="Reply">
                            <Reply size={14} />
                          </button>
                        )}
                        <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${isManager
                          ? 'bg-teal-deep text-white rounded-br-md'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-bl-md'
                        }`}>
                          {repliedMsg && (
                            <div className={`text-[10px] mb-1.5 px-2 py-1 rounded-lg border-l-2 ${
                              isManager ? 'bg-teal-700/30 border-teal-300 text-teal-200' : 'bg-slate-200 dark:bg-slate-700 border-slate-400 text-slate-500'
                            }`}>
                              <span className="font-bold">{repliedMsg.sender_name || repliedMsg.sender_role}: </span>
                              {(repliedMsg.message || '').substring(0, 60)}{repliedMsg.message?.length > 60 ? '...' : ''}
                            </div>
                          )}
                          <p className={`text-[10px] font-bold mb-1 ${isManager ? 'text-teal-200' : 'text-slate-400'}`}>
                            {msg.sender_name || msg.sender_role} · {msg.created_at ? new Date(msg.created_at).toLocaleString() : ''}
                          </p>
                          <p className="text-sm leading-relaxed">{msg.message}</p>
                          <div className="flex items-center justify-end gap-1 mt-1">
                            {statusIcon(msg.status, msg.sender_role)}
                          </div>
                        </div>
                        {isManager && (
                          <button onClick={() => setReplyTo(msg)} className="opacity-0 group-hover:opacity-100 ml-1 mt-1 text-slate-400 hover:text-teal-500 transition-all" title="Reply">
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
                    <button onClick={() => setReplyTo(null)} className="text-slate-400 hover:text-red-400"><X size={12} /></button>
                  </div>
                )}

                <div className="flex gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                  <input type="text" value={chatInput} onChange={e => { setChatInput(e.target.value); handleManagerTyping(); }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                    placeholder="Type your coaching message..."
                    className="flex-1 p-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-black rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-green/50" />
                  <button onClick={sendChat} className="bg-teal-deep text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-teal-green transition-colors flex items-center gap-1.5">
                    <Send size={16} /> Send
                  </button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </motion.div>
    );
  }

  /* ─── ADD ENTRY VIEW ─── */
  if (view === 'addEntry') {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => setView('dashboard')} className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-teal-deep dark:hover:text-teal-green transition-colors"><ArrowLeft size={18} /> Back</button>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center"><Plus size={18} className="text-teal-600" /></div>
            <div>
              <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">New Coaching Entry</h2>
              <p className="text-xs text-slate-400">Record observation, feedback, or coaching session</p>
            </div>
          </div>
        </div>
        <Card>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); handleSubmit(); }}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employee *</label>
                <SearchableSelect
                  options={employees.map(e => ({ value: String(e.id), label: e.name }))}
                  value={form.employee_id}
                  onChange={v => setForm({ ...form, employee_id: v })}
                  placeholder="Select Employee..."
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Category</label>
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={inp}>
                  <option value="">Select Category...</option>
                  <option value="achievement">Achievement / Positive Behavior</option>
                  <option value="intervention">Intervention / Area for Improvement</option>
                  <option value="coaching">Coaching Session</option>
                  <option value="attendance">Attendance Concern</option>
                  <option value="technical">Technical Skills Gap</option>
                  <option value="communication">Communication Issue</option>
                  <option value="leadership">Leadership Development</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Type</label>
              <div className="flex gap-4 dark:text-slate-300">
                <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" name="type" checked={form.is_positive} onChange={() => setForm({ ...form, is_positive: true })} /> Positive</label>
                <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" name="type" checked={!form.is_positive} onChange={() => setForm({ ...form, is_positive: false })} /> Constructive</label>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Observation / Notes *</label>
              <textarea rows={4} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={inp} placeholder="Describe the specific behavior, situation, or coaching discussion..."></textarea>
            </div>

            {/* Weakness Tags (for constructive entries) */}
            {!form.is_positive && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-2">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                  <span className="flex items-center gap-1"><Brain size={12} /> Identified Weaknesses (auto-recommends E-Learning)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {WEAKNESS_CATEGORIES.map(w => {
                    const selected = form.weakness_tags.split(',').map(t => t.trim()).includes(w);
                    return (
                      <button key={w} type="button"
                        onClick={() => {
                          const tags = form.weakness_tags.split(',').map(t => t.trim()).filter(Boolean);
                          if (selected) setForm({ ...form, weakness_tags: tags.filter(t => t !== w).join(',') });
                          else setForm({ ...form, weakness_tags: [...tags, w].join(',') });
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${selected
                          ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-700'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 hover:border-red-300'
                        }`}>
                        {w}
                      </button>
                    );
                  })}
                </div>
                {form.weakness_tags && (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
                    <Lightbulb size={16} className="text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      <span className="font-bold">E-Learning Auto-Recommendation:</span> When saved, matching e-learning courses will be automatically recommended to this employee based on the identified weaknesses. This helps address skill gaps through training rather than punitive action.
                    </p>
                  </div>
                )}
              </motion.div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button type="button" onClick={() => setView('dashboard')} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">Cancel</button>
              <button type="submit" className="bg-teal-deep text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-teal-green transition-colors">Save Entry</button>
            </div>
          </form>
        </Card>
      </motion.div>
    );
  }

  /* ─── E-LEARNING VIEW ─── */
  if (view === 'elearning') {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => setView('dashboard')} className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-teal-deep dark:hover:text-teal-green transition-colors"><ArrowLeft size={18} /> Back</button>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center"><GraduationCap size={18} className="text-purple-600" /></div>
            <div>
              <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">E-Learning Center</h2>
              <p className="text-xs text-slate-400">Recommend courses to address weaknesses — help them grow, not resign</p>
            </div>
          </div>
        </div>

        {/* Available Courses */}
        <div className="mb-5">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2"><BookOpen size={16} /> Available Courses</h3>
          <div className="grid grid-cols-2 gap-3">
            {courses.map((c: any) => (
              <Card key={c.id}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">{c.title}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">{c.description}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">{c.category}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">{c.difficulty}</span>
                      <span className="text-[10px] text-slate-400"><Clock size={10} className="inline mr-0.5" />{c.duration_hours}h</span>
                    </div>
                    {c.weakness_tags && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {c.weakness_tags.split(',').map((t: string) => (
                          <span key={t} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-red-500">{t.trim()}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Recommend Course Button */}
        <div className="mb-5">
          <button onClick={() => setShowRecForm(!showRecForm)} className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-purple-700 transition-colors">
            {showRecForm ? <><X size={16} /> Close</> : <><Plus size={16} /> Recommend Course to Employee</>}
          </button>
        </div>

        {showRecForm && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
            <Card>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">Recommend E-Learning</h3>
              <form className="space-y-3" onSubmit={e => { e.preventDefault(); handleRecommend(); }}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Employee *</label>
                    <SearchableSelect
                      options={employees.map(e => ({ value: String(e.id), label: e.name }))}
                      value={recForm.employee_id}
                      onChange={v => setRecForm({ ...recForm, employee_id: v })}
                      placeholder="Select Employee..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Course *</label>
                    <select value={recForm.course_title} onChange={e => setRecForm({ ...recForm, course_title: e.target.value })} className={inp}>
                      <option value="">Select Course...</option>
                      {courses.map((c: any) => <option key={c.id} value={c.title}>{c.title}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Weakness Area</label>
                    <select value={recForm.weakness} onChange={e => setRecForm({ ...recForm, weakness: e.target.value })} className={inp}>
                      <option value="">Select Weakness...</option>
                      {WEAKNESS_CATEGORIES.map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Reason / Notes</label>
                    <input type="text" value={recForm.reason} onChange={e => setRecForm({ ...recForm, reason: e.target.value })} className={inp} placeholder="Why this course?" />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="submit" className="bg-purple-600 text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-purple-700 transition-colors">Recommend</button>
                </div>
              </form>
            </Card>
          </motion.div>
        )}

        {/* Existing Recommendations */}
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2"><Target size={16} /> Active Recommendations</h3>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead><tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="py-2.5 px-3 text-[10px] font-bold uppercase text-slate-500">Employee</th>
                <th className="py-2.5 px-3 text-[10px] font-bold uppercase text-slate-500">Course</th>
                <th className="py-2.5 px-3 text-[10px] font-bold uppercase text-slate-500">Weakness</th>
                <th className="py-2.5 px-3 text-[10px] font-bold uppercase text-slate-500">Reason</th>
                <th className="py-2.5 px-3 text-[10px] font-bold uppercase text-slate-500">Status</th>
                <th className="py-2.5 px-3 text-[10px] font-bold uppercase text-slate-500">By</th>
                <th className="py-2.5 px-3 text-[10px] font-bold uppercase text-slate-500">Date</th>
                <th className="py-2.5 px-3 text-[10px] font-bold uppercase text-slate-500 text-right">Actions</th>
              </tr></thead>
              <tbody>
                {recommendations.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-sm text-slate-400 italic">No recommendations yet.</td></tr>}
                {recommendations.map((r: any) => (
                  <tr key={r.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900">
                    <td className="py-2 px-3 text-xs font-medium text-slate-700 dark:text-slate-200">
                      <div className="min-w-0">
                        <span className="truncate max-w-[220px]" title={r.employee_name || `#${r.employee_id}`}>
                          {r.employee_name || `#${r.employee_id}`}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-xs text-slate-600 dark:text-slate-300">
                      <div className="min-w-0">
                        <span className="truncate max-w-[220px]" title={r.course_title}>{r.course_title}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600">{r.weakness || '—'}</span></td>
                    <td className="py-2 px-3 text-xs text-slate-500 max-w-[200px] truncate">{r.reason || '—'}</td>
                    <td className="py-2 px-3">
                      <select value={r.status} onChange={e => updateRecStatus(r.id, e.target.value)}
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border cursor-pointer ${
                          r.status === 'Completed' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 border-emerald-200 dark:border-emerald-800'
                          : r.status === 'In Progress' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 border-blue-200 dark:border-blue-800'
                          : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 border-amber-200 dark:border-amber-800'
                        }`}>
                        <option value="Recommended">Recommended</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Completed">Completed</option>
                        <option value="Declined">Declined</option>
                      </select>
                    </td>
                    <td className="py-2 px-3 text-xs text-slate-400">{r.recommended_by || '—'}</td>
                    <td className="py-2 px-3 text-xs text-slate-400">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                    <td className="py-2 px-3 text-right">
                      <button onClick={async () => { if (confirm('Delete?')) { try { await fetch(`/api/elearning_recommendations/${r.id}`, { method: 'DELETE', headers: getAuthHeaders() }); window.notify?.('Recommendation deleted', 'success'); fetchRecommendations(); } catch { window.notify?.('Failed to delete', 'error'); } } }}
                        className="text-red-400 hover:text-red-600 p-1"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </motion.div>
    );
  }

  /* ─── WEAKNESS ANALYSIS VIEW ─── */
  if (view === 'weaknessAnalysis') {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => setView('dashboard')} className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-teal-deep dark:hover:text-teal-green transition-colors"><ArrowLeft size={18} /> Back</button>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center"><Brain size={18} className="text-orange-600" /></div>
            <div>
              <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">Weakness Analysis & Recommendations</h2>
              <p className="text-xs text-slate-400">Identify skill gaps and recommend targeted e-learning instead of termination</p>
            </div>
          </div>
        </div>

        {/* Employee Filter */}
        <div className="mb-4">
          <SearchableSelect
            options={employees.map(e => ({ value: String(e.id), label: e.name }))}
            value={analysisEmployee}
            onChange={v => setAnalysisEmployee(v)}
            placeholder="All Employees"
            allowEmpty
            emptyLabel="All Employees"
            className="max-w-xs"
          />
        </div>

        {/* Guidance Banner */}
        <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 mb-5">
          <Lightbulb size={20} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-amber-800 dark:text-amber-300 mb-1">Redirect to E-Learning, Not Resignation</h4>
            <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
              When employees are underperforming, the first step should be <strong>identifying their specific weaknesses</strong> and <strong>providing targeted training</strong> through the E-Learning system.
              This approach develops talent, reduces turnover costs, and maintains team morale. Use this analysis to match weaknesses with courses.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-5">
          {/* Weakness Frequency */}
          <Card>
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-3 flex items-center gap-1"><BarChart3 size={14} /> Weakness Frequency</h3>
            {employeeWeaknesses.length === 0 ? (
              <p className="text-sm text-slate-400 italic py-6 text-center">No weaknesses identified from coaching logs yet.</p>
            ) : (
              <div className="space-y-2">
                {employeeWeaknesses.map(([weakness, count]) => {
                  const max = employeeWeaknesses[0][1] as number;
                  return (
                    <div key={weakness} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200 w-32 shrink-0">{weakness}</span>
                      <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-3">
                        <div className="bg-red-500 h-3 rounded-full transition-all" style={{ width: `${(count / max) * 100}%` }}></div>
                      </div>
                      <span className="text-xs font-bold text-red-500 w-6 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Recommended Actions */}
          <Card>
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-3 flex items-center gap-1"><GraduationCap size={14} /> Suggested E-Learning Courses</h3>
            {employeeWeaknesses.length === 0 ? (
              <p className="text-sm text-slate-400 italic py-6 text-center">Add constructive coaching entries with weakness tags to get suggestions.</p>
            ) : (
              <div className="space-y-2">
                {employeeWeaknesses.map(([weakness]) => {
                  const matchedCourses = courses.filter(c => (c.weakness_tags || '').toLowerCase().includes((weakness as string).toLowerCase()));
                  return matchedCourses.map(c => (
                    <div key={`${weakness}-${c.id}`} className="flex items-center gap-3 p-2 bg-purple-50 dark:bg-purple-900/10 rounded-lg border border-purple-100 dark:border-purple-900/30">
                      <BookOpen size={14} className="text-purple-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{c.title}</p>
                        <p className="text-[10px] text-slate-400">For: <span className="text-red-500 font-bold">{weakness}</span> · {c.difficulty} · {c.duration_hours}h</p>
                      </div>
                    </div>
                  ));
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Existing Recommendations for this employee */}
        <Card>
          <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-3">Active Recommendations {analysisEmployee ? `for ${employees.find(e => e.id === parseInt(analysisEmployee))?.name || ''}` : '(All)'}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead><tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="py-2 px-3 text-[10px] font-bold uppercase text-slate-500">Employee</th>
                <th className="py-2 px-3 text-[10px] font-bold uppercase text-slate-500">Course</th>
                <th className="py-2 px-3 text-[10px] font-bold uppercase text-slate-500">Weakness</th>
                <th className="py-2 px-3 text-[10px] font-bold uppercase text-slate-500">Status</th>
              </tr></thead>
              <tbody>
                {employeeRecs.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-sm text-slate-400 italic">No recommendations</td></tr>}
                {employeeRecs.map((r: any) => (
                  <tr key={r.id} className="border-b border-slate-50 dark:border-slate-800/50">
                    <td className="py-2 px-3 text-xs font-medium text-slate-700 dark:text-slate-200">
                      <div className="min-w-0">
                        <span className="truncate max-w-[220px]" title={r.employee_name || `#${r.employee_id}`}>
                          {r.employee_name || `#${r.employee_id}`}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-xs text-slate-600 dark:text-slate-300">{r.course_title}</td>
                    <td className="py-2 px-3"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600">{r.weakness || '—'}</span></td>
                    <td className="py-2 px-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        r.status === 'Completed' ? 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600'
                        : r.status === 'In Progress' ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-600'
                        : 'bg-amber-100 dark:bg-amber-900/20 text-amber-600'
                      }`}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </motion.div>
    );
  }

  /* ─── MAIN DASHBOARD VIEW ─── */
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex justify-between items-end mb-4">
        <SectionHeader title="Monitoring & Coaching Journal" subtitle="Daily observations, feedback loop, chat & e-learning" />
        <div className="flex gap-2">
          <button onClick={() => exportToCSV(logs, 'coaching_logs')} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><Download size={16} /> CSV</button>
          <button onClick={() => setView('addEntry')} className="flex items-center gap-2 bg-teal-deep text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-teal-green transition-colors"><Plus size={16} /> Add Entry</button>
        </div>
      </div>

      {/* ACTION CARDS */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <button onClick={() => setView('chat')} className="text-left">
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center"><MessageSquare size={20} className="text-teal-600" /></div>
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Q&A Chat</p>
                <p className="text-[10px] text-slate-400">Coach employees in real-time</p>
              </div>
            </div>
          </Card>
        </button>
        <button onClick={() => setView('elearning')} className="text-left">
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center"><GraduationCap size={20} className="text-purple-600" /></div>
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">E-Learning</p>
                <p className="text-[10px] text-slate-400">{courses.length} courses · {recommendations.length} recommended</p>
              </div>
            </div>
          </Card>
        </button>
        <button onClick={() => setView('weaknessAnalysis')} className="text-left">
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center"><Brain size={20} className="text-orange-600" /></div>
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Weakness Analysis</p>
                <p className="text-[10px] text-slate-400">Identify gaps & recommend training</p>
              </div>
            </div>
          </Card>
        </button>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Total Entries</p>
              <p className="text-2xl font-black text-teal-deep dark:text-teal-green">{stats.total}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-emerald-500 font-bold">{stats.positive} positive</p>
              <p className="text-[10px] text-amber-500 font-bold">{stats.constructive} constructive</p>
              <p className="text-[10px] text-slate-400">{stats.uniqueEmployees} employees</p>
            </div>
          </div>
        </Card>
      </div>

      {/* SEARCH */}
      <div className="mb-4">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input type="text" placeholder="Search logs..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-green/50 placeholder:text-slate-400" />
        </div>
      </div>

      {/* COACHING TIMELINE */}
      <Card>
        <div className="space-y-6">
          {filteredLogs.map((l: any) => (
            <div key={l.id} className="flex gap-4 relative">
              <div className="flex flex-col items-center">
                <div className={`p-2 rounded-full ${l.is_positive ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'}`}>
                  {l.is_positive ? <TrendingUp size={16} /> : <AlertTriangle size={16} />}
                </div>
                <div className="w-px h-full bg-slate-100 dark:bg-slate-800 mt-2"></div>
              </div>
              <div className="pb-6 flex-1">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 dark:text-slate-100 truncate max-w-[220px]" title={l.employee_name || `Employee #${l.employee_id}`}>
                      {l.employee_name || `Employee #${l.employee_id}`}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">{l.created_at ? new Date(l.created_at).toLocaleDateString() : ''}</span>
                    {!l.is_positive && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600">CONSTRUCTIVE</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setChatEmployee(employees.find(e => e.id === l.employee_id) || null); setView('chat'); }}
                      className="text-teal-500 hover:text-teal-700 p-1" title="Open Chat"><MessageSquare size={13} /></button>
                    <button onClick={() => handleDelete(l.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
                  </div>
                </div>
                <p className="text-xs font-bold text-teal-green uppercase tracking-widest mb-1">{l.category}</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">{l.notes}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 italic">Logged by: {l.logged_by}</p>
              </div>
            </div>
          ))}
          {filteredLogs.length === 0 && <p className="text-center text-slate-400 py-10">No coaching logs found.</p>}
        </div>
      </Card>
    </motion.div>
  );
};
