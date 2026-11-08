/*
 * Walking routes (#7, phase 3), tested directly against src/core.js.
 *
 * A street's walkable ground is a list of convex rectangles -- stretches --
 * joined by links. The question this file answers is the one that matters on
 * a street that bends: does a character go round the houses or through them?
 *
 * It is tested two ways on purpose. The route functions are asked what the
 * way round is, and then a real cat and a real fox are set loose on Bent Lane
 * and watched every single tick: a route that is right on paper and a walk
 * that leaves the pavement are different bugs, and only the second one is
 * what a player would see.
 *
 * The other half of the job is what did NOT change. Marrow Street and Terrace
 * Row are one run of road, every route on them is a straight line, and the
 * twelve golden playthroughs must stay identical -- so "a street with nothing
 * in the way is asked for no corners at all" is a test here as well as a
 * promise in the comments.
 */
require('./harness');
const C = require('../src/core.js');
const BENT = require('./bent.js');
const LANE = require('./streets.js');

const DT = 1 / 60;
const EPS = 1e-9;
const fresh = (street, seed) => {
  let a = seed || 7; const rng = () => (a = (a * 1664525 + 1013904223) >>> 0) / 4294967296;
  const g = C.create({ street, rng }); C.start(g); C.drainEvents(g); return g;
};
const quiet = g => g.houses.forEach(h => { h.state = 'idle'; h.t = 9999; });

/* Is this spot ground a character may stand on? clampToPaths moves a spot
   that is not, and leaves one that is exactly where it was. */
function onGround(R, x, y) {
  const p = C.clampToPaths(R, x, y);
  return Math.abs(p.x - x) < 1e-7 && Math.abs(p.y - y) < 1e-7;
}
/* Every point along a straight leg, at a finer step than anything walks. */
function legOnGround(R, a, b) {
  const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.005));
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    if (!onGround(R, a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k)) return false;
  }
  return true;
}
function walkOnGround(R, from, path) {
  let at = from;
  for (const p of path) { if (!legOnGround(R, at, p)) return false; at = p; }
  return true;
}

const BR = C.buildRoutes(BENT);
const PIKE = { x: 0.29, y: 0.5 };      /* house 0, on the main run */
const WREN = { x: 0.95, y: 1.5 };      /* house 5, up the cul-de-sac, level with it */

console.log('\n=== BENT LANE: ROUND THE HOUSES, NOT THROUGH THEM ===');
{
  ok(C.validateStreet(BENT).length === 0, 'Bent Lane (tests/bent.js) is a valid street');
  ok(!BR.single && BR.stretches.length === 3 && BR.links.length === 2, 'its ground is three stretches joined by two links');

  /* The test only means something if the short way is genuinely barred. If
     this ever passes, the street has been reshaped and the rest of this
     section is measuring nothing. */
  ok(!legOnGround(BR, PIKE, WREN), 'the straight line from Pike\'s to Wren Cottage leaves the ground, so there is something to go round');

  const path = C.routePath(BR, PIKE.x, PIKE.y, WREN.x, WREN.y);
  ok(path.length === 3, 'the route from Pike\'s to Wren Cottage turns two corners');
  ok(walkOnGround(BR, PIKE, path), '... and every step of it stays on walkable ground');
  ok(path.some(p => p.y >= 4.2 && p.y <= 4.6), '... by way of the cut-through at the bottom');
  ok(path[path.length - 1].x === WREN.x && path[path.length - 1].y === WREN.y, '... and it ends at the bowl');

  const crow = Math.hypot(WREN.x - PIKE.x, WREN.y - PIKE.y);
  ok(C.routeDist(BR, PIKE.x, PIKE.y, WREN.x, WREN.y) > crow * 4, 'the walk round is far longer than the crow flight, which is the point of a cul-de-sac');

  /* Both ways round cost the same: a route that is cheaper one way than the
     other would have the fox preferring bowls by which end it started from. */
  const there = C.routeDist(BR, PIKE.x, PIKE.y, WREN.x, WREN.y);
  const back  = C.routeDist(BR, WREN.x, WREN.y, PIKE.x, PIKE.y);
  ok(Math.abs(there - back) < 0.02, 'the walk costs the same in both directions');

  /* Two bowls on the same run have nothing between them. */
  const larks = { x: 0.71, y: 1.5 };
  ok(C.routeNext(BR, PIKE.x, PIKE.y, larks.x, larks.y) === null, 'two bowls on the same run of road are a straight line apart');
  ok(C.routeDist(BR, PIKE.x, PIKE.y, larks.x, larks.y) === Math.hypot(larks.x - PIKE.x, larks.y - PIKE.y),
     '... and cost exactly the crow flight, not a sum of legs that rounds differently');

  /* Coming from off the map -- which is how the fox arrives -- is a straight
     line in, not a refusal to move. */
  ok(C.routeNext(BR, 0.5, -0.6, 0.29, 0.5) === null, 'a character walking on from beyond the end of the road heads straight in');
}

