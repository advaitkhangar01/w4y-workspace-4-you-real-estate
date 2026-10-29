// server/utils/payroll.js
const pool = require('../db');
const { getISTDate, getISTTime } = require('./date');
const { calculateHourlyRate, calculateLatePenalty, calculateUnifiedNet } = require('./salaryEngine');

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = String(timeStr).split(':');
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  return hours * 60 + minutes;
}

// (calculateHourlyRate imported from ./salaryEngine)

/**
 * Single source of truth to calculate daily attendance stats, regular & overtime hours,
 * overtime pay, normal pay, and deductions.
 */
function calculateDayAttendanceStats(att, options = {}) {
  const baseSalary = parseFloat(options.baseSalary || 0);
  const hourlyRate = parseFloat(options.hourlyRate || 0);
  const batchMinHours = parseFloat(options.batchMinHours || 9.0);
  const officeStartTimeStr = options.officeStartTimeStr || '10:00';
  const lateThresholdTimeStr = options.lateThresholdTimeStr || '10:15';
  const halfDayCutoffTimeStr = options.halfDayCutoffTimeStr || '13:00';
  const lateThresholdMins = parseInt(options.lateThresholdMins || 15, 10);
  const isSunday = !!options.isSunday;
  const isPaidHoliday = !!options.isPaidHoliday;
  const isUnpaidLeave = !!options.isUnpaidLeave;
  const isFuture = !!options.isFuture;

  // Base day value is strictly Base Salary / 30 for salaried
  const fullDayValue = baseSalary > 0 ? (baseSalary / 30) : (hourlyRate * batchMinHours);
  const effectiveHourlyRate = baseSalary > 0 && batchMinHours > 0 ? (fullDayValue / batchMinHours) : hourlyRate;

  let dayStatus = att.status ? att.status.toLowerCase() : (isFuture ? 'upcoming' : (isSunday ? 'sunday' : (isPaidHoliday ? 'holiday' : 'absent')));
  const hasActualAttendance = !!(att.check_in || att.check_out || (att.hours_worked && parseFloat(att.hours_worked) > 0));
  if ((isFuture || dayStatus === 'future') && !hasActualAttendance) {
    dayStatus = 'upcoming';
  }
  let isLate = false;
  let lateMins = 0;
  let regularHours = parseFloat(att.hours_worked || 0);
  if (!regularHours && att.check_in && att.check_out) {
    const elapsed = (new Date(att.check_out) - new Date(att.check_in)) / (1000 * 60 * 60);
    if (!isNaN(elapsed) && elapsed > 0) {
      regularHours = parseFloat(elapsed.toFixed(2));
    }
  }
  const totalWorkedHours = regularHours;
  let overtimeHours = 0;

  // Mandatory 9-hour rule (batchMinHours):
  // If employee has checked out, and total hours worked is less than mandatory batch minimum hours (e.g. 9.0h),
  // they cannot be marked completed or earn full day wage. The day is strictly half_day.
  if (att.check_out && totalWorkedHours < batchMinHours) {
    if (dayStatus === 'completed' || dayStatus === 'present' || dayStatus === 'working') {
      dayStatus = 'half_day';
    }
  }

  // Future and pending records cannot have worked hours, lateness, overtime, or deductions
  if (dayStatus === 'upcoming' || dayStatus === 'today_pending') {
    return {
      ...att,
      status: dayStatus,
      is_late: false,
      late_minutes: 0,
      regular_hours: 0,
      overtime_hours: 0,
      overtime_earnings: 0,
      earnings: 0,
      normal_earnings: 0,
      deduction: 0
    };
  }

  // Overtime logic:
  // Overtime can ONLY accrue if:
  // 1. Shift has completed the mandatory minimum hours (totalWorkedHours >= batchMinHours) and is not a half day.
  // 2. The employee has completed at least 1 full additional hour beyond the mandatory shift
  //    (e.g., for a 9h shift: 9.0h - 9.99h -> 0 OT; 10.0h - 10.99h -> 1 OT; 11.0h -> 2 OT).
  // 3. Check-out is after 7:00 PM IST (19:00), paid only in completed 1-hour rounds after 19:00 IST.
  if (att.check_in && att.check_out && totalWorkedHours >= batchMinHours && dayStatus !== 'half_day') {
    const ci = new Date(att.check_in);
    const co = new Date(att.check_out);
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
    const checkOutDateStr = formatter.format(co);
    const cutoff = new Date(`${checkOutDateStr}T19:00:00+05:30`);

    const extraHoursBeyondShift = Math.floor(Math.max(0, totalWorkedHours - batchMinHours));

    if (co > cutoff && extraHoursBeyondShift >= 1) {
      const startForOt = ci > cutoff ? ci : cutoff;
      const otMs = co.getTime() - startForOt.getTime();
      const completedHoursPast7PM = Math.floor(Math.max(0, otMs / (1000 * 60 * 60)));

      // Must complete both: full 1-hour blocks beyond mandatory shift AND full 1-hour blocks past 7 PM
      overtimeHours = Math.min(extraHoursBeyondShift, completedHoursPast7PM);
      regularHours = Math.max(0, totalWorkedHours - overtimeHours);
    }
  }

  // Lateness evaluation:
  if (att.batch_id === null || att.batch_id === undefined) {
    // Historical record with NULL batch_id:
    // Strictly preserve stored is_late and late_minutes from database.
    // Do NOT evaluate against current or invented batches.
    isLate = !!att.is_late;
    lateMins = parseInt(att.late_minutes || 0, 10);
  } else if (att.check_in) {
    const checkInTimeStr = getISTTime(att.check_in);
    const checkInMins = timeToMinutes(checkInTimeStr);
    const startMins = timeToMinutes(officeStartTimeStr);
    const diffMins = checkInMins - startMins;

    let isLateThresholdMet = false;
    if (lateThresholdTimeStr) {
      isLateThresholdMet = checkInMins > timeToMinutes(lateThresholdTimeStr);
    } else {
      isLateThresholdMet = diffMins > lateThresholdMins;
    }

    if (diffMins > 0) {
      lateMins = diffMins;
    }

    if (isLateThresholdMet) {
      isLate = true;
    }
  }

  // Business rule: Half-Day and Absent must NOT count as a late arrival
  if (dayStatus === 'half_day' || dayStatus === 'absent') {
    isLate = false;
    lateMins = 0;
  }

  // Earnings & Deductions (Salaried monthly model)
  let dayEarnings = 0;
  let dayDeduction = 0;
  const overtimeEarnings = overtimeHours * effectiveHourlyRate;

  if (baseSalary > 0) {
    if (dayStatus === 'working' || dayStatus === 'present' || dayStatus === 'completed') {
      // Salaried full-day present: zero deduction, full day value earned
      dayEarnings = fullDayValue;
      dayDeduction = 0;
    } else if (dayStatus === 'half_day') {
      // Rule 5: Half day shall only be marked and not be counted as deduction/penalty
      // Paid for actual regular hours worked with zero deduction
      dayEarnings = Math.min(fullDayValue, regularHours * effectiveHourlyRate);
      dayDeduction = 0;
    } else if (dayStatus === 'sunday' || dayStatus === 'holiday') {
      // Rule 9: Sundays and holidays are paid days
      dayEarnings = fullDayValue;
      dayDeduction = 0;
    } else if (dayStatus === 'leave') {
      if (isUnpaidLeave) {
        // Rule 8: Unpaid leave earns zero with zero deduction
        dayEarnings = 0;
        dayDeduction = 0;
      } else {
        // Approved paid leave earns full day value with zero deduction
        dayEarnings = fullDayValue;
        dayDeduction = 0;
      }
    } else if (dayStatus === 'absent') {
      // Rule 6 & 7: Absents are counted as zero earnings with zero deduction
      dayEarnings = 0;
      dayDeduction = 0;
    } else {
      dayEarnings = fullDayValue;
      dayDeduction = 0;
    }
  } else {
    // Hourly employee
    dayEarnings = (regularHours + overtimeHours) * hourlyRate;
    dayDeduction = 0;
  }

  return {
    ...att,
    hours_worked: Math.round(totalWorkedHours * 100) / 100,
    status: dayStatus,
    is_late: isLate,
    late_minutes: lateMins,
    regular_hours: Math.round(regularHours * 100) / 100,
    overtime_hours: Math.round(overtimeHours * 100) / 100,
    overtime_earnings: Math.round(overtimeEarnings * 100) / 100,
    earnings: Math.round((dayEarnings + overtimeEarnings) * 100) / 100,
    normal_earnings: Math.round(dayEarnings * 100) / 100,
    deduction: Math.round(dayDeduction * 100) / 100
  };
}

