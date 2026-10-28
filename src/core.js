/*
 * Bowl Bandit -- game rules, no rendering.
 *
 * The rules know nothing about any particular street. A street is a plain
 * description (see MARROW_STREET and validateStreet below): the houses with
 * their grid position, bowl spot and explicit list of neighbours, the area the
 * cat may walk in, the road the dog runs down and the fox patrols, and where
 * the cat starts. create() takes one, defaulting to Marrow Street, and refuses
 * a street that fails the validator.
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
 *   this distance, and the renderer uses it to place the house.
 * house.bowl: where its bowl sits, in world units.
 * house.neighbours: ids of the houses that can see its bowl (and whose bowls
 *   it can see). Must be mutual.
 * walk: the rectangle the cat may be sent to; every bowl is inside it.
 * dog.ends / fox.ends: y the animal enters at, one per end of the road (the
 *   first is "from the top"); it runs to the other and is gone `overrun`
 *   past it. fox.patrol: the stretch it mooches along when nothing is worth
 *   robbing. Both travel along the vertical line x = `x`.
 * Every house is listed once, in id order. */
const MARROW_STREET = {
  name: 'Marrow Street',
  rows: 4,
  roadX: 0.5,
  walk: { x: [0.29, 0.71], y: [0.2, 3.8] },
  catStart: { x: 0.5, y: 2 },
  houses: [
    { name: 'The Pemburys', col: 0, row: 0, bowl: { x: 0.29, y: 0.5 }, neighbours: [1, 4] },
    { name: 'Old Nan',      col: 0, row: 1, bowl: { x: 0.29, y: 1.5 }, neighbours: [0, 2, 5] },
    { name: 'The Dobsons',  col: 0, row: 2, bowl: { x: 0.29, y: 2.5 }, neighbours: [1, 3, 6] },
    { name: 'Mr Quill',     col: 0, row: 3, bowl: { x: 0.29, y: 3.5 }, neighbours: [2, 7] },
    { name: 'The Ashfords', col: 1, row: 0, bowl: { x: 0.71, y: 0.5 }, neighbours: [5, 0] },
    { name: 'Bea & Rook',   col: 1, row: 1, bowl: { x: 0.71, y: 1.5 }, neighbours: [4, 6, 1] },
    { name: 'The Mullens',  col: 1, row: 2, bowl: { x: 0.71, y: 2.5 }, neighbours: [5, 7, 2] },
    { name: 'Doctor Pye',   col: 1, row: 3, bowl: { x: 0.71, y: 3.5 }, neighbours: [6, 3] },
  ],
  dog: { x: 0.5, ends: [-0.6, 4.6], overrun: 0.2 },
  fox: { x: 0.5, ends: [-0.6, 4.6], patrol: { y: [0.3, 3.7], speed: 0.3 } },
};

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); }
  return o;
}
deepFreeze(MARROW_STREET);   // shared by every default game: nothing may edit it mid-round

/* Everything wrong with a street, as a list of messages (empty if it is fine).
   create() throws on a non-empty list; tests and tools can read it. */
function validateStreet(st) {
  const bad = [];
  const num = v => typeof v === 'number' && isFinite(v);
  const pair = v => Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1]) && v[0] < v[1];
  if (!st || typeof st !== 'object') return ['street is not an object'];
  if (!(Number.isInteger(st.rows) && st.rows > 0)) bad.push('rows must be a positive integer');
  if (!num(st.roadX)) bad.push('roadX must be a number');
  const walkOk = st.walk && pair(st.walk.x) && pair(st.walk.y);
  if (!walkOk) bad.push('walk needs x and y ranges, [min, max]');
  const inWalk = p => walkOk && p && num(p.x) && num(p.y) &&
    p.x >= st.walk.x[0] && p.x <= st.walk.x[1] && p.y >= st.walk.y[0] && p.y <= st.walk.y[1];
  if (!(st.catStart && inWalk(st.catStart))) bad.push('catStart must be inside the walkable area');
  const hs = st.houses;
  if (!Array.isArray(hs) || !hs.length) { bad.push('houses must be a non-empty list'); return bad; }
  hs.forEach((h, id) => {
    const at = 'house ' + id + (h && h.name ? ' (' + h.name + ')' : '');
    if (!h || typeof h.name !== 'string' || !h.name) bad.push(at + ': needs a name');
    if (!h || !num(h.col) || !num(h.row)) { bad.push(at + ': col and row must be numbers'); return; }
    if (!inWalk(h.bowl)) bad.push(at + ': bowl must be inside the walkable area');
    if (!Array.isArray(h.neighbours)) { bad.push(at + ': neighbours must be a list'); return; }
    if (new Set(h.neighbours).size !== h.neighbours.length) bad.push(at + ': neighbours repeat');
    for (const n of h.neighbours) {
      if (!Number.isInteger(n) || n < 0 || n >= hs.length) bad.push(at + ': neighbour ' + n + ' is not a house id');
      else if (n === id) bad.push(at + ': is its own neighbour');
      else if (!(hs[n] && hs[n].neighbours || []).includes(id)) bad.push(at + ': neighbour ' + n + ' does not list it back');
    }
  });
  const ends = o => o && Array.isArray(o.ends) && o.ends.length === 2 && o.ends.every(num) && o.ends[0] !== o.ends[1];
  if (!(st.dog && num(st.dog.x) && ends(st.dog) && num(st.dog.overrun) && st.dog.overrun >= 0)) bad.push('dog needs x, two ends and an overrun');
  const pt = st.fox && st.fox.patrol;
  if (!(st.fox && num(st.fox.x) && ends(st.fox))) bad.push('fox needs x and two ends');
  if (!(pt && pair(pt.y) && num(pt.speed) && pt.speed > 0)) bad.push('fox.patrol needs a y range and a speed');
  else if (ends(st.fox) && (pt.y[0] < Math.min(...st.fox.ends) || pt.y[1] > Math.max(...st.fox.ends)))
    bad.push('fox.patrol.y must lie between the fox\'s ends');
  return bad;
}

