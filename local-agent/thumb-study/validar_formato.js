'use strict';
// Validación a ojo: muestra aleatoria para revisar el clasificador de formato.
const fs = require('fs');
const all = JSON.parse(fs.readFileSync('./thumb-study-classified-v2.json', 'utf8'));
const fmt = JSON.parse(fs.readFileSync('./thumb-study-formato.json', 'utf8'));
const n = Number(process.argv[2] || 30);
const conF = all.filter(r => fmt[r.id]);
console.log('Reparto global:');
const cnt = {};
for (const r of conF) { const f = fmt[r.id].formato; cnt[f] = (cnt[f]||0)+1; }
Object.entries(cnt).sort((a,b)=>b[1]-a[1]).forEach(([f,c]) => console.log(`  ${f.padEnd(22)} ${String(c).padStart(4)}  ${Math.round(1000*c/conF.length)/10}%`));
const baja = conF.filter(r => fmt[r.id].confianza < 0.7).length;
console.log(`\nConfianza <0.7: ${baja} (${Math.round(1000*baja/conF.length)/10}%)`);
console.log(`\nMuestra aleatoria de ${n} para revisar a ojo:\n`);
const sh = [...conF].sort(() => Math.random() - 0.5).slice(0, n);
for (const r of sh) {
  const f = fmt[r.id];
  console.log(`[${f.formato}] (${f.confianza}) ${Math.round(r.secs/60)}min | ${r.topic}`);
  console.log(`    ${r.title.slice(0, 90)}`);
}
