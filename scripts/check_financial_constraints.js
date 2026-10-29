const pool = require('../server/db');

async function checkFinancialConstraints() {
  const { rows } = await pool.query(`
    SELECT tc.table_name, tc.constraint_name, cc.check_clause
    FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
    WHERE tc.table_name IN ('invoices', 'transactions', 'office_expenses') AND tc.table_schema = 'public'
    ORDER BY tc.table_name, tc.constraint_name;
  `);
  console.log('Financial CHECK constraints:', rows);
  pool.end();
}

checkFinancialConstraints();
