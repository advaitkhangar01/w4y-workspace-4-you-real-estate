// server/utils/attendanceRecalculator.js
const defaultPool = require('../db');
const { getISTTime } = require('./date');
const { ATTENDANCE_STATUS } = require('./constants');

/**
 * Helper to convert HH:mm or HH:mm:ss string to minutes from start of day.
 */
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = String(timeStr).split(':');
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  return hours * 60 + minutes;
}

function formatTimeString(timeInput, fallback = '10:00') {
  if (!timeInput) return fallback;
  const str = String(timeInput).trim();
  if (str.length >= 5) {
    return str.substring(0, 5);
  }
  return fallback;
}

async function getGlobalSettings(keys, dbClient) {
  try {
    const { rows } = await dbClient.query(
      'SELECT key, value FROM app_settings WHERE key = ANY($1)',
      [keys]
    );
    return rows.reduce((acc, r) => { acc[r.key] = r.value; return acc; }, {});
  } catch (err) {
    return {};
  }
}

/**
 * Recalculates past attendance records for a specific user ID based on their currently assigned batch thresholds.
 * Targets only records with check_in IS NOT NULL and status NOT IN ('leave', 'holiday').
 * Preserves leave/holiday entries and DOES NOT modify any monthly close or payroll tables.
 *
 * @param {number} userId 
 * @param {Object} [options]
 * @param {Object} [options.dbClient] Optional pg pool or transaction client
 * @param {string} [options.fromDate] Optional start date
 * @param {string} [options.toDate] Optional end date
 * @returns {Promise<{ recalculatedCount: number }>}
 */
