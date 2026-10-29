// server/routes/monthlyClose.js
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticate, requireAdmin, requireAccounting } = require('../middleware/auth');
const { calculatePayrollForEmployee } = require('../utils/payroll');
const { logAudit } = require('../utils/auditLogger');

// All closing endpoints require authentication and admin/accounts privileges
router.use(authenticate);

/**
 * Helper: gets current local month (1-indexed) and year adjusted for the target timezone.
 */
function getCurrentLocalMonthAndYear() {
  const now = new Date();
  const tzOffsetHours = parseFloat(process.env.TIMEZONE_OFFSET_HOURS || '5.5');
  const localTime = new Date(now.getTime() + (tzOffsetHours * 60 * 60 * 1000));
  return {
    month: localTime.getUTCMonth() + 1,
    year: localTime.getUTCFullYear()
  };
}

/**
 * Helper: robust overlap calculator for approved leaves inside a month
 */
async function calculateLeavesTaken(userId, month, year, client = pool) {
  const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const endStr = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;
  const startOfMonth = new Date(startStr);
  const endOfMonth = new Date(endStr);
  
  const { rows } = await client.query(
    `SELECT start_date, end_date FROM leave_requests 
     WHERE user_id = $1 AND status = 'approved' 
       AND NOT (end_date < $2 OR start_date > $3)`,
    [userId, startStr, endStr]
  );

  let totalDays = 0;
  for (const row of rows) {
    const leaveStart = new Date(row.start_date);
    const leaveEnd = new Date(row.end_date);
    
    // Find overlap range
    const overlapStart = new Date(Math.max(leaveStart.getTime(), startOfMonth.getTime()));
    const overlapEnd = new Date(Math.min(leaveEnd.getTime(), endOfMonth.getTime()));
    
    const diffMs = overlapEnd.getTime() - overlapStart.getTime();
    if (diffMs >= 0) {
      const days = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
      totalDays += days;
    }
  }
  return totalDays;
}

/**
 * Helper: generates the complete historical snapshot object for a month
 */
