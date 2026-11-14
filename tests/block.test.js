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
const byName = n => ST.houses.findIndex(h => h.name === n);
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
  ok(R.stretches.length === 5 && R.links.length === 6, 'two roads and three alleys, each alley joined to both roads');
  ok(R.stretches.filter(s => s.roadX != null).length === 2, 'two of the five are runs of road; the alleys are crossings');
  ok(ST.width === 2 && ST.rows === 8, 'twice as wide as a one-road street, and twice as many rows to fill the screen');
  ok(g.houses.filter(h => h.run === 0).length === 4 && g.houses.filter(h => h.run === 1).length === 4,
     'four houses front each road, so neither is the detour');
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
  /* The sight lines that cross the block, and the reason the street is more
     than two lanes side by side: each pair backs onto each other, so a cat
     that is out of sight of its whole road is still overlooked. */
  const g = fresh();
  const quill = g.houses[byName('Mr Quill')], mullens = g.houses[byName('The Mullens')];
  ok(quill.run !== mullens.run, 'Mr Quill and The Mullens are on different roads');
  ok(C.isThreat(mullens, quill) && C.isThreat(quill, mullens), '... and still watch each other across the block');
  const across = [];
  g.houses.forEach(a => g.houses.forEach(b => { if (a.id < b.id && a.run !== b.run && C.isThreat(a, b)) across.push(a.name + ' / ' + b.name); }));
  ok(across.length === 2 && across.every(p => /Quill.*Mullens|Rook.*Dobsons/.test(p)),
     'only the two back-to-back pairs see across the block (' + across.join(', ') + ')');
}

console.log('\n=== LAMPLIGHTER BLOCK: GETTING ABOUT ===');
{
  const g = fresh();
  const R = g.routes;
  const quill = C.bowlSpot(g.houses[byName('Mr Quill')]), mullens = C.bowlSpot(g.houses[byName('The Mullens')]);
  /* Back to back, so almost touching, and a walk apart. That gap is the
     point of giving a street a shape. */
  const crow = Math.hypot(mullens.x - quill.x, mullens.y - quill.y);
  const walk = C.routeDist(R, quill.x, quill.y, mullens.x, mullens.y);
  ok(crow < 0.6, 'Mr Quill and The Mullens are next to nothing apart as the crow flies (' + crow.toFixed(2) + ')');
  ok(walk > crow * 5, '... and several times that by road (' + walk.toFixed(1) + ')');
  ok(C.routePath(R, quill.x, quill.y, mullens.x, mullens.y).some(p => p.y >= 0.4 && p.y <= 1.0),
     '... by way of the top alley, the nearest of the three');

  /* What the street was rebuilt for. As a horseshoe -- one alley, at the far
     end from the back road's bowls -- the average walk between two bowls was
     6.8 against Marrow Street's 1.5 and the worst was 14: the first playtest
     called it a lot of back and forth on a long path, and it was. This is
     the guard on that: at the street's pace, a hop here must take about what
     a hop on Marrow Street takes, and no bowl may be a trek from any other.
     With the old layout put back at this pace, this reads 3.40 against 1.52. */
  const hops = (gg) => {
    const bs = gg.houses.filter(h => !h.venue).map(h => C.bowlSpot(h)), pace = gg.street.pace || 1;
    let sum = 0, n = 0, max = 0;
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const d = C.routeDist(gg.routes, bs[i].x, bs[i].y, bs[j].x, bs[j].y) / pace; sum += d; n++; max = Math.max(max, d);
    }
    return { mean: sum / n, max };
  };
  const here = hops(g), marrow = hops(C.create());
  ok(here.mean < marrow.mean * 1.15, 'the average hop between bowls takes about what it does on Marrow Street (' +
     here.mean.toFixed(2) + ' against ' + marrow.mean.toFixed(2) + ', at this street\'s pace)');
  ok(here.max < marrow.max * 1.15, 'and the longest is no trek (' + here.max.toFixed(2) + ' against ' + marrow.max.toFixed(2) + ')');
  ok(ST.pace === ST.width, 'the pace matches the width: drawn at half size, so twice as fast across the ground');
  {
    /* ... and the cat really does keep it: a second's walk down the road */
    const g3 = fresh(3); quiet(g3); g3.cat.x = 0.5; g3.cat.y = 1.5;
    C.tapRoad(g3, 0.5, 7.5);
    for (let i = 0; i < 60; i++) { quiet(g3); C.update(g3, DT); C.drainEvents(g3); }
    ok(Math.abs((g3.cat.y - 1.5) - C.CAT_SPEED * ST.pace) < 0.05, 'the cat covers ' + (g3.cat.y - 1.5).toFixed(2) + ' a second, twice what it does on Marrow Street');
  }

  /* The walk itself, not just the route: a real cat, watched every tick. */
  const g2 = fresh(5);
  g2.cat.x = quill.x; g2.cat.y = quill.y;
  quiet(g2);
  C.tapHouse(g2, byName('The Mullens'));
  let off = null, arrived = false;
  for (let i = 0; i < 60 * 60 && !arrived; i++) {
    quiet(g2);
    C.update(g2, DT); C.drainEvents(g2);
    if (!onGround(g2.routes, g2.cat.x, g2.cat.y) && !off) off = { x: g2.cat.x, y: g2.cat.y };
    if (g2.eat && g2.eat.h.id === byName('The Mullens')) arrived = true;
  }
  ok(arrived, 'the cat walks from one road to the other and sits down at the bowl');
  ok(!off, '... without once crossing the block' + (off ? ' (off at ' + off.x.toFixed(2) + ',' + off.y.toFixed(2) + ')' : ''));
}

