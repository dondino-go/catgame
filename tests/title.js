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
 * THE LAB is swept the same way. It is not a screen of its own -- it is this
 * screen with the lab's streets in place of the picker's rows -- so the same
 * sweep is the whole of its layout guard, and the door that opens it is one
 * more row to fit. The door is counted as a row here for exactly that reason:
 * when a third street or a second lab street makes the block too tall, this
 * is what says so.
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
  r.rows.forEach((b, i) => out.push(['row ' + (i + 1), b]));
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
  await p.goto('file://' + path.join(ROOT, 'index.html') + '?debug&manual');
  await p.evaluate(() => window.__bb.advance(0.5));

  const streets = await p.evaluate(() => window.__bb.C.STREETS.length);
  const first = await p.evaluate(() => window.__bb.titleRects());
  console.log('Title screen, ' + streets + ' street(s), ' + first.picker.length + ' picker row(s), ' +
              (first.lab ? 'a door to the lab' : 'no lab') + '\n');
  if (first.picker.length < 2) { console.log('FAIL: the picker is not showing, so this test proves nothing'); await browser.close(); process.exit(1); }
  if (!first.lab) { console.log('FAIL: the lab door is not showing, so the lab half of this test proves nothing'); await browser.close(); process.exit(1); }

  /* Click the middle of one of the title screen's own rects, read off the live
     canvas and the live layout so nothing can be stale by the time we click. */
  const tap = async pick => {
    const s = await p.evaluate(pick => {
      const c = document.getElementById('c').getBoundingClientRect();
      const r = window.__bb.titleRects();
      const b = typeof pick === 'number' ? r.rows[pick] : r[pick];
      return { x: c.left + c.width * ((b.x + b.w / 2) / 720), y: c.top + c.height * ((b.y + b.h / 2) / r.DH) };
    }, pick);
    await p.mouse.click(s.x, s.y);
    await p.evaluate(() => window.__bb.advance(0.3));
  };

  async function sweep(what) {
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
    console.log(bad ? '\n' + bad + ' of ' + shapes + ' phone shapes fail on ' + what + '.'
                    : 'All ' + shapes + ' phone shapes lay out cleanly on ' + what + '.');
    return bad;
  }

  let bad = await sweep('the title screen');

  /* The lab: the door opens it, and it is swept exactly like the title. */
  let labBad = 0;
  await p.setViewportSize({ width: VW, height: 610 });
  await settle(p);
  const mainStreet = await p.evaluate(() => window.__bb.g.street.id);
  await tap('lab');
  const opened = await p.evaluate(() => ({ open: window.__bb.titleRects().labOpen, street: window.__bb.g.street.id,
                                           scene: window.__bb.g.scene, rows: window.__bb.titleRects().rows.length }));
  const doorOk = opened.open && opened.street !== mainStreet && opened.scene === 'title';
  if (!doorOk) labBad++;
  console.log('\n  ' + (doorOk ? 'PASS' : 'FAIL') + ': the door opens the lab onto one of its streets' +
              ' (open=' + opened.open + ', street=' + opened.street + ', scene=' + opened.scene + ')');

  bad += await sweep('the lab');

  /* BACK puts the streets, and the street that was chosen, back. */
  await p.setViewportSize({ width: VW, height: 610 });
  await settle(p);
  await tap('how');
  const closed = await p.evaluate(() => ({ open: window.__bb.titleRects().labOpen, street: window.__bb.g.street.id }));
  const backOk = !closed.open && closed.street === mainStreet;
  if (!backOk) labBad++;
  console.log('  ' + (backOk ? 'PASS' : 'FAIL') + ': BACK leaves the lab and restores ' + mainStreet +
              ' (open=' + closed.open + ', street=' + closed.street + ')');

  /* And PLAY in the lab plays the lab's street, not the one behind it. */
  await tap('lab');
  await tap('play');
  const playing = await p.evaluate(() => ({ scene: window.__bb.g.scene, street: window.__bb.g.street.id }));
  const playOk = playing.scene === 'play' && playing.street !== mainStreet;
  if (!playOk) labBad++;
  console.log('  ' + (playOk ? 'PASS' : 'FAIL') + ': PLAY in the lab starts a round on the lab street' +
              ' (scene=' + playing.scene + ', street=' + playing.street + ')');
  /* Two separate guards keep the lab out of the next launch, so they get a
     check each: one sweep that reverted either on its own would still have
     passed, because the other covered for it. */
  /* stored as JSON (saveJSON), so it comes back quoted: parse it rather than
     comparing the raw text, or this reads every value as a mismatch and fails
     whatever the game does. */
  const stored = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('bowlbandit.street')); } catch (e) { return null; } });
  const storeOk = stored === mainStreet;
  if (!storeOk) labBad++;
  console.log('  ' + (storeOk ? 'PASS' : 'FAIL') + ': playing a lab street does not make it the remembered street' +
              ' (stored=' + stored + ')');

  /* ...and if one is remembered anyway -- stored before the street moved into
     the lab -- the game still opens on a street that is finished. */
  await p.evaluate(() => { try { localStorage.setItem('bowlbandit.street', JSON.stringify('block')); } catch (e) {} });
  await p.reload();
  await p.evaluate(() => window.__bb.advance(0.5));
  const booted = await p.evaluate(() => ({ street: window.__bb.g.street.id, open: window.__bb.titleRects().labOpen }));
  const bootOk = booted.street === mainStreet && !booted.open;
  if (!bootOk) labBad++;
  console.log('  ' + (bootOk ? 'PASS' : 'FAIL') + ': a lab street remembered from an older build is not opened on' +
              ' (street=' + booted.street + ', lab open=' + booted.open + ')');

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
  process.exit(bad || tapsBad || labBad ? 1 : 0);
})();
