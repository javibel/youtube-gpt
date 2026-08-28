'use strict';
const fs = require('fs');
const all = JSON.parse(fs.readFileSync('./thumb-study-classified-v2.json', 'utf8'));
const balancedIds = new Set(JSON.parse(fs.readFileSync('./thumb-study-raw.backup.json', 'utf8')).map(r => r.id));

const med = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m-1]+s[m])/2; };
const pct = (n, t) => t ? Math.round(1000 * n / t) / 10 : 0;
function erf(x){const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429;const t=1/(1+0.3275911*Math.abs(x));const y=1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);return x>=0?y:-y;}
function zTest(x1,n1,x2,n2){if(!n1||!n2)return 1;const p=(x1+x2)/(n1+n2);const se=Math.sqrt(p*(1-p)*(1/n1+1/n2));if(!se)return 1;const z=(x1/n1-x2/n2)/se;return 2*(1-0.5*(1+erf(Math.abs(z)/Math.SQRT2)));}
const sig = p => p < 0.001 ? '***' : p < 0.01 ? '**' : p < 0.05 ? '*' : '   ';

const FEATS = [
  ['Cara de PERSONA real',  r => (r.vis.caras_humanas || 0) >= 1],
  ['Cara de personaje',     r => (r.vis.caras_personaje || 0) >= 1],
  ['Cara humana grande',    r => !!r.vis.cara_humana_grande],
  ['Emoción exagerada',     r => !!r.vis.emocion_marcada],
  ['Texto superpuesto',     r => (r.vis.palabras_texto || 0) > 0],
  ['Texto grande',          r => !!r.vis.texto_grande],
  ['Flecha o círculo',      r => !!r.vis.flecha_o_circulo],
  ['Colores saturados',     r => !!r.vis.saturacion_alta],
  ['Collage',               r => !!r.vis.collage],
];

function compare(title, gA, gB, la, lb) {
  console.log(`\n${title}`);
  console.log(`${la} n=${gA.length}  vs  ${lb} n=${gB.length}`);
  console.log('-'.repeat(70));
  for (const [name, fn] of FEATS) {
    const xa = gA.filter(fn).length, xb = gB.filter(fn).length;
    const pa = pct(xa, gA.length), pb = pct(xb, gB.length);
    const p = zTest(xa, gA.length, xb, gB.length);
    const dif = (pa - pb).toFixed(1);
    console.log(name.padEnd(23) + (pa+'%').padStart(8) + (pb+'%').padStart(9) + (dif>0?'+'+dif:dif).padStart(8) + '  ' + sig(p));
  }
}

function analiza(rows, etiqueta) {
  console.log(`\n${'#'.repeat(70)}\n### ${etiqueta}  (n=${rows.length})\n${'#'.repeat(70)}`);
  compare('A) MÁS VISTOS vs CORRIENTES (confundido por tamaño de canal)',
    rows.filter(r => r.grupo === 'TOP'), rows.filter(r => r.grupo === 'NORMAL'), 'TOP', 'NORMAL');

  const small = rows.filter(r => r.subs > 1000 && r.subs < 500000);
  const ratios = small.map(r => r.views / r.subs).sort((a,b) => a-b);
  const q75 = ratios[Math.floor(ratios.length*0.75)], q25 = ratios[Math.floor(ratios.length*0.25)];
  const over = small.filter(r => r.views/r.subs >= q75), under = small.filter(r => r.views/r.subs <= q25);
  compare('B) CANALES 1k-500k SUBS: los que MÁS rinden vs los que MENOS  [LA BUENA]',
    over, under, 'ALTO', 'BAJO');
}

analiza(all.filter(r => balancedIds.has(r.id)), 'MUESTRA EQUILIBRADA (664 originales)');
analiza(all, 'MUESTRA AMPLIADA (945, desequilibrada por nicho)');

console.log(`\n${'='.repeat(70)}\nCARAS: personas reales vs personajes, por nicho\n${'='.repeat(70)}`);
for (const t of [...new Set(all.map(r => r.topic))]) {
  const rt = all.filter(r => r.topic === t);
  console.log(`${t.padEnd(12)} n=${String(rt.length).padStart(3)}  persona real: ${String(pct(rt.filter(r=>(r.vis.caras_humanas||0)>=1).length, rt.length)).padStart(5)}%   personaje: ${pct(rt.filter(r=>(r.vis.caras_personaje||0)>=1).length, rt.length)}%`);
}
console.log(`\nConfianza media: ${(all.reduce((s,r)=>s+(r.vis.confianza||0),0)/all.length).toFixed(2)}`);
