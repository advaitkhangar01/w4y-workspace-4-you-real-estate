// client/src/pages/admin/HistoryPage.jsx
import React, { useState, useEffect } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { 
  Archive, FileText, UserCheck, History, Calendar, Lock, Unlock,
  ChevronRight, IndianRupee, Briefcase, Activity, CheckCircle, Clock, X
} from 'lucide-react';

export default function HistoryPage() {
  const [activeView, setActiveView] = useState('snapshots'); // 'snapshots', 'leaves', 'unlocks'
  const [loading, setLoading] = useState(true);
  const [snapshots, setSnapshots] = useState([]);
  
  // Drill-down Detail Modal State
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Leave Grid Data State
  const [leaveMatrix, setLeaveMatrix] = useState([]);
  const [matrixMonths, setMatrixMonths] = useState([]);

  // Unlocks Logs Audit State
  const [unlockLogs, setUnlockLogs] = useState([]);

  useEffect(() => {
    fetchHistoryData();
  }, [activeView]);

  const fetchHistoryData = async () => {
    setLoading(true);
    try {
      if (activeView === 'snapshots') {
        const { data } = await api.get('/monthly-close/history');
        setSnapshots(data);
      } else if (activeView === 'leaves') {
        // Fetch all history logs to know closed months
        const { data: logs } = await api.get('/monthly-close/history');
        
        // Build a sorted unique list of month/years
        const monthsList = logs.map(l => ({ month: l.month, year: l.year })).reverse();
        setMatrixMonths(monthsList);

        // Fetch detailed leave balances for each closed month in parallel
        const matrixData = {};
        await Promise.all(
          monthsList.map(async ({ month, year }) => {
            try {
              const { data } = await api.get(`/monthly-close/history/${month}/${year}`);
              data.leaves.forEach(record => {
                if (!matrixData[record.user_id]) {
                  matrixData[record.user_id] = {
                    employee_name: record.employee_name,
                    department: record.department,
                    history: {}
                  };
                }
                matrixData[record.user_id].history[`${month}-${year}`] = record;
              });
            } catch (err) {
              console.error(`Failed to fetch leaves for ${month}-${year}`);
            }
          })
        );
        setLeaveMatrix(Object.values(matrixData));

      } else if (activeView === 'unlocks') {
        // Fetch all history logs to know closed months
        const { data: logs } = await api.get('/monthly-close/history');
        
        // Fetch unlocks details from all closed months in parallel
        let allUnlocks = [];
        await Promise.all(
          logs.map(async ({ month, year }) => {
            try {
              const { data } = await api.get(`/monthly-close/history/${month}/${year}`);
              if (data.unlocks && data.unlocks.length > 0) {
                // Add month label context to logs
                const monthLabel = new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
                const logsWithContext = data.unlocks.map(u => ({ ...u, monthLabel }));
                allUnlocks = [...allUnlocks, ...logsWithContext];
              }
            } catch (err) {
              console.error(`Failed to fetch unlocks for ${month}-${year}`);
            }
          })
        );
        
        // Sort newest first
        allUnlocks.sort((a, b) => new Date(b.unlocked_at) - new Date(a.unlocked_at));
        setUnlockLogs(allUnlocks);
      }
    } catch (err) {
      toast.error('Failed to load history data');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSnapshot = async (month, year) => {
    setDetailLoading(true);
    try {
      const { data } = await api.get(`/monthly-close/history/${month}/${year}`);
      setSelectedSnapshot(data);
      setShowDetailModal(true);
    } catch (err) {
      toast.error('Failed to load snapshot details');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleRelock = async (m, y) => {
    if (!window.confirm('Are you sure you want to re-lock this period?')) return;
    try {
      await api.post('/monthly-close/relock', { month: m, year: y });
      toast.success('Period re-locked successfully');
      fetchHistoryData();
    } catch (err) {
      toast.error('Failed to re-lock');
    }
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Archive className="text-[#E05A1E]" size={24} />
              Studio Business History Archives
            </h1>
            <p className="text-xs text-muted">
              Audit-ready permanent snapshots of studio financial reports, HR leave ledger registers, and backdated logs.
            </p>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex bg-gray-100 p-1 rounded-xl self-start md:self-auto border border-gray-200 shadow-sm">
            <button 
              onClick={() => setActiveView('snapshots')}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${activeView === 'snapshots' ? 'bg-white shadow-sm text-primary' : 'text-gray-500 hover:text-gray-800'}`}
            >
              <FileText size={14} />
              Monthly Snapshots
            </button>
            <button 
              onClick={() => setActiveView('leaves')}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${activeView === 'leaves' ? 'bg-white shadow-sm text-primary' : 'text-gray-500 hover:text-gray-800'}`}
            >
              <UserCheck size={14} />
              Leave Balance Ledgers
            </button>
            <button 
              onClick={() => setActiveView('unlocks')}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${activeView === 'unlocks' ? 'bg-white shadow-sm text-primary' : 'text-gray-500 hover:text-gray-800'}`}
            >
              <History size={14} />
              Backdated Audit Logs
            </button>
          </div>
        </div>

        {/* View Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 bg-white rounded-2xl border border-gray-150 shadow-sm">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-400 text-xs italic">Loading archive registers...</p>
          </div>
        ) : (
          <div className="animate-in fade-in duration-500">
            {/* VIEW 1: Snapshots Timeline */}
            {activeView === 'snapshots' && (
              <div className="space-y-4">
                {snapshots.length === 0 ? (
                  <div className="text-center py-16 bg-white rounded-2xl border border-gray-200 text-xs text-gray-400 italic">
                    No closed months archived yet. Use the Month Close tab in Accounting Control to create logs.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {snapshots.map(log => {
                      const monthName = new Date(log.year, log.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
                      const snap = log.snapshot || {};
                      const rev = parseFloat(snap.revenue?.received || 0);
                      const exp = parseFloat(snap.expenses?.total || 0);
                      const margin = rev - exp;

                      return (
                        <div key={log.id} className="bg-white rounded-2xl border border-gray-200 hover:border-gray-300 shadow-sm hover:shadow-md p-5 flex flex-col justify-between gap-4 transition-all">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide">{monthName}</h3>
                              <p className="text-[10px] text-muted">
                                Closed {new Date(log.closed_at).toLocaleDateString()} by {log.closed_by_name || 'System Admin'}
                              </p>
                            </div>
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 border rounded-full text-[9px] font-black uppercase tracking-wider ${log.is_unlocked ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                              {log.is_unlocked ? '🔓 Unlocked' : '🔒 Locked'}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2 bg-gray-50/70 border border-gray-100 rounded-xl p-3.5 text-center">
                            <div>
                              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Revenue</p>
                              <p className="text-xs font-black text-emerald-600 font-mono mt-1">₹{rev.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Expenses</p>
                              <p className="text-xs font-black text-red-500 font-mono mt-1">₹{exp.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Cash Profit</p>
                              <p className={`text-xs font-black font-mono mt-1 ${margin >= 0 ? 'text-blue-600' : 'text-red-600'}`}>₹{margin.toLocaleString()}</p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            {log.had_pending_payroll ? (
                              <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5" title={`Justification: ${log.close_reason}`}>
                                ⚠ {log.pending_payroll_count} pending payrolls
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-2 py-0.5">
                                ✓ Payroll fully released
                              </span>
                            )}

                            <div className="flex gap-2">
                              {log.is_unlocked && (
                                <button 
                                  onClick={() => handleRelock(log.month, log.year)}
                                  className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 rounded text-[9px] font-black uppercase tracking-wider transition-colors"
                                >
                                  Re-lock
                                </button>
                              )}
                              <button 
                                onClick={() => handleOpenSnapshot(log.month, log.year)}
                                className="px-2.5 py-1 bg-[#E05A1E]/10 hover:bg-[#E05A1E]/20 text-[#E05A1E] rounded text-[9px] font-black uppercase tracking-wider transition-colors"
                              >
                                View Details
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* VIEW 2: Leave Grid Ledger Matrix */}
            {activeView === 'leaves' && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-gray-100 flex items-center gap-2 bg-gradient-to-r from-gray-50 to-white">
                  <UserCheck size={18} className="text-primary" />
                  <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Historical Employee Leave Ledgers Matrix</h3>
                </div>

                <div className="overflow-x-auto">
                  {matrixMonths.length === 0 ? (
                    <div className="text-center py-12 text-xs text-gray-400 italic">
                      No closed leave summaries archived yet.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-gray-50/50 border-b border-gray-100">
                          <th className="py-3 px-6 font-black text-gray-400 uppercase text-[9px] min-w-[150px]">Employee</th>
                          <th className="py-3 px-6 font-black text-gray-400 uppercase text-[9px] border-r">Dept</th>
                          {matrixMonths.map(({ month, year }) => {
                            const label = new Date(year, month - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
                            return (
                              <th key={`${month}-${year}`} className="py-3 px-4 font-black text-slate-800 uppercase text-[9px] text-center border-r last:border-r-0 min-w-[110px]">
                                {label}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-medium text-slate-700">
                        {leaveMatrix.map(row => (
                          <tr key={row.employee_name} className="hover:bg-gray-50/30">
                            <td className="py-4 px-6 font-bold text-gray-900">{row.employee_name}</td>
                            <td className="py-4 px-6 capitalize text-gray-500 border-r">{row.department || 'N/A'}</td>
                            {matrixMonths.map(({ month, year }) => {
                              const record = row.history[`${month}-${year}`];
                              if (!record) {
                                return (
                                  <td key={`${month}-${year}`} className="py-4 px-4 text-center text-gray-300 italic text-[10px] border-r last:border-r-0">
                                    -
                                  </td>
                                );
                              }
                              
                              const opening = parseFloat(record.opening_balance);
                              const earned = parseFloat(record.earned);
                              const taken = parseFloat(record.leaves_taken);
                              const closing = parseFloat(record.closing_balance);
                              const unpaid = parseFloat(record.unpaid_leaves);

                              return (
                                <td key={`${month}-${year}`} className="py-3 px-4 text-center border-r last:border-r-0 text-[10px]">
                                  <div className="flex flex-col gap-0.5">
                                    <div className="flex justify-center items-baseline gap-1 text-[9px] text-muted">
                                      <span>Op: {opening.toFixed(1)}</span>
                                      <span>|</span>
                                      <span className="text-emerald-600">+{earned.toFixed(1)}</span>
                                    </div>
                                    <div className="font-bold text-gray-900">
                                      Close: {closing.toFixed(1)}
                                    </div>
                                    <div className="flex justify-center items-center gap-1.5">
                                      <span className="text-red-500 font-bold" title="Leaves Taken">Used: {taken.toFixed(1)}</span>
                                      {unpaid > 0 && (
                                        <span className="bg-amber-100 text-amber-700 font-black px-1 rounded text-[8px] animate-pulse">
                                          {unpaid.toFixed(1)} unpaid
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* VIEW 3: Backdated Postings Unlock Audit Logs */}
            {activeView === 'unlocks' && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-gray-100 flex items-center gap-2 bg-gradient-to-r from-gray-50 to-white">
                  <History size={18} className="text-gray-500" />
                  <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Period Unlock & Backdated Entry Audit Logs</h3>
                </div>

                <div className="overflow-x-auto">
                  {unlockLogs.length === 0 ? (
                    <div className="text-center py-12 text-xs text-gray-400 italic">
                      No backdated unlock history logs recorded yet.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-gray-50/50">
                          <th className="px-6 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Target Period</th>
                          <th className="px-6 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Unlocked At</th>
                          <th className="px-6 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Unlocked By</th>
                          <th className="px-6 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Unlock Justification</th>
                          <th className="px-6 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Re-locked At</th>
                          <th className="px-6 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Re-locked By</th>
                          <th className="px-6 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-medium text-slate-700">
                        {unlockLogs.map(ulock => (
                          <tr key={ulock.id} className="hover:bg-gray-50/30">
                            <td className="px-6 py-4">
                              <span className="text-xs font-bold text-gray-900">{ulock.monthLabel}</span>
                            </td>
                            <td className="px-6 py-4 font-mono text-gray-500 text-[10px]">
                              {new Date(ulock.unlocked_at).toLocaleDateString()} {new Date(ulock.unlocked_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="px-6 py-4 font-semibold text-gray-800">{ulock.unlocked_by_name || 'Admin'}</td>
                            <td className="px-6 py-4 text-gray-600 max-w-[250px] truncate" title={ulock.reason}>
                              {ulock.reason}
                            </td>
                            <td className="px-6 py-4 font-mono text-gray-500 text-[10px]">
                              {ulock.relocked_at ? `${new Date(ulock.relocked_at).toLocaleDateString()} ${new Date(ulock.relocked_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : '-'}
                            </td>
                            <td className="px-6 py-4 text-gray-800">
                              {ulock.relocked_by_name || (ulock.relocked_at ? 'Admin' : '-')}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`inline-block px-2.5 py-0.5 border rounded-full text-[9px] font-black uppercase tracking-wider ${ulock.is_active ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                                {ulock.is_active ? '🔓 Active Window' : '🔒 Re-locked'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Drill-down Snapshot Detail Modal */}
      {showDetailModal && selectedSnapshot && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full border border-gray-100 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 my-8">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">
                  Business Archive Snapshot Details: {new Date(selectedSnapshot.log.year, selectedSnapshot.log.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
                </h3>
                <p className="text-[10px] text-muted mt-0.5 leading-relaxed">
                  Closed on {new Date(selectedSnapshot.log.closed_at).toLocaleDateString()} by {selectedSnapshot.log.closed_by_name || 'System Admin'}
                </p>
              </div>
              <button 
                onClick={() => {
                  setShowDetailModal(false);
                  setSelectedSnapshot(null);
                }}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 font-medium">
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Project Billed</p>
                  <h4 className="text-base font-black text-gray-900 mt-1">₹{parseFloat(selectedSnapshot.log.snapshot?.revenue?.billed || 0).toLocaleString()}</h4>
                </div>
                <div className="bg-emerald-50/40 border border-emerald-100 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Revenue Received</p>
                  <h4 className="text-base font-black text-emerald-600 mt-1">₹{parseFloat(selectedSnapshot.log.snapshot?.revenue?.received || 0).toLocaleString()}</h4>
                </div>
                <div className="bg-red-50/40 border border-red-100 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Expenses (Total)</p>
                  <h4 className="text-base font-black text-red-500 mt-1">₹{parseFloat(selectedSnapshot.log.snapshot?.expenses?.total || 0).toLocaleString()}</h4>
                </div>
                <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Net Realized Profit</p>
                  <h4 className="text-base font-black text-blue-600 mt-1">₹{parseFloat(selectedSnapshot.log.snapshot?.profit_loss?.realized || 0).toLocaleString()}</h4>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Category Expenses */}
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 font-bold text-xs text-gray-700">
                    Expense Category Breakdown
                  </div>
                  <div className="p-4">
                    {selectedSnapshot.log.snapshot?.expenses?.by_category ? (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="py-2 text-gray-400 font-bold uppercase text-[9px]">Category</th>
                            <th className="py-2 text-right text-gray-400 font-bold uppercase text-[9px]">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 font-medium">
                          {Object.entries(selectedSnapshot.log.snapshot.expenses.by_category).map(([cat, val]) => (
                            <tr key={cat}>
                              <td className="py-2 text-gray-600">{cat}</td>
                              <td className="py-2 text-right text-slate-800 font-mono">₹{parseFloat(val).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-center py-4 text-xs text-gray-400 italic">No breakdown saved.</p>
                    )}
                  </div>
                </div>

                <div className="space-y-6">
                  {/* HR Summary */}
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 font-bold text-xs text-gray-700">
                      HR Leaves & Payroll summary
                    </div>
                    <div className="p-4">
                      <table className="w-full text-left text-xs border-collapse">
                        <tbody className="divide-y divide-gray-50 font-medium">
                          <tr>
                            <td className="py-2.5 text-gray-500">Total Employees</td>
                            <td className="py-2.5 text-right text-gray-800 font-bold">{selectedSnapshot.log.snapshot?.hr?.total_employees}</td>
                          </tr>
                          <tr>
                            <td className="py-2.5 text-gray-500">Salaries Released</td>
                            <td className="py-2.5 text-right text-gray-800 font-bold">{selectedSnapshot.log.snapshot?.hr?.payroll_processed} employees</td>
                          </tr>
                          <tr>
                            <td className="py-2.5 text-gray-500">Salaries Deferred</td>
                            <td className="py-2.5 text-right text-amber-600 font-bold">{selectedSnapshot.log.snapshot?.hr?.payroll_pending} employees</td>
                          </tr>
                          <tr>
                            <td className="py-2.5 text-gray-500">Total Approved Leave Days</td>
                            <td className="py-2.5 text-right text-gray-800 font-bold">{selectedSnapshot.log.snapshot?.hr?.total_leave_days_taken} days</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Project Metrics */}
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 font-bold text-xs text-gray-700">
                      Project Statistics
                    </div>
                    <div className="p-4">
                      <table className="w-full text-left text-xs border-collapse">
                        <tbody className="divide-y divide-gray-50 font-medium">
                          <tr>
                            <td className="py-2.5 text-gray-500">Active Design Projects</td>
                            <td className="py-2.5 text-right text-gray-800 font-bold">{selectedSnapshot.log.snapshot?.projects?.total_active}</td>
                          </tr>
                          <tr>
                            <td className="py-2.5 text-gray-500">Milestones Completed This Month</td>
                            <td className="py-2.5 text-right text-emerald-600 font-bold">{selectedSnapshot.log.snapshot?.projects?.completed_this_month}</td>
                          </tr>
                          <tr>
                            <td className="py-2.5 text-gray-500">New Onboardings This Month</td>
                            <td className="py-2.5 text-right text-[#E05A1E] font-bold">{selectedSnapshot.log.snapshot?.projects?.new_this_month}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* Employee Leaves Ledgers Snapshot */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 font-bold text-xs text-gray-700">
                  Rolling Leave Balance Ledgers Snapshot
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="py-3 px-4 font-bold text-gray-400 uppercase text-[9px]">Employee</th>
                        <th className="py-3 px-4 font-bold text-gray-400 uppercase text-[9px]">Department</th>
                        <th className="py-3 px-4 font-bold text-gray-400 uppercase text-[9px] text-right">Opening Balance</th>
                        <th className="py-3 px-4 font-bold text-gray-400 uppercase text-[9px] text-right">Earned</th>
                        <th className="py-3 px-4 font-bold text-gray-400 uppercase text-[9px] text-right">Leaves Used</th>
                        <th className="py-3 px-4 font-bold text-gray-400 uppercase text-[9px] text-right">Closing Balance</th>
                        <th className="py-3 px-4 font-bold text-gray-400 uppercase text-[9px] text-right">Unpaid Leaves</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium text-slate-700">
                      {selectedSnapshot.leaves?.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="py-6 text-center text-gray-400 italic">No registers.</td>
                        </tr>
                      ) : selectedSnapshot.leaves?.map(leave => (
                        <tr key={leave.id} className="hover:bg-gray-50/30">
                          <td className="py-3 px-4 font-bold text-gray-900">{leave.employee_name}</td>
                          <td className="py-3 px-4 capitalize text-gray-500">{leave.department || 'N/A'}</td>
                          <td className="py-3 px-4 text-right font-mono text-gray-500">{parseFloat(leave.opening_balance).toFixed(1)}</td>
                          <td className="py-3 px-4 text-right font-mono text-emerald-600">+{parseFloat(leave.earned).toFixed(1)}</td>
                          <td className="py-3 px-4 text-right font-mono text-red-500">-{parseFloat(leave.leaves_taken).toFixed(1)}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-gray-900">{parseFloat(leave.closing_balance).toFixed(1)}</td>
                          <td className={`py-3 px-4 text-right font-mono font-bold ${parseFloat(leave.unpaid_leaves) > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                            {parseFloat(leave.unpaid_leaves) > 0 ? `${parseFloat(leave.unpaid_leaves).toFixed(1)} unpaid` : '0.0'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Unlock Logs Audit Trail */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 font-bold text-xs text-gray-700">
                  Backdated Entries Period Unlock Audit Trail Logs
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="py-3 px-4 font-bold text-gray-400 uppercase text-[9px]">Unlocked At</th>
                        <th className="py-3 px-4 font-bold text-gray-400 uppercase text-[9px]">Unlocked By</th>
                        <th className="py-3 px-4 font-bold text-gray-400 uppercase text-[9px]">Unlock Reason Justification</th>
                        <th className="py-3 px-4 font-bold text-gray-400 uppercase text-[9px]">Re-locked At</th>
                        <th className="py-3 px-4 font-bold text-gray-400 uppercase text-[9px]">Re-locked By</th>
                        <th className="py-3 px-4 font-bold text-gray-400 uppercase text-[9px] text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium text-slate-700">
                      {selectedSnapshot.unlocks?.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="py-6 text-center text-gray-400 italic">No backdated audit trail logs found.</td>
                        </tr>
                      ) : selectedSnapshot.unlocks?.map(ulock => (
                        <tr key={ulock.id} className="hover:bg-gray-50/30">
                          <td className="py-3 px-4 font-mono text-gray-500">
                            {new Date(ulock.unlocked_at).toLocaleDateString()} {new Date(ulock.unlocked_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-3 px-4 font-semibold text-gray-800">{ulock.unlocked_by_name || 'Admin'}</td>
                          <td className="py-3 px-4 text-gray-600 max-w-[200px] truncate" title={ulock.reason}>{ulock.reason}</td>
                          <td className="py-3 px-4 font-mono text-gray-500">
                            {ulock.relocked_at ? `${new Date(ulock.relocked_at).toLocaleDateString()} ${new Date(ulock.relocked_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : '-'}
                          </td>
                          <td className="py-3 px-4 text-gray-800">{ulock.relocked_by_name || (ulock.relocked_at ? 'Admin' : '-')}</td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-block px-2 py-0.5 border rounded-full text-[9px] font-black uppercase tracking-wider ${ulock.is_active ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                              {ulock.is_active ? 'Active' : 'Closed'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button 
                onClick={() => {
                  setShowDetailModal(false);
                  setSelectedSnapshot(null);
                }}
                className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-black uppercase tracking-widest transition-all active:scale-[0.98]"
              >
                Close Snapshot
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