console.log('\n=== LAMPLIGHTER BLOCK: THE DOG ===');
{
  /* The dog ran the main road only, while every house on both roads went to
     its window for it. It runs the whole block now: one road, the bottom
     alley, the other road. Watched every tick, both ways round. */
  const seen = { 1: null, '-1': null };
  for (let seed = 1; seed < 40 && !(seen[1] && seen[-1]); seed++) {
    const g = fresh(seed); quiet(g); C.lockWave(g, 1);
    let first = null, runs = new Set(), off = 0, across = 0, secs = 0, left = false;
    for (let i = 0; i < 60 * 60; i++) {
      quiet(g); C.update(g, DT); C.drainEvents(g);
      const d = g.dog;
      if (!d) { if (first) break; continue; }
      if (d.phase !== 'run') continue;
      if (!first) first = { x: d.x, dir: d.dir };
      secs += DT;
      const b = g.routes.bounds.y;
      if (d.y >= b[0] && d.y <= b[1]) {
        if (!onGround(g.routes, d.x, d.y)) off++;
        if (Math.abs(d.x - 0.5) < 1e-6) runs.add('main');
        if (Math.abs(d.x - 1.5) < 1e-6) runs.add('back');
        if (d.x > 0.75 && d.x < 1.25) across++;
        if (d.face === -1) left = true;
      }
    }
    if (first && !seen[first.x < 1 ? 1 : -1]) seen[first.x < 1 ? 1 : -1] = { runs, off, across, secs, left, dir: first.dir };
  }
  const a = seen[1], b = seen[-1];
  ok(!!a && !!b, 'the dog comes on at either road, depending on the night');
  ok(a && b && a.runs.size === 2 && b.runs.size === 2, 'and runs both roads whichever it starts on');
  ok(a && b && a.across > 0 && b.across > 0 && a.off === 0 && b.off === 0, '... by the alley, never off the ground a cat could walk on');
  ok(a && b && a.dir === 1 && b.dir === 1, 'it comes on from the top either way, which is where the warning is drawn');
  ok(b && b.left && a && !a.left, 'and faces the way it is going through the alley');
  /* everyone is at the window for as long as it runs, so the run must not be
     the length of the street at Marrow Street's speed: that was 6.5s */
  ok(a && a.secs < 3.6, 'the whole run is over in a few seconds (' + (a ? a.secs.toFixed(1) : '-') + 's), because the dog keeps the street\'s pace');
}

console.log('\n=== LAMPLIGHTER BLOCK: RANKS AND WORDING ===');
{
  const R = C.ranksOf(ST);
  ok(R !== C.RANKS && R.length === C.RANKS.length, 'it has a ladder of its own, the same number of rungs as Marrow Street');
  /* Derived from this street's own night medians. As a horseshoe its top
     rung sat well under Marrow Street's, because the walk round the block was
     time not spent eating; as a ladder the same play pays the same, so the
     two top rungs have to be close or the street is stingy again. */
  ok(C.rankFor(0, ST) === R[0][1] && C.rankFor(1e6, ST) === R[R.length - 1][1], 'the ladder reads from the bottom rung to the top');
  const top = R[R.length - 1][0], mTop = C.RANKS[C.RANKS.length - 1][0];
  ok(Math.abs(top - mTop) / mTop < 0.1, 'its top rung is within a tenth of Marrow Street\'s: the shape is not a tax on the score (' + top + ' against ' + mTop + ')');
  ok(/Lamplighter Block/.test(R[R.length - 1][1]), 'the top rung is named after this street');
  ok(C.blurbFor(ST, 3) !== C.WAVES[3].blurb && !/Marrow/.test(C.blurbFor(ST, 3)), 'the last wave is worded for this street, not Marrow Street');
}

