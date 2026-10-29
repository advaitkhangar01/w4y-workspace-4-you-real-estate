const pool = require('../server/db');

async function checkConstraints() {
  const { rows } = await pool.query(`
    SELECT 
      tc.table_name, 
      tc.constraint_name, 
      string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) as columns
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema = 'public'
    GROUP BY tc.table_name, tc.constraint_name
    ORDER BY tc.table_name, tc.constraint_name;
  `);

  console.log('--- UNIQUE CONSTRAINTS IN DATABASE ---');
  rows.forEach(r => console.log(`  Table "${r.table_name}": ${r.constraint_name} (${r.columns})`));
  pool.end();
}

checkConstraints().catch(err => console.error(err));

async function checkCheckConstraints() {
  const { rows } = await pool.query(`
    SELECT 
      tc.table_name, 
      tc.constraint_name, 
      cc.check_clause
    FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc 
      ON tc.constraint_name = cc.constraint_name
    WHERE tc.constraint_type = 'CHECK' AND tc.table_schema = 'public'
    ORDER BY tc.table_name, tc.constraint_name;
  `);

  console.log('\n--- CHECK CONSTRAINTS IN DATABASE ---');
  rows.forEach(r => console.log(`  Table "${r.table_name}": ${r.constraint_name} -> ${r.check_clause}`));
}
checkCheckConstraints();
