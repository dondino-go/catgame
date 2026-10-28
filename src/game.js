/*
 * Bowl Bandit -- portrait renderer.
 *
 * Draws the street that src/core.js simulates, and turns taps into the three
 * things the core understands: walk to a house, walk to a spot, take a bite.
 * All geometry here is in DESIGN units: the street is always 720 wide, and its
 * height follows the phone's aspect so the game fills the screen instead of
 * being letterboxed into a desktop-shaped box.
 *
 * The core owns the rules and knows nothing about pixels. Everything in this
 * file is presentation: eased glows, decoration, sound, screen shake.
 */
'use strict';
(function () {

const C = window.BowlCore;

/* ---------- palette ---------- */
const STROKE = 0.8;                 /* every stroke scales by this one number */
const INK      = '#2a1b3d';
let NIGHT    = '#191030';
let ROAD     = '#3d2f5e';
let ROAD_2   = '#4a3a70';
let PAVE     = '#6b5c93';
let PAVE_LIP = '#8576b4';
let GRASS    = '#3f6b4e';

/* A street may repaint itself (street.look): its own colours for the ground,
   a wash of light over the whole street (an evening is warm, a night is not),
   a vignette, and how brightly the lamps glow. Unset fields keep Marrow
   Street's night. */
const LOOK_DEFAULT = { night: '#191030', road: '#3d2f5e', road2: '#4a3a70', pave: '#6b5c93', paveLip: '#8576b4',
                       grass: '#3f6b4e', wash: null, vignette: 0.42, lamp: 1 };
let LOOK = LOOK_DEFAULT;
function applyLook(st) {
  LOOK = Object.assign({}, LOOK_DEFAULT, st.look || {});
  NIGHT = LOOK.night; ROAD = LOOK.road; ROAD_2 = LOOK.road2; PAVE = LOOK.pave; PAVE_LIP = LOOK.paveLip; GRASS = LOOK.grass;
}
const WARM     = '#ffd978';
const MINT     = '#9df5c8';
const ALARM    = '#ff7d7d';
const CREAM    = '#ffe9c9';

const TINT = [
  { wall:'#ff7a6b', roof:'#c9455c', trim:'#ffd3a8', door:'#8a3350' },
  { wall:'#ffc247', roof:'#e08a2b', trim:'#fff0c0', door:'#a85f1c' },
  { wall:'#79d6b5', roof:'#2f9d84', trim:'#ddfff2', door:'#1f7563' },
  { wall:'#b39ddb', roof:'#7a5fb0', trim:'#f0e6ff', door:'#56408a' },
  { wall:'#6fc7e1', roof:'#3184a8', trim:'#ddf6ff', door:'#215f7d' },
  { wall:'#ff9ecd', roof:'#d1568f', trim:'#ffe3f1', door:'#9c3566' },
  { wall:'#ffa145', roof:'#e07a1f', trim:'#ffe9c9', door:'#a3540f' },
  { wall:'#8fd96b', roof:'#4e9b34', trim:'#e9ffd6', door:'#376e22' },
];

/* ---------- canvas ---------- */
const stage = document.getElementById('stage');
const cv    = document.getElementById('c');
const ctx   = cv.getContext('2d');

const DW = 720;                     /* design width, always */
const DEBUG = /[?&]debug\b/.test(location.search);
let   DH = 1280;                    /* design height, from the screen's aspect */

/* ---------- helpers ---------- */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp  = (a, b, t) => a + (b - a) * t;
const rand  = (a, b) => a + Math.random() * (b - a);

function rr(x, y, w, h, r) {
  const k = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.lineTo(x + w - k, y);     ctx.quadraticCurveTo(x + w, y, x + w, y + k);
  ctx.lineTo(x + w, y + h - k); ctx.quadraticCurveTo(x + w, y + h, x + w - k, y + h);
  ctx.lineTo(x + k, y + h);     ctx.quadraticCurveTo(x, y + h, x, y + h - k);
  ctx.lineTo(x, y + k);         ctx.quadraticCurveTo(x, y, x + k, y);
  ctx.closePath();
}
function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
function fillStroke(fill, stroke, lw) {
  if (fill)   { ctx.fillStyle = fill;     ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = (lw || 4) * STROKE; ctx.stroke(); }
}
const FONT = "'Baloo 2', 'Trebuchet MS', system-ui, sans-serif";
function text(str, x, y, size, colour, align, weight) {
  ctx.font = (weight || 700) + ' ' + size + 'px ' + FONT;
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = colour;
  ctx.fillText(str, x, y);
}
function outlined(str, x, y, size, colour, align, weight) {
  ctx.font = (weight || 800) + ' ' + size + 'px ' + FONT;
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(5, size * 0.26) * STROKE;
  ctx.strokeStyle = INK;
  ctx.strokeText(str, x, y);
  ctx.fillStyle = colour;
  ctx.fillText(str, x, y);
}
/* stable pseudo-random per house, so decoration never jitters between frames */
function hash(n, salt) {
  const x = Math.sin((n + 1) * 127.1 + (salt || 0) * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/* ---------- sound ---------- */
const Sfx = {
  ac: null, muted: false,
  boot() {
    if (!this.ac) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) this.ac = new AC(); }
    if (this.ac && this.ac.state === 'suspended') this.ac.resume();
  },
  tone(freq, dur, type, vol, slideTo, delay) {
    if (this.muted || !this.ac) return;
    const t = this.ac.currentTime + (delay || 0);
    const o = this.ac.createOscillator(), gn = this.ac.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.012);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn); gn.connect(this.ac.destination);
    o.start(t); o.stop(t + dur + 0.02);
  },
  bite()   { this.tone(rand(620, 760), 0.09, 'triangle', 0.16, 980); },
  miss()   { this.tone(150, 0.16, 'sawtooth', 0.11, 80); },
  clear()  { [660, 880, 1100].forEach((f, i) => this.tone(f, 0.13, 'triangle', 0.16, null, i * 0.07)); },
  stir()   { this.tone(400, 0.07, 'sine', 0.06, 520); },
  caught() { this.tone(300, 0.5, 'square', 0.14, 90); },
  bark()   { [220, 180].forEach((f, i) => this.tone(f, 0.11, 'square', 0.13, f * 0.6, i * 0.16)); },
  waveUp() { [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.13, null, i * 0.09)); },
  steal()  { this.tone(520, 0.22, 'sawtooth', 0.10, 180); },
  call()   { [523, 392].forEach((f, i) => this.tone(f, 0.4, 'sine', 0.13, null, i * 0.34)); },
  over()   { [520, 440, 330, 262].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.14, null, i * 0.15)); },
  tap()    { this.tone(340, 0.05, 'sine', 0.05, 420); },
};

/* ---------- layout ---------- *
 * A ribbon of road down the street's roadX, a pavement either side carrying
 * the bowls, then a front garden and the house itself. Each house is drawn on
 * the side of the road the street description puts it (house.side), at its
 * row, facing the road; bowls are drawn where the description puts them. */
const L = {};
function layout() {
  applyLook(g.street);
  L.hud    = 132;
  L.footer = 24;
  L.paveW  = Math.round(C.PAVE_W * DW);
  const roadHalf = Math.round(C.roadHalfOf(g.street) * DW);   /* half the road's width, in design units */
  L.roadL  = sx(g.street.roadX) - roadHalf;
  L.roadR  = sx(g.street.roadX) + roadHalf;
  L.bodyW  = 150;
  L.top    = L.hud;
  L.bot    = DH - L.footer;
  L.rowH   = (L.bot - L.top) / g.street.rows;
  L.bodyH  = Math.min(L.rowH - 44, 290);
}

function fit() {
  const box = stage.getBoundingClientRect();
  const vw = Math.max(1, box.width), vh = Math.max(1, box.height);
  /* Clamped so a desktop window shows a phone-shaped panel rather than a
     stretched one, and an extra-tall phone doesn't get an absurd street. */
  const ar = clamp(vw / vh, 0.42, 0.64);
  DH = Math.round(DW / ar);
  let cssW = vw, cssH = vh;
  if (vw / vh > ar) cssW = vh * ar; else cssH = vw / ar;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  cv.style.width  = cssW + 'px';
  cv.style.height = cssH + 'px';
  cv.width  = Math.round(DW * dpr);
  cv.height = Math.round(DH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  layout();
}

/* world -> screen */
const sx = wx => wx * DW;
const sy = wy => L.top + wy * L.rowH;
const bowlX = h => sx(h.bowlAt.x);
const rowY  = h => sy(h.bowlAt.y);
const onLeft = h => h.side < 0;

/* the house's whole strip, garden included: all of it is one tap target */
function houseRect(h) {
  if (h.venue) {
    const y = sy(h.row);
    return onLeft(h) ? { x: 0, y, w: L.roadL, h: L.rowH * h.venue.span } : { x: L.roadR, y, w: DW - L.roadR, h: L.rowH * h.venue.span };
  }
  const y = rowY(h) - L.rowH / 2;
  return onLeft(h)
    ? { x: 0, y, w: L.roadL, h: L.rowH }
    : { x: L.roadR, y, w: DW - L.roadR, h: L.rowH };
}
/* the building itself */
function bodyRect(h) {
  if (h.venue) {                                  /* a venue is one tall building over its rows */
    const r = houseRect(h), x = onLeft(h) ? 12 : DW - 12 - L.bodyW;
    return { x, y: r.y + 10, w: L.bodyW, h: r.h - 20 };
  }
  const cy = rowY(h);
  const x = onLeft(h) ? 12 : DW - 12 - L.bodyW;
  return { x, y: cy - L.bodyH / 2, w: L.bodyW, h: L.bodyH };
}
/* where the garden meets the pavement -- the fence line */
function fenceX(side) {
  return side < 0 ? L.roadL - L.paveW : L.roadR + L.paveW;
}

/* ---------- game + presentation state ---------- */
/* ?debug lets a test page hand in its own street (window.__bbStreet) to check
   the renderer draws from the description, not from Marrow Street's shape. */
const g = C.create(DEBUG && window.__bbStreet ? { street: window.__bbStreet } : undefined);
const vis = [];                     /* eased per-house visuals */
for (let i = 0; i < g.houses.length; i++) vis.push({ glow: 0, curtain: 0, shake: 0, pop: 0 });

let floaters = [];
let shake = 0, flash = 0, elapsed = 0;
let banner = null;                  /* wave announcement */
/* Best score per street, by street id. `best` is the one for the street on
   screen. Before streets there was one score, 'bowlbandit.best': it was
   earned on Marrow Street, so that is where it goes. */
const streetKey = () => g.street.id || g.street.name;
let bests = loadJSON('bowlbandit.bests', null);
if (!bests) {
  bests = {};
  try { const old = parseInt(localStorage.getItem('bowlbandit.best') || '0', 10) || 0; if (old) bests.marrow = old; } catch (e) {}
}
let best = bests[streetKey()] || 0;
let newBest = false;                /* this round beat the previous best (not merely equalled it) */
let newStreets = [];                /* streets this round's score opened */

function floater(x, y, str, colour, layer) {
  floaters.push({ x, y, str, colour, t: 0, layer: layer || 'street' });
}
let motionSeen = false;             /* a shake has a chance of working here */
let streakFx = null;                /* a flash on the streak badge: up, halved, or lost */

/* The multiplier, with pips for progress to the next step. Pulses when it
   steps up; shakes red when it is lost. */
function drawStreak(x, y, align) {
  const mult = C.multFor(g.streak);
  const fx = streakFx;
  const lost = fx && !fx.up && !fx.half;
  const colour = lost ? ALARM : mult > 1 ? WARM : 'rgba(255,233,201,.45)';
  const pop = fx && fx.up ? 1 + Math.sin((0.9 - fx.t) / 0.9 * Math.PI) * 0.35 : 1;
  const jig = fx && !fx.up ? Math.sin(fx.t * 60) * 5 * fx.t : 0;
  const label = lost ? 'STREAK LOST' : '\u00d7' + mult;
  ctx.save();
  ctx.translate(x + jig, y);
  ctx.font = '800 28px ' + FONT;
  const w = ctx.measureText(label).width;
  const ox = align === 'right' ? -w : 0;
  ctx.save(); ctx.translate(ox + w / 2, 0); ctx.scale(pop, pop);
  outlined(label, 0, 0, 28, colour);
  ctx.restore();
  if (!lost && g.streak < C.STREAK_CAP) {
    const into = g.streak % C.STREAK_STEP;
    for (let i = 0; i < C.STREAK_STEP; i++) {
      circle(ox + w + 16 + i * 15, 2, 5);
      fillStroke(i < into ? WARM : 'rgba(255,233,201,.18)', null);
    }
  }
  ctx.restore();
}
let wasSpotted = false;
/* Haptics where the phone allows it (not iOS Safari); silently nothing elsewhere. */
function buzz(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {} }

/* ---------- events from the core ---------- */
function handleEvents() {
  for (const e of C.drainEvents(g)) {
    const h = e.house != null ? g.houses[e.house] : null;
    tutEvent(e);
    if (e.type === 'eatStart' && !tut && bowlsEaten < HOWTO_BOWLS) {
      bowlsEaten++;
      try { localStorage.setItem('bowlbandit.bowls', String(bowlsEaten)); } catch (err) {}
    }
    switch (e.type) {
      case 'bite': {
        Sfx.bite(); vis[h.id].pop = 0.22;
        anim.chomp = 0.22;
        const c = closeLayout();
        /* pop the score off the marker: that is where the eyes are */
        const popX = c.barX + (lastBiteT != null ? lastBiteT : 0.5) * c.barW;
        const xm = e.mult > 1 ? '  \u00d7' + e.mult : '';
        if (e.perfect) {
          anim.perfect = 0.45;
          Sfx.tone(1180, 0.08, 'triangle', 0.1, 1500, 0.04);
          floater(clamp(popX, 150, DW - 150), c.barY + c.bh / 2, 'PERFECT +' + e.points + xm, MINT, 'close');
        } else {
          floater(clamp(popX, 150, DW - 150), c.barY + c.bh / 2, '+' + e.points + xm, WARM, 'close');
        }
        if (e.multUp && !tut) {
          streakFx = { t: 0.9, up: true };
          [784, 988, 1175].forEach((f, i) => Sfx.tone(f, 0.12, 'triangle', 0.11, null, 0.1 + i * 0.06));
          hintOnce('streak');
        }
        /* crumbs fly out of the bowl */
        const k = clamp(DH / 560, 2.1, 2.9);
        for (let i = 0; i < 7; i++) {
          crumbs.push({ x: c.bowlX + rand(-20, 20), y: c.catY + 4 * k,
                        vx: rand(-240, 240), vy: rand(-520, -260), r: rand(5, 9), t: 0,
                        col: i % 2 ? '#ffbf6b' : '#ff9d6b' });
        }
        break;
      }
      case 'miss':
        Sfx.miss(); vis[h.id].shake = 0.3;
        anim.flinch = 0.35;
        if (e.streakBefore > e.streak && !tut) streakFx = { t: 0.9, up: false, half: true };
        break;
      case 'streakLost':
        if (tut) break;
        streakFx = { t: 1.2, up: false };
        [523, 392, 262].forEach((f, i) => Sfx.tone(f, 0.16, 'sawtooth', 0.07, null, i * 0.09));
        hintOnce('streakLost');
        break;
      case 'clear':
        Sfx.clear();
        if (!g.eat && eatSnap && eatSnap.h.id === h.id) {
          /* the bowl you were eating: hold the close-up a moment to enjoy it */
          linger = { e: eatSnap, t: 0.9 };
          const c = closeLayout();
          floater(c.bowlX, c.catY - 30 * clamp(DH / 560, 2.1, 2.9), 'LICKED CLEAN +' + e.points, MINT, 'close');
        } else {
          floater(bowlX(h), rowY(h) - 70, 'CLEARED +' + e.points, MINT);
        }
        break;
      case 'steal':
        Sfx.steal();
        floater(bowlX(h), rowY(h) - 56, 'FOX GOT IT', '#ff9d6b');
        break;
      case 'stir':
        if (g.eat && g.eat.h.neighbours.includes(e.house)) {
          /* someone who can see THIS bowl: louder, and a nudge in the hand */
          Sfx.tone(330, 0.16, 'triangle', 0.13, 470);
          Sfx.tone(470, 0.12, 'triangle', 0.1, 360, 0.15);
          buzz(25);
          hintOnce('stir');
        } else Sfx.stir();
        break;
      case 'bark': Sfx.bark(); hintOnce('dog'); break;
      case 'call': Sfx.call(); break;
      case 'caught': {
        Sfx.caught(); shake = 0.5; flash = 0.6;
        const l = g.houses[e.loser];
        floater(bowlX(l), rowY(l) - 70, 'NO MORE BOWLS', ALARM);
        break;
      }
      case 'wave':
        if (tut) break;
        if (e.idx > 0) Sfx.waveUp();
        banner = { t: 2.8, idx: e.idx };
        break;
      case 'over':
        Sfx.over();
        overAt = elapsed; rankRung = false;
        newBest = g.score > best;
        newStreets = [];
        if (newBest) {
          const open = C.STREETS.filter(st => C.isUnlocked(st, bests));
          best = bests[streetKey()] = g.score;
          saveJSON('bowlbandit.bests', bests);
          newStreets = C.STREETS.filter(st => C.isUnlocked(st, bests) && !open.includes(st));
        }
        break;
    }
  }
}

/* ---------- presentation update ---------- */
function updateVisuals(dt) {
  elapsed += dt;
  shake = Math.max(0, shake - dt);
  flash = Math.max(0, flash - dt * 1.8);
  anim.chomp   = Math.max(0, anim.chomp - dt);
  anim.flinch  = Math.max(0, anim.flinch - dt);
  anim.perfect = Math.max(0, anim.perfect - dt);
  for (const cr of crumbs) { cr.t += dt; cr.vy += 1500 * dt; cr.x += cr.vx * dt; cr.y += cr.vy * dt; }
  crumbs = crumbs.filter(cr => cr.t < 0.8);
  if (linger) { linger.t -= dt; if (linger.t <= 0 || g.eat || g.scene !== 'play') linger = null; }
  if (!g.eat && !linger) crumbs = [];
  for (const f of floaters) f.t += dt;
  floaters = floaters.filter(f => f.t < 1.3);
  if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }
  if (streakFx) { streakFx.t -= dt; if (streakFx.t <= 0) streakFx = null; }
  if (hint && !banner) { hint.t -= dt; if (hint.t <= 0) hint = null; }
  if (poke) { poke.t -= dt; if (poke.t <= 0) poke = null; }
  if (g.fox && g.scene === 'play') hintOnce('fox');

  /* the moment you're seen gets its own sound, once, not every frame */
  const spotted = g.spot.heat > 0 && !!g.eat;
  if (spotted && !wasSpotted) {
    Sfx.tone(880, 0.1, 'square', 0.09, 660);
    Sfx.tone(880, 0.1, 'square', 0.09, 660, 0.14);
    buzz([60, 40, 60]);
  }
  wasSpotted = spotted;

  for (const h of g.houses) {
    const v = vis[h.id];
    v.shake = Math.max(0, v.shake - dt);
    v.pop   = Math.max(0, v.pop - dt);
    const awake = h.state === 'watch' ? 1 : h.state === 'stir' ? 0.5 : 0;   /* how far the curtain is open */
    v.glow    = lerp(v.glow, awake, dt * 7);
    v.curtain = lerp(v.curtain, awake, dt * 8);
  }
}

