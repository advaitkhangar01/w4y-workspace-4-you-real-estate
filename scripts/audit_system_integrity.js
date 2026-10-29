/**
 * W4Y Web App — System Integrity & Discrepancy Audit CLI
 * 
 * Read-only diagnostic script to audit data management and processing discrepancies
 * across Attendance, Payroll, Invoices, Financials, Leave Ledger, and Settings.
 * 
 * Usage:
 *   node scripts/audit_system_integrity.js
 */

const pool = require('../server/db');

async function runAudit() {
  console.log('\n================================================================');
  console.log('   🔍 W4Y DATA INTEGRITY & PROCESSING SYSTEM AUDIT');
  console.log('   Execution Mode: READ-ONLY (No modifications made to database)');
  console.log('================================================================\n');

  const client = await pool.connect();
  const report = {
    timestamp: new Date().toISOString(),
    domains: {},
    totalIssuesFound: 0
  };

  try {
    await client.query('BEGIN TRANSACTION READ ONLY');

    // ── 1. ATTENDANCE & SHIFT INTEGRITY ─────────────────────────────────────
    console.log('▶ [1/5] Auditing Attendance & Shift Processing...');
    
    // 1A. Shifts under batch min hours marked as completed/working with checkout
    const { rows: underMinShifts } = await client.query(`
      SELECT a.id, a.user_id, u.name, a.date, a.check_in, a.check_out, a.hours_worked, 
             a.status AS stored_status, COALESCE(b.min_working_hours, 9.0) AS required_hours
      FROM attendance a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN attendance_batches b ON b.id = COALESCE(a.batch_id, u.batch_id)
      WHERE a.check_out IS NOT NULL
        AND a.hours_worked < COALESCE(b.min_working_hours, 9.0)
        AND LOWER(COALESCE(a.status, '')) IN ('completed', 'working', 'present')
      ORDER BY a.date DESC
      LIMIT 50
    `);

    // 1B. Overtime mistakenly granted to short shifts (< min working hours)
    // Note: Half-day or absent shifts are properly blocked from overtime in payroll/recalculator.
    // This check catches any shift marked as completed/working despite insufficient hours.
    const { rows: otOnShortShifts } = await client.query(`
      SELECT a.id, a.user_id, u.name, a.date, a.check_in, a.check_out, a.hours_worked,
             ROUND((EXTRACT(EPOCH FROM (a.check_out - (a.date || ' 19:00:00+05:30')::timestamptz)) / 3600)::numeric, 2) AS raw_ot_hours
      FROM attendance a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN attendance_batches b ON b.id = COALESCE(a.batch_id, u.batch_id)
      WHERE a.check_out > (a.date || ' 19:00:00+05:30')::timestamptz
        AND a.hours_worked < COALESCE(b.min_working_hours, 9.0)
        AND LOWER(COALESCE(a.status, '')) IN ('completed', 'working', 'present')
      ORDER BY a.date DESC
      LIMIT 50
    `);

    // 1C. Half-day or absent records marked as late
    const { rows: invalidLates } = await client.query(`
      SELECT id, user_id, date, status, is_late, late_minutes
      FROM attendance
      WHERE is_late = true
        AND LOWER(COALESCE(status, '')) IN ('half_day', 'absent', 'leave')
      ORDER BY date DESC
    `);

    // 1D. Abandoned check-ins (> 24h old with NULL check_out)
    const { rows: abandonedCheckins } = await client.query(`
      SELECT id, user_id, date, check_in, status
      FROM attendance
      WHERE check_out IS NULL
        AND check_in < NOW() - INTERVAL '24 hours'
      ORDER BY check_in ASC
    `);

    report.domains.attendance = {
      underMinHoursMarkedCompleted: underMinShifts.length,
      overtimeOnShortShifts: otOnShortShifts.length,
      invalidLatesOnHalfDayOrAbsent: invalidLates.length,
      abandonedCheckins: abandonedCheckins.length
    };
    report.totalIssuesFound += (underMinShifts.length + otOnShortShifts.length + invalidLates.length + abandonedCheckins.length);

    console.log(`  - Shifts < 9h marked completed: ${underMinShifts.length}`);
    if (underMinShifts.length > 0) {
      underMinShifts.slice(0, 5).forEach(s => console.log(`     ⚠️ ID ${s.id} | ${s.name} | ${s.date?.toISOString ? s.date.toISOString().slice(0,10) : s.date} | ${s.hours_worked}h (req ${s.required_hours}h) | status: ${s.stored_status}`));
    }
    console.log(`  - Overtime on shifts < 9h: ${otOnShortShifts.length}`);
    if (otOnShortShifts.length > 0) {
      otOnShortShifts.slice(0, 5).forEach(s => console.log(`     ⚠️ ID ${s.id} | ${s.name} | ${s.date?.toISOString ? s.date.toISOString().slice(0,10) : s.date} | ${s.hours_worked}h | raw OT: ${s.raw_ot_hours}h`));
    }
    console.log(`  - Half-Day/Absent records marked as late: ${invalidLates.length}`);
    if (invalidLates.length > 0) {
      invalidLates.slice(0, 5).forEach(s => console.log(`     ⚠️ ID ${s.id} | User ${s.user_id} | ${s.date?.toISOString ? s.date.toISOString().slice(0,10) : s.date} | status: ${s.status} | late_minutes: ${s.late_minutes}`));
    }
    console.log(`  - Abandoned open check-ins (> 24h): ${abandonedCheckins.length}`);


    // ── 2. INVOICE, TRANSACTIONS & FINANCIAL INTEGRITY ──────────────────────
    console.log('\n▶ [2/5] Auditing Invoices, Receipts & Transactions...');

    // 2A. Invoices where received_amount diverges from project_receipt transactions
    const { rows: invoiceTxnMismatches } = await client.query(`
      WITH txn_summary AS (
        SELECT reference_id, SUM(amount) AS total_received_txn
        FROM transactions
        WHERE type = 'income' AND category = 'project_receipt' AND reference_id IS NOT NULL
        GROUP BY reference_id
      )
      SELECT i.id, i.invoice_no, i.project_id, i.amount, i.received_amount,
             COALESCE(t.total_received_txn, 0) AS txn_total,
             ABS(COALESCE(i.received_amount, 0) - COALESCE(t.total_received_txn, 0)) AS diff
      FROM invoices i
      LEFT JOIN txn_summary t ON t.reference_id = i.invoice_no
      WHERE ABS(COALESCE(i.received_amount, 0) - COALESCE(t.total_received_txn, 0)) > 0.01
      ORDER BY diff DESC
    `);

    // 2B. Payment stages vs Document amounts discrepancy
    const { rows: stageDocMismatches } = await client.query(`
      SELECT COALESCE(pps.project_id, pda.project_id) AS project_id, 
             COALESCE(pps.document_type, pda.document_type) AS document_type, 
             pps.amount AS stage_amount, pda.amount AS doc_amount,
             ABS(COALESCE(pps.amount, 0) - COALESCE(pda.amount, 0)) AS diff
      FROM project_payment_stages pps
      FULL OUTER JOIN project_document_amounts pda
        ON pda.project_id = pps.project_id AND pda.document_type = pps.document_type
      WHERE ABS(COALESCE(pps.amount, 0) - COALESCE(pda.amount, 0)) > 0.01
    `);

    // 2C. Invoices marked 'paid' with unreceived balances (accounting for statutory TDS)
    const { rows: falsePaidInvoices } = await client.query(`
      SELECT id, invoice_no, amount, received_amount, status,
             COALESCE((tax_details->>'tdsAmount')::numeric, 0) AS tds_amount,
             (amount - COALESCE((tax_details->>'tdsAmount')::numeric, 0) - COALESCE(received_amount, 0)) AS unpaid_balance
      FROM invoices
      WHERE LOWER(status) = 'paid'
        AND (amount - COALESCE((tax_details->>'tdsAmount')::numeric, 0) - COALESCE(received_amount, 0)) > 0.01
    `);

    report.domains.finances = {
      invoiceTxnMismatches: invoiceTxnMismatches.length,
      stageDocMismatches: stageDocMismatches.length,
      falsePaidInvoices: falsePaidInvoices.length
    };
    report.totalIssuesFound += (invoiceTxnMismatches.length + stageDocMismatches.length + falsePaidInvoices.length);

    console.log(`  - Invoice vs Transaction balance discrepancies: ${invoiceTxnMismatches.length}`);
    if (invoiceTxnMismatches.length > 0) {
      invoiceTxnMismatches.forEach(inv => console.log(`     ⚠️ Invoice ${inv.invoice_no} | Billed: ₹${inv.amount} | Recorded Received: ₹${inv.received_amount} | Actual Txns: ₹${inv.txn_total} | Diff: ₹${inv.diff}`));
    }
    console.log(`  - Payment stage vs Document amount discrepancies: ${stageDocMismatches.length}`);
    if (stageDocMismatches.length > 0) {
      stageDocMismatches.slice(0, 5).forEach(m => console.log(`     ⚠️ Project ${m.project_id} [${m.document_type}] | Stage: ₹${m.stage_amount || 0} | Doc: ₹${m.doc_amount || 0} | Diff: ₹${m.diff}`));
    }
    console.log(`  - Invoices marked 'paid' with outstanding balance: ${falsePaidInvoices.length}`);
    if (falsePaidInvoices.length > 0) {
      falsePaidInvoices.forEach(inv => console.log(`     ⚠️ Invoice ${inv.invoice_no} | Total: ₹${inv.amount} | Received: ₹${inv.received_amount || 0} | Unpaid: ₹${inv.amount - (inv.received_amount || 0)}`));
    }


    // ── 3. LEAVE LEDGER & ATTENDANCE INTEGRITY ──────────────────────────────
    console.log('\n▶ [3/5] Auditing Leave Requests & Leave Ledger...');

    // 3A. Days with approved leave but conflicting attendance records
    const { rows: leaveAttendanceConflicts } = await client.query(`
      SELECT lr.user_id, u.name, d.date::date, lr.type AS leave_type, a.status AS att_status, a.hours_worked
      FROM leave_requests lr
      JOIN users u ON u.id = lr.user_id
      CROSS JOIN LATERAL generate_series(lr.start_date, lr.end_date, '1 day'::interval) d(date)
      JOIN attendance a ON a.user_id = lr.user_id AND a.date = d.date::date
      WHERE lr.status = 'approved'
        AND LOWER(COALESCE(a.status, '')) NOT IN ('leave', 'sunday', 'holiday')
        AND a.hours_worked > 0
      ORDER BY d.date DESC
    `);

    // 3B. Leave balance ledger continuity check
    const { rows: ledgerErrors } = await client.query(`
      SELECT elb.user_id, u.name, elb.year, elb.month,
             elb.opening_balance, elb.earned, elb.leaves_taken, elb.closing_balance,
             (elb.opening_balance + elb.earned - elb.leaves_taken) AS expected_closing,
             ABS(elb.closing_balance - (elb.opening_balance + elb.earned - elb.leaves_taken)) AS diff
      FROM employee_leave_balance elb
      JOIN users u ON u.id = elb.user_id
      WHERE ABS(elb.closing_balance - (elb.opening_balance + elb.earned - elb.leaves_taken)) > 0.01
      ORDER BY elb.year DESC, elb.month DESC
    `);

    report.domains.leaves = {
      approvedLeaveWorkedConflicts: leaveAttendanceConflicts.length,
      ledgerContinuityErrors: ledgerErrors.length
    };
    report.totalIssuesFound += (leaveAttendanceConflicts.length + ledgerErrors.length);

    console.log(`  - Days with approved leave but worked attendance: ${leaveAttendanceConflicts.length}`);
    console.log(`  - Leave ledger balance continuity errors: ${ledgerErrors.length}`);


    // ── 4. USERS & BATCH CONFIGURATION INTEGRITY ────────────────────────────
    console.log('\n▶ [4/5] Auditing Users, Batches & Salary Setup...');

    // 4A. Active users with zero base salary and zero hourly rate
    const { rows: unconfiguredSalaries } = await client.query(`
      SELECT id, name, role, department, base_salary, hourly_rate
      FROM users
      WHERE is_active IS NOT FALSE
        AND (base_salary IS NULL OR base_salary <= 0)
        AND (hourly_rate IS NULL OR hourly_rate <= 0)
    `);

    // 4B. Active users without an assigned attendance batch
    const { rows: unassignedBatches } = await client.query(`
      SELECT id, name, role, department
      FROM users
      WHERE is_active IS NOT FALSE AND batch_id IS NULL
    `);

    // 4C. Historical attendance records with NULL batch_id
    const { rows: nullBatchAttendance } = await client.query(`
      SELECT COUNT(*) as count FROM attendance WHERE batch_id IS NULL
    `);

    report.domains.users = {
      unconfiguredSalaries: unconfiguredSalaries.length,
      unassignedBatches: unassignedBatches.length,
      nullBatchAttendanceRecords: parseInt(nullBatchAttendance[0]?.count || 0, 10)
    };
    report.totalIssuesFound += (unconfiguredSalaries.length + unassignedBatches.length);

    console.log(`  - Active staff with unconfigured salary: ${unconfiguredSalaries.length}`);
    if (unconfiguredSalaries.length > 0) {
      unconfiguredSalaries.forEach(u => console.log(`     ⚠️ ID ${u.id} | ${u.name} (@${u.role}) | base_salary: ${u.base_salary} | hourly_rate: ${u.hourly_rate}`));
    }
    console.log(`  - Active staff without assigned batch: ${unassignedBatches.length}`);
    if (unassignedBatches.length > 0) {
      unassignedBatches.forEach(u => console.log(`     ⚠️ ID ${u.id} | ${u.name} (@${u.role}) | department: ${u.department || 'None'}`));
    }
    console.log(`  - Historical attendance records with NULL batch_id: ${nullBatchAttendance[0]?.count || 0}`);


    // ── 5. CLOSED PERIOD INTEGRITY ──────────────────────────────────────────
    console.log('\n▶ [5/5] Auditing Closed Period & Snapshot Health...');

    const { rows: closedMonths } = await client.query(`
      SELECT id, month, year, closed_at, close_reason
      FROM monthly_closing_log
      ORDER BY year DESC, month DESC
    `);

    report.domains.closing = {
      totalClosedMonths: closedMonths.length
    };
    console.log(`  - Total closed accounting periods: ${closedMonths.length}`);

    await client.query('COMMIT');

    // Summary
    console.log('\n================================================================');
    console.log(`   🏁 AUDIT SUMMARY: Total High-Risk Discrepancies Found = ${report.totalIssuesFound}`);
    console.log('================================================================\n');

    return report;

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Audit run encountered an error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runAudit()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runAudit };
