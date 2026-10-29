// client/src/pages/TasksPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import TaskModal from '../components/projects/TaskModal';
import { formatIST, formatDateIST, getISODateIST, isTaskOverdue, getTaskOverdueDays } from '../utils/time';
import { exportTasksToPDF } from '../utils/taskPdfExport';

export default function TasksPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [kanbanData, setKanbanData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Create Task Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [viewMode, setViewMode] = useState('active'); // 'active', 'scheduled', or 'history'
  const [startDate, setStartDate] = useState(getISODateIST());
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Discussion Modal State
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Admin PDF Export State
  const [exportFromDate, setExportFromDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // 1st day of current month
    return d.toISOString().substring(0, 10);
  });
  const [exportToDate, setExportToDate] = useState(getISODateIST());
  const [exportStatus, setExportStatus] = useState('passed');
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  async function handleExportTasksPdf() {
    setIsExportingPdf(true);
    try {
      const params = new URLSearchParams();
      if (exportStatus) params.append('status', exportStatus);
      if (exportFromDate) params.append('from_date', exportFromDate);
      if (exportToDate) params.append('to_date', exportToDate);

      const res = await api.get(`/tasks/export/report?${params.toString()}`);
      const tasksToExport = res.data.tasks || [];

      if (tasksToExport.length === 0) {
        return toast.error('No tasks found matching the selected filter & date range');
      }

      exportTasksToPDF({
        tasks: tasksToExport,
        filters: {
          status: exportStatus,
          fromDate: exportFromDate,
          toDate: exportToDate
        },
        currentUser: user
      });

      toast.success(`Exported ${tasksToExport.length} tasks to PDF`);
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Failed to export tasks PDF');
    } finally {
      setIsExportingPdf(false);
    }
  }

  // Auto-open modal if taskId query param is present
  useEffect(() => {
    const paramTaskId = searchParams.get('taskId');
    if (paramTaskId) {
      const parsedId = parseInt(paramTaskId, 10);
      if (!isNaN(parsedId)) {
        setSelectedTaskId(parsedId);
        setIsModalOpen(true);
      }
    }
  }, [searchParams]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [projRes, usersRes, kanbanRes] = await Promise.all([
        api.get('/projects'),
        api.get('/auth/users'),
        api.get(`/tasks?view=${viewMode === 'history' ? 'history' : viewMode === 'scheduled' ? 'scheduled' : 'kanban'}`)
      ]);
      setProjects(projRes.data.projects || []);
      setUsers(usersRes.data.users || []);
      
      setKanbanData(kanbanRes.data.kanban || []);
    } catch {
      toast.error('Failed to load task resources');
    } finally {
      setLoading(false);
    }
  }, [viewMode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleCreateTask(e) {
    e.preventDefault();
    if (!title.trim() || !projectId) {
      return toast.error('Please provide a title and select a project');
    }

    setSubmitting(true);
    try {
      await api.post('/tasks', {
        project_id: parseInt(projectId, 10),
        title: title.trim(),
        description: description.trim() || null,
        assigned_to: assignedTo ? parseInt(assignedTo, 10) : null,
        participants: assignedTo ? [parseInt(assignedTo, 10)] : [],
        start_date: startDate,
        priority,
        due_date: dueDate || null
      });
      setTitle('');
      setDescription('');
      setProjectId('');
      setAssignedTo('');
      setStartDate(getISODateIST());
      setPriority('medium');
      setDueDate('');
      toast.success('Task successfully assigned');
      // Refresh board
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create task');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleQuickStatusChange(taskId, newStatus) {
    try {
      await api.patch(`/tasks/${taskId}`, { status: newStatus });
      toast.success('Task updated successfully');
      fetchData();
    } catch {
      toast.error('Failed to update task status');
    }
  }

  const openTask = (taskId) => {
    setSelectedTaskId(taskId);
    setIsModalOpen(true);
  };

  const allTasks = kanbanData.flatMap(col => col.tasks || []);
  const activeCount = allTasks.filter(t => !['passed', 'done'].includes(t.status)).length;
  const reviewCount = allTasks.filter(t => t.status === 'review').length;
  const overdueCount = allTasks.filter(t => isTaskOverdue(t)).length;
  const reviewTasks = allTasks.filter(t => t.status === 'review');
  const isPrivileged = user?.role === 'admin' || user?.role === 'design_head' || user?.role === 'accounts' || user?.role === 'back_office' || user?.role === 'project_head';

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Top-Most Row: Admin PDF Export Bar */}
        {user?.role === 'admin' && (
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-sm flex flex-col xl:flex-row xl:items-center justify-between gap-4 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-red-500 flex-shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-slate-800 tracking-tight">Export Tasks to PDF</h3>
                  <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Admin</span>
                </div>
                <p className="text-xs text-muted">Generate comprehensive audit reports with date filtering</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status:</span>
                <select
                  value={exportStatus}
                  onChange={(e) => setExportStatus(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="passed">Completed (Passed)</option>
                  <option value="all">All Statuses</option>
                  <option value="review">Pending Review</option>
                  <option value="in_progress">In Progress</option>
                  <option value="pending">Pending</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">From:</span>
                <input
                  type="date"
                  value={exportFromDate}
                  onChange={(e) => setExportFromDate(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">To:</span>
                <input
                  type="date"
                  value={exportToDate}
                  onChange={(e) => setExportToDate(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
                />
              </div>

              <button
                onClick={handleExportTasksPdf}
                disabled={isExportingPdf}
                className="px-4 py-2 bg-slate-900 hover:bg-[#E05A1E] text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center gap-2 disabled:opacity-50"
                title="Download PDF"
              >
                {isExportingPdf ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    <span>Export PDF</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div>
          <h1 className="text-2xl font-black text-[#1A1A1A] tracking-tight">Task Manager</h1>
          <p className="text-muted text-sm font-medium mt-0.5">Global productivity tracking</p>
        </div>

        {/* Metrics Strip */}
        {viewMode === 'active' && !loading && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-slate-100 p-5 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Active Tasks</span>
                <h3 className="text-2xl font-black text-slate-800 mt-1">{activeCount}</h3>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-500">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 p-5 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Pending Review</span>
                <h3 className="text-2xl font-black text-slate-800 mt-1">{reviewCount}</h3>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-500">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 p-5 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Overdue Tasks</span>
                <h3 className="text-2xl font-black text-red-600 mt-1">{overdueCount}</h3>
              </div>
              <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-red-500">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </div>
            </div>
          </div>
        )}

        {/* Pending Review Action Queue */}
        {user?.role === 'admin' && reviewTasks.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                <h2 className="text-base font-black text-slate-800 tracking-tight">Review Action Queue</h2>
              </div>
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                {reviewTasks.length} pending
              </span>
            </div>

            <div className="divide-y divide-slate-100 max-h-[250px] overflow-y-auto pr-1">
              {reviewTasks.map(t => (
                <div key={t.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-700 hover:text-slate-900 cursor-pointer" onClick={() => openTask(t.id)}>
                        {t.title}
                      </span>
                      <span className="text-[9px] bg-slate-100 text-[#E05A1E] px-1.5 py-0.2 rounded border border-slate-200 uppercase font-black tracking-tight">
                        {t.project_name}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted">
                      Assigned to <span className="font-bold text-slate-600">{t.assigned_to_name || 'Unassigned'}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleQuickStatusChange(t.id, 'passed')}
                      className="px-3 py-1 bg-emerald-50 hover:bg-emerald-500 border border-emerald-200 text-emerald-700 hover:text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition-all"
                    >
                      ✓ Pass
                    </button>
                    <button
                      onClick={() => handleQuickStatusChange(t.id, 'in_progress')}
                      className="px-3 py-1 bg-red-50 hover:bg-red-500 border border-red-200 text-red-700 hover:text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition-all"
                    >
                      ⟲ Reassign
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Create Task Panel */}
        {isPrivileged && (
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[rgba(224,90,30,0.08)] border border-[rgba(224,90,30,0.18)] flex items-center justify-center text-[#E05A1E]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
              </div>
              <h2 className="text-base font-black text-[#1A1A1A]">Create Separate Task</h2>
            </div>

            <form onSubmit={handleCreateTask} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-4">
                <label className="text-[10px] font-black text-muted uppercase tracking-wider">Task Title</label>
                <input
                  type="text"
                  className="input mt-1"
                  placeholder="Type task objective..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="md:col-span-4">
                <label className="text-[10px] font-black text-muted uppercase tracking-wider">Project Link</label>
                <select
                  className="input mt-1"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                >
                  <option value="">Select Project...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-4">
                <label className="text-[10px] font-black text-muted uppercase tracking-wider">Assign To</label>
                <select
                  className="input mt-1"
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-6">
                <label className="text-[10px] font-black text-muted uppercase tracking-wider">Scope / Description (Optional)</label>
                <input
                  type="text"
                  className="input mt-1"
                  placeholder="Brief instructions or scope details..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-[10px] font-black text-muted uppercase tracking-wider">Start Date</label>
                <input
                  type="date"
                  className="input mt-1"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-[10px] font-black text-muted uppercase tracking-wider">Due Date</label>
                <input
                  type="date"
                  className="input mt-1"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-[10px] font-black text-muted uppercase tracking-wider">Priority</label>
                <select
                  className="input mt-1"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div className="md:col-span-12 flex justify-end">
                <button
                  type="submit"
                  disabled={submitting || !title.trim() || !projectId}
                  className="btn-primary"
                >
                  {submitting ? 'Submitting...' : 'Link & Dispatch Task'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Kanban Section */}
        {loading ? (
          <div className="card skeleton h-96 w-full rounded" />
        ) : (
          <div className="card w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <h3 className="text-lg font-black text-[#1A1A1A]">
                {viewMode === 'history' 
                  ? 'Task History (Passed)' 
                  : viewMode === 'scheduled' 
                    ? 'Scheduled Tasks (Upcoming)' 
                    : (user?.role === 'admin' || user?.role === 'design_head' || user?.role === 'accounts' || user?.role === 'back_office' || user?.role === 'project_head')
                      ? 'Task Board (All Employees)' 
                      : 'My Task Board'}
              </h3>
              
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 self-start">
                <button 
                  onClick={() => setViewMode('active')}
                  className={`px-4 py-1.5 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${
                    viewMode === 'active' ? 'bg-white text-[#1A1A1A] shadow-sm' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Active
                </button>
                <button 
                  onClick={() => setViewMode('scheduled')}
                  className={`px-4 py-1.5 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${
                    viewMode === 'scheduled' ? 'bg-white text-[#1A1A1A] shadow-sm' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Scheduled
                </button>
                <button 
                  onClick={() => setViewMode('history')}
                  className={`px-4 py-1.5 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${
                    viewMode === 'history' ? 'bg-white text-[#1A1A1A] shadow-sm' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  History
                </button>
              </div>
            </div>
            
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
              {kanbanData.map((col) => (
                <div key={col.username || col.name} className="flex flex-col min-w-[280px] bg-slate-50 border border-slate-100 rounded-xl p-3 min-h-[400px]">
                  <div className="flex items-start justify-between mb-4 pb-2 border-b border-slate-200/60">
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-slate-700 uppercase tracking-wider">{col.name}</span>
                      {col.department && (
                        <span className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-wide">{col.department}</span>
                      )}
                    </div>
                    <span className="px-1.5 py-0.5 rounded bg-white text-[10px] font-bold text-slate-400 border border-slate-200 h-fit mt-0.5">
                      {col.tasks?.length || 0}
                    </span>
                  </div>
                  
                  <div className="flex-1 space-y-3">
                    {col.tasks?.length === 0 && (
                      <div className="text-center py-12 text-slate-300 italic text-xs">No tasks</div>
                    )}
                    {col.tasks?.map((t) => {
                      const isOverdue = isTaskOverdue(t);
                      return (
                        <div 
                          key={t.id}
                          onClick={() => openTask(t.id)}
                          className={`bg-white border rounded-xl p-3 hover:shadow-md cursor-pointer transition-all group relative overflow-hidden ${
                            isOverdue 
                              ? 'border-red-200 hover:border-red-400 bg-red-50/10' 
                              : 'border-slate-200 hover:border-[#E05A1E]/50'
                          }`}
                        >
                          <div className={`absolute top-0 left-0 w-1 h-full transition-opacity ${
                            isOverdue 
                              ? 'bg-red-500 opacity-100' 
                              : 'bg-[#E05A1E] opacity-0 group-hover:opacity-100'
                          }`} />
                           <p className="text-xs font-bold text-slate-800 line-clamp-2 mb-1 group-hover:text-[#E05A1E] transition-colors">{t.title}</p>
                          {t.start_date && t.start_date.substring(0, 10) > getISODateIST() && (
                            <div className="text-[10px] text-amber-600 font-bold mb-1 flex items-center gap-1">
                              📅 Starts: {formatDateIST(t.start_date)}
                            </div>
                          )}
                          {t.due_date && (
                            <div className={`text-[10px] font-bold mb-1 flex items-center gap-1 ${
                              isOverdue ? 'text-red-600' : 'text-slate-500'
                            }`}>
                              📅 Due: {formatDateIST(t.due_date)}
                            </div>
                          )}
                          <p className="text-[10px] text-muted mb-2 font-medium flex items-center gap-1.5">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            {formatIST(t.created_at)}
                          </p>

                          <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-slate-50 flex-wrap">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[9px] font-black uppercase tracking-tight bg-slate-100 text-[#E05A1E] px-1.5 py-0.5 rounded border border-slate-200">
                                {t.project_name}
                              </span>
                              <span className={`text-[9px] font-black uppercase tracking-tight px-1.5 py-0.5 rounded border ${
                                t.priority === 'high' ? 'bg-red-50 border-red-200 text-red-600' :
                                t.priority === 'medium' ? 'bg-amber-50 border-amber-200 text-amber-600' :
                                'bg-blue-50 border-blue-200 text-blue-600'
                              }`}>
                                {t.priority || 'medium'}
                              </span>
                              {isOverdue && (
                                <span className="text-[9px] font-black uppercase tracking-tight bg-red-100 text-red-600 px-1.5 py-0.5 rounded border border-red-200">
                                  ⚠️ {getTaskOverdueDays(t)}d Overdue
                                </span>
                              )}
                            </div>
                            <span className={`text-[9px] font-black uppercase tracking-tight px-1.5 py-0.5 rounded border ${
                              t.status === 'passed' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' :
                              t.status === 'done' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' :
                              t.status === 'in_progress' ? 'bg-amber-50 border-amber-200 text-amber-600' :
                              t.status === 'review' ? 'bg-purple-50 border-purple-200 text-purple-600' :
                              'bg-slate-100 border-slate-200 text-slate-400'
                            }`}>
                              {t.status}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <TaskModal 
        taskId={selectedTaskId}
        isOpen={isModalOpen}
        onClose={() => { 
          setIsModalOpen(false); 
          if (searchParams.get('taskId')) {
            setSearchParams({}, { replace: true });
          }
          fetchData(); 
        }}
      />
    </AppLayout>
  );
}
