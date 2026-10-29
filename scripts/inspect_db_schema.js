const pool = require('../server/db');

async function inspectDb() {
  try {
    const { rows: tables } = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log('--- DATABASE TABLES IN POSTGRESQL ---');
    console.log(tables.map(t => t.table_name).join(', '));

    const { rows: migrations } = await pool.query(`
      SELECT version, applied_at FROM schema_migrations ORDER BY applied_at ASC;
    `);
    console.log('\n--- APPLIED MIGRATIONS IN schema_migrations ---');
    migrations.forEach(m => console.log(`  ${m.version} (applied: ${m.applied_at})`));

  } catch (err) {
    console.error('Error inspecting DB:', err.message);
  } finally {
    pool.end();
  }
}

inspectDb();

async function checkExpensesTables() {
  const o = await pool.query("SELECT COUNT(*) FROM office_expenses");
  const t = await pool.query("SELECT COUNT(*) FROM transactions WHERE type = 'expense'");
  console.log('--- EXPENSES TABLE COMPARISON ---');
  console.log('office_expenses count:', o.rows[0].count);
  console.log('transactions (expense) count:', t.rows[0].count);
}
checkExpensesTables();
