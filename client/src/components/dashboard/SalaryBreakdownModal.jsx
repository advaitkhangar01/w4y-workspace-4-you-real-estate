// client/src/components/dashboard/SalaryBreakdownModal.jsx
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../../api/client';
import { formatTimeIST } from '../../utils/time';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const STATUS_CFG = {
  present:   { label: 'Present',  bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500', ring: 'ring-emerald-200' },
  working:   { label: 'Working',  bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500', ring: 'ring-emerald-200' },
  completed: { label: 'Done',     bg: 'bg-blue-50',     text: 'text-blue-700',    dot: 'bg-blue-500',   ring: 'ring-blue-200'   },
  half_day:  { label: 'Half Day', bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-400',  ring: 'ring-amber-200'  },
  absent:    { label: 'Absent',   bg: 'bg-red-50',      text: 'text-red-600',     dot: 'bg-red-400',    ring: 'ring-red-200'    },
  leave:     { label: 'Leave',    bg: 'bg-purple-50',   text: 'text-purple-700',  dot: 'bg-purple-400', ring: 'ring-purple-200' },
  sunday:    { label: 'Sunday',   bg: 'bg-slate-50',    text: 'text-slate-400',   dot: 'bg-slate-300',  ring: 'ring-slate-200'  },
  holiday:   { label: 'Holiday',  bg: 'bg-sky-50',      text: 'text-sky-700',     dot: 'bg-sky-400',    ring: 'ring-sky-200'    },
  future:    { label: 'Upcoming', bg: 'bg-slate-50',    text: 'text-slate-300',   dot: 'bg-slate-200',  ring: 'ring-slate-100'  },
};

function StatusBadge({ status, isLate }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.future;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ring-1 ${cfg.bg} ${cfg.text} ${cfg.ring}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
      {isLate && status !== 'absent' && status !== 'future' && (
        <span className="text-amber-500 ml-0.5">· Late</span>
      )}
    </span>
  );
}

export default function SalaryBreakdownModal({ isOpen, onClose, defaultTab = 'earnings' }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [tab,     setTab]     = useState(defaultTab);
  const [filter,  setFilter]  = useState('all');

  // Sync tab when defaultTab prop changes (i.e. user clicked different box)
  useEffect(() => { setTab(defaultTab); }, [defaultTab]);

  // Lazy-fetch on open
  const fetchBreakdown = useCallback(async () => {
    if (!isOpen) return;
    console.log('[SalaryBreakdownModal] Fetching salary breakdown from backend...');
    setLoading(true);
    setError(null);
    try {
      const { data: res } = await api.get('/dashboard/salary-breakdown');
      console.log('[SalaryBreakdownModal] Successfully fetched breakdown:', res);
      setData(res);
    } catch (err) {
      console.error('[SalaryBreakdownModal] Error fetching breakdown:', err);
      setError('Failed to load breakdown.');
    } finally {
      setLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      fetchBreakdown();
    }
  }, [isOpen, fetchBreakdown]);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else        document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const daily   = data?.daily   || [];
  const summary = data?.summary || {};
  const monthName = data ? MONTH_NAMES[(data.month || 1) - 1] : 'Loading...';
  const year      = data?.year || '';

  // --- Filter + Tab logic ---
  const visible = daily.filter(d => {
    if (tab === 'deductions' && d.deduction === 0 && d.status !== 'absent') return false;
    if (filter === 'earned')   return d.earnings > 0 && d.deduction === 0 && d.status !== 'future';
    if (filter === 'deducted') return d.deduction > 0;
    if (filter === 'offday')   return ['sunday', 'holiday', 'future'].includes(d.status);
    return true;
  });

  const totalEarnings   = visible.reduce((s, d) => s + Math.max(0, (d.earnings || 0) - (d.deduction || 0)), 0);
  const totalDeductions = visible.reduce((s, d) => s + (d.deduction || 0), 0);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal shell */}
      <div
        className="relative bg-white w-full sm:rounded-3xl sm:max-w-3xl max-h-[92vh] sm:max-h-[88vh] flex flex-col shadow-2xl overflow-hidden"
        style={{ animation: 'salaryModalIn 0.22s cubic-bezier(0.22,1,0.36,1)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 tracking-tight leading-none">Salary Breakdown</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                {monthName} {year}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors group"
          >
            <svg className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Loading state */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20">
            <div className="w-10 h-10 border-[3px] border-slate-100 border-t-slate-700 rounded-full animate-spin" />
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Loading breakdown...</p>
          </div>

        /* Error state */
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-20 text-center px-6">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-slate-600">{error}</p>
            <button onClick={fetchBreakdown} className="text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-700 transition-colors mt-1">
              Retry
            </button>
          </div>

        ) : (
          <>
            {/* Summary stat chips */}
            <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-slate-100 border-b border-slate-100 flex-shrink-0">
              {[
                { 
                  label: 'Earned', 
                  sublabel: 'Accrued through today',
                  value: `₹${Math.round(Number(summary.accrued_earnings_to_date || summary.earned_this_month || 0)).toLocaleString('en-IN')}`, 
                  color: 'text-emerald-600' 
                },
                { 
                  label: 'Penalties', 
                  sublabel: '3 Consecutive Lates',
                  value: `₹${Math.round(Number(summary.total_deductions_to_date || summary.deductions_this_month || 0)).toLocaleString('en-IN')}`, 
                  color: 'text-red-500'     
                },
                { 
                  label: 'Net Payable', 
                  sublabel: 'Earned − Penalties',
                  value: `₹${Math.round(Number(summary.current_net_payable !== undefined ? summary.current_net_payable : (summary.net_salary_payable || 0))).toLocaleString('en-IN')}`, 
                  color: 'text-primary' 
                },
                { 
                  label: 'Days In', 
                  sublabel: summary.half_days > 0 ? `${summary.full_days}F · ${summary.half_days}H` : 'Full days',
                  value: summary.full_days ?? 0, 
                  color: 'text-slate-800'   
                },
                { 
                  label: 'Late / Abs', 
                  sublabel: 'Lates / Absences',
                  value: `${summary.late_count ?? 0} / ${summary.unmarked_absent_count ?? 0}`, 
                  color: 'text-amber-600' 
                },
              ].map((s, i) => (
                <div key={i} className="flex flex-col items-center justify-center py-2.5 px-2 bg-white text-center">
                  <p className={`text-sm font-black font-mono tracking-tight ${s.color}`}>{s.value}</p>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-0.5">{s.label}</p>
                  {s.sublabel && (
                    <p className="text-[8px] font-bold text-slate-400 mt-0.5">{s.sublabel}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Tabs + Filter chips */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-5 py-2.5 border-b border-slate-100 bg-slate-50/60 flex-shrink-0">
              <div className="flex gap-1 bg-white border border-slate-200 p-0.5 rounded-xl self-start">
                {[['earnings','Earnings'],['deductions','Deductions']].map(([key, label]) => (
                  <button key={key}
                    onClick={() => setTab(key)}
                    className={`px-3 py-1.5 rounded-[10px] text-[10px] font-black uppercase tracking-widest transition-all ${
                      tab === key ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-400 hover:text-slate-700'
                    }`}
                  >{label}</button>
                ))}
              </div>
              <div className="flex gap-1 flex-wrap">
                {[
                  ['all',      'All Days'],
                  ['deducted', 'Penalties'],
                  ['earned',   'Full Pay'],
                  ['offday',   'Off Days'],
                ].map(([key, label]) => (
                  <button key={key}
                    onClick={() => setFilter(key)}
                    className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border ${
                      filter === key
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600'
                    }`}
                  >{label}</button>
                ))}
              </div>
            </div>

            {/* Daily table */}
            <div className="flex-1 overflow-y-auto">
              {visible.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <p className="text-sm font-bold text-slate-400">No records match this filter</p>
                  <button onClick={() => setFilter('all')} className="text-[10px] font-black uppercase tracking-widest text-slate-300 hover:text-slate-500 transition-colors">
                    Clear filter
                  </button>
                </div>
              ) : (
                <table className="w-full text-[11px] border-separate border-spacing-0">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50">
                      {['Date','Day','Status','Check-in','Check-out','Hours', tab === 'earnings' ? 'Earned' : 'Deduction'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap border-b border-slate-100">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((d, i) => {
                      const isFuture = d.status === 'future';
                      const isOffDay = ['sunday', 'holiday'].includes(d.status);
                      const dateObj  = new Date(d.date + 'T00:00:00');
                      const dayName  = DAY_NAMES[dateObj.getDay()];
                      const dateFmt  = d.date.slice(5).replace('-', '/');
                      return (
                        <tr key={d.id || i}
                          className={`border-b border-slate-50 transition-colors ${
                            isFuture   ? 'opacity-25' :
                            d.deduction > 0 ? 'hover:bg-red-50/30' :
                            isOffDay   ? 'bg-slate-50/30 hover:bg-slate-50/60' :
                            'hover:bg-emerald-50/20'
                          }`}
                        >
                          <td className="px-3 py-2.5 font-mono font-bold text-slate-700 whitespace-nowrap">{dateFmt}</td>
                          <td className="px-3 py-2.5 text-slate-400 font-semibold">{dayName}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <StatusBadge status={d.status} isLate={d.is_late} />
                          </td>
                          <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">
                            {d.check_in  ? formatTimeIST(d.check_in)  : <span className="text-slate-200">-</span>}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">
                            {d.check_out ? formatTimeIST(d.check_out) : <span className="text-slate-200">-</span>}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-slate-500">
                            {d.hours_worked > 0 ? `${parseFloat(d.hours_worked).toFixed(1)}h` : <span className="text-slate-200">-</span>}
                          </td>
                          {tab === 'earnings' ? (
                            <td className="px-3 py-2.5 font-mono font-bold whitespace-nowrap">
                              {!isFuture && (d.earnings - d.deduction) > 0
                                ? <span className="text-emerald-600">₹{Math.round(d.earnings - d.deduction).toLocaleString('en-IN')}</span>
                                : <span className="text-slate-200">-</span>}
                            </td>
                          ) : (
                            <td className="px-3 py-2.5 font-mono font-bold whitespace-nowrap">
                              {d.deduction > 0
                                ? <span className="text-red-500">-₹{d.deduction.toLocaleString('en-IN')}</span>
                                : <span className="text-slate-200">-</span>}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer totals */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50 flex-shrink-0">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                {visible.length} of {daily.length} days
              </p>
              <div className="flex items-center gap-6">
                {tab === 'earnings' && totalEarnings > 0 && (
                  <div className="text-right">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Shown Earned</p>
                    <p className="text-sm font-black text-emerald-600 font-mono leading-tight">₹{totalEarnings.toLocaleString('en-IN')}</p>
                  </div>
                )}
                {tab === 'deductions' && totalDeductions > 0 && (
                  <div className="text-right">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Shown Deducted</p>
                    <p className="text-sm font-black text-red-500 font-mono leading-tight">-₹{totalDeductions.toLocaleString('en-IN')}</p>
                  </div>
                )}
                <div className="text-right border-l border-slate-200 pl-6">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Net Payable</p>
                  <p className="text-sm font-black text-slate-900 font-mono leading-tight">₹{Math.round(Number(summary.current_net_payable !== undefined ? summary.current_net_payable : (summary.net_salary_payable || 0))).toLocaleString('en-IN')}</p>
                </div>
                {summary.is_month_in_progress && summary.projected_month_end_net && (
                  <div className="text-right border-l border-slate-200 pl-6 hidden sm:block">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Projected Month-End</p>
                    <p className="text-sm font-black text-slate-500 font-mono leading-tight">₹{Math.round(Number(summary.projected_month_end_net)).toLocaleString('en-IN')}</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes salaryModalIn {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>
    </div>,
    document.body
  );
}
