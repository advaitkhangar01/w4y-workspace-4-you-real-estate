// client/src/utils/taskPdfExport.js
import jsPDF from 'jspdf';
import { formatDateIST, formatIST } from './time';
import { COMPANY_CONFIG } from '../config/company';

/**
 * Generates and downloads a clean, professional PDF report of tasks with date filtering.
 * 
 * @param {Object} options
 * @param {Array} options.tasks - List of task records
 * @param {Object} options.filters - { fromDate, toDate, status }
 * @param {Object} options.currentUser - Current logged in user object
 */
export function exportTasksToPDF({ tasks = [], filters = {}, currentUser = null }) {
  if (!tasks || tasks.length === 0) {
    throw new Error('No task records found for the selected date range.');
  }

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();   // 297 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 210 mm
  const margin = 12;

  // 1. Top Header Banner
  doc.setFillColor(30, 41, 59); // Slate-800
  doc.rect(0, 0, pageWidth, 18, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(COMPANY_CONFIG.brand, margin, 11.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(224, 90, 30); // Brand Orange
  doc.text('TASKS COMPLETION & AUDIT REPORT', margin + 25, 11.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225);
  const nowIST = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  doc.text(`Generated: ${nowIST} IST`, pageWidth - margin, 8, { align: 'right' });
  doc.text(`Exported by: ${currentUser?.name || 'Administrator'}`, pageWidth - margin, 13, { align: 'right' });

  // 2. Filter & Executive Summary Strip
  const summaryY = 22;
  const summaryHeight = 15;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, summaryY, pageWidth - (margin * 2), summaryHeight, 2, 2, 'FD');

  const totalTasks = tasks.length;
  const completedCount = tasks.filter(t => t.status === 'passed' || t.status === 'done').length;
  const inProgressCount = tasks.filter(t => t.status === 'in_progress' || t.status === 'review' || t.status === 'pending').length;
  const highPriorityCount = tasks.filter(t => t.priority === 'high').length;

  const colWidth = (pageWidth - (margin * 2)) / 4;

  // Metric 1: Total Tasks
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('TOTAL TASKS FOUND', margin + 5, summaryY + 5);
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`${totalTasks} Tasks`, margin + 5, summaryY + 11);

  // Metric 2: Completed / Passed
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('COMPLETED (PASSED)', margin + colWidth + 5, summaryY + 5);
  doc.setFontSize(9.5);
  doc.setTextColor(5, 150, 105); // Emerald
  doc.text(`${completedCount} Completed`, margin + colWidth + 5, summaryY + 11);

  // Metric 3: Active / Pending
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('ACTIVE / IN PROGRESS', margin + (colWidth * 2) + 5, summaryY + 5);
  doc.setFontSize(9.5);
  doc.setTextColor(217, 119, 6); // Amber
  doc.text(`${inProgressCount} Active`, margin + (colWidth * 2) + 5, summaryY + 11);

  // Metric 4: Filter Scope & Priority
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('FILTER CRITERIA', margin + (colWidth * 3) + 5, summaryY + 5);
  doc.setFontSize(8.5);
  doc.setTextColor(224, 90, 30);
  const statusLabel = filters.status ? filters.status.toUpperCase() : 'COMPLETED';
  const dateRangeLabel = (filters.fromDate || filters.toDate)
    ? `${filters.fromDate || 'Start'} to ${filters.toDate || 'Present'}`
    : 'All Dates';
  doc.text(`${statusLabel} (${highPriorityCount} High Priority)`, margin + (colWidth * 3) + 5, summaryY + 10);
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(`Range: ${dateRangeLabel}`, margin + (colWidth * 3) + 5, summaryY + 13.5);

  // 3. Table Column Layout
  let startY = 41;
  const columns = [
    { header: '#', width: 9, align: 'center' },
    { header: 'Task Title', width: 75, align: 'left' },
    { header: 'Project Link', width: 44, align: 'left' },
    { header: 'Assigned To', width: 33, align: 'left' },
    { header: 'Priority', width: 20, align: 'center' },
    { header: 'Start Date', width: 22, align: 'center' },
    { header: 'Due Date', width: 22, align: 'center' },
    { header: 'Completed Date', width: 28, align: 'center' },
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

  tasks.forEach((t, index) => {
    const rowHeight = 7;

    // Page Break Trigger
    if (currentY + rowHeight > maxY) {
      // Draw Page Footer
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(`${COMPANY_CONFIG.brand} • Task Management Audit Report`, margin, pageHeight - 6);
      doc.text(`Page ${pageCount}`, pageWidth - margin, pageHeight - 6, { align: 'right' });

      doc.addPage();
      pageCount++;

      // Top running banner on page 2+
      doc.setFillColor(30, 41, 59);
      doc.rect(0, 0, pageWidth, 10, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(255, 255, 255);
      doc.text(`${COMPANY_CONFIG.brand} — TASK MANAGEMENT REPORT`, margin, 7);
      doc.text(`Page ${pageCount}`, pageWidth - margin, 7, { align: 'right' });

      currentY = drawTableHeader(14);
    }

    // Alternating Row Fill
    if (index % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, currentY, pageWidth - (margin * 2), rowHeight, 'F');
    }

    // Row border bottom
    doc.setDrawColor(241, 245, 249);
    doc.line(margin, currentY + rowHeight, pageWidth - margin, currentY + rowHeight);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(51, 65, 85);

    let currentX = margin;

    // 1. S.No
    doc.text(String(index + 1), currentX + (columns[0].width / 2), currentY + 4.8, { align: 'center' });
    currentX += columns[0].width;

    // 2. Title (truncate if too long)
    const titleText = doc.splitTextToSize(t.title || 'Untitled', columns[1].width - 4);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(titleText[0] || '', currentX + 2, currentY + 4.8);
    currentX += columns[1].width;

    // 3. Project Name
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    const projText = doc.splitTextToSize(t.project_name || 'General', columns[2].width - 4);
    doc.text(projText[0] || '', currentX + 2, currentY + 4.8);
    currentX += columns[2].width;

    // 4. Assigned To
    const assignee = t.assigned_to_name || 'Unassigned';
    doc.text(assignee, currentX + 2, currentY + 4.8);
    currentX += columns[3].width;

    // 5. Priority
    const priority = (t.priority || 'medium').toUpperCase();
    if (priority === 'HIGH') {
      doc.setTextColor(220, 38, 38);
      doc.setFont('helvetica', 'bold');
    } else if (priority === 'LOW') {
      doc.setTextColor(37, 99, 235);
      doc.setFont('helvetica', 'normal');
    } else {
      doc.setTextColor(217, 119, 6);
      doc.setFont('helvetica', 'normal');
    }
    doc.text(priority, currentX + (columns[4].width / 2), currentY + 4.8, { align: 'center' });
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    currentX += columns[4].width;

    // 6. Start Date
    const startStr = t.start_date ? formatDateIST(t.start_date) : '—';
    doc.text(startStr, currentX + (columns[5].width / 2), currentY + 4.8, { align: 'center' });
    currentX += columns[5].width;

    // 7. Due Date
    const dueStr = t.due_date ? formatDateIST(t.due_date) : '—';
    doc.text(dueStr, currentX + (columns[6].width / 2), currentY + 4.8, { align: 'center' });
    currentX += columns[6].width;

    // 8. Completed Date
    const completedStr = t.completed_at ? formatDateIST(t.completed_at) : (t.status === 'passed' ? 'Passed' : '—');
    if (t.completed_at) {
      doc.setTextColor(5, 150, 105);
    }
    doc.text(completedStr, currentX + (columns[7].width / 2), currentY + 4.8, { align: 'center' });
    doc.setTextColor(71, 85, 105);
    currentX += columns[7].width;

    // 9. Status
    const statusUpper = (t.status || 'pending').toUpperCase();
    if (statusUpper === 'PASSED' || statusUpper === 'DONE') {
      doc.setTextColor(5, 150, 105);
      doc.setFont('helvetica', 'bold');
    } else if (statusUpper === 'REVIEW') {
      doc.setTextColor(147, 51, 234);
      doc.setFont('helvetica', 'bold');
    } else if (statusUpper === 'IN_PROGRESS') {
      doc.setTextColor(217, 119, 6);
      doc.setFont('helvetica', 'normal');
    } else {
      doc.setTextColor(148, 163, 184);
      doc.setFont('helvetica', 'normal');
    }
    doc.text(statusUpper, currentX + (columns[8].width / 2), currentY + 4.8, { align: 'center' });

    currentY += rowHeight;
  });

  // Final Page Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(`${COMPANY_CONFIG.brand} • Task Management Audit Report`, margin, pageHeight - 6);
  doc.text(`Page ${pageCount}`, pageWidth - margin, pageHeight - 6, { align: 'right' });

  // Save the PDF
  const filename = `W4Y_Tasks_Report_${filters.status || 'complete'}_${filters.fromDate || 'all'}_${filters.toDate || 'today'}.pdf`;
  doc.save(filename);
}
