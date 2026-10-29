// server/middleware/auth.js
// JWT authentication and role-based access middleware

const jwt = require('jsonwebtoken');
const pool = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
const ACTUAL_SECRET = JWT_SECRET;

/**
 * Attach user to req.user from Bearer token
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, ACTUAL_SECRET);

    const { rows } = await pool.query(
      'SELECT id, name, role, department, phone, username, tenant_id, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );
    if (!rows[0]) return res.status(401).json({ error: 'User not found' });
    if (rows[0].is_active === false) return res.status(401).json({ error: 'User account has been deactivated' });

    req.user = rows[0];
    req.tenantId = rows[0].tenant_id || 1;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

/**
 * Require admin role
 */
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

/**
 * Check if a user has financial view/edit privileges (Admin or Accounts)
 */
const canViewFinancials = (user) => {
  if (!user) return false;
  return (
    user.role === 'admin' ||
    user.role === 'back_office' ||
    user.role === 'accounts' ||
    user.department?.toLowerCase() === 'accounts'
  );
};

/**
 * Require admin or accounts department for financial information
 */
const requireAccounting = (req, res, next) => {
  if (canViewFinancials(req.user)) {
    return next();
  }
  return res.status(403).json({ error: 'Financial information is restricted to Admin and Accounts users.' });
};

/**
 * Generate signed JWT
 */
const signToken = (userId) => {
  return jwt.sign({ userId }, ACTUAL_SECRET, { expiresIn: '7d' });
};

module.exports = { authenticate, requireAdmin, requireAccounting, canViewFinancials, signToken };
