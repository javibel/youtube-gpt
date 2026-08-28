'use strict';
/**
 * FASE 4 — clasificación por FORMATO del vídeo (cuarta capa de control).
 *
 * Motivo: estratificar por nicho NO bastó. Dentro de cada nicho conviven
 * formatos con economías de audiencia radicalmente distintas (un "study with
 * me" de 2 h se consume en bucle y lo ve gente no suscrita; un tutorial a
 * cámara no). El corte alto/bajo de vistas/sub separaba formatos, no miniaturas.
 *
 * CLAVE METODOLÓGICA: el formato se clasifica SOLO con título + duración,
 * SIN mirar la miniatura. Si mirase la miniatura, "no se ve una cara" influiría
 * en la etiqueta de formato y el control sería tautológico.
 *
 * Salida: thumb-study-formato.json  { id: {formato, confianza} }  (reanudable)
 */
const fs = require('fs');

// .env a mano (sin depender de dotenv en el scratchpad)
const envTxt = fs.readFileSync('C:/Users/jimen/youtube-gpt/local-agent/.env', 'utf8');
const ANTHROPIC = (envTxt.match(/^\s*ANTHROPIC_API_KEY\s*=\s*(.+)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, '');
if (!ANTHROPIC) { console.error('Falta ANTHROPIC_API_KEY'); process.exit(1); }

const PROMPT_HEAD = `Clasifica cada vídeo de YouTube por su FORMATO de producción, usando SOLO el título, la duración y el nicho. No inventes: si el título no lo deja claro, usa "otro" y baja la confianza.

Categorías (elige exactamente una):
- "a_camara": una persona habla a cámara. Vlog, tutorial hablado, opinión, reacción, entrevista, rutina guiada con entrenador visible.
- "pantalla": lo que se ve es una pantalla o un plano cenital de trabajo. Screencast, tutorial de software, curso, plantilla de Excel, gameplay, unboxing en mesa, receta en cenital.
- "ambiental_loop": pensado para dejarlo de fondo. Study with me, lofi, ASMR, white noise, música, pomodoro, sonidos de lluvia, "1 hour", "2 hours" de ambiente.
- "documental_paisaje": recorrido, b-roll, cinemático, destino, documental. El protagonista es el lugar o el tema, no un presentador.
- "animacion_edicion": animación, resumen animado de un libro, compilación montada, listicle editado sin presentador.
- "otro": no encaja o el título no da información suficiente.

Responde SOLO con un array JSON, un objeto por vídeo, en el MISMO orden que la entrada:
[{"i":<índice>,"formato":"<categoría>","confianza":<0.0-1.0>}]`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function classifyBatch(batch, tries = 3) {
  const lista = batch.map((r, i) =>
    `${i}. [${r.topic}] [${Math.round(r.secs / 60)} min] ${r.title.replace(/\s+/g, ' ').slice(0, 140)}`
  ).join('\n');
  for (let t = 0; t < tries; t++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 4000,
          messages: [{ role: 'user', content: `${PROMPT_HEAD}\n\nVídeos:\n${lista}` }],
        }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error.message);
      const txt = (d.content?.[0]?.text || '').trim().replace(/^```json\s*|\s*```$/g, '').trim();
      const arr = JSON.parse(txt);
      if (!Array.isArray(arr)) throw new Error('no es array');
      return { arr, usage: d.usage };
    } catch (e) {
      if (t === tries - 1) return { err: e.message };
      await sleep(2000 * (t + 1));
    }
  }
}

async function main() {
  const rows = JSON.parse(fs.readFileSync('./thumb-study-classified-v2.json', 'utf8'));
  const outPath = './thumb-study-formato.json';
  const done = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : {};
  const pending = rows.filter(r => !done[r.id]);
  console.log(`Total ${rows.length}, hechos ${Object.keys(done).length}, pendientes ${pending.length}\n`);

  const SIZE = 40;
  let inTok = 0, outTok = 0, errs = 0;
  for (let i = 0; i < pending.length; i += SIZE) {
    const batch = pending.slice(i, i + SIZE);
    const { arr, usage, err } = await classifyBatch(batch);
    if (err) { errs += batch.length; console.log(`  lote ${i}: ERROR ${err}`); continue; }
    inTok += usage.input_tokens; outTok += usage.output_tokens;
    for (const o of arr) {
      const r = batch[o.i];
      if (r) done[r.id] = { formato: o.formato, confianza: o.confianza };
    }
    fs.writeFileSync(outPath, JSON.stringify(done, null, 1));
    console.log(`  ${Math.min(i + SIZE, pending.length)}/${pending.length} | err ${errs} | ~$${((inTok / 1e6) * 1 + (outTok / 1e6) * 5).toFixed(3)}`);
    await sleep(300);
  }
  console.log(`\nListo: ${Object.keys(done).length} clasificados, ${errs} fallos.`);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
