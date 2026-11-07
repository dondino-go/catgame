/*
 * PROTOTYPE: a street a day (#34), to find out whether the building blocks we
 * have can make streets that play differently, before anything is built for
 * real. Nothing in src/ uses this.
 *
 * The whole question is `neighbours` -- who can see whose bowl -- because that
 * is the puzzle. Both hand-made streets are reproduced by one rule from their
 * shapes (see `node tools/street-lab.js rule`), which is the test that the
 * generator understands the game rather than just emitting valid data:
 *
 *   next door   two buildings on the same side whose rows touch
 *   across      two buildings on opposite sides whose rows overlap
 *   venue reach a venue (the pub) also sees `reach` rows beyond the rows it
 *               occupies, on the opposite side
 *
 * Then a repair pass, because a street must be valid: a house may have at most
 * three neighbours (the close-up has three windows), so the weakest edges
 * (venue reach) go first; and a house must have at least one, so a lonely one
 * is linked to its nearest neighbour. The number of repairs is reported,
 * because a rule that needs many is a rule that is straining.
 *
 * Blocks used, all of which the renderer already draws: houses either side of
 * the road with gaps, venues with a wave they open at, two kinds of scenery,
 * a narrow or a standard road, and the two existing looks.
 */
'use strict';
/* Node (the lab) or a browser page (tools/street-lab-play.html): there the
   rules are window.BowlCore, loaded from src/core.js beforehand. */
const C = typeof module === 'object' && module.exports ? require(require('path').join(__dirname, '..', 'src', 'core.js')) : window.BowlCore;

const hash = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const mulberry = a => () => {
  a |= 0; a = a + 0x6D2B79F5 | 0;
  let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];
const weighted = (rnd, table) => {
  let r = rnd() * table.reduce((n, [, w]) => n + w, 0);
  for (const [v, w] of table) { if ((r -= w) < 0) return v; }
  return table[table.length - 1][0];
};

/* ---------- the sight-line rule ---------- */

/* items: [{ side, row, span, venue, reach }] in id order. Returns the
   neighbour lists and how much repair it took. */
function deriveNeighbours(items) {
  const n = items.length, edges = new Map();
  const top = i => items[i].row, bot = i => items[i].row + (items[i].span || 1);
  const key = (a, b) => a < b ? a + ',' + b : b + ',' + a;
  const add = (a, b, s) => { const k = key(a, b); edges.set(k, Math.max(edges.get(k) || 0, s)); };

  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const A = items[a], B = items[b];
    if (A.venue && B.venue) continue;                        // a venue cannot watch a venue
    if (A.side === B.side) {
      if (bot(a) === top(b) || bot(b) === top(a)) add(a, b, 3);          // next door
    } else if (top(a) < bot(b) && top(b) < bot(a)) {
      add(a, b, 3);                                                      // across the road
    }
    const v = A.venue ? a : B.venue ? b : -1;
    if (v >= 0 && items[v].side !== items[v === a ? b : a].side) {
      const h = v === a ? b : a;
      const gap = Math.max(top(h) - bot(v), top(v) - bot(h));
      if (gap >= 0 && gap < (items[v].reach || 0)) add(a, b, 1);         // the pub sees along the road
    }
  }

  const nb = items.map(() => new Set());
  const link = (k) => { const [a, b] = k.split(',').map(Number); nb[a].add(b); nb[b].add(a); };
  edges.forEach((_, k) => link(k));
  const unlink = (a, b) => { nb[a].delete(b); nb[b].delete(a); };

  const repairs = { capped: 0, lonely: 0 };
  /* at most three windows: drop the weakest edge first, then the longest-standing.
     A venue is exempt -- it has no close-up, and the pub is meant to see the lot. */
  for (let i = 0; i < n; i++) {
    while (!items[i].venue && nb[i].size > 3) {
      const worst = [...nb[i]].sort((p, q) => edges.get(key(i, p)) - edges.get(key(i, q)) || q - p)[0];
      unlink(i, worst); repairs.capped++;
    }
  }
  /* at least one window: the nearest building with a spare one */
  for (let i = 0; i < n; i++) {
    if (nb[i].size) continue;
    const dist = j => Math.max(top(j) - bot(i), top(i) - bot(j), 0) + (items[j].side === items[i].side ? 0 : 0.5);
    const near = items.map((_, j) => j).filter(j => j !== i && !(items[i].venue && items[j].venue) && nb[j].size < 3)
      .sort((p, q) => dist(p) - dist(q) || p - q)[0];
    if (near === undefined) return null;
    nb[i].add(near); nb[near].add(i); repairs.lonely++;
  }
  return { neighbours: nb.map(s => [...s].sort((p, q) => p - q)), repairs };
}

/* ---------- a street from a seed ---------- */

