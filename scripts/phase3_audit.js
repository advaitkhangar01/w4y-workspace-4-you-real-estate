// scripts/phase3_audit.js
// Read-only analysis of routes, middleware, security, and authorization for Phase 3

const fs = require('fs');
const path = require('path');
const pool = require('../server/db');

async function runPhase3Audit() {
  console.log('================================================================');
  console.log('         PHASE 3: ROUTES, MIDDLEWARE & SECURITY AUDIT           ');
  console.log('================================================================\n');

  const routesDir = path.join(__dirname, '..', 'server', 'routes');
  const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

  // -------------------------------------------------------------
  // 1. SQL INJECTION / CONCATENATION AUDIT
  // -------------------------------------------------------------
  console.log('--- 1. Auditing SQL Queries for Parameterization vs Concatenation ---');
  const sqlConcatenationIssues = [];
  
  routeFiles.forEach(file => {
    const filePath = path.join(routesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      // Look for pool.query or client.query containing template literal string interpolations
      // that are NOT safe table/identifier quoting or static SQL
      if (line.includes('.query(') || line.includes('query +=') || line.includes('query = query +')) {
        // Check for direct variable interpolation like ${var} or + var
        if (/\$\{([a-zA-Z0-9_]+)\}/.test(line) && !line.includes('WHERE') && !line.includes('RETURNING') && !line.includes('ORDER')) {
          // Check what is being interpolated
        }
      }

      // Check for raw string concatenation in SQL queries
      const queryConcatMatch = line.match(/(?:SELECT|INSERT|UPDATE|DELETE|WHERE|AND|OR)\b.*?\+\s*([a-zA-Z0-9_]+)/i);
      if (queryConcatMatch) {
        sqlConcatenationIssues.push({
          file: `server/routes/${file}`,
          line: idx + 1,
          snippet: line.trim()
        });
      }

      // Check for template literals inside SQL where dynamic expressions are injected
      const templateLiteralSql = line.match(/(?:WHERE|AND|OR|SET)\s+[a-zA-Z0-9_.]+\s*=\s*\$\{([^}]+)\}/i);
      if (templateLiteralSql) {
        sqlConcatenationIssues.push({
          file: `server/routes/${file}`,
          line: idx + 1,
          snippet: line.trim()
        });
      }
    });
  });

  console.log(`Found ${sqlConcatenationIssues.length} direct SQL interpolation instances.`);
  sqlConcatenationIssues.forEach(iss => console.log(`  ${iss.file}:${iss.line} -> ${iss.snippet}`));

  // -------------------------------------------------------------
  // 2. CHECK PROJECT ACCESS MIDDLEWARE AUDIT
  // -------------------------------------------------------------
  console.log('\n--- 2. Auditing checkProjectAccess Middleware Logic ---');
  const accessControlPath = path.join(__dirname, '..', 'server', 'middleware', 'accessControl.js');
  const accessControlCode = fs.readFileSync(accessControlPath, 'utf8');
  console.log('Snippet of lines 84-95 in accessControl.js:');
  const acLines = accessControlCode.split('\n');
  for (let i = 80; i < Math.min(acLines.length, 95); i++) {
    console.log(`  Line ${i + 1}: ${acLines[i]}`);
  }

  // -------------------------------------------------------------
  // 3. TRUST PROXY & RATE LIMITING AUDIT
  // -------------------------------------------------------------
  console.log('\n--- 3. Auditing Express Trust Proxy & Rate Limiting ---');
  const indexPath = path.join(__dirname, '..', 'server', 'index.js');
  const indexCode = fs.readFileSync(indexPath, 'utf8');
  const hasTrustProxy = indexCode.includes('trust proxy');
  console.log(`Express app.set('trust proxy'): ${hasTrustProxy ? 'CONFIGURED' : '❌ MISSING'}`);

  // -------------------------------------------------------------
  // 4. SENSITIVE DATA EXPOSURE AUDIT (PASSWORDS, GPS)
  // -------------------------------------------------------------
  console.log('\n--- 4. Auditing Data Exposure (Passwords, GPS Coordinates) ---');
  const pwLeakQueries = [];
  routeFiles.forEach(file => {
    const content = fs.readFileSync(path.join(routesDir, file), 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (line.includes('SELECT * FROM users') || line.includes('SELECT u.* FROM users')) {
        pwLeakQueries.push({ file: `server/routes/${file}`, line: idx + 1, snippet: line.trim() });
      }
    });
  });
  console.log(`Queries selecting '*' from users table: ${pwLeakQueries.length}`);
  pwLeakQueries.forEach(p => console.log(`  ${p.file}:${p.line} -> ${p.snippet}`));

  // -------------------------------------------------------------
  // 5. GPS EXPOSURE AUDIT
  // -------------------------------------------------------------
  const attContent = fs.readFileSync(path.join(routesDir, 'attendance.js'), 'utf8');
  const leaksGpsInToday = attContent.includes("a.lat") || attContent.includes("lat,");
  console.log(`\nAttendance today query selects GPS lat/lng: ${leaksGpsInToday ? 'YES' : 'NO'}`);

  // -------------------------------------------------------------
  // 6. PERIOD LOCK COVERAGE AUDIT
  // -------------------------------------------------------------
  console.log('\n--- 6. Auditing checkPeriodLock Coverage on Mutating Routes ---');
  const periodLockIssues = [];
  routeFiles.forEach(file => {
    const content = fs.readFileSync(path.join(routesDir, file), 'utf8');
    const routeMatches = [...content.matchAll(/router\.(post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]\s*,([\s\S]*?)(?:async\s*)?\(/g)];
    routeMatches.forEach(rm => {
      const method = rm[1].toUpperCase();
      const pathStr = rm[2];
      const middle = rm[3];
      const affectsFinancialsOrMuster = 
        file.includes('finances') || 
        file.includes('accounting') || 
        file.includes('invoices') || 
        file.includes('attendance') || 
        file.includes('leaves');

      if (affectsFinancialsOrMuster) {
        const hasPeriodLock = middle.includes('checkPeriodLock');
        if (!hasPeriodLock) {
          // Exclude check-in / check-out (which are always today's date)
          if (!pathStr.includes('check-in') && !pathStr.includes('check-out') && !pathStr.includes('dropdown-masters')) {
            periodLockIssues.push({
              file: `server/routes/${file}`,
              method,
              path: pathStr
            });
          }
        }
      }
    });
  });
  console.log(`Mutating routes affecting financials/attendance without checkPeriodLock: ${periodLockIssues.length}`);
  periodLockIssues.forEach(p => console.log(`  ${p.method.padEnd(6)} ${p.path} (${p.file})`));

  // -------------------------------------------------------------
  // 7. FILE UPLOAD & MULTIPART SECURITY AUDIT
  // -------------------------------------------------------------
  console.log('\n--- 7. Auditing File Upload Handlers (Multer) ---');
  const docRoutePath = path.join(routesDir, 'documents.js');
  const docContent = fs.readFileSync(docRoutePath, 'utf8');
  console.log('Document upload multer config analysis:');
  const multerMatch = docContent.match(/const upload = multer\(\{[\s\S]*?\}\);/);
  if (multerMatch) {
    console.log(multerMatch[0]);
  } else {
    console.log('Multer config in documents.js not found in standard format');
  }

  pool.end();
}

runPhase3Audit().catch(err => console.error(err));
