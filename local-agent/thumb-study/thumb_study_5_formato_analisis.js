'use strict';
/**
 * FASE 5 — ¿sobrevive algún efecto al controlar por FORMATO?
 *
 * Tres análisis:
 *   1. Reparto de formatos entre grupo ALTO y BAJO  -> ¿confirma la sospecha?
 *   2. Corte alto/bajo DENTRO de cada celda nicho×formato, luego agregado.
 *   3. Test limpio: solo vídeos "a_camara" (donde la persona sale sí o sí),
 *      corte dentro de nicho. Ahí la pregunta "¿cara grande?" es real.
 */
const fs = require('fs');
const all = JSON.parse(fs.readFileSync('./thumb-study-classified-v2.json', 'utf8'));
const fmt = JSON.parse(fs.readFileSync('./thumb-study-formato.json', 'utf8'));
for (const r of all) r.fmt = fmt[r.id]?.formato || 'sin_clasificar';

const pct = (n, t) => t ? Math.round(1000 * n / t) / 10 : 0;
function erf(x){const a1=.254829592,a2=-.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429;const t=1/(1+.3275911*Math.abs(x));const y=1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);return x>=0?y:-y;}
function zTest(x1,n1,x2,n2){if(!n1||!n2)return 1;const p=(x1+x2)/(n1+n2);const se=Math.sqrt(p*(1-p)*(1/n1+1/n2));if(!se)return 1;const z=(x1/n1-x2/n2)/se;return 2*(1-.5*(1+erf(Math.abs(z)/Math.SQRT2)));}
const sig = p => p<0.001?'***':p<0.01?'**':p<0.05?'*':'   ';

const FEATS = [
  ['Cara humana grande', r => !!r.vis.cara_humana_grande],
  ['Cara persona real',  r => (r.vis.caras_humanas||0) >= 1],
  ['Emocion exagerada',  r => !!r.vis.emocion_marcada],
  ['Collage',            r => !!r.vis.collage],
  ['Texto superpuesto',  r => (r.vis.palabras_texto||0) > 0],
  ['Flecha o circulo',   r => !!r.vis.flecha_o_circulo],
  ['Colores saturados',  r => !!r.vis.saturacion_alta],
];

const small = all.filter(r => r.subs > 1000 && r.subs < 500000);

function cortarPor(rows, claveFn, minPorGrupo) {
  let hi = [], lo = [];
  const celdas = [...new Set(rows.map(claveFn))];
  const detalle = [];
  for (const c of celdas) {
    const rc = rows.filter(r => claveFn(r) === c);
    if (rc.length < minPorGrupo * 2) { detalle.push([c, rc.length, 'excluida']); continue; }
    const s = [...rc].sort((a, b) => (a.views/a.subs) - (b.views/b.subs));
    const h = Math.floor(s.length / 2);
    lo = lo.concat(s.slice(0, h)); hi = hi.concat(s.slice(s.length - h));
    detalle.push([c, rc.length, `${h} vs ${h}`]);
  }
  return { hi, lo, detalle };
}

function tabla(titulo, hi, lo) {
  console.log(`\n${'='.repeat(74)}\n${titulo}  —  ALTO n=${hi.length} vs BAJO n=${lo.length}\n${'='.repeat(74)}`);
  console.log('Caracteristica'.padEnd(22) + 'ALTO'.padStart(8) + 'BAJO'.padStart(9) + 'dif'.padStart(9) + '  sig');
  console.log('-'.repeat(74));
  for (const [name, fn] of FEATS) {
    const xa = hi.filter(fn).length, xb = lo.filter(fn).length;
    const pa = pct(xa, hi.length), pb = pct(xb, lo.length);
    const p = zTest(xa, hi.length, xb, lo.length);
    console.log(name.padEnd(22) + `${pa}%`.padStart(8) + `${pb}%`.padStart(9) + `${(pa-pb).toFixed(1)}`.padStart(9) + '  ' + sig(p));
  }
}

// ---------- 1. Reparto de formatos entre ALTO y BAJO (corte solo por nicho) ----------
const porNicho = cortarPor(small, r => r.topic, 6);
console.log('='.repeat(74));
console.log('1. REPARTO DE FORMATOS en el corte por nicho (la sospecha)');
console.log('='.repeat(74));
console.log('formato'.padEnd(22) + 'ALTO'.padStart(8) + 'BAJO'.padStart(9));
for (const f of [...new Set(small.map(r => r.fmt))].sort()) {
  console.log(f.padEnd(22) + `${pct(porNicho.hi.filter(r=>r.fmt===f).length, porNicho.hi.length)}%`.padStart(8)
    + `${pct(porNicho.lo.filter(r=>r.fmt===f).length, porNicho.lo.length)}%`.padStart(9));
}
tabla('1b. Resultado SIN controlar formato (lo que teniamos)', porNicho.hi, porNicho.lo);

// ---------- 2. Corte dentro de nicho x formato ----------
const porCelda = cortarPor(small, r => `${r.topic}|${r.fmt}`, 6);
console.log(`\n${'='.repeat(74)}\n2. CELDAS nicho x formato usadas (min 6 por grupo)\n${'='.repeat(74)}`);
porCelda.detalle.filter(d => d[2] !== 'excluida').forEach(d => console.log(`  ${d[0].padEnd(34)} n=${String(d[1]).padStart(3)}  -> ${d[2]}`));
console.log(`  (excluidas por muestra: ${porCelda.detalle.filter(d=>d[2]==='excluida').length} celdas)`);
tabla('2b. CONTROLANDO NICHO + FORMATO', porCelda.hi, porCelda.lo);

// ---------- 3. Test limpio: solo a_camara ----------
const aCam = small.filter(r => r.fmt === 'a_camara');
const soloCam = cortarPor(aCam, r => r.topic, 6);
console.log(`\n${'='.repeat(74)}\n3. TEST LIMPIO — solo videos "a camara" (n=${aCam.length} en canales 1k-500k)\n   corte dentro de cada nicho\n${'='.repeat(74)}`);
soloCam.detalle.filter(d => d[2] !== 'excluida').forEach(d => console.log(`  ${d[0].padEnd(20)} n=${String(d[1]).padStart(3)}  -> ${d[2]}`));
tabla('3b. Solo a camara', soloCam.hi, soloCam.lo);
