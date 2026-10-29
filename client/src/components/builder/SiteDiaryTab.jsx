// client/src/components/builder/SiteDiaryTab.jsx
// Construction Site Daily Diary
// Log daily execution progress, work areas, stages, and issues

import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { formatDateIST } from '../../utils/time';

export default function SiteDiaryTab({ projectId, stages = [] }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDateFilter, setSelectedDateFilter] = useState('');

  const fetchDiary = useCallback(async () => {
    setLoading(true);
    try {
      const url = selectedDateFilter
        ? `/builder/projects/${projectId}/diary?date=${selectedDateFilter}`
        : `/builder/projects/${projectId}/diary`;
      const res = await api.get(url);
      setEntries(res.data.diary_entries || []);
    } catch (err) {
      console.error('Failed to load site diary:', err);
      toast.error('Failed to load site diary');
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedDateFilter]);

  useEffect(() => {
    fetchDiary();
  }, [fetchDiary]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#EBEBEB]">
        <div>
          <h3 className="text-xl font-bold text-[#1A1A1A] font-heading">Site Diary</h3>
          <p className="text-xs text-muted mt-0.5">Daily record of physical construction execution, work areas and impediments.</p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDateFilter}
            onChange={(e) => setSelectedDateFilter(e.target.value)}
            className="input text-xs py-1.5 px-3"
            title="Filter by date"
          />
          {selectedDateFilter && (
            <button
              onClick={() => setSelectedDateFilter('')}
              className="text-xs text-muted hover:text-slate-800"
            >
              Clear
            </button>
          )}

          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary text-xs px-3.5 py-2 font-semibold flex items-center gap-1.5 shadow-sm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Diary Entry
          </button>
        </div>
      </div>

      {/* Diary Entries List */}
      {loading ? (
        <div className="py-16 text-center text-muted text-xs space-y-2">
          <div className="w-6 h-6 border-2 border-[#E05A1E] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <div>Loading site diary entries...</div>
        </div>
      ) : entries.length === 0 ? (
        <div className="card text-center py-16 px-4 space-y-2 border border-[#EBEBEB]">
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <h4 className="font-bold text-slate-800 text-sm">No site diary logs recorded</h4>
          <p className="text-xs text-muted max-w-sm mx-auto">
            Site supervisors can log daily progress, completed tasks, work areas, and tomorrow&apos;s schedule.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map((item) => (
            <div key={item.id} className="card p-5 border border-[#EBEBEB] space-y-3 hover:shadow-sm transition-shadow">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-900">{formatDateIST(item.report_date)}</span>
                  {item.stage_name && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-50 text-[#E05A1E] border border-orange-200">
                      {item.stage_name}
                    </span>
                  )}
                  {item.work_area && (
                    <span className="text-xs text-muted">📍 {item.work_area}</span>
                  )}
                </div>
                <div className="text-xs text-muted">
                  Recorded by <span className="font-semibold text-slate-700">{item.recorded_by_name || 'Site Supervisor'}</span>
                </div>
              </div>

              {/* Work Completed */}
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Work Completed:</span>
                <p className="text-xs text-slate-800 whitespace-pre-line bg-slate-50 p-3 rounded-lg border border-slate-100">
                  {item.work_completed}
                </p>
              </div>

              {/* Next day plan & Issues grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {item.next_day_plan && (
                  <div className="p-3 rounded-lg bg-emerald-50/50 border border-emerald-100 text-xs">
                    <span className="font-bold text-emerald-800 block mb-1">Plan for Tomorrow:</span>
                    <p className="text-slate-700 whitespace-pre-line">{item.next_day_plan}</p>
                  </div>
                )}
                {item.issues_delays && (
                  <div className="p-3 rounded-lg bg-rose-50/50 border border-rose-100 text-xs">
                    <span className="font-bold text-rose-800 block mb-1">Issues & Delays:</span>
                    <p className="text-slate-700 whitespace-pre-line">{item.issues_delays}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Diary Modal */}
      {showAddModal && (
        <AddDiaryModal
          projectId={projectId}
          stages={stages}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); fetchDiary(); }}
        />
      )}
    </div>
  );
}

function AddDiaryModal({ projectId, stages, onClose, onSuccess }) {
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [workCompleted, setWorkCompleted] = useState('');
  const [workArea, setWorkArea] = useState('');
  const [stageId, setStageId] = useState('');
  const [issuesDelays, setIssuesDelays] = useState('');
  const [nextDayPlan, setNextDayPlan] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!workCompleted.trim()) return toast.error('Work completed details are required');

    setSubmitting(true);
    try {
      await api.post(`/builder/projects/${projectId}/diary`, {
        report_date: reportDate,
        work_completed: workCompleted.trim(),
        work_area: workArea.trim() || null,
        stage_id: stageId ? parseInt(stageId) : null,
        issues_delays: issuesDelays.trim() || null,
        next_day_plan: nextDayPlan.trim() || null,
      });

      toast.success('Site diary recorded successfully');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to record site diary');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
          <h4 className="font-bold text-slate-900 text-base">New Site Diary Entry</h4>
          <button onClick={onClose} className="text-muted hover:text-slate-800 text-sm">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Date *</label>
              <input
                type="date"
                required
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="input w-full"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Related Stage</label>
              <select
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                className="input w-full"
              >
                <option value="">General construction</option>
                {stages.map(s => (
                  <option key={s.id} value={s.id}>{s.stage_number}. {s.stage_name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Work Area / Grid / Elevation</label>
            <input
              type="text"
              placeholder="e.g. Ground Floor East Wing / Plinth Beam Grids A-D"
              value={workArea}
              onChange={(e) => setWorkArea(e.target.value)}
              className="input w-full"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Work Completed Today *</label>
            <textarea
              rows="3"
              required
              placeholder="Detail concrete pouring, reinforcement bar tying, shuttering de-staging, plaster curing..."
              value={workCompleted}
              onChange={(e) => setWorkCompleted(e.target.value)}
              className="input w-full"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Plan for Tomorrow</label>
            <textarea
              rows="2"
              placeholder="Next sequence of works, labor deployment, materials required on site..."
              value={nextDayPlan}
              onChange={(e) => setNextDayPlan(e.target.value)}
              className="input w-full"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Site Issues / Delays (if any)</label>
            <textarea
              rows="2"
              placeholder="Labor shortage, power cut, equipment breakdown..."
              value={issuesDelays}
              onChange={(e) => setIssuesDelays(e.target.value)}
              className="input w-full"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className="btn-secondary px-3.5 py-1.5">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary px-4 py-1.5">
              {submitting ? 'Saving...' : 'Save Diary Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
