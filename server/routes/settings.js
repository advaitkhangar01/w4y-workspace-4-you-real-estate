// server/routes/settings.js
// Settings API — User management (admin) + password change (self)

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { executeFactoryReset, getResetPreview } = require('../utils/factoryReset');
const {
  recalculateAttendanceForUser,
  recalculateAttendanceForBatch,
  recalculateAttendanceForAll
} = require('../utils/attendanceRecalculator');
const { calculateHourlyRate } = require('../utils/payroll');
const { logAudit } = require('../utils/auditLogger');

const confirmCodes = new Map(); // userId -> { code, expires }

// All settings routes require authentication
router.use(authenticate);

// ─── Admin: List all users ────────────────────────────────────────────────────
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const status = req.query.status || 'active';
    let filterClause = 'WHERE u.is_active IS NOT FALSE';
    if (status === 'deactivated') {
      filterClause = 'WHERE u.is_active IS FALSE';
    } else if (status === 'all') {
      filterClause = '';
    }

    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.username, u.role, u.department, u.phone, u.base_salary, u.hourly_rate, u.batch_id, u.created_at, u.is_active, u.deactivated_at, b.name as batch_name 
       FROM users u
       LEFT JOIN attendance_batches b ON u.batch_id = b.id
       ${filterClause}
       ORDER BY u.name ASC`
    );
    res.json({ users: rows });
  } catch (err) {
    console.error('Settings: fetch users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ─── Admin: Create user ──────────────────────────────────────────────────────
router.post('/users', requireAdmin, async (req, res) => {
  try {
    const { name, username, password, role, department, phone, base_salary, hourly_rate, batch_id } = req.body;

    if (!name?.trim() || !username?.trim() || !password?.trim()) {
      return res.status(400).json({ error: 'Name, username and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const validRoles = ['admin', 'design_head', 'design', 'liasoning', 'civil_engineer', 'employee', 'back_office', 'project_head'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Role must be admin, design_head, design, liasoning, civil_engineer, employee, back_office or project_head' });
    }

    // Check duplicate username
    const existing = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username.toLowerCase().trim()]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let finalHourlyRate = parseFloat(hourly_rate) || 0;
      const parsedBaseSalary = parseFloat(base_salary) || 0;
      const effectiveBatchId = batch_id ? parseInt(batch_id) : null;
      if (parsedBaseSalary > 0) {
        let batchMinHours = 9.0;
        if (effectiveBatchId) {
          const { rows: bRows } = await client.query('SELECT min_working_hours FROM attendance_batches WHERE id = $1', [effectiveBatchId]);
          if (bRows.length > 0 && bRows[0].min_working_hours) {
            batchMinHours = parseFloat(bRows[0].min_working_hours);
          }
        } else {
          const { rows: sRows } = await client.query("SELECT value FROM app_settings WHERE key = 'min_working_hours'");
          if (sRows.length > 0 && sRows[0].value) {
            batchMinHours = parseFloat(sRows[0].value);
          }
        }
        finalHourlyRate = calculateHourlyRate(parsedBaseSalary, batchMinHours);
      }

      const { rows } = await client.query(
        `INSERT INTO users (name, username, password_hash, role, department, phone, base_salary, hourly_rate, batch_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, name, username, role, department, phone, base_salary, hourly_rate, batch_id, created_at`,
        [name.trim(), username.toLowerCase().trim(), passwordHash, role, department?.trim() || null, phone?.trim() || null, parsedBaseSalary, finalHourlyRate, effectiveBatchId]
      );

      if (rows[0]) {
        await recalculateAttendanceForUser(rows[0].id, { dbClient: client });
      }

      await client.query('COMMIT');
      logAudit({ userId: req.user.id, action: 'USER_CREATE', entityType: 'users', entityId: rows[0].id, ipAddress: req.ip });
      res.status(201).json(rows[0]);
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Settings: create user error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// ─── Admin: Delete user ──────────────────────────────────────────────────────
router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Prevent self-deletion
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    // Soft-delete user to protect historical payroll, attendance, and statutory records,
    // while clearing active operational responsibilities (open tasks, project assignments)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rowCount } = await client.query(
        'UPDATE users SET is_active = FALSE, deactivated_at = NOW() WHERE id = $1',
        [userId]
      );
      if (rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found' });
      }

      // Remove from active project assignments
      await client.query(
        'DELETE FROM project_assignments WHERE user_id = $1',
        [userId]
      );

      // Unassign open/active tasks so they do not remain assigned to a deactivated user
      await client.query(
        "UPDATE tasks SET assigned_to = NULL WHERE assigned_to = $1 AND status IN ('pending', 'in_progress', 'review')",
        [userId]
      );

      // Remove from open task participants
      await client.query(
        "DELETE FROM task_participants WHERE user_id = $1 AND task_id IN (SELECT id FROM tasks WHERE status IN ('pending', 'in_progress', 'review'))",
        [userId]
      );

      await client.query('COMMIT');
      logAudit({ userId: req.user.id, action: 'USER_DEACTIVATE', entityType: 'users', entityId: userId, ipAddress: req.ip });
      res.json({ message: 'User deleted successfully' });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Settings: delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ─── Admin: Reactivate/Restore user ──────────────────────────────────────────
router.patch('/users/:id/restore', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { rows } = await pool.query(
      `UPDATE users
       SET is_active = TRUE,
           deactivated_at = NULL
       WHERE id = $1
       RETURNING id, name, username, role, department, phone, base_salary, hourly_rate, is_active, deactivated_at`,
      [userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    logAudit({ userId: req.user.id, action: 'USER_RESTORE', entityType: 'users', entityId: userId, ipAddress: req.ip });
    res.json({ message: 'User reactivated successfully', user: rows[0] });
  } catch (err) {
    console.error('Settings: restore user error:', err);
    res.status(500).json({ error: 'Failed to reactivate user' });
  }
});

// ─── Admin: Reset user password ──────────────────────────────────────────────
router.patch('/users/:id/reset-password', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    const { rowCount } = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, userId]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Settings: reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ─── Admin: Update user profile ──────────────────────────────────────────────
router.patch('/users/:id', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { name, username, role, department, phone, base_salary, hourly_rate, batch_id } = req.body;

    if (!name?.trim() || !username?.trim()) {
      return res.status(400).json({ error: 'Name and username are required' });
    }

    const validRoles = ['admin', 'design_head', 'design', 'liasoning', 'civil_engineer', 'employee', 'back_office', 'project_head'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Role must be admin, design_head, design, liasoning, civil_engineer, employee, back_office or project_head' });
    }

    // Check duplicate username (excluding current user)
    const existing = await pool.query(
      'SELECT id FROM users WHERE username = $1 AND id != $2',
      [username.toLowerCase().trim(), userId]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let finalHourlyRate = parseFloat(hourly_rate) || 0;
      const parsedBaseSalary = parseFloat(base_salary) || 0;
      const effectiveBatchId = batch_id ? parseInt(batch_id) : null;
      if (parsedBaseSalary > 0) {
        let batchMinHours = 9.0;
        if (effectiveBatchId) {
          const { rows: bRows } = await client.query('SELECT min_working_hours FROM attendance_batches WHERE id = $1', [effectiveBatchId]);
          if (bRows.length > 0 && bRows[0].min_working_hours) {
            batchMinHours = parseFloat(bRows[0].min_working_hours);
          }
        } else {
          const { rows: sRows } = await client.query("SELECT value FROM app_settings WHERE key = 'min_working_hours'");
          if (sRows.length > 0 && sRows[0].value) {
            batchMinHours = parseFloat(sRows[0].value);
          }
        }
        finalHourlyRate = calculateHourlyRate(parsedBaseSalary, batchMinHours);
      }

      const { rows } = await client.query(
        `UPDATE users 
         SET name = $1, username = $2, role = $3, department = $4, phone = $5, base_salary = $6, hourly_rate = $7, batch_id = $8
         WHERE id = $9
         RETURNING id, name, username, role, department, phone, base_salary, hourly_rate, batch_id, created_at`,
        [
          name.trim(), 
          username.toLowerCase().trim(), 
          role, 
          department?.trim() || null, 
          phone?.trim() || null, 
          parsedBaseSalary, 
          finalHourlyRate,
          effectiveBatchId,
          userId
        ]
      );

      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found' });
      }

      await recalculateAttendanceForUser(userId, { dbClient: client });
      await client.query('COMMIT');
      logAudit({ userId: req.user.id, action: 'USER_UPDATE', entityType: 'users', entityId: userId, newValue: rows[0], ipAddress: req.ip });
      res.json({ ...rows[0], recalculated: true });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Settings: update user error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// ─── Self: Change own password ───────────────────────────────────────────────
router.patch('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    // Verify current password
    const { rows } = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }

    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, req.user.id]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Settings: change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// ─── Admin: App Settings ─────────────────────────────────────────────────────

router.get('/app', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM app_settings ORDER BY key ASC');
    const settings = rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
    res.json(settings);
  } catch (err) {
    console.error('Settings: fetch app settings error:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.post('/app', requireAdmin, async (req, res) => {
  // K2: Only allow known settings keys to be written
  const ALLOWED_SETTINGS_KEYS = new Set([
    'office_start_time', 'late_threshold_time', 'half_day_cutoff_time',
    'late_threshold_mins', 'min_working_hours',
    'geofence_enabled', 'office_lat', 'office_lng',
    'geofence_strict_radius', 'geofence_buffer_radius', 'geofence_max_accuracy',
    'late_penalty_amount', 'half_day_penalty_percent',
    'late_penalty_rule_count', 'late_penalty_rule_days',
    'company_name', 'company_address', 'company_phone', 'company_email',
    'company_gst', 'company_website', 'company_logo',
    'overtime_threshold_hour',
  ]);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const settings = req.body; // { key: value, ... }
    let timingSettingUpdated = false;
    const timingKeys = new Set(['office_start_time', 'late_threshold_time', 'half_day_cutoff_time', 'late_threshold_mins', 'min_working_hours']);

    for (const [key, value] of Object.entries(settings)) {
      if (!ALLOWED_SETTINGS_KEYS.has(key)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Unknown setting key: "${key}". Contact a developer to add new setting keys.` });
      }
      if (timingKeys.has(key)) {
        timingSettingUpdated = true;
      }
      await client.query(
        'INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        [key, String(value)]
      );
    }

    if (timingSettingUpdated) {
      await recalculateAttendanceForAll({ dbClient: client });
    }

    await client.query('COMMIT');
    res.json({ message: 'Settings updated successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Settings: update app settings error:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  } finally {
    client.release();
  }
});


