#!/usr/bin/env node
/*
 * PROTOTYPE (#34): does the layout of a street matter to how you play it?
 *
 *   node tools/planning-lab.js [--rounds 80] [--streets 12]
 *
 * For layout to be a strategy and not just a picture, two things must be true:
 * what you do has to change the board, and choosing an order has to pay. So
 * this measures the *value of planning*: the same street played by a bot that
 * goes to the nearest quiet bowl (as now) and by bots that choose their order
 * from the layout, under today's rules and under a rule change.
 *
 * Rules tried (the rule is applied to a copy of src/core.js in memory; the
 * game is not touched, and the patch stops with a message if the code moves):
 *   as shipped   the neighbour graph never changes: a house you have fed
 *                still watches you.
 *   fed sleep    a house that has had its dinner goes to sleep for the night
 *                and stops watching, so every meal reshapes the street.
 *
 * Orders tried:
 *   naive     nearest quiet bowl
 *   hub       prefer the bowl whose house watches the most bowls still to eat
 *             (pointless on a fixed graph; the point of "fed sleep")
 *   deadline  prefer bowls a pub will watch once it opens, while it is shut
 *   both      the two together
 * and a distance penalty in every case, so no order is free.
 *
 * Reads: "positive = better than naive". Bots see every window, so this is
 * relative evidence of whether planning *can* pay, not of whether it is fun.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const G = require('./street-gen.js');
const L = require('./street-lab.js');

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const ROUNDS = parseInt(arg('--rounds', '80'), 10), NSTREETS = parseInt(arg('--streets', '12'), 10);

/* ---------- the rule change, on a copy of the rules ---------- */
function patchedCore() {
  let s = fs.readFileSync(path.join(__dirname, '..', 'src', 'core.js'), 'utf8');
  const rep = (a, b) => { if (!s.includes(a)) throw new Error('src/core.js has changed: cannot find\n  ' + a + '\nUpdate tools/planning-lab.js.'); s = s.replace(a, b); };
  rep('function isThreat(w, owner) { return w !== owner && owner.neighbours.includes(w.id); }',
      'const EXP = { fedSleep: false };\nfunction isThreat(w, owner) { return w !== owner && owner.neighbours.includes(w.id) && !(EXP.fedSleep && w.cleared); }');
  rep('bowlSpot, wave, watchersOfBowl, isThreat,', 'EXP, bowlSpot, wave, watchersOfBowl, isThreat,');
  rep('    h.t -= dt;\n    if (h.t <= 0) {\n      if (h.state === \'idle\') {',
      '    if (EXP.fedSleep && h.cleared) { if (h.state !== \'idle\') { h.state = \'idle\'; awake--; } continue; }\n    h.t -= dt;\n    if (h.t <= 0) {\n      if (h.state === \'idle\') {');
  rep("      if (!isOpen(g, h)) continue;\n      if (h.state === 'idle') h.state = 'stir';",
      "      if (!isOpen(g, h) || (EXP.fedSleep && h.cleared)) continue;\n      if (h.state === 'idle') h.state = 'stir';");
  rep("for (const h of g.houses) { if (!isOpen(g, h)) continue; h.state = 'watch'; h.t = 0.7; }",
      "for (const h of g.houses) { if (!isOpen(g, h) || (EXP.fedSleep && h.cleared)) continue; h.state = 'watch'; h.t = 0.7; }");
  const m = { exports: {} }; new Function('module', 'exports', s)(m, m.exports);
  return m.exports;
}
const C = patchedCore();

/* A test that passes without the fix proves nothing (CLAUDE.md): the same fed
   neighbour is a watcher with the rule off and not with it on. */
function selfCheck() {
  const seen = fed => {
    C.EXP.fedSleep = fed;
    const g = C.create({ street: C.MARROW_STREET }); C.start(g);
    g.houses[0].cleared = true; g.houses[0].state = 'watch'; g.houses[0].t = 99;
    const n = C.watchersOfBowl(g, g.houses[1]).length;
    for (let i = 0; i < 5; i++) C.update(g, 1 / 60);
    return { watchers: n, stillWatching: g.houses[0].state !== 'idle' };
  };
  const off = seen(false), on = seen(true);
  const ok = off.watchers === 1 && on.watchers === 0 && on.stillWatching === false;
  console.log((ok ? 'ok   ' : 'FAIL ') + 'patch check: a fed neighbour watches ' + off.watchers + ' bowl(s) as shipped and ' + on.watchers + ' with fed sleep; asleep afterwards: ' + !on.stillWatching);
  if (!ok) process.exit(1);
}

