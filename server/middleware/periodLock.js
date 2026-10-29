// server/middleware/periodLock.js
const pool = require('../db');

/**
 * Extracts month and year for Asia/Kolkata (IST) timezone to prevent UTC/local date shifts.
 */
function getKolkataMonthAndYear(dateInput) {
  if (!dateInput) return null;
  
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const parts = dateInput.split('-');
    return {
      month: parseInt(parts[1], 10),
      year: parseInt(parts[0], 10)
    };
  }
  
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric'
  });
  
  const parts = formatter.formatToParts(d);
  let month = null;
  let year = null;
  for (const part of parts) {
    if (part.type === 'month') month = parseInt(part.value, 10);
    if (part.type === 'year') year = parseInt(part.value, 10);
  }
  
  return { month, year };
}

/**
 * Middleware to check if a transaction, expense, or payroll entry falls inside a closed month.
 * If closed, blocks non-admins.
 * Allows admins ONLY if there is an active period_unlock_log window for that month.
 */
async function checkPeriodLock(req, res, next) {
  try {
    let month = null;
    let year = null;

    // 1. Identify Month and Year from the request
    if (req.body && req.body.month && req.body.year) {
      // Direct month/year payload (e.g. payroll post)
      month = parseInt(req.body.month);
      year = parseInt(req.body.year);
    } else {
      let dateStr = req.body?.date || req.query?.date || req.body?.payment_date;
      
      // If it's a DELETE operation, query the date from the DB by ID
      if (!dateStr && req.params.id) {
        const id = parseInt(req.params.id, 10);
        if (!isNaN(id)) {
          if (req.originalUrl.includes('transactions')) {
            const { rows } = await pool.query('SELECT date FROM transactions WHERE id = $1', [id]);
            if (rows[0]) dateStr = rows[0].date;
          } else if (req.originalUrl.includes('expenses')) {
            const { rows } = await pool.query('SELECT date FROM office_expenses WHERE id = $1', [id]);
            if (rows[0]) dateStr = rows[0].date;
          } else if (req.originalUrl.includes('payroll')) {
            // Use payroll period (month/year), not payment_date, to check the correct closed period
            const { rows } = await pool.query('SELECT month, year FROM payroll WHERE id = $1', [id]);
            if (rows[0]) {
              month = rows[0].month;
              year = rows[0].year;
            }
          } else if (req.originalUrl.includes('invoices')) {
            const { rows } = await pool.query('SELECT date FROM invoices WHERE id = $1', [id]);
            if (rows[0]) dateStr = rows[0].date;
          }
        }
      }

      // If still no date but it's a POST/PUT, default to today's date
      if (!dateStr && (req.method === 'POST' || req.method === 'PUT')) {
        dateStr = new Date();
      }

      if (dateStr) {
        const parsed = getKolkataMonthAndYear(dateStr);
        if (parsed) {
          month = parsed.month;
          year = parsed.year;
        }
      }
    }

    // If we couldn't determine month/year, pass through
    if (!month || !year) {
      return next();
    }

    // 2. Check if the period is closed
    const { rows: closed } = await pool.query(
      'SELECT id FROM monthly_closing_log WHERE month = $1 AND year = $2',
      [month, year]
    );

    // If period is not closed, proceed
    if (closed.length === 0) {
      return next();
    }

    const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' });

    // 3. If closed, check if unlocked and user is admin
    const { rows: unlocked } = await pool.query(
      'SELECT id FROM period_unlock_log WHERE month = $1 AND year = $2 AND is_active = TRUE ORDER BY unlocked_at DESC LIMIT 1',
      [month, year]
    );

    if (unlocked.length > 0 && req.user?.role === 'admin') {
      // Store the active unlock ID so we can associate it when inserting the transaction/expense
      req.period_unlock_id = unlocked[0].id;
      return next();
    }

    // Non-admins are always blocked on closed periods
    return res.status(403).json({
      error: `${monthName} ${year} is a closed period. Contact admin to request changes.`,
      code: 'PERIOD_LOCKED'
    });
  } catch (err) {
    console.error('Period lock middleware error:', err);
    res.status(500).json({ error: 'Database verification failed' });
  }
}

module.exports = checkPeriodLock;
module.exports.checkPeriodLock = checkPeriodLock;
