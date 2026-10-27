/* Rules of Bowl Bandit, tested against src/core.js directly -- no canvas, no DOM. */
require('./harness');                      // installs global ok() / report()
const C = require('../src/core.js');

/* small seeded rng so every run is the same */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DT = 1 / 60;
const run = (g, secs) => { for (let i = 0; i < Math.round(secs / DT); i++) C.update(g, DT); };
const fresh = seed => { const g = C.create({ rng: seeded(seed || 1) }); C.start(g); C.drainEvents(g); return g; };
/* put every resident firmly asleep, so a test can isolate one variable */
const quiet = g => g.houses.forEach(h => { h.state = 'idle'; h.t = 9999; });
/* walk to a house and wait for the minigame to start */
const sitAt = (g, id) => {
  if (!g.houses[id].bowl) C.spawnBowl(g, g.houses[id]);
  C.tapHouse(g, id);
  for (let i = 0; i < 600 && !g.eat; i++) C.update(g, DT);
};
/* jump to a wave properly (the wave changeover resets waveIdx from the clock) */
const setWave = (g, i) => { g.waveIdx = i; g.timeLeft = 120 - i * 30 - 1; g.dogTimer = 1e9; };
/* a good bite, deliberately off-centre so it scores the plain 10 */
const hit = g => { g.eat.t = g.eat.zone + g.eat.zoneW * 0.1; g.eat.cool = 0; C.tapEat(g); };
const perfect = g => { g.eat.t = g.eat.zone + g.eat.zoneW / 2; g.eat.cool = 0; C.tapEat(g); };
const miss = g => { g.eat.t = g.eat.zone > 0.5 ? 0.02 : 0.98; g.eat.cool = 0; C.tapEat(g); };

console.log('\n=== STREET LAYOUT ===');
{
  const g = fresh();
  ok(g.houses.length === 8, 'eight houses');
  ok(g.houses.slice(0, 4).every(h => h.col === 0) && g.houses.slice(4).every(h => h.col === 1), 'left column 0-3, right column 4-7');
  ok(g.houses.every(h => !h.neighbours.includes(h.id)), 'nobody is their own neighbour');
  ok(g.houses.every(h => h.neighbours.every(n => g.houses[n].neighbours.includes(h.id))), 'neighbours are mutual');
  ok(g.houses.every(h => h.neighbours.length === (h.row === 0 || h.row === 3 ? 2 : 3)), 'end-of-street houses have 2 neighbours, middle ones 3');
  let exact = true;
  for (const h of g.houses) for (const o of g.houses) {
    if (o === h) continue;
    const want = (o.col === h.col && Math.abs(o.row - h.row) === 1) || (o.col !== h.col && o.row === h.row);
    if (h.neighbours.includes(o.id) !== want) exact = false;
  }
  ok(exact, 'neighbour = above/below on the same side, or directly across -- never a diagonal, never two along');
  ok(g.houses.every(h => { const s = C.bowlSpot(h); return s.x === C.BOWL_X[h.col] && s.y === h.row + 0.5; }), 'every bowl sits on its own house, facing the road');
}