async function recalculateAttendanceForUser(userId, options = {}) {
  const db = options.dbClient || defaultPool;
  const { fromDate, toDate } = options;

  // 1. Fetch user & assigned batch details
  const { rows: userRows } = await db.query(
    `SELECT u.id, u.name, u.batch_id,
            b.office_start_time AS batch_start,
            b.late_threshold_time AS batch_late,
            b.half_day_cutoff_time AS batch_cutoff,
            b.min_working_hours AS batch_min_hours
     FROM users u
     LEFT JOIN attendance_batches b ON u.batch_id = b.id
     WHERE u.id = $1`,
    [userId]
  );

  if (userRows.length === 0) {
    return { recalculatedCount: 0 };
  }

  const user = userRows[0];

  // 2. Fetch global fallback settings
  const globalSettings = await getGlobalSettings([
    'office_start_time',
    'late_threshold_time',
    'half_day_cutoff_time',
    'min_working_hours',
    'late_threshold_mins'
  ], db);

  // 3. Resolve effective threshold times
  let officeStartTime = globalSettings.office_start_time || '10:00';
  let lateThresholdTime = globalSettings.late_threshold_time;
  let halfDayCutoff = globalSettings.half_day_cutoff_time || '13:00';
  let minWorkingHours = parseFloat(globalSettings.min_working_hours || '9.00');

  if (user.batch_start) {
    officeStartTime = formatTimeString(user.batch_start, '10:00');
    if (user.batch_late) {
      lateThresholdTime = formatTimeString(user.batch_late, '10:15');
    }
    if (user.batch_cutoff) {
      halfDayCutoff = formatTimeString(user.batch_cutoff, '13:00');
    }
    if (user.batch_min_hours !== null && user.batch_min_hours !== undefined) {
      minWorkingHours = parseFloat(user.batch_min_hours);
    }
  }

  if (!lateThresholdTime) {
    const [startH, startM] = officeStartTime.split(':').map(Number);
    const mins = parseInt(globalSettings.late_threshold_mins || 15, 10);
    if (!isNaN(startH) && !isNaN(startM)) {
      const totalMins = startH * 60 + startM + mins;
      const h = Math.floor(totalMins / 60) % 24;
      const m = totalMins % 60;
      lateThresholdTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    } else {
      lateThresholdTime = '10:15';
    }
  }

  const startMins = timeToMinutes(officeStartTime);
  const lateMinsThreshold = timeToMinutes(lateThresholdTime);
  const halfDayMinsCutoff = timeToMinutes(halfDayCutoff);

  // 4. Fetch closed months to protect finalized periods from retroactive recalculation
  const { rows: closedMonths } = await db.query(
    'SELECT month, year FROM monthly_closing_log'
  );
  const closedSet = new Set(closedMonths.map(m => `${m.year}-${m.month}`));

  // 5. Fetch all batches to resolve record-specific or user batch thresholds
  const { rows: allBatches } = await db.query('SELECT * FROM attendance_batches');
  const batchMap = new Map(allBatches.map(b => [b.id, b]));

  // 6. Fetch attendance records for this user that have check_in
  let query = `
    SELECT id, date, check_in, check_out, status, is_late, late_minutes, hours_worked, batch_id
    FROM attendance
    WHERE user_id = $1
      AND check_in IS NOT NULL
      AND LOWER(COALESCE(status, '')) NOT IN ('leave', 'holiday')
  `;
  const queryParams = [userId];

  if (fromDate) {
    queryParams.push(fromDate);
    query += ` AND date >= $${queryParams.length}::date`;
  }
  if (toDate) {
    queryParams.push(toDate);
    query += ` AND date <= $${queryParams.length}::date`;
  }

  query += ` ORDER BY date ASC`;

  const { rows: records } = await db.query(query, queryParams);

  let recalculatedCount = 0;

  for (const r of records) {
    if (!r.check_in) continue;

    const recDate = new Date(r.date);
    const recMonth = recDate.getMonth() + 1;
    const recYear = recDate.getFullYear();
    if (closedSet.has(`${recYear}-${recMonth}`)) {
      // Skip records in closed months
      continue;
    }

    // Safety Rule: If an attendance record has NO batch_id, it is a historical record.
    // Do not fabricate a historical batch, do not use employee's current batch,
    // and do not recalculate with an invented batch. Preserve historical data integrity.
    if (!r.batch_id) {
      continue;
    }

    const recBatch = batchMap.get(r.batch_id);
    if (!recBatch) {
      continue;
    }

    let recStartTime = recBatch.office_start_time
      ? formatTimeString(recBatch.office_start_time, '10:00')
      : officeStartTime;
    let recLateThreshold = recBatch.late_threshold_time
      ? formatTimeString(recBatch.late_threshold_time, '10:15')
      : lateThresholdTime;
    let recHalfDayCutoff = recBatch.half_day_cutoff_time
      ? formatTimeString(recBatch.half_day_cutoff_time, '13:00')
      : halfDayCutoff;
    let recMinHours = recBatch.min_working_hours !== null && recBatch.min_working_hours !== undefined
      ? parseFloat(recBatch.min_working_hours)
      : minWorkingHours;

    const rStartMins = timeToMinutes(recStartTime);
    const rLateMinsThreshold = timeToMinutes(recLateThreshold);
    const rHalfDayMinsCutoff = timeToMinutes(recHalfDayCutoff);

    const checkInTimeStr = getISTTime(r.check_in);
    const checkInMins = timeToMinutes(checkInTimeStr);

    let status = ATTENDANCE_STATUS.WORKING;
    let isLate = false;
    let lateMins = 0;

    if (checkInMins > rHalfDayMinsCutoff) {
      status = ATTENDANCE_STATUS.HALF_DAY;
      isLate = false; // Check-in after cutoff is half-day and does NOT count as late
    } else if (checkInMins > rLateMinsThreshold) {
      isLate = true;
    }

    if (checkInMins > rStartMins) {
      lateMins = checkInMins - rStartMins;
    }

    let hoursWorked = 0;
    if (r.check_out) {
      hoursWorked = (new Date(r.check_out) - new Date(r.check_in)) / (1000 * 60 * 60);
      if (isNaN(hoursWorked) || hoursWorked < 0) hoursWorked = 0;
      hoursWorked = parseFloat(hoursWorked.toFixed(2));

      if (status === ATTENDANCE_STATUS.HALF_DAY) {
        // Keep half_day if check-in was after halfDayCutoff
        isLate = false;
        lateMins = 0;
      } else if (hoursWorked < recMinHours) {
        status = ATTENDANCE_STATUS.HALF_DAY;
        isLate = false;
        lateMins = 0;
      } else {
        status = ATTENDANCE_STATUS.COMPLETED;
      }
    }

    if (status === ATTENDANCE_STATUS.HALF_DAY || status === ATTENDANCE_STATUS.ABSENT) {
      isLate = false;
      lateMins = 0;
    }

    await db.query(
      `UPDATE attendance SET
         status = $1,
         is_late = $2,
         late_minutes = $3,
         hours_worked = $4
       WHERE id = $5`,
      [status, isLate, lateMins, hoursWorked, r.id]
    );

    recalculatedCount++;
  }

  return { recalculatedCount };
}

/**
 * Recalculates attendance for all users assigned to a specific batch ID.
 */
async function recalculateAttendanceForBatch(batchId, options = {}) {
  const db = options.dbClient || defaultPool;
  const { rows: users } = await db.query(
    'SELECT id FROM users WHERE batch_id = $1',
    [batchId]
  );

  let totalRecalculated = 0;
  for (const user of users) {
    const res = await recalculateAttendanceForUser(user.id, { ...options, dbClient: db });
    totalRecalculated += res.recalculatedCount;
  }
  return { recalculatedCount: totalRecalculated, affectedUsersCount: users.length };
}

/**
 * Recalculates attendance for all users in the system.
 */
async function recalculateAttendanceForAll(options = {}) {
  const db = options.dbClient || defaultPool;
  const { rows: users } = await db.query('SELECT id FROM users');

  let totalRecalculated = 0;
  for (const user of users) {
    const res = await recalculateAttendanceForUser(user.id, { ...options, dbClient: db });
    totalRecalculated += res.recalculatedCount;
  }
  return { recalculatedCount: totalRecalculated, affectedUsersCount: users.length };
}

module.exports = {
  recalculateAttendanceForUser,
  recalculateAttendanceForBatch,
  recalculateAttendanceForAll,
  timeToMinutes
};
