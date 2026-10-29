import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import AppLayout from '../components/layout/AppLayout';
import api from '../api/client';
import { formatTimeIST, formatDateIST, todayIST, getISODateIST } from '../utils/time';
import { mapAttendance } from '../utils/attendance';
import AttendanceCard from '../components/ui/AttendanceCard';
import toast from 'react-hot-toast';
import { UserCheck, UserX, CalendarOff, Clock, UserMinus } from 'lucide-react';
import { ATTENDANCE_STATUS, VIEW_MODES } from '../config/constants';

function AttendanceBadge({ status, checkIn, checkOut, settings, hours_worked: data_hours_worked, isLate: propIsLate }) {
  const officeStartTimeStr = settings?.office_start_time || '09:30';
  const lateThresholdTimeStr = settings?.late_threshold_time;
  const lateThresholdMins = parseInt(settings?.late_threshold_mins || 15);
  // Prefer half_day_threshold_hours; fall back to min_working_hours only if the former is absent
  const halfDayThresholdHours = parseFloat(settings?.half_day_threshold_hours || settings?.min_working_hours || 9);

  let isLate = propIsLate;
  if (isLate === undefined && checkIn) {
    const checkInTime = new Date(checkIn);
    // Format check-in time as HH:mm in IST
    const checkInStr = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(checkInTime);

    if (lateThresholdTimeStr) {
      isLate = checkInStr > lateThresholdTimeStr;
    } else {
      const [ciH, ciM] = checkInStr.split(':').map(Number);
      const [startH, startM] = officeStartTimeStr.split(':').map(Number);
      
      const diffMins = (ciH * 60 + ciM) - (startH * 60 + startM);
      isLate = diffMins > lateThresholdMins;
    }
  }

  const normStatus = (status || (checkIn ? (checkOut ? 'completed' : 'working') : '')).toLowerCase();

  // Trust the server's status for half_day — don't recalculate from hours in the frontend,
  // as that causes a collision with the late-arrival path (both use hoursWorked < threshold).
  const isHalfDay = normStatus === 'half_day';

  if (isHalfDay) {
    return <span className="badge bg-sky-50 text-sky-600 border-sky-200 font-bold">◑ Half Day</span>;
  }
  if (normStatus === 'working' || normStatus === 'completed' || normStatus === 'present' || checkIn) {
    return (
      <span className={`badge ${isLate ? 'bg-red-50 text-red-600 border-red-200' : 'badge-working'}`}>
        ● {isLate ? 'Late Arrival' : 'Present'}
      </span>
    );
  }
  if (normStatus === 'leave') {
    return <span className="badge bg-violet-50 text-violet-600 border-violet-200 font-bold">● On Leave</span>;
  }
  if (normStatus === 'sunday') {
    return <span className="badge bg-slate-100 text-slate-600 border-slate-200 font-bold">○ Sunday</span>;
  }
  if (normStatus === 'holiday') {
    return <span className="badge bg-indigo-50 text-indigo-600 border-indigo-200 font-bold">★ Holiday</span>;
  }
  if (normStatus === 'upcoming' || normStatus === 'future') {
    return <span className="badge bg-slate-100 text-slate-500 border-slate-200 font-bold">○ Upcoming</span>;
  }
  if (normStatus === 'today_pending' || normStatus === 'pending') {
    return <span className="badge bg-amber-50 text-amber-600 border-amber-200 font-bold">⏳ Pending</span>;
  }
  return <span className="badge badge-absent text-red-600 font-bold">Absent</span>;
}

