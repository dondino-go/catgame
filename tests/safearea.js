/*
 * Does the game stay inside a phone's safe area?
 *
 * A playtest on an iPhone 15 found the timer hidden behind the Dynamic
 * Island: fit() measured #stage with getBoundingClientRect(), which includes
 * the safe-area padding, so the canvas was sized to the whole screen and
 * overflowed the insets at both ends.
 *
 * Chromium doesn't emulate env(safe-area-inset-*), so this stands in for it by
 * putting the same values on #stage as padding -- which is what the CSS does
 * on a real phone. The HUD checks read the positions the game actually drew
 * at (fillText and strokeText are recorded, with the transform in force), so
 * that text creeping back under the island fails here even if the canvas
 * itself is placed correctly.
 *
 *   node tests/safearea.js
 */
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.log('Playwright not installed: skipping safe-area checks.'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const PHONES = [
  /* portrait iPhone 15 Pro: 59pt of status bar and island, 34pt of home indicator */
  { name: 'iPhone 15 Pro', w: 393, h: 852, top: 59, bottom: 34 },
  { name: 'iPhone SE (no island)', w: 375, h: 667, top: 0, bottom: 0 },
];

/* Record every piece of text the game draws, in CSS pixels down the page.
   textBaseline is 'middle' throughout game.js, so the glyphs reach about half
   the font size either side of the y it was drawn at. */
const RECORD = () => {
  window.__drawn = [];
  const proto = CanvasRenderingContext2D.prototype;
  for (const name of ['fillText', 'strokeText']) {
    const real = proto[name];
    proto[name] = function (str, x, y) {
      try {
        const m = this.getTransform();
        const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(this.font)[1]);
        const perCss = this.canvas.width / this.canvas.getBoundingClientRect().width;
        window.__drawn.push({
          str: String(str),
          mid: (m.d * y + m.f) / perCss,              /* centre of the line */
          half: (m.d * size) / perCss / 2,            /* half its height */
        });
      } catch (e) { /* a draw we can't place tells us nothing; let it through */ }
      return real.apply(this, arguments);
    };
  }
};

async function open(browser, phone) {
  const p = await browser.newPage({ viewport: { width: phone.w, height: phone.h }, deviceScaleFactor: 3 });
  await p.addInitScript(RECORD);
  await p.addInitScript(() => { try { localStorage.setItem('bowlbandit.onboarded', 'true'); } catch (e) {} });
  await p.goto('file://' + path.join(ROOT, 'mobile.html') + '?debug&manual');
  await p.waitForFunction(() => window.__bb && window.__bb.g);
  /* stand in for the insets the phone would report, then re-lay out */
  await p.evaluate(({ top, bottom }) => {
    document.getElementById('stage').style.padding = top + 'px 0px ' + bottom + 'px 0px';
    window.dispatchEvent(new Event('resize'));
  }, phone);
  return p;
}

/* the on-screen top and bottom of the first drawn line matching re */
async function findText(p, re) {
  const r = await p.evaluate(src => {
    const rect = document.querySelector('canvas').getBoundingClientRect();
    const hit = window.__drawn.filter(d => new RegExp(src).test(d.str))[0];
    return hit ? { top: rect.top + hit.mid - hit.half, bottom: rect.top + hit.mid + hit.half, str: hit.str } : null;
  }, re.source);
  return r;
}

async function check(browser, phone) {
  const p = await open(browser, phone);
  const safeBot = phone.h - phone.bottom;
  const out = [];

  /* the title screen, where the build stamp lives */
  await p.evaluate(() => window.__bb.advance(0.5));
  const box = await p.evaluate(() => {
    const b = document.querySelector('canvas').getBoundingClientRect();
    return { top: b.top, bottom: b.bottom, w: b.width, h: b.height };
  });
  out.push(['canvas starts below the status bar', box.top >= phone.top - 0.5, box.top.toFixed(1) + ' >= ' + phone.top]);
  out.push(['canvas ends above the home indicator', box.bottom <= safeBot + 0.5, box.bottom.toFixed(1) + ' <= ' + safeBot]);

  const stamp = await findText(p, /^Build /);
  out.push(['the build stamp is drawn on screen', stamp && stamp.bottom <= safeBot,
            stamp ? stamp.bottom.toFixed(1) + ' <= ' + safeBot : 'never drawn']);

  /* into a round, where the timer is drawn */
  const DH = 720 * (box.h / box.w);
  await p.evaluate(() => { window.__drawn.length = 0; });
  await p.mouse.click(box.w / 2, box.top + (DH * 0.6 + 54) * (box.h / DH));   /* PLAY */
  await p.evaluate(() => window.__bb.advance(2));
  const clock = await findText(p, /^\d+:\d\d$/);
  out.push(['the timer is drawn clear of the island', clock && clock.top >= phone.top,
            clock ? clock.top.toFixed(1) + ' >= ' + phone.top : 'never drawn']);

  await p.close();
  return out;
}

(async () => {
  const browser = await chromium.launch();
  let failed = 0;
  for (const phone of PHONES) {
    console.log('\n=== ' + phone.name + ' ===');
    for (const [what, ok, detail] of await check(browser, phone)) {
      console.log((ok ? '  PASS ' : '  FAIL ') + what + '  (' + detail + ')');
      if (!ok) failed++;
    }
  }
  await browser.close();
  console.log(failed ? '\n' + failed + ' failed.' : '\nAll inside the safe area.');
  process.exit(failed ? 1 : 0);
})();
