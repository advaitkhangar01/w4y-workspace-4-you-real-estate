const fs = require('fs');
const path = require('path');

// 1. Mounts in server/index.js
const serverIndex = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.js'), 'utf8');
const mountRegex = /app\.use\(\s*['"]([^'"]+)['"]\s*,\s*([a-zA-Z0-9_]+)\s*\)/g;
const mounts = {};
let m;
while ((m = mountRegex.exec(serverIndex)) !== null) {
  mounts[m[2]] = m[1];
}

// Map variable names to route filenames
const requireRegex = /const\s+(?:{\s*router:\s*([a-zA-Z0-9_]+)[^}]*}|([a-zA-Z0-9_]+))\s*=\s*require\(['"]\.\/routes\/([^'"]+)['"]\)/g;
const varToFile = {};
while ((m = requireRegex.exec(serverIndex)) !== null) {
  const varName = m[1] || m[2];
  varToFile[varName] = m[3].replace(/\.js$/, '');
}

console.log('--- BACKEND MOUNTS ---');
const fileToPrefix = {};
for (const [varName, prefix] of Object.entries(mounts)) {
  const file = varToFile[varName];
  if (file) {
    fileToPrefix[file] = prefix;
    console.log(`Route file "${file}.js" mounted at "${prefix}"`);
  }
}

// 2. Extract all backend routes
const backendEndpoints = [];
const routesDir = path.join(__dirname, '..', 'server', 'routes');
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

files.forEach(f => {
  const baseName = f.replace(/\.js$/, '');
  const prefix = fileToPrefix[baseName] || '';
  if (!prefix) {
    console.warn(`WARNING: Route file "${f}" is NOT mounted in server/index.js!`);
  }
  const content = fs.readFileSync(path.join(routesDir, f), 'utf8');
  const routeRegex = /router\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]\s*,/g;
  let rm;
  while ((rm = routeRegex.exec(content)) !== null) {
    const fullPath = (prefix + (rm[2] === '/' ? '' : rm[2])).replace(/\/+/g, '/');
    backendEndpoints.push({
      method: rm[1].toUpperCase(),
      subPath: rm[2],
      fullPath,
      file: f,
      hasAuth: content.includes('router.use(authenticate)') || content.includes('authenticate,') || content.includes('authenticate ')
    });
  }
});

console.log(`\nTotal backend endpoints: ${backendEndpoints.length}`);

// 3. Scan frontend API calls
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

const frontendFiles = getAllFiles(clientSrcDir);
const frontendCalls = [];

const apiCallRegex = /(?:api|axios)\.(get|post|put|patch|delete)\s*\(\s*[`'"]([^`'"]+)[`'"]/g;

frontendFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = apiCallRegex.exec(content)) !== null) {
    frontendCalls.push({
      file: path.relative(path.join(__dirname, '..'), file),
      method: match[1].toUpperCase(),
      url: match[2]
    });
  }
});

console.log(`Total frontend API call expressions found: ${frontendCalls.length}`);

// Check for unhandled client calls
console.log('\n--- ANALYZING FRONTEND API CALLS ---');
const unmatched = [];
frontendCalls.forEach(call => {
  // Normalize url: remove query string, template literals like ${id}
  let cleanUrl = call.url.split('?')[0];
  // Replace template literals with :param
  cleanUrl = cleanUrl.replace(/\$\{[^}]+\}/g, ':param');
  
  // Try to match against backendEndpoints
  const matched = backendEndpoints.some(be => {
    if (be.method !== call.method) return false;
    
    // Convert backend fullPath to regex
    const regexPattern = '^' + be.fullPath
      .replace(/\/:\w+/g, '/[^/]+')
      .replace(/\//g, '\\/') + '$';
    const regex = new RegExp(regexPattern);
    
    // Convert client cleanUrl to regex testable
    const testUrl = cleanUrl.replace(/:param/g, 'any_param_123');
    return regex.test(testUrl) || regex.test('/api' + testUrl) || (be.fullPath === testUrl);
  });

  if (!matched) {
    unmatched.push(call);
  }
});

if (unmatched.length > 0) {
  console.log(`Potential unmatched client calls (${unmatched.length}):`);
  const uniqueUnmatched = {};
  unmatched.forEach(u => {
    const key = `${u.method} ${u.url}`;
    if (!uniqueUnmatched[key]) uniqueUnmatched[key] = [];
    uniqueUnmatched[key].push(u.file);
  });
  for (const [call, files] of Object.entries(uniqueUnmatched)) {
    console.log(`  ${call} (used in: ${files.slice(0, 2).join(', ')}${files.length > 2 ? ' ...' : ''})`);
  }
} else {
  console.log('✅ All frontend API calls appear to match backend routes!');
}
