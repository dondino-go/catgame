/*
 * Reference screenshots: the safety net for the renderer.
 *
 * Renders the key screens of mobile.html in headless Chromium and compares
 * them with tests/screens/*.png. To make that repeatable the page runs in
 * ?manual mode, where the test steps frames itself (exactly 1/60s each)
 * instead of the browser's animation timer; Math.random is seeded, the game
 * font is preloaded and the build stamp is pinned. What is left is faint
 * anti-aliasing flicker, so a screen passes if no pixel differs by more than
 * NOISE out of 255. Marrow Street must keep looking the same through the
 * refactor; the lane-* scenes run the same renderer on a differently shaped
 * street (tests/streets.js). Mismatches go to tests/screens/out/.
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
const URL = 'file://' + path.join(ROOT, 'mobile.html') + '?debug&manual';
const NOISE = 48;
const VW = 390, VH = 844;

async function scene(browser, name, { onboarded = true, street, bests, setup }) {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1,
                                         locale: 'en-GB', timezoneId: 'Europe/London' });
  /* a scene can run on another street, handed to the page as data */
  if (street) await ctx.addInitScript(st => { window.__bbStreet = st; }, street);
  /* best scores already on the board, to open streets */
  if (bests) await ctx.addInitScript(b => { try { localStorage.setItem('bowlbandit.bests', JSON.stringify(b)); } catch (e) {} }, bests);
  await ctx.addInitScript(on => {
    let a = 12345;
    Math.random = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
    try { localStorage.setItem('bowlbandit.onboarded', on ? 'true' : 'false'); } catch (e) {}
    /* the stamp changes with every commit; pin it so screenshots don't */
    Object.defineProperty(window, 'BOWL_BUILD', {
      get: () => ({ time: '2026-01-01T12:00:00Z', branch: 'test' }), set: () => {} });
  }, onboarded);
  const p = await ctx.newPage();
  await p.goto(URL);
  /* a canvas only asks for a web font when it first draws with it, so load
     every weight the game uses up front, or a frame can catch the fallback */
  await p.evaluate(() => Promise.all([500, 600, 700, 800].map(w => document.fonts.load(w + " 40px 'Baloo 2'"))));
  await p.evaluate(() => window.__bb.advance(0.5));
  const R = await p.evaluate(() => { const c = document.getElementById('c').getBoundingClientRect(); return { x: c.left, y: c.top, w: c.width, h: c.height }; });
  const DH = R.h / R.w * 720;
  const api = {
    p, DH,
    tap: async (dx, dy) => { await p.mouse.click(R.x + dx / 720 * R.w, R.y + dy / DH * R.h); },
    run: ms => p.evaluate(s => window.__bb.advance(s), ms / 1000),
    row: r => 132 + (r + 0.5) * ((DH - 24 - 132) / 4),
    game: fn => p.evaluate(fn),
    /* where a row's centre is on screen, for the street the page is running */
    rowAt: async r => p.evaluate(([r, DH]) => { const rows = window.__bb.g.street.rows; return 132 + (r + 0.5) * ((DH - 24 - 132) / rows); }, [r, DH]),
    check: (what, cond) => CHECKS.push([name + ': ' + what, !!cond]),
  };
  if (setup) await setup(api);
  const png = await p.screenshot();
  await ctx.close();
  return png;
}

