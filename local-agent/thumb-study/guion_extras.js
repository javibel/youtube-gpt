'use strict';
const fs=require('fs');
const all=JSON.parse(fs.readFileSync('./thumb-study-classified-v2.json','utf8'));
const pct=(n,t)=>t?Math.round(1000*n/t)/10:0;
const small=all.filter(r=>r.subs>1000&&r.subs<500000);
let over=[],under=[];
for(const t of [...new Set(small.map(r=>r.topic))]){
  const rt=small.filter(r=>r.topic===t); if(rt.length<12)continue;
  const s=[...rt].sort((a,b)=>(a.views/a.subs)-(b.views/b.subs));
  const half=Math.floor(s.length/2);
  under=under.concat(s.slice(0,half)); over=over.concat(s.slice(s.length-half));
}
const G=r=>!!r.vis.cara_humana_grande;
const conA=over.filter(G).length, conB=under.filter(G).length;
const sinA=over.length-conA, sinB=under.length-conB;
console.log('=== TABLA CRUZADA cara humana grande (n='+(over.length+under.length)+') ===');
console.log('CON cara grande: ALTO '+conA+' / BAJO '+conB+'  -> '+pct(conB,conA+conB)+'% de las que llevan cara grande estan en el grupo BAJO');
console.log('SIN cara grande: ALTO '+sinA+' / BAJO '+sinB+'  -> '+pct(sinA,sinA+sinB)+'% de las que NO llevan cara grande estan en el grupo ALTO');

console.log('\n=== "EL SUELO": % con cara humana por nicho (toda la muestra) ===');
for(const t of [...new Set(all.map(r=>r.topic))]){
  const rt=all.filter(r=>r.topic===t);
  console.log(t.padEnd(12), 'n='+String(rt.length).padStart(4), 'cara humana '+pct(rt.filter(r=>(r.vis.caras_humanas||0)>=1).length,rt.length)+'%', ' cara GRANDE '+pct(rt.filter(G).length,rt.length)+'%');
}

console.log('\n=== EJEMPLOS: mismo nicho, ALTO sin cara grande vs BAJO con cara grande ===');
for(const t of ['fitness','finanzas','estudio','viajes']){
  const hi=over.filter(r=>r.topic===t&&!G(r)).sort((a,b)=>b.views/b.subs-a.views/a.subs)[0];
  const lo=under.filter(r=>r.topic===t&&G(r)).sort((a,b)=>a.views/a.subs-b.views/b.subs)[0];
  if(hi) console.log(`[${t}] ALTO  ${(hi.views/hi.subs).toFixed(1)} v/s | ${hi.subs} subs | ${hi.thumb} | ${hi.title.slice(0,60)}`);
  if(lo) console.log(`[${t}] BAJO  ${(lo.views/lo.subs).toFixed(2)} v/s | ${lo.subs} subs | ${lo.thumb} | ${lo.title.slice(0,60)}`);
}
console.log('\n=== Muestra total y desglose grupos ===');
console.log('total registros', all.length, '| canales 1k-500k', small.length, '| comparados', over.length+under.length);
