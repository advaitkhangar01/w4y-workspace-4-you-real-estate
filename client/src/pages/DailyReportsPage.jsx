// client/src/pages/DailyReportsPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '../components/layout/AppLayout';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { getISODateIST, formatDateIST } from '../utils/time';
import { 
  ClipboardList, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  User, 
  Calendar, 
  Filter, 
  Send, 
  Edit3, 
  FileText, 
  X, 
  UserX,
  AlertOctagon,
  Loader2,
  ChevronRight
} from 'lucide-react';

export default function DailyReportsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // Loading states
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Common data
  const [users, setUsers] = useState([]);

  // Employee-specific state
  const [myReports, setMyReports] = useState([]);
  const [todayReport, setTodayReport] = useState(null);
  const [workDone, setWorkDone] = useState('');
  const [hoursWorked, setHoursWorked] = useState(8.0);
  const [nextDayPlan, setNextDayPlan] = useState('');
  const [blockers, setBlockers] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editingReportId, setEditingReportId] = useState(null);

  // Admin-specific state
  const [adminReports, setAdminReports] = useState([]);
  const [selectedDate, setSelectedDate] = useState(getISODateIST());
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');

  // Fetch initial data based on role
  const fetchEmployeeData = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch employee's report list and today's report
      const [historyRes, todayRes] = await Promise.all([
        api.get('/daily-reports'),
        api.get('/daily-reports/today')
      ]);
      
      setMyReports(historyRes.data.reports || []);
      
      const todayData = todayRes.data;
      setTodayReport(todayData);
      
      if (todayData) {
        setWorkDone(todayData.work_done || '');
        setHoursWorked(parseFloat(todayData.hours_worked) || 8.0);
        setNextDayPlan(todayData.next_day_plan || '');
        setBlockers(todayData.blockers || '');
      } else {
        resetForm();
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load daily report status');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAdminData = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch users list and reports for the selected date
      const [usersRes, reportsRes] = await Promise.all([
        api.get('/auth/users'),
        api.get(`/daily-reports?date=${selectedDate}`)
      ]);

      setUsers(usersRes.data.users || []);
      setAdminReports(reportsRes.data.reports || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load reports dashboard');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    if (isAdmin) {
      fetchAdminData();
    } else {
      fetchEmployeeData();
    }
  }, [isAdmin, fetchAdminData, fetchEmployeeData]);

  const resetForm = () => {
    setWorkDone('');
    setHoursWorked(8.0);
    setNextDayPlan('');
    setBlockers('');
    setIsEditing(false);
    setEditingReportId(null);
  };

  // Submit today's report (Create/Update)
  const handleSubmitReport = async (e) => {
    e.preventDefault();
    if (!workDone.trim()) {
      return toast.error('Work done today is required');
    }

    const hours = parseFloat(hoursWorked);
    if (isNaN(hours) || hours < 0.5 || hours > 24) {
      return toast.error('Hours spent must be between 0.5 and 24 hours');
    }

    setSubmitting(true);
    try {
      if (isEditing && editingReportId) {
        const res = await api.put(`/daily-reports/${editingReportId}`, {
          work_done: workDone.trim(),
          hours_worked: hours,
          next_day_plan: nextDayPlan.trim() || null,
          blockers: blockers.trim() || null
        });
        toast.success('Daily report updated successfully');
        setTodayReport(res.data);
        setIsEditing(false);
      } else {
        const res = await api.post('/daily-reports', {
          work_done: workDone.trim(),
          hours_worked: hours,
          next_day_plan: nextDayPlan.trim() || null,
          blockers: blockers.trim() || null
        });
        toast.success('Today\'s daily report submitted!');
        setTodayReport(res.data);
      }
      // Refresh history feed
      const historyRes = await api.get('/daily-reports');
      setMyReports(historyRes.data.reports || []);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to submit daily report');
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle edit for today's submission
  const handleStartEdit = (report) => {
    setWorkDone(report.work_done);
    setHoursWorked(parseFloat(report.hours_worked));
    setNextDayPlan(report.next_day_plan || '');
    setBlockers(report.blockers || '');
    setIsEditing(true);
    setEditingReportId(report.id);
    // Scroll form into view on mobile
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Cancel editing mode
  const handleCancelEdit = () => {
    if (todayReport) {
      setWorkDone(todayReport.work_done || '');
      setHoursWorked(parseFloat(todayReport.hours_worked) || 8.0);
      setNextDayPlan(todayReport.next_day_plan || '');
      setBlockers(todayReport.blockers || '');
    } else {
      resetForm();
    }
    setIsEditing(false);
    setEditingReportId(null);
  };

  // ADMIN ANALYTICS CALCULATIONS
  const eligibleStaff = users.filter(u => u.role !== 'admin');
  const submittedStaffIds = adminReports.map(r => r.user_id);
  const reportsSubmittedCount = adminReports.length;
  const eligibleStaffCount = eligibleStaff.length;
  
  const totalHoursLogged = adminReports.reduce((sum, r) => sum + parseFloat(r.hours_worked || 0), 0);
  const activeBlockersCount = adminReports.filter(r => r.blockers && r.blockers.trim() !== '').length;

  // Filtered reports for admin feed
  const filteredAdminReports = adminReports.filter(r => {
    if (selectedEmployeeId && r.user_id !== parseInt(selectedEmployeeId)) {
      return false;
    }
    return true;
  });

  // Missing submissions checklist
  const missingSubmissions = eligibleStaff.filter(u => !submittedStaffIds.includes(u.id));

  // Loading state overlay
  if (loading && users.length === 0 && myReports.length === 0) {
    return (
      <AppLayout>
        <div className="flex h-[80vh] items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-10 w-10 animate-spin text-[#E05A1E] mx-auto mb-4" />
            <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Loading Work Reports...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* HEADER SECTION */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#E2E8F0]/80">
          <div>
            <h1 className="text-2xl font-black text-[#1A1A1A] tracking-tight uppercase">
              {isAdmin ? 'Daily Work Reports Control Panel' : 'Daily Work Reporting'}
            </h1>
            <p className="text-xs font-bold text-[#E05A1E] tracking-widest uppercase mt-1">
              {isAdmin ? `Management & Submission Compliance` : 'Log your daily activity and blockers'}
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white/70 backdrop-blur-md px-4 py-2 rounded-xl border border-[#E2E8F0]/80 shadow-sm self-start md:self-auto">
            <Calendar className="h-4 w-4 text-[#E05A1E]" />
            <span className="text-xs font-black uppercase text-slate-700">
              {isAdmin ? formatDateIST(selectedDate) : formatDateIST(new Date())}
            </span>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 1. EMPLOYEE ROLE VIEW                                    */}
        {/* ======================================================== */}
        {!isAdmin && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Form Column - Left (5 cols) */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Today's Status Form Card */}
              {todayReport && !isEditing ? (
                // SUBMITTED STATE
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200/80 rounded-3xl p-6 shadow-md relative overflow-hidden transition-all duration-300 hover:shadow-lg">
                  {/* Decorative backdrop circle */}
                  <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl" />
                  
                  <div className="flex items-start gap-4">
                    <div className="bg-emerald-500/10 p-3 rounded-2xl border border-emerald-300/40 flex-shrink-0">
                      <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                    </div>
                    <div className="space-y-4 flex-1">
                      <div>
                        <h2 className="text-lg font-black text-slate-800 leading-tight uppercase">Great Work!</h2>
                        <p className="text-xs font-semibold text-emerald-700/80 uppercase mt-0.5">Your report for today has been logged.</p>
                      </div>

                      <div className="border-t border-emerald-200/60 pt-4 space-y-3">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-slate-500 uppercase">Hours Worked:</span>
                          <span className="font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/40">
                            {parseFloat(todayReport.hours_worked).toFixed(2)} Hrs
                          </span>
                        </div>
                        
                        <div className="space-y-1">
                          <span className="text-[10px] font-black text-slate-400 uppercase block">Work Done:</span>
                          <p className="text-xs text-slate-700 font-semibold bg-white/50 p-2.5 rounded-xl border border-emerald-200/30 whitespace-pre-wrap">
                            {todayReport.work_done}
                          </p>
                        </div>

                        {todayReport.next_day_plan && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase block">Next Day Plan:</span>
                            <p className="text-xs text-slate-700 font-semibold bg-white/50 p-2.5 rounded-xl border border-emerald-200/30 whitespace-pre-wrap">
                              {todayReport.next_day_plan}
                            </p>
                          </div>
                        )}

                        {todayReport.blockers && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-black text-red-400 uppercase block">Blockers:</span>
                            <p className="text-xs text-red-800 font-semibold bg-red-50/50 p-2.5 rounded-xl border border-red-200/30 whitespace-pre-wrap">
                              {todayReport.blockers}
                            </p>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => handleStartEdit(todayReport)}
                        className="w-full flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-black text-xs uppercase tracking-widest py-3 px-4 rounded-xl border border-slate-300/80 hover:border-slate-400 transition-all duration-200 shadow-sm"
                      >
                        <Edit3 className="h-3.5 w-3.5 text-[#E05A1E]" />
                        Edit Today's Submission
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                // CREATE / EDIT FORM STATE
                <div className="bg-white rounded-3xl border border-[#E2E8F0]/80 p-6 shadow-md transition-all duration-300 hover:shadow-lg">
                  <div className="flex items-center justify-between pb-4 border-b border-[#E2E8F0]/60 mb-6">
                    <h2 className="text-base font-black text-[#1A1A1A] uppercase tracking-tight flex items-center gap-2">
                      <ClipboardList className="h-5 w-5 text-[#E05A1E]" />
                      {isEditing ? "Edit Today's Report" : "Submit Daily Report"}
                    </h2>
                    {isEditing && (
                      <button 
                        onClick={handleCancelEdit}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-all"
                        title="Cancel Editing"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <form onSubmit={handleSubmitReport} className="space-y-5">
                    {/* Work Done Today */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">
                        Work Done Today <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        required
                        rows="4"
                        placeholder="Detail the achievements, features completed, tasks worked on, etc..."
                        value={workDone}
                        onChange={(e) => setWorkDone(e.target.value)}
                        className="w-full text-sm font-semibold rounded-xl border border-slate-300/80 px-4 py-3 focus:outline-none focus:ring-1 focus:ring-[#E05A1E] focus:border-[#E05A1E] transition-all bg-[#FAFBFD]"
                      />
                    </div>

                    {/* Hours Logged & Next Day Plan */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">
                          Hours Spent
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.5"
                            min="0.5"
                            max="24"
                            value={hoursWorked}
                            onChange={(e) => setHoursWorked(e.target.value)}
                            className="w-full text-sm font-black rounded-xl border border-slate-300/80 pl-4 pr-12 py-3 focus:outline-none focus:ring-1 focus:ring-[#E05A1E] focus:border-[#E05A1E] transition-all bg-[#FAFBFD]"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 uppercase">
                            Hrs
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <span className="text-[10px] text-slate-400 font-bold block mt-7">
                          Standard workday defaults to 8.00 hours. Range is 0.5 to 24.
                        </span>
                      </div>
                    </div>

                    {/* Next Day Plan */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">
                        Next Day Plan (Optional)
                      </label>
                      <textarea
                        rows="2"
                        placeholder="What are your goals or priority items for the next working day?"
                        value={nextDayPlan}
                        onChange={(e) => setNextDayPlan(e.target.value)}
                        className="w-full text-sm font-semibold rounded-xl border border-slate-300/80 px-4 py-3 focus:outline-none focus:ring-1 focus:ring-[#E05A1E] focus:border-[#E05A1E] transition-all bg-[#FAFBFD]"
                      />
                    </div>

                    {/* Blockers / Obstacles */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-black text-red-500 uppercase tracking-wider block flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Blockers / Challenges (Optional)
                      </label>
                      <textarea
                        rows="2"
                        placeholder="Any bottlenecks, external dependencies, or issues blocking your progress?"
                        value={blockers}
                        onChange={(e) => setBlockers(e.target.value)}
                        className="w-full text-sm font-semibold rounded-xl border-2 border-dashed border-red-200/80 hover:border-red-300 focus:border-red-500 focus:ring-0 focus:outline-none px-4 py-3 bg-[#FFF5F5]/30 focus:bg-[#FFF5F5]/50 transition-all text-slate-700"
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                      {isEditing && (
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider border border-slate-300 text-slate-600 hover:bg-slate-50 transition active:scale-98"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={submitting}
                        className={`flex-1 flex items-center justify-center gap-2 bg-[#E05A1E] hover:bg-[#E05A1E]/90 text-white font-black text-xs uppercase tracking-widest py-3 px-4 rounded-xl shadow-md transition-all active:scale-98 disabled:opacity-75`}
                      >
                        {submitting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        {isEditing ? 'Update Report' : 'Submit Report'}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>

            {/* Timeline Column - Right (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              <div className="pb-2">
                <h2 className="text-base font-black text-[#1A1A1A] uppercase tracking-tight">Your Submissions Timeline</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Chronological feed of your past logs</p>
              </div>

              {myReports.length === 0 ? (
                <div className="bg-white rounded-3xl border border-[#E2E8F0]/80 p-8 text-center text-slate-400">
                  <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-bold uppercase tracking-wider">No work reports logged yet.</p>
                </div>
              ) : (
                <div className="relative border-l border-slate-200 pl-6 space-y-6 ml-3">
                  {myReports.map((report) => {
                    const isToday = getISODateIST() === getISODateIST(report.date);
                    return (
                      <div key={report.id} className="relative group">
                        
                        {/* Timeline Circle Node */}
                        <span className={`absolute -left-[31px] top-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full border-2 bg-white transition-all ${
                          isToday 
                            ? 'border-[#E05A1E] ring-4 ring-orange-100 scale-110' 
                            : 'border-slate-300 group-hover:border-slate-400'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${
                            isToday ? 'bg-[#E05A1E]' : 'bg-slate-300 group-hover:bg-slate-400'
                          }`} />
                        </span>

                        {/* Report Card */}
                        <div className={`p-5 rounded-2xl border transition-all ${
                          isToday 
                            ? 'border-orange-200/80 bg-orange-50/10 shadow-sm' 
                            : 'border-[#E2E8F0]/80 bg-white hover:border-slate-300 hover:shadow-sm'
                        }`}>
                          
                          {/* Card Header */}
                          <div className="flex justify-between items-start gap-4 mb-3">
                            <div>
                              <span className="text-xs font-black text-slate-800 uppercase block">
                                {formatDateIST(report.date)}
                              </span>
                              <span className="text-[10px] font-bold text-slate-400 uppercase block mt-0.5">
                                Logged {timeAgo(report.created_at)}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/40 uppercase">
                                {parseFloat(report.hours_worked).toFixed(2)} Hrs
                              </span>
                              {isToday && (
                                <button
                                  onClick={() => handleStartEdit(report)}
                                  className="p-1 text-slate-400 hover:text-[#E05A1E] rounded-lg hover:bg-orange-50 transition"
                                  title="Edit Report"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Card Body content */}
                          <div className="space-y-3 border-t border-slate-100 pt-3 text-xs">
                            <div>
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Work Done</span>
                              <p className="text-slate-700 font-semibold whitespace-pre-wrap leading-relaxed">{report.work_done}</p>
                            </div>
                            
                            {report.next_day_plan && (
                              <div>
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Next Day Plan</span>
                                <p className="text-slate-600 font-semibold whitespace-pre-wrap leading-relaxed">{report.next_day_plan}</p>
                              </div>
                            )}

                            {report.blockers && (
                              <div className="bg-[#FEF2F2] border border-red-100 p-2.5 rounded-xl text-red-800">
                                <span className="text-[9px] font-black text-red-500 uppercase tracking-widest block flex items-center gap-1 mb-0.5">
                                  <AlertOctagon className="h-3 w-3" />
                                  Blocker / Challenge
                                </span>
                                <p className="font-semibold whitespace-pre-wrap leading-relaxed">{report.blockers}</p>
                              </div>
                            )}
                          </div>

                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ======================================================== */}
        {/* 2. ADMIN ROLE VIEW                                       */}
        {/* ======================================================== */}
        {isAdmin && (
          <div className="space-y-6">
            
            {/* TOP ANALYTICS PANEL */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Card 1: Reports Submitted */}
              <div className="bg-white rounded-3xl border border-[#E2E8F0]/80 p-5 shadow-sm relative overflow-hidden transition-all duration-300 hover:shadow-md">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Reports Submitted</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-slate-800">{reportsSubmittedCount}</span>
                      <span className="text-xs font-bold text-slate-400">/ {eligibleStaffCount} Employees</span>
                    </div>
                  </div>
                  <div className="bg-orange-50 p-3 rounded-2xl border border-orange-100 flex-shrink-0">
                    <ClipboardList className="h-5 w-5 text-[#E05A1E]" />
                  </div>
                </div>
                
                {/* Progress bar */}
                <div className="mt-4">
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-[#E05A1E] h-1.5 rounded-full transition-all duration-500" 
                      style={{ width: `${eligibleStaffCount > 0 ? (reportsSubmittedCount / eligibleStaffCount) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[9px] font-black text-slate-400 uppercase tracking-wider mt-1.5">
                    <span>Submission Compliance</span>
                    <span className="text-[#E05A1E]">
                      {eligibleStaffCount > 0 ? Math.round((reportsSubmittedCount / eligibleStaffCount) * 100) : 0}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 2: Total Hours Logged */}
              <div className="bg-white rounded-3xl border border-[#E2E8F0]/80 p-5 shadow-sm relative overflow-hidden transition-all duration-300 hover:shadow-md">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Total Hours Logged</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-slate-800">
                        {totalHoursLogged.toFixed(1)}
                      </span>
                      <span className="text-xs font-bold text-slate-400">Hours Today</span>
                    </div>
                  </div>
                  <div className="bg-blue-50 p-3 rounded-2xl border border-blue-100 flex-shrink-0">
                    <Clock className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
                <div className="mt-4 text-[9px] font-black text-slate-400 uppercase tracking-wider border-t border-slate-100 pt-2 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  <span>
                    Average {reportsSubmittedCount > 0 ? (totalHoursLogged / reportsSubmittedCount).toFixed(2) : 0} hours per report
                  </span>
                </div>
              </div>

              {/* Card 3: Active Blockers */}
              <div className={`rounded-3xl border p-5 shadow-sm relative overflow-hidden transition-all duration-300 hover:shadow-md ${
                activeBlockersCount > 0 
                  ? 'border-red-200/80 bg-gradient-to-br from-red-50/10 to-red-50/30' 
                  : 'border-[#E2E8F0]/80 bg-white'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Active Blockers</span>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-2xl font-black ${activeBlockersCount > 0 ? 'text-red-600' : 'text-slate-800'}`}>
                        {activeBlockersCount}
                      </span>
                      <span className="text-xs font-bold text-slate-400">Bottlenecks Reported</span>
                    </div>
                  </div>
                  <div className={`p-3 rounded-2xl border flex-shrink-0 ${
                    activeBlockersCount > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100'
                  }`}>
                    <AlertTriangle className={`h-5 w-5 ${activeBlockersCount > 0 ? 'text-red-500' : 'text-slate-400'}`} />
                  </div>
                </div>
                <div className="mt-4 text-[9px] font-black text-slate-400 uppercase tracking-wider border-t border-slate-100 pt-2">
                  {activeBlockersCount > 0 ? (
                    <span className="text-red-600 font-bold">Action required from management</span>
                  ) : (
                    <span>All projects running smoothly</span>
                  )}
                </div>
              </div>

            </div>

            {/* MIDDLE LAYOUT: FILTERS & FEED & COMPLIANCE SIDEBAR */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Left Column: Submissions Feed (8 cols) */}
              <div className="lg:col-span-8 space-y-4">
                
                {/* FILTERS PANEL CARD */}
                <div className="bg-white/70 backdrop-blur-md rounded-2xl border border-[#E2E8F0]/80 p-4 shadow-sm flex flex-col sm:flex-row items-center gap-4 justify-between">
                  
                  {/* Date Selector */}
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Calendar className="h-4 w-4 text-[#E05A1E] flex-shrink-0" />
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="text-xs font-black uppercase text-slate-700 bg-transparent border-0 focus:outline-none focus:ring-0 p-0 cursor-pointer"
                    />
                  </div>

                  {/* Employee Selector Dropdown */}
                  <div className="flex items-center gap-2 w-full sm:w-auto border-t sm:border-t-0 sm:border-l border-slate-200 pt-3 sm:pt-0 sm:pl-4 flex-1">
                    <Filter className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                    <select
                      value={selectedEmployeeId}
                      onChange={(e) => setSelectedEmployeeId(e.target.value)}
                      className="text-xs font-bold text-slate-600 bg-transparent border-0 focus:outline-none focus:ring-0 p-0 flex-1 w-full"
                    >
                      <option value="">All Employees ({eligibleStaffCount})</option>
                      {eligibleStaff.map(emp => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({emp.department || emp.role})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* SUBMISSIONS FEED LIST */}
                <div className="space-y-4">
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest pl-1">
                    Submissions Feed ({filteredAdminReports.length})
                  </h3>

                  {filteredAdminReports.length === 0 ? (
                    <div className="bg-white rounded-3xl border border-[#E2E8F0]/80 p-8 text-center text-slate-400 shadow-sm">
                      <UserX className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-bold uppercase tracking-wider">No submissions found for current filters.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredAdminReports.map((report) => {
                        const hasBlocker = report.blockers && report.blockers.trim() !== '';
                        return (
                          <div 
                            key={report.id} 
                            className={`p-5 rounded-2xl border transition-all shadow-sm ${
                              hasBlocker 
                                ? 'border-red-200 bg-[#FEF2F2]' 
                                : 'border-[#E2E8F0]/80 bg-white hover:shadow-md'
                            }`}
                          >
                            {/* Card Header */}
                            <div className="flex justify-between items-start gap-4 pb-3 border-b border-slate-100 mb-3">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${
                                  hasBlocker ? 'bg-red-100 text-red-600' : 'bg-orange-50 text-[#E05A1E]'
                                }`}>
                                  <User className="h-4 w-4" />
                                </div>
                                <div>
                                  <span className="text-xs font-black text-slate-800 uppercase block">
                                    {report.employee_name}
                                  </span>
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mt-0.5">
                                    {report.employee_department || report.employee_role} • logged {timeAgo(report.created_at)}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border uppercase ${
                                  hasBlocker 
                                    ? 'bg-red-200/50 border-red-300 text-red-800' 
                                    : 'bg-slate-100 border-slate-200 text-slate-600'
                                }`}>
                                  {parseFloat(report.hours_worked).toFixed(2)} Hrs
                                </span>
                                {hasBlocker && (
                                  <div className="text-red-500 animate-pulse" title="Active Blocker Alert">
                                    <AlertOctagon className="h-4 w-4 fill-red-50" />
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Card Body */}
                            <div className="space-y-3 text-xs">
                              <div>
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Work Done Today</span>
                                <p className="text-slate-700 font-semibold whitespace-pre-wrap leading-relaxed">{report.work_done}</p>
                              </div>
                              
                              {report.next_day_plan && (
                                <div>
                                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Next Day Plan</span>
                                  <p className="text-slate-600 font-semibold whitespace-pre-wrap leading-relaxed">{report.next_day_plan}</p>
                                </div>
                              )}

                              {report.blockers && (
                                <div className="bg-red-100/40 border border-red-200 p-3 rounded-xl text-red-800 mt-2">
                                  <span className="text-[9px] font-black text-red-600 uppercase tracking-widest block flex items-center gap-1.5 mb-1">
                                    <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                                    Active Blocker / Impediment
                                  </span>
                                  <p className="font-bold whitespace-pre-wrap leading-relaxed">{report.blockers}</p>
                                </div>
                              )}
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>

              {/* Right Column: Sidebar Compliance Checklist (4 cols) */}
              <div className="lg:col-span-4 space-y-4">
                <div className="bg-white rounded-3xl border border-[#E2E8F0]/80 p-5 shadow-sm space-y-4">
                  <div>
                    <h3 className="text-xs font-black text-[#1A1A1A] uppercase tracking-widest">
                      Missing Submissions
                    </h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                      Compliance list for {formatDateIST(selectedDate)}
                    </p>
                  </div>

                  <div className="border-t border-slate-100 pt-3">
                    {missingSubmissions.length === 0 ? (
                      <div className="py-6 text-center">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                        <p className="text-xs font-black text-slate-800 uppercase tracking-wider">100% Compliance</p>
                        <p className="text-[10px] text-slate-400 uppercase font-semibold mt-0.5">All staff submitted today's log</p>
                      </div>
                    ) : (
                      <div className="space-y-3.5 max-h-[480px] overflow-y-auto pr-1">
                        {missingSubmissions.map((emp) => (
                          <div 
                            key={emp.id}
                            className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200/50 transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-500 font-black text-xs flex items-center justify-center flex-shrink-0">
                                {emp.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <span className="text-xs font-black text-slate-700 block truncate">
                                  {emp.name}
                                </span>
                                <span className="text-[9px] font-bold text-slate-400 block uppercase truncate">
                                  {emp.department || emp.role}
                                </span>
                              </div>
                            </div>
                            
                            <span className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-red-50 text-red-500 border border-red-200/50">
                              Pending
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}

      </div>
    </AppLayout>
  );
}

// Simple timeAgo implementation helper
function timeAgo(dateString) {
  if (!dateString) return '';
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}
