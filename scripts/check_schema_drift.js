// scripts/check_schema_drift.js
const pool = require('../server/db');
const fs = require('fs');
const path = require('path');

async function checkDrift() {
  console.log('--- COMPARING LIVE SCHEMA VS SCHEMA.SQL ---');
  
  // 1. Get live database tables and columns
  const { rows: liveCols } = await pool.query(`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, column_name;
  `);

  const liveMap = {};
  liveCols.forEach(c => {
    if (!liveMap[c.table_name]) liveMap[c.table_name] = new Set();
    liveMap[c.table_name].add(c.column_name);
  });

  // 2. Parse server/db/schema.sql
  const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'server', 'db', 'schema.sql'), 'utf8');
  
  // Extract table creation blocks
  const tableBlockRegex = /CREATE TABLE IF NOT EXISTS\s+([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\);/g;
  const schemaMap = {};
  let tm;
  while ((tm = tableBlockRegex.exec(schemaSql)) !== null) {
    const tableName = tm[1];
    const body = tm[2];
    schemaMap[tableName] = new Set();
    
    // Parse column names
    const lines = body.split('\n');
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('CONSTRAINT') || trimmed.startsWith('UNIQUE') || trimmed.startsWith('PRIMARY KEY') || trimmed.startsWith('FOREIGN KEY')) return;
      const colMatch = trimmed.match(/^([a-zA-Z0-9_]+)\s+[A-Za-z]/);
      if (colMatch) {
        schemaMap[tableName].add(colMatch[1]);
      }
    });
  }

  // 3. Compare tables
  const liveTables = Object.keys(liveMap);
  const schemaTables = Object.keys(schemaMap);

  const missingInSchema = liveTables.filter(t => !schemaMap[t]);
  const missingInLive = schemaTables.filter(t => !liveMap[t]);

  console.log('\n[1] TABLES DRIFT:');
  console.log(`Live DB Tables (${liveTables.length}):`, liveTables.sort().join(', '));
  console.log(`schema.sql Tables (${schemaTables.length}):`, schemaTables.sort().join(', '));
  console.log('\nTables present in LIVE DB but MISSING from schema.sql:', missingInSchema);
  console.log('Tables present in schema.sql but MISSING from LIVE DB:', missingInLive);

  // 4. Compare columns for common tables
  console.log('\n[2] COLUMN DRIFT (Columns present in LIVE DB but missing from schema.sql):');
  const commonTables = liveTables.filter(t => schemaMap[t]);
  const colDrift = {};
  commonTables.forEach(t => {
    const liveSet = liveMap[t];
    const schemaSet = schemaMap[t];
    const diff = [...liveSet].filter(c => !schemaSet.has(c));
    if (diff.length > 0) {
      colDrift[t] = diff;
      console.log(`  Table "${t}": missing columns in schema.sql ->`, diff.join(', '));
    }
  });

  // Save drift report
  fs.writeFileSync(path.join(__dirname, 'schema_drift_report.json'), JSON.stringify({
    missingInSchema,
    missingInLive,
    colDrift
  }, null, 2));

  pool.end();
}

checkDrift().catch(err => console.error(err));