console.log('\n=== TIMING & WAVES ===');
{
  const W = C.WAVES;
  ok(C.GAME_SECONDS === 120 && W.length === 4 && W.every(w => w.secs === 30), 'four 30s waves, 120s round');
  const bounds = [[0,0],[29,0],[30,1],[59,1],[60,2],[89,2],[90,3],[119,3]];
  ok(bounds.every(([s, w]) => C.waveAt(s) === w), 'wave boundaries map correctly');
  const mono = (k, dir) => { for (let i = 1; i < 4; i++) { const a = W[i-1][k], b = W[i][k]; if (dir > 0 ? !(b > a) : !(b < a)) return false; } return true; };
  ok(mono('warn', -1),  'warning window shrinks every wave');
  ok(mono('watch', 1),  'watch duration grows every wave');
  ok(mono('awake', 1),  'more residents awake at once every wave');
  ok(mono('bites', 1),  'bowls get bigger every wave');
  ok(mono('react', -1), 'reaction window shrinks every wave');
  ok(mono('zone', -1),  'green zone shrinks every wave');
  ok(W[0].dog === 0 && W.slice(1).every(w => w.dog > 0), 'dog patrols waves 2-4, not 1');
  ok(!W[0].fox && !W[1].fox && W[2].fox && W[3].fox, 'fox joins at wave 3');
  const g = fresh();
  ok(C.drainEvents(C.create()).length === 0, 'a fresh game has no events pending');
  const g2 = C.create(); C.start(g2);
  ok(C.drainEvents(g2).some(e => e.type === 'wave' && e.idx === 0), 'starting announces wave 1');
  g.timeLeft = 120 - 31; C.update(g, DT);
  ok(g.waveIdx === 1 && C.drainEvents(g).some(e => e.type === 'wave' && e.idx === 1), 'crossing 30s moves to wave 2 and announces it');
}

console.log('\n=== TAP TO MOVE ===');
{
  const g = fresh(); quiet(g);
  const far = g.houses[7];
  C.tapHouse(g, 7);
  ok(!g.eat && g.cat.target && g.cat.target.house === 7, 'tapping a house sets the cat walking, does not teleport');
  const t0 = g.cat.y;
  run(g, 0.2);
  ok(g.cat.y !== t0 || g.cat.x !== C.ROAD_X, 'cat moves while walking');
  run(g, 4);
  ok(!!g.eat && g.eat.h === far, 'on arrival the minigame starts at that bowl');
  const s = C.bowlSpot(far);
  ok(g.cat.x === s.x && g.cat.y === s.y, 'cat is parked exactly on the bowl');
  ok(C.drainEvents(g).some(e => e.type === 'eatStart' && e.house === 7), 'arrival emits eatStart');

  const before = g.cat.y;
  C.tapRoad(g, 0.5, 1.0);
  ok(!g.eat, 'tapping the road stops eating');
  run(g, 3);
  ok(Math.abs(g.cat.y - 1.0) < 0.05 && g.cat.y < before, 'cat walks to the tapped spot');

  C.tapHouse(g, 0); C.tapHouse(g, 4);
  run(g, 4);
  ok(g.eat && g.eat.h.id === 4, 'a second tap mid-walk redirects the cat');
  C.tapHouse(g, 4);
  ok(g.eat && g.eat.h.id === 4, 'tapping the bowl you are already at changes nothing');

  C.tapRoad(g, 9, 99);
  ok(g.cat.target.x <= C.BOWL_X[1] && g.cat.target.y <= C.ROWS, 'road taps are clamped onto the street');

  const g3 = fresh(); quiet(g3);
  g3.houses[3].bowl = null; g3.houses[3].respawn = 9999;
  C.tapHouse(g3, 3); run(g3, 4);
  ok(!g3.eat, 'arriving at an empty bowl does not start eating');

  const g4 = fresh(); quiet(g4);
  const crossT = (() => { C.tapHouse(g4, 0); run(g4, 3); const a = g4.cat.y; C.tapHouse(g4, 3); let n = 0; while (g4.cat.target) { C.update(g4, DT); n++; } return n * DT; })();
  ok(crossT < 3, 'the whole street can be crossed in under 3s (' + crossT.toFixed(2) + 's)');
}

