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
const NIGHT    = '#191030';
const ROAD     = '#3d2f5e';
const ROAD_2   = '#4a3a70';
const PAVE     = '#6b5c93';
const PAVE_LIP = '#8576b4';
const GRASS    = '#3f6b4e';
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
 * A ribbon of road down the middle, a pavement either side carrying the bowls,
 * then a front garden and the house itself. The two columns of houses land
 * exactly where the core's grid says they are.                              */
const L = {};
function layout() {
  L.hud    = 132;
  L.footer = 24;
  L.paveW  = 44;
  L.roadL  = 232;
  L.roadR  = DW - 232;
  L.bodyW  = 150;
  L.top    = L.hud;
  L.bot    = DH - L.footer;
  L.rowH   = (L.bot - L.top) / C.ROWS;
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
const bowlX = h => sx(C.BOWL_X[h.col]);
const rowY  = h => L.top + (h.row + 0.5) * L.rowH;

/* the house's whole strip, garden included: all of it is one tap target */
function houseRect(h) {
  const y = rowY(h) - L.rowH / 2;
  return h.col === 0
    ? { x: 0, y, w: L.roadL, h: L.rowH }
    : { x: L.roadR, y, w: DW - L.roadR, h: L.rowH };
}
/* the building itself */
function bodyRect(h) {
  const cy = rowY(h);
  const x = h.col === 0 ? 12 : DW - 12 - L.bodyW;
  return { x, y: cy - L.bodyH / 2, w: L.bodyW, h: L.bodyH };
}
/* where the garden meets the pavement -- the fence line */
function fenceX(col) {
  return col === 0 ? L.roadL - L.paveW : L.roadR + L.paveW;
}

/* ---------- game + presentation state ---------- */
const g = C.create();
const vis = [];                     /* eased per-house visuals */
for (let i = 0; i < C.HOUSES; i++) vis.push({ glow: 0, curtain: 0, shake: 0, pop: 0 });

let floaters = [];
let shake = 0, flash = 0, elapsed = 0;
let banner = null;                  /* wave announcement */
let best = 0;
try { best = parseInt(localStorage.getItem('bowlbandit.best') || '0', 10) || 0; } catch (e) {}

function floater(x, y, str, colour, layer) {
  floaters.push({ x, y, str, colour, t: 0, layer: layer || 'street' });
}
let motionSeen = false;             /* a shake has a chance of working here */
let wasSpotted = false;
/* Haptics where the phone allows it (not iOS Safari); silently nothing elsewhere. */
function buzz(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {} }

/* ---------- events from the core ---------- */
function handleEvents() {
  for (const e of C.drainEvents(g)) {
    const h = e.house != null ? g.houses[e.house] : null;
    switch (e.type) {
      case 'bite': {
        Sfx.bite(); vis[h.id].pop = 0.22;
        anim.chomp = 0.22;
        const c = closeLayout();
        /* pop the score off the marker: that is where the eyes are */
        const popX = g.eat ? 48 + g.eat.t * (DW - 96) : DW / 2;
        if (e.perfect) {
          anim.perfect = 0.45;
          Sfx.tone(1180, 0.08, 'triangle', 0.1, 1500, 0.04);
          floater(clamp(popX, 120, DW - 120), c.barY + c.bh / 2, 'PERFECT +' + e.points, MINT, 'close');
        } else {
          floater(clamp(popX, 120, DW - 120), c.barY + c.bh / 2, '+' + e.points, WARM, 'close');
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
        break;
      case 'clear':
        Sfx.clear();
        floater(bowlX(h), rowY(h) - 70, 'CLEARED +25', MINT);
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
        } else Sfx.stir();
        break;
      case 'bark': Sfx.bark(); break;
      case 'call': Sfx.call(); break;
      case 'caught': {
        Sfx.caught(); shake = 0.5; flash = 0.6;
        const l = g.houses[e.loser];
        floater(bowlX(l), rowY(l) - 70, 'NO MORE BOWLS', ALARM);
        break;
      }
      case 'wave':
        if (e.idx > 0) Sfx.waveUp();
        banner = { t: 2.8, idx: e.idx };
        break;
      case 'over':
        Sfx.over();
        if (g.score > best) {
          best = g.score;
          try { localStorage.setItem('bowlbandit.best', String(best)); } catch (err) {}
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
  if (!g.eat) crumbs = [];
  for (const f of floaters) f.t += dt;
  floaters = floaters.filter(f => f.t < 1.3);
  if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }

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
    const wantGlow    = h.state === 'watch' ? 1 : h.state === 'stir' ? 0.5 : 0;
    const wantCurtain = h.state === 'watch' ? 1 : h.state === 'stir' ? 0.5 : 0;
    v.glow    = lerp(v.glow, wantGlow, dt * 7);
    v.curtain = lerp(v.curtain, wantCurtain, dt * 8);
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
  ctx.beginPath(); ctx.moveTo(DW / 2, L.top); ctx.lineTo(DW / 2, L.bot); ctx.stroke();
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
  const py = L.top + L.rowH * 2.74;
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.beginPath(); ctx.ellipse(L.roadR - 62, py, 46, 24, 0, 0, 6.3);
  ctx.fillStyle = '#6a5ba0'; ctx.fill();
  ctx.globalAlpha = 0.28;
  ctx.beginPath(); ctx.ellipse(L.roadR - 62, py + 3, 30, 12, 0, 0, 6.3);
  ctx.fillStyle = '#cfe6ff'; ctx.fill();
  ctx.restore();
}

/* Lamps stand on the kerb between rows, so they light the bowls without
   sitting on top of one. */
function drawLamp(x, y, dir) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createRadialGradient(x + dir * 40, y, 8, x + dir * 40, y, 190);
  grad.addColorStop(0, 'rgba(255,214,120,.26)');
  grad.addColorStop(1, 'rgba(255,214,120,0)');
  ctx.fillStyle = grad;
  circle(x + dir * 40, y, 190); ctx.fill();
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
  const x = fenceX(h.col);
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

function drawHouse(h) {
  const v = vis[h.id];
  const t = TINT[h.id];
  const dull = h.angry;
  const b = bodyRect(h);
  const dir = h.col === 0 ? 1 : -1;                      /* towards the road */
  const faceW = 70;                                      /* visible facade depth */
  const faceX = h.col === 0 ? b.x + b.w - faceW : b.x;
  const roadEdge = h.col === 0 ? b.x + b.w : b.x;
  const roofX = h.col === 0 ? b.x : b.x + faceW;
  const roofW = b.w - faceW;

  /* garden between the house and the pavement */
  const gx = h.col === 0 ? b.x + b.w : fenceX(1);
  const gw = h.col === 0 ? fenceX(0) - (b.x + b.w) : b.x - fenceX(1);
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
  ctx.fillRect(h.col === 0 ? roofX + roofW / 2 : roofX, b.y, roofW / 2, b.h);
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
    h.col === 0 ? faceX : faceX + faceW, 0, h.col === 0 ? faceX + 16 : faceX + faceW - 16, 0);
  eaveG.addColorStop(0, 'rgba(0,0,0,.3)');
  eaveG.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = eaveG;
  ctx.fillRect(h.col === 0 ? faceX : faceX + faceW - 16, b.y, 16, b.h);
  ctx.restore();

  rr(b.x, b.y, b.w, b.h, 12); fillStroke(null, INK, 4.5);

  /* chimney, on some houses only, so the row isn't uniform */
  if (hash(h.id, 3) > 0.4) {
    const cx2 = roofX + roofW * (h.col === 0 ? 0.26 : 0.74);
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
  circle(doorX + (h.col === 0 ? dw - 9 : 9), doorY + dh / 2, 3.5);
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

  /* food, stacked so a full bowl reads as a bigger prize */
  const n = h.bowl.food;
  for (let i = 0; i < n; i++) {
    const a = (i / Math.max(1, n)) * 6.283 + h.id;
    const r2 = n > 1 ? 11 : 0;
    circle(Math.cos(a) * r2, -6 + Math.sin(a) * r2 * 0.45, 8);
    fillStroke(i % 2 ? '#ffbf6b' : '#ff9d6b', INK, 2.5);
  }

  ctx.beginPath();
  ctx.moveTo(-28, -2);
  ctx.quadraticCurveTo(-26, 18, 0, 18);
  ctx.quadraticCurveTo(26, 18, 28, -2);
  ctx.closePath();
  fillStroke('#7fd4ea', INK, 4);
  ctx.beginPath(); ctx.ellipse(0, -2, 28, 8, 0, 0, 6.3);
  fillStroke('#a8e6f5', INK, 3);
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

function drawOwner() {
  if (!g.pickup) return;
  const p = g.pickup;
  const t = clamp(p.t / 1.6, 0, 1);
  const fromY = p.side ? L.bot + 80 : L.top - 80;
  const y = lerp(fromY, sy(g.cat.y) + 50, t);
  const x = sx(C.ROAD_X) + (g.cat.x > C.ROAD_X ? 64 : -64);
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = 0.3;
  ctx.beginPath(); ctx.ellipse(0, 46, 26, 9, 0, 0, 6.3);
  ctx.fillStyle = '#000'; ctx.fill();
  ctx.globalAlpha = 1;
  const stride = Math.sin(p.t * 9) * 8 * (1 - t);
  ctx.strokeStyle = '#3c5b8a'; ctx.lineWidth = 11 * STROKE; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-4, 20); ctx.lineTo(-4 + stride, 44); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4, 20); ctx.lineTo(4 - stride, 44); ctx.stroke();
  rr(-19, -18, 38, 42, 13); fillStroke('#4e74ad', INK, 4.5);
  circle(0, -34, 17); fillStroke('#f2c49b', INK, 4);
  ctx.fillStyle = '#4a3550';
  ctx.beginPath(); ctx.arc(0, -36, 17, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fill();
  ctx.fillStyle = INK;
  circle(-6, -32, 2.4); ctx.fill();
  circle(6, -32, 2.4); ctx.fill();
  ctx.restore();
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

  const secs = Math.max(0, Math.ceil(g.timeLeft));
  const clock = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
  const low = g.timeLeft < 15 && g.scene === 'play';
  outlined(clock, DW / 2, 50, 50, low && Math.sin(elapsed * 9) > 0 ? ALARM : CREAM);

  const kept = g.houses.filter(h => !h.angry).length;
  text('FEEDING YOU', DW - 24, 28, 21, 'rgba(255,233,201,.5)', 'right', 600);
  outlined(kept + '/8', DW - 24, 64, 42, kept <= 2 ? ALARM : MINT, 'right');

  /* second row: which wave we're in, and the sound toggle */
  text('WAVE ' + (g.waveIdx + 1) + ' · ' + C.WAVES[g.waveIdx].name,
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

function closeLayout() {
  /* Everything the eyes need sits in one band at the top: the windows, and
     the bar right under them. The thumb taps anywhere, so the bar does not
     have to be near it; the cat fills the space below as the reward. */
  const frontH  = clamp(DH * 0.17, 190, 270);
  const winTop  = L.hud + 58;
  const statusY = winTop + frontH + 28;
  const bh      = 88;
  const barY    = statusY + 64;
  const rowY2   = barY + bh + 62;                    /* "at X's bowl" / LEAVE row */
  const catY    = Math.round((rowY2 + 50 + DH - 96) / 2 + 40);
  return { frontH, frontW: 206, winTop, statusY, bh, barY, rowY2, catY, bowlX: DW / 2 + 92 };
}
function leaveRect() {
  const c = closeLayout();
  return { x: DW - 182, y: c.rowY2 - 30, w: 158, h: 60 };
}
/* a neighbour of this bowl is at the curtain but not yet at the glass */
function warned() {
  return !!g.eat && g.eat.h.neighbours.some(id => g.houses[id].state === 'stir');
}

/* which slot a neighbour occupies in the close-up */
function slotOf(owner, n) {
  if (n.col !== owner.col) return 1;
  return n.row < owner.row ? 0 : 2;
}
const SLOT_LABEL = ['UP THE ROAD', 'OPPOSITE', 'DOWN THE ROAD'];

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
  const cx = DW / 2 + (slot - 1) * 230;
  const w = c.frontW, H = c.frontH, y = c.winTop;
  const t = TINT[n.id], v = vis[n.id];
  const watching = n.state === 'watch', stirring = n.state === 'stir';
  const dull = n.angry;
  const pulse = 0.5 + 0.5 * Math.sin(elapsed * 10);

  text(SLOT_LABEL[slot], cx, y - 34, 18, 'rgba(255,233,201,.45)', 'center', 600);

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
  } else if (stirring) {
    circle(cx + w / 2 - 14, y - 8, 18); fillStroke(WARM, INK, 3.5);
    text('?', cx + w / 2 - 14, y - 6, 26, INK, 'center', 800);
  }

  /* this window's own RUN timer, draining while they register what they see */
  if (g.spot.by === n.id && g.spot.heat > 0) {
    const frac = clamp(g.spot.heat / C.wave(g).react, 0, 1);
    const mx2 = cx - w / 2 + 14, mw = w - 28, my = y + H - 30;
    rr(mx2, my, mw, 18, 9); fillStroke('rgba(42,10,20,.7)', null);
    rr(mx2, my, mw * (1 - frac), 18, 9); fillStroke(ALARM, null);
  }

  /* status, in words */
  const st = dull
    ? (watching ? ['WILL TELL ON YOU!', ALARM] : stirring ? ['STIRRING', WARM] : ['ALREADY CROSS', 'rgba(233,182,255,.85)'])
    : (watching ? ['WATCHING YOU!', ALARM] : stirring ? ['CURTAIN TWITCHING', WARM] : ['ASLEEP', 'rgba(255,233,201,.5)']);
  text(st[0], cx, c.statusY - 8, 19, st[1], 'center', 800);
  text(dull && !watching ? 'will tell on you' : n.name, cx, c.statusY + 16, 17,
       'rgba(255,233,201,.42)', 'center', 500);
}

function drawEmptySlot(slot, c) {
  const cx = DW / 2 + (slot - 1) * 230;
  text('END OF THE ROAD', cx, c.winTop + c.frontH * 0.5, 18, 'rgba(255,233,201,.22)', 'center', 600);
  /* a hedge, so the gap reads as the street ending rather than a missing house */
  for (let i = 0; i < 5; i++) {
    circle(cx - 80 + i * 40, c.winTop + c.frontH - 24, 30);
    fillStroke('#2f5a3e', INK, 3);
  }
}

/* the food in a bowl, drawn at the origin */
function bowlShape(n, seed) {
  for (let i = 0; i < n; i++) {
    const a = (i / Math.max(1, n)) * 6.283 + seed;
    const r2 = n > 1 ? 11 : 0;
    circle(Math.cos(a) * r2, -6 + Math.sin(a) * r2 * 0.45, 8);
    fillStroke(i % 2 ? '#ffbf6b' : '#ff9d6b', INK, 2.5);
  }
  ctx.beginPath();
  ctx.moveTo(-28, -2);
  ctx.quadraticCurveTo(-26, 18, 0, 18);
  ctx.quadraticCurveTo(26, 18, 28, -2);
  ctx.closePath();
  fillStroke('#7fd4ea', INK, 4);
  ctx.beginPath(); ctx.ellipse(0, -2, 28, 8, 0, 0, 6.3);
  fillStroke('#a8e6f5', INK, 3);
}

/* The cat, big. Its face is the second tell after the windows: content while
   eating, chomping on a bite, wincing at a clatter, ears flat when seen. */
function drawCatClose(x, y, s) {
  const alert  = g.spot.heat > 0;
  const wary   = !alert && warned();
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
  const e = g.eat;
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
  const bx = 48, bw = DW - 96, bh = c.bh, barY = c.barY;
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
    outlined('‹‹  SWIPE TO RUN!  ››', DW / 2 + nudge, barY + bh / 2 - 9, 42, '#fff');
    text(motionSeen ? 'or shake your phone' : 'flick anywhere on the screen', DW / 2, barY + bh / 2 + 26, 20,
         '#ffd0d0', 'center', 600);
  } else if (e.cool > 0) {
    text('CLATTER! THE NEIGHBOURS HEARD', DW / 2, barY - 22, 20, ALARM, 'center', 800);
  }

  /* whose bowl, and the calm way out */
  text('AT', 28, c.rowY2 - 14, 18, 'rgba(255,233,201,.5)', 'left', 600);
  const nm = h.name.toUpperCase();
  outlined(nm + (nm.endsWith('S') ? '’' : '’S') + ' BOWL', 28, c.rowY2 + 14, 30, TINT[h.id].wall, 'left');
  const lr = leaveRect();
  rr(lr.x, lr.y, lr.w, lr.h, 30);
  fillStroke('rgba(255,233,201,.12)', 'rgba(255,233,201,.35)', 3);
  text('LEAVE', lr.x + lr.w / 2, lr.y + lr.h / 2 + 2, 26, CREAM, 'center', 800);

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
  const left = h.bowl ? h.bowl.food : 0;
  text(left + (left === 1 ? ' BITE LEFT' : ' BITES LEFT'), c.bowlX, c.catY + 40 * s, 21,
       'rgba(255,233,201,.7)', 'center', 700);

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

  text('TAP ANYWHERE TO BITE · SWIPE TO RUN', DW / 2, DH - 46, 22,
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
  const y = DH * 0.34;
  ctx.fillStyle = 'rgba(18,12,36,.94)';
  rr(30, y - 76, DW - 60, 152, 26); ctx.fill();
  ctx.strokeStyle = WARM; ctx.lineWidth = 3;
  rr(30, y - 76, DW - 60, 152, 26); ctx.stroke();
  text('WAVE ' + (banner.idx + 1), DW / 2, y - 42, 23, 'rgba(255,233,201,.6)', 'center', 600);
  outlined(w.name, DW / 2, y - 2, 38, WARM);
  text(w.blurb, DW / 2, y + 44, 22, CREAM, 'center', 500);
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

function drawTitle() {
  ctx.fillStyle = 'rgba(10,6,20,.76)';
  ctx.fillRect(0, 0, DW, DH);

  const y = DH * 0.22;
  outlined('BOWL', DW / 2, y, 94, WARM);
  outlined('BANDIT', DW / 2, y + 84, 94, '#ff9ecd');
  text('one cat · eight bowls · two minutes', DW / 2, y + 148, 25, CREAM, 'center', 500);

  const cardY = y + 196;
  ctx.fillStyle = 'rgba(18,12,36,.93)';
  rr(36, cardY, DW - 72, 318, 26); ctx.fill();
  ctx.strokeStyle = 'rgba(255,233,201,.18)'; ctx.lineWidth = 2.5;
  rr(36, cardY, DW - 72, 318, 26); ctx.stroke();

  [['TAP A HOUSE', 'the cat walks over and starts eating'],
   ['TAP TO BITE', 'time each bite on the green'],
   ['SWIPE TO RUN', 'flick away when a neighbour spots you']].forEach((r, i) => {
    const ry = cardY + 54 + i * 62;
    circle(78, ry, 16); fillStroke(WARM, INK, 3);
    text(String(i + 1), 78, ry + 1, 20, INK, 'center', 800);
    text(r[0], 112, ry - 11, 25, CREAM, 'left', 700);
    text(r[1], 112, ry + 16, 20, 'rgba(255,233,201,.6)', 'left', 500);
  });

  text('A bowl’s owner never minds — they put it there for you.',
       DW / 2, cardY + 244, 20, 'rgba(255,233,201,.75)', 'center', 500);
  text('Their NEIGHBOURS do. Get seen and someone',
       DW / 2, cardY + 270, 20, 'rgba(255,233,201,.75)', 'center', 500);
  text('stops feeding you for good.',
       DW / 2, cardY + 294, 20, 'rgba(255,233,201,.75)', 'center', 500);

  ctx.globalAlpha = 0.72 + 0.28 * Math.sin(elapsed * 3);
  outlined('TAP TO PROWL', DW / 2, cardY + 382, 42, MINT);
  ctx.globalAlpha = 1;
  if (best > 0) text('BEST ' + best, DW / 2, cardY + 430, 23, 'rgba(255,233,201,.55)', 'center', 600);
}

function drawOver() {
  ctx.fillStyle = 'rgba(10,6,20,.84)';
  ctx.fillRect(0, 0, DW, DH);
  const kept = g.houses.filter(h => !h.angry).length;
  const y = DH * 0.19;

  outlined(kept === 0 ? 'RUN OFF THE STREET' : 'CARRIED HOME',
           DW / 2, y, kept === 0 ? 40 : 46, kept === 0 ? ALARM : WARM);

  ctx.fillStyle = 'rgba(18,12,36,.93)';
  rr(44, y + 54, DW - 88, 276, 26); ctx.fill();
  ctx.strokeStyle = 'rgba(255,233,201,.18)'; ctx.lineWidth = 2.5;
  rr(44, y + 54, DW - 88, 276, 26); ctx.stroke();

  const line = (label, value, i, colour) => {
    const ly = y + 104 + i * 52;
    text(label, 80, ly, 24, 'rgba(255,233,201,.72)', 'left', 500);
    text(value, DW - 80, ly, 27, colour || CREAM, 'right', 700);
  };
  line('Bowls cleared', String(g.bowlsCleared), 0);
  line('Lost to the fox', String(g.foxLosses), 1, g.foxLosses ? '#ff9d6b' : CREAM);
  line('Still feeding you', kept + ' × ' + C.KEPT_BONUS, 2, kept ? MINT : ALARM);
  ctx.strokeStyle = 'rgba(255,233,201,.18)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(80, y + 264); ctx.lineTo(DW - 80, y + 264); ctx.stroke();
  text('TOTAL', 80, y + 296, 26, CREAM, 'left', 700);
  outlined(String(g.score), DW - 80, y + 296, 40, WARM, 'right');

  if (g.score >= best && g.score > 0) outlined('NEW BEST', DW / 2, y + 370, 32, MINT);
  else if (best > 0) text('BEST ' + best, DW / 2, y + 370, 25, 'rgba(255,233,201,.55)', 'center', 600);

  ctx.globalAlpha = 0.72 + 0.28 * Math.sin(elapsed * 3);
  outlined('TAP TO PROWL AGAIN', DW / 2, y + 446, 38, CREAM);
  ctx.globalAlpha = 1;
}

/* ---------- frame ---------- */
function draw() {
  ctx.save();
  if (shake > 0) ctx.translate(rand(-1, 1) * shake * 14, rand(-1, 1) * shake * 14);

  drawStreet();
  /* lamps stand on the row boundaries, so they never sit on a bowl */
  drawLamp(L.roadL + 14, L.top + L.rowH, 1);
  drawLamp(L.roadR - 14, L.top + L.rowH * 3, -1);

  for (const h of g.houses) drawHouse(h);
  for (const h of g.houses) drawBowl(h);

  drawFox();
  drawCat(sx(g.cat.x), sy(g.cat.y), g.cat.face, !!g.eat);
  drawDog();
  drawOwner();
  drawFloaters('street');

  /* vignette, to push the eye down the middle of the street */
  const vg = ctx.createRadialGradient(DW / 2, DH / 2, DH * 0.3, DW / 2, DH / 2, DH * 0.74);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,.42)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, DW, DH);

  drawCloseUp();
  if (g.eat) drawFloaters('close');
  drawHud();
  drawWaveBanner();
  if (g.scene === 'caught') drawCaught();
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
  const dir = g.cat.x < C.ROAD_X ? 1 : -1;
  C.tapRoad(g, C.ROAD_X + dir * 0.12, g.cat.y);
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
  C.tapEat(g, press.t);
  handleEvents();
}

function onDown(ev) {
  ev.preventDefault();
  Sfx.boot();
  const p = toDesign(ev);

  if (inside(p, muteRect())) { Sfx.muted = !Sfx.muted; return; }

  if (g.scene === 'title' || g.scene === 'over') {
    askForMotion();
    C.start(g); handleEvents();
    return;
  }
  if (g.scene !== 'play') return;

  if (g.eat) {
    if (inside(p, leaveRect())) { C.tapRoad(g, C.ROAD_X, g.cat.y); Sfx.tap(); return; }
    if (press) biteFromPress();      /* a second finger: settle the first */
    press = { x: p.x, y: p.y, t: g.eat.t, at: performance.now(), bitten: false };
    try { cv.setPointerCapture(ev.pointerId); } catch (e) {}
    return;
  }

  if (p.y < L.hud || p.y > L.bot) return;
  const row = clamp(Math.floor((p.y - L.top) / L.rowH), 0, C.ROWS - 1);
  if (p.x < L.roadL)      C.tapHouse(g, row);
  else if (p.x > L.roadR) C.tapHouse(g, C.ROWS + row);
  else                    C.tapRoad(g, p.x / DW, (p.y - L.top) / L.rowH);
  Sfx.tap();
}

/* A finger that travels far enough is a run, whether it moved at once (no
   bite taken) or slowly after the bite already landed. */
function onMove(ev) {
  if (!press) return;
  const p = toDesign(ev);
  if (Math.hypot(p.x - press.x, p.y - press.y) > SWIPE) { press = null; bolt(); }
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
cv.addEventListener('pointercancel', onUp);
cv.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => setTimeout(fit, 120));

/* ---------- loop ---------- */
const STEP = 1 / 120;               /* fixed timestep: the bite window must not
                                       depend on the phone's frame rate */
let last = 0, acc = 0;
function frame(ts) {
  if (!last) last = ts;
  let dt = (ts - last) / 1000;
  last = ts;
  if (dt > 0.25) dt = 0.25;         /* tab was backgrounded; don't fast-forward */
  acc += dt;
  while (acc >= STEP) { C.update(g, STEP); acc -= STEP; }
  if (press && !press.bitten && performance.now() - press.at >= HOLD * 1000) biteFromPress();
  handleEvents();
  updateVisuals(dt);
  draw();
  requestAnimationFrame(frame);
}

fit();
requestAnimationFrame(frame);

/* ?debug exposes the game to the console, for setting up a scene by hand */
if (/[?&]debug\b/.test(location.search)) window.__bb = { g, C };

/* Keep a published page's best score across a republish, where the host
   supports it. */
if (window.claude && window.claude.hot) {
  window.claude.hot.snapshot(() => ({ best }));
}

})();
