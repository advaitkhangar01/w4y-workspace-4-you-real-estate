// server/routes/dashboard.js
const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAdmin, requireAccounting } = require('../middleware/auth');
const { getISTDate, getISTTime } = require('../utils/date');
const { calculatePayrollForEmployee } = require('../utils/payroll');

async function calculateSalaryStats(userId, month, year, todayStr, settings) {
  try {
    const payrollData = await calculatePayrollForEmployee(userId, month, year, settings, pool, todayStr);
    if (!payrollData) return null;

    // Find today's daily record in the processed daily logs
    const todayRecord = payrollData.processedAttendance?.find(r => r.date === todayStr);

    const isMonthInProgress = !!payrollData.is_month_in_progress;
    // Canonical contract:
    // earned_this_month = sum of all elapsed daily earnings including today's eligible attendance (accrued: 17751.61)
    // deductions_this_month = total attendance + late deductions to date (5237.77)
    // net_salary_payable = current accrued net payable (17751.61 - 5237.77 = 12513.84)
    // projected_month_end_net = full month base salary projection (26601.61)
    const accruedEarnings = parseFloat(payrollData.accrued_earnings_to_date || payrollData.accrued_salary || 0);
    const netSalaryPayable = parseFloat(payrollData.current_net_payable !== undefined ? payrollData.current_net_payable : (payrollData.net_salary_payable || 0));
    const projectedMonthEndNet = parseFloat(payrollData.projected_month_end_net || payrollData.projected_net_salary || 0);
    const earnedThisMonth = isMonthInProgress ? accruedEarnings : netSalaryPayable;

    return {
      earned_this_month: Math.round(earnedThisMonth * 100) / 100,
      accrued_earnings_to_date: Math.round(accruedEarnings * 100) / 100,
      deductions_this_month: Math.round((payrollData.deductions || 0) * 100) / 100,
      total_deductions_to_date: Math.round((payrollData.deductions || 0) * 100) / 100,
      net_salary_payable: Math.round(netSalaryPayable * 100) / 100,
      current_net_payable: Math.round(netSalaryPayable * 100) / 100,
      projected_month_end_net: Math.round(projectedMonthEndNet * 100) / 100,
      projected_net_salary: Math.round(projectedMonthEndNet * 100) / 100,
      is_month_in_progress: isMonthInProgress,
      today_earned: todayRecord ? parseFloat(todayRecord.earnings || 0) : 0,
      today_deductions: todayRecord ? parseFloat(todayRecord.deduction || 0) : 0,
      late_count: payrollData.late_count || 0,
      half_day_count: payrollData.half_days || 0,
      leaves_count: payrollData.leaves_count || 0,
      unpaid_leaves: payrollData.unpaid_leaves || 0,
      unmarked_absent_count: payrollData.unmarked_absent_count || 0
    };
  } catch (err) {
    console.error('[Dashboard Warning] calculateSalaryStats failed, using fallback stats:', err.message);
    return {
      earned_this_month: 0,
      accrued_earnings_to_date: 0,
      net_salary_payable: 0,
      projected_net_salary: 0,
      is_month_in_progress: false,
      deductions_this_month: 0,
      today_earned: 0,
      today_deductions: 0,
      late_count: 0,
      half_day_count: 0,
      leaves_count: 0,
      unpaid_leaves: 0,
      unmarked_absent_count: 0
    };
  }
}

// Helper: get IST date string removed in favor of shared util

