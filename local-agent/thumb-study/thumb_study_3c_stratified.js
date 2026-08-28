'use strict';
/**
 * ANÁLISIS C — estratificado POR NICHO (corrige el sesgo detectado).
 *
 * Problema del análisis B anterior: el corte por vistas/suscriptor se hacía
 * sobre TODOS los nichos juntos, y como el ratio vistas/sub varía muchísimo
 * entre nichos (gaming alto, tecnología bajo), el grupo "ALTO" acababa siendo
 * 33% gaming y 0% tecnología, y el "BAJO" 51% tecnología. Comparaba nichos,
 * no miniaturas.
 *
 * Corrección: el corte alto/bajo se hace DENTRO de cada nicho, y luego se
 * agrupan los resultados. Así cada vídeo compite solo contra vídeos de su
 * propio nicho.
 */
const fs = require('fs');
const all = JSON.parse(fs.readFileSync('./thumb-study-classified-v2.json', 'utf8'));

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

// Corte alto/bajo DENTRO de cada nicho
const small = all.filter(r => r.subs > 1000 && r.subs < 500000);
let over = [], under = [];
console.log('Corte por mediana de vistas/sub DENTRO de cada nicho:\n');
console.log('nicho          n    mediana v/s   ALTO  BAJO');
for (const t of [...new Set(small.map(r => r.topic))]) {
  const rt = small.filter(r => r.topic === t);
  if (rt.length < 12) { console.log(`${t.padEnd(13)} ${String(rt.length).padStart(3)}   (muestra insuficiente, excluido)`); continue; }
  const sorted = [...rt].sort((a, b) => (a.views/a.subs) - (b.views/b.subs));
  const half = Math.floor(sorted.length / 2);
  const lo = sorted.slice(0, half), hi = sorted.slice(sorted.length - half);
  over = over.concat(hi); under = under.concat(lo);
  const medvs = sorted[half].views / sorted[half].subs;
  console.log(`${t.padEnd(13)} ${String(rt.length).padStart(3)}   ${medvs.toFixed(2).padStart(10)}   ${String(hi.length).padStart(4)}  ${String(lo.length).padStart(4)}`);
}

console.log(`\n${'='.repeat(72)}`);
console.log(`COMPARACIÓN ESTRATIFICADA POR NICHO — ALTO n=${over.length} vs BAJO n=${under.length}`);
console.log('(cada vídeo comparado solo contra los de su propio nicho)');
console.log('='.repeat(72));
console.log('Característica'.padEnd(23) + 'ALTO'.padStart(8) + 'BAJO'.padStart(9) + 'dif'.padStart(8) + '  sig');
console.log('-'.repeat(72));
for (const [name, fn] of FEATS) {
  const xa = over.filter(fn).length, xb = under.filter(fn).length;
  const pa = pct(xa, over.length), pb = pct(xb, under.length);
  const p = zTest(xa, over.length, xb, under.length);
  const dif = (pa - pb).toFixed(1);
  console.log(name.padEnd(23) + (pa+'%').padStart(8) + (pb+'%').padStart(9) + (dif>0?'+'+dif:dif).padStart(8) + '  ' + sig(p));
}

// Comprobación: ¿los grupos están ahora equilibrados por nicho?
console.log(`\n${'-'.repeat(72)}\nComprobación de equilibrio (deben ser casi idénticos):`);
for (const t of [...new Set(over.map(r => r.topic))]) {
  console.log(`  ${t.padEnd(13)} ALTO ${pct(over.filter(r=>r.topic===t).length, over.length)}%  BAJO ${pct(under.filter(r=>r.topic===t).length, under.length)}%`);
}
