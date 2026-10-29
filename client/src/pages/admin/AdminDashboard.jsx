/* eslint-disable react-hooks/set-state-in-effect, no-unused-vars */
// client/src/pages/admin/AdminDashboard.jsx
// Admin dashboard: attendance summary, today's tasks, kanban board

import { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { formatTimeIST, todayIST, isTaskOverdue, getTaskOverdueDays, formatDateIST } from '../../utils/time';
import { mapAttendance } from '../../utils/attendance';
import AttendanceCard from '../../components/ui/AttendanceCard';
import toast from 'react-hot-toast';
import TaskModal from '../../components/projects/TaskModal';
import KanbanBoard from '../../components/dashboard/KanbanBoard';
import FinancialBreakdownModal from '../../components/dashboard/FinancialBreakdownModal';
import SalaryBreakdownModal from '../../components/dashboard/SalaryBreakdownModal';
import TeamApprovedLeavesWidget from '../../components/dashboard/TeamApprovedLeavesWidget';
import RequestKanbanBoard from '../../components/dashboard/RequestKanbanBoard';
import { createPortal } from 'react-dom';

// ── Skeleton loader
function StatSkeleton() {
  return (
    <div className="card">
      <div className="skeleton h-4 w-24 mb-3 rounded" />
      <div className="skeleton h-8 w-12 rounded" />
    </div>
  );
}

// ── Attendance stat cards
function AttendanceStats({ data }) {
  const stats = [
    { label: 'Total Team', value: data?.total ?? '—', color: 'text-[#1A1A1A]', bg: 'bg-[rgba(224,90,30,0.07)]', border: 'border-[rgba(224,90,30,0.18)]' },
    { label: 'Present Today', value: data?.checked_in ?? '—', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    { label: 'Checked Out', value: data?.checked_out ?? '—', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
    { label: 'Absent', value: data?.absent ?? '—', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
    { label: 'On Leave', value: data?.on_leave ?? '—', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {stats.map((s) => (
        <div key={s.label} className={`card ${s.bg} border ${s.border}`}>
          <p className="text-xs font-medium text-muted mb-2">{s.label}</p>
          <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Project type stats cards
function ProjectTypeStats({ counts }) {
  const stats = [
    { label: 'Construction Projects', value: counts?.construction ?? 0, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
    { label: 'Interior Projects', value: counts?.interior ?? 0, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
    { label: 'Liasoning Projects', value: counts?.liaisoning ?? 0, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
    { label: 'Rendering Projects', value: counts?.rendering ?? 0, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((s) => (
        <div key={s.label} className={`card ${s.bg} border ${s.border}`}>
          <p className="text-xs font-medium text-muted mb-2">{s.label}</p>
          <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
        </div>
      ))}
    </div>
  );
}



// ── Financial summary boxes
function FinancialStats({ finances, onOpenBreakdown }) {
  const stats = [
    { 
      id: 'total',
      label: 'Total Project Value',
      period: 'Pipeline',
      value: finances?.total_amount ?? 0, 
      color: 'text-gray-900', 
      bg: 'bg-gray-50/50', 
      border: 'border-gray-100',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3h12"></path>
          <path d="M6 8h12"></path>
          <path d="M6 13c6.667 0 6.667-10 0-10"></path>
          <path d="m11 13 6 8"></path>
        </svg>
      )
    },
    { 
      id: 'current',
      label: 'Current Project Value',
      period: 'Pipeline',
      value: finances?.current_amount ?? 0, 
      color: 'text-purple-600', 
      bg: 'bg-purple-50/50', 
      border: 'border-purple-100',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23"></line>
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
        </svg>
      )
    },
    { 
      id: 'billed',
      label: 'Billed Amount',
      period: 'This Month',
      value: finances?.billed_amount ?? 0, 
      color: 'text-blue-600', 
      bg: 'bg-blue-50/50', 
      border: 'border-blue-100',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3h12"></path>
          <path d="M6 8h12"></path>
          <path d="M6 13c6.667 0 6.667-10 0-10"></path>
          <path d="m11 13 6 8"></path>
        </svg>
      )
    },
    { 
      id: 'received',
      label: 'Received Amount',
      period: 'This Month',
      value: finances?.received_amount ?? 0, 
      color: 'text-emerald-600', 
      bg: 'bg-emerald-50/50', 
      border: 'border-emerald-100',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
      )
    },
    { 
      id: 'pending',
      label: 'Pending Amount',
      period: 'Outstanding',
      value: finances?.pending_amount ?? 0, 
      color: 'text-orange-600', 
      bg: 'bg-orange-50/50', 
      border: 'border-orange-100',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
      )
    },
    { 
      id: 'expenses',
      label: 'Total Expenses',
      period: 'This Month',
      value: finances?.expense_amount ?? 0, 
      color: 'text-red-600', 
      bg: 'bg-red-50/50', 
      border: 'border-red-100',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"></path>
          <path d="M4 6v12c0 1.1.9 2 2 2h14v-4"></path>
          <path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z"></path>
        </svg>
      )
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {stats.map((s) => (
        <div 
          key={s.label} 
          onClick={() => onOpenBreakdown(s.id, s.label)}
          className={`relative overflow-hidden group p-4 rounded-2xl bg-white border ${s.border} shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer active:scale-95`}
        >
          <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full ${s.bg} opacity-50 group-hover:scale-110 transition-transform duration-500`} />
          
          <div className="relative flex items-center justify-between mb-3">
            <div className={`p-2 rounded-xl ${s.bg} ${s.color}`}>
              {s.icon}
            </div>
            <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest group-hover:text-slate-400 transition-colors">{s.period}</span>
          </div>

          <div className="relative">
            <div className="h-8 flex items-start mb-1">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-normal">{s.label}</p>
            </div>
            <h3 className={`text-xl font-black ${s.color} tracking-tight`}>
              ₹{Number(s.value).toLocaleString('en-IN')}
            </h3>
          </div>
          
          <div className={`absolute bottom-0 left-0 w-full h-1 ${s.bg} scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-500`} />
        </div>
      ))}
    </div>
  );
}



function MyAdminSalaryStats({ salary, onCardClick }) {
  if (!salary) return null;
  
  const earnedAmount = Math.round(Number(salary.earned_this_month || 0));
  const deductedAmount = Math.round(Number(salary.deductions_this_month || 0));
  const todayEarned = Math.round(Number(salary.today_earned || 0));
  const todayDeductions = Math.round(Number(salary.today_deductions || 0));
  const currentNet = salary.current_net_payable !== undefined 
    ? Math.round(Number(salary.current_net_payable)) 
    : (salary.net_salary_payable !== undefined ? Math.round(Number(salary.net_salary_payable)) : (earnedAmount - deductedAmount));
  const projectedMonthEnd = salary.projected_month_end_net !== undefined 
    ? Math.round(Number(salary.projected_month_end_net)) 
    : (salary.projected_net_salary !== undefined ? Math.round(Number(salary.projected_net_salary)) : null);

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Earnings Card — click opens modal on Earnings tab */}
      <button
        type="button"
        onClick={() => onCardClick('earnings')}
        className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm hover:shadow-md hover:border-emerald-200 hover:ring-2 hover:ring-emerald-100 transition-all text-left w-full group cursor-pointer"
      >
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
          My Earnings (Month)
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
          {salary.is_month_in_progress && projectedMonthEnd !== null && (
            <span className="text-slate-400 font-normal">
              · Projected: <span className="text-slate-600 font-bold">₹{projectedMonthEnd.toLocaleString('en-IN')}</span>
            </span>
          )}
        </div>
        <p className="text-[9px] text-slate-300 mt-1.5 group-hover:text-emerald-400 transition-colors font-bold uppercase tracking-widest">Click for breakdown →</p>
      </button>

      {/* Deductions Card — click opens modal on Deductions tab */}
      <button
        type="button"
        onClick={() => onCardClick('deductions')}
        className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm hover:shadow-md hover:border-amber-200 hover:ring-2 hover:ring-amber-100 transition-all text-left w-full group cursor-pointer relative"
      >
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
          My Penalties & Deductions
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
          {[salary.leaves_count > 0 && `${salary.leaves_count} leave`, salary.late_count > 0 && `${salary.late_count} late`, salary.half_day_count > 0 && `${salary.half_day_count} half-day`, salary.unmarked_absent_count > 0 && `${salary.unmarked_absent_count} absent`].filter(Boolean).join(' · ') || 'Leaves, late arrivals & half days'}
        </p>
        <p className="text-[9px] text-slate-300 mt-1 group-hover:text-amber-400 transition-colors font-bold uppercase tracking-widest">Click for breakdown →</p>
      </button>
    </div>
  );
}

// ── Team Attendance Table (Redesigned)
function TeamAttendanceTable({ records }) {
  const [filter, setFilter] = useState('all');

  // Helper status counts
  const totalCount = records.length;
  const presentCount = records.filter(r => ['working', 'completed', 'half_day'].includes(r.status)).length;
  const lateCount = records.filter(r => r.is_late === true).length;
  const leaveCount = records.filter(r => r.status === 'leave').length;
  const absentCount = records.filter(r => r.status === 'absent' || (!r.checkIn && r.status !== 'leave')).length;

  // Filter records
  const filteredRecords = records.filter(r => {
    if (filter === 'present') return ['working', 'completed', 'half_day'].includes(r.status);
    if (filter === 'late') return r.is_late === true;
    if (filter === 'leave') return r.status === 'leave';
    if (filter === 'absent') return r.status === 'absent' || (!r.checkIn && r.status !== 'leave');
    return true; // 'all'
  });

  const copyCoords = (lat, lng) => {
    if (!lat || !lng) return;
    navigator.clipboard.writeText(`${lat}, ${lng}`);
    toast.success('Coordinates copied to clipboard! 📍');
  };

  const getZoneBadge = (zone, isVerified) => {
    if (!zone) return null;
    if (zone === 'strict') {
      return <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-md">🟢 Office</span>;
    }
    if (zone === 'buffer') {
      return <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-md">🟡 Boundary</span>;
    }
    return <span className="inline-flex items-center gap-1 text-[9px] font-bold text-red-500 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-md">🔴 Outside</span>;
  };

  return (
    <div className="card w-full flex flex-col bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-2 border-b border-slate-100">
        <div>
          <h3 className="text-lg font-black text-slate-900 tracking-tight">Team Attendance Dashboard</h3>
          <p className="text-xs text-slate-400 font-medium mt-0.5">Real-time geo-verified check-in status and work hours</p>
        </div>
        <a 
          href="/attendance" 
          className="text-xs font-bold text-[#E05A1E] hover:underline flex items-center gap-1 self-start sm:self-center group"
        >
          Open Official Logs 
          <span className="group-hover:translate-x-0.5 transition-transform">→</span>
        </a>
      </div>

      {/* Filter Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 mb-4">
        {[
          { key: 'all', label: 'Total Team', count: totalCount, color: 'text-slate-800 border-slate-200 bg-slate-50/50 hover:bg-slate-50' },
          { key: 'present', label: 'Present', count: presentCount, color: 'text-emerald-600 border-emerald-100 bg-emerald-50/30 hover:bg-emerald-50' },
          { key: 'late', label: 'Late check-ins', count: lateCount, color: 'text-amber-600 border-amber-100 bg-amber-50/30 hover:bg-amber-50' },
          { key: 'leave', label: 'On Leave', count: leaveCount, color: 'text-purple-600 border-purple-100 bg-purple-50/30 hover:bg-purple-50' },
          { key: 'absent', label: 'Absent', count: absentCount, color: 'text-red-500 border-red-100 bg-red-50/30 hover:bg-red-50' },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setFilter(item.key)}
            className={`flex flex-col p-2.5 rounded-xl border text-left transition-all duration-200 active:scale-95 ${item.color} ${
              filter === item.key 
                ? 'ring-2 ring-[#E05A1E] ring-offset-1 shadow-sm font-black' 
                : 'opacity-70 hover:opacity-100'
            }`}
          >
            <span className="text-[10px] font-black uppercase tracking-wider opacity-80">{item.label}</span>
            <span className="text-lg font-bold mt-0.5 tracking-tight">{item.count}</span>
          </button>
        ))}
      </div>

      {/* Grid view of records */}
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-left border-separate border-spacing-0">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="pb-2 text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Member</th>
              <th className="pb-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Today's Status</th>
              <th className="pb-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Check-In Info</th>
              <th className="pb-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Check-Out Info</th>
              <th className="pb-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Working Progress</th>
              <th className="pb-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center pr-2">GPS Audit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400 italic text-sm">
                  No records match the selected filter today
                </td>
              </tr>
            ) : (
              filteredRecords.map((r, i) => {
                const isLate = r.is_late === true;
                const initials = r.name ? r.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '??';
                
                // Working progress metrics
                const targetHours = 8;
                const hours = parseFloat(r.hours_worked || 0);
                const progressPct = Math.min(100, Math.max(0, (hours / targetHours) * 100));

                return (
                  <tr key={i} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="py-2.5 pl-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs">
                          {initials}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800 group-hover:text-[#E05A1E] transition-colors">{r.name}</p>
                          <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">
                            {r.role === 'admin' ? 'Admin' : (r.department || 'Staff')}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm border ${
                        r.status === 'working'   ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                        r.status === 'completed' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                        r.status === 'half_day'  ? 'bg-amber-50 text-amber-600 border-amber-100' :
                        r.status === 'leave'     ? 'bg-purple-50 text-purple-600 border-purple-100' :
                        'bg-red-50 text-red-500 border-red-100'
                      }`}>
                        {r.status === 'working'   ? 'Present'  :
                         r.status === 'completed' ? 'Done'     :
                         r.status === 'half_day'  ? 'Half Day' :
                         r.status === 'leave'     ? 'On Leave' : 'Absent'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      {r.checkIn ? (
                        <div className="space-y-1">
                          <p className={`text-xs font-bold ${isLate ? 'text-red-500' : 'text-emerald-600'}`}>
                            {formatTimeIST(r.checkIn)}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {isLate && (
                              <span className="text-[9px] font-bold text-red-500 bg-red-50 px-1 py-0.2 rounded">
                                Late by {r.late_minutes || 0}m
                              </span>
                            )}
                            {getZoneBadge(r.checkinZone, r.checkinVerified)}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs font-medium text-slate-300 italic">—</p>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      {r.checkOut ? (
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-blue-600">
                            {formatTimeIST(r.checkOut)}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {r.checkoutOutsideZone ? (
                              <span className="text-[9px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
                                Outside location
                              </span>
                            ) : (
                              getZoneBadge(r.checkoutZone, false)
                            )}
                          </div>
                        </div>
                      ) : r.checkIn ? (
                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-500 animate-pulse">On duty</span>
                      ) : (
                        <p className="text-xs font-medium text-slate-300 italic">—</p>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      {r.checkIn ? (
                        <div className="w-32 space-y-1">
                          <div className="flex justify-between items-center text-[10px] font-bold text-slate-50">
                            <span>{hours.toFixed(1)} hrs</span>
                            <span className="opacity-65">{progressPct.toFixed(0)}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                r.status === 'completed' ? 'bg-blue-500' : 
                                r.status === 'half_day' ? 'bg-amber-500' : 'bg-emerald-500'
                              }`} 
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs font-medium text-slate-300 italic">—</p>
                      )}
                    </td>
                    <td className="py-2.5 text-center pr-2">
                      {r.lat ? (
                        <button
                          onClick={() => copyCoords(r.lat, r.lng)}
                          title="Click to copy coordinates"
                          className="p-1 rounded-lg border border-slate-100 hover:border-[#E05A1E]/30 text-slate-400 hover:text-[#E05A1E] hover:shadow-sm transition-all"
                        >
                          <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                          </svg>
                        </button>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Task Kanban Board (Horizontal Scrolling Columns)
// ── Employee Tasks Popup Modal for Accounts/Backoffice personal view
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
  const { user, isAdmin, isAccounts } = useAuth();
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

  const isPersonalView = isAccounts && !isAdmin;

  if (isPersonalView) {
    return (
      <div className="card w-full">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-black text-[#1A1A1A] tracking-tight">Task Command Center</h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">Manage tasks assigned to you and monitor employee queues</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
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

  return (
    <div className="card w-full">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
        <div>
          <h3 className="text-lg font-black text-[#1A1A1A] tracking-tight">Task Command Center</h3>
          <p className="text-xs text-slate-400 font-medium mt-0.5">Monitor task progress and queues across all employees</p>
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
              })}
            </div>
          </div>
        ))}
      </div>

      <TaskModal 
        taskId={selectedTaskId}
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); fetchKanban(); }}
      />
    </div>
  );
}

// ── Accounts Financial Command Center
function AccountsCommandCenter({ sanctionProjects = [], loadingDashboard = false }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [invRes, payrollRes] = await Promise.all([
          api.get('/invoices?limit=500'),
          api.get('/accounting/payroll/history'),
        ]);
        const invoices = invRes.data?.invoices || [];
        const now = new Date();
        const pending = invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled' && !i.is_payment_stage);
        const overdue = pending.filter(i => i.due_date && new Date(i.due_date) < now);
        const pendingValue = pending.reduce((s, i) => s + parseFloat(i.pending_amount || i.amount || 0), 0);
        const overdueValue = overdue.reduce((s, i) => s + parseFloat(i.pending_amount || i.amount || 0), 0);
        const thisMonth = now.getMonth() + 1;
        const thisYear = now.getFullYear();
        const payroll = payrollRes.data || [];
        const thisMonthPayroll = payroll.filter(p => p.month === thisMonth && p.year === thisYear);
        setSummary({ pending: pending.length, pendingValue, overdue: overdue.length, overdueValue, payrollCount: thisMonthPayroll.length });
      } catch {/* silent */} finally { setLoading(false); }
    }
    load();
  }, []);

  const cards = [
    { label: 'Pending Invoices', value: loading ? '—' : summary?.pending ?? 0, sub: loading ? '' : `₹${(summary?.pendingValue ?? 0).toLocaleString('en-IN')}`, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', href: '/admin/invoice' },
    { label: 'Overdue Invoices', value: loading ? '—' : summary?.overdue ?? 0, sub: loading ? '' : `₹${(summary?.overdueValue ?? 0).toLocaleString('en-IN')} overdue`, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', href: '/admin/invoice' },
    { label: 'Payroll Processed', value: loading ? '—' : summary?.payrollCount ?? 0, sub: 'This month', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', href: '/admin/accounting' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-gray-500 uppercase tracking-widest">Financial Overview</h2>
        <a href="/admin/accounting" className="text-[11px] font-bold text-[#E05A1E] hover:underline">Open Accounting →</a>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map(c => (
          <a key={c.label} href={c.href} className={`card ${c.bg} border ${c.border} hover:shadow-md transition-all group cursor-pointer`}>
            <p className="text-xs font-medium text-muted mb-2">{c.label}</p>
            <p className={`text-3xl font-bold ${c.color}`}>{c.value}</p>
            {c.sub && <p className={`text-xs font-bold ${c.color} mt-1 opacity-70`}>{c.sub}</p>}
          </a>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 mt-2">
        {[
          { label: 'Invoices', href: '/admin/invoice', color: 'text-blue-600 bg-blue-50 border-blue-200' },
          { label: 'Accounting', href: '/admin/accounting', color: 'text-orange-600 bg-orange-50 border-orange-200' },
          { label: 'Reports', href: '/admin/reports', color: 'text-purple-600 bg-purple-50 border-purple-200' },
        ].map(l => (
          <a key={l.label} href={l.href} className={`text-center py-3 rounded-xl border text-xs font-black uppercase tracking-wider transition-all hover:shadow-sm ${l.color}`}>
            {l.label}
          </a>
        ))}
      </div>

      {/* Sanction Phase Projects Table */}
      <div className="card w-full bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-black text-slate-800 tracking-tight uppercase">Sanction Phase Projects</h3>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">Projects currently in Submission/Sanctioning stage</p>
          </div>
          <span className="px-2 py-0.5 rounded bg-[rgba(224,90,30,0.07)] text-[10px] font-bold text-[#E05A1E] border border-[rgba(224,90,30,0.18)] uppercase tracking-wider">
            {loadingDashboard ? '...' : `${sanctionProjects.length} Active`}
          </span>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left border-separate border-spacing-0">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="pb-2 text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Project</th>
                <th className="pb-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Client</th>
                <th className="pb-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                <th className="pb-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="pb-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right pr-2">Active Stage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loadingDashboard ? (
                [...Array(3)].map((_, i) => (
                  <tr key={i}>
                    <td className="py-2.5 pl-2"><div className="skeleton h-4 w-32 rounded" /></td>
                    <td className="py-2.5"><div className="skeleton h-4 w-24 rounded" /></td>
                    <td className="py-2.5"><div className="skeleton h-4 w-20 rounded" /></td>
                    <td className="py-2.5"><div className="skeleton h-4 w-16 rounded" /></td>
                    <td className="py-2.5 text-right pr-2"><div className="skeleton h-4 w-20 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : sanctionProjects.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 italic text-xs">
                    No projects are currently in the Sanction column
                  </td>
                </tr>
              ) : (
                sanctionProjects.map((p) => {
                  const activeStage = p.stages?.find(s => s.status !== 'completed');
                  return (
                    <tr key={p.id} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="py-2.5 pl-2">
                        <a 
                          href={`/projects/${p.id}`}
                          className="text-xs font-bold text-slate-800 hover:text-[#E05A1E] transition-colors"
                        >
                          {p.name}
                        </a>
                      </td>
                      <td className="py-2.5 text-xs text-slate-600 font-medium">
                        {p.client_name || '—'}
                      </td>
                      <td className="py-2.5 text-xs text-slate-500 font-semibold">
                        {p.type}
                      </td>
                      <td className="py-2.5">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider shadow-sm border ${
                          p.status === 'Sanction' ? 'bg-orange-50 text-[#E05A1E] border-orange-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-xs text-[#E05A1E] font-black uppercase tracking-wider text-right pr-2">
                        {activeStage ? activeStage.stage_name : 'N/A'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


export default function AdminDashboard() {
  const { isAdmin, isAccounts } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [financialModal, setFinancialModal] = useState({ isOpen: false, type: '', label: '' });
  const [breakdown, setBreakdown] = useState({ open: false, tab: 'earnings' });
  const [requestViewMode, setRequestViewMode] = useState('kanban'); // 'kanban' | 'schedule'

  const openBreakdown = useCallback((tab) => {
    console.log('[AdminDashboard] openBreakdown called with tab:', tab);
    setBreakdown({ open: true, tab });
  }, []);
  const closeBreakdown = useCallback(() => {
    console.log('[AdminDashboard] closeBreakdown called');
    setBreakdown(prev => ({ ...prev, open: false }));
  }, []);


  const fetchDashboard = useCallback(async () => {
    try {
      const { data: res } = await api.get('/dashboard/admin');
      const { data: att } = await api.get('/attendance/today');
      
      setData({
        ...res,
        team_attendance: (att.attendance || []).filter(r => r.is_active !== false).map(mapAttendance),
        my_attendance: mapAttendance(att.my_attendance)
      });
    } catch (err) {
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAttendanceAction = () => {
    fetchDashboard();
  };

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  // Auto-refresh every 60s
  useEffect(() => {
    const t = setInterval(fetchDashboard, 60000);
    return () => clearInterval(t);
  }, [fetchDashboard]);

  return (
    <>
      <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-[#1A1A1A] tracking-tight">
              {isAccounts && !isAdmin ? 'Accounts Dashboard' : 'Admin Dashboard'}
            </h1>
            <p className="text-muted text-sm font-medium mt-0.5">{todayIST()}</p>
          </div>
          <button
            onClick={fetchDashboard}
            disabled={loading}
            className="btn-secondary disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading ? 'animate-spin' : ''}>
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            <span className="text-xs font-bold uppercase">{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          <div className="lg:col-span-1 space-y-4">
            <AttendanceCard attendance={data?.my_attendance} onAction={handleAttendanceAction} />
            <MyAdminSalaryStats salary={data?.salary_stats} onCardClick={openBreakdown} />
          </div>
          
          <div className="lg:col-span-2">
            {loading ? (
              <div className="grid grid-cols-2 gap-4">
                {[...Array(4)].map((_, i) => <StatSkeleton key={i} />)}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <AttendanceStats data={data?.attendance} />
                <ProjectTypeStats counts={data?.type_counts} />
              </div>
            )}
          </div>
        </div>

        {/* Financial Summary Section */}
        {!loading && (isAdmin || isAccounts) && (
          <div className="mt-1">
            <FinancialStats 
              finances={data?.finances} 
              onOpenBreakdown={(type, label) => setFinancialModal({ isOpen: true, type, label })}
            />
          </div>
        )}

        {/* Breakdown Modal */}
        <FinancialBreakdownModal 
          isOpen={financialModal.isOpen}
          onClose={() => setFinancialModal({ ...financialModal, isOpen: false })}
          type={financialModal.type}
          label={financialModal.label}
        />

        {/* Accounts: financial command center and task boards; Admin: task boards and pipeline */}
        {isAccounts && !isAdmin ? (
          <div className="space-y-4">
            <div className="w-full">
              <TaskKanbanBoard />
            </div>
            <AccountsCommandCenter 
              sanctionProjects={data?.kanban?.sanction || []} 
              loadingDashboard={loading}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-full">
              <TaskKanbanBoard />
            </div>

            <div className="w-full">
              {loading ? (
                <div className="card skeleton h-96 rounded" />
              ) : (
                <KanbanBoard kanban={data?.kanban} />
              )}
            </div>

            <div className="w-full">
              {loading ? (
                <div className="card skeleton h-96 rounded" />
              ) : (
                <TeamAttendanceTable records={data?.team_attendance || []} />
              )}
            </div>
          </div>
        )}

        {/* Team Requests & Leave Schedule — Positioned at the bottom of the dashboard */}
        <div className="w-full pt-2">
          {requestViewMode === 'kanban' ? (
            <RequestKanbanBoard 
              isAdmin={isAdmin}
              onSwitchToSchedule={() => setRequestViewMode('schedule')}
            />
          ) : (
            <TeamApprovedLeavesWidget 
              activeLeaves={data?.active_team_leaves || []} 
              upcomingLeaves={data?.upcoming_team_leaves || []} 
              title="Team Leave Schedule"
              isAdmin={true}
              loading={loading}
              onSwitchToKanban={() => setRequestViewMode('kanban')}
            />
          )}
        </div>

        {/* Quick links — accounts sees financial shortcuts, admin sees project overview */}
        {isAccounts && !isAdmin && (
          <div className="grid grid-cols-2 gap-4">
            <a href="/admin/invoice"
              className="card flex items-center gap-4 hover:border-blue-400 transition-all group cursor-pointer">
              <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2">
                  <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z" />
                  <path d="M16 14H8" /><path d="M16 18H8" /><path d="M16 10h-2" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-[#1A1A1A] group-hover:text-blue-600 transition-colors">Invoices</p>
                <p className="text-xs text-muted font-medium">Manage &amp; track all invoices</p>
              </div>
            </a>
            <a href="/attendance"
              className="card flex items-center gap-4 hover:border-emerald-400 transition-all group cursor-pointer">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center flex-shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-[#1A1A1A] group-hover:text-emerald-600 transition-colors">Attendance Log</p>
                <p className="text-xs text-muted font-medium">View official team records</p>
              </div>
            </a>
          </div>
        )}
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
