/*
 * The title screen has to fit, on every phone -- and PLAY has to start a round
 * wherever you tap it.
 *
 * A code review of the Terrace Row work found that the street picker sat at a
 * fixed DH*0.45 while PLAY sat at DH*0.6, so at the widest aspect the renderer
 * allows (any desktop or tablet window) the last picker row lay under the top
 * of PLAY. onDown tests the picker first, so tapping there silently
 * re-selected a street instead of starting a round -- no feedback, nothing
 * happens.
 *
 * So: open every street, and at every phone shape (the aspect is clamped to
 * 0.42..0.64, which is DH 1125..1714) check that nothing on the title screen
 * overlaps anything else. Then, at the shape that used to break, tap the very
 * top of PLAY and check a round actually starts.
 *
 *   node tests/title.js
 */
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.log('Playwright not installed: skipping title layout checks.'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const VW = 390;
const STEP = 10;                       /* viewport heights to try, in CSS px */

/* setViewportSize returns before the page has relaid out, so the canvas can
   still report its old size. Measuring or clicking through a stale rect maps
   design units to the wrong place -- it made this test fail about one run in
   five. Wait for the canvas to match the window, then step a frame. */
const settle = async p => {
  await p.waitForFunction(() => {
    const c = document.getElementById('c').getBoundingClientRect();
    return Math.abs(c.width - window.innerWidth) < 1.5 && Math.abs(c.height - window.innerHeight) < 1.5;
  });
  await p.evaluate(() => window.__bb.advance(1 / 60));
};

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/* Everything on the title screen that a tap or an eye could collide with. */
function boxes(r) {
  const out = [['the tagline', r.tagline], ['PLAY', r.play], ['How to play', r.how], ['the build stamp', r.build]];
  r.picker.forEach((p, i) => out.push(['street row ' + (i + 1), p]));
  return out;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: VW, height: 844 }, deviceScaleFactor: 1,
                                         locale: 'en-GB', timezoneId: 'Europe/London' });
  /* past the first-launch lesson, with every street open: the most the title
     screen ever has to show */
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('bowlbandit.onboarded', 'true');
      localStorage.setItem('bowlbandit.bests', JSON.stringify({ marrow: 1500, terrace: 640 }));
    } catch (e) {}
  });
  const p = await ctx.newPage();
  await p.goto('file://' + path.join(ROOT, 'mobile.html') + '?debug&manual');
  await p.evaluate(() => window.__bb.advance(0.5));

  const streets = await p.evaluate(() => window.__bb.C.STREETS.length);
  const picker = await p.evaluate(() => window.__bb.titleRects().picker.length);
  console.log('Title screen, ' + streets + ' street(s), ' + picker + ' picker row(s)\n');
  if (picker < 2) { console.log('FAIL: the picker is not showing, so this test proves nothing'); await browser.close(); process.exit(1); }

  let bad = 0, shapes = 0;
  for (let vh = 610; vh <= 930; vh += STEP) {
    await p.setViewportSize({ width: VW, height: vh });
    await settle(p);
    const r = await p.evaluate(() => window.__bb.titleRects());
    const B = boxes(r);
    shapes++;
    const hits = [];
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
      if (overlap(B[i][1], B[j][1])) hits.push(B[i][0] + ' overlaps ' + B[j][0]);
    }
    for (const [name, b] of B) {
      if (b.y < 0) hits.push(name + ' is off the top');
      if (b.y + b.h > r.DH) hits.push(name + ' is off the bottom');
    }
    if (hits.length) { bad++; console.log('  FAIL DH=' + r.DH.toFixed(0) + ': ' + hits.join('; ')); }
  }
  console.log(bad ? '\n' + bad + ' of ' + shapes + ' phone shapes fail.'
                  : 'All ' + shapes + ' phone shapes lay out cleanly.');

  /* The symptom itself, at the shape that used to break: the top edge of PLAY
     must start a round, not re-select a street. */
  let tapsBad = 0;
  await p.setViewportSize({ width: VW, height: 610 });
  await settle(p);
  /* where, in CSS pixels, a point on PLAY is right now: taken from the live
     canvas and the live rect, so nothing can be stale by the time we click */
  const spot = where => p.evaluate(w => {
    const c = document.getElementById('c').getBoundingClientRect();
    const r = window.__bb.titleRects();
    const dy = w === 'top' ? r.play.y + 3 : w === 'bottom' ? r.play.y + r.play.h - 3 : r.play.y + r.play.h / 2;
    return { x: c.left + c.width / 2, y: c.top + dy / r.DH * c.height, dy };
  }, where);
  for (const what of ['top', 'middle', 'bottom']) {
    await p.evaluate(() => { window.__bb.C.toTitle(window.__bb.g); });
    await p.evaluate(() => window.__bb.advance(1 / 60));
    const s = await spot(what);
    await p.mouse.click(s.x, s.y);
    await p.evaluate(() => window.__bb.advance(0.3));
    const scene = await p.evaluate(() => window.__bb.g.scene);
    const ok = scene === 'play';
    if (!ok) tapsBad++;
    console.log('  ' + (ok ? 'PASS' : 'FAIL') + ': tapping PLAY at its ' + what +
                ' (design y ' + s.dy.toFixed(0) + ') starts a round (scene=' + scene + ')');
  }

  await browser.close();
  process.exit(bad || tapsBad ? 1 : 0);
})();