console.log('\n=== BITING ===');
{
  const g = fresh(); quiet(g);
  sitAt(g, 2);
  const e = g.eat, owner = g.houses[2], food = owner.bowl.food, zw = e.zoneW, sp = e.speed;
  hit(g);
  ok(g.score === 10 && owner.bowl.food === food - 1, 'a bite on the green scores 10 and eats a ball');
  ok(g.eat.speed > sp && g.eat.zoneW < zw, 'each bite speeds the marker up and shrinks the green');

  C.drainEvents(g);
  const sc = g.score; miss(g);
  ok(g.score === sc && g.eat.cool > 0, 'a miss scores nothing and locks out for a moment');
  ok(C.drainEvents(g).some(e => e.type === 'miss'), 'a miss emits an event (the bowl clatters)');
  const f = g.eat.flashBad; C.tapEat(g);
  ok(g.eat.flashBad === f, 'tapping during the lockout does nothing');

  const g2 = fresh(); quiet(g2); sitAt(g2, 1);
  const need = g2.houses[1].bowl.food;
  for (let i = 0; i < need; i++) { g2.eat && hit(g2); }
  ok(!g2.eat && !g2.houses[1].bowl, 'eating the last ball clears the bowl and ends the minigame');
  /* plain bites: x1 until the streak reaches a step, and the clear bonus at whatever rate you've reached */
  let expect = 0;
  for (let i = 0; i < need; i++) expect += Math.round(10 * C.multFor(i));
  expect += Math.round(25 * C.multFor(need));
  ok(g2.bowlsCleared === 1 && g2.score === expect, 'clearing a bowl pays the 25 bonus, multiplied by the streak (' + expect + ')');
  ok(C.drainEvents(g2).some(e => e.type === 'clear'), 'clearing emits an event');

  const g5 = fresh(); quiet(g5); sitAt(g5, 2); C.drainEvents(g5);
  perfect(g5);
  const pe = C.drainEvents(g5).find(e => e.type === 'bite');
  ok(g5.score === 15 && pe && pe.perfect === true && pe.points === 15, 'a bite dead centre is PERFECT and scores 15');
  hit(g5);
  ok(g5.score === 25, 'an edge-of-green bite is still the plain 10');

  /* judged on the moment of touch, not the moment the renderer resolved it */
  const g6 = fresh(); quiet(g6); sitAt(g6, 2);
  const onGreen = g6.eat.zone + g6.eat.zoneW * 0.5;
  g6.eat.t = g6.eat.zone > 0.5 ? 0.02 : 0.98;         // marker has since moved off the green
  C.tapEat(g6, onGreen);
  ok(g6.score === 15, 'tapEat(g, t) judges the bite where the marker was when the finger landed');
  const g7 = fresh(); quiet(g7); sitAt(g7, 2);
  const offGreen = g7.eat.zone > 0.5 ? 0.02 : 0.98;
  g7.eat.t = g7.eat.zone + g7.eat.zoneW / 2;          // marker has since moved onto the green
  C.tapEat(g7, offGreen);
  ok(g7.score === 0 && g7.eat.cool > 0, '... and a touch off the green still misses even if the marker drifts on');
  g2.houses[1].respawn = 0.1; quiet(g2); run(g2, 0.5);
  ok(!!g2.houses[1].bowl, 'the bowl refills after a while');
}

console.log('\n=== NOISE ===');
{
  const woken = (waveIdx) => {
    const g = fresh(); quiet(g); setWave(g, waveIdx);
    sitAt(g, 1);
    miss(g);
    return g.houses.filter(h => h.t < 9000).map(h => h.id);
  };
  const w1 = woken(0), w4 = woken(3);
  const owner = C.create().houses[1];
  ok(w1.length > 0 && w1.every(id => id === 1 || owner.neighbours.includes(id)), 'early on, a clatter only stirs the owner and their neighbours (woke ' + w1 + ')');
  ok(w4.length > w1.length, 'by wave 4 the clatter carries further (' + w4.length + ' vs ' + w1.length + ')');
  const g = fresh(); quiet(g); setWave(g, 3); sitAt(g, 0); miss(g);
  ok(g.houses[7].t > 9000, 'even at wave 4, the house across the street and three along does not hear it');
}

