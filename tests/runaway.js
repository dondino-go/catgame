/*
 * Running away, on a street with more than one road.
 *
 * A sideways flick off a bowl has one job: get the cat off that bowl, now.
 * It did it by aiming at the street's main road, which is right while a
 * street has only one -- and quietly wrong once it has two. A cat eating on
 * Lamplighter Block's back road was sent at the MAIN road, which the route
 * finder duly walked it to by way of the alley at the bottom of the block:
 * about fifteen seconds, with a neighbour watching, instead of one step onto
 * the tarmac beside it. Nothing looked broken. It just did not work.
 *
 * What this has to measure took two goes. The obvious check -- is the cat
 * near its own road a second later -- passes with the bug put back, because a
 * cat setting off DOWN the back road towards the alley is at much the same x
 * as one stepping ACROSS it. The two only part company in y. So the check is
 * that the cat is still level with the bowl: it went sideways, it did not set
 * off down the street. The same check runs on Marrow Street, where none of
 * this may have changed.
 *
 * Needs Playwright, so it is not part of tests/run.js. Run it directly:
 *   node tests/runaway.js
 */
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.log('Playwright not installed: skipping the run-away checks.'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'index.html') + '?debug&manual';
const BLOCK = require('./block.js');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } };

/* Sit the cat down at a bowl, flick sideways, and see where it goes. */
async function boltFrom(browser, street, houseId) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'en-GB' });
  if (street) await ctx.addInitScript(st => { window.__bbStreet = st; }, street);
  await ctx.addInitScript(() => { try { localStorage.setItem('bowlbandit.onboarded', 'true'); } catch (e) {} });
  const p = await ctx.newPage();
  await p.goto(URL);
  await p.evaluate(() => window.__bb.advance(0.5));
  await p.evaluate(() => { window.__bb.C.start(window.__bb.g); });
  /* nobody stirs, so nothing but the flick moves the cat */
  const quiet = () => p.evaluate(() => window.__bb.g.houses.forEach(h => { h.state = 'idle'; h.t = 9999; }));
  await quiet();
  /* put the cat on the bowl rather than walking it there, so the measurement
     starts from a known spot however far away the house is */
  await p.evaluate(id => {
    const bb = window.__bb, g = bb.g, h = g.houses[id], s = bb.C.bowlSpot(h);
    g.cat.x = s.x; g.cat.y = s.y; g.cat.target = null;
    bb.C.tapHouse(g, id);
  }, houseId);
  for (let i = 0; i < 60 && !(await p.evaluate(() => !!window.__bb.g.eat)); i++) { await quiet(); await p.evaluate(() => window.__bb.advance(1 / 60)); }
  const eating = await p.evaluate(() => !!window.__bb.g.eat);

  const bowl = await p.evaluate(id => { const s = window.__bb.C.bowlSpot(window.__bb.g.houses[id]); return { x: s.x, y: s.y }; }, houseId);
  await p.evaluate(() => window.__bb.bolt());
  /* a second of walking: long enough to be clear of the bowl, nowhere near
     long enough to get round a block */
  for (let i = 0; i < 60; i++) { await quiet(); await p.evaluate(() => window.__bb.advance(1 / 60)); }
  const cat = await p.evaluate(() => ({ x: window.__bb.g.cat.x, y: window.__bb.g.cat.y }));
  const run = await p.evaluate(id => window.__bb.g.routes.stretches[window.__bb.g.houses[id].run].roadX, houseId);
  await ctx.close();
  return { eating, bowl, cat, run, gone: Math.hypot(cat.x - bowl.x, cat.y - bowl.y) };
}

(async () => {
  const browser = await chromium.launch();

  console.log('\n=== RUNNING AWAY ON A STREET WITH TWO ROADS ===');
  {
    /* house 7 (The Ashfords) is on the back road, the far side of the block
       from the main one */
    const r = await boltFrom(browser, BLOCK, 7);
    ok(r.eating, 'the cat is eating on the back road to begin with');
    ok(r.gone > 0.1, 'a flick gets the cat off the bowl');
    ok(Math.abs(r.cat.x - r.run) <= 0.13 + 1e-6,
       'it runs onto the road the bowl is on (cat at x ' + r.cat.x.toFixed(2) + ', its road ' + r.run + ')');
    /* The one that catches it. Aimed at the main road, the cat sets off down
       the back road for the alley and is most of a row away within the
       second; aimed at its own road it steps across and stays level. */
    ok(Math.abs(r.cat.y - r.bowl.y) < 0.2,
       '... sideways, staying level with the bowl, rather than setting off down the block' +
       ' (moved ' + Math.abs(r.cat.y - r.bowl.y).toFixed(2) + ' rows)');
    ok((r.bowl.x < r.run) !== (r.cat.x < r.run),
       '... and across that road, away from the window that was watching');
  }

  console.log('\n=== AND NOTHING CHANGED ON A STREET WITH ONE ===');
  {
    for (const [name, id] of [['a left-hand bowl', 1], ['a right-hand bowl', 5]]) {
      const r = await boltFrom(browser, null, id);
      ok(r.eating && r.gone > 0.1, 'Marrow Street: a flick from ' + name + ' gets the cat off it');
      ok(Math.abs(r.cat.x - 0.5) <= 0.13 + 1e-6,
         '... onto the middle of the only road there is (x ' + r.cat.x.toFixed(2) + ')');
      /* the point of bolting is to cross to the other side of the road */
      ok((r.bowl.x < 0.5) !== (r.cat.x < 0.5) || Math.abs(r.cat.x - 0.5) < 1e-9,
         '... and across it, away from the window that was watching');
      ok(Math.abs(r.cat.y - r.bowl.y) < 0.2, '... staying level with the bowl, as it always did');
    }
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
