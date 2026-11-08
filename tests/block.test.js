/* Lamplighter Block (src/core.js), tested directly against the core: the
   sight lines, the shape of the street, and the things that are true only
   because it has two roads rather than one. No canvas, no DOM.

   The street exists to answer one question -- is a shaped street worth
   anything -- so the thing this file guards hardest is that it is a fair
   comparison with Marrow Street: the same eight bowls and the same twenty
   sight lines, so nothing but the shape differs. */
require('./harness');
const C = require('../src/core.js');

const ST = C.BLOCK_STREET;
const DT = 1 / 60;
const fresh = (seed) => { let a = seed || 7; const rng = () => (a = (a * 1664525 + 1013904223) >>> 0) / 4294967296;
  const g = C.create({ rng, street: ST }); C.start(g); C.drainEvents(g); return g; };
const quiet = g => g.houses.forEach(h => { h.state = 'idle'; h.t = 9999; });
const run = (g, secs) => { for (let i = 0; i < Math.round(secs * 60); i++) { C.update(g, DT); C.drainEvents(g); } };
const onGround = (R, x, y) => { const p = C.clampToPaths(R, x, y); return Math.abs(p.x - x) < 1e-7 && Math.abs(p.y - y) < 1e-7; };

console.log('\n=== LAMPLIGHTER BLOCK: THE SHAPE ===');
{
  ok(C.validateStreet(ST).length === 0, 'Lamplighter Block is a valid street');
  const g = fresh(), m = C.create();
  const bowls = x => x.houses.filter(h => !h.venue).length;
  const lines = x => x.houses.reduce((n, h) => n + h.neighbours.length, 0);
  /* The comparison this street was built for. If either of these ever stops
     matching Marrow Street, a night here stops being a measurement of the
     shape and starts being a measurement of the size. */
  ok(bowls(g) === bowls(m), 'eight bowls, the same as Marrow Street (' + bowls(g) + ')');
  ok(lines(g) === lines(m), 'twenty sight lines, the same as Marrow Street (' + lines(g) + ')');
  ok(ST.houses.every(h => h.neighbours.length <= 3), 'no house needs more than the close-up\'s three windows');

  const R = g.routes;
  ok(R.stretches.length === 3 && R.links.length === 2, 'two roads and an alley, joined at both ends of it');
  ok(R.stretches.filter(s => s.roadX != null).length === 2, 'two of the three are runs of road; the alley is a crossing');
  ok(ST.width === 2 && ST.rows === 8, 'twice as wide as a one-road street, and twice as many rows to fill the screen');
  ok(g.houses.filter(h => h.run === 0).length === 5 && g.houses.filter(h => h.run === 1).length === 3,
     'five houses front the main road and three the back one');
}

console.log('\n=== LAMPLIGHTER BLOCK: SIGHT LINES ===');
{
  /* Every window sees exactly the bowls it should and no others, the same
     sweep the odd-shaped test street gets: hold one neighbour at the window,
     sit at a bowl, and see whether it catches you. */
  let all = true, none = true, wrong = '';
  for (let id = 0; id < ST.houses.length; id++) for (let w = 0; w < ST.houses.length; w++) {
    if (w === id) continue;
    const g = fresh(2); quiet(g);
    C.tapHouse(g, id);
    for (let i = 0; i < 60 * 40 && !g.eat; i++) { quiet(g); C.update(g, DT); C.drainEvents(g); }
    g.houses[w].state = 'watch'; g.houses[w].t = 9999;
    run(g, 1.5);
    const caught = g.scene === 'caught' && g.caught.witness === w;
    const should = ST.houses[id].neighbours.includes(w);
    if (should !== caught) {
      wrong = wrong || (ST.houses[w].name + (caught ? ' catches ' : ' cannot catch ') + ST.houses[id].name);
      if (caught) none = false; else all = false;
    }
  }
  ok(all && none, 'each window sees exactly the bowls it should' + (wrong ? ' -- ' + wrong : ''));
}
{
  /* The one sight line that crosses the block, and the reason the street is
     more than two lanes side by side: these two back onto each other, so a
     cat that is out of sight of the whole main road is still overlooked. */
  const g = fresh();
  const quill = g.houses[3], mullens = g.houses[5];
  ok(quill.run !== mullens.run, 'Mr Quill and The Mullens are on different roads');
  ok(C.isThreat(mullens, quill) && C.isThreat(quill, mullens), '... and still watch each other across the block');
  const far = [0, 1, 2, 4].every(i => !C.isThreat(g.houses[i], g.houses[6]) && !C.isThreat(g.houses[i], g.houses[7]));
  ok(far, 'nothing on the main road can see the two bowls at the top of the back one');
}