console.log('\n=== CORE RULE ===');
{
  // the owner watching is harmless
  let g = fresh(); quiet(g);
  const o = g.houses[2], w1 = g.houses[o.neighbours[0]];
  sitAt(g, 2);
  ok(!!g.eat, 'cat is eating');
  o.state = 'watch'; o.t = 9999; run(g, 1);
  ok(!!g.eat && !o.angry && g.spot.heat === 0, 'the bowl OWNER watching is harmless');

  // a neighbour watching starts a meter, not instant death
  w1.state = 'watch'; w1.t = 9999;
  run(g, 0.1);
  ok(!!g.eat && g.spot.heat > 0 && g.spot.by === w1.id, 'a neighbour watching starts the RUN meter');
  C.tapRoad(g, 0.5, 2);
  run(g, 1);
  ok(!w1.angry && !o.angry && g.scene === 'play', 'bolting in time costs nothing');
  ok(g.spot.heat === 0, 'the meter cools once you are away');

  // dithering: the witness withdraws
  g = fresh(); quiet(g);
  const o2 = g.houses[2], w2 = g.houses[o2.neighbours[0]];
  sitAt(g, 2); w2.state = 'watch'; w2.t = 9999;
  run(g, 1.5);
  ok(g.scene === 'caught' && w2.angry && !o2.angry && !g.caught.grass, 'dithering: the WITNESS withdraws their own bowl');
  ok(w2.bowl === null, '... their bowl is gone');
  ok(!g.eat, '... and you are pulled out of the minigame');
  const ev = C.drainEvents(g).find(e => e.type === 'caught');
  ok(ev && ev.loser === w2.id && ev.owner === o2.id && ev.witness === w2.id && ev.grass === false, 'caught event names witness, owner and loser');
  run(g, C.CAUGHT_SECS + 0.1);
  ok(g.scene === 'play', 'play resumes after the caught beat');

  // grassing up
  g = fresh(); quiet(g);
  const o3 = g.houses[5], w3 = g.houses[o3.neighbours[0]];
  w3.angry = true; w3.bowl = null;
  sitAt(g, 5); w3.state = 'watch'; w3.t = 9999;
  run(g, 1.5);
  ok(g.scene === 'caught' && g.caught.grass === true && o3.angry && o3.bowl === null, 'an already-angry witness grasses you up: the OWNER withdraws');

  // non-neighbours can't see
  g = fresh(); quiet(g);
  const o4 = g.houses[0];
  const far = g.houses.filter(x => x !== o4 && !o4.neighbours.includes(x.id));
  sitAt(g, 0); far.forEach(f => { f.state = 'watch'; f.t = 9999; });
  run(g, 3);
  ok(!!g.eat && !o4.angry && g.scene === 'play', 'no non-neighbour can bust you, however many are watching (' + far.length + ' tried)');

  // every individual neighbour can
  let allSee = true;
  for (let id = 0; id < 8; id++) for (const n of C.neighbourIds(id)) {
    const gg = fresh(); quiet(gg); sitAt(gg, id);
    gg.houses[n].state = 'watch'; gg.houses[n].t = 9999;
    run(gg, 1.5);
    if (gg.scene !== 'caught' || gg.caught.witness !== n) allSee = false;
  }
  ok(allSee, 'all 22 (bowl, neighbour) sight pairs catch you');

  // only a window that is actually open counts
  g = fresh(); quiet(g);
  const o5 = g.houses[2];
  sitAt(g, 2); g.houses[o5.neighbours[0]].state = 'stir'; g.houses[o5.neighbours[0]].t = 9999;
  run(g, 2);
  ok(g.scene === 'play' && !!g.eat, 'a twitching curtain is only a warning');

  // walking past is never an offence
  g = fresh(); quiet(g);
  g.houses.forEach(h => { h.state = 'watch'; h.t = 9999; });
  C.tapRoad(g, 0.5, 0.3); run(g, 3); C.tapRoad(g, 0.5, 3.7); run(g, 3);
  ok(g.scene === 'play' && g.houses.every(h => !h.angry), 'strolling the road in front of watching houses is fine');

  // the RUN window shrinks by wave
  const reacts = C.WAVES.map(w => w.react);
  ok(reacts.every((r, i) => i === 0 || r < reacts[i - 1]), 'time to bolt shrinks every wave: ' + reacts.join(' > '));

  // everyone gone: round ends early
  g = fresh(); quiet(g);
  g.houses.forEach(h => { h.angry = true; h.bowl = null; });
  run(g, 0.1);
  ok(g.scene === 'over' && g.keptBonus === 0, 'when every house has given up the round ends early');
}

