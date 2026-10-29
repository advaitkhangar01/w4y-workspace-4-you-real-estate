// server/routes/notifications.js
// Express API Router for Notifications Management

const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { createNotification, getAllActiveUserIds } = require('../utils/notifier');

/**
 * 1. Ultra-fast Unread Counter Endpoint
 * GET /api/notifications/unread-count
 * Returns { unreadCount, lastNotificationId } for smart polling (< 3ms)
 */
router.get('/unread-count', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(`
      SELECT 
        COUNT(*)::int as unread_count,
        COALESCE(MAX(id), 0)::int as last_notification_id
      FROM notifications
      WHERE user_id = $1 AND is_read = FALSE
    `, [userId]);

    res.json({
      unreadCount: rows[0]?.unread_count || 0,
      lastNotificationId: rows[0]?.last_notification_id || 0,
    });
  } catch (err) {
    console.error('GET /api/notifications/unread-count error:', err.message);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

/**
 * 2. Fetch User Notifications List (Paginated & Filterable)
 * GET /api/notifications
 * Query params: page=1, limit=20, section=all|tasks|projects|..., unread_only=true|false
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const section = req.query.section?.toLowerCase();
    const unreadOnly = req.query.unread_only === 'true';

    let query = `
      SELECT n.*, u.name as sender_name, u.role as sender_role
      FROM notifications n
      LEFT JOIN users u ON u.id = n.sender_id
      WHERE n.user_id = $1
    `;
    const params = [userId];

    if (section && section !== 'all') {
      params.push(section);
      query += ` AND n.section = $${params.length}`;
    }

    if (unreadOnly) {
      query += ` AND n.is_read = FALSE`;
    }

    query += ` ORDER BY n.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows: notifications } = await pool.query(query, params);

    // Get total count & unread count
    const { rows: countRows } = await pool.query(`
      SELECT 
        COUNT(*)::int as total_count,
        COUNT(*) FILTER (WHERE is_read = FALSE)::int as unread_count
      FROM notifications
      WHERE user_id = $1
    `, [userId]);

    res.json({
      notifications,
      page,
      limit,
      totalCount: countRows[0]?.total_count || 0,
      unreadCount: countRows[0]?.unread_count || 0,
    });
  } catch (err) {
    console.error('GET /api/notifications error:', err.message);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/**
 * 3. Mark Single Notification as Read
 * PATCH /api/notifications/:id/read
 */
router.patch('/:id/read', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = parseInt(req.params.id, 10);

    if (isNaN(notificationId)) {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }

    const { rows } = await pool.query(`
      UPDATE notifications
      SET is_read = TRUE, read_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [notificationId, userId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found or unauthorized' });
    }

    res.json({ message: 'Notification marked as read', notification: rows[0] });
  } catch (err) {
    console.error('PATCH /api/notifications/:id/read error:', err.message);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

/**
 * 4. Mark All User Notifications as Read
 * PATCH /api/notifications/read-all
 */
router.patch('/read-all', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const { rowCount } = await pool.query(`
      UPDATE notifications
      SET is_read = TRUE, read_at = NOW()
      WHERE user_id = $1 AND is_read = FALSE
    `, [userId]);

    res.json({ message: 'All notifications marked as read', count: rowCount });
  } catch (err) {
    console.error('PATCH /api/notifications/read-all error:', err.message);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

/**
 * 5. Admin Broadcast Announcement Endpoint
 * POST /api/notifications/broadcast
 * Require admin role. Sends notification to all users or filtered by role/department.
 */
router.post('/broadcast', authenticate, requireAdmin, async (req, res) => {
  try {
    const { title, message, target_role, target_department, action_url } = req.body;

    if (!title?.trim() || !message?.trim()) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    const recipientIds = await getAllActiveUserIds(target_role || null, target_department || null);

    if (recipientIds.length === 0) {
      return res.status(400).json({ error: 'No matching users found for this target filter' });
    }

    await createNotification({
      recipientIds,
      senderId: req.user.id,
      section: 'system',
      title: `📢 ${title.trim()}`,
      message: message.trim(),
      entityType: 'broadcast',
      actionUrl: action_url || null,
      tenantId: req.user.tenant_id || 1,
    });

    res.status(201).json({
      message: `Announcement broadcast successfully to ${recipientIds.length} user(s)`,
      recipientCount: recipientIds.length,
    });
  } catch (err) {
    console.error('POST /api/notifications/broadcast error:', err.message);
    res.status(500).json({ error: 'Failed to send broadcast announcement' });
  }
});

module.exports = router;
