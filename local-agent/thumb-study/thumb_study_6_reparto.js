'use strict';
// ¿El efecto de "cara humana grande" está REPARTIDO o concentrado otra vez?
const fs = require('fs');
const all = JSON.parse(fs.readFileSync('./thumb-study-classified-v2.json','utf8'));
const fmt = JSON.parse(fs.readFileSync('./thumb-study-formato.json','utf8'));
for (const r of all) r.fmt = fmt[r.id]?.formato || 'sin_clasificar';
const pct=(n,t)=>t?Math.round(1000*n/t)/10:0;
const G = r => !!r.vis.cara_humana_grande;
const small = all.filter(r => r.subs>1000 && r.subs<500000);

function desglose(titulo, rows, claveFn, minG) {
  console.log(`\n${titulo}`);
  console.log('celda'.padEnd(32)+'n/gr'.padStart(5)+'ALTO'.padStart(8)+'BAJO'.padStart(8)+'dif'.padStart(9));
  let aFav=0, enContra=0, nulas=0;
  for (const c of [...new Set(rows.map(claveFn))].sort()) {
    const rc = rows.filter(r => claveFn(r)===c);
    if (rc.length < minG*2) continue;
    const s=[...rc].sort((a,b)=>(a.views/a.subs)-(b.views/b.subs));
    const h=Math.floor(s.length/2);
    const lo=s.slice(0,h), hi=s.slice(s.length-h);
    const a=pct(hi.filter(G).length,h), b=pct(lo.filter(G).length,h);
    const d=+(a-b).toFixed(1);
    if (d<=-5) aFav++; else if (d>=5) enContra++; else nulas++;
    console.log(c.padEnd(32)+String(h).padStart(5)+`${a}%`.padStart(8)+`${b}%`.padStart(8)+String(d).padStart(9));
  }
  console.log(`  -> celdas a favor (<=-5pp): ${aFav} | en contra (>=+5pp): ${enContra} | planas: ${nulas}`);
}

desglose('A) Por celda NICHO x FORMATO (min 6 por grupo)', small, r=>`${r.topic}|${r.fmt}`, 6);
desglose('B) Solo videos A CAMARA, por nicho (min 6 por grupo)', small.filter(r=>r.fmt==='a_camara'), r=>r.topic, 6);
desglose('C) Solo videos A CAMARA, por nicho (min 4 por grupo, mas celdas)', small.filter(r=>r.fmt==='a_camara'), r=>r.topic, 4);