/**
 * Calculates unified payroll and attendance statistics for an employee for a given month and year.
 */
async function calculatePayrollForEmployee(userId, month, year, settings, dbPool = pool, asOfDate = null) {
  // 1. Fetch employee
  const { rows: userRows } = await dbPool.query(
    'SELECT id, name, department, role, base_salary, hourly_rate, batch_id FROM users WHERE id = $1',
    [userId]
  );
  const employee = userRows[0];
  if (!employee) return null;

  // Fetch all batches to resolve assigned batch or attendance-record-specific batch
  const { rows: allBatches } = await dbPool.query('SELECT * FROM attendance_batches');
  const batchMap = new Map(allBatches.map(b => [b.id, b]));

  const employeeBatch = employee.batch_id ? (batchMap.get(employee.batch_id) || {}) : {};

  const baseSalary = parseFloat(employee.base_salary || 0);
  const userHourlyRate = parseFloat(employee.hourly_rate || 0);
  const defaultBatchMinHours = parseFloat(employeeBatch.min_working_hours || settings.min_working_hours || 9.0);

  // Hourly rate calculation strictly based on Base Salary / (30 * Batch Minimum Hours)
  const hourlyRate = baseSalary > 0
    ? calculateHourlyRate(baseSalary, defaultBatchMinHours)
    : userHourlyRate;

  // Full day value strictly based on 30-day divisor
  const perDaySalary = baseSalary > 0
    ? (baseSalary / 30)
    : (hourlyRate * defaultBatchMinHours);

  // 2. Fetch Attendance for the month
  const { rows: attendance } = await dbPool.query(
    `SELECT id, date, check_in, check_out, LOWER(status) AS status, is_late, late_minutes, hours_worked, checkin_distance, checkin_zone, batch_id
     FROM attendance
     WHERE user_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3`,
    [userId, month, year]
  );

  // 3. Fetch Holidays for the month
  const { rows: holidays } = await dbPool.query(
    `SELECT date, is_paid FROM holidays 
     WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2`,
    [month, year]
  );
  const paidHolidayCount = holidays.filter(h => h.is_paid).length;

  // 4. Fetch Leave Requests for the month
  const daysInMonth = new Date(year, month, 0).getDate();
  const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const endStr = `${year}-${String(month).padStart(2, '0')}-${daysInMonth}`;
  const { rows: leaveRequests } = await dbPool.query(
    `SELECT start_date, end_date, type FROM leave_requests 
     WHERE user_id = $1 AND status = 'approved' 
       AND NOT (end_date < $2 OR start_date > $3)`,
    [userId, startStr, endStr]
  );

  // 5. Fetch or calculate Unpaid Leaves count
  let unpaidLeaves = 0;
  const { rows: leaveBalRows } = await dbPool.query(
    `SELECT unpaid_leaves FROM employee_leave_balance 
     WHERE user_id = $1 AND month = $2 AND year = $3`,
    [userId, month, year]
  );
  if (leaveBalRows.length > 0) {
    unpaidLeaves = parseFloat(leaveBalRows[0].unpaid_leaves || 0);
  } else {
    // Fallback to employee_leave_summary if present
    const { rows: leaveSummaryRows } = await dbPool.query(
      `SELECT unpaid_leaves FROM employee_leave_summary 
       WHERE user_id = $1 AND month = $2 AND year = $3`,
      [userId, month, year]
    );
    if (leaveSummaryRows.length > 0) {
      unpaidLeaves = parseFloat(leaveSummaryRows[0].unpaid_leaves || 0);
    } else {
    // Month is not closed yet; calculate unpaid leaves on the fly
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const { rows: prevBalRows } = await dbPool.query(
      'SELECT closing_balance FROM employee_leave_balance WHERE user_id = $1 AND month = $2 AND year = $3',
      [userId, prevMonth, prevYear]
    );
    const prevClosingBalance = prevBalRows[0] ? parseFloat(prevBalRows[0].closing_balance) : 0.00;

    let leavesTaken = 0;
    const startOfMonth = new Date(startStr);
    const endOfMonth = new Date(endStr);
    for (const lr of leaveRequests) {
      const leaveStart = new Date(lr.start_date);
      const leaveEnd = new Date(lr.end_date);
      const overlapStart = new Date(Math.max(leaveStart.getTime(), startOfMonth.getTime()));
      const overlapEnd = new Date(Math.min(leaveEnd.getTime(), endOfMonth.getTime()));
      const diffMs = overlapEnd.getTime() - overlapStart.getTime();
      if (diffMs >= 0) {
        leavesTaken += Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
      }
    }
    unpaidLeaves = Math.max(0, leavesTaken - (prevClosingBalance + 1.50));
    }
  }

  // Settings & rules
  const lateThresholdMins = parseInt(settings.late_threshold_mins || 15, 10);
  const latePenaltyRuleCount = parseInt(settings.late_penalty_rule_count || 3, 10);
  const latePenaltyRuleDays = parseFloat(settings.late_penalty_rule_days || 0.15);

  const formatDate = (dateInput) => {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const holidayDates = new Set(holidays.map(h => formatDate(h.date)));

  let fullDaysWorked = 0;
  let halfDaysWorked = 0;
  let sundaysCount = 0;
  let holidaysCount = 0;
  let leavesCount = 0;
  let unmarkedAbsentCount = 0;
  let lateCount = 0;
  let totalRegularHours = 0;
  let totalOvertimeHours = 0;
  let totalNormalEarnings = 0;
  let totalOvertimeEarnings = 0;

  let unpaidLeavesRemaining = unpaidLeaves;
  let futureDaysCount = 0;
  let unworkedFutureWorkingDays = 0;
  const dailyRecords = [];
  const todayStr = asOfDate || getISTDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month - 1, d);
    const dateStr = formatDate(dateObj);
    const isSunday = (dateObj.getDay() === 0);
    const isFuture = dateStr > todayStr;

    // Find if user has attendance for this day
    const record = attendance.find(r => formatDate(r.date) === dateStr);
    const status = record ? (record.status ? record.status.toLowerCase() : '') : '';

    // Check if user has an approved leave request covering this day
    const isOnApprovedLeave = leaveRequests.some(lr => {
      const start = formatDate(lr.start_date);
      const end = formatDate(lr.end_date);
      return dateStr >= start && dateStr <= end;
    });

    // Resolve record-specific batch thresholds
    let effectiveBatch = null;
    if (record && record.batch_id) {
      effectiveBatch = batchMap.get(record.batch_id) || null;
    } else if (!record) {
      effectiveBatch = employeeBatch;
    } else {
      // Historical record where record.batch_id is null: do NOT assign employeeBatch or fabricate batch
      effectiveBatch = null;
    }

    let officeStartTimeStr = effectiveBatch?.office_start_time
      ? effectiveBatch.office_start_time.substring(0, 5)
      : (settings.office_start_time || '10:00');
    let lateThresholdTimeStr = effectiveBatch?.late_threshold_time
      ? effectiveBatch.late_threshold_time.substring(0, 5)
      : (settings.late_threshold_time || null);
    let halfDayCutoffTimeStr = effectiveBatch?.half_day_cutoff_time
      ? effectiveBatch.half_day_cutoff_time.substring(0, 5)
      : (settings.half_day_cutoff_time || '13:00');
    let dayBatchMinHours = parseFloat(effectiveBatch?.min_working_hours || defaultBatchMinHours);

    let dayStatus = 'absent';
    let isUnpaidLeaveForDay = false;

    if (record) {
      if (status === 'present' || status === 'working' || status === 'completed') {
        dayStatus = record.status || 'present';
      } else if (status === 'half_day') {
        dayStatus = 'half_day';
      } else if (status === 'absent') {
        dayStatus = 'absent';
      } else if (status === 'leave') {
        dayStatus = 'leave';
      } else if (status === 'sunday') {
        dayStatus = 'sunday';
      } else if (status === 'holiday') {
        dayStatus = 'holiday';
      } else {
        dayStatus = 'present';
      }
    } else if (isFuture) {
      dayStatus = 'upcoming';
    } else if (dateStr === todayStr) {
      dayStatus = 'today_pending';
    } else if (isOnApprovedLeave || status === 'leave') {
      dayStatus = 'leave';
    } else if (isSunday) {
      dayStatus = 'sunday';
    } else if (holidayDates.has(dateStr)) {
      dayStatus = 'holiday';
    } else {
      dayStatus = 'absent';
    }

    if (dayStatus === 'leave') {
      if (unpaidLeavesRemaining > 0) {
        isUnpaidLeaveForDay = true;
        unpaidLeavesRemaining = Math.max(0, unpaidLeavesRemaining - 1);
      }
    }

    const dayStats = calculateDayAttendanceStats(
      {
        ...(record || {}),
        id: record?.id || `temp-${dateStr}`,
        date: dateStr,
        status: dayStatus,
        check_in: record?.check_in || null,
        check_out: record?.check_out || null,
        hours_worked: record?.hours_worked || 0,
        checkin_zone: record?.checkin_zone || null,
        checkin_distance: record?.checkin_distance || null,
        batch_id: record?.batch_id || null
      },
      {
        baseSalary,
        hourlyRate,
        batchMinHours: dayBatchMinHours,
        officeStartTimeStr,
        lateThresholdTimeStr,
        halfDayCutoffTimeStr,
        lateThresholdMins,
        isSunday,
        isPaidHoliday: holidayDates.has(dateStr),
        isUnpaidLeave: isUnpaidLeaveForDay,
        isFuture
      }
    );

    if (dayStats.status === 'upcoming' || dayStats.status === 'future') {
      futureDaysCount++;
      if (!isSunday && !holidayDates.has(dateStr)) {
        unworkedFutureWorkingDays++;
      }
    } else if (dayStats.status === 'today_pending') {
      // Pending check-in today, neither present nor absent yet
    } else if (dayStats.status === 'present' || dayStats.status === 'working' || dayStats.status === 'completed') {
      fullDaysWorked++;
    } else if (dayStats.status === 'half_day') {
      halfDaysWorked++;
    } else if (dayStats.status === 'absent') {
      unmarkedAbsentCount++;
    } else if (dayStats.status === 'leave') {
      leavesCount++;
    } else if (dayStats.status === 'sunday') {
      sundaysCount++;
    } else if (dayStats.status === 'holiday') {
      holidaysCount++;
    }

    // Business rule: exclude half_day, absent, upcoming, today_pending from lateCount
    if (dayStats.is_late && dayStats.status !== 'half_day' && dayStats.status !== 'absent' && dayStats.status !== 'upcoming' && dayStats.status !== 'today_pending') {
      lateCount++;
      if (lateCount % latePenaltyRuleCount === 0) {
        const penaltyAmount = Math.round(latePenaltyRuleDays * perDaySalary * 100) / 100;
        dayStats.deduction = penaltyAmount;
        dayStats.deduction_reason = `${latePenaltyRuleCount} accumulated late arrivals penalty`;
      }
    }

    totalRegularHours += dayStats.regular_hours;
    totalOvertimeHours += dayStats.overtime_hours;
    totalNormalEarnings += dayStats.normal_earnings;
    totalOvertimeEarnings += dayStats.overtime_earnings;

    dailyRecords.push(dayStats);
  }

  // Cumulative Late Penalty (Standard): Every 3 late marks accumulated in the month = 0.15 day deduction
  const lateRes = calculateLatePenalty(lateCount, perDaySalary, latePenaltyRuleCount, latePenaltyRuleDays);
  const completedLateGroups = lateRes.groups;
  const latePenaltyDays = lateRes.latePenaltyDays;
  const latePenaltyAmount = lateRes.latePenaltyAmount;
  const lateDeductionAmount = latePenaltyAmount;

  // Rules 5, 6, 7: No other type of deduction or penalty exists
  const halfDayDeductionAmount = 0;
  const absenceDeductionAmount = 0;
  const unpaidLeaveDeductionAmount = 0;
  const totalAttendanceDeductions = 0;

  const halfDayFactor = 0.5;
  const effectiveDays = (fullDaysWorked + (halfDaysWorked * halfDayFactor) + paidHolidayCount + sundaysCount + (leavesCount - unpaidLeaves));
  const finalPayableDays = Math.max(0, effectiveDays - latePenaltyDays);

  const totalDeductions = Math.round(latePenaltyAmount * 100) / 100;

  // Check if period is formally closed in monthly_closing_log
  let isPeriodClosed = false;
  try {
    const { rows: closeRows } = await dbPool.query(
      'SELECT id FROM monthly_closing_log WHERE month = $1 AND year = $2',
      [month, year]
    );
    isPeriodClosed = closeRows.length > 0;
  } catch (err) {
    // Graceful fallback if table is unavailable
  }

  const isMonthInProgress = !isPeriodClosed && unworkedFutureWorkingDays > 0;

  const absenceDeduction = (unmarkedAbsentCount + unpaidLeaves) * perDaySalary;
  const halfDayShortfallDeduction = dailyRecords
    .filter(r => r.status === 'half_day')
    .reduce((sum, r) => sum + Math.max(0, perDaySalary - (r.normal_earnings || 0)), 0);

  const unified = calculateUnifiedNet({
    baseSalary,
    unmarkedAbsentCount,
    unpaidLeaves,
    halfDaysWorked,
    halfDayShortfalls: halfDayShortfallDeduction,
    totalDeductions,
    totalOvertimeEarnings,
    totalNormalEarnings,
    isMonthInProgress
  });

  const accruedEarningsToDate = unified.accruedEarningsToDate;
  const accruedSalary = accruedEarningsToDate;
  const projectedMonthEndNet = unified.projectedMonthEndNet;
  const currentNetPayable = unified.currentNetPayable;

  const netSalaryPayable = currentNetPayable;
  const suggestedSalary = currentNetPayable;
  const totalEarnings = isMonthInProgress
    ? accruedEarningsToDate
    : Math.round((baseSalary - absenceDeduction - halfDayShortfallDeduction + totalOvertimeEarnings) * 100) / 100;

  if (baseSalary <= 0 && hourlyRate > 0) {
    const hourlySuggested = (totalRegularHours + totalOvertimeHours) * hourlyRate;
    return {
      employee,
      full_days: fullDaysWorked,
      full_days_worked: fullDaysWorked,
      half_days: halfDaysWorked,
      half_days_worked: halfDaysWorked,
      late_count: lateCount,
      unpaid_leaves: unpaidLeaves,
      paid_holidays: paidHolidayCount,
      sundays_count: sundaysCount,
      holidays_count: holidaysCount,
      leaves_count: leavesCount,
      unmarked_absent_count: unmarkedAbsentCount,
      effective_days: effectiveDays,
      late_penalty_days: 0,
      payable_days: finalPayableDays,
      total_days: daysInMonth,
      total_hours: Math.round((totalRegularHours + totalOvertimeHours) * 100) / 100,
      total_regular_hours: Math.round(totalRegularHours * 100) / 100,
      total_overtime_hours: Math.round(totalOvertimeHours * 100) / 100,
      overtime_earnings: Math.round(totalOvertimeHours * hourlyRate * 100) / 100,
      calculation_method: 'hourly',
      suggested_salary: Math.round(hourlySuggested * 100) / 100,
      net_salary_payable: Math.round(hourlySuggested * 100) / 100,
      current_net_payable: Math.round(hourlySuggested * 100) / 100,
      accrued_salary: Math.round(hourlySuggested * 100) / 100,
      accrued_earnings_to_date: Math.round(hourlySuggested * 100) / 100,
      projected_month_end_net: Math.round(hourlySuggested * 100) / 100,
      projected_net_salary: Math.round(hourlySuggested * 100) / 100,
      projected_salary: Math.round(hourlySuggested * 100) / 100,
      earnings: Math.round(hourlySuggested * 100) / 100,
      deductions: 0,
      total_deductions_to_date: 0,
      total_attendance_deductions: 0,
      late_deduction_days: 0,
      late_deduction_amount: 0,
      half_day_deduction_amount: 0,
      absence_deduction_amount: 0,
      unpaid_leave_deduction_amount: 0,
      total_present: fullDaysWorked + halfDaysWorked,
      present_days: fullDaysWorked + halfDaysWorked,
      paid_days_equivalent: Math.round(effectiveDays * 100) / 100,
      total_absent: leavesCount + unmarkedAbsentCount,
      processedAttendance: dailyRecords
    };
  }

  return {
    employee,
    full_days: fullDaysWorked,
    full_days_worked: fullDaysWorked,
    half_days: halfDaysWorked,
    half_days_worked: halfDaysWorked,
    late_count: lateCount,
    consecutive_late_groups: completedLateGroups,
    unpaid_leaves: unpaidLeaves,
    paid_holidays: paidHolidayCount,
    sundays_count: sundaysCount,
    holidays_count: holidaysCount,
    leaves_count: leavesCount,
    unmarked_absent_count: unmarkedAbsentCount,
    effective_days: effectiveDays,
    late_penalty_days: latePenaltyDays,
    payable_days: finalPayableDays,
    total_days: daysInMonth,
    total_hours: Math.round((totalRegularHours + totalOvertimeHours) * 100) / 100,
    total_regular_hours: Math.round(totalRegularHours * 100) / 100,
    total_overtime_hours: Math.round(totalOvertimeHours * 100) / 100,
    overtime_earnings: Math.round(totalOvertimeEarnings * 100) / 100,
    calculation_method: 'monthly',
    suggested_salary: Math.round(suggestedSalary * 100) / 100,
    net_salary_payable: Math.round(netSalaryPayable * 100) / 100,
    current_net_payable: Math.round(currentNetPayable * 100) / 100,
    accrued_salary: Math.round(accruedSalary * 100) / 100,
    accrued_earnings_to_date: Math.round(accruedEarningsToDate * 100) / 100,
    projected_month_end_net: Math.round(projectedMonthEndNet * 100) / 100,
    projected_net_salary: Math.round(projectedMonthEndNet * 100) / 100,
    projected_salary: Math.round(projectedMonthEndNet * 100) / 100,
    is_month_in_progress: isMonthInProgress,
    earnings: Math.round(totalEarnings * 100) / 100,
    deductions: Math.round(totalDeductions * 100) / 100,
    total_deductions_to_date: Math.round(totalDeductions * 100) / 100,
    total_attendance_deductions: Math.round(totalAttendanceDeductions * 100) / 100,
    late_deduction_days: latePenaltyDays,
    late_deduction_amount: Math.round(lateDeductionAmount * 100) / 100,
    half_day_deduction_amount: Math.round(halfDayDeductionAmount * 100) / 100,
    absence_deduction_amount: Math.round(absenceDeductionAmount * 100) / 100,
    unpaid_leave_deduction_amount: Math.round(unpaidLeaveDeductionAmount * 100) / 100,
    total_present: fullDaysWorked + halfDaysWorked,
    present_days: fullDaysWorked + halfDaysWorked,
    paid_days_equivalent: Math.round(effectiveDays * 100) / 100,
    total_absent: leavesCount + unmarkedAbsentCount,
    processedAttendance: dailyRecords
  };
}

module.exports = {
  calculatePayrollForEmployee,
  calculateHourlyRate,
  calculateDayAttendanceStats,
  timeToMinutes
};

