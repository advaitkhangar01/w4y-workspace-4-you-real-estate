import { COMPANY_CONFIG } from '../../config/company';
import React, { useState, useEffect, useMemo } from 'react';
import jsPDF from 'jspdf';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import AppLayout from '../../components/layout/AppLayout';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { timeAgo } from '../../utils/time';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { 
  TrendingUp, TrendingDown, IndianRupee, Briefcase, 
  Download, Calendar, Filter, ArrowUpRight, ArrowDownRight,
  Activity, Receipt, Trash2, FileText, CheckCircle2, Plus, X, Lock,
  LayoutList, LayoutDashboard, CreditCard, Clock, Search, Printer
} from 'lucide-react';
import FinancialBreakdownModal from '../../components/dashboard/FinancialBreakdownModal';
import RecordPaymentModal from '../../components/projects/RecordPaymentModal';
const EXPENSE_CATEGORIES = [
  "Mobile Personal",
  "Mobile Office",
  "Electric Bill",
  "Loan Installments Commercial",
  "Loan Installments Residence",
  "Loan Installments Comodity",
  "Loan Installments Personal",
  "Rent",
  "Print Agency CAD",
  "Print Agency Photo",
  "Computer ASF",
  "Computer Pheriphels",
  "Computer Software",
  "Insurance 01",
  "Insurance 02",
  "Insurance 03",
  "TAX GST",
  "SIP 01",
  "SIP 02",
  "SIP 03",
  "Incentives",
  "Fuel Refill 01",
  "Fuel Refill 02",
  "Fuel Refill 03",
  "Fuel Refill 04",
  "Vehicle Maintainence",
  "Office Maintainence 01",
  "Office Maintainence 02",
  "Office Expenses 01",
  "Office Expenses 02",
  "Capital Transfer",
  "Office Stationary 01",
  "Office Stationary 02",
  "Others 01",
  "Others 02",
  "Others 03",
  "Others 04",
  "Others 05",
  "Salaries"
];

const getExtensionCategory = (ext) => {
  ext = ext.toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.svg', '.heic'].includes(ext)) return 'image';
  if (['.pdf'].includes(ext)) return 'pdf';
  if (['.doc', '.docx', '.xls', '.xlsx', '.csv', '.ppt', '.pptx', '.txt', '.rtf'].includes(ext)) return 'office';
  return 'default';
};

const getReceiptIcon = (fileName) => {
  if (!fileName) return null;
  const parts = fileName.split('.');
  const ext = parts.length > 1 ? '.' + parts.pop().toLowerCase() : '';
  const category = getExtensionCategory(ext);
  
  const icons = {
    pdf: { color: 'text-red-500', icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="12" y2="15"/></svg>
    )},
    office: { color: 'text-blue-600', icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/></svg>
    )},
    image: { color: 'text-pink-500', icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
    )},
    default: { color: 'text-slate-400', icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
    )}
  };
  
  return icons[category] || icons.default;
};

