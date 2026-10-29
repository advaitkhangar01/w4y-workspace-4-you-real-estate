// client/src/pages/admin/ReportsPage.jsx
// Premium Excel reporting dashboard for W4Y Admin

import React, { useState, useEffect, useMemo } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import api from '../../api/client';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { 
  FileSpreadsheet, 
  Calendar, 
  User, 
  Briefcase, 
  Landmark, 
  CreditCard, 
  Layers, 
  Download, 
  RefreshCw, 
  Filter, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Clock, 
  UserCheck, 
  FileText
} from 'lucide-react';

const DEPARTMENTS = ["Admin", "Accounts", "Design", "Execution", "Drafting", "Liaisoning"];
const TRANSACTION_CATEGORIES = [
  "Mobile Bill", "Electric Bill", "Rent", "Bank installments", "Office maintenance",
  "Stationary", "Printer Agency Payment", "Liasoning Agency Payment", "Computer Maintainence",
  "Travel Convinience", "Other 1", "Other 2", "Other 3", "Other 4", "Other 5", "Incentives", "Salaries", "Client Payment"
];
const PROJECT_TYPES = ['Construction', 'Interior', 'Liasoning', 'Rendering', 'Apartment Residential', 'Residence', 'Temple', 'Hostel', 'Shopping Complex', 'Commercial', 'Industrial', 'Layout Development', 'Residential Interior', 'Commercial Interior', 'Flat Interior', 'Banquet Hall', 'Terrace Floor Plan'];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('attendance');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Common Directory States
  const [usersList, setUsersList] = useState([]);
  const [projectsList, setProjectsList] = useState([]);
  const [clientsList, setClientsList] = useState([]);

  // Report Specific Filter States
  const [attendanceFilters, setAttendanceFilters] = useState({ userId: '', startDate: '', endDate: '' });
  const [financeFilters, setFinanceFilters] = useState({ projectId: '', startDate: '', endDate: '', type: '', category: '' });
  const [payrollFilters, setPayrollFilters] = useState({ department: '', month: new Date().getMonth() + 1, year: new Date().getFullYear() });
  const [invoiceFilters, setInvoiceFilters] = useState({ clientId: '', projectId: '', status: '', startDate: '', endDate: '' });
  const [projectFilters, setProjectFilters] = useState({ status: '', type: '', startDate: '', endDate: '' });

  // Loaded Report Data States
  const [reportData, setReportData] = useState([]);

  // Fetch Directory listings on mount
  useEffect(() => {
    async function loadDirectories() {
      try {
        const [usersRes, projRes, clientsRes] = await Promise.all([
          api.get('/attendance/users'),
          api.get('/projects'),
          api.get('/clients')
        ]);
        setUsersList(usersRes.data.users || []);
        setProjectsList(projRes.data.projects || []);
        setClientsList(Array.isArray(clientsRes.data) ? clientsRes.data : (clientsRes.data.clients || []));
      } catch (err) {
        console.error("Failed to pre-fetch directories", err);
      }
    }
    loadDirectories();
  }, []);

  // Fetch Report Data based on active tab and filters
  const fetchReportData = async (signal) => {
    setLoading(true);
    try {
      let endpoint = '';
      let params = {};

      if (activeTab === 'attendance') {
        endpoint = '/reports/attendance';
        params = {
          user_id: attendanceFilters.userId,
          start_date: attendanceFilters.startDate,
          end_date: attendanceFilters.endDate
        };
      } else if (activeTab === 'finances') {
        endpoint = '/reports/finances';
        params = {
          project_id: financeFilters.projectId,
          start_date: financeFilters.startDate,
          end_date: financeFilters.endDate,
          type: financeFilters.type,
          category: financeFilters.category
        };
      } else if (activeTab === 'payroll') {
        endpoint = '/reports/payroll';
        params = {
          department: payrollFilters.department,
          month: payrollFilters.month,
          year: payrollFilters.year
        };
      } else if (activeTab === 'invoices') {
        endpoint = '/reports/invoices';
        params = {
          client_id: invoiceFilters.clientId,
          project_id: invoiceFilters.projectId,
          status: invoiceFilters.status,
          start_date: invoiceFilters.startDate,
          end_date: invoiceFilters.endDate
        };
      } else if (activeTab === 'projects') {
        endpoint = '/reports/projects';
        params = {
          status: projectFilters.status,
          type: projectFilters.type,
          start_date: projectFilters.startDate,
          end_date: projectFilters.endDate
        };
      }

      const { data } = await api.get(endpoint, { params, signal });
      setReportData(data.data || []);
      toast.success('Report data updated!');
    } catch (err) {
      if (err.name !== 'CanceledError' && err.message !== 'canceled') {
        console.error(err);
        toast.error('Failed to load report data');
      }
    } finally {
      if (!signal || !signal.aborted) {
        setLoading(false);
      }
    }
  };

  // Trigger load when filters change
  useEffect(() => {
    const controller = new AbortController();
    fetchReportData(controller.signal);
    return () => {
      controller.abort();
    };
  }, [activeTab, attendanceFilters, financeFilters, payrollFilters, invoiceFilters, projectFilters]);

  // Helper to format Excel files with dynamic widths
  const exportToExcel = (data, sheetName, filename) => {
    if (!data || data.length === 0) {
      toast.error('No data available to export');
      return;
    }

    setExporting(true);
    try {
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      
      // Auto-fit Column Widths based on maximum cell lengths
      const colWidths = Object.keys(data[0] || {}).map(key => ({
        wch: Math.max(
          key.length + 3,
          ...data.map(row => String(row[key] ?? '').length)
        ) + 2
      }));
      ws['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Excel spreadsheet generated successfully!');
    } catch (err) {
      console.error(err);
      toast.error('Spreadsheet export failed');
    } finally {
      setExporting(false);
    }
  };

  // Helper formatters
  const formatCurrency = (val) => `₹${Number(val || 0).toLocaleString('en-IN')}`;

  // Helper to accurately break down tax-inclusive invoice amounts
  const getInvoiceBreakdown = (inv) => {
    const amount = parseFloat(inv.amount || 0);
    const taxDetails = inv.tax_details || {};
    const isGstEnabled = taxDetails.isGstEnabled !== false;
    const tds = parseFloat(taxDetails.tdsAmount || 0);

    let principal = amount;
    let gst = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    if (isGstEnabled) {
      const cgstPercent = parseFloat(taxDetails.cgstPercent ?? 9);
      const sgstPercent = parseFloat(taxDetails.sgstPercent ?? 9);
      const igstPercent = parseFloat(taxDetails.igstPercent ?? 18);
      const isIgst = !!taxDetails.isIgst;
      const totalTaxPercent = isIgst ? igstPercent : (cgstPercent + sgstPercent);

      if (totalTaxPercent > 0) {
        principal = amount / (1 + totalTaxPercent / 100);
        gst = amount - principal;
        if (isIgst) {
          igst = gst;
        } else {
          cgst = gst / 2;
          sgst = gst / 2;
        }
      }
    }

    let received = parseFloat(inv.received_amount || 0);
    if (inv.status === 'paid' && received === 0) {
      received = Math.max(0, amount - tds);
    }
    const pending = inv.status === 'paid' ? 0 : Math.max(0, amount - received - tds);

    return {
      principal: Math.round(principal * 100) / 100,
      gst: Math.round(gst * 100) / 100,
      cgst: Math.round(cgst * 100) / 100,
      sgst: Math.round(sgst * 100) / 100,
      igst: Math.round(igst * 100) / 100,
      tds: Math.round(tds * 100) / 100,
      totalAmount: amount,
      received: Math.round(received * 100) / 100,
      pending: Math.round(pending * 100) / 100
    };
  };

  // Summary Metrics Computations
  const attendanceMetrics = useMemo(() => {
    if (activeTab !== 'attendance' || !reportData.length) return null;
    const presentRecords = reportData.filter(r => r.status === 'working' || r.status === 'completed' || r.status === 'present' || r.status === 'half_day');
    const absentRecords = reportData.filter(r => r.status === 'absent');
    const leaveRecords = reportData.filter(r => r.status === 'leave');
    const sundayRecords = reportData.filter(r => r.status === 'sunday');
    const holidayRecords = reportData.filter(r => r.status === 'holiday');
    const lateRecords = reportData.filter(r => r.is_late === true && r.status !== 'absent');
    const totalMins = lateRecords.reduce((sum, r) => sum + (r.late_minutes || 0), 0);
    const totalHours = reportData.reduce((sum, r) => sum + parseFloat(r.hours_worked || 0), 0);

    return {
      presentDays: presentRecords.length,
      absentDays: absentRecords.length,
      leaveDays: leaveRecords.length,
      sundayCount: sundayRecords.length,
      holidayCount: holidayRecords.length,
      lateCount: lateRecords.length,
      avgLateMins: lateRecords.length ? Math.round(totalMins / lateRecords.length) : 0,
      totalHours: totalHours.toFixed(1)
    };
  }, [reportData, activeTab]);

  const financeMetrics = useMemo(() => {
    if (activeTab !== 'finances' || !reportData.length) return null;
    const income = reportData.filter(r => r.type === 'income').reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
    const expense = reportData.filter(r => r.type === 'expense').reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);

    return {
      income,
      expense,
      netProfit: income - expense
    };
  }, [reportData, activeTab]);

  const payrollMetrics = useMemo(() => {
    if (activeTab !== 'payroll' || !reportData.length) return null;
    const totalNetPaid = reportData.reduce((sum, r) => sum + parseFloat(r.net_paid || 0), 0);
    const totalIncentives = reportData.reduce((sum, r) => sum + parseFloat(r.incentives || 0), 0);
    const totalDeductions = reportData.reduce((sum, r) => sum + parseFloat(r.deductions || 0), 0);

    return {
      totalNetPaid,
      totalIncentives,
      totalDeductions,
      avgPaid: reportData.length ? Math.round(totalNetPaid / reportData.length) : 0
    };
  }, [reportData, activeTab]);

  const invoiceMetrics = useMemo(() => {
    if (activeTab !== 'invoices' || !reportData.length) return null;
    let totalInvoiced = 0;
    let totalPrincipal = 0;
    let totalGst = 0;
    let totalReceived = 0;
    let totalPending = 0;

    reportData.forEach(r => {
      const b = getInvoiceBreakdown(r);
      totalInvoiced += b.totalAmount;
      totalPrincipal += b.principal;
      totalGst += b.gst;
      totalReceived += b.received;
      totalPending += b.pending;
    });

    return {
      totalInvoiced,
      totalPrincipal,
      totalGst,
      paidInvoices: totalReceived,
      unpaidInvoices: totalPending,
      cashRealizedPercentage: totalInvoiced ? Math.round((totalReceived / totalInvoiced) * 100) : 0
    };
  }, [reportData, activeTab]);

  const projectMetrics = useMemo(() => {
    if (activeTab !== 'projects' || !reportData.length) return null;
    const completedProjects = reportData.filter(r => r.status === 'Completed').length;
    const totalStages = reportData.reduce((sum, r) => sum + parseInt(r.total_stages || 0), 0);
    const completedStages = reportData.reduce((sum, r) => sum + parseInt(r.completed_stages || 0), 0);

    return {
      totalProjects: reportData.length,
      completedProjects,
      activeProjects: reportData.length - completedProjects,
      totalStages,
      completedStages,
      stageCompletionPercentage: totalStages ? Math.round((completedStages / totalStages) * 100) : 0
    };
  }, [reportData, activeTab]);

  const formatISTDate = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
    } catch (_) {
      return String(d);
    }
  };

  const formatISTTime = (t) => {
    if (!t) return '—';
    try {
      return new Date(t).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return String(t);
    }
  };

  // Excel Builder Functions
  const handleExcelExport = () => {
    if (activeTab === 'attendance') {
      const data = reportData.map(r => ({
        'Date': formatISTDate(r.date),
        'Employee Name': r.employee_name,
        'Department': r.department || 'N/A',
        'Role': r.role,
        'Check-In': formatISTTime(r.check_in),
        'Check-Out': formatISTTime(r.check_out),
        'Status': (r.status === 'working' || r.status === 'completed' || r.status === 'present') ? 'Present' :
                  r.status === 'half_day' ? 'Half Day' :
                  r.status === 'leave' ? 'On Leave' :
                  r.status === 'sunday' ? 'Sunday' :
                  r.status === 'holiday' ? 'Holiday' :
                  (r.status === 'upcoming' || r.status === 'future') ? 'Upcoming' :
                  r.status === 'today_pending' ? 'Pending Check-in' : 'Absent',
        'Late Arrival': r.is_late ? 'Yes' : 'No',
        'Late Minutes': r.late_minutes || 0,
        'Hours Worked': r.hours_worked || 0,
        'Check-In Distance (m)': r.checkin_distance || '—',
        'Check-In Zone': r.checkin_zone || '—'
      }));
      exportToExcel(data, 'Attendance Report', `DS16_Attendance`);
    } else if (activeTab === 'finances') {
      const data = reportData.map(r => ({
        'Date': formatISTDate(r.date),
        'Type': r.type === 'income' ? 'Income' : 'Expense',
        'Category': r.category,
        'Amount (INR)': parseFloat(r.amount || 0),
        'Associated Project': r.project_name || 'General Expense',
        'Vendor Name': r.vendor_name || 'N/A',
        'Employee Name': r.employee_name || 'N/A',
        'Description': r.description || '—',
        'Reference ID': r.reference_id || '—',
        'Recorded By': r.creator_name || 'System'
      }));
      exportToExcel(data, 'Finance Ledger', `DS16_Financials`);
    } else if (activeTab === 'payroll') {
      const data = reportData.map(r => ({
        'Disbursed Month': `${new Date(0, r.month - 1).toLocaleString('default', { month: 'long' })} ${r.year}`,
        'Employee Name': r.employee_name,
        'Department': r.department || 'N/A',
        'Role': r.role,
        'Base Salary': parseFloat(r.base_salary || 0),
        'Incentives Payout': parseFloat(r.incentives || 0),
        'Deductions': parseFloat(r.deductions || 0),
        'Net Salary Paid': parseFloat(r.net_paid || 0),
        'Payment Date': formatISTDate(r.payment_date),
        'Status': r.status
      }));
      exportToExcel(data, 'Payroll Ledger', `DS16_Payroll`);
    } else if (activeTab === 'invoices') {
      const data = reportData.map(r => {
        const b = getInvoiceBreakdown(r);
        return {
          'Invoice No': r.invoice_no,
          'Date': formatISTDate(r.date),
          'Client Name': r.client_name,
          'Project Title': r.project_name || 'N/A',
          'Principal (Excl. Tax)': b.principal,
          'GST Amount': b.gst,
          'CGST Payout': b.cgst,
          'SGST Payout': b.sgst,
          'IGST Payout': b.igst,
          'TDS Deducted': b.tds,
          'Total Amount': b.totalAmount,
          'Received Amount': b.received,
          'Pending Amount': b.pending,
          'Due Date': formatISTDate(r.due_date),
          'Status': r.status,
          'Generated By': r.creator_name || 'N/A'
        };
      });
      exportToExcel(data, 'Invoices Directory', `DS16_Invoices`);
    } else if (activeTab === 'projects') {
      const data = reportData.map(r => ({
        'Project Name': r.name,
        'Client Name': r.client_name,
        'Type': r.type,
        'Location': r.location || '—',
        'Area (sqft)': r.area_sq_ft || '—',
        'Structural Engineer': r.structural_engineer || '—',
        'Project Status': r.status,
        'Start Date': formatISTDate(r.start_date),
        'Active Workflow Stage': r.active_stage || 'Fully Completed',
        'Completed Stages': r.completed_stages || 0,
        'Total Stages': r.total_stages || 0,
        'Recorded By': r.creator_name || 'N/A'
      }));
      exportToExcel(data, 'Projects Registry', `DS16_Projects`);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6" style={{ fontFamily: '"Inter", sans-serif' }}>
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div>
            <h1 className="text-2xl font-black text-[#1A1A1A] tracking-tight flex items-center gap-2">
              <FileSpreadsheet className="text-[#E05A1E]" size={28} />
              Excel Reporting Control
            </h1>
            <p className="text-muted text-sm font-medium mt-0.5">Section-wise diversified corporate analytics &amp; direct exports</p>
          </div>
          
          <button
            onClick={handleExcelExport}
            disabled={loading || exporting || reportData.length === 0}
            className="btn-primary flex items-center gap-2 h-[42px] px-6 text-xs font-black tracking-widest uppercase disabled:opacity-40"
          >
            {exporting ? (
              <RefreshCw className="animate-spin" size={16} />
            ) : (
              <Download size={16} />
            )}
            {exporting ? 'Generating Spreadsheet...' : 'Export current to Excel'}
          </button>
        </div>

        {/* Tab Navigator */}
        <div className="flex bg-slate-100 p-1 rounded-2xl w-full md:w-fit overflow-x-auto gap-1">
          {[
            { id: 'attendance', label: 'Attendance logs', icon: UserCheck },
            { id: 'finances', label: 'Finance ledger', icon: Landmark },
            { id: 'payroll', label: 'Payroll details', icon: Landmark },
            { id: 'invoices', label: 'Invoices tracker', icon: FileText },
            { id: 'projects', label: 'Projects stages', icon: Layers }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setReportData([]); }}
                className={`flex items-center gap-2 px-5 py-3 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white shadow text-[#E05A1E]' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Dynamic Analytics Stat Cards */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card skeleton h-24 rounded-2xl" />
            ))}
          </div>
        ) : (
          <>
            {/* 1. Attendance Metrics Row */}
            {activeTab === 'attendance' && attendanceMetrics && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl shadow-sm relative overflow-hidden group">
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Team Checked-in Days</p>
                  <h3 className="text-2xl font-black text-emerald-700 mt-2 font-mono">{attendanceMetrics.presentDays} d</h3>
                  <UserCheck className="absolute top-4 right-4 text-emerald-200/50" size={32} />
                </div>
                <div className="bg-red-50 border border-red-100 p-6 rounded-2xl shadow-sm relative overflow-hidden group">
                  <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">Total Absent days</p>
                  <h3 className="text-2xl font-black text-red-600 mt-2 font-mono">{attendanceMetrics.absentDays} d</h3>
                  <TrendingDown className="absolute top-4 right-4 text-red-200/50" size={32} />
                </div>
                <div className="bg-amber-50 border border-amber-100 p-6 rounded-2xl shadow-sm relative overflow-hidden group">
                  <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Late Counts / Avg Mins</p>
                  <h3 className="text-2xl font-black text-amber-700 mt-2 font-mono">
                    {attendanceMetrics.lateCount} l <span className="text-xs text-amber-500">({attendanceMetrics.avgLateMins}m avg)</span>
                  </h3>
                  <Clock className="absolute top-4 right-4 text-amber-200/50" size={32} />
                </div>
                <div className="bg-blue-50 border border-blue-100 p-6 rounded-2xl shadow-sm relative overflow-hidden group">
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Aggregate Hours Logged</p>
                  <h3 className="text-2xl font-black text-blue-700 mt-2 font-mono">{attendanceMetrics.totalHours} hrs</h3>
                  <Activity className="absolute top-4 right-4 text-blue-200/50" size={32} />
                </div>
              </div>
            )}

            {/* 2. Finance Metrics Row */}
            {activeTab === 'finances' && financeMetrics && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl shadow-sm relative overflow-hidden group">
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1">
                    <TrendingUp size={12} /> Realized Income
                  </p>
                  <h3 className="text-2xl font-black text-emerald-700 mt-2 font-mono">{formatCurrency(financeMetrics.income)}</h3>
                </div>
                <div className="bg-red-50 border border-red-100 p-6 rounded-2xl shadow-sm relative overflow-hidden group">
                  <p className="text-[10px] font-black text-red-500 uppercase tracking-widest flex items-center gap-1">
                    <TrendingDown size={12} /> Total Expenses
                  </p>
                  <h3 className="text-2xl font-black text-red-600 mt-2 font-mono">{formatCurrency(financeMetrics.expense)}</h3>
                </div>
                <div className={`p-6 rounded-2xl shadow-sm border relative overflow-hidden group ${financeMetrics.netProfit >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-rose-50 border-rose-100'}`}>
                  <p className={`text-[10px] font-black uppercase tracking-widest ${financeMetrics.netProfit >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>Net Operating Profit</p>
                  <h3 className={`text-2xl font-black mt-2 font-mono ${financeMetrics.netProfit >= 0 ? 'text-blue-700' : 'text-rose-700'}`}>{formatCurrency(financeMetrics.netProfit)}</h3>
                </div>
              </div>
            )}

            {/* 3. Payroll Metrics Row */}
            {activeTab === 'payroll' && payrollMetrics && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm relative overflow-hidden group">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Net Disbursed</p>
                  <h3 className="text-xl font-black text-slate-900 mt-2 font-mono">{formatCurrency(payrollMetrics.totalNetPaid)}</h3>
                </div>
                <div className="bg-purple-50 border border-purple-100 p-6 rounded-2xl shadow-sm relative overflow-hidden group">
                  <p className="text-[10px] font-black text-purple-600 uppercase tracking-widest">Total Incentives Distributed</p>
                  <h3 className="text-xl font-black text-purple-700 mt-2 font-mono">{formatCurrency(payrollMetrics.totalIncentives)}</h3>
                </div>
                <div className="bg-red-50 border border-red-100 p-6 rounded-2xl shadow-sm relative overflow-hidden group">
                  <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">Total Deductions Cut</p>
                  <h3 className="text-xl font-black text-red-600 mt-2 font-mono">{formatCurrency(payrollMetrics.totalDeductions)}</h3>
                </div>
                <div className="bg-blue-50 border border-blue-100 p-6 rounded-2xl shadow-sm relative overflow-hidden group">
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Average Paid Wages</p>
                  <h3 className="text-xl font-black text-blue-700 mt-2 font-mono">{formatCurrency(payrollMetrics.avgPaid)}</h3>
                </div>
              </div>
            )}

            {/* 4. Invoice Metrics Row */}
            {activeTab === 'invoices' && invoiceMetrics && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm relative overflow-hidden group">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Amount Invoiced</p>
                  <h3 className="text-xl font-black text-slate-900 mt-2 font-mono">{formatCurrency(invoiceMetrics.totalInvoiced)}</h3>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl shadow-sm relative overflow-hidden group">
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Cash Received</p>
                  <h3 className="text-xl font-black text-emerald-700 mt-2 font-mono">{formatCurrency(invoiceMetrics.paidInvoices)}</h3>
                </div>
                <div className="bg-orange-50 border border-orange-100 p-6 rounded-2xl shadow-sm relative overflow-hidden group">
                  <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Cash Outstanding</p>
                  <h3 className="text-xl font-black text-orange-600 mt-2 font-mono">{formatCurrency(invoiceMetrics.unpaidInvoices)}</h3>
                </div>
                <div className="bg-blue-50 border border-blue-100 p-6 rounded-2xl shadow-sm relative overflow-hidden group">
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Reconciliation Rate</p>
                  <h3 className="text-xl font-black text-blue-700 mt-2 font-mono">{invoiceMetrics.cashRealizedPercentage}%</h3>
                </div>
              </div>
            )}

            {/* 5. Project Metrics Row */}
            {activeTab === 'projects' && projectMetrics && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm relative overflow-hidden group">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Projects Logged</p>
                  <h3 className="text-xl font-black text-slate-900 mt-2 font-mono">{projectMetrics.totalProjects}</h3>
                </div>
                <div className="bg-blue-50 border border-blue-100 p-6 rounded-2xl shadow-sm relative overflow-hidden group">
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Active Development Contracts</p>
                  <h3 className="text-xl font-black text-blue-700 mt-2 font-mono">{projectMetrics.activeProjects}</h3>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl shadow-sm relative overflow-hidden group">
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Fully Completed Projects</p>
                  <h3 className="text-xl font-black text-emerald-700 mt-2 font-mono">{projectMetrics.completedProjects}</h3>
                </div>
                <div className="bg-amber-50 border border-amber-100 p-6 rounded-2xl shadow-sm relative overflow-hidden group">
                  <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Milestones Completion Rate</p>
                  <h3 className="text-xl font-black text-amber-700 mt-2 font-mono">{projectMetrics.stageCompletionPercentage}%</h3>
                </div>
              </div>
            )}
          </>
        )}

        {/* Section Filters Panel */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-wrap items-end gap-6 relative overflow-visible z-20">
          <div className="flex items-center gap-2 pb-2 text-[#E05A1E]">
            <Filter size={16} />
            <span className="text-xs font-black uppercase tracking-wider">Report Filters:</span>
          </div>

          {/* Tab 1: Attendance Filters */}
          {activeTab === 'attendance' && (
            <>
              <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Select Employee</label>
                <select
                  value={attendanceFilters.userId}
                  onChange={(e) => setAttendanceFilters({...attendanceFilters, userId: e.target.value})}
                  className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs outline-none font-bold"
                >
                  <option value="">-- All Employees --</option>
                  {usersList.map(u => (
                    <option key={u.id} value={u.id}>{u.name} (@{u.username})</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1 min-w-[120px]">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Start Date</label>
                <input
                  type="date"
                  value={attendanceFilters.startDate}
                  onChange={(e) => setAttendanceFilters({...attendanceFilters, startDate: e.target.value})}
                  className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-xs outline-none font-bold font-mono"
                />
              </div>

              <div className="flex flex-col gap-1 min-w-[120px]">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">End Date</label>
                <input
                  type="date"
                  value={attendanceFilters.endDate}
                  onChange={(e) => setAttendanceFilters({...attendanceFilters, endDate: e.target.value})}
                  className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-xs outline-none font-bold font-mono"
                />
              </div>

              <button
                onClick={() => setAttendanceFilters({ userId: '', startDate: '', endDate: '' })}
                className="text-xs font-bold text-gray-400 hover:text-[#E05A1E] h-[38px] pb-2 transition-colors"
              >
                Reset
              </button>
            </>
          )}

          {/* Tab 2: Finance Filters */}
          {activeTab === 'finances' && (
            <>
              <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Select Project</label>
                <select
                  value={financeFilters.projectId}
                  onChange={(e) => setFinanceFilters({...financeFilters, projectId: e.target.value})}
                  className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs outline-none font-bold"
                >
                  <option value="">-- All Projects --</option>
                  {projectsList.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1 min-w-[110px]">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Flow Type</label>
                <select
                  value={financeFilters.type}
                  onChange={(e) => setFinanceFilters({...financeFilters, type: e.target.value})}
                  className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs outline-none font-bold"
                >
                  <option value="">All Flow</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </div>

              <div className="flex flex-col gap-1 min-w-[130px]">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Category</label>
                <select
                  value={financeFilters.category}
                  onChange={(e) => setFinanceFilters({...financeFilters, category: e.target.value})}
                  className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs outline-none font-bold"
                >
                  <option value="">All Categories</option>
                  {TRANSACTION_CATEGORIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1 min-w-[110px]">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Start Date</label>
                <input
                  type="date"
                  value={financeFilters.startDate}
                  onChange={(e) => setFinanceFilters({...financeFilters, startDate: e.target.value})}
                  className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-xs outline-none font-bold font-mono"
                />
              </div>

              <div className="flex flex-col gap-1 min-w-[110px]">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">End Date</label>
                <input
                  type="date"
                  value={financeFilters.endDate}
                  onChange={(e) => setFinanceFilters({...financeFilters, endDate: e.target.value})}
                  className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-xs outline-none font-bold font-mono"
                />
              </div>

              <button
                onClick={() => setFinanceFilters({ projectId: '', startDate: '', endDate: '', type: '', category: '' })}
                className="text-xs font-bold text-gray-400 hover:text-[#E05A1E] h-[38px] pb-2"
              >
                Reset
              </button>
            </>
          )}

          {/* Tab 3: Payroll Filters */}
          {activeTab === 'payroll' && (
            <>
              <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Department</label>
                <select
                  value={payrollFilters.department}
                  onChange={(e) => setPayrollFilters({...payrollFilters, department: e.target.value})}
                  className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs outline-none font-bold"
                >
                  <option value="">-- All Departments --</option>
                  {DEPARTMENTS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1 min-w-[120px]">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Billing Month</label>
                <select
                  value={payrollFilters.month}
                  onChange={(e) => setPayrollFilters({...payrollFilters, month: e.target.value})}
                  className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs outline-none font-bold"
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i+1} value={i+1}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1 min-w-[100px]">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Billing Year</label>
                <select
                  value={payrollFilters.year}
                  onChange={(e) => setPayrollFilters({...payrollFilters, year: e.target.value})}
                  className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs outline-none font-bold"
                >
                  {[2024, 2025, 2026].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Tab 4: Invoice Filters */}
          {activeTab === 'invoices' && (
            <>
              <div className="flex flex-col gap-1 flex-1 min-w-[150px]">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Client Name</label>
                <select
                  value={invoiceFilters.clientId}
                  onChange={(e) => setInvoiceFilters({...invoiceFilters, clientId: e.target.value})}
                  className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs outline-none font-bold"
                >
                  <option value="">-- All Clients --</option>
                  {clientsList.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1 flex-1 min-w-[150px]">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Project Title</label>
                <select
                  value={invoiceFilters.projectId}
                  onChange={(e) => setInvoiceFilters({...invoiceFilters, projectId: e.target.value})}
                  className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs outline-none font-bold"
                >
                  <option value="">-- All Projects --</option>
                  {projectsList.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1 min-w-[110px]">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Status</label>
                <select
                  value={invoiceFilters.status}
                  onChange={(e) => setInvoiceFilters({...invoiceFilters, status: e.target.value})}
                  className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs outline-none font-bold"
                >
                  <option value="">All Statuses</option>
                  <option value="generated">Generated</option>
                  <option value="paid">Paid</option>
                </select>
              </div>

              <div className="flex flex-col gap-1 min-w-[100px]">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Start Date</label>
                <input
                  type="date"
                  value={invoiceFilters.startDate}
                  onChange={(e) => setInvoiceFilters({...invoiceFilters, startDate: e.target.value})}
                  className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-xs outline-none font-bold font-mono"
                />
              </div>

              <div className="flex flex-col gap-1 min-w-[100px]">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">End Date</label>
                <input
                  type="date"
                  value={invoiceFilters.endDate}
                  onChange={(e) => setInvoiceFilters({...invoiceFilters, endDate: e.target.value})}
                  className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-xs outline-none font-bold font-mono"
                />
              </div>

              <button
                onClick={() => setInvoiceFilters({ clientId: '', projectId: '', status: '', startDate: '', endDate: '' })}
                className="text-xs font-bold text-gray-400 hover:text-[#E05A1E] h-[38px] pb-2"
              >
                Reset
              </button>
            </>
          )}

          {/* Tab 5: Projects Filters */}
          {activeTab === 'projects' && (
            <>
              <div className="flex flex-col gap-1 flex-1 min-w-[150px]">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Project Status</label>
                <select
                  value={projectFilters.status}
                  onChange={(e) => setProjectFilters({...projectFilters, status: e.target.value})}
                  className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs outline-none font-bold"
                >
                  <option value="">All Statuses</option>
                  <option value="Under Proposal">Under Proposal</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>

              <div className="flex flex-col gap-1 flex-1 min-w-[150px]">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Project Type</label>
                <select
                  value={projectFilters.type}
                  onChange={(e) => setProjectFilters({...projectFilters, type: e.target.value})}
                  className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs outline-none font-bold"
                >
                  <option value="">All Types</option>
                  {PROJECT_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1 min-w-[110px]">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Start Date</label>
                <input
                  type="date"
                  value={projectFilters.startDate}
                  onChange={(e) => setProjectFilters({...projectFilters, startDate: e.target.value})}
                  className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-xs outline-none font-bold font-mono"
                />
              </div>

              <div className="flex flex-col gap-1 min-w-[110px]">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">End Date</label>
                <input
                  type="date"
                  value={projectFilters.endDate}
                  onChange={(e) => setProjectFilters({...projectFilters, endDate: e.target.value})}
                  className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-xs outline-none font-bold font-mono"
                />
              </div>

              <button
                onClick={() => setProjectFilters({ status: '', type: '', startDate: '', endDate: '' })}
                className="text-xs font-bold text-gray-400 hover:text-[#E05A1E] h-[38px] pb-2"
              >
                Reset
              </button>
            </>
          )}
        </div>

        {/* Data Table Preview */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden min-h-[300px]">
          <div className="px-6 py-5 border-b border-gray-50 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Spreadsheet Data Preview</h3>
            <span className="badge badge-in-progress">{reportData.length} records available</span>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                <div className="w-8 h-8 border-2 border-[#E05A1E] border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-xs font-medium">Querying Postgres analytics...</p>
              </div>
            ) : reportData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-300 italic text-xs">
                No matching analytical records found for current filters.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 font-black text-slate-600 uppercase tracking-tighter">
                    {activeTab === 'attendance' && (
                      <>
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4">Employee</th>
                        <th className="px-6 py-4">Department</th>
                        <th className="px-6 py-4">Check-In</th>
                        <th className="px-6 py-4">Check-Out</th>
                        <th className="px-6 py-4">Hours Logged</th>
                        <th className="px-6 py-4">Late Mins</th>
                        <th className="px-6 py-4 text-center">Status</th>
                      </>
                    )}
                    {activeTab === 'finances' && (
                      <>
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4">Flow Type</th>
                        <th className="px-6 py-4">Category</th>
                        <th className="px-6 py-4">Associated Target</th>
                        <th className="px-6 py-4">Remarks</th>
                        <th className="px-6 py-4 text-right">Amount (₹)</th>
                      </>
                    )}
                    {activeTab === 'payroll' && (
                      <>
                        <th className="px-6 py-4">Month/Year</th>
                        <th className="px-6 py-4">Employee Name</th>
                        <th className="px-6 py-4">Department</th>
                        <th className="px-6 py-4 text-right">Base Salary</th>
                        <th className="px-6 py-4 text-right">Incentives</th>
                        <th className="px-6 py-4 text-right">Deductions</th>
                        <th className="px-6 py-4 text-right font-black text-[#E05A1E]">Net Paid</th>
                        <th className="px-6 py-4 text-center">Status</th>
                      </>
                    )}
                    {activeTab === 'invoices' && (
                      <>
                        <th className="px-4 py-4">Invoice No</th>
                        <th className="px-4 py-4">Billing Date</th>
                        <th className="px-4 py-4">Client Name</th>
                        <th className="px-4 py-4">Project Title</th>
                        <th className="px-4 py-4 text-right">Principal</th>
                        <th className="px-4 py-4 text-right">GST</th>
                        <th className="px-4 py-4 text-right">TDS</th>
                        <th className="px-4 py-4 text-right">Total Amount</th>
                        <th className="px-4 py-4 text-right">Received</th>
                        <th className="px-4 py-4 text-right">Pending</th>
                        <th className="px-4 py-4 text-center">Status</th>
                      </>
                    )}
                    {activeTab === 'projects' && (
                      <>
                        <th className="px-6 py-4">Project Name</th>
                        <th className="px-6 py-4">Client</th>
                        <th className="px-6 py-4">Type</th>
                        <th className="px-6 py-4">Location</th>
                        <th className="px-6 py-4">Active Stage</th>
                        <th className="px-6 py-4 text-center">Milestones Progress</th>
                        <th className="px-6 py-4 text-center">Status</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.map((row, index) => (
                    <tr key={index} className="hover:bg-slate-50/50 transition-colors font-medium text-slate-700">
                      {activeTab === 'attendance' && (
                        <>
                          <td className="px-6 py-3 font-mono">{formatISTDate(row.date)}</td>
                          <td className="px-6 py-3">
                            <span className="font-bold text-slate-800">{row.employee_name}</span>
                            <span className="text-[10px] text-muted block">{row.role}</span>
                          </td>
                          <td className="px-6 py-3 font-bold uppercase text-[10px] text-slate-400">{row.department || 'Staff'}</td>
                          <td className="px-6 py-3 font-mono text-slate-500">{formatISTTime(row.check_in)}</td>
                          <td className="px-6 py-3 font-mono text-slate-500">{formatISTTime(row.check_out)}</td>
                          <td className="px-6 py-3 font-bold text-slate-600">{row.hours_worked ? `${row.hours_worked} hrs` : '0'}</td>
                          <td className={`px-6 py-3 font-bold font-mono ${row.is_late ? 'text-red-500' : 'text-slate-400'}`}>
                            {row.is_late ? `+${row.late_minutes}m` : '0'}
                          </td>
                          <td className="px-6 py-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter shadow-sm border ${
                              (row.status === 'working' || row.status === 'completed' || row.status === 'present') ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                              row.status === 'half_day' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                              row.status === 'leave' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                              row.status === 'sunday' ? 'bg-slate-100 text-slate-600 border-slate-200' :
                              row.status === 'holiday' ? 'bg-cyan-50 text-cyan-600 border-cyan-100' :
                              row.status === 'future' ? 'bg-slate-50 text-slate-400 border-slate-100' :
                              'bg-red-50 text-red-500 border-red-100'
                            }`}>
                              {(row.status === 'working' || row.status === 'completed' || row.status === 'present') ? 'Present' : 
                               row.status === 'half_day' ? 'Half Day' : 
                               row.status === 'leave' ? 'On Leave' : 
                               row.status === 'sunday' ? 'Sunday' :
                               row.status === 'holiday' ? 'Holiday' :
                               row.status === 'future' ? 'Upcoming' : 'Absent'}
                            </span>
                          </td>
                        </>
                      )}
                      {activeTab === 'finances' && (
                        <>
                          <td className="px-6 py-3 font-mono">{formatISTDate(row.date)}</td>
                          <td className="px-6 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter border ${
                              row.type === 'income' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-500 border-red-100'
                            }`}>
                              {row.type}
                            </span>
                          </td>
                          <td className="px-6 py-3 font-bold text-slate-800">{row.category}</td>
                          <td className="px-6 py-3">
                            {row.project_name ? (
                              <span className="font-bold text-slate-700 block">{row.project_name}</span>
                            ) : row.vendor_name ? (
                              <span className="font-bold text-slate-700 block">Vendor: {row.vendor_name}</span>
                            ) : row.employee_name ? (
                              <span className="font-bold text-slate-700 block">Payout: {row.employee_name}</span>
                            ) : 'General Ledger'}
                          </td>
                          <td className="px-6 py-3 text-slate-500 max-w-[200px] truncate" title={row.description}>{row.description || '—'}</td>
                          <td className={`px-6 py-3 text-right font-black font-mono ${row.type === 'income' ? 'text-emerald-600' : 'text-red-500'}`}>
                            {row.type === 'income' ? '+' : '-'}{formatCurrency(row.amount)}
                          </td>
                        </>
                      )}
                      {activeTab === 'payroll' && (
                        <>
                          <td className="px-6 py-3 font-mono uppercase text-[10px] font-bold">
                            {new Date(0, row.month - 1).toLocaleString('default', { month: 'short' })} {row.year}
                          </td>
                          <td className="px-6 py-3 font-bold text-slate-800">{row.employee_name}</td>
                          <td className="px-6 py-3 uppercase text-[10px] text-slate-400 font-bold">{row.department || 'N/A'}</td>
                          <td className="px-6 py-3 text-right font-mono text-slate-500">{formatCurrency(row.base_salary)}</td>
                          <td className="px-6 py-3 text-right font-mono text-purple-600 font-bold">+{formatCurrency(row.incentives)}</td>
                          <td className="px-6 py-3 text-right font-mono text-amber-600">-{formatCurrency(row.deductions)}</td>
                          <td className="px-6 py-3 text-right font-mono font-black text-slate-950">{formatCurrency(row.net_paid)}</td>
                          <td className="px-6 py-3 text-center">
                            <span className="inline-flex px-2.5 py-0.5 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-full text-[9px] font-black uppercase shadow-sm">
                              {row.status}
                            </span>
                          </td>
                        </>
                      )}
                      {activeTab === 'invoices' && (() => {
                        const b = getInvoiceBreakdown(row);
                        return (
                          <>
                            <td className="px-4 py-3 font-mono font-bold text-[#E05A1E] whitespace-nowrap">{row.invoice_no}</td>
                            <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">{formatISTDate(row.date)}</td>
                            <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">{row.client_name}</td>
                            <td className="px-4 py-3 text-slate-500 font-medium truncate max-w-[140px]">{row.project_name || 'N/A'}</td>
                            <td className="px-4 py-3 text-right font-mono text-slate-600 whitespace-nowrap">{formatCurrency(b.principal)}</td>
                            <td className="px-4 py-3 text-right font-mono text-slate-500 whitespace-nowrap">{formatCurrency(b.gst)}</td>
                            <td className="px-4 py-3 text-right font-mono text-red-500 whitespace-nowrap">{formatCurrency(b.tds)}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">{formatCurrency(b.totalAmount)}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 whitespace-nowrap">{formatCurrency(b.received)}</td>
                            <td className={`px-4 py-3 text-right font-mono font-bold whitespace-nowrap ${b.pending > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{formatCurrency(b.pending)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter shadow-sm border ${
                                row.status === 'paid' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-sky-50 text-sky-600 border-sky-100'
                              }`}>
                                {row.status}
                              </span>
                            </td>
                          </>
                        );
                      })()}
                      {activeTab === 'projects' && (
                        <>
                          <td className="px-6 py-3 font-bold text-slate-800">{row.name}</td>
                          <td className="px-6 py-3 text-slate-500 font-bold">{row.client_name}</td>
                          <td className="px-6 py-3 font-bold text-slate-400">{row.type}</td>
                          <td className="px-6 py-3 text-slate-500 truncate max-w-[120px]">{row.location || '—'}</td>
                          <td className="px-6 py-3 text-primary font-bold">{row.active_stage || <span className="text-emerald-600">✓ Completed</span>}</td>
                          <td className="px-6 py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5 font-mono">
                              <span className="font-bold text-slate-800">{row.completed_stages}</span>
                              <span className="text-[10px] text-slate-300 font-bold">/ {row.total_stages}</span>
                              <span className="text-[10px] text-muted">({row.total_stages ? Math.round((row.completed_stages / row.total_stages) * 100) : 0}%)</span>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter shadow-sm border ${
                              row.status === 'Completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                              row.status === 'Cancelled' ? 'bg-rose-50 text-rose-500 border-rose-100' :
                              'bg-amber-50 text-amber-600 border-amber-100'
                            }`}>
                              {row.status}
                            </span>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