/* ================================================================== *
 *  DRAWING
 * ================================================================== */

function drawStreet() {
  ctx.fillStyle = NIGHT;
  ctx.fillRect(0, 0, DW, DH);

  /* pavement strips, which carry the bowls */
  ctx.fillStyle = PAVE;
  ctx.fillRect(L.roadL - L.paveW, L.top, L.paveW, L.bot - L.top);
  ctx.fillRect(L.roadR, L.top, L.paveW, L.bot - L.top);

  /* the road */
  ctx.fillStyle = ROAD;
  ctx.fillRect(L.roadL, L.top, L.roadR - L.roadL, L.bot - L.top);
  ctx.fillStyle = ROAD_2;
  ctx.fillRect(L.roadL, L.top, 7, L.bot - L.top);
  ctx.fillRect(L.roadR - 7, L.top, 7, L.bot - L.top);

  /* kerb lip, on the garden side of each pavement */
  ctx.fillStyle = PAVE_LIP;
  ctx.fillRect(L.roadL - L.paveW, L.top, 6, L.bot - L.top);
  ctx.fillRect(L.roadR + L.paveW - 6, L.top, 6, L.bot - L.top);

  /* paving slabs */
  ctx.strokeStyle = 'rgba(42,27,61,.18)';
  ctx.lineWidth = 3 * STROKE;
  for (let y = L.top; y < L.bot; y += 54) {
    ctx.beginPath(); ctx.moveTo(L.roadL - L.paveW, y); ctx.lineTo(L.roadL, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(L.roadR, y + 27); ctx.lineTo(L.roadR + L.paveW, y + 27); ctx.stroke();
  }

  /* centre line */
  ctx.strokeStyle = 'rgba(255,233,201,.28)';
  ctx.lineWidth = 7 * STROKE;
  ctx.lineCap = 'round';
  ctx.setLineDash([38, 34]);
  ctx.beginPath(); ctx.moveTo(sx(g.street.roadX), L.top); ctx.lineTo(sx(g.street.roadX), L.bot); ctx.stroke();
  ctx.setLineDash([]);

  /* a drain and a puddle, so the tarmac isn't an empty ribbon */
  const dy = L.top + L.rowH * 1.2;
  rr(L.roadL + 14, dy, 36, 24, 5);
  fillStroke('#2c2149', 'rgba(255,233,201,.14)', 2.5);
  ctx.strokeStyle = 'rgba(255,233,201,.14)'; ctx.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(L.roadL + 14, dy + i * 6); ctx.lineTo(L.roadL + 50, dy + i * 6);
    ctx.stroke();
  }
}

/* Lamps stand on the kerb between rows, so they light the bowls without
   sitting on top of one. */
function drawLamp(x, y, dir) {
  /* A small halo round the head, and a soft pool on the ground just below
     it, where a hanging lamp's light lands in this angled view. Both are
     edgeless gradients: hard-edged cones and discs read as extra shapes
     floating on the road. */
  const hx = x + dir * 36, hy = y - 11, gy = y + 40;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = LOOK.lamp;
  const halo = ctx.createRadialGradient(hx, hy, 4, hx, hy, 46);
  halo.addColorStop(0, 'rgba(255,220,140,.35)');
  halo.addColorStop(1, 'rgba(255,220,140,0)');
  ctx.fillStyle = halo; circle(hx, hy, 46); ctx.fill();
  ctx.translate(hx, gy); ctx.scale(1, 0.8);
  const grad = ctx.createRadialGradient(0, 0, 6, 0, 0, 160);
  grad.addColorStop(0, 'rgba(255,214,120,.24)');
  grad.addColorStop(0.45, 'rgba(255,214,120,.10)');
  grad.addColorStop(1, 'rgba(255,214,120,0)');
  ctx.fillStyle = grad;
  circle(0, 0, 160); ctx.fill();
  ctx.restore();

  ctx.beginPath(); ctx.ellipse(x, y + 4, 16, 7, 0, 0, 6.3);
  fillStroke('#241b3f', INK, 3);
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x, y - 14); ctx.lineTo(x + dir * 36, y - 14);
  ctx.strokeStyle = '#2f2450'; ctx.lineWidth = 10 * STROKE; ctx.lineCap = 'round';
  ctx.stroke();
  rr(x + dir * 36 - 17, y - 24, 34, 26, 11);
  fillStroke(WARM, INK, 3.5);
  ctx.globalAlpha = 0.5;
  rr(x + dir * 36 - 11, y - 19, 22, 10, 5);
  fillStroke('#fff8df', null);
  ctx.globalAlpha = 1;
}

function drawFence(h) {
  /* low fence along the front of each garden, with a gap for the path */
  const r = houseRect(h);
  const x = fenceX(h.side);
  const gapTop = rowY(h) - 44, gapBot = rowY(h) + 44;
  ctx.strokeStyle = h.angry ? '#4c4165' : '#6a5a96';
  ctx.lineWidth = 7 * STROKE;
  ctx.lineCap = 'round';
  for (const [a, b] of [[r.y + 16, gapTop], [gapBot, r.y + r.h - 16]]) {
    for (let yy = a; yy < b - 8; yy += 21) {
      ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x, Math.min(yy + 12, b)); ctx.stroke();
    }
  }
}

/* A venue (the pub): one tall building across its rows, with a window for each
   row and a hanging sign. It watches from several windows at once, so the
   whole front lights up together. Shut before last orders (dark, shuttered),
   then open (a dim amber glow, the way a pub is), then brighter and full of
   faces when it stirs and watches. */
function drawVenue(h) {
  const v = vis[h.id], b = bodyRect(h), dir = onLeft(h) ? 1 : -1;
  const open = C.isOpen(g, h);
  const faceW = 70, faceX = onLeft(h) ? b.x + b.w - faceW : b.x;
  const roadEdge = onLeft(h) ? b.x + b.w : b.x;
  const roofX = onLeft(h) ? b.x : b.x + faceW, roofW = b.w - faceW;

  const gx = onLeft(h) ? b.x + b.w : fenceX(h.side);
  const gw = onLeft(h) ? fenceX(h.side) - (b.x + b.w) : b.x - fenceX(h.side);
  ctx.fillStyle = GRASS;
  ctx.fillRect(gx, b.y - 8, gw, b.h + 16);

  rr(b.x, b.y, b.w, b.h, 12);
  fillStroke('#5a3a3a', INK, 4.5);
  ctx.save();
  rr(b.x, b.y, b.w, b.h, 12); ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  ctx.fillRect(onLeft(h) ? roofX + roofW / 2 : roofX, b.y, roofW / 2, b.h);
  ctx.strokeStyle = 'rgba(0,0,0,.13)'; ctx.lineWidth = 2.5 * STROKE;
  for (let yy = b.y + 16; yy < b.y + b.h; yy += 17) {
    ctx.beginPath(); ctx.moveTo(roofX, yy); ctx.lineTo(roofX + roofW, yy); ctx.stroke();
  }
  ctx.fillStyle = '#c9a77c';                     /* the facade, plaster the colour of old beer */
  ctx.fillRect(faceX, b.y, faceW, b.h);
  ctx.restore();
  rr(b.x, b.y, b.w, b.h, 12); fillStroke(null, INK, 4.5);

  /* one window per row, in the facade */
  const gl = open ? clamp(Math.max(v.glow, 0.3), 0, 1) : 0;
  const ww = 46, wh = 52, fcx = faceX + faceW / 2;
  for (let i = 0; i < h.venue.span; i++) {
    const wy = sy(h.row + i) + (L.rowH - wh) / 2 - 24, wx = fcx - ww / 2;
    rr(wx - 5, wy - 5, ww + 10, wh + 10, 9);
    fillStroke('#7a4a3a', INK, 4);
    rr(wx, wy, ww, wh, 6);
    ctx.fillStyle = open ? 'rgb(' + (lerp(150, 255, gl) | 0) + ',' + (lerp(96, 214, gl) | 0) + ',' + (lerp(50, 120, gl) | 0) + ')' : '#241c3d';
    ctx.fill();
    ctx.save(); rr(wx, wy, ww, wh, 6); ctx.clip();
    if (open && v.curtain > 0.05) {              /* drinkers at the glass */
      const hy = wy + wh - lerp(-4, 30, v.curtain);
      ctx.fillStyle = '#3d2b4f'; rr(fcx - 18, hy + 9, 36, 32, 13); ctx.fill();
      ctx.fillStyle = '#f2c49b'; circle(fcx, hy, 11); ctx.fill();
      if (v.curtain > 0.5) { ctx.fillStyle = INK; circle(fcx - 4, hy + 1.5, 1.9); ctx.fill(); circle(fcx + 4, hy + 1.5, 1.9); ctx.fill(); }
    }
    if (!open) {                                 /* shutters */
      ctx.strokeStyle = '#6b5a3f'; ctx.lineWidth = 6 * STROKE;
      for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(wx, wy + k * wh / 4); ctx.lineTo(wx + ww, wy + k * wh / 4); ctx.stroke(); }
    }
    ctx.restore();
    rr(wx, wy, ww, wh, 6); fillStroke(null, INK, 3.5);
  }

  /* door, and the sign hanging out over the pavement */
  const dw = 44, dh = 58, doorY = b.y + b.h - dh - 20, doorX = fcx - dw / 2;
  rr(doorX, doorY, dw, dh, 6); fillStroke('#4a2a2a', INK, 4);
  const sgY = b.y + b.h / 2;
  ctx.strokeStyle = INK; ctx.lineWidth = 5 * STROKE; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(roadEdge, sgY - 30); ctx.lineTo(roadEdge + dir * 26, sgY - 30); ctx.stroke();
  rr(roadEdge + dir * 26 - 15, sgY - 30, 30, 44, 7);
  fillStroke(open ? WARM : '#6b5a3f', INK, 3.5);
  circle(roadEdge + dir * 26, sgY - 8, 8); fillStroke(open ? '#8a4a2a' : '#4c4165', null);

  /* light spilling across the pavement, red while it is looking at you */
  if (open && v.glow > 0.25) {
    const threat = g.eat && h.state === 'watch' && g.eat.h.neighbours.includes(h.id);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (v.glow - 0.25) * 0.55;
    const spill = ctx.createLinearGradient(roadEdge, 0, roadEdge + dir * 110, 0);
    spill.addColorStop(0, threat ? 'rgba(255,110,110,.95)' : 'rgba(255,214,120,.85)');
    spill.addColorStop(1, 'rgba(255,214,120,0)');
    ctx.fillStyle = spill;
    ctx.fillRect(Math.min(roadEdge, roadEdge + dir * 112), b.y + 20, 112, b.h - 40);
    ctx.restore();
  }

  /* a fence along the garden, no gap: nobody walks up to a bowl here */
  const fx = fenceX(h.side);
  ctx.strokeStyle = '#6a5a96'; ctx.lineWidth = 7 * STROKE; ctx.lineCap = 'round';
  for (let yy = b.y + 6; yy < b.y + b.h - 8; yy += 21) { ctx.beginPath(); ctx.moveTo(fx, yy); ctx.lineTo(fx, Math.min(yy + 12, b.y + b.h)); ctx.stroke(); }

  const px = b.x + b.w / 2, pyy = b.y + b.h - 15;
  ctx.font = '600 20px ' + FONT;
  const tw = ctx.measureText(h.name).width;
  rr(px - tw / 2 - 11, pyy - 13, tw + 22, 26, 13);
  fillStroke('rgba(16,10,32,.62)', null);
  text(h.name, px, pyy, 20, 'rgba(255,233,201,.88)', 'center', 600);
}