async function generateSnapshot(month, year, client = pool) {
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;

  // 1. Revenue aggregations
  const projValueRes = await client.query('SELECT COALESCE(SUM(amount), 0) as val FROM project_document_amounts');
  const totalProjectValue = parseFloat(projValueRes.rows[0].val);

  // Billed, Pending driven by invoices in this period
  const invoiceRes = await client.query(
    `SELECT
       COALESCE(SUM(amount), 0)                                                        AS billed,
       COALESCE(SUM(CASE WHEN LOWER(status) != 'paid' THEN GREATEST(amount - received_amount, 0) ELSE 0 END), 0) AS pending
     FROM invoices
     WHERE LOWER(status) != 'cancelled' AND date >= $1 AND date <= $2`,
    [monthStart, monthEnd]
  );

  // Received driven by transactions within this period + fallback invoices with no transactions
  const txnRes = await client.query(
    `WITH combined_received AS (
       SELECT t.amount, t.date
       FROM transactions t
       WHERE t.type = 'income' AND t.category = 'project_receipt'

       UNION ALL

       SELECT i.received_amount AS amount, i.date
       FROM invoices i
       WHERE LOWER(i.status) != 'cancelled'
         AND NOT EXISTS (
           SELECT 1 FROM transactions t
           WHERE t.type = 'income' AND t.category = 'project_receipt'
             AND t.reference_id = i.invoice_no
         )
     )
     SELECT COALESCE(SUM(amount), 0) AS received
     FROM combined_received
     WHERE date >= $1 AND date <= $2`,
    [monthStart, monthEnd]
  );

  const billed = parseFloat(invoiceRes.rows[0].billed);
  const received = parseFloat(txnRes.rows[0].received);
  const pending = parseFloat(invoiceRes.rows[0].pending);
  const unbilled = Math.max(0, totalProjectValue - billed);

  // 2. Expenses aggregations
  const overheadRes = await client.query(
    `SELECT COALESCE(SUM(oe.amount), 0) as val 
     FROM office_expenses oe
     INNER JOIN expense_audits ea ON LOWER(ea.category) = LOWER(oe.category) 
     WHERE oe.date >= $1 AND oe.date <= $2 
       AND ea.month = $3 AND ea.year = $4 AND ea.is_verified = TRUE`,
    [monthStart, monthEnd, month, year]
  );
  const officeOverhead = parseFloat(overheadRes.rows[0].val);

  const payrollCheckRes = await client.query(
    `SELECT 
       COALESCE(SUM(net_paid - incentives), 0) as base_salaries,
       COALESCE(SUM(incentives), 0) as incentives
     FROM payroll
     WHERE month = $1 AND year = $2 AND status = 'paid'`,
    [month, year]
  );
  const baseSalariesRaw = parseFloat(payrollCheckRes.rows[0].base_salaries);
  const incentivesRaw = parseFloat(payrollCheckRes.rows[0].incentives);

  // Check verification states
  const auditRes = await client.query(
    `SELECT LOWER(category) as category FROM expense_audits 
     WHERE month = $1 AND year = $2 AND is_verified = TRUE 
       AND LOWER(category) IN ('salaries', 'incentives')`,
    [month, year]
  );
  const verifiedCats = auditRes.rows.map(r => r.category);

  const isSalVerified = verifiedCats.includes('salaries');
  const isIncVerified = verifiedCats.includes('incentives');

  const payroll = (isSalVerified ? baseSalariesRaw : 0) + (isIncVerified ? incentivesRaw : 0);
  const vendorPayments = 0; // Vendor payments are excluded from accounting calculations

  // All other transactions expenses
  const otherExpRes = await client.query(
    `SELECT COALESCE(SUM(t.amount), 0) as val 
     FROM transactions t
     INNER JOIN expense_audits ea ON LOWER(ea.category) = LOWER(t.category)
     WHERE t.type = 'expense' 
       AND LOWER(t.category) NOT IN ('vendor_payment', 'vendor payment', 'salary', 'incentive', 'salaries', 'incentives') 
       AND t.vendor_id IS NULL
       AND t.date >= $1 AND t.date <= $2
       AND ea.month = $3 AND ea.year = $4 AND ea.is_verified = TRUE`,
    [monthStart, monthEnd, month, year]
  );
  const otherExpenses = parseFloat(otherExpRes.rows[0].val);
  const totalExpenses = officeOverhead + payroll + vendorPayments + otherExpenses;

  // Breakdown by category
  const breakdownRes = await client.query(
    `SELECT category, SUM(amount) as amount FROM (
       SELECT oe.category, oe.amount 
       FROM office_expenses oe
       INNER JOIN expense_audits ea ON LOWER(ea.category) = LOWER(oe.category)
       WHERE oe.date >= $1 AND oe.date <= $2 
         AND ea.month = $3 AND ea.year = $4 AND ea.is_verified = TRUE
       
       UNION ALL
       
       SELECT t.category, t.amount 
       FROM transactions t
       INNER JOIN expense_audits ea ON LOWER(ea.category) = LOWER(t.category)
       WHERE t.type = 'expense' 
         AND LOWER(t.category) NOT IN ('vendor_payment', 'vendor payment', 'salary', 'incentive', 'salaries', 'incentives') 
         AND t.vendor_id IS NULL
         AND t.date >= $1 AND t.date <= $2
         AND ea.month = $3 AND ea.year = $4 AND ea.is_verified = TRUE
     ) sub
     GROUP BY category`,
    [monthStart, monthEnd, month, year]
  );
  const byCategory = {};
  breakdownRes.rows.forEach(r => {
    byCategory[r.category] = parseFloat(r.amount);
  });
  
  // Inject payroll net paid as salaries, incentives if verified
  if (isSalVerified && baseSalariesRaw > 0) {
    byCategory['Salaries'] = (byCategory['Salaries'] || 0) + baseSalariesRaw;
  }
  if (isIncVerified && incentivesRaw > 0) {
    byCategory['Incentives'] = (byCategory['Incentives'] || 0) + incentivesRaw;
  }

  // 3. HR details
  const empRes = await client.query("SELECT COUNT(*) as count FROM users WHERE role IN ('employee', 'admin', 'back_office', 'accounts', 'design_head', 'design', 'liasoning', 'civil_engineer', 'project_head') AND is_active IS NOT FALSE");
  const totalEmployees = parseInt(empRes.rows[0].count);

  const processedRes = await client.query("SELECT COUNT(*) as count FROM payroll WHERE month = $1 AND year = $2 AND status = 'paid'", [month, year]);
  const payrollProcessed = parseInt(processedRes.rows[0].count);

  const totalLeavesRes = await client.query(
    `SELECT COALESCE(SUM(amount), 0) as val FROM leave_requests 
     WHERE status = 'approved' AND start_date >= $1 AND end_date <= $2`,
    [monthStart, monthEnd]
  );
  const totalLeaveDaysTaken = parseFloat(totalLeavesRes.rows[0].val);

  // 4. Projects & Clients & Vendors
  const activeProjRes = await client.query("SELECT COUNT(*) as count FROM projects WHERE status != 'Completed'");
  const compProjRes = await client.query(
    "SELECT COUNT(*) as count FROM projects WHERE status = 'Completed' AND start_date >= $1 AND start_date <= $2",
    [monthStart, monthEnd]
  );
  const newProjRes = await client.query(
    "SELECT COUNT(*) as count FROM projects WHERE created_at >= $1 AND created_at <= $2",
    [monthStart, monthEnd]
  );

  return {
    revenue: {
      total_project_value: totalProjectValue,
      billed: billed,
      received: received,
      pending: pending,
      unbilled: unbilled
    },
    expenses: {
      total: totalExpenses,
      office_overhead: officeOverhead,
      payroll: payroll,
      vendor_payments: vendorPayments,
      by_category: byCategory
    },
    profit_loss: {
      realized: received - totalExpenses,
      projected: billed - totalExpenses
    },
    hr: {
      total_employees: totalEmployees,
      payroll_processed: payrollProcessed,
      payroll_pending: Math.max(0, totalEmployees - payrollProcessed),
      total_leave_days_taken: totalLeaveDaysTaken
    },
    projects: {
      total_active: parseInt(activeProjRes.rows[0].count),
      completed_this_month: parseInt(compProjRes.rows[0].count),
      new_this_month: parseInt(newProjRes.rows[0].count)
    }
  };
}

