'use strict';
const fs=require('fs');
const all=JSON.parse(fs.readFileSync('./thumb-study-classified-v2.json','utf8'));
const pct=(n,t)=>t?Math.round(1000*n/t)/10:0;
const small=all.filter(r=>r.subs>1000&&r.subs<500000);
const FE={
 'cara grande': r=>!!r.vis.cara_humana_grande,
 'collage':     r=>!!r.vis.collage,
 'emocion':     r=>!!r.vis.emocion_marcada,
};
console.log('¿El efecto está repartido o concentrado en pocos nichos?\n');
console.log('nicho        n/gr   cara grande      collage        emocion');
for(const t of [...new Set(small.map(r=>r.topic))]){
  const rt=small.filter(r=>r.topic===t); if(rt.length<12)continue;
  const s=[...rt].sort((a,b)=>(a.views/a.subs)-(b.views/b.subs));
  const h=Math.floor(s.length/2); const lo=s.slice(0,h), hi=s.slice(s.length-h);
  let line=t.padEnd(12)+String(h).padStart(4)+'  ';
  for(const k of Object.keys(FE)){
    const a=pct(hi.filter(FE[k]).length,h), b=pct(lo.filter(FE[k]).length,h);
    line+=String((a-b).toFixed(1)).padStart(9)+'pp ';
  }
  console.log(line);
}
console.log('\n================================================================');
console.log('QUE SON los vídeos del grupo ALTO en los 3 nichos del efecto');
console.log('================================================================');
for(const t of ['viajes','finanzas','estudio']){
  const rt=small.filter(r=>r.topic===t);
  const s=[...rt].sort((a,b)=>(a.views/a.subs)-(b.views/b.subs));
  const h=Math.floor(s.length/2); const hi=s.slice(s.length-h);
  const sinCara=hi.filter(r=>!r.vis.cara_humana_grande).sort((a,b)=>b.views/b.subs-a.views/a.subs);
  console.log(`\n--- ${t.toUpperCase()}: los ${Math.min(8,sinCara.length)} de más rendimiento SIN cara grande`);
  sinCara.slice(0,8).forEach(r=>console.log(`   ${(r.views/r.subs).toFixed(1).padStart(7)} v/s | ${r.title.slice(0,68)}`));
}
