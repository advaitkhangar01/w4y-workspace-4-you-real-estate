const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticate, requireAdmin, requireAccounting } = require('../middleware/auth');
const checkPeriodLock = require('../middleware/periodLock');
const { calculatePayrollForEmployee, calculateHourlyRate } = require('../utils/payroll');
const { logAudit } = require('../utils/auditLogger');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure Multer for receipts
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'expenses');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'receipt-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// All accounting routes require authentication and admin or accounts privileges
router.use(authenticate);
router.use(requireAccounting);

/**
 * @section Expenses Management
 */

// Get all office expenses
router.get('/expenses', async (req, res) => {
  try {
    const query = `
      SELECT oe.id, oe.category, oe.amount, oe.date, oe.description, oe.receipt_url, 'office' as source, oe.period_unlock_id, pul.reason as unlock_reason, pul.unlocked_at as unlock_date, pul_user.name as unlock_user 
      FROM office_expenses oe
      LEFT JOIN period_unlock_log pul ON pul.id = oe.period_unlock_id
      LEFT JOIN users pul_user ON pul_user.id = pul.unlocked_by
      UNION ALL
      SELECT id, 'Salaries' as category, (net_paid - incentives) as amount, 
             CASE 
               WHEN EXTRACT(MONTH FROM payment_date) = month AND EXTRACT(YEAR FROM payment_date) = year THEN payment_date
               ELSE (MAKE_DATE(year, month, 1) + INTERVAL '1 month - 1 day')::date
             END as date, 
             'Monthly salary payment' as description, NULL as receipt_url, 'payroll' as source, NULL as period_unlock_id, NULL as unlock_reason, NULL as unlock_date, NULL as unlock_user 
      FROM payroll WHERE status = 'paid'
      UNION ALL
      SELECT id, 'Incentives' as category, incentives as amount, 
             CASE 
               WHEN EXTRACT(MONTH FROM payment_date) = month AND EXTRACT(YEAR FROM payment_date) = year THEN payment_date
               ELSE (MAKE_DATE(year, month, 1) + INTERVAL '1 month - 1 day')::date
             END as date, 
             'Performance incentive' as description, NULL as receipt_url, 'payroll' as source, NULL as period_unlock_id, NULL as unlock_reason, NULL as unlock_date, NULL as unlock_user 
      FROM payroll WHERE status = 'paid' AND incentives > 0
      ORDER BY date DESC, id DESC
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new expense with receipt
router.post('/expenses', upload.single('receipt'), checkPeriodLock, async (req, res) => {
  const { category, amount, date, description } = req.body;

  // L1: Validate required fields before INSERT
  if (!category || !String(category).trim()) {
    return res.status(400).json({ error: 'Category is required' });
  }
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }

  const receipt_url = req.file ? `/uploads/expenses/${req.file.filename}` : null;
  const unlockId = req.period_unlock_id || null;
  
  try {
    const { rows } = await pool.query(
      'INSERT INTO office_expenses (category, amount, date, description, receipt_url, period_unlock_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [category.trim(), parsedAmount, date || new Date(), description, receipt_url, unlockId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete expense
router.delete('/expenses/:id', requireAdmin, checkPeriodLock, async (req, res) => {
  try {
    // L2: return 404 if expense doesn't exist
    const { rowCount } = await pool.query('DELETE FROM office_expenses WHERE id = $1', [req.params.id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    res.json({ message: 'Expense deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @section Expense Auditing
 */

// Get audit status for a month/year
router.get('/expenses/audits', async (req, res) => {
  const { month, year } = req.query;
  try {
    const { rows } = await pool.query(
      'SELECT LOWER(category) as category, is_verified FROM expense_audits WHERE month = $1 AND year = $2',
      [month, year]
    );
    // Return as a simple object { categoryName: is_verified }
    const audits = rows.reduce((acc, row) => {
      acc[row.category] = row.is_verified;
      return acc;
    }, {});
    res.json(audits);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update audit status
router.post('/expenses/audits', requireAdmin, async (req, res) => {
  const { category, month, year, is_verified } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO expense_audits (category, month, year, is_verified, verified_by)
       VALUES (LOWER($1), $2, $3, $4, $5)
       ON CONFLICT (category, month, year) 
       DO UPDATE SET is_verified = EXCLUDED.is_verified, verified_at = NOW()
       RETURNING *`,
      [category, month, year, is_verified, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @section Payroll Management
 */

// Get employees with their base salaries and attendance for a specific month
router.get('/payroll/employees', async (req, res) => {
  const { month, year } = req.query;
  try {
    // 1. Fetch all employees and admins for payroll
    const empRes = await pool.query("SELECT id, name, department, role, base_salary, hourly_rate FROM users WHERE role IN ('employee', 'admin', 'back_office', 'accounts', 'design_head', 'design', 'liasoning', 'civil_engineer', 'project_head') AND is_active IS NOT FALSE ORDER BY name");
    const employees = empRes.rows;

    if (!month || !year) {
      return res.json(employees);
    }

    // 2. Fetch App Settings
    const settingsRes = await pool.query('SELECT * FROM app_settings');
    const settings = settingsRes.rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});

    const result = await Promise.all(
      employees.map(async (emp) => {
        const payrollData = await calculatePayrollForEmployee(emp.id, parseInt(month), parseInt(year), settings, pool);
        return {
          ...emp,
          ...payrollData
        };
      })
    );

    res.json(result);
  } catch (err) {
    console.error('Payroll API Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update employee base salary or hourly rate, and sync payroll if period is active (accounting or admin)
router.put('/payroll/employees/:id', checkPeriodLock, async (req, res) => {
  const { base_salary, hourly_rate, incentives, month, year } = req.body;

  // L3: Validate that salary fields are non-negative numbers before saving
  if (base_salary !== undefined && base_salary !== null) {
    const v = parseFloat(base_salary);
    if (isNaN(v) || v < 0) {
      return res.status(400).json({ error: 'base_salary must be a non-negative number' });
    }
  }
  if (hourly_rate !== undefined && hourly_rate !== null) {
    const v = parseFloat(hourly_rate);
    if (isNaN(v) || v < 0) {
      return res.status(400).json({ error: 'hourly_rate must be a non-negative number' });
    }
  }
  if (incentives !== undefined && incentives !== null) {
    const v = parseFloat(incentives);
    if (isNaN(v) || v < 0) {
      return res.status(400).json({ error: 'incentives must be a non-negative number' });
    }
  }

  try {
    // 1. Update user details in DB
    if (base_salary !== undefined || hourly_rate !== undefined) {
      const { rows: currUserRows } = await pool.query(
        'SELECT base_salary, hourly_rate, batch_id FROM users WHERE id = $1',
        [req.params.id]
      );
      const currUser = currUserRows[0] || {};
      const newBaseSalary = base_salary !== undefined ? parseFloat(base_salary) : parseFloat(currUser.base_salary || 0);
      let newHourlyRate = 0;

      if (newBaseSalary > 0) {
        let batchMinHours = 9.0;
        if (currUser.batch_id) {
          const { rows: bRows } = await pool.query('SELECT min_working_hours FROM attendance_batches WHERE id = $1', [currUser.batch_id]);
          if (bRows.length > 0 && bRows[0].min_working_hours) {
            batchMinHours = parseFloat(bRows[0].min_working_hours);
          }
        } else {
          const { rows: sRows } = await pool.query("SELECT value FROM app_settings WHERE key = 'min_working_hours'");
          if (sRows.length > 0 && sRows[0].value) {
            batchMinHours = parseFloat(sRows[0].value);
          }
        }
        newHourlyRate = calculateHourlyRate(newBaseSalary, batchMinHours);
      }

      await pool.query(
        "UPDATE users SET base_salary = $1, hourly_rate = $2 WHERE id = $3 AND role IN ('employee', 'admin', 'back_office', 'accounts', 'design_head', 'design', 'liasoning', 'civil_engineer', 'project_head')",
        [newBaseSalary, newHourlyRate, req.params.id]
      );
    }

    // 2. If month and year are provided, update/sync existing payroll record if any
    if (month && year) {
      const { rows: existingPayroll } = await pool.query(
        'SELECT base_salary, bonus, incentives, deductions FROM payroll WHERE user_id = $1 AND month = $2 AND year = $3',
        [req.params.id, month, year]
      );

      if (existingPayroll.length > 0) {
        // Get settings
        const { rows: settingsRows } = await pool.query('SELECT key, value FROM app_settings');
        const settings = settingsRows.reduce((acc, r) => {
          acc[r.key] = r.value;
          return acc;
        }, {});

        // Recalculate payroll statistics on-the-fly
        const payrollData = await calculatePayrollForEmployee(req.params.id, month, year, settings, pool);
        if (payrollData) {
          const finalBaseSalary = base_salary !== undefined ? parseFloat(base_salary) : parseFloat(existingPayroll[0].base_salary);
          const finalBonus = parseFloat(existingPayroll[0].bonus || 0);
          const finalIncentives = incentives !== undefined ? parseFloat(incentives) : parseFloat(existingPayroll[0].incentives || 0);
          const finalDeductions = parseFloat(payrollData.deductions || 0);
          const finalOvertime = parseFloat(payrollData.overtime_earnings || 0);
          const finalNetPaid = Math.max(0, parseFloat(payrollData.net_salary_payable || 0) + finalBonus + finalIncentives);

          await pool.query(
            `UPDATE payroll 
             SET base_salary = $1, incentives = $2, deductions = $3, net_paid = $4
             WHERE user_id = $5 AND month = $6 AND year = $7`,
            [finalBaseSalary, finalIncentives, finalDeductions, finalNetPaid, req.params.id, month, year]
          );
        }
      }
    }

    const { rows: updatedUser } = await pool.query(
      "SELECT id, name, base_salary, hourly_rate FROM users WHERE id = $1",
      [req.params.id]
    );
    res.json(updatedUser[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get payroll history for a specific month/year
router.get('/payroll/history', async (req, res) => {
  const { month, year } = req.query;
  try {
    let query = 'SELECT p.*, u.name, u.department FROM payroll p JOIN users u ON p.user_id = u.id';
    const params = [];
    
    if (month && year) {
      query += ' WHERE p.month = $1 AND p.year = $2';
      params.push(month, year);
    }
    
    query += ' ORDER BY p.year DESC, p.month DESC, u.name ASC';
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Process payroll (add/update) — accounting staff can prepare payroll, admin finalizes via month-close
router.post('/payroll', checkPeriodLock, async (req, res) => {
  const { user_id, base_salary, bonus, incentives, deductions, net_paid, month, year, payment_date, status, is_manual_override } = req.body;
  const isOverride = is_manual_override !== undefined ? Boolean(is_manual_override) : true;
  try {
    const { rows } = await pool.query(
      `INSERT INTO payroll (user_id, base_salary, bonus, incentives, deductions, net_paid, month, year, payment_date, status, is_manual_override)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (user_id, month, year) 
       DO UPDATE SET 
         base_salary = EXCLUDED.base_salary,
         bonus = EXCLUDED.bonus,
         incentives = EXCLUDED.incentives,
         deductions = EXCLUDED.deductions,
         net_paid = EXCLUDED.net_paid,
         payment_date = EXCLUDED.payment_date,
         status = EXCLUDED.status,
         is_manual_override = EXCLUDED.is_manual_override
       RETURNING *`,
      [user_id, base_salary, bonus || 0, incentives || 0, deductions || 0, net_paid, month, year, payment_date || new Date(), status || 'paid', isOverride]
    );

    await logAudit({
      userId: req.user?.id,
      action: 'PAYROLL_UPSERT',
      entityType: 'payroll',
      entityId: rows[0].id,
      newValue: rows[0],
      ipAddress: req.ip
    });

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @section P&L Reports
 */

router.get('/summary', async (req, res) => {
  try {
    // 1. Total Income from projects (sum of project_document_amounts)
    const incomeRes = await pool.query('SELECT COALESCE(SUM(amount), 0) as total_income FROM project_document_amounts');
    const totalIncome = parseFloat(incomeRes.rows[0].total_income);

    // 2. Total Office Expenses
    const expenseRes = await pool.query('SELECT COALESCE(SUM(amount), 0) as total_expenses FROM office_expenses');
    const totalOfficeExpenses = parseFloat(expenseRes.rows[0].total_expenses);

    // 3. Total Payroll
    const payrollRes = await pool.query('SELECT COALESCE(SUM(net_paid), 0) as total_payroll FROM payroll');
    const totalPayroll = parseFloat(payrollRes.rows[0].total_payroll);

    // 4. Total Incentives
    const incentivesRes = await pool.query('SELECT COALESCE(SUM(incentives), 0) as total_incentives FROM payroll');
    const totalIncentives = parseFloat(incentivesRes.rows[0].total_incentives);

    res.json({
      totalIncome,
      totalOfficeExpenses,
      totalPayroll,
      totalIncentives,
      netProfit: totalIncome - (totalOfficeExpenses + totalPayroll)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete processed payroll record (Admin only, subject to period lock)
router.delete('/payroll/:id', authenticate, requireAdmin, checkPeriodLock, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM payroll WHERE id = $1', [req.params.id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Payroll record not found' });
    }
    res.json({ message: 'Payroll record deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