export default function AttendancePage() {
  const { user, isAdmin, isAccounts } = useAuth();
  const getRequestTypeDetails = (type, amount) => {
    const t = type?.toLowerCase();
    if (t === 'half_day') {
      return {
        label: 'Half Day',
        subLabel: 'Half Day',
        badgeClass: 'bg-sky-50 text-sky-600 border-sky-200 font-bold',
      };
    } else if (t === 'advance') {
      return {
        label: 'Salary Advance',
        subLabel: `Advance: ₹${Number(amount || 0).toLocaleString('en-IN')}`,
        badgeClass: 'bg-emerald-50 text-emerald-600 border-emerald-200 font-bold',
      };
    } else if (t === 'resignation') {
      return {
        label: 'Resignation',
        subLabel: 'Resignation Notice',
        badgeClass: 'bg-amber-50 text-amber-600 border-amber-200 font-bold',
      };
    } else {
      const leaveLabel = type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Leave';
      return {
        label: `${leaveLabel} Leave`,
        subLabel: `${leaveLabel} Leave`,
        badgeClass: 'bg-violet-50 text-violet-600 border-violet-200 font-bold',
      };
    }
  };

  const [records, setRecords] = useState([]);
  const [myRecord, setMyRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(VIEW_MODES.TODAY); 
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showMarkForm, setShowMarkForm] = useState(false);
  const [historyView, setHistoryView] = useState(VIEW_MODES.CALENDAR); 
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [settings, setSettings] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all'); 
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [requestCategory, setRequestCategory] = useState('leave'); // 'leave' | 'half_day' | 'advance' | 'resignation'
  const [activeCategoryTab, setActiveCategoryTab] = useState('leave');
  const [leaveCategoryFilter, setLeaveCategoryFilter] = useState('all'); // 'all' | 'leave' | 'half_day' | 'advance' | 'resignation'
  const [leaves, setLeaves] = useState([]);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [leaveStatusFilter, setLeaveStatusFilter] = useState('all');
  const [leaveForm, setLeaveForm] = useState({ start_date: '', end_date: '', type: 'casual', reason: '', amount: '' });
  const [manualForm, setManualForm] = useState({ 
    user_id: '', 
    date: getISODateIST(), 
    check_in: '', 
    check_out: '', 
    status: ATTENDANCE_STATUS.WORKING,
    is_late: false,
    late_minutes: 0
  });

  const [masterSubtypes, setMasterSubtypes] = useState([]);
  const [masterCategories, setMasterCategories] = useState([]);

  // Fetch settings & dropdown options
  useEffect(() => {
    api.get('/settings/app')
      .then(({ data }) => setSettings(data))
      .catch(err => console.error('Failed to load settings', err));

    api.get('/settings/dropdowns')
      .then(({ data }) => {
        if (data && data.length) {
          setMasterSubtypes(data.filter(d => d.category === 'leave_subtype'));
          setMasterCategories(data.filter(d => d.category === 'request_category'));
        }
      })
      .catch(err => console.error('Failed to load dropdown options', err));
  }, []);

  const openApplyModal = (cat = 'leave', subType = 'casual') => {
    setRequestCategory(cat);
    const defaultSub = masterSubtypes.length ? masterSubtypes[0].key : subType;
    setLeaveForm({ start_date: '', end_date: '', type: cat === 'leave' ? defaultSub : cat, reason: '', amount: '' });
    setShowLeaveForm(true);
  };

  const handleCategoryTabClick = (cat = 'leave', subType = 'casual') => {
    setActiveCategoryTab(cat);
    openApplyModal(cat, subType);
  };

  // Fetch complete user list from dedicated endpoint (all users, not just today's attendees)
  useEffect(() => {
    api.get('/attendance/users')
      .then(({ data }) => setUsers(data.users || []))
      .catch(err => console.error('Failed to load users', err));
  }, []);

  // Sync date range filters with the visible calendar month
  useEffect(() => {
    if (view === VIEW_MODES.HISTORY && historyView === VIEW_MODES.CALENDAR) {
      const firstDay = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
      const lastDay = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(new Date(currentYear, currentMonth + 1, 0).getDate()).padStart(2, '0')}`;
      setDateFrom(firstDay);
      setDateTo(lastDay);
    }
  }, [currentMonth, currentYear, view, historyView]);

  // Group records by local date string
  const recordsByDate = useMemo(() => {
    const mapping = {};
    records.forEach(r => {
      if (!r.date) return;
      const dateObj = new Date(r.date);
      const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
      const dateStr = formatter.format(dateObj);
      
      if (!mapping[dateStr]) mapping[dateStr] = [];
      mapping[dateStr].push(r);
    });
    return mapping;
  }, [records]);

  // Filter records based on selected user and status
  const filteredRecords = useMemo(() => {
    let filtered = records;
    if (selectedUser) {
      const userId = parseInt(selectedUser);
      filtered = filtered.filter(r => r.user_id === userId);
    }
    
    if (statusFilter !== 'all') {
      if (statusFilter === ATTENDANCE_STATUS.PRESENT) {
        filtered = filtered.filter(r => r.checkIn);
      } else if (statusFilter === 'late') {
        filtered = filtered.filter(r => r.is_late);
      } else if (statusFilter === ATTENDANCE_STATUS.HALF_DAY) {
        filtered = filtered.filter(r => r.status?.toLowerCase() === ATTENDANCE_STATUS.HALF_DAY);
      } else if (statusFilter === ATTENDANCE_STATUS.ABSENT) {
        filtered = filtered.filter(r => !r.checkIn && r.status?.toLowerCase() === ATTENDANCE_STATUS.ABSENT);
      } else if (statusFilter === ATTENDANCE_STATUS.LEAVE) {
        filtered = filtered.filter(r => r.status?.toLowerCase() === ATTENDANCE_STATUS.LEAVE);
      }
    }
    
    return filtered;
  }, [records, selectedUser, statusFilter]);

  const visibleUsers = useMemo(() => {
    if (isAdmin || isAccounts) {
      if (selectedUser) {
        return users.filter(u => u.id === parseInt(selectedUser));
      }
      return users;
    }
    return users.filter(u => u.id === user?.id);
  }, [users, selectedUser, isAdmin, isAccounts, user]);

  // Generate complete calendar grid cells
  const cells = useMemo(() => {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    
    const tempCells = [];
    for (let i = 0; i < firstDayIndex; i++) {
      tempCells.push({ empty: true });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      tempCells.push({ day: d });
    }
    
    const totalCells = Math.ceil((firstDayIndex + daysInMonth) / 7) * 7;
    for (let i = tempCells.length; i < totalCells; i++) {
      tempCells.push({ empty: true });
    }
    return tempCells;
  }, [currentMonth, currentYear]);

  const fetchToday = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/attendance/today');
      // Backend now returns { attendance: [], my_attendance: {} }
      const mapped = (data.attendance || []).map(mapAttendance).filter(Boolean);
      // Competitive Sort: Earliest check-in first, then alphabet
      mapped.sort((a, b) => {
        if (a.checkIn && b.checkIn) return new Date(a.checkIn) - new Date(b.checkIn);
        if (a.checkIn) return -1;
        if (b.checkIn) return 1;
        return a.name.localeCompare(b.name);
      });
      setRecords(mapped);
      setMyRecord(mapAttendance(data.my_attendance));
    } catch {
      toast.error('Failed to load attendance');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      let url = '/attendance/all?limit=200';
      if (dateFrom && dateTo) url += `&from=${dateFrom}&to=${dateTo}`;
      const { data } = await api.get(url);
      setRecords((data.attendance || []).map(mapAttendance).filter(Boolean));
    } catch {
      toast.error('Failed to load attendance');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  const fetchLeaves = useCallback(async () => {
    try {
      setLeaveLoading(true);
      const { data } = await api.get('/leaves');
      setLeaves(data.leaves || []);
    } catch (err) {
      const msg = err.response?.data?.details || err.response?.data?.error || 'Failed to load leaves';
      toast.error(msg);
    } finally {
      setLeaveLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === VIEW_MODES.TODAY) fetchToday();
    else if (view === VIEW_MODES.HISTORY) fetchAll();
    else if (view === 'leaves') fetchLeaves();
  }, [view, fetchToday, fetchAll, fetchLeaves]);

  // Summary calculation for the current view
  const summary = useMemo(() => {
    if (!records.length) return null;
    
    // We base the total on the employee filter but NOT the status filter 
    // so percentages remain meaningful relative to the whole team/employee
    const baseRecords = selectedUser ? records.filter(r => r.user_id === parseInt(selectedUser)) : records;
    if (!baseRecords.length) return null;

    const counts = {
      present: baseRecords.filter(r => r.checkIn).length,
      late: baseRecords.filter(r => r.is_late).length,
      halfDay: baseRecords.filter(r => r.status?.toLowerCase() === ATTENDANCE_STATUS.HALF_DAY).length,
      absent: baseRecords.filter(r => !r.checkIn && r.status?.toLowerCase() === ATTENDANCE_STATUS.ABSENT).length,
      leave: baseRecords.filter(r => r.status?.toLowerCase() === ATTENDANCE_STATUS.LEAVE).length,
      total: baseRecords.length
    };

    const getPct = (val) => Math.round((val / counts.total) * 100) || 0;

    return {
      ...counts,
      percentages: {
        present: getPct(counts.present),
        late: getPct(counts.late),
        halfDay: getPct(counts.halfDay),
        absent: getPct(counts.absent),
        leave: getPct(counts.leave)
      }
    };
  }, [records, selectedUser]);

  const leaveSummary = useMemo(() => {
    if (!leaves.length) return { pending: 0, approved: 0, rejected: 0 };
    return {
      pending: leaves.filter(l => l.status === 'pending').length,
      approved: leaves.filter(l => l.status === 'approved').length,
      rejected: leaves.filter(l => l.status === 'rejected').length,
      total: leaves.length
    };
  }, [leaves]);

  const filteredLeaves = useMemo(() => {
    let result = leaves;
    if (leaveStatusFilter !== 'all') {
      result = result.filter(l => l.status === leaveStatusFilter);
    }
    if (leaveCategoryFilter !== 'all') {
      result = result.filter(l => {
        if (leaveCategoryFilter === 'leave') {
          return ['casual', 'sick', 'emergency', 'unpaid', 'leave'].includes(l.type);
        }
        return l.type === leaveCategoryFilter;
      });
    }
    return result;
  }, [leaves, leaveStatusFilter, leaveCategoryFilter]);

  async function handleManualMark(e) {
    e.preventDefault();
    try {
      await api.post('/attendance/manual', manualForm);
      toast.success('Attendance updated successfully');
      setShowMarkForm(false);
      if (view === VIEW_MODES.TODAY) fetchToday();
      else fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update attendance');
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-black text-[#1A1A1A] tracking-tight">Team Attendance</h1>
            <p className="text-muted text-sm font-medium">{todayIST()}</p>
          </div>
           <div className="flex items-center gap-2 flex-wrap">
             {/* Quick Apply Category Action Tabs */}
             <div className="flex items-center bg-[#F4F4F5] p-1 rounded-xl gap-1 border border-slate-200/60 shadow-sm">
               <button
                 onClick={() => handleCategoryTabClick('leave', 'casual')}
                 className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                   activeCategoryTab === 'leave'
                     ? 'bg-white text-[#E05A1E] shadow-sm border border-slate-200/50 font-black'
                     : 'text-muted hover:text-[#1A1A1A] hover:bg-white/60'
                 }`}
                 title="Apply Full Day Leave"
               >
                 <span>🌴</span> Full Leave
               </button>
               <button
                 onClick={() => handleCategoryTabClick('half_day')}
                 className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                   activeCategoryTab === 'half_day'
                     ? 'bg-white text-[#E05A1E] shadow-sm border border-slate-200/50 font-black'
                     : 'text-muted hover:text-[#1A1A1A] hover:bg-white/60'
                 }`}
                 title="Request Half Day"
               >
                 <span>⏱️</span> Half Day
               </button>
               <button
                 onClick={() => handleCategoryTabClick('advance')}
                 className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                   activeCategoryTab === 'advance'
                     ? 'bg-white text-[#E05A1E] shadow-sm border border-slate-200/50 font-black'
                     : 'text-muted hover:text-[#1A1A1A] hover:bg-white/60'
                 }`}
                 title="Request Salary Advance"
               >
                 <span>💵</span> Advance
               </button>
               <button
                 onClick={() => handleCategoryTabClick('resignation')}
                 className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                   activeCategoryTab === 'resignation'
                     ? 'bg-white text-[#E05A1E] shadow-sm border border-slate-200/50 font-black'
                     : 'text-muted hover:text-[#1A1A1A] hover:bg-white/60'
                 }`}
                 title="Submit Resignation Notice"
               >
                 <span>📝</span> Resignation
               </button>
             </div>
             
             <button
              onClick={() => setShowMarkForm(!showMarkForm)}
              className="btn-primary"
            >
              {showMarkForm ? 'Close Marker' : 'Mark Attendance'}
            </button>
            <div className="bg-[#F0F0F0] p-1 rounded-lg flex">
              <button
                onClick={() => setView(VIEW_MODES.TODAY)}
                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${view === VIEW_MODES.TODAY ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-muted hover:text-[#1A1A1A]'}`}
              >TODAY</button>
              <button
                onClick={() => setView(VIEW_MODES.HISTORY)}
                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${view === VIEW_MODES.HISTORY ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-muted hover:text-[#1A1A1A]'}`}
              >HISTORY</button>
               <button
                onClick={() => setView('leaves')}
                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${view === 'leaves' ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-muted hover:text-[#1A1A1A]'}`}
              >LEAVES</button>
            </div>
          </div>
        </div>

        {/* Legend */}
        {view !== 'leaves' && (
          <div className="flex flex-wrap gap-x-6 gap-y-2 px-1">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-50 border border-emerald-500" />
            <span className="text-[10px] font-black text-muted uppercase tracking-wider">Present</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-50 border border-amber-500" />
            <span className="text-[10px] font-black text-muted uppercase tracking-wider">Late Arrival</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-sky-50 border border-sky-500" />
            <span className="text-[10px] font-black text-muted uppercase tracking-wider">Half Day</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-50 border border-red-500" />
            <span className="text-[10px] font-black text-muted uppercase tracking-wider">Absent</span>
          </div>
        </div>
      )}

        {showMarkForm && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="lg:col-span-4 h-full">
              <AttendanceCard attendance={myRecord} onAction={(r) => { setMyRecord(r); fetchToday(); }} />
            </div>
            
            {isAdmin && (
              <div className="lg:col-span-8">
                <div className="card h-full">
                  <div className="flex items-center gap-2 mb-4">
                     <div className="w-8 h-8 rounded-lg bg-[#E05A1E]/10 flex items-center justify-center text-[#E05A1E]">
                      <Clock size={18} />
                     </div>
                     <h3 className="text-base font-black text-[#1A1A1A]">Admin Manual Marker</h3>
                  </div>
                  
                  <form onSubmit={handleManualMark} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Select Employee</label>
                      <select required className="input text-xs font-bold" value={manualForm.user_id} onChange={e => setManualForm({...manualForm, user_id: e.target.value})}>
                        <option value="">Choose User...</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Date</label>
                      <input type="date" required className="input text-xs" value={manualForm.date} onChange={e => setManualForm({...manualForm, date: e.target.value})} />
                    </div>
                    <div>
                      <label className="label">Check-In Time</label>
                      <input type="datetime-local" className="input text-xs" value={manualForm.check_in} onChange={e => setManualForm({...manualForm, check_in: e.target.value})} />
                    </div>
                     <div>
                      <label className="label">Check-Out Time</label>
                      <input type="datetime-local" className="input text-xs" value={manualForm.check_out} onChange={e => setManualForm({...manualForm, check_out: e.target.value})} />
                    </div>
                    <div>
                      <label className="label">Base Status</label>
                      <select className="input text-xs font-bold" value={manualForm.status} onChange={e => setManualForm({...manualForm, status: e.target.value})}>
                        {Object.values(ATTENDANCE_STATUS).map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                      </select>
                    </div>
                    <div className="flex items-end pb-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-[#E05A1E] focus:ring-[#E05A1E]" checked={manualForm.is_late} onChange={e => setManualForm({...manualForm, is_late: e.target.checked})} />
                        <span className="text-xs font-bold text-[#1A1A1A]">Mark as Late</span>
                      </label>
                    </div>
                    <div className="md:col-span-2 flex justify-end gap-3 mt-2">
                      <button type="button" onClick={() => setShowMarkForm(false)} className="px-4 py-2 text-xs font-bold text-muted hover:text-[#1A1A1A] transition-colors" >Cancel</button>
                      <button type="submit" className="btn-primary">Update Attendance</button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Optimized Summary Cards (Interactive Filtering) */}
        {view !== 'leaves' && summary && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { id: ATTENDANCE_STATUS.PRESENT, label: 'Present', count: summary.present, pct: summary.percentages.present, icon: UserCheck, color: 'emerald' },
              { id: 'late', label: 'Late', count: summary.late, pct: summary.percentages.late, icon: Clock, color: 'amber' },
              { id: ATTENDANCE_STATUS.HALF_DAY, label: 'Half Day', count: summary.halfDay, pct: summary.percentages.halfDay, icon: UserMinus, color: 'sky' },
              { id: ATTENDANCE_STATUS.ABSENT, label: 'Absent', count: summary.absent, pct: summary.percentages.absent, icon: UserX, color: 'red' },
              { id: ATTENDANCE_STATUS.LEAVE, label: 'Leave', count: summary.leave, pct: summary.percentages.leave, icon: CalendarOff, color: 'violet' }
            ].map(card => (
              <div 
                key={card.id}
                onClick={() => setStatusFilter(statusFilter === card.id ? 'all' : card.id)}
                className={`card cursor-pointer transition-all duration-300 flex items-center gap-4 py-4 px-5 group 
                           ${statusFilter === card.id ? 'ring-2 ring-[#E05A1E] ring-offset-2 scale-[1.02] shadow-lg' : 'hover:shadow-md hover:scale-[1.01]'} 
                           bg-${card.color}-50 border-${card.color}-100`}
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 
                                bg-${card.color}-100 text-${card.color}-600`}>
                  <card.icon size={24} strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[10px] font-black uppercase tracking-wider text-${card.color}-700 truncate`}>
                    {card.label}
                  </p>
                  <div className="flex items-baseline gap-2">
                    <p className={`text-2xl font-black text-${card.color}-600`}>{card.count}</p>
                    <span className={`text-[10px] font-bold text-${card.color}-500 opacity-60`}>({card.pct}%)</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        {view === VIEW_MODES.HISTORY && (
          <div className="card flex items-center justify-between flex-wrap bg-[#F9F9F9] py-3">
             {historyView === VIEW_MODES.CALENDAR ? (
               <div className="flex items-center gap-4">
                 <button 
                   onClick={() => {
                     if (currentMonth === 0) {
                       setCurrentMonth(11);
                       setCurrentYear(prev => prev - 1);
                     } else {
                       setCurrentMonth(prev => prev - 1);
                     }
                   }}
                   className="px-3 py-1 text-xs font-bold rounded-md bg-white border border-[#E0E0E0] text-[#1A1A1A] hover:bg-[#F5F5F5] transition-colors"
                 >
                   &larr; Prev
                 </button>
                 <span className="text-sm font-bold text-[#1A1A1A] min-w-[120px] text-center">
                   {new Date(currentYear, currentMonth).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
                 </span>
                 <button 
                   onClick={() => {
                     if (currentMonth === 11) {
                       setCurrentMonth(0);
                       setCurrentYear(prev => prev + 1);
                     } else {
                       setCurrentMonth(prev => prev + 1);
                     }
                   }}
                   className="px-3 py-1 text-xs font-bold rounded-md bg-white border border-[#E0E0E0] text-[#1A1A1A] hover:bg-[#F5F5F5] transition-colors"
                 >
                   Next &rarr;
                 </button>
               </div>
             ) : (
               <div className="flex items-center gap-2 flex-wrap">
                 <span className="text-xs font-bold text-muted uppercase">Filter:</span>
                 <input type="date" className="input py-1.5 w-auto" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                 <span className="text-muted text-xs">to</span>
                 <input type="date" className="input py-1.5 w-auto" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                 <button onClick={fetchAll} className="btn-primary py-1.5">Apply</button>
                 <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="btn-secondary py-1.5">Clear</button>
               </div>
             )}

             {(isAdmin || isAccounts) && (
                <div className="flex items-center gap-2 mt-2 sm:mt-0">
                  <span className="text-xs font-bold text-muted uppercase">Employee:</span>
                  <select 
                    value={selectedUser} 
                    onChange={(e) => setSelectedUser(e.target.value)}
                    className="px-3 py-1.5 text-xs font-bold rounded-md bg-white border border-[#E0E0E0] text-[#1A1A1A] focus:outline-none focus:border-[#E05A1E] transition-colors"
                  >
                    <option value="">All Team Members</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              )}

             <div className="bg-[#F0F0F0] p-1 rounded-lg flex mt-2 sm:mt-0">
               <button
                 onClick={() => setHistoryView('calendar')}
                 className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${historyView === 'calendar' ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-muted hover:text-[#1A1A1A]'}`}
               >CALENDAR</button>
               <button
                 onClick={() => setHistoryView('table')}
                 className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${historyView === 'table' ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-muted hover:text-[#1A1A1A]'}`}
               >TABLE</button>
             </div>
          </div>
        )}

        {/* Calendar or Table View */}
        {view !== 'leaves' && (
          view === VIEW_MODES.HISTORY && historyView === VIEW_MODES.CALENDAR ? (
          <div className="card p-4 bg-white shadow-sm">
            {/* Weekdays Header */}
            <div className="grid grid-cols-7 gap-2 mb-2 text-center">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-xs font-black text-muted uppercase tracking-widest py-2">
                  {day}
                </div>
              ))}
            </div>
            
            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-3">
              {cells.map((cell, index) => {
                if (cell.empty) {
                  return <div key={index} className="min-h-[120px] bg-[#FAFAFA] rounded-xl border border-dashed border-[#F0F0F0]" />;
                }
                
                const d = cell.day;
                const cellDateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const dayRecords = recordsByDate[cellDateStr] || [];
                
                // Check if this date is in the future
                const today = new Date();
                today.setHours(0,0,0,0);
                const cellDate = new Date(currentYear, currentMonth, d);
                const isFuture = cellDate > today;

                return (
                  <div 
                    key={index} 
                    className="min-h-[120px] bg-white rounded-xl border border-[#F0F0F0] p-3 flex flex-col justify-between hover:border-[#E0E0E0] transition-all group shadow-sm hover:shadow-md"
                  >
                    <span className="text-sm font-black text-[#1A1A1A] group-hover:text-[#E05A1E] transition-colors">
                      {d}
                    </span>
                    
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {!isFuture && visibleUsers.map(u => {
                        const record = dayRecords.find(r => r.user_id === u.id);
                        const recStatus = record?.status?.toLowerCase();
                        const isPresent = Boolean(record && (
                          record.checkIn ||
                          recStatus === ATTENDANCE_STATUS.WORKING ||
                          recStatus === ATTENDANCE_STATUS.COMPLETED ||
                          recStatus === 'present'
                        ));

                        let statusText = 'Absent';
                        let styleClass = 'bg-red-50 text-red-700 border-red-500 hover:bg-red-100 hover:scale-105';

                        // Use server-stored flags — avoids re-deriving with different settings keys
                        const cellIsHalfDay = recStatus === ATTENDANCE_STATUS.HALF_DAY;
                        const cellIsLate    = !!record?.is_late && !cellIsHalfDay;

                        if (cellIsHalfDay) {
                          statusText = 'Half Day';
                          styleClass = 'bg-sky-50 text-sky-700 border-sky-500 hover:bg-sky-100 hover:scale-105';
                        } else if (isPresent && cellIsLate) {
                          statusText = 'Present (Late)';
                          styleClass = 'bg-amber-50 text-amber-700 border-amber-500 hover:bg-amber-100 hover:scale-105';
                        } else if (isPresent) {
                          statusText = 'Present';
                          styleClass = 'bg-emerald-50 text-emerald-700 border-emerald-500 hover:bg-emerald-100 hover:scale-105';
                        } else if (recStatus === ATTENDANCE_STATUS.LEAVE) {
                          statusText = 'Leave';
                          styleClass = 'bg-violet-50 text-violet-700 border-violet-500 hover:bg-violet-100 hover:scale-105';
                        } else if (recStatus === 'sunday') {
                          statusText = 'Sunday';
                          styleClass = 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200 hover:scale-105';
                        } else if (recStatus === 'holiday') {
                          statusText = 'Holiday';
                          styleClass = 'bg-indigo-50 text-indigo-700 border-indigo-300 hover:bg-indigo-100 hover:scale-105';
                        } else if (recStatus === 'today_pending' || recStatus === 'pending') {
                          statusText = 'Pending';
                          styleClass = 'bg-amber-50 text-amber-600 border-amber-300 hover:bg-amber-100 hover:scale-105';
                        } else if (recStatus === 'upcoming' || recStatus === 'future') {
                          statusText = 'Upcoming';
                          styleClass = 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200 hover:scale-105';
                        }

                        // Filter dots based on statusFilter
                        if (statusFilter !== 'all') {
                          let matches = false;
                          if (statusFilter === ATTENDANCE_STATUS.PRESENT) matches = isPresent && !cellIsLate && !cellIsHalfDay;
                          else if (statusFilter === 'late') matches = cellIsLate;
                          else if (statusFilter === ATTENDANCE_STATUS.HALF_DAY) matches = cellIsHalfDay;
                          else if (statusFilter === ATTENDANCE_STATUS.ABSENT) matches = statusText === 'Absent';
                          else if (statusFilter === ATTENDANCE_STATUS.LEAVE) matches = statusText === 'Leave';

                          if (!matches) return null;
                        }
                        
                        const initials = u.name.split(' ').map(n => n[0]).join('').toUpperCase();
                        
                        return (
                          <div 
                            key={u.id}
                            title={`${u.name} (${statusText})`}
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all border cursor-help ${styleClass}`}
                          >
                            {initials}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="card p-0 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-[#FAFAFA] border-b border-[#E0E0E0]">
                    <th className="px-5 py-4 text-[11px] font-black text-muted uppercase tracking-widest">Team Member</th>
                    {view === VIEW_MODES.HISTORY && <th className="px-5 py-4 text-[11px] font-black text-muted uppercase tracking-widest">Date</th>}
                    <th className="px-5 py-4 text-[11px] font-black text-muted uppercase tracking-widest">In / Out</th>
                    <th className="px-5 py-4 text-[11px] font-black text-muted uppercase tracking-widest">Hours</th>
                    <th className="px-5 py-4 text-[11px] font-black text-muted uppercase tracking-widest">Status</th>
                    <th className="px-5 py-4 text-[11px] font-black text-muted uppercase tracking-widest text-right">Geo Zone</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F0F0]">
                  {loading ? (
                    [...Array(6)].map((_, i) => (
                      <tr key={i}><td colSpan={6} className="px-5 py-4"><div className="skeleton h-8 w-full rounded" /></td></tr>
                    ))
                  ) : filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center">
                        <p className="text-muted font-medium italic">No attendance records found for this period.</p>
                      </td>
                    </tr>
                  ) : filteredRecords.map((r, i) => {
                    const isLate = r.is_late;
                    return (
                      <tr key={i} className="group hover:bg-[#FDFDFD] transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${r.role === 'admin' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                              {r.name.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-[#1A1A1A] group-hover:text-[#E05A1E] transition-colors">{r.name}</p>
                              <p className="text-[10px] text-muted font-bold uppercase tracking-tighter">{r.department || (r.role === 'admin' ? 'Management' : 'Staff')}</p>
                            </div>
                          </div>
                        </td>
                        {view === VIEW_MODES.HISTORY && <td className="px-5 py-4 text-sm font-medium text-[#1A1A1A]">{formatDateIST(r.date)}</td>}
                        <td className="px-5 py-4">
                          <div className="flex flex-col">
                            <span className={`text-xs font-black ${r.checkIn ? 'text-emerald-600' : 'text-muted'}`}>
                              {r.checkIn ? `IN: ${formatTimeIST(r.checkIn)}` : 'NOT CHECKED IN'}
                            </span>
                            {r.checkOut && (
                              <span className="text-[10px] font-bold text-blue-600">OUT: {formatTimeIST(r.checkOut)}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-col">
                            <span className="text-xs font-black text-slate-700">
                              {r.hours_worked ? `${Number(r.hours_worked).toFixed(2)}h` : '—'}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <AttendanceBadge status={r.status} checkIn={r.checkIn} checkOut={r.checkOut} settings={settings} hours_worked={r.hours_worked} isLate={r.is_late} />
                        </td>
                        <td className="px-5 py-4 text-right">
                          {r.checkin_zone ? (
                            <div className="flex flex-col items-end gap-1">
                              {/* Zone Badge */}
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                                r.checkin_zone === 'strict'  ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                                r.checkin_zone === 'buffer'  ? 'bg-amber-50 text-amber-600 border-amber-200' :
                                                               'bg-red-50 text-red-600 border-red-200'
                              }`}>
                                {r.checkin_zone === 'strict'  ? '● Inside' :
                                 r.checkin_zone === 'buffer'  ? '⚠ Boundary' : '✕ Outside'}
                                {r.checkin_distance != null && (
                                  <span className="font-mono opacity-70">· {r.checkin_distance}m</span>
                                )}
                              </span>
                              {/* Accuracy */}
                              {r.checkin_accuracy != null && (
                                <span className="text-[9px] font-mono text-slate-400">±{Math.round(r.checkin_accuracy)}m GPS</span>
                              )}
                              {/* Boundary flag */}
                              {r.is_boundary_checkin && (
                                <span className="text-[9px] text-amber-500 font-bold">GPS Variance</span>
                              )}
                              {/* Checkout outside flag */}
                              {r.checkout_outside_zone && (
                                <span className="text-[9px] text-red-500 font-bold">↩ Out: Outside Office</span>
                              )}
                            </div>
                          ) : r.lat ? (
                            <span className="text-[10px] font-mono text-muted bg-[#F5F5F5] px-2 py-0.5 rounded border border-[#E0E0E0]">
                              {parseFloat(r.lat).toFixed(4)}, {parseFloat(r.lng).toFixed(4)}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted font-bold italic opacity-30">No Geodata</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {view === 'leaves' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            {/* Request Header & Stats */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
               <div>
                  <h3 className="text-xl font-black text-[#1A1A1A] tracking-tight">
                    {isAdmin ? 'Applications & Requests' : 'My Submitted Requests'}
                  </h3>
                  <p className="text-xs font-medium text-muted uppercase tracking-widest mt-1">
                    {leaveSummary.pending} Pending Review • {leaveSummary.approved} Approved
                  </p>
               </div>
               
               <div className="flex items-center gap-3 flex-wrap">
                 {/* Category Filters */}
                 <div className="flex items-center gap-1 bg-[#F4F4F5] p-1 rounded-xl border border-slate-200/60 shadow-sm">
                   {[
                     { key: 'all', label: 'All Requests' },
                     { key: 'leave', label: '🌴 Full Leave' },
                     { key: 'half_day', label: '⏱️ Half Day' },
                     { key: 'advance', label: '💵 Advance' },
                     { key: 'resignation', label: '📝 Resignation' }
                   ].map(cat => (
                     <button
                       key={cat.key}
                       onClick={() => setLeaveCategoryFilter(cat.key)}
                       className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                         leaveCategoryFilter === cat.key ? 'bg-white text-[#E05A1E] shadow-sm font-black' : 'text-muted hover:text-[#1A1A1A]'
                       }`}
                     >
                       {cat.label}
                     </button>
                   ))}
                 </div>

                 {/* Status Filters */}
                 <div className="flex items-center gap-1 bg-[#F0F0F0] p-1 rounded-xl border border-[#E0E0E0]">
                    {['all', 'pending', 'approved', 'rejected'].map(stat => (
                      <button
                        key={stat}
                        onClick={() => setLeaveStatusFilter(stat)}
                        className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
                          leaveStatusFilter === stat ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-muted hover:text-[#1A1A1A]'
                        }`}
                      >
                        {stat}
                      </button>
                    ))}
                 </div>
               </div>
            </div>

            {/* Request Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {leaveLoading ? (
                Array(3).fill(0).map((_, i) => <div key={i} className="card skeleton h-48 rounded-2xl" />)
              ) : filteredLeaves.length === 0 ? (
                <div className="col-span-full py-20 text-center flex flex-col items-center">
                   <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 mb-4 border border-slate-100">
                      <CalendarOff size={32} />
                   </div>
                   <p className="text-sm font-bold text-slate-400 italic">No applications found matching your filter.</p>
                </div>
              ) : filteredLeaves.map((l) => {
                const details = getRequestTypeDetails(l.type, l.amount);
                return (
                  <div key={l.id} className="card group hover:border-[#E05A1E]/30 hover:shadow-xl transition-all duration-300 p-5 border-slate-200 relative overflow-hidden rounded-2xl flex flex-col justify-between">
                    {/* Status Indicator Bar */}
                    <div className={`absolute top-0 left-0 w-1.5 h-full ${
                      l.status === 'approved' ? 'bg-emerald-500' :
                      l.status === 'rejected' ? 'bg-red-500' :
                      'bg-amber-400'
                    }`} />
                    
                    <div>
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 text-sm font-black uppercase">
                            {l.user_name?.split(' ').map(n => n[0]).join('') || 'ME'}
                          </div>
                          <div>
                            <p className="text-sm font-black text-[#1A1A1A]">{l.user_name || 'My Request'}</p>
                            <p className="text-[10px] text-muted font-bold uppercase tracking-tighter">{l.department || 'Employee'}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${
                            l.status === 'approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                            l.status === 'rejected' ? 'bg-red-50 text-red-600 border-red-100' :
                            'bg-amber-50 text-amber-600 border-amber-100'
                          }`}>
                            {l.status}
                          </span>
                          <span className={`px-2 py-0.5 rounded-lg border text-[8px] font-black uppercase tracking-widest ${details.badgeClass}`}>
                            {details.label}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-3 mb-6">
                        <div className="flex items-center gap-4">
                          {l.type === 'casual' || l.type === 'sick' || l.type === 'emergency' || l.type === 'unpaid' ? (
                            <>
                              <div className="flex-1">
                                 <p className="text-[9px] font-black text-muted uppercase tracking-widest mb-0.5">Start Date</p>
                                 <p className="text-xs font-bold text-[#1A1A1A]">{formatDateIST(l.start_date)}</p>
                              </div>
                              <div className="w-px h-6 bg-slate-200" />
                              <div className="flex-1">
                                 <p className="text-[9px] font-black text-muted uppercase tracking-widest mb-0.5">End Date</p>
                                 <p className="text-xs font-bold text-[#1A1A1A]">{formatDateIST(l.end_date)}</p>
                              </div>
                            </>
                          ) : (
                            <div className="flex-1">
                               <p className="text-[9px] font-black text-muted uppercase tracking-widest mb-0.5">
                                 {l.type === 'resignation' ? 'Proposed Last Day' : 'Requested Date'}
                               </p>
                               <p className="text-xs font-bold text-[#1A1A1A]">{formatDateIST(l.start_date)}</p>
                            </div>
                          )}
                        </div>
                        
                        <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100">
                           <p className="text-[9px] font-black text-muted uppercase tracking-widest mb-1">
                             {l.type === 'advance' ? `Amount Details` : 'Application Details'}
                           </p>
                           {l.type === 'advance' && (
                             <p className="text-sm font-extrabold text-emerald-600 mb-1 font-mono">
                               Requested Advance: ₹{Number(l.amount || 0).toLocaleString('en-IN')}
                             </p>
                           )}
                           <p className="text-xs text-[#444] font-medium leading-relaxed italic line-clamp-2">"{l.reason}"</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                      <p className="text-[9px] font-black text-muted uppercase tracking-widest">
                         Submitted {formatDateIST(l.created_at)}
                      </p>
                      
                      {/* Admin Actions */}
                      {l.status === 'pending' && isAdmin && (
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={async () => {
                              try {
                                await api.patch(`/leaves/${l.id}`, { status: 'approved' });
                                toast.success('Application approved');
                                fetchLeaves();
                              } catch { toast.error('Failed to update'); }
                            }}
                            className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all"
                          >Approve</button>
                          <button 
                            onClick={async () => {
                              try {
                                await api.patch(`/leaves/${l.id}`, { status: 'rejected' });
                                toast.success('Application rejected');
                                fetchLeaves();
                              } catch { toast.error('Failed to update'); }
                            }}
                            className="px-3 py-1.5 bg-slate-100 text-red-600 border border-red-100 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-50 transition-all"
                          >Reject</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Apply Request Modal */}
        {showLeaveForm && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="card w-full max-w-md animate-in zoom-in-95 duration-200 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black text-[#1A1A1A]">Submit Application</h3>
                <button 
                  onClick={() => { 
                    setShowLeaveForm(false); 
                    setLeaveForm({ start_date: '', end_date: '', type: 'casual', reason: '', amount: '' }); 
                    setRequestCategory('leave');
                  }} 
                  className="text-muted hover:text-red-500 transition-colors"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
              
              <form onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api.post('/leaves', leaveForm);
                  toast.success('Application submitted successfully!');
                  setShowLeaveForm(false);
                  setLeaveForm({ start_date: '', end_date: '', type: 'casual', reason: '', amount: '' });
                  setRequestCategory('leave');
                  if (view === 'leaves') fetchLeaves();
                } catch (err) { 
                  toast.error(err.response?.data?.error || 'Failed to submit request'); 
                }
              }} className="space-y-4">
                {/* Request Category Pill Tabs */}
                <div className="bg-slate-100 p-1 rounded-xl flex gap-1 mb-4 overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setRequestCategory('leave');
                      const def = masterSubtypes.length ? masterSubtypes[0].key : 'casual';
                      setLeaveForm({...leaveForm, type: def, amount: ''});
                    }}
                    className={`flex-1 py-2 px-2 text-[11px] font-black rounded-lg transition-all ${requestCategory === 'leave' ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    Full Leave
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRequestCategory('half_day');
                      setLeaveForm({...leaveForm, type: 'half_day', amount: ''});
                    }}
                    className={`flex-1 py-2 px-2 text-[11px] font-black rounded-lg transition-all ${requestCategory === 'half_day' ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    Half Day
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRequestCategory('advance');
                      setLeaveForm({...leaveForm, type: 'advance', amount: ''});
                    }}
                    className={`flex-1 py-2 px-2 text-[11px] font-black rounded-lg transition-all ${requestCategory === 'advance' ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    Advance
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRequestCategory('resignation');
                      setLeaveForm({...leaveForm, type: 'resignation', amount: ''});
                    }}
                    className={`flex-1 py-2 px-2 text-[11px] font-black rounded-lg transition-all ${requestCategory === 'resignation' ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    Resignation
                  </button>
                </div>

                {requestCategory === 'leave' ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="label">Start Date</label>
                        <input type="date" required className="input font-bold" value={leaveForm.start_date} onChange={e => setLeaveForm({...leaveForm, start_date: e.target.value})} />
                      </div>
                      <div>
                        <label className="label">End Date</label>
                        <input type="date" required className="input font-bold" value={leaveForm.end_date} onChange={e => setLeaveForm({...leaveForm, end_date: e.target.value})} />
                      </div>
                    </div>
                    <div>
                      <label className="label">Leave Sub-type</label>
                      <select className="input font-bold" value={leaveForm.type} onChange={e => setLeaveForm({...leaveForm, type: e.target.value})}>
                        {masterSubtypes.length > 0 ? (
                          masterSubtypes.map(st => (
                            <option key={st.key} value={st.key}>{st.label}</option>
                          ))
                        ) : (
                          <>
                            <option value="casual">Casual Leave</option>
                            <option value="sick">Sick Leave</option>
                            <option value="emergency">Emergency Leave</option>
                            <option value="unpaid">Unpaid Leave</option>
                          </>
                        )}
                      </select>
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="label">
                      {requestCategory === 'half_day' ? 'Half Day Date' :
                       requestCategory === 'resignation' ? 'Proposed Last Working Date' : 'Requested Date'}
                    </label>
                    <input 
                      type="date" 
                      required 
                      className="input" 
                      value={leaveForm.start_date} 
                      onChange={e => setLeaveForm({...leaveForm, start_date: e.target.value, end_date: e.target.value})} 
                    />
                  </div>
                )}

                {requestCategory === 'advance' && (
                  <div>
                    <label className="label">Requested Amount (₹)</label>
                    <input 
                      type="number" 
                      min="1" 
                      required 
                      placeholder="Enter amount in INR" 
                      className="input font-mono font-bold text-emerald-600" 
                      value={leaveForm.amount || ''} 
                      onChange={e => setLeaveForm({...leaveForm, amount: e.target.value})} 
                    />
                  </div>
                )}

                <div>
                  <label className="label">Application details / Reason</label>
                  <textarea 
                    required 
                    className="input min-h-[100px]" 
                    placeholder={
                      requestCategory === 'resignation' ? 'Provide exit explanation / notice remarks...' :
                      requestCategory === 'advance' ? 'Briefly state why the salary advance is needed...' :
                      'State the reason for this application...'
                    } 
                    value={leaveForm.reason} 
                    onChange={e => setLeaveForm({...leaveForm, reason: e.target.value})} 
                  />
                </div>
                <button type="submit" className="btn-primary w-full py-3 text-base">Submit Application</button>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
