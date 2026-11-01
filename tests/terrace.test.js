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
/* Both of these were found by the code review of the Terrace Row work. */
console.log('\n=== TERRACE ROW: THE DOG AND THE SHUT PUB ===');
{
  /* The dog puts the whole street at its windows. It used to do that to the
     pub as well, before last orders -- and watchersOfBowl only tests state,
     so the player was watched by a building drawn shuttered and dark. */
  const run = wave => {
    const g = fresh(); quiet(g); setWave(g, wave);
    g.dogTimer = 0;
    /* Run a few frames into the run phase: the frame that flips bark -> run
       returns before moving the dog, so the watching only starts after it. */
    let barked = false, ran = 0;
    for (let i = 0; i < 60 * 12 && ran < 3; i++) {
      C.update(g, DT); C.drainEvents(g);
      if (g.dog && g.dog.phase === 'bark') barked = true;
      if (g.dog && g.dog.phase === 'run') ran++;
    }
    return { g, barked, ran: ran >= 3, pub: g.houses[PUB] };
  };
  const shut = run(ST.houses[PUB].venue.from - 1);
  ok(shut.barked && shut.ran, 'the dog barks and runs before last orders');
  ok(shut.pub.state === 'idle', 'the dog does not bring a shut pub to its window');
  ok(!C.isOpen(shut.g, shut.pub), 'and the pub really is shut at that wave');
  for (let i = 0; i < N; i++) {
    ok(!C.watchersOfBowl(shut.g, shut.g.houses[i]).some(w => w.venue),
       'no bowl is watched by the shut pub while the dog runs (' + ST.houses[i].name + ')');
  }
  const open = run(ST.houses[PUB].venue.from);
  ok(open.pub.state === 'watch', 'but after last orders the dog does bring the pub to its window');
}

console.log('\n=== TERRACE ROW: A CLATTER REACHES THE PUB ===');
{
  /* makeNoise measured to a house's `row`, which for the pub is the top of a
     three-row span, so the far end of the terrace was out of reach of the one
     watcher that sees every bowl. Reach runs to 2.0 house-spacings at the
     widest (see makeNoise). */
  const REACH = 2.0, pub = ST.houses[PUB];
  for (let i = 0; i < N; i++) {
    const d = C.houseDist(ST.houses[i], pub);
    ok(d <= REACH, 'a clatter at ' + ST.houses[i].name + ' can reach the pub (' + d.toFixed(2) + ' <= ' + REACH + ')');
  }
  ok(C.houseDist(pub, pub) === 0, 'the pub is no distance from itself');
  /* Marrow Street has no venues, so nothing there may move. */
  const M = C.MARROW_STREET;
  ok(M.houses.every(a => M.houses.every(b =>
       C.houseDist(a, b) === Math.hypot(a.col - b.col, a.row - b.row))),
     'on a street without venues the distance is unchanged');
}

console.log('\n=== STREETS AND UNLOCKS ===');
{
  const M = C.MARROW_STREET, need = C.RANKS[ST.unlock.rank][0];
  ok(C.STREETS[0] === M && C.STREETS.includes(ST) && new Set(C.STREETS.map(s => s.id)).size === C.STREETS.length, 'the street list starts with Marrow Street and every street has its own id');
  ok(C.STREETS.every(s => C.validateStreet(s).length === 0), 'every listed street is valid');
  ok(C.isUnlocked(M, {}), 'Marrow Street is always open');
  ok(!C.isUnlocked(ST, {}) && !C.isUnlocked(ST, { marrow: need - 1 }), 'Terrace Row is shut until Marrow Street reaches ' + need);
  ok(C.isUnlocked(ST, { marrow: need }) && C.isUnlocked(ST, { marrow: 99999 }), 'Terrace Row opens at exactly that score');
  ok(!C.isUnlocked(ST, { terrace: 99999 }), 'a best on Terrace Row itself does not open it');
  ok(C.unlockHint(ST) === 'Reach ' + C.RANKS[ST.unlock.rank][1] + ' on Marrow Street' && C.unlockHint(M) === '', 'the hint names the rank and the street');
  ok(C.validateStreet(Object.assign({}, ST, { unlock: { street: 'x' } })).length > 0, 'the validator rejects a malformed unlock');
  const g = C.create();
  C.setStreet(g, ST);
  ok(g.street.name === 'Terrace Row' && g.houses.length === 6 && g.scene === 'title', 'setStreet swaps the street on the title screen');
  C.start(g);
  let msg = ''; try { C.setStreet(g, M); } catch (e) { msg = e.message; }
  ok(/in progress/.test(msg) && g.street.name === 'Terrace Row', 'setStreet refuses mid-round');
  g.scene = 'over'; C.toTitle(g);
  ok(g.scene === 'title', 'toTitle goes back from the results');
  C.setStreet(g, M); C.start(g);
  ok(g.houses.length === 8 && g.street === M, 'and back to Marrow Street');
}
report();
