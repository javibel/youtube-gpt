'use strict';
// 6 miniaturas para el juego de apertura: mismo nicho y formato,
// 3 del grupo ALTO sin cara grande, 3 del BAJO con cara grande.
const fs=require('fs');
const all=JSON.parse(fs.readFileSync('./thumb-study-classified-v2.json','utf8'));
const fmt=JSON.parse(fs.readFileSync('./thumb-study-formato.json','utf8'));
for(const r of all) r.fmt=fmt[r.id]?.formato||'?';
const small=all.filter(r=>r.subs>1000&&r.subs<500000);
const G=r=>!!r.vis.cara_humana_grande;

for(const nicho of ['viajes','finanzas','fitness']){
  const rc=small.filter(r=>r.topic===nicho && r.fmt==='a_camara');
  if(rc.length<12) continue;
  const s=[...rc].sort((a,b)=>(a.views/a.subs)-(b.views/b.subs));
  const h=Math.floor(s.length/2);
  const lo=s.slice(0,h), hi=s.slice(s.length-h);
  const A=hi.filter(r=>!G(r)).sort((a,b)=>b.views/b.subs-a.views/a.subs).slice(0,3);
  const B=lo.filter(G).sort((a,b)=>a.views/a.subs-b.views/b.subs).slice(0,3);
  if(A.length<3||B.length<3) continue;
  console.log('\n=== '+nicho.toUpperCase()+' (a cámara) ===');
  console.log('ALTO, sin cara grande:');
  A.forEach(r=>console.log('  '+(r.views/r.subs).toFixed(1).padStart(7)+' v/s  '+r.thumb));
  console.log('BAJO, con cara grande:');
  B.forEach(r=>console.log('  '+(r.views/r.subs).toFixed(2).padStart(7)+' v/s  '+r.thumb));
  const out={nicho, alto:A.map(r=>({u:r.thumb.replace('maxresdefault','mqdefault'),vs:+(r.views/r.subs).toFixed(1)})),
                    bajo:B.map(r=>({u:r.thumb.replace('maxresdefault','mqdefault'),vs:+(r.views/r.subs).toFixed(2)}))};
  fs.writeFileSync('juego-'+nicho+'.json',JSON.stringify(out));
}
