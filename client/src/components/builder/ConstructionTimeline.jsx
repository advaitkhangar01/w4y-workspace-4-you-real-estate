// client/src/components/builder/ConstructionTimeline.jsx
// Construction Timeline in Project 360 Overview
// Connected sequence of 17 stages with detailed execution actions

import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { formatDateIST } from '../../utils/time';

const STATUS_CONFIG = {
  not_started: { label: 'Not Started', badgeCls: 'bg-slate-100 text-slate-600 border-slate-200', circleCls: 'bg-slate-200 border-slate-300 text-slate-500' },
  ready: { label: 'Ready to Start', badgeCls: 'bg-blue-50 text-blue-700 border-blue-200', circleCls: 'bg-blue-100 border-blue-400 text-blue-700' },
  in_progress: { label: 'In Progress', badgeCls: 'bg-orange-50 text-[#E05A1E] border-orange-200', circleCls: 'bg-[#E05A1E] border-[#E05A1E] text-white animate-pulse' },
  blocked: { label: 'Blocked', badgeCls: 'bg-rose-50 text-rose-700 border-rose-200', circleCls: 'bg-rose-600 border-rose-600 text-white' },
  completed: { label: 'Completed', badgeCls: 'bg-emerald-50 text-emerald-700 border-emerald-200', circleCls: 'bg-emerald-600 border-emerald-600 text-white' },
};

