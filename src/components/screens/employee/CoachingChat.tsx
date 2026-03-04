import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  MessageSquare, Send, ArrowLeft, GraduationCap, BookOpen, Clock, CheckCircle2,
  AlertTriangle, Lightbulb, Brain, ClipboardList, ThumbsUp, AlertCircle, Calendar
} from 'lucide-react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';
import { getAuthHeaders } from '../../../utils/csv';

type ViewMode = 'main' | 'chat' | 'courses' | 'journal';

export const CoachingChat = () => {
  const [view, setView] = useState<ViewMode>('main');
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [coachingLogs, setCoachingLogs] = useState<any[]>([]);

  const user = JSON.parse(localStorage.getItem('talentflow_user') || '{}');
  const employeeId = user.employee_id;

  useEffect(() => { if (employeeId) { fetchChat(); fetchRecs(); fetchCourses(); fetchCoachingLogs(); } }, [employeeId]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

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
    if (!employeeId) return;
    try {
      const res = await fetch('/api/coaching_logs', { headers: getAuthHeaders() });
      const data = await res.json();
      const myLogs = (Array.isArray(data) ? data : []).filter((l: any) => l.employee_id === employeeId || l.employee_id === Number(employeeId));
      setCoachingLogs(myLogs);
    } catch { setCoachingLogs([]); }
  };

  const sendMessage = async () => {
    if (!chatInput.trim() || !employeeId) return;
    try {
      await fetch('/api/coaching_chats', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ employee_id: employeeId, sender_role: 'Employee', sender_name: user.username || 'Employee', message: chatInput.trim() }),
      });
      setChatInput('');
      window.notify?.('Message sent', 'success');
      fetchChat();
    } catch { window.notify?.('Failed to send message', 'error'); }
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
        <div className="grid grid-cols-3 gap-4 mb-5">
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
              <p className="text-[10px] text-slate-400">Communicate with your manager about your development</p>
            </div>
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
                return (
                  <div key={msg.id} className={`flex ${isEmployee ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${isEmployee
                      ? 'bg-teal-deep text-white rounded-br-md'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-bl-md'
                    }`}>
                      <p className={`text-[10px] font-bold mb-1 ${isEmployee ? 'text-teal-200' : 'text-slate-400'}`}>
                        {msg.sender_name || msg.sender_role} · {msg.created_at ? new Date(msg.created_at).toLocaleString() : ''}
                      </p>
                      <p className="text-sm leading-relaxed">{msg.message}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            <div className="flex gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
              <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Type your message to your manager..."
                className="flex-1 p-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-black rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-green/50" />
              <button onClick={sendMessage} className="bg-teal-deep text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-teal-green transition-colors flex items-center gap-1.5">
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
                        <select value={r.status} onChange={e => updateRecStatus(r.id, e.target.value)}
                          className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg border cursor-pointer ${
                            r.status === 'In Progress' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 border-blue-200 dark:border-blue-800'
                            : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 border-amber-200 dark:border-amber-800'
                          }`}>
                          <option value="Recommended">Recommended</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Completed">Completed</option>
                        </select>
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
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <SectionHeader title="Coaching & Development" subtitle="Chat with your manager, access e-learning, and view your coaching journal" />

      <div className="grid grid-cols-3 gap-4 mt-4 mb-5">
        <button onClick={() => setView('chat')} className="text-left">
          <Card>
            <div className="flex items-center gap-4 p-2">
              <div className="w-12 h-12 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center"><MessageSquare size={24} className="text-teal-600" /></div>
              <div>
                <p className="text-base font-bold text-slate-800 dark:text-slate-100">Coaching Chat</p>
                <p className="text-xs text-slate-400">Discuss goals, ask questions & get feedback</p>
                {chatMessages.length > 0 && <p className="text-[10px] text-teal-500 font-bold mt-1">{chatMessages.length} messages</p>}
              </div>
            </div>
          </Card>
        </button>
        <button onClick={() => setView('courses')} className="text-left">
          <Card>
            <div className="flex items-center gap-4 p-2">
              <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center"><GraduationCap size={24} className="text-purple-600" /></div>
              <div>
                <p className="text-base font-bold text-slate-800 dark:text-slate-100">E-Learning Courses</p>
                <p className="text-xs text-slate-400">Recommended training & skill development</p>
                {activeRecs.length > 0 && <p className="text-[10px] text-amber-500 font-bold mt-1">{activeRecs.length} pending recommendations</p>}
              </div>
            </div>
          </Card>
        </button>
        <button onClick={() => setView('journal')} className="text-left">
          <Card>
            <div className="flex items-center gap-4 p-2">
              <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center"><ClipboardList size={24} className="text-amber-600" /></div>
              <div>
                <p className="text-base font-bold text-slate-800 dark:text-slate-100">Coaching Journal</p>
                <p className="text-xs text-slate-400">Monitoring & coaching observations</p>
                {coachingLogs.length > 0 && <p className="text-[10px] text-amber-500 font-bold mt-1">{coachingLogs.length} entries</p>}
              </div>
            </div>
          </Card>
        </button>
      </div>

      {/* Quick recommendations preview */}
      {activeRecs.length > 0 && (
        <div className="mb-5">
          <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 mb-3">
            <Brain size={16} className="text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-amber-800 dark:text-amber-300">You have {activeRecs.length} recommended course{activeRecs.length > 1 ? 's' : ''}</p>
              <p className="text-[10px] text-amber-700 dark:text-amber-400">Your manager has identified areas for growth. Complete these courses to demonstrate your commitment to improvement and professional development.</p>
            </div>
          </div>
          <div className="space-y-2">
            {activeRecs.slice(0, 3).map((r: any) => (
              <Card key={r.id}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <BookOpen size={16} className="text-purple-500" />
                    <div>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{r.course_title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {r.weakness && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-red-500">Weakness: {r.weakness}</span>}
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          r.status === 'In Progress' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-500' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-500'
                        }`}>{r.status}</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setView('courses')} className="text-xs font-bold text-purple-500 hover:text-purple-700">View →</button>
                </div>
              </Card>
            ))}
            {activeRecs.length > 3 && (
              <button onClick={() => setView('courses')} className="text-xs font-bold text-purple-500 hover:text-purple-700 ml-2">+ {activeRecs.length - 3} more recommendations</button>
            )}
          </div>
        </div>
      )}

      {/* Recent chat messages preview */}
      {chatMessages.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2"><MessageSquare size={14} /> Recent Messages</h3>
          <Card>
            <div className="space-y-2">
              {chatMessages.slice(-3).map((msg: any) => {
                const isEmployee = msg.sender_role === 'Employee';
                return (
                  <div key={msg.id} className={`flex ${isEmployee ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] rounded-xl px-3 py-2 ${isEmployee
                      ? 'bg-teal-deep/10 text-teal-deep dark:text-teal-green'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                    }`}>
                      <p className="text-[10px] font-bold text-slate-400 mb-0.5">{msg.sender_name} · {msg.created_at ? new Date(msg.created_at).toLocaleString() : ''}</p>
                      <p className="text-xs">{msg.message}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <button onClick={() => setView('chat')} className="text-xs font-bold text-teal-500 hover:text-teal-700 mt-3 block">Open Full Chat →</button>
          </Card>
        </div>
      )}
    </motion.div>
  );
};
