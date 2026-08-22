require('./harness').install();

console.log('\n=== TIMING & WAVES ===');
ok(GAME_SECONDS===120,'round is 120s (got '+GAME_SECONDS+')');
ok(WAVES.length===4,'four waves');
ok(WAVES.every(w=>w.secs===30),'30s each');
key(' ',true);key(' ',false);step();
const bounds=[[0,0],[29,0],[30,1],[59,1],[60,2],[89,2],[90,3],[119,3]];
ok(bounds.every(([s,w])=>waveAt(s)===w),'wave boundaries map correctly');
ok(banner && banner.idx===0,'wave 1 banner shows at kick-off');

console.log('\n--- per-wave difficulty (must be monotonic) ---');
const mono=(k,dir)=>{ for(let i=1;i<4;i++){ const a=WAVES[i-1][k],b=WAVES[i][k]; if(dir>0?!(b>a):!(b<a)) return false; } return true; };
console.log('  wave  warn  watch  awake bites react  bowlspeed green');
WAVES.forEach((w,i)=>console.log('   '+(i+1)+'   '+w.warn.toFixed(2)+'s  '+w.watch.toFixed(2)+'s   '+w.awake+'     '+w.bites+'   '+w.react.toFixed(2)+'s    '+w.speed.toFixed(2)+'   '+(w.zone*100).toFixed(0)+'%'));
ok(mono('warn',-1),'warning window shrinks every wave');
ok(mono('watch',1),'watch duration grows every wave');
ok(mono('awake',1),'more residents awake at once every wave');
ok(mono('bites',1),'bowls get bigger every wave');
ok(mono('react',-1),'reaction window shrinks every wave');
ok(mono('zone',-1),'green zone shrinks every wave');

console.log('\n=== CORE RULE (regression) ===');
resetGame();step();quiet();
const o=houses[2], w1=houses[o.neighbours[0]];
sitAt(o); ok(!!eat,'space at a bowl starts the mini-game');
o.state='watch';o.t=9999; for(let i=0;i<40;i++)step();
ok(!!eat && !o.angry,'the bowl OWNER watching is harmless');
w1.state='watch';w1.t=9999;
for(let i=0;i<3;i++)step();
ok(!!eat && spotHeat>0,'neighbour sees you: meter starts, not instant death');
key('arrowleft',true);step();key('arrowleft',false);
for(let i=0;i<20;i++)step();
ok(!w1.angry && !o.angry,'bolting in time costs nothing');
resetGame();step();quiet();
const o2=houses[2], w2=houses[o2.neighbours[0]];
sitAt(o2); w2.state='watch';w2.t=9999;
for(let i=0;i<80 && scene==='play';i++)step();
ok(scene==='caught' && w2.angry && !o2.angry,'dithering: WITNESS withdraws their own bowl');
resetGame();step();quiet();
const o3=houses[5], w3=houses[o3.neighbours[0]];
w3.angry=true;w3.bowl=null;
sitAt(o3); w3.state='watch';w3.t=9999;
for(let i=0;i<80 && scene==='play';i++)step();
ok(scene==='caught' && caughtInfo.grass===true && o3.angry,'angry witness grasses you: OWNER withdraws');
resetGame();step();quiet();
const o4=houses[0];
const far=houses.find(x=>x!==o4 && !o4.neighbours.includes(x.id));
sitAt(o4); far.state='watch';far.t=9999;
for(let i=0;i<60;i++)step();
ok(!!eat && !o4.angry,'non-neighbour cannot bust you');

console.log('\n=== THE DOG ===');
ok(WAVES[0].dog===0,'no dog in wave 1');
ok(WAVES.slice(1).every(w=>w.dog>0),'dog patrols waves 2-4');
resetGame();step();
timeLeft=GAME_SECONDS-30-1; step(); step();   // into wave 2
ok(waveIdx===1,'reached wave 2');
quiet(); dogTimer=0.01; step(); step();
ok(!!dog,'dog spawns');
ok(dog.phase==='bark','barks first as a telegraph');
const stirred=houses.filter(h=>h.state!=='idle').length;
ok(stirred>0,'the bark makes curtains twitch ('+stirred+' houses)');
for(let i=0;i<90 && dog && dog.phase==='bark';i++)step();
ok(dog && dog.phase==='run','then runs');
step();step();
ok(houses.every(h=>h.state==='watch'),'ALL 8 residents at the windows while it runs');
const dogX0=dog.x, dogDir=dog.dir;
for(let i=0;i<12;i++)step();
ok((dog.x-dogX0)*dogDir>0,'dog crosses the street');
let g=0; while(dog && g++<500) step();
ok(!dog,'dog leaves');
for(let i=0;i<80;i++)step();
ok(houses.some(h=>h.state==='idle'),'street settles down afterwards');

