/*
 * Golden playthroughs: the refactor safety net.
 *
 * Seeded bots play whole rounds through the core's public API, and every
 * event plus a once-a-second snapshot of the cat, the score and the
 * residents is written to a log. The logs in tests/golden/ were recorded
 * before the street became data-driven; the same seeds must reproduce them
 * exactly afterwards, or the game has changed. On a mismatch the first
 * differing line is shown.
 *
 *   node tests/golden.test.js            check against tests/golden/
 *   node tests/golden.test.js --update   re-record (only when a change to
 *                                        play is intended)
 */
require('./harness');
const fs = require('fs');
const path = require('path');
const C = require('../src/core.js');

const DIR = path.join(__dirname, 'golden');
const UPDATE = process.argv.includes('--update');

function lcg(seed) {
  let a = seed >>> 0;
  return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
}
const r6 = v => (Math.round(v * 1e6) / 1e6).toString();

/* A bot with human-ish limits: aims at the centre of the green with a timing
   error, and reacts to windows after a delay. "cautious" leaves at the first
   twitching curtain; "greedy" eats until seen. */
function playthrough(skill, style, seed) {
  const rng = lcg(seed), botRng = lcg(seed * 31 + 7);
  const randn = () => Math.sqrt(-2 * Math.log(botRng() + 1e-9)) * Math.cos(6.2832 * botRng());
  const g = C.create({ rng }); C.start(g);
  const DT = 1 / 60, log = [];
  let react = 0, aim = null, cool = 0;
  for (let f = 0; f < 60 * 140 && g.scene !== 'over'; f++) {
    if (g.scene === 'play') {
      const e = g.eat;
      if (e) {
        const ns = e.h.neighbours.map(i => g.houses[i]);
        const danger = style === 'cautious' ? ns.some(n => n.state !== 'idle') : g.spot.heat > 0;
        if (danger) { react += DT; if (react > skill.react) { C.tapRoad(g, C.ROAD_X, g.cat.y); react = 0; aim = null; } }
        else react = 0;
        if (g.eat && cool <= 0) {
          if (aim == null) aim = Math.min(1, Math.max(0, e.zone + e.zoneW / 2 + randn() * skill.sigma));
          if (Math.abs(e.t - aim) <= e.speed * DT) { C.tapEat(g); aim = null; cool = 0.12; }
        }
      } else if (!g.cat.target) {
        const quiet = g.houses.filter(h => h.bowl && h.neighbours.every(i => g.houses[i].state === 'idle'));
        const pool = quiet.length ? quiet : (style === 'cautious' ? [] : g.houses.filter(h => h.bowl));
        if (pool.length) {
          pool.sort((p, q) => Math.abs(C.bowlSpot(p).y - g.cat.y) - Math.abs(C.bowlSpot(q).y - g.cat.y) || p.id - q.id);
          C.tapHouse(g, pool[0].id);
        }
      }
    }
    cool -= DT;
    C.update(g, DT);
    for (const ev of C.drainEvents(g)) {
      const fields = Object.keys(ev).filter(k => k !== 'type').sort()
        .map(k => k + '=' + (typeof ev[k] === 'number' ? r6(ev[k]) : String(ev[k])));
      log.push(f + ' ' + ev.type + (fields.length ? ' ' + fields.join(' ') : ''));
    }
    if (f % 60 === 0) {
      log.push(f + ' @ ' + g.scene + ' cat=' + r6(g.cat.x) + ',' + r6(g.cat.y) + ' score=' + g.score +
               ' streak=' + g.streak + ' st=' + g.houses.map(h => (h.angry ? 'X' : '') + h.state[0] + (h.bowl ? h.bowl.food : '-')).join('.'));
    }
  }
  log.push('end ' + g.scene + ' score=' + g.score + ' kept=' + g.houses.filter(h => !h.angry).length +
           ' cleared=' + g.bowlsCleared + ' bites=' + g.bites + ' perfects=' + g.perfects +
           ' misses=' + g.misses + ' caught=' + g.timesCaught + ' fox=' + g.foxLosses + ' bestMult=' + g.bestMult);
  return log;
}

const SKILLS = {
  novice: { sigma: 0.16, react: 0.65 },
  expert: { sigma: 0.025, react: 0.25 },
};
const RUNS = [];
for (const [k, s] of Object.entries(SKILLS))
  for (const style of ['cautious', 'greedy'])
    for (const seed of [11, 4242])
      RUNS.push({ name: k + '-' + style + '-' + seed, skill: s, style, seed });

console.log('\n=== GOLDEN PLAYTHROUGHS ===');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR);
for (const run of RUNS) {
  const log = playthrough(run.skill, run.style, run.seed);
  const file = path.join(DIR, run.name + '.log');
  if (UPDATE || !fs.existsSync(file)) {
    fs.writeFileSync(file, log.join('\n') + '\n');
    ok(true, run.name + ': recorded ' + log.length + ' lines (' + log[log.length - 1] + ')');
    continue;
  }
  const want = fs.readFileSync(file, 'utf8').trimEnd().split('\n');
  let i = 0;
  while (i < want.length && i < log.length && want[i] === log[i]) i++;
  const same = i === want.length && i === log.length;
  ok(same, run.name + (same ? ': identical (' + log.length + ' lines)'
    : ': differs at line ' + (i + 1) + '\n      want: ' + (want[i] || '(end)') + '\n      got:  ' + (log[i] || '(end)')));
}
report();
