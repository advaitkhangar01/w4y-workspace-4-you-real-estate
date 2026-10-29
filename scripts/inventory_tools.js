// scripts/inventory_tools.js
// Read-only measurement tools for W4Y Audit Phase 1 Inventory

const fs = require('fs');
const path = require('path');
const pool = require('../server/db');

async function runInventory() {
  console.log('================================================================');
  console.log('       W4Y SYSTEM INVENTORY & MEASUREMENT REPORT (PHASE 1)     ');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // 1. BACKEND ROUTE INVENTORY
  // -------------------------------------------------------------
  const serverIndexPath = path.join(__dirname, '..', 'server', 'index.js');
  const serverIndex = fs.readFileSync(serverIndexPath, 'utf8');

  // Extract router mounts from server/index.js
  const mountRegex = /app\.use\(\s*['"]([^'"]+)['"]\s*,\s*([a-zA-Z0-9_]+)\s*\)/g;
  const mounts = {};
  let m;
  while ((m = mountRegex.exec(serverIndex)) !== null) {
    mounts[m[2]] = m[1];
  }

  const requireRegex = /const\s+(?:{\s*router:\s*([a-zA-Z0-9_]+)[^}]*}|([a-zA-Z0-9_]+))\s*=\s*require\(['"]\.\/routes\/([^'"]+)['"]\)/g;
  const varToFile = {};
  while ((m = requireRegex.exec(serverIndex)) !== null) {
    const varName = m[1] || m[2];
    varToFile[varName] = m[3].replace(/\.js$/, '');
  }

  const fileToPrefix = {};
  for (const [varName, prefix] of Object.entries(mounts)) {
    const file = varToFile[varName];
    if (file) fileToPrefix[file] = prefix;
  }

  const routesDir = path.join(__dirname, '..', 'server', 'routes');
  const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));
  const allRoutes = [];

  routeFiles.forEach(f => {
    const baseName = f.replace(/\.js$/, '');
    const prefix = fileToPrefix[baseName] || '';
    const content = fs.readFileSync(path.join(routesDir, f), 'utf8');
    const hasRouterAuth = content.includes('router.use(authenticate)');
    
    // Match route declarations
    const routeRegex = /router\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]\s*,([\s\S]*?)(?:async\s*)?\(/g;
    let rm;
    while ((rm = routeRegex.exec(content)) !== null) {
      const method = rm[1].toUpperCase();
      const subPath = rm[2];
      const fullPath = (prefix + (subPath === '/' ? '' : subPath)).replace(/\/+/g, '/');
      const middleSection = rm[3];

      const middlewares = [];
      if (hasRouterAuth) middlewares.push('router.use(authenticate)');
      if (middleSection.includes('authenticate')) middlewares.push('authenticate');
      if (middleSection.includes('requireAdmin')) middlewares.push('requireAdmin');
      if (middleSection.includes('requireAccounting')) middlewares.push('requireAccounting');
      if (middleSection.includes('checkProjectAccess')) middlewares.push('checkProjectAccess');
      if (middleSection.includes('checkPeriodLock')) middlewares.push('checkPeriodLock');
      if (middleSection.includes('upload')) middlewares.push('multer');
      if (middleSection.includes('loginLimiter')) middlewares.push('loginLimiter');

      let roleGuard = 'None (Public)';
      if (middlewares.includes('requireAdmin')) {
        roleGuard = 'admin';
      } else if (middlewares.includes('requireAccounting')) {
        roleGuard = 'admin, back_office, accounts';
      } else if (middlewares.includes('authenticate') || middlewares.includes('router.use(authenticate)')) {
        roleGuard = 'Authenticated User (All Roles)';
      }

      if (middlewares.includes('checkProjectAccess')) {
        roleGuard += ' [Scoped by Project/Assignment]';
      }

      allRoutes.push({
        method,
        fullPath,
        file: `server/routes/${f}`,
        middlewares: middlewares.join(', ') || 'None',
        roleGuard
      });
    }
  });

  console.log(`[1] BACKEND ROUTES INVENTORY: Found ${allRoutes.length} endpoints across ${routeFiles.length} files.`);

  // -------------------------------------------------------------
  // 2. DATABASE SCHEMA INVENTORY (TABLES, COLUMNS, CONSTRAINTS, INDEXES)
  // -------------------------------------------------------------
  const { rows: tableRows } = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);

  const { rows: colRows } = await pool.query(`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns 
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position;
  `);

  const { rows: fkRows } = await pool.query(`
    SELECT
      tc.table_name, 
      kcu.column_name, 
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name,
      rc.delete_rule,
      tc.constraint_name
    FROM 
      information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints AS rc
        ON rc.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
    ORDER BY tc.table_name, kcu.column_name;
  `);

  const { rows: idxRows } = await pool.query(`
    SELECT 
      tablename, 
      indexname, 
      indexdef 
    FROM pg_indexes 
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname;
  `);

  console.log(`[2] DATABASE INVENTORY:`);
  console.log(`    - Tables: ${tableRows.length}`);
  console.log(`    - Columns: ${colRows.length}`);
  console.log(`    - Foreign Keys: ${fkRows.length}`);
  console.log(`    - Indexes: ${idxRows.length}`);

  // -------------------------------------------------------------
  // 3. CLIENT API CALLS INVENTORY
  // -------------------------------------------------------------
  const clientSrcDir = path.join(__dirname, '..', 'client', 'src');
  function getAllFiles(dir, exts = ['.js', '.jsx', '.ts', '.tsx']) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        results = results.concat(getAllFiles(filePath, exts));
      } else {
        if (exts.some(ext => file.endsWith(ext))) results.push(filePath);
      }
    });
    return results;
  }

  const clientFiles = getAllFiles(clientSrcDir);
  const clientApiCalls = [];
  const apiCallRegex = /(?:api|axios)\.(get|post|put|patch|delete)\s*\(\s*[`'"]([^`'"]+)[`'"]/g;

  clientFiles.forEach(file => {
    const relPath = path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8');
    let cm;
    while ((cm = apiCallRegex.exec(content)) !== null) {
      clientApiCalls.push({
        file: relPath,
        method: cm[1].toUpperCase(),
        url: cm[2]
      });
    }
  });

  console.log(`[3] CLIENT API CALLS INVENTORY: Found ${clientApiCalls.length} API call expressions across ${clientFiles.length} files.`);

  // -------------------------------------------------------------
  // 4. PAGES, TABS, MODALS & BUTTONS INVENTORY
  // -------------------------------------------------------------
  const pagesDir = path.join(clientSrcDir, 'pages');
  const pageFiles = getAllFiles(pagesDir);
  const componentsDir = path.join(clientSrcDir, 'components');
  const componentFiles = getAllFiles(componentsDir);

  const modals = [];
  const buttons = [];
  const tabs = [];

  const allClientUiFiles = [...pageFiles, ...componentFiles];
  allClientUiFiles.forEach(file => {
    const relPath = path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8');

    // Modals
    if (file.toLowerCase().includes('modal') || content.includes('fixed inset-0') || content.includes('role="dialog"') || content.includes('className="modal"')) {
      modals.push(path.basename(file));
    }

    // Tabs
    const tabMatches = content.match(/(?:activeTab|selectedTab|currentTab|setActiveTab|setTab|tab ===)/g);
    if (tabMatches) {
      tabs.push({ file: relPath, occurrences: tabMatches.length });
    }

    // Buttons
    const buttonMatches = content.match(/<button\b[^>]*>/g);
    if (buttonMatches) {
      buttons.push({ file: relPath, count: buttonMatches.length });
    }
  });

  const totalButtons = buttons.reduce((acc, b) => acc + b.count, 0);
  console.log(`[4] CLIENT UI INVENTORY:`);
  console.log(`    - Pages: ${pageFiles.length}`);
  console.log(`    - Component Files: ${componentFiles.length}`);
  console.log(`    - Modals / Dialogs Identified: ${modals.length}`);
  console.log(`    - Files with Tab Switchers: ${tabs.length}`);
  console.log(`    - Total <button> Elements in JSX: ${totalButtons}`);

  // -------------------------------------------------------------
  // 5. BACKGROUND JOBS, TIMERS & DAEMONS
  // -------------------------------------------------------------
  const bgJobs = [];
  const serverFiles = getAllFiles(path.join(__dirname, '..', 'server'));
  serverFiles.forEach(file => {
    if (file.includes('node_modules')) return;
    const relPath = path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8');
    
    if (content.includes('setInterval') || content.includes('cron') || content.includes('node-cron')) {
      const intervals = content.match(/setInterval\s*\(([^,]+),\s*([^)]+)\)/g) || [];
      intervals.forEach(inv => {
        bgJobs.push({ file: relPath, invocation: inv.trim() });
      });
    }
  });

  console.log(`[5] BACKGROUND JOBS & DAEMONS: Found ${bgJobs.length} active recurring timers in backend.`);

  // Save full structured json for reference
  const fullData = {
    allRoutes,
    tables: tableRows.map(t => t.table_name),
    columnsCount: colRows.length,
    fks: fkRows,
    indexesCount: idxRows.length,
    clientApiCalls,
    modals,
    tabsCount: tabs.length,
    totalButtons,
    bgJobs
  };
  fs.writeFileSync(path.join(__dirname, 'inventory_data.json'), JSON.stringify(fullData, null, 2));
  console.log('\n✅ Detailed inventory data saved to scripts/inventory_data.json');
}

runInventory().catch(e => console.error(e)).finally(() => pool.end());
