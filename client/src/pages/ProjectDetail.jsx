// client/src/pages/ProjectDetail.jsx
// Project detail page: stages, threaded comments with @mention task assignment

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { toast } from 'react-hot-toast';
import { formatIST, formatDateIST, getISODateIST, isTaskOverdue, getTaskOverdueDays } from '../utils/time';
import DocumentsTab from '../components/projects/DocumentsTab';
import SitePhotographsTab from '../components/projects/SitePhotographsTab';
import ChangeClientModal from '../components/projects/ChangeClientModal';
import ProjectStakeholderModal from '../components/projects/ProjectStakeholderModal';
import TaskModal from '../components/projects/TaskModal';
import PaymentStagesTab from '../components/projects/PaymentStagesTab';
import VendorsTab from '../components/projects/VendorsTab';
import ProjectFinancesTab from '../components/projects/ProjectFinancesTab';
import InvoiceHistoryTab from '../components/projects/InvoiceHistoryTab';
import ConstructionTimeline from '../components/builder/ConstructionTimeline';
import ProjectMaterialsTab from '../components/builder/ProjectMaterialsTab';
import SiteDiaryTab from '../components/builder/SiteDiaryTab';
import SiteIssuesTab from '../components/builder/SiteIssuesTab';

const STAGE_STATUS = {
  pending: { label: 'Pending', cls: 'badge-absent' },
  in_progress: { label: 'In Progress', cls: 'badge-in-progress' },
  completed: { label: 'Done', cls: 'badge-completed' },
};

const PROJECT_TYPES = [
  'Apartment Residential',
  'Construction',
  'Interior',
  'Liasoning',
  'Rendering',
  'Residential Interior',
  'Commercial Interior',
  'Banquet Hall',
  'Flat Interior',
  'Residence',
  'Temple',
  'Hostel',
  'Terrace Floor Plan',
  'Shopping Complex',
  'Commercial',
  'Industrial',
  'Layout Development',
  'Other'
];

