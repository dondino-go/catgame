require('./harness').install();
key(' ',true);key(' ',false);step();

console.log('\n=== SIGHT GEOMETRY (the core rule) ===');
console.log('Each window must reach: its own bowl, both same-side neighbours,');
console.log('and the bowl directly across -- and NOT the diagonals.\n');
let bad=0;
for (const w of houses) {
  const canReach=[], shouldReach=[w.id, ...w.neighbours];
  for (const b of houses) {
    const d = Math.hypot(w.wx-b.cx, w.wy-b.bowlY);
    if (d < VIEW_R) canReach.push(b.id);
  }
  const miss = shouldReach.filter(i=>!canReach.includes(i));
  const extra = canReach.filter(i=>!shouldReach.includes(i));
  const okRow = !miss.length && !extra.length;
  if(!okRow) bad++;
  const dists = shouldReach.map(i=>{
    const b=houses[i]; return Math.round(Math.hypot(w.wx-b.cx, w.wy-b.bowlY));
  });
  console.log('  '+(okRow?'ok  ':'BAD ')+w.side.padEnd(6)+'#'+w.i+' win y='+w.wy+
    '  reaches ['+canReach.join(',')+']  want ['+shouldReach.join(',')+']  d='+dists.join('/')+
    (miss.length?'  MISSING '+miss:'')+(extra.length?'  EXTRA '+extra:''));
}
ok(bad===0,'all 8 windows have exactly the right reach');

// nearest diagonal must stay outside the radius, with margin
let minDiag=1e9, maxNeeded=0;
for (const w of houses) for (const b of houses) {
  const d = Math.hypot(w.wx-b.cx, w.wy-b.bowlY);
  const want = w.id===b.id || w.neighbours.includes(b.id);
  if (want) maxNeeded=Math.max(maxNeeded,d); else minDiag=Math.min(minDiag,d);
}
console.log('\n  furthest bowl that MUST be seen: '+maxNeeded.toFixed(0)+'px');
console.log('  nearest bowl that must NOT be:   '+minDiag.toFixed(0)+'px   (VIEW_R='+VIEW_R+')');
ok(maxNeeded < VIEW_R-8,'margin above: '+(VIEW_R-maxNeeded).toFixed(0)+'px');
ok(minDiag > VIEW_R+8,'margin below: '+(minDiag-VIEW_R).toFixed(0)+'px');

console.log('\n=== HOUSE LAYOUT ON SCREEN ===');
for (const h of houses) {
  const roofTop=h.roofApex, base=h.bodyBot;
  ok(roofTop>=(h.side==='top'?HUD_H:BOT_BASE)-1,
     h.side+'#'+h.i+' roof apex '+roofTop+' clear of '+(h.side==='top'?'HUD':'pavement'));
  ok(base<=H, h.side+'#'+h.i+' base '+base+' within canvas');
}
const topH=houses.find(h=>h.side==='top'), botH=houses.find(h=>h.side==='bottom');
ok(topH.roofApex < topH.bodyTop && botH.roofApex < botH.bodyTop,'BOTH rows have the roof ABOVE the body (no upside-down houses)');
ok(topH.chimney && !botH.chimney,'only the far row has chimneys (a near-row chimney would sit in the pavement)');

console.log('\n=== TELLS STAY ON SCREEN ===');
for (const h of houses) {
  const bx=h.wx+50, by=h.wy;
  ok(bx+15<W && bx-15>0 && by-15>HUD_H && by+15<H, h.side+'#'+h.i+' stir badge fully visible');
  const ey=h.roofApex+22;
  ok(ey>HUD_H+10 && ey<H-10, h.side+'#'+h.i+' threat eye on screen');
}
// badge must sit on the wall, not off the side of the house
for (const h of houses) ok(50+15 < HOUSE_W/2, 'badge within the wall width');
console.log('\n=== BOWL READABILITY ===');
resetGame();step();quiet();
const b=houses[0].bowl;
ok(b.food===3,'wave-1 bowl has 3 balls');
report();
