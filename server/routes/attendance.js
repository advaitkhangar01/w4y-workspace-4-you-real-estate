// server/routes/attendance.js
const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { checkPeriodLock } = require('../middleware/periodLock');
const { logAudit } = require('../utils/auditLogger');
const { getISTDate } = require('../utils/date');
const { ATTENDANCE_STATUS, LEAVE_STATUS } = require('../utils/constants');
const { validateLocation, getDistance } = require('../utils/geofence');
const { createNotification, getAdminAndAccountsUserIds } = require('../utils/notifier');

// Helper: Get specific app setting
async function getSetting(key, defaultValue) {
  try {
    const { rows } = await pool.query('SELECT value FROM app_settings WHERE key = $1', [key]);
    return rows[0] ? rows[0].value : defaultValue;
  } catch (err) {
    return defaultValue;
  }
}

// Helper: Bulk-fetch multiple settings at once
async function getSettings(keys) {
  try {
    const { rows } = await pool.query(
      'SELECT key, value FROM app_settings WHERE key = ANY($1)',
      [keys]
    );
    return rows.reduce((acc, r) => { acc[r.key] = r.value; return acc; }, {});
  } catch (err) {
    return {};
  }
}

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  return hours * 60 + minutes;
}

// Helper: Log a failed check-in attempt
async function logAttempt(userId, { lat, lng, accuracy, distance, zone, reason }) {
  try {
    await pool.query(
      `INSERT INTO attendance_attempts (user_id, lat, lng, accuracy, distance, zone, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, lat || null, lng || null, accuracy || null, distance || null, zone || null, reason]
    );
  } catch (err) {
    // Non-critical — don't let logging failure break the flow
    console.error('[GeoFence] Failed to log attempt:', err.message);
  }
}

// Helper: Automatically check out any pending records from previous days
async function autoCheckoutPendingRecords() {
  try {
    const today = getISTDate();
    
    // Find all attendance records from previous days that have a check_in but no check_out
    const { rows } = await pool.query(
      `SELECT a.id, a.user_id, a.check_in, a.date, LOWER(a.status) AS status,
              b.office_start_time AS batch_start_time,
              b.min_working_hours AS batch_min_hours
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       LEFT JOIN attendance_batches b ON u.batch_id = b.id
       WHERE a.check_in IS NOT NULL 
         AND a.check_out IS NULL 
         AND a.date < $1::date
         AND a.date >= $1::date - INTERVAL '30 days'`,
      [today]
    );

    if (rows.length === 0) return;

    // Fetch required settings for default checkout time calculation
    const settings = await getSettings(['office_start_time', 'min_working_hours']);
    let defaultOfficeStartTime = settings.office_start_time || '10:00';
    let defaultMinWorkingHours = parseFloat(settings.min_working_hours || '9');

    // Validate defaultOfficeStartTime format (HH:mm)
    if (!/^\d{2}:\d{2}$/.test(defaultOfficeStartTime)) {
      console.warn(`[Auto-Checkout] Invalid office_start_time format: "${defaultOfficeStartTime}". Falling back to "10:00".`);
      defaultOfficeStartTime = '10:00';
    }

    // Validate defaultMinWorkingHours
    if (isNaN(defaultMinWorkingHours) || defaultMinWorkingHours < 0 || defaultMinWorkingHours > 24) {
      console.warn(`[Auto-Checkout] Invalid min_working_hours: "${settings.min_working_hours}". Falling back to 9.`);
      defaultMinWorkingHours = 9.0;
    }

    console.log(`[Auto-Checkout] Found ${rows.length} pending records from previous days to automatically check out. Using default office_start_time=${defaultOfficeStartTime}, min_working_hours=${defaultMinWorkingHours}`);

    for (const r of rows) {
      const dateStr = getISTDate(r.date);
      let minWorkingHours = defaultMinWorkingHours;
      if (r.batch_min_hours !== null && r.batch_min_hours !== undefined) {
        minWorkingHours = parseFloat(r.batch_min_hours);
      }

      // Business rule: End-of-day / recovery process sets default checkout strictly to 4:00 PM IST (16:00) for all batches
      const checkoutTimeISO = `${dateStr}T16:00:00+05:30`;
      let checkOutTime = new Date(checkoutTimeISO);
      
      const checkInTime = new Date(r.check_in);
      
      // If the calculated checkout time is before or equal to check-in, set checkout to check-in time
      if (checkOutTime <= checkInTime) {
        checkOutTime = checkInTime;
      }
      
      let hoursWorked = (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);
      if (isNaN(hoursWorked) || hoursWorked < 0) {
        hoursWorked = 0;
      }
      hoursWorked = parseFloat(hoursWorked.toFixed(2));
      
      let newStatus = r.status ? r.status.toLowerCase() : 'completed';
      let isLate = r.is_late;
      if (newStatus === 'half_day' || hoursWorked < minWorkingHours) {
        newStatus = 'half_day';
        isLate = false;
      } else {
        newStatus = 'completed';
      }

      await pool.query(
        `UPDATE attendance SET
           check_out = $1,
           status = $2,
           hours_worked = $3,
           is_late = $4,
           late_minutes = CASE WHEN $4::boolean THEN late_minutes ELSE 0 END
         WHERE id = $5`,
        [checkOutTime.toISOString(), newStatus, hoursWorked, isLate, r.id]
      );
      console.log(`[Auto-Checkout] User ${r.user_id} automatically checked out for date ${dateStr} at ${checkOutTime.toISOString()} (hours worked: ${hoursWorked})`);
    }
  } catch (err) {
    console.error('[Auto-Checkout] Error running auto-checkout cleanup:', err);
  }
}

// ─── POST /api/attendance/checkin ─────────────────────────────────────────────
router.post('/checkin', authenticate, async (req, res) => {
  try {
    const { lat, lng, accuracy } = req.body;
    const userId = req.user.id;
    const today  = getISTDate();

    const settings = await getSettings([
      'office_start_time', 'late_threshold_time', 'half_day_cutoff_time',
      'geofence_enabled', 'office_lat', 'office_lng',
      'geofence_strict_radius', 'geofence_buffer_radius', 'geofence_max_accuracy',
      'late_threshold_mins',
    ]);

    // Fetch user's batch details (if assigned)
    const { rows: userRows } = await pool.query(
      `SELECT u.batch_id, 
              b.office_start_time, 
              b.late_threshold_time, 
              b.half_day_cutoff_time, 
              b.min_working_hours
       FROM users u
       LEFT JOIN attendance_batches b ON u.batch_id = b.id
       WHERE u.id = $1`,
      [userId]
    );
    const userBatch = userRows[0] || {};

    let officeStartTime  = settings.office_start_time  || '10:00';
    let lateThresholdTime = settings.late_threshold_time;
    let halfDayCutoff    = settings.half_day_cutoff_time || '13:00';

    if (userBatch.office_start_time) {
      officeStartTime = userBatch.office_start_time.substring(0, 5);
      // C1: guard against null late_threshold_time on the batch row
      if (userBatch.late_threshold_time) {
        lateThresholdTime = userBatch.late_threshold_time.substring(0, 5);
      } else {
        // Compute from batch office_start_time + settings late_threshold_mins
        try {
          const [startH, startM] = officeStartTime.split(':').map(Number);
          const mins = parseInt(settings.late_threshold_mins || 15);
          if (!isNaN(startH) && !isNaN(startM)) {
            const totalMins = startH * 60 + startM + mins;
            const h = Math.floor(totalMins / 60) % 24;
            const m = totalMins % 60;
            lateThresholdTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          } else {
            lateThresholdTime = lateThresholdTime || '10:15';
          }
        } catch (_) {
          lateThresholdTime = lateThresholdTime || '10:15';
        }
      }
      // C2: guard against null half_day_cutoff_time on the batch row
      halfDayCutoff = userBatch.half_day_cutoff_time
        ? userBatch.half_day_cutoff_time.substring(0, 5)
        : halfDayCutoff;
    } else {
      if (!lateThresholdTime) {
        try {
          const [startH, startM] = officeStartTime.split(':').map(Number);
          const mins = parseInt(settings.late_threshold_mins || 15);
          if (!isNaN(startH) && !isNaN(startM)) {
            const totalMins = startH * 60 + startM + mins;
            const h = Math.floor(totalMins / 60) % 24;
            const m = totalMins % 60;
            lateThresholdTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          } else {
            lateThresholdTime = '10:15';
          }
        } catch (err) {
          lateThresholdTime = '10:15';
        }
      }
    }
    const geofenceEnabled  = settings.geofence_enabled === 'true';

    // Log IST date to help diagnose timezone issues
    const pgNow = await pool.query("SELECT NOW() AT TIME ZONE 'Asia/Kolkata' AS ist_now, CURRENT_DATE AS pg_date");
    console.log(`[CheckIn] User ${userId} | IST date used: ${today} | PG CURRENT_DATE: ${pgNow.rows[0]?.pg_date} | geofence: ${geofenceEnabled}`);

    // ── Duplicate check ──────────────────────────────────────────────────────
    const { rows: existing } = await pool.query(
      'SELECT id, check_in FROM attendance WHERE user_id = $1 AND date = $2::date',
      [userId, today]
    );

    if (existing.length > 0 && existing[0].check_in) {
      console.warn(`[CheckIn] BLOCKED: User ${userId} already has check_in=${existing[0].check_in} for date=${today}`);
      return res.status(400).json({ error: 'Already checked in today' });
    }

    // ── Geo-fence validation ─────────────────────────────────────────────────
    let geoResult = {
      allowed:           true,
      zone:              null,
      distance:          null,
      effectiveDistance: null,
      isBoundaryCheckin: false,
      checkinVerified:   false,
      message:           null,
    };

    if (geofenceEnabled) {
      // Require location data when geo-fence is active
      if (lat == null || lng == null) {
        return res.status(403).json({
          error: 'Location is required for check-in. Please enable GPS and try again.',
          reason: 'no_location',
        });
      }

      geoResult = validateLocation(
        { lat: parseFloat(lat), lng: parseFloat(lng), accuracy: parseFloat(accuracy) || 999 },
        settings
      );

      if (!geoResult.allowed) {
        // Log the failed attempt
        await logAttempt(userId, {
          lat, lng,
          accuracy: parseFloat(accuracy) || null,
          distance: geoResult.distance,
          zone:     geoResult.zone,
          reason:   geoResult.reason,
        });

        return res.status(403).json({
          error:    geoResult.message,
          reason:   geoResult.reason,
          distance: geoResult.distance,
          zone:     geoResult.zone,
        });
      }
    } else if (lat != null && lng != null && settings.office_lat) {
      // Geo-fence disabled but location provided → still compute & store for audit
      try {
        const dist = getDistance(
          parseFloat(lat), parseFloat(lng),
          parseFloat(settings.office_lat), parseFloat(settings.office_lng)
        );
        geoResult.distance = Math.round(dist);
        const acc = parseFloat(accuracy) || 999;
        const eff = Math.max(0, dist - acc);
        const strictR = parseFloat(settings.geofence_strict_radius) || 25;
        const bufferR = parseFloat(settings.geofence_buffer_radius) || 50;
        geoResult.zone             = eff <= strictR ? 'strict' : eff <= bufferR ? 'buffer' : 'outside';
        geoResult.isBoundaryCheckin = geoResult.zone === 'buffer';
        geoResult.checkinVerified   = geoResult.zone === 'strict';
      } catch (_) { /* ignore */ }
    }

    // ── Time / lateness logic ────────────────────────────────────────────────
    const now    = new Date();
    const nowIso = now.toISOString();
    const timeStr = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour:     '2-digit',
      minute:   '2-digit',
      hour12:   false,
    }).format(now);

    let status  = ATTENDANCE_STATUS.WORKING;
    let isLate  = false;
    let lateMins = 0;

    const checkInMins = timeToMinutes(timeStr);
    const startMins = timeToMinutes(officeStartTime);
    const lateMinsThreshold = timeToMinutes(lateThresholdTime);
    const halfDayMinsCutoff = timeToMinutes(halfDayCutoff);

    if (checkInMins > halfDayMinsCutoff) {
      status = ATTENDANCE_STATUS.HALF_DAY;
      isLate = false;
      lateMins = 0;
    } else {
      if (checkInMins > lateMinsThreshold) {
        isLate = true;
      }
      if (checkInMins > startMins) {
        lateMins = checkInMins - startMins;
      }
    }

    // ── Write attendance record ──────────────────────────────────────────────
    let row;
    const geoParams = [
      lat  || null,
      lng  || null,
      parseFloat(accuracy) || null,  // checkin_accuracy
      geoResult.distance,            // checkin_distance
      geoResult.zone,                // checkin_zone
      geoResult.isBoundaryCheckin,   // is_boundary_checkin
      geoResult.checkinVerified,     // checkin_verified
    ];

    // ── Atomic upsert — avoids race condition between check and insert ────────
    // Uses INSERT ... ON CONFLICT to safely handle the case where a row exists
    // without a check_in (e.g. from a leave record or absent placeholder).
    // If a check_in already exists, the DO NOTHING path returns 0 rows and we
    // fall back to the duplicate-check error above, so this is safe.
    const assignedBatchId = userBatch.batch_id ? parseInt(userBatch.batch_id) : null;

    if (existing.length > 0) {
      // Row exists (no check_in confirmed above) — update it
      const { rows } = await pool.query(
        `UPDATE attendance SET
           check_in = $1, lat = $2, lng = $3,
           checkin_accuracy = $4, checkin_distance = $5, checkin_zone = $6,
           is_boundary_checkin = $7, checkin_verified = $8,
           status = $9, is_late = $10, late_minutes = $11,
           batch_id = COALESCE(batch_id, $12)
         WHERE user_id = $13 AND date = $14::date AND check_in IS NULL
         RETURNING *`,
        [nowIso, ...geoParams, status, isLate, lateMins, assignedBatchId, userId, today]
      );
      if (!rows[0]) {
        // Another process snuck in a check_in between our SELECT and UPDATE
        return res.status(400).json({ error: 'Already checked in today' });
      }
      row = rows[0];
    } else {
      // No row yet — insert fresh
      const { rows } = await pool.query(
        `INSERT INTO attendance
           (user_id, check_in, lat, lng,
            checkin_accuracy, checkin_distance, checkin_zone,
            is_boundary_checkin, checkin_verified,
            date, status, is_late, late_minutes, batch_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (user_id, date) DO NOTHING
         RETURNING *`,
        [userId, nowIso, lat || null, lng || null,
         parseFloat(accuracy) || null,
         geoResult.distance,
         geoResult.zone,
         geoResult.isBoundaryCheckin,
         geoResult.checkinVerified,
         today, status, isLate, lateMins, assignedBatchId]
      );
      if (!rows[0]) {
        // ON CONFLICT DO NOTHING fired — a row was inserted between our SELECT and INSERT
        return res.status(400).json({ error: 'Already checked in today' });
      }
      row = rows[0];
    }

    if (isLate) {
      (async () => {
        const adminIds = await getAdminAndAccountsUserIds();
        createNotification({
          recipientIds: [...adminIds, userId],
          senderId: userId,
          section: 'attendance',
          title: '⏰ Late Check-In Alert',
          message: `${req.user.name} checked in late (${lateMins} mins late) on ${today}`,
          entityType: 'attendance',
          entityId: row.id,
          actionUrl: `/attendance`,
        });
      })();
    }

    res.json({
      message:           geoResult.isBoundaryCheckin
        ? 'Checked in (GPS variation detected)'
        : 'Checked in successfully',
      attendance:        row,
      zone:              geoResult.zone,
      distance:          geoResult.distance,
      isBoundaryCheckin: geoResult.isBoundaryCheckin,
      geoMessage:        geoResult.message,
    });

  } catch (err) {
    if (err.code === '23505') {
      // Unique constraint violation — concurrent check-in attempt
      console.warn(`[CheckIn] Unique constraint hit for user ${req.user?.id}`);
      return res.status(400).json({ error: 'Already checked in today' });
    }
    console.error('Check-in error:', err);
    res.status(500).json({ error: 'Server error', details: process.env.NODE_ENV !== 'production' ? err.message : undefined });
  }
});

// ─── POST /api/attendance/checkout ────────────────────────────────────────────
router.post('/checkout', authenticate, async (req, res) => {
  try {
    const { lat, lng, accuracy } = req.body || {};
    const userId = req.user.id;
    const today  = getISTDate();

    const settings = await getSettings([
      'min_working_hours',
      'office_lat', 'office_lng',
      'geofence_strict_radius', 'geofence_buffer_radius',
    ]);

    // Fetch user's batch details (if assigned)
    const { rows: userRows } = await pool.query(
      `SELECT u.batch_id, b.min_working_hours
       FROM users u
       LEFT JOIN attendance_batches b ON u.batch_id = b.id
       WHERE u.id = $1`,
      [userId]
    );
    const userBatch = userRows[0] || {};

    const { rows: existing } = await pool.query(
      'SELECT id, check_in, check_out, LOWER(status) AS status FROM attendance WHERE user_id = $1 AND date = $2::date',
      [userId, today]
    );

    console.log(`[ATTENDANCE] Check-out lookup: user=${userId}, date=${today}, found=${existing.length}`);

    if (!existing.length || !existing[0].check_in) {
      return res.status(400).json({ error: 'Please check in first' });
    }

    if (existing[0].check_out) {
      return res.status(400).json({ error: 'Already checked out today' });
    }

    const now        = new Date();
    const nowIso     = now.toISOString();
    const checkIn    = new Date(existing[0].check_in);
    let hoursWorked = (now - checkIn) / (1000 * 60 * 60);
    
    if (isNaN(hoursWorked)) hoursWorked = 0;

    let newStatus = (existing[0].status || ATTENDANCE_STATUS.WORKING).toLowerCase();
    const currentStatusLower = newStatus;

    let minWorkingHours = parseFloat(userBatch.min_working_hours || settings.min_working_hours || 9.0);

    if (currentStatusLower === ATTENDANCE_STATUS.HALF_DAY) {
      newStatus = ATTENDANCE_STATUS.HALF_DAY; // checked in after cutoff
    } else if (hoursWorked < minWorkingHours) {
      newStatus = ATTENDANCE_STATUS.HALF_DAY;
    } else {
      newStatus = ATTENDANCE_STATUS.COMPLETED;
    }

    // ── Checkout location (always optional, never blocks) ────────────────────
    let checkoutDistance      = null;
    let checkoutZone          = null;
    let checkoutOutsideZone   = false;

    if (lat != null && lng != null && settings.office_lat) {
      try {
        const dist = getDistance(
          parseFloat(lat), parseFloat(lng),
          parseFloat(settings.office_lat), parseFloat(settings.office_lng)
        );
        if (!isNaN(dist)) {
          checkoutDistance = Math.round(dist);
          const acc  = parseFloat(accuracy) || 999;
          const eff  = Math.max(0, dist - acc);
          const strictR = parseFloat(settings.geofence_strict_radius) || 25;
          const bufferR = parseFloat(settings.geofence_buffer_radius) || 50;
          checkoutZone         = eff <= strictR ? 'strict' : eff <= bufferR ? 'buffer' : 'outside';
          checkoutOutsideZone  = checkoutZone === 'outside';
        }
      } catch (_) { /* ignore */ }
    }

    const isHalfDay = (newStatus === ATTENDANCE_STATUS.HALF_DAY);

    const { rows } = await pool.query(
      `UPDATE attendance SET
         check_out = $1, status = $2,
         checkout_lat = $3, checkout_lng = $4, checkout_accuracy = $5,
         checkout_distance = $6, checkout_zone = $7, checkout_outside_zone = $8,
         hours_worked = $9,
         is_late = CASE WHEN $12::boolean THEN false ELSE is_late END,
         late_minutes = CASE WHEN $12::boolean THEN 0 ELSE late_minutes END
       WHERE user_id = $10 AND date = $11::date
       RETURNING *`,
      [
        nowIso, newStatus,
        lat || null, lng || null, (parseFloat(accuracy) || null),
        checkoutDistance, checkoutZone, checkoutOutsideZone,
        hoursWorked, userId, today, isHalfDay
      ]
    );

    console.log(`[ATTENDANCE] Check-out update: user=${userId}, date=${today}, success=${rows.length > 0}`);

    const msg = checkoutOutsideZone
      ? 'Checked out outside office location'
      : 'Checked out successfully';

    res.json({
      message:             msg,
      attendance:          rows[0],
      checkoutZone,
      checkoutDistance,
      checkoutOutsideZone,
    });

  } catch (err) {
    console.error('Check-out error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// ─── GET /api/attendance/today ────────────────────────────────────────────────
router.get('/today', authenticate, async (req, res) => {
  try {
    const today = getISTDate();

    const { rows } = await pool.query(
      `SELECT
         u.id as user_id, u.name, u.role, u.department, u.is_active,
         a.check_in, a.check_out, a.lat, a.lng, COALESCE(a.date, $1::date) AS date, a.is_late, a.late_minutes, a.hours_worked,
         a.checkin_zone, a.checkin_distance, a.checkin_accuracy,
         a.is_boundary_checkin, a.checkin_verified,
         a.checkout_zone, a.checkout_distance, a.checkout_outside_zone,
          CASE
            WHEN a.check_in IS NOT NULL THEN
              CASE 
                WHEN LOWER(COALESCE(a.status, '')) IN ('present', 'working') THEN 
                  CASE WHEN a.check_out IS NULL THEN 'working' ELSE 'completed' END
                ELSE LOWER(COALESCE(a.status, 'working'))
              END
            WHEN a.id IS NOT NULL AND LOWER(COALESCE(a.status, '')) IN ('leave', 'half_day', 'absent') THEN LOWER(a.status)
            WHEN lr.id IS NOT NULL THEN LOWER($2)
            WHEN EXTRACT(DOW FROM $1::date) = 0 THEN 'sunday'
            WHEN h.date IS NOT NULL THEN 'holiday'
            ELSE LOWER($3)
          END AS status
       FROM users u
       LEFT JOIN attendance a ON a.user_id = u.id AND a.date = $1::date
       LEFT JOIN leave_requests lr ON lr.user_id = u.id
         AND LOWER(lr.status) = LOWER($4)
         AND lr.type NOT IN ('advance', 'resignation')
         AND $1::date BETWEEN lr.start_date AND lr.end_date
       LEFT JOIN holidays h ON h.date = $1::date
       WHERE u.is_active IS NOT FALSE
       ORDER BY a.check_in ASC NULLS LAST, u.name ASC`,
      [today, ATTENDANCE_STATUS.LEAVE, ATTENDANCE_STATUS.ABSENT, LEAVE_STATUS.APPROVED]
    );

    // Mask GPS for non-admins (except their own record)
    const sanitizedRows = rows.map(r => {
      if (req.user.role === 'admin' || req.user.role === 'back_office' || req.user.role === 'accounts' || r.user_id === req.user.id) return r;
      const { lat, lng, checkin_distance, checkin_zone, checkin_accuracy, ...rest } = r;
      return { ...rest, lat: null, lng: null, checkin_distance: null, checkin_zone: null, checkin_accuracy: null };
    });

    const myRecord = rows.find(r => r.user_id === req.user.id) || {};

    console.log(`[Today] User ${req.user.id} requested team attendance for ${today}.`);
    res.json({ attendance: sanitizedRows, my_attendance: myRecord, date: today });

  } catch (err) {
    console.error('Today attendance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/attendance/all ──────────────────────────────────────────────────
router.get('/all', authenticate, async (req, res) => {
  try {
    const { page = 1, limit, from, to } = req.query;
    const parsedLimit = limit ? parseInt(limit) : 5000;
    const parsedOffset = (page - 1) * parsedLimit;

    const today = getISTDate();
    const [year, month] = today.split('-').map(Number);
    const defaultStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const defaultEnd   = today;

    const startDate = from || defaultStart;
    const endDate   = to || defaultEnd;

    const isPrivileged = req.user.role === 'admin' || req.user.role === 'back_office' || req.user.role === 'accounts';
    let userFilterId = null;
    if (!isPrivileged) {
      userFilterId = req.user.id;
    } else if (req.query.userId) {
      userFilterId = parseInt(req.query.userId);
    }

    const { rows } = await pool.query(
      `WITH date_series AS (
         SELECT generate_series($1::date, $2::date, '1 day'::interval)::date AS date
       ),
       target_users AS (
         SELECT id, name, role, department 
         FROM users 
         WHERE (($3::integer IS NULL AND is_active IS NOT FALSE) OR id = $3)
       ),
       user_dates AS (
         SELECT u.id AS user_id, u.name AS employee_name, u.role, u.department, d.date
         FROM target_users u
         CROSS JOIN date_series d
       )
       SELECT 
         ud.user_id,
         ud.employee_name as name,
         ud.employee_name,
         ud.role,
         ud.department,
         ud.date,
         a.id,
         a.check_in,
         a.check_out,
         a.lat,
         a.lng,
         a.is_late,
         a.late_minutes,
         a.hours_worked,
         a.checkin_distance,
         a.checkin_zone,
         a.checkin_accuracy,
         a.is_boundary_checkin,
         a.checkin_verified,
         a.checkout_lat,
         a.checkout_lng,
         a.checkout_accuracy,
         a.checkout_distance,
         a.checkout_zone,
         a.checkout_outside_zone,
          CASE
            WHEN a.check_in IS NOT NULL THEN
              CASE 
                WHEN LOWER(COALESCE(a.status, '')) IN ('present', 'working') THEN 
                  CASE WHEN a.check_out IS NULL THEN 'working' ELSE 'completed' END
                ELSE LOWER(COALESCE(a.status, 'working'))
              END
            WHEN a.id IS NOT NULL AND LOWER(COALESCE(a.status, '')) IN ('leave', 'half_day', 'absent') THEN LOWER(a.status)
            WHEN ud.date > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date THEN 'upcoming'
            WHEN ud.date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date AND a.id IS NULL THEN 'today_pending'
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
       ORDER BY ud.date DESC, a.check_in ASC NULLS LAST, ud.employee_name ASC
       LIMIT $4 OFFSET $5`,
      [startDate, endDate, userFilterId, parsedLimit, parsedOffset]
    );

    // Mask GPS for non-admins
    const sanitizedRows = rows.map(r => {
      if (req.user.role === 'admin' || req.user.role === 'back_office' || req.user.role === 'accounts' || r.user_id === req.user.id) return r;
      const { 
        lat, lng, checkin_distance, checkin_zone, checkin_accuracy,
        checkout_lat, checkout_lng, checkout_distance, checkout_accuracy, checkout_zone,
        ...rest 
      } = r;
      return { 
        ...rest, 
        lat: null, lng: null, checkin_distance: null, checkin_zone: null, checkin_accuracy: null,
        checkout_lat: null, checkout_lng: null, checkout_distance: null, checkout_accuracy: null, checkout_zone: null
      };
    });

    res.json({ attendance: sanitizedRows, page: parseInt(page), limit: limit ? parseInt(limit) : parsedLimit });

  } catch (err) {
    console.error('All attendance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/attendance/manual — Admin mark attendance ──────────────────────
router.post('/manual', authenticate, requireAdmin, checkPeriodLock, async (req, res) => {
  try {
    const { user_id, date, check_in, check_out, status, is_late, late_minutes } = req.body;

    if (!user_id || !date || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const statusLower = status.toLowerCase();
    let finalIsLate = !!is_late;
    let finalLateMinutes = parseInt(late_minutes || 0, 10);
    if (isNaN(finalLateMinutes) || finalLateMinutes < 0) finalLateMinutes = 0;

    // Enforce business rule: Half-Day and Absent must NEVER carry late markers
    if (statusLower === 'half_day' || statusLower === 'absent') {
      finalIsLate = false;
      finalLateMinutes = 0;
    }

    const { rows: existing } = await pool.query(
      'SELECT id FROM attendance WHERE user_id = $1 AND date = $2::date',
      [user_id, date]
    );

    let hours_worked = 0;
    if (check_in && check_out) {
      // C4: guard against negative hours when check_out < check_in
      hours_worked = Math.max(0, (new Date(check_out) - new Date(check_in)) / (1000 * 60 * 60));
    }

    let row;
    if (existing.length > 0) {
      const { rows } = await pool.query(
        `UPDATE attendance SET
           check_in = $1, check_out = $2, status = $3,
           is_late = $4, late_minutes = $5, hours_worked = $6
         WHERE id = $7
         RETURNING *`,
        [check_in, check_out, statusLower, finalIsLate, finalLateMinutes, hours_worked, existing[0].id]
      );
      row = rows[0];
    } else {
      const { rows } = await pool.query(
        `INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [user_id, date, check_in, check_out, statusLower, finalIsLate, finalLateMinutes, hours_worked]
      );
      row = rows[0];
    }

    // Structured audit logging for manual attendance changes
    logAudit({
      userId: req.user.id,
      action: 'ATTENDANCE_MANUAL_MARK',
      entityType: 'attendance',
      entityId: row.id,
      newValue: { user_id, date, status: statusLower, is_late: finalIsLate, late_minutes: finalLateMinutes, hours_worked },
      ipAddress: req.ip
    });

    res.json({ message: 'Attendance record updated', attendance: row });
  } catch (err) {
    console.error('Manual attendance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/attendance/attempts — Admin view failed attempts ────────────────
router.get('/attempts', authenticate, requireAdmin, async (req, res) => {
  try {
    // C5: cap limit to prevent excessive DB reads
    const parsedLimit = Math.min(Math.max(1, parseInt(req.query.limit) || 50), 500);
    const { rows } = await pool.query(
      `SELECT aa.*, u.name as user_name
       FROM attendance_attempts aa
       LEFT JOIN users u ON u.id = aa.user_id
       ORDER BY aa.attempted_at DESC
       LIMIT $1`,
      [parsedLimit]
    );
    res.json({ attempts: rows });
  } catch (err) {
    console.error('Attempts fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/attendance/users — List all users for dropdowns ─────────────────
// Accessible to any authenticated user so the employee filter / manual-marker
// dropdown is always populated (unlike /settings/users which is admin-only).
router.get('/users', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, role, department FROM users WHERE is_active IS NOT FALSE ORDER BY name ASC'
    );
    res.json({ users: rows });
  } catch (err) {
    console.error('Users list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.autoCheckoutPendingRecords = autoCheckoutPendingRecords;
module.exports = router;