console.log('\n=== LAMPLIGHTER BLOCK: IN THE LAB ===');
{
  /* It used to say "the title screen lists it", which stopped being true the
     day it moved behind THE LAB and nothing noticed: being in C.STREETS is
     not being in the picker, and the assertion read like a guard on the one
     while only ever testing the other. Where it shows is the renderer's
     business, and tests/title.js is what measures it. */
  ok(C.STREETS.includes(ST), 'the game knows about it');
  ok(ST.lab === true, 'and it lives behind THE LAB, not in the street picker, while it is half built');
  ok(ST.wip === true, 'and tags it work in progress, because it is being played for the first time');
  /* Deliberately open: it is the street that most needs playing, and a rank
     gate on another one only gets in the way. Give it an unlock before it is
     anything other than work in progress. */
  ok(C.isUnlocked(ST, {}), 'it is open from the start while it is being playtested');
  ok(C.STREETS.filter(s => s.id === ST.id).length === 1 && ST.id === 'block', 'it has one id of its own');
}

console.log('\n=== EVERY STREET: NO HOLES IN THE ROW ===');
{
  /* Four cells of this block were never filled in -- the strip between the
     roads at row 5 on one side, rows 2 and 4 on the other -- so the street had
     bare gaps mid-block, which is the one thing the `block` scenery exists to
     prevent. Nothing was looking, because scenery is renderer-only and no rule
     reads it.
     So: every row, on both sides of every run of road, must be a house, part
     of a venue's span, or scenery -- unless a crossing takes that ground, the
     way the alley takes row 7 of the two middle strips. Swept over every
     street, because the rule is not this street's: it is what makes a row
     read as a street rather than a mistake. */
  const holes = [];
  for (const st of C.STREETS) {
    const g = C.create({ street: st });
    const runs = g.routes.stretches.filter(s => s.roadX != null);
    const crossings = g.routes.stretches.filter(s => s.roadX == null);
    for (const run of runs) for (const side of [-1, 1]) for (let row = 0; row < st.rows; row++) {
      const taken = (st.houses || []).some(h => {
        if (h.side !== side) return false;
        const hr = g.houses[st.houses.indexOf(h)];
        if (!hr || (g.routes.stretches[hr.run] || runs[0]) !== run) return false;
        const span = (h.venue && h.venue.span) || 1;
        return row >= h.row && row < h.row + span;
      }) || (st.scenery || []).some(sc => {
        if (sc.side !== side) return false;
        const on = sc.on !== undefined ? g.routes.stretches.find(x => x.id === sc.on) : runs[0];
        return on === run && sc.row === row;
      });
      /* a crossing reaching into this strip is ground, not a hole: the probe
         sits just off the kerb on the side being checked */
      const probe = run.roadX + side * 0.12;
      const crossed = crossings.some(c => probe >= c.x[0] && probe <= c.x[1] && c.y[0] < row + 1 && c.y[1] > row);
      if (!taken && !crossed) holes.push(st.id + ' ' + run.id + ' side ' + side + ' row ' + row);
    }
  }
  ok(holes.length === 0, 'every row on every side of every road is a house or something to look at' +
     (holes.length ? ' -- bare: ' + holes.join(', ') : ''));
}

console.log('\n=== LAMPLIGHTER BLOCK: WALKING OFF AT THE END ===');
{
  /* The walk off at the end of a night drifted to street.roadX -- the main
     road -- so a cat leaving from the back one was dragged straight through
     the middle of the block, on camera, with the send-off following it.
     It leaves along the road it is standing on now. */
  const g = fresh(5); quiet(g);
  const back = g.routes.stretches.find(s => s.id === 'back');
  g.cat.x = back.roadX; g.cat.y = 2.5; g.cat.target = null;
  g.houses.forEach(h => { if (!h.venue) { h.cleared = true; h.bowl = null; } });
  run(g, 1 / 60);                       /* the settled street starts the send-off */
  ok(g.scene === 'leaving', 'a settled street starts the send-off');
  ok(Math.abs(g.leave.roadX - back.roadX) < 1e-9, 'and it leaves along the back road, the one it was standing on');
  let off = 0, frames = 0, crossed = 0;
  const bounds = g.routes.bounds.y;
  for (let i = 0; i < 60 * 4 && g.scene === 'leaving'; i++) {
    C.update(g, DT); C.drainEvents(g);
    frames++;
    /* past the end of the road it is off the map on purpose; while it is
       still beside the street it must be on ground it could walk on */
    if (g.cat.y >= bounds[0] && g.cat.y <= bounds[1] && !onGround(g.routes, g.cat.x, g.cat.y)) off++;
    if (g.cat.x < 1.0) crossed++;       /* 1.0 is inside the block between the two roads */
  }
  ok(frames > 30, 'the send-off runs for a while (' + frames + ' frames)');
  ok(off === 0, 'the cat is never off walkable ground on its way out (' + off + ' of ' + frames + ' frames)');
  ok(crossed === 0, 'and never crosses into the block between the roads');
}

report();