console.log('\n=== LAMPLIGHTER BLOCK: GETTING ABOUT ===');
{
  const g = fresh();
  const R = g.routes;
  const quill = C.bowlSpot(g.houses[3]), mullens = C.bowlSpot(g.houses[5]);
  /* Back to back, so almost touching, and a long walk apart. That gap is the
     whole point of giving a street a shape. */
  const crow = Math.hypot(mullens.x - quill.x, mullens.y - quill.y);
  const walk = C.routeDist(R, quill.x, quill.y, mullens.x, mullens.y);
  ok(crow < 0.6, 'Mr Quill and The Mullens are next to nothing apart as the crow flies (' + crow.toFixed(2) + ')');
  ok(walk > crow * 10, '... and a long way round by road (' + walk.toFixed(1) + ')');
  ok(C.routePath(R, quill.x, quill.y, mullens.x, mullens.y).some(p => p.y >= 7.0 && p.y <= 7.6),
     '... by way of the alley at the bottom, which is the only way through');

  /* The walk itself, not just the route: a real cat, watched every tick. */
  const g2 = fresh(5);
  g2.cat.x = quill.x; g2.cat.y = quill.y;
  quiet(g2);
  C.tapHouse(g2, 5);
  let off = null, arrived = false;
  for (let i = 0; i < 60 * 60 && !arrived; i++) {
    quiet(g2);
    C.update(g2, DT); C.drainEvents(g2);
    if (!onGround(g2.routes, g2.cat.x, g2.cat.y) && !off) off = { x: g2.cat.x, y: g2.cat.y };
    if (g2.eat && g2.eat.h.id === 5) arrived = true;
  }
  ok(arrived, 'the cat walks from one road to the other and sits down at the bowl');
  ok(!off, '... without once crossing the block' + (off ? ' (off at ' + off.x.toFixed(2) + ',' + off.y.toFixed(2) + ')' : ''));
}

console.log('\n=== LAMPLIGHTER BLOCK: RANKS AND WORDING ===');
{
  const R = C.ranksOf(ST);
  ok(R !== C.RANKS && R.length === C.RANKS.length, 'it has a ladder of its own, the same number of rungs as Marrow Street');
  /* Derived from this street's own night medians: expert careful bots sit at
     1649, so the top rung is reached on about half its nights, which is where
     Marrow Street (57%) and Terrace Row (49%) sit too. */
  ok(C.rankFor(0, ST) === R[0][1] && C.rankFor(1e6, ST) === R[R.length - 1][1], 'the ladder reads from the bottom rung to the top');
  ok(R[R.length - 1][0] < C.RANKS[C.RANKS.length - 1][0],
     'its top rung is lower than Marrow Street\'s, because the walk round the block is time not spent eating');
  ok(/Lamplighter Block/.test(R[R.length - 1][1]), 'the top rung is named after this street');
  ok(C.blurbFor(ST, 3) !== C.WAVES[3].blurb && !/Marrow/.test(C.blurbFor(ST, 3)), 'the last wave is worded for this street, not Marrow Street');
}

console.log('\n=== LAMPLIGHTER BLOCK: IN THE PICKER ===');
{
  ok(C.STREETS.includes(ST), 'the title screen lists it');
  ok(ST.wip === true, 'and tags it work in progress, because it is being played for the first time');
  /* Deliberately open: it is the street that most needs playing, and a rank
     gate on another one only gets in the way. Give it an unlock before it is
     anything other than work in progress. */
  ok(C.isUnlocked(ST, {}), 'it is open from the start while it is being playtested');
  ok(C.STREETS.filter(s => s.id === ST.id).length === 1 && ST.id === 'block', 'it has one id of its own');
}

report();
