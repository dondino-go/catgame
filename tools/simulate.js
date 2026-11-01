#!/usr/bin/env node
/*
 * Balance simulator: bots play whole rounds against src/core.js and report
 * how scores spread by skill and play style, and where those scores land in
 * the rank table. This is what calibrated the streak multiplier and the
 * RANKS thresholds; re-run it after any change to scoring, the streak, the
 * waves or the reaction windows, and re-check RANKS against the output.
 *
 *   node tools/simulate.js              60 rounds per row
 *   node tools/simulate.js --rounds 200
 *   node tools/simulate.js --street terrace    (and that street's ladder)
 *
 * There is no fixed length, so the table reports how long a night actually
 * ran and how much of the street the bot got, as well as what it scored.
 *
 * Bots have human-ish limits: they aim at the centre of the green with a
 * timing error (sigma, in bar widths) and react to windows after a delay.
 *   cautious  leaves at the first twitching curtain on its bowl
 *   greedy    keeps eating until actually seen, then runs
 * Bots see every window at once, which real players don't, so real scores
 * run lower than these. Seeds are fixed, so runs are repeatable.
 */
'use strict';
const path = require('path');
const C = require(path.join(__dirname, '..', 'src', 'core.js'));

const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const ROUNDS = parseInt(arg('--rounds') || '60', 10);
const STREET = arg('--street') === 'terrace' ? C.TERRACE_STREET : C.MARROW_STREET;   // --street terrace

const SKILLS = {
  novice: { sigma: 0.16, react: 0.65 },
  decent: { sigma: 0.09, react: 0.45 },
  good:   { sigma: 0.05, react: 0.35 },
  expert: { sigma: 0.025, react: 0.25 },
};

function play(skill, style, seed) {
  let a = seed >>> 0;
  const rng = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  const randn = () => Math.sqrt(-2 * Math.log(rng() + 1e-9)) * Math.cos(6.2832 * rng());
  const g = C.create({ rng, street: STREET }); C.start(g);
  const DT = 1 / 60;
  let react = 0, aim = null, cool = 0;
  /* No clock, so this needs its own stop: the racket drift ends a night by
     itself, and this only catches a bot that has wedged. */
  let guard = 60 * 600;
  while (g.scene !== 'over' && guard-- > 0) {
    if (g.scene === 'play') {
      const e = g.eat;
      if (e) {
        const ns = e.h.neighbours.map(i => g.houses[i]);
        const danger = style === 'cautious' ? ns.some(n => n.state !== 'idle') : g.spot.heat > 0;
        if (danger) { react += DT; if (react > skill.react) { C.tapRoad(g, g.street.roadX, g.cat.y); react = 0; aim = null; } }
        else react = 0;
        if (g.eat && cool <= 0) {
          if (aim == null) aim = Math.min(1, Math.max(0, e.zone + e.zoneW / 2 + randn() * skill.sigma));
          if (Math.abs(e.t - aim) <= e.speed * DT) { C.tapEat(g); aim = null; cool = 0.12; }
        }
      } else if (!g.cat.target) {
        /* go for the nearest bowl whose neighbours are all asleep */
        const quiet = g.houses.filter(h => h.bowl && h.neighbours.every(i => g.houses[i].state === 'idle'));
        const pool = quiet.length ? quiet : (style === 'cautious' ? [] : g.houses.filter(h => h.bowl));
        if (pool.length) {
          pool.sort((p, q) => Math.abs(C.bowlSpot(p).y - g.cat.y) - Math.abs(C.bowlSpot(q).y - g.cat.y));
          C.tapHouse(g, pool[0].id);
        }
      }
    }
    cool -= DT;
    C.update(g, DT); C.drainEvents(g);
  }
  const pr = C.progress(g);
  return { score: g.score, kept: g.houses.filter(h => !h.venue && !h.angry).length,
           mult: g.bestMult, rank: C.rankFor(g.score, STREET),
           cleared: pr.cleared, total: pr.total, ending: g.ending, secs: g.elapsed };
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
console.log('Balance simulation, ' + ROUNDS + ' rounds per row\n');
console.log('Street: ' + STREET.name + '\n');
console.log('skill   style     score p10 / p50 / p90   got     night p50   how it ended');
for (const [k, s] of Object.entries(SKILLS)) {
  for (const style of ['cautious', 'greedy']) {
    const r = [];
    for (let i = 1; i <= ROUNDS; i++) r.push(play(s, style, i * 7919 + 13));
    const sc = r.map(x => x.score).sort((x, y) => x - y);
    const avg = f => (r.reduce((n, x) => n + x[f], 0) / r.length).toFixed(1);
    const secs = r.map(x => x.secs).sort((x, y) => x - y);
    const endings = ['cleared', 'done', 'slipped', 'owner'].map(e => {
      const n = r.filter(x => x.ending === e).length;
      return n ? e + ' ' + Math.round(100 * n / r.length) + '%' : null;
    }).filter(Boolean).join(', ');
    console.log(k.padEnd(8) + style.padEnd(10) +
                [pct(sc, 0.1), pct(sc, 0.5), pct(sc, 0.9)].join(' / ').padEnd(24) +
                (avg('cleared') + '/' + r[0].total).padEnd(8) +
                (pct(secs, 0.5).toFixed(0) + 's').padEnd(12) + endings);
  }
}
console.log('\nWhat good looks like: cautious beats greedy at every skill level, on what it');
console.log('gets as well as on what it scores, and a careless night is the one the owner');
console.log('ends. Night length should follow the street\'s size, not a constant. Bots see');
console.log('every window at once, so they get far more of the street than a real player');
console.log('does -- a tester not reaching the last bowl is the sim being optimistic, not');
console.log('the night being too easy.');