// ─── Admin: Holidays ─────────────────────────────────────────────────────────

router.get('/holidays', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM holidays ORDER BY date ASC');
    res.json(rows);
  } catch (err) {
    console.error('Settings: fetch holidays error:', err);
    res.status(500).json({ error: 'Failed to fetch holidays' });
  }
});

router.post('/holidays', requireAdmin, async (req, res) => {
  try {
    const { date, name, is_paid } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO holidays (date, name, is_paid) VALUES ($1, $2, $3) RETURNING *',
      [date, name, is_paid !== false]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Settings: create holiday error:', err);
    res.status(500).json({ error: 'Failed to create holiday' });
  }
});

router.delete('/holidays/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM holidays WHERE id = $1', [req.params.id]);
    res.json({ message: 'Holiday deleted' });
  } catch (err) {
    console.error('Settings: delete holiday error:', err);
    res.status(500).json({ error: 'Failed to delete holiday' });
  }
});

// ─── Admin: Factory Reset ───────────────────────────────────────────────────

// 1. Get preview + generate confirmation code
router.get('/factory-reset/preview', requireAdmin, async (req, res) => {
  try {
    const counts = await getResetPreview(pool);
    
    // Generate a random 6-char alphanumeric code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Store in memory with 10 min TTL
    confirmCodes.set(req.user.id, {
      code,
      expires: Date.now() + 10 * 60 * 1000
    });

    res.json({ counts, confirmationCode: code });
  } catch (err) {
    console.error('Settings: reset preview error:', err);
    res.status(500).json({ error: 'Failed to get reset preview' });
  }
});

