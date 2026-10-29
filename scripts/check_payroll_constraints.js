const pool = require('../server/db');

async function checkPayrollConstraints() {
  const { rows } = await pool.query(`
    SELECT tc.constraint_name, cc.check_clause
    FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
    WHERE tc.table_name = 'payroll' AND tc.table_schema = 'public';
  `);
  console.log('Payroll CHECK constraints:', rows);
  pool.end();
}

checkPayrollConstraints();