console.log('\n=== THE DOG ===');
{
  const g = fresh(); quiet(g);
  g.timeLeft = 120 - 31; run(g, 0.05);
  ok(g.waveIdx === 1, 'in wave 2');
  g.dogTimer = 0.01; quiet(g); run(g, 0.05);
  ok(!!g.dog && g.dog.phase === 'bark', 'dog spawns and barks first');
  ok(g.houses.every(h => h.state !== 'idle'), 'the bark sets every curtain twitching (the warning)');
  run(g, 1.3);
  ok(g.dog.phase === 'run', 'then it runs');
  ok(g.houses.every(h => h.state === 'watch'), 'while it runs every resident is at the window');
  const y0 = g.dog.y; run(g, 0.3);
  ok(Math.abs(g.dog.y - y0) > 0.5, 'it moves down the road at speed');
  let n = 0; while (g.dog && n++ < 600) C.update(g, DT);
  ok(!g.dog, 'it leaves the street');

  const g2 = fresh(); quiet(g2); g2.timeLeft = 120 - 31; run(g2, 0.05); g2.dogTimer = 0.01; quiet(g2);
  const o = g2.houses[1]; g2.houses[o.neighbours[0]].bowl;
  sitAt(g2, 1); run(g2, 2.5);
  ok(g2.houses.some(h => h.angry), 'eating while the dog runs gets you caught');
}

console.log('\n=== THE FOX ===');
{
  const g = fresh(); quiet(g);
  g.timeLeft = 120 - 61; run(g, 0.05);
  ok(g.waveIdx === 2 && !!g.fox, 'fox arrives at the wave 3 changeover');
  ok(C.FOX_SPEED < C.CAT_SPEED, 'the fox is slower than the cat');

  const g2 = fresh(); quiet(g2);
  g2.waveIdx = 2; g2.timeLeft = 120 - 61;
  g2.houses.forEach((h, i) => { if (i !== 6) h.bowl = null; });
  g2.houses.forEach(h => h.respawn = 9999);
  g2.fox = { x: 0.5, y: 3.5, patrol: 1, target: null, eatT: 0, rest: 0 };
  run(g2, 1);
  ok(g2.fox.target === g2.houses[6], 'the fox goes for the only bowl');
  run(g2, 5);
  ok(g2.houses[6].bowl === null && g2.foxLosses === 1, 'it eats it and you are one bowl down');
  ok(C.drainEvents(g2).some(e => e.type === 'steal'), 'a theft emits an event');

  // beat the fox to a bowl
  const g3 = fresh(); quiet(g3);
  g3.waveIdx = 2; g3.timeLeft = 120 - 61;
  g3.houses.forEach((h, i) => { if (i !== 0) h.bowl = null; h.respawn = 9999; });
  g3.fox = { x: 0.5, y: 2.8, patrol: 1, target: null, eatT: 0, rest: 0 };
  C.tapHouse(g3, 0); run(g3, 1.3);
  ok(!!g3.eat && g3.eat.h === g3.houses[0], 'the cat beats the fox to a bowl it is nearer to');

  // fox robbing the bowl you are eating from
  const g4 = fresh(); quiet(g4);
  g4.waveIdx = 2; g4.timeLeft = 120 - 61;
  sitAt(g4, 3); g4.houses[3].bowl.food = 1;
  g4.fox = { x: C.BOWL_X[0], y: 3.5, patrol: 1, target: g4.houses[3], eatT: 0.99, rest: 0 };
  quiet(g4); run(g4, 0.1);
  ok(!g4.eat && !g4.houses[3].bowl, 'if the fox takes the bowl you are eating, you are kicked out of the minigame');
}