const SURNAMES = ['Pemburys', 'Old Nan', 'Dobsons', 'Mr Quill', 'Ashfords', 'Bea & Rook', 'Mullens', 'Doctor Pye',
  'Hargreaves', 'Miss Vane', 'Corbetts', 'Mr Finch', 'Tolliver', 'Widow Marsh', 'Okafors', 'Pip & Sorrel', 'Larkins',
  'Mrs Dunn', 'Bellweathers', 'Captain Hobb', 'Nkemelus', 'The Rudges', 'Aunt Cora', 'Mr Sato'];
const PUBS = ['The Stag\'s Head', 'The Red Lion', 'The Anchor', 'The Plough', 'The Half Moon', 'The Fox & Grapes'];
const STREET_NAMES = ['Hollis', 'Quarry', 'Tanner', 'Mill', 'Cobbler', 'Bramble', 'Fennel', 'Garrick', 'Linnet', 'Osier'];
const STREET_KINDS = ['Street', 'Row', 'Lane', 'Close', 'Terrace', 'Walk'];

/* what each side of the road is: the shapes the streets are made from */
const SIDES = {
  full:  rows => Array.from({ length: rows }, () => 'house'),
  gappy: rows => Array.from({ length: rows }, () => ('house')),     // thinned below
  venue: rows => Array.from({ length: rows }, () => 'free'),
  empty: rows => Array.from({ length: rows }, () => 'free'),
};
const ARCHETYPES = [
  [['full', 'full'], 14], [['full', 'gappy'], 16], [['gappy', 'gappy'], 14],
  [['full', 'venue'], 22], [['gappy', 'venue'], 14], [['full', 'empty'], 8], [['venue', 'venue'], 12],
];

function build(rnd, seed, opts) {
  const maxBowls = (opts && opts.maxBowls) || 9, minBowls = (opts && opts.minBowls) || 4;
  /* a quick street is short too: six rows with four bowls is mostly holes */
  const rows = weighted(rnd, maxBowls <= 6 ? [[4, 45], [5, 45], [6, 10]] : [[4, 22], [5, 40], [6, 38]]);
  const [la, ra] = weighted(rnd, ARCHETYPES);
  const flip = rnd() < 0.5;
  const kinds = flip ? [ra, la] : [la, ra];                  // which archetype takes the left side
  const cells = [SIDES[kinds[0]](rows), SIDES[kinds[1]](rows)];   // side index 0 = left (-1), 1 = right (+1)
  const venues = [];

  kinds.forEach((kind, s) => {
    if (kind === 'gappy') cells[s] = cells[s].map(() => rnd() < 0.58 ? 'house' : 'gap');
    if (kind === 'venue') {
      const span = rnd() < 0.55 ? 3 : 2, r0 = Math.floor(rnd() * (rows - span + 1));
      for (let r = r0; r < r0 + span; r++) cells[s][r] = 'venue';
      venues.push({ s, row: r0, span, from: weighted(rnd, [[1, 25], [2, 45], [3, 30]]), reach: weighted(rnd, [[0, 25], [1, 50], [2, 25]]) });
      /* the rows the venue leaves free are sometimes houses, mostly not */
      for (let r = 0; r < rows; r++) if (cells[s][r] === 'free') cells[s][r] = rnd() < 0.35 ? 'house' : 'gap';
    }
    if (kind === 'empty') cells[s] = cells[s].map(() => 'gap');
  });

  /* a cap on bowls (nine unless asked), so a night stays short; more than that and some become gaps */
  const houseCells = () => { const out = []; cells.forEach((col, s) => col.forEach((c, r) => { if (c === 'house') out.push([s, r]); })); return out; };
  while (houseCells().length > maxBowls) { const [s, r] = pick(rnd, houseCells()); cells[s][r] = 'gap'; }
  if (houseCells().length < minBowls) return null;

  /* items in id order: the left side top to bottom, then the right */
  const items = [], meta = [];
  const names = SURNAMES.slice().sort(() => rnd() - 0.5);
  const numbered = rnd() < 0.5, pubs = PUBS.slice().sort(() => rnd() - 0.5);
  [0, 1].forEach(s => {
    for (let r = 0; r < rows; r++) {
      if (cells[s][r] === 'house') {
        items.push({ side: s ? 1 : -1, row: r, span: 1 });
        meta.push({ name: numbered ? 'No. ' + (2 * r + (s ? 2 : 1)) : names.pop() });
      } else if (cells[s][r] === 'venue' && (r === 0 || cells[s][r - 1] !== 'venue')) {
        const v = venues.find(x => x.s === s && x.row === r);
        items.push({ side: s ? 1 : -1, row: r, span: v.span, venue: true, reach: v.reach, from: v.from });
        meta.push({ name: pubs.pop() });
      }
    }
  });

  const d = deriveNeighbours(items);
  if (!d) return null;

  const roadX = 0.5, half = rnd() < 0.5 ? 100 / 720 : C.ROAD_HALF, off = half + 23 / 720;
  const houses = items.map((it, id) => {
    const h = { name: meta[id].name, col: it.side < 0 ? 0 : 1, row: it.row, side: it.side, neighbours: d.neighbours[id] };
    if (it.venue) h.venue = { from: it.from, span: it.span };
    else h.bowl = { x: +(roadX + it.side * off).toFixed(4), y: it.row + 0.5 };
    return h;
  });

  /* something to look at in the rows nobody built on */
  const scenery = [];
  let bus = false;
  [0, 1].forEach(s => {
    for (let r = 0; r < rows; r++) {
      if (cells[s][r] !== 'gap') continue;
      const nextToVenue = (cells[s][r - 1] === 'venue') || (cells[s][r + 1] === 'venue');
      if (nextToVenue && rnd() < 0.8) scenery.push({ kind: 'beergarden', row: r, side: s ? 1 : -1 });
      else if (!bus && rnd() < 0.3) { scenery.push({ kind: 'busstop', row: r, side: s ? 1 : -1 }); bus = true; }
    }
  });

  const evening = rnd() < 0.5;
  const street = {
    id: 'daily-' + seed,
    name: pick(rnd, STREET_NAMES) + ' ' + pick(rnd, STREET_KINDS),
    rows, roadX, roadHalf: half,
    walk: { x: [+(roadX - off).toFixed(4), +(roadX + off).toFixed(4)], y: [0.2, rows - 0.2] },
    catStart: { x: roadX, y: rows / 2 },
    houses,
    dog: { x: roadX, ends: [-0.6, rows + 0.6], overrun: 0.2 },
    fox: { x: roadX, ends: [-0.6, rows + 0.6], patrol: { y: [0.3, rows - 0.3], speed: 0.3 } },
  };
  if (scenery.length) street.scenery = scenery;
  if (evening) street.look = JSON.parse(JSON.stringify(C.TERRACE_STREET.look));
  return { street, info: { rows, kinds: kinds.join('+'), venues: venues.length, repairs: d.repairs, evening } };
}

