const pool = require('../db');
const monthlyCloseRoutes = require('../routes/monthlyClose');
const { executeMonthCloseInternal } = monthlyCloseRoutes;

/**
 * Calculates the previous month and year relative to a given date.
 */
function getPreviousMonthAndYear(date) {
  let prevMonth = date.getMonth(); // 0-indexed month of the date (0 = Jan, 1 = Feb, ..., 11 = Dec)
  let prevYear = date.getFullYear();
  if (prevMonth === 0) { // If current month is January (0), previous month is December (12) of the previous year
    prevMonth = 12;
    prevYear -= 1;
  }
  return { month: prevMonth, year: prevYear };
}

/**
 * Checks if a given month/year is already closed.
 */
async function isMonthClosed(month, year) {
  try {
    const { rows } = await pool.query(
      'SELECT id FROM monthly_closing_log WHERE month = $1 AND year = $2',
      [month, year]
    );
    return rows.length > 0;
  } catch (err) {
    console.error(`[Scheduler] Error checking closed status for ${month}/${year}:`, err.message);
    return false;
  }
}

/**
 * Core function to run the monthly close check and execution.
 * Triggered by the interval every minute.
 * Only fires the close at EXACTLY midnight (00:00) on the 1st of the month (IST).
 */
async function checkAndAutoCloseMonth() {
  const now = new Date();

  // Get timezone offset from env, default to 5.5 (Indian Standard Time, UTC+05:30)
  const tzOffsetHours = parseFloat(process.env.TIMEZONE_OFFSET_HOURS || '5.5');
  const localTime = new Date(now.getTime() + (tzOffsetHours * 60 * 60 * 1000));
  
  const localDay    = localTime.getUTCDate();
  const localHour   = localTime.getUTCHours();
  const localMinute = localTime.getUTCMinutes();
  const localMonth  = localTime.getUTCMonth(); // 0-indexed (0 = Jan, 1 = Feb, ..., 5 = June)
  const localYear   = localTime.getUTCFullYear();

  // We determine the target month to close (the previous month relative to local date)
  let prevMonth = localMonth; // If localMonth is 5 (June), prevMonth is 5 (May, 1-indexed)
  let prevYear = localYear;
  if (prevMonth === 0) { // If current local month is January (0), previous month is December (12) of previous year
    prevMonth = 12;
    prevYear -= 1;
  }

  // Fetch grace period settings (default: 3 days, closing on 4th of month at 00:00 IST)
  let graceDays = 3;
  try {
    const { rows: graceRows } = await pool.query("SELECT value FROM app_settings WHERE key = 'monthly_close_grace_days'");
    if (graceRows.length > 0) {
      graceDays = parseInt(graceRows[0].value) || 3;
    }
  } catch (err) {
    // fallback to 3
  }

  const targetCloseDay = graceDays + 1;

  // Trigger auto-close at midnight on the target close day (e.g. 4th of month at 00:00 IST)
  const isExactMidnightTarget = localDay === targetCloseDay && localHour === 0 && localMinute === 0;
  if (!isExactMidnightTarget) {
    return; // Silent — runs every minute
  }

  console.log(`[Scheduler] GRACE PERIOD TRIGGER: Target close day reached (${localDay}th). Attempting auto-close for ${prevMonth}/${prevYear}. Local time (UTC+${tzOffsetHours}): Day=${localDay}, Hour=${localHour}, Min=${localMinute}`);

  try {
    const closed = await isMonthClosed(prevMonth, prevYear);
    if (closed) {
      console.log(`[Scheduler] Month ${prevMonth}/${prevYear} is already closed. No action needed.`);
      return;
    }

    // Check if the period was explicitly unlocked or reversed by an admin in the past
    const { rows: unlockLogs } = await pool.query(
      'SELECT id FROM period_unlock_log WHERE month = $1 AND year = $2 LIMIT 1',
      [prevMonth, prevYear]
    );
    if (unlockLogs.length > 0) {
      console.log(`[Scheduler] Month ${prevMonth}/${prevYear} has admin unlock/reversal history. Skipping auto-close.`);
      return;
    }

    console.log(`[Scheduler] Month ${prevMonth}/${prevYear} is NOT closed. Starting automated close...`);
    const result = await executeMonthCloseInternal(prevMonth, prevYear, null, `Automated monthly close after ${graceDays}-day grace review period`);
    console.log(`[Scheduler] Automated close executed successfully for ${prevMonth}/${prevYear}!`, result);
  } catch (err) {
    console.error(`[Scheduler] Automated month close for ${prevMonth}/${prevYear} failed:`, err.message);
  }
}

