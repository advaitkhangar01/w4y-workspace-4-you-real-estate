const d = require('./inventory_data.json');
const backend = d.allRoutes;
const client = d.clientApiCalls;

// Map client calls to regex
const clientPatterns = client.map(c => {
  let url = c.url.split('?')[0];
  // Replace ${anything} with regex segment
  url = url.replace(/\$\{[^}]+\}/g, '[^/]+');
  return { method: c.method, pattern: new RegExp('^' + url + '$'), raw: c.url };
});

const uncalled = [];
backend.forEach(be => {
  // Convert backend route with :param to regex
  const beRegexStr = '^' + be.fullPath.replace(/\/:\w+/g, '/[^/]+') + '$';
  const beRegex = new RegExp(beRegexStr);
  const beSubRegexStr = '^' + be.fullPath.replace(/^\/api/, '').replace(/\/:\w+/g, '/[^/]+') + '$';
  const beSubRegex = new RegExp(beSubRegexStr);

  const isCalled = clientPatterns.some(cp => {
    if (cp.method !== be.method) return false;
    // Check if client pattern matches backend path, or backend regex matches client raw url
    return cp.pattern.test(be.fullPath) || 
           cp.pattern.test(be.fullPath.replace(/^\/api/, '')) ||
           beRegex.test(cp.raw.split('?')[0].replace(/\$\{[^}]+\}/g, '123')) ||
           beSubRegex.test(cp.raw.split('?')[0].replace(/\$\{[^}]+\}/g, '123'));
  });
  if (!isCalled) uncalled.push(be);
});

console.log(`Backend endpoints not called directly by React client (${uncalled.length} of ${backend.length}):`);
uncalled.forEach(u => console.log(`  ${u.method.padEnd(6)} ${u.fullPath.padEnd(45)} (${u.file}) [${u.roleGuard}]`));