// 2. Execute reset
router.delete('/factory-reset', requireAdmin, async (req, res) => {
  try {
    const { confirmationCode } = req.body;
    const stored = confirmCodes.get(req.user.id);

    if (!stored || Date.now() > stored.expires) {
      return res.status(400).json({ error: 'Confirmation code expired. Please refresh the preview.' });
    }

    if (confirmationCode !== stored.code) {
      return res.status(400).json({ error: 'Invalid confirmation code' });
    }

    const summary = await executeFactoryReset(pool);
    
    // Clear code after successful use
    confirmCodes.delete(req.user.id);
    logAudit({ userId: req.user.id, action: 'FACTORY_RESET', entityType: 'system', newValue: summary, ipAddress: req.ip });

    res.json({ success: true, summary });
  } catch (err) {
    console.error('Settings: factory reset error:', err);
    res.status(500).json({ error: 'Factory reset failed. Database was rolled back.' });
  }
});

// ─── Admin: Attendance Batches CRUD ──────────────────────────────────────────

// 1. Get all batches
router.get('/batches', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM attendance_batches ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    console.error('Settings: fetch batches error:', err);
    res.status(500).json({ error: 'Failed to fetch attendance batches' });
  }
});

// 2. Create batch
router.post('/batches', requireAdmin, async (req, res) => {
  try {
    const { name, office_start_time, late_threshold_time, half_day_cutoff_time, min_working_hours } = req.body;

    if (!name?.trim() || !office_start_time || !late_threshold_time || !half_day_cutoff_time) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { rows } = await pool.query(
      `INSERT INTO attendance_batches (name, office_start_time, late_threshold_time, half_day_cutoff_time, min_working_hours)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name.trim(), office_start_time, late_threshold_time, half_day_cutoff_time, parseFloat(min_working_hours) || 9.00]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Settings: create batch error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Batch name already exists' });
    }
    res.status(500).json({ error: 'Failed to create attendance batch' });
  }
});

// 3. Update batch
router.put('/batches/:id', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const batchId = parseInt(req.params.id);
    const { name, office_start_time, late_threshold_time, half_day_cutoff_time, min_working_hours } = req.body;

    if (!name?.trim() || !office_start_time || !late_threshold_time || !half_day_cutoff_time) {
      client.release();
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE attendance_batches
       SET name = $1, office_start_time = $2, late_threshold_time = $3, half_day_cutoff_time = $4, min_working_hours = $5
       WHERE id = $6
       RETURNING *`,
      [name.trim(), office_start_time, late_threshold_time, half_day_cutoff_time, parseFloat(min_working_hours) || 9.00, batchId]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Batch not found' });
    }

    const { recalculatedCount, affectedUsersCount } = await recalculateAttendanceForBatch(batchId, { dbClient: client });
    await client.query('COMMIT');

    res.json({ ...rows[0], recalculatedCount, affectedUsersCount });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Settings: update batch error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Batch name already exists' });
    }
    res.status(500).json({ error: 'Failed to update attendance batch' });
  } finally {
    client.release();
  }
});

