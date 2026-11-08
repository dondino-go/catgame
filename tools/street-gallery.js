#!/usr/bin/env node
/*
 * PROTOTYPE: draw the generated streets with the real renderer (#34), so they
 * can be judged by eye as well as by bots. Needs Playwright.
 *
 *   node tools/street-gallery.js <outdir> [--days 20] [--from 2026-11-08]
 *
 * Writes <outdir>/NN-date.jpg for each street plus ref-marrow.jpg and
 * ref-terrace.jpg, and <outdir>/shots.json mapping dates to files.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const G = require('./street-gen.js');
const C = require(path.join(__dirname, '..', 'src', 'core.js'));

const out = process.argv[2];
if (!out) { console.log('usage: node tools/street-gallery.js <outdir> [--days 20] [--from 2026-11-08]'); process.exit(1); }
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const DAYS = parseInt(arg('--days', '20'), 10), FROM = new Date(arg('--from', '2026-11-08') + 'T00:00:00Z');
const URL = 'file://' + path.join(__dirname, '..', 'index.html') + '?debug&manual';
const QUIET = () => { const g = window.__bb.g; g.houses.forEach(h => { h.state = 'idle'; h.t = 9999; }); };

async function shoot(browser, street, file) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5, locale: 'en-GB', timezoneId: 'Europe/London' });
  await ctx.addInitScript(st => { window.__bbStreet = st; }, street);
  await ctx.addInitScript(() => {
    let a = 12345; Math.random = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
    try { localStorage.setItem('bowlbandit.onboarded', 'true'); } catch (e) {}
    Object.defineProperty(window, 'BOWL_BUILD', { get: () => ({ time: '2026-01-01T12:00:00Z', branch: 'lab' }), set: () => {} });
  });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', e => errors.push(String(e)));
  await p.goto(URL);
  await p.evaluate(() => Promise.all([500, 600, 700, 800].map(w => document.fonts.load(w + " 40px 'Baloo 2'"))));
  await p.evaluate(() => window.__bb.advance(0.5));
  const R = await p.evaluate(() => { const c = document.getElementById('c').getBoundingClientRect(); return { x: c.left, y: c.top, w: c.width, h: c.height }; });
  const play = await p.evaluate(() => window.__bb.titleRects().play);
  await p.mouse.click(R.x + (play.x + play.w / 2) / 720 * R.w, R.y + (play.y + play.h / 2) / (R.h / R.w * 720) * R.h);
  await p.evaluate(() => window.__bb.advance(3.4)); await p.evaluate(QUIET); await p.evaluate(() => window.__bb.advance(0.3));
  const scene = await p.evaluate(() => window.__bb.g.scene);
  await p.screenshot({ path: file, type: 'jpeg', quality: 86 });
  await ctx.close();
  return { scene, errors };
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const shots = {};
  for (const [id, st] of [['marrow', C.MARROW_STREET], ['terrace', C.TERRACE_STREET]]) {
    const r = await shoot(browser, JSON.parse(JSON.stringify(st)), path.join(out, 'ref-' + id + '.jpg')); shots[id] = 'ref-' + id + '.jpg';
    console.log('ref ' + id + ': ' + r.scene + (r.errors.length ? ' ERRORS ' + r.errors : ''));
  }
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(FROM.getTime() + i * 864e5).toISOString().slice(0, 10);
    const { street } = G.generate(d), file = String(i + 1).padStart(2, '0') + '-' + d + '.jpg';
    const r = await shoot(browser, street, path.join(out, file)); shots[d] = file;
    console.log(d + ' ' + street.name + ': ' + r.scene + (r.errors.length ? ' ERRORS ' + r.errors.join('; ') : ''));
  }
  fs.writeFileSync(path.join(out, 'shots.json'), JSON.stringify(shots));
  await browser.close();
})();