/* ---------- the orders ---------- */
const dist = (g, h) => Math.abs(C.bowlSpot(h).y - g.cat.y);
const orders = {
  naive: null,
  hub:      { hub: 1, deadline: 0 },
  deadline: { hub: 0, deadline: 1.5 },
  both:     { hub: 1, deadline: 1.5 },
};
const picker = w => (g, _C, pool) => {
  const left = new Set(g.houses.filter(h => !h.venue && !h.cleared && !h.angry).map(h => h.id));
  const shut = g.houses.filter(h => h.venue && g.waveIdx < h.venue.from);
  const score = h => w.hub * h.neighbours.filter(i => left.has(i)).length +
                     w.deadline * shut.filter(v => v.neighbours.includes(h.id)).length - 0.15 * dist(g, h);
  return pool.slice().sort((p, q) => score(q) - score(p) || p.id - q.id)[0];
};

/* ---------- running ---------- */
const BOTS = { careful: [L.SKILLS.decent, 'cautious'], greedy: [L.SKILLS.decent, 'greedy'] };
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };

function cell(street, rule, order, botName) {
  C.EXP.fedSleep = rule === 'fed';
  const [skill, style] = BOTS[botName], pick = orders[order] ? picker(orders[order]) : undefined;
  const r = []; for (let i = 1; i <= ROUNDS; i++) r.push(L.play(street, skill, style, i * 7919 + 13, { C, pick }));
  const total = r[0].total;
  const v = {
    secs: r.map(x => x.secs / total),                      // seconds per bowl
    stuck: r.map(x => x.stuck / (x.secs || 1)),            // share of the night with nowhere safe to go
    peak: r.map(x => x.peak),                              // how near the owner came
    owner: r.map(x => x.ending === 'owner' ? 1 : 0),
  };
  return Object.fromEntries(Object.entries(v).map(([k, a]) => [k, { m: mean(a), se: sd(a) / Math.sqrt(a.length) }]));
}

