// client/src/components/builder/SiteIssuesTab.jsx
// Construction Site Issues & Snag Tracker

import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { formatDateIST } from '../../utils/time';

const PRIORITY_BADGES = {
  critical: 'bg-rose-100 text-rose-800 border-rose-300',
  high: 'bg-orange-100 text-orange-800 border-orange-300',
  medium: 'bg-amber-50 text-amber-800 border-amber-200',
  low: 'bg-slate-100 text-slate-700 border-slate-200',
};

const STATUS_BADGES = {
  open: 'bg-rose-50 text-rose-700 border-rose-200',
  in_progress: 'bg-orange-50 text-orange-700 border-orange-200',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed: 'bg-slate-100 text-slate-600 border-slate-200',
};

export default function SiteIssuesTab({ projectId, stages = [] }) {
  const [issues, setIssues] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [resolutionModalOpen, setResolutionModalOpen] = useState(false);

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    try {
      const url = statusFilter !== 'All'
        ? `/builder/projects/${projectId}/issues?status=${statusFilter.toLowerCase()}`
        : `/builder/projects/${projectId}/issues`;
      const res = await api.get(url);
      setIssues(res.data.issues || []);
    } catch (err) {
      console.error('Failed to load site issues:', err);
      toast.error('Failed to load site issues');
    } finally {
      setLoading(false);
    }
  }, [projectId, statusFilter]);

  useEffect(() => {
    fetchIssues();
    api.get('/staff').then(res => setStaff(res.data.staff || [])).catch(() => {});
  }, [fetchIssues]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#EBEBEB]">
        <div>
          <h3 className="text-xl font-bold text-[#1A1A1A] font-heading">Site Issues</h3>
          <p className="text-xs text-muted mt-0.5">Track shortages, site delays, safety concerns and rework items.</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[#F5F5F5] p-1 rounded-lg">
            {['All', 'Open', 'In_Progress', 'Resolved'].map(tab => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  statusFilter === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-muted hover:text-slate-800'
                }`}
              >
                {tab.replace('_', ' ')}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary text-xs px-3.5 py-2 font-semibold flex items-center gap-1.5 shadow-sm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Report Issue
          </button>
        </div>
      </div>

      {/* Issues List */}
      {loading ? (
        <div className="py-16 text-center text-muted text-xs space-y-2">
          <div className="w-6 h-6 border-2 border-[#E05A1E] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <div>Loading site issues...</div>
        </div>
      ) : issues.length === 0 ? (
        <div className="card text-center py-16 px-4 space-y-2 border border-[#EBEBEB]">
          <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h4 className="font-bold text-slate-800 text-sm">No active site issues</h4>
          <p className="text-xs text-muted max-w-sm mx-auto">
            All clear! Report any shortages, damaged materials, safety concerns, or site access problems here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {issues.map((issue) => (
            <div
              key={issue.id}
              className="card p-5 border border-[#EBEBEB] space-y-3 flex flex-col justify-between hover:shadow-sm transition-shadow"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted tracking-wider">
                      {issue.category.replace('_', ' ')}
                    </span>
                    <h4 className="font-bold text-slate-900 text-sm leading-tight">{issue.title}</h4>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${PRIORITY_BADGES[issue.priority]}`}>
                      {issue.priority}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${STATUS_BADGES[issue.status]}`}>
                      {issue.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                {issue.description && (
                  <p className="text-xs text-slate-600 whitespace-pre-line bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    {issue.description}
                  </p>
                )}

                {issue.stage_name && (
                  <div className="text-[11px] text-muted">
                    Related Stage: <span className="font-semibold text-slate-700">{issue.stage_name}</span>
                  </div>
                )}

                {issue.resolution_notes && (
                  <div className="p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
                    <span className="font-bold block">Resolution Notes:</span>
                    <p className="whitespace-pre-line text-[11px]">{issue.resolution_notes}</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <div className="text-[11px] text-muted">
                  Assigned: <span className="font-semibold text-slate-700">{issue.assigned_to_name || 'Unassigned'}</span>
                  {issue.due_date && <span> • Due: {formatDateIST(issue.due_date)}</span>}
                </div>

                <button
                  onClick={() => { setSelectedIssue(issue); setResolutionModalOpen(true); }}
                  className="btn-secondary text-[11px] px-2.5 py-1 text-slate-800"
                >
                  Update &rarr;
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Issue Modal */}
      {showAddModal && (
        <AddIssueModal
          projectId={projectId}
          stages={stages}
          staff={staff}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); fetchIssues(); }}
        />
      )}

      {/* Update Issue Modal */}
      {resolutionModalOpen && selectedIssue && (
        <UpdateIssueModal
          projectId={projectId}
          issue={selectedIssue}
          staff={staff}
          onClose={() => setResolutionModalOpen(false)}
          onSuccess={() => { setResolutionModalOpen(false); fetchIssues(); }}
        />
      )}
    </div>
  );
}

function AddIssueModal({ projectId, stages, staff, onClose, onSuccess }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [priority, setPriority] = useState('medium');
  const [stageId, setStageId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return toast.error('Issue title is required');

    setSubmitting(true);
    try {
      await api.post(`/builder/projects/${projectId}/issues`, {
        title: title.trim(),
        description: description.trim() || null,
        category,
        priority,
        stage_id: stageId ? parseInt(stageId) : null,
        assigned_to: assignedTo ? parseInt(assignedTo) : null,
        due_date: dueDate || null,
      });

      toast.success('Site issue reported');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to report site issue');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
          <h4 className="font-bold text-slate-900 text-base">Report Site Issue / Blocker</h4>
          <button onClick={onClose} className="text-muted hover:text-slate-800 text-sm">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="font-semibold text-slate-700 block mb-1">Issue Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. 12mm rebar delivery delayed 3 days"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="input w-full"
              >
                <option value="shortage">Material Shortage</option>
                <option value="delayed_delivery">Delayed Delivery</option>
                <option value="damaged_material">Damaged Material</option>
                <option value="site_access">Site Access Problem</option>
                <option value="rework">Rework Required</option>
                <option value="safety">Safety Hazard</option>
                <option value="quality">Quality Snag</option>
                <option value="other">Other Impediment</option>
              </select>
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="input w-full font-semibold"
              >
                <option value="critical">Critical (Site Stoppage)</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Related Stage</label>
              <select
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                className="input w-full"
              >
                <option value="">None / General</option>
                {stages.map(s => (
                  <option key={s.id} value={s.id}>{s.stage_number}. {s.stage_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Assignee</label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="input w-full"
              >
                <option value="">Unassigned</option>
                {staff.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="input w-full"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Description & Details</label>
            <textarea
              rows="3"
              placeholder="Describe impact on schedule, quantity involved, root cause..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input w-full"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className="btn-secondary px-3.5 py-1.5">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary px-4 py-1.5">
              {submitting ? 'Submitting...' : 'Report Issue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UpdateIssueModal({ projectId, issue, staff, onClose, onSuccess }) {
  const [status, setStatus] = useState(issue.status);
  const [assignedTo, setAssignedTo] = useState(issue.assigned_to || '');
  const [priority, setPriority] = useState(issue.priority);
  const [resolutionNotes, setResolutionNotes] = useState(issue.resolution_notes || '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.patch(`/builder/projects/${projectId}/issues/${issue.id}`, {
        status,
        assigned_to: assignedTo ? parseInt(assignedTo) : null,
        priority,
        resolution_notes: resolutionNotes.trim() || null,
      });

      toast.success('Site issue updated');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update issue');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
          <div>
            <h4 className="font-bold text-slate-900 text-base">Update Site Issue</h4>
            <div className="text-[11px] text-muted truncate max-w-xs">{issue.title}</div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-slate-800 text-sm">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="input w-full font-bold"
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="input w-full font-semibold"
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Assigned Person</label>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="input w-full"
            >
              <option value="">Unassigned</option>
              {staff.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Resolution / Action Notes</label>
            <textarea
              rows="3"
              placeholder="Action taken to unblock site or snag fix details..."
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              className="input w-full"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className="btn-secondary px-3.5 py-1.5">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary px-4 py-1.5">
              {submitting ? 'Updating...' : 'Update Issue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
