/*
 * Bowl Bandit -- game rules, no rendering.
 *
 * The rules know nothing about any particular street. A street is a plain
 * description (see MARROW_STREET and validateStreet below): the houses with
 * their grid position, bowl spot and explicit list of neighbours, the ground
 * the cat may walk on, the road the dog runs down and the fox patrols, and
 * where the cat starts. create() takes one, defaulting to Marrow Street,
 * and refuses a street that fails the validator.
 *
 * Marrow Street is a 2 x 4 grid seen from above: the left column is houses
 * 0-3, the right column is 4-7, the road runs between them. A house's
 * neighbours are the houses above and below it in its own column and the one
 * directly across the road. They are listed out in the description rather than
 * derived from sight radii, so another street can wire its houses any way it
 * likes.
 *
 * Nothing in this file touches a canvas, the DOM, audio or timers. A renderer
 * drives it with update(g, dt) and the tap functions, reads g for what to draw,
 * and drains g.events for things to play or animate.
 *
 * World units: one row of houses is 1.0 tall. x runs 0..1 across the street,
 * y runs 0..street.rows down it. On Marrow Street the road is at x = 0.5 and
 * the bowls at x = 0.29 (left) and 0.71 (right).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BowlCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* ---------- streets ---------- *
 * house.col / house.row: grid position in house-spacings. Noise carries by
 *   this distance. row also places the house along the road (and must agree
 *   with its bowl: bowl.y = row + 0.5).
 * house.side: -1 if the house is left of the road, +1 if right. Which way it
 *   faces, and where the renderer draws it.
 * house.bowl: where its bowl sits, in world units: on the pavement of the
 *   house's own side of the road.
 * house.neighbours: ids of the houses that can see its bowl (and whose bowls
 *   it can see). Must be mutual.
 * walk: the rectangle the cat may be sent to; every bowl is inside it, and it
 *   stays on the road and pavements. A street that is not one straight road
 *   gives `paths` instead -- several such rectangles and the links between
 *   them -- and the cat and the fox take the shortest way round rather than
 *   walking through the houses. See "walking routes" below.
 * dog.ends / fox.ends: y the animal enters at, one per end of the road (the
 *   first is "from the top"); it runs to the other and is gone `overrun`
 *   past it. fox.patrol: the stretch it mooches along when nothing is worth
 *   robbing. Both travel along the vertical line x = `x`.
 * A house has one to three neighbours: the close-up has three windows, and the
 * practice night needs someone to watch.
 * wip (renderer only, optional): the picker tags the street "work in progress".
 * look, house.size (renderer only, optional): colours, mood and house sizes, see LOOK in game.js.
 * roadHalf (optional): half the road's width as a fraction of the street's.
 * roadX stays within 2% of the middle: the renderer draws the road there with a
 * house strip either side, and further off the houses would not fit.
 * Every house is listed once, in id order. */
const MARROW_STREET = {
  id: 'marrow',
  name: 'Marrow Street',
  rows: 4,
  roadX: 0.5,
  walk: { x: [0.29, 0.71], y: [0.2, 3.8] },
  catStart: { x: 0.5, y: 2 },
  houses: [
    { name: 'The Pemburys', col: 0, row: 0, side: -1, bowl: { x: 0.29, y: 0.5 }, neighbours: [1, 4] },
    { name: 'Old Nan',      col: 0, row: 1, side: -1, bowl: { x: 0.29, y: 1.5 }, neighbours: [0, 2, 5] },
    { name: 'The Dobsons',  col: 0, row: 2, side: -1, bowl: { x: 0.29, y: 2.5 }, neighbours: [1, 3, 6] },
    { name: 'Mr Quill',     col: 0, row: 3, side: -1, bowl: { x: 0.29, y: 3.5 }, neighbours: [2, 7] },
    { name: 'The Ashfords', col: 1, row: 0, side:  1, bowl: { x: 0.71, y: 0.5 }, neighbours: [5, 0] },
    { name: 'Bea & Rook',   col: 1, row: 1, side:  1, bowl: { x: 0.71, y: 1.5 }, neighbours: [4, 6, 1] },
    { name: 'The Mullens',  col: 1, row: 2, side:  1, bowl: { x: 0.71, y: 2.5 }, neighbours: [5, 7, 2] },
    { name: 'Doctor Pye',   col: 1, row: 3, side:  1, bowl: { x: 0.71, y: 3.5 }, neighbours: [6, 3] },
  ],
  dog: { x: 0.5, ends: [-0.6, 4.6], overrun: 0.2 },
  fox: { x: 0.5, ends: [-0.6, 4.6], patrol: { y: [0.3, 3.7], speed: 0.3 } },
};

/* Terrace Row: five houses in a terrace along the left of the road, and the
 * Stag's Head opposite. A terrace house is watched only by the houses either
 * side of it; the pub is a venue (no bowl, nothing to tap) that watches every
 * bowl, but only from `venue.from` (a wave number): last orders. It lists all
 * five houses as neighbours, and each house lists it back, so a terrace house
 * has at most two terrace neighbours plus the pub, which is the three windows
 * the close-up has. */
const TERRACE_STREET = {
  id: 'terrace',
  name: 'Terrace Row',
  wip: true,                               // the picker says so: still being worked on (renderer only)
  unlock: { street: 'marrow', rank: 1 },   // reach Bin Lid Regular on Marrow Street: the rung, not a number -- it moves when the ladder is re-derived
  rows: 5,
  roadX: 0.5,
  roadHalf: 100 / 720,                     // a narrow street: Marrow's road is 128/720
  walk: { x: [0.329, 0.671], y: [0.2, 4.8] },
  catStart: { x: 0.5, y: 2.5 },
  houses: [
    { name: 'No. 1',        col: 0, row: 0, side: -1, bowl: { x: 0.329, y: 0.5 }, neighbours: [1, 5], size: { w: 1.2 } },
    { name: 'No. 3',        col: 0, row: 1, side: -1, bowl: { x: 0.329, y: 1.5 }, neighbours: [0, 2, 5], size: { w: 0.9 } },
    { name: 'No. 5',        col: 0, row: 2, side: -1, bowl: { x: 0.329, y: 2.5 }, neighbours: [1, 3, 5], size: { w: 1.05 } },
    { name: 'No. 7',        col: 0, row: 3, side: -1, bowl: { x: 0.329, y: 3.5 }, neighbours: [2, 4, 5], size: { w: 1.3 } },
    { name: 'No. 9',        col: 0, row: 4, side: -1, bowl: { x: 0.329, y: 4.5 }, neighbours: [3, 5], size: { w: 0.95 } },
    { name: 'The Stag\'s Head', col: 1, row: 1, side: 1, venue: { from: 2, span: 3 }, neighbours: [0, 1, 2, 3, 4], size: { w: 1.35 } },
  ],
  /* Beside the pub, in the two rows it leaves free: a bus stop above it and
     its beer garden below. Nothing to raid, just something to look at. */
  scenery: [
    { kind: 'busstop',    row: 0, side: 1 },
    { kind: 'beergarden', row: 4, side: 1 },
  ],
  /* Look: a warm evening, not a night (renderer only). The houses are joined
     brick fronts, each its own width. */
  look: {
    night: '#3a2233', road: '#5a4350', road2: '#6b5160', pave: '#a8876e', paveLip: '#c9a487', grass: '#6e8a4a',
    wash: ['rgba(255,170,80,.20)', 'rgba(255,120,90,.10)'], vignette: 0.25, lamp: 0.35,
    bodyW: 140, bodyH: 1.14,
    tints: [
      { wall: '#b5533c', roof: '#4a3a46', trim: '#f1e2c6', door: '#2f5d62' },
      { wall: '#c46a45', roof: '#5a4048', trim: '#f1e2c6', door: '#7a2f3b' },
      { wall: '#a8473a', roof: '#42384a', trim: '#f1e2c6', door: '#2e4a7a' },
      { wall: '#c98a5a', roof: '#53413d', trim: '#f6ead2', door: '#b8892a' },
      { wall: '#9c4a3c', roof: '#463844', trim: '#f1e2c6', door: '#3d6b4a' },
    ],
  },
  /* Five bowls to Marrow Street's eight. Under the night, bots here score
     about 0.57 of what they do there (`tools/simulate.js --street terrace
     --rounds 150`) -- lower than the clock era's 0.73, because a shorter
     street cannot be farmed to make the difference up. The ladder is derived
     from this street's own medians, not scaled from Marrow's. */
  ranks: [
    [0,    'Alley Amateur'],
    [350,  'Bin Lid Regular'],
    [620,  'Terrace Sweetheart'],
    [780,  'Bowl Bandit'],
    [1080, 'Ghost of Terrace Row'],
  ],
  waveBlurbs: {
    2: 'closing time: the STAG\'S HEAD is watching every bowl, and a FOX is about',
    3: 'the whole terrace is at its windows, and the pub is turning out',
  },
  dog: { x: 0.5, ends: [-0.6, 5.6], overrun: 0.2 },
  fox: { x: 0.5, ends: [-0.6, 5.6], patrol: { y: [0.3, 4.7], speed: 0.3 } },
};

/* The streets in the order the title screen lists them. Marrow Street is
   always open; a street with `unlock` opens when the best score on the street
   it names reaches that rung of that street's own ladder. */
const STREETS = [MARROW_STREET, TERRACE_STREET];

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); }
  return o;
}
deepFreeze(MARROW_STREET); deepFreeze(TERRACE_STREET);   // shared by every default game: nothing may edit it mid-round

