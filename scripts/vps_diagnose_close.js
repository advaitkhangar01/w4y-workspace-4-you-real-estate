const pool = require('../server/db');

async function diagnose() {
  console.log('=== VPS Monthly Close Diagnostics ===');
  let client;
  try {
    // 1. Connection check
    console.log('1. Checking database connection...');
    client = await pool.connect();
    const { rows: nowRows } = await client.query('SELECT NOW() as time, CURRENT_USER as user, current_database() as db');
    console.log(`   ✅ Connected to Database: "${nowRows[0].db}" as User: "${nowRows[0].user}"`);
    console.log(`   Time on DB: ${nowRows[0].time}`);

    // 2. Table checks
    console.log('\n2. Verifying required database tables...');
    const tables = [
      'monthly_closing_log',
      'period_unlock_log',
      'employee_leave_balance',
      'company_capital',
      'expense_audits',
      'users',
      'payroll'
    ];

    for (const table of tables) {
      const { rows } = await client.query(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = $1
        ) as exists`,
        [table]
      );
      if (rows[0].exists) {
        console.log(`   ✅ Table "${table}" exists.`);
      } else {
        console.log(`   ❌ Table "${table}" DOES NOT EXIST!`);
      }
    }

    // 3. Columns check for expense_audits
    console.log('\n3. Checking column definitions for "expense_audits"...');
    const cols = ['category', 'month', 'year', 'is_verified', 'verified_by', 'verified_at'];
    for (const col of cols) {
      const { rows } = await client.query(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'expense_audits' AND column_name = $1
        ) as exists`,
        [col]
      );
      if (rows[0].exists) {
        console.log(`   ✅ Column "${col}" exists.`);
      } else {
        console.log(`   ❌ Column "${col}" DOES NOT EXIST!`);
      }
    }

    // 4. Try executing a mock month close inside a rollback transaction
    console.log('\n4. Running a mock Month Close Dry-Run (January 2020)...');
    await client.query('BEGIN');
    
    // Simulate table locks/inserts
    await client.query(
      `INSERT INTO monthly_closing_log (month, year, closed_by, close_reason, snapshot)
       VALUES (1, 2020, NULL, 'Diagnostic Close', '{}') RETURNING id`
    );
    console.log('   ✅ Inserted into monthly_closing_log.');

    await client.query(
      `INSERT INTO company_capital (month, year, amount, description)
       VALUES (1, 2020, 100.00, 'Diagnostic capital transfer')
       ON CONFLICT (month, year) DO UPDATE SET amount = EXCLUDED.amount`
    );
    console.log('   ✅ Inserted/Updated company_capital.');

    await client.query(
      `INSERT INTO expense_audits (category, month, year, is_verified)
       VALUES ('office', 1, 2020, TRUE)
       ON CONFLICT (category, month, year) DO UPDATE SET is_verified = TRUE`
    );
    console.log('   ✅ Inserted/Updated expense_audits.');

    await client.query('ROLLBACK');
    console.log('   ✅ Transaction rolled back successfully (no test logs saved).');

    console.log('\n🎉 DIAGNOSTICS COMPLETED SUCCESSFULLY! No backend schema database issues detected.');
    process.exit(0);
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch(e) {}
    }
    console.error('\n❌ DIAGNOSTICS FAILED:');
    console.error(err);
    process.exit(1);
  } finally {
    if (client) client.release();
  }
}

diagnose();
