/* eslint-disable react-hooks/set-state-in-effect, no-unused-vars */
// client/src/pages/ProjectsPage.jsx
// Project list + create project modal (admin only)

import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { formatDateIST } from '../utils/time';
import toast from 'react-hot-toast';

const PROJECT_TYPES = [
  'Apartment Residential',
  'Construction',
  'Interior',
  'Liasoning',
  'Rendering',
  'Apartment Residential',
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

const DEFAULT_STAGES = ['Proposal', 'Design', 'Submission', 'Working', 'Execution'];

const PROJECT_STATUSES = [
  'Design Proposal', 'Under Proposal', 'Under Designing',
  'Sanction', 'Under Sanctioning',
  'Execution', 'Under Execution'
];

const STATUS_COLORS = {
  'Design Proposal': { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-600' },
  'Under Proposal': { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-600' },
  'Under Designing': { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-600' },
  'Sanction': { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-600' },
  'Under Sanctioning': { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-600' },
  'Execution': { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-600' },
  'Under Execution': { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-600' },
};

const FALLBACK_STATUS_COLOR = { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600' };

const TYPE_COLORS = {
  Construction: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-600' },
  Interior: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-600' },
  Liasoning: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-600' },
  Rendering: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-600' },
};

const FALLBACK_TYPE_COLOR = { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600' };

const STAGE_COLORS = {
  pending: 'bg-[#F0F0F0] text-[#6B6B6B]',
  in_progress: 'bg-orange-50 text-[#E05A1E]',
  completed: 'bg-emerald-50 text-emerald-600',
};

// ── Create project modal
function CreateProjectModal({ onClose, onCreated, initialClientId }) {
  const [form, setForm] = useState({ 
    name: '', client_id: initialClientId || '', type: 'Apartment Residential', 
    location: '', area_sq_ft: '', structural_engineer: '', start_date: '' 
  });
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchingClients, setFetchingClients] = useState(true);

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const { data } = await api.get('/clients');
        setClients(data.clients || []);
      } catch (err) {
        toast.error('Failed to load clients');
      } finally {
        setFetchingClients(false);
      }
    };
    fetchClients();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.client_id) {
      toast.error('Project name and client selection are required');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/projects', form);
      toast.success(`Project "${data.project.name}" created with ${data.project.stages.length} stages`);
      onCreated(data.project);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  }

  const stages = DEFAULT_STAGES;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md card border border-[#E0E0E0] shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-[#1A1A1A]">Create New Project</h3>
          <button onClick={onClose} className="text-muted hover:text-[#1A1A1A] transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Project Name *</label>
            <input className="input" placeholder="e.g. Sharma Villa" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Select Client *</label>
            {fetchingClients ? (
              <div className="h-10 bg-[#F5F5F5] animate-pulse rounded-lg" />
            ) : (
              <select className="input" value={form.client_id}
                onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
                <option value="">-- Choose Client --</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.company_name ? `(${c.company_name})` : ''} — {c.primary_contact_name || 'No Contact'}
                  </option>
                ))}
              </select>
            )}
            <div className="mt-1 flex justify-between">
               <p className="text-[10px] text-muted italic">Search by name or company</p>
               <a href="/clients" className="text-[10px] text-[#E05A1E] font-bold hover:underline">+ New Client</a>
            </div>
          </div>

          <div>
            <label className="label">Project Type</label>
            <select className="input" value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Stage preview */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted">Stages:</span>
            {stages.map((s) => (
              <span key={s} className="badge badge-in-progress">{s}</span>
            ))}
          </div>

          <div>
            <label className="label">Location</label>
            <input className="input" placeholder="e.g. Nagpur, Maharashtra" value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
             <div>
               <label className="label">Area (Sq. Ft.)</label>
               <input className="input" placeholder="e.g. 1500" value={form.area_sq_ft}
                 onChange={(e) => setForm({ ...form, area_sq_ft: e.target.value })} />
             </div>
             <div>
               <label className="label">Structural Engineer</label>
               <input className="input" placeholder="e.g. Str. Aman" value={form.structural_engineer}
                 onChange={(e) => setForm({ ...form, structural_engineer: e.target.value })} />
             </div>
          </div>
          <div>
            <label className="label">Start Date</label>
            <input type="date" className="input" value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Assign project modal
function AssignProjectModal({ project, onClose }) {
  const [users, setUsers] = useState([]);
  const [assigned, setAssigned] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usersRes, projectRes] = await Promise.all([
          api.get('/settings/users'),
          api.get(`/projects/${project.id}`)
        ]);
        setUsers(usersRes.data.users || []);
        setAssigned(projectRes.data.project.assignments?.map(a => a.id) || []);
      } catch (err) {
        toast.error('Failed to load assignment data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [project.id]);

  const toggleAssignment = async (userId) => {
    setUpdating(userId);
    try {
      if (assigned.includes(userId)) {
        await api.delete(`/projects/${project.id}/assign/${userId}`);
        setAssigned(prev => prev.filter(id => id !== userId));
        toast.success('Employee unassigned');
      } else {
        await api.post(`/projects/${project.id}/assign`, { user_id: userId });
        setAssigned(prev => [...prev, userId]);
        toast.success('Employee assigned');
      }
    } catch (err) {
      toast.error('Update failed');
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md card border border-[#E0E0E0] shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-semibold text-[#1A1A1A]">Assign Project</h3>
            <p className="text-xs text-[#E05A1E] font-medium">{project.name}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-[#1A1A1A] transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="space-y-3 py-4">
            {[1, 2, 3].map(i => <div key={i} className="h-12 bg-slate-100 animate-pulse rounded-lg" />)}
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
            {users.map(user => (
              <div key={user.id} className="flex items-center justify-between p-3 rounded-xl border border-[#F0F0F0] hover:bg-[#F9F9F9] transition-colors">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#1A1A1A]">{user.name}</p>
                  <p className="text-[10px] text-muted">{user.department || 'No Department'} • {user.username} • {user.role}</p>
                </div>
                <button
                  onClick={() => toggleAssignment(user.id)}
                  disabled={updating === user.id}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    assigned.includes(user.id)
                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                      : 'bg-[#F5F5F5] text-[#6B6B6B] border border-[#E0E0E0] hover:border-[#E05A1E] hover:text-[#E05A1E]'
                  }`}
                >
                  {updating === user.id ? '...' : assigned.includes(user.id) ? 'Assigned' : 'Assign'}
                </button>
              </div>
            ))}
            {users.length === 0 && (
              <p className="text-center py-8 text-muted text-sm">No employees found.</p>
            )}
          </div>
        )}

        <div className="mt-6">
          <button onClick={onClose} className="btn-secondary w-full justify-center">Done</button>
        </div>
      </div>
    </div>
  );
}

// ── Project card
function ProjectCard({ project, isAdmin, onDelete }) {
  const typeStyle = TYPE_COLORS[project.type] || FALLBACK_TYPE_COLOR;
  const statusStyle = STATUS_COLORS[project.status] || FALLBACK_STATUS_COLOR;
  const rawStages = Array.isArray(project.stages) ? project.stages : [];
  const stages = rawStages.filter(Boolean);
  const completedCount = stages.filter(s => s.status === 'completed').length;

  const handleDelete = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete(project.id, project.name);
  };

  return (
    <a href={`/projects/${project.id}`}
      className="card hover:border-[rgba(224,90,30,0.4)] transition-all duration-200 group block relative">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[#1A1A1A] group-hover:text-[#E05A1E] transition-colors truncate">
            {project.name}
          </h3>
          <div className="flex flex-col">
            {project.client_id ? (
              <>
                <p className="text-xs font-medium text-[#1A1A1A] truncate">{project.client_name}</p>
                {project.client_company && (
                  <p className="text-[10px] text-[#E05A1E] font-semibold truncate uppercase tracking-tight">{project.client_company}</p>
                )}
                {project.primary_contact_name && (
                  <p className="text-[10px] text-muted truncate mt-0.5 italic">POC: {project.primary_contact_name}</p>
                )}
              </>
            ) : (
              <p className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-1 rounded border border-amber-100 leading-tight">
                ⚠️ No client owner. Attach, link, or add a client profile.
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            {isAdmin && (
              <div className="flex items-center gap-1">
                <button 
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); project.onAssign(project); }}
                  className="p-1.5 text-muted hover:text-[#E05A1E] hover:bg-orange-50 rounded-md transition-all"
                  title="Assign Employees"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </button>
                <button 
                  onClick={handleDelete}
                  className="p-1.5 text-muted hover:text-red-500 hover:bg-red-50 rounded-md transition-all"
                  title="Delete Project"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>
                  </svg>
                </button>
              </div>
            )}
            <span className={`badge flex-shrink-0 ${statusStyle.bg} ${statusStyle.text} border ${statusStyle.border}`}>
              {project.status || 'Design Proposal'}
            </span>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded flex-shrink-0 ${typeStyle.bg} ${typeStyle.text} border ${typeStyle.border}`}>
            {project.type}
          </span>
        </div>
      </div>

      {/* Stage progress */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {stages.map((s) => (
          <span key={s.id} className={`text-xs px-2 py-0.5 rounded-full ${STAGE_COLORS[s.status]}`}>
            {s.stage_name}
          </span>
        ))}
      </div>

      {stages.length > 0 && (
        <div className="mt-2">
          <div className="flex justify-between text-xs text-muted mb-1">
            <span>Progress</span>
            <span>{completedCount}/{stages.length}</span>
          </div>
          <div className="h-1.5 bg-[#E8E8E8] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#E05A1E] rounded-full transition-all duration-500"
              style={{ width: `${stages.length ? (completedCount / stages.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {project.location && (
        <p className="text-xs text-muted mt-3">📍 {project.location}</p>
      )}
    </a>
  );
}

export default function ProjectsPage() {
  const { isAdmin } = useAuth();
  const location = useLocation();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [assignProject, setAssignProject] = useState(null);
  const [preSelectedClient, setPreSelectedClient] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    if (location.state?.preSelectClientId) {
      setPreSelectedClient(location.state.preSelectClientId);
      setShowModal(true);
      // Clear state to prevent re-opening on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  const fetchProjects = useCallback(async () => {
    try {
      const { data } = await api.get('/projects');
      setProjects(data.projects);
    } catch {
      toast.error('Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const handleDeleteProject = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete project "${name}"? This action cannot be undone.`)) return;
    
    try {
      await api.delete(`/projects/${id}`);
      setProjects(prev => prev.filter(p => p.id !== id));
      toast.success(`Project "${name}" deleted`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete project');
    }
  };

  const filtered = projects.filter((p) => {
    const s = search.toLowerCase();
    const matchSearch = 
      (p.name || '').toLowerCase().includes(s) ||
      (p.client_name || '').toLowerCase().includes(s) ||
      (p.location || '').toLowerCase().includes(s) ||
      (p.type || '').toLowerCase().includes(s);
      
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    const matchType = typeFilter === 'all' || p.type === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-[#1A1A1A]">Projects</h1>
            <p className="text-muted text-sm mt-0.5">{projects.length} total</p>
          </div>
          <button onClick={() => setShowModal(true)} className="btn-primary shadow-lg shadow-orange-100">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Project
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <input
            className="input max-w-xs"
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="input max-w-[160px]" value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Statuses</option>
            {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="input max-w-[180px]" value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All Types</option>
            {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="card"><div className="skeleton h-32 rounded" /></div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted">No projects found</p>
            {isAdmin && (
              <button onClick={() => setShowModal(true)} className="btn-primary mt-4 mx-auto">
                Create First Project
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((p) => (
              <ProjectCard 
                key={p.id} 
                project={{ ...p, onAssign: setAssignProject }} 
                isAdmin={isAdmin} 
                onDelete={handleDeleteProject}
              />
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <CreateProjectModal 
          initialClientId={preSelectedClient}
          onClose={() => { setShowModal(false); setPreSelectedClient(null); }} 
          onCreated={(p) => setProjects([p, ...projects])} 
        />
      )}

      {assignProject && (
        <AssignProjectModal 
          project={assignProject}
          onClose={() => setAssignProject(null)}
        />
      )}
    </AppLayout>
  );
}