/* ---------- walking routes ---------- *
 * A street's walkable ground is a list of convex rectangles -- `stretches` --
 * and the `links` that join them. Inside one stretch a straight line is
 * always legal, which is the whole reason the ground is described as areas
 * rather than as a thin graph of points: a street that is a single run of
 * road (Marrow Street, Terrace Row) has one stretch, so every walk on it is
 * the straight line it has always been, down to the last bit of arithmetic.
 * A spine-and-spurs graph of points would instead send the cat out to the
 * middle of the road and back every time it crossed between two bowls --
 * longer, slower, visibly on rails, and it would rewrite every golden log.
 *
 * Where two linked stretches meet is simply their overlap, so a junction
 * has no coordinates of its own to drift out of step with the rectangles.
 *
 * A link carries `open`. Nothing closes one today; it is there so that a
 * gate -- "clearing this bowl opens that path" -- is a flag the search
 * already reads rather than a rebuild of this section.
 *
 * A stretch that carries its own `roadX` is a run down the street: the
 * ground a renderer can paint as road and pavements, and the only kind a
 * house may front. One without is a crossing or a yard -- walkable, but
 * nothing stands on it.
 *
 * `walk: { x, y }` is the original single-rectangle shape and still works:
 * it reads as one stretch called 'main'.
 */
/* Everything downstream of this -- buildRoutes and the geometry half of the
   validator -- walks the list it returns, so it hands back only stretches that
   are actually rectangles. A description that is the wrong shape is reported
   by validateStreet from the raw `st.paths`, and must not throw on the way:
   the validator's whole contract is that it returns the problems rather than
   raising on the first one. */
const isRect = s => !!s && typeof s === 'object' &&
  Array.isArray(s.x) && s.x.length === 2 && typeof s.x[0] === 'number' && typeof s.x[1] === 'number' &&
  Array.isArray(s.y) && s.y.length === 2 && typeof s.y[0] === 'number' && typeof s.y[1] === 'number';
function pathsOf(st) {
  const p = st && st.paths;
  if (p && typeof p === 'object') return {
    stretches: (Array.isArray(p.stretches) ? p.stretches : []).filter(isRect),
    links: Array.isArray(p.links) ? p.links.filter(l => l && typeof l === 'object') : [],
  };
  const w = st && st.walk;
  if (!w || !w.x || !w.y) return { stretches: [], links: [] };
  return { stretches: [{ id: 'main', roadX: st.roadX, x: w.x, y: w.y }], links: [] };
}

const rectHas  = (r, x, y) => x >= r.x[0] && x <= r.x[1] && y >= r.y[0] && y <= r.y[1];
const rectClamp = (r, x, y) => ({ x: clamp(x, r.x[0], r.x[1]), y: clamp(y, r.y[0], r.y[1]) });
function overlapRect(a, b) {
  const x = [Math.max(a.x[0], b.x[0]), Math.min(a.x[1], b.x[1])];
  const y = [Math.max(a.y[0], b.y[0]), Math.min(a.y[1], b.y[1])];
  return x[0] <= x[1] && y[0] <= y[1] ? { x, y } : null;
}

/* The route map, derived from a street once and never changed: no randomness,
   so building it cannot disturb a seeded replay, and nothing here reads or
   writes game state. A street whose description is bad never gets this far --
   create() runs validateStreet first. */
function buildRoutes(street) {
  const p = pathsOf(street);
  const stretches = p.stretches.map((s, i) => ({
    id: s.id, i, x: [s.x[0], s.x[1]], y: [s.y[0], s.y[1]],
    roadX: typeof s.roadX === 'number' ? s.roadX : null,
  }));
  const byId = {};
  stretches.forEach(s => { byId[s.id] = s; });
  const links = [];
  for (const l of (p.links || [])) {
    const a = byId[l.a], b = byId[l.b];
    if (!a || !b || a === b) continue;
    const rect = overlapRect(a, b);
    if (!rect) continue;
    links.push({ a: a.i, b: b.i, open: l.open !== false, rect,
                 mid: { x: (rect.x[0] + rect.x[1]) / 2, y: (rect.y[0] + rect.y[1]) / 2 } });
  }
  /* which links touch each stretch, so the search can step junction to junction */
  const at = stretches.map(() => []);
  links.forEach((l, i) => { at[l.a].push(i); at[l.b].push(i); });
  /* A street with no usable ground is one the validator is about to refuse;
     give it a bounds of zero rather than the Infinities a min over nothing
     returns, so a caller reading it gets a number. */
  const bounds = stretches.length ? {
    x: [Math.min(...stretches.map(s => s.x[0])), Math.max(...stretches.map(s => s.x[1]))],
    y: [Math.min(...stretches.map(s => s.y[0])), Math.max(...stretches.map(s => s.y[1]))],
  } : { x: [0, 0], y: [0, 0] };
  /* `single` is not an optimisation. It is the promise that a street which is
     one run of road behaves exactly as it did before routes existed. */
  return { stretches, links, at, bounds, single: stretches.length === 1 };
}

/* The corners to turn on the way from one point to another, nearest first,
   not counting the destination. Empty means "walk straight there", which is
   the answer for every point on a one-stretch street. */
function routeHops(R, fx, fy, tx, ty) {
  if (!R || R.single || !R.links.length) return [];
  /* standing somewhere that can see the destination in a straight line */
  for (const s of R.stretches) if (rectHas(s, fx, fy) && rectHas(s, tx, ty)) return [];
  const from = [], to = [];
  for (const s of R.stretches) {
    if (rectHas(s, fx, fy)) from.push(s.i);
    if (rectHas(s, tx, ty)) to.push(s.i);
  }
  /* Off the map (the fox walks on from beyond the end of the road) or nowhere
     to get to: head straight rather than stand still. A character stuck on
     the spot is a worse bug than one that takes a shortcut. */
  if (!from.length || !to.length) return [];

  /* Dijkstra over junctions. A junction is a link, standing in both the
     stretches it joins, so two junctions are a straight hop apart when they
     share a stretch. Costs use each junction's midpoint, which is stable;
     where the character actually aims is worked out afterwards. */
  const n = R.links.length;
  const cost = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
  const touches = (li, si) => R.links[li].a === si || R.links[li].b === si;
  for (const si of from) for (const li of R.at[si]) {
    if (!R.links[li].open) continue;
    const c = dist(fx, fy, R.links[li].mid.x, R.links[li].mid.y);
    if (c < cost[li]) cost[li] = c;
  }
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && cost[i] < best) { best = cost[i]; u = i; }
    if (u < 0) break;
    done[u] = true;
    for (const si of [R.links[u].a, R.links[u].b]) for (const v of R.at[si]) {
      if (done[v] || !R.links[v].open) continue;
      const c = cost[u] + dist(R.links[u].mid.x, R.links[u].mid.y, R.links[v].mid.x, R.links[v].mid.y);
      if (c < cost[v]) { cost[v] = c; prev[v] = u; }
    }
  }
  let end = -1, endCost = Infinity;
  for (let i = 0; i < n; i++) {
    if (cost[i] === Infinity || !to.some(si => touches(i, si))) continue;
    const c = cost[i] + dist(R.links[i].mid.x, R.links[i].mid.y, tx, ty);
    if (c < endCost) { endCost = c; end = i; }
  }
  if (end < 0) return [];                     /* no way through: straight line, as above */
  const path = [];
  for (let i = end; i >= 0; i = prev[i]) path.unshift(i);

  /* Aim each junction at wherever the route goes next, rather than at its
     own middle: that pulls the line tight against the inside of a corner,
     so the cat cuts it the way it would on an open road. The aim point stays
     inside the junction, and a junction lies in both its stretches, so every
     leg of the walk stays on painted ground. */
  return path.map((li, k) => {
    const nxt = k + 1 < path.length ? R.links[path[k + 1]].mid : { x: tx, y: ty };
    return rectClamp(R.links[li].rect, nxt.x, nxt.y);
  });
}

/* The next corner to make for, or null for "walk straight at it". Null is the
   answer on every one-stretch street, and the callers lean on that: they do
   the same arithmetic on the same numbers they always did. */
function routeNext(R, fx, fy, tx, ty) {
  const hops = routeHops(R, fx, fy, tx, ty);
  /* A corner you are already standing on is no corner at all -- without this
     a character stood in a junction would aim at its own feet and stall. */
  for (const p of hops) if (Math.abs(p.x - fx) > 1e-9 || Math.abs(p.y - fy) > 1e-9) return p;
  return null;
}

/* The whole walk, corners and destination, for tests and tools. */
function routePath(R, fx, fy, tx, ty) {
  return routeHops(R, fx, fy, tx, ty).concat([{ x: tx, y: ty }]);
}

/* How far it really is, round the corners. Deliberately the same expression
   as a straight line when there are no corners, so that a fox comparing
   bowls on a one-stretch street compares exactly the numbers it used to. */
function routeDist(R, fx, fy, tx, ty) {
  const hops = routeHops(R, fx, fy, tx, ty);
  if (!hops.length) return dist(fx, fy, tx, ty);
  let d = 0, x = fx, y = fy;
  for (const p of hops) { d += dist(x, y, p.x, p.y); x = p.x; y = p.y; }
  return d + dist(x, y, tx, ty);
}

/* The nearest spot a character may actually stand, for a tap that lands in a
   garden or off the end of the road. On one stretch this is the clamp into
   the walkable rectangle that tapRoad has always done. */