console.log('\n=== A REAL CAT, WATCHED EVERY TICK ===');
{
  /* The route functions can be right while the walk is wrong: a step that
     overshoots a corner, or a stall at a junction. So this walks the cat the
     length of the street and looks at where it actually is, 60 times a
     second. */
  const g = fresh(BENT, 3);
  g.cat.x = PIKE.x; g.cat.y = PIKE.y;
  quiet(g);
  C.tapHouse(g, 5);                        /* Wren Cottage, round the corner */
  let off = null, moved = 0, reached = false, lastY = g.cat.y;
  for (let i = 0; i < 60 * 40 && !reached; i++) {
    quiet(g);
    C.update(g, DT); C.drainEvents(g);
    if (!onGround(g.routes, g.cat.x, g.cat.y) && !off) off = { x: g.cat.x, y: g.cat.y, t: i / 60 };
    if (g.cat.y !== lastY) { moved++; lastY = g.cat.y; }
    if (g.eat && g.eat.h.id === 5) reached = true;
  }
  ok(reached, 'the cat gets to a bowl that is round two corners and sits down at it');
  ok(!off, 'the cat never leaves walkable ground on the way' + (off ? ' (off at ' + off.x.toFixed(3) + ',' + off.y.toFixed(3) + ' after ' + off.t.toFixed(1) + 's)' : ''));
  ok(moved > 60, '... and it walks the whole way rather than stalling at a junction');
}

console.log('\n=== A REAL FOX, WATCHED EVERY TICK ===');
{
  /* The fox is the other thing that crosses the street on its own.
     Left to itself on this street it works the run it is standing on and
     never goes near the cul-de-sac, so watching it prowl proves nothing --
     the first version of this test passed happily with the fox's routing
     taken out again. So the street is emptied until the ONLY bowl left is
     the one round two corners, and the fox has no choice but to walk there. */
  const g = fresh(BENT, 11);
  C.lockWave(g, 2);                        /* the wave the fox turns up in */
  C.update(g, DT); C.drainEvents(g);       /* ...which is when it walks on */
  ok(!!g.fox, 'the fox turns up on Bent Lane');
  g.houses.forEach(h => { if (h.id !== 5) { h.bowl = null; h.cleared = true; } });
  g.fox.x = 0.5; g.fox.y = 1.0;            /* on the main run, level with the cul-de-sac */
  g.fox.target = null;

  let off = null, reached = false;
  for (let i = 0; i < 60 * 90 && !reached; i++) {
    quiet(g);
    C.update(g, DT); C.drainEvents(g);
    if (!g.fox) continue;
    if (!onGround(g.routes, g.fox.x, g.fox.y) && !off) off = { x: g.fox.x, y: g.fox.y, t: i / 60 };
    if (Math.hypot(g.fox.x - WREN.x, g.fox.y - WREN.y) < 0.05) reached = true;
  }
  ok(reached, 'the fox gets to the only bowl left, which is round two corners');
  ok(!off, 'and it never crosses ground nothing walks on' + (off ? ' (off at ' + off.x.toFixed(3) + ',' + off.y.toFixed(3) + ' after ' + off.t.toFixed(1) + 's)' : ''));

  /* A bowl that is nearer as the crow flies but round two corners must not
     be the one it picks over a bowl on its own run. */
  const R = g.routes;
  const atLarks = C.routeDist(R, 0.5, 1.5, 0.71, 1.5);
  const atWren  = C.routeDist(R, 0.5, 1.5, WREN.x, WREN.y);
  ok(atLarks < atWren, 'from the middle of the main run, The Larks is nearer than Wren Cottage by the walk');
  ok(Math.hypot(WREN.x - 0.5, 0) < 0.5, '... though Wren Cottage is the one that looks closer on the map');
}

