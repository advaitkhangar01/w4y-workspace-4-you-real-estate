const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'server', 'routes');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

console.log('--- SCANNING ROUTE FILES FOR DUPLICATES & CONFLICTS ---');
files.forEach(file => {
  const code = fs.readFileSync(path.join(dir, file), 'utf8');
  const lines = code.split('\n');
  const routes = [];
  lines.forEach((l, idx) => {
    const m = l.match(/router\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"](.*)/);
    if (m) {
      routes.push({ line: idx + 1, method: m[1].toUpperCase(), path: m[2], rest: m[3] });
    }
  });

  // check duplicate routes in same file
  const seen = new Set();
  routes.forEach(r => {
    const key = r.method + ' ' + r.path;
    if (seen.has(key)) {
      console.log(`[DUPLICATE ROUTE] in ${file}: ${key} (line ${r.line})`);
    }
    seen.add(key);
  });

  // check route order collision (param before static)
  for (let i = 0; i < routes.length; i++) {
    const r1 = routes[i];
    if (r1.path.includes(':')) {
      const r1Segments = r1.path.split('/');
      for (let j = i + 1; j < routes.length; j++) {
        const r2 = routes[j];
        if (r1.method === r2.method) {
          const r2Segments = r2.path.split('/');
          if (r1Segments.length === r2Segments.length) {
            let matches = true;
            for (let k = 0; k < r1Segments.length; k++) {
              if (r1Segments[k].startsWith(':')) continue;
              if (r1Segments[k] !== r2Segments[k]) { matches = false; break; }
            }
            if (matches && !r2.path.includes(':')) {
              console.log(`[SHADOWED ROUTE] in ${file}: ${r1.method} ${r1.path} (line ${r1.line}) shadows ${r2.path} (line ${r2.line})`);
            }
          }
        }
      }
    }
  }
});
console.log('--- SCAN COMPLETED ---');
