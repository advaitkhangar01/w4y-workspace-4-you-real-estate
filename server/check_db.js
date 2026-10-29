const pool = require('./db');

async function check() {
  try {
    const invoices = await pool.query('SELECT * FROM invoices');
    console.log('--- INVOICES ---');
    console.log('Count:', invoices.rows.length);
    console.log(invoices.rows.map(r => ({ id: r.id, invoice_no: r.invoice_no, project_id: r.project_id, amount: r.amount, status: r.status, payment_stage_id: r.payment_stage_id })));

    const stages = await pool.query('SELECT * FROM project_payment_stages');
    console.log('--- PAYMENT STAGES ---');
    console.log('Count:', stages.rows.length);
    console.log(stages.rows.map(r => ({ id: r.id, project_id: r.project_id, name: r.name, amount: r.amount, status: r.status, document_type: r.document_type })));

    const txs = await pool.query('SELECT * FROM transactions WHERE project_id = 6');
    console.log('--- TRANSACTIONS FOR PROJECT 6 ---');
    console.log(txs.rows.map(r => ({ id: r.id, type: r.type, category: r.category, amount: r.amount, description: r.description })));

  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

check();
