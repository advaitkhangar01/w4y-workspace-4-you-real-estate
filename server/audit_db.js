const pool = require('./db');

async function auditDB() {
  try {
    console.log('=== DATABASE AUDIT STARTED ===');
    
    // 1. Check users
    const users = await pool.query('SELECT id, name, role, username, department FROM users ORDER BY id');
    console.log(`\n--- Users (${users.rows.length}) ---`);
    console.table(users.rows);

    // 2. Check attendance batches
    const batches = await pool.query('SELECT * FROM attendance_batches');
    console.log(`\n--- Attendance Batches (${batches.rows.length}) ---`);
    console.table(batches.rows);

    // 3. Count other tables
    const tables = [
      'clients', 'client_contacts', 'client_addresses', 'client_banking',
      'projects', 'project_stages', 'project_payment_stages', 'project_assignments',
      'attendance', 'attendance_attempts', 'leave_requests', 'holidays',
      'vendors', 'documents', 'comments', 'invoices', 'transactions',
      'office_expenses', 'expense_audits', 'payroll', 'app_settings',
      'tasks', 'task_participants', 'task_messages'
    ];

    console.log('\n--- Table Record Counts ---');
    for (const table of tables) {
      try {
        const countRes = await pool.query(`SELECT COUNT(*) FROM ${table}`);
        console.log(`- ${table}: ${countRes.rows[0].count}`);
      } catch (err) {
        console.log(`- ${table}: ERROR (${err.message})`);
      }
    }

    // 4. Sample project assignments to see if admin can see them
    const assignments = await pool.query('SELECT COUNT(*), user_id FROM project_assignments GROUP BY user_id');
    console.log('\n--- Project Assignments per User ---');
    console.table(assignments.rows);

    // 5. Check attendance status distribution
    const attStatus = await pool.query('SELECT status, COUNT(*) FROM attendance GROUP BY status');
    console.log('\n--- Attendance Statuses ---');
    console.table(attStatus.rows);

  } catch (err) {
    console.error('Audit failed:', err);
  } finally {
    pool.end();
  }
}

auditDB();