export default function ProjectDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { user, isAdmin, isAccounts, isDesignHead } = useAuth();
  const isPrivileged = user?.role === 'admin' || user?.role === 'design_head' || user?.role === 'accounts' || user?.role === 'back_office' || user?.role === 'project_head';
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [stakeholders, setStakeholders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam) {
      if (tabParam === 'builder') {
        setActiveTab('overview');
      } else {
        setActiveTab(tabParam);
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (!isAdmin && !isAccounts && ['payments', 'finances', 'invoices'].includes(activeTab)) {
      setActiveTab('overview');
    }
  }, [isAdmin, isAccounts, activeTab]);
  const [showChangeClientModal, setShowChangeClientModal] = useState(false);
  const [showStakeholderModal, setShowStakeholderModal] = useState(false);
  const [editingStakeholder, setEditingStakeholder] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  // New task creation state
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskAssignedTo, setNewTaskAssignedTo] = useState('');
  const newTaskStage = 'general';
  const [newTaskStartDate, setNewTaskStartDate] = useState(getISODateIST());
  const [newTaskPriority, setNewTaskPriority] = useState('medium');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');

  const fetchProject = useCallback(async () => {
    try {
      const [projRes, tasksRes, stakeholdersRes, usersRes] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get(`/tasks?project_id=${id}`),
        api.get(`/projects/${id}/stakeholders`),
        api.get('/auth/users')
      ]);
      setProject(projRes.data.project);
      setTasks(tasksRes.data.tasks);
      setStakeholders(stakeholdersRes.data.stakeholders);
      setUsers(usersRes.data.users || []);
    } catch (err) {
      toast.error('Failed to load project details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  async function handleCreateTask(e) {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    setSubmitting(true);
    try {
      await api.post('/tasks', {
        project_id: id,
        stage: newTaskStage,
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim() || null,
        assigned_to: newTaskAssignedTo ? parseInt(newTaskAssignedTo) : null,
        participants: newTaskAssignedTo ? [parseInt(newTaskAssignedTo)] : [],
        start_date: newTaskStartDate,
        priority: newTaskPriority,
        due_date: newTaskDueDate || null
      });
      setNewTaskTitle('');
      setNewTaskDescription('');
      setNewTaskAssignedTo('');
      setNewTaskStartDate(getISODateIST());
      setNewTaskPriority('medium');
      setNewTaskDueDate('');
      await fetchProject();
      toast.success('Task created!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create task');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStageUpdate(stageId, status) {
    try {
      const { data } = await api.patch(`/projects/${id}/stages/${stageId}`, { status });
      setProject((p) => ({
        ...p,
        status: data.projectStatus,
        stages: p.stages.map((s) => s.id === stageId ? { ...s, status } : s),
      }));
      toast.success('Stage updated');
    } catch {
      toast.error('Failed to update stage');
    }
  }

  async function handleProjectTypeChange(e) {
    const newType = e.target.value;
    try {
      await api.patch(`/projects/${id}`, { type: newType });
      setProject((p) => ({ ...p, type: newType }));
      toast.success('Project type updated');
    } catch {
      toast.error('Failed to update project type');
    }
  }

  async function handleDeleteProject() {
    if (!window.confirm(`Are you sure you want to delete project "${project.name}"? This action cannot be undone.`)) return;
    try {
      await api.delete(`/projects/${id}`);
      toast.success('Project deleted');
      window.location.href = '/projects';
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete project');
    }
  }

  async function handleDeleteStakeholder(stakeholderId) {
    if (!window.confirm('Delete this stakeholder?')) return;
    try {
      await api.delete(`/projects/${id}/stakeholders/${stakeholderId}`);
      toast.success('Stakeholder deleted');
      fetchProject();
    } catch (err) {
      toast.error('Failed to delete stakeholder');
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-4 max-w-6xl mx-auto">
          <div className="skeleton h-8 w-48 rounded" />
          <div className="skeleton h-40 rounded" />
          <div className="skeleton h-60 rounded" />
        </div>
      </AppLayout>
    );
  }

  if (!project) {
    return <AppLayout><p className="text-muted text-center py-10">Project not found</p></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <a href="/projects" className="text-xs text-muted hover:text-[#E05A1E] transition-colors mb-2 inline-block">
            ← All Projects
          </a>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-[#1A1A1A]">{project.name}</h1>
              <div className="flex items-center gap-2 mb-1">
                {project.client_id ? (
                  <Link to={`/clients/${project.client_id}`} className="text-[#E05A1E] text-sm font-bold hover:underline inline-block">
                    {project.client_display_name || project.client_name}
                  </Link>
                ) : (
                  <span className="text-amber-600 text-[11px] font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                    ⚠️ No client profile linked
                  </span>
                )}
                <button 
                  onClick={() => setShowChangeClientModal(true)}
                  className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded hover:bg-[#E05A1E] hover:text-white transition-colors uppercase font-bold"
                >
                  {project.client_id ? 'Change' : 'Link Profile'}
                </button>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted flex-wrap">
                {project.location && <span>📍 {project.location}</span>}
                {project.area_sq_ft && <span>📏 {project.area_sq_ft} sq ft</span>}
                {project.structural_engineer && <span>🏗️ {project.structural_engineer}</span>}
              </div>
            </div>
            <div className="flex flex-col items-end gap-3">
              {isAdmin && (
                <button 
                  onClick={handleDeleteProject}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-100 rounded-lg transition-all"
                  title="Delete Project"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>
                  </svg>
                  Delete Project
                </button>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">Status:</span>
                <span className={`badge ${
                  project.status === 'Completed' ? 'badge-completed' : 
                  project.status === 'Pending' ? 'badge-absent' : 
                  'badge-in-progress'
                }`}>
                  {project.status || 'Pending'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">Type:</span>
                <select
                  className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 font-medium text-slate-600 focus:outline-none focus:border-[#E05A1E] transition-colors"
                  value={project.type}
                  onChange={handleProjectTypeChange}
                >
                  {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs Navigation */}
        <div className="flex border-b border-[#EBEBEB] overflow-visible">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'materials', label: 'Materials' },
            { id: 'site-diary', label: 'Site Diary' },
            { id: 'site-issues', label: 'Site Issues' },
            { id: 'client', label: 'Client & Contacts', count: stakeholders.length },
            { id: 'tasks', label: 'Tasks', count: tasks.length },
            { id: 'documents', label: 'Documents' },
            (isAdmin || isAccounts) && { id: 'payments', label: 'Payment Stages' },
            (isAdmin || isAccounts) && { id: 'finances', label: 'Accounts' },
            (isAdmin || isAccounts) && { id: 'invoices', label: 'Invoices' },
            { id: 'site-photos', label: 'Site Photos' },
            { id: 'vendors', label: 'Vendors' },
          ].filter(Boolean).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-3 text-sm font-bold whitespace-nowrap border-b-2 transition-all flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'border-[#E05A1E] text-[#E05A1E]'
                  : 'border-transparent text-muted hover:text-[#1A1A1A] hover:border-[#EBEBEB]'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                  activeTab === tab.id ? 'bg-[#E05A1E]/10 text-[#E05A1E]' : 'bg-[#F0F0F0] text-muted'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="card animate-in fade-in duration-300">
              <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-4">Project Stages</h3>
              <div className="space-y-3">
                {(Array.isArray(project.stages) ? project.stages : []).map((stage, index) => {
                  const prevStage = project.stages[index - 1];
                  const isLocked = index > 0 && prevStage?.status !== 'completed';
                  
                  return (
                    <div key={stage.id} className={`flex items-center justify-between p-3 rounded-lg border ${
                      isLocked ? 'bg-gray-50 opacity-60' : 'bg-[#F5F5F5] border-[#EBEBEB]'
                    }`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${
                          stage.status === 'completed' ? 'bg-emerald-600'
                          : stage.status === 'in_progress' ? 'bg-[#E05A1E] animate-pulse'
                          : 'bg-[#E0E0E0]'
                        }`} />
                        <span className={`text-sm font-medium ${isLocked ? 'text-muted' : 'text-[#1A1A1A]'}`}>
                          {stage.stage_name}
                          {isLocked && <span className="text-[10px] ml-2 italic">(Locked)</span>}
                        </span>
                      </div>
                      <select
                        className="text-xs bg-white border border-[#E0E0E0] rounded px-2 py-1 text-[#1A1A1A] focus:outline-none focus:border-[#E05A1E] disabled:bg-transparent disabled:border-transparent"
                        value={stage.status}
                        disabled={isLocked}
                        onChange={(e) => handleStageUpdate(stage.id, e.target.value)}
                      >
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Construction Timeline */}
            <ConstructionTimeline projectId={id} currentUser={user} isPrivileged={isPrivileged} />
          </div>
        )}

        {activeTab === 'client' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {project.client_id ? (
              <div className="space-y-6">
              <div className="card">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E05A1E" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  </div>
                  <div>
                      <h3 className="text-base font-bold text-[#1A1A1A]">{project.client_display_name || project.client_name}</h3>
                      {project.client_company && <p className="text-xs font-semibold text-[#E05A1E] uppercase tracking-wider">{project.client_company}</p>}
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-[#F0F0F0] pt-4 mt-4">
                  <div className="space-y-1">
                      <p className="text-[10px] font-bold text-muted uppercase">GST Number</p>
                      <p className="text-sm font-medium">{project.gst_number || 'Not Registered'}</p>
                  </div>
                  <div className="space-y-1">
                      <p className="text-[10px] font-bold text-muted uppercase">PAN Number</p>
                      <p className="text-sm font-medium">{project.pan_number || 'Not Provided'}</p>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                <p className="text-xs text-amber-800 leading-relaxed font-medium">
                  💡 This project is linked to the <strong>{project.client_display_name || project.client_name}</strong> account. 
                  All billing and addresses are managed in the Client CRM module.
                </p>
              </div>
            </div>
          ) : (
            <div className="card border-dashed border-2 border-slate-200 bg-slate-50 py-12 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-700">No Client Profile Linked</h3>
              <p className="text-sm text-slate-500 max-w-sm mt-2 mb-8">
                This project was created without a linked client profile. Attach an existing profile or create a new one to manage billing, contacts, and documents.
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowChangeClientModal(true)}
                  className="btn-primary"
                >
                  Link Existing Profile
                </button>
                <Link to="/clients" className="btn-secondary">
                  Create New Profile
                </Link>
              </div>
            </div>
          )}

            {/* Stakeholders Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-muted uppercase tracking-wider">Project Contacts / Stakeholders</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {stakeholders.map(s => (
                  <div key={s.id} className="card relative group">
                    {s.is_primary && (
                      <span className="absolute top-3 right-3 text-[10px] px-2 py-0.5 bg-orange-100 text-[#E05A1E] rounded-full font-bold uppercase tracking-wider">Primary</span>
                    )}
                      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                        {!s.is_primary && (
                          <button onClick={() => { setEditingStakeholder(s); setShowStakeholderModal(true); }} className="p-1 text-muted hover:text-[#E05A1E]">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                        )}
                        {isAdmin && (
                          <button onClick={() => handleDeleteStakeholder(s.id)} className="p-1 text-muted hover:text-red-500">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
                          </button>
                        )}
                      </div>
                    <div className="flex items-center gap-3 mb-4 mt-2">
                      <div className="w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center font-bold text-[#1A1A1A]">
                        {s.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-[#1A1A1A]">{s.name}</h4>
                        <span className="text-[10px] font-bold text-[#E05A1E] uppercase tracking-tighter">{s.role}</span>
                      </div>
                    </div>
                    <div className="space-y-2 border-t border-[#F0F0F0] pt-4">
                      {s.phone && (
                        <div className="flex items-center gap-2 text-xs text-muted">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1-2 2 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l2.19-2.19a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                          {s.phone}
                        </div>
                      )}
                      {s.email && (
                        <div className="flex items-center gap-2 text-xs text-muted">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                          {s.email}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                  <button onClick={() => { setEditingStakeholder(null); setShowStakeholderModal(true); }} className="card border-dashed flex flex-col items-center justify-center py-8 text-muted hover:text-[#E05A1E] hover:border-[#E05A1E] transition-all">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mb-2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    <span className="text-xs font-bold uppercase tracking-wider">Add Contact</span>
                  </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Create Task Form */}
            {isPrivileged && (
              <div className="card">
                <h3 className="text-base font-semibold text-[#1A1A1A] mb-4">Create New Task</h3>
                <form onSubmit={handleCreateTask} className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-muted uppercase">Task Title</label>
                    <input 
                      type="text" 
                      className="input mt-1" 
                      placeholder="What needs to be done?"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-muted uppercase">Scope / Description (Optional)</label>
                    <input 
                      type="text" 
                      className="input mt-1" 
                      placeholder="Brief context or instructions..."
                      value={newTaskDescription}
                      onChange={(e) => setNewTaskDescription(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-muted uppercase">Assign To</label>
                      <select 
                        className="input mt-1"
                        value={newTaskAssignedTo}
                        onChange={(e) => setNewTaskAssignedTo(e.target.value)}
                      >
                        <option value="">Unassigned</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-muted uppercase">Start Date</label>
                      <input 
                        type="date"
                        className="input mt-1"
                        value={newTaskStartDate}
                        onChange={(e) => setNewTaskStartDate(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-muted uppercase">Due Date</label>
                      <input 
                        type="date"
                        className="input mt-1"
                        value={newTaskDueDate}
                        onChange={(e) => setNewTaskDueDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-muted uppercase">Priority</label>
                      <select 
                        className="input mt-1"
                        value={newTaskPriority}
                        onChange={(e) => setNewTaskPriority(e.target.value)}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button 
                      type="submit" 
                      disabled={submitting || !newTaskTitle.trim()} 
                      className="btn-primary"
                    >
                      {submitting ? 'Creating...' : 'Create Task'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Task Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tasks.length === 0 ? (
                <p className="text-muted text-sm text-center py-10 col-span-2">No tasks created yet</p>
              ) : (
                tasks.map((t) => {
                  const isOverdue = isTaskOverdue(t);
                  return (
                    <div 
                      key={t.id}
                      onClick={() => { setSelectedTaskId(t.id); setIsTaskModalOpen(true); }}
                      className={`card cursor-pointer transition-all relative overflow-hidden group ${
                        isOverdue 
                          ? 'border-red-200 hover:border-red-400 bg-red-50/10' 
                          : 'hover:border-[#E05A1E]/40 hover:shadow-md'
                      }`}
                    >
                      <div className={`absolute top-0 left-0 w-1.5 h-full transition-opacity ${
                        isOverdue 
                          ? 'bg-red-500 opacity-100' 
                          : 'bg-[#E05A1E] opacity-0 group-hover:opacity-100'
                      }`} />
                      
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-col gap-1">
                          <h4 className="text-sm font-bold text-[#1A1A1A] line-clamp-1 group-hover:text-[#E05A1E] transition-colors">{t.title}</h4>
                          <p className="text-[10px] text-muted font-medium flex items-center gap-1.5">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            {formatIST(t.created_at)}
                          </p>
                        </div>
                        {t.start_date && t.start_date.substring(0, 10) > getISODateIST() ? (
                          <span className="badge bg-amber-50 border-amber-200 text-amber-600 font-bold uppercase tracking-tight">
                            Scheduled ({formatDateIST(t.start_date)})
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {isOverdue && (
                              <span className="badge bg-red-100 border-red-200 text-red-600 font-bold uppercase tracking-tight">
                                ⚠️ {getTaskOverdueDays(t)}d Overdue
                              </span>
                            )}
                            <span className={`badge ${
                              t.status === 'passed' ? 'badge-completed' :
                              t.status === 'done' ? 'badge-completed' :
                              t.status === 'in_progress' ? 'badge-in-progress' :
                              t.status === 'review' ? 'badge-pending bg-purple-50 text-purple-600 border-purple-200' :
                              'badge-pending'
                            }`}>
                              {t.status}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-4 text-xs text-muted flex-wrap justify-between w-full">
                        <div className="flex items-center gap-2 flex-wrap">
                          {t.assigned_to_name && (
                            <span className="flex items-center gap-1 font-medium bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                              👤 {t.assigned_to_name}
                            </span>
                          )}
                          <span className={`text-[9px] font-black uppercase tracking-tight px-1.5 py-0.5 rounded border ${
                            t.priority === 'high' ? 'bg-red-50 border-red-200 text-red-600' :
                            t.priority === 'medium' ? 'bg-amber-50 border-amber-200 text-amber-600' :
                            'bg-blue-50 border-blue-200 text-blue-600'
                          }`}>
                            {t.priority || 'medium'}
                          </span>
                        </div>
                        {t.due_date && (
                          <span className={`text-[10px] font-bold ${isOverdue ? 'text-red-600' : 'text-slate-500'}`}>
                            📅 Due: {formatDateIST(t.due_date)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {activeTab === 'materials' && <ProjectMaterialsTab projectId={id} stages={project.stages || []} />}
        {activeTab === 'site-diary' && <SiteDiaryTab projectId={id} stages={project.stages || []} />}
        {activeTab === 'site-issues' && <SiteIssuesTab projectId={id} stages={project.stages || []} />}
        {activeTab === 'documents' && <DocumentsTab projectId={id} currentUser={user} />}
        {(isAdmin || isAccounts) && activeTab === 'payments' && <PaymentStagesTab projectId={id} project={project} />}
        {(isAdmin || isAccounts) && activeTab === 'finances' && <ProjectFinancesTab projectId={id} />}
        {(isAdmin || isAccounts) && activeTab === 'invoices' && <InvoiceHistoryTab projectId={id} project={project} />}
        {activeTab === 'site-photos' && <SitePhotographsTab projectId={id} currentUser={user} />}
        {activeTab === 'vendors' && <VendorsTab projectId={id} isAdmin={isAdmin} isAccounts={isAccounts} isDesignHead={isDesignHead} />}
      </div>

      {showChangeClientModal && (
        <ChangeClientModal 
          projectId={id}
          currentClientId={project.client_id}
          onClose={() => setShowChangeClientModal(false)}
          onUpdated={() => fetchProject()}
        />
      )}

      {showStakeholderModal && (
        <ProjectStakeholderModal
          projectId={id}
          stakeholder={editingStakeholder}
          onClose={() => setShowStakeholderModal(false)}
          onSave={() => {
            setShowStakeholderModal(false);
            fetchProject();
          }}
        />
      )}

      <TaskModal 
        taskId={selectedTaskId}
        isOpen={isTaskModalOpen}
        onClose={() => { setIsTaskModalOpen(false); fetchProject(); }}
      />
    </AppLayout>
  );
}