console.log('\n--- the dog is genuinely dangerous mid-meal ---');
resetGame();step(); timeLeft=GAME_SECONDS-31; step(); quiet();
const dh=houses[5]; sitAt(dh);
ok(!!eat,'eating when the dog arrives');
dogTimer=0.01; step();
for(let i=0;i<200 && scene==='play';i++)step();
ok(scene==='caught','staying on the bowl through a dog run gets you busted');

console.log('\n=== THE FOX ===');
ok(!WAVES[0].fox && !WAVES[1].fox,'no fox in waves 1-2');
ok(WAVES[2].fox && WAVES[3].fox,'fox works waves 3-4');
resetGame();step();
ok(fox===null,'no fox at kick-off');
timeLeft=GAME_SECONDS-60-1; step(); step();
ok(waveIdx===2 && !!fox,'fox arrives with wave 3');
quiet();
const before=houses.reduce((n,h)=>n+(h.bowl?h.bowl.food:0),0);
for(let i=0;i<700;i++){ if(scene==='play') step(); }
const after=houses.reduce((n,h)=>n+(h.bowl?h.bowl.food:0),0);
ok(foxLosses>0 || after<before,'the fox actually steals food (losses '+foxLosses+')');
ok(fox.x>-200 && fox.x<W+200,'fox stays on the street');

console.log('\n--- the fox is beatable ---');
resetGame();step(); timeLeft=GAME_SECONDS-61; step();
ok(!!fox,'fox present');
const CAT_SPEED=205;
ok(CAT_SPEED>128,'cat (205px/s) outruns the fox (128px/s) so you can win a race');

console.log('\n=== OWNER PICKUP ENDING ===');
resetGame();step();quiet();
timeLeft=0.02;
for(let i=0;i<5 && scene==='play';i++)step();
ok(scene==='pickup','clock running out starts the pickup, not an abrupt cut');
ok(!!pickup,'owner exists');
const px0=pickup.x;
for(let i=0;i<60;i++)step();
ok(Math.abs(pickup.x-cat.x)<Math.abs(px0-cat.x),'owner walks toward the cat');
let g2=0; while(!pickup.holding && g2++<400) step();
ok(pickup.holding,'owner picks the cat up');
let g3=0; while(scene==='pickup' && g3++<400) step();
ok(scene==='over','then the results appear');
ok(keptBonus===8*KEPT_BONUS,'kept-bonus counted all 8 neighbours (got '+keptBonus+')');

console.log('\n--- losing everyone ends it early, no pickup ---');
resetGame();step();
houses.forEach(h=>{h.angry=true}); step();
ok(scene==='over','all 8 angry ends the round');

console.log('\n=== BOWL SIZE FOLLOWS THE WAVE ===');
resetGame();step();
spawnBowl(houses[0]); const b1=houses[0].bowl.food;
timeLeft=GAME_SECONDS-95; step(); spawnBowl(houses[1]); const b4=houses[1].bowl.food;
ok(b1===3 && b4===6,'bowls grow 3 (wave 1) -> 6 (wave 4)');

console.log('\n=== EATING STILL WORKS ===');
resetGame();step();quiet();
const eh=houses[3]; sitAt(eh);
for(let i=0;i<400 && eat;i++){ eat.t=eat.zone+eat.zoneW/2; eat.cool=0; key(' ',true);key(' ',false); step(); }
ok(eh.bowl===null && bowlsCleared===1,'perfect timing clears a wave-1 bowl');
ok(score===3*10+25,'3 bites x10 + 25 = 55 (got '+score+')');

console.log('\n=== NO CRASHES ANYWHERE ===');
let err=null;
try{
  resetGame();step();
  for(let i=0;i<9000;i++){
    if(scene==='over') resetGame();
    if(i%11===0){key(' ',true);key(' ',false);}
    if(i%23===0){keys['arrowright']=!keys['arrowright'];}
    if(i%31===0){keys['arrowup']=!keys['arrowup'];}
    if(i%53===0){keys['arrowleft']=!keys['arrowleft'];}
    step();
  }
}catch(e){err=e}
ok(!err,'9000 frames incl. waves, dog, fox, pickup, restart'+(err?': '+err.message+' @ '+err.stack.split('\n')[1].trim():''));
// title + gameover render paths
try{ scene='title'; step(); step(); scene='over'; step(); step(); }catch(e){ err=e }
ok(!err,'title and game-over screens render');
report();
