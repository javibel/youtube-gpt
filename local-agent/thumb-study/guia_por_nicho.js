'use strict';
/* Material para el vídeo prescriptivo: para cada nicho,
   (a) EL ESTÁNDAR  = qué hace todo el mundo (toda la muestra del nicho, n grande)
   (b) LO QUE DIFERENCIA = corte alto/bajo dentro del nicho (n pequeño, con test)  */
const fs=require('fs');
const all=JSON.parse(fs.readFileSync('./thumb-study-classified-v2.json','utf8'));
const fmt=JSON.parse(fs.readFileSync('./thumb-study-formato.json','utf8'));
for(const r of all) r.fmt=fmt[r.id]?.formato||'?';
const pct=(n,t)=>t?Math.round(1000*n/t)/10:0;
function erf(x){const a1=.254829592,a2=-.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429;const t=1/(1+.3275911*Math.abs(x));const y=1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);return x>=0?y:-y;}
function zT(x1,n1,x2,n2){if(!n1||!n2)return 1;const p=(x1+x2)/(n1+n2),se=Math.sqrt(p*(1-p)*(1/n1+1/n2));if(!se)return 1;return 2*(1-.5*(1+erf(Math.abs(x1/n1-x2/n2)/se/Math.SQRT2)));}

const F=[
 ['cara humana',      r=>(r.vis.caras_humanas||0)>=1],
 ['cara GRANDE',      r=>!!r.vis.cara_humana_grande],
 ['personaje',        r=>(r.vis.caras_personaje||0)>=1],
 ['emocion fuerte',   r=>!!r.vis.emocion_marcada],
 ['texto',            r=>(r.vis.palabras_texto||0)>0],
 ['texto grande',     r=>!!r.vis.texto_grande],
 ['flecha/circulo',   r=>!!r.vis.flecha_o_circulo],
 ['saturacion alta',  r=>!!r.vis.saturacion_alta],
 ['collage',          r=>!!r.vis.collage],
];
const small=all.filter(r=>r.subs>1000&&r.subs<500000);
const NICHOS=['gaming','fitness','tecnologia','belleza','viajes','finanzas','estudio','cocina'];

for(const t of NICHOS){
  const todos=all.filter(r=>r.topic===t);
  const rc=small.filter(r=>r.topic===t);
  const s=[...rc].sort((a,b)=>(a.views/a.subs)-(b.views/b.subs));
  const h=Math.floor(s.length/2);
  const lo=s.slice(0,h), hi=s.slice(s.length-h);
  console.log('\n'+'='.repeat(78));
  console.log(t.toUpperCase()+`   estándar n=${todos.length}   ·   comparación ${h} vs ${h}`);
  console.log('='.repeat(78));
  console.log('característica      ESTÁNDAR    ALTO    BAJO     dif   sig');
  for(const [n,fn] of F){
    const est=pct(todos.filter(fn).length,todos.length);
    const a=pct(hi.filter(fn).length,h), b=pct(lo.filter(fn).length,h);
    const p=zT(hi.filter(fn).length,h,lo.filter(fn).length,h);
    const sg=p<0.01?'**':p<0.05?'*':p<0.15?'.':'';
    console.log(n.padEnd(18)+`${est}%`.padStart(8)+`${a}%`.padStart(8)+`${b}%`.padStart(8)+`${(a-b).toFixed(1)}`.padStart(8)+'   '+sg);
  }
  // formato dominante del nicho
  const fc={}; todos.forEach(r=>{fc[r.fmt]=(fc[r.fmt]||0)+1});
  const top=Object.entries(fc).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([k,v])=>`${k} ${pct(v,todos.length)}%`).join(' · ');
  console.log('formato dominante : '+top);
}