function clampToPaths(R, x, y) {
  if (R.single) return rectClamp(R.stretches[0], x, y);
  for (const s of R.stretches) if (rectHas(s, x, y)) return { x, y };
  let best = null, bd = Infinity;
  for (const s of R.stretches) {
    const p = rectClamp(s, x, y), d = dist(x, y, p.x, p.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best || { x, y };
}

/* Everything wrong with a street, as a list of messages (empty if it is fine).
   create() throws on a non-empty list; tests and tools can read it. */
function validateStreet(st) {
  const bad = [];
  const num = v => typeof v === 'number' && isFinite(v);
  const pair = v => Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1]) && v[0] < v[1];
  if (!st || typeof st !== 'object') return ['street is not an object'];
  if (st.id !== undefined && !(typeof st.id === 'string' && st.id)) bad.push('id must be a non-empty string');
  if (st.unlock !== undefined && !(st.unlock && typeof st.unlock.street === 'string' && Number.isInteger(st.unlock.rank) && st.unlock.rank >= 1))
    bad.push('unlock needs the id of a street and a rung (1 or more) of its ladder');
  if (!(Number.isInteger(st.rows) && st.rows > 0)) bad.push('rows must be a positive integer');
  if (!(num(st.roadX) && st.roadX >= 0.48 && st.roadX <= 0.52)) bad.push('roadX must be a number between 0.48 and 0.52');
  const walkOk = st.walk && pair(st.walk.x) && pair(st.walk.y);
  if (st.walk !== undefined && st.paths !== undefined)
    bad.push('a street gives its walkable ground as walk or as paths, not both');
  else if (st.paths === undefined && !walkOk) bad.push('walk needs x and y ranges, [min, max]');
  /* the road and both pavements, as the renderer draws them around roadX */
  if (st.roadHalf !== undefined && !(num(st.roadHalf) && st.roadHalf >= 0.1 && st.roadHalf <= ROAD_HALF))
    bad.push('roadHalf must be a number from 0.1 up to ' + ROAD_HALF.toFixed(3) + ' (the houses need room beside a wider road)');
  if (st.look !== undefined && !(st.look && typeof st.look === 'object' && !Array.isArray(st.look))) bad.push('look must be an object');

  /* ---- walkable ground: one rectangle (walk) or several joined up (paths) ---- */
  const P = pathsOf(st);
  if (st.paths !== undefined) {
    const p = st.paths;
    if (!p || typeof p !== 'object' || !Array.isArray(p.stretches) || !p.stretches.length) bad.push('paths needs a non-empty list of stretches');
    else {
      const seen = new Set();
      p.stretches.forEach((s, i) => {
        const at = 'stretch ' + i + (s && typeof s.id === 'string' && s.id ? ' (' + s.id + ')' : '');
        if (!s || typeof s.id !== 'string' || !s.id) { bad.push(at + ': needs an id'); return; }
        if (seen.has(s.id)) bad.push(at + ': two stretches share the id ' + s.id); else seen.add(s.id);
        if (!pair(s.x) || !pair(s.y)) bad.push(at + ': needs x and y ranges, [min, max]');
        if (s.roadX !== undefined && !(num(s.roadX) && s.roadX >= 0 && s.roadX <= 1)) bad.push(at + ': roadX must be a number from 0 to 1');
      });
      if (p.links !== undefined && !Array.isArray(p.links)) bad.push('paths.links must be a list');
      else (p.links || []).forEach((l, i) => {
        const at = 'link ' + i;
        if (!l || !seen.has(l.a) || !seen.has(l.b)) { bad.push(at + ': names a stretch this street does not have'); return; }
        if (l.a === l.b) { bad.push(at + ': joins ' + l.a + ' to itself'); return; }
        const A = p.stretches.find(s => s.id === l.a), B = p.stretches.find(s => s.id === l.b);
        /* A junction is the overlap of the two stretches, so stretches that do
           not touch have nowhere to cross: the link would be a route onto
           ground with a gap in it. */
        if (A && B && pair(A.x) && pair(A.y) && pair(B.x) && pair(B.y) && !overlapRect(A, B))
          bad.push(at + ': ' + l.a + ' and ' + l.b + ' do not meet, so there is no way across');
      });
      /* Every stretch has to be walkable to from every other, or a bowl on it
         could never be raided. Gates are judged open here: one that starts
         shut is still a way through once something opens it. */
      if (p.stretches.every(s => s && pair(s.x) && pair(s.y))) {
        const R = buildRoutes(st), reach = new Set([0]), queue = [0];
        while (queue.length) {
          const s = queue.shift();
          for (const li of R.at[s]) for (const v of [R.links[li].a, R.links[li].b])
            if (!reach.has(v)) { reach.add(v); queue.push(v); }
        }
        if (reach.size < R.stretches.length)
          bad.push('paths: ' + R.stretches.filter(s => !reach.has(s.i)).map(s => s.id).join(', ') + ' cannot be walked to from ' + R.stretches[0].id);
      }
    }
  }
  const half = roadHalfOf(st);
  const kerb = half + PAVE_W, eps = 1e-9;
  /* A stretch carrying a roadX is a run down the street -- road and pavements,
     the ground a renderer paints -- so it has to fit between its own two
     kerbs. One without is a crossing or a yard: walkable, but nothing stands
     on it, so it only has to be a rectangle. */
  P.stretches.forEach(s => {
    if (!pair(s.x) || !pair(s.y) || !num(s.roadX)) return;
    if (s.x[0] < s.roadX - kerb - eps || s.x[1] > s.roadX + kerb + eps)
      bad.push((st.paths ? 'stretch ' + s.id + '.x' : 'walk.x') + ' must stay on the road and pavements');
  });
  const stretchesAt = p => (p && num(p.x) && num(p.y))
    ? P.stretches.filter(s => pair(s.x) && pair(s.y) && rectHas(s, p.x, p.y)) : [];
  const inWalk = p => stretchesAt(p).length > 0;
  /* Which run of road a house fronts: the one it names with `on`, or the one
     its bowl stands on. Only a run of road will do -- a crossing has no
     pavement to put a bowl on. */
  const frontsOf = h => {
    const on = stretchesAt(h && h.bowl).filter(s => num(s.roadX));
    return h && h.on !== undefined ? on.filter(s => s.id === h.on) : on;
  };
  const runOf = h => (h && h.bowl && !h.venue)
    ? (frontsOf(h)[0] || stretchesAt(h.bowl)[0] || P.stretches[0] || null) : null;
  if (!(st.catStart && inWalk(st.catStart))) bad.push('catStart must be inside the walkable area');
  const hs = st.houses;
  if (!Array.isArray(hs) || !hs.length) { bad.push('houses must be a non-empty list'); return bad; }
  /* scenery: things to look at beside the road that nobody can raid; each takes
     one row on one side of one run of road, and must not sit on a house.
     `on` names the run, as it does on a house, and defaults to the first --
     which is the only one on every street that has shipped. Without the run
     in the test, a bus stop was reported as sitting on a house that is round
     a corner from it, and a legal street was refused. */
  const firstRun = P.stretches.filter(s => num(s.roadX))[0] || null;
  if (st.scenery !== undefined) {
    if (!Array.isArray(st.scenery)) bad.push('scenery must be a list');
    else st.scenery.forEach((sc, i) => {
      const at = 'scenery ' + i;
      if (!sc || typeof sc.kind !== 'string' || !sc.kind) { bad.push(at + ': needs a kind'); return; }
      if (sc.side !== -1 && sc.side !== 1) bad.push(at + ': side must be -1 or 1');
      if (!(Number.isInteger(sc.row) && sc.row >= 0 && sc.row < st.rows)) { bad.push(at + ': row must be a row of the street'); return; }
      if (sc.on !== undefined && !P.stretches.some(s => s.id === sc.on)) { bad.push(at + ': on names no stretch of this street'); return; }
      const scRun = sc.on !== undefined ? P.stretches.find(s => s.id === sc.on) : firstRun;
      hs.forEach((h, id) => {
        if (!h || h.side !== sc.side || !num(h.row) || runOf(h) !== scRun) return;
        const span = h.venue && h.venue.span || 1;
        if (sc.row < h.row + span && sc.row + 1 > h.row) bad.push(at + ' sits on house ' + id + ' (' + h.name + ')');
      });
    });
  }
  hs.forEach((h, id) => {
    const at = 'house ' + id + (h && h.name ? ' (' + h.name + ')' : '');
    if (!h || typeof h.name !== 'string' || !h.name) bad.push(at + ': needs a name');
    if (!h || !num(h.col) || !num(h.row)) { bad.push(at + ': col and row must be numbers'); return; }
    if (h.side !== -1 && h.side !== 1) bad.push(at + ': side must be -1 (left of the road) or 1 (right)');
    if (h.venue) {
      /* a venue (the pub) has no bowl and no tap target of its own: it only watches */
      const v = h.venue;
      if (h.bowl) bad.push(at + ': a venue has no bowl');
      if (!(Number.isInteger(v.from) && v.from >= 0 && v.from < WAVES.length)) bad.push(at + ': venue.from must be a wave number');
      if (!(Number.isInteger(v.span) && v.span >= 1 && h.row >= 0 && h.row + v.span <= st.rows)) bad.push(at + ': venue.span must keep it inside the street');
      if (!Array.isArray(h.neighbours) || !h.neighbours.length) { bad.push(at + ': a venue needs someone to watch'); return; }
      if (new Set(h.neighbours).size !== h.neighbours.length) bad.push(at + ': neighbours repeat');
      for (const n of h.neighbours) {
        if (!Number.isInteger(n) || n < 0 || n >= hs.length) bad.push(at + ': neighbour ' + n + ' is not a house id');
        else if (n === id) bad.push(at + ': is its own neighbour');
        else if (hs[n].venue) bad.push(at + ': a venue cannot watch a venue');
        else if (!(hs[n].neighbours || []).includes(id)) bad.push(at + ': neighbour ' + n + ' does not list it back');
      }
      return;
    }
    if (h.on !== undefined) {
      /* a house may say which run of road it fronts; its bowl has to be on it */
      if (!P.stretches.some(s => s.id === h.on)) bad.push(at + ': on names no stretch of this street');
      else if (h.bowl && !stretchesAt(h.bowl).some(s => s.id === h.on)) bad.push(at + ': bowl is not on ' + h.on + ', the run it fronts');
    }
    if (!inWalk(h.bowl)) bad.push(at + ': bowl must be inside the walkable area');
    else {
      /* on its own side's pavement of the run it fronts: between the kerb and
         the road's edge. Measured against that run's own middle, so a street
         with more than one run of road checks each house against the one it
         actually stands on. */
      const ok = frontsOf(h).some(s => {
        const d = (h.bowl.x - s.roadX) * h.side;
        return d >= half - eps && d <= kerb + eps;
      });
      if (!ok) bad.push(at + ': bowl must stand on the pavement on its own side of the road');
    }
    if (!(h.row >= 0 && h.row < st.rows) || Math.abs(h.bowl.y - (h.row + 0.5)) > eps) bad.push(at + ': bowl.y must be row + 0.5, inside the street');
    if (!Array.isArray(h.neighbours)) { bad.push(at + ': neighbours must be a list'); return; }
    if (new Set(h.neighbours).size !== h.neighbours.length) bad.push(at + ': neighbours repeat');
    if (h.neighbours.length < 1 || h.neighbours.length > 3) bad.push(at + ': needs one to three neighbours (the close-up has three windows, the practice night someone to watch)');
    for (const n of h.neighbours) {
      if (!Number.isInteger(n) || n < 0 || n >= hs.length) bad.push(at + ': neighbour ' + n + ' is not a house id');
      else if (n === id) bad.push(at + ': is its own neighbour');
      else if (!(hs[n] && hs[n].neighbours || []).includes(id)) bad.push(at + ': neighbour ' + n + ' does not list it back');
    }
  });
  /* A house's whole strip is its tap target, so two on one side of the same
     run of road must not overlap. Two the same way up on different runs never
     can -- they are round a corner from each other -- which is why the run is
     part of the test and not just the side. */
  const run = hs.map(runOf);
  hs.forEach((a, i) => hs.forEach((b, j) => {
    if (j > i && a && b && a.side === b.side && a.bowl && b.bowl && !a.venue && !b.venue &&
        run[i] === run[j] && Math.abs(a.bowl.y - b.bowl.y) < 1 - eps)
      bad.push('houses ' + i + ' and ' + j + ' overlap: same-side houses need bowls at least one row apart');
  }));
  if (!hs.some(h => h && !h.venue)) bad.push('a street needs at least one house with a bowl');
  const ends = o => o && Array.isArray(o.ends) && o.ends.length === 2 && o.ends.every(num) && o.ends[0] !== o.ends[1];
  if (!(st.dog && num(st.dog.x) && ends(st.dog) && num(st.dog.overrun) && st.dog.overrun >= 0)) bad.push('dog needs x, two ends and an overrun');
  const pt = st.fox && st.fox.patrol;
  if (!(st.fox && num(st.fox.x) && ends(st.fox))) bad.push('fox needs x and two ends');
  if (!(pt && pair(pt.y) && num(pt.speed) && pt.speed > 0)) bad.push('fox.patrol needs a y range and a speed');
  else if (ends(st.fox) && (pt.y[0] < Math.min(...st.fox.ends) || pt.y[1] > Math.max(...st.fox.ends)))
    bad.push('fox.patrol.y must lie between the fox\'s ends');
  /* The mooch runs up and down this line in a straight line, so the line has
     to be on one piece of walkable ground from end to end -- otherwise the
     fox is being told to pace through somebody's front room. */
  if (pt && pair(pt.y) && num(st.fox.x) && P.stretches.length &&
      !P.stretches.some(s => pair(s.x) && pair(s.y) && rectHas(s, st.fox.x, pt.y[0]) && rectHas(s, st.fox.x, pt.y[1])))
    bad.push('fox.patrol must lie end to end on one stretch of walkable ground: the fox moochs up and down it in a straight line');
  return bad;
}