// 4. Delete batch
router.delete('/batches/:id', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const batchId = parseInt(req.params.id);
    await client.query('BEGIN');

    const { rowCount } = await client.query('DELETE FROM attendance_batches WHERE id = $1', [batchId]);

    if (rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Batch not found' });
    }

    await recalculateAttendanceForAll({ dbClient: client });
    await client.query('COMMIT');

    res.json({ message: 'Batch deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Settings: delete batch error:', err);
    res.status(500).json({ error: 'Failed to delete attendance batch' });
  } finally {
    client.release();
  }
});

// 5. Manual recalculate all attendance
router.post('/batches/recalculate', requireAdmin, async (req, res) => {
  try {
    const result = await recalculateAttendanceForAll();
    res.json({ message: 'Past attendance records recalculated successfully', ...result });
  } catch (err) {
    console.error('Settings: manual recalculation error:', err);
    res.status(500).json({ error: 'Failed to recalculate attendance' });
  }
});

// ─── Attendance Master Dropdowns CRUD ────────────────────────────────────────

// 1. Get dropdown options (public to all authenticated users)
router.get('/dropdowns', async (req, res) => {
  try {
    const { category } = req.query;
    let query = 'SELECT * FROM attendance_dropdown_masters WHERE is_active = true';
    const params = [];

    // If request has admin query string ?all=true, return inactive ones as well
    if (req.query.all === 'true' && req.user?.role === 'admin') {
      query = 'SELECT * FROM attendance_dropdown_masters';
    }

    if (category) {
      query += (query.includes('WHERE') ? ' AND' : ' WHERE') + ' category = $1';
      params.push(category);
    }

    query += ' ORDER BY category ASC, display_order ASC, label ASC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Settings: fetch dropdowns error:', err);
    res.status(500).json({ error: 'Failed to fetch dropdown options' });
  }
});

