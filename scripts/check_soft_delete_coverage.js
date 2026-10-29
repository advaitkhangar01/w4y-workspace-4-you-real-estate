// scripts/check_soft_delete_coverage.js
const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, '..', 'server', 'routes');
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

console.log('--- SOFT DELETION (is_active) AUDIT ACROSS ROUTES ---');
files.forEach(file => {
  const code = fs.readFileSync(path.join(routesDir, file), 'utf8');
  const userQueries = [...code.matchAll(/FROM\s+users\b[\s\S]*?(?:WHERE|ORDER|GROUP|;|\`)/gi)];
  
  if (code.includes('FROM users') || code.includes('JOIN users')) {
    const hasFilter = code.includes('is_active');
    console.log(`File: ${file.padEnd(20)} | Queries users: YES | Filters is_active: ${hasFilter ? 'YES' : '❌ NO / PARTIAL'}`);
  }
});