/* Difficulty steps at wave boundaries rather than creeping continuously,
   so the player can feel the street turning against them. */
const WAVES = [
  { name:'QUIET STREET',
    warn:1.90, watch:1.15, idle:[7.5,12.0], awake:1, bites:3,
    react:0.90, speed:0.50, zone:0.42, zoneMin:0.22,
    dog:0,  fox:false, blurb:'nobody is paying much attention yet' },
  { name:'CURTAINS TWITCHING',
    warn:1.45, watch:1.60, idle:[5.5,9.0],  awake:2, bites:4,
    react:0.75, speed:0.60, zone:0.36, zoneMin:0.18,
    dog:19, fox:false, blurb:'a DOG is loose - it sends everyone to the windows' },
  { name:'GETTING NOSY',
    warn:1.05, watch:2.05, idle:[4.0,7.0],  awake:3, bites:5,
    react:0.60, speed:0.72, zone:0.31, zoneMin:0.145,
    dog:15, fox:true,  blurb:'a FOX is working the same street - it will rob your bowls' },
  { name:'NEIGHBOURHOOD WATCH',
    warn:0.72, watch:2.50, idle:[2.6,4.8],  awake:4, bites:6,
    react:0.48, speed:0.85, zone:0.26, zoneMin:0.115,
    dog:11, fox:true,  blurb:'every curtain on Marrow Street is twitching' },
];
const GRACE        = 4.5;     // nobody stirs for the first few seconds
const KEPT_BONUS   = 40;      // per neighbour still feeding you at the whistle
const CAUGHT_SECS  = 1.6;

/* ---------- the night ---------- *
 * There is no countdown. Each house has one dinner; eating it settles that
 * house for the night, and being caught shuts it for a while rather than for
 * good. The night ends when the street has nothing left to offer, or when the
 * racket the player has made brings the owner out.
 * The point of the attention meter is that the ending you get is one you
 * caused: a quiet cat gets a long night, a clumsy one gets carried home early.
 *
 * This replaced a fixed two-minute round. The clock made every street cost the
 * same whatever its size, gave no reason to come back beyond a score the
 * simulator showed saturating above "decent", and hurried the player past a
 * street built to be looked at. It was kept side by side with this for a
 * playtest and lost; the attention meter was the clear winner. */
const SHUT_SECS     = 22;       // a frightened house takes its bowl in for this long
const STRIKES       = 2;        // ...and stops feeding you for good on this catch
/* Tuned by tools/simulate.js. The first pass put the drift at
   1/260 and fed the meter from misses and catches only, which punished
   exactly the play this loop is for: a careful cat spends longer on the
   street, so the drift fetched the owner on 20% of expert careful nights and
   none of the reckless ones. The same inversion #13 found under the clock.
   So the drift is now a backstop against a cat that refuses to eat at all --
   the street emptying is what normally ends a night -- and the meter is fed
   mainly by being noticed, which is the thing a careful player avoids and a
   greedy one courts. */
const RACKET_DRIFT  = 1 / 600;  // a backstop, not a clock
const RACKET_MISS   = 0.035;    // a clattered bowl carries
const RACKET_CAUGHT = 0.13;     // someone shouting carries further
const RACKET_SEEN   = 0.05;     // per second with a neighbour's eyes on you
/* Tuned for a thumb on glass, not a key: a swipe to run takes longer than a
   key press, and the player is watching windows as well as the bar. */
const BITE_SPEEDUP = 0.05;    // the marker quickens a little with every bite
const MAX_SPEED    = 1.4;
const PERFECT_FRAC = 0.18;    // perfect = within this fraction of the green's width of its centre

/* The streak. Clean bites build it (+1, or +2 for a perfect) and every
   STREAK_STEP points lift the multiplier by half, up to x3. Being SEEN wipes
   it, even if you get away; a twitching curtain doesn't. That is what makes
   leaving at the twitch worth something: playing it safe protects a
   multiplier, and better timing builds it faster. A clatter halves it. */
const STREAK_STEP = 3;
const STREAK_CAP  = 12;
function multFor(streak) {
  return 1 + Math.floor(Math.min(streak, STREAK_CAP) / STREAK_STEP) * 0.5;
}
const PICKUP_SECS  = 4.8;     // walk up, scoop the cat, carry it home
/* Leaving under your own steam. The owner's arrival had four and a half
   seconds of animation while clearing the street -- the hardest thing in the
   game -- cut to the results on the same frame, so the one ending with a
   moment to it was the one you are trying to avoid. A playtest put it
   plainly: "the game just ended". */
/* Long enough for the turn, the walk and a moment of quiet street after the
   cat has gone; not so long that the quiet outstays it. The camera holds on
   the street rather than following the cat off the end of the road, so the
   cat leaves the frame at about 3.3s. */
const LEAVE_SECS   = 4.2;
const LEAVE_CIRCLE = 1.9;     // a turn on the spot first: the cat is in no hurry
const LEAVE_SKIP   = 1.2;     // ...but a player on their tenth night can tap past it

/* What a final score makes you. Re-derived for the night: without a clock to
   farm against, one dinner per house caps what a street can pay, and scores
   fell by roughly a third. Against the clock-era ladder every skill level
   piled up on the middle rungs and the top one came up on 1% of nights, so
   the thresholds now sit at the night medians measured by
   `node tools/simulate.js --rounds 150`: a greedy novice lands near 690, a
   careful novice 1130, careful decent play 1550, careful expert play 1950.
   Real players spot windows slower than bots, so the top rank stays rare. */
