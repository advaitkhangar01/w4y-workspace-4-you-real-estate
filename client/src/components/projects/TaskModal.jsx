// client/src/components/projects/TaskModal.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { formatIST, formatDateIST, timeAgo, isTaskOverdue, getTaskOverdueDays } from '../../utils/time';
import toast from 'react-hot-toast';

export default function TaskModal({ taskId, isOpen, onClose }) {
  const { user } = useAuth();
  const [task, setTask] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const messagesEndRef = useRef(null);

  const isPrivileged = user?.role === 'admin' || user?.role === 'design_head' || user?.role === 'accounts' || user?.role === 'back_office' || user?.role === 'project_head';
  const isCreatorOrAdmin = user?.role === 'admin' || (task && task.created_by === user?.id);

  const fetchThread = useCallback(async () => {
    if (!taskId) return;
    try {
      setLoading(true);
      const [threadRes, usersRes] = await Promise.allSettled([
        api.get(`/tasks/${taskId}`),
        api.get('/auth/users')
      ]);

      if (threadRes.status === 'fulfilled') {
        setTask(threadRes.value.data.task);
        setParticipants(threadRes.value.data.participants || []);
        setMessages(threadRes.value.data.messages || []);
        setDescDraft(threadRes.value.data.task?.description || '');
      } else {
        toast.error('Failed to load task discussion');
      }

      if (usersRes.status === 'fulfilled') {
        setUsersList(usersRes.value.data.users || []);
      }
    } catch {
      toast.error('Failed to load task details');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (isOpen && taskId) {
      fetchThread();
    }
  }, [isOpen, taskId, fetchThread]);

  // Background polling for new chat messages while modal is open (every 8s)
  useEffect(() => {
    if (!isOpen || !taskId) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await api.get(`/tasks/${taskId}`);
        if (data?.messages) setMessages(data.messages);
        if (data?.participants) setParticipants(data.participants);
        if (data?.task) {
          setTask(prev => ({
            ...prev,
            status: data.task.status,
            priority: data.task.priority,
            start_date: data.task.start_date,
            due_date: data.task.due_date,
            assigned_to: data.task.assigned_to,
            assigned_to_name: data.task.assigned_to_name,
            completed_at: data.task.completed_at,
            reassigned_at: data.task.reassigned_at
          }));
        }
      } catch {
        // Silent poll error
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [isOpen, taskId]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      setEditingDesc(false);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSendMessage(e) {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    const msgText = newMessage.trim();
    setNewMessage(''); // Clear input immediately for UX

    // Optimistic Update
    const tempId = Date.now();
    const optimisticMsg = {
      id: tempId,
      sender_id: user?.id,
      sender_name: user?.name,
      sender_username: user?.username,
      sender_role: user?.role,
      message: msgText,
      created_at: new Date().toISOString(),
      is_optimistic: true
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setSending(true);

    try {
      const { data } = await api.post(`/tasks/${taskId}/messages`, { message: msgText });
      // Replace optimistic message with the real one
      setMessages((prev) => prev.map((m) => (m.id === tempId ? data.message : m)));
      
      // Update participants list dynamically if user was added
      const isParticipant = participants.some(p => p.user_id === user?.id);
      if (!isParticipant && user) {
        setParticipants(prev => [...prev, { user_id: user.id, name: user.name, username: user.username, role: user.role }]);
      }
    } catch {
      // Rollback
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setNewMessage(msgText); // Restore text
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  }

  async function handleStatusChange(newStatus) {
    try {
      const { data } = await api.patch(`/tasks/${taskId}`, { status: newStatus });
      setTask(prev => ({ 
        ...prev, 
        status: data.task.status,
        completed_at: data.task.completed_at,
        reassigned_at: data.task.reassigned_at
      }));
      toast.success('Task status updated');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update status');
    }
  }

  async function handleAssigneeChange(newAssignee) {
    try {
      const val = newAssignee ? parseInt(newAssignee, 10) : null;
      const { data } = await api.patch(`/tasks/${taskId}`, { assigned_to: val });
      const foundUser = usersList.find(u => u.id === val);
      setTask(prev => ({ 
        ...prev, 
        assigned_to: data.task.assigned_to,
        assigned_to_name: foundUser ? foundUser.name : 'Unassigned'
      }));
      toast.success('Task reassigned');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reassign task');
    }
  }

  async function handleStartDateChange(newDate) {
    try {
      const { data } = await api.patch(`/tasks/${taskId}`, { start_date: newDate || null });
      setTask(prev => ({ ...prev, start_date: data.task.start_date }));
      toast.success('Start date updated');
    } catch {
      toast.error('Failed to update start date');
    }
  }

  async function handlePriorityChange(newPriority) {
    try {
      const { data } = await api.patch(`/tasks/${taskId}`, { priority: newPriority });
      setTask(prev => ({ ...prev, priority: data.task.priority }));
      toast.success('Priority updated');
    } catch {
      toast.error('Failed to update priority');
    }
  }

  async function handleDueDateChange(newDate) {
    try {
      const { data } = await api.patch(`/tasks/${taskId}`, { due_date: newDate || null });
      setTask(prev => ({ ...prev, due_date: data.task.due_date }));
      toast.success('Due date updated');
    } catch {
      toast.error('Failed to update due date');
    }
  }

  async function handleSaveDescription() {
    try {
      const { data } = await api.patch(`/tasks/${taskId}`, { description: descDraft });
      setTask(prev => ({ ...prev, description: data.task.description }));
      setEditingDesc(false);
      toast.success('Description saved');
    } catch {
      toast.error('Failed to save description');
    }
  }

  async function handleDeleteTask() {
    if (!window.confirm(`Are you sure you want to delete this task?`)) return;
    try {
      await api.delete(`/tasks/${taskId}`);
      toast.success('Task deleted successfully');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete task');
    }
  }

  // Safe formatting of message with @mentions
  function renderMessageContent(text) {
    if (!text) return null;
    const parts = text.split(/(@\w+)/g);
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        return (
          <span key={index} className="font-bold underline decoration-[#E05A1E]/40 text-[#E05A1E]">
            {part}
          </span>
        );
      }
      return part;
    });
  }

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col w-full max-w-2xl h-[85vh] overflow-hidden transition-all transform scale-100">
        
        {/* Header */}
        {loading ? (
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div className="space-y-2">
              <div className="skeleton h-6 w-48 rounded" />
              <div className="skeleton h-4 w-32 rounded" />
            </div>
            <div className="skeleton h-8 w-8 rounded-full" />
          </div>
        ) : (
          <div className="p-6 border-b border-slate-100/80 bg-slate-50/50 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-black text-[#1A1A1A] tracking-tight">{task?.title}</h2>
                <div className="flex flex-col gap-0.5 mt-1">
                  <p className="text-xs text-muted font-medium">Project: <span className="font-bold text-slate-700">{task?.project_name}</span></p>
                  <p className="text-[10px] text-muted font-medium flex items-center gap-1.5">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Created on {formatIST(task?.created_at)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isCreatorOrAdmin && (
                  <button 
                    onClick={handleDeleteTask}
                    className="w-8 h-8 rounded-full bg-red-50 border border-red-100 text-red-500 hover:text-red-700 hover:bg-red-100 hover:shadow-md transition-all flex items-center justify-center text-xs"
                    title="Delete Task"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>
                    </svg>
                  </button>
                )}
                <button 
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-white border border-slate-100 text-slate-400 hover:text-slate-600 hover:shadow-md transition-all flex items-center justify-center text-sm"
                >
                  ✕
                </button>
              </div>
            </div>
            
            <div className="flex items-center gap-2.5 flex-wrap mt-2">
              {/* Assignee Control */}
              <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                <span className="text-[10px] text-muted font-bold uppercase tracking-tight">Assignee:</span>
                {isCreatorOrAdmin ? (
                  <select
                    className="bg-transparent text-xs font-bold text-[#1A1A1A] focus:outline-none border-none p-0 max-w-[130px] truncate"
                    value={task?.assigned_to || ''}
                    onChange={(e) => handleAssigneeChange(e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {usersList.map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs font-bold text-[#1A1A1A]">
                    {task?.assigned_to_name || 'Unassigned'}
                  </span>
                )}
              </div>

              {/* Status Select/Badge */}
              <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                <span className="text-[10px] text-muted font-bold uppercase tracking-tight">Status:</span>
                <select
                  className="bg-transparent text-xs font-bold text-[#1A1A1A] focus:outline-none disabled:opacity-50"
                  value={task?.status}
                  disabled={user?.role !== 'admin' && (task?.status === 'review' || task?.status === 'passed')}
                  onChange={(e) => handleStatusChange(e.target.value)}
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="review">Review</option>
                  {task?.status === 'done' && <option value="done">Done</option>}
                  {task?.status === 'passed' && <option value="passed">Passed</option>}
                </select>
              </div>

              {/* Start Date Control */}
              <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                <span className="text-[10px] text-muted font-bold uppercase tracking-tight">Start:</span>
                {isCreatorOrAdmin ? (
                  <input
                    type="date"
                    className="bg-transparent text-xs font-bold text-[#1A1A1A] focus:outline-none border-none p-0 w-[105px]"
                    value={task?.start_date ? task.start_date.substring(0, 10) : ''}
                    onChange={(e) => handleStartDateChange(e.target.value)}
                  />
                ) : (
                  <span className="text-xs font-bold text-[#1A1A1A]">
                    {formatDateIST(task?.start_date)}
                  </span>
                )}
              </div>

              {/* Due Date Control */}
              <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                <span className="text-[10px] text-muted font-bold uppercase tracking-tight">Due:</span>
                {isCreatorOrAdmin ? (
                  <input
                    type="date"
                    className="bg-transparent text-xs font-bold text-[#1A1A1A] focus:outline-none border-none p-0 w-[105px]"
                    value={task?.due_date ? task.due_date.substring(0, 10) : ''}
                    onChange={(e) => handleDueDateChange(e.target.value)}
                  />
                ) : (
                  <span className="text-xs font-bold text-[#1A1A1A]">
                    {task?.due_date ? formatDateIST(task.due_date) : 'None'}
                  </span>
                )}
              </div>

              {/* Priority Control */}
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${
                task?.priority === 'high' ? 'bg-red-50 border-red-200 text-red-700' :
                task?.priority === 'medium' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                'bg-blue-50 border-blue-200 text-blue-700'
              }`}>
                <span className="text-[10px] font-bold uppercase tracking-tight">Priority:</span>
                {isCreatorOrAdmin ? (
                  <select
                    className="bg-transparent text-xs font-bold focus:outline-none border-none p-0 pr-4"
                    value={task?.priority || 'medium'}
                    onChange={(e) => handlePriorityChange(e.target.value)}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                ) : (
                  <span className="text-xs font-bold uppercase">
                    {task?.priority || 'medium'}
                  </span>
                )}
              </div>

              {/* Overdue Warning */}
              {isTaskOverdue(task) && (
                <div className="flex items-center gap-1.5 bg-red-50 px-2 py-1 rounded-lg border border-red-200">
                  <span className="text-[10px] text-red-700 font-bold uppercase tracking-tight">⚠️ {getTaskOverdueDays(task)} Days Overdue</span>
                </div>
              )}

              {/* Completed Timestamp */}
              {task?.completed_at && (
                <div className="flex items-center gap-1.5 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                  <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-tight">Passed:</span>
                  <span className="text-xs font-bold text-emerald-600">
                    {formatIST(task.completed_at)}
                  </span>
                </div>
              )}

              {/* Admin Actions */}
              {user?.role === 'admin' && task?.status === 'review' && (
                <div className="flex items-center gap-2 ml-auto">
                  <button 
                    onClick={() => handleStatusChange('passed')}
                    className="px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-sm transition-all"
                  >
                    Pass Task
                  </button>
                  <button 
                    onClick={() => handleStatusChange('in_progress')}
                    className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-sm transition-all"
                  >
                    Reassign
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Task Description & Scope */}
        {!loading && (
          <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-100 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-muted uppercase tracking-wider">Task Scope / Description</span>
              {isCreatorOrAdmin && !editingDesc && (
                <button 
                  onClick={() => { setDescDraft(task?.description || ''); setEditingDesc(true); }}
                  className="text-[10px] font-bold text-[#E05A1E] hover:underline"
                >
                  {task?.description ? '✎ Edit Scope' : '+ Add Description'}
                </button>
              )}
            </div>
            {editingDesc ? (
              <div className="space-y-2 mt-1">
                <textarea
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-[#E05A1E] bg-white leading-relaxed"
                  rows={2}
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  placeholder="Enter detailed task instructions or requirements..."
                />
                <div className="flex justify-end gap-2">
                  <button 
                    type="button" 
                    onClick={() => setEditingDesc(false)} 
                    className="text-[10px] font-bold text-slate-400 hover:text-slate-600 px-2 py-0.5"
                  >
                    Cancel
                  </button>
                  <button 
                    type="button" 
                    onClick={handleSaveDescription} 
                    className="text-[10px] font-bold bg-[#E05A1E] text-white px-3 py-1 rounded-lg shadow-sm hover:bg-[#C94E16]"
                  >
                    Save Scope
                  </button>
                </div>
              </div>
            ) : (
              task?.description ? (
                <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto">{task.description}</p>
              ) : (
                <p className="text-[11px] text-slate-400 italic">No description provided for this task.</p>
              )
            )}
          </div>
        )}

        {/* Participants Row */}
        {!loading && (
          <div className="px-6 py-2 bg-white border-b border-slate-100 flex items-center gap-2">
            <span className="text-[10px] font-black text-muted uppercase tracking-wider">Participants:</span>
            <div className="flex -space-x-2">
              {participants.map((p) => (
                <div 
                  key={p.user_id} 
                  className="w-6 h-6 rounded-full bg-slate-100 border border-white flex items-center justify-center cursor-pointer hover:z-10 hover:border-[#E05A1E] transition-all"
                  title={`${p.name} (${p.role})`}
                >
                  <span className="text-[10px] font-bold text-slate-600">
                    {p.name?.charAt(0)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Messages Thread */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/30 scrollbar-thin">
          {loading ? (
            <div className="space-y-4">
              <div className="flex gap-3"><div className="w-8 h-8 rounded-full skeleton" /><div className="skeleton h-12 w-48 rounded-xl" /></div>
              <div className="flex gap-3 justify-end"><div className="skeleton h-12 w-64 rounded-xl" /><div className="w-8 h-8 rounded-full skeleton" /></div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full opacity-40">
              <span className="text-3xl mb-2">💬</span>
              <p className="text-xs font-bold uppercase tracking-wider">No messages yet. Send a note!</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.sender_id === user?.id;
              return (
                <div key={msg.id} className={`flex items-start gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border ${
                    isMe ? 'bg-[rgba(224,90,30,0.1)] border-[rgba(224,90,30,0.2)] text-[#E05A1E]' : 'bg-slate-100 border-slate-200 text-slate-600'
                  } font-bold text-xs`}>
                    {msg.sender_name?.charAt(0) || '?'}
                  </div>
                  
                  <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[70%]`}>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-semibold text-[#1A1A1A]">{msg.sender_name || 'User'}</span>
                      <span className="text-[10px] text-muted opacity-60">{timeAgo(msg.created_at)}</span>
                    </div>
                    
                    <div className={`p-3 rounded-2xl text-sm ${
                      isMe 
                        ? 'bg-gradient-to-br from-[#E05A1E] to-[#C94E16] text-white shadow-md rounded-tr-none' 
                        : 'bg-white border border-slate-200/80 text-slate-800 shadow-sm rounded-tl-none'
                    } ${msg.is_optimistic ? 'opacity-70 animate-pulse' : ''} leading-relaxed break-words`}>
                      {renderMessageContent(msg.message)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Block */}
        <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-100 bg-white flex items-center gap-3">
          <input
            type="text"
            className="input flex-1 text-sm bg-slate-50 border border-slate-200/80 rounded-full px-4 py-3 focus:outline-none focus:border-[#E05A1E] focus:bg-white transition-all"
            placeholder={loading ? 'Loading...' : 'Write message... (use @name to mention)'}
            disabled={loading}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading || !newMessage.trim() || sending}
            className="w-10 h-10 rounded-full bg-[#E05A1E] hover:bg-[#C94E16] disabled:bg-slate-200 disabled:text-slate-400 text-white shadow-md flex items-center justify-center transition-all flex-shrink-0"
          >
            {sending ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="rotate-45 -translate-x-0.5">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            )}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
}
