/* The slow night (src/core.js, loop: 'night'), tested directly against the
   core. No canvas, no DOM.

   The loop under test: each house has one dinner, being caught shuts a house
   for a while rather than for good, and the night ends when the street has
   nothing left to offer, when the player slips away, or when the racket
   fetches the owner. The clock loop must be entirely unaffected. */
require('./harness');
const C = require('../src/core.js');

const DT = 1 / 60;
const N = C.NIGHT;
const fresh = (opts) => { let a = 7; const rng = () => (a = (a * 1664525 + 1013904223) >>> 0) / 4294967296;
  const g = C.create(Object.assign({ rng, loop: 'night' }, opts)); C.start(g); C.drainEvents(g); return g; };
const quiet = g => g.houses.forEach(h => { h.state = 'idle'; h.t = 9999; });
const run = (g, secs, each) => { for (let i = 0; i < Math.round(secs * 60); i++) { if (each) each(g); C.update(g, DT); C.drainEvents(g); } };

/* Walk to a house, start eating, then hold a neighbour at the window until
   the cat is caught there. Returns g.caught: note the loser is the WITNESS,
   not the house whose bowl it was -- the neighbour who saw you is the one who
   stops putting food out (getCaught). */
function catchAt(g, id) {
  const h = g.houses[id];
  const w = g.houses[h.neighbours.find(i => !g.houses[i].venue)];
  C.tapHouse(g, id);
  for (let i = 0; i < 60 * 20 && !g.eat; i++) { quiet(g); C.update(g, DT); C.drainEvents(g); }
  for (let i = 0; i < 60 * 20 && g.scene === 'play'; i++) {
    g.houses.forEach(x => { if (x !== w) { x.state = 'idle'; x.t = 9999; } });
    w.state = 'watch'; w.t = 9999;
    C.update(g, DT); C.drainEvents(g);
  }
  return g.caught;
}

console.log('\n=== COOLING OFF ===');
{
  const g = fresh();
  const caught = catchAt(g, 0);
  const h = g.houses[caught.loser];
  ok(g.scene === 'caught' && caught, 'the cat can be caught at a bowl');
  ok(caught.loser === caught.witness, 'the neighbour who saw you is the one who stops feeding you');
  ok(h.strikes === 1, 'the first catch is one strike (got ' + h.strikes + ')');
  ok(!h.angry, 'one fright does not anger a house for good');
  ok(h.shut > 0 && !h.bowl, 'it takes its bowl in and shuts for a while');

  run(g, N.SHUT_SECS + 6, quiet);
  ok(!h.angry && h.bowl, 'and puts a bowl back out once it has calmed down');
}
{
  /* the second fright is the one that ends it */
  const g = fresh();
  const first = catchAt(g, 0);
  run(g, N.SHUT_SECS + 6, quiet);
  const again = catchAt(g, 0);
  const h = g.houses[first.loser];
  ok(again.loser === first.loser, 'the same neighbour catches the cat again');
  ok(h.strikes === C.NIGHT.STRIKES, 'a second catch is the second strike');
  ok(h.angry, 'and that house stops feeding you for good');
  run(g, N.SHUT_SECS + 10, quiet);
  ok(!h.bowl, 'an angry house never puts another bowl out');
}
{
  /* the clock loop is untouched: one catch still angers outright */
  const g = (() => { let a = 7; const rng = () => (a = (a * 1664525 + 1013904223) >>> 0) / 4294967296;
    const x = C.create({ rng }); C.start(x); C.drainEvents(x); return x; })();
  const c = catchAt(g, 0);
  ok(!C.isNight(g) && g.houses[c.loser].angry, 'under the clock one catch still angers a house outright');
  ok(g.houses[c.loser].strikes === 0, 'and the clock loop never touches the strike count');
}

console.log('\n=== ONE DINNER PER HOUSE ===');
{
  const g = fresh();
  quiet(g);
  const h = g.houses[0];
  C.tapHouse(g, 0);
  for (let i = 0; i < 60 * 30 && !h.cleared; i++) { quiet(g); if (g.eat) C.tapEat(g, g.eat.zone + g.eat.zoneW / 2); C.update(g, DT); C.drainEvents(g); }
  ok(h.cleared, 'eating a bowl to the bottom settles the house');
  run(g, 20, quiet);
  ok(!h.bowl, 'a settled house puts out no more bowls tonight');
  ok(C.progress(g).cleared === 1 && C.progress(g).total === g.houses.filter(x => !x.venue).length,
     'progress() counts it as one of the street');
}