const RANKS = [
  [0,    'Alley Amateur'],
  [600,  'Bin Lid Regular'],
  [1000, 'Street Sweetheart'],
  [1350, 'Bowl Bandit'],
  [1900, 'Ghost of Marrow Street'],
];
/* A street may carry its own ladder (street.ranks, same shape as RANKS) and
   word the waves its own way (street.waveBlurbs, by wave number): a street with
   fewer bowls scores lower, and "every curtain on Marrow Street" is no good
   anywhere else. Marrow Street uses RANKS and WAVES as they are. */
function ranksOf(street) { return (street && street.ranks) || RANKS; }
function rankFor(score, street) {
  const ranks = ranksOf(street);
  let r = ranks[0][1];
  for (const [min, name] of ranks) if (score >= min) r = name;
  return r;
}
function blurbFor(street, idx) {
  return (street && street.waveBlurbs && street.waveBlurbs[idx]) || WAVES[idx].blurb;
}

/* How wide the renderer draws the road and its pavements, as fractions of the
   street's width (128 and 44 of the 720 design units). The validator needs them
   to know where a bowl can stand, and the renderer reads them from here so the
   two cannot disagree. */
const ROAD_HALF = 128 / 720;
/* A street may have a narrower road (street.roadHalf), which leaves its houses
   deeper gardens. Not wider: the houses would not fit beside it. */
function roadHalfOf(st) { return st && typeof st.roadHalf === 'number' ? st.roadHalf : ROAD_HALF; }
const PAVE_W    = 44 / 720;

const CAT_SPEED = 1.4;        // world units per second
const FOX_SPEED = 0.7;        // slower than the cat: you can beat it to a bowl
const DOG_SPEED = 2.6;

/* The practice night (create({ practice: true })): the core owns its rules so
   the renderer only has to script who twitches and when. No clock and no
   wave, so nothing ever changes by itself; residents move only when told to
   (practiceResident); noise wakes nobody; the marker is slow and the green
   wide and they stay that way; being seen fills the meter at SEEN_RATE of
   normal speed, which turns the 0.9s run window into about 3s for working
   out the swipe. */
const PRACTICE = { speed: 0.42, zoneW: 0.44, seenRate: 0.3, bowlFloor: 2 };

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp  = (a, b, t) => a + (b - a) * t;
const dist  = (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2);
const rand  = (g, a, b) => a + g.rng() * (b - a);

/* bests: best score by street id. Whether a street is open, and what to tell
   the player when it isn't. */
function streetById(id) { return STREETS.find(s => s.id === id) || null; }
function isUnlocked(street, bests) {
  const u = street && street.unlock;
  if (!u) return true;
  const from = streetById(u.street);
  if (!from) return false;
  return ((bests && bests[from.id]) || 0) >= ranksOf(from)[Math.min(u.rank, ranksOf(from).length - 1)][0];
}
function unlockHint(street) {
  const u = street && street.unlock, from = u && streetById(u.street);
  if (!from) return '';
  return 'Reach ' + ranksOf(from)[Math.min(u.rank, ranksOf(from).length - 1)][1] + ' on ' + from.name;
}

/* ---------- layout ---------- */
function bowlSpot(h) { return { x: h.bowlAt.x, y: h.bowlAt.y }; }


/* A house is settled when there is nothing left to do with it tonight. */
const isSettled = (g, h) => !!(h.venue || h.angry || h.cleared);

/* In the slow night the street wakes up as you work through it rather than as
   a clock runs down, so a careful player still meets the late waves -- they
   just take longer to get there. An angry house counts too: the street is
   that much more on edge either way. */
function waveByProgress(g) {
  const hs = g.houses.filter(h => !h.venue);
  const done = hs.filter(h => h.cleared || h.angry).length;
  return Math.min(WAVES.length - 1, Math.floor(done / (hs.length || 1) * WAVES.length));
}

/* What the HUD and the results screen report: how much of the street you
   actually got, and what it cost. */
function progress(g) {
  const hs = g.houses.filter(h => !h.venue);
  return {
    total: hs.length,
    /* disjoint by the grass rule, and counted that way so the headline and
       the line under the map can never contradict each other */
    cleared: hs.filter(h => h.cleared && !h.angry).length,
    lost: hs.filter(h => h.angry).length,
    shut: hs.filter(h => !h.angry && !h.cleared && h.shut > 0).length,
  };
}

/* How good a night was, which is how much of the street you got -- not what
   you scored and not how it ended. Eight of eight is rare; a player who gets
   seven and is carried home has had a good night and the results screen has
   to say so, or the only outcome that reads as a win is the one almost nobody
   reaches. The street's own ladder supplies the names, so a new street needs
   nothing extra, and the thresholds are fractions so a five-bowl street grades
   the same way an eight-bowl one does. */
const NIGHT_GRADE = [0.35, 0.6, 0.8, 1];      // the floor of each rung above the first
function nightGrade(g) {
  const pr = progress(g);
  const frac = pr.total ? pr.cleared / pr.total : 0;
  let idx = 0;
  for (let i = 0; i < NIGHT_GRADE.length; i++) if (frac >= NIGHT_GRADE[i]) idx = i + 1;
  /* No name: the rung drives the verdict wording and the send-off's hearts,
     while the rank the player is shown comes from the score instead, so that
     it agrees with their best and with what unlocks a street. */
  return { idx, frac, cleared: pr.cleared, total: pr.total, lost: pr.lost };
}

/* Tests and the ?debug page need the street standing at a given wave without
   eating their way there; nothing in play sets this. */
function lockWave(g, idx) { g.waveLock = idx == null ? null : clamp(idx, 0, WAVES.length - 1); }

/* ---------- setup ---------- */
function buildHouses(g) {
  g.houses = [];
  g.street.houses.forEach((d, id) => {
    g.houses.push({
      id, col: d.col, row: d.row, side: d.side, name: d.name,
      neighbours: d.neighbours.slice(), bowlAt: d.bowl ? { x: d.bowl.x, y: d.bowl.y } : null,
      venue: d.venue ? { from: d.venue.from, span: d.venue.span } : null,
      angry: false, state: 'idle', t: GRACE + rand(g, 0, 6),   // idle | stir | watch
      bowl: null, respawn: rand(g, 0, 2),
      /* the slow night only: one dinner each, and a fright they get over */
      cleared: false, shut: 0, strikes: 0,
    });
  });
}

function spawnBowl(g, h) {
  const n = wave(g).bites;
  h.bowl = { food: n, max: n };
}

function reset(g) {
  buildHouses(g);
  g.waveIdx = 0;
  g.houses.forEach(h => { if (!h.venue) spawnBowl(g, h); });
  g.cat = { x: g.street.catStart.x, y: g.street.catStart.y, face: 1, target: null };
  g.score = 0; g.bowlsCleared = 0; g.foxLosses = 0; g.keptBonus = 0;
  g.bites = 0; g.perfects = 0; g.misses = 0; g.timesCaught = 0;   /* for the results */
  g.streak = 0; g.bestMult = 1;
  g.elapsed = 0;
  g.racket = 0; g.ending = null; g.waveLock = null;
  g.eat = null; g.caught = null; g.pickup = null; g.leave = null;
  g.spot = { heat: 0, by: null };
  g.dog = null; g.dogTimer = 0; g.fox = null;
  g.events = [];
  g.practice = g.practice ? makePractice() : null;
}

/* The practice script's state: one shape, built here and nowhere else. */
const makePractice = () => ({ holdBowl: false });

/* opts: rng (seeded in tests), street (default Marrow Street), practice. */
function adoptStreet(street) {
  const bad = validateStreet(street);
  if (bad.length) throw new Error('invalid street' + (street && street.name ? ' "' + street.name + '"' : '') + ': ' + bad.join('; '));
  return deepFreeze(STREETS.includes(street) ? street : JSON.parse(JSON.stringify(street)));
}

function create(opts) {
  const g = { rng: (opts && opts.rng) || Math.random, street: adoptStreet((opts && opts.street) || MARROW_STREET),
             practice: opts && opts.practice ? makePractice() : null };
  /* Built once, beside the street it describes, and never from inside
     update(): it uses no randomness, so a seeded replay cannot notice it. */
  g.routes = buildRoutes(g.street);
  reset(g);
  g.scene = 'title';           // title | play | caught | leaving | pickup | over
  return g;
}

/* The renderer owns one long-lived game, so choosing a street on the title
   screen swaps it in place. Only between rounds: the street under a round in
   progress never changes. */
function setStreet(g, street) {
  if (g.scene !== 'title' && g.scene !== 'over') throw new Error('setStreet: a round is in progress');
  g.street = adoptStreet(street);
  g.routes = buildRoutes(g.street);
  reset(g);
}

/* Back to the title screen from the results. */
function toTitle(g) {
  if (g.scene !== 'over') return;
  reset(g);
  g.scene = 'title';
}

function start(g) {
  reset(g);
  g.scene = 'play';
  emit(g, 'wave', { idx: 0 });
}

/* The renderer owns one long-lived game and flips practice on and off around
   the first-launch lesson; the next start() applies it. */
function setPractice(g, on) { g.practice = on ? makePractice() : null; }

function emit(g, type, data) { g.events.push(Object.assign({ type }, data)); }
function drainEvents(g) { return g.events.splice(0); }

function wave(g) { return WAVES[g.waveIdx]; }
/* 0..1 position across the round's difficulty steps */
function wt(g)   { return g.waveIdx / (WAVES.length - 1); }

