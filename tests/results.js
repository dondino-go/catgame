/*
 * The results screen has to fit, on every phone.
 *
 * How much it has to say varies: the card grows a line for every kind of
 * trouble the round had, and NEW BEST and NEW STREET only appear after a good
 * one. A playtest on an iPhone found the worst case stacked TAP TO PROWL
 * AGAIN on top of both banners, because the prompt was pulled up to fit
 * rather than the layout being measured.
 *
 * So: set up the worst case the game can produce -- every stat line, a new
 * best, a new street, and a street choice to offer -- and measure it at every
 * phone shape the renderer allows (the aspect is clamped to 0.42..0.64, which
 * is DH 1125..1714). Nothing may overlap anything, and nothing may be drawn
 * off the bottom.
 *
 *   node tests/results.js
 */
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.log('Playwright not installed: skipping results layout checks.'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const VW = 390;
const STEP = 10;                       /* viewport heights to try, in CSS px */

/* Record the box of every line of text, in design units. A full-canvas opaque
   fill wipes what came before it, so the street under the results background
   doesn't count as something the player can see. */
const RECORD = () => {
  window.__drawn = [];
  const proto = CanvasRenderingContext2D.prototype;
  const fill = proto.fillRect;
  proto.fillRect = function (x, y, w, h) {
    try {
      const m = this.getTransform();
      if (x <= 0 && y <= 0 && w >= this.canvas.width / m.a && h >= this.canvas.height / m.d &&
          this.globalAlpha > 0.98) window.__drawn.length = 0;
    } catch (e) {}
    return fill.apply(this, arguments);
  };
  for (const name of ['fillText', 'strokeText']) {
    const real = proto[name];
    proto[name] = function (str, x, y) {
      try {
        if (window.__bb && window.__bb.g.scene === 'over' && this.globalAlpha > 0.05) {
          const m = this.getTransform();
          const per = this.canvas.width / 720;             /* device px per design unit */
          const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(this.font)[1]);
          const w = this.measureText(String(str)).width;
          const lx = this.textAlign === 'center' ? x - w / 2 : this.textAlign === 'right' ? x - w : x;
          window.__drawn.push({
            str: String(str),
            x: (m.a * lx + m.e) / per, w: (m.a * w) / per,
            y: (m.d * y + m.f) / per, h: (m.d * size) / per,
          });
        }
      } catch (e) {}
      return real.apply(this, arguments);
    };
  }
};

/* one box per line: the fill and the stroke of the same line are one */
function boxes(drawn) {
  const seen = new Map();
  for (const d of drawn) seen.set(d.str + '@' + Math.round(d.y), d);
  return [...seen.values()]
    .map(d => ({ str: d.str, top: d.y - d.h / 2, bot: d.y + d.h / 2, l: d.x, r: d.x + d.w }))
    .sort((a, b) => a.top - b.top);
}

function overlaps(B) {
  const out = [];
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
    const a = B[i], c = B[j];
    if (c.top < a.bot - 1 && c.l < a.r - 1 && a.l < c.r - 1) out.push('"' + a.str + '" x "' + c.str + '"');
  }
  return out;
}

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: VW, height: 844 }, deviceScaleFactor: 2 });
  await p.addInitScript(RECORD);
  await p.addInitScript(() => { try { localStorage.setItem('bowlbandit.onboarded', 'true'); } catch (e) {} });
  await p.goto('file://' + path.join(ROOT, 'mobile.html') + '?debug&manual');
  await p.waitForFunction(() => window.__bb && window.__bb.g);
  await p.evaluate(() => Promise.all([500, 600, 700, 800].map(w => document.fonts.load(w + " 40px 'Baloo 2'"))));
  await p.evaluate(() => window.__bb.advance(0.5));

  /* start a round, then give it every kind of trouble and run the clock out,
     so the real end-of-round path decides the best and the unlock */
  const box = await p.evaluate(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { h: r.height, w: r.width, top: r.top }; });
  const DH0 = 720 * (box.h / box.w);
  await p.mouse.click(VW / 2, box.top + (DH0 * 0.6 + 54) * (box.h / DH0));
  await p.evaluate(() => window.__bb.advance(1));
  await p.evaluate(() => {
    const g = window.__bb.g;
    g.score = 760; g.bites = 26; g.perfects = 9; g.misses = 3;
    g.timesCaught = 2; g.foxLosses = 1; g.bestMult = 4; g.timeLeft = 0.02;
  });
  for (let i = 0; i < 400 && !(await p.evaluate(() => window.__bb.g.scene === 'over')); i++) {
    await p.evaluate(() => window.__bb.advance(0.1));
  }
  if (await p.evaluate(() => window.__bb.g.scene) !== 'over') {
    console.log('FAIL: never reached the results screen'); await browser.close(); process.exit(1);
  }
  await p.evaluate(() => window.__bb.advance(3));          /* past OVER_LOCK, so the prompt is up */

  let shapes = 0, bad = 0;
  for (let vh = 610; vh <= 930; vh += STEP) {
    await p.setViewportSize({ width: VW, height: vh });
    await p.evaluate(() => { window.dispatchEvent(new Event('resize')); window.__drawn.length = 0; });
    await p.evaluate(() => window.__bb.advance(1 / 60));
    const DH = await p.evaluate(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return 720 * r.height / r.width; });
    const B = boxes(await p.evaluate(() => window.__drawn));
    shapes++;

    const clash = overlaps(B);
    const off = B.filter(b => b.bot > DH + 1 || b.top < -1).map(b => '"' + b.str + '"');
    if (clash.length || off.length || B.length < 10) {
      bad++;
      console.log('  FAIL DH=' + DH.toFixed(0) +
        (clash.length ? '  overlapping: ' + clash.join(', ') : '') +
        (off.length ? '  off screen: ' + off.join(', ') : '') +
        (B.length < 10 ? '  only ' + B.length + ' lines drawn' : ''));
    }
  }
  await browser.close();
  console.log(bad ? '\n' + bad + ' of ' + shapes + ' phone shapes fail.'
                  : '\nResults screen fits on all ' + shapes + ' phone shapes.');
  process.exit(bad ? 1 : 0);
})();
