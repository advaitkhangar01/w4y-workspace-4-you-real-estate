const router = require('express').Router();
const pool = require('../db');
const { authenticate } = require('../middleware/auth');
const { getISTDate } = require('../utils/date');
const { createNotification, getAdminAndAccountsUserIds } = require('../utils/notifier');

// POST /api/daily-reports (Submit Today's Report)
router.post('/', authenticate, async (req, res) => {
  try {
    const { work_done, blockers, next_day_plan, hours_worked, date } = req.body;

    if (!work_done || !work_done.trim()) {
      return res.status(400).json({ error: 'Work done today is required' });
    }

    const formattedDate = getISTDate(date ? new Date(date) : new Date());
    const finalHours = hours_worked !== undefined && hours_worked !== null ? parseFloat(hours_worked) : 8.00;

    if (isNaN(finalHours) || finalHours < 0.5 || finalHours > 24) {
      return res.status(400).json({ error: 'Hours spent must be between 0.5 and 24 hours' });
    }

    // Check if report already exists for user on this date
    const checkResult = await pool.query(
      'SELECT id FROM daily_reports WHERE tenant_id = $1 AND user_id = $2 AND date = $3::date',
      [req.tenantId, req.user.id, formattedDate]
    );

    if (checkResult.rows.length > 0) {
      return res.status(400).json({
        error: 'You have already submitted a daily report for this date. You can edit it instead.'
      });
    }

    // Insert new daily report
    const insertResult = await pool.query(
      `INSERT INTO daily_reports (tenant_id, user_id, date, work_done, blockers, next_day_plan, hours_worked)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7)
       RETURNING *`,
      [req.tenantId, req.user.id, formattedDate, work_done.trim(), blockers?.trim() || null, next_day_plan?.trim() || null, finalHours]
    );

    const report = insertResult.rows[0];

    // Trigger notification to Admin / Management
    (async () => {
      const adminIds = await getAdminAndAccountsUserIds();
      createNotification({
        recipientIds: adminIds,
        senderId: req.user.id,
        section: 'daily_reports',
        title: '📋 Daily Report Submitted',
        message: `${req.user.name} submitted a daily report for ${formattedDate}`,
        entityType: 'daily_report',
        entityId: report.id,
        actionUrl: `/daily-reports`,
      });
    })();

    res.status(201).json(report);
  } catch (err) {
    console.error('Error submitting daily report:', err);
    res.status(500).json({ error: 'Server error while submitting report' });
  }
});

// GET /api/daily-reports/today (Fetch Today's Submission status)
router.get('/today', authenticate, async (req, res) => {
  try {
    const today = getISTDate();
    const { rows } = await pool.query(
      'SELECT * FROM daily_reports WHERE tenant_id = $1 AND user_id = $2 AND date = $3::date',
      [req.tenantId, req.user.id, today]
    );

    res.json(rows[0] || null);
  } catch (err) {
    console.error('Error fetching today daily report:', err);
    res.status(500).json({ error: 'Server error while fetching today status' });
  }
});

// GET /api/daily-reports (List Submissions)
router.get('/', authenticate, async (req, res) => {
  try {
    const { userId, date, startDate, endDate } = req.query;

    let query = `
      SELECT dr.id, dr.tenant_id, dr.user_id, dr.date, dr.work_done, dr.blockers, dr.next_day_plan, dr.hours_worked, dr.created_at, dr.updated_at,
             u.name as employee_name, u.role as employee_role, u.department as employee_department
      FROM daily_reports dr
      JOIN users u ON dr.user_id = u.id
      WHERE dr.tenant_id = $1
    `;
    const queryParams = [req.tenantId];

    if (req.user.role !== 'admin') {
      // Restrict employee to only their own reports
      query += ` AND dr.user_id = $${queryParams.length + 1}`;
      queryParams.push(req.user.id);
    } else {
      // Admin filter by specific employee
      if (userId) {
        query += ` AND dr.user_id = $${queryParams.length + 1}`;
        queryParams.push(parseInt(userId));
      }
      // Admin filter by specific date
      if (date) {
        query += ` AND dr.date = $${queryParams.length + 1}`;
        queryParams.push(date);
      } else {
        // Admin filter by date range
        if (startDate) {
          query += ` AND dr.date >= $${queryParams.length + 1}`;
          queryParams.push(startDate);
        }
        if (endDate) {
          query += ` AND dr.date <= $${queryParams.length + 1}`;
          queryParams.push(endDate);
        }
      }
    }

    query += ` ORDER BY dr.date DESC, dr.created_at DESC`;

    const { rows } = await pool.query(query, queryParams);
    res.json({ reports: rows });
  } catch (err) {
    console.error('Error listing daily reports:', err);
    res.status(500).json({ error: 'Server error while listing reports' });
  }
});

// PUT /api/daily-reports/:id (Update Report)
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { work_done, blockers, next_day_plan, hours_worked } = req.body;

    if (!work_done || !work_done.trim()) {
      return res.status(400).json({ error: 'Work done today is required' });
    }

    const finalHours = hours_worked !== undefined && hours_worked !== null ? parseFloat(hours_worked) : 8.00;
    if (isNaN(finalHours) || finalHours < 0.5 || finalHours > 24) {
      return res.status(400).json({ error: 'Hours spent must be between 0.5 and 24 hours' });
    }

    // Check if report exists and get tenant_id and user_id
    const reportResult = await pool.query(
      'SELECT tenant_id, user_id FROM daily_reports WHERE id = $1',
      [id]
    );

    if (reportResult.rows.length === 0) {
      return res.status(404).json({ error: 'Daily report not found' });
    }

    const report = reportResult.rows[0];

    // Verify tenant match
    if (report.tenant_id !== req.tenantId) {
      return res.status(403).json({ error: 'Access denied: Tenant mismatch' });
    }

    // Check permissions: owner or admin
    if (report.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Unauthorized to edit this report' });
    }

    // Update report
    const updateResult = await pool.query(
      `UPDATE daily_reports
       SET work_done = $1, blockers = $2, next_day_plan = $3, hours_worked = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [work_done.trim(), blockers?.trim() || null, next_day_plan?.trim() || null, finalHours, id]
    );

    res.json(updateResult.rows[0]);
  } catch (err) {
    console.error('Error updating daily report:', err);
    res.status(500).json({ error: 'Server error while updating report' });
  }
});

module.exports = router;