const CHECKS = [];
const TEST_LANE = require('./streets');
const TERRACE = require('../src/core.js').TERRACE_STREET;      // JSON-clean, so the page can be handed it as data
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
  /* Test Lane: another shape of street, drawn from its description. Also
     checks that taps land on the houses as drawn. */
  'lane-street': { street: TEST_LANE, setup: async a => {
    await a.tap(360, a.DH * 0.6 + 54); await a.run(3400); await a.game(QUIET); await a.run(300);
    const target = () => a.game(() => { const t = window.__bb.g.cat.target; return t ? t.house : 'none'; });
    const poke = async (x, row) => { await a.game(() => { window.__bb.g.cat.target = null; }); await a.tap(x, await a.rowAt(row)); return target(); };
    a.check('a tap on the left row-4 house goes to house 3 (Corner Shop)', await poke(80, 4) === 3);
    a.check('a tap on the right row-1 house goes to house 4 (The Hobbs)', await poke(640, 1) === 4);
    a.check('a tap on the right row-3 house goes to house 5 (Miss Vane)', await poke(640, 3) === 5);
    a.check('a tap beside where no house stands is a road tap', await poke(640, 0) === null);
    a.check('a tap in the left gap row is a road tap', await poke(80, 3) === null);
    await a.game(() => { window.__bb.g.cat.target = null; });
    await a.run(200);
  } },
  'lane-eating': { street: TEST_LANE, setup: async a => {
    await a.tap(360, a.DH * 0.6 + 54); await a.run(3400); await a.game(QUIET);
    await a.game(() => { window.__bb.C.tapHouse(window.__bb.g, 5); });
    await a.run(2600);
    /* house 5's neighbours: 4 up the road, 2 and 3 both across it */
    await a.game(() => { const g = window.__bb.g; g.eat.speed = 0; g.houses[4].state = 'stir'; g.houses[4].t = 9999; g.houses[3].state = 'watch'; g.houses[3].t = 9999; });
    await a.run(500);
  } },
  /* a taller street's results: the map must still fit the card and the button */
  'lane-results': { street: TEST_LANE, setup: async a => {
    await a.tap(360, a.DH * 0.6 + 54); await a.run(400);
    await a.game(() => { const g = window.__bb.g; g.score = 1520; g.bowlsCleared = 7; g.bites = 30; g.perfects = 9;
      g.misses = 2; g.timesCaught = 1; g.bestMult = 2; g.houses[2].angry = true; g.houses[2].bowl = null; g.timeLeft = 0.01; });
    await a.run(9000);
  } },
  /* Terrace Row: the pub shut (wave 1), then open and watching (wave 3), the
     close-up with the pub at one window, and the results with its map. */
  'terrace-street': { street: TERRACE, setup: async a => {
    await a.tap(360, a.DH * 0.6 + 54); await a.run(3400); await a.game(QUIET); await a.run(300);
  } },
  'terrace-pub-open': { street: TERRACE, setup: async a => {
    await a.tap(360, a.DH * 0.6 + 54); await a.run(3400);
    await a.game(() => { const g = window.__bb.g; g.waveIdx = 2; g.timeLeft = 120 - 2 * 30 - 1; g.dogTimer = 1e9; });
    await a.game(QUIET);
    const target = () => a.game(() => { const t = window.__bb.g.cat.target; return t ? t.house : 'none'; });
    const poke = async (x, row) => { await a.game(() => { window.__bb.g.cat.target = null; }); await a.tap(x, await a.rowAt(row)); return target(); };
    a.check('a tap on the pub is a road tap, not a house', await poke(640, 2) === null);
    a.check('a tap on the left row-2 house goes to house 2 (No. 5)', await poke(80, 2) === 2);
    await a.game(() => { const g = window.__bb.g; g.cat.target = null; g.houses[5].state = 'watch'; g.houses[5].t = 9999; });
    await a.run(800);
  } },
  'terrace-eating': { street: TERRACE, setup: async a => {
    await a.tap(360, a.DH * 0.6 + 54); await a.run(3400);
    await a.game(() => { const g = window.__bb.g; g.waveIdx = 2; g.timeLeft = 120 - 2 * 30 - 1; g.dogTimer = 1e9; });
    await a.game(QUIET);
    await a.game(() => { window.__bb.C.WAVES[2].react = 30; window.__bb.C.tapHouse(window.__bb.g, 2); });
    await a.run(2600);
    /* No. 5 is seen by No. 3 (up the terrace), No. 7 (down it) and the pub */
    await a.game(() => { const g = window.__bb.g; g.eat.speed = 0; g.houses[1].state = 'stir'; g.houses[1].t = 9999; g.houses[5].state = 'watch'; g.houses[5].t = 9999; });
    await a.run(500);
  } },
  'terrace-results': { street: TERRACE, setup: async a => {
    await a.tap(360, a.DH * 0.6 + 54); await a.run(400);
    await a.game(() => { const g = window.__bb.g; g.score = 1700; g.bowlsCleared = 7; g.bites = 30; g.perfects = 9;
      g.misses = 2; g.timesCaught = 1; g.bestMult = 2; g.houses[3].angry = true; g.houses[3].bowl = null; g.timeLeft = 0.01; });
    await a.run(9000);
  } },
  /* the title once Terrace Row is open: pick it, and the game is on it */
  'title-streets': { bests: { marrow: 1500, terrace: 640 }, setup: async a => {
    const row = i => a.DH * 0.45 + i * 98 + 42;
    await a.tap(360, row(1)); await a.run(100);
    a.check('tapping Terrace Row selects it', await a.game(() => window.__bb.g.street.id === 'terrace' && window.__bb.g.houses.length === 6));
    await a.tap(360, row(0)); await a.run(100);
    a.check('and tapping Marrow Street goes back', await a.game(() => window.__bb.g.street.id === 'marrow' && window.__bb.g.houses.length === 8));
    await a.tap(360, row(1)); await a.run(300);
  } },
  'title-locked': { bests: { marrow: 1399 }, setup: async a => {
    await a.tap(360, a.DH * 0.45 + 98 + 42); await a.run(100);
    a.check('a locked street cannot be picked, and the tap does not start a round', await a.game(() => window.__bb.g.street.id === 'marrow' && window.__bb.g.scene === 'title'));
  } },
  'results': { setup: async a => {
    await a.tap(360, a.DH * 0.6 + 54); await a.run(400);
    await a.game(() => { const g = window.__bb.g; g.score = 2480; g.bowlsCleared = 12; g.bites = 51; g.perfects = 20;
      g.misses = 3; g.timesCaught = 1; g.foxLosses = 2; g.bestMult = 2.5; g.houses[5].angry = true; g.houses[5].bowl = null; g.timeLeft = 0.01; });
    await a.run(9000);
  } },
};

