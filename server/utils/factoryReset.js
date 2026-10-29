const fs = require('fs');
const path = require('path');

/**
 * Executes a full factory reset of business data.
 * @param {import('pg').Pool} pool - Database pool
 * @returns {Promise<Object>} Summary of deleted records and files
 */
async function executeFactoryReset(pool) {
  const tables = [
    'task_messages',
    'task_participants',
    'tasks',
    'comments',
    'documents',
    'project_payment_stages',
    'project_document_amounts',
    'project_assignments',
    'project_stages',
    'invoices',
    'transactions',
    'office_expenses',
    'expense_audits',
    'payroll',
    'employee_leave_summary',
    'employee_leave_balance',
    'company_capital',
    'monthly_closing_log',
    'period_unlock_log',
    'leave_requests',
    'attendance_attempts',
    'attendance',
    'vendors',
    'projects',
    'client_banking',
    'client_addresses',
    'client_contacts',
    'clients'
  ];

  const summary = {
    tablesCleared: {},
    filesDeleted: 0,
    timestamp: new Date().toISOString()
  };

  const client = await pool.connect();

  try {
    // 1. Pre-count phase
    for (const table of tables) {
      const { rows } = await client.query(`SELECT COUNT(*) FROM ${table}`);
      summary.tablesCleared[table] = parseInt(rows[0].count);
    }

    // 2. Transaction phase
    await client.query('BEGIN');

    // Truncate all tables in order to handle foreign keys
    // RESTART IDENTITY resets SERIAL sequences to 1
    // CASCADE ensures dependent records are also handled (though we truncate all anyway)
    const truncateQuery = `TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`;
    await client.query(truncateQuery);

    await client.query('COMMIT');

    // 3. File cleanup phase
    const uploadDirs = ['projects', 'expenses'];
    const baseUploadPath = path.join(__dirname, '..', 'uploads');

    for (const dir of uploadDirs) {
      const targetPath = path.join(baseUploadPath, dir);
      if (fs.existsSync(targetPath)) {
        const files = fs.readdirSync(targetPath);
        for (const file of files) {
          const filePath = path.join(targetPath, file);
          const stats = fs.statSync(filePath);
          
          if (stats.isDirectory()) {
            fs.rmSync(filePath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(filePath);
          }
          summary.filesDeleted++;
        }
      } else {
        // Create directory if it doesn't exist for some reason
        fs.mkdirSync(targetPath, { recursive: true });
      }
    }

    return summary;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Factory Reset Error:', err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Gets a count summary of what will be deleted.
 * @param {import('pg').Pool} pool - Database pool
 * @returns {Promise<Object>} Counts per table
 */
async function getResetPreview(pool) {
  const tables = [
    'clients',
    'vendors',
    'projects',
    'tasks',
    'attendance',
    'leave_requests',
    'invoices',
    'transactions',
    'office_expenses',
    'payroll',
    'documents'
  ];

  const counts = {};
  const client = await pool.connect();

  try {
    for (const table of tables) {
      const { rows } = await client.query(`SELECT COUNT(*) FROM ${table}`);
      counts[table] = parseInt(rows[0].count);
    }

    // Count files separately
    let fileCount = 0;
    const uploadDirs = ['projects', 'expenses'];
    const baseUploadPath = path.join(__dirname, '..', 'uploads');

    for (const dir of uploadDirs) {
      const targetPath = path.join(baseUploadPath, dir);
      if (fs.existsSync(targetPath)) {
        const files = fs.readdirSync(targetPath);
        fileCount += files.length;
      }
    }
    counts.files = fileCount;

    return counts;
  } finally {
    client.release();
  }
}

module.exports = {
  executeFactoryReset,
  getResetPreview
};
