/* Terrace Row (src/core.js), tested directly against the core: the sight lines
   (who can see whose bowl, like the old geometry test did for Marrow Street)
   and the pub's rules. No canvas, no DOM. */
require('./harness');
const C = require('../src/core.js');

const ST = C.TERRACE_STREET, PUB = ST.houses.findIndex(h => h.venue), N = PUB;   // houses 0..N-1 have bowls
const DT = 1 / 60;
const fresh = () => { let a = 7; const rng = () => (a = (a * 1664525 + 1013904223) >>> 0) / 4294967296;
  const g = C.create({ rng, street: ST }); C.start(g); C.drainEvents(g); return g; };
const quiet = g => g.houses.forEach(h => { h.state = 'idle'; h.t = 9999; });
const setWave = (g, i) => { g.waveIdx = i; g.timeLeft = 120 - i * 30 - 1; g.dogTimer = 1e9; };
const sees = (g, owner) => g.houses.filter(w => C.isThreat(w, g.houses[owner])).map(w => w.id).sort((a, b) => a - b);

console.log('\n=== TERRACE ROW: SIGHT LINES ===');
ok(C.validateStreet(ST).length === 0, 'Terrace Row is a valid street');
ok(PUB === 5 && ST.houses.length === 6, 'five terrace houses and the pub');
for (let i = 0; i < N; i++) {
  const want = [i - 1, i + 1].filter(j => j >= 0 && j < N).concat(PUB).sort((a, b) => a - b);
  const got = sees(fresh(), i);
  ok(JSON.stringify(got) === JSON.stringify(want), ST.houses[i].name + ' is seen by exactly ' + want.join(',') + ' (got ' + got.join(',') + ')');
}
{
  const g = fresh();
  ok(g.houses[PUB].neighbours.length === N && g.houses[PUB].neighbours.every(i => i < N), 'the pub watches every terrace bowl');
  ok(ST.houses.every(h => h.venue || h.neighbours.length <= 3), 'no house needs more than the close-up\'s three windows');
  ok(g.houses.every((h, i) => h.venue ? !h.bowl : h.bowl), 'the pub has no bowl, every terrace house has one');
}

console.log('\n=== TERRACE ROW: THE PUB ===');
{
  const g = fresh(); quiet(g);
  g.houses[PUB].t = 0;
  for (let i = 0; i < 120; i++) { g.houses[PUB].t = Math.min(g.houses[PUB].t, 0); C.update(g, DT); }
  ok(g.houses[PUB].state === 'idle', 'the pub is shut before last orders, whatever its timer says');
  setWave(g, ST.houses[PUB].venue.from);
  g.houses[PUB].t = 0; C.update(g, DT);
  ok(g.houses[PUB].state === 'stir', 'at last orders the pub starts to stir');
}
{
  const g = fresh(); quiet(g); setWave(g, 2);
  C.tapHouse(g, PUB);
  ok(!g.cat.target, 'tapping the pub does nothing: there is no bowl');
}
{
  /* the pub catching you: you are grassed up, and the pub itself loses nothing */
  const g = fresh(); quiet(g); setWave(g, 2);
  C.tapHouse(g, 2); for (let i = 0; i < 600 && !g.eat; i++) { quiet(g); C.update(g, DT); }
  g.houses[PUB].state = 'watch'; g.houses[PUB].t = 9999;
  for (let i = 0; i < 120 && g.scene === 'play'; i++) C.update(g, DT);
  ok(g.scene === 'caught' && g.caught.witness === PUB, 'the pub can catch you');
  ok(g.caught.grass && g.caught.loser === 2 && g.houses[2].angry && !g.houses[PUB].angry, 'the owner of the bowl loses it, not the pub');
}
{
  /* the round ends when every terrace house is angry: the pub never is */
  const g = fresh(); quiet(g);
  g.houses.forEach(h => { if (!h.venue) h.angry = true; });
  C.update(g, DT);
  ok(g.scene === 'over', 'all five houses angry ends the round');
  ok(g.keptBonus === 0, 'the pub earns no kept-neighbour bonus');
}
{
  const g = fresh(); quiet(g); g.timeLeft = 0.01; C.update(g, 1); C.update(g, 6);
  ok(g.scene === 'over' && g.keptBonus === N * C.KEPT_BONUS, 'kept bonus counts the five houses, not the pub');
}
{
  const g = fresh();
  for (let i = 0; i < 60 * 5; i++) C.update(g, DT);
  ok(!g.houses[PUB].bowl, 'the pub never grows a bowl');
}
console.log('\n=== TERRACE ROW: RANKS AND WORDING ===');
{
  const R = ST.ranks;
  ok(R.length === C.RANKS.length && R.every((r, i) => i === 0 || r[0] > R[i - 1][0]), 'the terrace ladder has as many rungs as Marrow\'s, rising');
  ok(C.rankFor(0, ST) === R[0][1] && C.rankFor(R[2][0], ST) === R[2][1] && C.rankFor(99999, ST) === R[R.length - 1][1], 'rankFor reads the street\'s ladder');
  ok(C.rankFor(1400) === C.RANKS[2][1] && C.rankFor(1400, C.MARROW_STREET) === C.RANKS[2][1], 'Marrow Street and no street at all use RANKS');
  ok(C.rankFor(R[2][0], ST) !== C.rankFor(R[2][0]), 'the same score ranks higher here, where bowls are fewer');
  ok(!/Marrow/.test(JSON.stringify(R)) && !/Marrow/.test(JSON.stringify(ST.waveBlurbs)), 'no Marrow Street wording on Terrace Row');
  ok([0, 1, 2, 3].every(i => !/Marrow/.test(C.blurbFor(ST, i))), 'no wave blurb names Marrow Street');
  ok(C.blurbFor(C.MARROW_STREET, 3) === C.WAVES[3].blurb, 'Marrow Street keeps the stock wave blurbs');
  ok(/STAG/.test(C.blurbFor(ST, ST.houses[PUB].venue.from)), 'the wave the pub opens in says so');
}
report();