export default function AccountingPage() {
  const navigate = useNavigate();
  const { isAdmin, isAccounts } = useAuth();
  const [activeTab, setActiveTab] = useState('summary');
  const [loading, setLoading] = useState(true);

  const handleGenerateBillFromStage = (inv) => {
    navigate('/admin/invoice', {
      state: {
        preFill: {
          project_id: inv.project_id,
          payment_stage_id: inv.is_payment_stage ? parseInt(inv.id.replace('stage-', '')) : null,
          billToName: inv.client_name_full || inv.client_name || '',
          billToCompany: inv.client_company_full || inv.client_company || '',
          billToAddress: inv.bill_to_address || '',
          billToGst: inv.bill_to_gst || '',
          billToPhone: inv.bill_to_phone || '',
          billToEmail: inv.bill_to_email || '',
          items: [
            {
              id: Date.now(),
              description: `${inv.invoice_no.replace(' (Stage)', '')} - ${inv.project_name}`,
              quantity: 1,
              rate: inv.amount || 0
            }
          ]
        }
      }
    });
  };
  
  // Filters
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    projectId: ''
  });
  const [rowIncentives, setRowIncentives] = useState({});
  const [isProcessing, setIsProcessing] = useState({});

  // Summary Data
  const [summary, setSummary] = useState({
    totalIncome: 0,
    totalExpense: 0,
    netProfit: 0,
    totalCapital: 0
  });

  // Chart Data
  const [chartData, setChartData] = useState({
    trend: [],
    categories: []
  });



  // Expenses Data
  const [expenses, setExpenses] = useState([]);

  // Invoices Data
  const [invoices, setInvoices] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [unbilledStages, setUnbilledStages] = useState([]);
  const unbilledTotal = unbilledStages.reduce((sum, st) => sum + parseFloat(st.amount || 0), 0);
  const [invoiceFilter, setInvoiceFilter] = useState('all'); // 'all', 'received', 'pending'
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState('');
  const [isExportingInvoicesPdf, setIsExportingInvoicesPdf] = useState(false);
  const [showInvoiceReportModal, setShowInvoiceReportModal] = useState(false);

  const [isExportingPayrollPdf, setIsExportingPayrollPdf] = useState(false);
  const [showPayrollReportModal, setShowPayrollReportModal] = useState(false);

  const [isExportingExpensesPdf, setIsExportingExpensesPdf] = useState(false);
  const [showExpensesReportModal, setShowExpensesReportModal] = useState(false);

  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const filteredInvoicesList = useMemo(() => {
    let list = invoices;
    if (invoiceFilter === 'received') {
      list = invoices.filter(inv => inv.status === 'paid' || (inv.status !== 'cancelled' && parseFloat(inv.received_amount || 0) > 0));
    } else if (invoiceFilter === 'pending') {
      list = invoices.filter(inv => inv.status !== 'paid' && inv.status !== 'cancelled' && parseFloat(inv.pending_amount || 0) > 0);
    }
    if (invoiceSearchQuery.trim()) {
      const q = invoiceSearchQuery.toLowerCase();
      list = list.filter(inv =>
        (inv.invoice_no || '').toLowerCase().includes(q) ||
        (inv.client_name_full || inv.client_name || '').toLowerCase().includes(q) ||
        (inv.project_name || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [invoices, invoiceFilter, invoiceSearchQuery]);

  const invoiceTotalsBreakdown = useMemo(() => {
    let totalPrincipal = 0;
    let totalGst = 0;
    let totalGrand = 0;
    let totalTds = 0;

    filteredInvoicesList.forEach(inv => {
      const amount = parseFloat(inv.amount || 0);
      if (inv.is_payment_stage) {
        totalPrincipal += amount;
        totalGrand += amount;
        return;
      }

      const taxDetails = inv.tax_details || {};
      const isGstEnabled = taxDetails.isGstEnabled !== false;
      const tds = parseFloat(taxDetails.tdsAmount || 0);
      totalTds += tds;

      if (!isGstEnabled) {
        totalPrincipal += amount;
        totalGrand += amount;
        return;
      }

      const cgstPercent = parseFloat(taxDetails.cgstPercent ?? 9);
      const sgstPercent = parseFloat(taxDetails.sgstPercent ?? 9);
      const igstPercent = parseFloat(taxDetails.igstPercent ?? 18);
      const isIgst = !!taxDetails.isIgst;

      const totalTaxPercent = isIgst ? igstPercent : (cgstPercent + sgstPercent);

      if (totalTaxPercent <= 0) {
        totalPrincipal += amount;
        totalGrand += amount;
      } else {
        const principal = amount / (1 + totalTaxPercent / 100);
        const gst = amount - principal;
        totalPrincipal += principal;
        totalGst += gst;
        totalGrand += amount;
      }
    });

    return {
      principal: totalPrincipal,
      gst: totalGst,
      grand: totalGrand,
      tds: totalTds
    };
  }, [filteredInvoicesList]);

  const handleExportInvoicesPDF = () => {
    if (filteredInvoicesList.length === 0) {
      toast.error('No invoice data available to export');
      return;
    }

    setIsExportingInvoicesPdf(true);
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 12;

      // 1. Header Banner
      doc.setFillColor(30, 41, 59);
      doc.rect(0, 0, pageWidth, 18, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.text(COMPANY_CONFIG.brand, margin, 11);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(224, 90, 30);
      doc.text('INVOICES ACCOUNTING & AUDIT REPORT', margin + 70, 11);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(203, 213, 225);
      const generatedDateStr = new Date().toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      doc.text(`Generated: ${generatedDateStr}`, pageWidth - margin, 8, { align: 'right' });
      doc.text(`Filter: ${invoiceFilter.toUpperCase()} (${filteredInvoicesList.length} Records)`, pageWidth - margin, 13, { align: 'right' });

      // 2. Executive Financial Summary Box
      const summaryY = 22;
      const summaryHeight = 15;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, summaryY, pageWidth - (margin * 2), summaryHeight, 2, 2, 'FD');

      const colWidth = (pageWidth - (margin * 2)) / 4;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('TOTAL PRINCIPAL', margin + 6, summaryY + 5);
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Rs. ${invoiceTotalsBreakdown.principal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin + 6, summaryY + 11);

      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('TOTAL TAXES (GST / TDS)', margin + colWidth + 6, summaryY + 5);
      doc.setFontSize(9.5);
      doc.setTextColor(30, 41, 59);
      doc.text(`GST: Rs. ${invoiceTotalsBreakdown.gst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}  |  TDS: Rs. ${invoiceTotalsBreakdown.tds.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin + colWidth + 6, summaryY + 11);

      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('TOTAL RECEIVED', margin + (colWidth * 2) + 6, summaryY + 5);
      doc.setFontSize(9.5);
      doc.setTextColor(5, 150, 105);
      const totalReceived = filteredInvoicesList.reduce((sum, i) => sum + parseFloat(i.received_amount || 0), 0);
      doc.text(`Rs. ${totalReceived.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin + (colWidth * 2) + 6, summaryY + 11);

      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('TOTAL PENDING / GRAND TOTAL', margin + (colWidth * 3) + 6, summaryY + 5);
      doc.setFontSize(9.5);
      doc.setTextColor(224, 90, 30);
      const totalPending = filteredInvoicesList.reduce((sum, i) => sum + parseFloat(i.pending_amount || 0), 0);
      doc.text(`Pending: Rs. ${totalPending.toLocaleString('en-IN', { minimumFractionDigits: 0 })} | Grand: Rs. ${invoiceTotalsBreakdown.grand.toLocaleString('en-IN', { minimumFractionDigits: 0 })}`, margin + (colWidth * 3) + 6, summaryY + 11);

      // 3. Table Column Layout
      let startY = 41;
      const columns = [
        { header: 'S.No', width: 10, align: 'center' },
        { header: 'Invoice No', width: 26, align: 'left' },
        { header: 'Client Name', width: 40, align: 'left' },
        { header: 'Project Name', width: 34, align: 'left' },
        { header: 'Date / Due', width: 26, align: 'left' },
        { header: 'Principal', width: 23, align: 'right' },
        { header: 'GST', width: 21, align: 'right' },
        { header: 'TDS', width: 19, align: 'right' },
        { header: 'Total Amt', width: 24, align: 'right' },
        { header: 'Received', width: 22, align: 'right' },
        { header: 'Pending', width: 22, align: 'right' },
        { header: 'Status', width: 20, align: 'center' }
      ];

      const drawTableHeader = (y) => {
        doc.setFillColor(30, 41, 59);
        doc.rect(margin, y, pageWidth - (margin * 2), 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);

        let currentX = margin;
        columns.forEach(col => {
          let textX = currentX + 2;
          if (col.align === 'right') textX = currentX + col.width - 2;
          if (col.align === 'center') textX = currentX + (col.width / 2);
          doc.text(col.header, textX, y + 4.8, { align: col.align });
          currentX += col.width;
        });
        return y + 7;
      };

      let currentY = drawTableHeader(startY);
      const maxY = pageHeight - 16;
      let pageCount = 1;

      filteredInvoicesList.forEach((inv, index) => {
        const amount = parseFloat(inv.amount || 0);
        let principal = amount;
        let gst = 0;

        if (!inv.is_payment_stage) {
          const taxDetails = inv.tax_details || {};
          const isGstEnabled = taxDetails.isGstEnabled !== false;

          if (isGstEnabled) {
            const cgstPercent = parseFloat(taxDetails.cgstPercent ?? 9);
            const sgstPercent = parseFloat(taxDetails.sgstPercent ?? 9);
            const igstPercent = parseFloat(taxDetails.igstPercent ?? 18);
            const isIgst = !!taxDetails.isIgst;
            const totalTaxPercent = isIgst ? igstPercent : (cgstPercent + sgstPercent);

            if (totalTaxPercent > 0) {
              principal = amount / (1 + totalTaxPercent / 100);
              gst = amount - principal;
            }
          }
        }

        const tds = parseFloat(inv.tax_details?.tdsAmount || 0);
        const received = parseFloat(inv.received_amount || 0);
        const pending = parseFloat(inv.pending_amount || 0);
        const statusText = inv.is_payment_stage ? 'Payment Stage' : (inv.status || 'Draft').toUpperCase();

        const rowHeight = 7;

        if (currentY + rowHeight > maxY) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(148, 163, 184);
          doc.text(`${COMPANY_CONFIG.brand} • Invoice Audit Report`, margin, pageHeight - 6);
          doc.text(`Page ${pageCount}`, pageWidth - margin, pageHeight - 6, { align: 'right' });

          doc.addPage();
          pageCount++;

          doc.setFillColor(30, 41, 59);
          doc.rect(0, 0, pageWidth, 10, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(255, 255, 255);
          doc.text(`${COMPANY_CONFIG.brand} — INVOICE AUDIT REPORT`, margin, 7);
          doc.text(`Page ${pageCount}`, pageWidth - margin, 7, { align: 'right' });

          currentY = drawTableHeader(14);
        }

        if (index % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, currentY, pageWidth - (margin * 2), rowHeight, 'F');
        }

        doc.setDrawColor(241, 245, 249);
        doc.line(margin, currentY + rowHeight, pageWidth - margin, currentY + rowHeight);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);

        const rowData = [
          { text: `${index + 1}`, align: 'center' },
          { text: `${inv.invoice_no || '-'}`, align: 'left', font: 'bold', color: [224, 90, 30] },
          { text: `${(inv.client_name_full || inv.client_name || '-').slice(0, 22)}`, align: 'left' },
          { text: `${(inv.project_name || 'No Project').slice(0, 18)}`, align: 'left' },
          { text: `${inv.date ? new Date(inv.date).toLocaleDateString('en-IN') : '-'}`, align: 'left' },
          { text: `Rs. ${principal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, align: 'right' },
          { text: `Rs. ${gst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, align: 'right' },
          { text: `Rs. ${tds.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, align: 'right', color: [220, 38, 38] },
          { text: `Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, align: 'right', font: 'bold' },
          { text: `Rs. ${received.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, align: 'right', color: [5, 150, 105] },
          { text: `Rs. ${pending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, align: 'right', color: [217, 119, 6] },
          { text: statusText, align: 'center', font: 'bold' }
        ];

        let currentX = margin;
        rowData.forEach((item, colIdx) => {
          const col = columns[colIdx];
          let textX = currentX + 2;
          if (col.align === 'right') textX = currentX + col.width - 2;
          if (col.align === 'center') textX = currentX + (col.width / 2);

          doc.setFont('helvetica', item.font || 'normal');
          if (item.color) {
            doc.setTextColor(item.color[0], item.color[1], item.color[2]);
          } else {
            doc.setTextColor(30, 41, 59);
          }
          doc.text(item.text, textX, currentY + 4.8, { align: col.align });

          currentX += col.width;
        });

        currentY += rowHeight;
      });

      // 5. Total Footer Row
      if (currentY + 8 > maxY) {
        doc.addPage();
        pageCount++;
        currentY = 15;
      }

      doc.setFillColor(241, 245, 249);
      doc.rect(margin, currentY, pageWidth - (margin * 2), 8, 'F');
      doc.setDrawColor(203, 213, 225);
      doc.line(margin, currentY, pageWidth - margin, currentY);
      doc.line(margin, currentY + 8, pageWidth - margin, currentY + 8);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(`TOTAL (${filteredInvoicesList.length} Invoices)`, margin + 4, currentY + 5.5);

      const totalReceivedVal = filteredInvoicesList.reduce((sum, i) => sum + parseFloat(i.received_amount || 0), 0);
      const totalPendingVal = filteredInvoicesList.reduce((sum, i) => sum + parseFloat(i.pending_amount || 0), 0);

      doc.text(`Rs. ${invoiceTotalsBreakdown.principal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin + 162, currentY + 5.5, { align: 'right' });
      doc.text(`Rs. ${invoiceTotalsBreakdown.gst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin + 183, currentY + 5.5, { align: 'right' });
      doc.text(`Rs. ${invoiceTotalsBreakdown.tds.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin + 202, currentY + 5.5, { align: 'right' });
      doc.text(`Rs. ${invoiceTotalsBreakdown.grand.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin + 226, currentY + 5.5, { align: 'right' });
      doc.text(`Rs. ${totalReceivedVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin + 248, currentY + 5.5, { align: 'right' });
      doc.text(`Rs. ${totalPendingVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin + 270, currentY + 5.5, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(`${COMPANY_CONFIG.brand} • Confidential Invoices Audit Report`, margin, pageHeight - 6);
      doc.text(`Page ${pageCount} of ${pageCount}`, pageWidth - margin, pageHeight - 6, { align: 'right' });

      const fileName = `DS16_Invoices_Report_${invoiceFilter}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      toast.success('Invoice PDF report exported successfully!');
    } catch (err) {
      console.error('PDF export failed:', err);
      toast.error('Failed to generate PDF report');
    } finally {
      setIsExportingInvoicesPdf(false);
    }
  };

  const handleExportPayrollPDF = () => {
    if (employees.length === 0) {
      toast.error('No employee payroll data available to export');
      return;
    }

    setIsExportingPayrollPdf(true);
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 12;

      // 1. Header Banner
      doc.setFillColor(30, 41, 59);
      doc.rect(0, 0, pageWidth, 18, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.text(COMPANY_CONFIG.brand, margin, 11);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(224, 90, 30);
      doc.text('PAYROLL & SALARY DISBURSEMENT REPORT', margin + 70, 11);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(203, 213, 225);
      const generatedDateStr = new Date().toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      doc.text(`Generated: ${generatedDateStr}`, pageWidth - margin, 8, { align: 'right' });
      doc.text(`Period: ${monthNames[selectedMonth]} ${selectedYear} (${employees.length} Staff)`, pageWidth - margin, 13, { align: 'right' });

      // Calculate totals
      let totalBase = 0;
      let totalIncentives = 0;
      let totalNetPaid = 0;
      let paidCount = 0;

      employees.forEach(emp => {
        const processed = payrollHistory.find(p => p.user_id === emp.id);
        const base = parseFloat(emp.base_salary || 0);
        totalBase += base;
        if (processed) {
          paidCount++;
          const inc = parseFloat(processed.incentives || 0);
          const net = parseFloat(processed.net_paid || 0);
          totalIncentives += inc;
          totalNetPaid += net;
        } else {
          const inc = parseFloat(rowIncentives[emp.id] || 0);
          totalIncentives += inc;
          totalNetPaid += (emp.suggested_salary || base) + inc;
        }
      });

      // 2. Executive Summary Box
      const summaryY = 22;
      const summaryHeight = 15;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, summaryY, pageWidth - (margin * 2), summaryHeight, 2, 2, 'FD');

      const colWidth = (pageWidth - (margin * 2)) / 4;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('TOTAL BASE SALARIES', margin + 6, summaryY + 5);
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Rs. ${totalBase.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, margin + 6, summaryY + 11);

      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('TOTAL INCENTIVES', margin + colWidth + 6, summaryY + 5);
      doc.setFontSize(9.5);
      doc.setTextColor(147, 51, 234);
      doc.text(`Rs. ${totalIncentives.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, margin + colWidth + 6, summaryY + 11);

      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('TOTAL NET PAYROLL DISBURSEMENT', margin + (colWidth * 2) + 6, summaryY + 5);
      doc.setFontSize(9.5);
      doc.setTextColor(5, 150, 105);
      doc.text(`Rs. ${totalNetPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, margin + (colWidth * 2) + 6, summaryY + 11);

      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('DISBURSEMENT PROGRESS', margin + (colWidth * 3) + 6, summaryY + 5);
      doc.setFontSize(9.5);
      doc.setTextColor(224, 90, 30);
      doc.text(`Paid: ${paidCount} / ${employees.length} (${employees.length > 0 ? Math.round((paidCount / employees.length) * 100) : 0}%)`, margin + (colWidth * 3) + 6, summaryY + 11);

      // 3. Table Headers
      let startY = 41;
      const columns = [
        { header: 'S.No', width: 12, align: 'center' },
        { header: 'Employee Name', width: 45, align: 'left' },
        { header: 'Department', width: 35, align: 'left' },
        { header: 'Role', width: 28, align: 'left' },
        { header: 'Work Summary', width: 35, align: 'left' },
        { header: 'Base Salary', width: 30, align: 'right' },
        { header: 'Incentives', width: 28, align: 'right' },
        { header: 'Net Payable', width: 32, align: 'right' },
        { header: 'Status', width: 28, align: 'center' }
      ];

      const drawTableHeader = (y) => {
        doc.setFillColor(30, 41, 59);
        doc.rect(margin, y, pageWidth - (margin * 2), 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);

        let currentX = margin;
        columns.forEach(col => {
          let textX = currentX + 2;
          if (col.align === 'right') textX = currentX + col.width - 2;
          if (col.align === 'center') textX = currentX + (col.width / 2);
          doc.text(col.header, textX, y + 4.8, { align: col.align });
          currentX += col.width;
        });
        return y + 7;
      };

      let currentY = drawTableHeader(startY);
      const maxY = pageHeight - 16;
      let pageCount = 1;

      employees.forEach((emp, index) => {
        const processed = payrollHistory.find(p => p.user_id === emp.id);
        const base = parseFloat(emp.base_salary || 0);
        const inc = processed ? parseFloat(processed.incentives || 0) : parseFloat(rowIncentives[emp.id] || 0);
        const net = processed ? parseFloat(processed.net_paid || 0) : ((emp.suggested_salary || base) + inc);
        const statusText = processed ? 'PAID' : 'PENDING';

        const rowHeight = 7;

        if (currentY + rowHeight > maxY) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(148, 163, 184);
          doc.text(`${COMPANY_CONFIG.brand} • Payroll Audit Report`, margin, pageHeight - 6);
          doc.text(`Page ${pageCount}`, pageWidth - margin, pageHeight - 6, { align: 'right' });

          doc.addPage();
          pageCount++;

          doc.setFillColor(30, 41, 59);
          doc.rect(0, 0, pageWidth, 10, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(255, 255, 255);
          doc.text(`${COMPANY_CONFIG.brand} — PAYROLL AUDIT REPORT`, margin, 7);
          doc.text(`Page ${pageCount}`, pageWidth - margin, 7, { align: 'right' });

          currentY = drawTableHeader(14);
        }

        if (index % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, currentY, pageWidth - (margin * 2), rowHeight, 'F');
        }

        doc.setDrawColor(241, 245, 249);
        doc.line(margin, currentY + rowHeight, pageWidth - margin, currentY + rowHeight);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);

        const workSummary = `${emp.payable_days || emp.full_days_worked || 0} days`;

        const rowData = [
          { text: `${index + 1}`, align: 'center' },
          { text: `${emp.name || '-'}`, align: 'left', font: 'bold' },
          { text: `${emp.department || '-'}`, align: 'left' },
          { text: `${emp.role || 'Staff'}`, align: 'left' },
          { text: workSummary, align: 'left' },
          { text: `Rs. ${base.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, align: 'right' },
          { text: `Rs. ${inc.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, align: 'right', color: [147, 51, 234] },
          { text: `Rs. ${net.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, align: 'right', font: 'bold', color: processed ? [5, 150, 105] : [224, 90, 30] },
          { text: statusText, align: 'center', font: 'bold', color: processed ? [5, 150, 105] : [217, 119, 6] }
        ];

        let currentX = margin;
        rowData.forEach((item, colIdx) => {
          const col = columns[colIdx];
          let textX = currentX + 2;
          if (col.align === 'right') textX = currentX + col.width - 2;
          if (col.align === 'center') textX = currentX + (col.width / 2);

          doc.setFont('helvetica', item.font || 'normal');
          if (item.color) {
            doc.setTextColor(item.color[0], item.color[1], item.color[2]);
          } else {
            doc.setTextColor(30, 41, 59);
          }
          doc.text(item.text, textX, currentY + 4.8, { align: col.align });

          currentX += col.width;
        });

        currentY += rowHeight;
      });

      // 4. Totals Footer Row
      if (currentY + 8 > maxY) {
        doc.addPage();
        pageCount++;
        currentY = 15;
      }

      doc.setFillColor(241, 245, 249);
      doc.rect(margin, currentY, pageWidth - (margin * 2), 8, 'F');
      doc.setDrawColor(203, 213, 225);
      doc.line(margin, currentY, pageWidth - margin, currentY);
      doc.line(margin, currentY + 8, pageWidth - margin, currentY + 8);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(`TOTAL PAYROLL (${employees.length} Employees)`, margin + 4, currentY + 5.5);

      doc.text(`Rs. ${totalBase.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, margin + 185, currentY + 5.5, { align: 'right' });
      doc.text(`Rs. ${totalIncentives.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, margin + 213, currentY + 5.5, { align: 'right' });
      doc.text(`Rs. ${totalNetPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, margin + 245, currentY + 5.5, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(`${COMPANY_CONFIG.brand} • Confidential Payroll Audit Report`, margin, pageHeight - 6);
      doc.text(`Page ${pageCount} of ${pageCount}`, pageWidth - margin, pageHeight - 6, { align: 'right' });

      const fileName = `DS16_Payroll_Report_${selectedMonth}_${selectedYear}.pdf`;
      doc.save(fileName);
      toast.success('Payroll PDF report exported successfully!');
    } catch (err) {
      console.error('Payroll PDF export failed:', err);
      toast.error('Failed to generate Payroll PDF report');
    } finally {
      setIsExportingPayrollPdf(false);
    }
  };

  const handleExportExpensesPDF = () => {
    if (expenses.length === 0) {
      toast.error('No expense records available to export');
      return;
    }

    setIsExportingExpensesPdf(true);
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 12;

      // 1. Header Banner
      doc.setFillColor(30, 41, 59);
      doc.rect(0, 0, pageWidth, 18, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.text(COMPANY_CONFIG.brand, margin, 11);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(224, 90, 30);
      doc.text('EXPENSE ACCOUNTING & AUDIT REPORT', margin + 70, 11);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(203, 213, 225);
      const generatedDateStr = new Date().toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      doc.text(`Generated: ${generatedDateStr}`, pageWidth - margin, 8, { align: 'right' });
      doc.text(`Total Records: ${expenses.length}`, pageWidth - margin, 13, { align: 'right' });

      const totalExpenseAmount = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
      const categoryTotals = {};
      expenses.forEach(e => {
        const cat = e.category || 'Others';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + parseFloat(e.amount || 0);
      });
      const uniqueCatCount = Object.keys(categoryTotals).length;

      // 2. Executive Summary Box
      const summaryY = 22;
      const summaryHeight = 15;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, summaryY, pageWidth - (margin * 2), summaryHeight, 2, 2, 'FD');

      const colWidth = (pageWidth - (margin * 2)) / 3;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('TOTAL EXPENSE OUTFLOW', margin + 6, summaryY + 5);
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Rs. ${totalExpenseAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, margin + 6, summaryY + 11);

      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('TOTAL EXPENSE ENTRIES', margin + colWidth + 6, summaryY + 5);
      doc.setFontSize(9.5);
      doc.setTextColor(30, 41, 59);
      doc.text(`${expenses.length} Entries across ${uniqueCatCount} Categories`, margin + colWidth + 6, summaryY + 11);

      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('PERIOD AUDIT STATUS', margin + (colWidth * 2) + 6, summaryY + 5);
      doc.setFontSize(9.5);
      doc.setTextColor(5, 150, 105);
      doc.text(`Audit Locks Active • System Verified`, margin + (colWidth * 2) + 6, summaryY + 11);

      // 3. Table Column Layout
      let startY = 41;
      const columns = [
        { header: 'S.No', width: 12, align: 'center' },
        { header: 'Date', width: 28, align: 'left' },
        { header: 'Category', width: 45, align: 'left' },
        { header: 'Description', width: 95, align: 'left' },
        { header: 'Amount', width: 45, align: 'right' },
        { header: 'Status / Audit', width: 48, align: 'center' }
      ];

      const drawTableHeader = (y) => {
        doc.setFillColor(30, 41, 59);
        doc.rect(margin, y, pageWidth - (margin * 2), 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);

        let currentX = margin;
        columns.forEach(col => {
          let textX = currentX + 2;
          if (col.align === 'right') textX = currentX + col.width - 2;
          if (col.align === 'center') textX = currentX + (col.width / 2);
          doc.text(col.header, textX, y + 4.8, { align: col.align });
          currentX += col.width;
        });
        return y + 7;
      };

      let currentY = drawTableHeader(startY);
      const maxY = pageHeight - 16;
      let pageCount = 1;

      const sortedExpenses = expenses.slice().sort((a,b) => new Date(b.date) - new Date(a.date));

      sortedExpenses.forEach((exp, index) => {
        const amt = parseFloat(exp.amount || 0);
        const statusText = exp.period_unlock_id ? 'BACKDATED' : 'AUDITED';

        const rowHeight = 7;

        if (currentY + rowHeight > maxY) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(148, 163, 184);
          doc.text(`${COMPANY_CONFIG.brand} • Expense Audit Report`, margin, pageHeight - 6);
          doc.text(`Page ${pageCount}`, pageWidth - margin, pageHeight - 6, { align: 'right' });

          doc.addPage();
          pageCount++;

          doc.setFillColor(30, 41, 59);
          doc.rect(0, 0, pageWidth, 10, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(255, 255, 255);
          doc.text(`${COMPANY_CONFIG.brand} — EXPENSE AUDIT REPORT`, margin, 7);
          doc.text(`Page ${pageCount}`, pageWidth - margin, 7, { align: 'right' });

          currentY = drawTableHeader(14);
        }

        if (index % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, currentY, pageWidth - (margin * 2), rowHeight, 'F');
        }

        doc.setDrawColor(241, 245, 249);
        doc.line(margin, currentY + rowHeight, pageWidth - margin, currentY + rowHeight);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);

        const rowData = [
          { text: `${index + 1}`, align: 'center' },
          { text: `${new Date(exp.date).toLocaleDateString('en-IN')}`, align: 'left' },
          { text: `${(exp.category || 'General').slice(0, 26)}`, align: 'left', font: 'bold' },
          { text: `${(exp.description || '-').slice(0, 60)}`, align: 'left' },
          { text: `Rs. ${amt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, align: 'right', font: 'bold' },
          { text: statusText, align: 'center', font: 'bold', color: exp.period_unlock_id ? [217, 119, 6] : [5, 150, 105] }
        ];

        let currentX = margin;
        rowData.forEach((item, colIdx) => {
          const col = columns[colIdx];
          let textX = currentX + 2;
          if (col.align === 'right') textX = currentX + col.width - 2;
          if (col.align === 'center') textX = currentX + (col.width / 2);

          doc.setFont('helvetica', item.font || 'normal');
          if (item.color) {
            doc.setTextColor(item.color[0], item.color[1], item.color[2]);
          } else {
            doc.setTextColor(30, 41, 59);
          }
          doc.text(item.text, textX, currentY + 4.8, { align: col.align });

          currentX += col.width;
        });

        currentY += rowHeight;
      });

      // 4. Totals Footer Row
      if (currentY + 8 > maxY) {
        doc.addPage();
        pageCount++;
        currentY = 15;
      }

      doc.setFillColor(241, 245, 249);
      doc.rect(margin, currentY, pageWidth - (margin * 2), 8, 'F');
      doc.setDrawColor(203, 213, 225);
      doc.line(margin, currentY, pageWidth - margin, currentY);
      doc.line(margin, currentY + 8, pageWidth - margin, currentY + 8);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(`TOTAL EXPENSES (${expenses.length} Records)`, margin + 4, currentY + 5.5);

      doc.text(`Rs. ${totalExpenseAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, margin + 225, currentY + 5.5, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(`${COMPANY_CONFIG.brand} • Confidential Expense Audit Report`, margin, pageHeight - 6);
      doc.text(`Page ${pageCount} of ${pageCount}`, pageWidth - margin, pageHeight - 6, { align: 'right' });

      const fileName = `DS16_Expenses_Report_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      toast.success('Expenses PDF report exported successfully!');
    } catch (err) {
      console.error('Expenses PDF export failed:', err);
      toast.error('Failed to generate Expenses PDF report');
    } finally {
      setIsExportingExpensesPdf(false);
    }
  };

  const [projects, setProjects] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewType, setViewType] = useState('table'); // table or kanban
  const [modalData, setModalData] = useState({ category: '', amount: '', date: new Date().toISOString().split('T')[0], description: '', receipt: null, projectId: '' });
  const [financialModal, setFinancialModal] = useState({ isOpen: false, type: '', label: '' });

  // Payroll Data
  const [employees, setEmployees] = useState([]);
  const [payrollHistory, setPayrollHistory] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [auditedCategories, setAuditedCategories] = useState({}); // category -> boolean

  // Monthly Closing & Locked Periods State
  const [closedMonths, setClosedMonths] = useState(new Set());
  const [unlockedMonths, setUnlockedMonths] = useState(new Set());
  const [preflight, setPreflight] = useState(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [unlockReason, setUnlockReason] = useState('');
  const [selectedHistoryDetail, setSelectedHistoryDetail] = useState(null);
  const [historyDetailOpen, setHistoryDetailOpen] = useState(false);
  const [showCloseConfirmModal, setShowCloseConfirmModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [targetUnlockMonth, setTargetUnlockMonth] = useState(null); // { month, year }
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [isClosingMonth, setIsClosingMonth] = useState(false);
  const [isUnlockingMonth, setIsUnlockingMonth] = useState(false);

  const activeCategoriesList = useMemo(() => {
    const list = [...EXPENSE_CATEGORIES];
    expenses.forEach(exp => {
      if (exp.category) {
        const trimmedLower = exp.category.trim().toLowerCase();
        if (trimmedLower !== 'vendor_payment') {
          let normalized = exp.category;
          if (trimmedLower === 'salary' || trimmedLower === 'salaries') {
            normalized = 'Salaries';
          } else if (trimmedLower === 'incentive' || trimmedLower === 'incentives') {
            normalized = 'Incentives';
          } else {
            const match = list.find(c => c.toLowerCase() === trimmedLower);
            if (match) {
              normalized = match;
            } else {
              normalized = exp.category.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            }
          }
          if (!list.includes(normalized)) {
            list.push(normalized);
          }
        }
      }
    });
    return list;
  }, [expenses]);

  const groupedExpenses = useMemo(() => {
    const groups = {};
    activeCategoriesList.forEach(cat => groups[cat] = []);
    
    expenses.forEach(exp => {
      // 1. Filter by selected month and year (bypass if global date range filters are active)
      const expDate = new Date(exp.date);
      const expMonth = expDate.getMonth() + 1;
      const expYear = expDate.getFullYear();
      const hasDateFilter = !!filters.startDate || !!filters.endDate;
      if (!hasDateFilter && (expMonth !== selectedMonth || expYear !== selectedYear)) {
        return;
      }

      // 2. Normalize category name casing/plurality
      let cat = exp.category || 'Miscellaneous';
      const trimmedLower = cat.trim().toLowerCase();
      if (trimmedLower === 'salary' || trimmedLower === 'salaries') {
        cat = 'Salaries';
      } else if (trimmedLower === 'incentive' || trimmedLower === 'incentives') {
        cat = 'Incentives';
      } else {
        // Find match in activeCategoriesList case-insensitively
        const match = activeCategoriesList.find(c => c.toLowerCase() === trimmedLower);
        if (match) {
          cat = match;
        }
      }

      if (!groups[cat]) groups[cat] = [];
      groups[cat].push({
        ...exp,
        category: cat // Use normalized category
      });
    });
    return groups;
  }, [expenses, selectedMonth, selectedYear, activeCategoriesList]);

  const categoryTotals = useMemo(() => {
    const totals = {};
    Object.entries(groupedExpenses).forEach(([cat, items]) => {
      totals[cat] = items.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
    });
    return totals;
  }, [groupedExpenses]);

  const grandTotal = useMemo(() => {
    return Object.entries(categoryTotals).reduce((sum, [cat, total]) => {
      if (auditedCategories[cat.toLowerCase()]) {
        return sum + total;
      }
      return sum;
    }, 0);
  }, [categoryTotals, auditedCategories]);

  useEffect(() => {
    fetchProjects();
    fetchClosedMonths();
  }, []);

  useEffect(() => {
    fetchSummary();
    if (activeTab === 'summary') fetchChartData();
    if (activeTab === 'expenses') {
      fetchExpenses();
      fetchAudits();
    }
    if (activeTab === 'payroll') fetchPayrollData();
    if (activeTab === 'invoices') fetchInvoices();
    if (activeTab === 'month-close') {
      fetchPreflight();
      fetchClosedMonths();
    }

  }, [activeTab, selectedMonth, selectedYear, filters]);

  const fetchProjects = async () => {
    try {
      const { data } = await api.get('/projects');
      setProjects(data.projects || []);
    } catch (err) {
      console.error('Failed to load projects');
    }
  };

  const fetchSummary = async () => {
    try {
      const { startDate, endDate, projectId } = filters;
      let url = `/finances/summary?`;
      if (startDate) url += `&start_date=${startDate}`;
      if (endDate) url += `&end_date=${endDate}`;
      if (projectId) url += `&project_id=${projectId}`;
      
      const { data } = await api.get(url);
      
      setSummary({
        totalIncome: data.total_income,
        currentProjectValue: data.current_project_value,
        billedIncome: data.billed_income,
        receivedIncome: data.received_income,
        pendingIncome: data.pending_income,
        unbilledIncome: data.unbilled_income,
        totalIncentives: data.total_incentives || 0,
        totalExpense: data.total_expense,
        netProfit: data.net_profit,
        totalCapital: data.total_capital || 0
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchChartData = async () => {
    try {
      const { startDate, endDate, projectId } = filters;
      let url = `/finances/charts?`;
      if (startDate) url += `&start_date=${startDate}`;
      if (endDate) url += `&end_date=${endDate}`;
      if (projectId) url += `&project_id=${projectId}`;
      
      const { data } = await api.get(url);
      setChartData(data);
    } catch (err) {
      console.error('Failed to load chart data');
    }
  };



  const fetchExpenses = async () => {
    try {
      const { startDate, endDate } = filters;
      let url = `/finances/transactions?type=expense`;
      if (startDate) url += `&start_date=${startDate}`;
      if (endDate) url += `&end_date=${endDate}`;
      
      const { data } = await api.get(url);
      // Explicitly filter out vendor payments from the general expense list
      setExpenses(data.transactions.filter(t => 
        t.category !== 'vendor_payment' && 
        t.category !== 'vendor payment' && 
        t.category?.toLowerCase() !== 'vendor_payment' && 
        t.category?.toLowerCase() !== 'vendor payment' && 
        !t.vendor_id
      ));
    } catch (err) {
      toast.error('Failed to load expenses');
    }
  };

  const fetchAudits = async () => {
    try {
      // For auditing, we use the selectedMonth/Year from the payroll filter or current date if not set
      const { data } = await api.get(`/accounting/expenses/audits?month=${selectedMonth}&year=${selectedYear}`);
      const normalizedData = {};
      Object.entries(data).forEach(([key, val]) => {
        normalizedData[key.toLowerCase()] = val;
      });
      setAuditedCategories(normalizedData);
    } catch (err) {
      console.error('Failed to load audits');
    }
  };

  const toggleAudit = async (category) => {
    const catLower = category.toLowerCase();
    const newVal = !auditedCategories[catLower];
    setAuditedCategories(prev => ({ ...prev, [catLower]: newVal }));
    
    try {
      await api.post('/accounting/expenses/audits', {
        category,
        month: selectedMonth,
        year: selectedYear,
        is_verified: newVal
      });
    } catch (err) {
      toast.error('Failed to save audit status');
      // Revert local state
      setAuditedCategories(prev => ({ ...prev, [catLower]: !newVal }));
    }
  };

  const fetchPayrollData = async () => {
    try {
      const [empRes, histRes] = await Promise.all([
        api.get(`/accounting/payroll/employees?month=${selectedMonth}&year=${selectedYear}`),
        api.get(`/accounting/payroll/history?month=${selectedMonth}&year=${selectedYear}`)
      ]);
      setEmployees(empRes.data);
      setPayrollHistory(histRes.data);
      fetchAudits();
    } catch (err) {
      toast.error('Failed to load payroll data');
    }
  };

  const fetchClosedMonths = async () => {
    try {
      setHistoryLoading(true);
      const { data } = await api.get('/monthly-close/history');
      setHistoryLogs(data);
      
      const closed = new Set();
      const unlocked = new Set();
      data.forEach(log => {
        closed.add(`${log.month}-${log.year}`);
        if (log.is_unlocked) {
          unlocked.add(`${log.month}-${log.year}`);
        }
      });
      setClosedMonths(closed);
      setUnlockedMonths(unlocked);
    } catch (err) {
      console.error('Failed to load closed months:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchPreflight = async () => {
    try {
      setPreflightLoading(true);
      const { data } = await api.get(`/monthly-close/preview?month=${selectedMonth}&year=${selectedYear}`);
      setPreflight(data);
    } catch (err) {
      toast.error('Failed to load month close preview');
    } finally {
      setPreflightLoading(false);
    }
  };

  const handleCloseMonth = async () => {
    if (preflight?.payroll?.employees_pending > 0 && !closeReason.trim()) {
      toast.error('A reason is mandatory when closing with pending payroll');
      return;
    }
    
    setIsClosingMonth(true);
    try {
      await api.post('/monthly-close/execute', {
        month: selectedMonth,
        year: selectedYear,
        reason: closeReason
      });
      toast.success(`Month closed successfully!`);
      setCloseReason('');
      setShowCloseConfirmModal(false);
      setConfirmText('');
      fetchPreflight();
      fetchClosedMonths();
      fetchSummary();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to close month');
    } finally {
      setIsClosingMonth(false);
    }
  };

  const handleUnlockMonth = async () => {
    if (!unlockReason.trim()) {
      toast.error('An unlock reason is mandatory');
      return;
    }
    
    setIsUnlockingMonth(true);
    try {
      await api.post('/monthly-close/unlock', {
        month: targetUnlockMonth.month,
        year: targetUnlockMonth.year,
        reason: unlockReason
      });
      toast.success(`Month unlocked successfully!`);
      setUnlockReason('');
      setShowUnlockModal(false);
      setTargetUnlockMonth(null);
      fetchClosedMonths();
      if (activeTab === 'month-close') fetchPreflight();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to unlock month');
    } finally {
      setIsUnlockingMonth(false);
    }
  };

  const handleRelockMonth = async (m, y) => {
    if (!window.confirm(`Are you sure you want to re-lock this period?`)) return;
    try {
      await api.post('/monthly-close/relock', { month: m, year: y });
      toast.success(`Period re-locked successfully`);
      fetchClosedMonths();
      if (activeTab === 'month-close') fetchPreflight();
    } catch (err) {
      toast.error('Failed to re-lock');
    }
  };

  const handleReverseClose = async (m, y) => {
    const monthName = new Date(y, m - 1, 1).toLocaleString('default', { month: 'long' });
    if (!window.confirm(`⚠️ DANGER: Are you sure you want to REVERSE the monthly closing for ${monthName} ${y}?\n\nThis will delete the monthly leave balances, restore unlocked status to all categories, and delete the snapshot logs! This action is audit-logged.`)) return;
    
    try {
      await api.delete(`/monthly-close/${m}/${y}`);
      toast.success(`Month closing reversed successfully`);
      fetchClosedMonths();
      if (activeTab === 'month-close') fetchPreflight();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reverse close');
    }
  };

  const fetchHistoryDetail = async (m, y) => {
    try {
      const { data } = await api.get(`/monthly-close/history/${m}/${y}`);
      setSelectedHistoryDetail(data);
      setHistoryDetailOpen(true);
    } catch (err) {
      toast.error('Failed to load snapshot details');
    }
  };

  const fetchInvoices = async () => {
    setLoadingInvoices(true);
    try {
      const { data } = await api.get('/invoices', {
        params: {
          project_id: filters.projectId || undefined,
          start_date: filters.startDate || undefined,
          end_date: filters.endDate || undefined,
          limit: 100
        }
      });
      setInvoices(data.invoices || []);

      if (filters.projectId) {
        const stageRes = await api.get(`/documents/payment-stages?project_id=${filters.projectId}`);
        setUnbilledStages(
          (stageRes.data.paymentStages || []).filter(s =>
            s.status?.toLowerCase() === 'payment initiated' && !s.has_active_invoice
          )
        );
      } else {
        setUnbilledStages([]);
      }
    } catch (err) {
      console.error('Failed to load invoices', err);
      toast.error('Failed to load invoices');
    } finally {
      setLoadingInvoices(false);
    }
  };

  const handleMarkPaid = async (id) => {
    if (!window.confirm('Are you sure you want to mark this invoice as Paid? This will automatically record a finance income transaction.')) return;
    try {
      await api.post(`/invoices/${id}/mark-paid`);
      toast.success('Invoice marked as paid and income recorded!');
      fetchInvoices();
      fetchSummary();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to mark invoice as paid');
    }
  };

  const handleDeleteInvoice = async (id, invoiceNo) => {
    if (!window.confirm(`Are you sure you want to delete invoice ${invoiceNo}? This action cannot be undone.`)) return;
    try {
      await api.delete(`/invoices/${id}`);
      toast.success(`Invoice ${invoiceNo} deleted successfully`);
      fetchInvoices();
      fetchSummary();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete invoice');
    }
  };



  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!modalData.category) {
      toast.error('Please select a category');
      return;
    }

    const amountVal = parseFloat(modalData.amount);
    if (isNaN(amountVal) || amountVal <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (!modalData.date) {
      toast.error('Please select a date');
      return;
    }

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append('type', 'expense');
    formData.append('category', modalData.category); 
    formData.append('amount', amountVal);
    formData.append('date', modalData.date);
    formData.append('description', modalData.description || '');
    
    if (modalData.projectId) {
      formData.append('project_id', modalData.projectId);
    }
    
    if (modalData.receipt) {
      formData.append('receipt', modalData.receipt);
    }

    try {
      await api.post('/finances/transactions', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success('Expense recorded');
      setModalData({ category: '', amount: '', date: new Date().toISOString().split('T')[0], description: '', receipt: null, projectId: '' });
      fetchExpenses();
      fetchSummary();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to record expense');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDeletable = (dateStr) => {
    if (!dateStr) return true;
    const date = new Date(dateStr);
    
    const m = date.getMonth() + 1;
    const y = date.getFullYear();
    const isClosed = closedMonths.has(`${m}-${y}`);
    const isUnlocked = unlockedMonths.has(`${m}-${y}`);
    
    if (isClosed && !isUnlocked) {
      return false; // locked by closed month
    }
    
    if (isClosed && isUnlocked && isAdmin) {
      return true; // if closed but unlocked, bypass 15 days rule for admins
    }
    
    const diff = Date.now() - date.getTime();
    const days = diff / (1000 * 60 * 60 * 24);
    return days < 15;
  };

  const handleDeleteExpense = async (id, date) => {
    const d = new Date(date);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    if (closedMonths.has(`${m}-${y}`) && !unlockedMonths.has(`${m}-${y}`)) {
      toast.error(`${d.toLocaleString('default', { month: 'long' })} ${y} is closed. Unlock the period to make changes.`);
      return;
    }

    if (!isDeletable(date)) {
      toast.error('Expenses older than 15 days are irreversible');
      return;
    }
    if (!window.confirm('Delete this transaction?')) return;
    try {
      await api.delete(`/finances/transactions/${id}`);
      toast.success('Transaction deleted');
      fetchExpenses();
      fetchSummary();
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  const handleReversePayroll = async (payrollId, employeeName) => {
    if (!window.confirm(`Are you sure you want to reverse the processed payroll for ${employeeName}? This will reset their salary status to unpaid.`)) return;
    try {
      await api.delete(`/accounting/payroll/${payrollId}`);
      toast.success(`Payroll reversed for ${employeeName}`);
      fetchPayrollData();
      fetchExpenses();
      fetchSummary();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reverse payroll');
    }
  };

  const handleProcessPayroll = async (emp, manualIncentive = null) => {
    const suggested = emp.suggested_salary;
    const isManual = manualIncentive !== null;
    
    let incentiveAmount = isManual ? manualIncentive : '0';
    let finalAmount = suggested + parseFloat(incentiveAmount || 0);

    if (!isManual) {
      const breakdown = `
        Full Days: ${emp.full_days}
        Half Days: ${emp.half_days} (${emp.half_days * 0.5}d)
        Late Penalty: -${emp.late_penalty_days}d
        Unpaid Leaves: -${emp.unpaid_leaves}
        Paid Holidays: +${emp.paid_holidays}
        Final Payable Days: ${emp.payable_days}
      `;
      incentiveAmount = prompt(`Enter Incentives for ${emp.name} (optional):`, '0');
      if (incentiveAmount === null) return;

      finalAmount = prompt(`Confirm payment for ${emp.name}:\n${breakdown}\nIncentive: ₹${incentiveAmount}\nSuggested Amount:`, (emp.suggested_salary + parseFloat(incentiveAmount || 0)));
      if (finalAmount === null) return;
    }

    setIsProcessing(prev => ({ ...prev, [emp.id]: true }));


    try {
      // 1. Save to payroll table
      const deductionsVal = parseFloat(emp.deductions || 0);

      await api.post('/accounting/payroll', {
        user_id: emp.id,
        base_salary: emp.base_salary,
        bonus: 0,
        incentives: parseFloat(incentiveAmount) || 0,
        deductions: Math.round(deductionsVal),
        net_paid: parseFloat(finalAmount),
        month: selectedMonth,
        year: selectedYear,
        payment_date: new Date(selectedYear, selectedMonth, 0).toISOString().split('T')[0], // last day of selected month
        status: 'paid'
      });

      // 2. Refresh local data
      toast.success(`Payroll processed for ${emp.name}`);
      fetchPayrollData();
      fetchSummary();
      fetchExpenses(); // Added to refresh the expense matrix
    } catch (err) {
      toast.error('Failed to process payroll');
    } finally {
      setIsProcessing(prev => ({ ...prev, [emp.id]: false }));
    }
  };

  const handleExportCSV = () => {
    if (expenses.length === 0) {
      toast.error('No data to export');
      return;
    }

    const headers = ['Date', 'Category', 'Vendor', 'Description', 'Amount', 'Status'];
    const rows = expenses.map(exp => [
      new Date(exp.date).toLocaleDateString(),
      exp.category,
      exp.vendor_name || 'N/A',
      exp.description?.replace(/,/g, ';'), // Escape commas
      exp.amount,
      exp.is_verified ? 'Verified' : 'Unverified'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `DS16_Expenses_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Report exported');
  };

  const isPeriodLocked = closedMonths.has(`${selectedMonth}-${selectedYear}`) && !unlockedMonths.has(`${selectedMonth}-${selectedYear}`);

  return (
    <AppLayout>
      <div className="p-6 max-w-screen-2xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Accounting Control</h1>
          <div className="flex bg-gray-100 p-1 rounded-lg no-print">
            {['summary', 'payroll', 'expenses', 'invoices', isAdmin && 'month-close'].filter(Boolean).map((tab) => (
              <button 
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  if (tab === 'month-close') {
                    const now = new Date();
                    const currentMonth = now.getMonth() + 1;
                    const currentYear = now.getFullYear();
                    if (selectedYear > currentYear || (selectedYear === currentYear && selectedMonth >= currentMonth)) {
                      let prevM = currentMonth - 1;
                      let prevY = currentYear;
                      if (prevM === 0) {
                        prevM = 12;
                        prevY -= 1;
                      }
                      setSelectedMonth(prevM);
                      setSelectedYear(prevY);
                    }
                  }
                }}
                className={`px-4 py-2 text-sm font-bold rounded-md transition-all capitalize ${activeTab === tab ? 'bg-white shadow-sm text-primary' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {tab.replace('-', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Filters Bar */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-wrap items-center gap-4 no-print">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-400" />
            <span className="text-sm font-bold text-gray-700">Filters:</span>
          </div>
          
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-gray-400" />
            <input 
              type="date" 
              value={filters.startDate}
              onChange={(e) => setFilters({...filters, startDate: e.target.value})}
              className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-primary"
            />
            <span className="text-gray-400">to</span>
            <input 
              type="date" 
              value={filters.endDate}
              onChange={(e) => setFilters({...filters, endDate: e.target.value})}
              className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-primary"
            />
          </div>

          {activeTab !== 'expenses' && activeTab !== 'payroll' && (
            <div className="flex items-center gap-2">
              <Briefcase size={14} className="text-gray-400" />
              <select 
                value={filters.projectId}
                onChange={(e) => setFilters({...filters, projectId: e.target.value})}
                className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-primary min-w-[150px]"
              >
                <option value="">All Projects</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          <button 
            onClick={() => setFilters({ startDate: '', endDate: '', projectId: '' })}
            className="text-xs text-gray-400 hover:text-primary font-medium"
          >
            Clear Filters
          </button>

          <div className="flex-1" />

          {activeTab === 'expenses' && (
            <button 
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-all"
            >
              <Download size={14} />
              Export CSV
            </button>
          )}
        </div>

        {/* Tab Content */}
        {activeTab === 'summary' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Box 1: Total Project Value */}
              <div 
                className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden group cursor-pointer hover:shadow-md hover:border-gray-200 transition-all active:scale-[0.98]"
                onClick={() => setFinancialModal({ isOpen: true, type: 'total', label: 'Total Project Value' })}
              >
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Project Value</p>
                <h3 className="text-xl font-black text-gray-900 mt-2">₹{(Number(summary.totalIncome) || 0).toLocaleString('en-IN')}</h3>
                <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Briefcase size={40} />
                </div>
              </div>

              {/* Box 2: Current Project Value */}
              <div 
                className="bg-white p-5 rounded-xl border border-purple-100 shadow-sm relative overflow-hidden group cursor-pointer hover:shadow-md hover:border-purple-200 transition-all active:scale-[0.98]"
                onClick={() => setFinancialModal({ isOpen: true, type: 'current', label: 'Current Project Value' })}
              >
                <p className="text-[10px] font-bold text-purple-500 uppercase tracking-widest">Current Project Value</p>
                <h3 className="text-xl font-black text-purple-600 mt-2">₹{(Number(summary.currentProjectValue) || 0).toLocaleString('en-IN')}</h3>
                <div className="absolute top-0 right-0 p-3 opacity-5 text-purple-600 group-hover:opacity-10 transition-opacity">
                  <IndianRupee size={40} />
                </div>
              </div>

              {/* Box 3: Billed Amount */}
              <div 
                className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden group cursor-pointer hover:shadow-md hover:border-blue-200 transition-all active:scale-[0.98]"
                onClick={() => setFinancialModal({ isOpen: true, type: 'billed', label: 'Billed Amount' })}
              >
                <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Billed Amount</p>
                <h3 className="text-xl font-black text-blue-600 mt-2">₹{(Number(summary.billedIncome) || 0).toLocaleString('en-IN')}</h3>
                <div className="absolute top-0 right-0 p-3 opacity-5 text-blue-600 group-hover:opacity-10 transition-opacity">
                  <FileText size={40} />
                </div>
              </div>

              {/* Box 4: Unbilled Amount */}
              <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden group">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Unbilled Amount</p>
                <h3 className="text-xl font-black text-gray-600 mt-2">₹{(Number(summary.unbilledIncome) || 0).toLocaleString('en-IN')}</h3>
                <div className="absolute top-0 right-0 p-3 opacity-5">
                  <TrendingUp size={40} />
                </div>
              </div>

              {/* Box 5: Received Amount */}
              <div 
                className="bg-white p-5 rounded-xl border border-emerald-100 shadow-sm relative overflow-hidden group cursor-pointer hover:shadow-md hover:border-emerald-200 transition-all active:scale-[0.98]"
                onClick={() => setFinancialModal({ isOpen: true, type: 'received', label: 'Received Amount' })}
              >
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Received Amount</p>
                <h3 className="text-xl font-black text-emerald-600 mt-2">₹{(Number(summary.receivedIncome) || 0).toLocaleString('en-IN')}</h3>
                <div className="absolute top-0 right-0 p-3 opacity-10 text-emerald-600 group-hover:opacity-20 transition-opacity">
                  <CheckCircle2 size={40} />
                </div>
              </div>

              {/* Box 6: Pending Amount */}
              <div 
                className="bg-white p-5 rounded-xl border border-orange-100 shadow-sm relative overflow-hidden group cursor-pointer hover:shadow-md hover:border-orange-200 transition-all active:scale-[0.98]"
                onClick={() => setFinancialModal({ isOpen: true, type: 'pending', label: 'Pending Amount' })}
              >
                <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Pending Amount</p>
                <h3 className="text-xl font-black text-orange-600 mt-2">₹{(Number(summary.pendingIncome) || 0).toLocaleString('en-IN')}</h3>
                <div className="absolute top-0 right-0 p-3 opacity-10 text-orange-500 group-hover:opacity-20 transition-opacity">
                  <Activity size={40} />
                </div>
              </div>

              {/* Box 7: Total Expenses */}
              <div 
                className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden group cursor-pointer hover:shadow-md hover:border-red-200 transition-all active:scale-[0.98]"
                onClick={() => setFinancialModal({ isOpen: true, type: 'expenses', label: 'Total Expenses' })}
              >
                <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Total Expenses</p>
                <h3 className="text-xl font-black text-red-500 mt-2">₹{(summary.totalExpense || 0).toLocaleString('en-IN')}</h3>
                <p className="text-[10px] text-muted mt-1 italic">Excl. vendor payments</p>
                <div className="absolute top-0 right-0 p-3 opacity-5 text-red-500">
                  <ArrowDownRight size={40} />
                </div>
              </div>

              {/* Box 8: Incentives */}
              <div className="bg-white p-5 rounded-xl border border-purple-100 shadow-sm relative overflow-hidden group">
                <p className="text-[10px] font-bold text-purple-600 uppercase tracking-widest">Incentives Paid</p>
                <h3 className="text-xl font-black text-purple-600 mt-2">₹{(Number(summary.totalIncentives) || 0).toLocaleString('en-IN')}</h3>
                <div className="absolute top-0 right-0 p-3 opacity-10 text-purple-600">
                  <TrendingUp size={40} />
                </div>
              </div>

              {/* Box 9: Profit & Loss */}
              <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm relative overflow-hidden group md:col-span-2">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Profit & Loss (Realized)</p>
                    <div className="flex items-baseline gap-3 mt-2">
                      <h3 className={`text-xl font-black ${((summary.receivedIncome || 0) - (summary.totalExpense || 0)) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        ₹{((summary.receivedIncome || 0) - (summary.totalExpense || 0)).toLocaleString('en-IN')}
                      </h3>
                      <span className="text-[10px] font-bold text-gray-400 italic">Formula: Received - Expenses</span>
                    </div>
                  </div>
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Activity size={20} className="text-blue-600" />
                  </div>
                </div>
              </div>

              {/* Box 10: Company Capital */}
              <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm relative overflow-hidden group md:col-span-2">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Company Capital (Retained Profit)</p>
                    <div className="flex items-baseline gap-3 mt-2">
                      <h3 className="text-xl font-black text-blue-600">
                        ₹{(Number(summary.totalCapital) || 0).toLocaleString('en-IN')}
                      </h3>
                      <span className="text-[10px] font-bold text-gray-400 italic">Accumulated Closed Periods Profit</span>
                    </div>
                  </div>
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <IndianRupee size={20} className="text-blue-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Monthly Performance</h3>
                  <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-tighter">
                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500"/> Income</div>
                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-400"/> Expense</div>
                  </div>
                </div>
                <div className="h-64 w-full">
                  {chartData.trend?.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData.trend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="month_year" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 600, fill: '#999' }} />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 10, fontWeight: 600, fill: '#999' }}
                          tickFormatter={(v) => v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${(v / 1000).toFixed(0)}K` : `₹${v}`}
                        />
                        <Tooltip
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                          cursor={{ fill: '#f8fafc' }}
                          formatter={(value, name) => [`₹${Number(value).toLocaleString('en-IN')}`, name.charAt(0).toUpperCase() + name.slice(1)]}
                        />
                        <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                        <Bar dataKey="expense" fill="#f87171" radius={[4, 4, 0, 0]} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 italic text-xs">
                      No trend data available for this period
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-6">Expense Distribution</h3>
                <div className="h-64 w-full flex">
                  {chartData.categories?.length > 0 ? (
                    <>
                      <div className="w-1/2">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={chartData.categories}
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {chartData.categories.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'][index % 8]} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                              formatter={(value, name) => [`₹${Number(value).toLocaleString('en-IN')}`, name]}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="w-1/2 overflow-y-auto pr-2 space-y-2">
                        {chartData.categories.map((cat, idx) => (
                          <div key={cat.name} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'][idx % 8] }} />
                              <span className="text-[10px] font-bold text-gray-600 truncate max-w-[100px]">{cat.name}</span>
                            </div>
                            <span className="text-[10px] font-mono font-bold text-gray-400">₹{parseFloat(cat.value).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="w-full flex flex-col items-center justify-center text-gray-400 italic text-xs">
                      No expense breakdown available
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}



        {activeTab === 'expenses' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Period Lock Status Banner */}
            {closedMonths.has(`${selectedMonth}-${selectedYear}`) && (
              <div className={`p-4 rounded-xl border flex items-center justify-between shadow-sm no-print ${
                unlockedMonths.has(`${selectedMonth}-${selectedYear}`)
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}>
                <div className="flex items-center gap-3">
                  <span className="text-lg">{unlockedMonths.has(`${selectedMonth}-${selectedYear}`) ? '🔓' : '🔒'}</span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider">
                      Period Status: {unlockedMonths.has(`${selectedMonth}-${selectedYear}`) ? 'Temporary Unlocked' : 'Fully Locked'}
                    </p>
                    <p className="text-[10px] opacity-80 mt-0.5">
                      This month is closed. {unlockedMonths.has(`${selectedMonth}-${selectedYear}`) ? 'Authorized admins can make adjustments, but it should be re-locked after edits.' : 'Authorized admins must unlock the period to make any changes.'}
                    </p>
                  </div>
                </div>
                {isAdmin && (
                  <div>
                    {unlockedMonths.has(`${selectedMonth}-${selectedYear}`) ? (
                      <button 
                        onClick={() => handleRelockMonth(selectedMonth, selectedYear)}
                        className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm active:scale-[0.98]"
                      >
                        Re-lock Period
                      </button>
                    ) : (
                      <button 
                        onClick={() => {
                          setTargetUnlockMonth({ month: selectedMonth, year: selectedYear });
                          setShowUnlockModal(true);
                        }}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm active:scale-[0.98]"
                      >
                        Unlock Period
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Inline Expense Entry Card */}
            <div className="card bg-gray-50/50 border-dashed border-2 p-6 rounded-2xl">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Record Office Expense
              </h3>
              <form onSubmit={handleAddExpense} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Expense Category</label>
                    <select 
                      className="input w-full text-sm h-[38px] cursor-pointer" 
                      value={modalData.category} 
                      onChange={e => setModalData({ ...modalData, category: e.target.value })} 
                      disabled={isPeriodLocked}
                      required
                    >
                      <option value="">-- Select Category --</option>
                      {activeCategoriesList.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Amount (₹)</label>
                    <input 
                      type="number" 
                      placeholder="0.00" 
                      value={modalData.amount} 
                      onChange={e => setModalData({ ...modalData, amount: e.target.value })} 
                      className="input w-full text-sm h-[38px] font-mono" 
                      disabled={isPeriodLocked}
                      required 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Date</label>
                    <input 
                      type="date" 
                      value={modalData.date} 
                      onChange={e => setModalData({ ...modalData, date: e.target.value })} 
                      className="input w-full text-sm h-[38px]" 
                      disabled={isPeriodLocked}
                      required 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Project (Optional)</label>
                    <select 
                      className="input w-full text-sm h-[38px] cursor-pointer" 
                      value={modalData.projectId} 
                      onChange={e => setModalData({ ...modalData, projectId: e.target.value })}
                      disabled={isPeriodLocked}
                    >
                      <option value="">-- General Expense --</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Receipt (Optional)</label>
                    <input 
                      type="file" 
                      onChange={e => setModalData({ ...modalData, receipt: e.target.files[0] })} 
                      className="input w-full text-sm h-[38px] p-1 cursor-pointer" 
                      disabled={isPeriodLocked}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Description / Remark</label>
                    <input 
                      type="text" 
                      value={modalData.description} 
                      onChange={e => setModalData({ ...modalData, description: e.target.value })} 
                      placeholder="Add a remark..." 
                      className="input w-full text-sm h-[38px]" 
                      disabled={isPeriodLocked}
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button 
                    type="submit" 
                    disabled={isSubmitting || isPeriodLocked} 
                    className="btn-primary"
                  >
                    {isSubmitting ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Recording...
                      </div>
                    ) : isPeriodLocked ? 'Period Locked' : 'Record Expense'}
                  </button>
                </div>
              </form>
            </div>

            {/* Expense Matrix */}
            <div className="card p-0 overflow-hidden border-[#EBEBEB]">
              <div className="p-4 border-b border-[#EBEBEB] flex items-center justify-between bg-white">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                  Expense Management Matrix
                </h3>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2 py-1">
                    <Calendar size={14} className="text-gray-400" />
                    <select 
                      value={selectedMonth} 
                      onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                      className="text-xs font-bold bg-transparent outline-none cursor-pointer"
                    >
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i+1} value={i+1}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>
                      ))}
                    </select>
                    <select 
                      value={selectedYear} 
                      onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                      className="text-xs font-bold bg-transparent outline-none cursor-pointer border-l pl-2"
                    >
                      {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <span className="badge badge-in-progress">
                    {Object.values(groupedExpenses).reduce((sum, list) => sum + list.length, 0)} Records this Month
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-[#EBEBEB]">
                      <th className="py-3 px-4 text-[10px] font-bold text-muted uppercase w-10">#</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-muted uppercase w-[20%]">Category</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-muted uppercase w-[35%]">Transactions</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-muted uppercase w-[25%]">Remarks</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-muted uppercase w-[15%] text-right">Total Amount</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-muted uppercase w-10 text-center">✔</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EBEBEB]">
                    {activeCategoriesList.map((cat, idx) => {
                      const items = groupedExpenses[cat] || [];
                      const total = categoryTotals[cat] || 0;

                      return (
                        <tr key={cat} className="hover:bg-gray-50/30 transition-colors">
                          <td className="py-3 px-4 align-top text-[10px] text-muted font-bold">{idx + 1}</td>
                          <td className="py-3 px-4 align-top text-xs font-medium text-slate-800">
                            <div className="flex items-center gap-2 mt-0.5">
                              <span>{cat}</span>
                              <button 
                                onClick={() => {
                                  setModalData({ ...modalData, category: cat });
                                  window.scrollTo({ top: 180, behavior: 'smooth' });
                                  toast.success(`Selected ${cat} category in form above.`);
                                }}
                                className="w-5 h-5 rounded bg-orange-100 hover:bg-orange-200 text-orange-600 flex items-center justify-center transition-all"
                                title={`Record ${cat} Expense`}
                              >
                                <Plus size={12} strokeWidth={3} />
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-4 align-top">
                            <div className="space-y-3">
                              {items.length > 0 ? items.map(exp => {
                                const isSys = exp.source === 'payroll';
                                const canDel = isDeletable(exp.date) && !isSys && isAdmin;
                                const receiptIconData = getReceiptIcon(exp.receipt_url);

                                return (
                                  <div key={exp.id} className="flex flex-col gap-1 group">
                                    <div className="flex items-center gap-2">
                                      {exp.receipt_url ? (
                                        <span className={receiptIconData.color}>{receiptIconData.icon}</span>
                                      ) : (
                                        <span className="text-gray-400">
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                                        </span>
                                      )}
                                      <span className="text-xs font-bold text-slate-800">₹{parseFloat(exp.amount).toLocaleString('en-IN')}</span>
                                      <span className="text-[10px] text-muted">({new Date(exp.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})</span>
                                      
                                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {exp.receipt_url && (
                                          <a 
                                            href={`${import.meta.env.VITE_API_URL || ''}${exp.receipt_url}`} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="p-1 hover:text-[#E05A1E]"
                                            title="View receipt"
                                          >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                          </a>
                                        )}
                                        {exp.period_unlock_id ? (
                                           <span 
                                             className="text-amber-500 cursor-help flex items-center p-1" 
                                             title={`Backdated entry — entered ${new Date(exp.unlock_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} by ${exp.unlock_user || 'Admin'} (Reason: ${exp.unlock_reason})`}
                                           >
                                             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
                                           </span>
                                         ) : (closedMonths.has(`${new Date(exp.date).getMonth() + 1}-${new Date(exp.date).getFullYear()}`) && !unlockedMonths.has(`${new Date(exp.date).getMonth() + 1}-${new Date(exp.date).getFullYear()}`)) ? (
                                           <span 
                                             className="text-gray-400 cursor-help flex items-center p-1" 
                                             title={`${new Date(exp.date).toLocaleString('default', { month: 'long', year: 'numeric' })} is a closed period`}
                                           >
                                             <Lock size={10} />
                                           </span>
                                         ) : canDel ? (
                                           <button 
                                             onClick={() => handleDeleteExpense(exp.id, exp.date)} 
                                             className="p-1 hover:text-red-500"
                                             title="Delete transaction"
                                           >
                                             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                           </button>
                                         ) : (
                                           <span className="text-gray-300 flex items-center p-1" title={isSys ? "System Generated (Payroll)" : "Irreversible (15+ days)"}>
                                             <Lock size={10} />
                                           </span>
                                         )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] text-muted pl-5">
                                      {exp.creator_name && <span>by {exp.creator_name}</span>}
                                      {exp.creator_name && <span>•</span>}
                                      <span>{timeAgo(exp.created_at || exp.date)}</span>
                                      {exp.project_name && (
                                        <>
                                          <span>•</span>
                                          <span className="text-primary font-medium" title={`Tagged to Project: ${exp.project_name}`}>
                                            {exp.project_name}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              }) : <span className="text-[10px] text-slate-300 italic font-normal">No transactions</span>}
                            </div>
                          </td>
                          <td className="py-3 px-4 align-top">
                            <div className="space-y-3 pl-1">
                              {items.length > 0 ? items.map(exp => (
                                <div key={exp.id} className="text-[10px] text-slate-500 truncate h-8 flex items-center" title={exp.description || 'No remark'}>
                                  {exp.description || '-'}
                                </div>
                              )) : '-'}
                            </div>
                          </td>
                          <td className="py-3 px-4 align-top text-right text-xs font-mono text-slate-800 font-black">
                            <span className={auditedCategories[cat.toLowerCase()] ? "text-slate-800" : "text-gray-400 line-through decoration-red-400/50 mr-1"}>
                              ₹ {total.toLocaleString('en-IN')}
                            </span>
                            {!auditedCategories[cat.toLowerCase()] && total > 0 && (
                              <span className="text-[9px] font-bold text-amber-500 block mt-0.5 no-print">Pending Audit</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center align-top">
                            <div className="flex flex-col items-center justify-center gap-1 mt-0.5">
                              <input 
                                type="checkbox" 
                                checked={!!auditedCategories[cat.toLowerCase()]} 
                                onChange={() => toggleAudit(cat)} 
                                disabled={!isAdmin || isPeriodLocked}
                                className={`w-4 h-4 rounded border-gray-300 text-[#E05A1E] focus:ring-[#E05A1E] ${(!isAdmin || isPeriodLocked) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`} 
                              />
                              {auditedCategories[cat.toLowerCase()] && (
                                <CheckCircle2 size={12} className="text-emerald-500 animate-in zoom-in duration-200" />
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 font-bold border-t-2 border-[#EBEBEB]">
                    <tr>
                      <td className="py-3 px-4" colSpan={3}><div className="text-right text-[10px] uppercase text-muted">Grand Total</div></td>
                      <td className="py-3 px-4"></td>
                      <td className="py-3 px-4 text-right text-sm text-[#E05A1E] font-mono font-black">
                        ₹ {grandTotal.toLocaleString('en-IN')}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'payroll' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            {/* Period Lock Status Banner */}
            {closedMonths.has(`${selectedMonth}-${selectedYear}`) && (
              <div className={`p-4 rounded-xl border flex items-center justify-between shadow-sm no-print ${
                unlockedMonths.has(`${selectedMonth}-${selectedYear}`)
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}>
                <div className="flex items-center gap-3">
                  <span className="text-lg">{unlockedMonths.has(`${selectedMonth}-${selectedYear}`) ? '🔓' : '🔒'}</span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider">
                      Period Status: {unlockedMonths.has(`${selectedMonth}-${selectedYear}`) ? 'Temporary Unlocked' : 'Fully Locked'}
                    </p>
                    <p className="text-[10px] opacity-80 mt-0.5">
                      This month is closed. {unlockedMonths.has(`${selectedMonth}-${selectedYear}`) ? 'Authorized admins can make adjustments, but it should be re-locked after edits.' : 'Authorized admins must unlock the period to make any changes.'}
                    </p>
                  </div>
                </div>
                {isAdmin && (
                  <div>
                    {unlockedMonths.has(`${selectedMonth}-${selectedYear}`) ? (
                      <button 
                        onClick={() => handleRelockMonth(selectedMonth, selectedYear)}
                        className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm active:scale-[0.98]"
                      >
                        Re-lock Period
                      </button>
                    ) : (
                      <button 
                        onClick={() => {
                          setTargetUnlockMonth({ month: selectedMonth, year: selectedYear });
                          setShowUnlockModal(true);
                        }}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm active:scale-[0.98]"
                      >
                        Unlock Period
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* Payroll Header & Month Picker */}
            <div className="flex flex-col gap-6 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary/10 rounded-xl text-primary">
                    <CreditCard size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-gray-900 tracking-tight">Active Monthly Payroll</h2>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Processing salaries for all departments</p>
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-4 bg-gray-50 border border-gray-100 p-2.5 px-4 rounded-xl no-print">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Verify Category Audit:</span>
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={!!auditedCategories['salaries']}
                        disabled={isPeriodLocked}
                        onChange={() => toggleAudit('Salaries')}
                        className="w-4 h-4 rounded border-gray-300 text-[#E05A1E] focus:ring-[#E05A1E]"
                      />
                      Salaries
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={!!auditedCategories['incentives']}
                        disabled={isPeriodLocked}
                        onChange={() => toggleAudit('Incentives')}
                        className="w-4 h-4 rounded border-gray-300 text-[#E05A1E] focus:ring-[#E05A1E]"
                      />
                      Incentives
                    </label>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div className="flex bg-gray-100 p-1 rounded-xl mr-2 no-print">
                    <button 
                      onClick={() => setViewType('table')}
                      className={`p-1.5 rounded-lg transition-all ${viewType === 'table' ? 'bg-white shadow-sm text-primary' : 'text-gray-400 hover:text-gray-600'}`}
                      title="Table View"
                    >
                      <LayoutList size={18} />
                    </button>
                    <button 
                      onClick={() => setViewType('kanban')}
                      className={`p-1.5 rounded-lg transition-all ${viewType === 'kanban' ? 'bg-white shadow-sm text-primary' : 'text-gray-400 hover:text-gray-600'}`}
                      title="Kanban View"
                    >
                      <LayoutDashboard size={18} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 px-3 py-2 rounded-xl no-print">
                    <Calendar size={16} className="text-gray-400" />
                    <select 
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                      className="bg-transparent text-sm font-bold outline-none cursor-pointer"
                    >
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>
                      ))}
                    </select>
                    <select 
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                      className="bg-transparent text-sm font-bold outline-none cursor-pointer border-l border-gray-200 pl-2"
                    >
                      {[2024, 2025, 2026].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                  <button 
                    onClick={() => window.print()}
                    className="flex items-center gap-2 px-3.5 py-2 bg-primary hover:bg-primary/95 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm shadow-primary/20 no-print"
                  >
                    <Download size={14} />
                    Export PDF
                  </button>
                </div>
              </div>

              {/* Search & Progress Bar */}
              <div className="flex flex-col md:flex-row items-center gap-6 pt-4 border-t border-gray-50 no-print">
                <div className="relative flex-1 group w-full">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary transition-colors" />
                  <input 
                    type="text"
                    placeholder="Search by name or department..."
                    value={filters.payrollSearch || ''}
                    onChange={(e) => setFilters({...filters, payrollSearch: e.target.value})}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl pl-11 pr-4 py-3 text-sm outline-none focus:bg-white focus:border-primary/30 transition-all shadow-inner"
                  />
                </div>

                <div className="flex-1 w-full space-y-2">
                  <div className="flex justify-between items-end">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Disbursement Progress</p>
                    <p className="text-xs font-black text-primary font-mono">{payrollHistory.length} / {employees.length}</p>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden shadow-inner">
                    <div 
                      className="h-full bg-primary transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(224,90,30,0.3)]"
                      style={{ width: `${(payrollHistory.length / (employees.length || 1)) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Payroll Report Actions */}
                <div className="flex items-center gap-2 no-print">
                  <button
                    onClick={() => setShowPayrollReportModal(true)}
                    disabled={employees.length === 0}
                    className="btn-secondary py-2 px-3 text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                    title="Preview Payroll Accounting Report"
                  >
                    <FileText size={14} className="text-primary" />
                    <span>View Report</span>
                  </button>
                  <button
                    onClick={handleExportPayrollPDF}
                    disabled={employees.length === 0 || isExportingPayrollPdf}
                    className="btn-primary py-2 px-3.5 text-xs font-bold shadow-sm flex items-center gap-2 transition-all disabled:opacity-50"
                    title="Export Payroll PDF Report"
                  >
                    {isExportingPayrollPdf ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Exporting PDF...</span>
                      </>
                    ) : (
                      <>
                        <Download size={14} />
                        <span>Export PDF Report</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {viewType === 'kanban' ? (
              /* Kanban View */
              <>
                <div className="flex flex-col bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden shadow-inner max-w-2xl mx-auto w-full h-[calc(100vh-420px)] no-print">
                  <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">Pending Payment</h3>
                    </div>
                    <span className="px-2 py-0.5 bg-slate-100 rounded-full text-[10px] font-bold text-slate-400 border border-slate-200">
                      {employees.filter(emp => !payrollHistory.some(p => p.user_id === emp.id)).length}
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                    {employees
                      .filter(emp => !payrollHistory.some(p => p.user_id === emp.id))
                      .filter(emp => {
                        const search = (filters.payrollSearch || '').toLowerCase();
                        return emp.name.toLowerCase().includes(search) || emp.department.toLowerCase().includes(search);
                      })
                      .map(emp => (
                      <div 
                        key={emp.id}
                        className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-primary/50 hover:shadow-md transition-all group"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-black text-gray-900">{emp.name}</p>
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${emp.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                {emp.role}
                              </span>
                            </div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{emp.department}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-black text-primary font-mono">₹{Number(emp.current_net_payable !== undefined ? emp.current_net_payable : (emp.net_salary_payable !== undefined ? emp.net_salary_payable : (emp.suggested_salary || 0))).toLocaleString('en-IN')}</p>
                            <p className="text-[8px] font-bold text-gray-400 uppercase">Net Payable</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-4">
                          <div className="bg-emerald-50/50 p-2 rounded-lg border border-emerald-100/50 text-center">
                            <p className="text-[8px] font-bold text-emerald-600 uppercase tracking-tighter">Present</p>
                            <p className="text-xs font-black text-emerald-700">{emp.total_present || 0}d</p>
                          </div>
                          <div className="bg-rose-50/50 p-2 rounded-lg border border-rose-100/50 text-center">
                            <p className="text-[8px] font-bold text-rose-600 uppercase tracking-tighter">Absent</p>
                            <p className="text-xs font-black text-rose-700">{emp.total_absent || 0}d</p>
                          </div>
                          <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 text-center">
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Base Sal.</p>
                            <p className="text-[10px] font-black text-slate-700">
                              ₹{parseFloat(emp.base_salary || 0).toLocaleString('en-IN')}
                            </p>
                          </div>
                          <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 text-center">
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Work</p>
                            <p className="text-xs font-black text-slate-700">{emp.payable_days || 0}d</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => handleProcessPayroll(emp)}
                          className="w-full py-2 bg-primary/5 hover:bg-primary text-primary hover:text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all group-hover:scale-[1.02]"
                        >
                          Process Payment
                        </button>
                      </div>
                    ))}
                    {employees.filter(emp => !payrollHistory.some(p => p.user_id === emp.id)).length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center text-slate-300 py-12">
                        <CheckCircle2 size={40} className="opacity-20 mb-3" />
                        <p className="text-xs font-bold italic">All salaries processed!</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/50 border-b border-gray-100">
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px]">Employee / Role</th>
                        <th className="px-6 py-4 font-bold text-emerald-700 uppercase tracking-tighter text-[11px] text-center bg-emerald-50/10">Present</th>
                        <th className="px-6 py-4 font-bold text-rose-700 uppercase tracking-tighter text-[11px] text-center bg-rose-50/10 border-r border-gray-200">Absent</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-center">Full Days</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-center">Half Days</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-center">Sundays</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-center border-r border-gray-200">Holidays</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-center border-r border-gray-200">Leaves</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-center">Late</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-right">Base / Hourly</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-center border-r border-gray-200">Hours</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-right">Incentives</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-right">Net Payable</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-center">Paid Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {employees
                        .filter(emp => {
                          const search = (filters.payrollSearch || '').toLowerCase();
                          return emp.name.toLowerCase().includes(search) || emp.department.toLowerCase().includes(search);
                        })
                        .map(emp => {
                        const processed = payrollHistory.find(p => p.user_id === emp.id);
                        return (
                          <tr key={emp.id} className={`hover:bg-gray-50/80 transition-colors group/row ${processed ? 'bg-emerald-50/10' : ''}`}>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="font-bold text-gray-900">{emp.name}</div>
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${emp.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                  {emp.role}
                                </span>
                              </div>
                              <div className="text-[10px] text-gray-400 font-bold uppercase">{emp.department}</div>
                            </td>
                            <td className="px-6 py-4 text-center bg-emerald-50/5" title={`${emp.full_days_worked || 0} Full Days + ${emp.half_days_worked || 0} Half Days (Physical Attendance)`}>
                              <span className="font-bold text-emerald-700">{emp.total_present || 0}</span>
                              <span className="text-[9px] text-gray-400 font-bold ml-0.5">d</span>
                            </td>
                            <td className="px-6 py-4 text-center bg-rose-50/5 border-r border-gray-200">
                              <span className="font-bold text-rose-700">{emp.total_absent || 0}</span>
                              <span className="text-[9px] text-gray-400 font-bold ml-0.5">d</span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className="font-bold text-gray-800">{emp.full_days_worked || 0}</span>
                              <span className="text-[9px] text-gray-400 font-bold ml-1">/ {emp.total_days}</span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`font-bold ${emp.half_days_worked > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                                {emp.half_days_worked || 0}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center text-gray-500 text-xs font-semibold">
                              <span>{emp.sundays_count || 0}</span>
                            </td>
                            <td className="px-6 py-4 text-center text-gray-500 text-xs font-semibold border-r border-gray-200">
                              <span>{emp.holidays_count || 0}</span>
                            </td>
                            <td className="px-6 py-4 text-center border-r border-gray-200">
                              <span className={`font-bold ${emp.leaves_count > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                {emp.leaves_count || 0}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <div className="flex flex-col items-center">
                                <span className={`font-bold ${emp.late_count > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                                  {emp.late_count || 0}
                                </span>
                                {emp.late_penalty_days > 0 && (
                                  <span className="text-[9px] font-black text-red-400">-{emp.late_penalty_days}d</span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center gap-1 font-mono text-xs font-bold text-gray-600">
                                  <span>₹{parseFloat(emp.base_salary).toLocaleString('en-IN')}</span>
                                  {isAdmin && !isPeriodLocked && (
                                    <button 
                                      onClick={async () => {
                                        const newSal = prompt('Enter new base salary:', emp.base_salary);
                                        if (newSal !== null) {
                                          try {
                                            await api.put(`/accounting/payroll/employees/${emp.id}`, { 
                                              base_salary: parseFloat(newSal),
                                              month: selectedMonth,
                                              year: selectedYear
                                            });
                                            toast.success('Salary updated');
                                            fetchPayrollData();
                                          } catch (err) {
                                            toast.error('Update failed');
                                          }
                                        }
                                      }}
                                      className="text-gray-300 hover:text-primary opacity-0 group-hover/row:opacity-100 transition-opacity no-print"
                                    >
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                    </button>
                                  )}
                                  {isAccounts && !isAdmin && (
                                    <span title="Only Admin can edit base salary" className="text-gray-300 cursor-not-allowed opacity-0 group-hover/row:opacity-100 transition-opacity no-print">
                                      <Lock size={9} />
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 font-mono text-[10px] font-bold text-primary italic" title="Auto-computed: Base / (30 × batch hours)">
                                  <span>₹{parseFloat(emp.hourly_rate || 0).toLocaleString('en-IN')}/hr</span>
                                  <span className="text-[8px] text-gray-400 font-sans not-italic">(auto)</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center border-r border-gray-200">
                              <span className={`font-bold ${emp.total_hours > 0 ? 'text-primary' : 'text-gray-400'}`}>
                                {emp.total_hours ? Number(emp.total_hours).toFixed(2) : 0}h
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              {processed ? (
                                <div className="flex items-center justify-end gap-1 font-mono text-xs font-bold text-gray-600">
                                  <span>₹{parseFloat(processed.incentives).toLocaleString('en-IN')}</span>
                                  {isAdmin && !isPeriodLocked && (
                                    <button 
                                      onClick={async () => {
                                        const newInc = prompt('Enter new incentives amount:', processed.incentives);
                                        if (newInc !== null) {
                                          try {
                                            await api.put(`/accounting/payroll/employees/${emp.id}`, { 
                                              incentives: parseFloat(newInc) || 0,
                                              month: selectedMonth,
                                              year: selectedYear
                                            });
                                            toast.success('Incentives updated');
                                            fetchPayrollData();
                                          } catch (err) {
                                            toast.error('Update failed');
                                          }
                                        }
                                      }}
                                      className="text-gray-300 hover:text-primary opacity-0 group-hover/row:opacity-100 transition-opacity no-print"
                                      title="Edit incentives"
                                    >
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <input 
                                  type="number"
                                  placeholder="Incentive"
                                  value={rowIncentives[emp.id] || ''}
                                  disabled={isPeriodLocked}
                                  onChange={(e) => setRowIncentives({...rowIncentives, [emp.id]: e.target.value})}
                                  className="w-20 bg-gray-50 border border-gray-200 rounded px-2 py-1 text-xs text-right outline-none focus:border-primary transition-all font-mono"
                                />
                              )}
                            </td>
                            <td className="px-6 py-4 text-right font-black font-mono relative">
                              <div className="text-gray-900">
                                ₹{Number(processed ? processed.net_paid : ((emp.current_net_payable !== undefined ? emp.current_net_payable : (emp.net_salary_payable !== undefined ? emp.net_salary_payable : emp.suggested_salary)) + parseFloat(rowIncentives[emp.id] || 0))).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                              
                              {/* Breakdown Tooltip */}
                              <div className="absolute bottom-full right-0 mb-2 w-52 bg-gray-900 text-white rounded-xl p-3 shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-50 transform translate-y-2 group-hover:translate-y-0">
                                <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 border-b border-gray-700 pb-1">Salary Breakdown</div>
                                <div className="space-y-1.5">
                                  <div className="flex justify-between text-[11px]">
                                    <span className="text-gray-400">Full Days:</span>
                                    <span className="font-bold">{emp.full_days}</span>
                                  </div>
                                  <div className="flex justify-between text-[11px]">
                                    <span className="text-gray-400">Half Days:</span>
                                    <span className="font-bold text-orange-400">{emp.half_days * 0.5}d</span>
                                  </div>
                                  <div className="flex justify-between text-[11px]">
                                    <span className="text-gray-400">Late Penalty:</span>
                                    <span className="font-bold text-red-400">-{emp.late_penalty_days}d</span>
                                  </div>
                                  <div className="flex justify-between text-[11px] pt-1 border-t border-gray-700 mt-1 font-black">
                                    <span>Payable Days:</span>
                                    <span className="text-primary">{emp.payable_days}d</span>
                                  </div>
                                  <div className="flex justify-between text-[11px] pt-1 border-t border-gray-700 mt-1">
                                    <span className="text-gray-400">Accrued:</span>
                                    <span className="font-bold text-emerald-400">₹{Number(emp.accrued_earnings_to_date || 0).toLocaleString('en-IN')}</span>
                                  </div>
                                  <div className="flex justify-between text-[11px]">
                                    <span className="text-gray-400">Deductions:</span>
                                    <span className="font-bold text-red-400">-₹{Number(emp.deductions || 0).toLocaleString('en-IN')}</span>
                                  </div>
                                  {emp.is_month_in_progress && emp.projected_month_end_net && (
                                    <div className="flex justify-between text-[11px] pt-1 border-t border-gray-700 mt-1">
                                      <span className="text-gray-400 text-[9px]">Projected:</span>
                                      <span className="font-bold text-slate-300 text-[9px]">₹{Number(emp.projected_month_end_net).toLocaleString('en-IN')}</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between text-[11px] pt-1 border-t border-gray-700 mt-1">
                                    <span className="text-gray-400 italic text-[9px]">
                                      Base: ₹{parseFloat(emp.base_salary || 0).toLocaleString('en-IN')}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <div className="flex items-center justify-center">
                                {processed ? (
                                  <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1.5 text-emerald-600">
                                      <CheckCircle2 size={16} />
                                      <span className="text-[10px] font-black uppercase tracking-widest">Paid</span>
                                    </div>
                                    {isAdmin && !isPeriodLocked && (
                                      <button 
                                        onClick={() => handleReversePayroll(processed.id, emp.name)}
                                        className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors no-print"
                                        title="Reverse / delete payroll record"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 print-only hidden">Pending</span>
                                    <label className="relative inline-flex items-center cursor-pointer group/check no-print">
                                      <input 
                                        type="checkbox"
                                        className="sr-only"
                                        disabled={isProcessing[emp.id] || isPeriodLocked}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            handleProcessPayroll(emp, rowIncentives[emp.id] || '0');
                                          }
                                        }}
                                      />
                                      <div className={`w-5 h-5 border-2 rounded transition-all flex items-center justify-center ${isProcessing[emp.id] ? 'border-gray-200 bg-gray-50' : 'border-gray-300 group-hover/check:border-primary bg-white'}`}>
                                        {isProcessing[emp.id] ? (
                                          <div className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                        ) : (
                                          <div className="w-2.5 h-2.5 bg-primary rounded-sm opacity-0 transform scale-50 transition-all peer-checked:opacity-100 peer-checked:scale-100" />
                                        )}
                                      </div>
                                      <span className="ml-2 text-[10px] font-bold text-gray-400 group-hover/check:text-primary transition-colors">Mark Paid</span>
                                    </label>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Salary History Section Below */}
            <div className="mt-12 pt-8 border-t border-gray-100 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                    <Clock size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-gray-900">Recent Disbursements</h3>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Payment history for {new Date(0, selectedMonth - 1).toLocaleString('default', { month: 'long' })} {selectedYear}</p>
                  </div>
                </div>
                <div className="px-3 py-1 bg-emerald-50 rounded-full text-[10px] font-black text-emerald-600 border border-emerald-100">
                  Total Paid: {payrollHistory.length}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/50 border-b border-gray-100">
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px]">Employee</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-center">Paid Date</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-right">Base Salary</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-right">Incentive</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-right font-black">Net Paid</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-center">Reference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {payrollHistory
                        .filter(record => {
                          const search = (filters.payrollSearch || '').toLowerCase();
                          return record.name.toLowerCase().includes(search) || record.department.toLowerCase().includes(search);
                        })
                        .map(record => (
                        <tr key={record.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <p className="font-bold text-gray-900">{record.name}</p>
                            <p className="text-[10px] font-bold text-gray-400 uppercase">{record.department}</p>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="text-xs font-bold text-gray-600">{new Date(record.payment_date).toLocaleDateString()}</span>
                          </td>
                          <td className="px-6 py-4 text-right font-mono text-xs font-bold text-gray-600">
                            ₹{parseFloat(record.base_salary).toLocaleString('en-IN')}
                          </td>
                          <td className="px-6 py-4 text-right font-mono text-xs font-bold text-purple-600">
                            +₹{parseFloat(record.incentives).toLocaleString('en-IN')}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="font-black text-emerald-600 font-mono">₹{(record.net_paid || 0).toLocaleString('en-IN')}</span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-black uppercase tracking-widest">Completed</span>
                          </td>
                        </tr>
                      ))}
                      {payrollHistory.length === 0 && (
                        <tr>
                          <td colSpan="6" className="px-6 py-12 text-center text-gray-400 italic text-xs">
                            No disbursements recorded for this month yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'expenses' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                  <TrendingUp size={18} className="text-emerald-500" />
                  Recent Expense History
                </h3>
                <p className="text-[10px] font-bold text-gray-400 italic">Records older than 15 days are locked for auditing integrity</p>
              </div>
              <div className="flex items-center gap-2 no-print">
                <button
                  onClick={() => setShowExpensesReportModal(true)}
                  disabled={expenses.length === 0}
                  className="btn-secondary py-1.5 px-3 text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                  title="Preview Expenses Audit Statement"
                >
                  <FileText size={14} className="text-primary" />
                  <span>View Report</span>
                </button>
                <button
                  onClick={handleExportExpensesPDF}
                  disabled={expenses.length === 0 || isExportingExpensesPdf}
                  className="btn-primary py-1.5 px-3.5 text-xs font-bold shadow-sm flex items-center gap-2 transition-all disabled:opacity-50"
                  title="Export Expenses PDF Report"
                >
                  {isExportingExpensesPdf ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Exporting PDF...</span>
                    </>
                  ) : (
                    <>
                      <Download size={14} />
                      <span>Export PDF Report</span>
                    </>
                  )}
                </button>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/30">
                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Date</th>
                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Category</th>
                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Description</th>
                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Amount</th>
                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {expenses.slice().sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 20).map(exp => (
                    <tr key={exp.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 text-xs font-medium text-gray-500">
                        {new Date(exp.date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-[9px] font-black uppercase tracking-widest">
                          {exp.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-600 italic">
                        {exp.description || '-'}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-xs font-black text-gray-900">
                        ₹{parseFloat(exp.amount).toLocaleString('en-IN')}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {exp.period_unlock_id ? (
                          <div 
                            className="flex items-center justify-center gap-1.5 text-amber-500 cursor-help"
                            title={`Backdated entry — entered ${new Date(exp.unlock_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} by ${exp.unlock_user || 'Admin'} (Reason: ${exp.unlock_reason})`}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
                            <span className="text-[9px] font-black uppercase tracking-wider">Backdated</span>
                          </div>
                        ) : (closedMonths.has(`${new Date(exp.date).getMonth() + 1}-${new Date(exp.date).getFullYear()}`) && !unlockedMonths.has(`${new Date(exp.date).getMonth() + 1}-${new Date(exp.date).getFullYear()}`)) ? (
                          <div 
                            className="flex items-center justify-center gap-1.5 text-gray-400 cursor-help"
                            title={`${new Date(exp.date).toLocaleString('default', { month: 'long', year: 'numeric' })} is a closed period`}
                          >
                            <Lock size={12} />
                            <span className="text-[9px] font-black uppercase tracking-wider">Closed</span>
                          </div>
                        ) : isDeletable(exp.date) && exp.source !== 'payroll' && isAdmin ? (
                          <div className="flex items-center justify-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="Editable" />
                            <button 
                              onClick={() => handleDeleteExpense(exp.id, exp.date)}
                              className="text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-2 text-gray-400">
                            <Lock size={12} className={exp.source === 'payroll' ? 'text-blue-400' : ''} />
                            <span className="text-[9px] font-bold uppercase">{exp.source === 'payroll' ? 'Payroll' : 'Locked'}</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {expenses.length === 0 && (
                    <tr>
                      <td colSpan="5" className="px-6 py-12 text-center text-gray-400 italic text-sm">
                        No recent history available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'invoices' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <Receipt size={18} className="text-primary" />
                Invoice History
              </h3>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex bg-gray-100 p-1 rounded-xl shadow-inner">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'received', label: 'Received' },
                    { id: 'pending', label: 'Pending' }
                  ].map((filter) => (
                    <button
                      key={filter.id}
                      onClick={() => setInvoiceFilter(filter.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${
                        invoiceFilter === filter.id
                          ? 'bg-white shadow-sm text-primary'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
                <span className="badge badge-in-progress bg-gray-100 text-gray-700">{filteredInvoicesList.length} Invoices</span>
              </div>
            </div>

            {/* Invoices Tab Export & Action Row */}
            <div className="px-4 py-3 bg-slate-50 border-b border-gray-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 flex-1">
                <div className="relative w-full sm:w-72">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Filter by invoice no, client, or project..."
                    value={invoiceSearchQuery}
                    onChange={(e) => setInvoiceSearchQuery(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-lg pl-8 pr-7 py-1.5 text-xs text-gray-800 placeholder-gray-400 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 shadow-2xs"
                  />
                  {invoiceSearchQuery && (
                    <button
                      onClick={() => setInvoiceSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className="hidden lg:flex items-center gap-2 text-[11px] font-semibold text-gray-600 bg-white border border-gray-200 px-3 py-1.5 rounded-lg shadow-2xs">
                  <span>Total: <strong className="text-gray-900 font-mono">₹{invoiceTotalsBreakdown.grand.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</strong></span>
                  <span className="text-gray-300">|</span>
                  <span>Received: <strong className="text-emerald-600 font-mono">₹{filteredInvoicesList.reduce((sum, i) => sum + parseFloat(i.received_amount || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</strong></span>
                  <span className="text-gray-300">|</span>
                  <span>Pending: <strong className="text-orange-600 font-mono">₹{filteredInvoicesList.reduce((sum, i) => sum + parseFloat(i.pending_amount || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</strong></span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowInvoiceReportModal(true)}
                  disabled={filteredInvoicesList.length === 0}
                  className="btn-secondary py-1.5 px-3 text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                  title="Preview formatted Invoice Accounting Report layout"
                >
                  <FileText size={14} className="text-primary" />
                  <span>View Report</span>
                </button>
                <button
                  onClick={handleExportInvoicesPDF}
                  disabled={filteredInvoicesList.length === 0 || isExportingInvoicesPdf}
                  className="btn-primary py-1.5 px-3.5 text-xs font-bold shadow-sm flex items-center gap-2 transition-all disabled:opacity-50"
                  title="Export PDF Report of currently filtered Invoices"
                >
                  {isExportingInvoicesPdf ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Exporting PDF...</span>
                    </>
                  ) : (
                    <>
                      <Download size={14} />
                      <span>Export PDF Report</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {unbilledStages.length > 0 && (
              <div className="bg-amber-50 border-b border-amber-200 p-4 flex items-start gap-3">
                <span className="text-amber-500 text-lg mt-0.5">⚠️</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-amber-800">
                    {unbilledStages.length} milestone(s) are initiated but not yet billed
                  </p>
                  <p className="text-[10px] text-amber-700 mt-0.5">
                    Unbilled value: ₹{unbilledTotal.toLocaleString('en-IN')} —
                    Navigate to the project's details or select it to generate invoices for them.
                  </p>
                </div>
              </div>
            )}
            
            <div className="overflow-x-auto" style={{ scrollbarWidth: 'auto', scrollbarColor: '#9AA3B0 #E8EBF0' }}>
              <table className="w-full text-left border-collapse" style={{ minWidth: '900px' }}>
                <thead>
                  <tr className="bg-gray-50/30">
                    <th className="px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest w-10">S.No.</th>
                    <th className="px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Invoice No</th>
                    <th className="px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Client</th>
                    <th className="px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Project</th>
                    <th className="px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Date / Due Date</th>
                    <th className="px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Principal</th>
                    <th className="px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">GST</th>
                    <th className="px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">TDS</th>
                    <th className="px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Total Amount</th>
                    <th className="px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Received</th>
                    <th className="px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Pending</th>
                    <th className="px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Status</th>
                    <th className="px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loadingInvoices ? (
                    <tr>
                      <td colSpan="13" className="px-2 py-12 text-center">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <div className="w-8 h-8 border-2 border-[#E05A1E] border-t-transparent rounded-full animate-spin" />
                          <p className="text-gray-400 text-xs italic">Loading invoice history...</p>
                        </div>
                      </td>
                    </tr>
                  ) : filteredInvoicesList.map((inv, index) => {
                    const statusColors = {
                      paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                      generated: 'bg-sky-50 text-sky-700 border-sky-200',
                      sent: 'bg-indigo-50 text-indigo-700 border-indigo-200',
                      draft: 'bg-gray-50 text-gray-600 border-gray-200',
                      cancelled: 'bg-red-50 text-red-700 border-red-200'
                    };
                    const statusColor = inv.is_payment_stage
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : (statusColors[inv.status] || 'bg-gray-50 text-gray-600 border-gray-200');
                    const amount = parseFloat(inv.amount || 0);
                    let principal = amount;
                    let gst = 0;

                      if (!inv.is_payment_stage) {
                        const taxDetails = inv.tax_details || {};
                        const isGstEnabled = taxDetails.isGstEnabled !== false;

                        if (isGstEnabled) {
                          const cgstPercent = parseFloat(taxDetails.cgstPercent ?? 9);
                          const sgstPercent = parseFloat(taxDetails.sgstPercent ?? 9);
                          const igstPercent = parseFloat(taxDetails.igstPercent ?? 18);
                          const isIgst = !!taxDetails.isIgst;
                          const totalTaxPercent = isIgst ? igstPercent : (cgstPercent + sgstPercent);

                          if (totalTaxPercent > 0) {
                            principal = amount / (1 + totalTaxPercent / 100);
                            gst = amount - principal;
                          }
                        }
                      }

                      return (
                        <tr key={inv.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-3 py-3 text-xs font-semibold text-gray-500">
                            {index + 1}
                          </td>
                          <td className="px-3 py-3">
                            <span className="font-mono font-bold text-xs text-[#E05A1E]">
                              {inv.invoice_no}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-xs font-semibold text-gray-700">
                            {inv.client_name_full || inv.client_name || '-'}
                          </td>
                          <td className="px-3 py-3">
                            {inv.project_name ? (
                              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 text-[9px] font-black uppercase tracking-wider rounded">
                                 {inv.project_name}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs italic">No Project</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                            <div className="flex flex-col gap-0.5">
                              <span>{inv.is_payment_stage ? 'Initiated' : 'Issued'}: {new Date(inv.date).toLocaleDateString()}</span>
                              {!inv.is_payment_stage && inv.due_date && <span className="text-[10px] text-gray-400">Due: {new Date(inv.due_date).toLocaleDateString()}</span>}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-xs font-semibold text-gray-600 whitespace-nowrap">
                            ₹{principal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-xs font-semibold text-gray-500 whitespace-nowrap">
                            ₹{gst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-xs font-semibold text-red-500 whitespace-nowrap">
                            ₹{parseFloat(inv.tax_details?.tdsAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-xs font-bold text-gray-900 whitespace-nowrap">
                            ₹{amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-xs font-bold text-emerald-600 whitespace-nowrap">
                            ₹{parseFloat(inv.received_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-xs font-bold text-orange-600 whitespace-nowrap">
                            ₹{parseFloat(inv.pending_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          <span className={`inline-block px-1.5 py-0.5 border rounded-full text-[9px] font-bold uppercase tracking-wider ${statusColor}`}>
                            {inv.is_payment_stage ? 'Payment Stage' : inv.status}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                            {inv.is_payment_stage ? (
                              ['bill generated', 'bill delivered', 'paid'].includes(inv.stage_status?.toLowerCase()) ? (
                                <button
                                  disabled
                                  className="px-1.5 py-1 bg-gray-100 text-gray-400 border border-gray-200 rounded-lg text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 cursor-not-allowed"
                                  title="Bill already generated for this payment stage"
                                >
                                  <Lock size={10} />
                                  Billed
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleGenerateBillFromStage(inv)}
                                  className="px-1.5 py-1 bg-orange-50 hover:bg-orange-100 text-primary border border-orange-200 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all flex items-center gap-1"
                                  title="Generate Invoice from this Payment Stage"
                                >
                                  <Plus size={10} />
                                  Bill Stage
                                </button>
                              )
                            ) : (
                              <>
                                {inv.status !== 'paid' && inv.project_id && (
                                  <>
                                    <button
                                      onClick={() => {
                                        setSelectedInvoiceForPayment(inv);
                                        setShowPaymentModal(true);
                                      }}
                                      className="px-1.5 py-1 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all flex items-center gap-1"
                                      title="Record Partial Payment"
                                    >
                                      <CreditCard size={10} />
                                      Pay
                                    </button>
                                    <button
                                      onClick={() => handleMarkPaid(inv.id)}
                                      className="px-1.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all flex items-center gap-1"
                                      title="Mark as Paid"
                                    >
                                      <CheckCircle2 size={10} />
                                      Paid
                                    </button>
                                  </>
                                )}
                                <a
                                  href={`/admin/invoice?invoice_id=${inv.id}`}
                                  className="px-1.5 py-1 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all flex items-center gap-1"
                                  title="View / Print Invoice"
                                >
                                  <FileText size={10} />
                                  View
                                </a>
                                {isAdmin && (
                                  <button
                                    onClick={() => handleDeleteInvoice(inv.id, inv.invoice_no)}
                                    className="px-1.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all flex items-center gap-1"
                                    title="Delete Invoice"
                                  >
                                    <Trash2 size={10} />
                                    Delete
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!loadingInvoices && filteredInvoicesList.length === 0 && (
                    <tr>
                      <td colSpan="13" className="px-2 py-12 text-center text-gray-400 italic text-sm">
                        {invoiceFilter === 'received' ? 'No received or partially paid invoices found.' : 
                         invoiceFilter === 'pending' ? 'No pending invoices found.' : 
                         'No invoice history available. Use the Invoice Editor to create new invoices.'}
                      </td>
                    </tr>
                  )}
                </tbody>
                {filteredInvoicesList.length > 0 && (
                  <tfoot className="bg-gray-50/85 font-bold border-t-2 border-gray-200">
                    <tr className="border-b border-gray-100/50">
                      <td className="px-3 py-3 text-xs font-bold text-gray-500 uppercase" colSpan={5}>
                        <div className="flex items-center gap-4">
                          <span>Total of {filteredInvoicesList.length} {filteredInvoicesList.length === 1 ? 'Invoice' : 'Invoices'}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs font-bold text-gray-700">
                        ₹{invoiceTotalsBreakdown.principal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs font-bold text-gray-600">
                        ₹{invoiceTotalsBreakdown.gst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs font-bold text-red-600">
                        ₹{invoiceTotalsBreakdown.tds.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs font-bold text-[#E05A1E]">
                        ₹{invoiceTotalsBreakdown.grand.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs font-bold text-emerald-600">
                        ₹{filteredInvoicesList.reduce((sum, i) => sum + parseFloat(i.received_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs font-bold text-orange-600">
                        ₹{filteredInvoicesList.reduce((sum, i) => sum + parseFloat(i.pending_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* Month Close Tab */}
        {activeTab === 'month-close' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 gap-6">
              {/* Checklist & Close Panel */}
              <div className="space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
                    <div className="flex items-center gap-2">
                      <Calendar size={18} className="text-primary" />
                      <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Pre-Close Checklist & Verification</h3>
                    </div>
                    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1">
                      <select 
                        value={selectedMonth} 
                        onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                        className="text-xs font-bold bg-transparent outline-none cursor-pointer text-gray-800"
                      >
                        {Array.from({ length: 12 }, (_, i) => (
                          <option key={i+1} value={i+1}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>
                        ))}
                      </select>
                      <select 
                        value={selectedYear} 
                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                        className="text-xs font-bold bg-transparent outline-none cursor-pointer border-l pl-2 text-gray-800"
                      >
                        {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="p-6">
                    {preflightLoading || !preflight ? (
                      <div className="flex flex-col items-center justify-center py-12 gap-3">
                        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <p className="text-gray-400 text-xs italic">Running diagnostic checks for {new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}...</p>
                      </div>
                    ) : preflight?.already_closed ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                        <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center shadow-inner">
                          <Lock size={32} />
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-bold text-gray-900 text-base">{preflight.month_label} is Closed</h4>
                          <p className="text-xs text-muted max-w-md mx-auto">Financial transactions and expense reporting are locked for this period. Authorized administrators can unlock the period if backdated edits are required.</p>
                        </div>
                        {closedMonths.has(`${selectedMonth}-${selectedYear}`) && (
                          <div className="inline-flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-xs font-bold text-gray-700">
                            {unlockedMonths.has(`${selectedMonth}-${selectedYear}`) ? (
                              <>
                                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                                🔓 Unlocked (Active Window open)
                              </>
                            ) : (
                              <>
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                                🔒 Fully Locked & Archived
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* Pre-flight Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Income Received</p>
                            <h4 className="text-base font-bold text-gray-800 mt-1">₹{(preflight?.financials?.received_income || 0).toLocaleString('en-IN')}</h4>
                            <span className="text-[9px] text-muted italic">Total recorded this month</span>
                          </div>
                          <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Expenses</p>
                            <h4 className="text-base font-bold text-red-500 mt-1">₹{(preflight?.financials?.total_expense || 0).toLocaleString('en-IN')}</h4>
                            <span className="text-[9px] text-muted italic">Overheads + Salaries (Excl. Vendors)</span>
                          </div>
                          <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Net Realized P&L</p>
                            <h4 className={`text-base font-bold mt-1 ${(preflight?.financials?.net_pl || 0) >= 0 ? 'text-[#E05A1E]' : 'text-red-600'}`}>
                              ₹{(preflight?.financials?.net_pl || 0).toLocaleString('en-IN')}
                            </h4>
                            <span className="text-[9px] text-muted italic">Received - Expenses</span>
                          </div>
                        </div>

                        {/* Checklist Details */}
                        <div className="border border-[#EBEBEB] rounded-xl overflow-hidden divide-y divide-gray-100 bg-white shadow-sm">
                          {/* Item 1: Income & Expenses Verification */}
                          <div className="p-4 flex items-center justify-between">
                            <div className="flex items-start gap-3">
                              <span className="text-emerald-500 text-lg">✅</span>
                              <div>
                                <h5 className="text-xs font-bold text-gray-800">Financial Ledger Sync</h5>
                                <p className="text-[10px] text-muted mt-0.5">All income transactions and office expense records loaded.</p>
                              </div>
                            </div>
                            <span className="badge bg-emerald-50 text-emerald-700 border-emerald-100 text-[10px] font-black uppercase tracking-wider">Ready</span>
                          </div>

                          {/* Item 2: Expense Audits */}
                          <div className="p-4 flex items-center justify-between">
                            <div className="flex items-start gap-3">
                              {preflight?.expense_audit?.categories_to_lock === 0 ? (
                                <span className="text-emerald-500 text-lg">✅</span>
                              ) : (
                                <span className="text-amber-500 text-lg">⚠️</span>
                              )}
                              <div>
                                <h5 className="text-xs font-bold text-gray-800">Expense Category Verification</h5>
                                <p className="text-[10px] text-muted mt-0.5">
                                  {preflight?.expense_audit?.already_locked} categories audited. {preflight?.expense_audit?.categories_to_lock} pending review.
                                </p>
                              </div>
                            </div>
                            <span className={`badge ${preflight?.expense_audit?.categories_to_lock === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'} text-[10px] font-black uppercase tracking-wider`}>
                              {preflight?.expense_audit?.categories_to_lock === 0 ? 'Fully Audited' : `${preflight?.expense_audit?.categories_to_lock} Pending`}
                            </span>
                          </div>

                          {/* Item 3: Leave Entries */}
                          <div className="p-4 flex items-center justify-between">
                            <div className="flex items-start gap-3">
                              <span className="text-emerald-500 text-lg">✅</span>
                              <div>
                                <h5 className="text-xs font-bold text-gray-800">HR Leave Accumulation</h5>
                                <p className="text-[10px] text-muted mt-0.5">
                                  {preflight?.leave?.entries_to_write} active employees mapped. {preflight?.leave?.total_leave_days_this_month} leave days recorded.
                                </p>
                              </div>
                            </div>
                            <span className="badge bg-emerald-50 text-emerald-700 border-emerald-100 text-[10px] font-black uppercase tracking-wider">Accumulating (1.5/mo)</span>
                          </div>

                          {/* Item 4: Payroll Audit */}
                          <div className="p-4 flex items-start justify-between flex-wrap gap-4">
                            <div className="flex items-start gap-3">
                              {preflight?.payroll?.employees_pending === 0 ? (
                                <span className="text-emerald-500 text-lg">✅</span>
                              ) : (
                                <span className="text-amber-500 text-lg">⚠️</span>
                              )}
                              <div>
                                <h5 className="text-xs font-bold text-gray-800">Monthly Payroll Processing</h5>
                                <p className="text-[10px] text-muted mt-0.5">
                                  {preflight?.payroll?.employees_processed} employees fully processed. {preflight?.payroll?.employees_pending} pending payroll release.
                                </p>
                              </div>
                            </div>
                            <span className={`badge ${preflight?.payroll?.employees_pending === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'} text-[10px] font-black uppercase tracking-wider`}>
                              {preflight?.payroll?.employees_pending === 0 ? 'Paid' : 'Salaries Pending'}
                            </span>
                          </div>
                        </div>

                        {/* Soft-Blocker payroll warnings */}
                        {preflight?.payroll?.employees_pending > 0 && (
                          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
                            <div className="flex items-start gap-3">
                              <span className="text-amber-500 text-lg mt-0.5">⚠️</span>
                              <div className="flex-1 min-w-0">
                                <h5 className="text-xs font-bold text-amber-800 uppercase tracking-wider">Soft Blocker Warning: Unprocessed Payroll Detected</h5>
                                <p className="text-[10px] text-amber-700 mt-1 leading-relaxed">
                                  There are still **{preflight.payroll.employees_pending}** active employees whose payroll has not been released.
                                  Unprocessed salaries total **₹{preflight.payroll.pending_amount.toLocaleString()}** ({preflight.payroll.pending_names.join(', ')}).
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 pt-2">
                              <button 
                                onClick={() => setActiveTab('payroll')}
                                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm active:scale-[0.98]"
                              >
                                [Process Payroll Now]
                              </button>
                              <span className="text-[10px] text-amber-500 font-medium italic">OR fill out a mandatory justification below:</span>
                            </div>
                            
                            <div className="pt-2">
                              <label className="block text-[10px] font-black text-amber-800 uppercase tracking-widest mb-1.5">Close justification reason (Required):</label>
                              <textarea 
                                value={closeReason}
                                onChange={(e) => setCloseReason(e.target.value)}
                                placeholder="Explain why the month is being closed with pending salaries (e.g. client payment delay, salary processing scheduled for 5th, etc.)"
                                className="w-full bg-white border border-amber-200 rounded-lg p-2.5 text-xs text-amber-900 outline-none placeholder-amber-400/80 focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                                rows="2"
                              />
                            </div>
                          </div>
                        )}

                        {/* Execute Close button */}
                        <div className="flex justify-end gap-3 pt-2">
                          {isAdmin ? (
                            <button 
                              onClick={() => {
                                if (preflight?.payroll?.employees_pending > 0 && !closeReason.trim()) {
                                  toast.error('Justification reason is mandatory when payroll is pending');
                                  return;
                                }
                                setShowCloseConfirmModal(true);
                              }}
                              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-red-500 to-[#E05A1E] hover:from-red-600 hover:to-[#C04A15] text-white rounded-lg text-xs font-black uppercase tracking-wider transition-all shadow-md hover:shadow-lg active:scale-[0.98]"
                            >
                              <Lock size={14} />
                              Close Period: {preflight.month_label}
                            </button>
                          ) : (
                            <div className="flex items-center gap-2 px-6 py-2.5 bg-gray-100 border border-gray-200 text-gray-400 rounded-lg text-xs font-black uppercase tracking-wider cursor-not-allowed select-none" title="Only Admin can execute month close. Please notify the Admin to run this action.">
                              <Lock size={14} />
                              Admin Only — Close Period
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Unified Locked Periods & Archive History List */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-100 flex items-center gap-2 bg-gradient-to-r from-gray-50 to-white">
                <Activity size={16} className="text-gray-500" />
                <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Locked Periods & Archive History Logs</h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/50">
                      <th className="px-6 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Period</th>
                      <th className="px-6 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Closed At</th>
                      <th className="px-6 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Closed By</th>
                      <th className="px-6 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Income</th>
                      <th className="px-6 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Expense</th>
                      <th className="px-6 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Net Profit</th>
                      <th className="px-6 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Payroll Check</th>
                      <th className="px-6 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Status</th>
                      <th className="px-6 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {historyLoading && historyLogs.length === 0 ? (
                      <tr>
                        <td colSpan="9" className="px-6 py-10 text-center text-xs text-gray-400 italic">
                          Loading archive timeline logs...
                        </td>
                      </tr>
                    ) : historyLogs.length === 0 ? (
                      <tr>
                        <td colSpan="9" className="px-6 py-12 text-center text-xs text-gray-400 italic leading-relaxed">
                          No historical closing periods archived yet.
                        </td>
                      </tr>
                    ) : historyLogs.map(log => {
                      const label = new Date(log.year, log.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
                      const snap = log.snapshot || {};
                      
                      const rev = parseFloat(snap.revenue?.received || 0);
                      const expVal = parseFloat(snap.expenses?.total || 0);
                      const profit = rev - expVal;

                      return (
                        <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <span className="text-xs font-bold text-gray-800">{label}</span>
                          </td>
                          <td className="px-6 py-4 text-xs text-gray-500">
                            {new Date(log.closed_at).toLocaleDateString()} {new Date(log.closed_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-6 py-4 text-xs text-gray-600 font-semibold">
                            {log.closed_by_name || 'System'}
                          </td>
                          <td className="px-6 py-4 text-right font-mono text-xs font-bold text-emerald-600">
                            ₹{rev.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-6 py-4 text-right font-mono text-xs font-bold text-red-500">
                            ₹{expVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className={`px-6 py-4 text-right font-mono text-xs font-black ${profit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                            ₹{profit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {log.had_pending_payroll ? (
                              <span 
                                className="inline-block px-2.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 text-[9px] font-black uppercase tracking-wider rounded-full cursor-help"
                                title={`Closed with pending salaries: ${log.pending_payroll_count} employees (₹${parseFloat(log.pending_payroll_amount).toLocaleString()} pending)\nReason: ${log.close_reason}`}
                              >
                                ⚠ {log.pending_payroll_count} Pending
                              </span>
                            ) : (
                              <span className="inline-block px-2.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[9px] font-black uppercase tracking-wider rounded-full">
                                ✓ Fully Processed
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 border rounded-full text-[9px] font-black uppercase tracking-wider ${log.is_unlocked ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                              {log.is_unlocked ? '🔓 Unlocked' : '🔒 Locked'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-2">
                              <button 
                                onClick={() => fetchHistoryDetail(log.month, log.year)}
                                className="px-2 py-1 bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 rounded text-[9px] font-black uppercase tracking-wider transition-colors"
                              >
                                Snapshot
                              </button>
                              {isAdmin && (
                                <>
                                  {log.is_unlocked ? (
                                    <button 
                                      onClick={() => handleRelockMonth(log.month, log.year)}
                                      className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded text-[9px] font-black uppercase tracking-wider transition-colors"
                                    >
                                      Re-lock
                                    </button>
                                  ) : (
                                    <button 
                                      onClick={() => {
                                        setTargetUnlockMonth({ month: log.month, year: log.year });
                                        setShowUnlockModal(true);
                                      }}
                                      className="px-2 py-1 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded text-[9px] font-black uppercase tracking-wider transition-colors"
                                    >
                                      Unlock
                                    </button>
                                  )}
                                  <button 
                                    onClick={() => handleReverseClose(log.month, log.year)}
                                    className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded text-[9px] font-black uppercase tracking-wider transition-colors"
                                  >
                                    Reverse
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Breakdown Modal */}

      <FinancialBreakdownModal 
        isOpen={financialModal.isOpen}
        onClose={() => setFinancialModal({ ...financialModal, isOpen: false })}
        type={financialModal.type}
        label={financialModal.label}
      />

      {showPaymentModal && selectedInvoiceForPayment && (
        <RecordPaymentModal
          invoice={selectedInvoiceForPayment}
          onClose={() => {
            setShowPaymentModal(false);
            setSelectedInvoiceForPayment(null);
          }}
          onSave={() => {
            fetchInvoices();
            fetchSummary();
          }}
        />
      )}

      {/* 1. Close Confirmation Modal */}
      {showCloseConfirmModal && preflight && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-gray-100 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-red-50 to-white">
              <div className="flex items-center gap-2">
                <Lock className="text-red-500" size={18} />
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Confirm Monthly Period Closing</h3>
              </div>
              <button 
                onClick={() => {
                  setShowCloseConfirmModal(false);
                  setConfirmText('');
                }}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="bg-red-50/60 border border-red-100 rounded-xl p-4 flex items-start gap-3">
                <span className="text-red-500 text-lg mt-0.5">⚠️</span>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-red-800 uppercase tracking-wider">DANGER: LOCKING BUSINESS DATA</p>
                  <p className="text-[10px] text-red-700 leading-relaxed">
                    Closing **{preflight.month_label}** will permanently lock all income, office overheads, and payroll transactions for this month.
                    No further entries can be recorded, modified, or deleted without formal period unlocking.
                  </p>
                </div>
              </div>

              {/* Financial Snapshot Summary inside Modal */}
              <div className="border border-[#EBEBEB] rounded-xl overflow-hidden shadow-sm">
                <div className="bg-gray-50 px-4 py-2 border-b border-[#EBEBEB]">
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Snapshot Verification Summary</span>
                </div>
                <table className="w-full text-left text-xs border-collapse">
                  <tbody className="divide-y divide-gray-100 font-medium">
                    <tr>
                      <td className="py-2.5 px-4 text-gray-500">Received Revenue</td>
                      <td className="py-2.5 px-4 text-right text-gray-900 font-mono">₹{(preflight?.financials?.received_income || 0).toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 text-gray-500">Total Expenses (Excl. Vendors)</td>
                      <td className="py-2.5 px-4 text-right text-red-500 font-mono">-₹{(preflight?.financials?.total_expense || 0).toLocaleString()}</td>
                    </tr>
                    <tr className="bg-gray-50 font-bold">
                      <td className="py-2.5 px-4 text-gray-800">Net Realized Profit</td>
                      <td className="py-2.5 px-4 text-right text-blue-600 font-mono">₹{(preflight?.financials?.net_pl || 0).toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 text-gray-500">Payroll Released</td>
                      <td className="py-2.5 px-4 text-right text-gray-700 font-mono">{preflight?.payroll?.employees_processed} Paid / {preflight?.payroll?.employees_pending} Pending</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 text-gray-500">Leave Balance Rollover</td>
                      <td className="py-2.5 px-4 text-right text-gray-700">{preflight?.leave?.entries_to_write} Employees ready</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="pt-2">
                <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest mb-2 leading-relaxed">
                  Type <span className="font-mono text-red-500 font-black">CLOSE {preflight.month_label.toUpperCase()}</span> to verify:
                </label>
                <input 
                  type="text" 
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={`CLOSE ${preflight.month_label.toUpperCase()}`}
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-xs font-bold text-center outline-none focus:border-red-400 placeholder-gray-300 font-mono"
                />
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button 
                onClick={() => {
                  setShowCloseConfirmModal(false);
                  setConfirmText('');
                }}
                className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-100 transition-all active:scale-[0.98]"
              >
                Cancel
              </button>
              <button 
                disabled={confirmText !== `CLOSE ${preflight.month_label.toUpperCase()}` || isClosingMonth}
                onClick={handleCloseMonth}
                className="flex items-center gap-2 px-5 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed disabled:shadow-none text-white rounded-lg text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-[0.98]"
              >
                {isClosingMonth ? 'Locking...' : 'Lock and Archive'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Admin Unlock Modal */}
      {showUnlockModal && targetUnlockMonth && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                <Lock size={16} className="text-amber-500" />
                Unlock Locked Period
              </h3>
              <button 
                onClick={() => {
                  setShowUnlockModal(false);
                  setTargetUnlockMonth(null);
                  setUnlockReason('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-[10px] text-amber-800 leading-relaxed">
                You are about to unlock **{new Date(targetUnlockMonth.year, targetUnlockMonth.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}**. 
                This will temporarily open a backdated posting window. Regular users remain locked; admins can submit or delete entries carrying this audit unlock ID.
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-700 uppercase tracking-widest mb-1.5">Mandatory Unlock Justification:</label>
                <textarea 
                  value={unlockReason}
                  onChange={(e) => setUnlockReason(e.target.value)}
                  placeholder="Explain why this closed period is being unlocked (e.g. Backdated invoice audit correction, missing utility bill etc.)"
                  className="w-full bg-white border border-gray-200 rounded-lg p-2.5 text-xs text-slate-800 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 placeholder-gray-300"
                  rows="3"
                />
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button 
                onClick={() => {
                  setShowUnlockModal(false);
                  setTargetUnlockMonth(null);
                  setUnlockReason('');
                }}
                className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-100 transition-all"
              >
                Cancel
              </button>
              <button 
                disabled={!unlockReason.trim() || isUnlockingMonth}
                onClick={handleUnlockMonth}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-[0.98]"
              >
                {isUnlockingMonth ? 'Unlocking...' : 'Unlock Month'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Detailed Drill-Down History Snapshot Modal */}
      {historyDetailOpen && selectedHistoryDetail && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full border border-gray-100 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 my-8">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">
                  Business Archive Snapshot: {new Date(selectedHistoryDetail.log.year, selectedHistoryDetail.log.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
                </h3>
                <p className="text-[10px] text-muted mt-0.5 leading-relaxed">
                  Closed on {new Date(selectedHistoryDetail.log.closed_at).toLocaleDateString()} by {selectedHistoryDetail.log.closed_by_name || 'System Admin'}
                </p>
              </div>
              <button 
                onClick={() => {
                  setHistoryDetailOpen(false);
                  setSelectedHistoryDetail(null);
                }}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {/* Financial Snapshot Summary Card */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Project Billed</p>
                  <h4 className="text-base font-black text-gray-900 mt-1">₹{parseFloat(selectedHistoryDetail.log.snapshot?.revenue?.billed || 0).toLocaleString()}</h4>
                  <span className="text-[9px] text-muted italic">Billed to clients this month</span>
                </div>
                <div className="bg-emerald-50/40 border border-emerald-100 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Revenue Received</p>
                  <h4 className="text-base font-black text-emerald-600 mt-1">₹{parseFloat(selectedHistoryDetail.log.snapshot?.revenue?.received || 0).toLocaleString()}</h4>
                  <span className="text-[9px] text-muted italic">Cash collected in bank</span>
                </div>
                <div className="bg-red-50/40 border border-red-100 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Expenses (Total)</p>
                  <h4 className="text-base font-black text-red-500 mt-1">₹{parseFloat(selectedHistoryDetail.log.snapshot?.expenses?.total || 0).toLocaleString()}</h4>
                  <span className="text-[9px] text-muted italic">Overheads + Salaries (Excl. Vendors)</span>
                </div>
                <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Net Realized Profit</p>
                  <h4 className="text-base font-black text-blue-600 mt-1">₹{parseFloat(selectedHistoryDetail.log.snapshot?.profit_loss?.realized || 0).toLocaleString()}</h4>
                  <span className="text-[9px] text-muted italic">Realized Cash Margin</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Overhead Expenses Breakdown by Category */}
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 font-bold text-xs text-gray-700">
                    Expense Category Breakdown
                  </div>
                  <div className="p-4">
                    {selectedHistoryDetail.log.snapshot?.expenses?.by_category ? (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="py-2 text-gray-400 font-bold uppercase text-[9px]">Category</th>
                            <th className="py-2 text-right text-gray-400 font-bold uppercase text-[9px]">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 font-medium">
                          {Object.entries(selectedHistoryDetail.log.snapshot.expenses.by_category).map(([cat, val]) => (
                            <tr key={cat}>
                              <td className="py-2 text-gray-600">{cat}</td>
                              <td className="py-2 text-right text-slate-800 font-mono">₹{parseFloat(val).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-center py-4 text-xs text-gray-400 italic">No expense breakdown saved.</p>
                    )}
                  </div>
                </div>

                {/* Leaves & HR summary */}
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden space-y-6">
                  <div>
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 font-bold text-xs text-gray-700">
                      HR Leaves & Payroll summary
                    </div>
                    <div className="p-4">
                      <table className="w-full text-left text-xs border-collapse">
                        <tbody className="divide-y divide-gray-50 font-medium">
                          <tr>
                            <td className="py-2.5 text-gray-500">Total Employees</td>
                            <td className="py-2.5 text-right text-gray-800 font-bold">{selectedHistoryDetail.log.snapshot?.hr?.total_employees}</td>
                          </tr>
                          <tr>
                            <td className="py-2.5 text-gray-500">Salaries Released</td>
                            <td className="py-2.5 text-right text-gray-800 font-bold">{selectedHistoryDetail.log.snapshot?.hr?.payroll_processed} employees</td>
                          </tr>
                          <tr>
                            <td className="py-2.5 text-gray-500">Salaries Deferred</td>
                            <td className="py-2.5 text-right text-amber-600 font-bold">{selectedHistoryDetail.log.snapshot?.hr?.payroll_pending} employees</td>
                          </tr>
                          <tr>
                            <td className="py-2.5 text-gray-500">Total Approved Leave Days</td>
                            <td className="py-2.5 text-right text-gray-800 font-bold">{selectedHistoryDetail.log.snapshot?.hr?.total_leave_days_taken} days</td>
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
                            <td className="py-2.5 text-right text-gray-800 font-bold">{selectedHistoryDetail.log.snapshot?.projects?.total_active}</td>
                          </tr>
                          <tr>
                            <td className="py-2.5 text-gray-500">Milestones Completed This Month</td>
                            <td className="py-2.5 text-right text-emerald-600 font-bold">{selectedHistoryDetail.log.snapshot?.projects?.completed_this_month}</td>
                          </tr>
                          <tr>
                            <td className="py-2.5 text-gray-500">New Onboardings This Month</td>
                            <td className="py-2.5 text-right text-[#E05A1E] font-bold">{selectedHistoryDetail.log.snapshot?.projects?.new_this_month}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* Employee Leaves Rolling Balance Ledger Snapshot */}
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
                      {selectedHistoryDetail.leaves?.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="py-6 text-center text-gray-400 italic">No leave registers archived for this month.</td>
                        </tr>
                      ) : selectedHistoryDetail.leaves?.map(leave => (
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
                      {selectedHistoryDetail.unlocks?.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="py-6 text-center text-gray-400 italic">No backdated unlock history logs found for this month.</td>
                        </tr>
                      ) : selectedHistoryDetail.unlocks?.map(ulock => (
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
                  setHistoryDetailOpen(false);
                  setSelectedHistoryDetail(null);
                }}
                className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-black uppercase tracking-widest transition-all active:scale-[0.98]"
              >
                Close Snapshot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Payroll Report Modal */}
      {showPayrollReportModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 no-print-overlay">
          <div className="bg-white rounded-2xl max-w-5xl w-full border border-gray-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 my-8 flex flex-col max-h-[90vh]">
            
            {/* Modal Header Controls */}
            <div className="p-4 border-b border-gray-200 bg-gray-900 text-white flex items-center justify-between no-print">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-[#E05A1E]" />
                <h3 className="text-sm font-bold tracking-wide">Payroll & Salary Disbursement Report Preview</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportPayrollPDF}
                  disabled={isExportingPayrollPdf}
                  className="px-3 py-1.5 bg-[#E05A1E] hover:bg-[#c94e16] text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <Download size={14} />
                  <span>Download PDF</span>
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border border-gray-700"
                >
                  <Printer size={14} />
                  <span>Print</span>
                </button>
                <button
                  onClick={() => setShowPayrollReportModal(false)}
                  className="p-1 text-gray-400 hover:text-white rounded-lg transition-colors ml-2"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Document Content */}
            <div className="p-6 sm:p-8 overflow-y-auto space-y-6 flex-1 bg-white" id="printable-payroll-report-area">
              
              {/* Report Header */}
              <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                <div>
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight">{COMPANY_CONFIG.brand}</h1>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">{COMPANY_CONFIG.address}{COMPANY_CONFIG.gst ? ` • GSTIN: ${COMPANY_CONFIG.gst}` : ""}</p>
                </div>
                <div className="sm:text-right">
                  <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 rounded-md text-xs font-black uppercase tracking-widest">
                    Payroll Audit Statement
                  </span>
                  <p className="text-[11px] font-bold text-slate-500 mt-1">
                    Period: {["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][selectedMonth]} {selectedYear}
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium">
                    {employees.length} Staff Mapped ({payrollHistory.length} Disbursed)
                  </p>
                </div>
              </div>

              {/* Executive Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Base Salaries</p>
                  <p className="text-base font-black font-mono text-slate-900 mt-0.5">
                    ₹{employees.reduce((sum, e) => sum + parseFloat(e.base_salary || 0), 0).toLocaleString('en-IN')}
                  </p>
                  <p className="text-[10px] text-slate-500 font-semibold">{employees.length} Active Staff</p>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Incentives</p>
                  <p className="text-base font-black font-mono text-purple-600 mt-0.5">
                    ₹{payrollHistory.reduce((sum, p) => sum + parseFloat(p.incentives || 0), 0).toLocaleString('en-IN')}
                  </p>
                  <p className="text-[10px] text-purple-700 font-semibold">Bonus & Adjustments</p>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Net Payroll Paid</p>
                  <p className="text-base font-black font-mono text-emerald-600 mt-0.5">
                    ₹{payrollHistory.reduce((sum, p) => sum + parseFloat(p.net_paid || 0), 0).toLocaleString('en-IN')}
                  </p>
                  <p className="text-[10px] text-emerald-700 font-semibold">Disbursed Balance</p>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Disbursement Status</p>
                  <p className="text-base font-black font-mono text-slate-800 mt-0.5">
                    {payrollHistory.length} / {employees.length}
                  </p>
                  <p className="text-[10px] text-orange-600 font-semibold">
                    {employees.length - payrollHistory.length} Pending
                  </p>
                </div>
              </div>

              {/* Formatted Audit Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px] text-center w-8">#</th>
                      <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px]">Employee Name</th>
                      <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px]">Department</th>
                      <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px]">Role</th>
                      <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px]">Work Summary</th>
                      <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px] text-right">Base Salary</th>
                      <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px] text-right">Incentives</th>
                      <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px] text-right">Net Salary</th>
                      <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px] text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {employees.map((emp, idx) => {
                      const processed = payrollHistory.find(p => p.user_id === emp.id);
                      const base = parseFloat(emp.base_salary || 0);
                      const inc = processed ? parseFloat(processed.incentives || 0) : parseFloat(rowIncentives[emp.id] || 0);
                      const net = processed ? parseFloat(processed.net_paid || 0) : ((emp.suggested_salary || base) + inc);
                      const workSummary = `${emp.payable_days || emp.full_days_worked || 0} days`;

                      return (
                        <tr key={emp.id || idx} className={idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}>
                          <td className="px-3 py-2 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                          <td className="px-3 py-2 font-semibold text-slate-900">{emp.name}</td>
                          <td className="px-3 py-2 text-slate-600">{emp.department}</td>
                          <td className="px-3 py-2 text-slate-500 capitalize">{emp.role}</td>
                          <td className="px-3 py-2 text-slate-600">{workSummary}</td>
                          <td className="px-3 py-2 text-right font-mono text-slate-700">₹{base.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="px-3 py-2 text-right font-mono text-purple-600">₹{inc.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">₹{net.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            <span className={`inline-block px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full ${processed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                              {processed ? 'Paid' : 'Pending'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-900 text-white font-bold border-t-2 border-slate-900">
                    <tr>
                      <td colSpan={5} className="px-3 py-2.5 uppercase text-[10px]">Grand Total ({employees.length} Employees)</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">₹{employees.reduce((sum, e) => sum + parseFloat(e.base_salary || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-purple-400">₹{payrollHistory.reduce((sum, p) => sum + parseFloat(p.incentives || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-emerald-400">₹{payrollHistory.reduce((sum, p) => sum + parseFloat(p.net_paid || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Report Footer */}
              <div className="pt-4 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-400">
                <p>This is a system-generated payroll audit report for {COMPANY_CONFIG.brand}.</p>
                <p>Page 1 of 1</p>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Dedicated Expenses Report Modal */}
      {showExpensesReportModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 no-print-overlay">
          <div className="bg-white rounded-2xl max-w-5xl w-full border border-gray-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 my-8 flex flex-col max-h-[90vh]">
            
            {/* Modal Header Controls */}
            <div className="p-4 border-b border-gray-200 bg-gray-900 text-white flex items-center justify-between no-print">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-[#E05A1E]" />
                <h3 className="text-sm font-bold tracking-wide">Expense Accounting Report Preview</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportExpensesPDF}
                  disabled={isExportingExpensesPdf}
                  className="px-3 py-1.5 bg-[#E05A1E] hover:bg-[#c94e16] text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <Download size={14} />
                  <span>Download PDF</span>
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border border-gray-700"
                >
                  <Printer size={14} />
                  <span>Print</span>
                </button>
                <button
                  onClick={() => setShowExpensesReportModal(false)}
                  className="p-1 text-gray-400 hover:text-white rounded-lg transition-colors ml-2"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Document Content */}
            <div className="p-6 sm:p-8 overflow-y-auto space-y-6 flex-1 bg-white" id="printable-expenses-report-area">
              
              {/* Report Header */}
              <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                <div>
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight">{COMPANY_CONFIG.brand}</h1>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">{COMPANY_CONFIG.address}{COMPANY_CONFIG.gst ? ` • GSTIN: ${COMPANY_CONFIG.gst}` : ""}</p>
                </div>
                <div className="sm:text-right">
                  <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-md text-xs font-black uppercase tracking-widest">
                    Expense Audit Statement
                  </span>
                  <p className="text-[11px] font-bold text-slate-500 mt-1">
                    Generated: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium">
                    Total Records: {expenses.length} Entries
                  </p>
                </div>
              </div>

              {/* Executive Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Expense Outflow</p>
                  <p className="text-base font-black font-mono text-slate-900 mt-0.5">
                    ₹{expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0).toLocaleString('en-IN')}
                  </p>
                  <p className="text-[10px] text-slate-500 font-semibold">{expenses.length} Records Tracked</p>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Categories Mapped</p>
                  <p className="text-base font-black font-mono text-slate-800 mt-0.5">
                    {new Set(expenses.map(e => e.category)).size} Categories
                  </p>
                  <p className="text-[10px] text-slate-500 font-semibold">Active Ledger Allocation</p>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Audit Status</p>
                  <p className="text-base font-black font-mono text-emerald-600 mt-0.5">
                    System Verified
                  </p>
                  <p className="text-[10px] text-emerald-700 font-semibold">Period Locks Enforced</p>
                </div>
              </div>

              {/* Formatted Audit Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px] text-center w-8">#</th>
                      <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px]">Date</th>
                      <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px]">Category</th>
                      <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px]">Description</th>
                      <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px] text-right">Amount</th>
                      <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px] text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {expenses.slice().sort((a,b) => new Date(b.date) - new Date(a.date)).map((exp, idx) => (
                      <tr key={exp.id || idx} className={idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}>
                        <td className="px-3 py-2 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{new Date(exp.date).toLocaleDateString('en-IN')}</td>
                        <td className="px-3 py-2 font-semibold text-slate-900">{exp.category}</td>
                        <td className="px-3 py-2 text-slate-600 italic">{exp.description || '-'}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">₹{parseFloat(exp.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          <span className={`inline-block px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full ${exp.is_verified ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                            {exp.is_verified ? 'Verified' : 'Unverified'}
                          </span>
                          {exp.period_unlock_id && (
                            <span className="block text-[8px] font-bold text-amber-600 mt-0.5">Backdated</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-900 text-white font-bold border-t-2 border-slate-900">
                    <tr>
                      <td colSpan={4} className="px-3 py-2.5 uppercase text-[10px]">Total Expenses ({expenses.length} Records)</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-orange-400">₹{expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Report Footer */}
              <div className="pt-4 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-400">
                <p>This is a system-generated expense audit report for {COMPANY_CONFIG.brand}.</p>
                <p>Page 1 of 1</p>
              </div>

            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
