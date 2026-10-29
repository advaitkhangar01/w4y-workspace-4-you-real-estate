// server/scripts/full-audit.js
// Automated Deep Safety, Integrity, Database & Calculation Auditor for DS16

const pool = require('../db');
const fs = require('fs');
const path = require('path');

async function executeFullAudit() {
  console.log('================================================================');
  console.log('  DS16 ENTERPRISE SAFETY, INTEGRITY & CALCULATION AUDIT REPORT  ');
  console.log('================================================================\n');

  const report = {
    criticalVulnerabilities: [],
    warnings: [],
    passedChecks: [],
    stats: {}
  };

  try {
    // -------------------------------------------------------------
    // 1. RELATIONAL & REFERENTIAL INTEGRITY AUDIT
    // -------------------------------------------------------------
    console.log('--- 1. Relational & Referential Integrity ---');
    
    // Check Foreign Key Cascade policies using PostgreSQL system catalog
    const fkQuery = `
      SELECT 
        conrelid::regclass::text AS table_name,
        conname AS constraint_name,
        confrelid::regclass::text AS foreign_table_name,
        confdeltype
      FROM pg_constraint
      WHERE contype = 'f'
        AND conrelid IN ('invoices'::regclass, 'transactions'::regclass, 'payroll'::regclass, 'attendance'::regclass, 'documents'::regclass, 'tasks'::regclass);
    `;
    const { rows: fks } = await pool.query(fkQuery);
    for (const fk of fks) {
      if (fk.confdeltype === 'c') { // 'c' is CASCADE
        if (fk.table_name === 'invoices' || fk.table_name === 'transactions' || fk.table_name === 'payroll') {
          report.criticalVulnerabilities.push(
            `Table "${fk.table_name}" cascades on delete from "${fk.foreign_table_name}". A parent deletion could destroy statutory financial records.`
          );
        } else if (fk.table_name === 'attendance') {
          report.warnings.push(
            `Table "attendance" cascades on delete from "${fk.foreign_table_name}". Deleting an employee wipes their historical muster roll.`
          );
        }
      }
    }
    report.passedChecks.push('FK foreign key scan completed.');

    // Check for orphaned records
    const orphanQueries = [
      { name: 'Tasks with invalid assigned_to', q: 'SELECT COUNT(*) FROM tasks WHERE assigned_to IS NOT NULL AND assigned_to NOT IN (SELECT id FROM users)' },
      { name: 'Invoices with invalid project_id', q: 'SELECT COUNT(*) FROM invoices WHERE project_id IS NOT NULL AND project_id NOT IN (SELECT id FROM projects)' },
      { name: 'Invoices with invalid client_id', q: 'SELECT COUNT(*) FROM invoices WHERE client_id IS NOT NULL AND client_id NOT IN (SELECT id FROM clients)' },
      { name: 'Transactions with invalid project_id', q: 'SELECT COUNT(*) FROM transactions WHERE project_id IS NOT NULL AND project_id NOT IN (SELECT id FROM projects)' },
      { name: 'Documents with invalid project_id', q: 'SELECT COUNT(*) FROM documents WHERE project_id NOT IN (SELECT id FROM projects)' },
      { name: 'Payment stages with invalid project_id', q: 'SELECT COUNT(*) FROM project_payment_stages WHERE project_id NOT IN (SELECT id FROM projects)' }
    ];

    for (const check of orphanQueries) {
      try {
        const { rows } = await pool.query(check.q);
        const count = parseInt(rows[0].count, 10);
        if (count > 0) {
          report.criticalVulnerabilities.push(`Orphan Data: Found ${count} records for "${check.name}"`);
        } else {
          report.passedChecks.push(`Orphan Check: 0 orphans for "${check.name}"`);
        }
      } catch (err) {
        report.warnings.push(`Could not verify "${check.name}": ${err.message}`);
      }
    }

    // -------------------------------------------------------------
    // 2. FINANCIAL DATA SANITY & CALCULATION INTEGRITY
    // -------------------------------------------------------------
    console.log('--- 2. Financial Sanity & Calculation Checks ---');

    // Negative amounts check
    const { rows: negInv } = await pool.query('SELECT COUNT(*) FROM invoices WHERE amount < 0');
    if (parseInt(negInv[0].count, 10) > 0) {
      report.criticalVulnerabilities.push(`Found ${negInv[0].count} invoices with negative amounts.`);
    } else {
      report.passedChecks.push('Zero negative invoices found.');
    }

    const { rows: negTx } = await pool.query('SELECT COUNT(*) FROM transactions WHERE amount < 0');
    if (parseInt(negTx[0].count, 10) > 0) {
      report.criticalVulnerabilities.push(`Found ${negTx[0].count} transactions with negative amounts.`);
    } else {
      report.passedChecks.push('Zero negative transactions found.');
    }

    // Invoice Subtotal & Tax Calculation Verification
    const { rows: invoices } = await pool.query('SELECT id, invoice_no, amount, tax_details, items FROM invoices');
    let invoiceMathErrors = 0;
    for (const inv of invoices) {
      if (inv.items && Array.isArray(inv.items)) {
        const subtotal = inv.items.reduce((acc, it) => acc + (Number(it.amount) || (Number(it.qty || 1) * Number(it.rate || 0))), 0);
        const taxRate = Number(inv.tax_details?.tax_rate || 0);
        const expectedTax = (subtotal * taxRate) / 100;
        const expectedTotal = Math.round((subtotal + expectedTax) * 100) / 100;
        const actual = Math.round(Number(inv.amount) * 100) / 100;
        if (Math.abs(expectedTotal - actual) > 1.0) {
          report.warnings.push(`Invoice ${inv.invoice_no}: Math discrepancy. Computed ₹${expectedTotal}, Recorded ₹${actual}`);
          invoiceMathErrors++;
        }
      }
    }
    if (invoiceMathErrors === 0) {
      report.passedChecks.push(`All ${invoices.length} invoices match tax + subtotal calculations.`);
    }

    // -------------------------------------------------------------
    // 3. PERIOD LOCK & MONTHLY CLOSING INTEGRITY
    // -------------------------------------------------------------
    console.log('--- 3. Period Lock & Tamper Checks ---');
    const { rows: closedLogs } = await pool.query('SELECT month, year, closed_at FROM monthly_closing_log');
    report.stats.closedPeriodsCount = closedLogs.length;

    for (const cl of closedLogs) {
      const { rows: tampered } = await pool.query(`
        SELECT id, date, created_at FROM transactions
        WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2
          AND created_at > $3
          AND id NOT IN (SELECT transaction_id FROM period_unlock_log WHERE month = $1 AND year = $2 AND transaction_id IS NOT NULL)
      `, [cl.month, cl.year, cl.closed_at]);

      if (tampered.length > 0) {
        report.criticalVulnerabilities.push(`Tamper Warning: Found ${tampered.length} transactions backdated into locked period ${cl.month}/${cl.year} without unlock authorization.`);
      }
    }
    report.passedChecks.push(`Period lock audit completed across ${closedLogs.length} closed periods.`);

    // -------------------------------------------------------------
    // 4. ATTENDANCE & GEOFENCING DATA INTEGRITY
    // -------------------------------------------------------------
    console.log('--- 4. Attendance & Geofencing Invariants ---');
    const { rows: dupAtt } = await pool.query(`
      SELECT user_id, date, COUNT(*) FROM attendance GROUP BY user_id, date HAVING COUNT(*) > 1
    `);
    if (dupAtt.length > 0) {
      report.criticalVulnerabilities.push(`Found ${dupAtt.length} duplicate attendance records for the same user on the same date.`);
    } else {
      report.passedChecks.push('Attendance records satisfy UNIQUE(user_id, date) invariant.');
    }

    // Check GPS drift outliers
    const { rows: outliers } = await pool.query(`
      SELECT COUNT(*) FROM attendance WHERE checkin_distance > 50000 -- > 50 km
    `);
    if (parseInt(outliers[0].count, 10) > 0) {
      report.warnings.push(`Found ${outliers[0].count} attendance check-ins with distance > 50km from office.`);
    } else {
      report.passedChecks.push('All attendance check-ins are within reasonable geographical boundary.');
    }

    // -------------------------------------------------------------
    // 5. STORAGE & UPLOAD PATH SECURITY
    // -------------------------------------------------------------
    console.log('--- 5. Upload Path & File Storage Security ---');
    const uploadsPath = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadsPath)) {
      report.warnings.push(`Uploads folder does not exist at ${uploadsPath}`);
    } else {
      report.passedChecks.push(`Upload directory exists at ${uploadsPath}`);
    }

    // -------------------------------------------------------------
    // SUMMARY OUTPUT
    // -------------------------------------------------------------
    console.log('\n================ AUDIT SUMMARY ================');
    console.log(`✅ Passed Checks: ${report.passedChecks.length}`);
    console.log(`⚠️ Warnings: ${report.warnings.length}`);
    console.log(`🚨 Critical Vulnerabilities: ${report.criticalVulnerabilities.length}`);
    console.log('===============================================\n');

    if (report.criticalVulnerabilities.length > 0) {
      console.log('CRITICAL VULNERABILITIES FOUND:');
      report.criticalVulnerabilities.forEach((v, i) => console.log(`  ${i + 1}. [CRITICAL] ${v}`));
      console.log('');
    }

    if (report.warnings.length > 0) {
      console.log('WARNINGS & OPERATIONAL RISKS:');
      report.warnings.forEach((w, i) => console.log(`  ${i + 1}. [WARN] ${w}`));
      console.log('');
    }

    console.log('PASSED CHECKS:');
    report.passedChecks.forEach((p, i) => console.log(`  ${i + 1}. [PASS] ${p}`));

  } catch (err) {
    console.error('Audit execution error:', err);
  } finally {
    pool.end();
  }
}

executeFullAudit();
