// scripts/test_clean_install.js
const pool = require('../server/db');
const fs = require('fs');
const path = require('path');

async function testCleanInstall() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA clean_test');
    await client.query('SET search_path TO clean_test');

    const sql = fs.readFileSync(path.join(__dirname, '..', 'server', 'db', 'schema.sql'), 'utf8');
    
    // Ignore CREATE EXTENSION in isolated schema since extensions require superuser/public
    const cleanSql = sql.replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/i, '');

    console.log('Testing schema.sql execution in completely empty schema (clean_test)...');
    try {
      await client.query(cleanSql);
      console.log('✅ Clean install test: SUCCESS');
    } catch (err) {
      console.log('❌ Clean install test: FAILED WITH ERROR:');
      console.log('   Error Message:', err.message);
      console.log('   Error Code:', err.code);
      console.log('   Error Detail:', err.detail);
    }
    await client.query('ROLLBACK');
  } catch (err) {
    console.error('Test transaction error:', err);
    try { await client.query('ROLLBACK'); } catch (_) {}
  } finally {
    client.release();
    pool.end();
  }
}

testCleanInstall();
