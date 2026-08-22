require('./harness').install();
const KS=['arrowleft','arrowright','arrowup','arrowdown'];
const still=()=>KS.forEach(k=>keys[k]=false);

// skill: bite-timing precision.  care: bolts when clocked, avoids hot bowls & the dog.
function play(skill, care) {
  resetGame(); step();
  let guard=0;
  while (scene !== 'over' && guard++ < 20000) {
    if (scene === 'pickup' || scene === 'caught') { still(); step(); continue; }
    // dog running => get off the bowls
    if (care && dog && (dog.phase === 'run' || dog.phase === 'bark')) {
      if (eat) { still(); keys['arrowup']=true; step(); continue; }
      still(); step(); continue;
    }
    if (eat) {
      if (care && spotBy) { still(); keys['arrowup']=true; step(); continue; }
      still();
      const c = eat.zone + eat.zoneW/2;
      if (eat.cool === 0 && Math.abs(eat.t - c) < eat.zoneW*(0.15+0.35*skill)) { key(' ',true); key(' ',false); }
      step(); continue;
    }
    let best=null, bd=1e9;
    for (const h of houses) {
      if (!h.bowl) continue;
      if (care && h.neighbours.some(id => houses[id].state !== 'idle')) continue;
      const d = Math.hypot(cat.x-h.cx, cat.y-h.bowlY);
      if (d < bd) { bd=d; best=h; }
    }
    if (!best) { still(); step(); continue; }
    const tx=best.cx, ty=best.bowlY+(best.side==='top'?26:-26);
    keys['arrowleft']=cat.x>tx+5; keys['arrowright']=cat.x<tx-5;
    keys['arrowup']=cat.y>ty+5;   keys['arrowdown']=cat.y<ty-5;
    if (Math.abs(cat.x-tx)<36 && Math.abs(cat.y-ty)<36) { still(); key(' ',true); key(' ',false); }
    step();
  }
  return { total: score+keptBonus, eat: score, bonus: keptBonus,
           bowls: bowlsCleared, lost: houses.filter(h=>h.angry).length, fox: foxLosses };
}

function profile(label, skill, care, n) {
  const r=[]; for(let i=0;i<n;i++) r.push(play(skill,care));
  const avg=k=>r.reduce((a,b)=>a+b[k],0)/n;
  const t=r.map(x=>x.total).sort((a,b)=>a-b);
  console.log('  '+label.padEnd(24)+
    ' total '+String(Math.round(avg('total'))).padStart(4)+
    ' ('+String(t[0]).padStart(4)+'-'+String(t[n-1]).padStart(4)+')'+
    '  eat '+String(Math.round(avg('eat'))).padStart(4)+
    ' +bonus '+String(Math.round(avg('bonus'))).padStart(3)+
    '  bowls '+avg('bowls').toFixed(1).padStart(4)+
    '  lost '+avg('lost').toFixed(1)+'/8'+
    '  foxtax '+avg('fox').toFixed(1));
  return Math.round(avg('total'));
}
console.log('\n25 full 2-minute rounds per profile:\n');
const a=profile('sloppy, reckless',    0.15,false,25);
const b=profile('decent, reckless',    0.60,false,25);
const c=profile('sloppy, careful',     0.15,true, 25);
const d=profile('decent, careful',     0.60,true, 25);
const e=profile('expert, careful',     1.00,true, 25);

const gates=[450,800,1200,1600];
const rank=s=>s>=1600?'Ghost of Marrow Street':s>=1200?'Bowl Bandit':s>=800?'Street Sweetheart':s>=450?'Bin Lid Regular':'Alley Amateur';
console.log('\nRank gates '+gates.join(' / ')+':');
[['sloppy/reckless',a],['decent/reckless',b],['sloppy/careful',c],['decent/careful',d],['expert/careful',e]]
  .forEach(([n,s])=>console.log('  '+n.padEnd(18)+String(s).padStart(5)+'  '+rank(s)));
console.log('\ncaution premium: '+(d-b)+' pts (careful vs reckless at equal skill)');
console.log('skill premium:   '+(e-c)+' pts (expert vs sloppy at equal caution)');
