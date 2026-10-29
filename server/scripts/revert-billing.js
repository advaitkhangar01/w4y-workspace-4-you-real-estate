// server/scripts/revert-billing.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: true });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const client = await pool.connect();
  try {
    console.log('🔄 Reverting test invoices and payment stages...');
    await client.query('BEGIN');

    // 1. Reset all payment stages to 'payment initiated'
    const resetRes = await client.query(`
      UPDATE project_payment_stages 
      SET status = 'payment initiated', updated_at = NOW() 
      WHERE LOWER(status) IN ('bill generated', 'bill delivered', 'paid')
    `);
    console.log(`✅ Reset ${resetRes.rowCount} payment stages to 'payment initiated'.`);

    // 2. Delete actual generated invoices
    const deleteInvRes = await client.query(`
      DELETE FROM invoices 
      WHERE payment_stage_id IS NOT NULL OR status = 'draft'
    `);
    console.log(`✅ Deleted ${deleteInvRes.rowCount} invoices generated from payment stages.`);

    // 3. Delete income transactions associated with project receipts
    const deleteTxRes = await client.query(`
      DELETE FROM transactions 
      WHERE type = 'income' AND category = 'project_receipt'
    `);
    console.log(`✅ Deleted ${deleteTxRes.rowCount} associated income transactions.`);

    await client.query('COMMIT');
    console.log('🚀 Successfully reverted all test billing data! The system is now reset to a clean state.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to revert billing data:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