function drawHouse(h) {
  if (h.venue) { drawVenue(h); return; }
  const v = vis[h.id];
  const t = TINT[h.id % TINT.length];
  const dull = h.angry;
  const b = bodyRect(h);
  const dir = onLeft(h) ? 1 : -1;                        /* towards the road */
  const faceW = 70;                                      /* visible facade depth */
  const faceX = onLeft(h) ? b.x + b.w - faceW : b.x;
  const roadEdge = onLeft(h) ? b.x + b.w : b.x;
  const roofX = onLeft(h) ? b.x : b.x + faceW;
  const roofW = b.w - faceW;

  /* garden between the house and the pavement */
  const gx = onLeft(h) ? b.x + b.w : fenceX(h.side);
  const gw = onLeft(h) ? fenceX(h.side) - (b.x + b.w) : b.x - fenceX(h.side);
  ctx.fillStyle = dull ? '#36405a' : GRASS;
  ctx.fillRect(gx, b.y - 8, gw, b.h + 16);

  ctx.save();
  if (v.shake > 0) ctx.translate(Math.sin(v.shake * 80) * 3, 0);

  /* The house is seen from above and slightly from the road: most of the
     footprint is roof, with the facade wall showing along the road edge. */
  rr(b.x, b.y, b.w, b.h, 12);
  fillStroke(dull ? '#564a73' : t.roof, INK, 4.5);

  ctx.save();
  rr(b.x, b.y, b.w, b.h, 12); ctx.clip();

  /* the slope nearer the road catches the light; a ridge splits the two */
  ctx.fillStyle = 'rgba(255,255,255,.10)';
  ctx.fillRect(onLeft(h) ? roofX + roofW / 2 : roofX, b.y, roofW / 2, b.h);
  ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 3 * STROKE;
  ctx.beginPath();
  ctx.moveTo(roofX + roofW / 2, b.y); ctx.lineTo(roofX + roofW / 2, b.y + b.h);
  ctx.stroke();

  /* tile courses */
  ctx.strokeStyle = 'rgba(0,0,0,.13)'; ctx.lineWidth = 2.5 * STROKE;
  for (let yy = b.y + 16; yy < b.y + b.h; yy += 17) {
    ctx.beginPath(); ctx.moveTo(roofX, yy); ctx.lineTo(roofX + roofW, yy); ctx.stroke();
  }

  /* facade */
  ctx.fillStyle = dull ? '#7a6d99' : t.wall;
  ctx.fillRect(faceX, b.y, faceW, b.h);
  /* eaves shadow where the roof overhangs the wall */
  const eaveG = ctx.createLinearGradient(
    onLeft(h) ? faceX : faceX + faceW, 0, onLeft(h) ? faceX + 16 : faceX + faceW - 16, 0);
  eaveG.addColorStop(0, 'rgba(0,0,0,.3)');
  eaveG.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = eaveG;
  ctx.fillRect(onLeft(h) ? faceX : faceX + faceW - 16, b.y, 16, b.h);
  ctx.restore();

  rr(b.x, b.y, b.w, b.h, 12); fillStroke(null, INK, 4.5);

  /* chimney, on some houses only, so the row isn't uniform */
  if (hash(h.id, 3) > 0.4) {
    const cx2 = roofX + roofW * (onLeft(h) ? 0.26 : 0.74);
    const cyy = b.y + 28 + hash(h.id, 4) * (b.h - 96);
    rr(cx2 - 12, cyy, 24, 32, 5);
    fillStroke(dull ? '#473d60' : t.door, INK, 3.5);
    if (!dull) {
      ctx.globalAlpha = 0.2;
      for (let i = 0; i < 3; i++) {
        const p = (elapsed * 0.4 + i * 0.33) % 1;
        circle(cx2 - dir * p * 16, cyy - 8 - p * 16, 5 + p * 8);
        ctx.fillStyle = '#ffeecf'; ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  /* window: the whole tell lives here, so dark really means asleep */
  const fcx = faceX + faceW / 2;
  const ww = 50, wh = 56, winY = b.y + 30;
  const winX = fcx - ww / 2;
  rr(winX - 5, winY - 5, ww + 10, wh + 10, 9);
  fillStroke(dull ? '#564a73' : t.trim, INK, 4);

  rr(winX, winY, ww, wh, 6);
  if (dull) {
    ctx.fillStyle = '#241c3d'; ctx.fill();
    ctx.save(); rr(winX, winY, ww, wh, 6); ctx.clip();
    /* boarded up, but they still watch through the gap in the planks */
    ctx.globalAlpha = clamp(v.glow, 0, 1) * 0.85;
    ctx.fillStyle = '#e9b6ff';
    ctx.fillRect(winX, winY + wh / 2 - 9, ww, 18);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#6b5a3f'; ctx.lineWidth = 9 * STROKE;
    ctx.beginPath(); ctx.moveTo(winX - 5, winY + 16); ctx.lineTo(winX + ww + 5, winY + 25); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(winX - 5, winY + wh - 14); ctx.lineTo(winX + ww + 5, winY + wh - 23); ctx.stroke();
    ctx.restore();
  } else {
    const gl = clamp(v.glow, 0, 1);
    ctx.fillStyle = 'rgb(' + (lerp(54, 255, gl) | 0) + ',' +
                             (lerp(46, 226, gl) | 0) + ',' +
                             (lerp(92, 150, gl) | 0) + ')';
    ctx.fill();
    ctx.save(); rr(winX, winY, ww, wh, 6); ctx.clip();
    /* a person at the glass, rising as the curtain opens */
    if (v.curtain > 0.05) {
      const mx = fcx, hy = winY + wh - lerp(-4, 32, v.curtain);
      ctx.fillStyle = t.roof;
      rr(mx - 19, hy + 9, 38, 34, 14); ctx.fill();
      ctx.fillStyle = '#f2c49b';
      circle(mx, hy, 11); ctx.fill();
      ctx.fillStyle = '#4a3550';
      ctx.beginPath(); ctx.arc(mx, hy - 1.5, 11, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fill();
      if (v.curtain > 0.5) {
        ctx.fillStyle = INK;
        circle(mx - 4, hy + 1.5, 1.9); ctx.fill();
        circle(mx + 4, hy + 1.5, 1.9); ctx.fill();
      }
    }
    const cwd = lerp(ww * 0.5, ww * 0.14, v.curtain);
    ctx.fillStyle = 'rgba(226,214,255,' + lerp(0.5, 0.26, gl).toFixed(2) + ')';
    ctx.fillRect(winX, winY, cwd, wh);
    ctx.fillRect(winX + ww - cwd, winY, cwd, wh);
    ctx.restore();
  }
  rr(winX, winY, ww, wh, 6); fillStroke(null, INK, 3.5);

  /* door */
  const dw = 44, dh = 58, doorY = b.y + b.h - dh - 20;
  const doorX = fcx - dw / 2;
  rr(doorX, doorY, dw, dh, 6);
  fillStroke(dull ? '#473d60' : t.door, INK, 4);
  circle(doorX + (onLeft(h) ? dw - 9 : 9), doorY + dh / 2, 3.5);
  fillStroke(WARM, null);

  ctx.restore();

  /* light spilling from a watching window across the garden */
  if (!dull && v.glow > 0.25) {
    const threat = g.eat && g.eat.h !== h && h.state === 'watch' && g.eat.h.neighbours.includes(h.id);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (v.glow - 0.25) * 0.55;
    const spill = ctx.createLinearGradient(roadEdge, 0, roadEdge + dir * 110, 0);
    spill.addColorStop(0, threat ? 'rgba(255,110,110,.95)' : 'rgba(255,214,120,.85)');
    spill.addColorStop(1, 'rgba(255,214,120,0)');
    ctx.fillStyle = spill;
    ctx.beginPath();
    ctx.moveTo(roadEdge, winY - 4);
    ctx.lineTo(roadEdge + dir * 112, winY - 54);
    ctx.lineTo(roadEdge + dir * 112, winY + wh + 54);
    ctx.lineTo(roadEdge, winY + wh + 4);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /* garden path: straight out through the gate to the bowl. Drawn level with
     the bowl rather than from the door, so it reads as paving and not a beam
     of light coming out of the house. */
  ctx.strokeStyle = dull ? 'rgba(255,233,201,.08)' : 'rgba(255,233,201,.17)';
  ctx.lineWidth = 26 * STROKE;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(roadEdge, rowY(h));
  ctx.lineTo(bowlX(h), rowY(h));
  ctx.stroke();

  drawFence(h);

  /* name plaque, so you know whose bowl you are about to raid */
  const px = b.x + b.w / 2, pyy = b.y + b.h - 15;
  ctx.font = '600 20px ' + FONT;
  const tw = ctx.measureText(h.name).width;
  rr(px - tw / 2 - 11, pyy - 13, tw + 22, 26, 13);
  fillStroke('rgba(16,10,32,.62)', null);
  text(h.name, px, pyy, 20, dull ? 'rgba(255,233,201,.4)' : 'rgba(255,233,201,.88)', 'center', 600);
}

function drawBowl(h) {
  if (!h.bowl) return;
  const x = bowlX(h), y = rowY(h);
  const v = vis[h.id];
  const s = 1 + v.pop * 0.5;
  const bob = Math.sin(elapsed * 2 + h.id) * 2;

  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(s, s);

  ctx.globalAlpha = 0.3;
  ctx.beginPath(); ctx.ellipse(0, 16, 30, 9, 0, 0, 6.3);
  ctx.fillStyle = '#000'; ctx.fill();
  ctx.globalAlpha = 1;

  bowlShape(h.bowl.food, h.id);
  ctx.restore();
}

/* ---------- characters ---------- */
function drawCat(x, y, face, eating) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1.22, 1.22);

  ctx.globalAlpha = 0.32;
  ctx.beginPath(); ctx.ellipse(0, 20, 30, 10, 0, 0, 6.3);
  ctx.fillStyle = '#000'; ctx.fill();
  ctx.globalAlpha = 1;

  ctx.scale(face, 1);
  const bounce = eating ? 0 : Math.sin(elapsed * 9) * 2;

  /* tail */
  ctx.beginPath();
  ctx.moveTo(-22, 2);
  ctx.quadraticCurveTo(-46, -6 + Math.sin(elapsed * 3) * 10, -36, -28);
  ctx.strokeStyle = INK; ctx.lineWidth = 13 * STROKE; ctx.lineCap = 'round'; ctx.stroke();
  ctx.strokeStyle = '#514e78'; ctx.lineWidth = 8 * STROKE; ctx.stroke();

  rr(-26, -12 + bounce, 50, 32, 15);
  fillStroke('#5b5884', INK, 4.5);

  const hy = (eating ? 6 : -14) + bounce;
  ctx.save();
  ctx.translate(16, hy);
  ctx.beginPath();
  ctx.moveTo(-12, -8); ctx.lineTo(-7, -23); ctx.lineTo(1, -11); ctx.closePath();
  fillStroke('#5b5884', INK, 3.5);
  ctx.beginPath();
  ctx.moveTo(8, -11); ctx.lineTo(15, -23); ctx.lineTo(18, -7); ctx.closePath();
  fillStroke('#5b5884', INK, 3.5);
  circle(2, -2, 15); fillStroke('#67648f', INK, 4);
  if (!eating) {
    ctx.fillStyle = MINT;
    circle(-3, -4, 3.4); ctx.fill();
    circle(8, -4, 3.4); ctx.fill();
  } else {
    ctx.strokeStyle = MINT; ctx.lineWidth = 2.5 * STROKE;
    ctx.beginPath(); ctx.arc(-3, -4, 3.4, 0.2, 2.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(8, -4, 3.4, 0.2, 2.9); ctx.stroke();
  }
  circle(3, 3, 2.4); fillStroke('#ffb0c8', null);
  ctx.restore();
  ctx.restore();
}

function drawDog() {
  const d = g.dog;
  if (!d) return;
  if (d.phase === 'bark') {
    /* it is off-screen while barking: say which end it is coming from */
    const edgeY = d.dir === 1 ? L.top + 44 : L.bot - 44;
    const pulse = 0.5 + 0.5 * Math.sin(elapsed * 14);
    ctx.globalAlpha = 0.55 + pulse * 0.45;
    outlined('WOOF!', DW / 2, edgeY, 56, ALARM);
    text('get off the bowls', DW / 2, edgeY + (d.dir === 1 ? 40 : -40), 24, CREAM);
    ctx.globalAlpha = 1;
    return;
  }
  ctx.save();
  ctx.translate(sx(d.x), sy(d.y));
  ctx.globalAlpha = 0.3;
  ctx.beginPath(); ctx.ellipse(0, 24, 34, 11, 0, 0, 6.3);
  ctx.fillStyle = '#000'; ctx.fill();
  ctx.globalAlpha = 1;
  const legs = Math.sin(elapsed * 22) * 8;
  ctx.strokeStyle = '#7a5433'; ctx.lineWidth = 9 * STROKE; ctx.lineCap = 'round';
  for (const lx of [-16, 14]) {
    ctx.beginPath(); ctx.moveTo(lx, 8); ctx.lineTo(lx + legs, 24); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(lx, 8); ctx.lineTo(lx - legs, 24); ctx.stroke();
  }
  rr(-30, -14, 60, 32, 15); fillStroke('#9a6b42', INK, 4.5);
  circle(28, -18, 17); fillStroke('#a87850', INK, 4);
  ctx.beginPath(); ctx.moveTo(20, -32); ctx.lineTo(16, -14); ctx.lineTo(30, -24); ctx.closePath();
  fillStroke('#7a5433', INK, 3);
  ctx.fillStyle = INK; circle(33, -20, 2.8); ctx.fill();
  circle(40, -14, 4); fillStroke(INK, null);
  ctx.restore();
}

function drawFox() {
  const f = g.fox;
  if (!f) return;
  ctx.save();
  ctx.translate(sx(f.x), sy(f.y));
  ctx.globalAlpha = 0.3;
  ctx.beginPath(); ctx.ellipse(0, 18, 28, 9, 0, 0, 6.3);
  ctx.fillStyle = '#000'; ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(-20, 0);
  ctx.quadraticCurveTo(-44, -4, -40, -22);
  ctx.strokeStyle = '#d4702f'; ctx.lineWidth = 15 * STROKE; ctx.lineCap = 'round'; ctx.stroke();
  ctx.strokeStyle = '#fff1d8'; ctx.lineWidth = 7 * STROKE;
  ctx.beginPath(); ctx.moveTo(-41, -17); ctx.lineTo(-40, -22); ctx.stroke();
  rr(-24, -10, 46, 26, 12); fillStroke('#e07a35', INK, 4);
  circle(20, -16, 14); fillStroke('#ef8a42', INK, 3.5);
  ctx.beginPath(); ctx.moveTo(10, -28); ctx.lineTo(13, -14); ctx.lineTo(20, -26); ctx.closePath();
  fillStroke('#c9631f', INK, 2.5);
  ctx.beginPath(); ctx.moveTo(24, -28); ctx.lineTo(24, -14); ctx.lineTo(31, -24); ctx.closePath();
  fillStroke('#c9631f', INK, 2.5);
  ctx.fillStyle = INK; circle(26, -17, 2.6); ctx.fill();
  ctx.restore();
}

/* ---------- the owner comes for you ---------- *
 * The end of the round, played as a little scene: the owner walks up the
 * road, crouches, scoops the cat up, says something fond and carries it home.
 * The core only says how long it lasts; every beat is timed from here.     */
let purred = false;

function pickupPlan() {
  const t = g.pickup.t;
  const cx = sx(g.cat.x), cy = sy(g.cat.y);
  /* they come from whichever end of the street is nearer */
  const fromBottom = g.cat.y > g.street.rows / 2;
  const startX = sx(g.street.roadX), startY = fromBottom ? L.bot + 140 : L.top - 40;
  const side = cx < sx(g.street.roadX) ? 1 : -1;               /* stand on the road side of the cat */
  const standX = cx + side * 60, standY = cy;
  const walkT  = clamp(Math.hypot(standX - startX, standY - startY) / 320, 0.9, 1.8);
  const reachT = walkT + 0.4;                      /* crouched, arms down */
  const liftT  = reachT + 0.35;                    /* cat is in their arms */
  const leaveT = liftT + 1.15;                     /* turn for home */

  let ox, oy;
  if (t < walkT) {
    const k = t / walkT, e = 1 - Math.pow(1 - k, 2);
    ox = lerp(startX, standX, e); oy = lerp(startY, standY, e);
  } else if (t < leaveT) {
    ox = standX; oy = standY;
  } else {
    const k = clamp((t - leaveT) / walkT, 0, 1);
    ox = lerp(standX, startX, k * k); oy = lerp(standY, startY, k * k);
  }
  return { t, cx, cy, side, ox, oy, walkT, reachT, liftT, leaveT,
           walking: t < walkT || t >= leaveT,
           crouch: t >= walkT && t < liftT + 0.25 ? Math.sin(clamp((t - walkT) / (liftT + 0.25 - walkT), 0, 1) * Math.PI) : 0,
           lift: clamp((t - reachT) / (liftT - reachT), 0, 1) };
}

/* Gentle push-in on the cat, then follow the owner home. Only the street
   zooms; the HUD stays put. */
function pickupCamera() {
  if (!g.pickup || g.scene === 'over') return;
  const P = pickupPlan();
  const z = 1 + 0.75 * (1 - Math.pow(1 - clamp(P.t / 1.1, 0, 1), 3));
  const follow = clamp((P.t - P.reachT) / 0.6, 0, 1);
  const fx = lerp(P.cx, P.ox, follow), fy = lerp(P.cy, P.oy, follow) - 50;
  const anchorY = DH * 0.55;
  const e = clamp(P.t / 1.1, 0, 1);
  ctx.translate(DW / 2, anchorY);
  ctx.scale(z, z);
  ctx.translate(-lerp(DW / 2, fx, e), -lerp(anchorY, fy, e));
}

/* the cat, scooped up: curled, eyes shut, purring */
function drawHeldCat(x, y, face, t) {
  const purr = Math.sin(t * 14) * 1.2;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(face * 1.15, 1.15);
  ctx.beginPath();
  ctx.moveTo(-16, 4 + purr); ctx.quadraticCurveTo(-36, 14, -30, -6);
  ctx.lineWidth = 11 * STROKE; ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.stroke();
  ctx.lineWidth = 7 * STROKE; ctx.strokeStyle = '#5b5884'; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, purr, 21, 13, 0, 0, Math.PI * 2);
  fillStroke('#5b5884', INK, 4);
  ctx.save();
  ctx.translate(15, -9 + purr);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 3 - 3, -8); ctx.lineTo(s * 8 - 2, -20); ctx.lineTo(s * 10 + 2, -7);
    ctx.closePath(); fillStroke('#5b5884', INK, 3);
  }
  circle(0, 0, 12.5); fillStroke('#67648f', INK, 3.5);
  ctx.strokeStyle = MINT; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 4.5, -2, 3.2, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
  circle(0, 4, 2.2); fillStroke('#ffb0c8', null);
  ctx.restore();
  ctx.restore();
}

function drawOwner() {
  if (!g.pickup) { purred = false; return; }
  const P = pickupPlan();
  const face = P.t >= P.leaveT ? P.side : -P.side;    /* towards the cat, then home */
  const stride = P.walking ? Math.sin(P.t * 10) * 6 : 0;
  const bob = P.walking ? Math.abs(Math.sin(P.t * 10)) * 3 : 0;
  const dip = P.crouch * 22;                         /* knees bend to reach the cat */

  ctx.save();
  ctx.translate(P.ox, P.oy + 20);
  ctx.globalAlpha = 0.3;
  ctx.beginPath(); ctx.ellipse(0, 4, 26, 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#000'; ctx.fill();
  ctx.globalAlpha = 1;
  ctx.scale(face, 1);

  for (const s of [-1, 1]) {
    rr(s * 8 - 6, -46 + dip * 0.5, 12, 48 - dip * 0.5, 5); fillStroke('#3f5aa8', INK, 3.5);
    rr(s * 8 - 8, -2 + (s > 0 ? stride * 0.3 : -stride * 0.3), 17, 9, 4);
    fillStroke('#2f2544', INK, 3);
  }
  ctx.translate(0, dip - bob);
  rr(-20, -104, 40, 60, 12); fillStroke('#e0574f', INK, 4);
  rr(-20, -104, 40, 16, 10); fillStroke('#c9455c', INK, 3);
  /* arm: swinging, reaching down to the cat, then cradling it */
  ctx.lineCap = 'round'; ctx.lineWidth = 11 * STROKE; ctx.strokeStyle = INK;
  ctx.beginPath();
  if (P.lift >= 1)       { ctx.moveTo(14, -86); ctx.quadraticCurveTo(32, -70, 18, -58); }
  else if (P.crouch > 0) { ctx.moveTo(14, -86); ctx.quadraticCurveTo(34, -60, 30, -36 + P.lift * -18); }
  else                   { ctx.moveTo(14, -86); ctx.quadraticCurveTo(24, -70, 18 + stride, -54); }
  ctx.stroke();
  ctx.lineWidth = 7 * STROKE; ctx.strokeStyle = '#e0574f'; ctx.stroke();

  circle(0, -122, 19); fillStroke('#ffd0a8', INK, 4);
  ctx.beginPath(); ctx.arc(0, -126, 20, Math.PI * 1.05, Math.PI * 1.95); ctx.lineTo(0, -126);
  fillStroke('#5b3a2e', INK, 3.5);
  for (const s of [-1, 1]) { circle(s * 6 + 3, -120, 2.6); fillStroke(INK, null); }
  ctx.beginPath(); ctx.arc(3, -114, 5, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.strokeStyle = INK; ctx.lineWidth = 2.4 * STROKE; ctx.stroke();
  ctx.restore();

  /* the cat: on the ground looking up, rising into the arms, then held */
  if (P.lift > 0) {
    if (!purred) { purred = true; Sfx.tone(480, 0.14, 'sine', 0.09, 640); Sfx.tone(640, 0.2, 'sine', 0.07, 520, 0.13); }
    const hx = P.ox + face * 22, hy = P.oy + 20 - 66 + P.crouch * 22;
    const k = 1 - Math.pow(1 - P.lift, 2);
    drawHeldCat(lerp(P.cx, hx, k), lerp(P.cy - 8, hy, k), face, P.t);
    /* hearts, once it's safe in their arms */
    if (P.lift >= 1) {
      for (let i = 0; i < 3; i++) {
        const ht = ((P.t - P.liftT) * 0.9 + i * 0.33) % 1;
        if (P.t - P.liftT < i * 0.3) continue;
        ctx.globalAlpha = 1 - ht;
        text('♥', hx + face * 10 + Math.sin(ht * 6 + i) * 10, hy - 26 - ht * 60, 24 + i * 3, '#ff9ecd', 'center', 800);
        ctx.globalAlpha = 1;
      }
    }
  }

  /* what they say, as they say it */
  if (P.t > 0.3 && P.t < P.leaveT + 0.6) {
    const say = P.lift >= 1 ? 'Come on, you. Inside.' : 'There you are!';
    const pop = clamp((P.t - 0.3) * 5, 0, 1);
    ctx.font = '700 22px ' + FONT;
    const bw = ctx.measureText(say).width + 40;
    const bx = clamp(P.ox, bw / 2 + 12, DW - bw / 2 - 12), by = P.oy - 150;
    ctx.save();
    ctx.translate(bx, by); ctx.scale(pop, pop);
    rr(-bw / 2, -26, bw, 50, 16); fillStroke('#fff3d6', INK, 4);
    ctx.beginPath(); ctx.moveTo(P.ox - bx - 10, 22); ctx.lineTo(P.ox - bx + 12, 22); ctx.lineTo(P.ox - bx, 40);
    ctx.closePath(); fillStroke('#fff3d6', INK, 4);
    rr(-bw / 2 + 3, 14, bw - 6, 9, 4); fillStroke('#fff3d6', null);
    text(say, 0, 0, 22, '#7a5fb0', 'center', 700);
    ctx.restore();
  }
}

/* ---------- HUD ---------- */
function muteRect() { return { x: DW - 128, y: 92, w: 116, h: 34 }; }

function drawHud() {
  ctx.fillStyle = '#120c24';
  ctx.fillRect(0, 0, DW, L.hud);
  ctx.strokeStyle = 'rgba(255,233,201,.12)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, L.hud); ctx.lineTo(DW, L.hud); ctx.stroke();

  text('SCORE', 24, 28, 21, 'rgba(255,233,201,.5)', 'left', 600);
  outlined(String(g.score), 24, 64, 42, CREAM, 'left');
  if (!tut && g.scene !== 'title' && !g.eat) {
    ctx.font = '800 42px ' + FONT;
    drawStreak(24 + ctx.measureText(String(g.score)).width + 18, 66, 'left');
  }

  const secs = Math.max(0, Math.ceil(g.timeLeft));
  const clock = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
  const low = g.timeLeft < 15 && g.scene === 'play';
  if (tut) outlined('PRACTICE', DW / 2, 50, 40, MINT);
  else outlined(clock, DW / 2, 50, 50, low && Math.sin(elapsed * 9) > 0 ? ALARM : CREAM);

  const homes = g.houses.filter(h => !h.venue), kept = homes.filter(h => !h.angry).length;
  text('FEEDING YOU', DW - 24, 28, 21, 'rgba(255,233,201,.5)', 'right', 600);
  outlined(kept + '/' + homes.length, DW - 24, 64, 42, kept <= homes.length / 4 ? ALARM : MINT, 'right');

  /* while eating, the second row goes: less to look at above the windows */
  if (g.eat) return;
  /* second row: which wave we're in, and the sound toggle */
  if (!tut) text('WAVE ' + (g.waveIdx + 1) + ' · ' + C.WAVES[g.waveIdx].name,
       24, 109, 20, 'rgba(255,233,201,.55)', 'left', 600);
  for (let i = 0; i < C.WAVES.length; i++) {
    circle(DW / 2 - 36 + i * 24, 109, 6);
    fillStroke(i <= g.waveIdx ? WARM : 'rgba(255,233,201,.22)', INK, 2.5);
  }
  const m = muteRect();
  rr(m.x, m.y, m.w, m.h, 17);
  fillStroke('rgba(255,233,201,.08)', 'rgba(255,233,201,.2)', 2);
  text(Sfx.muted ? 'SOUND OFF' : 'SOUND ON', m.x + m.w / 2, m.y + m.h / 2 + 1, 19,
       Sfx.muted ? 'rgba(255,233,201,.45)' : WARM, 'center', 600);
}

function drawFloaters(layer) {
  for (const f of floaters) {
    if (f.layer !== layer) continue;
    ctx.globalAlpha = 1 - f.t / 1.3;
    outlined(f.str, f.x, f.y - f.t * 44, 28, f.colour);
    ctx.globalAlpha = 1;
  }
}

/* ---------- the eating close-up ---------- *
 * When the cat sits down at a bowl the street gives way to a close-up: the
 * neighbours who matter are drawn as real house fronts across the top, the
 * cat and the bowl in the middle, and the timing bar along the bottom under
 * the thumb. Left is always up the road, the middle is across it, the right
 * is down the road, so the picture keeps the street's geography.            */
const anim = { chomp: 0, flinch: 0, perfect: 0 };
let crumbs = [];
/* The core stops eating the moment a bowl is cleared, so the renderer keeps
   the last bite's marker position and the eating state it ended, and holds
   the close-up for a moment after the final bite instead of cutting away. */
let lastBiteT = null, eatSnap = null, linger = null;
/* the how-to line under the eating screen shows for a player's first few
   bowls only; after that the screen is the bar, the windows and the cat */
const HOWTO_BOWLS = 3;
let bowlsEaten = 0;
try { bowlsEaten = parseInt(localStorage.getItem('bowlbandit.bowls') || '0', 10) || 0; } catch (e) {}

function closeLayout() {
  /* Everything the eyes need sits in one band at the top: the windows, and
     the bar right under them. The thumb taps anywhere, so the bar does not
     have to be near it; the cat fills the space below as the reward. */
  const frontH  = clamp(DH * 0.19, 210, 300);
  const winTop  = L.hud + 40;
  const statusY = winTop + frontH + 2;
  const bh      = 88;
  const barY    = statusY + 64;
  const rowY2   = barY + bh + 30;                    /* where the cat's space begins */
  const catY    = Math.round((rowY2 + 50 + DH - 96) / 2 + 40);
  /* the window slots and the timing bar are laid out here and nowhere else:
     taps (frontAt, the paw, the pokes) must agree with what is drawn */
  const slotX = slot => DW / 2 + (slot - 1) * 230;
  return { frontH, frontW: 206, slotX, barX: 48, barW: DW - 96, winTop, statusY, bh, barY, rowY2, catY, bowlX: DW / 2 + 92 };
}
/* a neighbour of this bowl is at the curtain but not yet at the glass */
function warned() {
  return !!g.eat && g.eat.h.neighbours.some(id => g.houses[id].state === 'stir');
}

/* which slot a neighbour occupies in the close-up: left is up the road,
   middle is across it, right is down it, matching the street's geography */
function slotOf(owner, n) {
  const slots = windowSlots(owner);
  return slots[owner.neighbours.indexOf(n.id)];
}
/* Slots for all of an owner's neighbours at once, in owner.neighbours order.
   Each takes the slot of its direction when the directions are all different
   (the usual case: one up the road, one across, one down it). When two share
   a direction, as on a one-sided lane, they are ordered up the road to down it
   and spread over the windows instead. */
function windowSlots(owner) {
  const dirOf = n => n.side !== owner.side ? 1 : n.row < owner.row ? 0 : 2;
  const ns = owner.neighbours.map(id => g.houses[id]);
  const dirs = ns.map(dirOf);
  if (new Set(dirs).size === dirs.length) return dirs;
  const order = ns.map((n, i) => i).sort((a, b) => dirs[a] - dirs[b] || ns[a].row - ns[b].row);
  const spread = ns.length === 1 ? [1] : ns.length === 2 ? [0, 2] : [0, 1, 2];
  const out = [];
  order.forEach((i, k) => { out[i] = spread[k]; });
  return out;
}

/* a resident at the glass: s scales from the street-sized figure */
function drawResident(mx, baseY, s, tint, rise, stare) {
  const hy = baseY - lerp(-6, 46, rise) * s;
  ctx.fillStyle = tint.roof;
  rr(mx - 28 * s, hy + 13 * s, 56 * s, 50 * s, 20 * s); ctx.fill();
  ctx.fillStyle = '#f2c49b';
  circle(mx, hy, 16 * s); ctx.fill();
  ctx.fillStyle = '#4a3550';
  ctx.beginPath(); ctx.arc(mx, hy - 2 * s, 16 * s, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fill();
  if (rise > 0.5) {
    ctx.fillStyle = INK;
    const er = stare ? 3.6 * s : 2.4 * s;
    circle(mx - 6 * s, hy + 2 * s, er); ctx.fill();
    circle(mx + 6 * s, hy + 2 * s, er); ctx.fill();
    if (stare) {
      /* brows down: they have seen exactly what you're doing */
      ctx.strokeStyle = INK; ctx.lineWidth = 2.6 * s;
      ctx.beginPath(); ctx.moveTo(mx - 11 * s, hy - 6 * s); ctx.lineTo(mx - 2 * s, hy - 3 * s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx + 11 * s, hy - 6 * s); ctx.lineTo(mx + 2 * s, hy - 3 * s); ctx.stroke();
    }
  }
}

function drawFront(owner, n, slot, c) {
  const wob = poke && poke.id === n.id ? Math.sin(poke.t * 40) * clamp((poke.t - 1.5) / 0.4, 0, 1) * 7 : 0;
  const cx = c.slotX(slot) + wob;
  const w = c.frontW, H = c.frontH, y = c.winTop;
  const t = TINT[n.id % TINT.length], v = vis[n.id];
  const watching = n.state === 'watch', stirring = n.state === 'stir';
  const dull = n.angry;
  const pulse = 0.5 + 0.5 * Math.sin(elapsed * 10);


  /* red halo behind a window that can see you */
  if (watching) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const hg = ctx.createRadialGradient(cx, y + H * 0.45, 10, cx, y + H * 0.45, w * 0.9);
    hg.addColorStop(0, 'rgba(255,90,90,' + (0.35 + pulse * 0.2).toFixed(2) + ')');
    hg.addColorStop(1, 'rgba(255,90,90,0)');
    ctx.fillStyle = hg; circle(cx, y + H * 0.45, w * 0.9); ctx.fill();
    ctx.restore();
  }

  /* roof and wall */
  ctx.beginPath();
  ctx.moveTo(cx - w / 2 - 10, y + 40); ctx.lineTo(cx, y - 6); ctx.lineTo(cx + w / 2 + 10, y + 40);
  ctx.closePath();
  fillStroke(dull ? '#564a73' : t.roof, INK, 4.5);
  rr(cx - w / 2, y + 32, w, H - 32, 10);
  fillStroke(dull ? '#766894' : t.wall, INK, 4.5);

  /* window */
  const ww = w * 0.66, wh = (H - 32) * 0.56;
  const wx = cx - ww / 2, wy = y + 32 + (H - 32) * 0.13;
  const s = ww / 64;
  rr(wx - 7, wy - 7, ww + 14, wh + 14, 12);
  fillStroke(dull ? '#564a73' : t.trim, watching ? ALARM : INK, watching ? 6 + pulse * 3 : 4.5);
  rr(wx, wy, ww, wh, 8);
  if (dull) {
    ctx.fillStyle = '#211a38'; ctx.fill();
    ctx.save(); rr(wx, wy, ww, wh, 8); ctx.clip();
    /* boarded up, but still watching through the gap in the planks */
    if (v.glow > 0.15) {
      ctx.globalAlpha = clamp(v.glow, 0, 1);
      ctx.fillStyle = '#e9b6ff';
      ctx.fillRect(wx, wy + wh / 2 - 16, ww, 32);
      ctx.fillStyle = INK;
      circle(cx - 14, wy + wh / 2, 6); ctx.fill();
      circle(cx + 14, wy + wh / 2, 6); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = '#7a6442'; ctx.lineWidth = 18;
    ctx.beginPath(); ctx.moveTo(wx - 8, wy + 22); ctx.lineTo(wx + ww + 8, wy + 36); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(wx - 8, wy + wh - 20); ctx.lineTo(wx + ww + 8, wy + wh - 34); ctx.stroke();
    ctx.restore();
  } else {
    const gl = clamp(v.glow, 0, 1);
    ctx.fillStyle = 'rgb(' + (lerp(48, 255, gl) | 0) + ',' + (lerp(40, 226, gl) | 0) + ',' + (lerp(86, 150, gl) | 0) + ')';
    ctx.fill();
    ctx.save(); rr(wx, wy, ww, wh, 8); ctx.clip();
    if (v.curtain > 0.05) drawResident(cx, wy + wh, s, t, v.curtain, watching);
    /* curtains: a stirring resident makes them twitch */
    const twitch = stirring ? Math.sin(elapsed * 22) * 5 : 0;
    const cwd = lerp(ww * 0.5, ww * 0.13, v.curtain) + twitch;
    ctx.fillStyle = 'rgba(226,214,255,' + lerp(0.62, 0.3, gl).toFixed(2) + ')';
    ctx.fillRect(wx, wy, cwd, wh);
    ctx.fillRect(wx + ww - cwd, wy, cwd, wh);
    ctx.restore();
    if (n.state === 'idle') {
      const zt = (elapsed * 0.6 + n.id * 0.3) % 1;
      ctx.globalAlpha = 1 - zt;
      text('z', wx + ww - 6 + zt * 14, wy - 4 - zt * 26, 24 + zt * 8, 'rgba(255,233,201,.7)', 'center', 800);
      ctx.globalAlpha = 1;
    }
  }
  rr(wx, wy, ww, wh, 8); fillStroke(null, INK, 3.5);

  /* window box, because every house on Marrow Street has one */
  rr(wx - 4, wy + wh + 8, ww + 8, 16, 5);
  fillStroke(dull ? '#4a4065' : t.door, INK, 3);
  if (!dull) for (let i = 0; i < 4; i++) {
    circle(wx + 10 + i * (ww - 20) / 3, wy + wh + 6, 7);
    fillStroke(i % 2 ? '#ff9ecd' : WARM, INK, 2);
  }

  /* exclamation over a resident who has clocked you */
  if (watching) {
    const by = y - 8 + Math.sin(elapsed * 12) * 3;
    circle(cx + w / 2 - 14, by, 22); fillStroke(ALARM, INK, 4);
    text('!', cx + w / 2 - 14, by + 2, 32, '#2a0f14', 'center', 800);
  }

  /* this window's own RUN timer, draining while they register what they see */
  if (g.spot.by === n.id && g.spot.heat > 0) {
    const frac = clamp(g.spot.heat / C.wave(g).react, 0, 1);
    const mx2 = cx - w / 2 + 14, mw = w - 28, my = y + H - 30;
    rr(mx2, my, mw, 18, 9); fillStroke('rgba(42,10,20,.7)', null);
    rr(mx2, my, mw * (1 - frac), 18, 9); fillStroke(ALARM, null);
  }

}

function drawEmptySlot(slot, c) {
  const cx = c.slotX(slot);
  text('END OF THE ROAD', cx, c.winTop + c.frontH * 0.5, 18, 'rgba(255,233,201,.22)', 'center', 600);
  /* a hedge, so the gap reads as the street ending rather than a missing house */
  for (let i = 0; i < 5; i++) {
    circle(cx - 80 + i * 40, c.winTop + c.frontH - 24, 30);
    fillStroke('#2f5a3e', INK, 3);
  }
}

/* the food in a bowl, drawn at the origin */
function bowlShape(n, seed) {
  /* Back to front: the dark inside of the bowl, then the food heaped in it,
     then the bowl's front face, whose top edge is the near half of the rim.
     That front face is what hides the bottom of the pile, so the food sits
     IN the bowl instead of behind it. */
  ctx.beginPath(); ctx.ellipse(0, -2, 28, 8, 0, 0, Math.PI * 2);
  fillStroke('#3f8fa8', INK, 3);

  for (let i = 0; i < n; i++) {
    /* a mound: the first few spread across the bottom, the rest stack on top */
    const layer = i < 4 ? 0 : 1;
    const k = layer ? i - 4 : i;
    const across = layer ? Math.min(n - 4, 3) : Math.min(n, 4);
    const x = across > 1 ? (k / (across - 1) - 0.5) * (layer ? 18 : 30) : 0;
    const y = layer ? -11 : -3 - (across > 1 ? Math.cos((k / (across - 1) - 0.5) * Math.PI) * 3 : 2);
    circle(x + Math.sin(seed + i) * 1.5, y, 7.5);
    fillStroke(i % 2 ? '#ffbf6b' : '#ff9d6b', INK, 2.5);
  }

  ctx.beginPath();
  ctx.ellipse(0, -2, 28, 8, 0, 0, Math.PI);          /* near rim, right to left */
  ctx.quadraticCurveTo(-26, 18, 0, 18);
  ctx.quadraticCurveTo(26, 18, 28, -2);
  ctx.closePath();
  fillStroke('#7fd4ea', INK, 4);
  /* a highlight on the bowl's face, clear of the food */
  ctx.beginPath(); ctx.ellipse(0, 5, 21, 7, 0, 0.7, Math.PI - 0.7);
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 3; ctx.stroke();
}

/* The cat, big. Its face is the second tell after the windows: content while
   eating, chomping on a bite, wincing at a clatter, ears flat when seen. */
function drawCatClose(x, y, s) {
  const alert  = g.spot.heat > 0 && !!g.eat;
  const wary   = !alert && warned();
  const smug   = !g.eat && !!linger;
  const chomp  = anim.chomp > 0 ? Math.sin((1 - anim.chomp / 0.22) * Math.PI) : 0;
  const flinch = anim.flinch > 0 ? anim.flinch / 0.35 : 0;
  const breathe = Math.sin(elapsed * 3) * 1.2;

  ctx.save();
  ctx.translate(x - flinch * 16 + (alert ? Math.sin(elapsed * 40) * 1.5 : 0), y);
  ctx.scale(s, s);

  ctx.globalAlpha = 0.35;
  ctx.beginPath(); ctx.ellipse(4, 22, 44, 9, 0, 0, 6.3);
  ctx.fillStyle = '#000'; ctx.fill();
  ctx.globalAlpha = 1;

  /* tail: lazy swish when content, bottle-brush when spotted */
  ctx.beginPath();
  ctx.moveTo(-24, 4);
  if (alert) ctx.quadraticCurveTo(-48, -10, -40, -40);
  else       ctx.quadraticCurveTo(-52, 4 + Math.sin(elapsed * 2.4) * 10, -44, -18 + Math.sin(elapsed * 2.4) * 6);
  ctx.strokeStyle = INK; ctx.lineWidth = alert ? 20 : 14; ctx.lineCap = 'round'; ctx.stroke();
  ctx.strokeStyle = '#5b5884'; ctx.lineWidth = alert ? 14 : 9; ctx.stroke();

  rr(-28, -14 + breathe, 54, 34, 16);
  fillStroke('#5b5884', INK, 4.5);
  /* stripes */
  ctx.strokeStyle = 'rgba(42,27,61,.35)'; ctx.lineWidth = 3;
  for (const sx2 of [-14, -4, 6]) {
    ctx.beginPath(); ctx.moveTo(sx2, -13 + breathe); ctx.lineTo(sx2 + 3, -4 + breathe); ctx.stroke();
  }
  /* front legs */
  rr(10, 8, 9, 14, 4); fillStroke('#5b5884', INK, 3);
  rr(-20, 8, 9, 14, 4); fillStroke('#5b5884', INK, 3);

  /* head: down in the bowl, lifting on each chomp; up and staring when seen */
  const hx = alert ? 20 : 26;
  const hy = alert ? -22 : 4 - chomp * 9 + breathe * 0.4;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(alert ? -0.1 : 0.32 - chomp * 0.2);
  const earBack = alert ? 0.7 : wary ? Math.sin(elapsed * 18) * 0.15 : 0;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 7, -10);
    ctx.rotate(side * earBack);
    ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(0, -14); ctx.lineTo(6, 2); ctx.closePath();
    fillStroke('#5b5884', INK, 3.5);
    ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(0, -8); ctx.lineTo(3, 0); ctx.closePath();
    fillStroke('#ffb0c8', null);
    ctx.restore();
  }
  circle(0, 0, 16); fillStroke('#67648f', INK, 4);
  /* eyes */
  if (alert) {
    circle(-6, -2, 5.4); fillStroke(MINT, INK, 2);
    circle(6, -2, 5.4); fillStroke(MINT, INK, 2);
    ctx.fillStyle = INK; circle(-6, -2, 2.2); ctx.fill(); circle(6, -2, 2.2); ctx.fill();
  } else if (smug) {
    /* licked clean: eyes squeezed shut, very pleased */
    ctx.strokeStyle = MINT; ctx.lineWidth = 2.8;
    ctx.beginPath(); ctx.arc(-6, -1, 4, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    ctx.beginPath(); ctx.arc(6, -1, 4, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  } else if (wary) {
    /* still eating, but one eye on the street */
    circle(-6, -3, 4); fillStroke(MINT, INK, 2);
    circle(6, -3, 4); fillStroke(MINT, INK, 2);
    ctx.fillStyle = INK; circle(-5, -5, 1.8); ctx.fill(); circle(7, -5, 1.8); ctx.fill();
  } else if (flinch > 0) {
    ctx.strokeStyle = MINT; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(-10, -5); ctx.lineTo(-3, -2); ctx.lineTo(-10, 1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, -5); ctx.lineTo(3, -2); ctx.lineTo(10, 1); ctx.stroke();
  } else {
    ctx.strokeStyle = MINT; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.arc(-6, -3, 4, 0.25, 2.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(6, -3, 4, 0.25, 2.9); ctx.stroke();
  }
  circle(0, 4, 2.4); fillStroke('#ffb0c8', null);
  /* mouth: open on the chomp */
  if (chomp > 0.2) {
    ctx.beginPath(); ctx.ellipse(0, 10, 4.5, 2 + chomp * 4, 0, 0, 6.3);
    fillStroke('#3a1830', INK, 2);
  }
  /* whiskers */
  ctx.strokeStyle = 'rgba(255,233,201,.6)'; ctx.lineWidth = 1.4;
  for (const sd of [-1, 1]) for (const dy of [-1, 3]) {
    ctx.beginPath(); ctx.moveTo(sd * 8, 5 + dy * 0.6); ctx.lineTo(sd * 22, 3 + dy * 1.6); ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

/* A soft glow round the screen edge: danger the player feels without
   looking away from the bar. */
function edgeGlow(rgb, strength) {
  const vg = ctx.createRadialGradient(DW / 2, DH / 2, DH * 0.28, DW / 2, DH / 2, DH * 0.72);
  vg.addColorStop(0, 'rgba(' + rgb + ',0)');
  vg.addColorStop(1, 'rgba(' + rgb + ',' + strength.toFixed(2) + ')');
  ctx.fillStyle = vg;
  ctx.fillRect(0, L.hud, DW, DH - L.hud);
}

function drawCloseUp() {
  const e = g.eat || (linger && linger.e);
  if (!e) return;
  const h = e.h, c = closeLayout();
  const alert = g.spot.heat > 0;
  const pulse = 0.5 + 0.5 * Math.sin(elapsed * 14);

  /* backdrop: night sky over the rooftops opposite, pavement under the cat */
  const sky = ctx.createLinearGradient(0, L.hud, 0, c.statusY);
  sky.addColorStop(0, '#24163f'); sky.addColorStop(1, '#3a2560');
  ctx.fillStyle = sky;
  ctx.fillRect(0, L.hud, DW, DH - L.hud);
  ctx.fillStyle = '#2a1d47';
  ctx.fillRect(0, c.winTop + c.frontH, DW, c.rowY2 + 34 - (c.winTop + c.frontH));
  const pave = ctx.createLinearGradient(0, c.rowY2 + 34, 0, DH);
  pave.addColorStop(0, PAVE); pave.addColorStop(1, '#3d3266');
  ctx.fillStyle = pave;
  ctx.fillRect(0, c.rowY2 + 34, DW, DH - (c.rowY2 + 34));
  ctx.strokeStyle = 'rgba(42,27,61,.22)'; ctx.lineWidth = 3;
  for (let x = -40; x < DW; x += 120) {
    ctx.beginPath(); ctx.moveTo(x + 60, c.rowY2 + 34); ctx.lineTo(x, DH); ctx.stroke();
  }

  /* the windows that matter */
  const filled = [false, false, false];
  for (const id of h.neighbours) {
    const n = g.houses[id], slot = slotOf(h, n);
    filled[slot] = true;
    drawFront(h, n, slot, c);
  }
  filled.forEach((f, slot) => { if (!f) drawEmptySlot(slot, c); });

  /* ---- the timing bar, straight under the windows ---- */
  const bx = c.barX, bw = c.barW, bh = c.bh, barY = c.barY;
  rr(bx, barY, bw, bh, bh / 2);
  fillStroke('#241a40', 'rgba(255,233,201,.22)', 3);

  const zx = bx + e.zone * bw, zw = e.zoneW * bw;
  ctx.save();
  rr(bx, barY, bw, bh, bh / 2); ctx.clip();
  const zg = ctx.createLinearGradient(zx, 0, zx + zw, 0);
  zg.addColorStop(0, 'rgba(157,245,200,.5)');
  zg.addColorStop(0.5, 'rgba(157,245,200,.9)');
  zg.addColorStop(1, 'rgba(157,245,200,.5)');
  ctx.fillStyle = zg;
  ctx.fillRect(zx, barY, zw, bh);
  const pw = zw * C.PERFECT_FRAC * 2;
  ctx.fillStyle = 'rgba(255,255,255,' + (0.55 + anim.perfect).toFixed(2) + ')';
  ctx.fillRect(zx + zw / 2 - pw / 2, barY, pw, bh);
  ctx.restore();

  const mx = bx + e.t * bw;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const mg = ctx.createRadialGradient(mx, barY + bh / 2, 2, mx, barY + bh / 2, 56);
  mg.addColorStop(0, 'rgba(255,255,255,.35)'); mg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = mg; circle(mx, barY + bh / 2, 56); ctx.fill();
  ctx.restore();
  rr(mx - 6, barY - 6, 12, bh + 12, 6);
  fillStroke('#fff', INK, 3.5);
  /* the paw rides under the bar, clear of the window labels above */
  if (!alert) {
    const py = barY + bh + 20;
    circle(mx, py, 12); fillStroke('#fff', INK, 3.5);
    for (const [ox, oy] of [[-13, 13], [-4, 19], [5, 19], [14, 13]]) {
      circle(mx + ox * 0.9, py + oy * 0.8, 5); fillStroke('#fff', INK, 2.5);
    }
    circle(mx, py, 5.5); fillStroke('#ffb0c8', null);
  }

  if (e.flashGood > 0) {
    ctx.globalAlpha = Math.min(1, e.flashGood * 3);
    rr(bx, barY, bw, bh, bh / 2); fillStroke(null, MINT, 9);
    ctx.globalAlpha = 1;
  }
  if (e.flashBad > 0) {
    ctx.globalAlpha = Math.min(1, e.flashBad * 2.4);
    rr(bx, barY, bw, bh, bh / 2); fillStroke(null, ALARM, 9);
    ctx.globalAlpha = 1;
  }

  /* spotted: the RUN call goes ON the bar, exactly where the eyes already are */
  if (alert) {
    const nudge = Math.sin(elapsed * 16) * 8;
    rr(bx - 10, barY - 12, bw + 20, bh + 24, (bh + 24) / 2);
    fillStroke('rgba(42,10,20,.9)', ALARM, 5);
    outlined('‹‹  SWIPE SIDEWAYS!  ››', DW / 2 + nudge, barY + bh / 2 - 9, 40, '#fff');
    text(motionSeen ? 'flick left or right \u00b7 or shake' : 'flick left or right to run', DW / 2, barY + bh / 2 + 26, 20,
         '#ffd0d0', 'center', 600);
  } else if (e.cool > 0) {
    text('CLATTER! THE NEIGHBOURS HEARD', DW / 2 - 60, barY - 22, 20, ALARM, 'center', 800);
  }

  /* the one streak badge while eating, lifted clear of the RUN pill when seen
     so STREAK LOST is visible at the moment it happens */
  if (!tut) drawStreak(DW - 48 - 3 * 15 - 8, barY - (alert ? 36 : 24), 'right');

  /* lamplight on the cat */
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const sp = ctx.createRadialGradient(DW / 2, c.catY - 40, 10, DW / 2, c.catY - 40, 260);
  sp.addColorStop(0, 'rgba(255,214,120,.22)'); sp.addColorStop(1, 'rgba(255,214,120,0)');
  ctx.fillStyle = sp; circle(DW / 2, c.catY - 40, 260); ctx.fill();
  ctx.restore();

  const s = clamp(DH / 560, 2.1, 2.9);
  drawCatClose(DW / 2 - 50, c.catY, s);

  ctx.save();
  ctx.translate(c.bowlX, c.catY + 12 * s);
  if (anim.flinch > 0) ctx.rotate(Math.sin(anim.flinch * 60) * 0.12);
  ctx.scale(s * 0.95, s * 0.95);
  bowlShape(h.bowl ? h.bowl.food : 0, h.id);
  ctx.restore();


  for (const cr of crumbs) {
    ctx.globalAlpha = 1 - cr.t / 0.8;
    circle(cr.x, cr.y, cr.r); fillStroke(cr.col, INK, 2);
  }
  ctx.globalAlpha = 1;

  /* the dog is coming: every window on the street is about to fill */
  if (g.dog && g.dog.phase === 'bark') {
    const ty = c.rowY2 + 96;
    rr(40, ty - 40, DW - 80, 80, 26);
    fillStroke('rgba(42,10,20,.9)', ALARM, 4);
    outlined('WOOF! EVERYONE’S COMING TO LOOK', DW / 2, ty, 28, '#fff');
  }

  if (tut || bowlsEaten < HOWTO_BOWLS)
    text('TAP TO BITE \u00b7 SWIPE SIDEWAYS TO RUN', DW / 2, DH - 46, 22,
         'rgba(255,233,201,.55)', 'center', 600);

  /* peripheral warnings, so the bar never has to be abandoned to see them */
  if (alert)         edgeGlow('255,60,60', 0.3 + pulse * 0.22);
  else if (warned()) edgeGlow('255,190,70', 0.3 + (0.5 + 0.5 * Math.sin(elapsed * 6)) * 0.2);
}

/* ---------- banners and screens ---------- */
function drawWaveBanner() {
  if (!banner) return;
  const w = C.WAVES[banner.idx];
  const a = clamp(banner.t > 2.3 ? (2.8 - banner.t) / 0.5 : Math.min(1, banner.t / 0.5), 0, 1);
  ctx.globalAlpha = a;
  if (g.eat || linger) {
    /* Eating: the bar and the windows must stay in sight, so the news goes
       below them, over the cat, as a compact strip. */
    const c = closeLayout(), y = c.rowY2 + 70;
    rr(36, y, DW - 72, 104, 24);
    fillStroke('rgba(18,12,36,.94)', WARM, 3);
    outlined('WAVE ' + (banner.idx + 1) + ' \u00b7 ' + w.name, DW / 2, y + 34, 28, WARM);
    text(C.blurbFor(g.street, banner.idx), DW / 2, y + 72, 20, CREAM, 'center', 500);
    ctx.globalAlpha = 1;
    return;
  }
  const y = DH * 0.34;
  ctx.fillStyle = 'rgba(18,12,36,.94)';
  rr(30, y - 76, DW - 60, 152, 26); ctx.fill();
  ctx.strokeStyle = WARM; ctx.lineWidth = 3;
  rr(30, y - 76, DW - 60, 152, 26); ctx.stroke();
  text('WAVE ' + (banner.idx + 1), DW / 2, y - 42, 23, 'rgba(255,233,201,.6)', 'center', 600);
  outlined(w.name, DW / 2, y - 2, 38, WARM);
  text(C.blurbFor(g.street, banner.idx), DW / 2, y + 44, 22, CREAM, 'center', 500);
  ctx.globalAlpha = 1;
}

function drawCaught() {
  if (!g.caught) return;
  const c = g.caught;
  const loser = g.houses[c.loser];
  const y = DH * 0.3;
  ctx.fillStyle = 'rgba(10,6,20,.55)';
  ctx.fillRect(0, 0, DW, DH);
  ctx.fillStyle = 'rgba(40,14,24,.96)';
  rr(26, y - 94, DW - 52, 188, 26); ctx.fill();
  ctx.strokeStyle = ALARM; ctx.lineWidth = 3.5;
  rr(26, y - 94, DW - 52, 188, 26); ctx.stroke();
  outlined('SPOTTED!', DW / 2, y - 50, 44, ALARM);
  const who = g.houses[c.witness].name;
  text(c.grass ? who + ' told ' + loser.name : who + ' saw you at a neighbour’s bowl',
       DW / 2, y + 2, 24, CREAM, 'center', 500);
  outlined(loser.name.toUpperCase() + ' STOPS FEEDING YOU', DW / 2, y + 52, 25, '#ffd0d0');
}

/* ---------- install ---------- *
 * Android hands the page an install prompt to show on a tap. iPhone has no
 * prompt, only Share > Add to Home Screen, so there the title says how.
 * Neither shows once installed, or inside the Claude app's frame, where a
 * page can't be installed.                                                */
let installPrompt = null;
window.addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); installPrompt = ev; });
window.addEventListener('appinstalled', () => { installPrompt = null; });
const framed = (() => { try { return window.top !== window; } catch (e) { return true; } })();
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function installed() {
  return navigator.standalone === true ||
    (!!window.matchMedia && matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches);
}
function installMode() {
  if (framed || installed()) return null;
  if (installPrompt) return 'prompt';
  return isIOS ? 'ios' : null;
}
function installRect() { return { x: DW / 2 - 190, y: DH - 136, w: 380, h: 72 }; }

function drawInstall() {
  const mode = installMode();
  if (mode === 'prompt') {
    const r = installRect();
    rr(r.x, r.y, r.w, r.h, 36);
    fillStroke('rgba(157,245,200,.14)', MINT, 3.5);
    text('⬇  INSTALL THE GAME', DW / 2, r.y + r.h / 2 + 2, 26, MINT, 'center', 800);
  } else if (mode === 'ios') {
    text('PLAY IT FULL SCREEN', DW / 2, DH - 128, 20, 'rgba(157,245,200,.85)', 'center', 800);
    text('tap Share ↑ in Safari, then “Add to Home Screen”', DW / 2, DH - 98, 20,
         'rgba(255,233,201,.7)', 'center', 500);
  }
}

/* ---------- onboarding ---------- *
 * Nobody reads a rules card. The first launch plays a short practice night
 * instead: one action at a time, a paw showing where, a few words at most,
 * and the rule shown happening before it is ever stated. After that, new
 * things (a curtain, the dog, the fox) are explained once, when they first
 * turn up, rather than all up front.                                       */
function loadJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
}
function saveJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }

let onboarded = loadJSON('bowlbandit.onboarded', false);
const seenHints = loadJSON('bowlbandit.seen', {});
let tut = null;                     /* the practice night, while it runs */
let hint = null;                    /* a one-off explanation in a real round */

const HINTS = {
  stir: ['A curtain’s twitching!', 'Finish your bite, then go'],
  dog:  ['A dog! Everyone comes to look', 'Get off the bowls'],
  fox:  ['A fox! It steals bowls', 'Get there first'],
  streak:     ['Streak \u00d71.5!', 'Don\u2019t get seen and it keeps growing'],
  streakLost: ['Seen! Streak lost', 'Leave when curtains twitch'],
};
function hintOnce(key) {
  if (tut || seenHints[key]) return;
  seenHints[key] = true;
  saveJSON('bowlbandit.seen', seenHints);
  hint = { lines: HINTS[key], t: 3.2 };
}

function startTutorial() {
  C.setPractice(g, true);
  C.start(g);
  C.drainEvents(g);
  banner = null;
  tut = { step: 'tap', t: 0, first: null, watcher: null };
}
function finishTutorial() {
  tut = null;
  onboarded = true;
  saveJSON('bowlbandit.onboarded', true);
  C.setPractice(g, false);
  C.start(g);
  handleEvents();
}
function tutGo(step) { tut.step = step; tut.t = 0; }

/* the house the paw points at: near the cat, never the top row (the coach
   bubble sits there), and not the bowl just eaten */
const catSide = () => g.cat.x > g.street.roadX ? 1 : -1;   /* which side of the road the cat is nearer */
function tutTarget() {
  const any = g.houses.filter(h => h.bowl && !h.angry && h !== tut.first);
  const lower = any.filter(h => h.row > Math.min(...g.houses.map(x => x.row)));
  const ok = lower.length ? lower : any;           /* a one-row street has no lower rows */
  ok.sort((a, b) => Math.abs(C.bowlSpot(a).y - g.cat.y) - Math.abs(C.bowlSpot(b).y - g.cat.y)
                    || (a.side === catSide() ? 0 : 1) - (b.side === catSide() ? 0 : 1));
  return ok[0];
}

/* Runs after every fixed simulation step during the practice night. The core
   owns the practice rules (no clock, slow wide bar, residents only move when
   told); this only scripts which resident twitches, and when. */
function tutStep(dt) {
  if (!tut) return;
  tut.t += dt;
  const e = g.eat;
  /* a bowl is held (the lesson can't end by finishing it) while a neighbour
     is on the move */
  C.practiceHoldBowl(g, tut.step === 'stir' || tut.step === 'seen');

  switch (tut.step) {
    case 'tap':
      if (e) { tut.first = e.h; C.practiceBowl(g, e.h.id, 3); tutGo('bite'); }
      break;
    case 'bite':
      if (!e) tutGo('tap');         /* wandered off: start again */
      break;
    case 'yum':
      if (tut.t > 1.6) tutGo('tap2');
      break;
    case 'tap2':
      if (e) {
        C.practiceBowl(g, e.h.id, 4);
        /* the neighbour across the road, so it's the obvious window */
        tut.watcher = g.houses[e.h.neighbours.find(id => g.houses[id].side !== e.h.side) ?? e.h.neighbours[0]];
        tutGo('eat2');
      }
      break;
    case 'eat2':
      if (!e) { tutGo('tap2'); break; }
      if (tut.t > 1.4 || e.bites > 0) {
        C.practiceResident(g, tut.watcher.id, 'stir');
        tutGo('stir');
      }
      break;
    case 'stir':
    case 'seen':
      if (tut.step === 'stir' && tut.t > 1.8 && e) {
        C.practiceResident(g, tut.watcher.id, 'watch');
        tutGo('seen');
      }
      if (g.scene === 'caught') { tutGo('caughtLesson'); break; }
      if (!e && g.scene === 'play') tutGo(tut.step === 'stir' ? 'early' : 'safe');
      break;
    case 'safe': case 'early': case 'caughtLesson':
      if (tut.watcher) C.practiceResident(g, tut.watcher.id, 'idle');
      if (tut.t > 3.2) tutGo('ready');
      break;
  }
}

function tutEvent(e) {
  if (tut && e.type === 'clear' && tut.step === 'bite') tutGo('yum');
}

/* what the coach says at each step, and where the paw points */
function tutCoach() {
  const s = tut.step;
  const c = closeLayout();
  const front = id => {                             /* centre of a neighbour's window */
    const n = g.houses[id], slot = slotOf(g.eat.h, n);
    return { x: c.slotX(slot), y: c.winTop + c.frontH * 0.45 };
  };
  const houseAt = h => { const r = houseRect(h); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; };
  switch (s) {
    case 'tap':  { const h = tutTarget(); return { lines: ['Hungry?', 'Tap a house'], point: h && !g.cat.target ? houseAt(h) : null }; }
    case 'bite': return { lines: ['Tap when the paw', 'is on the green'], ring: true };
    case 'yum':  return { lines: ['Yum!', 'Bowl licked clean'] };
    case 'tap2': { const h = tutTarget(); return { lines: ['Another one!', 'Tap a house'], point: h && !g.cat.target ? houseAt(h) : null }; }
    case 'eat2': return { lines: ['Keep eating…'] };
    case 'stir': return { lines: ['Uh oh.', 'A curtain’s twitching…'], point: g.eat ? front(tut.watcher.id) : null };
    case 'seen': return { lines: ['They can see you!'], swipe: true };
    case 'safe': return { lines: ['Phew!', 'Neighbours hate you eating', 'someone else’s food'] };
    case 'early': return { lines: ['Good instinct!', 'Neighbours hate you eating', 'someone else’s food'] };
    case 'caughtLesson': return { lines: ['Caught!', 'Now they won’t feed you'] };
    case 'ready': return { lines: ['Keep the whole street', 'feeding you', '2 minutes. Tap to start!'], big: true };
  }
  return null;
}

/* a bubble of a few big words */
function drawCoach(lines, y, alpha) {
  const lh = 40, h = lines.length * lh + 34;
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  rr(36, y, DW - 72, h, 28);
  fillStroke('rgba(20,13,40,.94)', WARM, 3.5);
  lines.forEach((ln, i) => {
    if (i === 0) outlined(ln, DW / 2, y + 17 + lh / 2, 34, WARM);
    else text(ln, DW / 2, y + 17 + lh / 2 + i * lh, 27, CREAM, 'center', 700);
  });
  ctx.globalAlpha = 1;
  return h;
}

/* a paw tapping at a spot, with a pulsing ring */
function drawPointer(x, y) {
  const k = (elapsed * 1.4) % 1;
  ctx.globalAlpha = 1 - k;
  circle(x, y, 26 + k * 46);
  fillStroke(null, MINT, 6);
  ctx.globalAlpha = 1;
  const bob = Math.abs(Math.sin(elapsed * 4.4)) * 14;
  drawPaw(x + 22, y + 26 + bob, 1.4);
}
function drawPaw(x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  circle(0, 0, 13); fillStroke('#fff', INK, 3.5);
  for (const [ox, oy] of [[-13, -13], [-4, -19], [5, -19], [14, -13]]) {
    circle(ox * 0.9, oy * 0.8, 5.5); fillStroke('#fff', INK, 2.5);
  }
  circle(0, 0, 6); fillStroke('#ffb0c8', null);
  ctx.restore();
}

function drawTutorial() {
  if (!tut) return;
  const co = tutCoach();
  if (!co) return;
  const c = closeLayout();
  const inClose = !!g.eat;
  const y = co.big ? DH * 0.36 : inClose ? c.rowY2 + 70 : L.hud + 26;

  if (co.big) { ctx.fillStyle = 'rgba(10,6,20,.7)'; ctx.fillRect(0, 0, DW, DH); }
  if (co.point) drawPointer(co.point.x, co.point.y);
  if (co.ring && g.eat) {
    /* circle the green */
    const e = g.eat, bx = c.barX, bw = c.barW;
    const zx = bx + e.zone * bw, zw = e.zoneW * bw;
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(elapsed * 6);
    rr(zx - 8, c.barY - 8, zw + 16, c.bh + 16, (c.bh + 16) / 2);
    fillStroke(null, MINT, 6);
    ctx.globalAlpha = 1;
  }
  const ch = drawCoach(co.lines, y);
  if (co.swipe) {
    /* a paw sweeping across under the bubble, over and over */
    const k = (elapsed * 0.9) % 1;
    ctx.globalAlpha = Math.sin(k * Math.PI);
    drawPaw(lerp(DW * 0.22, DW * 0.78, k), y + ch + 48, 1.7);
    ctx.globalAlpha = 1;
  }

  /* a way out, for anyone who already knows */
  const r = skipRect();
  rr(r.x, r.y, r.w, r.h, r.h / 2);
  fillStroke('rgba(255,233,201,.1)', 'rgba(255,233,201,.35)', 2.5);
  text('SKIP ›', r.x + r.w / 2, r.y + r.h / 2 + 1, 20, CREAM, 'center', 800);
}
function skipRect() { return { x: 16, y: 90, w: 116, h: 36 }; }

function drawHint() {
  if (!hint || tut || banner || g.scene !== 'play') return;
  const a = clamp(Math.min(hint.t / 0.4, (3.2 - hint.t) / 0.25), 0, 1);
  const y = g.eat ? closeLayout().rowY2 + 70 : L.hud + 26;
  drawCoach(hint.lines, y, a);
}

/* ---------- poking a window ---------- *
 * Players tap the windows to see what they do. They used to count as bites,
 * so curiosity clattered the bowl. Now a poke makes the window wobble and
 * says, in a few words, what it means.                                     */
let poke = null;
function frontAt(p) {
  if (!g.eat) return null;
  const c = closeLayout();
  for (const id of g.eat.h.neighbours) {
    const slot = slotOf(g.eat.h, g.houses[id]);
    const cx = c.slotX(slot);
    if (p.x > cx - c.frontW / 2 && p.x < cx + c.frontW / 2 && p.y > c.winTop - 46 && p.y < c.statusY + 28) return id;
  }
  return null;
}
/* the strip the windows sit in never takes a bite */
function inWindowBand(p) {
  const c = closeLayout();
  return p.y > L.hud && p.y < c.statusY + 28;
}
function pokeSays(n) {
  if (n.angry) return n.state === 'watch' ? ['They’ll tell on you!', 'Run!'] : ['Already cross', 'They’ll tell if they see you'];
  if (n.state === 'watch') return ['They can see you!', 'Swipe sideways to run'];
  if (n.state === 'stir')  return ['Curtain’s twitching!', 'Finish up and go'];
  return ['Asleep', 'Safe for now'];
}
function drawPoke() {
  if (!poke || !g.eat) return;
  const n = g.houses[poke.id];
  if (!g.eat.h.neighbours.includes(n.id)) { poke = null; return; }
  const c = closeLayout();
  const slot = slotOf(g.eat.h, n);
  const cx = clamp(c.slotX(slot), 170, DW - 170);
  const [a, b] = pokeSays(n);
  const al = clamp(poke.t / 0.3, 0, 1);
  ctx.globalAlpha = al;
  const y = c.winTop + c.frontH * 0.62;
  rr(cx - 160, y - 40, 320, 84, 22);
  fillStroke('rgba(20,13,40,.96)', n.state === 'watch' ? ALARM : WARM, 3.5);
  text(a, cx, y - 14, 25, n.state === 'watch' ? ALARM : WARM, 'center', 800);
  text(b, cx, y + 18, 20, CREAM, 'center', 600);
  ctx.globalAlpha = 1;
}

/* ---------- build stamp ---------- *
 * Which build is running, so a tester can tell an update has landed. Read
 * from src/version.js (written by tools/stamp-build.sh), and shown in the
 * phone's own time zone. With the offline cache this is the copy actually
 * running, which can be one launch behind the newest push. */
function buildLabel() {
  const b = window.BOWL_BUILD;
  if (!b) return null;
  const d = new Date(b.time);
  if (isNaN(d)) return null;
  const when = d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const branch = b.branch && b.branch !== 'main' ? ' \u00b7 ' + b.branch.replace(/^claude\//, '') : '';
  return 'Build ' + when + branch;
}
/* high enough to clear a phone's gesture bar in full-screen mode */
function drawBuild() {
  if (updateReady) {
    text('Update ready \u00b7 it loads when you tap', DW / 2, DH - 44, 19, MINT, 'center', 700);
    return;
  }
  const s = buildLabel();
  if (s) text(s, DW / 2, DH - 44, 17, 'rgba(255,233,201,.45)', 'center', 600);
}

/* ---------- picking up new builds ---------- *
 * An installed app is usually resumed rather than restarted, so it can keep
 * running an old build long after a new one is pushed. Whenever the game is
 * opened or brought back, it asks the server for the current build stamp.
 * If it has changed: on the title screen it reloads at once; anywhere else it
 * waits for the next PLAY, so it never cuts into a round or skips results. */
let updateReady = false;
const canUpdate = !framed && /^https?:/.test(location.protocol);
async function checkForUpdate() {
  if (!canUpdate || !window.BOWL_BUILD) return;
  try {
    const res = await fetch('src/version.js?check=' + Date.now(), { cache: 'no-store' });
    const m = (await res.text()).match(/time: '([^']+)'/);
    if (m && m[1] !== window.BOWL_BUILD.time) {
      updateReady = m[1];
      if (g.scene === 'title') loadUpdate(false);
    }
  } catch (e) { /* offline: keep playing what we have */ }
}

/* A plain reload can still take the game's scripts from the browser's cache,
   in which case the stamp never changes and the title screen would reload
   forever. So refresh every file first, and reload on our own at most once
   per new build; if that didn't take, wait for the player's tap. */
const GAME_FILES = ['mobile.html', 'src/version.js', 'src/core.js', 'src/game.js', 'src/style.css'];
async function loadUpdate(byTap) {
  const stamp = updateReady;
  let tried = null;
  try { tried = sessionStorage.getItem('bowlbandit.reloadedFor'); } catch (e) {}
  if (!byTap && tried === stamp) return;
  try { sessionStorage.setItem('bowlbandit.reloadedFor', stamp); } catch (e) {}
  try { await Promise.all(GAME_FILES.map(u => fetch(u, { cache: 'reload' }))); } catch (e) {}
  location.reload();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
setTimeout(checkForUpdate, 1500);

/* ---------- title ---------- */
function playRect() { return { x: DW / 2 - 180, y: DH * 0.6, w: 360, h: 108 }; }
function howRect()  { const p = playRect(); return { x: DW / 2 - 150, y: p.y + p.h + 30, w: 300, h: 60 }; }

/* The street picker: one row per street, under the tagline. Only after the
   first-launch lesson, which is always on Marrow Street. */
const STREET_ROW = { w: 600, h: 84, gap: 14 };
const pickerOn = () => onboarded && C.STREETS.length > 1;
function streetRect(i) {
  const r = STREET_ROW;
  return { x: DW / 2 - r.w / 2, y: DH * 0.45 + i * (r.h + r.gap), w: r.w, h: r.h };
}
function drawStreetPicker() {
  C.STREETS.forEach((st, i) => {
    const r = streetRect(i), open = C.isUnlocked(st, bests), on = st === g.street || st.id === g.street.id;
    rr(r.x, r.y, r.w, r.h, 22);
    fillStroke(on ? 'rgba(255,233,201,.16)' : 'rgba(18,12,36,.55)', on ? WARM : 'rgba(255,233,201,.22)', on ? 4 : 2.5);
    const b = bests[st.id] || 0;
    text(st.name, r.x + 28, r.y + (open ? 31 : 36), 30, open ? CREAM : 'rgba(255,233,201,.45)', 'left', 700);
    if (open) text(b ? 'BEST ' + b + ' · ' + C.rankFor(b, st) : 'not played yet', r.x + 28, r.y + 62, 21, 'rgba(255,233,201,.6)', 'left', 600);
    else      text(C.unlockHint(st), r.x + 28, r.y + 64, 20, 'rgba(255,233,201,.5)', 'left', 600);
    if (!open) text('LOCKED', r.x + r.w - 28, r.y + r.h / 2, 21, 'rgba(255,233,201,.4)', 'right', 800);
    else if (on) text('✓', r.x + r.w - 30, r.y + r.h / 2, 34, MINT, 'right', 800);
  });
}
/* Swap the game to another street, between rounds. */
function selectStreet(st) {
  C.setStreet(g, st);
  vis.length = 0;
  for (let i = 0; i < g.houses.length; i++) vis.push({ glow: 0, curtain: 0, shake: 0, pop: 0 });
  layout();
  best = bests[streetKey()] || 0;
  banner = null;
  if (st.id) saveJSON('bowlbandit.street', st.id);
}

function drawTitle() {
  ctx.fillStyle = 'rgba(10,6,20,.78)';
  ctx.fillRect(0, 0, DW, DH);

  const y = DH * 0.25;
  outlined('BOWL', DW / 2, y, 104, WARM);
  outlined('BANDIT', DW / 2, y + 94, 104, '#ff9ecd');

  text('Every house feeds you.', DW / 2, y + 196, 32, CREAM, 'center', 700);
  text('Don’t get caught.', DW / 2, y + 240, 32, CREAM, 'center', 700);

  const p = playRect();
  const pulse = 1 + Math.sin(elapsed * 3) * 0.03;
  ctx.save();
  ctx.translate(p.x + p.w / 2, p.y + p.h / 2); ctx.scale(pulse, pulse);
  rr(-p.w / 2, -p.h / 2, p.w, p.h, p.h / 2);
  fillStroke(MINT, INK, 5);
  outlined('PLAY', 0, 3, 54, '#fff');
  ctx.restore();

  const hr = howRect();
  text('How to play', DW / 2, hr.y + hr.h / 2, 25, 'rgba(255,233,201,.75)', 'center', 700);
  ctx.fillStyle = 'rgba(255,233,201,.4)';
  ctx.fillRect(DW / 2 - 70, hr.y + hr.h / 2 + 18, 140, 2);

  if (pickerOn()) drawStreetPicker();
  else if (best > 0) text('BEST ' + best + ' · ' + C.rankFor(best, g.street), DW / 2, hr.y + hr.h + 34, 22,
                          'rgba(255,233,201,.5)', 'center', 600);
  drawInstall();
  drawBuild();
}

/* ---------- results ---------- *
 * Revealed in order: the score counts up, then your rank lands, then the
 * street shows who is still feeding you. Taps are ignored until it has all
 * landed, so the bite you were mashing when the whistle went can't skip it. */
const OVER_LOCK = 1.8;
let overAt = -99, rankRung = false;

const NUMBER_WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
function drawStreetMap(cx, top, rowH) {
  const hw = 92, hh = rowH - 12, road = 64;
  ctx.fillStyle = ROAD;
  const rows = g.street.rows;
  rr(cx - road / 2, top - 8, road, rowH * rows + 16, 10); ctx.fill();
  ctx.strokeStyle = 'rgba(255,233,201,.28)'; ctx.lineWidth = 4; ctx.setLineDash([12, 12]);
  ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx, top + rowH * rows); ctx.stroke();
  ctx.setLineDash([]);
  for (const h of g.houses) {
    const x = onLeft(h) ? cx - road / 2 - 10 - hw : cx + road / 2 + 10;
    const y = top + h.row * rowH + 6;
    /* each house pops in, one after another */
    const t = clamp((elapsed - overAt - 1.0 - h.id * 0.06) / 0.25, 0, 1);
    if (t <= 0) continue;
    if (h.venue) {                               /* the pub: a plain block over its rows, nothing to keep */
      const vh = rowH * h.venue.span - 12, vy = top + h.row * rowH + 6;
      ctx.save(); ctx.translate(x + hw / 2, vy + vh / 2); ctx.scale(t, t);
      rr(-hw / 2, -vh / 2, hw, vh, 9); fillStroke('#5a3a3a', INK, 3.5);
      text('PUB', 0, 0, 20, 'rgba(255,233,201,.7)', 'center', 800);
      ctx.restore();
      continue;
    }
    ctx.save();
    ctx.translate(x + hw / 2, y + hh / 2);
    ctx.scale(t, t);
    rr(-hw / 2, -hh / 2, hw, hh, 9);
    fillStroke(h.angry ? '#4a4065' : TINT[h.id % TINT.length].wall, INK, 3.5);
    if (h.angry) {
      ctx.strokeStyle = '#7a6442'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(-hw / 2 + 10, -6); ctx.lineTo(hw / 2 - 10, 2); ctx.stroke();
      text('✕', 0, 0, 22, ALARM, 'center', 800);
    } else {
      circle(0, 0, 13); fillStroke('rgba(42,27,61,.25)', null);
      text('✓', 0, 1, 22, INK, 'center', 800);
    }
    ctx.restore();
  }
}

/* "Choose a street" on the results, once there is a choice to make */
let chooseY = 0;
const canChoose = () => onboarded && C.STREETS.filter(st => C.isUnlocked(st, bests)).length > 1;
const chooseRect = () => ({ x: DW / 2 - 160, y: chooseY - 28, w: 320, h: 56 });

function drawOver() {
  const t = elapsed - overAt;
  /* solid: the street behind would only be noise under the numbers */
  const bg = ctx.createLinearGradient(0, 0, 0, DH);
  bg.addColorStop(0, '#1c1233'); bg.addColorStop(1, '#0f0a1e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, DW, DH);

  const homes = g.houses.filter(h => !h.venue), kept = homes.filter(h => !h.angry).length;
  const food = g.score - g.keptBonus;
  const tight = DH < 1300;                       /* shorter phones: tighten the map */
  let y = tight ? 84 : 112;

  outlined(kept === 0 ? 'RUN OFF THE STREET' : 'CARRIED HOME', DW / 2, y, kept === 0 ? 40 : 46,
           kept === 0 ? ALARM : WARM);

  /* score counts up */
  const k = clamp((t - 0.25) / 1.0, 0, 1);
  const shown = Math.round(g.score * (1 - Math.pow(1 - k, 3)));
  y += tight ? 96 : 116;
  outlined(String(shown), DW / 2, y, tight ? 96 : 116, MINT);
  y += tight ? 62 : 74;
  text('POINTS', DW / 2, y, 22, 'rgba(255,233,201,.55)', 'center', 700);

  /* the rank lands with a bump */
  y += tight ? 52 : 62;
  if (t > 1.15) {
    if (!rankRung) { rankRung = true; Sfx.clear(); }
    const pop = clamp((t - 1.15) / 0.2, 0, 1);
    const sc = 1 + (1 - pop) * 0.6;
    ctx.save(); ctx.translate(DW / 2, y); ctx.scale(sc, sc);
    ctx.globalAlpha = pop;
    outlined('— ' + C.rankFor(g.score, g.street).toUpperCase() + ' —', 0, 0, 38, WARM);
    ctx.restore();
  }

  /* who still feeds you, laid out like the street */
  y += tight ? 42 : 56;
  /* tuned for four rows: a taller street's rows shrink to take the same height */
  const rowH = (tight ? 44 : 54) * Math.min(1, 4 / g.street.rows);
  drawStreetMap(DW / 2, y, rowH);
  y += rowH * g.street.rows + (tight ? 30 : 40);
  const total = homes.length;
  text(kept === total ? 'ALL ' + (NUMBER_WORDS[total] || total).toUpperCase() + ' STILL FEED YOU' : kept + ' OF ' + total + ' STILL FEED YOU', DW / 2, y, 22,
       kept ? MINT : ALARM, 'center', 800);

  /* the working */
  y += tight ? 34 : 44;
  const lines = [
    ['Bowls licked clean', String(g.bowlsCleared)],
    ['Bites', g.bites + (g.perfects ? '  (' + g.perfects + ' perfect)' : '')],
    ['Best streak', '\u00d7' + g.bestMult, g.bestMult > 1 ? WARM : CREAM],
  ];
  if (g.misses)      lines.push(['Clatters', String(g.misses), '#ffb38f']);
  if (g.timesCaught) lines.push(['Times spotted', String(g.timesCaught), ALARM]);
  if (g.foxLosses)   lines.push(['Lost to the fox', String(g.foxLosses), '#ff9d6b']);
  lines.push(['Points from food', String(food)]);
  lines.push(['Still feeding you', kept + ' × ' + C.KEPT_BONUS + ' = ' + g.keptBonus, kept ? MINT : ALARM]);

  const lh = tight ? 38 : 44;
  const cardH = lines.length * lh + 28;
  ctx.fillStyle = 'rgba(30,20,56,.95)';
  rr(48, y, DW - 96, cardH, 24); ctx.fill();
  lines.forEach((ln, i) => {
    const ly = y + 14 + lh / 2 + i * lh;
    text(ln[0], 80, ly, 22, 'rgba(255,233,201,.7)', 'left', 500);
    text(ln[1], DW - 80, ly, 23, ln[2] || CREAM, 'right', 700);
  });
  y += cardH + (tight ? 36 : 48);

  if (newBest) outlined('NEW BEST!', DW / 2, y, 30, MINT);
  else if (best > 0) text('BEST ' + best + ' · ' + C.rankFor(best, g.street), DW / 2, y, 22, 'rgba(255,233,201,.55)', 'center', 600);

  if (newStreets.length) {
    y += 38;
    outlined('NEW STREET: ' + newStreets.map(st => st.name.toUpperCase()).join(' + '), DW / 2, y, 26, WARM);
  }

  if (t > OVER_LOCK) {
    const multi = canChoose();
    const py = Math.min(DH - (multi ? 150 : 74), y + (tight ? 56 : 76));
    ctx.globalAlpha = clamp((t - OVER_LOCK) / 0.4, 0, 1);
    ctx.globalAlpha *= 0.72 + 0.28 * Math.sin(elapsed * 3);
    outlined('TAP TO PROWL AGAIN', DW / 2, py, 36, CREAM);
    ctx.globalAlpha = clamp((t - OVER_LOCK) / 0.4, 0, 1);
    if (multi) {
      chooseY = py + 66;
      const r = chooseRect();
      rr(r.x, r.y, r.w, r.h, r.h / 2);
      fillStroke('rgba(255,233,201,.1)', 'rgba(255,233,201,.45)', 2.5);
      text('Choose a street', DW / 2, r.y + r.h / 2, 24, 'rgba(255,233,201,.85)', 'center', 700);
    }
    ctx.globalAlpha = 1;
  }
  drawBuild();
}

/* ---------- frame ---------- */
function draw() {
  ctx.save();
  if (shake > 0) ctx.translate(rand(-1, 1) * shake * 14, rand(-1, 1) * shake * 14);

  ctx.save();
  pickupCamera();
  drawStreet();
  /* lamps stand on row boundaries (bowls are mid-row), a quarter and three
     quarters of the way down, so they never sit on a bowl */
  const rows = g.street.rows, boundary = f => clamp(Math.round(rows * f), 1, rows - 1);
  drawLamp(L.roadL + 14, sy(boundary(0.25)), 1);
  drawLamp(L.roadR - 14, sy(boundary(0.75)), -1);

  for (const h of g.houses) drawHouse(h);
  for (const h of g.houses) drawBowl(h);

  drawFox();
  /* once the owner has hold of the cat, drawOwner draws it in their arms */
  const held = g.pickup && pickupPlan().lift > 0;
  if (!held) {
    const face = g.pickup ? (pickupPlan().ox > sx(g.cat.x) ? 1 : -1) : g.cat.face;
    drawCat(sx(g.cat.x), sy(g.cat.y), face, !!g.eat);
  }
  drawDog();
  drawOwner();
  drawFloaters('street');
  ctx.restore();

  /* the street's light: a wash over everything, top to bottom */
  if (LOOK.wash) {
    const wg = ctx.createLinearGradient(0, 0, 0, DH);
    wg.addColorStop(0, LOOK.wash[0]); wg.addColorStop(1, LOOK.wash[1]);
    ctx.fillStyle = wg;
    ctx.fillRect(0, 0, DW, DH);
  }

  /* vignette, to push the eye down the middle of the street */
  const vg = ctx.createRadialGradient(DW / 2, DH / 2, DH * 0.3, DW / 2, DH / 2, DH * 0.74);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,' + LOOK.vignette + ')');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, DW, DH);

  drawCloseUp();
  if (g.eat || linger) drawFloaters('close');
  drawPoke();
  drawHud();
  drawWaveBanner();
  drawHint();
  drawTutorial();
  if (g.scene === 'caught' && !tut) drawCaught();
  if (g.scene === 'title')  drawTitle();
  if (g.scene === 'over')   drawOver();

  if (flash > 0) {
    ctx.globalAlpha = flash * 0.5;
    ctx.fillStyle = ALARM;
    ctx.fillRect(0, 0, DW, DH);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/* ---------- input ---------- */
function toDesign(ev) {
  const r = cv.getBoundingClientRect();
  return {
    x: (ev.clientX - r.left) / r.width * DW,
    y: (ev.clientY - r.top) / r.height * DH,
  };
}
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/* Getting off the bowl. A swipe or a shake both end here. */
function bolt() {
  if (g.scene !== 'play' || !g.eat) return;
  const dir = g.cat.x < g.street.roadX ? 1 : -1;
  C.tapRoad(g, g.street.roadX + dir * 0.12, g.cat.y);
  Sfx.tone(700, 0.12, 'triangle', 0.1, 1200);
}

/* While eating, a touch is either a bite or the start of a swipe, and we
   can't know which until the finger moves or lifts. So the bite is held
   for a moment but judged where the marker was when the finger LANDED:
   the wait never costs the player their timing. */
let press = null;
const SWIPE = 46;                   /* design units of travel that make a swipe */
const HOLD  = 0.09;                 /* seconds before an unmoved touch counts as a bite */

function biteFromPress() {
  if (!press || press.bitten || !g.eat) return;
  press.bitten = true;
  if (press.kind === 'look') {
    if (press.front != null) { poke = { id: press.front, t: 1.9 }; Sfx.tap(); }
    return;
  }
  lastBiteT = press.t;
  eatSnap = g.eat;
  C.tapEat(g, press.t);
  handleEvents();
}

function onDown(ev) {
  ev.preventDefault();
  Sfx.boot();
  const p = toDesign(ev);

  if (!g.eat && inside(p, muteRect())) { Sfx.muted = !Sfx.muted; return; }

  if (g.scene === 'over' && elapsed - overAt < OVER_LOCK) return;
  if (g.scene === 'title' && installMode() === 'prompt' && inside(p, installRect())) {
    const ip = installPrompt;
    ip.prompt();
    ip.userChoice.finally(() => { installPrompt = null; });
    return;
  }
  if ((g.scene === 'title' || g.scene === 'over') && updateReady) { loadUpdate(true); return; }
  if (g.scene === 'title') {
    askForMotion();
    if (pickerOn()) {
      const i = C.STREETS.findIndex((st, i) => inside(p, streetRect(i)));
      if (i >= 0) { if (C.isUnlocked(C.STREETS[i], bests) && C.STREETS[i].id !== g.street.id) selectStreet(C.STREETS[i]); Sfx.tap(); return; }
    }
    if (inside(p, howRect()) || !onboarded) startTutorial();
    else { C.start(g); handleEvents(); }
    return;
  }
  if (g.scene === 'over') {
    if (canChoose() && inside(p, chooseRect())) { C.toTitle(g); newStreets = []; Sfx.tap(); return; }
    C.start(g); handleEvents(); return;
  }

  if (tut) {
    if (inside(p, skipRect()) || tut.step === 'ready') { finishTutorial(); return; }
    /* while the coach is talking, taps wait */
    if (['yum', 'safe', 'early', 'caughtLesson'].includes(tut.step)) return;
  }
  if (g.scene !== 'play') return;
  if (linger && !g.eat) return;     /* the close-up is still up: the street isn't on screen */

  if (g.eat) {
    if (press) biteFromPress();      /* a second finger: settle the first */
    /* the window strip pokes, never bites; a swipe from anywhere still runs */
    const kind = inWindowBand(p) ? 'look' : 'bite';
    press = { x: p.x, y: p.y, t: g.eat.t, at: performance.now(), bitten: false, kind, front: frontAt(p) };
    try { cv.setPointerCapture(ev.pointerId); } catch (e) {}
    return;
  }

  if (p.y < L.hud || p.y > L.bot) return;
  const hit = g.houses.find(h => !h.venue && inside(p, houseRect(h)));
  if (hit) C.tapHouse(g, hit.id);
  else     C.tapRoad(g, p.x / DW, (p.y - L.top) / L.rowH);
  Sfx.tap();
}

/* A finger that travels far enough is a run, whether it moved at once (no
   bite taken) or slowly after the bite already landed. */
/* Only a sideways flick runs. Vertical swipes belong to the phone (home from
   the bottom edge, closing the app's sheet from the top), and the game can't
   stop the phone taking them, so it doesn't ask the player to make one. */
function onMove(ev) {
  if (!press) return;
  const p = toDesign(ev);
  const dx = Math.abs(p.x - press.x), dy = Math.abs(p.y - press.y);
  if (dx > SWIPE && dx > dy * 1.3) { press = null; bolt(); }
}

function onUp() { biteFromPress(); press = null; }

/* Shake to run, where the phone will tell us about motion. iOS asks the
   player first, and only from a tap, so the ask rides on "tap to prowl". */
function askForMotion() {
  const DM = window.DeviceMotionEvent;
  if (DM && typeof DM.requestPermission === 'function') DM.requestPermission().catch(() => {});
}
let lastJolt = 0;
window.addEventListener('devicemotion', ev => {
  const a = ev.acceleration;
  if (!a || a.x == null) return;
  motionSeen = true;
  /* two hard jolts close together: a deliberate shake, not a firm tap */
  if (Math.hypot(a.x, a.y, a.z) < 17) return;
  const now = performance.now();
  if (now - lastJolt < 450) { lastJolt = 0; bolt(); }
  else lastJolt = now;
});

cv.addEventListener('pointerdown', onDown, { passive: false });
cv.addEventListener('pointermove', onMove);
cv.addEventListener('pointerup', onUp);
/* the phone took the gesture over: drop the touch rather than biting with it */
cv.addEventListener('pointercancel', () => { press = null; });
cv.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => setTimeout(fit, 120));

/* ---------- loop ---------- */
const STEP = 1 / 120;               /* fixed timestep: the bite window must not
                                       depend on the phone's frame rate */
let last = 0, acc = 0;
/* ?manual (tests only): no animation timer; the test steps frames itself
   with __bb.advance(), so every run sees exactly the same frames */
const MANUAL = /[?&]manual\b/.test(location.search);
function frame(ts) {
  if (!last) last = ts;
  let dt = (ts - last) / 1000;
  last = ts;
  if (dt > 0.25) dt = 0.25;         /* tab was backgrounded; don't fast-forward */
  acc += dt;
  while (acc >= STEP) { C.update(g, STEP); tutStep(STEP); acc -= STEP; }
  if (press && !press.bitten && performance.now() - press.at >= HOLD * 1000) biteFromPress();
  handleEvents();
  updateVisuals(dt);
  draw();
  if (!MANUAL) requestAnimationFrame(frame);
}

/* Start on the street the player last chose, if it is still open to them. */
{
  const saved = C.streetById(loadJSON('bowlbandit.street', null));
  if (saved && onboarded && !(DEBUG && window.__bbStreet) && saved !== g.street && C.isUnlocked(saved, bests)) selectStreet(saved);
}

fit();
if (!MANUAL) requestAnimationFrame(frame);
let manualT = 0;
function advance(secs) {
  for (let i = 0; i < Math.round(secs * 60); i++) { manualT += 1000 / 60; frame(manualT); }
}

/* ?debug exposes the game to the console, for setting up a scene by hand */
if (DEBUG) window.__bb = { g, C, tut: () => tut, checkForUpdate, updateReady: () => updateReady, advance };

/* Keep a published page's best score across a republish, where the host
   supports it. */
if (window.claude && window.claude.hot) {
  window.claude.hot.snapshot(() => ({ best, bests }));
}

})();
