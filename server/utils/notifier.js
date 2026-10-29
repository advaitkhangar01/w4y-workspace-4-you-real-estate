// server/utils/notifier.js
// Universal Notification Helper Service
// Designed for safe, non-blocking asynchronous notification delivery

const pool = require('../db');

/**
 * Creates and inserts notifications for one or multiple recipient user IDs.
 * Wrapped safely so notification failures will NEVER crash or block the caller transaction.
 * 
 * @param {Object} params
 * @param {number|number[]} params.recipientIds - User ID or array of User IDs to receive the notification
 * @param {number|null} [params.senderId=null] - Triggering user ID (null for system notifications)
 * @param {string} params.section - Section category ('tasks', 'projects', 'leaves', 'attendance', 'daily_reports', 'invoices', 'accounting', 'system')
 * @param {string} params.title - Short headline/title
 * @param {string} params.message - Detailed notification text
 * @param {string|null} [params.entityType=null] - Entity type ('task', 'project', 'leave_request', 'invoice', etc.)
 * @param {number|null} [params.entityId=null] - Referenced record ID
 * @param {string|null} [params.actionUrl=null] - Deep link URL in the frontend UI
 * @param {number} [params.tenantId=1] - Tenant ID
 */
async function createNotification({
  recipientIds,
  senderId = null,
  section,
  title,
  message,
  entityType = null,
  entityId = null,
  actionUrl = null,
  tenantId = 1,
}) {
  try {
    if (!recipientIds) return;

    // Standardize recipientIds to an array
    const rawIds = Array.isArray(recipientIds) ? recipientIds : [recipientIds];
    
    // Filter out invalid IDs and prevent sending notification to the sender (unless self-test)
    const validRecipientIds = [...new Set(rawIds)]
      .map(id => parseInt(id, 10))
      .filter(id => !isNaN(id) && id > 0);

    if (validRecipientIds.length === 0) return;

    // Filter out senderId unless it's a broadcast or specific single action
    const finalRecipients = validRecipientIds.filter(id => id !== senderId || validRecipientIds.length === 1);
    if (finalRecipients.length === 0) return;

    // Bulk insert into notifications table
    const values = [];
    const valuePlaceholders = [];
    let paramIndex = 1;

    for (const userId of finalRecipients) {
      valuePlaceholders.push(
        `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
      );
      values.push(
        userId,
        senderId,
        section,
        title,
        message,
        entityType,
        entityId,
        actionUrl,
        tenantId
      );
    }

    const query = `
      INSERT INTO notifications 
        (user_id, sender_id, section, title, message, entity_type, entity_id, action_url, tenant_id)
      VALUES ${valuePlaceholders.join(', ')}
      RETURNING id, user_id
    `;

    await pool.query(query, values);
  } catch (err) {
    // Non-blocking catch: log error but do not throw to caller
    console.error('⚠️ [Notification Engine Warning] Failed to dispatch notification:', err.message);
  }
}

/**
 * Helper to fetch Admin and Back-office user IDs for system alerts
 */
async function getAdminAndAccountsUserIds() {
  try {
    const { rows } = await pool.query(`
      SELECT id FROM users 
      WHERE role IN ('admin', 'back_office', 'accounts') OR LOWER(department) = 'accounts'
    `);
    return rows.map(r => r.id);
  } catch (err) {
    console.error('Failed to fetch admin/accounts user IDs:', err.message);
    return [];
  }
}

/**
 * Helper to fetch all active user IDs for system broadcasts
 */
async function getAllActiveUserIds(filterRole = null, filterDepartment = null) {
  try {
    let query = 'SELECT id FROM users WHERE 1=1';
    const params = [];

    if (filterRole) {
      params.push(filterRole);
      query += ` AND role = $${params.length}`;
    }

    if (filterDepartment) {
      params.push(filterDepartment);
      query += ` AND LOWER(department) = LOWER($${params.length})`;
    }

    const { rows } = await pool.query(query, params);
    return rows.map(r => r.id);
  } catch (err) {
    console.error('Failed to fetch active user IDs for broadcast:', err.message);
    return [];
  }
}

/**
 * Daily cleanup task:
 * 1. Prunes read notifications older than 60 days
 * 2. Enforces a maximum cap of 100 notifications per user
 */
async function cleanupOldNotifications() {
  try {
    console.log('🧹 [Notification Cleanup] Running daily notification maintenance...');
    
    // 1. Delete read notifications older than 60 days
    const { rowCount: count60Days } = await pool.query(`
      DELETE FROM notifications 
      WHERE is_read = TRUE AND created_at < NOW() - INTERVAL '60 days'
    `);

    // 2. Trim excess notifications per user (keep newest 100 per user)
    const { rowCount: countTrimmed } = await pool.query(`
      DELETE FROM notifications n
      WHERE n.id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rn
          FROM notifications
        ) sub
        WHERE sub.rn > 100
      )
    `);

    console.log(`✅ [Notification Cleanup] Pruned ${count60Days || 0} old read notifications and ${countTrimmed || 0} overflow entries.`);
  } catch (err) {
    console.error('❌ [Notification Cleanup Error]:', err.message);
  }
}

/**
 * Deletes all notifications linked to a deleted entity (task, leave, project, invoice, etc.)
 */
async function deleteEntityNotifications(entityType, entityId) {
  try {
    if (!entityType || !entityId) return;
    const eid = parseInt(entityId, 10);
    if (isNaN(eid)) return;

    await pool.query(
      'DELETE FROM notifications WHERE entity_type = $1 AND entity_id = $2',
      [entityType, eid]
    );
  } catch (err) {
    console.error('⚠️ [Notification Cleanup Warning] Failed to delete entity notifications:', err.message);
  }
}

module.exports = {
  createNotification,
  getAdminAndAccountsUserIds,
  getAllActiveUserIds,
  cleanupOldNotifications,
  deleteEntityNotifications,
};
