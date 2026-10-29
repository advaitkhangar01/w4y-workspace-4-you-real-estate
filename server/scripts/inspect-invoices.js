// server/scripts/inspect-invoices.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: true });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  try {
    const { rows } = await pool.query('SELECT id, invoice_no, amount, status, payment_stage_id FROM invoices ORDER BY id DESC');
    console.log('\n🔍 --- CURRENT INVOICES IN DATABASE ---');
    if (rows.length === 0) {
      console.log('No invoices found in database.');
    } else {
      console.table(rows);
    }
    
    const { rows: stages } = await pool.query("SELECT id, document_type, amount, status FROM project_payment_stages WHERE LOWER(status) IN ('payment initiated', 'bill generated', 'bill delivered', 'paid') ORDER BY id DESC LIMIT 20");
    console.log('\n📊 --- CURRENT PAYMENT STAGES (LAST 20) ---');
    if (stages.length === 0) {
      console.log('No active payment stages found.');
    } else {
      console.table(stages);
    }
  } catch (err) {
    console.error('❌ Diagnostic error:', err);
  } finally {
    await pool.end();
  }
}

main();
