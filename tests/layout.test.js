const noop=()=>{}, grad={addColorStop:noop};
const draws=[]; const rects=[];
const state={font:'bold 15px x',textAlign:'center',tx:0,ty:0};
// track translate/scale so we can resolve real page coords
let stack=[], cur={x:0,y:0,sx:1,sy:1};
const ctx=new Proxy({},{
  get(t,p){
    if(p==='createLinearGradient'||p==='createRadialGradient')return()=>grad;
    if(p==='measureText')return s=>({width:est(String(s),size())});
    if(p==='save')return()=>{stack.push({...cur})};
    if(p==='restore')return()=>{cur=stack.pop()||{x:0,y:0,sx:1,sy:1}};
    if(p==='translate')return(x,y)=>{cur.x+=x*cur.sx;cur.y+=y*cur.sy};
    if(p==='scale')return(x,y)=>{cur.sx*=x;cur.sy*=y};
    if(p==='fillText'||p==='strokeText')return(s,x,y)=>{
      const sz=size()*Math.abs(cur.sy);
      const w=est(String(s),size())*Math.abs(cur.sx);
      const cx=cur.x+x*cur.sx, cy=cur.y+y*cur.sy;
      const a=state.textAlign;
      const x0 = a==='center'? cx-w/2 : a==='right'? cx-w : cx;
      draws.push({s:String(s),x0,x1:x0+w,y0:cy-sz*0.62,y1:cy+sz*0.62,sz});
    };
    if(p==='fillRect')return(x,y,w,h)=>{rects.push({x0:cur.x+x*cur.sx,y0:cur.y+y*cur.sy,w:w*cur.sx,h:h*cur.sy});};
    return noop;
  },
  set(t,p,v){ if(p==='font')state.font=v; if(p==='textAlign')state.textAlign=v; return true; }
});
function size(){ const m=/([\d.]+)px/.exec(state.font); return m?parseFloat(m[1]):15; }
// Trebuchet-ish average advance ≈ 0.50em, caps/bold a touch wider
function est(s,sz){ let w=0; for(const ch of s) w += /[A-Z0-9]/.test(ch)?0.60:/[ilj.,'!|]/.test(ch)?0.28:/[mwW]/.test(ch)?0.86:0.52; return w*sz; }

require('./harness').installWith(ctx);
const step = global.step;

let pass=0,fail=0;
const ok=(c,m)=>{c?(pass++,console.log('  PASS '+m)):(fail++,console.log('  FAIL '+m))};

function audit(label, panelX, panelY, panelW, panelH) {
  draws.length=0; rects.length=0; stack=[]; cur={x:0,y:0,sx:1,sy:1};
  step();
  const PL=panelX, PR=panelX+panelW, PT=panelY, PB=panelY+panelH;
  const PAD=10;
  const body = draws.filter(d => (d.y0+d.y1)/2 > 56);   // HUD lives outside the panel by design
  const over = body.filter(d => d.y1 > PB-PAD || d.y0 < PT+PAD || d.x0 < PL+PAD || d.x1 > PR-PAD);
  console.log('\n  '+label+': '+draws.length+' text draws, panel x '+PL+'-'+PR+' y '+PT+'-'+PB);
  if (over.length) {
    console.log('  OVERFLOWING:');
    for (const d of over.slice(0,12))
      console.log('    y '+d.y0.toFixed(0)+'-'+d.y1.toFixed(0)+'  x '+d.x0.toFixed(0)+'-'+d.x1.toFixed(0)+'  "'+d.s.slice(0,52)+'"');
  }
  ok(over.length===0, label+': all text inside the panel');
  // vertical collision check between distinct rows
  const rows=[...body].sort((a,b)=>a.y0-b.y0);
  let clash=0, worst=null;
  for(let i=0;i<rows.length;i++) for(let j=i+1;j<rows.length;j++){
    const a=rows[i],b=rows[j];
    if(a.s===b.s) continue;                       // outlinedText draws twice
    const vo=Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0);
    const ho=Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0);
    if(vo>4 && ho>4){ clash++; if(!worst||vo>worst.vo) worst={a:a.s,b:b.s,vo,ho}; }
  }
  ok(clash===0, label+': no overlapping text'+(worst?' (worst: "'+worst.a.slice(0,26)+'" vs "'+worst.b.slice(0,26)+'" '+worst.vo.toFixed(0)+'px)':''));
  const maxY=Math.max(...body.map(d=>d.y1));
  console.log('    lowest text ends at y='+maxY.toFixed(0)+', panel bottom '+PB+' (headroom '+(PB-maxY).toFixed(0)+'px)');
}

console.log('\n=== TITLE SCREEN LAYOUT ===');
scene='title';
audit('title', 78, 62, 844, 578);

console.log('\n=== GAME OVER LAYOUT ===');
// worst case: long text in every row
scene='over'; resetGame(); scene='over';
score=1234; keptBonus=320; bowlsCleared=12; foxLosses=3;
houses.forEach((h,i)=>{h.angry=i<7});
audit('game over', 190, 118, 620, 462);

console.log('\n=== GAME OVER, all-8-lost variant ===');
houses.forEach(h=>h.angry=true); keptBonus=0;
audit('game over (all lost)', 190, 118, 620, 462);

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