/* ---------- input ---------- */
/* Tap a house: the cat walks to its bowl and starts eating on arrival. */
function tapHouse(g, id) {
  if (g.scene !== 'play') return;
  const h = g.houses[id];
  if (h.venue) return;          // nothing to eat at the pub
  if (g.eat && g.eat.h === h) return;
  if (g.eat) stopEating(g);
  const s = bowlSpot(h);
  g.cat.target = { x: s.x, y: s.y, house: h.id };
}

/* Tap the road (or anywhere that is not a house): walk there and stop eating. */
function tapRoad(g, x, y) {
  if (g.scene !== 'play') return;
  if (g.eat) stopEating(g);
  const p = clampToPaths(g.routes, x, y);
  g.cat.target = { x: p.x, y: p.y, house: null };
}

/* Tap to take a bite while eating. `atT` is where the marker was when the
   finger landed: the renderer waits a moment to tell a tap from a swipe, and
   the bite is judged on the moment of touch, not on when it was sure. */
function tapEat(g, atT) {
  if (g.scene === 'play' && g.eat) takeBite(g, atT);
}

/* ---------- eating ---------- */
function startEating(g, h) {
  const w = wave(g);
  g.eat = {
    h, t: rand(g, 0.2, 0.8), dir: g.rng() < 0.5 ? 1 : -1,
    speed: g.practice ? PRACTICE.speed : w.speed, zoneW: g.practice ? PRACTICE.zoneW : w.zone,
    zoneMin: w.zoneMin, zone: 0.35,
    bites: 0, cool: 0, flashBad: 0, flashGood: 0,
  };
  placeZone(g);
  emit(g, 'eatStart', { house: h.id });
}

function placeZone(g) {
  const e = g.eat;
  for (let n = 0; n < 40; n++) {
    const z = rand(g, 0.04, 0.96 - e.zoneW);
    if (Math.abs((z + e.zoneW / 2) - e.t) > 0.22) { e.zone = z; return; }
  }
  e.zone = 1 - e.zoneW - 0.04;
}

function stopEating(g) { g.eat = null; }

function takeBite(g, atT) {
  const e = g.eat, h = e.h;
  const t = atT == null ? e.t : atT;
  if (e.cool > 0) return;
  if (t < e.zone || t > e.zone + e.zoneW) {
    e.cool = 0.34; e.flashBad = 0.3;
    g.misses++;
    const before = g.streak;
    g.streak = Math.floor(g.streak / 2);
    emit(g, 'miss', { house: h.id, streakBefore: before, streak: g.streak });
    if (!g.practice) makeNoise(g, h);
    /* The same clatter that wakes the neighbours carries to whoever is out
       looking for you: in the slow night a miss costs tempo, not points. */
    if (!g.practice) g.racket = Math.min(1, g.racket + RACKET_MISS);
    return;
  }
  /* the middle of the green is worth more: something to aim for beyond
     merely not missing */
  const perfect = Math.abs(t - (e.zone + e.zoneW / 2)) <= e.zoneW * PERFECT_FRAC;
  const mult = multFor(g.streak);               /* this bite is paid at the current rate */
  const points = Math.round((perfect ? 15 : 10) * mult);
  e.bites++; e.flashGood = 0.2;
  g.bites++; if (perfect) g.perfects++;
  g.score += points;
  /* only an unseen bite builds the streak */
  if (!watchersOfBowl(g, h).length) g.streak = Math.min(STREAK_CAP, g.streak + (perfect ? 2 : 1));
  const newMult = multFor(g.streak);
  g.bestMult = Math.max(g.bestMult, newMult);
  emit(g, 'bite', { house: h.id, points, perfect, mult, streak: g.streak, multUp: newMult > mult ? newMult : null });

  /* while the lesson holds the bowl, the last bites don't finish it */
  h.bowl.food = g.practice && g.practice.holdBowl ? Math.max(PRACTICE.bowlFloor, h.bowl.food - 1) : h.bowl.food - 1;
  if (!g.practice) {
    e.speed = Math.min(MAX_SPEED, e.speed + BITE_SPEEDUP);
    e.zoneW = Math.max(e.zoneMin, e.zoneW - 0.022);
  }

  if (h.bowl.food <= 0) {
    h.bowl = null; h.respawn = rand(g, 5.5, 9);
    /* One dinner per house per night: a settled house puts out no more, so the
       street empties as you work through it and there is no safe bowl to farm.
       That is also what makes the night finite without a clock. */
    h.cleared = true;
    const bonus = Math.round(25 * multFor(g.streak));
    g.bowlsCleared++; g.score += bonus;
    emit(g, 'clear', { house: h.id, points: bonus });
    stopEating(g);
    return;
  }
  placeZone(g);
}

/* A missed bite clatters the bowl and brings nearby residents to the window.
   Reach is in house-spacings: early on only the neighbours hear it, later the
   diagonals and then the houses two along. */
/* How long a house takes to put a bowl back out, and how long a frightened
   one stays shut. The wait is there to pace a street with somewhere else to
   be: with six bowls in play you go and raid another one. At the end of a
   night there is nowhere else, so waiting on the last house -- while the fox
   circles it -- is simply dead time, which is what a playtest reported. So
   the wait shortens as the street empties. It is not a discount on the
   penalty: being caught still shuts the house and still costs the tempo,
   just not a half-minute of standing about. */
function endgameScale(g) {
  const live = g.houses.filter(h => !h.venue && !h.angry && !h.cleared).length;
  return live <= 1 ? 0.25 : live === 2 ? 0.5 : 1;
}

function houseDist(from, h) {
  /* A venue spans several rows (the pub is three deep) and `row` is the top of
     that span. Measure to the nearest row it occupies, or the far end of a
     terrace can never reach it: from No. 7 the pub's corner is 2.24 away and
     from No. 9 it is 3.16, both past the widest reach, so a clatter there
     could never bring to its window the one watcher that sees every bowl. */
  const span = (h.venue && h.venue.span) || 1;
  return dist(from.col, from.row, h.col, clamp(from.row, h.row, h.row + span - 1));
}

function makeNoise(g, bowlHouse) {
  const reach = lerp(1.1, 2.0, wt(g));
  const lo = lerp(1.8, 0.35, wt(g)), hi = lerp(3.0, 1.1, wt(g));
  for (const h of g.houses) {
    if (h.state !== 'idle' || !isOpen(g, h)) continue;
    if (houseDist(bowlHouse, h) <= reach) h.t = Math.min(h.t, rand(g, lo, hi));
  }
}

/* ---------- residents ---------- */
function updateHouses(g, dt) {
  const w = wave(g);
  let awake = g.houses.reduce((n, h) => n + (h.state !== 'idle' ? 1 : 0), 0);

  for (const h of g.houses) {
    if (h.shut > 0) h.shut -= dt;        // cooling off after a fright
    // An angry resident stops feeding you but never stops watching.
    if (!h.venue && !h.angry && !h.cleared && h.shut <= 0 && !h.bowl) {
      h.respawn -= dt;
      if (h.respawn <= 0 && !(g.eat && g.eat.h === h) && !(g.fox && g.fox.target === h)) spawnBowl(g, h);
    }

    if (g.practice) continue;     // scripted: nobody stirs unless told to
    h.t -= dt;
    if (h.t <= 0) {
      if (h.state === 'idle') {
        if (!isOpen(g, h)) {
          h.t = 1;            // the pub is shut until last orders: look again next second
        } else if (awake >= w.awake) {
          h.t = rand(g, 0.5, 1.5);
        } else {
          h.state = 'stir'; h.t = w.warn; awake++;
          emit(g, 'stir', { house: h.id });
        }
      } else if (h.state === 'stir') {
        h.state = 'watch'; h.t = w.watch + rand(g, 0, 0.5);
      } else {
        h.state = 'idle'; h.t = rand(g, w.idle[0], w.idle[1]); awake--;
      }
    }
  }
}

/* Practice night only: put a resident in a state (idle | stir | watch) and
   leave them there until told otherwise. */
function practiceResident(g, id, state) {
  if (!g.practice) return;
  if (!['idle', 'stir', 'watch'].includes(state)) throw new Error('practiceResident: unknown state ' + state);
  const h = practiceHouse(g, 'practiceResident', id);
  h.state = state; h.t = Infinity;
}
/* Practice night only: give a house with a bowl n bites. */
function practiceBowl(g, id, n) {
  if (!g.practice) return;
  const h = practiceHouse(g, 'practiceBowl', id);
  if (!h.bowl) throw new Error('practiceBowl: house ' + id + ' has no bowl');
  h.bowl.food = n; h.bowl.max = n;
}
function practiceHouse(g, who, id) {
  const h = g.houses[id];
  if (!h) throw new Error(who + ': no house ' + id);
  return h;
}
/* Practice night only: while held, bites never empty the bowl. */
function practiceHoldBowl(g, on) {
  if (g.practice) g.practice.holdBowl = !!on;
}

/* A venue (the pub) only watches from its wave on: "closing time". Houses are
   always open. */
function isOpen(g, h) { return !h.venue || g.waveIdx >= h.venue.from; }

/* w is a threat to a bowl if w is one of its owner's neighbours */
function isThreat(w, owner) { return w !== owner && owner.neighbours.includes(w.id); }

/* Who, right now, could see the cat eating? (the cat only ever eats at a bowl) */
function watchersOfBowl(g, owner) {
  return g.houses.filter(w => isThreat(w, owner) && w.state === 'watch');
}

