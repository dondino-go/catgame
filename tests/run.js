/* Run every suite and summarise. Usage: node tests/run.js */
const { execFileSync } = require('child_process');
const path = require('path');

const BOLD = '\u001b[1m', OFF = '\u001b[0m';
const suites = ['core.test.js', 'golden.test.js', 'behaviour.test.js', 'geometry.test.js', 'layout.test.js'];
let failed = 0;

for (const f of suites) {
  console.log('\n' + BOLD + '> ' + f + OFF);
  try { execFileSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' }); }
  catch (e) { failed++; }
}

console.log(failed ? '\nFAILED: ' + failed + ' suite(s)' : '\nAll suites passed.');
process.exit(failed ? 1 : 0);