// 2. Create dropdown option (Admin only)
router.post('/dropdowns', requireAdmin, async (req, res) => {
  try {
    const { category, key, label, description, color, display_order, meta_json, is_active } = req.body;

    if (!category?.trim() || !label?.trim()) {
      return res.status(400).json({ error: 'Category and Label are required' });
    }

    // Auto-generate key if not provided
    const keySlug = (key || label).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

    const { rows } = await pool.query(
      `INSERT INTO attendance_dropdown_masters (category, key, label, description, color, display_order, meta_json, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        category.trim(),
        keySlug,
        label.trim(),
        description?.trim() || null,
        color?.trim() || 'slate',
        parseInt(display_order) || 0,
        meta_json || {},
        is_active !== false
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Settings: create dropdown option error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An option with this key already exists' });
    }
    res.status(500).json({ error: 'Failed to create dropdown option' });
  }
});

// 3. Update dropdown option (Admin only)
router.put('/dropdowns/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid dropdown ID' });
    }
    const { label, description, color, display_order, meta_json, is_active } = req.body;

    if (!label?.trim()) {
      return res.status(400).json({ error: 'Label is required' });
    }

    const { rows } = await pool.query(
      `UPDATE attendance_dropdown_masters
       SET label = $1, description = $2, color = $3, display_order = $4, meta_json = $5, is_active = $6, updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        label.trim(),
        description?.trim() || null,
        color?.trim() || 'slate',
        parseInt(display_order) || 0,
        meta_json || {},
        is_active !== false,
        id
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Dropdown option not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Settings: update dropdown option error:', err);
    res.status(500).json({ error: 'Failed to update dropdown option' });
  }
});

// 4. Delete dropdown option (Admin only)
router.delete('/dropdowns/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid dropdown ID' });
    }
    const { rowCount } = await pool.query('DELETE FROM attendance_dropdown_masters WHERE id = $1', [id]);

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Dropdown option not found' });
    }

    res.json({ message: 'Option deleted successfully' });
  } catch (err) {
    console.error('Settings: delete dropdown option error:', err);
    res.status(500).json({ error: 'Failed to delete dropdown option' });
  }
});

module.exports = router;

