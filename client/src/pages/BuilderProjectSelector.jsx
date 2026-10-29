// client/src/pages/BuilderProjectSelector.jsx
// W4Y Builder Module - Global Project Selector
// Manage construction work, materials and site activity.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

export default function BuilderProjectSelector() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const fetchBuilderProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/builder/projects');
      setProjects(res.data.projects || []);
    } catch (err) {
      console.error('Fetch builder projects failed:', err);
      setError(err.response?.data?.error || 'Failed to load projects. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBuilderProjects();
  }, [fetchBuilderProjects]);

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      // Status filter
      if (statusFilter !== 'All') {
        const s = (p.status || '').toLowerCase();
        if (statusFilter === 'Active' && !s.includes('execution') && !s.includes('active') && !s.includes('progress') && !s.includes('design')) {
          return false;
        }
        if (statusFilter === 'On Hold' && !s.includes('hold') && !s.includes('pause')) {
          return false;
        }
        if (statusFilter === 'Completed' && !s.includes('complete') && !s.includes('handover')) {
          return false;
        }
      }

      // Search filter
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchName = (p.name || '').toLowerCase().includes(q);
        const matchLoc = (p.location || '').toLowerCase().includes(q);
        const matchClient = (p.client_name || '').toLowerCase().includes(q);
        const matchStage = (p.current_stage?.stage_name || '').toLowerCase().includes(q);
        if (!matchName && !matchLoc && !matchClient && !matchStage) {
          return false;
        }
      }

      return true;
    });
  }, [projects, statusFilter, search]);

  const canCreate = user?.role === 'admin' || user?.role === 'project_head' || user?.role === 'design_head';

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[#EBEBEB]">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-lg bg-[#E05A1E]/10 text-[#E05A1E]">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 22l10-10"/>
                  <path d="M9 5l4 4"/>
                  <path d="M15 3l6 6-4 4-6-6 4-4z"/>
                  <path d="M14 10l-1.5 1.5"/>
                </svg>
              </span>
              <h1 className="text-2xl font-bold text-[#1A1A1A] font-heading">Builder</h1>
            </div>
            <p className="text-sm text-muted mt-1">Manage construction work, materials and site activity.</p>
          </div>

          {canCreate && (
            <Link
              to="/projects"
              className="btn-primary self-start sm:self-auto flex items-center gap-2 text-sm shadow-sm"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Project
            </Link>
          )}
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10 pr-4 py-2 w-full text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-[#1A1A1A] text-xs"
              >
                Clear
              </button>
            )}
          </div>

          {/* Compact Status Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {['All', 'Active', 'On Hold', 'Completed'].map(tab => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  statusFilter === tab
                    ? 'bg-[#1A1A1A] text-white shadow-sm'
                    : 'bg-[#F5F5F5] text-muted hover:text-[#1A1A1A] hover:bg-[#EBEBEB]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Error State with Inline Retry */}
        {error && (
          <div className="card p-5 border-rose-200 bg-rose-50 text-rose-800 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="text-sm font-medium">{error}</span>
            </div>
            <button
              onClick={fetchBuilderProjects}
              className="btn-secondary text-xs px-3 py-1.5 bg-white text-rose-900 border-rose-300 hover:bg-rose-100"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading Skeleton */}
        {loading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="card p-5 space-y-4 animate-pulse">
                <div className="flex justify-between items-start">
                  <div className="space-y-2 flex-1">
                    <div className="h-5 bg-slate-200 rounded w-2/3"></div>
                    <div className="h-3.5 bg-slate-100 rounded w-1/2"></div>
                  </div>
                  <div className="h-6 w-16 bg-slate-200 rounded-full"></div>
                </div>
                <div className="space-y-2 pt-2">
                  <div className="h-3 bg-slate-100 rounded w-full"></div>
                  <div className="h-2 bg-slate-200 rounded-full w-full"></div>
                </div>
                <div className="flex justify-between pt-3 border-t border-slate-100">
                  <div className="h-4 bg-slate-100 rounded w-1/3"></div>
                  <div className="h-8 bg-slate-200 rounded w-24"></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty States */}
        {!loading && !error && projects.length === 0 && (
          <div className="card text-center py-16 px-4">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 22l10-10"/>
                <path d="M9 5l4 4"/>
                <path d="M15 3l6 6-4 4-6-6 4-4z"/>
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[#1A1A1A]">No construction projects yet</h3>
            <p className="text-sm text-muted max-w-md mx-auto mt-1 mb-6">
              Create or configure a project before managing its construction site.
            </p>
            {canCreate && (
              <Link to="/projects" className="btn-primary inline-flex items-center gap-2 text-sm">
                Create Project
              </Link>
            )}
          </div>
        )}

        {!loading && !error && projects.length > 0 && filteredProjects.length === 0 && (
          <div className="card text-center py-14 px-4">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-[#1A1A1A]">No matching projects</h3>
            <p className="text-sm text-muted mt-1 mb-4">Try another project name or clear your filters.</p>
            <button
              onClick={() => { setSearch(''); setStatusFilter('All'); }}
              className="btn-secondary text-xs px-3.5 py-1.5"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Project Cards Grid */}
        {!loading && !error && filteredProjects.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredProjects.map(project => {
              const currentStage = project.current_stage;
              const progress = project.overall_progress_pct || 0;
              const pendingIssues = project.pending_issues_count || 0;
              const lowStockCount = project.low_stock_warning_count || 0;

              return (
                <div
                  key={project.id}
                  className="card p-5 flex flex-col justify-between hover:shadow-md transition-shadow border border-[#EBEBEB] hover:border-slate-300"
                >
                  <div className="space-y-4">
                    {/* Header: Name, Location, Status */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/projects/${project.id}?tab=overview`}
                          className="font-bold text-[#1A1A1A] hover:text-[#E05A1E] transition-colors truncate block text-base"
                          title={project.name}
                        >
                          {project.name}
                        </Link>
                        <div className="flex items-center gap-1.5 text-xs text-muted mt-1 truncate">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          <span className="truncate">{project.location || 'Location not specified'}</span>
                        </div>
                      </div>

                      <span className="badge badge-completed whitespace-nowrap text-[11px] font-medium">
                        {project.status || 'Active'}
                      </span>
                    </div>

                    {/* Client / Supervisor */}
                    <div className="text-xs text-slate-600 flex items-center gap-2 pt-1 border-t border-slate-100">
                      <span className="text-muted">Client:</span>
                      <span className="font-semibold text-slate-800 truncate">{project.client_name || 'Direct / Self'}</span>
                    </div>

                    {/* Current Construction Stage */}
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted font-medium">Current Stage:</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          currentStage?.status === 'in_progress' ? 'bg-orange-100 text-[#E05A1E]' :
                          currentStage?.status === 'blocked' ? 'bg-rose-100 text-rose-700' :
                          currentStage?.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                          'bg-slate-200 text-slate-700'
                        }`}>
                          {currentStage?.status ? currentStage.status.replace('_', ' ').toUpperCase() : 'NOT STARTED'}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-slate-800 truncate" title={currentStage?.stage_name}>
                        {currentStage ? `${currentStage.stage_number}. ${currentStage.stage_name}` : '1. Execution Started & Site Handover'}
                      </div>
                    </div>

                    {/* Overall Progress Bar */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted font-medium">Overall Progress</span>
                        <span className="font-bold text-slate-800">{progress}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-[#E05A1E] h-2 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                        />
                      </div>
                    </div>

                    {/* Site Warnings / Badges */}
                    <div className="flex items-center gap-2 pt-1">
                      {pendingIssues > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                          {pendingIssues} {pendingIssues === 1 ? 'issue' : 'issues'}
                        </span>
                      ) : (
                        <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          No blockers
                        </span>
                      )}

                      {lowStockCount > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                            <line x1="12" y1="9" x2="12" y2="13"/>
                            <line x1="12" y1="17" x2="12.01" y2="17"/>
                          </svg>
                          {lowStockCount} low stock
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-4 mt-4 border-t border-[#EBEBEB] flex items-center justify-between gap-2">
                    <button
                      onClick={() => navigate(`/projects/${project.id}?tab=materials`)}
                      className="text-xs text-muted hover:text-[#1A1A1A] font-medium transition-colors"
                    >
                      Materials
                    </button>

                    <Link
                      to={`/projects/${project.id}?tab=overview`}
                      className="btn-primary text-xs px-3.5 py-1.5 flex items-center gap-1.5 shadow-sm"
                    >
                      Open Project
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