console.log('\n=== HOW THE NIGHT ENDS ===');
{
  /* nothing left: every house settled */
  const g = fresh(); quiet(g);
  g.houses.forEach(h => { if (!h.venue) { h.cleared = true; h.bowl = null; } });
  C.update(g, DT);
  ok(g.scene === 'over', 'the night ends when every house is settled');
  ok(g.ending === 'cleared', 'and reports a cleared street (got ' + g.ending + ')');
}
{
  /* a shut house is NOT settled: there is still something to wait for */
  const g = fresh(); quiet(g);
  g.houses.forEach((h, i) => { if (!h.venue && i > 0) { h.cleared = true; h.bowl = null; } });
  g.houses[0].shut = 10; g.houses[0].bowl = null;
  C.update(g, DT);
  ok(g.scene === 'play', 'a house that is only cooling off does not end the night');
}
{
  /* slipping away is the player's call */
  const g = fresh(); quiet(g);
  ok(C.slipAway(g) === true, 'the player can slip away mid-round');
  ok(g.scene === 'over' && g.ending === 'slipped', 'which ends the night as slipped away');
  ok(C.slipAway(g) === false, 'and cannot slip away twice');
}
{
  /* the racket fetches the owner */
  const g = fresh(); quiet(g);
  g.racket = 1;
  run(g, 0.2, quiet);
  ok(g.scene === 'pickup' || g.scene === 'over', 'a full racket meter brings the owner out');
  ok(g.ending === 'owner', 'and the night is recorded as the owner finding you');
}
{
  /* the clock loop still ends on the clock */
  const g = (() => { let a = 7; const rng = () => (a = (a * 1664525 + 1013904223) >>> 0) / 4294967296;
    const x = C.create({ rng }); C.start(x); C.drainEvents(x); return x; })();
  quiet(g);
  g.timeLeft = 0.02;
  run(g, 0.5, quiet);
  ok(g.scene === 'pickup', 'under the clock the owner still arrives when time runs out');
}

console.log('\n=== THE RACKET ===');
{
  const g = fresh(); quiet(g);
  const before = g.racket;
  run(g, 10, quiet);
  ok(g.racket > before, 'the night wears on even when nothing goes wrong');
  ok(g.racket < 0.1, 'but slowly: a quiet cat gets a long night (' + g.racket.toFixed(3) + ')');

  const g2 = fresh(); quiet(g2);
  C.tapHouse(g2, 0);
  for (let i = 0; i < 60 * 20 && !g2.eat; i++) { quiet(g2); C.update(g2, DT); C.drainEvents(g2); }
  const r = g2.racket;
  C.tapEat(g2, g2.eat.zone > 0.5 ? 0.01 : 0.99);      /* deliberately miss */
  ok(g2.misses === 1 && g2.racket > r, 'a missed bite carries to whoever is looking for you');
}

console.log('\n=== WAVES FOLLOW PROGRESS, NOT A CLOCK ===');
{
  const g = fresh(); quiet(g);
  const hs = g.houses.filter(h => !h.venue);
  ok(C.waveByProgress(g) === 0, 'an untouched street is at the first wave');
  hs.forEach(h => { h.cleared = true; });
  ok(C.waveByProgress(g) === 3, 'a street worked right through is at the last');
  hs.forEach((h, i) => { h.cleared = i < Math.floor(hs.length / 2); });
  ok(C.waveByProgress(g) === 2, 'and halfway through is halfway up (got ' + C.waveByProgress(g) + ')');
  ok(C.progress(g).cleared === Math.floor(hs.length / 2), 'progress() counts the houses you got');
}

console.log('\n=== THE FOX RACES YOU FOR A BOWL, IT DOES NOT SHARE IT ===');
{
  /* The endgame leaves one bowl on the street. The fox used to camp it, eat a
     ball a second out from under the cat and throw it off when the bowl
     emptied, so the last house could not be won. */
  const g = fresh();
  const hs = g.houses.filter(h => !h.venue);
  hs.forEach((h, i) => { if (i > 0) { h.cleared = true; h.bowl = null; } });   /* one bowl left */
  ok(C.waveByProgress(g) === 3 && C.WAVES[3].fox, 'the last house falls in a wave with a fox about');

  const last = hs[0];
  C.tapHouse(g, last.id);
  for (let i = 0; i < 60 * 20 && !g.eat; i++) { quiet(g); C.update(g, DT); C.drainEvents(g); }
  ok(g.eat && g.eat.h === last, 'the cat sits down at the last bowl');

  /* Count only what happens once the cat is down: the fox winning the race to
     an unattended bowl on the way over is the mechanic working, not a bug. */
  const food = last.bowl.food, lostBefore = g.foxLosses, caughtBefore = g.timesCaught;
  /* hold the dog off: it puts every house at its window, which would have the
     cat caught and off the bowl, and then the bowl is simply unattended */
  const noDog = x => { quiet(x); x.dogTimer = 1e9; x.dog = null; };
  run(g, 25, noDog);                       /* long enough for the fox to cross the street twice */
  ok(g.timesCaught === caughtBefore, 'the cat is left alone to eat');
  ok(g.fox, 'the fox is on the street');
  ok(g.foxLosses === lostBefore, 'it does not rob the bowl the cat is sitting at (lost ' +
     (g.foxLosses - lostBefore) + ' after sitting down)');
  ok(last.bowl && last.bowl.food === food, 'not a single ball goes missing from it');
  ok(g.eat && g.eat.h === last, 'and the cat is never thrown off its meal');
}
{
  /* unattended bowls are still fair game, or the fox is not competition */
  const g = fresh();
  const hs = g.houses.filter(h => !h.venue);
  hs.forEach((h, i) => { if (i > 0) { h.cleared = true; h.bowl = null; } });
  run(g, 40, quiet);                       /* nobody is eating: the fox helps itself */
  ok(g.foxLosses > 0, 'a bowl nobody is sitting at is still robbed');
}

console.log('\n=== THE LESSON IS ALWAYS ON THE CLOCK ===');
{
  const g = fresh({ practice: true });
  ok(!C.isNight(g), 'the first-launch lesson ignores the slow night');
}
report();
