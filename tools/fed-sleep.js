/*
 * PROTOTYPE (#34): the "fed sleep" rule as a patch to src/core.js's source.
 *
 *   a house that has had its dinner goes to sleep for the night and stops
 *   watching, so every meal reshapes the street.
 *
 * Shared by tools/planning-lab.js (which measures it) and
 * tools/street-lab-play.html (which lets you feel it), so the two cannot
 * drift apart. The game is not touched: this returns patched source for a copy
 * of the rules, and stops with a message if src/core.js has moved. The patched
 * rules export EXP; set EXP.fedSleep = true to turn the rule on.
 */
(function (root) {
  function apply(src) {
    let s = src;
    const rep = (a, b) => { if (!s.includes(a)) throw new Error('src/core.js has changed: cannot find\n  ' + a + '\nUpdate tools/fed-sleep.js.'); s = s.replace(a, b); };
    rep('function isThreat(w, owner) { return w !== owner && owner.neighbours.includes(w.id); }',
        'const EXP = { fedSleep: false };\nfunction isThreat(w, owner) { return w !== owner && owner.neighbours.includes(w.id) && !(EXP.fedSleep && w.cleared); }');
    rep('bowlSpot, wave, watchersOfBowl, isThreat,', 'EXP, bowlSpot, wave, watchersOfBowl, isThreat,');
    /* a fed house stops waking, and drops out of the awake count so it does not waste a slot */
    rep("    h.t -= dt;\n    if (h.t <= 0) {\n      if (h.state === 'idle') {",
        "    if (EXP.fedSleep && h.cleared) { if (h.state !== 'idle') { h.state = 'idle'; awake--; } continue; }\n    h.t -= dt;\n    if (h.t <= 0) {\n      if (h.state === 'idle') {");
    /* and the dog does not bring it to its window */
    rep("      if (!isOpen(g, h)) continue;\n      if (h.state === 'idle') h.state = 'stir';",
        "      if (!isOpen(g, h) || (EXP.fedSleep && h.cleared)) continue;\n      if (h.state === 'idle') h.state = 'stir';");
    rep("for (const h of g.houses) { if (!isOpen(g, h)) continue; h.state = 'watch'; h.t = 0.7; }",
        "for (const h of g.houses) { if (!isOpen(g, h) || (EXP.fedSleep && h.cleared)) continue; h.state = 'watch'; h.t = 0.7; }");
    return s;
  }
  const API = { apply };
  if (typeof module === 'object' && module.exports) module.exports = API; else root.FedSleep = API;
})(typeof self !== 'undefined' ? self : this);