/* Difficulty steps at wave boundaries rather than creeping continuously,
   so the player can feel the street turning against them. */
const WAVES = [
  { name:'QUIET STREET', secs:30,
    warn:1.90, watch:1.15, idle:[7.5,12.0], awake:1, bites:3,
    react:0.90, speed:0.50, zone:0.42, zoneMin:0.22,
    dog:0,  fox:false, blurb:'nobody is paying much attention yet' },
  { name:'CURTAINS TWITCHING', secs:30,
    warn:1.45, watch:1.60, idle:[5.5,9.0],  awake:2, bites:4,
    react:0.75, speed:0.60, zone:0.36, zoneMin:0.18,
    dog:19, fox:false, blurb:'a DOG is loose - it sends everyone to the windows' },
  { name:'GETTING NOSY', secs:30,
    warn:1.05, watch:2.05, idle:[4.0,7.0],  awake:3, bites:5,
    react:0.60, speed:0.72, zone:0.31, zoneMin:0.145,
    dog:15, fox:true,  blurb:'a FOX is working the same street - it will rob your bowls' },
  { name:'NEIGHBOURHOOD WATCH', secs:30,
    warn:0.72, watch:2.50, idle:[2.6,4.8],  awake:4, bites:6,
    react:0.48, speed:0.85, zone:0.26, zoneMin:0.115,
    dog:11, fox:true,  blurb:'every curtain on Marrow Street is twitching' },
];
const GAME_SECONDS = WAVES.reduce((n, w) => n + w.secs, 0);
const GRACE        = 4.5;     // nobody stirs for the first few seconds
const KEPT_BONUS   = 40;      // per neighbour still feeding you at the whistle
const CAUGHT_SECS  = 1.6;
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

/* What a final score makes you. Calibrated by simulating bots with timing
   error and reaction delay, with the streak in play: a greedy novice lands
   near 900, a careful novice 1600, careful decent play 2600, and careful
   expert play 3200. Real players spot windows slower than bots, so the top
   rank stays rare. */
const RANKS = [
  [0,    'Alley Amateur'],
  [700,  'Bin Lid Regular'],
  [1400, 'Street Sweetheart'],
  [2200, 'Bowl Bandit'],
  [3000, 'Ghost of Marrow Street'],
];
function rankFor(score) {
  let r = RANKS[0][1];
  for (const [min, name] of RANKS) if (score >= min) r = name;
  return r;
}

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

/* ---------- layout ---------- */
function bowlSpot(h) { return { x: h.bowlAt.x, y: h.bowlAt.y }; }

function neighbourIds(id, street) { return (street || MARROW_STREET).houses[id].neighbours.slice(); }

function waveAt(sec) {
  let acc = 0;
  for (let i = 0; i < WAVES.length; i++) { acc += WAVES[i].secs; if (sec < acc) return i; }
  return WAVES.length - 1;
}

