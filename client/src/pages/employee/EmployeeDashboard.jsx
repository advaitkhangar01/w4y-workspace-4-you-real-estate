/* eslint-disable react-hooks/set-state-in-effect, no-unused-vars */
// client/src/pages/employee/EmployeeDashboard.jsx
// Employee dashboard: check-in/out, my tasks, my projects

import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import { formatTimeIST, todayIST, isTaskOverdue, getTaskOverdueDays, formatDateIST } from '../../utils/time';
import { mapAttendance } from '../../utils/attendance';
import AttendanceCard from '../../components/ui/AttendanceCard';
import toast from 'react-hot-toast';
import TaskModal from '../../components/projects/TaskModal';
import KanbanBoard from '../../components/dashboard/KanbanBoard';
import SalaryBreakdownModal from '../../components/dashboard/SalaryBreakdownModal';
import TeamApprovedLeavesWidget from '../../components/dashboard/TeamApprovedLeavesWidget';
import { getPosition, classifyZone, ZONE_CONFIG } from '../../utils/geofence';
import { createPortal } from 'react-dom';

// --- New Compact Components ---

function QuickStats({ salary, onCardClick }) {
  const earnedAmount = Math.round(Number(salary?.earned_this_month || 0));
  const deductedAmount = Math.round(Number(salary?.deductions_this_month || 0));
  const todayEarned = Math.round(Number(salary?.today_earned || 0));
  const todayDeductions = Math.round(Number(salary?.today_deductions || 0));
  const currentNet = salary?.current_net_payable !== undefined 
    ? Math.round(Number(salary.current_net_payable)) 
    : (salary?.net_salary_payable !== undefined ? Math.round(Number(salary.net_salary_payable)) : (earnedAmount - deductedAmount));
  const projectedMonthEnd = salary?.projected_month_end_net !== undefined 
    ? Math.round(Number(salary.projected_month_end_net)) 
    : (salary?.projected_net_salary !== undefined ? Math.round(Number(salary.projected_net_salary)) : null);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Earnings Card — click opens modal on Earnings tab */}
      <button
        type="button"
        onClick={() => onCardClick('earnings')}
        className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm hover:shadow-md hover:border-emerald-200 hover:ring-2 hover:ring-emerald-100 transition-all text-left w-full group cursor-pointer"
      >
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
          Earnings (This Month)
          <svg className="w-3 h-3 ml-auto text-slate-200 group-hover:text-emerald-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </p>
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-black text-slate-900 font-mono tracking-tight">₹{earnedAmount.toLocaleString('en-IN')}</span>
          <span className={`text-[10px] font-bold font-mono ${
            todayEarned > 0 ? 'text-emerald-500' : 'text-slate-300'
          }`}>
            {todayEarned > 0 ? `+₹${todayEarned.toLocaleString('en-IN')} today` : 'Not checked in'}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-black font-mono">
          <span className="text-slate-600">
            Net Payable: <span className="text-emerald-700">₹{currentNet.toLocaleString('en-IN')}</span>
          </span>
          {salary?.is_month_in_progress && projectedMonthEnd !== null && (
            <span className="text-slate-400 font-normal">
              · Projected: <span className="text-slate-600 font-bold">₹{projectedMonthEnd.toLocaleString('en-IN')}</span>
            </span>
          )}
        </div>
        <p className="text-[9px] text-slate-300 mt-1.5 group-hover:text-emerald-400 transition-colors font-bold uppercase tracking-widest">Click for full breakdown →</p>
      </button>

      {/* Deductions Card — click opens modal on Deductions tab */}
      <button
        type="button"
        onClick={() => onCardClick('deductions')}
        className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm hover:shadow-md hover:border-amber-200 hover:ring-2 hover:ring-amber-100 transition-all text-left w-full group cursor-pointer relative"
      >
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
          Penalties & Deductions
          <svg className="w-3 h-3 ml-auto text-slate-200 group-hover:text-amber-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </p>
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-black text-amber-600 font-mono tracking-tight">₹{deductedAmount.toLocaleString('en-IN')}</span>
          {todayDeductions > 0 && (
            <span className="text-[10px] font-bold text-amber-400 font-mono">+₹{todayDeductions.toLocaleString('en-IN')} today</span>
          )}
        </div>
        <p className="text-[10px] text-slate-400 mt-1 leading-tight">
          {[salary?.leaves_count > 0 && `${salary.leaves_count} leave`, salary?.late_count > 0 && `${salary.late_count} late`, salary?.half_day_count > 0 && `${salary.half_day_count} half-day`, salary?.unmarked_absent_count > 0 && `${salary.unmarked_absent_count} absent`].filter(Boolean).join(' · ') || 'Leaves, late arrivals & half days'}
        </p>
        <p className="text-[9px] text-slate-300 mt-1 group-hover:text-amber-400 transition-colors font-bold uppercase tracking-widest">Click for full breakdown →</p>
      </button>
    </div>
  );
}


