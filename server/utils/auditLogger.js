// server/utils/auditLogger.js
// Utility for recording structured audit trail entries for sensitive operations

const pool = require('../db');

/**
 * Log an action to the audit_logs table
 * @param {Object} params
 * @param {number|null} params.userId - User performing the action
 * @param {string} params.action - Short descriptor (e.g. 'PAYROLL_MANUAL_OVERRIDE', 'MONTH_CLOSE_EXECUTE', 'PERIOD_UNLOCK')
 * @param {string} params.entityType - Target entity type (e.g. 'payroll', 'monthly_closing_log', 'transaction')
 * @param {string|number|null} params.entityId - Primary key of target entity
 * @param {Object|null} params.oldValue - State prior to change
 * @param {Object|null} params.newValue - State after change
 * @param {string|null} params.ipAddress - Client IP address
 * @param {Object|null} dbClient - Optional PostgreSQL transaction client
 */
async function logAudit({ userId = null, action, entityType, entityId = null, oldValue = null, newValue = null, ipAddress = null }, dbClient = null) {
  const client = dbClient || pool;
  try {
    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        action,
        entityType,
        entityId ? String(entityId) : null,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        ipAddress
      ]
    );
  } catch (err) {
    console.error('Audit Log Insertion Warning:', err.message);
  }
}

module.exports = { logAudit };