/* ---------- setup ---------- */
function buildHouses(g) {
  g.houses = [];
  g.street.houses.forEach((d, id) => {
    g.houses.push({
      id, col: d.col, row: d.row, name: d.name,
      neighbours: d.neighbours.slice(), bowlAt: { x: d.bowl.x, y: d.bowl.y },
      angry: false, state: 'idle', t: GRACE + rand(g, 0, 6),   // idle | stir | watch
      bowl: null, respawn: rand(g, 0, 2),
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
  g.houses.forEach(h => spawnBowl(g, h));
  g.cat = { x: g.street.catStart.x, y: g.street.catStart.y, face: 1, target: null };
  g.score = 0; g.bowlsCleared = 0; g.foxLosses = 0; g.keptBonus = 0;
  g.bites = 0; g.perfects = 0; g.misses = 0; g.timesCaught = 0;   /* for the results */
  g.streak = 0; g.bestMult = 1;
  g.timeLeft = GAME_SECONDS; g.elapsed = 0;
  g.eat = null; g.caught = null; g.pickup = null;
  g.spot = { heat: 0, by: null };
  g.dog = null; g.dogTimer = 0; g.fox = null;
  g.events = [];
  g.practice = g.practice ? makePractice() : null;
}

/* The practice script's state: one shape, built here and nowhere else. */
const makePractice = () => ({ holdBowl: false });

/* opts: rng (seeded in tests), street (default Marrow Street), practice. */
function create(opts) {
  const street = (opts && opts.street) || MARROW_STREET;
  const bad = validateStreet(street);
  if (bad.length) throw new Error('invalid street' + (street && street.name ? ' "' + street.name + '"' : '') + ': ' + bad.join('; '));
  const g = { rng: (opts && opts.rng) || Math.random, street: deepFreeze(street === MARROW_STREET ? street : JSON.parse(JSON.stringify(street))),
             practice: opts && opts.practice ? makePractice() : null };
  reset(g);
  g.scene = 'title';           // title | play | caught | pickup | over
  return g;
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
function played(g) { return GAME_SECONDS - g.timeLeft; }

/* ---------- input ---------- */
/* Tap a house: the cat walks to its bowl and starts eating on arrival. */
function tapHouse(g, id) {
  if (g.scene !== 'play') return;
  const h = g.houses[id];
  if (g.eat && g.eat.h === h) return;
  if (g.eat) stopEating(g);
  const s = bowlSpot(h);
  g.cat.target = { x: s.x, y: s.y, house: h.id };
}

/* Tap the road (or anywhere that is not a house): walk there and stop eating. */
function tapRoad(g, x, y) {
  if (g.scene !== 'play') return;
  if (g.eat) stopEating(g);
  const w = g.street.walk;
  g.cat.target = { x: clamp(x, w.x[0], w.x[1]), y: clamp(y, w.y[0], w.y[1]), house: null };
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
function makeNoise(g, bowlHouse) {
  const reach = lerp(1.1, 2.0, wt(g));
  const lo = lerp(1.8, 0.35, wt(g)), hi = lerp(3.0, 1.1, wt(g));
  for (const h of g.houses) {
    if (h.state !== 'idle') continue;
    if (dist(bowlHouse.col, bowlHouse.row, h.col, h.row) <= reach) h.t = Math.min(h.t, rand(g, lo, hi));
  }
}

/* ---------- residents ---------- */
function updateHouses(g, dt) {
  const w = wave(g);
  let awake = g.houses.reduce((n, h) => n + (h.state !== 'idle' ? 1 : 0), 0);

  for (const h of g.houses) {
    // An angry resident stops feeding you but never stops watching.
    if (!h.angry && !h.bowl) {
      h.respawn -= dt;
      if (h.respawn <= 0 && !(g.eat && g.eat.h === h) && !(g.fox && g.fox.target === h)) spawnBowl(g, h);
    }

    if (g.practice) continue;     // scripted: nobody stirs unless told to
    h.t -= dt;
    if (h.t <= 0) {
      if (h.state === 'idle') {
        if (awake >= w.awake) {
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
  const grass = witness.angry;            // already stopped feeding -- they tell instead
  const loser = grass ? owner : witness;
  loser.angry = true; loser.bowl = null;
  g.timesCaught++;
  witness.state = 'idle'; witness.t = rand(g, 2.2, 3.6);
  g.caught = { witness: witness.id, owner: owner.id, loser: loser.id, grass, t: CAUGHT_SECS };
  stopEating(g);
  g.cat.target = null;
  emit(g, 'caught', { witness: witness.id, owner: owner.id, loser: loser.id, grass });
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
    // telegraph: every curtain twitches before the dog appears
    for (const h of g.houses) {
      if (h.state === 'idle') h.state = 'stir';
      h.t = Math.max(h.t, 0.35);
    }
    d.t -= dt;
    if (d.t <= 0) { d.phase = 'run'; emit(g, 'bark', {}); }
    return;
  }
  d.y += d.dir * DOG_SPEED * dt;
  for (const h of g.houses) { h.state = 'watch'; h.t = 0.7; }
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

function foxPickTarget(g) {
  const f = g.fox;
  let best = null, bd = Infinity;
  for (const h of g.houses) {
    if (!h.bowl) continue;
    const s = bowlSpot(h), d = dist(f.x, f.y, s.x, s.y);
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
  if (!f.target || !f.target.bowl) { foxPickTarget(g); f.eatT = 0; }
  if (!f.target) {             // nothing to rob -- mooch up and down the road
    const run = g.street.fox;
    f.y += f.patrol * run.patrol.speed * dt;
    if (f.y < run.patrol.y[0] || f.y > run.patrol.y[1]) f.patrol *= -1;
    f.x = lerp(f.x, run.x, dt * 2);
    return;
  }

  const h = f.target, s = bowlSpot(h), d = dist(f.x, f.y, s.x, s.y);
  if (d > 0.04) {
    const step = Math.min(d, FOX_SPEED * dt);
    f.x += ((s.x - f.x) / d) * step;
    f.y += ((s.y - f.y) / d) * step;
    f.eatT = 0;
    return;
  }
  f.eatT += dt;
  if (f.eatT >= 1.0) {         // one ball at a time
    f.eatT = 0;
    if (h.bowl) {
      h.bowl.food--;
      if (h.bowl.food <= 0) {
        h.bowl = null; h.respawn = rand(g, 5.5, 9);
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
function beginPickup(g) {
  stopEating(g);
  g.cat.target = null;
  g.pickup = { t: 0, side: g.cat.x > g.street.roadX ? 1 : 0 };
  g.scene = 'pickup';
  emit(g, 'call', {});
}

function endRound(g) {
  if (g.scene === 'over') return;
  g.keptBonus = g.houses.filter(h => !h.angry).length * KEPT_BONUS;
  g.score += g.keptBonus;
  stopEating(g);
  g.scene = 'over';
  emit(g, 'over', { score: g.score });
}

/* ---------- cat ---------- */
function updateCat(g, dt) {
  const c = g.cat;
  if (!c.target) return;
  const d = dist(c.x, c.y, c.target.x, c.target.y);
  const step = CAT_SPEED * dt;
  if (Math.abs(c.target.x - c.x) > 0.01) c.face = c.target.x > c.x ? 1 : -1;
  if (d > step) {
    c.x += ((c.target.x - c.x) / d) * step;
    c.y += ((c.target.y - c.y) / d) * step;
    return;
  }
  c.x = c.target.x; c.y = c.target.y;
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
  if (g.scene === 'caught') {
    g.caught.t -= dt;
    updateHouses(g, dt);
    if (g.caught.t <= 0) {
      g.caught = null;
      if (g.houses.every(h => h.angry)) endRound(g);
      else g.scene = 'play';
    }
    return;
  }
  if (g.scene !== 'play') return;

  g.elapsed  += dt;
  if (g.practice) g.timeLeft = GAME_SECONDS;    // no clock in practice
  else g.timeLeft -= dt;
  if (g.timeLeft <= 0) { g.timeLeft = 0; beginPickup(g); return; }

  // wave changeover
  const wi = waveAt(played(g));
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
     the 'caught' scene shows SPOTTED! first and ends the round itself. */
  if (g.scene === 'play' && g.houses.every(h => h.angry)) endRound(g);
}

return {
  MARROW_STREET, validateStreet,
  /* Marrow Street's numbers, kept for the renderer until Phase 2 reads g.street */
  ROWS: MARROW_STREET.rows, HOUSES: MARROW_STREET.houses.length, ROAD_X: MARROW_STREET.roadX,
  BOWL_X: [MARROW_STREET.houses[0].bowl.x, MARROW_STREET.houses[4].bowl.x],
  PRACTICE, WAVES, GAME_SECONDS, GRACE, KEPT_BONUS,
  CAT_SPEED, FOX_SPEED, DOG_SPEED, CAUGHT_SECS, PICKUP_SECS, PERFECT_FRAC, BITE_SPEEDUP, MAX_SPEED, STREAK_STEP, STREAK_CAP, multFor,
  RANKS, rankFor,
  create, start, update, drainEvents, setPractice, practiceResident, practiceBowl, practiceHoldBowl,
  tapHouse, tapRoad, tapEat,
  bowlSpot, neighbourIds, waveAt, wave, watchersOfBowl, isThreat, spawnBowl,
};
});