// GET /api/dashboard/admin
router.get('/admin', authenticate, requireAccounting, async (req, res) => {
  try {
    const today = getISTDate();

    // 1. Attendance summary (include everyone, separating leaves from absences)
    const { rows: attendanceRows } = await pool.query(
      `SELECT
         COUNT(*) AS total_users,
         COUNT(*) FILTER (WHERE a.check_in IS NOT NULL AND a.check_out IS NULL AND a.date = $1::date) AS checked_in,
         COUNT(*) FILTER (WHERE a.check_out IS NOT NULL AND a.date = $1::date) AS checked_out,
         COUNT(*) FILTER (
           WHERE a.check_in IS NULL 
             AND EXTRACT(DOW FROM $1::date) != 0
             AND NOT EXISTS (SELECT 1 FROM holidays WHERE date = $1::date)
             AND NOT EXISTS (
               SELECT 1 FROM leave_requests lr 
               WHERE lr.user_id = u.id 
                 AND LOWER(lr.status) = 'approved' 
                 AND lr.type NOT IN ('advance', 'resignation')
                 AND $1::date BETWEEN lr.start_date AND lr.end_date
             )
         ) AS absent,
         COUNT(*) FILTER (
           WHERE a.check_in IS NULL 
             AND EXISTS (
               SELECT 1 FROM leave_requests lr 
               WHERE lr.user_id = u.id 
                 AND LOWER(lr.status) = 'approved' 
                 AND lr.type NOT IN ('advance', 'resignation')
                 AND $1::date BETWEEN lr.start_date AND lr.end_date
             )
         ) AS on_leave
       FROM users u
       LEFT JOIN attendance a ON a.user_id = u.id AND a.date = $1::date
       WHERE u.is_active IS NOT FALSE`,
      [today]
    );
    const attendance = attendanceRows[0];
    const userId = req.user.id;
    // Derive month/year from IST date string (not new Date() which is UTC on VPS)
    // e.g. today = '2026-06-01' → year = 2026, month = 6
    const [year, month] = today.split('-').map(Number);

    // 2. Today's tasks (grouped by project)
    const { rows: taskRows } = await pool.query(
      `SELECT 
         t.id, t.title, t.status, t.created_at,
         p.id as project_id, p.name as project_name,
         u.name as assigned_to_name, u.username as assigned_to_username,
         au.name as assigned_by_name
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       JOIN users u ON u.id = t.assigned_to
       JOIN users au ON au.id = t.created_by
       WHERE t.assigned_to IS NOT NULL AND u.is_active IS NOT FALSE
         AND DATE(t.created_at AT TIME ZONE 'Asia/Kolkata') = $1::date
         AND t.status != 'passed'
         AND (t.start_date IS NULL OR t.start_date <= CURRENT_DATE)
       ORDER BY p.name, t.created_at DESC`,
      [today]
    );

    // Group tasks by project
    const tasksByProject = {};
    taskRows.forEach((t) => {
      if (!tasksByProject[t.project_id]) {
        tasksByProject[t.project_id] = { project_id: t.project_id, project_name: t.project_name, tasks: [] };
      }
      tasksByProject[t.project_id].tasks.push(t);
    });

    // 3. Kanban - projects grouped by status and stages
    let dashboardProjectsQuery = `
      SELECT p.id, p.name, p.client_name, p.type, p.status,
         COALESCE((SELECT json_agg(ps.* ORDER BY ps.id) FROM project_stages ps WHERE ps.project_id = p.id), '[]'::json) as stages
       FROM projects p
       ORDER BY p.created_at DESC LIMIT 100
    `;

    const { rows: projectRows } = await pool.query(dashboardProjectsQuery);
    console.log(`[DEBUG] Dashboard API: Found ${projectRows.length} projects`);

    const kanban = { pending: [], design_proposal: [], sanction: [], execution: [], completed: [] };
    projectRows.forEach((p) => {
      const stages = p.stages || [];
      // Find the first stage that isn't completed
      const activeStage = stages.find(s => s.status !== 'completed');
      
      let col = 'pending';
      if (!activeStage) {
        // If all stages are completed
        col = 'completed';
      } else if (activeStage.status === 'pending') {
        // If the current stage is pending, show in Pending column
        col = 'pending';
      } else {
        // Current stage is in_progress
        const name = activeStage.stage_name;
        if (name === 'Proposal' || name === 'Design') {
          col = 'design_proposal';
        } else if (name === 'Submission') {
          col = 'sanction';
        } else if (name === 'Working' || name === 'Execution') {
          col = 'execution';
        }
      }
      
      if (kanban[col]) {
        kanban[col].push(p);
      }
    });

    // 4. Project type summary counts
    const { rows: typeCountsRows } = await pool.query(
      `SELECT 
         COUNT(*) FILTER (WHERE type IN ('Construction', 'Apartment Residential', 'Residence', 'Temple', 'Hostel', 'Shopping Complex', 'Commercial', 'Industrial', 'Layout Development')) as construction,
         COUNT(*) FILTER (WHERE type IN ('Interior', 'Residential Interior', 'Commercial Interior', 'Flat Interior', 'Banquet Hall')) as interior,
         COUNT(*) FILTER (WHERE type IN ('Liasoning')) as liaisoning,
         COUNT(*) FILTER (WHERE type IN ('Rendering', 'Terrace Floor Plan')) as rendering
       FROM projects`
    );
    const type_counts = {
      construction: parseInt(typeCountsRows[0].construction || 0),
      interior: parseInt(typeCountsRows[0].interior || 0),
      liaisoning: parseInt(typeCountsRows[0].liaisoning || 0),
      rendering: parseInt(typeCountsRows[0].rendering || 0),
    };

    // 5. Financial Summary — scoped to current open accounting period
    // Determine the current period boundary: from 1st of current month to today
    // After a monthly close, only the current month's data is shown on the dashboard
    // (Pending amounts span all-time since outstanding invoices carry forward)
    const currentPeriodStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const currentPeriodEnd   = today; // IST today (yyyy-mm-dd)

    // 5a. Total Project Value (Potential) - Only for active stages: Design Proposal, Sanction, Execution
    const incomeQuery = `
      WITH active_stages AS (
        SELECT DISTINCT ON (project_id) project_id, stage_name, status
        FROM project_stages
        WHERE status != 'completed'
        ORDER BY project_id, id ASC
      ),
      project_categories AS (
        SELECT p.id as project_id,
          CASE 
            WHEN a.project_id IS NULL THEN 'completed'
            WHEN a.status = 'pending' THEN 'pending'
            WHEN a.stage_name IN ('Proposal', 'Design') THEN 'design_proposal'
            WHEN a.stage_name = 'Submission' THEN 'sanction'
            WHEN a.stage_name IN ('Working', 'Execution') THEN 'execution'
            ELSE 'pending'
          END as stage_category
        FROM projects p
        LEFT JOIN active_stages a ON p.id = a.project_id
      )
      SELECT COALESCE(SUM(pda.amount), 0) as total_value 
      FROM project_document_amounts pda
      JOIN project_categories pc ON pda.project_id = pc.project_id
      WHERE pc.stage_category IN ('design_proposal', 'sanction', 'execution')
    `;
    const { rows: incomeRows } = await pool.query(incomeQuery);
    const totalValue = parseFloat(incomeRows[0].total_value);

    // 5b. Billed/Received — scoped to the current month's invoices
    const invoiceQuery = `
      SELECT
        COALESCE(SUM(CASE WHEN date >= $1 AND date <= $2 THEN amount ELSE 0 END), 0)          AS billed,
        (
          SELECT COALESCE(SUM(amount), 0) 
          FROM transactions 
          WHERE type = 'income' AND category = 'project_receipt' 
            AND date >= $1 AND date <= $2
        ) + (
          SELECT COALESCE(SUM(received_amount), 0)
          FROM invoices i
          WHERE i.date >= $1 AND i.date <= $2
            AND LOWER(i.status) != 'cancelled'
            AND NOT EXISTS (
              SELECT 1 FROM transactions t
              WHERE t.type = 'income' AND t.category = 'project_receipt'
                AND t.reference_id = i.invoice_no
            )
        )                                                                                    AS received,
        COALESCE(SUM(received_amount), 0)                                                       AS all_time_received,
        COALESCE(SUM(CASE WHEN LOWER(status) != 'paid' THEN GREATEST(amount - received_amount, 0) ELSE 0 END), 0) AS pending
      FROM invoices
      WHERE LOWER(status) != 'cancelled'
    `;
    const { rows: invoiceRows } = await pool.query(invoiceQuery, [currentPeriodStart, currentPeriodEnd]);
    const billed          = parseFloat(invoiceRows[0].billed);
    const received        = parseFloat(invoiceRows[0].received);
    const allTimeReceived = parseFloat(invoiceRows[0].all_time_received);
    const pending         = parseFloat(invoiceRows[0].pending);

    // 5c. Expenses — scoped to current period (current month only)
    const expenseQuery = `
      SELECT COALESCE(SUM(t.amount), 0) as total_expense 
      FROM transactions t
      LEFT JOIN expense_audits ea ON LOWER(ea.category) = LOWER(t.category) 
        AND ea.month = EXTRACT(MONTH FROM t.date) 
        AND ea.year = EXTRACT(YEAR FROM t.date)
      WHERE t.type = 'expense' AND t.date >= $1 AND t.date <= $2
        AND LOWER(t.category) NOT IN ('vendor_payment', 'vendor payment', 'salary', 'incentive', 'salaries', 'incentives') AND t.vendor_id IS NULL
        AND ea.is_verified = TRUE
    `;
    const { rows: expRows } = await pool.query(expenseQuery, [currentPeriodStart, currentPeriodEnd]);
    const transactionExpense = parseFloat(expRows[0].total_expense);

    const { rows: payrollRows } = await pool.query(
      `SELECT 
         COALESCE(SUM(
           CASE 
             WHEN ea_sal.is_verified = TRUE AND ea_inc.is_verified = TRUE THEN p.net_paid
             WHEN ea_sal.is_verified = TRUE THEN (p.net_paid - p.incentives)
             WHEN ea_inc.is_verified = TRUE THEN p.incentives
             ELSE 0 
           END
         ), 0) as total_payroll 
       FROM payroll p
       LEFT JOIN expense_audits ea_sal ON ea_sal.category = 'Salaries' AND ea_sal.month = $1 AND ea_sal.year = $2
       LEFT JOIN expense_audits ea_inc ON ea_inc.category = 'Incentives' AND ea_inc.month = $1 AND ea_inc.year = $2
       WHERE p.status = 'paid' AND p.month = $1 AND p.year = $2`,
      [month, year]
    );
    const totalPayroll = parseFloat(payrollRows[0].total_payroll);

    const totalExpense = transactionExpense + totalPayroll;

    // 6. Admin's own salary stats
    const settingsRes = await pool.query('SELECT key, value FROM app_settings');
    const settings = settingsRes.rows.reduce((acc, row) => { acc[row.key] = row.value; return acc; }, {});
    const salaryStats = await calculateSalaryStats(userId, month, year, today, settings);

    // 7. All projects count
    const { rows: countRows } = await pool.query('SELECT COUNT(*) as count FROM projects');

    // 8. Active team leaves today & Upcoming team leaves (strictly approved)
    const { rows: activeTeamLeavesRows } = await pool.query(
      `SELECT lr.id, lr.user_id, u.name as user_name, u.department, lr.type, 
              to_char(lr.start_date, 'YYYY-MM-DD') as start_date, 
              to_char(lr.end_date, 'YYYY-MM-DD') as end_date, 
              lr.reason, lr.status
       FROM leave_requests lr
       JOIN users u ON u.id = lr.user_id
       WHERE LOWER(lr.status) = 'approved'
         AND u.is_active IS NOT FALSE
         AND lr.type NOT IN ('advance', 'resignation')
         AND $1::date BETWEEN lr.start_date AND lr.end_date
       ORDER BY u.name ASC`,
      [today]
    );

    const { rows: upcomingTeamLeavesRows } = await pool.query(
      `SELECT lr.id, lr.user_id, u.name as user_name, u.department, lr.type, 
              to_char(lr.start_date, 'YYYY-MM-DD') as start_date, 
              to_char(lr.end_date, 'YYYY-MM-DD') as end_date, 
              lr.reason, lr.status, r.name as reviewer_name
       FROM leave_requests lr
       JOIN users u ON u.id = lr.user_id
       LEFT JOIN users r ON r.id = lr.reviewed_by
       WHERE LOWER(lr.status) = 'approved'
         AND u.is_active IS NOT FALSE
         AND lr.type NOT IN ('advance', 'resignation')
         AND lr.start_date > $1::date
       ORDER BY lr.start_date ASC
       LIMIT 30`,
      [today]
    );

    res.json({
      attendance: {
        total: parseInt(attendance.total_users),
        checked_in: parseInt(attendance.checked_in),
        checked_out: parseInt(attendance.checked_out),
        absent: parseInt(attendance.absent),
        on_leave: parseInt(attendance.on_leave || 0),
      },
      todays_tasks: Object.values(tasksByProject),
      kanban,
      type_counts,
      finances: {
        total_amount:    totalValue,
        billed_amount:   billed,
        received_amount: received,
        pending_amount:  pending,
        expense_amount:  totalExpense,
        current_amount:  Math.max(0, totalValue - allTimeReceived)  // remaining uncollected from active pipeline
      },
      salary_stats: salaryStats,
      total_projects: parseInt(countRows[0].count),
      active_team_leaves: activeTeamLeavesRows,
      upcoming_team_leaves: upcomingTeamLeavesRows
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/dashboard/admin/finances/breakdown
router.get('/admin/finances/breakdown', authenticate, requireAccounting, async (req, res) => {
  try {
    const { type } = req.query;
    let items = [];

    const isGlobal = req.user.role === 'admin' || 
                     req.user.role === 'design_head' || 
                     req.user.role === 'project_head' || 
                     req.user.role === 'back_office' || 
                     req.user.role === 'accounts';

    const today = getISTDate();
    const [year, month] = today.split('-').map(Number);
    const currentPeriodStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const currentPeriodEnd   = today;

    if (type === 'total') {
      const { rows } = await pool.query(`
        WITH active_stages AS (
          SELECT DISTINCT ON (project_id) project_id, stage_name, status
          FROM project_stages
          WHERE status != 'completed'
          ORDER BY project_id, id ASC
        ),
        project_categories AS (
          SELECT p.id as project_id,
            CASE 
              WHEN a.project_id IS NULL THEN 'completed'
              WHEN a.status = 'pending' THEN 'pending'
              WHEN a.stage_name IN ('Proposal', 'Design') THEN 'design_proposal'
              WHEN a.stage_name = 'Submission' THEN 'sanction'
              WHEN a.stage_name IN ('Working', 'Execution') THEN 'execution'
              ELSE 'pending'
            END as stage_category
          FROM projects p
          LEFT JOIN active_stages a ON p.id = a.project_id
        )
        SELECT p.id, p.name, SUM(pda.amount) as amount
        FROM projects p
        JOIN project_document_amounts pda ON p.id = pda.project_id
        JOIN project_categories pc ON p.id = pc.project_id
        WHERE pc.stage_category IN ('design_proposal', 'sanction', 'execution')
          AND ($1::boolean OR p.status IN ('Sanction', 'Under Sanctioning'))
        GROUP BY p.id, p.name
        ORDER BY amount DESC
      `, [isGlobal]);
      items = rows;
    } else if (type === 'current') {
      const { rows: manualRes } = await pool.query(
        "SELECT COALESCE(SUM(amount), 0) as mi FROM transactions WHERE type = 'income'"
      );
      const manualIncome = parseFloat(manualRes[0].mi) || 0;

      const { rows } = await pool.query(
        manualIncome > 0
          ? `
            WITH active_stages AS (
              SELECT DISTINCT ON (project_id) project_id, stage_name, status
              FROM project_stages
              WHERE status != 'completed'
              ORDER BY project_id, id ASC
            ),
            project_categories AS (
              SELECT p.id as project_id,
                CASE 
                  WHEN a.project_id IS NULL THEN 'completed'
                  WHEN a.status = 'pending' THEN 'pending'
                  WHEN a.stage_name IN ('Proposal', 'Design') THEN 'design_proposal'
                  WHEN a.stage_name = 'Submission' THEN 'sanction'
                  WHEN a.stage_name IN ('Working', 'Execution') THEN 'execution'
                  ELSE 'pending'
                END as stage_category
              FROM projects p
              LEFT JOIN active_stages a ON p.id = a.project_id
            ),
            project_totals AS (
              SELECT project_id, SUM(amount) as total_val
              FROM project_document_amounts
              GROUP BY project_id
            ),
            project_received AS (
              SELECT project_id, SUM(amount) as rec_val
              FROM transactions
              WHERE type = 'income'
              GROUP BY project_id
            )
            SELECT p.id, p.name, 
              (COALESCE(pt.total_val, 0) - COALESCE(pr.rec_val, 0)) as amount
            FROM projects p
            JOIN project_categories pc ON p.id = pc.project_id
            LEFT JOIN project_totals pt ON p.id = pt.project_id
            LEFT JOIN project_received pr ON p.id = pr.project_id
            WHERE pc.stage_category IN ('design_proposal', 'sanction', 'execution')
              AND (COALESCE(pt.total_val, 0) - COALESCE(pr.rec_val, 0)) > 0
              AND ($1::boolean OR p.status IN ('Sanction', 'Under Sanctioning'))
            GROUP BY p.id, p.name, pt.total_val, pr.rec_val
            ORDER BY amount DESC
          `
          : `
            WITH active_stages AS (
              SELECT DISTINCT ON (project_id) project_id, stage_name, status
              FROM project_stages
              WHERE status != 'completed'
              ORDER BY project_id, id ASC
            ),
            project_categories AS (
              SELECT p.id as project_id,
                CASE 
                  WHEN a.project_id IS NULL THEN 'completed'
                  WHEN a.status = 'pending' THEN 'pending'
                  WHEN a.stage_name IN ('Proposal', 'Design') THEN 'design_proposal'
                  WHEN a.stage_name = 'Submission' THEN 'sanction'
                  WHEN a.stage_name IN ('Working', 'Execution') THEN 'execution'
                  ELSE 'pending'
                END as stage_category
              FROM projects p
              LEFT JOIN active_stages a ON p.id = a.project_id
            ),
            project_totals AS (
              SELECT project_id, SUM(amount) as total_val
              FROM project_document_amounts
              GROUP BY project_id
            ),
            project_received AS (
              SELECT project_id, SUM(amount) as rec_val
              FROM project_payment_stages
              WHERE LOWER(status) = 'paid' AND LOWER(status) != 'cancelled'
              GROUP BY project_id
            )
            SELECT p.id, p.name, 
              (COALESCE(pt.total_val, 0) - COALESCE(pr.rec_val, 0)) as amount
            FROM projects p
            JOIN project_categories pc ON p.id = pc.project_id
            LEFT JOIN project_totals pt ON p.id = pt.project_id
            LEFT JOIN project_received pr ON p.id = pr.project_id
            WHERE pc.stage_category IN ('design_proposal', 'sanction', 'execution')
              AND (COALESCE(pt.total_val, 0) - COALESCE(pr.rec_val, 0)) > 0
              AND ($1::boolean OR p.status IN ('Sanction', 'Under Sanctioning'))
            GROUP BY p.id, p.name, pt.total_val, pr.rec_val
            ORDER BY amount DESC
          `,
        [isGlobal]
      );
      items = rows;
    } else if (type === 'billed') {
      // Billed = non-cancelled invoices in the current period, grouped by project
      const { rows } = await pool.query(`
        SELECT p.id, p.name, SUM(i.amount) as amount
        FROM invoices i
        JOIN projects p ON p.id = i.project_id
        WHERE LOWER(i.status) != 'cancelled'
          AND i.project_id IS NOT NULL
          AND i.date >= $1 AND i.date <= $2
          AND ($3::boolean OR p.status IN ('Sanction', 'Under Sanctioning'))
        GROUP BY p.id, p.name
        HAVING SUM(i.amount) > 0
        ORDER BY amount DESC
      `, [currentPeriodStart, currentPeriodEnd, isGlobal]);
      items = rows;
    } else if (type === 'received') {
      // Received = payments collected in the current period, grouped by project
      const { rows } = await pool.query(`
        WITH combined_received AS (
          SELECT t.project_id, t.amount
          FROM transactions t
          WHERE t.type = 'income' AND t.category = 'project_receipt'
            AND t.date >= $1 AND t.date <= $2
            AND t.project_id IS NOT NULL

          UNION ALL

          SELECT i.project_id, i.received_amount AS amount
          FROM invoices i
          WHERE LOWER(i.status) != 'cancelled'
            AND i.project_id IS NOT NULL
            AND i.date >= $1 AND i.date <= $2
            AND NOT EXISTS (
              SELECT 1 FROM transactions t
              WHERE t.type = 'income' AND t.category = 'project_receipt'
                AND t.reference_id = i.invoice_no
            )
        )
        SELECT p.id, p.name, SUM(c.amount) as amount
        FROM combined_received c
        JOIN projects p ON p.id = c.project_id
        WHERE ($3::boolean OR p.status IN ('Sanction', 'Under Sanctioning'))
        GROUP BY p.id, p.name
        HAVING SUM(c.amount) > 0
        ORDER BY amount DESC
      `, [currentPeriodStart, currentPeriodEnd, isGlobal]);
      items = rows;
    } else if (type === 'pending') {
      // Pending = outstanding balance per project (invoice amount - received), for unpaid invoices
      const { rows } = await pool.query(`
        SELECT p.id, p.name,
          SUM(GREATEST(i.amount - i.received_amount, 0)) as amount
        FROM invoices i
        JOIN projects p ON p.id = i.project_id
        WHERE LOWER(i.status) NOT IN ('cancelled', 'paid')
          AND i.project_id IS NOT NULL
          AND ($1::boolean OR p.status IN ('Sanction', 'Under Sanctioning'))
        GROUP BY p.id, p.name
        HAVING SUM(GREATEST(i.amount - i.received_amount, 0)) > 0
        ORDER BY amount DESC
      `, [isGlobal]);
      items = rows;
    } else if (type === 'expenses') {
      // Expenses = transactions and payroll scoped to the current month/period
      const { rows } = await pool.query(`
        SELECT * FROM (
          SELECT t.id, t.description, t.category, t.amount, t.date, p.name as project_name
          FROM transactions t
          LEFT JOIN projects p ON p.id = t.project_id
          LEFT JOIN expense_audits ea ON LOWER(ea.category) = LOWER(t.category) 
            AND ea.month = EXTRACT(MONTH FROM t.date) 
            AND ea.year = EXTRACT(YEAR FROM t.date)
          WHERE t.type = 'expense' AND LOWER(t.category) NOT IN ('vendor_payment', 'vendor payment', 'salary', 'incentive', 'salaries', 'incentives') AND t.vendor_id IS NULL
            AND t.date >= $1 AND t.date <= $2
            AND ($5::boolean OR p.id IS NULL OR p.status IN ('Sanction', 'Under Sanctioning'))
            AND ea.is_verified = TRUE
          
          UNION ALL
          
          SELECT 
            p.id, 
            'Monthly salary payment' as description, 
            'Salaries' as category, 
            (p.net_paid - p.incentives) as amount, 
            p.payment_date as date, 
            NULL as project_name
          FROM payroll p
          LEFT JOIN expense_audits ea ON ea.category = 'Salaries' AND ea.month = $3 AND ea.year = $4
          WHERE p.status = 'paid'
            AND p.month = $3 AND p.year = $4
            AND ea.is_verified = TRUE
          
          UNION ALL
          
          SELECT 
            p.id, 
            'Performance incentive' as description, 
            'Incentives' as category, 
            p.incentives as amount, 
            p.payment_date as date, 
            NULL as project_name
          FROM payroll p
          LEFT JOIN expense_audits ea ON ea.category = 'Incentives' AND ea.month = $3 AND ea.year = $4
          WHERE p.status = 'paid' AND p.incentives > 0
            AND p.month = $3 AND p.year = $4
            AND ea.is_verified = TRUE
        ) combined_expenses
        ORDER BY date DESC
      `, [currentPeriodStart, currentPeriodEnd, month, year, isGlobal]);
      items = rows;
    }

    res.json({ items: items.map(i => ({ ...i, amount: parseFloat(i.amount || 0) })) });
  } catch (err) {
    console.error('Financial breakdown error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// GET /api/dashboard/salary-breakdown
// Returns full daily payroll breakdown for the logged-in employee (current month).
// Fetched lazily — only when the employee opens the breakdown modal.
router.get('/salary-breakdown', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const todayStr = getISTDate();
    const [year, month] = todayStr.split('-').map(Number);

    const settingsRes = await pool.query('SELECT key, value FROM app_settings');
    const settings = settingsRes.rows.reduce((acc, row) => { acc[row.key] = row.value; return acc; }, {});

    const payrollData = await calculatePayrollForEmployee(userId, month, year, settings, pool);
    if (!payrollData) return res.status(404).json({ error: 'No payroll data found' });

    const isMonthInProgress = !!payrollData.is_month_in_progress;
    const accruedEarnings = parseFloat(payrollData.accrued_earnings_to_date || payrollData.accrued_salary || 0);
    const netSalaryPayable = parseFloat(payrollData.current_net_payable !== undefined ? payrollData.current_net_payable : (payrollData.net_salary_payable || 0));
    const projectedMonthEndNet = parseFloat(payrollData.projected_month_end_net || payrollData.projected_net_salary || 0);
    const earnedThisMonth = isMonthInProgress ? accruedEarnings : netSalaryPayable;

    res.json({
      month,
      year,
      summary: {
        base_salary:           parseFloat(payrollData.employee.base_salary || 0),
        earned_this_month:     Math.round(earnedThisMonth * 100) / 100,
        accrued_earnings_to_date: Math.round(accruedEarnings * 100) / 100,
        deductions_this_month: Math.round((payrollData.deductions || 0) * 100) / 100,
        total_deductions_to_date: Math.round((payrollData.deductions || 0) * 100) / 100,
        net_salary_payable:    Math.round(netSalaryPayable * 100) / 100,
        current_net_payable:   Math.round(netSalaryPayable * 100) / 100,
        projected_month_end_net: Math.round(projectedMonthEndNet * 100) / 100,
        projected_net_salary:  Math.round(projectedMonthEndNet * 100) / 100,
        is_month_in_progress:  isMonthInProgress,
        late_deduction_amount: Math.round((payrollData.late_deduction_amount || 0) * 100) / 100,
        half_day_deduction_amount: Math.round((payrollData.half_day_deduction_amount || 0) * 100) / 100,
        absence_deduction_amount: Math.round((payrollData.absence_deduction_amount || 0) * 100) / 100,
        unpaid_leave_deduction_amount: Math.round((payrollData.unpaid_leave_deduction_amount || 0) * 100) / 100,
        full_days:             payrollData.full_days_worked,
        half_days:             payrollData.half_days_worked,
        late_count:            payrollData.late_count,
        leaves_count:          payrollData.leaves_count,
        unmarked_absent_count: payrollData.unmarked_absent_count,
        total_days:            payrollData.total_days,
        payable_days:          payrollData.payable_days,
        calculation_method:    payrollData.calculation_method,
      },
      daily: payrollData.processedAttendance,
    });
  } catch (err) {
    console.error('Salary breakdown error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/dashboard/employee
router.get('/employee', authenticate, async (req, res) => {
  try {
    const todayStr = getISTDate();
    // Extract month/year directly from IST date string to avoid UTC midnight parse issue
    const [year, month] = todayStr.split('-').map(Number);
    const userId = req.user.id;

    // 1. Today's attendance (self)
    const { rows: attRows } = await pool.query(
      `SELECT id, user_id, check_in, check_out, lat, lng, date, LOWER(status) AS status, is_late, late_minutes, 
              checkin_accuracy, checkin_distance, checkin_zone, is_boundary_checkin, checkin_verified, 
              checkout_lat, checkout_lng, checkout_accuracy, checkout_distance, checkout_zone, checkout_outside_zone, hours_worked 
       FROM attendance WHERE user_id = $1 AND date = $2::date`,
      [userId, todayStr]
    );

    // 1a. Query today's status (accounting for leave, Sunday, holiday, absent, etc. if not checked in)
    const { rows: todayStatusRows } = await pool.query(
      `SELECT 
         CASE
           WHEN a.check_in IS NOT NULL THEN
             CASE 
               WHEN LOWER(COALESCE(a.status, '')) IN ('present', 'working') THEN 
                 CASE WHEN a.check_out IS NULL THEN 'working' ELSE 'completed' END
               ELSE LOWER(COALESCE(a.status, 'working'))
             END
           WHEN a.id IS NOT NULL AND LOWER(COALESCE(a.status, '')) IN ('leave', 'half_day', 'absent') THEN LOWER(a.status)
           WHEN lr.id IS NOT NULL THEN 'leave'
           WHEN EXTRACT(DOW FROM $2::date) = 0 THEN 'sunday'
           WHEN h.date IS NOT NULL THEN 'holiday'
           ELSE 'today_pending'
         END AS status
       FROM users u
       LEFT JOIN attendance a ON a.user_id = u.id AND a.date = $2::date
       LEFT JOIN leave_requests lr ON lr.user_id = u.id
         AND LOWER(lr.status) = 'approved'
         AND lr.type NOT IN ('advance', 'resignation')
         AND $2::date BETWEEN lr.start_date AND lr.end_date
       LEFT JOIN holidays h ON h.date = $2::date
       WHERE u.id = $1`,
      [userId, todayStr]
    );
    const todayStatus = todayStatusRows[0]?.status || 'absent';

    // 1b. Team attendance summary (for stats, separating leaves from absences)
    const { rows: teamStatsRows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE a.check_in IS NOT NULL AND a.check_out IS NULL AND a.date = $1::date) AS present,
         COUNT(*) FILTER (WHERE a.check_out IS NOT NULL AND a.date = $1::date) AS checked_out,
         COUNT(*) FILTER (
           WHERE a.check_in IS NULL 
             AND EXTRACT(DOW FROM $1::date) != 0
             AND NOT EXISTS (SELECT 1 FROM holidays WHERE date = $1::date)
             AND NOT EXISTS (
               SELECT 1 FROM leave_requests lr 
               WHERE lr.user_id = u.id 
                 AND LOWER(lr.status) = 'approved' 
                 AND lr.type NOT IN ('advance', 'resignation')
                 AND $1::date BETWEEN lr.start_date AND lr.end_date
             )
         ) AS absent,
         COUNT(*) FILTER (
           WHERE a.check_in IS NULL 
             AND EXISTS (
               SELECT 1 FROM leave_requests lr 
               WHERE lr.user_id = u.id 
                 AND LOWER(lr.status) = 'approved' 
                 AND lr.type NOT IN ('advance', 'resignation')
                 AND $1::date BETWEEN lr.start_date AND lr.end_date
             )
         ) AS on_leave
       FROM users u
       LEFT JOIN attendance a ON a.user_id = u.id AND a.date = $1::date
       WHERE u.is_active IS NOT FALSE`,
      [todayStr]
    );
    const teamStats = teamStatsRows[0];

    // 2. My assigned tasks
    const { rows: taskRows } = await pool.query(
      `SELECT 
         t.id, t.title, t.status, t.created_at,
         p.id as project_id, p.name as project_name,
         au.name as assigned_by_name
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       JOIN users au ON au.id = t.created_by
       WHERE t.assigned_to = $1 AND t.status != 'passed'
         AND (t.start_date IS NULL OR t.start_date <= CURRENT_DATE)
       ORDER BY t.created_at DESC`,
      [userId]
    );

    // 3. All projects
    const { rows: projRows } = await pool.query(`
      SELECT p.id, p.name, p.client_name, p.type, p.location,
         COALESCE((SELECT json_agg(ps.* ORDER BY ps.id) FROM project_stages ps WHERE ps.project_id = p.id), '[]') as stages
       FROM projects p
       ORDER BY p.id DESC
    `);

    // 4. Project Kanban
    const kanbanQuery = `
      SELECT p.id, p.name, p.client_name, p.type, p.status,
         COALESCE((SELECT json_agg(ps.* ORDER BY ps.id) FROM project_stages ps WHERE ps.project_id = p.id), '[]') as stages
       FROM projects p
       ORDER BY p.created_at DESC 
       LIMIT 100
    `;
    const { rows: projectRows } = await pool.query(kanbanQuery);
    const kanban = { pending: [], design_proposal: [], sanction: [], execution: [], completed: [] };
    projectRows.forEach((p) => {
      const stages = p.stages || [];
      const activeStage = stages.find(s => s.status !== 'completed');
      let col = 'pending';
      if (!activeStage) col = 'completed';
      else if (activeStage.status === 'pending') col = 'pending';
      else {
        const name = activeStage.stage_name;
        if (name === 'Proposal' || name === 'Design') col = 'design_proposal';
        else if (name === 'Submission') col = 'sanction';
        else if (name === 'Working' || name === 'Execution') col = 'execution';
      }
      if (kanban[col]) kanban[col].push(p);
    });

    // 5. Calculate salary stats for employee
    const settingsRes = await pool.query('SELECT key, value FROM app_settings');
    const settings = settingsRes.rows.reduce((acc, row) => { acc[row.key] = row.value; return acc; }, {});
    const salaryStats = await calculateSalaryStats(userId, month, year, todayStr, settings);

    // 6. Active approved team leaves today & upcoming approved team leaves (STRICTLY APPROVED ONLY)
    const { rows: activeTeamLeavesRows } = await pool.query(
      `SELECT lr.id, lr.user_id, u.name as user_name, u.department, lr.type, 
              to_char(lr.start_date, 'YYYY-MM-DD') as start_date, 
              to_char(lr.end_date, 'YYYY-MM-DD') as end_date, 
              lr.reason, lr.status
       FROM leave_requests lr
       JOIN users u ON u.id = lr.user_id
       WHERE LOWER(lr.status) = 'approved'
         AND u.is_active IS NOT FALSE
         AND lr.type NOT IN ('advance', 'resignation')
         AND $1::date BETWEEN lr.start_date AND lr.end_date
       ORDER BY u.name ASC`,
      [todayStr]
    );

    const { rows: upcomingTeamLeavesRows } = await pool.query(
      `SELECT lr.id, lr.user_id, u.name as user_name, u.department, lr.type, 
              to_char(lr.start_date, 'YYYY-MM-DD') as start_date, 
              to_char(lr.end_date, 'YYYY-MM-DD') as end_date, 
              lr.reason, lr.status
       FROM leave_requests lr
       JOIN users u ON u.id = lr.user_id
       WHERE LOWER(lr.status) = 'approved'
         AND u.is_active IS NOT FALSE
         AND lr.type NOT IN ('advance', 'resignation')
         AND lr.start_date > $1::date
       ORDER BY lr.start_date ASC
       LIMIT 30`,
      [todayStr]
    );

    res.json({
      attendance: attRows[0] || {},
      today_status: todayStatus,
      team_stats: {
        present:     parseInt(teamStats.present),
        checked_out: parseInt(teamStats.checked_out),
        absent:      parseInt(teamStats.absent),
        on_leave:    parseInt(teamStats.on_leave || 0)
      },
      tasks: taskRows,
      projects: projRows,
      kanban,
      salary_stats: salaryStats,
      active_team_leaves: activeTeamLeavesRows,
      upcoming_team_leaves: upcomingTeamLeavesRows
    });
  } catch (err) {
    console.error('Employee dashboard error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.calculateSalaryStats = calculateSalaryStats;
module.exports = router;
