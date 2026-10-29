// scripts/phase2_audit.js
// Read-only diagnostic queries for Phase 2: Database Architecture & Integrity Audit

const pool = require('../server/db');
const fs = require('fs');
const path = require('path');

async function runPhase2Audit() {
  console.log('================================================================');
  console.log('       PHASE 2: DATABASE ARCHITECTURE & INTEGRITY AUDIT        ');
  console.log('================================================================\n');

  const report = {};

  // -------------------------------------------------------------
  // 1. FRESH-INSTALL ORDERING TEST (Dry run in rolled-back transaction)
  // -------------------------------------------------------------
  console.log('--- 1. Testing schema.sql on fresh database transaction ---');
  const client = await pool.connect();
  try {
    const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'server', 'db', 'schema.sql'), 'utf8');
    await client.query('BEGIN');
    // Create a temporary schema to simulate a brand-new clean database
    await client.query('CREATE SCHEMA test_fresh_install');
    await client.query('SET search_path TO test_fresh_install, public');
    
    let schemaFailed = false;
    let schemaError = null;
    try {
      await client.query(schemaSql);
    } catch (err) {
      schemaFailed = true;
      schemaError = err.message;
    }
    report.freshInstallTest = { schemaFailed, schemaError };
    console.log(`Fresh install schema test: ${schemaFailed ? 'FAILED' : 'PASSED'}`);
    if (schemaFailed) console.log(`  Error: ${schemaError}`);

    await client.query('ROLLBACK');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    report.freshInstallTest = { error: err.message };
  } finally {
    client.release();
  }

  // -------------------------------------------------------------
  // 2. FOREIGN KEYS & ON DELETE ACTIONS
  // -------------------------------------------------------------
  console.log('\n--- 2. Inspecting all Foreign Keys and ON DELETE actions ---');
  const { rows: fks } = await pool.query(`
    SELECT
      tc.table_name, 
      kcu.column_name, 
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name,
      rc.delete_rule,
      tc.constraint_name
    FROM 
      information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints AS rc
        ON rc.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
    ORDER BY tc.table_name, kcu.column_name;
  `);
  report.foreignKeys = fks;

  const cascadeOnUsers = fks.filter(f => f.foreign_table_name === 'users' && f.delete_rule === 'CASCADE');
  console.log(`Total Foreign Keys: ${fks.length}`);
  console.log(`Foreign Keys with ON DELETE CASCADE from users: ${cascadeOnUsers.length}`);
  cascadeOnUsers.forEach(f => console.log(`  ${f.table_name}.${f.column_name} -> ${f.foreign_table_name}(${f.foreign_column_name}) [CASCADE]`));

  // -------------------------------------------------------------
  // 3. EXISTING DATA INTEGRITY & HEALTH CHECKS
  // -------------------------------------------------------------
  console.log('\n--- 3. Running Existing-Data Integrity & Health Queries ---');
  
  // 3.1 Attendance anomalies
  const { rows: attLateConflict } = await pool.query(`
    SELECT count(*) FROM attendance 
    WHERE (LOWER(status) = 'half_day' OR LOWER(status) = 'absent') 
      AND (is_late = true OR late_minutes > 0)
  `);
  
  const { rows: attOrphanCheckins } = await pool.query(`
    SELECT count(*) FROM attendance 
    WHERE check_in IS NOT NULL 
      AND check_out IS NULL 
      AND date < CURRENT_DATE - INTERVAL '30 days'
  `);

  const { rows: attNullBatch } = await pool.query(`
    SELECT count(*) FROM attendance WHERE batch_id IS NULL
  `);

  const { rows: userNullBatch } = await pool.query(`
    SELECT count(*) FROM users WHERE batch_id IS NULL AND is_active IS NOT FALSE
  `);

  const { rows: attDuplicates } = await pool.query(`
    SELECT user_id, date, count(*) 
    FROM attendance 
    GROUP BY user_id, date 
    HAVING count(*) > 1
  `);

  // 3.2 Payroll integrity
  const { rows: payrollCols } = await pool.query(`
    SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'payroll' ORDER BY ordinal_position
  `);
  console.log('Payroll columns:', payrollCols.map(c => c.column_name).join(', '));

  const { rows: payrollDuplicates } = await pool.query(`
    SELECT user_id, month, year, count(*) 
    FROM payroll 
    GROUP BY user_id, month, year 
    HAVING count(*) > 1
  `);

  const { rows: payrollMismatch } = await pool.query(`
    SELECT id, user_id, month, year, base_salary, net_paid, deductions, bonus, incentives, is_manual_override
    FROM payroll
  `);

  // 3.3 Leave balances reconciliation
  const { rows: leaveDupes } = await pool.query(`
    SELECT user_id, month, year, count(*) 
    FROM employee_leave_balance 
    GROUP BY user_id, month, year 
    HAVING count(*) > 1
  `);

  // 3.4 Invoices stage totals mismatch
  const { rows: invoiceStageMismatch } = await pool.query(`
    SELECT i.id, i.invoice_no, i.amount as invoice_amount, COALESCE(SUM(ips.amount), 0) as stage_sum
    FROM invoices i
    LEFT JOIN project_payment_stages ips ON i.payment_stage_id = ips.id
    WHERE i.payment_stage_id IS NOT NULL
    GROUP BY i.id, i.invoice_no, i.amount
    HAVING i.amount != COALESCE(SUM(ips.amount), 0)
  `);

  report.healthChecks = {
    attLateConflict: parseInt(attLateConflict[0].count, 10),
    attOrphanCheckins: parseInt(attOrphanCheckins[0].count, 10),
    attNullBatch: parseInt(attNullBatch[0].count, 10),
    userNullBatch: parseInt(userNullBatch[0].count, 10),
    attDuplicatesCount: attDuplicates.length,
    payrollDuplicatesCount: payrollDuplicates.length,
    payrollMismatchCount: payrollMismatch.length,
    leaveDupesCount: leaveDupes.length,
    invoiceStageMismatchCount: invoiceStageMismatch.length
  };

  console.log('Health check results:', JSON.stringify(report.healthChecks, null, 2));

  // -------------------------------------------------------------
  // 4. DATA TYPES, NULLABILITY & CONSTRAINTS AUDIT
  // -------------------------------------------------------------
  console.log('\n--- 4. Checking Data Types & Constraints ---');
  const { rows: moneyCols } = await pool.query(`
    SELECT table_name, column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND (column_name LIKE '%amount%' OR column_name LIKE '%salary%' OR column_name LIKE '%rate%' OR column_name LIKE '%balance%' OR column_name LIKE '%total%')
    ORDER BY table_name, column_name;
  `);

  const { rows: timeCols } = await pool.query(`
    SELECT table_name, column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND (data_type LIKE 'timestamp%')
    ORDER BY table_name, column_name;
  `);

  const { rows: uniqueConstraints } = await pool.query(`
    SELECT 
      tc.table_name, 
      tc.constraint_name, 
      kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema = 'public'
    ORDER BY tc.table_name, tc.constraint_name;
  `);

  report.moneyCols = moneyCols;
  report.timeColsWithoutTz = timeCols.filter(t => t.data_type === 'timestamp without time zone');
  report.uniqueConstraints = uniqueConstraints;

  console.log(`Timestamp columns WITHOUT timezone: ${report.timeColsWithoutTz.length}`);
  report.timeColsWithoutTz.forEach(t => console.log(`  ${t.table_name}.${t.column_name} (${t.data_type})`));

  fs.writeFileSync(path.join(__dirname, 'phase2_report.json'), JSON.stringify(report, null, 2));
  console.log('\nSaved phase2_report.json successfully');
}

runPhase2Audit().catch(err => console.error(err)).finally(() => pool.end());
