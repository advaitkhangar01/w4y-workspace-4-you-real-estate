// scripts/reconcile_duplicate_stores.js
// Safe, idempotent reconciliation script for W4Y dual data stores
// 1. Synchronizes employee_leave_balance <-> employee_leave_summary
// 2. Synchronizes invoices.payment_stage_id <-> invoice_payment_stages

const pool = require('../server/db');

async function reconcileDuplicateStores() {
  console.log('================================================================');
  console.log('          DUPLICATE DATA STORES RECONCILIATION RUNNER           ');
  console.log('================================================================\n');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Reconcile Leave Stores: Sync employee_leave_balance -> employee_leave_summary
    console.log('1. Checking Leave Balance Stores...');
    const leaveSyncRes = await client.query(`
      INSERT INTO employee_leave_summary (user_id, month, year, unpaid_leaves)
      SELECT user_id, month, year, unpaid_leaves
      FROM employee_leave_balance elb
      ON CONFLICT (user_id, month, year)
      DO UPDATE SET unpaid_leaves = EXCLUDED.unpaid_leaves
      WHERE employee_leave_summary.unpaid_leaves IS DISTINCT FROM EXCLUDED.unpaid_leaves
      RETURNING *
    `);
    console.log(`   ✓ Synced ${leaveSyncRes.rowCount} record(s) to employee_leave_summary.`);

    // 2. Reconcile Invoice Payment Stages: invoices.payment_stage_id -> invoice_payment_stages
    console.log('2. Checking Invoice Payment Stages Junction...');
    const stageSyncRes = await client.query(`
      INSERT INTO invoice_payment_stages (invoice_id, payment_stage_id)
      SELECT id AS invoice_id, payment_stage_id
      FROM invoices
      WHERE payment_stage_id IS NOT NULL
      ON CONFLICT (invoice_id, payment_stage_id) DO NOTHING
      RETURNING *
    `);
    console.log(`   ✓ Synced ${stageSyncRes.rowCount} link(s) to invoice_payment_stages.`);

    await client.query('COMMIT');
    console.log('\n✅ All duplicate stores successfully reconciled and synchronized.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Reconciliation failed:', err);
    throw err;
  } finally {
    client.release();
    pool.end();
  }
}

if (require.main === module) {
  reconcileDuplicateStores();
}

module.exports = { reconcileDuplicateStores };
