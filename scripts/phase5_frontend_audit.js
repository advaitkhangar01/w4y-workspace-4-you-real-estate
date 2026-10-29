// scripts/phase5_frontend_audit.js
// Read-only inspection of client-side architecture, route guards, state management, and exports for Phase 5

const fs = require('fs');
const path = require('path');

async function runPhase5Audit() {
  console.log('================================================================');
  console.log('         PHASE 5: FRONTEND, ROLE & UI INTEGRITY AUDIT           ');
  console.log('================================================================\n');

  const clientSrc = path.join(__dirname, '..', 'client', 'src');

  // -------------------------------------------------------------
  // 1. ROUTE GUARDS & ROLE REDIRECTION AUDIT (App.jsx)
  // -------------------------------------------------------------
  console.log('--- 1. Auditing App.jsx Route Guards & ProtectedRoute ---');
  const appJsx = fs.readFileSync(path.join(clientSrc, 'App.jsx'), 'utf8');

  // Extract ProtectedRoute code
  const prMatch = appJsx.match(/function ProtectedRoute\(\{[\s\S]*?^}/m);
  if (prMatch) {
    console.log('ProtectedRoute snippet:');
    console.log(prMatch[0]);
  }

  // -------------------------------------------------------------
  // 2. TOKEN EXPIRATION & API INTERCEPTOR AUDIT (api/client.js)
  // -------------------------------------------------------------
  console.log('\n--- 2. Auditing Axios Interceptors & Token Expiration ---');
  const apiIndex = fs.readFileSync(path.join(clientSrc, 'api', 'client.js'), 'utf8');
  console.log('Axios interceptor snippet:');
  console.log(apiIndex);

  // -------------------------------------------------------------
  // 3. DOUBLE-SUBMIT & BUTTON DISABLED STATE AUDIT
  // -------------------------------------------------------------
  console.log('\n--- 3. Auditing Double-Submit Prevention Across Modals & Pages ---');
  function getAllFiles(dir, exts = ['.jsx']) {
    let results = [];
    fs.readdirSync(dir).forEach(file => {
      const p = path.join(dir, file);
      if (fs.statSync(p).isDirectory()) results = results.concat(getAllFiles(p, exts));
      else if (exts.some(e => file.endsWith(e))) results.push(p);
    });
    return results;
  }

  const allJsx = getAllFiles(clientSrc);
  const formsWithoutDisabled = [];

  allJsx.forEach(file => {
    const rel = path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8');
    
    // Look for submit buttons in forms
    const submitBtnMatches = [...content.matchAll(/<button\b[^>]*type=["']submit["'][^>]*>/g)];
    submitBtnMatches.forEach(btn => {
      const btnTag = btn[0];
      if (!btnTag.includes('disabled') && !btnTag.includes('loading') && !btnTag.includes('isSubmitting') && !btnTag.includes('saving')) {
        formsWithoutDisabled.push({ file: rel, button: btnTag });
      }
    });
  });

  console.log(`Found ${formsWithoutDisabled.length} submit buttons without explicit disabled/loading protection.`);
  formsWithoutDisabled.slice(0, 10).forEach(f => console.log(`  ${f.file}: ${f.button}`));

  // -------------------------------------------------------------
  // 4. EXCEL EXPORT (SheetJS) AUDIT
  // -------------------------------------------------------------
  console.log('\n--- 4. Auditing SheetJS / Excel Export Logic ---');
  const excelExports = [];
  allJsx.forEach(file => {
    const rel = path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8');
    
    if (content.includes('XLSX') || content.includes('writeFile') || content.includes('book_new')) {
      const exportCalls = [...content.matchAll(/(?:XLSX\.writeFile|writeFile)\s*\(\s*[^,]+,\s*['"`]([^'"`]+)['"`]/g)];
      exportCalls.forEach(ec => {
        excelExports.push({ file: rel, fileName: ec[1] });
      });
    }
  });

  console.log(`Identified ${excelExports.length} Excel export routines:`);
  excelExports.forEach(e => console.log(`  ${e.file} -> File: "${e.fileName}"`));

  // -------------------------------------------------------------
  // 5. SIGNATURE PAD CANVAS AUDIT (InvoicePage.jsx)
  // -------------------------------------------------------------
  console.log('\n--- 5. Auditing Signature Pad Implementation (InvoicePage.jsx) ---');
  const invoicePage = fs.readFileSync(path.join(clientSrc, 'pages', 'admin', 'InvoicePage.jsx'), 'utf8');
  const hasCanvasTouchEvents = invoicePage.includes('onTouchStart') || invoicePage.includes('touchstart');
  const hasCanvasMouseEvents = invoicePage.includes('onMouseDown') || invoicePage.includes('mousedown');
  console.log(`Canvas Mouse Event Listeners: ${hasCanvasMouseEvents ? 'YES' : '❌ NO'}`);
  console.log(`Canvas Touch Event Listeners (Mobile/Tablet): ${hasCanvasTouchEvents ? 'YES' : '❌ NO'}`);

  // -------------------------------------------------------------
  // 6. REACT KEY PROP & LIST RENDERING AUDIT
  // -------------------------------------------------------------
  console.log('\n--- 6. Auditing Array Map Keys for Index as Key ---');
  let indexAsKeyCount = 0;
  allJsx.forEach(file => {
    const rel = path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8');
    const indexKeys = content.match(/key=\{(?:index|idx|i)\}/g);
    if (indexKeys) {
      indexAsKeyCount += indexKeys.length;
    }
  });
  console.log(`Found ${indexAsKeyCount} instances of key={index|idx|i} in dynamic list maps.`);
}

runPhase5Audit().catch(err => console.error(err));