function generate(seed, opts) {
  const rnd = mulberry(hash(seed));
  for (let attempt = 0; attempt < 200; attempt++) {
    const b = build(rnd, seed, opts);
    if (!b) continue;
    const bad = C.validateStreet(b.street);
    if (!bad.length) { b.info.attempts = attempt + 1; return b; }
    b.info.invalid = bad;
    if (process.env.GEN_DEBUG) console.error(seed, bad.slice(0, 3));
  }
  throw new Error('no valid street for seed ' + seed);
}

/* ---------- reading a street ---------- */

/* a map you can read in a terminal: left side | road | right side */
function ascii(st) {
  const cell = (side, r) => {
    const hs = st.houses.map((h, id) => ({ h, id })).filter(x => x.h.side === side);
    const hit = hs.find(x => r >= x.h.row && r < x.h.row + (x.h.venue ? x.h.venue.span : 1));
    if (hit) return hit.h.venue ? (r === hit.h.row ? '[' + hit.h.name.slice(4, 9).padEnd(5) + ']' : '[     ]') : '[ #' + hit.id + ' ]';
    const sc = (st.scenery || []).find(x => x.side === side && x.row === r);
    return sc ? (sc.kind === 'busstop' ? ' bus  ' : ' beer ') : '  ..  ';
  };
  const lines = [];
  for (let r = 0; r < st.rows; r++) lines.push('  ' + cell(-1, r) + ' | | ' + cell(1, r));
  return lines.join('\n');
}

/* how exposed the bowls are, in numbers */
function structure(st) {
  const bowls = st.houses.filter(h => !h.venue);
  const deg = bowls.map(h => h.neighbours.length);
  const venues = st.houses.filter(h => h.venue);
  /* bowl graph components, ignoring venues: islands are houses that never share a watcher */
  const seen = new Set(); let comps = 0;
  st.houses.forEach((h, i) => {
    if (h.venue || seen.has(i)) return; comps++;
    const stack = [i]; seen.add(i);
    while (stack.length) { const x = stack.pop(); st.houses[x].neighbours.forEach(j => { if (!st.houses[j].venue && !seen.has(j)) { seen.add(j); stack.push(j); } }); }
  });
  return { bowls: bowls.length, venues: venues.length, meanDeg: deg.reduce((a, b) => a + b, 0) / deg.length,
           maxDeg: Math.max(...deg), islands: comps, degSeq: deg.slice().sort().join('') };
}

const API = { generate, deriveNeighbours, ascii, structure, hash, mulberry };
if (typeof module === 'object' && module.exports) module.exports = API; else window.StreetGen = API;
