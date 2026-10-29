import React, { useState } from 'react';
import { formatDateIST } from '../../utils/time';

export default function TeamApprovedLeavesWidget({ 
  activeLeaves = [], 
  upcomingLeaves = [], 
  title = "Team Approved Leaves", 
  isAdmin = false,
  loading = false,
  onSwitchToKanban = null
}) {
  const [tab, setTab] = useState('active'); // 'active' | 'upcoming'

  const leaveLabel = (type) => {
    if (!type) return 'Leave';
    if (type === 'half_day') return 'Half Day';
    const clean = type.replace(/_leave$/i, '').replace('_', ' ');
    return clean.charAt(0).toUpperCase() + clean.slice(1) + ' Leave';
  };

  const getSubtypeColor = (type) => {
    switch (type) {
      case 'sick': return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'emergency': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'half_day': return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'unpaid': return 'bg-slate-100 text-slate-700 border-slate-200';
      default: return 'bg-violet-50 text-violet-700 border-violet-200';
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm animate-pulse">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
          <div className="h-5 bg-slate-200 rounded w-48" />
          <div className="h-7 bg-slate-100 rounded-lg w-36" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="h-16 bg-slate-50 border border-slate-100 rounded-xl" />
          <div className="h-16 bg-slate-50 border border-slate-100 rounded-xl" />
          <div className="h-16 bg-slate-50 border border-slate-100 rounded-xl" />
        </div>
      </div>
    );
  }

  const safeActive = Array.isArray(activeLeaves) ? activeLeaves : [];
  const safeUpcoming = Array.isArray(upcomingLeaves) ? upcomingLeaves : [];
  const activeCount = safeActive.length;
  const upcomingCount = safeUpcoming.length;
  const displayedLeaves = tab === 'active' ? safeActive : safeUpcoming;

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="text-base">🌴</span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-slate-900 tracking-tight">{title}</h3>
              {onSwitchToKanban && (
                <button
                  type="button"
                  onClick={onSwitchToKanban}
                  className="px-2 py-0.5 text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-100 rounded hover:bg-violet-100 transition-colors"
                  title="Switch to Request Kanban view"
                >
                  📋 Switch to Kanban
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              {isAdmin ? "Team active & upcoming leave schedule" : "Approved leave schedule of team members"}
            </p>
          </div>
        </div>
        
        {/* Tab pills */}
        <div className="flex items-center gap-1.5">
          <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg text-[10px] font-bold">
            <button
              onClick={() => setTab('active')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                tab === 'active' ? 'bg-white text-violet-700 font-black shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Active ({activeCount})
            </button>
            <button
              onClick={() => setTab('upcoming')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                tab === 'upcoming' ? 'bg-white text-emerald-700 font-black shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Upcoming ({upcomingCount})
            </button>
          </div>
        </div>
      </div>

      <div className="max-h-[360px] overflow-y-auto pr-1 scrollbar-thin">
        {displayedLeaves.length === 0 ? (
          <div className="py-6 text-center text-slate-400 italic text-xs">
            {tab === 'active' ? 'No colleagues on approved leave today' : 'No upcoming approved leaves scheduled'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {displayedLeaves.map((l) => {
              const initials = l.user_name 
                ? l.user_name.trim().split(/\s+/).map(n => n[0]).join('').substring(0, 2).toUpperCase() 
                : '??';

              const isApproved = (l.status || '').toLowerCase() === 'approved';
              const statusText = tab === 'active' 
                ? 'Active Today' 
                : (isApproved ? 'Approved' : (l.status ? l.status.charAt(0).toUpperCase() + l.status.slice(1) : 'Scheduled'));

              return (
                <div key={l.id} className="p-3 rounded-xl border border-slate-100 hover:border-slate-200 bg-slate-50/50 hover:bg-white transition-all flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 font-bold text-[10px] flex items-center justify-center flex-shrink-0 border border-violet-200">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-xs font-bold text-slate-900 truncate">{l.user_name}</p>
                        {l.department && (
                          <span className="text-[8px] font-black uppercase tracking-wider bg-slate-200/60 text-slate-600 px-1.5 py-0.2 rounded">
                            {l.department}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                        📅 {formatDateIST(l.start_date)} {l.end_date && l.end_date !== l.start_date ? `to ${formatDateIST(l.end_date)}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end flex-shrink-0 gap-1">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wide border ${getSubtypeColor(l.type)}`}>
                      {leaveLabel(l.type)}
                    </span>
                    <span className={`text-[9px] font-bold flex items-center gap-1 ${
                      isApproved || tab === 'active' ? 'text-emerald-600' : 'text-amber-600'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        isApproved || tab === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                      }`} />
                      {statusText}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
