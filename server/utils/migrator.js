// server/utils/migrator.js
// Automated, idempotent, transaction-safe migration runner for DS16

const fs = require('fs');
const path = require('path');
const pool = require('../db');

async function runMigrations() {
  console.log('🔄 Checking database migrations...');
  const client = await pool.connect();

  try {
    await client.query('SELECT pg_advisory_lock(987654321)');

    // 1. Ensure migration tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 2. Read all already-applied migration versions
    const { rows: appliedRows } = await client.query('SELECT version FROM schema_migrations');
    const appliedSet = new Set(appliedRows.map(r => r.version));

    // 3. Scan migrations directory
    const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('ℹ️ No migrations directory found.');
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let appliedCount = 0;

    for (const file of files) {
      if (appliedSet.has(file)) {
        continue; // Already applied
      }

      console.log(`  Applying migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`  ✅ Applied: ${file}`);
        appliedCount++;
      } catch (migrationErr) {
        await client.query('ROLLBACK');
        console.error(`  ❌ Failed applying ${file}:`, migrationErr.message);
        throw migrationErr;
      }
    }

    if (appliedCount === 0) {
      console.log('✅ Database is already up to date. (0 pending migrations)');
    } else {
      console.log(`🎉 Successfully applied ${appliedCount} migration(s).`);
    }

  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock(987654321)');
    } catch (_) {}
    client.release();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => {
      pool.end();
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      pool.end();
      process.exit(1);
    });
}

module.exports = { runMigrations };
