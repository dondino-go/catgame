#!/usr/bin/env node
/*
 * PROTOTYPE lab for "a street a day" (#34). See tools/street-gen.js.
 *
 *   node tools/street-lab.js rule                  does the rule reproduce Marrow and Terrace?
 *   node tools/street-lab.js list  [--days 20]     the generated streets, mapped
 *   node tools/street-lab.js play  [--rounds 40]   bots on each, against the two hand-made ones
 *   node tools/street-lab.js analyse [--streets 60 --rounds 120]   does shape matter beyond size?
 *   node tools/street-lab.js dump  out.json        the streets and results, for the gallery
 *
 * --from 2026-11-08 sets the first date (the seed is the date string).
 *
 * The bots are tools/simulate.js's, copied rather than imported because that
 * file reads its street from argv at load time. If the loop changes, change
 * both. As CLAUDE.md says of that tool: bots see every window at once, so read
 * these numbers as *relative* -- which streets differ from which -- never as
 * how hard a street feels.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const CORE = require(path.join(__dirname, '..', 'src', 'core.js'));
const C = CORE;
const G = require('./street-gen.js');

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const DAYS = parseInt(arg('--days', '20'), 10), ROUNDS = parseInt(arg('--rounds', '40'), 10);
const FROM = new Date(arg('--from', '2026-11-08') + 'T00:00:00Z');
const dates = Array.from({ length: DAYS }, (_, i) => new Date(FROM.getTime() + i * 864e5).toISOString().slice(0, 10));
const set = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/* ---------- rule: does it understand the game? ---------- */
function ruleCheck() {
  let ok = true;
  for (const st of [C.MARROW_STREET, C.TERRACE_STREET]) {
    const items = st.houses.map(h => ({ side: h.side, row: h.row, span: h.venue ? h.venue.span : 1, venue: !!h.venue, reach: 1 }));
    const d = G.deriveNeighbours(items);
    const bad = [];
    st.houses.forEach((h, i) => {
      const want = h.neighbours.slice().sort((a, b) => a - b);
      if (!d || !set(d.neighbours[i], want)) bad.push(i + ' (' + h.name + '): hand-made ' + want + ', rule ' + (d && d.neighbours[i]));
    });
    console.log((bad.length ? 'FAIL ' : 'ok   ') + st.name + ': ' + (bad.length ? bad.length + ' of ' + st.houses.length + ' houses differ' : 'all ' + st.houses.length + ' neighbour lists reproduced from the shape') +
                (d ? '  (repairs: ' + d.repairs.capped + ' capped, ' + d.repairs.lonely + ' lonely)' : ''));
    bad.forEach(b => console.log('       ' + b));
    if (bad.length) ok = false;
  }
  process.exitCode = ok ? 0 : 1;
}

/* ---------- list ---------- */
const streets = () => dates.map(d => { const g = G.generate(d); return { date: d, ...g, structure: G.structure(g.street) }; });

function list() {
  for (const s of streets()) {
    const st = s.structure, i = s.info;
    console.log(s.date + '  ' + s.street.name + '  (' + i.kinds + ', ' + i.rows + ' rows, ' + st.bowls + ' bowls, ' + st.venues + ' venue' + (st.venues === 1 ? '' : 's') +
                ', exposure ' + st.meanDeg.toFixed(2) + ', ' + st.islands + ' island' + (st.islands === 1 ? '' : 's') + ', repairs ' + i.repairs.capped + '/' + i.repairs.lonely + ', try ' + i.attempts + ')');
    console.log(G.ascii(s.street)); console.log();
  }
}

/* ---------- bots, as in tools/simulate.js ---------- */
const SKILLS = { novice: { sigma: 0.16, react: 0.65 }, decent: { sigma: 0.09, react: 0.45 }, expert: { sigma: 0.025, react: 0.25 } };
/* `o.C` is the rules to play on (the planning lab hands in a patched copy) and `o.pick(g, C, pool)`
   chooses which quiet bowl to go for; the default is the nearest, as in tools/simulate.js. */
function play(street, skill, style, seed, o = {}) {
  const C = o.C || CORE;
  let a = seed >>> 0;
  const rng = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  const randn = () => Math.sqrt(-2 * Math.log(rng() + 1e-9)) * Math.cos(6.2832 * rng());
  const g = C.create({ rng, street }); C.start(g);
  const DT = 1 / 60;
  let react = 0, aim = null, cool = 0;
  /* What the bots can't say by clearing the street (they all do), so measure
     how tight the night was: seconds with nowhere safe to go, and how near the
     owner came. */
  let stuck = 0, peak = 0;
  let guard = 60 * (1 / C.NIGHT.RACKET_DRIFT + C.PICKUP_SECS + 60);
  while (g.scene !== 'over' && guard-- > 0) {
    if (g.racket > peak) peak = g.racket;
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
        const quiet = g.houses.filter(h => h.bowl && h.neighbours.every(i => g.houses[i].state === 'idle'));
        const pool = quiet.length ? quiet : (style === 'cautious' ? [] : g.houses.filter(h => h.bowl));
        if (pool.length) {
          const pickH = o.pick ? o.pick(g, C, pool) : pool.sort((p, q) => Math.abs(C.bowlSpot(p).y - g.cat.y) - Math.abs(C.bowlSpot(q).y - g.cat.y))[0];
          C.tapHouse(g, pickH.id);
        } else stuck += DT;
      }
    }
    cool -= DT;
    C.update(g, DT); C.drainEvents(g);
  }
  const pr = C.progress(g);
  return { score: g.score, cleared: pr.cleared, total: pr.total, ending: g.ending, secs: g.elapsed, caught: g.timesCaught || 0, stuck, peak };
}

