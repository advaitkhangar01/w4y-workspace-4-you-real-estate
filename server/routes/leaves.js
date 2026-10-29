const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { LEAVE_STATUS, USER_ROLES } = require('../utils/constants');
const { createNotification, getAdminAndAccountsUserIds } = require('../utils/notifier');
const { getISTDate } = require('../utils/date');

// GET /api/leaves - Get leaves
// Supports standard list view or ?view=kanban for operational Kanban board
router.get('/', authenticate, async (req, res) => {
  try {
    const { view } = req.query;

    if (view === 'kanban') {
      const today = getISTDate();
      let kanbanQuery = `
        SELECT 
          l.id,
          l.user_id,
          u.name as user_name,
          u.department,
          l.type,
          to_char(l.start_date, 'YYYY-MM-DD') as start_date,
          to_char(l.end_date, 'YYYY-MM-DD') as end_date,
          l.amount,
          l.reason,
          l.status,
          l.remarks,
          l.reviewed_by,
          r.name as reviewer_name,
          l.created_at,
          l.updated_at
        FROM leave_requests l
        JOIN users u ON l.user_id = u.id
        LEFT JOIN users r ON l.reviewed_by = r.id
      `;
      const kanbanParams = [];

      // Exclude deactivated users from active dashboard request kanban
      kanbanQuery += ` WHERE u.is_active IS NOT FALSE`;

      // Non-admins see only their own requests in kanban
      if (req.user.role !== USER_ROLES.ADMIN && req.user.role !== 'back_office' && req.user.role !== 'accounts') {
        kanbanQuery += ` AND l.user_id = $1`;
        kanbanParams.push(req.user.id);
      }

      kanbanQuery += ` ORDER BY l.start_date DESC, l.created_at DESC`;

      const { rows } = await pool.query(kanbanQuery, kanbanParams);

      const pending = [];
      const active_today = [];
      const upcoming = [];
      const resolved = [];

      for (const row of rows) {
        const status = (row.status || '').toLowerCase();
        const type = (row.type || '').toLowerCase();
        const startDate = row.start_date;
        const endDate = row.end_date || startDate;

        if (status === 'pending') {
          pending.push(row);
        } else if (status === 'approved') {
          if (type !== 'advance' && type !== 'resignation' && today >= startDate && today <= endDate) {
            active_today.push(row);
          } else if (startDate > today || (type === 'resignation' && startDate >= today) || (type === 'advance' && today <= endDate)) {
            upcoming.push(row);
          } else {
            // Completed past leave / advance / resignation
            if (resolved.length < 30) {
              resolved.push(row);
            }
          }
        } else {
          // Rejected or other resolved status
          if (resolved.length < 30) {
            resolved.push(row);
          }
        }
      }

      // Sort pending by created_at ASC (oldest pending requests first for priority review)
      pending.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      // Sort upcoming by start_date ASC (soonest upcoming first)
      upcoming.sort((a, b) => (a.start_date > b.start_date ? 1 : -1));

      // Calculate category counts
      const counts = {
        all: pending.length + active_today.length + upcoming.length + resolved.length,
        leaves: 0,
        half_day: 0,
        advance: 0,
        resignation: 0,
      };

      const allItems = [...pending, ...active_today, ...upcoming, ...resolved];
      for (const item of allItems) {
        const t = (item.type || '').toLowerCase();
        if (t === 'half_day') counts.half_day++;
        else if (t === 'advance') counts.advance++;
        else if (t === 'resignation') counts.resignation++;
        else counts.leaves++;
      }

      return res.json({
        kanban: {
          pending,
          active_today,
          upcoming,
          resolved
        },
        counts
      });
    }

    // Standard list query
    let query = `
      SELECT 
        l.id,
        l.user_id,
        to_char(l.start_date, 'YYYY-MM-DD') as start_date,
        to_char(l.end_date, 'YYYY-MM-DD') as end_date,
        l.type,
        l.amount,
        l.reason,
        l.status,
        l.remarks,
        l.reviewed_by,
        l.created_at,
        l.updated_at,
        u.name as user_name, 
        u.department, 
        r.name as reviewer_name
      FROM leave_requests l
      JOIN users u ON l.user_id = u.id
      LEFT JOIN users r ON l.reviewed_by = r.id
    `;
    const params = [];
    console.log('[Leaves] Fetching leaves for user:', req.user.id, 'Role:', req.user.role);

    if (req.user.role !== USER_ROLES.ADMIN && req.user.role !== 'back_office' && req.user.role !== 'accounts') {
      query += ` WHERE l.user_id = $1`;
      params.push(req.user.id);
    }

    query += ` ORDER BY l.start_date DESC`;
    console.log('[Leaves] Final Query:', query);
    console.log('[Leaves] Params:', params);

    const { rows } = await pool.query(query, params);
    console.log('[Leaves] Found rows:', rows.length);
    res.json({ leaves: rows });
  } catch (err) {
    console.error('[Leaves Error] GET /:', err.message);
    console.error(err.stack);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/leaves - Apply for leave/requests
router.post('/', authenticate, async (req, res) => {
  try {
    const { start_date, end_date, type, reason, amount } = req.body;
    const userId = req.user.id;

    // I1: Validate that start_date is a real, parseable date
    if (!start_date || isNaN(new Date(start_date).getTime())) {
      return res.status(400).json({ error: 'A valid start_date is required (YYYY-MM-DD)' });
    }

    if (!type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Set end_date same as start_date for single-day items if missing
    let finalEndDate = end_date || start_date;

    // I2: Ensure end_date is not before start_date
    if (new Date(finalEndDate) < new Date(start_date)) {
      return res.status(400).json({ error: 'End date cannot be before start date' });
    }

    let finalAmount = 0;

    // Enforce amount for advance requests
    if (type === 'advance') {
      finalAmount = parseFloat(amount || 0);
      if (isNaN(finalAmount) || finalAmount <= 0) {
        return res.status(400).json({ error: 'Valid amount is required for salary advance requests' });
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO leave_requests (user_id, start_date, end_date, type, amount, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, start_date, finalEndDate, type, finalAmount, reason, LEAVE_STATUS.PENDING]
    );

    const newLeave = rows[0];

    // Trigger notification to Admin & Accounts team asynchronously
    (async () => {
      const adminIds = await getAdminAndAccountsUserIds();
      createNotification({
        recipientIds: adminIds,
        senderId: req.user.id,
        section: 'leaves',
        title: `📝 New ${type.toUpperCase()} Request`,
        message: `${req.user.name} submitted a ${type} request for ${start_date}`,
        entityType: 'leave_request',
        entityId: newLeave.id,
        actionUrl: `/attendance`,
      });
    })();

    res.status(201).json({ message: 'Request submitted successfully', leave: newLeave });
  } catch (err) {
    console.error('[Leaves Error] POST /:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/leaves/:id - Approve/Reject leave
router.patch('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;
    const adminId = req.user.id;

    if (![LEAVE_STATUS.APPROVED, LEAVE_STATUS.REJECTED].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const { rows: existingLeave } = await pool.query(
      'SELECT start_date, end_date FROM leave_requests WHERE id = $1',
      [id]
    );

    if (existingLeave.length === 0) {
      return res.status(404).json({ error: 'Leave request not found' });
    }

    const leaveDateStr = getISTDate(existingLeave[0].start_date);
    const dateParts = leaveDateStr.split('-');
    const lMonth = parseInt(dateParts[1], 10);
    const lYear = parseInt(dateParts[0], 10);

    const { rows: closed } = await pool.query(
      'SELECT id FROM monthly_closing_log WHERE month = $1 AND year = $2',
      [lMonth, lYear]
    );
    if (closed.length > 0) {
      return res.status(403).json({ error: 'Cannot modify leaves for a closed accounting period' });
    }

    const { rows } = await pool.query(
      `UPDATE leave_requests 
       SET status = $1, remarks = $2, reviewed_by = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, remarks, adminId, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Leave request not found' });
    }

    const updatedLeave = rows[0];

    // Cross-sync approved leave dates into attendance table
    if (status === LEAVE_STATUS.APPROVED && updatedLeave.type !== 'advance' && updatedLeave.type !== 'resignation') {
      try {
        await pool.query(`
          INSERT INTO attendance (user_id, date, status, is_late, late_minutes, hours_worked)
          SELECT $1, d.date::date, 'leave', false, 0, 0
          FROM generate_series($2::date, $3::date, '1 day'::interval) d(date)
          ON CONFLICT (user_id, date) DO UPDATE 
          SET status = 'leave', is_late = false, late_minutes = 0
          WHERE attendance.check_in IS NULL OR attendance.hours_worked = 0
        `, [updatedLeave.user_id, updatedLeave.start_date, updatedLeave.end_date]);
      } catch (attSyncErr) {
        console.error('[Leaves Warning] Failed to cross-sync leave dates to attendance table:', attSyncErr.message);
      }
    } else if (status === LEAVE_STATUS.REJECTED && updatedLeave.type !== 'advance' && updatedLeave.type !== 'resignation') {
      try {
        await pool.query(`
          UPDATE attendance 
          SET status = 'absent'
          WHERE user_id = $1 
            AND date >= $2::date AND date <= $3::date
            AND status = 'leave'
            AND check_in IS NULL
        `, [updatedLeave.user_id, updatedLeave.start_date, updatedLeave.end_date]);
      } catch (attSyncErr) {
        console.error('[Leaves Warning] Failed to reset leave dates in attendance table:', attSyncErr.message);
      }
    }

    // Trigger notification to requesting employee
    createNotification({
      recipientIds: updatedLeave.user_id,
      senderId: req.user.id,
      section: 'leaves',
      title: `📝 Leave Request ${status.toUpperCase()}`,
      message: `Your ${updatedLeave.type} request starting ${updatedLeave.start_date} was ${status}`,
      entityType: 'leave_request',
      entityId: updatedLeave.id,
      actionUrl: `/attendance`,
    });

    res.json({ message: `Leave request ${status}`, leave: updatedLeave });
  } catch (err) {
    console.error('[Leaves Error] PATCH /:id:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
