'use strict';
/**
 * ESTUDIO DE MINIATURAS — FASE 3: análisis.
 *
 * Dos comparaciones:
 *  A) TOP vs NORMAL  -> qué hacen los ganadores (CONFUNDIDO por tamaño de canal)
 *  B) Dentro de canales de tamaño parecido, sobrerrendimiento alto vs bajo
 *     (vistas/suscriptor) -> aísla mucho mejor el efecto de la miniatura
 */
const fs = require('fs');
const rows = JSON.parse(fs.readFileSync('./thumb-study-classified.json', 'utf8'));

const med = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m-1]+s[m])/2; };
const pct = (n, t) => t ? Math.round(1000 * n / t) / 10 : 0;

const FEATS = [
  ['Tiene ≥1 cara',        r => r.vis.caras >= 1],
  ['Cara grande',          r => !!r.vis.cara_grande],
  ['Emoción exagerada',    r => !!r.vis.emocion_marcada],
  ['Texto superpuesto',    r => r.vis.palabras_texto > 0],
  ['Texto grande',         r => !!r.vis.texto_grande],
  ['Flecha o círculo',     r => !!r.vis.flecha_o_circulo],
  ['Colores saturados',    r => !!r.vis.saturacion_alta],
  ['Collage',              r => !!r.vis.collage],
];

// Test de proporciones (z) para dos grupos independientes
function zTest(x1, n1, x2, n2) {
  if (!n1 || !n2) return { z: 0, p: 1 };
  const p1 = x1 / n1, p2 = x2 / n2;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (!se) return { z: 0, p: 1 };
  const z = (p1 - p2) / se;
  // p bilateral vía aproximación de la normal
  const pv = 2 * (1 - 0.5 * (1 + erf(Math.abs(z) / Math.SQRT2)));
  return { z, p: pv };
}
function erf(x) {
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t * t * Math.exp(-x * x) * 0 - 0;
  // Abramowitz-Stegun 7.1.26
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429;
  const tt=1/(1+0.3275911*x);
  return 1-(((((a5*tt+a4)*tt)+a3)*tt+a2)*tt+a1)*tt*Math.exp(-x*x);
}
function sig(p) { return p < 0.001 ? '***' : p < 0.01 ? '**' : p < 0.05 ? '*' : '   '; }

function compare(title, gA, gB, labelA, labelB) {
  console.log(`\n${'='.repeat(78)}\n${title}\n${'='.repeat(78)}`);
  console.log(`${labelA}: n=${gA.length}   |   ${labelB}: n=${gB.length}\n`);
  console.log('Característica'.padEnd(22) + labelA.padStart(9) + labelB.padStart(11) + '   dif'.padStart(8) + '   sig');
  console.log('-'.repeat(78));
  for (const [name, fn] of FEATS) {
    const xa = gA.filter(fn).length, xb = gB.filter(fn).length;
    const pa = pct(xa, gA.length), pb = pct(xb, gB.length);
    const { p } = zTest(xa, gA.length, xb, gB.length);
    const dif = (pa - pb).toFixed(1);
    console.log(
      name.padEnd(22) +
      (pa + '%').padStart(9) +
      (pb + '%').padStart(11) +
      (dif > 0 ? '+' + dif : dif).padStart(8) + '   ' + sig(p)
    );
  }
  // Nº medio de palabras de texto
  console.log('-'.repeat(78));
  console.log('Palabras de texto (mediana)'.padEnd(22) +
    String(med(gA.map(r => r.vis.palabras_texto))).padStart(9) +
    String(med(gB.map(r => r.vis.palabras_texto))).padStart(11));
}

// ── A) TOP vs NORMAL ──
const top = rows.filter(r => r.grupo === 'TOP');
const normal = rows.filter(r => r.grupo === 'NORMAL');
compare('A) LOS MÁS VISTOS vs VÍDEOS CORRIENTES  (ojo: confundido por tamaño de canal)',
  top, normal, 'TOP', 'NORMAL');

// ── B) Dentro de canales pequeños/medianos: sobrerrendimiento ──
// Nos quedamos con canales < 500k subs para comparar peras con peras.
const small = rows.filter(r => r.subs > 1000 && r.subs < 500000);
const ratios = small.map(r => r.views / r.subs).sort((a, b) => a - b);
const q75 = ratios[Math.floor(ratios.length * 0.75)];
const q25 = ratios[Math.floor(ratios.length * 0.25)];
const over = small.filter(r => (r.views / r.subs) >= q75);
const under = small.filter(r => (r.views / r.subs) <= q25);
compare('B) CANALES DE TAMAÑO SIMILAR (1k-500k subs): los que MÁS rinden vs los que MENOS',
  over, under, 'ALTO', 'BAJO');
console.log(`\nCorte: alto rendimiento >= ${q75.toFixed(2)} vistas/sub | bajo <= ${q25.toFixed(2)}`);

// ── Contexto ──
console.log(`\n${'='.repeat(78)}\nCONTEXTO DE LA MUESTRA\n${'='.repeat(78)}`);
console.log(`Total clasificadas: ${rows.length}`);
console.log(`Confianza media del clasificador: ${(rows.reduce((s, r) => s + (r.vis.confianza || 0), 0) / rows.length).toFixed(2)}`);
console.log(`Baja confianza (<0.7): ${rows.filter(r => (r.vis.confianza || 0) < 0.7).length}`);
console.log(`Subs mediana TOP: ${med(top.map(r => r.subs)).toLocaleString('es-ES')}`);
console.log(`Subs mediana NORMAL: ${med(normal.map(r => r.subs)).toLocaleString('es-ES')}`);
console.log(`\nPor nicho (n de cada uno):`);
const topics = [...new Set(rows.map(r => r.topic))];
for (const t of topics) {
  const rt = rows.filter(r => r.topic === t);
  console.log(`  ${t.padEnd(12)} n=${String(rt.length).padStart(3)}  con cara: ${pct(rt.filter(r => r.vis.caras >= 1).length, rt.length)}%`);
}
