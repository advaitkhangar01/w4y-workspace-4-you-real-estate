/**
 * W4Y Safe VPS Data Reconciliation Script
 * 
 * Safely aligns database records with established business rules:
 * 1. Sets min_working_hours = 9.00 across all attendance batches.
 * 2. Reclassifies attendance records with < 9.00 hours worked to 'half_day'.
 * 3. Clears late flags and late minutes from half-day and absent records.
 * 4. Assigns default batch to active staff missing a batch (User 25: Chetna Gaulkar -> 10 AM Batch).
 * 5. Backfills batch_id on historical attendance records from the user's assigned batch.
 * 
 * Usage:
 *   node scripts/safe_reconcile_vps.js --dry-run   (Preview only, no changes)
 *   node scripts/safe_reconcile_vps.js --apply     (Executes within an atomic transaction)
 */

const pool = require('../server/db');

async function reconcile() {
  const isApply = process.argv.includes('--apply');
  const mode = isApply ? 'APPLY (EXECUTING CHANGES)' : 'DRY-RUN (PREVIEW ONLY)';

  console.log('\n================================================================');
  console.log(`   🔧 W4Y SAFE DATA RECONCILIATION`);
  console.log(`   Mode: ${mode}`);
  console.log('================================================================\n');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Attendance Batches: align min_working_hours to 9.00
    console.log('▶ [1/5] Checking Attendance Batches min_working_hours...');
    const { rows: batchesToUpdate } = await client.query(`
      SELECT id, name, min_working_hours FROM attendance_batches WHERE min_working_hours < 9.00
    `);
    console.log(`  - Found ${batchesToUpdate.length} batches with min_working_hours < 9.00:`);
    batchesToUpdate.forEach(b => console.log(`     Batch ID ${b.id} (${b.name}): current ${b.min_working_hours}h -> new 9.00h`));

    if (isApply && batchesToUpdate.length > 0) {
      const { rowCount } = await client.query(`
        UPDATE attendance_batches SET min_working_hours = 9.00 WHERE min_working_hours < 9.00
      `);
      console.log(`  ✅ Updated ${rowCount} attendance batches to 9.00 hours.`);
    }

    // 2. Attendance Records: shifts < 9.00h marked completed/working
    console.log('\n▶ [2/5] Checking Attendance shifts < 9.00h marked completed...');
    const { rows: shortShifts } = await client.query(`
      SELECT a.id, a.user_id, u.name, a.date, a.hours_worked, a.status
      FROM attendance a
      JOIN users u ON u.id = a.user_id
      WHERE a.check_out IS NOT NULL
        AND a.hours_worked < 9.00
        AND LOWER(COALESCE(a.status, '')) IN ('completed', 'working', 'present')
      ORDER BY a.date DESC
    `);
    console.log(`  - Found ${shortShifts.length} records with < 9.00h marked as completed/working.`);
    if (shortShifts.length > 0) {
      console.log('    Top 5 examples:');
      shortShifts.slice(0, 5).forEach(s => console.log(`     ID ${s.id} | ${s.name} | ${s.date?.toISOString ? s.date.toISOString().slice(0,10) : s.date} | ${s.hours_worked}h | status: ${s.status}`));
    }

    if (isApply && shortShifts.length > 0) {
      const { rowCount } = await client.query(`
        UPDATE attendance 
        SET status = 'half_day', is_late = false, late_minutes = 0
        WHERE check_out IS NOT NULL
          AND hours_worked < 9.00
          AND LOWER(COALESCE(status, '')) IN ('completed', 'working', 'present')
      `);
      console.log(`  ✅ Updated ${rowCount} attendance records to 'half_day' (is_late cleared).`);
    }

    // 3. Lateness on Half-Day & Absent records
    console.log('\n▶ [3/5] Checking Half-Day / Absent records marked as late...');
    const { rows: invalidLates } = await client.query(`
      SELECT id, user_id, date, status, is_late, late_minutes
      FROM attendance
      WHERE is_late = true
        AND LOWER(COALESCE(status, '')) IN ('half_day', 'absent', 'leave')
    `);
    console.log(`  - Found ${invalidLates.length} half-day/absent records with is_late = true.`);

    if (isApply && invalidLates.length > 0) {
      const { rowCount } = await client.query(`
        UPDATE attendance
        SET is_late = false, late_minutes = 0
        WHERE is_late = true
          AND LOWER(COALESCE(status, '')) IN ('half_day', 'absent', 'leave')
      `);
      console.log(`  ✅ Cleared late flags on ${rowCount} records.`);
    }

    // 4. Active Staff Batch Assignment
    console.log('\n▶ [4/5] Checking active staff batch assignments...');
    const { rows: unassignedUsers } = await client.query(`
      SELECT id, name, role, department FROM users WHERE is_active IS NOT FALSE AND batch_id IS NULL
    `);
    console.log(`  - Found ${unassignedUsers.length} active staff without batch:`);
    unassignedUsers.forEach(u => console.log(`     User ID ${u.id} | ${u.name} (@${u.role})`));

    if (isApply && unassignedUsers.length > 0) {
      // Find 10 AM Batch or fallback to lowest batch ID
      const { rows: batch10 } = await client.query(`
        SELECT id FROM attendance_batches WHERE name ILIKE '%10%' ORDER BY id ASC LIMIT 1
      `);
      const targetBatchId = batch10[0]?.id || 2;
      const { rowCount } = await client.query(`
        UPDATE users SET batch_id = $1 WHERE is_active IS NOT FALSE AND batch_id IS NULL
      `, [targetBatchId]);
      console.log(`  ✅ Assigned ${rowCount} staff to Batch ID ${targetBatchId}.`);
    }

    // 5. Historical Attendance NULL batch_id
    console.log('\n▶ [5/5] Checking historical attendance records with NULL batch_id...');
    const { rows: nullBatches } = await client.query(`
      SELECT COUNT(*) as count FROM attendance WHERE batch_id IS NULL
    `);
    const nullCount = parseInt(nullBatches[0]?.count || 0, 10);
    console.log(`  - Found ${nullCount} attendance records with NULL batch_id.`);

    if (isApply && nullCount > 0) {
      const { rowCount } = await client.query(`
        UPDATE attendance a
        SET batch_id = COALESCE(u.batch_id, 2)
        FROM users u
        WHERE a.user_id = u.id AND a.batch_id IS NULL
      `);
      console.log(`  ✅ Linked batch_id on ${rowCount} historical attendance records.`);
    }

    if (isApply) {
      await client.query('COMMIT');
      console.log('\n================================================================');
      console.log('   🎉 RECONCILIATION COMPLETED SUCCESSFULLY (TRANSACTION COMMITTED)');
      console.log('================================================================\n');
    } else {
      await client.query('ROLLBACK');
      console.log('\n================================================================');
      console.log('   ℹ️ DRY-RUN FINISHED (NO DATABASE CHANGES MADE)');
      console.log('   To apply these changes, run with: node scripts/safe_reconcile_vps.js --apply');
      console.log('================================================================\n');
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Reconciliation encountered error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  reconcile()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { reconcile };
