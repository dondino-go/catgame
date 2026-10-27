/*
 * Reference screenshots: the safety net for the renderer.
 *
 * Renders the key screens of mobile.html in headless Chromium with the clock
 * frozen and Math.random seeded, so each frame comes out byte-for-byte the
 * same, and compares them with tests/screens/*.png. While the street drawing
 * is being made data-driven, Marrow Street must keep looking exactly the
 * same. Mismatches are written to tests/screens/out/ to look at.
 *
 *   node tests/screens.js            compare
 *   node tests/screens.js --update   re-record (only when a visual change is intended)
 *
 * Needs Playwright with Chromium, so it is not part of tests/run.js.
 */
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.log('Playwright not installed: skipping screenshot checks.'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const REF = path.join(__dirname, 'screens');
const OUT = path.join(REF, 'out');
const UPDATE = process.argv.includes('--update');
const URL = 'file://' + path.join(ROOT, 'mobile.html') + '?debug';
const VW = 390, VH = 844;

async function scene(browser, name, { onboarded = true, setup }) {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1,
                                         locale: 'en-GB', timezoneId: 'Europe/London' });
  await ctx.addInitScript(on => {
    let a = 12345;
    Math.random = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
    try { localStorage.setItem('bowlbandit.onboarded', on ? 'true' : 'false'); } catch (e) {}
  }, onboarded);
  const p = await ctx.newPage();
  /* installed AND paused: time moves only when the test says so */
  await p.clock.install({ time: new Date('2026-01-01T12:00:00Z') });
  await p.clock.pauseAt(new Date('2026-01-01T12:00:01Z'));
  await p.goto(URL);
  /* a canvas only asks for a web font when it first draws with it, so load
     every weight the game uses up front, or a frame can catch the fallback */
  await p.evaluate(() => Promise.all([500, 600, 700, 800].map(w => document.fonts.load(w + " 40px 'Baloo 2'"))));
  await p.clock.runFor(500);
  const R = await p.evaluate(() => { const c = document.getElementById('c').getBoundingClientRect(); return { x: c.left, y: c.top, w: c.width, h: c.height }; });
  const DH = R.h / R.w * 720;
  const api = {
    p, DH,
    tap: async (dx, dy) => { await p.mouse.click(R.x + dx / 720 * R.w, R.y + dy / DH * R.h); },
    run: ms => p.clock.runFor(ms),
    row: r => 132 + (r + 0.5) * ((DH - 24 - 132) / 4),
    game: fn => p.evaluate(fn),
  };
  if (setup) await setup(api);
  const png = await p.screenshot();
  await ctx.close();
  return png;
}

const QUIET = () => { const g = window.__bb.g; g.houses.forEach(h => { h.state = 'idle'; h.t = 9999; }); };
const SCENES = {
  'title': {},
  'practice-tap': { onboarded: false, setup: async a => { await a.tap(360, a.DH * 0.6 + 54); await a.run(600); } },
  'street': { setup: async a => { await a.tap(360, a.DH * 0.6 + 54); await a.run(3400); await a.game(QUIET); await a.run(300); } },
  'eating-stir': { setup: async a => {
    await a.tap(360, a.DH * 0.6 + 54); await a.run(3400); await a.game(QUIET);
    await a.tap(80, a.row(2)); await a.run(1600);
    await a.game(() => { const g = window.__bb.g; g.eat.speed = 0; const n = g.houses[g.eat.h.neighbours[0]]; n.state = 'stir'; n.t = 9999; });
    await a.run(700);
  } },
  'eating-seen': { setup: async a => {
    await a.tap(360, a.DH * 0.6 + 54); await a.run(3400); await a.game(QUIET);
    await a.game(() => { window.__bb.C.WAVES[0].react = 30; });
    await a.tap(80, a.row(2)); await a.run(1600);
    await a.game(() => { const g = window.__bb.g; g.eat.speed = 0; const n = g.houses[g.eat.h.neighbours[1]]; n.state = 'watch'; n.t = 9999; });
    await a.run(400);
  } },
  'results': { setup: async a => {
    await a.tap(360, a.DH * 0.6 + 54); await a.run(400);
    await a.game(() => { const g = window.__bb.g; g.score = 2480; g.bowlsCleared = 12; g.bites = 51; g.perfects = 20;
      g.misses = 3; g.timesCaught = 1; g.foxLosses = 2; g.bestMult = 2.5; g.houses[5].angry = true; g.houses[5].bowl = null; g.timeLeft = 0.01; });
    await a.run(9000);
  } },
};

(async () => {
  const browser = await chromium.launch();
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  let fail = 0;
  console.log('\n=== REFERENCE SCREENSHOTS ===');
  for (const [name, opts] of Object.entries(SCENES)) {
    const png = await scene(browser, name, opts);
    const ref = path.join(REF, name + '.png');
    if (UPDATE || !fs.existsSync(ref)) { fs.writeFileSync(ref, png); console.log('  REC  ' + name); continue; }
    if (png.equals(fs.readFileSync(ref))) console.log('  PASS ' + name);
    else { fail++; fs.writeFileSync(path.join(OUT, name + '.png'), png); console.log('  FAIL ' + name + ' (new render in tests/screens/out/)'); }
  }
  await browser.close();
  console.log(fail ? '\n' + fail + ' screen(s) changed' : '\nAll screens identical.');
  process.exit(fail ? 1 : 0);
})();