function main() {
  selfCheck();
  const start = Date.UTC(2026, 10, 8);
  const dayN = i => new Date(start + i * 864e5).toISOString().slice(0, 10);
  const streets = [];
  for (let i = 0; i < NSTREETS; i++) { const g = G.generate(dayN(i), { maxBowls: 6 }); streets.push({ name: g.street.name, kind: 'quick', street: g.street, info: g.info, st: G.structure(g.street) }); }
  for (let i = 0; i < NSTREETS; i++) { const g = G.generate(dayN(i + 40), { minBowls: 7 }); streets.push({ name: g.street.name, kind: 'full', street: g.street, info: g.info, st: G.structure(g.street) }); }
  for (const s of [C.MARROW_STREET, C.TERRACE_STREET]) streets.push({ name: s.name, kind: 'hand', street: s, st: G.structure(s) });

  console.log(streets.length + ' streets (' + NSTREETS + ' quick of 4-6 bowls, ' + NSTREETS + ' of 7-9, and the two hand-made), ' + ROUNDS + ' rounds per cell.\n');
  const res = streets.map(s => {
    const out = {};
    for (const rule of ['shipped', 'fed']) for (const order of Object.keys(orders)) for (const bot of Object.keys(BOTS)) out[[rule, order, bot].join('|')] = cell(s.street, rule, order, bot);
    return { ...s, out };
  });

  /* gain over naive in the same rule: positive is better. Measures: careful bot's share stuck (points) and seconds per bowl; greedy bot's attention peak and owner endings. */
  const gain = (s, rule, order, bot, k) => s.out[[rule, 'naive', bot].join('|')][k].m - s.out[[rule, order, bot].join('|')][k].m;
  const gse = (s, rule, order, bot, k) => Math.hypot(s.out[[rule, 'naive', bot].join('|')][k].se, s.out[[rule, order, bot].join('|')][k].se);
  const MEASURES = [['careful', 'stuck', 'careful: share stuck (pts)', 100], ['careful', 'secs', 'careful: seconds per bowl', 1], ['greedy', 'peak', 'greedy: attention peak (x100)', 100], ['greedy', 'owner', 'greedy: owner ends it (pts)', 100]];
  const fmt = (x, d = 1) => (x >= 0 ? '+' : '') + x.toFixed(d);

  for (const rule of ['shipped', 'fed']) {
    console.log('== Rules: ' + (rule === 'shipped' ? 'as shipped (a fed house still watches)' : 'fed sleep (a fed house stops watching)') + '\n');
    console.log('gain of each order over "nearest quiet bowl", averaged over all streets; (n) = streets where the gain is more than 2 standard errors');
    console.log('measure'.padEnd(34) + Object.keys(orders).filter(o => o !== 'naive').map(o => o.padStart(18)).join(''));
    for (const [bot, k, label, scale] of MEASURES) {
      console.log(label.padEnd(34) + Object.keys(orders).filter(o => o !== 'naive').map(o => {
        const g = res.map(s => gain(s, rule, o, bot, k)), n = res.filter(s => gain(s, rule, o, bot, k) > 2 * gse(s, rule, o, bot, k)).length;
        return (fmt(mean(g) * scale) + ' (' + n + ')').padStart(18);
      }).join(''));
    }
    console.log();
  }

  /* does the edge depend on the street? the point of the whole exercise */
  console.log('== Does the edge depend on the street? ("both" order, gain in careful bot\'s share stuck, points)\n');
  console.log('group'.padEnd(28) + 'streets   as shipped   fed sleep');
  const groups = [['all', () => true], ['with a pub', s => s.st.venues > 0], ['no pub', s => s.st.venues === 0], ['quick (4-6 bowls)', s => s.kind === 'quick'], ['7-9 bowls', s => s.kind === 'full'],
                  ['crowded (exposure >= 2.3)', s => s.st.meanDeg >= 2.3], ['loose (exposure < 1.8)', s => s.st.meanDeg < 1.8]];
  for (const [label, f] of groups) {
    const ss = res.filter(f); if (!ss.length) continue;
    console.log(label.padEnd(28) + String(ss.length).padStart(5) + ['shipped', 'fed'].map(r => fmt(mean(ss.map(s => gain(s, r, 'both', 'careful', 'stuck'))) * 100).padStart(12)).join(''));
  }
  for (const rule of ['shipped', 'fed']) {
    const gs = res.map(s => gain(s, rule, 'both', 'careful', 'stuck') * 100), ses = res.map(s => gse(s, rule, 'both', 'careful', 'stuck') * 100);
    console.log('\n' + (rule === 'shipped' ? 'as shipped' : 'fed sleep') + ': the gain ranges ' + fmt(Math.min(...gs)) + ' to ' + fmt(Math.max(...gs)) + ' pts across streets (sd ' + sd(gs).toFixed(1) + ', typical measurement error ' + mean(ses).toFixed(1) + ')');
  }

  console.log('\nPer street, "both" order, careful bot:  stuck gain (pts) / seconds-per-bowl gain, shipped then fed sleep');
  res.forEach(s => console.log((s.name + ' [' + s.kind + (s.info ? ' ' + s.info.kinds : '') + ', ' + s.st.bowls + ' bowls' + (s.st.venues ? ', pub' : '') + ', exposure ' + s.st.meanDeg.toFixed(1) + ']').padEnd(62) +
    ['shipped', 'fed'].map(r => (fmt(gain(s, r, 'both', 'careful', 'stuck') * 100) + ' / ' + fmt(gain(s, r, 'both', 'careful', 'secs'))).padStart(16)).join('')));
  fs.writeFileSync(arg('--json', path.join(require('os').tmpdir(), 'planning.json')), JSON.stringify(res.map(s => ({ name: s.name, kind: s.kind, info: s.info, st: s.st, out: s.out }))));
}
main();
