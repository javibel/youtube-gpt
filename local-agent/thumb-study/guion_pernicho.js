'use strict';
const fs=require('fs');
const all=JSON.parse(fs.readFileSync('./thumb-study-classified-v2.json','utf8'));
const pct=(n,t)=>t?Math.round(1000*n/t)/10:0;
const small=all.filter(r=>r.subs>1000&&r.subs<500000);
const G=r=>!!r.vis.cara_humana_grande;
console.log('nicho        n(alto=bajo)  ALTO%  BAJO%   dif');
for(const t of [...new Set(small.map(r=>r.topic))]){
  const rt=small.filter(r=>r.topic===t); if(rt.length<12)continue;
  const s=[...rt].sort((a,b)=>(a.views/a.subs)-(b.views/b.subs));
  const half=Math.floor(s.length/2);
  const lo=s.slice(0,half), hi=s.slice(s.length-half);
  const a=pct(hi.filter(G).length,hi.length), b=pct(lo.filter(G).length,lo.length);
  console.log(t.padEnd(12), String(half).padStart(3), String(a).padStart(8)+'%', String(b).padStart(6)+'%', String((a-b).toFixed(1)).padStart(7));
}