// ─── Zone Badge ──────────────────────────────────────────────────────────────
function ZoneBadge({ zone, distance }) {
  if (!zone || zone === 'unknown') return null;
  const cfg = ZONE_CONFIG[zone] || ZONE_CONFIG.outside;
  return (
    <span
      style={{
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
      }}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest"
    >
      <span>{cfg.dot}</span>
      {cfg.label}
      {distance != null && <span className="font-mono opacity-70">· {distance}m</span>}
    </span>
  );
}

// ─── GPS Status Indicator ─────────────────────────────────────────────────────
function GpsStatusDot({ state }) {
  // state: 'idle' | 'fetching' | 'ok' | 'error'
  const colors = {
    idle:     'bg-slate-600',
    fetching: 'bg-amber-400 animate-pulse',
    ok:       'bg-emerald-500',
    error:    'bg-red-500',
  };
  const labels = {
    idle:     'GPS idle',
    fetching: 'Getting location…',
    ok:       'Location acquired',
    error:    'GPS unavailable',
  };
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`w-1.5 h-1.5 rounded-full ${colors[state] || colors.idle}`} />
      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{labels[state]}</span>
    </span>
  );
}

// ─── AttendanceStatus ─────────────────────────────────────────────────────────
function AttendanceStatus({ attendance, todayStatus, onAction }) {
  const [loading,   setLoading ]  = useState(false);
  const [gpsState,  setGpsState]  = useState('idle'); // 'idle' | 'fetching' | 'ok' | 'error'
  const [lastZone,  setLastZone]  = useState(attendance?.checkinZone || null);
  const [lastDist,  setLastDist]  = useState(attendance?.checkinDistance || null);

  const hasIn  = !!attendance?.checkIn;
  const hasOut = !!attendance?.checkOut;

  // Sync zone/distance from existing attendance (on mount / refresh)
  useEffect(() => {
    if (attendance?.checkinZone)     setLastZone(attendance.checkinZone);
    if (attendance?.checkinDistance) setLastDist(attendance.checkinDistance);
  }, [attendance]);

  async function handleCheck(type) {
    setLoading(true);
    try {
      if (type === 'in') {
        // ── Step 1: Acquire GPS ──────────────────────────────────────────────
        setGpsState('fetching');
        let coords = {};
        try {
          coords = await getPosition({ enableHighAccuracy: true, timeout: 10000 });
          setGpsState('ok');
        } catch (_) {
          setGpsState('error');
          // Continue without location — server will reject if geo-fence is ON
          toast('📡 Could not get GPS. Trying without location…', { duration: 3000 });
        }

        // ── Step 2: POST check-in ────────────────────────────────────────────
        const { data } = await api.post('/attendance/checkin', coords);

        // ── Step 3: Zone-aware toast ─────────────────────────────────────────
        const zone = data.zone;
        if (zone === 'buffer') {
          toast(
            <div>
              <p className="font-bold text-sm">🟡 Checked In (Boundary)</p>
              <p className="text-xs text-gray-500 mt-0.5">{data.geoMessage || 'GPS variation detected'}</p>
            </div>,
            { duration: 5000, style: { border: '1px solid #fde68a' } }
          );
        } else {
          toast.success('✅ Checked in successfully!');
        }

        setLastZone(zone);
        setLastDist(data.distance);

      } else {
        // ── Checkout: capture location silently ──────────────────────────────
        setGpsState('fetching');
        let coords = {};
        try {
          coords = await getPosition({ enableHighAccuracy: false, timeout: 6000 });
          setGpsState('ok');
        } catch (_) {
          setGpsState('idle');
        }

        const { data } = await api.post('/attendance/checkout', coords);

        if (data.checkoutOutsideZone) {
          toast(
            <div>
              <p className="font-bold text-sm">👋 Checked Out</p>
              <p className="text-xs text-amber-600 mt-0.5">Outside office location</p>
            </div>,
            { duration: 4000 }
          );
        } else {
          toast.success('👋 Checked out successfully!');
        }
      }

      onAction();
    } catch (err) {
      setGpsState('idle');
      const errData = err.response?.data;
      const reason  = errData?.reason;

      if (reason === 'outside_zone') {
        toast.error(`❌ ${errData.error || 'You are outside allowed office location'}`, { duration: 5000 });
      } else if (reason === 'low_accuracy') {
        toast.error(`📡 ${errData.error || 'GPS signal too weak. Move to open area.'}`, { duration: 5000 });
      } else if (reason === 'no_location') {
        toast.error('📍 Enable GPS to check in', { duration: 4000 });
      } else {
        toast.error(errData?.error || 'Operation failed');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-slate-900 text-white rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
      <div className="flex items-center gap-4">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
          hasIn ? 'border-emerald-500/50 text-emerald-500' : 'border-slate-700 text-slate-500'
        }`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Attendance Status</p>
          <p className="text-xs font-bold uppercase tracking-tight">
            {!hasIn ? (
              todayStatus === 'sunday' ? 'Sunday (Weekly Off)' :
              todayStatus === 'holiday' ? 'Holiday' :
              todayStatus === 'leave' ? 'On Approved Leave' :
              'Not Checked In'
            ) : hasOut ? 'Day Completed' : 'Shift Active'}
          </p>
          {/* Zone badge shown after check-in */}
          {hasIn && lastZone && (
            <div className="mt-1">
              <ZoneBadge zone={lastZone} distance={lastDist} />
            </div>
          )}
          {/* GPS state shown while fetching */}
          {loading && <div className="mt-1"><GpsStatusDot state={gpsState} /></div>}
        </div>
        <div className="h-8 w-px bg-slate-800 mx-2 hidden md:block" />
        <div className="hidden md:flex gap-4">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase">In</p>
            <p className="text-xs font-mono font-black">{hasIn ? formatTimeIST(attendance.checkIn) : '--:--'}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase">Out</p>
            <p className="text-xs font-mono font-black">{hasOut ? formatTimeIST(attendance.checkOut) : '--:--'}</p>
          </div>
        </div>
        <div className="h-8 w-px bg-slate-800 mx-2 hidden md:block" />
        <Link 
          to="/attendance" 
          className="group/link flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/50 hover:bg-slate-800 transition-all border border-slate-700/50 hover:border-slate-600"
        >
          <div className="text-right hidden sm:block">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest group-hover/link:text-emerald-500 transition-colors">Leaves & History</p>
            <p className="text-[10px] font-bold text-slate-300">View All</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center text-slate-400 group-hover/link:text-white transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </div>
        </Link>
      </div>

      <div className="flex gap-2 w-full md:w-auto">
        <button
          onClick={() => handleCheck('in')}
          disabled={hasIn || loading}
          className="flex-1 md:flex-none px-6 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-emerald-500/20"
        >
          {loading && !hasIn ? '⏳ Getting GPS…' : 'Check In'}
        </button>
        <button
          onClick={() => handleCheck('out')}
          disabled={!hasIn || hasOut || loading}
          className="flex-1 md:flex-none px-6 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all"
        >
          {loading && hasIn ? '…' : 'Check Out'}
        </button>
      </div>
    </div>
  );
}

function TeamAttendanceCompact({ records }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Helper status counts
  const totalCount = records.length;
  const activeCount = records.filter(r => r.status === 'working').length;
  const completedCount = records.filter(r => r.status === 'completed' || r.status === 'half_day').length;
  const awayCount = records.filter(r => 
    ['leave', 'absent', 'away'].includes(r.status) || (!r.checkIn && r.status !== 'leave')
  ).length;

  // Filter records
  const filteredRecords = records.filter(r => {
    // Search filter
    const matchesSearch = r.name ? r.name.toLowerCase().includes(searchTerm.toLowerCase()) : false;
    if (!matchesSearch) return false;

    // Status filter
    if (statusFilter === 'active') return r.status === 'working';
    if (statusFilter === 'completed') return r.status === 'completed' || r.status === 'half_day';
    if (statusFilter === 'away') return ['leave', 'absent', 'away'].includes(r.status) || (!r.checkIn && r.status !== 'leave');
    
    return true; // 'all'
  });

  // Sort records: Active working first, then completed/half-day, then away/leave/absent
  const getSortOrder = (status) => {
    switch (status) {
      case 'working': return 1;
      case 'completed': return 2;
      case 'half_day': return 3;
      case 'leave': return 4;
      case 'absent': return 5;
      default: return 6;
    }
  };

  const sortedRecords = [...filteredRecords].sort((a, b) => getSortOrder(a.status) - getSortOrder(b.status));

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col h-full min-h-[460px]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Team Today</h3>
          <p className="text-[10px] text-slate-400 mt-0.5">Real-time attendance list</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </span>
      </div>

      {/* Search Input */}
      <div className="relative mb-3">
        <input
          type="text"
          placeholder="Search team member..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#E05A1E]/40 focus:bg-white text-slate-700 placeholder-slate-400 font-medium transition-all"
        />
        <svg
          className="absolute left-2.5 top-2.5 text-slate-400"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-[11px] font-bold"
          >
            ✕
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1 scrollbar-none">
        {[
          { key: 'all', label: 'All', count: totalCount },
          { key: 'active', label: 'Active', count: activeCount },
          { key: 'completed', label: 'Done', count: completedCount },
          { key: 'away', label: 'Away', count: awayCount },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all whitespace-nowrap active:scale-95 ${
              statusFilter === tab.key
                ? 'bg-slate-900 border-slate-900 text-white font-black shadow-sm'
                : 'bg-white hover:bg-slate-50 border-slate-100 text-slate-600'
            }`}
          >
            <span>{tab.label}</span>
            <span className={`px-1 py-0.2 rounded-md text-[8px] font-mono ${
              statusFilter === tab.key ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-500'
            }`}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Cards List */}
      <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar flex-1">
        {sortedRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center mb-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-slate-300">
                <circle cx="12" cy="12" r="10" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </div>
            <p className="text-[11px] font-bold text-slate-500">No team members found</p>
            <p className="text-[9px] text-slate-400 mt-0.5">Try adjusting your filters or search term</p>
          </div>
        ) : (
          sortedRecords.map(r => {
            const initials = r.name ? r.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '??';
            const displayName = r.name ? r.name.split(' ').slice(0, 2).join(' ') : 'Staff';
            
            const statusColors = {
              working:   { ring: 'border-emerald-500', dot: 'bg-emerald-500', bg: 'bg-emerald-50/50 text-emerald-700' },
              completed: { ring: 'border-blue-500', dot: 'bg-blue-500', bg: 'bg-blue-50/50 text-blue-700' },
              half_day:  { ring: 'border-amber-500', dot: 'bg-amber-500', bg: 'bg-amber-50/50 text-amber-700' },
              leave:     { ring: 'border-purple-500', dot: 'bg-purple-500', bg: 'bg-purple-50/50 text-purple-700' },
              absent:    { ring: 'border-slate-300', dot: 'bg-slate-300', bg: 'bg-slate-50 text-slate-400' },
              away:      { ring: 'border-slate-300', dot: 'bg-slate-300', bg: 'bg-slate-50 text-slate-400' },
            };
            const statusInfo = statusColors[r.status] || statusColors.away;

            return (
              <div key={r.id} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 hover:border-slate-200 bg-white shadow-sm hover:shadow transition-all duration-200">
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Avatar with dynamic status ring & dot */}
                  <div className="relative flex-shrink-0">
                    <div className={`w-8 h-8 rounded-full border-2 ${statusInfo.ring} bg-slate-50 flex items-center justify-center font-bold text-[10px] text-slate-600`}>
                      {initials}
                    </div>
                    <span className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-white ${statusInfo.dot} ${r.status === 'working' ? 'animate-pulse' : ''}`} />
                  </div>

                  {/* Employee Info */}
                  <div className="min-w-0 flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-[11px] font-bold text-slate-800 truncate leading-snug">{displayName}</p>
                      {r.is_late && (
                        <span className="inline-flex px-1 py-0.2 bg-amber-50 border border-amber-100 text-amber-600 rounded text-[7px] font-black uppercase tracking-wide">
                          Late
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[8px] font-black uppercase bg-slate-50 border border-slate-100 text-slate-400 px-1 py-0.2 rounded tracking-wide">
                        {r.department || 'Staff'}
                      </span>
                      {r.hours_worked > 0 && (
                        <span className="text-[9px] font-bold text-slate-400 font-mono">
                          • {parseFloat(r.hours_worked).toFixed(1)}h
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Timings */}
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5">In</p>
                    <p className="text-[10px] font-mono font-black text-emerald-600">{r.checkIn ? formatTimeIST(r.checkIn) : '--:--'}</p>
                  </div>
                  <div className="w-px h-5 bg-slate-100" />
                  <div className="text-right">
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5">Out</p>
                    <p className={`text-[10px] font-mono font-black ${r.checkOut ? 'text-blue-600' : 'text-slate-300'}`}>{r.checkOut ? formatTimeIST(r.checkOut) : '--:--'}</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Employee Tasks Popup Modal
function EmployeeTasksModal({ isOpen, onClose, employee, onOpenTask }) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !employee) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 animate-fade-in" 
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col w-full max-w-xl max-h-[75vh] overflow-hidden transition-all transform scale-100">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">{employee.name === 'Unassigned' ? 'Unassigned Tasks' : `${employee.name}'s Tasks`}</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5 uppercase tracking-wide">
              {employee.department ? `${employee.department} Department` : 'Team Queue'}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white border border-slate-100 text-slate-400 hover:text-slate-600 hover:shadow-md transition-all flex items-center justify-center text-sm"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-3 scrollbar-thin">
          {employee.tasks?.length === 0 ? (
            <div className="py-16 text-center text-slate-400 italic text-sm">
              No tasks assigned
            </div>
          ) : (
            employee.tasks?.map((t) => {
              const isOverdue = isTaskOverdue(t);
              return (
                <div 
                  key={t.id}
                  onClick={() => onOpenTask(t.id)}
                  className={`bg-white border rounded-xl p-4 hover:shadow-md cursor-pointer transition-all group relative overflow-hidden ${
                    isOverdue 
                      ? 'border-red-200 hover:border-red-400 bg-red-50/10' 
                      : 'border-slate-200 hover:border-[#E05A1E]/50'
                  }`}
                >
                  <div className={`absolute top-0 left-0 w-1.5 h-full transition-opacity ${
                    isOverdue 
                      ? 'bg-red-500 opacity-100' 
                      : 'bg-[#E05A1E] opacity-0 group-hover:opacity-100'
                  }`} />
                  <p className="text-xs font-bold text-slate-800 line-clamp-2 mb-1 group-hover:text-[#E05A1E] transition-colors">{t.title}</p>
                  {t.due_date && (
                    <div className={`text-[10px] font-bold mb-1 flex items-center gap-1 ${
                      isOverdue ? 'text-red-600' : 'text-slate-500'
                    }`}>
                      📅 Due: {formatDateIST(t.due_date)}
                    </div>
                  )}
                  
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
            })
          )}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button onClick={onClose} className="btn-secondary py-1.5 px-4 text-xs font-bold uppercase">
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function TaskKanbanBoard() {
  const { user } = useAuth();
  const [kanbanData, setKanbanData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const prevEmployeeIdRef = useRef(null);

  const fetchKanban = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/tasks?view=kanban');
      setKanbanData(data.kanban || []);
    } catch (err) {
      toast.error('Failed to load task board');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKanban();
  }, [fetchKanban]);

  const openTask = (taskId) => {
    prevEmployeeIdRef.current = selectedEmployeeId;
    setSelectedEmployeeId(null);
    setSelectedTaskId(taskId);
    setIsModalOpen(true);
  };

  if (loading) {
    return <div className="card skeleton h-60 w-full rounded" />;
  }

  // Derive employee's own tasks vs other team members
  const myColumn = kanbanData.find(col => col.user_id === user?.id) || { tasks: [] };
  const otherColumns = kanbanData.filter(col => col.user_id !== user?.id);

  // Retrieve selected employee data dynamically from kanbanData to stay synchronized
  const activeEmployee = kanbanData.find(col => 
    col.user_id === selectedEmployeeId || 
    (selectedEmployeeId === 'unassigned' && col.user_id === null)
  );

  const isPrivileged = user?.role === 'admin' || user?.role === 'design_head' || user?.role === 'accounts' || user?.role === 'back_office' || user?.role === 'project_head';

  return (
    <div className="card w-full">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
        <div>
          <h3 className="text-lg font-black text-[#1A1A1A] tracking-tight">Task Command Center</h3>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            {isPrivileged ? "Manage tasks assigned to you and monitor employee queues" : "Manage tasks assigned to you"}
          </p>
        </div>
      </div>
      
      <div className={isPrivileged ? "grid grid-cols-1 lg:grid-cols-2 gap-4 items-start" : "w-full"}>
        {/* Left Column: Logged In Employee's Tasks */}
        <div className="flex flex-col bg-slate-50/50 border border-slate-100 rounded-2xl p-4 min-h-[350px]">
          <div className="flex items-center justify-between mb-3 pb-1.5 border-b border-slate-200/60">
            <span className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#E05A1E] animate-pulse" />
              My Tasks
            </span>
            <span className="px-2 py-0.5 rounded-full bg-white text-[10px] font-bold text-[#E05A1E] border border-slate-200 shadow-sm">
              {myColumn.tasks?.length || 0} active
            </span>
          </div>
          
          <div className="space-y-2 flex-1 overflow-y-auto max-h-[400px] pr-1 scrollbar-thin">
            {myColumn.tasks?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center opacity-50">
                <span className="text-2xl mb-2">🎉</span>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">All caught up!</p>
                <p className="text-[10px] text-slate-400 mt-1">No tasks assigned to you today.</p>
              </div>
            ) : (
              myColumn.tasks?.map((t) => {
                const isOverdue = isTaskOverdue(t);
                return (
                  <div 
                    key={t.id}
                    onClick={() => openTask(t.id)}
                    className={`bg-white border rounded-xl p-3 hover:shadow-md cursor-pointer transition-all duration-200 group relative overflow-hidden ${
                      isOverdue 
                        ? 'border-red-200 hover:border-red-400 bg-red-50/10' 
                        : 'border-slate-200 hover:border-[#E05A1E]/50'
                    }`}
                  >
                    <div className={`absolute top-0 left-0 w-1.5 h-full transition-opacity ${
                      isOverdue 
                        ? 'bg-red-500 opacity-100' 
                        : 'bg-[#E05A1E]'
                    }`} />
                    <p className="text-xs font-bold text-slate-800 line-clamp-2 mb-1 group-hover:text-[#E05A1E] transition-colors">{t.title}</p>
                    {t.due_date && (
                      <div className={`text-[10px] font-bold mb-1 flex items-center gap-1 ${
                        isOverdue ? 'text-red-600' : 'text-slate-500'
                      }`}>
                        📅 Due: {formatDateIST(t.due_date)}
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between gap-2 mt-2 pt-1.5 border-t border-slate-50 flex-wrap">
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
              })
            )}
          </div>
        </div>
        
        {/* Right Column: Other Team Directory */}
        {isPrivileged && (
          <div className="flex flex-col bg-slate-50/50 border border-slate-100 rounded-2xl p-4 min-h-[350px]">
            <div className="flex items-center justify-between mb-3 pb-1.5 border-b border-slate-200/60">
              <span className="text-xs font-black text-slate-800 uppercase tracking-widest">
                Team Directory
              </span>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                Click to view tasks
              </span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-y-auto max-h-[400px] pr-1 scrollbar-thin">
              {otherColumns.map((col) => {
                const taskCount = col.tasks?.length || 0;
                const hasTasks = taskCount > 0;
                const isUnassigned = col.user_id === null;
                
                // Initials or emoji for avatar
                const initials = isUnassigned 
                  ? '👤' 
                  : (col.name ? col.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '??');
                
                return (
                  <div 
                    key={col.user_id || 'unassigned'}
                    onClick={() => setSelectedEmployeeId(col.user_id === null ? 'unassigned' : col.user_id)}
                    className="bg-white border border-slate-100 rounded-xl p-3 hover:border-[#E05A1E]/30 hover:shadow-md cursor-pointer transition-all duration-200 group flex items-center justify-between relative overflow-hidden"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 transition-colors ${
                        hasTasks 
                          ? 'bg-[rgba(224,90,30,0.08)] text-[#E05A1E] border border-[rgba(224,90,30,0.15)]' 
                          : 'bg-slate-100 text-slate-400 border border-slate-200'
                      }`}>
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate group-hover:text-[#E05A1E] transition-colors">{col.name}</p>
                        <p className="text-[10px] text-slate-400 font-medium truncate uppercase tracking-tight mt-0.5">{col.department || (isUnassigned ? 'Unassigned Tasks' : 'General')}</p>
                      </div>
                    </div>
                    
                    <div className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tight border ${
                      hasTasks
                        ? 'bg-amber-50 text-amber-600 border-amber-200'
                        : 'bg-slate-50 text-slate-300 border-slate-100'
                    }`}>
                      {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <EmployeeTasksModal 
        isOpen={!!selectedEmployeeId}
        onClose={() => setSelectedEmployeeId(null)}
        employee={activeEmployee}
        onOpenTask={openTask}
      />

      <TaskModal 
        taskId={selectedTaskId}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          fetchKanban();
          if (prevEmployeeIdRef.current !== null) {
            setSelectedEmployeeId(prevEmployeeIdRef.current);
            prevEmployeeIdRef.current = null;
          }
        }}
      />
    </div>
  );
}

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [breakdown, setBreakdown] = useState({ open: false, tab: 'earnings' });

  const openBreakdown = useCallback((tab) => {
    console.log('[EmployeeDashboard] openBreakdown called with tab:', tab);
    setBreakdown({ open: true, tab });
  }, []);
  const closeBreakdown = useCallback(() => {
    console.log('[EmployeeDashboard] closeBreakdown called');
    setBreakdown(prev => ({ ...prev, open: false }));
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [dashRes, attRes] = await Promise.allSettled([
        api.get('/dashboard/employee'),
        api.get('/attendance/today')
      ]);

      if (dashRes.status === 'rejected') {
        console.error('[EmployeeDashboard] /dashboard/employee error:', dashRes.reason);
        toast.error(dashRes.reason?.response?.data?.error || 'Failed to load dashboard');
        return;
      }

      const res = dashRes.value?.data || {};
      const attToday = attRes.status === 'fulfilled' ? attRes.value?.data : {};
      const rawTeam = Array.isArray(attToday?.attendance) ? attToday.attendance : [];

      setData({
        ...res,
        attendance: mapAttendance(res.attendance),
        team_attendance: rawTeam.filter(r => r.is_active !== false).map(mapAttendance).filter(Boolean)
      });
    } catch (err) {
      console.error('[EmployeeDashboard] fetchData unexpected error:', err);
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAttendanceAction = (updatedAttendance) => {
    // Refresh fully to sync team list and stats
    fetchData();
  };

  useEffect(() => { fetchData(); }, [fetchData]);

  // Skeleton
  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="skeleton h-8 w-48 rounded" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="card h-48 skeleton rounded" />
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <>
      <AppLayout>
        <div className="space-y-6 max-w-[1600px] mx-auto">
          {/* Header Section */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
            <div className="min-w-0">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none mb-2">
                Hey, {user?.name?.split(' ')[0]}!
              </h1>
              <p className="text-[11px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Production Active • {todayIST()}
              </p>
            </div>
            
            <div className="flex-1 max-w-4xl">
              <AttendanceStatus 
                attendance={data?.attendance} 
                todayStatus={data?.today_status} 
                onAction={fetchData} 
              />
            </div>
          </div>

          {/* Stats & Team Section */}
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            <div className="xl:col-span-3 space-y-6">
              <QuickStats 
                salary={data?.salary_stats}
                onCardClick={openBreakdown}
              />
              <TaskKanbanBoard />
            </div>
            <div className="xl:col-span-1 space-y-6">
              <TeamAttendanceCompact records={data?.team_attendance || []} />
            </div>
          </div>

          {/* Main Content: Kanban Boards */}
          <div className="space-y-8">
            <div className="relative">
              <div className="absolute -left-4 top-0 bottom-0 w-1 bg-[#E05A1E] rounded-full hidden lg:block" />
              <h2 className="text-xl font-black text-slate-900 tracking-tight mb-4 flex items-center gap-3">
                Project Pipeline
                <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-400 rounded-full font-bold">Live Status</span>
              </h2>
              <KanbanBoard kanban={data?.kanban} />
            </div>
          </div>

          {/* Edge-to-Edge Team Approved Leaves Schedule */}
          <div className="w-full pt-2">
            <TeamApprovedLeavesWidget 
              activeLeaves={data?.active_team_leaves || []} 
              upcomingLeaves={data?.upcoming_team_leaves || []} 
            />
          </div>
        </div>
      </AppLayout>

      {/* Salary Breakdown Modal — rendered via portal above everything */}
      <SalaryBreakdownModal
        isOpen={breakdown.open}
        defaultTab={breakdown.tab}
        onClose={closeBreakdown}
      />
    </>
  );
}
