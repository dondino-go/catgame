/*
 * Test harness for Bowl Bandit.
 *
 * The game is a single index.html with no build step, so the tests read that
 * file, pull the <script> block out of it, and run it against a stubbed canvas
 * and DOM. The tests therefore exercise exactly the file a browser loads --
 * there is no second copy of the source to drift out of sync.
 *
 * Everything runs through vm.runInThisContext, so the game's top-level
 * declarations (houses, cat, scene, timeLeft, frame, ...) are reachable from a
 * test by bare name, and mutable for setting up scenarios.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const noop = () => {};

function gameSource() {
  const file = path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no <script> block found in ' + file);
  return m[1];
}

/* A canvas context that accepts every call and records nothing. */
function silentCtx() {
  const grad = { addColorStop: noop };
  return new Proxy({}, {
    get(t, p) {
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => grad;
      if (p === 'measureText') return s => ({ width: String(s).length * 7.2 });
      if (p in t) return t[p];
      return noop;
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}

/* Install the fake browser, load the game, expose driving helpers as globals. */
function installWith(ctx) {
  const listeners = {};
  const canvas = {
    getContext: () => ctx,
    addEventListener: (n, f) => { listeners['cv:' + n] = f; },
    width: 1000, height: 700,
  };
  global.document = { getElementById: () => canvas };
  global.window = global;
  global.performance = { now: () => global.__clock };
  global.addEventListener = (n, f) => { listeners[n] = f; };
  global.requestAnimationFrame = noop;      // tests drive the loop by hand
  global.AudioContext = undefined;          // silence, and no async audio
  global.webkitAudioContext = undefined;
  global.__clock = 0;

  vm.runInThisContext(gameSource());

  global.listeners = listeners;

  /* press or release a key, exactly as the browser would deliver it */
  global.key = (k, down) => listeners[down ? 'keydown' : 'keyup']({ key: k, preventDefault: noop });

  /* advance one frame (default ~60fps) */
  global.step = (ms = 16) => { global.__clock += ms; global.frame(global.__clock); };

  /* put every resident firmly asleep, so a test can isolate one variable */
  global.quiet = () => houses.forEach(h => { h.state = 'idle'; h.t = 9999; h.glow = 0; h.curtain = 0; });

  /* walk the cat to a bowl and start eating from it */
  global.sitAt = h => {
    if (!h.bowl) spawnBowl(h);
    cat.x = h.cx;
    cat.y = h.bowlY + (h.side === 'top' ? 26 : -26);
    step();
    key(' ', true); key(' ', false);
    step();
  };

  return { listeners };
}

function install() { return installWith(silentCtx()); }

/* ---- assertions ---- */
let pass = 0, fail = 0;
global.ok = (cond, msg) => {
  if (cond) { pass++; console.log('  PASS ' + msg); }
  else      { fail++; console.log('  FAIL ' + msg); }
};
global.report = () => {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
};

module.exports = { install, installWith, silentCtx, gameSource };