/**
 * Self-healing startup check: runs once after server boot.
 * Only triggers auto-close if the server restarted within the first 7 days
 * of a new month and the previous month is still not closed.
 * This recovers from overnight downtime WITHOUT closing on every restart.
 */
async function startupSelfHealingCheck() {
  const now = new Date();
  const tzOffsetHours = parseFloat(process.env.TIMEZONE_OFFSET_HOURS || '5.5');
  const localTime = new Date(now.getTime() + (tzOffsetHours * 60 * 60 * 1000));

  const localDay   = localTime.getUTCDate();
  const localMonth = localTime.getUTCMonth(); // 0-indexed
  const localYear  = localTime.getUTCFullYear();

  // Only self-heal within the first 7 days of the month (grace window for missed midnight close)
  if (localDay > 7) {
    console.log(`[Scheduler] Startup self-heal: Day ${localDay} is outside grace window (1-7). Skipping.`);
    return;
  }

  // Determine previous month to close (1-indexed)
  let prevMonth = localMonth; // localMonth is 0-indexed, so this is the correct 1-indexed previous month
  let prevYear  = localYear;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear -= 1;
  }

  console.log(`[Scheduler] Startup self-heal: Checking if ${prevMonth}/${prevYear} needs closing (day ${localDay} of new month)...`);
  try {
    const closed = await isMonthClosed(prevMonth, prevYear);
    if (closed) {
      console.log(`[Scheduler] Startup self-heal: ${prevMonth}/${prevYear} already closed. OK.`);
      return;
    }

    // Check if the period was explicitly unlocked or reversed by an admin in the past
    const { rows: unlockLogs } = await pool.query(
      'SELECT id FROM period_unlock_log WHERE month = $1 AND year = $2 LIMIT 1',
      [prevMonth, prevYear]
    );
    if (unlockLogs.length > 0) {
      console.log(`[Scheduler] Startup self-heal: Month ${prevMonth}/${prevYear} has admin unlock/reversal history. Skipping recovery close.`);
      return;
    }
    console.log(`[Scheduler] Startup self-heal: ${prevMonth}/${prevYear} NOT closed! Running recovery close...`);
    const result = await executeMonthCloseInternal(prevMonth, prevYear, null, 'Automated monthly close (startup recovery)');
    console.log(`[Scheduler] Startup self-heal: Recovery close completed for ${prevMonth}/${prevYear}!`, result);
  } catch (err) {
    console.error(`[Scheduler] Startup self-heal: Recovery close for ${prevMonth}/${prevYear} failed:`, err.message);
  }
}

async function checkAndAutoCheckoutDaily() {
  const now = new Date();
  const tzOffsetHours = parseFloat(process.env.TIMEZONE_OFFSET_HOURS || '5.5');
  const localTime = new Date(now.getTime() + (tzOffsetHours * 60 * 60 * 1000));
  const localHour   = localTime.getUTCHours();
  const localMinute = localTime.getUTCMinutes();

  if (localHour === 0 && localMinute === 0) {
    console.log('[Scheduler] Daily midnight trigger: Checking pending attendance records for auto-checkout...');
    try {
      const { autoCheckoutPendingRecords } = require('../routes/attendance');
      if (typeof autoCheckoutPendingRecords === 'function') {
        await autoCheckoutPendingRecords();
      }
    } catch (err) {
      console.error('[Scheduler] Error running daily auto-checkout:', err.message);
    }
  }
}

/**
 * Starts the monthly close background scheduler.
 */
function startMonthlyCloseScheduler() {
  console.log('[Scheduler] Initializing Monthly Close Scheduler...');
  
  // 1. Run attendance auto-checkout recovery after 5s
  setTimeout(() => {
    try {
      const { autoCheckoutPendingRecords } = require('../routes/attendance');
      if (typeof autoCheckoutPendingRecords === 'function') {
        autoCheckoutPendingRecords();
      }
    } catch (err) {
      console.error('[Scheduler] Startup auto-checkout error:', err.message);
    }
  }, 5000);

  // 2. Run self-healing startup check after 10s (only fires if within grace window on 1st-7th)
  setTimeout(() => {
    startupSelfHealingCheck();
  }, 10000);

  // 3. Check every minute
  setInterval(() => {
    checkAndAutoCloseMonth();
    checkAndAutoCheckoutDaily();
  }, 60 * 1000);
}

module.exports = {
  startMonthlyCloseScheduler,
  checkAndAutoCloseMonth,
  startupSelfHealingCheck,
  checkAndAutoCheckoutDaily
};