console.log('\n=== THE OWNER & SCORING ===');
{
  const g = fresh(); quiet(g);
  g.houses[0].angry = true; g.houses[0].bowl = null; g.houses[1].angry = true; g.houses[1].bowl = null;
  g.timeLeft = 0.01; run(g, 0.1);
  ok(g.scene === 'pickup', 'when the clock runs out your owner comes');
  ok(C.drainEvents(g).some(e => e.type === 'call'), '... announced by an event');
  run(g, C.PICKUP_SECS + 0.2);
  ok(g.scene === 'over', 'the owner carries you home and the round ends');
  ok(g.keptBonus === 6 * C.KEPT_BONUS && g.score === g.keptBonus, 'each neighbour still feeding you is worth ' + C.KEPT_BONUS + ' (6 of 8 left)');
  const evs = C.drainEvents(g);
  ok(evs.filter(e => e.type === 'over').length === 1, 'over fires exactly once');
  C.tapHouse(g, 3); C.tapEat(g); run(g, 1);
  ok(g.scene === 'over', 'taps after the end do nothing');

  // stripping the street to eat faster is a losing trade
  const full = 8 * C.KEPT_BONUS, bowls = (C.WAVES.reduce((n, w) => n + w.bites * 10 + 25, 0));
  ok(full > 0 && 8 * C.KEPT_BONUS === 320, 'a clean sheet is worth 320');
}

console.log('\n=== STREAK ===');
{
  ok(C.multFor(0) === 1 && C.multFor(2) === 1 && C.multFor(3) === 1.5 && C.multFor(6) === 2 && C.multFor(12) === 3,
     'the multiplier steps by half every 3 streak points: x1, x1.5, x2 ... x3');
  ok(C.multFor(99) === 3, '... and tops out at x3');

  let g = fresh(); quiet(g); sitAt(g, 2);
  g.houses[2].bowl.food = 99;
  hit(g);
  ok(g.streak === 1, 'a good bite adds 1 to the streak');
  perfect(g);
  ok(g.streak === 3, 'a perfect bite adds 2');
  const s0 = g.score; hit(g);
  ok(g.score - s0 === 15, 'once the streak reaches 3, a plain bite pays 10 x1.5 = 15');
  const s1 = g.score; perfect(g);
  ok(g.score - s1 === Math.round(15 * C.multFor(4)), 'and a perfect pays 15 at the same rate');
  const ev = C.drainEvents(g).filter(e => e.type === 'bite');
  ok(ev.some(e => e.multUp === 1.5), 'stepping up a tier is announced in the bite event');

  /* the streak survives walking away and carries to the next bowl */
  const kept = g.streak;
  C.tapHouse(g, 5); run(g, 4);
  ok(g.eat && g.eat.h.id === 5 && g.streak === kept, 'leaving a bowl calmly keeps the streak for the next one');

  /* a twitching curtain does not cost it; being seen does, even if you escape */
  const n = g.houses[g.eat.h.neighbours[0]];
  n.state = 'stir'; n.t = 9999; run(g, 1);
  ok(g.streak === kept, 'a twitching curtain does not touch the streak');
  C.drainEvents(g);
  n.state = 'watch'; n.t = 9999; run(g, 0.05);
  const lost = C.drainEvents(g).find(e => e.type === 'streakLost');
  ok(g.streak === 0 && lost && lost.streak === kept && lost.by === n.id, 'the moment a neighbour sees you the streak is gone, and it says who');
  C.tapRoad(g, 0.5, 2); run(g, 1.5);
  ok(g.scene === 'play' && !n.angry && g.streak === 0, '... even though you got away');

  /* a clatter halves it */
  g = fresh(); quiet(g); sitAt(g, 2); g.houses[2].bowl.food = 99;
  for (let i = 0; i < 4; i++) perfect(g);
  ok(g.streak === 8, 'four perfects build a streak of 8');
  miss(g);
  ok(g.streak === 4, 'a clatter halves it');

  /* the round remembers how high you got */
  ok(g.bestMult === C.multFor(8), 'the round remembers the best multiplier reached');
  ok(fresh().streak === 0 && fresh().bestMult === 1, 'a new round starts with no streak');
}

