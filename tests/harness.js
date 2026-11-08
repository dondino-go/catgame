/*
 * Assertions for the Node suites: they load this for the global ok() and
 * report(). (It used to also load the legacy desktop game's index.html into a
 * stubbed browser; that game and its suites are gone -- see #10 -- and the
 * original is kept on the legacy-desktop branch.)
 */
let pass = 0, fail = 0;
global.ok = (cond, msg) => {
  if (cond) { pass++; console.log('  PASS ' + msg); }
  else      { fail++; console.log('  FAIL ' + msg); }
};
global.report = () => {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
};