console.log('\n=== TAPS LAND ON GROUND THAT EXISTS ===');
{
  const g = fresh(BENT, 5);
  C.tapRoad(g, 0.5, 9);                    /* off the bottom of the street */
  ok(onGround(g.routes, g.cat.target.x, g.cat.target.y), 'a tap past the end of the road lands on walkable ground');
  C.tapRoad(g, 0.76, 2.0);                 /* the cul-de-sac\'s far kerb, which nothing walks on */
  ok(onGround(g.routes, g.cat.target.x, g.cat.target.y), 'a tap on ground between two runs lands on the nearer of them');
  C.tapRoad(g, 0.95, 2.0);
  ok(g.cat.target.x === 0.95 && g.cat.target.y === 2.0, 'a tap on ground that does exist is taken as it is');
}

console.log('\n=== NOTHING CHANGED ON A STREET WITH ONE RUN OF ROAD ===');
{
  /* This is the guard behind the golden playthroughs, written down. On a
     street that is a single stretch the router must ask for no corners at
     all, so every character does exactly the arithmetic it did before routes
     existed -- and a change that quietly starts routing Marrow Street fails
     here as well as in tests/golden.test.js. */
  for (const [name, st] of [['Marrow Street', C.MARROW_STREET], ['Terrace Row', C.TERRACE_STREET], ['Test Lane', LANE]]) {
    const R = C.buildRoutes(st);
    const w = R.bounds;
    let corners = 0, wrongDist = 0;
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) for (let k = 0; k <= 4; k++) for (let m = 0; m <= 4; m++) {
      const fx = w.x[0] + (w.x[1] - w.x[0]) * (i / 8), fy = w.y[0] + (w.y[1] - w.y[0]) * (j / 8);
      const tx = w.x[0] + (w.x[1] - w.x[0]) * (k / 4), ty = w.y[0] + (w.y[1] - w.y[0]) * (m / 4);
      if (C.routeNext(R, fx, fy, tx, ty) !== null) corners++;
      if (C.routeDist(R, fx, fy, tx, ty) !== Math.hypot(tx - fx, ty - fy)) wrongDist++;
    }
    ok(R.single && corners === 0, name + ': one stretch, and no route on it has a corner in it');
    ok(wrongDist === 0, name + ': every distance on it is exactly the crow flight');
  }
  /* walk is the old shape and must keep meaning the same thing. */
  const R = C.buildRoutes(C.MARROW_STREET);
  ok(R.stretches[0].x[0] === C.MARROW_STREET.walk.x[0] && R.stretches[0].y[1] === C.MARROW_STREET.walk.y[1],
     'a street given as walk reads as one stretch with exactly those bounds');
  ok(R.bounds.y[0] === C.MARROW_STREET.walk.y[0] && R.bounds.y[1] === C.MARROW_STREET.walk.y[1],
     '... and the bounds the walk-off reads are the same numbers it always read');
}

console.log('\n=== A LINK THAT CAN BE SHUT ===');
{
  /* Nothing shuts one today -- gates are not built (#7 says so) -- but the
     flag is in the description and the search has to honour it, or it is a
     field that lies. With the cut-through shut there is no way round at all,
     and the router says so by asking for no corners rather than inventing
     one. */
  const shut = JSON.parse(JSON.stringify(BENT));
  shut.paths.links[0].open = false;
  const R = C.buildRoutes(shut);
  ok(R.links[0].open === false && R.links[1].open === true, 'a link carries whether it is open, and defaults to open');
  ok(C.routeNext(R, PIKE.x, PIKE.y, WREN.x, WREN.y) === null, 'with the only cut-through shut there is no route, and the router does not invent one');
  ok(C.routeNext(BR, PIKE.x, PIKE.y, WREN.x, WREN.y) !== null, '... while the same street with it open does have one');
}

