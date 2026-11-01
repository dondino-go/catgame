/*
 * Picking up a new build: the part that can only be tested over HTTP.
 *
 * The game asks the server for the current build stamp whenever it is opened
 * or resumed, and reloads when it has changed. Those checks queue behind one
 * promise so two can't race into a needless wipe of the offline copy -- and
 * that queue is the dangerous bit. fetch has no timeout of its own, so one
 * stalled call used to leave the guard up for the life of the page, and every
 * later check did nothing at all. On iOS a home-screen app is resumed rather
 * than relaunched, so that page can live for days: a tester sat a build behind
 * with no way back but a force-quit, which is exactly what happened.
 *
 * So this serves the real page over http (the check is skipped on file://)
 * and makes the network misbehave.
 *
 *   node tests/update.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.log('Playwright not installed: skipping update checks.'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
                '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const CHECKS = [];
const check = (what, ok, detail) => CHECKS.push([what, !!ok, detail || '']);

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('no'); return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
                         'Cache-Control': 'no-cache' });
    res.end(fs.readFileSync(file));
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

/* Stand in for the network on the one request the check depends on, so the
   test can stall it, mend it, and offer a new build in turn. */
const STUB = () => {
  window.__stamps = [];
  window.__mode = 'hang';                       /* hang | ok | new */
  const real = window.fetch.bind(window);
  window.fetch = (u, o) => {
    const url = String(u && u.url ? u.url : u);
    if (url.includes('version.js')) {
      window.__stamps.push(url);
      if (window.__mode === 'hang') return new Promise(() => {});
      const t = window.__mode === 'new' ? '2099-01-01T00:00:00Z' : window.BOWL_BUILD.time;
      return Promise.resolve(new Response("window.BOWL_BUILD = { time: '" + t + "', branch: 'test' };"));
    }
    return real(u, o);
  };
};

(async () => {
  const server = await serve();
  const url = 'http://127.0.0.1:' + server.address().port + '/mobile.html?debug&manual';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(STUB);
  const p = await ctx.newPage();
  let navigations = 0;
  p.on('framenavigated', f => { if (f === p.mainFrame()) navigations++; });
  await p.goto(url);
  await p.waitForFunction(() => window.__bb && window.__bb.g);

  const asked = () => p.evaluate(() => window.__stamps.length);
  const fire = () => p.evaluate(() => { window.__bb.checkForUpdate(); });   /* may never settle */

  /* 1. the check runs at all over http */
  await fire();
  await p.waitForTimeout(500);
  check('the game asks the server for the build stamp', await asked() >= 1, (await asked()) + ' asked');

  /* 2. while one call is stalled, later checks are held back (no double wipe) */
  const during = await asked();
  await fire(); await fire();
  await p.waitForTimeout(500);
  check('checks queue behind the one in flight', await asked() === during, (await asked()) + ' asked');

  /* 3. ...but the queue lets go, so a stalled call can't disable it for good */
  await p.waitForTimeout(9000);                 /* past CHECK_TIMEOUT */
  /* a build without the escape hatch has no such handle: the behaviour check
     below is the one that matters, and it fails there either way */
  const held = await p.evaluate(() => typeof window.__bb.checking === 'function' ? window.__bb.checking() : null);
  if (held !== null) check('the guard clears after a stalled call', !held);
  await p.evaluate(() => { window.__mode = 'ok'; });
  await fire();
  await p.waitForTimeout(700);
  check('and it asks again once the network is back', await asked() > during, (await asked()) + ' asked');

  /* 4. the same stamp is not an update */
  check('the same build does not reload', navigations === 1, navigations + ' navigations');

  /* 5. a new stamp on the title screen reloads */
  await p.evaluate(() => { window.__mode = 'new'; });
  await fire();
  await p.waitForTimeout(3000);
  check('a new build reloads the title screen', navigations > 1, navigations + ' navigations');

  await browser.close();
  server.close();

  let bad = 0;
  for (const [what, ok, detail] of CHECKS) {
    console.log((ok ? '  PASS ' : '  FAIL ') + what + (detail ? '  (' + detail + ')' : ''));
    if (!ok) bad++;
  }
  console.log(bad ? '\n' + bad + ' failed.' : '\nThe update check survives a stalled network.');
  process.exit(bad ? 1 : 0);
})();
