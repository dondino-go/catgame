/*
 * Bowl Bandit -- game rules, no rendering.
 *
 * The street is a 2 x 4 grid seen from above: the left column is houses 0-3,
 * the right column is 4-7, the road runs between them. A house's neighbours are
 * the houses above and below it in its own column, and the one directly across
 * the road. That is the whole rule, so it is derived from the grid here rather
 * than from sight radii.
 *
 * Nothing in this file touches a canvas, the DOM, audio or timers. A renderer
 * drives it with update(g, dt) and the tap functions, reads g for what to draw,
 * and drains g.events for things to play or animate.
 *
 * World units: one row of houses is 1.0 tall. x runs 0..1 across the street
 * (left bowls 0.22, road 0.5, right bowls 0.78), y runs 0..ROWS down it.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BowlCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const ROWS = 4, HOUSES = 8;
const ROAD_X = 0.5;
const BOWL_X = [0.29, 0.71];

const HOUSE_NAMES = [
  'The Pemburys', 'Old Nan', 'The Dobsons', 'Mr Quill',
  'The Ashfords', 'Bea & Rook', 'The Mullens', 'Doctor Pye',
];

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
const PICKUP_SECS  = 4.8;    // walk up, scoop the cat, carry it home

/* What a final score makes you. Calibrated by simulation: a sloppy round lands
   around 800, a strong one 1450-1800. */
const RANKS = [
  [0,    'Alley Amateur'],
  [400,  'Bin Lid Regular'],
  [800,  'Street Sweetheart'],
  [1200, 'Bowl Bandit'],
  [1600, 'Ghost of Marrow Street'],
];
function rankFor(score) {
  let r = RANKS[0][1];
  for (const [min, name] of RANKS) if (score >= min) r = name;
  return r;
}

const CAT_SPEED = 1.4;        // world units per second
const FOX_SPEED = 0.7;        // slower than the cat: you can beat it to a bowl
const DOG_SPEED = 2.6;

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp  = (a, b, t) => a + (b - a) * t;
const dist  = (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2);
const rand  = (g, a, b) => a + g.rng() * (b - a);

/* ---------- layout ---------- */
function bowlSpot(h) { return { x: BOWL_X[h.col], y: h.row + 0.5 }; }

function neighbourIds(id) {
  const col = id < ROWS ? 0 : 1, row = id % ROWS;
  const out = [];
  if (row > 0)        out.push(col * ROWS + row - 1);
  if (row < ROWS - 1) out.push(col * ROWS + row + 1);
  out.push((1 - col) * ROWS + row);
  return out;
}

function waveAt(sec) {
  let acc = 0;
  for (let i = 0; i < WAVES.length; i++) { acc += WAVES[i].secs; if (sec < acc) return i; }
  return WAVES.length - 1;
}

/* ---------- setup ---------- */
function buildHouses(g) {
  g.houses = [];
  for (let id = 0; id < HOUSES; id++) {
    g.houses.push({
      id, col: id < ROWS ? 0 : 1, row: id % ROWS, name: HOUSE_NAMES[id],
      neighbours: neighbourIds(id),
      angry: false, state: 'idle', t: GRACE + rand(g, 0, 6),   // idle | stir | watch
      bowl: null, respawn: rand(g, 0, 2),
    });
  }
}

function spawnBowl(g, h) {
  const n = wave(g).bites;
  h.bowl = { food: n, max: n };
}

function reset(g) {
  buildHouses(g);
  g.waveIdx = 0;
  g.houses.forEach(h => spawnBowl(g, h));
  g.cat = { x: ROAD_X, y: ROWS / 2, face: 1, target: null };
  g.score = 0; g.bowlsCleared = 0; g.foxLosses = 0; g.keptBonus = 0;
  g.bites = 0; g.perfects = 0; g.misses = 0; g.timesCaught = 0;   /* for the results */
  g.timeLeft = GAME_SECONDS; g.elapsed = 0;
  g.eat = null; g.caught = null; g.pickup = null;
  g.spot = { heat: 0, by: null };
  g.dog = null; g.dogTimer = 0; g.fox = null;
  g.events = [];
}

function create(opts) {
  const g = { rng: (opts && opts.rng) || Math.random };
  reset(g);
  g.scene = 'title';           // title | play | caught | pickup | over
  return g;
}

function start(g) {
  reset(g);
  g.scene = 'play';
  emit(g, 'wave', { idx: 0 });
}

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
  g.cat.target = { x: clamp(x, BOWL_X[0], BOWL_X[1]), y: clamp(y, 0.2, ROWS - 0.2), house: null };
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
    speed: w.speed, zoneW: w.zone, zoneMin: w.zoneMin, zone: 0.35,
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
    emit(g, 'miss', { house: h.id });
    makeNoise(g, h);
    return;
  }
  /* the middle of the green is worth more: something to aim for beyond
     merely not missing */
  const perfect = Math.abs(t - (e.zone + e.zoneW / 2)) <= e.zoneW * PERFECT_FRAC;
  const points = perfect ? 15 : 10;
  e.bites++; e.flashGood = 0.2;
  g.bites++; if (perfect) g.perfects++;
  g.score += points;
  emit(g, 'bite', { house: h.id, points, perfect });

  h.bowl.food--;
  e.speed = Math.min(MAX_SPEED, e.speed + BITE_SPEEDUP);
  e.zoneW = Math.max(e.zoneMin, e.zoneW - 0.022);

  if (h.bowl.food <= 0) {
    h.bowl = null; h.respawn = rand(g, 5.5, 9);
    g.bowlsCleared++; g.score += 25;
    emit(g, 'clear', { house: h.id, points: 25 });
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
    g.spot.by = seer.id;
    g.spot.heat += dt;
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
  g.dog = { dir, x: ROAD_X, y: dir === 1 ? -0.6 : ROWS + 0.6, phase: 'bark', t: 1.15 };
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
  if (d.y < -0.8 || d.y > ROWS + 0.8) g.dog = null;
}

/* ---------- the fox ---------- *
 * Competition, not a threat. It robs bowls; residents don't care.        */
function spawnFox(g) {
  const fromTop = g.rng() < 0.5;
  g.fox = { x: ROAD_X, y: fromTop ? -0.6 : ROWS + 0.6, patrol: fromTop ? 1 : -1,
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
    f.y += f.patrol * 0.3 * dt;
    if (f.y < 0.3 || f.y > ROWS - 0.3) f.patrol *= -1;
    f.x = lerp(f.x, ROAD_X, dt * 2);
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
  g.pickup = { t: 0, side: g.cat.x > ROAD_X ? 1 : 0 };
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
  g.timeLeft -= dt;
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

  if (g.houses.every(h => h.angry)) endRound(g);
}

return {
  ROWS, HOUSES, ROAD_X, BOWL_X, WAVES, GAME_SECONDS, GRACE, KEPT_BONUS,
  CAT_SPEED, FOX_SPEED, DOG_SPEED, CAUGHT_SECS, PICKUP_SECS, PERFECT_FRAC, BITE_SPEEDUP, MAX_SPEED,
  RANKS, rankFor,
  create, start, update, drainEvents,
  tapHouse, tapRoad, tapEat,
  bowlSpot, neighbourIds, waveAt, wave, watchersOfBowl, isThreat, spawnBowl,
};
});