console.log('\n=== THE VALIDATOR KNOWS WHAT A ROUTE MAP MUST BE ===');
{
  const problems = mutate => { const st = JSON.parse(JSON.stringify(BENT)); mutate(st); return C.validateStreet(st); };
  const has = (list, word) => list.some(m => m.includes(word));

  ok(has(problems(st => { st.walk = { x: [0.3, 0.7], y: [0.2, 4.8] }; }), 'not both'), 'validator: a street gives walk or paths, not both');
  ok(has(problems(st => { st.paths.stretches[1].x = [0.95, 0.99]; }), 'do not meet'), 'validator: a link between stretches that do not touch is no way across');
  ok(has(problems(st => { st.paths.links.pop(); }), 'cannot be walked to'), 'validator: a stretch nothing can walk to is named');
  ok(has(problems(st => { st.paths.links[0].b = 'nowhere'; }), 'does not have'), 'validator: a link naming a stretch that is not there');
  ok(has(problems(st => { st.paths.stretches[1].id = 'main'; }), 'share the id'), 'validator: two stretches cannot share an id');
  ok(has(problems(st => { st.paths.stretches[2].roadX = 0.2; }), 'road and pavements'), 'validator: a run of road must fit between its own kerbs');
  ok(has(problems(st => { st.houses[5].on = 'cross'; }), 'own side'), 'validator: a house cannot front a crossing -- there is no pavement to put a bowl on');
  ok(has(problems(st => { st.houses[5].on = 'nowhere'; }), 'on names no stretch'), 'validator: a house fronting a stretch that is not there');
  ok(has(problems(st => { st.houses[5].bowl.x = 0.76; }), 'walkable area'), 'validator: a bowl on the block between two runs is named');
  ok(has(problems(st => { st.houses[5].bowl.x = 0.6; }), 'not on close'), 'validator: a bowl on walkable ground but not on the run its house fronts');

  /* The rule that had to grow a run of road to stay true: The Larks and Wren
     Cottage are both right-hand houses on row 1, and their tap strips cannot
     clash because they are round a corner from each other. Two on the SAME
     run still can. */
  ok(C.validateStreet(BENT).length === 0, 'two houses the same way up on different runs do not overlap');
  ok(has(problems(st => { st.houses[6].row = 1; st.houses[6].bowl.y = 1.5; }), 'overlap'),
     '... but two on the same run at the same row still do');
}

console.log('\n=== A BAD DESCRIPTION IS REPORTED, NOT THROWN ===');
{
  /* validateStreet's whole contract is that it hands back the problems, so
     create() can say why a street was refused. It used to walk the stretch
     list straight after saying the list was missing, and died with a
     TypeError on anything that was not the shape it expected. */
  const shapes = [
    ['paths with no stretches',   { links: [] }],
    ['paths that is not an object', 'nope'],
    ['stretches that is not a list', { stretches: 7 }],
    ['a stretch that is not a rectangle', { stretches: [{ id: 'a' }, { id: 'b', x: 1, y: 2 }] }],
    ['a link that is not an object', { stretches: [{ id: 'a', x: [0.3, 0.7], y: [0, 1] }], links: [null, 3] }],
  ];
  let threw = null, silent = null;
  for (const [what, paths] of shapes) {
    const st = JSON.parse(JSON.stringify(BENT));
    st.paths = paths;
    try {
      const said = C.validateStreet(st);
      if (!said.length) silent = silent || what;
    } catch (e) { threw = threw || what + ' (' + e.constructor.name + ': ' + e.message + ')'; }
    try { C.buildRoutes(st); } catch (e) { threw = threw || 'buildRoutes on ' + what + ' (' + e.message + ')'; }
  }
  ok(!threw, 'a misshapen paths is reported rather than thrown on' + (threw ? ': ' + threw : ''));
  ok(!silent, 'and none of them is waved through' + (silent ? ': ' + silent : ''));
  let refused = '';
  try { C.create({ street: Object.assign(JSON.parse(JSON.stringify(BENT)), { paths: { links: [] } }) }); }
  catch (e) { refused = e.message; }
  ok(/invalid street "Bent Lane".*stretches/.test(refused), 'create() refuses it and says what was wrong with it');
}

