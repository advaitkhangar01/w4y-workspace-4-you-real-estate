const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAdmin, requireAccounting } = require('../middleware/auth');
const { checkProjectAccess } = require('../middleware/accessControl');
const checkPeriodLock = require('../middleware/periodLock');
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

// GET /api/finances/transactions
router.get('/transactions', authenticate, requireAccounting, async (req, res) => {
  try {
    const { type, project_id, start_date, end_date, category } = req.query;
    
    if (project_id) {
      return checkProjectAccess()(req, res, async () => {
        let projectQuery = `
          SELECT t.*, p.name as project_name, v.name as vendor_name, u.name as employee_name, creator.name as creator_name, pul.reason as unlock_reason, pul.unlocked_at as unlock_date, pul_user.name as unlock_user
          FROM transactions t
          LEFT JOIN projects p ON p.id = t.project_id
          LEFT JOIN vendors v ON v.id = t.vendor_id
          LEFT JOIN users u ON u.id = t.employee_id
          LEFT JOIN users creator ON creator.id = t.created_by
          LEFT JOIN period_unlock_log pul ON pul.id = t.period_unlock_id
          LEFT JOIN users pul_user ON pul_user.id = pul.unlocked_by
          WHERE t.project_id = $1
        `;
        const projectParams = [project_id];
        let pIdx = 2;

        if (category) {
          projectQuery += ` AND t.category = $${pIdx++}`;
          projectParams.push(category);
        } else {
          projectQuery += ` AND LOWER(t.category) NOT IN ('vendor_payment', 'vendor payment') AND t.vendor_id IS NULL`;
        }
        if (type) {
          projectQuery += ` AND t.type = $${pIdx++}`;
          projectParams.push(type);
        }
        if (start_date) {
          projectQuery += ` AND t.date >= $${pIdx++}`;
          projectParams.push(start_date);
        }
        if (end_date) {
          projectQuery += ` AND t.date <= $${pIdx++}`;
          projectParams.push(end_date);
        }

        const { rows: dbTransactions } = await pool.query(projectQuery, projectParams);

        // Fetch virtual income transactions from payment stages and invoices
        let virtualTransactions = [];
        const catStr = typeof category === 'string' ? category.toLowerCase() : '';
        if ((!type || type === 'income') && (!category || (!['vendor_payment', 'vendor payment'].includes(catStr) && catStr !== 'salary' && catStr !== 'incentive' && catStr !== 'salaries' && catStr !== 'incentives'))) {
          let stageQuery = `
            SELECT 
              pps.id, 
              'payment_stage' as type, 
              COALESCE(pps.document_type, 'Milestone') as category, 
              pps.amount, 
              COALESCE(pps.updated_at, pps.created_at) as date, 
              ('Milestone Stage: ' || COALESCE(pps.document_type, 'General') || ' [' || COALESCE(pps.status, 'pending') || ']') as description, 
              pps.project_id, 
              NULL as vendor_id, 
              NULL as employee_id, 
              NULL as reference_id, 
              NULL as receipt_url, 
              pps.initiated_by as created_by, 
              pps.created_at, 
              'payment_stage' as source,
              p.name as project_name,
              NULL as vendor_name,
              NULL as employee_name,
              u.name as creator_name
            FROM project_payment_stages pps
            JOIN projects p ON p.id = pps.project_id
            LEFT JOIN users u ON u.id = pps.initiated_by
            WHERE pps.project_id = $1 AND pps.status != 'cancelled'
          `;
          const stageParams = [project_id];
          let sIdx = 2;

          if (start_date) {
            stageQuery += ` AND COALESCE(pps.updated_at, pps.created_at) >= $${sIdx++}`;
            stageParams.push(start_date);
          }
          if (end_date) {
            stageQuery += ` AND COALESCE(pps.updated_at, pps.created_at) <= $${sIdx++}`;
            stageParams.push(end_date);
          }

          let invoiceQuery = `
            SELECT 
              inv.id, 
              'invoice' as type, 
              'Invoice' as category, 
              inv.amount, 
              inv.date, 
              ('Invoice: ' || inv.invoice_no || ' [' || COALESCE(inv.status, 'draft') || ']') as description, 
              inv.project_id, 
              NULL as vendor_id, 
              NULL as employee_id, 
              NULL as reference_id, 
              NULL as receipt_url, 
              inv.created_by, 
              inv.created_at, 
              'invoice' as source,
              p.name as project_name,
              NULL as vendor_name,
              NULL as employee_name,
              u.name as creator_name
            FROM invoices inv
            JOIN projects p ON p.id = inv.project_id
            LEFT JOIN users u ON u.id = inv.created_by
            WHERE inv.project_id = $1 AND inv.status != 'cancelled'
          `;
          const invoiceParams = [project_id];
          let iIdx = 2;

          if (start_date) {
            invoiceQuery += ` AND inv.date >= $${iIdx++}`;
            invoiceParams.push(start_date);
          }
          if (end_date) {
            invoiceQuery += ` AND inv.date <= $${iIdx++}`;
            invoiceParams.push(end_date);
          }

          const [stageRes, invoiceRes] = await Promise.all([
            pool.query(stageQuery, stageParams),
            pool.query(invoiceQuery, invoiceParams)
          ]);

          virtualTransactions = [...stageRes.rows, ...invoiceRes.rows];
        }

        const allTransactions = [...dbTransactions, ...virtualTransactions].sort((a, b) => new Date(b.date) - new Date(a.date));
        res.json({ transactions: allTransactions });
      });
    }

    let query = `
      SELECT t.*, p.name as project_name, v.name as vendor_name, u.name as employee_name, creator.name as creator_name, pul.reason as unlock_reason, pul.unlocked_at as unlock_date, pul_user.name as unlock_user,
             COALESCE(ea.is_verified, FALSE) as is_verified
      FROM transactions t
      LEFT JOIN projects p ON p.id = t.project_id
      LEFT JOIN vendors v ON v.id = t.vendor_id
      LEFT JOIN users u ON u.id = t.employee_id
      LEFT JOIN users creator ON creator.id = t.created_by
      LEFT JOIN period_unlock_log pul ON pul.id = t.period_unlock_id
      LEFT JOIN users pul_user ON pul_user.id = pul.unlocked_by
      LEFT JOIN expense_audits ea ON LOWER(ea.category) = LOWER(t.category) 
        AND ea.month = EXTRACT(MONTH FROM t.date) 
        AND ea.year = EXTRACT(YEAR FROM t.date)
    `;
    const params = [];
    let idx = 1;

    query += ` WHERE 1=1 `;

    if (category) {
      query += ` AND t.category = $${idx++}`;
      params.push(category);
    } else {
      query += ` AND LOWER(t.category) NOT IN ('vendor_payment', 'vendor payment') AND t.vendor_id IS NULL`;
    }
    if (type) {
      query += ` AND t.type = $${idx++}`;
      params.push(type);
    }
    if (start_date) {
      query += ` AND t.date >= $${idx++}`;
      params.push(start_date);
    }
    if (end_date) {
      query += ` AND t.date <= $${idx++}`;
      params.push(end_date);
    }

    query += ` ORDER BY t.date DESC, t.created_at DESC`;
    
    const { rows: transactions } = await pool.query(query, params);

    // If type is expense (or not specified), include payroll records as virtual transactions
    if (!type || type === 'expense') {
      let payrollQuery = `
        SELECT * FROM (
          SELECT 
            p.id, 
            'expense' as type, 
            'Salaries' as category, 
            (p.net_paid - p.incentives) as amount, 
            CASE 
              WHEN EXTRACT(MONTH FROM p.payment_date) = p.month AND EXTRACT(YEAR FROM p.payment_date) = p.year THEN p.payment_date
              ELSE (MAKE_DATE(p.year, p.month, 1) + INTERVAL '1 month - 1 day')::date
            END as date, 
            'Monthly salary payment' as description, 
            NULL as project_id, 
            NULL as vendor_id, 
            p.user_id as employee_id, 
            NULL as reference_id, 
            NULL as receipt_url, 
            NULL as created_by, 
            p.created_at, 
            'payroll' as source,
            COALESCE(ea.is_verified, FALSE) as is_verified
          FROM payroll p 
          LEFT JOIN expense_audits ea ON LOWER(ea.category) = 'salaries' AND ea.month = p.month AND ea.year = p.year
          WHERE p.status = 'paid'
          
          UNION ALL
          
          SELECT 
            p.id, 
            'expense' as type, 
            'Incentives' as category, 
            p.incentives as amount, 
            CASE 
              WHEN EXTRACT(MONTH FROM p.payment_date) = p.month AND EXTRACT(YEAR FROM p.payment_date) = p.year THEN p.payment_date
              ELSE (MAKE_DATE(p.year, p.month, 1) + INTERVAL '1 month - 1 day')::date
            END as date, 
            'Performance incentive' as description, 
            NULL as project_id, 
            NULL as vendor_id, 
            p.user_id as employee_id, 
            NULL as reference_id, 
            NULL as receipt_url, 
            NULL as created_by, 
            p.created_at, 
            'payroll' as source,
            COALESCE(ea.is_verified, FALSE) as is_verified
          FROM payroll p 
          LEFT JOIN expense_audits ea ON LOWER(ea.category) = 'incentives' AND ea.month = p.month AND ea.year = p.year
          WHERE p.status = 'paid' AND p.incentives > 0
        ) p_virtual
        WHERE 1=1
      `;
      const payrollParams = [];
      let pyIdx = 1;

      if (start_date) {
        payrollQuery += ` AND date >= $${pyIdx++}`;
        payrollParams.push(start_date);
      }
      if (end_date) {
        payrollQuery += ` AND date <= $${pyIdx++}`;
        payrollParams.push(end_date);
      }

      const { rows: payrollRows } = await pool.query(payrollQuery, payrollParams);
      
      // Merge and sort
      // Note: Include all transactions (including manually-added salary entries) plus payroll records.
      // Payroll records from the payroll table are merged alongside any manually-entered salary transactions.
      const allTransactions = [...transactions, ...payrollRows].sort((a, b) => new Date(b.date) - new Date(a.date));
      return res.json({ transactions: allTransactions });
    }

    res.json({ transactions });
  } catch (err) {
    console.error('Get transactions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/finances/transactions
router.post('/transactions', authenticate, upload.single('receipt'), checkProjectAccess(), checkPeriodLock, requireAccounting, async (req, res) => {
  try {
    console.log('New Transaction:', req.body);
    if (req.file) console.log('Attached Receipt:', req.file.filename);
    
    const { type, category, amount, date, description, project_id, vendor_id, employee_id, reference_id } = req.body;
    const receipt_url = req.file ? `/uploads/expenses/${req.file.filename}` : null;
    
    if (!type || !category || !amount) {
      return res.status(400).json({ error: 'Type, category and amount are required' });
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount)) {
      return res.status(400).json({ error: 'Invalid amount value' });
    }

    const pid = project_id ? parseInt(project_id) : null;
    const vid = vendor_id ? parseInt(vendor_id) : null;
    const eid = employee_id ? parseInt(employee_id) : null;
    const unlockId = req.period_unlock_id || null;

    const { rows } = await pool.query(
      `INSERT INTO transactions (type, category, amount, date, description, project_id, vendor_id, employee_id, reference_id, receipt_url, created_by, period_unlock_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [type, category, numericAmount, date || new Date(), description, pid, vid, eid, reference_id || null, receipt_url, req.user.id, unlockId]
    );

    res.status(201).json({ transaction: rows[0] });
  } catch (err) {
    console.error('Create transaction error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/finances/summary
router.get('/summary', authenticate, requireAccounting, async (req, res) => {
  const executeSummary = async (projectId) => {
    try {
      const { start_date, end_date } = req.query;

      // Determine active open period boundary if no explicit start_date is provided
      let effectiveStartDate = start_date;
      if (!projectId && !effectiveStartDate) {
        const { rows: latestClosed } = await pool.query(
          'SELECT month, year FROM monthly_closing_log ORDER BY year DESC, month DESC LIMIT 1'
        );
        if (latestClosed.length > 0) {
          const { month, year } = latestClosed[0];
          // boundary starts on the first day of the month following the latest closed period
          let nextMonth = month + 1;
          let nextYear = year;
          if (nextMonth > 12) {
            nextMonth = 1;
            nextYear += 1;
          }
          effectiveStartDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
        }
      }
      
      // 1. Income from document amounts (Total Potential) - Only for active stages: Design Proposal, Sanction, Execution (when global)
      let incomeQuery;
      const incomeParams = [];

      if (projectId) {
        incomeQuery = `SELECT COALESCE(SUM(amount), 0) as total_value FROM project_document_amounts WHERE project_id = $1`;
        incomeParams.push(projectId);
      } else {
        incomeQuery = `
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
          JOIN projects p ON p.id = pda.project_id
          WHERE pc.stage_category IN ('design_proposal', 'sanction', 'execution')
        `;
      }
      const incomeRes = await pool.query(incomeQuery, incomeParams);
      const totalValue = parseFloat(incomeRes.rows[0].total_value);

      // 2. Active Billed & Received — driven by the invoices/transactions table within the active period
      let activeBilledQuery = `
        SELECT
          COALESCE(SUM(i.amount), 0) AS billed
        FROM invoices i
        JOIN projects p ON p.id = i.project_id
        WHERE LOWER(i.status) != 'cancelled'
      `;
      const activeBilledParams = [];
      let abIdx = 1;
      if (projectId) {
        activeBilledQuery += ` AND i.project_id = $${abIdx++}`;
        activeBilledParams.push(projectId);
      }
      if (effectiveStartDate) {
        activeBilledQuery += ` AND i.date >= $${abIdx++}`;
        activeBilledParams.push(effectiveStartDate);
      }
      if (end_date) {
        activeBilledQuery += ` AND i.date <= $${abIdx++}`;
        activeBilledParams.push(end_date);
      }

      const activeBilledRes = await pool.query(activeBilledQuery, activeBilledParams);
      const billed = parseFloat(activeBilledRes.rows[0].billed);

      let activeReceivedQuery = `
        WITH combined_received AS (
          SELECT t.project_id, t.date, t.amount
          FROM transactions t
          WHERE t.type = 'income' AND t.category = 'project_receipt'

          UNION ALL

          SELECT i.project_id, i.date, i.received_amount AS amount
          FROM invoices i
          WHERE LOWER(i.status) != 'cancelled'
            AND NOT EXISTS (
              SELECT 1 FROM transactions t
              WHERE t.type = 'income' AND t.category = 'project_receipt'
                AND t.reference_id = i.invoice_no
            )
        )
        SELECT COALESCE(SUM(c.amount), 0) AS received
        FROM combined_received c
        JOIN projects p ON p.id = c.project_id
        WHERE 1=1
      `;
      const activeReceivedParams = [];
      let arIdx = 1;
      if (projectId) {
        activeReceivedQuery += ` AND c.project_id = $${arIdx++}`;
        activeReceivedParams.push(projectId);
      }
      if (effectiveStartDate) {
        activeReceivedQuery += ` AND c.date >= $${arIdx++}`;
        activeReceivedParams.push(effectiveStartDate);
      }
      if (end_date) {
        activeReceivedQuery += ` AND c.date <= $${arIdx++}`;
        activeReceivedParams.push(end_date);
      }

      const activeReceivedRes = await pool.query(activeReceivedQuery, activeReceivedParams);
      const received = parseFloat(activeReceivedRes.rows[0].received);

      // 2.5 Cumulative Billed and Pending — driven by the invoices table globally (across all history)
      let cumulativeInvoiceQuery = `
        SELECT
          COALESCE(SUM(i.amount), 0)                                                        AS cumulative_billed,
          COALESCE(SUM(CASE WHEN LOWER(i.status) != 'paid' THEN GREATEST(i.amount - i.received_amount - COALESCE((i.tax_details->>'tdsAmount')::numeric, 0), 0) ELSE 0 END), 0) AS pending
        FROM invoices i
        JOIN projects p ON p.id = i.project_id
        WHERE LOWER(i.status) != 'cancelled'
      `;
      const cumulativeInvoiceParams = [];
      let ciIdx = 1;
      if (projectId) {
        cumulativeInvoiceQuery += ` AND i.project_id = $${ciIdx++}`;
        cumulativeInvoiceParams.push(projectId);
      }
      if (end_date) {
        cumulativeInvoiceQuery += ` AND i.date <= $${ciIdx++}`;
        cumulativeInvoiceParams.push(end_date);
      }

      const cumulativeInvoiceRes = await pool.query(cumulativeInvoiceQuery, cumulativeInvoiceParams);
      const cumulativeBilled = parseFloat(cumulativeInvoiceRes.rows[0].cumulative_billed);
      const pending = parseFloat(cumulativeInvoiceRes.rows[0].pending);

      let cumulativeReceivedQuery = `
        WITH combined_received AS (
          SELECT t.project_id, t.date, t.amount
          FROM transactions t
          WHERE t.type = 'income' AND t.category = 'project_receipt'

          UNION ALL

          SELECT i.project_id, i.date, i.received_amount AS amount
          FROM invoices i
          WHERE LOWER(i.status) != 'cancelled'
            AND NOT EXISTS (
              SELECT 1 FROM transactions t
              WHERE t.type = 'income' AND t.category = 'project_receipt'
                AND t.reference_id = i.invoice_no
            )
        )
        SELECT COALESCE(SUM(c.amount), 0) AS cumulative_received
        FROM combined_received c
        JOIN projects p ON p.id = c.project_id
        WHERE 1=1
      `;
      const cumulativeReceivedParams = [];
      let crIdx = 1;
      if (projectId) {
        cumulativeReceivedQuery += ` AND c.project_id = $${crIdx++}`;
        cumulativeReceivedParams.push(projectId);
      }
      if (end_date) {
        cumulativeReceivedQuery += ` AND c.date <= $${crIdx++}`;
        cumulativeReceivedParams.push(end_date);
      }

      const cumulativeReceivedRes = await pool.query(cumulativeReceivedQuery, cumulativeReceivedParams);
      const cumulativeReceived = parseFloat(cumulativeReceivedRes.rows[0].cumulative_received);

      // 3. Expenses from transactions (excluding vendor payments)
      let expenseQuery = `
        SELECT COALESCE(SUM(t.amount), 0) as total_expense 
        FROM transactions t
        LEFT JOIN projects p ON p.id = t.project_id
        LEFT JOIN expense_audits ea ON LOWER(ea.category) = LOWER(t.category) 
          AND ea.month = EXTRACT(MONTH FROM t.date) 
          AND ea.year = EXTRACT(YEAR FROM t.date)
        WHERE t.type = 'expense' AND LOWER(t.category) NOT IN ('vendor_payment', 'vendor payment', 'salary', 'incentive', 'salaries', 'incentives') AND t.vendor_id IS NULL
          AND ea.is_verified = TRUE
      `;
      const expParams = [];
      let eIdx = 1;
      if (projectId) {
        expenseQuery += ` AND t.project_id = $${eIdx++}`;
        expParams.push(projectId);
      }
      if (effectiveStartDate) {
        expenseQuery += ` AND t.date >= $${eIdx++}`;
        expParams.push(effectiveStartDate);
      }
      if (end_date) {
        expenseQuery += ` AND t.date <= $${eIdx++}`;
        expParams.push(end_date);
      }
      const expRes = await pool.query(expenseQuery, expParams);
      const transactionExpense = parseFloat(expRes.rows[0].total_expense);

      // 4. Payroll Expenses (Automatically included in global summary)
      let totalPayroll = 0;
      let totalIncentives = 0;

      if (!projectId) {
        let payrollQuery = `
          SELECT 
            COALESCE(SUM(
              CASE 
                WHEN ea_sal.is_verified = TRUE AND ea_inc.is_verified = TRUE THEN p.net_paid
                WHEN ea_sal.is_verified = TRUE THEN (p.net_paid - p.incentives)
                WHEN ea_inc.is_verified = TRUE THEN p.incentives
                ELSE 0 
              END
            ), 0) as total_payroll,
            COALESCE(SUM(
              CASE WHEN ea_inc.is_verified = TRUE THEN p.incentives ELSE 0 END
            ), 0) as total_incentives
          FROM payroll p
          LEFT JOIN expense_audits ea_sal ON ea_sal.category = 'Salaries' AND ea_sal.month = p.month AND ea_sal.year = p.year
          LEFT JOIN expense_audits ea_inc ON ea_inc.category = 'Incentives' AND ea_inc.month = p.month AND ea_inc.year = p.year
          WHERE p.status = 'paid'
        `;
        const payrollParams = [];
        let pIdx = 1;
        if (effectiveStartDate) {
          payrollQuery += ` AND p.payment_date >= $${pIdx++}`;
          payrollParams.push(effectiveStartDate);
        }
        if (end_date) {
          payrollQuery += ` AND p.payment_date <= $${pIdx++}`;
          payrollParams.push(end_date);
        }
        const payrollRes = await pool.query(payrollQuery, payrollParams);
        totalPayroll = parseFloat(payrollRes.rows[0].total_payroll);
        totalIncentives = parseFloat(payrollRes.rows[0].total_incentives);
      }

      const totalExpense = transactionExpense + totalPayroll;
      const unbilled = totalValue - cumulativeBilled;

      // 5. Total Company Capital (sum of profit of all closed months)
      const capitalRes = await pool.query('SELECT COALESCE(SUM(amount), 0) as total_capital FROM company_capital');
      const totalCapital = parseFloat(capitalRes.rows[0].total_capital);

      res.json({
        total_income: totalValue,
        current_project_value: totalValue - cumulativeReceived,
        billed_income: billed,
        received_income: received,
        pending_income: pending,
        unbilled_income: unbilled > 0 ? unbilled : 0,
        total_expense: totalExpense,
        total_payroll: totalPayroll,
        total_incentives: totalIncentives,
        net_profit: totalValue - totalExpense,
        total_capital: totalCapital
      });
    } catch (err) {
      console.error('Execute summary error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  };

  const { project_id } = req.query;
  if (project_id) {
    return checkProjectAccess()(req, res, () => executeSummary(project_id));
  }
  
  executeSummary();
});

// GET /api/finances/charts
router.get('/charts', authenticate, requireAccounting, async (req, res) => {
  const { project_id } = req.query;
  if (project_id) {
    return checkProjectAccess()(req, res, () => executeCharts(project_id));
  }

  executeCharts();

  async function executeCharts(projectId) {
    try {
      const { start_date, end_date } = req.query;
      
      // 1. Monthly trend
      let trendQuery = `
        WITH combined_data AS (
          SELECT t.date, t.type, t.category, t.amount, t.project_id FROM transactions t
          LEFT JOIN expense_audits ea ON LOWER(ea.category) = LOWER(t.category) 
            AND ea.month = EXTRACT(MONTH FROM t.date) 
            AND ea.year = EXTRACT(YEAR FROM t.date)
          WHERE LOWER(t.category) NOT IN ('vendor_payment', 'vendor payment', 'salary', 'incentive', 'salaries', 'incentives') AND t.vendor_id IS NULL
            AND (t.type = 'income' OR (t.type = 'expense' AND ea.is_verified = TRUE))
          
          UNION ALL
          
          SELECT p.payment_date as date, 'expense' as type, 'Salaries' as category, (p.net_paid - p.incentives) as amount, NULL as project_id 
          FROM payroll p 
          LEFT JOIN expense_audits ea ON ea.category = 'Salaries' AND ea.month = p.month AND ea.year = p.year
          WHERE p.status = 'paid' AND ea.is_verified = TRUE
          
          UNION ALL
          
          SELECT p.payment_date as date, 'expense' as type, 'Incentives' as category, p.incentives as amount, NULL as project_id 
          FROM payroll p 
          LEFT JOIN expense_audits ea ON ea.category = 'Incentives' AND ea.month = p.month AND ea.year = p.year
          WHERE p.status = 'paid' AND p.incentives > 0 AND ea.is_verified = TRUE
        )
        SELECT 
          TO_CHAR(date, 'Mon YYYY') as month_year,
          SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
          SUM(CASE WHEN type = 'expense' AND LOWER(category) NOT IN ('vendor_payment', 'vendor payment') THEN amount ELSE 0 END) as expense,
          MIN(date) as sort_date
        FROM combined_data
        WHERE 1=1
      `;
      const trendParams = [];
      let tIdx = 1;

      if (projectId) {
        trendQuery += ` AND project_id = $${tIdx++}`;
        trendParams.push(projectId);
      }
      if (start_date) {
        trendQuery += ` AND date >= $${tIdx++}`;
        trendParams.push(start_date);
      }
      if (end_date) {
        trendQuery += ` AND date <= $${tIdx++}`;
        trendParams.push(end_date);
      }
      
      // If no date filters, default to last 6 months for trend
      if (!start_date && !end_date) {
        trendQuery += ` AND date >= CURRENT_DATE - INTERVAL '6 months'`;
      }

      trendQuery += ` GROUP BY month_year ORDER BY sort_date ASC`;
      
      const trendRes = await pool.query(trendQuery, trendParams);

      // 2. Category breakdown (Expenses only)
      let catQuery = `
        WITH combined_expenses AS (
          SELECT t.category, t.amount, t.date, t.project_id FROM transactions t
          LEFT JOIN expense_audits ea ON LOWER(ea.category) = LOWER(t.category) 
            AND ea.month = EXTRACT(MONTH FROM t.date) 
            AND ea.year = EXTRACT(YEAR FROM t.date)
          WHERE t.type = 'expense' AND LOWER(t.category) NOT IN ('vendor_payment', 'vendor payment', 'salary', 'incentive', 'salaries', 'incentives') AND t.vendor_id IS NULL
            AND ea.is_verified = TRUE
          
          UNION ALL
          
          SELECT 'Salaries' as category, (p.net_paid - p.incentives) as amount, p.payment_date as date, NULL as project_name 
          FROM payroll p 
          LEFT JOIN expense_audits ea ON ea.category = 'Salaries' AND ea.month = p.month AND ea.year = p.year
          WHERE p.status = 'paid' AND ea.is_verified = TRUE
          
          UNION ALL
          
          SELECT 'Incentives' as category, p.incentives as amount, p.payment_date as date, NULL as project_name 
          FROM payroll p 
          LEFT JOIN expense_audits ea ON ea.category = 'Incentives' AND ea.month = p.month AND ea.year = p.year
          WHERE p.status = 'paid' AND p.incentives > 0 AND ea.is_verified = TRUE
        )
        SELECT 
          category as name,
          SUM(amount) as value
        FROM combined_expenses
        WHERE 1=1
      `;
      const catParams = [];
      let cIdx = 1;

      if (projectId) {
        catQuery += ` AND project_id = $${cIdx++}`;
        catParams.push(projectId);
      }
      if (start_date) {
        catQuery += ` AND date >= $${cIdx++}`;
        catParams.push(start_date);
      }
      if (end_date) {
        catQuery += ` AND date <= $${cIdx++}`;
        catParams.push(end_date);
      }

      // If no date filters, default to same range as trend (last 6 months)
      if (!start_date && !end_date) {
        catQuery += ` AND date >= CURRENT_DATE - INTERVAL '6 months'`;
      }

      catQuery += ` GROUP BY category ORDER BY value DESC`;
      
      const catRes = await pool.query(catQuery, catParams);

      res.json({
        trend: trendRes.rows,
        categories: catRes.rows
      });
    } catch (err) {
      console.error('Get finance charts error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
});

// DELETE /api/finances/transactions/:id
router.delete('/transactions/:id', authenticate, requireAdmin, checkPeriodLock, async (req, res) => {
  try {
    // F3: return 404 if the transaction does not exist
    const { rowCount } = await pool.query('DELETE FROM transactions WHERE id = $1', [req.params.id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json({ message: 'Transaction deleted' });
  } catch (err) {
    console.error('Delete transaction error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
