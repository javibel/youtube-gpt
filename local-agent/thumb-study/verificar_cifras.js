'use strict';
const fs=require('fs');
const all=JSON.parse(fs.readFileSync('./thumb-study-classified-v2.json','utf8'));
const fmtj=JSON.parse(fs.readFileSync('./thumb-study-formato.json','utf8'));
for(const r of all) r.fmt = fmtj[r.id]?.formato || 'sin_clasificar';
const pct=(n,t)=>t?Math.round(1000*n/t)/10:0;
const G=r=>!!r.vis.cara_humana_grande;
const small=all.filter(r=>r.subs>1000&&r.subs<500000);
function corte(rows,k,min){let hi=[],lo=[];for(const c of [...new Set(rows.map(k))]){const rc=rows.filter(r=>k(r)===c);if(rc.length<min*2)continue;const s=[...rc].sort((a,b)=>(a.views/a.subs)-(b.views/b.subs));const h=Math.floor(s.length/2);lo=lo.concat(s.slice(0,h));hi=hi.concat(s.slice(s.length-h));}return{hi,lo}}

const chk=[];
const N=corte(small,r=>r.topic,6);
chk.push(['total muestra',1331,all.length]);
chk.push(['clasificados formato',1314,Object.keys(fmtj).length]);
chk.push(['solo nicho: cara ALTO',37.5,pct(N.hi.filter(G).length,N.hi.length)]);
chk.push(['solo nicho: cara BAJO',55.6,pct(N.lo.filter(G).length,N.lo.length)]);
chk.push(['solo nicho: collage ALTO',34.9,pct(N.hi.filter(r=>r.vis.collage).length,N.hi.length)]);
chk.push(['solo nicho: collage BAJO',44.4,pct(N.lo.filter(r=>r.vis.collage).length,N.lo.length)]);
chk.push(['solo nicho: emocion ALTO',15.9,pct(N.hi.filter(r=>r.vis.emocion_marcada).length,N.hi.length)]);
chk.push(['solo nicho: emocion BAJO',25,pct(N.lo.filter(r=>r.vis.emocion_marcada).length,N.lo.length)]);
chk.push(['formato documental ALTO',9.1,pct(N.hi.filter(r=>r.fmt==='documental_paisaje').length,N.hi.length)]);
chk.push(['formato documental BAJO',2.6,pct(N.lo.filter(r=>r.fmt==='documental_paisaje').length,N.lo.length)]);
chk.push(['formato a_camara ALTO',49.6,pct(N.hi.filter(r=>r.fmt==='a_camara').length,N.hi.length)]);
chk.push(['formato a_camara BAJO',58.6,pct(N.lo.filter(r=>r.fmt==='a_camara').length,N.lo.length)]);
chk.push(['formato ambiental ALTO',23.3,pct(N.hi.filter(r=>r.fmt==='ambiental_loop').length,N.hi.length)]);
chk.push(['formato ambiental BAJO',17.2,pct(N.lo.filter(r=>r.fmt==='ambiental_loop').length,N.lo.length)]);

const C=corte(small,r=>`${r.topic}|${r.fmt}`,6);
chk.push(['nicho+formato: cara ALTO',39.3,pct(C.hi.filter(G).length,C.hi.length)]);
chk.push(['nicho+formato: cara BAJO',53.6,pct(C.lo.filter(G).length,C.lo.length)]);

const A=corte(small.filter(r=>r.fmt==='a_camara'),r=>r.topic,6);
chk.push(['a camara: cara ALTO',56.6,pct(A.hi.filter(G).length,A.hi.length)]);
chk.push(['a camara: cara BAJO',70.5,pct(A.lo.filter(G).length,A.lo.length)]);

// medianas vistas/sub
const med={};
for(const t of [...new Set(small.map(r=>r.topic))]){
  const s=[...small.filter(r=>r.topic===t)].sort((a,b)=>(a.views/a.subs)-(b.views/b.subs));
  med[t]=+(s[Math.floor(s.length/2)].views/s[Math.floor(s.length/2)].subs).toFixed(2);
}
chk.push(['mediana gaming',23.49,med.gaming]);
chk.push(['mediana tecnologia',0.38,med.tecnologia]);
chk.push(['mediana cocina',0.20,med.cocina]);

let mal=0;
for(const [n,esp,real] of chk){
  const ok=Math.abs(esp-real)<0.15;
  if(!ok) mal++;
  console.log((ok?'OK  ':'MAL ')+n.padEnd(30)+' deck='+String(esp).padStart(7)+'  datos='+String(real).padStart(7));
}
console.log('\n'+(mal===0?'TODAS LAS CIFRAS DEL DECK COINCIDEN CON LOS DATOS':mal+' CIFRAS NO COINCIDEN'));