/* A resident needs a moment to register what they're seeing -- your window to bolt. */
function checkSpotted(g, dt) {
  const seer = g.eat ? watchersOfBowl(g, g.eat.h)[0] || null : null;
  if (seer) {
    /* Being stared at is how the owner works out where you are: in the slow
       night the meter climbs while you are watched, so eating on under a
       twitching curtain costs you the end of your night rather than only
       your streak. */
    if (!g.practice) g.racket = Math.min(1, g.racket + dt * RACKET_SEEN);
    /* While a neighbour can see you there is no streak, whether or not you
       escape. Checked every tick rather than only when the meter is empty:
       a second look while the meter is still cooling must clear it too, and
       bites taken in full view must not quietly rebuild it. */
    if (g.streak > 0) {
      emit(g, 'streakLost', { streak: g.streak, by: seer.id });
      g.streak = 0;
    }
    g.spot.by = seer.id;
    g.spot.heat += g.practice ? dt * PRACTICE.seenRate : dt;
    if (g.spot.heat >= wave(g).react) {
      g.spot.heat = 0; g.spot.by = null;
      getCaught(g, seer, g.eat.h);
    }
  } else {
    g.spot.heat = Math.max(0, g.spot.heat - dt * 2.5);
    if (g.spot.heat === 0) g.spot.by = null;
  }
}

function getCaught(g, witness, owner) {
  /* A witness with no bowl left to withhold tells on the owner instead: one
     that is already angry, the pub, and -- since the night gives each house a
     single dinner -- one that has already been cleared. Without that last
     case a cleared house could take strikes and turn angry, so it counted as
     both got and lost, and a night with a sulking neighbour in it still
     reported itself cleared. (Seen in 193 of 960 replayed bot nights, and in
     the golden log terrace-novice-greedy-11.) The owner always has something
     to lose: the cat is eating out of its bowl. */
  const grass = witness.angry || witness.cleared || !!witness.venue;
  const loser = grass ? owner : witness;
  /* Cooling off. One fright shuts a house for a while; the second stops it
     feeding you for good. The clock loop angered a house permanently on a
     single catch, which in a night that asks you to clear the whole street
     spoiled nearly every run inside the first minute: a mistake should cost
     tempo, not the night. */
  loser.strikes++;
  loser.bowl = null;
  if (loser.strikes >= STRIKES) loser.angry = true;
  else { loser.shut = SHUT_SECS * endgameScale(g); loser.respawn = rand(g, 0.5, 2); }
  if (!g.practice) g.racket = Math.min(1, g.racket + RACKET_CAUGHT);
  g.timesCaught++;
  witness.state = 'idle'; witness.t = rand(g, 2.2, 3.6);
  /* `shut` so the renderer can tell a fright from a falling-out: the card used
     to say "STOPS FEEDING YOU" for both, which made a house that is back in
     22 seconds look written off for the night. */
  g.caught = { witness: witness.id, owner: owner.id, loser: loser.id, grass,
               shut: !loser.angry && loser.shut > 0, t: CAUGHT_SECS };
  stopEating(g);
  g.cat.target = null;
  emit(g, 'caught', { witness: witness.id, owner: owner.id, loser: loser.id, grass,
                      shut: !loser.angry && loser.shut > 0 });
  g.scene = 'caught';
}

/* ---------- the dog ---------- *
 * Runs the length of the street. Every resident goes to the window to look,
 * so the only safe move is to be off the bowls when it passes.            */
function spawnDog(g) {
  const dir = g.rng() < 0.5 ? 1 : -1;
  const d = g.street.dog;
  g.dog = { dir, x: d.x, y: d.ends[dir === 1 ? 0 : 1], phase: 'bark', t: 1.15 };
  emit(g, 'bark', {});
}

function updateDog(g, dt) {
  const w = wave(g);
  if (!g.dog) {
    if (w.dog > 0) {
      g.dogTimer -= dt;
      if (g.dogTimer <= 0) { spawnDog(g); g.dogTimer = w.dog + rand(g, -3, 3); }
    }
    return;
  }
  const d = g.dog;
  if (d.phase === 'bark') {
    // telegraph: every curtain twitches before the dog appears -- except
    // behind a shut pub's shutters, where there is nobody to twitch them.
    for (const h of g.houses) {
      if (!isOpen(g, h)) continue;
      if (h.state === 'idle') h.state = 'stir';
      h.t = Math.max(h.t, 0.35);
    }
    d.t -= dt;
    if (d.t <= 0) { d.phase = 'run'; emit(g, 'bark', {}); }
    return;
  }
  d.y += d.dir * DOG_SPEED * dt;
  /* The dog brings every open house to its window. A venue that hasn't opened
     yet has to be left out: watchersOfBowl only tests state, so a pub stirred
     by the dog before last orders became a watcher the player had no way of
     seeing -- drawVenue goes on drawing it shuttered and dark. */
  for (const h of g.houses) { if (!isOpen(g, h)) continue; h.state = 'watch'; h.t = 0.7; }
  const run = g.street.dog;
  if (d.y < Math.min(...run.ends) - run.overrun || d.y > Math.max(...run.ends) + run.overrun) g.dog = null;
}

/* ---------- the fox ---------- *
 * Competition, not a threat. It robs bowls; residents don't care.        */
function spawnFox(g) {
  const fromTop = g.rng() < 0.5;
  const f = g.street.fox;
  g.fox = { x: f.x, y: f.ends[fromTop ? 0 : 1], patrol: fromTop ? 1 : -1,
            target: null, eatT: 0, rest: 0 };
}

/* Night only: a bowl the cat has already sat down at is not up for grabs.
   The fox robs bowls one ball a second and takes the cat off the bowl when it
   empties one, which under the clock was a nuisance among eight bowls. In the
   slow night the last house is the only bowl on the street, so the fox camped
   it, drained it faster than it could be eaten, and came straight back when it
   respawned -- the final bowl could not be won at all. So it is a race now:
   whoever sits down first keeps it. The fox is still faster to a bowl the cat
   is only walking towards, and still takes anything left unattended, which is
   what "competition, not a threat" was always meant to mean. */
const foxBarred = (g, h) => !!(g.eat && g.eat.h === h);

function foxPickTarget(g) {
  const f = g.fox;
  let best = null, bd = Infinity;
  for (const h of g.houses) {
    if (!h.bowl || foxBarred(g, h)) continue;
    /* By how far it has to walk, not how far it looks: on a street that bends,
       the nearest bowl as the crow flies can be the long way round. With no
       corners in the way this is the straight line it always was. */
    const s = bowlSpot(h), d = routeDist(g.routes, f.x, f.y, s.x, s.y);
    if (d < bd) { bd = d; best = h; }
  }
  f.target = best;
}

function updateFox(g, dt) {
  if (!wave(g).fox) return;
  if (!g.fox) { spawnFox(g); return; }
  const f = g.fox;

  if (f.rest > 0) {            // a smug sit-down between courses
    f.rest -= dt;
    f.target = null;
    return;
  }
  if (!f.target || !f.target.bowl || foxBarred(g, f.target)) { foxPickTarget(g); f.eatT = 0; }
  if (!f.target) {             // nothing to rob -- mooch up and down the road
    const run = g.street.fox;
    /* The mooch is up and down the line the street's fox names, and it gets
       there by easing x towards it. On a street that bends, a fox left up a
       cul-de-sac cannot ease towards that line without crossing the houses in
       between (it was off walkable ground 0.22s later), so it walks back to
       the road properly first. On a street with one run of road there is never
       a corner between the two, routeNext says so, and the mooch below is
       exactly what it always was. */
    const home = { x: run.x, y: clamp(f.y, run.patrol.y[0], run.patrol.y[1]) };
    const wp = routeNext(g.routes, f.x, f.y, home.x, home.y);
    if (wp) {
      const d = dist(f.x, f.y, wp.x, wp.y), step = Math.min(d, FOX_SPEED * dt);
      f.x += ((wp.x - f.x) / d) * step;
      f.y += ((wp.y - f.y) / d) * step;
      return;
    }
    f.y += f.patrol * run.patrol.speed * dt;
    if (f.y < run.patrol.y[0] || f.y > run.patrol.y[1]) f.patrol *= -1;
    f.x = lerp(f.x, run.x, dt * 2);
    return;
  }

  const h = f.target, s = bowlSpot(h), d = dist(f.x, f.y, s.x, s.y);
  if (d > 0.04) {
    /* Arrival is still judged against the bowl, never against a corner, or
       the fox would sit down and eat at the turn. */
    const wp = routeNext(g.routes, f.x, f.y, s.x, s.y);
    const tx = wp ? wp.x : s.x, ty = wp ? wp.y : s.y;
    const wd = wp ? dist(f.x, f.y, tx, ty) : d;
    const step = Math.min(wd, FOX_SPEED * dt);
    f.x += ((tx - f.x) / wd) * step;
    f.y += ((ty - f.y) / wd) * step;
    f.eatT = 0;
    return;
  }
  f.eatT += dt;
  if (f.eatT >= 1.0) {         // one ball at a time
    f.eatT = 0;
    if (h.bowl) {
      h.bowl.food--;
      if (h.bowl.food <= 0) {
        const k = endgameScale(g);
        h.bowl = null; h.respawn = rand(g, 5.5 * k, 9 * k);
        g.foxLosses++;
        emit(g, 'steal', { house: h.id });
        if (g.eat && g.eat.h === h) stopEating(g);
        f.target = null;
        f.rest = 1.4;
      }
    }
  }
}

/* ---------- the owner arrives ---------- */

/* A full attention meter means the owner has found you, whatever else happened
   on the same tick. Three places end a night -- the drift in `play`, a catch
   that has just played out, and the street settling -- and the last two each
   once missed this and let the cat stroll off with the bar at 1.00. So the
   meter is asked here, and the first thing any of them does is ask. */
