import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../api/client';
import { formatDateIST } from '../../utils/time';
import toast from 'react-hot-toast';

export default function RequestKanbanBoard({ 
  onSwitchToSchedule = null,
  isAdmin = true 
}) {
  const [data, setData] = useState({
    kanban: {
      pending: [],
      active_today: [],
      upcoming: [],
      resolved: []
    },
    counts: {
      all: 0,
      leaves: 0,
      half_day: 0,
      advance: 0,
      resignation: 0
    }
  });
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all'); // 'all' | 'leaves' | 'half_day' | 'advance' | 'resignation'
  const [processingId, setProcessingId] = useState(null);

  const fetchKanban = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/leaves?view=kanban');
      if (res.data?.kanban) {
        setData(res.data);
      }
    } catch (err) {
      console.error('[RequestKanbanBoard] Fetch failed:', err);
      toast.error('Failed to load request kanban');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKanban();
  }, [fetchKanban]);

  // Handle Approve / Reject action with optimistic update
  const handleAction = async (requestId, newStatus) => {
    if (processingId) return;
    setProcessingId(requestId);

    // Snapshot state for rollback
    const prevData = JSON.parse(JSON.stringify(data));

    // Optimistically update local state
    const targetItem = data.kanban.pending.find(item => item.id === requestId);
    if (targetItem) {
      const updatedItem = { ...targetItem, status: newStatus };
      const newPending = data.kanban.pending.filter(item => item.id !== requestId);
      let newUpcoming = [...data.kanban.upcoming];
      let newResolved = [...data.kanban.resolved];

      if (newStatus === 'approved') {
        newUpcoming.push(updatedItem);
      } else {
        newResolved.unshift(updatedItem);
      }

      setData(prev => ({
        ...prev,
        kanban: {
          ...prev.kanban,
          pending: newPending,
          upcoming: newUpcoming,
          resolved: newResolved
        }
      }));
    }

    try {
      await api.patch(`/leaves/${requestId}`, { status: newStatus });
      toast.success(`Request ${newStatus === 'approved' ? 'approved' : 'rejected'} successfully`);
      // Refresh to ensure full server synchronization
      fetchKanban();
    } catch (err) {
      console.error('[RequestKanbanBoard] Action failed:', err);
      setData(prevData);
      const msg = err.response?.data?.error || err.response?.data?.details || 'Failed to update request';
      toast.error(msg);
    } finally {
      setProcessingId(null);
    }
  };

  // Filter requests based on activeCategory
  const matchesCategory = useCallback((item) => {
    if (activeCategory === 'all') return true;
    const type = (item.type || '').toLowerCase();
    if (activeCategory === 'half_day') return type === 'half_day';
    if (activeCategory === 'advance') return type === 'advance';
    if (activeCategory === 'resignation') return type === 'resignation';
    if (activeCategory === 'leaves') {
      return type !== 'half_day' && type !== 'advance' && type !== 'resignation';
    }
    return true;
  }, [activeCategory]);

  const filteredColumns = useMemo(() => {
    const { kanban } = data;
    return {
      pending: (kanban.pending || []).filter(matchesCategory),
      active_today: (kanban.active_today || []).filter(matchesCategory),
      upcoming: (kanban.upcoming || []).filter(matchesCategory),
      resolved: (kanban.resolved || []).filter(matchesCategory),
    };
  }, [data, matchesCategory]);

  const columnsConfig = [
    {
      key: 'pending',
      label: 'Pending Review',
      icon: '⏳',
      badgeBg: 'bg-amber-100 text-amber-800',
      columnBg: 'bg-amber-50/40 border-amber-200/70',
      headerBorder: 'border-amber-200',
      headerText: 'text-amber-900',
      count: filteredColumns.pending.length
    },
    {
      key: 'active_today',
      label: 'Active Today',
      icon: '🌴',
      badgeBg: 'bg-emerald-100 text-emerald-800',
      columnBg: 'bg-emerald-50/30 border-emerald-200/70',
      headerBorder: 'border-emerald-200',
      headerText: 'text-emerald-900',
      count: filteredColumns.active_today.length
    },
    {
      key: 'upcoming',
      label: 'Upcoming / Scheduled',
      icon: '📅',
      badgeBg: 'bg-violet-100 text-violet-800',
      columnBg: 'bg-violet-50/30 border-violet-200/70',
      headerBorder: 'border-violet-200',
      headerText: 'text-violet-900',
      count: filteredColumns.upcoming.length
    },
    {
      key: 'resolved',
      label: 'Resolved / History',
      icon: '📁',
      badgeBg: 'bg-slate-100 text-slate-700',
      columnBg: 'bg-slate-50/50 border-slate-200/70',
      headerBorder: 'border-slate-200',
      headerText: 'text-slate-800',
      count: filteredColumns.resolved.length
    }
  ];

  // Helper for Leave Type Badges
  const getBadgeDetails = (type) => {
    const t = (type || '').toLowerCase();
    switch (t) {
      case 'advance':
        return { label: 'Salary Advance', icon: '💰', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'resignation':
        return { label: 'Resignation Notice', icon: '📝', color: 'bg-rose-50 text-rose-700 border-rose-200' };
      case 'half_day':
        return { label: 'Half Day', icon: '⏱️', color: 'bg-amber-50 text-amber-800 border-amber-200' };
      case 'sick':
        return { label: 'Sick Leave', icon: '🩺', color: 'bg-rose-50 text-rose-700 border-rose-200' };
      case 'emergency':
        return { label: 'Emergency Leave', icon: '🚨', color: 'bg-orange-50 text-orange-700 border-orange-200' };
      case 'unpaid':
        return { label: 'Unpaid Leave', icon: '📄', color: 'bg-slate-100 text-slate-700 border-slate-200' };
      default:
        return { label: 'Casual Leave', icon: '🌴', color: 'bg-violet-50 text-violet-700 border-violet-200' };
    }
  };

  // Helper for calculating day duration
  const getDurationString = (startDate, endDate) => {
    if (!startDate) return '';
    if (!endDate || startDate === endDate) return '1 day';
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return `${diffDays} days`;
  };

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">📋</span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-slate-900 tracking-tight">All Requests Kanban</h3>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
                {data.counts.all || 0} Total
              </span>
              {onSwitchToSchedule && (
                <button
                  type="button"
                  onClick={onSwitchToSchedule}
                  className="px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:text-slate-900 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100 transition-colors"
                  title="Switch to compact Leave Schedule view"
                >
                  🌴 Schedule View
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              Unified operational workflow for leaves, advances &amp; resignations
            </p>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-thin text-[11px] font-bold bg-slate-100/80 p-1 rounded-xl">
          {[
            { key: 'all', label: 'All', count: data.counts.all },
            { key: 'leaves', label: '🌴 Leaves', count: data.counts.leaves },
            { key: 'half_day', label: '⏱️ Half Day', count: data.counts.half_day },
            { key: 'advance', label: '💰 Advance', count: data.counts.advance },
            { key: 'resignation', label: '📝 Resignation', count: data.counts.resignation },
          ].map(filter => (
            <button
              key={filter.key}
              onClick={() => setActiveCategory(filter.key)}
              className={`px-2.5 py-1 rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 ${
                activeCategory === filter.key
                  ? 'bg-white text-slate-900 font-black shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>{filter.label}</span>
              <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                activeCategory === filter.key ? 'bg-slate-100 text-slate-700' : 'bg-slate-200/60 text-slate-500'
              }`}>
                {filter.count || 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 animate-pulse">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-72 rounded-xl bg-slate-50 border border-slate-100 p-3">
              <div className="h-5 bg-slate-200 rounded w-1/2 mb-3" />
              <div className="space-y-2">
                <div className="h-20 bg-slate-100 rounded-lg" />
                <div className="h-20 bg-slate-100 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Kanban Columns */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {columnsConfig.map(col => {
            const items = filteredColumns[col.key] || [];

            return (
              <div
                key={col.key}
                className={`flex flex-col rounded-xl border ${col.columnBg} overflow-hidden min-h-[420px] max-h-[580px]`}
              >
                {/* Column Header */}
                <div className={`p-2.5 border-b ${col.headerBorder} bg-white/70 backdrop-blur-sm flex items-center justify-between`}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">{col.icon}</span>
                    <span className={`text-[11px] font-black uppercase tracking-wider ${col.headerText}`}>
                      {col.label}
                    </span>
                  </div>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${col.badgeBg}`}>
                    {items.length}
                  </span>
                </div>

                {/* Column Body / Cards List */}
                <div className="flex-1 p-2 space-y-2.5 overflow-y-auto scrollbar-thin">
                  {items.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 italic text-[11px]">
                      No {col.label.toLowerCase()}
                    </div>
                  ) : (
                    items.map(item => {
                      const badge = getBadgeDetails(item.type);
                      const initials = item.user_name
                        ? item.user_name.trim().split(/\s+/).map(n => n[0]).join('').substring(0, 2).toUpperCase()
                        : '??';
                      const isPending = (item.status || '').toLowerCase() === 'pending';
                      const isRejected = (item.status || '').toLowerCase() === 'rejected';
                      const isApproved = (item.status || '').toLowerCase() === 'approved';

                      return (
                        <div
                          key={item.id}
                          className="bg-white border border-slate-100 hover:border-slate-200 rounded-xl p-3 shadow-xs hover:shadow-md transition-all group"
                        >
                          {/* Card Header: User avatar + details */}
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 font-extrabold text-[10px] flex items-center justify-center flex-shrink-0 border border-violet-200">
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-black text-slate-900 truncate leading-tight">
                                  {item.user_name}
                                </p>
                                {item.department && (
                                  <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">
                                    {item.department}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Request Type Badge */}
                            <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider border flex-shrink-0 flex items-center gap-1 ${badge.color}`}>
                              <span>{badge.icon}</span>
                              <span>{badge.label}</span>
                            </span>
                          </div>

                          {/* Specific Content by Request Type */}
                          <div className="bg-slate-50/70 rounded-lg p-2 border border-slate-100 text-[11px] mb-2 space-y-1">
                            {item.type === 'advance' ? (
                              <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Requested Advance</p>
                                <p className="text-sm font-extrabold text-emerald-600 font-mono">
                                  ₹{Number(item.amount || 0).toLocaleString('en-IN')}
                                </p>
                              </div>
                            ) : item.type === 'resignation' ? (
                              <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Proposed Last Working Day</p>
                                <p className="font-bold text-slate-800">
                                  📅 {formatDateIST(item.start_date)}
                                </p>
                              </div>
                            ) : (
                              <div>
                                <div className="flex items-center justify-between">
                                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                    {item.type === 'half_day' ? 'Half Day Date' : 'Duration'}
                                  </p>
                                  {item.type !== 'half_day' && (
                                    <span className="text-[9px] font-extrabold text-violet-600 bg-violet-50 px-1 py-0.2 rounded">
                                      {getDurationString(item.start_date, item.end_date)}
                                    </span>
                                  )}
                                </div>
                                <p className="font-bold text-slate-800 mt-0.5">
                                  📅 {formatDateIST(item.start_date)} {item.end_date && item.end_date !== item.start_date ? `to ${formatDateIST(item.end_date)}` : ''}
                                </p>
                              </div>
                            )}

                            {/* Reason Snippet */}
                            {item.reason && (
                              <p className="text-[10px] text-slate-600 italic line-clamp-2 pt-0.5 border-t border-slate-100/60">
                                "{item.reason}"
                              </p>
                            )}
                          </div>

                          {/* Footer: Date submitted & Status */}
                          <div className="flex items-center justify-between text-[9px] font-medium text-slate-400 pt-1">
                            <span>
                              {item.created_at ? formatDateIST(item.created_at) : ''}
                            </span>

                            {/* Status Indicator */}
                            <span className={`px-1.5 py-0.5 rounded font-black uppercase tracking-wider ${
                              isApproved ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                              isRejected ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                              'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              {item.status || 'Pending'}
                            </span>
                          </div>

                          {/* Quick Admin Actions (Approve / Reject) for Pending Column */}
                          {isPending && isAdmin && (
                            <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-100">
                              <button
                                type="button"
                                disabled={processingId === item.id}
                                onClick={() => handleAction(item.id, 'approved')}
                                className="flex-1 py-1 px-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-md text-[10px] font-black uppercase tracking-wider shadow-xs hover:shadow transition-all cursor-pointer"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={processingId === item.id}
                                onClick={() => handleAction(item.id, 'rejected')}
                                className="py-1 px-2 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 text-slate-600 border border-slate-200 disabled:opacity-50 rounded-md text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