/* how many pixels differ by more than NOISE in any channel */
async function countDiff(browser, a, b) {
  const page = await browser.newPage();
  const n = await page.evaluate(async ([a, b, noise]) => {
    const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return -1;
    const px = img => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
    const da = px(ia), db = px(ib);
    let off = 0;
    for (let i = 0; i < da.length; i += 4)
      if (Math.abs(da[i] - db[i]) > noise || Math.abs(da[i + 1] - db[i + 1]) > noise || Math.abs(da[i + 2] - db[i + 2]) > noise) off++;
    return off;
  }, ['data:image/png;base64,' + a.toString('base64'), 'data:image/png;base64,' + b.toString('base64'), NOISE]);
  await page.close();
  return n === -1 ? Infinity : n;
}

(async () => {
  const browser = await chromium.launch();
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  let fail = 0;
  console.log('\n=== REFERENCE SCREENSHOTS ===');
  const retried = [];
  for (const [name, opts] of Object.entries(SCENES)) {
    const mark = CHECKS.length;
    let png = await scene(browser, name, opts);
    const ref = path.join(REF, name + '.png');
    if (UPDATE || !fs.existsSync(ref)) { fs.writeFileSync(ref, png); console.log('  REC  ' + name); continue; }
    let off = await countDiff(browser, fs.readFileSync(ref), png);
    if (off !== 0) {
      /* Unchanged screens have failed by a few dozen pixels about one run in
         three (#21), and the cause isn't found. Render once more: a real
         change fails both times, a flake rarely does. The first render is
         kept so the flake can still be studied. */
      fs.writeFileSync(path.join(OUT, name + '.first.png'), png);
      const first = off;
      CHECKS.length = mark;                 // the retry runs the scene's own checks again
      png = await scene(browser, name, opts);
      off = await countDiff(browser, fs.readFileSync(ref), png);
      if (off === 0) {
        retried.push(name);
        console.log('  PASS ' + name + ' (needed a retry: the first render differed by ' + first + ' pixels, kept in tests/screens/out/' + name + '.first.png)');
        continue;
      }
    }
    if (off === 0) console.log('  PASS ' + name);
    else { fail++; fs.writeFileSync(path.join(OUT, name + '.png'), png);
           console.log('  FAIL ' + name + ': ' + off + ' pixels changed, on both renders (new render in tests/screens/out/)'); }
  }
  await browser.close();
  for (const [what, good] of CHECKS) { console.log('  ' + (good ? 'PASS ' : 'FAIL ') + what); if (!good) fail++; }
  if (retried.length) console.log('\n' + retried.length + ' screen(s) needed a retry: ' + retried.join(', ') + ' (see #21)');
  console.log(fail ? '\n' + fail + ' screen(s) changed' : '\nAll screens identical.');
  process.exit(fail ? 1 : 0);
})();