console.log('\n=== THE FOX MOOCHES ON THE ROAD, NOT THROUGH THE HOUSES ===');
{
  /* With nothing to rob the fox paces the line street.fox names, easing x
     towards it. Up the cul-de-sac that line cannot be eased towards without
     crossing the block, and the fox was off walkable ground 0.22s later.
     The street is left with nothing worth robbing but the night still
     running, which is the only state this happens in. */
  const g = fresh(BENT, 11);
  C.lockWave(g, 2);
  C.update(g, DT); C.drainEvents(g);
  g.houses.forEach(h => { h.bowl = null; h.cleared = true; });
  g.houses[0].cleared = false; g.houses[0].shut = 999;   /* shut, not settled: the night goes on */
  g.fox.x = WREN.x; g.fox.y = 2.0; g.fox.target = null; g.fox.rest = 0;

  let off = null, home = false;
  for (let i = 0; i < 60 * 20; i++) {
    quiet(g);
    C.update(g, DT); C.drainEvents(g);
    if (!g.fox) continue;
    if (!onGround(g.routes, g.fox.x, g.fox.y) && !off) off = { x: g.fox.x, y: g.fox.y, t: i / 60 };
    if (Math.abs(g.fox.x - BENT.fox.x) < 0.02) home = true;
  }
  ok(g.scene === 'play', 'the night is still running, which is the only time the fox mooches');
  ok(!off, 'a fox with nothing to rob walks back to the road instead of across the gardens' +
     (off ? ' (off at ' + off.x.toFixed(3) + ',' + off.y.toFixed(3) + ' after ' + off.t.toFixed(2) + 's)' : ''));
  ok(home, '... and it gets back to the line it paces');
}

console.log('\n=== WHAT THE VALIDATOR LEARNED WITH THEM ===');
{
  const problems = mutate => { const st = JSON.parse(JSON.stringify(BENT)); mutate(st); return C.validateStreet(st); };
  const has = (list, word) => list.some(m => m.includes(word));

  /* The mooch is a straight line, so the line it paces has to be walkable end
     to end. Nothing checked that, which is how the bug above got in. */
  ok(has(problems(st => { st.fox.patrol.y = [0.3, 4.9]; }), 'end to end'),
     'validator: a patrol line that runs off the walkable ground is named');
  ok(has(problems(st => { st.fox.x = 0.95; }), 'end to end'),
     'validator: ...and so is one pacing a line that is not one piece of ground');

  /* Scenery had the same bug the house-overlap rule had: side and row only. */
  /* Row 3 on the right is Miss Alder's, but she is on the main run: a bus
     stop on row 3 of the cul-de-sac is round a corner from her. */
  ok(C.validateStreet(Object.assign(JSON.parse(JSON.stringify(BENT)),
      { scenery: [{ kind: 'busstop', row: 3, side: 1, on: 'close' }] })).length === 0,
     'scenery up the cul-de-sac does not clash with a house on the main run at the same row');
  ok(has(problems(st => { st.scenery = [{ kind: 'busstop', row: 3, side: 1 }]; }), 'sits on house 4'),
     '... while the same bus stop on the main run does clash with her');
  ok(has(problems(st => { st.scenery = [{ kind: 'busstop', row: 1, side: 1 }]; }), 'sits on house 3'),
     '... while scenery on the run a house is on still does');
  ok(!has(problems(st => { st.scenery = [{ kind: 'busstop', row: 1, side: 1 }]; }), 'house 5'),
     '... and it is no longer blamed for sitting on one it is round a corner from');
  ok(has(problems(st => { st.scenery = [{ kind: 'busstop', row: 0, side: 1, on: 'nowhere' }]; }), 'on names no stretch'),
     'validator: scenery fronting a stretch that is not there');
}


report();