console.log('\n=== RESULTS ===');
{
  const g = fresh(); quiet(g); sitAt(g, 2);
  perfect(g); hit(g); miss(g);
  ok(g.bites === 2 && g.perfects === 1 && g.misses === 1, 'the round counts bites, perfect bites and misses');
  const w = g.houses[g.houses[2].neighbours[0]];
  w.state = 'watch'; w.t = 9999; run(g, 1.5);
  ok(g.timesCaught === 1, '... and how many times you were caught');
  const g2 = fresh();
  ok(g2.bites === 0 && g2.perfects === 0 && g2.misses === 0 && g2.timesCaught === 0, 'a new round starts the counts at zero');
  const [r1, r2] = [C.RANKS[1], C.RANKS[C.RANKS.length - 1]];
  ok(C.rankFor(0) === C.RANKS[0][1] && C.rankFor(r1[0] - 1) === C.RANKS[0][1] && C.rankFor(r1[0]) === r1[1],
     'ranks start at the bottom and step exactly at their threshold');
  ok(C.rankFor(r2[0] - 1) === C.RANKS[C.RANKS.length - 2][1] && C.rankFor(99999) === r2[1], 'the top rank has no ceiling');
  ok(C.RANKS.every((r, i) => i === 0 || r[0] > C.RANKS[i - 1][0]), 'rank thresholds rise');
}

console.log('\n=== DETERMINISM & ROBUSTNESS ===');
{
  const play = seed => {
    const g = fresh(seed); const r = seeded(seed + 100); const log = [];
    for (let i = 0; i < 9000 && g.scene !== 'over'; i++) {
      const roll = r();
      if (roll < 0.03) C.tapHouse(g, Math.floor(r() * 8));
      else if (roll < 0.05) C.tapRoad(g, r(), r() * 4);
      else if (roll < 0.25) C.tapEat(g);
      if (g.eat && r() < 0.1) { g.eat.t = g.eat.zone + g.eat.zoneW / 2; }
      C.update(g, DT);
      for (const e of C.drainEvents(g)) log.push(e.type);
      if (!(Number.isFinite(g.cat.x) && Number.isFinite(g.cat.y))) throw new Error('cat went NaN');
      if (g.cat.x < 0 || g.cat.x > 1 || g.cat.y < 0 || g.cat.y > C.ROWS) throw new Error('cat left the street: ' + g.cat.x + ',' + g.cat.y);
      if (g.houses.some(h => h.angry && h.bowl)) throw new Error('an angry house has a bowl');
      if (g.houses.some(h => h.bowl && (h.bowl.food < 1 || h.bowl.food > h.bowl.max))) throw new Error('bowl food out of range');
    }
    return { score: g.score, scene: g.scene, log: log.join(',') };
  };
  let crashed = null;
  try { for (let s = 1; s <= 12; s++) play(s); } catch (e) { crashed = e; }
  ok(!crashed, 'twelve random 2-minute rounds of mashing: no NaN, no escapes, no impossible bowls' + (crashed ? ' -- ' + crashed.message : ''));
  const a = play(7), b = play(7);
  ok(a.score === b.score && a.log === b.log, 'same seed, same game');
  const ends = [1, 2, 3, 4, 5, 6].map(s => play(s).scene);
  ok(ends.every(s => s === 'over' || s === 'play'), 'rounds end in a valid scene');
}

report();
