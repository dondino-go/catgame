/*
 * Does the game stay inside a phone's safe area?
 *
 * A playtest on an iPhone 15 found the timer hidden behind the Dynamic
 * Island: fit() measured #stage with getBoundingClientRect(), which includes
 * the safe-area padding, so the canvas was sized to the whole screen and
 * overflowed the insets at both ends.
 *
 * Chromium doesn't emulate env(safe-area-inset-*), so this stands in for it by
 * putting the same values on #stage as padding -- which is exactly what the
 * CSS does on a real phone.
 *
 *   node tests/safearea.js
 */
const { chromium } = require('playwright');
const path = require('path');

const ROOT = path.join(__dirname, '..');
/* portrait iPhone 15 Pro: 59pt of status bar and island, 34pt of home indicator */
const PHONES = [
  { name: 'iPhone 15 Pro', w: 393, h: 852, top: 59, bottom: 34 },
  { name: 'iPhone SE (no island)', w: 375, h: 667, top: 0, bottom: 0 },
];

async function check(browser, phone) {
  const p = await browser.newPage({ viewport: { width: phone.w, height: phone.h }, deviceScaleFactor: 3 });
  await p.goto('file://' + path.join(ROOT, 'mobile.html') + '?debug&manual');
  await p.waitForFunction(() => window.__bb && window.__bb.g);

  const r = await p.evaluate(({ top, bottom }) => {
    const stage = document.getElementById('stage');
    stage.style.padding = top + 'px 0px ' + bottom + 'px 0px';
    window.dispatchEvent(new Event('resize'));
    const b = document.querySelector('canvas').getBoundingClientRect();
    return { top: b.top, bottom: b.bottom, w: b.width, h: b.height };
  }, phone);
  await p.close();

  const DH = 720 * (r.h / r.w);              /* the canvas keeps the design aspect */
  const per = r.h / DH;                      /* CSS px per design unit */
  const safeBot = phone.h - phone.bottom;
  /* the clock is 50px text centred on y=50, and the build stamp sits at DH-44 */
  const clockTop = r.top + 25 * per;
  const stampY = r.top + (DH - 44) * per;

  return [
    ['canvas starts below the status bar', r.top >= phone.top - 0.5, r.top.toFixed(1) + ' >= ' + phone.top],
    ['canvas ends above the home indicator', r.bottom <= safeBot + 0.5, r.bottom.toFixed(1) + ' <= ' + safeBot],
    ['the timer is clear of the island', clockTop >= phone.top, clockTop.toFixed(1) + ' >= ' + phone.top],
    ['the build stamp is on screen', stampY <= safeBot, stampY.toFixed(1) + ' <= ' + safeBot],
  ];
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
