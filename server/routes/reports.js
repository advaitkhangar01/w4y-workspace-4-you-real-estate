// server/routes/reports.js
// Isolated analytical routes for spreadsheet generation

const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAdmin, requireAccounting } = require('../middleware/auth');

// 1. Attendance Analytical Report Endpoint
router.get('/attendance', authenticate, requireAccounting, async (req, res) => {
  try {
    const { user_id, start_date, end_date } = req.query;
    const { getISTDate } = require('../utils/date');

    const today = getISTDate();
    const [year, month] = today.split('-').map(Number);
    const defaultStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const defaultEnd   = today;

    const startDate = start_date || defaultStart;
    const endDate   = end_date || defaultEnd;

    const userFilterId = user_id ? parseInt(user_id) : null;

    const { rows } = await pool.query(
      `WITH date_series AS (
         SELECT generate_series($1::date, $2::date, '1 day'::interval)::date AS date
       ),
       target_users AS (
         SELECT id, name, role, department 
         FROM users 
         WHERE ($3::integer IS NULL OR id = $3)
           AND (is_active IS NOT FALSE)
       ),
       user_dates AS (
         SELECT u.id AS user_id, u.name AS employee_name, u.role, u.department, d.date
         FROM target_users u
         CROSS JOIN date_series d
       )
       SELECT 
         a.id,
         ud.user_id,
         ud.date,
         a.check_in,
         a.check_out,
         a.is_late,
         a.late_minutes,
         a.hours_worked,
         a.checkin_distance,
         a.checkin_zone,
         a.checkin_accuracy,
         ud.employee_name,
         ud.role,
         ud.department,
          CASE
            WHEN a.check_in IS NOT NULL THEN
              CASE 
                WHEN LOWER(COALESCE(a.status, '')) IN ('present', 'working') THEN 
                  CASE WHEN a.check_out IS NULL THEN 'working' ELSE 'completed' END
                ELSE LOWER(COALESCE(a.status, 'working'))
              END
            WHEN a.id IS NOT NULL AND LOWER(COALESCE(a.status, '')) IN ('leave', 'half_day', 'absent') THEN LOWER(a.status)
            WHEN ud.date > $4::date THEN 'upcoming'
            WHEN ud.date = $4::date AND a.id IS NULL THEN 'today_pending'
            WHEN lr.id IS NOT NULL THEN 'leave'
            WHEN EXTRACT(DOW FROM ud.date) = 0 THEN 'sunday'
            WHEN h.date IS NOT NULL THEN 'holiday'
            ELSE 'absent'
          END AS status
       FROM user_dates ud
       LEFT JOIN attendance a ON a.user_id = ud.user_id AND a.date = ud.date
       LEFT JOIN leave_requests lr ON lr.user_id = ud.user_id
         AND LOWER(lr.status) = 'approved'
         AND lr.type NOT IN ('advance', 'resignation')
         AND ud.date BETWEEN lr.start_date AND lr.end_date
       LEFT JOIN holidays h ON h.date = ud.date
       ORDER BY ud.date DESC, ud.employee_name ASC`,
      [startDate, endDate, userFilterId, today]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error fetching attendance reports:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 2. Financial Ledger Report Endpoint
router.get('/finances', authenticate, requireAccounting, async (req, res) => {
  try {
    const { project_id, start_date, end_date, type, category } = req.query;
    
    // Core transactions query
    let query = `
      SELECT 
        t.id, t.type, t.category, t.amount, t.date, t.description, t.reference_id, t.created_at,
        p.name as project_name, 
        v.name as vendor_name,
        u.name as employee_name,
        cu.name as creator_name
      FROM transactions t
      LEFT JOIN projects p ON p.id = t.project_id
      LEFT JOIN vendors v ON v.id = t.vendor_id
      LEFT JOIN users u ON u.id = t.employee_id
      LEFT JOIN users cu ON cu.id = t.created_by
      WHERE 1=1
    `;
    const params = [];

    if (project_id) {
      params.push(project_id);
      query += ` AND t.project_id = $${params.length}`;
    }
    if (start_date) {
      params.push(start_date);
      query += ` AND t.date >= $${params.length}::date`;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND t.date <= $${params.length}::date`;
    }
    if (type) {
      params.push(type);
      query += ` AND t.type = $${params.length}`;
    }
    if (category) {
      params.push(category);
      query += ` AND t.category = $${params.length}`;
    } else {
      query += ` AND LOWER(t.category) NOT IN ('vendor_payment', 'vendor payment', 'salaries', 'salary', 'incentives', 'incentive')`;
    }

    query += ' ORDER BY t.date DESC, t.id DESC';
    const { rows: transactions } = await pool.query(query, params);

    // Fetch virtual payroll disbursements (salaries and performance incentives)
    let payrollRows = [];
    if (!type || type === 'expense') {
      // General ledger salaries match unless we are filtered strictly for a project that isn't payroll
      if (!project_id || project_id === '') {
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
              NULL as reference_id,
              p.created_at,
              NULL as project_name,
              NULL as vendor_name,
              u.name as employee_name,
              'System' as creator_name
            FROM payroll p
            JOIN users u ON u.id = p.user_id
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
              NULL as reference_id,
              p.created_at,
              NULL as project_name,
              NULL as vendor_name,
              u.name as employee_name,
              'System' as creator_name
            FROM payroll p
            JOIN users u ON u.id = p.user_id
            WHERE p.status = 'paid' AND p.incentives > 0
          ) p_virtual
          WHERE 1=1
        `;
        const payrollParams = [];
        let pyIdx = 1;

        if (start_date) {
          payrollQuery += ` AND date >= $${pyIdx++}::date`;
          payrollParams.push(start_date);
        }
        if (end_date) {
          payrollQuery += ` AND date <= $${pyIdx++}::date`;
          payrollParams.push(end_date);
        }
        if (category) {
          payrollQuery += ` AND category = $${pyIdx++}`;
          payrollParams.push(category);
        }

        const { rows } = await pool.query(payrollQuery, payrollParams);
        payrollRows = rows;
      }
    }

    // Fetch general office expenses (only for general query, as they are not mapped to specific projects)
    let officeRows = [];
    if (!type || type === 'expense') {
      if (!project_id || project_id === '') {
        let officeQuery = `
          SELECT 
            oe.id,
            'expense' as type,
            oe.category,
            oe.amount,
            oe.date,
            oe.description,
            NULL as reference_id,
            oe.created_at,
            NULL as project_name,
            NULL as vendor_name,
            NULL as employee_name,
            'System' as creator_name
          FROM office_expenses oe
          WHERE 1=1
        `;
        const officeParams = [];
        let oeIdx = 1;

        if (start_date) {
          officeQuery += ` AND oe.date >= $${oeIdx++}::date`;
          officeParams.push(start_date);
        }
        if (end_date) {
          officeQuery += ` AND oe.date <= $${oeIdx++}::date`;
          officeParams.push(end_date);
        }
        if (category) {
          officeQuery += ` AND oe.category = $${oeIdx++}`;
          officeParams.push(category);
        }

        const { rows } = await pool.query(officeQuery, officeParams);
        officeRows = rows;
      }
    }

    // Merge transactions, payroll and office expenses
    const allRecords = [...transactions, ...payrollRows, ...officeRows].sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ success: true, data: allRecords });
  } catch (err) {
    console.error('Error fetching financial reports:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 3. Payroll Ledger Report Endpoint
router.get('/payroll', authenticate, requireAccounting, async (req, res) => {
  try {
    const { department, month, year } = req.query;
    let query = `
      SELECT 
        p.id, p.user_id, p.month, p.year, p.base_salary, p.bonus, p.incentives, p.deductions, p.net_paid, p.payment_date, p.status,
        u.name as employee_name, u.role, u.department
      FROM payroll p
      JOIN users u ON u.id = p.user_id
      WHERE 1=1
    `;
    const params = [];

    if (department) {
      params.push(department);
      query += ` AND u.department = $${params.length}`;
    }
    if (month) {
      params.push(parseInt(month));
      query += ` AND p.month = $${params.length}`;
    }
    if (year) {
      params.push(parseInt(year));
      query += ` AND p.year = $${params.length}`;
    }

    query += ' ORDER BY p.year DESC, p.month DESC, u.name ASC';
    const { rows } = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error fetching payroll reports:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 4. Invoices Telemetry Report Endpoint
router.get('/invoices', authenticate, requireAccounting, async (req, res) => {
  try {
    const { client_id, project_id, status, start_date, end_date } = req.query;
    let query = `
      SELECT 
        i.id, i.invoice_no, i.client_name, i.amount, COALESCE(i.received_amount, 0) as received_amount, i.date, i.status, i.due_date, i.created_at,
        i.tax_details,
        p.name as project_name,
        u.name as creator_name
      FROM invoices i
      LEFT JOIN projects p ON p.id = i.project_id
      LEFT JOIN users u ON u.id = i.created_by
      WHERE 1=1
    `;
    const params = [];

    if (client_id) {
      params.push(client_id);
      query += ` AND i.client_id = $${params.length}`;
    }
    if (project_id) {
      params.push(project_id);
      query += ` AND i.project_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND i.status = $${params.length}`;
    }
    if (start_date) {
      params.push(start_date);
      query += ` AND i.date >= $${params.length}::date`;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND i.date <= $${params.length}::date`;
    }

    query += ' ORDER BY i.date DESC, i.id DESC';
    const { rows } = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error fetching invoice reports:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 5. Projects & Stages Report Endpoint
router.get('/projects', authenticate, requireAccounting, async (req, res) => {
  try {
    const { status, type, start_date, end_date } = req.query;
    let query = `
      SELECT 
        p.id, p.name, p.client_name, p.type, p.location, p.area_sq_ft, p.structural_engineer, p.status, p.start_date, p.created_at,
        u.name as creator_name,
        (SELECT COUNT(*) FROM project_stages ps WHERE ps.project_id = p.id AND ps.status = 'completed') as completed_stages,
        (SELECT COUNT(*) FROM project_stages ps WHERE ps.project_id = p.id) as total_stages,
        (SELECT stage_name FROM project_stages ps WHERE ps.project_id = p.id AND ps.status = 'in_progress' ORDER BY ps.id ASC LIMIT 1) as active_stage
      FROM projects p
      LEFT JOIN users u ON u.id = p.created_by
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND p.status = $${params.length}`;
    }
    if (type) {
      params.push(type);
      query += ` AND p.type = $${params.length}`;
    }
    if (start_date) {
      params.push(start_date);
      query += ` AND p.start_date >= $${params.length}::date`;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND p.start_date <= $${params.length}::date`;
    }

    query += ' ORDER BY p.start_date DESC, p.id DESC';
    const { rows } = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error fetching project reports:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