const ownerHere = g => !g.practice && g.racket >= 1;
function fetchOwner(g) { g.ending = 'owner'; beginPickup(g); }

/* checkSpotted only runs in `play`, so a RUN bar half drained when the scene
   changes would sit frozen on screen through whatever follows: it is drawn from
   g.spot without looking at g.eat, and the close-up eases out rather than
   cutting. Every way out of `play` clears it. */
function clearSpot(g) { g.spot.heat = 0; g.spot.by = null; }

function beginPickup(g) {
  stopEating(g);
  g.cat.target = null;
  clearSpot(g);
  g.pickup = { t: 0, side: g.cat.x > g.street.roadX ? 1 : 0 };
  g.scene = 'pickup';
  emit(g, 'call', {});
}

/* The cat goes off the end of the road by itself: nothing left worth staying
   for, or nothing left at all. */
function beginLeave(g) {
  stopEating(g);
  g.cat.target = null;
  clearSpot(g);              /* it never showed before because the ending cut away on the same frame */
  if (!g.ending) g.ending = g.houses.every(h => h.venue || (h.cleared && !h.angry)) ? 'cleared' : 'done';
  const w = g.routes.bounds.y;
  /* the anchor the turn is made around, so it starts and finishes on the spot */
  g.leave = { t: 0, up: Math.abs(g.cat.y - w[0]) <= Math.abs(g.cat.y - w[1]),
              ax: g.cat.x, ay: g.cat.y };
  g.scene = 'leaving';
  emit(g, 'leave', { ending: g.ending });
}

function skipLeave(g) {
  if (g.scene !== 'leaving' || g.leave.t < LEAVE_SKIP) return false;
  endRound(g);
  return true;
}

function endRound(g) {
  if (g.scene === 'over') return;
  /* 'cleared' only when nobody shut you out -- the difference between a clean
     night and merely running out of street. Set already if the owner came.
     The `!h.angry` is belt and braces: the grass rule in getCaught should keep
     a cleared house from ever turning angry, and a test holds it to that. */
  if (!g.ending) g.ending = g.houses.every(h => h.venue || (h.cleared && !h.angry)) ? 'cleared' : 'done';
  g.keptBonus = g.houses.filter(h => !h.venue && !h.angry).length * KEPT_BONUS;
  g.score += g.keptBonus;
  stopEating(g);
  g.scene = 'over';
  emit(g, 'over', { score: g.score });
}

/* ---------- cat ---------- */
function updateCat(g, dt) {
  const c = g.cat;
  if (!c.target) return;
  /* The next corner to make for. On a street that is one run of road there
     are no corners, routeNext hands back null, and the walk below is the
     straight line it has always been -- the same arithmetic on the same
     numbers, which is what keeps the golden playthroughs identical. */
  const wp = routeNext(g.routes, c.x, c.y, c.target.x, c.target.y);
  const tx = wp ? wp.x : c.target.x, ty = wp ? wp.y : c.target.y;
  const d = dist(c.x, c.y, tx, ty);
  const step = CAT_SPEED * dt;
  if (Math.abs(tx - c.x) > 0.01) c.face = tx > c.x ? 1 : -1;
  if (d > step) {
    c.x += ((tx - c.x) / d) * step;
    c.y += ((ty - c.y) / d) * step;
    return;
  }
  c.x = tx; c.y = ty;
  /* A corner, not the bowl: the rest of this step is given up rather than
     carried round the turn, which costs at most a frame and nobody can see. */
  if (wp) return;
  const hid = c.target.house;
  c.target = null;
  if (hid !== null) {
    const h = g.houses[hid];
    if (h.bowl) startEating(g, h);
  }
}

function updateEat(g, dt) {
  const e = g.eat;
  e.cool      = Math.max(0, e.cool - dt);
  e.flashBad  = Math.max(0, e.flashBad - dt);
  e.flashGood = Math.max(0, e.flashGood - dt);
  e.t += e.dir * e.speed * dt;
  if (e.t > 1) { e.t = 1; e.dir = -1; }
  if (e.t < 0) { e.t = 0; e.dir = 1; }
  if (!e.h.bowl) stopEating(g);
}

/* ---------- update ---------- */
function update(g, dt) {
  if (g.scene === 'pickup') {
    g.pickup.t += dt;
    updateHouses(g, dt);
    if (g.pickup.t > PICKUP_SECS) endRound(g);
    return;
  }
  if (g.scene === 'leaving') {
    const lv = g.leave;
    lv.t += dt;
    if (lv.t < LEAVE_CIRCLE) {
      /* A pleased little turn on the spot before going. Starts and ends at the
         anchor, so the walk off begins from where the cat was standing. The
         loop is narrow across the road and long along it, because that is the
         shape of the space it has. */
      const k = lv.t / LEAVE_CIRCLE, a = k * Math.PI * 2;
      lv.x = lv.ax + Math.sin(a) * 0.055;
      lv.y = lv.ay + (1 - Math.cos(a)) * 0.22;
      g.cat.face = Math.cos(a) >= 0 ? 1 : -1;
      g.cat.x = lv.x; g.cat.y = lv.y;
    } else {
      /* out past the end of the road, drifting to the middle of it on the way */
      const w = g.routes.bounds.y, endY = lv.up ? w[0] - 1.4 : w[1] + 1.4;
      const dy = endY - g.cat.y, step = CAT_SPEED * 0.95 * dt;
      g.cat.y += Math.abs(dy) > step ? Math.sign(dy) * step : dy;
      g.cat.x = lerp(g.cat.x, g.street.roadX, dt * 2.2);
    }
    updateHouses(g, dt);
    if (lv.t > LEAVE_SECS) endRound(g);
    return;
  }
  if (g.scene === 'caught') {
    g.caught.t -= dt;
    updateHouses(g, dt);
    if (g.caught.t <= 0) {
      g.caught = null;
      /* The attention check lives in the `play` branch, which this one returns
         before reaching -- so a catch that both fills the meter and settles the
         last house used to end the night as `done`, the cat strolling off with
         the bar sitting at 1.00 and the owner never arriving. If they have
         found you, that is how the night ended, whatever else happened on the
         same tick. */
      if (ownerHere(g)) fetchOwner(g);
      else if (!g.practice && g.houses.every(h => isSettled(g, h))) beginLeave(g);
      else g.scene = 'play';
    }
    return;
  }
  if (g.scene !== 'play') return;

  g.elapsed  += dt;
  /* No countdown: the night runs until the street is done with you, or until
     the racket fetches the owner. The drift is what stops a flawless cat
     prowling for ever -- the night does end, you just get a longer one for
     being quiet. The lesson has no attention at all.

     There was a SLIP AWAY button here too, for leaving while you were ahead.
     Nobody used it, and the reason was structural rather than a matter of
     presentation: every ending pays the same kept bonus and the same points,
     and the score is banked as you eat, so leaving early protects nothing.
     A cash-out needs something at stake to cash out of. If the night ever
     wants a final decision, give the endings different outcomes first. */
  if (!g.practice) {
    g.racket = Math.min(1, g.racket + RACKET_DRIFT * dt);
    if (ownerHere(g)) { fetchOwner(g); return; }
  }

  // wave changeover
  const wi = g.waveLock != null ? g.waveLock : waveByProgress(g);
  if (wi !== g.waveIdx) {
    g.waveIdx = wi;
    emit(g, 'wave', { idx: wi });
    if (wave(g).dog > 0 && !g.dog) g.dogTimer = rand(g, 4, 8);
    if (wave(g).fox && !g.fox) spawnFox(g);
  }

  if (g.eat) updateEat(g, dt); else updateCat(g, dt);

  updateHouses(g, dt);
  updateDog(g, dt);
  updateFox(g, dt);
  checkSpotted(g, dt);

  /* Only from open play: if this tick's catch took the last friendly house,
     the 'caught' scene shows SPOTTED! first and ends the round itself. The
     meter is asked first here too: today nothing can fill it on the tick the
     last bowl is finished (it only rises from being seen while eating, and a
     finished bowl is not being eaten), but that is a fact about checkSpotted,
     not a rule, and the last time it was assumed the owner never came. */
  if (g.scene === 'play' && !g.practice && g.houses.every(h => isSettled(g, h))) {
    if (ownerHere(g)) fetchOwner(g); else beginLeave(g);
  }
}

return {
  MARROW_STREET, TERRACE_STREET, STREETS, streetById, isUnlocked, unlockHint, setStreet, toTitle, validateStreet, ROAD_HALF, roadHalfOf, PAVE_W,
  PRACTICE, WAVES, GRACE, KEPT_BONUS,
  CAT_SPEED, FOX_SPEED, DOG_SPEED, CAUGHT_SECS, PICKUP_SECS, PERFECT_FRAC, BITE_SPEEDUP, MAX_SPEED, STREAK_STEP, STREAK_CAP, multFor,
  RANKS, rankFor, ranksOf, blurbFor, isOpen,
  create, start, update, drainEvents, setPractice, practiceResident, practiceBowl, practiceHoldBowl,
  tapHouse, tapRoad, tapEat,
  bowlSpot, wave, watchersOfBowl, isThreat, houseDist, spawnBowl,
  /* walking routes */
  pathsOf, buildRoutes, routeNext, routePath, routeDist, clampToPaths,
  /* the slow night */
  progress, waveByProgress, nightGrade, lockWave, skipLeave,
  LEAVE_SECS, LEAVE_CIRCLE, LEAVE_SKIP,
  NIGHT: { SHUT_SECS, STRIKES, RACKET_DRIFT, RACKET_MISS, RACKET_CAUGHT, RACKET_SEEN },
  endgameScale,
};
});