const PROFILES = [
  ['expert, careful', SKILLS.expert, 'cautious'],
  ['decent, careful', SKILLS.decent, 'cautious'],
  ['decent, greedy',  SKILLS.decent, 'greedy'],
];
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

function profile(street, rounds, seedBase = 0) {
  return PROFILES.map(([name, skill, style]) => {
    const r = []; for (let i = 1; i <= rounds; i++) r.push(play(street, skill, style, (i + seedBase) * 7919 + 13));
    const n = r.length, total = r[0].total, mean = k => r.reduce((s, x) => s + x[k], 0) / n;
    const secs = r.map(x => x.secs).sort((a, b) => a - b);
    return { name,
      got: r.reduce((s, x) => s + x.cleared, 0) / n / total,                 // share of the street taken
      cleared: r.filter(x => x.ending === 'cleared').length / n,
      owner: r.filter(x => x.ending === 'owner').length / n,
      secs: pct(secs, 0.5), perBowl: pct(secs, 0.5) / total,                  // night length per bowl
      stuck: r.reduce((s, x) => s + x.stuck, 0) / r.reduce((s, x) => s + x.secs, 0),   // share of the night with nowhere safe to go
      peak: mean('peak'), caught: mean('caught'),                             // how near the owner came; times caught
      score: mean('score') / total };                                         // points per bowl
  });
}

const f = (x, w = 4) => String(Math.round(x * 100)).padStart(w - 1) + '%';
const HEAD = 'street'.padEnd(36) + 'bowls |  expert, careful          |  decent, greedy                |';
const SUB = ' '.repeat(36) + '      |  s/bowl  stuck  attn  score   |  got  attn  owner  score         |';
function row(label, bowls, ps) {
  const [a, , c] = ps;
  return label.padEnd(36) + String(bowls).padStart(4) + '  |  ' + a.perBowl.toFixed(1).padStart(5) + 's ' + f(a.stuck, 6) + '  ' + a.peak.toFixed(2) + '  ' + a.score.toFixed(0).padStart(5) +
         '   |  ' + f(c.got, 4) + '  ' + c.peak.toFixed(2) + '  ' + f(c.owner, 5) + '  ' + c.score.toFixed(0).padStart(5) + '        |';
}
function playAll() {
  const all = streets();
  console.log('Bots, ' + ROUNDS + ' rounds per profile. stuck = share of a careful night with no safe bowl to walk to; attn = peak of the attention meter (1 = the owner comes).\n');
  console.log(HEAD); console.log(SUB);
  const out = { references: {}, streets: [] };
  for (const st of [C.MARROW_STREET, C.TERRACE_STREET]) {
    const ps = profile(st, ROUNDS); out.references[st.id] = ps; console.log(row('* ' + st.name + ' (hand-made)', st.houses.filter(h => !h.venue).length, ps));
  }
  /* the noise floor: Marrow again on other seeds. A difference smaller than this between two streets is luck. */
  const again = profile(C.MARROW_STREET, ROUNDS, 5000);
  out.noise = again; console.log(row('* Marrow again, other seeds (noise)', 8, again));
  console.log('-'.repeat(HEAD.length));
  for (const s of all) {
    const ps = profile(s.street, ROUNDS); out.streets.push({ date: s.date, name: s.street.name, info: s.info, structure: s.structure, profile: ps });
    console.log(row(s.date.slice(5) + ' ' + s.street.name + ' ' + s.info.kinds, s.structure.bowls, ps));
  }
  return out;
}


/* ---------- analyse: does structure beyond size change how a night plays? ---------- */
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
const corr = (x, y) => { const mx = mean(x), my = mean(y); const c = mean(x.map((v, i) => (v - mx) * (y[i] - my))); return sd(x) && sd(y) ? c / (sd(x) * sd(y)) : 0; };
function fit(x, y) { const mx = mean(x), my = mean(y); const b = mean(x.map((v, i) => (v - mx) * (y[i] - my))) / (sd(x) ** 2 || 1); return { b, a: my - b * mx }; }