/**
 * GET /api/monthly-close/preview
 * Returns preflight details & diagnostics for a month before closing.
 */
router.get('/preview', requireAccounting, async (req, res) => {
  const month = parseInt(req.query.month);
  const year = parseInt(req.query.year);

  if (!month || !year || month < 1 || month > 12 || year < 2020) {
    return res.status(400).json({ error: 'Valid month (1-12) and year are required' });
  }

  const current = getCurrentLocalMonthAndYear();
  if (year > current.year || (year === current.year && month >= current.month)) {
    return res.status(400).json({ error: 'Cannot preview or close the current or future periods' });
  }

  try {
    const monthLabel = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

    // 1. Already closed check
    const { rows: closedRows } = await pool.query(
      'SELECT id FROM monthly_closing_log WHERE month = $1 AND year = $2',
      [month, year]
    );
    const alreadyClosed = closedRows.length > 0;

    // 2. Payroll pending count & details
    const empRes = await pool.query(
      "SELECT id, name, base_salary, hourly_rate FROM users WHERE role IN ('employee', 'admin', 'back_office', 'accounts', 'design_head', 'design', 'liasoning', 'civil_engineer', 'project_head') AND is_active IS NOT FALSE"
    );
    const payrollProcessedRes = await pool.query(
      "SELECT user_id, status FROM payroll WHERE month = $1 AND year = $2",
      [month, year]
    );
    const processedIds = new Set(payrollProcessedRes.rows.filter(r => r.status === 'paid').map(r => r.user_id));

    const pendingEmployees = empRes.rows.filter(emp => !processedIds.has(emp.id));
    const pendingCount = pendingEmployees.length;
    const pendingAmount = pendingEmployees.reduce((sum, emp) => sum + (parseFloat(emp.base_salary) || 0), 0);
    const pendingNames = pendingEmployees.map(emp => emp.name);

    // 3. Expense auditing category counts
    // Find all unique expense categories recorded in transactions or office expenses this month
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;
    
    const catRes = await pool.query(
      `WITH active_categories AS (
          SELECT DISTINCT category FROM transactions 
          WHERE type = 'expense' AND LOWER(category) NOT IN ('vendor_payment', 'vendor payment', 'salary', 'incentive', 'salaries', 'incentives') AND vendor_id IS NULL
            AND date >= $1 AND date <= $2
         UNION
         SELECT DISTINCT category FROM office_expenses 
         WHERE date >= $1 AND date <= $2
       )
       SELECT ac.category, COALESCE(ea.is_verified, FALSE) as is_verified
       FROM active_categories ac
       LEFT JOIN expense_audits ea ON LOWER(ea.category) = LOWER(ac.category) AND ea.month = $3 AND ea.year = $4`,
      [monthStart, monthEnd, month, year]
    );

    const categoriesToLock = catRes.rows.filter(r => !r.is_verified).length;
    const alreadyLocked = catRes.rows.filter(r => r.is_verified).length;

    // 4. J2: Replace per-employee N+1 loop with a single bulk SQL aggregation
    const monthStartLv = `${year}-${String(month).padStart(2, '0')}-01`;
    const monthEndLv   = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;
    const { rows: leaveAggRows } = await pool.query(
      `SELECT COALESCE(SUM(
         LEAST(end_date::date, $2::date) - GREATEST(start_date::date, $1::date) + 1
       ), 0) AS total_days
       FROM leave_requests
       WHERE status = 'approved'
         AND NOT (end_date < $1 OR start_date > $2)`,
      [monthStartLv, monthEndLv]
    );
    const totalLeaveDays = parseFloat(leaveAggRows[0]?.total_days || 0);

    // 5. Aggregate financial data
    const financials = await generateSnapshot(month, year);

    // Fetch app_settings for payroll calculations
    const { rows: settingsRows } = await pool.query('SELECT key, value FROM app_settings');
    const settings = settingsRows.reduce((acc, r) => {
      acc[r.key] = r.value;
      return acc;
    }, {});

    // Check for out-of-sync payrolls
    const { rows: savedPayrolls } = await pool.query(
      "SELECT user_id, base_salary, bonus, incentives, deductions, net_paid FROM payroll WHERE month = $1 AND year = $2",
      [month, year]
    );
    const savedPayrollMap = new Map(savedPayrolls.map(p => [p.user_id, p]));

    const outOfSyncNames = [];
    for (const emp of empRes.rows) {
      const saved = savedPayrollMap.get(emp.id);
      if (saved) {
        // Recalculate on-the-fly
        const currentPayroll = await calculatePayrollForEmployee(emp.id, month, year, settings, pool);
        if (currentPayroll) {
          const currentDeductions = Math.round(currentPayroll.deductions || 0);
          const savedDeductions = Math.round(parseFloat(saved.deductions || 0));
          if (currentDeductions !== savedDeductions) {
            outOfSyncNames.push(`${emp.name} (Diff: ₹${Math.abs(currentDeductions - savedDeductions)})`);
          }
        }
      }
    }

    // 6. Set warning list
    const warnings = [];
    if (pendingCount > 0) {
      warnings.push(`${pendingCount} employee payroll${pendingCount > 1 ? 's' : ''} not yet processed (${pendingNames.join(', ')} — ₹${pendingAmount.toLocaleString()} pending)`);
    }
    if (outOfSyncNames.length > 0) {
      warnings.push(`Payroll for ${outOfSyncNames.length} employee(s) is out-of-sync with updated attendance: ${outOfSyncNames.join(', ')}. (These will be auto-corrected upon Month Close execution)`);
    }

    res.json({
      month,
      year,
      month_label: monthLabel,
      already_closed: alreadyClosed,
      financials: {
        received_income: financials.revenue.received,
        total_expense: financials.expenses.total,
        net_pl: financials.profit_loss.realized,
        total_project_value: financials.revenue.total_project_value,
        pending_income: financials.revenue.pending
      },
      payroll: {
        employees_processed: empRes.rows.length - pendingCount,
        employees_pending: pendingCount,
        pending_amount: pendingAmount,
        pending_names: pendingNames
      },
      leave: {
        entries_to_write: empRes.rows.length,
        total_leave_days_this_month: totalLeaveDays
      },
      expense_audit: {
        categories_to_lock: categoriesToLock,
        already_locked: alreadyLocked
      },
      warnings
    });
  } catch (err) {
    console.error('Closing preview error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/monthly-close/execute
 * Executes the month closing inside a database transaction.
 */
/**
 * Core transactional function to execute a month close.
 * Reusable by both the HTTP endpoint and the automated background scheduler.
 */
async function executeMonthCloseInternal(month, year, closedByUserId = null, closeReason = '') {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Guard check: Already closed?
    const { rows: closedRows } = await client.query(
      'SELECT id FROM monthly_closing_log WHERE month = $1 AND year = $2',
      [month, year]
    );
    if (closedRows.length > 0) {
      await client.query('ROLLBACK');
      throw new Error('This month is already closed');
    }

    // 2. Identify employees and compute leave balances
    const empRes = await client.query("SELECT id, role FROM users WHERE role IN ('employee', 'admin', 'back_office', 'accounts', 'design_head', 'design', 'liasoning', 'civil_engineer', 'project_head') AND is_active IS NOT FALSE");
    
    // Fetch app_settings for payroll calculations
    const { rows: settingsRows } = await client.query('SELECT key, value FROM app_settings');
    const settings = settingsRows.reduce((acc, r) => {
      acc[r.key] = r.value;
      return acc;
    }, {});

    // Previous month computation
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;

    for (const emp of empRes.rows) {
      // Get previous month's closing leave balance
      const { rows: prevBalRows } = await client.query(
        'SELECT closing_balance FROM employee_leave_balance WHERE user_id = $1 AND month = $2 AND year = $3',
        [emp.id, prevMonth, prevYear]
      );
      const openingBalance = prevBalRows[0] ? parseFloat(prevBalRows[0].closing_balance) : 0.00;
      const earned = 1.50; // standard 1.5 days accumulated per month
      
      const leavesTaken = await calculateLeavesTaken(emp.id, month, year, client);
      
      // Calculate balances
      const closingBalance = Math.max(0, openingBalance + earned - leavesTaken);
      const unpaidLeaves = Math.max(0, leavesTaken - (openingBalance + earned));

      // Upsert into employee_leave_balance
      await client.query(
        `INSERT INTO employee_leave_balance (user_id, month, year, opening_balance, earned, leaves_taken, closing_balance, unpaid_leaves)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id, month, year) 
         DO UPDATE SET
           opening_balance = EXCLUDED.opening_balance,
           earned = EXCLUDED.earned,
           leaves_taken = EXCLUDED.leaves_taken,
           closing_balance = EXCLUDED.closing_balance,
           unpaid_leaves = EXCLUDED.unpaid_leaves`,
        [emp.id, month, year, openingBalance, earned, leavesTaken, closingBalance, unpaidLeaves]
      );

      // Sync to employee_leave_summary for backward compatibility with payroll calculators
      await client.query(
        `INSERT INTO employee_leave_summary (user_id, month, year, unpaid_leaves)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, month, year) 
         DO UPDATE SET unpaid_leaves = EXCLUDED.unpaid_leaves`,
        [emp.id, month, year, unpaidLeaves]
      );

      // Auto-recalculate and sync payroll for this employee
      const payrollData = await calculatePayrollForEmployee(emp.id, month, year, settings, client);
      if (payrollData) {
        // Check if a payroll record already exists to preserve manual bonus/incentives or manual override
        const { rows: existingPayroll } = await client.query(
          'SELECT base_salary, bonus, incentives, deductions, net_paid, status, payment_date, is_manual_override FROM payroll WHERE user_id = $1 AND month = $2 AND year = $3',
          [emp.id, month, year]
        );

        let finalBaseSalary = parseFloat(payrollData.employee.base_salary || 0);
        let finalBonus = 0;
        let finalIncentives = 0;
        let finalDeductions = parseFloat(payrollData.deductions || 0);
        let finalStatus = 'paid';
        let finalPaymentDate = new Date();
        let isOverride = false;

        if (existingPayroll.length > 0) {
          const existing = existingPayroll[0];
          finalBaseSalary = parseFloat(existing.base_salary);
          finalBonus = parseFloat(existing.bonus || 0);
          finalIncentives = parseFloat(existing.incentives || 0);
          finalStatus = existing.status || 'paid';
          finalPaymentDate = existing.payment_date;
          isOverride = existing.is_manual_override === true;

          if (isOverride) {
            // PRESERVE admin's manually approved deductions and net_paid
            finalDeductions = parseFloat(existing.deductions || 0);
          }
        }

        const finalOvertime = parseFloat(payrollData.overtime_earnings || 0);
        const finalOvertimeHours = parseFloat(payrollData.total_overtime_hours || 0);
        let finalNetPaid = Math.max(0, parseFloat(payrollData.net_salary_payable || 0) + finalBonus + finalIncentives);
        if (isOverride && existingPayroll.length > 0) {
          finalNetPaid = parseFloat(existingPayroll[0].net_paid || finalNetPaid);
        }

        await client.query(
          `INSERT INTO payroll (user_id, base_salary, bonus, incentives, deductions, net_paid, overtime_pay, overtime_hours, month, year, payment_date, status, is_manual_override)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (user_id, month, year) 
           DO UPDATE SET 
             base_salary = EXCLUDED.base_salary,
             bonus = EXCLUDED.bonus,
             incentives = EXCLUDED.incentives,
             deductions = EXCLUDED.deductions,
             net_paid = EXCLUDED.net_paid,
             overtime_pay = EXCLUDED.overtime_pay,
             overtime_hours = EXCLUDED.overtime_hours,
             payment_date = EXCLUDED.payment_date,
             status = EXCLUDED.status,
             is_manual_override = EXCLUDED.is_manual_override`,
          [emp.id, finalBaseSalary, finalBonus, finalIncentives, finalDeductions, finalNetPaid, finalOvertime, finalOvertimeHours, month, year, finalPaymentDate, finalStatus, isOverride]
        );
      }
    }

    // 3. Lock expense categories
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;

    // 4. Generate final financial snapshot (respects existing expense_audits verified choices)
    const snapshot = await generateSnapshot(month, year, client);

    // 5. Soft-blocker auditing
    // Check if payroll had any pending employees
    const payrollProcessedRes = await client.query(
      "SELECT user_id FROM payroll WHERE month = $1 AND year = $2 AND status = 'paid'",
      [month, year]
    );
    const processedIds = new Set(payrollProcessedRes.rows.map(r => r.user_id));
    const pendingEmployees = empRes.rows.filter(emp => !processedIds.has(emp.id));
    const pendingCount = pendingEmployees.length;

    let pendingAmount = 0;
    if (pendingCount > 0) {
      // Look up base salary to sum pending amount
      const pendingIds = pendingEmployees.map(emp => emp.id);
      const salaryRes = await client.query(
        "SELECT COALESCE(SUM(base_salary), 0) as total FROM users WHERE id = ANY($1)",
        [pendingIds]
      );
      pendingAmount = parseFloat(salaryRes.rows[0].total);
    }

    const hadPendingPayroll = pendingCount > 0;

    // 5.5 Write/transfer this profit to company_capital ledger
    const profit = snapshot.profit_loss.realized;
    await client.query(
      `INSERT INTO company_capital (month, year, amount, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (month, year) 
       DO UPDATE SET amount = EXCLUDED.amount, description = EXCLUDED.description`,
      [month, year, profit, `Capital transferred from profit of ${new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' })} ${year}`]
    );

    // 6. Write record into monthly_closing_log
    const { rows: closeLogRows } = await client.query(
      `INSERT INTO monthly_closing_log 
       (month, year, closed_by, closed_at, had_pending_payroll, pending_payroll_count, pending_payroll_amount, close_reason, snapshot)
       VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8)
       RETURNING *`,
      [month, year, closedByUserId, hadPendingPayroll, pendingCount, pendingAmount, closeReason, snapshot]
    );

    await logAudit({
      userId: closedByUserId,
      action: 'MONTH_CLOSE_EXECUTE',
      entityType: 'monthly_closing_log',
      entityId: closeLogRows[0].id,
      newValue: closeLogRows[0]
    }, client);

    await client.query('COMMIT');
    return closeLogRows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * POST /api/monthly-close/execute
 * Executes the month closing inside a database transaction.
 */
router.post('/execute', requireAdmin, async (req, res) => {
  const month = parseInt(req.body.month);
  const year = parseInt(req.body.year);
  const closeReason = req.body.reason || '';

  if (!month || !year || month < 1 || month > 12 || year < 2020) {
    return res.status(400).json({ error: 'Valid month (1-12) and year are required' });
  }

  const current = getCurrentLocalMonthAndYear();
  if (year > current.year || (year === current.year && month >= current.month)) {
    return res.status(400).json({ error: 'Cannot preview or close the current or future periods' });
  }

  try {
    const closedRecord = await executeMonthCloseInternal(month, year, req.user.id, closeReason);
    res.status(201).json(closedRecord);
  } catch (err) {
    console.error('Closing execution failed:', err);
    if (err.message === 'This month is already closed') {
      return res.status(409).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/monthly-close/history
 * Returns the timeline list of all closed months, newest first.
 */
router.get('/history', requireAccounting, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT mcl.*, u.name as closed_by_name,
              EXISTS (SELECT 1 FROM period_unlock_log pul WHERE pul.month = mcl.month AND pul.year = mcl.year AND pul.is_active = TRUE) as is_unlocked
       FROM monthly_closing_log mcl
       LEFT JOIN users u ON u.id = mcl.closed_by
       ORDER BY mcl.year DESC, mcl.month DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/monthly-close/history/:month/:year
 * Returns detailed drill-down snapshot of a specific closed month.
 */
router.get('/history/:month/:year', requireAccounting, async (req, res) => {
  const month = parseInt(req.params.month);
  const year = parseInt(req.params.year);

  try {
    const { rows } = await pool.query(
      `SELECT mcl.*, u.name as closed_by_name 
       FROM monthly_closing_log mcl
       LEFT JOIN users u ON u.id = mcl.closed_by
       WHERE mcl.month = $1 AND mcl.year = $2`,
      [month, year]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'No history record found for this month' });
    }

    // Also fetch the rolling leave balance records of this month
    const { rows: leaves } = await pool.query(
      `SELECT elb.*, u.name as employee_name, u.department 
       FROM employee_leave_balance elb
       JOIN users u ON u.id = elb.user_id
       WHERE elb.month = $1 AND elb.year = $2
       ORDER BY u.name ASC`,
      [month, year]
    );

    // Also fetch backdated audit trail logs of this month
    const { rows: unlocks } = await pool.query(
      `SELECT pul.*, u1.name as unlocked_by_name, u2.name as relocked_by_name
       FROM period_unlock_log pul
       LEFT JOIN users u1 ON u1.id = pul.unlocked_by
       LEFT JOIN users u2 ON u2.id = pul.relocked_by
       WHERE pul.month = $1 AND pul.year = $2
       ORDER BY pul.unlocked_at DESC`,
      [month, year]
    );

    res.json({
      log: rows[0],
      leaves,
      unlocks
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/monthly-close/unlock
 * Admin-only: unlocks a period for backdated entries, capturing a reason.
 */
router.post('/unlock', requireAdmin, async (req, res) => {
  const month = parseInt(req.body.month);
  const year = parseInt(req.body.year);
  const reason = req.body.reason;

  if (!month || !year || !reason) {
    return res.status(400).json({ error: 'Month, year and reason are required' });
  }

  try {
    // Check if period is closed first
    const { rows: closed } = await pool.query(
      'SELECT id FROM monthly_closing_log WHERE month = $1 AND year = $2',
      [month, year]
    );
    if (closed.length === 0) {
      return res.status(400).json({ error: 'This period is not closed, so it cannot be unlocked' });
    }

    // Insert active unlock window
    const { rows } = await pool.query(
      `INSERT INTO period_unlock_log (month, year, unlocked_by, reason, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING *`,
      [month, year, req.user.id, reason]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/monthly-close/relock
 * Admin-only: re-locks an unlocked period.
 */
router.post('/relock', requireAdmin, async (req, res) => {
  const month = parseInt(req.body.month);
  const year = parseInt(req.body.year);

  if (!month || !year) {
    return res.status(400).json({ error: 'Month and year are required' });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE period_unlock_log 
       SET is_active = FALSE, relocked_at = NOW(), relocked_by = $1
       WHERE month = $2 AND year = $3 AND is_active = TRUE
       RETURNING *`,
      [req.user.id, month, year]
    );

    // Regenerate snapshot in monthly_closing_log to reflect updated verified expenses
    const snapshot = await generateSnapshot(month, year, pool);
    await pool.query(
      `UPDATE monthly_closing_log 
       SET snapshot = $1 
       WHERE month = $2 AND year = $3`,
      [snapshot, month, year]
    );

    const profit = snapshot.profit_loss.realized;
    await pool.query(
      `INSERT INTO company_capital (month, year, amount, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (month, year) 
       DO UPDATE SET amount = EXCLUDED.amount, description = EXCLUDED.description`,
      [month, year, profit, `Capital transferred from profit of ${new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' })} ${year}`]
    );

    res.json({ message: 'Period re-locked successfully', logsUpdated: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/monthly-close/:month/:year
 * Admin-only: reverses a month close entirely.
 */
router.delete('/:month/:year', requireAdmin, async (req, res) => {
  const month = parseInt(req.params.month);
  const year  = parseInt(req.params.year);

  // J3: Validate params to avoid confusing DB errors on bad input
  if (isNaN(month) || isNaN(year) || month < 1 || month > 12 || year < 2020) {
    return res.status(400).json({ error: 'Valid month (1-12) and year (≥2020) are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if subsequent months are already closed
    const { rows: laterClosed } = await client.query(
      `SELECT month, year FROM monthly_closing_log 
       WHERE (year > $1) OR (year = $1 AND month > $2)
       LIMIT 1`,
      [year, month]
    );
    if (laterClosed.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Cannot reverse closing for ${month}/${year} because a subsequent month (${laterClosed[0].month}/${laterClosed[0].year}) is already closed. Please reverse subsequent months first.`
      });
    }

    // 1. Delete closing log
    const logRes = await client.query(
      'DELETE FROM monthly_closing_log WHERE month = $1 AND year = $2 RETURNING id',
      [month, year]
    );
    if (logRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'No closed record found to reverse' });
    }

    // 2. Delete rolling leave balances & summaries of this month
    await client.query('DELETE FROM employee_leave_balance WHERE month = $1 AND year = $2', [month, year]);
    await client.query('DELETE FROM employee_leave_summary WHERE month = $1 AND year = $2', [month, year]);
    await client.query('DELETE FROM company_capital WHERE month = $1 AND year = $2', [month, year]);

    // 3. Unlock expense categories of this month
    await client.query(
      'UPDATE expense_audits SET is_verified = FALSE, verified_at = NOW(), verified_by = $1 WHERE month = $2 AND year = $3',
      [req.user.id, month, year]
    );

    // 4. Deactivate all unlock windows
    await client.query(
      'UPDATE period_unlock_log SET is_active = FALSE, relocked_at = NOW(), relocked_by = $1 WHERE month = $2 AND year = $3',
      [req.user.id, month, year]
    );

    // 5. Log explicit reversal in period_unlock_log
    await client.query(
      `INSERT INTO period_unlock_log (month, year, unlocked_by, reason, is_active)
       VALUES ($1, $2, $3, 'Month closing explicitly reversed', FALSE)`,
      [month, year, req.user.id]
    );

    await client.query('COMMIT');
    const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' });
    res.json({ message: `Month closing of ${monthName} ${year} has been successfully reversed.` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Month closing reversal failed:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.executeMonthCloseInternal = executeMonthCloseInternal;
module.exports = router;
