/* eslint-disable react-hooks/set-state-in-effect, no-unused-vars */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { formatDateIST, formatTimeIST } from '../../utils/time';
import UserModal from '../../components/staff/UserModal';
import ResetPasswordModal from '../../components/staff/ResetPasswordModal';
import { useAuth } from '../../context/AuthContext';
import * as XLSX from 'xlsx';
import { 
  ArrowLeft, 
  User, 
  MapPin, 
  Calendar, 
  CheckSquare, 
  Briefcase, 
  IndianRupee,
  Clock,
  CheckCircle,
  AlertTriangle,
  FileText,
  FileSpreadsheet,
  PieChart,
  Activity,
  Plus,
  Key
} from 'lucide-react';

export default function StaffDetailPage() {
  const { id: paramId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  // Date Filter States
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [tempStartDate, setTempStartDate] = useState('');
  const [tempEndDate, setTempEndDate] = useState('');
  const [activePreset, setActivePreset] = useState('');

  const id = paramId || user?.id;

  const fetchStaffDetail = useCallback(async (start = '', end = '') => {
    if (!id) return;
    try {
      setLoading(true);
      const { data: res } = await api.get(`/staff/${id}`, {
        params: {
          startDate: start || undefined,
          endDate: end || undefined
        }
      });
      setData(res);
    } catch (err) {
      toast.error('Failed to load employee details');
      const isAdminOrAccounts = user?.role === 'admin' || user?.role === 'back_office' || user?.role === 'accounts' || user?.department?.toLowerCase() === 'accounts';
      if (isAdminOrAccounts) {
        navigate('/admin/staff');
      } else {
        navigate('/employee/dashboard');
      }
    } finally {
      setLoading(false);
    }
  }, [id, user, navigate]);

  const handleApplyCustomFilter = () => {
    if (tempStartDate && tempEndDate && new Date(tempStartDate) > new Date(tempEndDate)) {
      toast.error('Start date cannot be after end date');
      return;
    }
    setActivePreset('custom');
    setStartDate(tempStartDate);
    setEndDate(tempEndDate);
  };

  const handleClearFilter = () => {
    setStartDate('');
    setEndDate('');
    setTempStartDate('');
    setTempEndDate('');
    setActivePreset('');
  };

  const handlePreset = (preset) => {
    const today = new Date();
    let start = '';
    let end = '';

    // Convert dates to YYYY-MM-DD in local time zone (IST)
    const formatDateForInput = (dateObj) => {
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    if (preset === 'this_month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      start = formatDateForInput(firstDay);
      end = formatDateForInput(today);
    } else if (preset === 'last_month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      start = formatDateForInput(firstDay);
      end = formatDateForInput(lastDay);
    } else if (preset === 'last_30_days') {
      const past30 = new Date();
      past30.setDate(today.getDate() - 30);
      start = formatDateForInput(past30);
      end = formatDateForInput(today);
    }

    setActivePreset(preset);
    setTempStartDate(start);
    setTempEndDate(end);
    setStartDate(start);
    setEndDate(end);
  };

  const generateMonthOptions = () => {
    const options = [];
    const today = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
    for (let i = 0; i < 12; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const label = formatter.format(d);
      const valStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      options.push({ label, value: valStr, year: d.getFullYear(), month: d.getMonth() + 1 });
    }
    return options;
  };

  const handleMonthSelect = (valStr) => {
    if (!valStr) {
      handleClearFilter();
      return;
    }
    const [year, month] = valStr.split('-').map(Number);
    const startObj = new Date(year, month - 1, 1);
    const endObj = new Date(year, month, 0);

    const formatDateForInput = (dateObj) => {
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const d = String(dateObj.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    const start = formatDateForInput(startObj);
    const end = formatDateForInput(endObj);

    setActivePreset(valStr);
    setTempStartDate(start);
    setTempEndDate(end);
    setStartDate(start);
    setEndDate(end);
  };

  useEffect(() => {
    fetchStaffDetail(startDate, endDate);
  }, [fetchStaffDetail, startDate, endDate]);

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-6 max-w-6xl mx-auto">
          <div className="skeleton h-8 w-48 rounded" />
          <div className="skeleton h-60 rounded-3xl" />
          <div className="skeleton h-96 rounded-3xl" />
        </div>
      </AppLayout>
    );
  }

  if (!data) return null;

  const { employee, projects, tasks, attendanceStats, financialStats, periodStats, leaveEstimate, attendance, leaveStats, leaves, leaveBalances = [], payroll, currentMonthPayroll } = data;

  // Calculate earnings and deduction stats from attendance records & payroll history
  const calculateAttendanceMetrics = () => {
    const isFiltered = Boolean(startDate || endDate);

    if (isFiltered) {
      if (periodStats) {
        return {
          totalEarnings: periodStats.period_earnings,
          totalDeduction: periodStats.period_deductions,
          periodAttendanceDeduction: 0,
          periodLatePenalty: periodStats.period_late_penalty,
          netPayable: periodStats.period_net_payable,
          earningsThisMonth: 0,
          deductionsThisMonth: 0
        };
      }
      let periodEarnings = 0;
      let periodLateCount = 0;
      if (attendance && attendance.length > 0) {
        attendance.forEach(att => {
          const isUpcomingOrPending = att.status === 'upcoming' || att.status === 'future' || att.status === 'today_pending';
          if (!isUpcomingOrPending) {
            periodEarnings += Number(att.earnings || 0);
            if (att.is_late && att.status !== 'half_day' && att.status !== 'absent') {
              periodLateCount++;
            }
          }
        });
      }

      const baseSalary = Number(employee?.base_salary || currentMonthPayroll?.employee?.base_salary || 0);
      const perDaySalary = baseSalary > 0 ? baseSalary / 30 : 0;
      const lateGroups = Math.floor(periodLateCount / 3);
      const latePenaltyAmount = lateGroups * 0.15 * perDaySalary;
      const totalPeriodDeductions = latePenaltyAmount;

      const roundedEarnings = Math.round(periodEarnings * 100) / 100;
      const roundedDeductions = Math.round(totalPeriodDeductions * 100) / 100;
      const periodNetPayable = Math.max(0, Math.round((roundedEarnings - roundedDeductions) * 100) / 100);
      return {
        totalEarnings: roundedEarnings,
        totalDeduction: roundedDeductions,
        periodAttendanceDeduction: 0,
        periodLatePenalty: roundedDeductions,
        netPayable: periodNetPayable,
        earningsThisMonth: 0,
        deductionsThisMonth: 0
      };
    }

    // Default view: use backend authoritative financialStats
    if (financialStats) {
      const net = Math.max(0, Math.round((Number(financialStats.this_month_earnings || 0) - Number(financialStats.this_month_deductions || 0)) * 100) / 100);
      return {
        totalEarnings: Number(financialStats.total_earnings || 0),
        totalDeduction: Number(financialStats.total_deductions || 0),
        earningsThisMonth: Number(financialStats.this_month_earnings || 0),
        deductionsThisMonth: Number(financialStats.this_month_deductions || 0),
        netPayable: financialStats.current_net_payable !== undefined ? Number(financialStats.current_net_payable) : net
      };
    }

    // Fallback calculation if financialStats not present
    const earningsThisMonth = currentMonthPayroll ? Number(currentMonthPayroll.accrued_earnings_to_date || currentMonthPayroll.suggested_salary || 0) : 0;
    const deductionsThisMonth = currentMonthPayroll ? Number(currentMonthPayroll.deductions || 0) : 0;
    const netPayable = currentMonthPayroll?.current_net_payable !== undefined 
      ? Number(currentMonthPayroll.current_net_payable) 
      : Math.max(0, Math.round((earningsThisMonth - deductionsThisMonth) * 100) / 100);

    let allTimePayrollEarnings = 0;
    let allTimePayrollDeductions = 0;
    if (payroll && payroll.length > 0) {
      payroll.forEach(p => {
        allTimePayrollEarnings += Number(p.net_paid || p.base_salary || 0);
        allTimePayrollDeductions += Number(p.deductions || 0);
      });
    }

    const totalEarnings = allTimePayrollEarnings > 0 
      ? allTimePayrollEarnings + earningsThisMonth 
      : (earningsThisMonth || Number(employee?.base_salary || 0));

    const totalDeduction = allTimePayrollDeductions + deductionsThisMonth;

    return {
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      totalDeduction: Math.round(totalDeduction * 100) / 100,
      earningsThisMonth: Math.round(earningsThisMonth * 100) / 100,
      deductionsThisMonth: Math.round(deductionsThisMonth * 100) / 100,
      netPayable
    };
  };

  const { totalEarnings, totalDeduction, earningsThisMonth, deductionsThisMonth, netPayable } = calculateAttendanceMetrics();

  const calculateCurrentMonthLeavesTaken = () => {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    const startOfMonth = new Date(currentYear, currentMonth - 1, 1);
    const endOfMonth = new Date(currentYear, currentMonth, 0);

    let days = 0;
    if (leaves && leaves.length > 0) {
      leaves.forEach(l => {
        if (l.status === 'approved') {
          const lStart = new Date(l.start_date);
          const lEnd = new Date(l.end_date);
          const overlapStart = new Date(Math.max(lStart.getTime(), startOfMonth.getTime()));
          const overlapEnd = new Date(Math.min(lEnd.getTime(), endOfMonth.getTime()));
          const diffMs = overlapEnd.getTime() - overlapStart.getTime();
          if (diffMs >= 0) {
            days += Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
          }
        }
      });
    }
    return days;
  };

  const currentMonthLeavesTaken = leaveEstimate ? leaveEstimate.leaves_taken : calculateCurrentMonthLeavesTaken();
  const latestClosedBalance = leaveBalances.length > 0 ? parseFloat(leaveBalances[0].closing_balance) : 0.0;
  const currentMonthEarned = 1.5;
  const estCurrentMonthClosing = leaveEstimate ? leaveEstimate.closing_balance : Math.max(0, latestClosedBalance + currentMonthEarned - currentMonthLeavesTaken);
  const estCurrentMonthUnpaid = leaveEstimate ? leaveEstimate.unpaid_leaves : Math.max(0, currentMonthLeavesTaken - (latestClosedBalance + currentMonthEarned));

  const today = new Date();
  const currentMonthNum = today.getMonth() + 1;
  const currentYearNum = today.getFullYear();
  const isCurrentMonthClosed = leaveBalances.some(b => b.month === currentMonthNum && b.year === currentYearNum);

  const ledgerRows = [...leaveBalances];
  if (!isCurrentMonthClosed) {
    ledgerRows.unshift({
      isEstimate: true,
      month: currentMonthNum,
      year: currentYearNum,
      opening_balance: latestClosedBalance,
      earned: currentMonthEarned,
      leaves_taken: currentMonthLeavesTaken,
      closing_balance: estCurrentMonthClosing,
      unpaid_leaves: estCurrentMonthUnpaid,
      status: 'Current Month (Estimate)'
    });
  }

  const activeBalance = isCurrentMonthClosed ? latestClosedBalance : estCurrentMonthClosing;
  const totalUnpaidLeaves = ledgerRows.reduce((sum, r) => sum + parseFloat(r.unpaid_leaves || 0), 0);
  const monthOptions = generateMonthOptions();

  const handleExportExcel = () => {
    if (!attendance || attendance.length === 0) {
      toast.error('No attendance records to export');
      return;
    }

    let filterText = 'All Time (Last 50 Check-ins)';
    if (startDate || endDate) {
      filterText = `From ${formatDateIST(startDate || 'Beginning')} to ${formatDateIST(endDate || 'Today')}`;
    } else if (activePreset && activePreset.includes('-')) {
      const [y, m] = activePreset.split('-');
      const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      filterText = `${monthNames[parseInt(m) - 1]} ${y}`;
    } else if (activePreset === 'this_month') {
      filterText = 'This Month';
    } else if (activePreset === 'last_month') {
      filterText = 'Last Month';
    } else if (activePreset === 'last_30_days') {
      filterText = 'Last 30 Days';
    }

    const rows = [
      [`Attendance & Payroll Report: ${employee?.name || 'Employee'}`],
      [`Date Filter: ${filterText}`],
      [`Generated On: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`],
      [],
      [
        'Date',
        'Check-In',
        'Check-Out',
        'Hours Worked',
        'Overtime (hrs)',
        'Earnings (₹)',
        'Deductions (₹)',
        'Anomaly / Late',
        'Geo Location',
        'Status'
      ]
    ];

    attendance.forEach((att) => {
      const isLate = att.is_late === true;
      let anomalyLabel = 'Regular';
      if (att.status === 'absent') {
        anomalyLabel = `Absent${att.deduction > 0 ? ` (₹${Math.round(att.deduction)})` : ''}`;
      } else if (att.status === 'half_day') {
        anomalyLabel = `Half Day${att.deduction > 0 ? ` (₹${Math.round(att.deduction)})` : ''}`;
      } else if (isLate) {
        anomalyLabel = `Late Arrival (+${att.late_minutes || 0}m)${att.deduction > 0 ? ` (₹${Math.round(att.deduction)})` : ''}`;
      }

      let geoInfo = '—';
      if (att.checkin_zone) {
        geoInfo = `${att.checkin_zone} zone`;
        if (att.checkin_distance) {
          geoInfo += ` (${parseFloat(att.checkin_distance).toFixed(1)}m)`;
        }
      }

      let statusStr = 'Absent';
      if (att.status === 'working') statusStr = 'Present';
      else if (att.status === 'completed') statusStr = 'Done';
      else if (att.status === 'half_day') statusStr = 'Half Day';
      else if (att.status === 'leave') statusStr = 'On Leave';
      else if (att.status === 'sunday') statusStr = 'Sunday';
      else if (att.status === 'holiday') statusStr = 'Holiday';
      else if (att.status === 'upcoming' || att.status === 'future') statusStr = 'Upcoming';
      else if (att.status === 'today_pending') statusStr = 'Pending Today';

      const isUpcoming = att.status === 'upcoming' || att.status === 'future' || att.status === 'today_pending';
      if (isUpcoming) {
        anomalyLabel = '—';
      }

      rows.push([
        formatDateIST(att.date),
        att.check_in ? formatTimeIST(att.check_in) : '—',
        att.check_out ? formatTimeIST(att.check_out) : '—',
        att.hours_worked > 0 ? parseFloat(att.hours_worked).toFixed(2) : '0',
        att.overtime_hours > 0 ? parseFloat(att.overtime_hours).toFixed(2) : '0',
        isUpcoming ? '—' : (att.earnings > 0 ? Number(att.earnings) : 0),
        isUpcoming ? '—' : (att.deduction > 0 ? Number(att.deduction) : 0),
        anomalyLabel,
        geoInfo,
        statusStr
      ]);
    });

    // Calculate Salary Justification Metrics
    const baseSalary = Number(employee.base_salary || currentMonthPayroll?.employee?.base_salary || 0);
    const cmp = data?.currentMonthPayroll || {};
    const perDaySalary = baseSalary > 0 ? baseSalary / 30 : 0;
    const lateCount = cmp.late_count !== undefined ? cmp.late_count : 0;
    const lateGroups = Math.floor(lateCount / 3);
    const lateDeductionDays = cmp.late_penalty_days !== undefined ? cmp.late_penalty_days : (lateGroups * 0.15);
    const lateDeductionAmount = cmp.late_deduction_amount !== undefined ? cmp.late_deduction_amount : (lateDeductionDays * perDaySalary);
    const totalDeductions = cmp.deductions !== undefined ? cmp.deductions : 0;
    const attendanceDeductions = cmp.total_attendance_deductions !== undefined ? cmp.total_attendance_deductions : Math.max(0, totalDeductions - lateDeductionAmount);
    const overtimeEarnings = cmp.overtime_earnings !== undefined ? cmp.overtime_earnings : 0;
    const accruedEarnings = cmp.accrued_earnings_to_date !== undefined ? cmp.accrued_earnings_to_date : (cmp.accrued_salary || 0);
    const netSalaryPayable = cmp.current_net_payable !== undefined 
      ? cmp.current_net_payable 
      : (cmp.net_salary_payable !== undefined ? cmp.net_salary_payable : Math.max(0, accruedEarnings - totalDeductions));
    const projectedMonthEndNet = cmp.projected_month_end_net !== undefined 
      ? cmp.projected_month_end_net 
      : Math.max(0, baseSalary - totalDeductions + overtimeEarnings);

    // Append Salary Justification Section below existing attendance table
    rows.push([]);
    rows.push([]);
    rows.push(['SALARY JUSTIFICATION & DEDUCTION BREAKDOWN']);
    rows.push(['Salary Period', filterText]);
    rows.push(['Monthly Base Salary', baseSalary > 0 ? `₹${baseSalary.toLocaleString('en-IN')}` : '—']);
    rows.push([]);

    // Table Headers
    rows.push(['Salary Component', 'Calculation / Basis', 'Days / Units', 'Amount (₹)']);

    // Table Rows
    rows.push(['Monthly Salary', 'Fixed monthly salary', '1 month', baseSalary > 0 ? `₹${baseSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—']);
    rows.push(['Daily Salary Basis', `₹${baseSalary.toLocaleString('en-IN')} ÷ 30 days`, `₹${perDaySalary.toFixed(2)}/day`, `₹${perDaySalary.toFixed(2)}`]);
    rows.push(['Attendance Deductions', 'Absences & Half-day short hours', '—', `₹${Number(attendanceDeductions).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
    rows.push(['Late Arrivals', 'Attendance records counted as late', `${lateCount} lates`, '—']);
    rows.push(['Late Deduction Groups', `FLOOR(${lateCount} ÷ 3)`, `${lateGroups} groups`, '—']);
    rows.push(['Late Penalty Deduction', `${lateGroups} groups × 0.15 day × ₹${perDaySalary.toFixed(2)}`, `${lateDeductionDays.toFixed(2)} day`, `₹${Number(lateDeductionAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
    if (overtimeEarnings > 0) {
      rows.push(['Overtime Earnings', 'Check-out after 7:00 PM IST at hourly rate', `${cmp.total_overtime_hours || 0} hrs`, `₹${Number(overtimeEarnings).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
    }
    rows.push(['Accrued Earnings to Date', 'Worked days + elapsed Sundays + OT through cutoff', `${cmp.payable_days || 0} days`, `₹${Number(accruedEarnings).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
    rows.push(['Total Deductions', 'Attendance short hours + late penalty deductions', '—', `₹${Number(totalDeductions).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
    rows.push(['Net Salary Payable', `Earnings − Total Deductions`, 'Current accrued payable', `₹${Number(netSalaryPayable).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
    if (cmp.is_month_in_progress) {
      rows.push(['Projected Month-End Net', 'Base Salary − Deductions + Overtime (Full month projection)', 'Month-end projected', `₹${Number(projectedMonthEndNet).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
    }

    // Additional Notes / Rules Section
    rows.push([]);
    rows.push(['Payroll Rule', 'Every 3 late arrivals = 0.15 day salary deduction.']);
    rows.push(['Late Count', `${lateCount} late arrivals → ${lateGroups} complete groups + ${lateCount % 3} remaining late → ${lateDeductionDays.toFixed(2)} day deduction.`]);
    rows.push(['Salary Basis', 'Fixed 30-day divisor used for daily salary basis (Base Salary ÷ 30). Full month pays 100% Base Salary regardless of calendar month length.']);

    const ws = XLSX.utils.aoa_to_sheet(rows);

    ws['!cols'] = [
      { wch: 26 }, // Column 1: Date / Salary Component
      { wch: 45 }, // Column 2: Check-In / Calculation / Basis
      { wch: 30 }, // Column 3: Check-Out / Days / Units
      { wch: 20 }, // Column 4: Hours Worked / Amount (₹)
      { wch: 15 }, // Column 5: Overtime
      { wch: 15 }, // Column 6: Earnings
      { wch: 15 }, // Column 7: Deductions
      { wch: 25 }, // Column 8: Anomaly / Late
      { wch: 25 }, // Column 9: Geo Location
      { wch: 12 }  // Column 10: Status
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');

    const safeName = (employee?.name || 'Employee').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Attendance_${safeName}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.success('Excel report exported successfully!');
  };

  const roleColors = 
    employee.role === 'admin' ? 'bg-purple-50 text-purple-700 border-purple-100' :
    employee.role === 'back_office' || employee.role === 'accounts' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
    employee.role === 'design_head' ? 'bg-amber-50 text-amber-700 border-amber-100' :
    employee.role === 'design' ? 'bg-orange-50 text-orange-700 border-orange-100' :
    employee.role === 'liasoning' ? 'bg-teal-50 text-teal-700 border-teal-100' :
    employee.role === 'civil_engineer' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
    employee.role === 'project_head' ? 'bg-cyan-50 text-cyan-700 border-cyan-100' :
    'bg-blue-50 text-blue-700 border-blue-100';

  return (
    <AppLayout>
      <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in duration-500 pb-12">
        {/* Navigation & Breadcrumbs */}
        {paramId ? (
          <nav className="flex items-center gap-2 text-xs font-semibold no-print">
            <Link to="/admin/staff" className="text-gray-400 hover:text-primary transition-colors flex items-center gap-1">
              <ArrowLeft size={12} /> Staff Management
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-800">{employee.name}</span>
          </nav>
        ) : (
          <nav className="flex items-center gap-2 text-xs font-semibold no-print">
            <Link to={user?.role === 'admin' || user?.role === 'back_office' || user?.role === 'accounts' || user?.department?.toLowerCase() === 'accounts' ? "/admin/dashboard" : "/employee/dashboard"} className="text-gray-400 hover:text-primary transition-colors flex items-center gap-1">
              <ArrowLeft size={12} /> Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-800">My Profile</span>
          </nav>
        )}

        {/* Premium Profile Header Card */}
        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 -mr-20 -mt-20 bg-orange-50/30 rounded-full" />
          
          <div className="flex items-center gap-5 relative z-10">
            <div className="w-16 h-16 rounded-2xl bg-orange-100 border border-orange-200 flex items-center justify-center text-primary font-black text-2xl shadow-sm">
              {employee.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">{employee.name}</h1>
              <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
                <span className="text-xs font-semibold text-gray-400">@{employee.username}</span>
                <span className={`px-2.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${roleColors}`}>
                  {employee.role === 'design_head' ? 'Design Head' : 
                   employee.role === 'design' ? 'Design' : 
                   employee.role === 'back_office' ? 'Back Office' : 
                   employee.role === 'accounts' ? 'Accounts' : 
                   employee.role === 'liasoning' ? 'Liasoning' : 
                   employee.role === 'civil_engineer' ? 'Civil Engineer' : 
                   employee.role === 'project_head' ? 'Project Head' : 
                   employee.role === 'employee' ? 'Employee' : employee.role}
                </span>
                {employee.department && (
                  <span className="px-2.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                    {employee.department}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 relative z-10 flex-wrap">
            {user?.role === 'admin' && (
              <div className="flex items-center gap-3 no-print">
                <button 
                  onClick={() => setShowEditModal(true)}
                  className="btn-secondary px-4 py-2.5 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 hover:border-primary/50"
                >
                  <User size={14} className="text-primary" /> Edit Profile
                </button>
                <button 
                  onClick={() => setShowResetModal(true)}
                  className="btn-secondary px-4 py-2.5 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 hover:border-primary/50 text-slate-700"
                >
                  <Key size={14} className="text-amber-500" /> Reset Password
                </button>
                <div className="h-8 w-px bg-gray-200 mx-1" />
              </div>
            )}
            <div className="text-right">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block leading-none mb-1">Contract Wages</span>
              <span className="text-lg font-black text-gray-800 font-mono">₹{Number(employee.base_salary || 0).toLocaleString('en-IN')}/mo</span>
            </div>
          </div>
        </div>

        {/* Dashboard Subtabs */}
        <div className="flex border-b border-gray-200 overflow-x-auto hide-scrollbar sticky top-0 bg-base z-20 pt-2 no-print">
          {[
            { id: 'overview', label: 'Overview', icon: PieChart },
            { id: 'attendance', label: 'Attendance & Payroll', icon: Clock, count: attendance.length },
            { id: 'projects', label: 'Projects & Tasks', icon: Briefcase, count: projects.length + tasks.length },
            { id: 'leaves', label: 'Leave Requests', icon: Calendar, count: leaves.length },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-xs font-black uppercase tracking-widest whitespace-nowrap border-b-2 transition-all flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-400 hover:text-gray-900'
              }`}
            >
              <tab.icon size={13} />
              {tab.label}
              {tab.count !== undefined && (
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                  activeTab === tab.id ? 'bg-orange-100 text-primary' : 'bg-gray-100 text-gray-400'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Contents */}
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* Profile Card & Info */}
              <div className="lg:col-span-2 space-y-6">
                <div className="card">
                  <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-4">Core Employee Profile</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
                    <div className="space-y-1">
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-wide">Phone Number</p>
                      <p className="font-semibold text-gray-900">{employee.phone || 'No phone registered'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-wide">Primary Department</p>
                      <p className="font-semibold text-gray-900">{employee.department || 'Not assigned'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-wide">Hourly billing rate</p>
                      <p className="font-semibold text-gray-900 font-mono">₹{Number(employee.hourly_rate || 0).toLocaleString()}/hr</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-wide">Registered Since</p>
                      <p className="font-semibold text-gray-900">{formatDateIST(employee.created_at)}</p>
                    </div>
                  </div>
                </div>

                {/* Team Quick Stats summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">All Time Check-Ins</p>
                    <span className="text-xl font-black text-slate-900 font-mono">{attendanceStats.all_time_checkins} days</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">This Month Check-Ins</p>
                    <span className="text-xl font-black text-primary font-mono">{attendanceStats.this_month_checkins} days</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Avg. Daily Hours</p>
                    <span className="text-xl font-black text-slate-900 font-mono">{attendanceStats.avg_hours} hrs</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Late Arrivals</p>
                    <span className="text-xl font-black text-red-500 font-mono">{attendanceStats.this_month_late} times</span>
                  </div>
                </div>

                {/* Live Task Telemetry */}
                <div className="card">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Assigned Projects Overview</h3>
                    <span className="text-[9px] font-black bg-orange-100 text-primary border border-orange-200 px-2 py-0.5 rounded-full uppercase">Current</span>
                  </div>
                  {projects.length === 0 ? (
                    <p className="text-xs text-gray-400 italic py-6 text-center">No projects assigned to this employee yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {projects.slice(0, 5).map(p => (
                        <div key={p.id} className="flex justify-between items-center p-3.5 bg-gray-50 border border-gray-100 rounded-xl hover:border-primary/40 transition-colors">
                          <div>
                            <p className="text-xs font-black text-gray-800 leading-tight">{p.name}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5 uppercase font-bold">{p.type}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                            p.status === 'Completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                          }`}>
                            {p.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar breakdown */}
              <div className="space-y-6">
                {/* Financial Summary */}
                <div className="bg-slate-900 border border-slate-800 text-white p-6 rounded-3xl shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full bg-slate-800 opacity-60" />
                  <h3 className="text-[10px] font-black text-primary uppercase tracking-widest mb-4">Compensation Summary</h3>
                  
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                      <span className="text-xs text-slate-400">Monthly Base Salary</span>
                      <span className="text-sm font-bold text-white font-mono">₹{Number(employee.base_salary || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                      <span className="text-xs text-slate-400">Hourly Rate</span>
                      <span className="text-sm font-bold text-white font-mono">₹{Number(employee.hourly_rate || 0).toLocaleString()}/hr</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                      <span className="text-xs text-slate-400">Approved Leaves</span>
                      <span className="text-sm font-bold text-white font-mono">{leaveStats.approved_leaves} Requests</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400">Pending Leaves</span>
                      <span className="text-sm font-bold text-amber-400 font-mono">{leaveStats.pending_leaves} Requests</span>
                    </div>
                  </div>
                </div>

                {/* Quick Info Alerts */}
                {(attendanceStats.this_month_late >= 3 || attendanceStats.total_late >= 3) && (
                  <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl flex gap-3.5">
                    <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={20} />
                    <div>
                      <h4 className="text-xs font-black text-amber-900 uppercase">Late compliance warning</h4>
                      <p className="text-[11px] text-amber-700 mt-1 leading-relaxed">
                        This employee has recorded <strong>{attendanceStats.this_month_late ?? attendanceStats.total_late}</strong> late arrival(s) this month ({attendanceStats.all_time_late ?? attendanceStats.total_late} lifetime). According to payroll settings, every 3 late arrivals incur a 0.15-day salary deduction.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ATTENDANCE TAB */}
          {activeTab === 'attendance' && (
            <div className="card space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-100 pb-4 gap-4">
                <div>
                  <h3 className="text-sm font-black text-gray-800 uppercase tracking-wide">Historical Attendance Logs</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                    {startDate || endDate 
                      ? `Showing logs from ${formatDateIST(startDate || 'Beginning')} to ${formatDateIST(endDate || 'Today')}`
                      : 'Showing last 50 check-ins'}
                  </p>
                </div>
                 <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full text-[10px] font-black uppercase tracking-wider">
                    Present: {attendanceStats.total_present}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-700 border border-red-100 rounded-full text-[10px] font-black uppercase tracking-wider">
                    Lates: {attendanceStats.total_late}
                  </span>
                  <button 
                    onClick={handleExportExcel}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-sm shadow-emerald-600/20 no-print"
                  >
                    <FileSpreadsheet size={13} />
                    Export Excel
                  </button>
                  <button 
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-primary hover:bg-primary/95 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-sm shadow-primary/20 no-print"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="mr-0.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Export PDF
                  </button>
                </div>
              </div>
 
              {/* Financial Metrics Tiles */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 pb-4 border-b border-gray-100">
                {startDate || endDate ? (
                  <>
                    <div className="bg-emerald-50/40 border border-emerald-100 p-4 rounded-2xl">
                      <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1">Period Earnings</p>
                      <span className="text-lg font-black text-emerald-700 font-mono">₹{totalEarnings.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200/60 p-4 rounded-2xl">
                      <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest mb-1">Days Present (Period)</p>
                      <span className="text-lg font-black text-emerald-800 font-mono">{attendanceStats.total_present} days</span>
                    </div>
                    <div className="bg-red-50/30 border border-red-100/60 p-4 rounded-2xl">
                      <p className="text-[9px] font-black text-red-500 uppercase tracking-widest mb-1">Period Deductions</p>
                      <span className="text-lg font-black text-red-600 font-mono">₹{totalDeduction.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="bg-red-50 border border-red-200/60 p-4 rounded-2xl">
                      <p className="text-[9px] font-black text-red-600 uppercase tracking-widest mb-1">Late Arrivals (Period)</p>
                      <span className={`text-lg font-black font-mono ${attendanceStats.total_late > 0 ? 'text-red-700' : 'text-slate-700'}`}>
                        {attendanceStats.total_late} times
                      </span>
                    </div>
                    <div className="bg-primary/5 border border-primary/20 p-4 rounded-2xl">
                      <p className="text-[9px] font-black text-primary uppercase tracking-widest mb-1">Net Payable</p>
                      <span className="text-lg font-black text-primary font-mono">₹{Math.round(Number(netPayable)).toLocaleString('en-IN')}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-emerald-50/40 border border-emerald-100 p-4 rounded-2xl">
                      <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1">Total Earnings</p>
                      <span className="text-lg font-black text-emerald-700 font-mono">₹{totalEarnings.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200/60 p-4 rounded-2xl">
                      <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest mb-1">Earnings This Month</p>
                      <span className="text-lg font-black text-emerald-800 font-mono">₹{earningsThisMonth.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="bg-red-50/30 border border-red-100/60 p-4 rounded-2xl">
                      <p className="text-[9px] font-black text-red-500 uppercase tracking-widest mb-1">Total Deductions</p>
                      <span className="text-lg font-black text-red-600 font-mono">₹{totalDeduction.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="bg-red-50 border border-red-200/60 p-4 rounded-2xl">
                      <p className="text-[9px] font-black text-red-600 uppercase tracking-widest mb-1">Deductions This Month</p>
                      <span className="text-lg font-black text-red-700 font-mono">₹{deductionsThisMonth.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="bg-primary/5 border border-primary/20 p-4 rounded-2xl">
                      <p className="text-[9px] font-black text-primary uppercase tracking-widest mb-1">Net Payable</p>
                      <span className="text-lg font-black text-primary font-mono">₹{Math.round(Number(netPayable)).toLocaleString('en-IN')}</span>
                    </div>
                  </>
                )}
              </div>
 
              {/* Monthly Payroll Summary Row */}
              {payroll && payroll.length > 0 && (
                <div className="space-y-3 pb-4 border-b border-gray-100 no-print">
                  <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                    <IndianRupee size={12} className="text-primary" /> Monthly Payroll Summary
                  </h4>
                  <div className="flex gap-4 overflow-x-auto pb-3 pt-1 hide-scrollbar">
                    {payroll.map((pay) => {
                      const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                      const isPaid = pay.status === 'paid';
                      return (
                        <div key={pay.id} className="min-w-[280px] bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col justify-between hover:border-primary/30 transition-colors shrink-0">
                          <div>
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-xs font-bold text-gray-900">{months[pay.month - 1]} {pay.year}</span>
                              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${
                                isPaid ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'
                              }`}>
                                {pay.status}
                              </span>
                            </div>
                            <div className="space-y-1.5">
                              <div className="flex justify-between text-[11px]">
                                <span className="text-gray-400">Base Salary</span>
                                <span className="font-bold font-mono text-gray-800">₹{Number(pay.base_salary).toLocaleString('en-IN')}</span>
                              </div>
                              <div className="flex justify-between text-[11px]">
                                <span className="text-gray-400">Bonus & Incentives</span>
                                <span className="font-bold font-mono text-emerald-600">₹{(Number(pay.bonus) + Number(pay.incentives)).toLocaleString('en-IN')}</span>
                              </div>
                              <div className="flex justify-between text-[11px]">
                                <span className="text-gray-400">Deductions</span>
                                <span className="font-bold font-mono text-red-500">₹{Number(pay.deductions).toLocaleString('en-IN')}</span>
                              </div>
                            </div>
                          </div>
                          <div className="border-t border-slate-200/60 mt-3 pt-2.5 flex justify-between items-center">
                            <div>
                              <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block leading-none">Net Paid</span>
                              <span className="text-sm font-black font-mono text-gray-900 mt-0.5 block">₹{Number(pay.net_paid).toLocaleString('en-IN')}</span>
                            </div>
                            {pay.payment_date && (
                              <span className="text-[9px] font-medium text-slate-400 font-sans">
                                Paid: {formatDateIST(pay.payment_date)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
 
              {/* Date Filters Panel */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
                {/* Custom Date Pickers & Month Selector */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex flex-col gap-1 w-full sm:w-auto">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Select Month</label>
                    <select
                      value={activePreset && activePreset.includes('-') ? activePreset : ''}
                      onChange={(e) => handleMonthSelect(e.target.value)}
                      className="input py-1.5 px-3 text-xs w-full sm:w-44 bg-white border border-slate-200 rounded-xl font-bold"
                    >
                      <option value="">-- Choose Month --</option>
                      {monthOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="hidden sm:flex items-center pt-4">
                    <span className="text-[10px] text-gray-400 font-bold uppercase">or</span>
                  </div>

                  <div className="flex flex-col gap-1 w-full sm:w-auto">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Start Date</label>
                    <input 
                      type="date" 
                      value={tempStartDate} 
                      onChange={(e) => setTempStartDate(e.target.value)}
                      className="input py-1.5 text-xs w-full sm:w-36 md:w-40"
                    />
                  </div>
                  <div className="flex flex-col gap-1 w-full sm:w-auto">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">End Date</label>
                    <input 
                      type="date" 
                      value={tempEndDate} 
                      onChange={(e) => setTempEndDate(e.target.value)}
                      className="input py-1.5 text-xs w-full sm:w-36 md:w-40"
                    />
                  </div>
                  <div className="flex items-end pt-3 sm:pt-4">
                    <button
                      onClick={handleApplyCustomFilter}
                      className="btn-primary py-2 px-4 text-xs font-black uppercase tracking-widest text-[9px] shadow-md shadow-orange-100"
                    >
                      Apply Filter
                    </button>
                  </div>
                </div>

                {/* Quick Presets & Clear */}
                <div className="flex flex-wrap items-center gap-2 mt-2 lg:mt-0 lg:self-end">
                  <button
                    onClick={() => handlePreset('this_month')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                      activePreset === 'this_month' 
                        ? 'bg-primary text-white border-primary shadow-sm' 
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    This Month
                  </button>
                  <button
                    onClick={() => handlePreset('last_month')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                      activePreset === 'last_month' 
                        ? 'bg-primary text-white border-primary shadow-sm' 
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    Last Month
                  </button>
                  <button
                    onClick={() => handlePreset('last_30_days')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                      activePreset === 'last_30_days' 
                        ? 'bg-primary text-white border-primary shadow-sm' 
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    Last 30 Days
                  </button>
                  {(startDate || endDate) && (
                    <button
                      onClick={handleClearFilter}
                      className="px-3 py-2 rounded-xl text-xs font-bold transition-all border bg-red-50 text-red-600 border-red-100 hover:bg-red-100"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {attendance.length === 0 ? (
                <p className="text-xs text-gray-400 italic text-center py-16">No check-in records logged for this employee.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-400">
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4">Check-In</th>
                        <th className="px-6 py-4">Check-Out</th>
                        <th className="px-6 py-4">Hours Worked</th>
                        <th className="px-6 py-4">Overtime</th>
                        <th className="px-6 py-4">Earnings</th>
                        <th className="px-6 py-4 text-center">Late/Half Day/Absent</th>
                        <th className="px-6 py-4 no-print">Geo Location</th>
                        <th className="px-6 py-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium text-gray-600">
                      {attendance.map((att) => {
                        const isLate = att.is_late === true;
                        const isUpcomingOrPending = att.status === 'upcoming' || att.status === 'future' || att.status === 'today_pending';

                        const deductionText = att.deduction > 0 ? ` (₹${Math.round(att.deduction).toLocaleString('en-IN')})` : '';

                        let anomalyLabel = 'Regular';
                        let anomalyClass = 'bg-slate-50 text-slate-500 border-slate-200';
                        if (att.status === 'upcoming' || att.status === 'future') {
                          anomalyLabel = '—';
                          anomalyClass = 'bg-transparent text-gray-300 border-transparent';
                        } else if (att.status === 'today_pending') {
                          anomalyLabel = 'Pending';
                          anomalyClass = 'bg-blue-50 text-blue-500 border border-blue-100';
                        } else if (att.status === 'sunday') {
                          anomalyLabel = 'Sunday';
                          anomalyClass = 'bg-slate-50 text-slate-400 border border-slate-200';
                        } else if (att.status === 'holiday') {
                          anomalyLabel = 'Holiday';
                          anomalyClass = 'bg-indigo-50 text-indigo-500 border border-indigo-100';
                        } else if (att.status === 'leave') {
                          anomalyLabel = `Leave${deductionText}`;
                          anomalyClass = 'bg-violet-50 text-violet-600 border border-violet-100 font-bold';
                        } else if (att.status === 'absent') {
                          anomalyLabel = `Absent${deductionText}`;
                          anomalyClass = 'bg-red-50 text-red-600 border border-red-100 font-bold';
                        } else if (att.status === 'half_day') {
                          anomalyLabel = `Half Day${deductionText}`;
                          anomalyClass = 'bg-amber-50 text-amber-600 border border-amber-100 font-bold';
                        } else if (isLate) {
                          anomalyLabel = `Late Arrival (${att.late_minutes}m)${deductionText}`;
                          anomalyClass = 'bg-red-50/50 text-red-500 border border-red-100/50 font-bold';
                        }

                        return (
                          <tr key={att.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4 font-bold text-gray-900">{formatDateIST(att.date)}</td>
                            <td className="px-6 py-4">
                              <span className={isLate ? 'text-red-500 font-bold' : 'text-emerald-600 font-bold'}>
                                {att.check_in ? formatTimeIST(att.check_in) : '—'}
                              </span>
                              {isLate && (
                                <span className="block text-[9px] font-black text-red-400 uppercase tracking-tighter mt-0.5">
                                  Late (+{att.late_minutes} mins)
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 font-bold text-slate-800">
                              {att.check_out ? formatTimeIST(att.check_out) : '—'}
                            </td>
                            <td className="px-6 py-4 font-bold font-mono text-gray-900">
                              {att.hours_worked > 0 ? `${parseFloat(att.hours_worked).toFixed(2)} hrs` : '—'}
                            </td>
                            <td className="px-6 py-4 font-bold font-mono text-amber-600">
                              {att.overtime_hours > 0 ? `${parseFloat(att.overtime_hours).toFixed(2)} hrs` : '—'}
                            </td>
                            <td className="px-6 py-4 font-bold font-mono text-emerald-600">
                              {isUpcomingOrPending ? '—' : (att.earnings > 0 ? `₹${Number(att.earnings).toLocaleString('en-IN')}` : '—')}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${anomalyClass}`}>
                                {anomalyLabel}
                              </span>
                            </td>
                            <td className="px-6 py-4 no-print">
                              {att.checkin_zone ? (
                                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter ${
                                  att.checkin_zone === 'strict' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'
                                }`}>
                                  {att.checkin_zone} zone
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                              {att.checkin_distance && (
                                <span className="block text-[9px] text-gray-400 font-mono mt-0.5">{parseFloat(att.checkin_distance).toFixed(1)}m from office</span>
                              )}
                            </td>
                             <td className="px-6 py-4 text-center">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                                att.status === 'working' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                att.status === 'completed' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                att.status === 'half_day' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                att.status === 'leave' ? 'bg-violet-50 text-violet-600 border-violet-100 font-bold' :
                                att.status === 'sunday' ? 'bg-slate-100 text-slate-600 border-slate-200 font-bold' :
                                att.status === 'holiday' ? 'bg-indigo-50 text-indigo-600 border-indigo-100 font-bold' :
                                (att.status === 'upcoming' || att.status === 'future') ? 'bg-gray-100 text-gray-500 border-gray-200' :
                                att.status === 'today_pending' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                                'bg-red-50 text-red-500 border-red-100'
                              }`}>
                                {att.status === 'working' ? 'Present' : 
                                 att.status === 'completed' ? 'Done' : 
                                 att.status === 'half_day' ? 'Half Day' : 
                                 att.status === 'leave' ? 'On Leave' : 
                                 att.status === 'sunday' ? 'Sunday' : 
                                 att.status === 'holiday' ? 'Holiday' : 
                                 (att.status === 'upcoming' || att.status === 'future') ? 'Upcoming' :
                                 att.status === 'today_pending' ? 'Pending Today' : 'Absent'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* PROJECTS & TASKS TAB */}
          {activeTab === 'projects' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* Projects List */}
              <div className="lg:col-span-1 space-y-6">
                <div className="card">
                  <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-4">Assigned Projects</h3>
                  {projects.length === 0 ? (
                    <p className="text-xs text-gray-400 italic py-6 text-center">No projects assigned.</p>
                  ) : (
                    <div className="space-y-4">
                      {projects.map(p => (
                        <div key={p.id} className="p-4 bg-gray-50 border border-gray-100 rounded-2xl">
                          <h4 className="text-xs font-black text-gray-900 leading-tight">{p.name}</h4>
                          <div className="flex justify-between items-center mt-3 text-[10px] font-bold uppercase text-gray-400">
                            <span>{p.type}</span>
                            <span className={p.status === 'Completed' ? 'text-emerald-600' : 'text-blue-600'}>{p.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Tasks List */}
              <div className="lg:col-span-2 space-y-6">
                <div className="card">
                  <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-4">Live Tasks Directory</h3>
                  {tasks.length === 0 ? (
                    <p className="text-xs text-gray-400 italic py-16 text-center">No tasks assigned to this employee.</p>
                  ) : (
                    <div className="space-y-4">
                      {tasks.map(t => (
                        <div key={t.id} className="p-4 bg-white border border-gray-200 rounded-2xl hover:border-primary/50 transition-colors relative overflow-hidden group">
                          <div className="absolute top-0 left-0 w-1 h-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                          
                          <div className="flex justify-between items-start gap-4 flex-wrap">
                            <div>
                              <p className="text-xs font-black text-gray-800 leading-tight group-hover:text-primary transition-colors">{t.title}</p>
                              {t.description && <p className="text-[11px] text-gray-400 mt-1 line-clamp-2">{t.description}</p>}
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${
                              t.status === 'passed' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
                              t.status === 'done' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
                              t.status === 'in_progress' ? 'bg-amber-50 border-amber-100 text-amber-600' :
                              t.status === 'review' ? 'bg-purple-50 border-purple-100 text-purple-600' :
                              'bg-slate-100 border-slate-200 text-slate-400'
                            }`}>
                              {t.status}
                            </span>
                          </div>

                          <div className="flex gap-2 items-center mt-3 pt-3 border-t border-gray-50 text-[9px] font-black uppercase text-gray-400 tracking-wider">
                            <span>Project: <span className="text-[#E05A1E]">{t.project_name}</span></span>
                            <span>•</span>
                            <span>Stage: {t.stage}</span>
                            <span>•</span>
                            <span>Created: {formatDateIST(t.created_at)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}


          {/* LEAVES TAB */}
          {activeTab === 'leaves' && (
            <div className="space-y-6">
              {/* Leave Balances Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-orange-50/50 border border-orange-100 p-5 rounded-2xl shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-orange-100/30 rounded-full -mr-5 -mt-5" />
                  <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-1 flex items-center gap-1">
                    <Activity size={12} /> Active Leave Balance
                  </p>
                  <span className="text-2xl font-black text-gray-800 font-mono">
                    {parseFloat(activeBalance).toFixed(2)} <span className="text-xs font-bold text-gray-400">days</span>
                  </span>
                  <p className="text-[10px] text-gray-400 mt-1.5 font-semibold">
                    {!isCurrentMonthClosed ? 'Includes standard monthly reset allocation' : 'Final closed balance for this period'}
                  </p>
                </div>
                
                <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-slate-100 rounded-full -mr-5 -mt-5" />
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                    <Plus size={12} className="text-primary" /> Monthly Reset Addition
                  </p>
                  <span className="text-2xl font-black text-slate-800 font-mono">
                    +1.50 <span className="text-xs font-bold text-slate-400">days</span>
                  </span>
                  <p className="text-[10px] text-slate-400 mt-1.5 font-semibold">Accumulated automatically at each monthly close</p>
                </div>

                <div className="bg-red-50/30 border border-red-100 p-5 rounded-2xl shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-red-100/10 rounded-full -mr-5 -mt-5" />
                  <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1 flex items-center gap-1">
                    <AlertTriangle size={12} /> Unpaid Leaves (Deducted)
                  </p>
                  <span className="text-2xl font-black text-red-600 font-mono">
                    {parseFloat(totalUnpaidLeaves).toFixed(2)} <span className="text-xs font-bold text-red-400">days</span>
                  </span>
                  <p className="text-[10px] text-red-400 mt-1.5 font-semibold">Leaves taken exceeding accumulated balance limit</p>
                </div>
              </div>

              {/* Leave Balance Ledger History */}
              <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-4">
                <div>
                  <h4 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar size={13} className="text-primary" /> Leave Balance Ledger & Monthly Resets
                  </h4>
                  <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">
                    Tracks the evolution of leave credits and resets month-over-month
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-[9px] font-black uppercase tracking-widest text-gray-400">
                        <th className="px-4 py-3">Month / Period</th>
                        <th className="px-4 py-3 text-right">Opening Balance</th>
                        <th className="px-4 py-3 text-right">Reset Earned</th>
                        <th className="px-4 py-3 text-right">Leaves Taken</th>
                        <th className="px-4 py-3 text-right">Closing Balance</th>
                        <th className="px-4 py-3 text-right">Unpaid Leaves</th>
                        <th className="px-4 py-3 text-center">Reset Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium text-gray-600">
                      {ledgerRows.map((row, idx) => {
                        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                        const periodLabel = `${months[row.month - 1]} ${row.year}`;
                        
                        return (
                          <tr key={idx} className={row.isEstimate ? "bg-amber-50/20 font-semibold" : "hover:bg-gray-50/50 transition-colors"}>
                            <td className="px-4 py-3.5">
                              <span className={row.isEstimate ? "text-amber-700 font-bold" : "text-gray-900 font-bold"}>
                                {periodLabel}
                              </span>
                              {row.isEstimate && (
                                <span className="block text-[8px] font-black text-amber-500 uppercase tracking-tighter mt-0.5">
                                  Current Period (Unclosed)
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-right font-mono text-gray-500">
                              {parseFloat(row.opening_balance).toFixed(2)}
                            </td>
                            <td className="px-4 py-3.5 text-right font-mono text-emerald-600 font-bold">
                              +{parseFloat(row.earned).toFixed(2)}
                            </td>
                            <td className="px-4 py-3.5 text-right font-mono text-red-500">
                              -{parseFloat(row.leaves_taken).toFixed(2)}
                            </td>
                            <td className="px-4 py-3.5 text-right font-mono text-gray-900 font-bold">
                              {parseFloat(row.closing_balance).toFixed(2)}
                            </td>
                            <td className="px-4 py-3.5 text-right font-mono text-red-600 font-bold">
                              {parseFloat(row.unpaid_leaves) > 0 ? `${parseFloat(row.unpaid_leaves).toFixed(2)}` : '—'}
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${
                                row.isEstimate 
                                  ? 'bg-amber-50 text-amber-600 border-amber-100' 
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                              }`}>
                                {row.isEstimate ? 'Pending Close' : 'Reset Applied'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {ledgerRows.length === 0 && (
                        <tr>
                          <td colSpan="7" className="px-4 py-6 text-center text-gray-400 italic">
                            No leave balance history available yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Leave Requests History */}
              <div className="card space-y-6">
                <div className="flex justify-between items-center border-b border-gray-100 pb-4">
                  <div>
                    <h3 className="text-sm font-black text-gray-800 uppercase tracking-wide">Leave Requests History</h3>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Approved, pending and rejected leave applications</p>
                  </div>
                  <div className="flex gap-2">
                    <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-black uppercase">
                      Approved: {leaveStats.approved_leaves}
                    </span>
                    <span className="px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-[10px] font-black uppercase">
                      Pending: {leaveStats.pending_leaves}
                    </span>
                  </div>
                </div>

                {leaves.length === 0 ? (
                  <p className="text-xs text-gray-400 italic text-center py-16">No leave requests recorded for this employee.</p>
                ) : (
                  <div className="space-y-4">
                    {leaves.map((leave) => (
                      <div key={leave.id} className="p-4 bg-gray-50 border border-gray-100 rounded-2xl">
                        <div className="flex justify-between items-start gap-4 flex-wrap">
                          <div>
                            <p className="text-xs font-black text-gray-800 leading-tight">
                              {formatDateIST(leave.start_date)} — {formatDateIST(leave.end_date)}
                            </p>
                            <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">Reason: <span className="text-slate-600 font-medium normal-case">{leave.reason || 'Not specified'}</span></p>
                            {leave.remarks && (
                              <p className="text-[10px] text-amber-600 font-bold uppercase mt-1">Admin remarks: <span className="text-amber-800 font-medium normal-case">{leave.remarks}</span></p>
                            )}
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black text-primary bg-orange-50 border border-orange-100 px-2 py-0.5 rounded uppercase">
                              {parseFloat(leave.amount)} Day(s) ({leave.type})
                            </span>
                            
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${
                              leave.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                              leave.status === 'pending' ? 'bg-amber-50 text-amber-700' :
                              'bg-red-50 text-red-700'
                            }`}>
                              {leave.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
      {showEditModal && (
        <UserModal 
          user={employee}
          onClose={() => setShowEditModal(false)}
          onSave={fetchStaffDetail}
        />
      )}
      {showResetModal && (
        <ResetPasswordModal 
          userId={employee.id}
          userName={employee.username}
          onClose={() => setShowResetModal(false)}
        />
      )}
    </AppLayout>
  );
}