export default function ConstructionTimeline({ projectId, currentUser, isPrivileged }) {
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedStage, setSelectedStage] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Form states for stage action modal
  const [modalAction, setModalAction] = useState('view'); // 'view' | 'progress' | 'blocker' | 'dates'
  const [progressInput, setProgressInput] = useState(0);
  const [blockerInput, setBlockerInput] = useState('');
  const [plannedStartInput, setPlannedStartInput] = useState('');
  const [plannedFinishInput, setPlannedFinishInput] = useState('');
  const [overridePrereq, setOverridePrereq] = useState(false);

  const fetchStages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/builder/projects/${projectId}/stages`);
      setStages(res.data.stages || []);
    } catch (err) {
      console.error('Failed to load construction stages:', err);
      setError('Failed to load construction timeline. Please retry.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchStages();
  }, [fetchStages]);

  const handleOpenStage = (stage) => {
    setSelectedStage(stage);
    setProgressInput(stage.progress_pct || 0);
    setBlockerInput(stage.blocker_reason || '');
    setPlannedStartInput(stage.planned_start ? stage.planned_start.split('T')[0] : '');
    setPlannedFinishInput(stage.planned_finish ? stage.planned_finish.split('T')[0] : '');
    setOverridePrereq(false);
    setModalAction('view');
    setIsModalOpen(true);
  };

  const handleStageAction = async (actionType, extraData = {}) => {
    if (!selectedStage) return;
    setActionLoading(true);
    try {
      const payload = {
        action: actionType,
        allow_override: overridePrereq,
        ...extraData
      };

      const res = await api.patch(`/builder/projects/${projectId}/stages/${selectedStage.id}`, payload);
      const updated = res.data.stage;
      toast.success(`Stage ${updated.stage_number} updated`);

      // Update state
      setStages(prev => prev.map(s => s.id === updated.id ? updated : s));
      setSelectedStage(updated);
      setModalAction('view');
      fetchStages(); // Refresh dependencies
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.prerequisite_incomplete) {
        toast.error(errData.error || 'Prerequisite stage incomplete');
      } else {
        toast.error(errData?.error || 'Failed to update stage');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const overallProgress = Math.round(
    stages.length > 0 ? stages.reduce((acc, s) => acc + (s.progress_pct || 0), 0) / stages.length : 0
  );

  const completedStagesCount = stages.filter(s => s.status === 'completed').length;
  const inProgressStage = stages.find(s => s.status === 'in_progress');

  return (
    <div className="card p-5 space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#EBEBEB]">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-[#1A1A1A] font-heading">Construction Timeline</h3>
            <span className="badge badge-completed text-[11px] font-bold">17 Stages</span>
          </div>
          <p className="text-xs text-muted mt-0.5">Track each stage from execution start to final handover.</p>
        </div>

        {/* Progress summary banner */}
        <div className="flex items-center gap-4 bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2.5">
          <div className="text-right">
            <div className="text-[11px] text-muted font-medium">Timeline Progress</div>
            <div className="text-sm font-bold text-slate-800">{completedStagesCount} of {stages.length} Completed</div>
          </div>
          <div className="w-12 h-12 rounded-full border-4 border-slate-200 flex items-center justify-center relative font-bold text-xs text-[#E05A1E]">
            {overallProgress}%
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="py-12 text-center text-muted text-sm space-y-2">
          <div className="w-6 h-6 border-2 border-[#E05A1E] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <div>Loading construction stages...</div>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-between text-xs">
          <span>{error}</span>
          <button onClick={fetchStages} className="font-bold underline hover:text-rose-900">Retry</button>
        </div>
      )}

      {/* Timeline stages list */}
      {!loading && !error && stages.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {stages.map((stage) => {
              const cfg = STATUS_CONFIG[stage.status] || STATUS_CONFIG.not_started;
              const isSelected = selectedStage?.id === stage.id;

              return (
                <div
                  key={stage.id}
                  onClick={() => handleOpenStage(stage)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                    isSelected ? 'ring-2 ring-[#E05A1E] border-[#E05A1E]' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                  } ${stage.status === 'in_progress' ? 'bg-orange-50/20' : 'bg-white'}`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${cfg.circleCls}`}>
                          {stage.status === 'completed' ? '✓' : stage.stage_number}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${cfg.badgeCls}`}>
                          {cfg.label}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-slate-700">{stage.progress_pct}%</span>
                    </div>

                    <div className="font-semibold text-xs text-slate-800 line-clamp-1" title={stage.stage_name}>
                      {stage.stage_name}
                    </div>

                    {stage.blocker_reason && (
                      <div className="p-2 rounded bg-rose-50 border border-rose-200 text-[11px] text-rose-700 line-clamp-2">
                        <strong>Blocker:</strong> {stage.blocker_reason}
                      </div>
                    )}
                  </div>

                  {/* Dates & Assigned footer */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-muted">
                    <span>
                      {stage.actual_start ? `Started: ${formatDateIST(stage.actual_start)}` : (stage.planned_start ? `Plan: ${formatDateIST(stage.planned_start)}` : 'Not scheduled')}
                    </span>
                    <span className="text-[#E05A1E] font-medium hover:underline">Manage &rarr;</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stage Detail & Action Modal */}
      {isModalOpen && selectedStage && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${STATUS_CONFIG[selectedStage.status]?.circleCls}`}>
                  {selectedStage.status === 'completed' ? '✓' : selectedStage.stage_number}
                </span>
                <div>
                  <h4 className="text-base font-bold text-slate-900 leading-tight">{selectedStage.stage_name}</h4>
                  <p className="text-xs text-muted mt-0.5">Stage {selectedStage.stage_number} of 17</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-muted hover:text-slate-800 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Description */}
            {selectedStage.description && (
              <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                {selectedStage.description}
              </p>
            )}

            {/* Status & Timing Metadata */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl">
              <div>
                <span className="text-muted block">Current Status:</span>
                <span className="font-bold text-slate-800">{STATUS_CONFIG[selectedStage.status]?.label}</span>
              </div>
              <div>
                <span className="text-muted block">Completion:</span>
                <span className="font-bold text-slate-800">{selectedStage.progress_pct}%</span>
              </div>
              <div>
                <span className="text-muted block">Actual Start:</span>
                <span className="font-medium text-slate-700">{selectedStage.actual_start ? formatDateIST(selectedStage.actual_start) : 'Not started'}</span>
              </div>
              <div>
                <span className="text-muted block">Actual Finish:</span>
                <span className="font-medium text-slate-700">{selectedStage.actual_finish ? formatDateIST(selectedStage.actual_finish) : 'Incomplete'}</span>
              </div>
            </div>

            {/* Active Blocker Alert */}
            {selectedStage.blocker_reason && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-rose-900">
                  <span>⚠️ Site Blocker Active</span>
                </div>
                <p>{selectedStage.blocker_reason}</p>
                {selectedStage.blocker_reported_by_name && (
                  <div className="text-[10px] text-rose-600 pt-1">
                    Reported by {selectedStage.blocker_reported_by_name} on {formatDateIST(selectedStage.blocker_reported_at)}
                  </div>
                )}
              </div>
            )}

            {/* Interactive Action Forms based on modalAction */}
            {modalAction === 'progress' && (
              <div className="p-4 rounded-xl border border-orange-200 bg-orange-50/40 space-y-3">
                <label className="text-xs font-bold text-slate-800 block">
                  Update Progress: {progressInput}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={progressInput}
                  onChange={(e) => setProgressInput(parseInt(e.target.value))}
                  className="w-full accent-[#E05A1E]"
                />
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setModalAction('view')}
                    className="btn-secondary text-xs px-3 py-1.5"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleStageAction('update_progress', { progress_pct: progressInput })}
                    disabled={actionLoading}
                    className="btn-primary text-xs px-4 py-1.5"
                  >
                    {actionLoading ? 'Saving...' : 'Save Progress'}
                  </button>
                </div>
              </div>
            )}

            {modalAction === 'blocker' && (
              <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/40 space-y-3">
                <label className="text-xs font-bold text-rose-900 block">
                  Describe Blocker / Impediment
                </label>
                <textarea
                  rows="3"
                  value={blockerInput}
                  onChange={(e) => setBlockerInput(e.target.value)}
                  placeholder="e.g. Awaiting municipal approval or structural rebar delivery delayed..."
                  className="input text-xs w-full"
                />
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setModalAction('view')}
                    className="btn-secondary text-xs px-3 py-1.5"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleStageAction('report_blocker', { blocker_reason: blockerInput })}
                    disabled={actionLoading || !blockerInput.trim()}
                    className="bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs px-4 py-1.5"
                  >
                    {actionLoading ? 'Reporting...' : 'Confirm Blocker'}
                  </button>
                </div>
              </div>
            )}

            {modalAction === 'dates' && (
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Planned Start</label>
                    <input
                      type="date"
                      value={plannedStartInput}
                      onChange={(e) => setPlannedStartInput(e.target.value)}
                      className="input text-xs w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Planned Finish</label>
                    <input
                      type="date"
                      value={plannedFinishInput}
                      onChange={(e) => setPlannedFinishInput(e.target.value)}
                      className="input text-xs w-full"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setModalAction('view')}
                    className="btn-secondary text-xs px-3 py-1.5"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleStageAction('update_dates', { planned_start: plannedStartInput || null, planned_finish: plannedFinishInput || null })}
                    disabled={actionLoading}
                    className="btn-primary text-xs px-4 py-1.5"
                  >
                    {actionLoading ? 'Saving...' : 'Save Dates'}
                  </button>
                </div>
              </div>
            )}

            {/* Standard Action Buttons */}
            {modalAction === 'view' && (
              <div className="space-y-3 pt-2">
                {/* Override checkbox if starting when not completed */}
                {selectedStage.status === 'not_started' && selectedStage.stage_number > 1 && (
                  <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overridePrereq}
                      onChange={(e) => setOverridePrereq(e.target.checked)}
                      className="rounded border-slate-300 text-[#E05A1E] focus:ring-[#E05A1E]"
                    />
                    <span>Allow start even if previous stage is still pending</span>
                  </label>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setModalAction('dates')}
                    className="btn-secondary text-xs px-3 py-1.5"
                  >
                    Schedule Dates
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    {selectedStage.status === 'blocked' ? (
                      <button
                        onClick={() => handleStageAction('resolve_blocker')}
                        disabled={actionLoading}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs px-3.5 py-1.5"
                      >
                        {actionLoading ? 'Resolving...' : 'Resolve Blocker'}
                      </button>
                    ) : (
                      <button
                        onClick={() => setModalAction('blocker')}
                        className="text-rose-600 hover:text-rose-700 font-semibold text-xs px-3 py-1.5"
                      >
                        Report Blocker
                      </button>
                    )}

                    {(selectedStage.status === 'not_started' || selectedStage.status === 'ready') && (
                      <button
                        onClick={() => handleStageAction('start')}
                        disabled={actionLoading}
                        className="btn-primary text-xs px-4 py-1.5"
                      >
                        {actionLoading ? 'Starting...' : 'Start Stage'}
                      </button>
                    )}

                    {selectedStage.status === 'in_progress' && (
                      <>
                        <button
                          onClick={() => setModalAction('progress')}
                          className="btn-secondary text-xs px-3.5 py-1.5 text-slate-800"
                        >
                          Update Progress
                        </button>
                        <button
                          onClick={() => handleStageAction('complete')}
                          disabled={actionLoading}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs px-4 py-1.5"
                        >
                          {actionLoading ? 'Completing...' : 'Mark Complete'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