function analyse() {
  const N = parseInt(arg('--streets', '60'), 10), R = parseInt(arg('--rounds', '120'), 10);
  const days = Array.from({ length: N }, (_, i) => new Date(FROM.getTime() + i * 864e5).toISOString().slice(0, 10));
  const METRICS = [
    ['night length (s per bowl)', ps => ps[0].perBowl],
    ['careful: share stuck with no safe bowl', ps => ps[0].stuck],
    ['greedy: attention peak', ps => ps[2].peak],
    ['greedy: owner ends the night', ps => ps[2].owner],
    ['careful: points per bowl', ps => ps[0].score],
  ];
  const rows = days.map(d => { const g = G.generate(d); const st = G.structure(g.street); return { d, st, info: g.info, ps: profile(g.street, R) }; });
  /* noise: the same street on eight sets of seeds, at the same number of rounds */
  const noiseRuns = Array.from({ length: 8 }, (_, i) => profile(C.MARROW_STREET, R, 10000 * (i + 1)));

  console.log(N + ' generated streets, ' + R + ' rounds per bot each; noise from Marrow Street on 8 seed sets.\n');
  const sizes = rows.map(r => r.st.bowls);
  console.log('bowls: ' + [4, 5, 6, 7, 8, 9].map(k => k + ':' + sizes.filter(v => v === k).length).join('  ') + '   venues: ' + [0, 1, 2].map(k => k + ':' + rows.filter(r => r.st.venues === k).length).join('  ') + '   islands>1: ' + rows.filter(r => r.st.islands > 1).length + '\n');
  console.log('metric'.padEnd(42) + 'spread(sd)  noise(sd)  r with bowls  left after size(sd)  = x noise   r with exposure   r with venues');
  for (const [label, get] of METRICS) {
    const y = rows.map(r => get(r.ps)), x = sizes;
    const { a, b } = fit(x, y), res = y.map((v, i) => v - (a + b * x[i]));
    const noise = sd(noiseRuns.map(p => get(p)));
    console.log(label.padEnd(42) + sd(y).toFixed(3).padStart(8) + noise.toFixed(3).padStart(11) + corr(x, y).toFixed(2).padStart(13) + sd(res).toFixed(3).padStart(15) +
                (sd(res) / (noise || 1)).toFixed(1).padStart(14) + 'x' + corr(rows.map(r => r.st.meanDeg), res).toFixed(2).padStart(14) + corr(rows.map(r => r.st.venues), res).toFixed(2).padStart(14));
  }
  console.log('\n"x noise" near 1 means what is left after bowl count is no more than luck; well above 1 means the street\'s shape is doing something.');
}

/* ---------- pace: time of day as rules, not colours ---------- */
/* Nothing in the game does this today: the waves are one table for every street.
   This mutates C.WAVES for the length of a run (the lab is a separate process)
   to ask how much a night moves when the *neighbourhood* changes rather than
   the street -- fewer windows awake and longer quiet spells ("dawn"), or more
   and shorter ("rush hour"). */
function pace() {
  const R = parseInt(arg('--rounds', '120'), 10);
  const base = C.WAVES.map(w => ({ awake: w.awake, idle: w.idle.slice() }));
  const variants = [
    ['sleepy   (1 less awake, idle x1.6)', w => ({ awake: Math.max(1, w.awake - 1), idle: w.idle.map(x => x * 1.6) })],
    ['standard (as shipped)',               w => ({ awake: w.awake, idle: w.idle.slice() })],
    ['busy     (1 more awake, idle x0.6)', w => ({ awake: w.awake + 1, idle: w.idle.map(x => x * 0.6) })],
  ];
  console.log('Marrow Street and Terrace Row under three paces, ' + R + ' rounds per bot.\n');
  console.log('street / pace'.padEnd(46) + '|  s/bowl  stuck  attn  score   |  got  attn  owner  score        |');
  for (const st of [C.MARROW_STREET, C.TERRACE_STREET]) {
    for (const [label, fn] of variants) {
      C.WAVES.forEach((w, i) => { const v = fn(base[i]); w.awake = v.awake; w.idle = v.idle; });
      const ps = profile(st, R);
      console.log((st.name.split(' ')[0] + ' ' + label).padEnd(46) + row('', 0, ps).slice(40));
    }
  }
  C.WAVES.forEach((w, i) => { w.awake = base[i].awake; w.idle = base[i].idle; });
}

const cmd = require.main === module ? process.argv[2] : null;
if (cmd === 'rule') ruleCheck();
else if (cmd === 'list') list();
else if (cmd === 'play') playAll();
else if (cmd === 'analyse') analyse();
else if (cmd === 'pace') pace();
else if (cmd === 'dump') {
  const res = playAll();
  const all = streets();
  fs.writeFileSync(process.argv[3] || 'streets.json', JSON.stringify({ results: res, streets: all.map(s => ({ date: s.date, street: s.street, info: s.info, structure: s.structure })) }));
  console.log('\nwrote ' + (process.argv[3] || 'streets.json'));
} else if (require.main === module) console.log('usage: node tools/street-lab.js rule | list | play | analyse | pace | dump out.json   [--days 20] [--rounds 40] [--from 2026-11-08]');

module.exports = { play, SKILLS };
