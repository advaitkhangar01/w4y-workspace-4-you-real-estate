/**
 * Database Migration Script: Recalculate Past Closed Month Snapshots
 * 
 * This script identifies any historic monthly close logs where vendor payments
 * (including category variations like 'Vendor Payment' and transaction vendor_id outlays)
 * were incorrectly included in total expenses. It recalculates the correct 
 * snapshot and updates 'monthly_closing_log' and 'company_capital' accordingly,
 * without modifying any raw historical ledger items.
 * 
 * Usage:
 *   Dry-run (safe preview of changes):
 *     node server/scripts/recalculate_past_closes.js --dry-run
 * 
 *   Execute changes on DB:
 *     node server/scripts/recalculate_past_closes.js
 */

const pool = require('../db');

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('-d');

async function run() {
  console.log(`====================================================================`);
  console.log(`RECALCULATING PAST CLOSING LOGS (Dry-run: ${isDryRun ? 'ENABLED' : 'DISABLED'})`);
  console.log(`====================================================================`);

  const client = await pool.connect();
  try {
    // Start transaction for the overall operation
    if (!isDryRun) {
      await client.query('BEGIN');
    }

    // 1. Fetch all monthly closing logs
    const { rows: logs } = await client.query('SELECT * FROM monthly_closing_log ORDER BY year, month');
    console.log(`Found ${logs.length} monthly close logs to audit.\n`);

    let updatedCount = 0;

    for (const log of logs) {
      const { month, year, snapshot: oldSnapshot, id: logId } = log;
      const monthLabel = `${year}-${String(month).padStart(2, '0')}`;
      console.log(`Auditing closed period [${monthLabel}] (Close ID: ${logId})...`);

      const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
      const monthEnd = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;

      // --- RECALCULATE MONTHLY FINANCIAL SNAPSHOT ---
      
      // 1. Revenue aggregations
      const projValueRes = await client.query('SELECT COALESCE(SUM(amount), 0) as val FROM project_document_amounts');
      const totalProjectValue = parseFloat(projValueRes.rows[0].val);

      const invoiceRes = await client.query(
        `SELECT
           COALESCE(SUM(amount), 0)                                                        AS billed,
           COALESCE(SUM(received_amount), 0)                                               AS received,
           COALESCE(SUM(CASE WHEN LOWER(status) != 'paid' THEN GREATEST(amount - received_amount, 0) ELSE 0 END), 0) AS pending
         FROM invoices
         WHERE LOWER(status) != 'cancelled' AND date >= $1 AND date <= $2`,
        [monthStart, monthEnd]
      );
      const billed = parseFloat(invoiceRes.rows[0].billed);
      const received = parseFloat(invoiceRes.rows[0].received);
      const pending = parseFloat(invoiceRes.rows[0].pending);
      const unbilled = Math.max(0, totalProjectValue - billed);

      // 2. Expenses aggregations
      const overheadRes = await client.query(
        `SELECT COALESCE(SUM(oe.amount), 0) as val 
         FROM office_expenses oe
         INNER JOIN expense_audits ea ON LOWER(ea.category) = LOWER(oe.category) 
         WHERE oe.date >= $1 AND oe.date <= $2 
           AND ea.month = $3 AND ea.year = $4 AND ea.is_verified = TRUE`,
        [monthStart, monthEnd, month, year]
      );
      const officeOverhead = parseFloat(overheadRes.rows[0].val);

      const payrollCheckRes = await client.query(
        `SELECT 
           COALESCE(SUM(net_paid - incentives), 0) as base_salaries,
           COALESCE(SUM(incentives), 0) as incentives
         FROM payroll
         WHERE month = $1 AND year = $2 AND status = 'paid'`,
        [month, year]
      );
      const baseSalariesRaw = parseFloat(payrollCheckRes.rows[0].base_salaries);
      const incentivesRaw = parseFloat(payrollCheckRes.rows[0].incentives);

      // Check verification states
      const auditRes = await client.query(
        `SELECT LOWER(category) as category FROM expense_audits 
         WHERE month = $1 AND year = $2 AND is_verified = TRUE 
           AND LOWER(category) IN ('salaries', 'incentives')`,
        [month, year]
      );
      const verifiedCats = auditRes.rows.map(r => r.category);

      const isSalVerified = verifiedCats.includes('salaries');
      const isIncVerified = verifiedCats.includes('incentives');

      const payroll = (isSalVerified ? baseSalariesRaw : 0) + (isIncVerified ? incentivesRaw : 0);
      const vendorPayments = 0; 

      // All other transactions expenses (using robust exclusion logic)
      const otherExpRes = await client.query(
        `SELECT COALESCE(SUM(t.amount), 0) as val 
         FROM transactions t
         INNER JOIN expense_audits ea ON LOWER(ea.category) = LOWER(t.category)
         WHERE t.type = 'expense' 
           AND LOWER(t.category) NOT IN ('vendor_payment', 'vendor payment', 'salary', 'incentive', 'salaries', 'incentives') 
           AND t.vendor_id IS NULL
           AND t.date >= $1 AND t.date <= $2
           AND ea.month = $3 AND ea.year = $4 AND ea.is_verified = TRUE`,
        [monthStart, monthEnd, month, year]
      );
      const otherExpenses = parseFloat(otherExpRes.rows[0].val);
      const totalExpenses = officeOverhead + payroll + vendorPayments + otherExpenses;

      // Breakdown by category
      const breakdownRes = await client.query(
        `SELECT category, SUM(amount) as amount FROM (
           SELECT oe.category, oe.amount 
           FROM office_expenses oe
           INNER JOIN expense_audits ea ON LOWER(ea.category) = LOWER(oe.category)
           WHERE oe.date >= $1 AND oe.date <= $2 
             AND ea.month = $3 AND ea.year = $4 AND ea.is_verified = TRUE
           
           UNION ALL
           
           SELECT t.category, t.amount 
           FROM transactions t
           INNER JOIN expense_audits ea ON LOWER(ea.category) = LOWER(t.category)
           WHERE t.type = 'expense' 
             AND LOWER(t.category) NOT IN ('vendor_payment', 'vendor payment', 'salary', 'incentive', 'salaries', 'incentives') 
             AND t.vendor_id IS NULL
             AND t.date >= $1 AND t.date <= $2
             AND ea.month = $3 AND ea.year = $4 AND ea.is_verified = TRUE
         ) sub
         GROUP BY category`,
        [monthStart, monthEnd, month, year]
      );
      const byCategory = {};
      breakdownRes.rows.forEach(r => {
        byCategory[r.category] = parseFloat(r.amount);
      });
      
      // Inject payroll salaries & incentives if verified
      if (isSalVerified && baseSalariesRaw > 0) {
        byCategory['Salaries'] = (byCategory['Salaries'] || 0) + baseSalariesRaw;
      }
      if (isIncVerified && incentivesRaw > 0) {
        byCategory['Incentives'] = (byCategory['Incentives'] || 0) + incentivesRaw;
      }

      // 3. HR details
      const empRes = await client.query("SELECT COUNT(*) as count FROM users WHERE role IN ('employee', 'admin', 'back_office', 'accounts', 'design_head', 'design', 'liasoning', 'civil_engineer', 'project_head')");
      const totalEmployees = parseInt(empRes.rows[0].count);

      const processedRes = await client.query("SELECT COUNT(*) as count FROM payroll WHERE month = $1 AND year = $2 AND status = 'paid'", [month, year]);
      const payrollProcessed = parseInt(processedRes.rows[0].count);

      // Leave days
      const { rows: leaveAggRows } = await client.query(
        `SELECT COALESCE(SUM(
           LEAST(end_date::date, $2::date) - GREATEST(start_date::date, $1::date) + 1
         ), 0) AS total_days
         FROM leave_requests
         WHERE status = 'approved'
           AND NOT (end_date < $1 OR start_date > $2)`,
        [monthStart, monthEnd]
      );
      const totalLeaveDaysTaken = parseFloat(leaveAggRows[0]?.total_days || 0);

      // Projects
      const activeProjRes = await client.query("SELECT COUNT(*) as count FROM projects WHERE status != 'Completed'");
      const compProjRes = await client.query(
        "SELECT COUNT(*) as count FROM projects WHERE status = 'Completed' AND start_date >= $1 AND start_date <= $2",
        [monthStart, monthEnd]
      );
      const newProjRes = await client.query(
        "SELECT COUNT(*) as count FROM projects WHERE created_at >= $1 AND created_at <= $2",
        [monthStart, monthEnd]
      );

      // Build new snapshot object matching exact structure
      const newSnapshot = {
        hr: {
          payroll_pending: Math.max(0, totalEmployees - payrollProcessed),
          total_employees: totalEmployees,
          payroll_processed: payrollProcessed,
          total_leave_days_taken: totalLeaveDaysTaken
        },
        revenue: {
          billed: billed,
          pending: pending,
          received: received,
          unbilled: unbilled,
          total_project_value: totalProjectValue
        },
        expenses: {
          total: totalExpenses,
          payroll: payroll,
          by_category: byCategory,
          office_overhead: officeOverhead,
          vendor_payments: vendorPayments
        },
        projects: {
          total_active: parseInt(activeProjRes.rows[0].count),
          new_this_month: parseInt(newProjRes.rows[0].count),
          completed_this_month: parseInt(compProjRes.rows[0].count)
        },
        profit_loss: {
          realized: received - totalExpenses,
          projected: billed - totalExpenses
        }
      };

      // Compare old and new snapshot expenses
      const oldTotalExp = parseFloat(oldSnapshot.expenses?.total || 0);
      const newTotalExp = parseFloat(newSnapshot.expenses.total);
      
      const oldRealizedProfit = parseFloat(oldSnapshot.profit_loss?.realized || 0);
      const newRealizedProfit = parseFloat(newSnapshot.profit_loss.realized);

      const diffExpenses = Math.abs(oldTotalExp - newTotalExp) > 0.01;
      const diffProfit = Math.abs(oldRealizedProfit - newRealizedProfit) > 0.01;

      if (diffExpenses || diffProfit) {
        console.log(`  [DIVERGENCE DETECTED]`);
        console.log(`    - Total Expenses:  Old = ₹${oldTotalExp.toLocaleString()}, New = ₹${newTotalExp.toLocaleString()}`);
        console.log(`    - Realized Profit: Old = ₹${oldRealizedProfit.toLocaleString()}, New = ₹${newRealizedProfit.toLocaleString()}`);
        
        updatedCount++;

        if (!isDryRun) {
          // A. Update monthly_closing_log snapshot
          await client.query(
            'UPDATE monthly_closing_log SET snapshot = $1 WHERE id = $2',
            [newSnapshot, logId]
          );

          // B. Update company_capital ledger
          await client.query(
            `INSERT INTO company_capital (month, year, amount, description)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (month, year) 
             DO UPDATE SET amount = EXCLUDED.amount, description = EXCLUDED.description`,
            [
              month, 
              year, 
              newSnapshot.profit_loss.realized, 
              `Capital transferred from profit of ${new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' })} ${year} (Recalculated)`
            ]
          );
          console.log(`    -> DB Snapshot and Company Capital updated successfully.`);
        } else {
          console.log(`    -> [Dry-Run Mode] No database writes executed.`);
        }
      } else {
        console.log(`  [OK] Snapshot is accurate and doesn't contain vendor payment discrepancies.`);
      }
      console.log();
    }

    if (!isDryRun) {
      await client.query('COMMIT');
      console.log(`SUCCESS: Successfully updated ${updatedCount} closing logs and capital ledger records.`);
    } else {
      console.log(`DRY-RUN COMPLETE: Verified ${logs.length} logs. ${updatedCount} logs would be updated.`);
    }

  } catch (err) {
    if (!isDryRun) {
      await client.query('ROLLBACK');
    }
    console.error(`FATAL ERROR running recalculation:`, err);
  } finally {
    // Allow migrations in db/index.js to finish before ending the pool connection
    setTimeout(() => {
      client.release();
      pool.end();
      console.log(`Database pool ended gracefully.`);
    }, 1000);
  }
}

run();
