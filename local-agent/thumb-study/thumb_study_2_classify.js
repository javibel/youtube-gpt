'use strict';
/**
 * ESTUDIO DE MINIATURAS — FASE 2: clasificación visual.
 * Reanudable: guarda progreso cada 20 imágenes en thumb-study-classified.json
 */
require('dotenv').config({ path: 'C:/Users/jimen/youtube-gpt/local-agent/.env' });
const fs = require('fs');
const ANTHROPIC = process.env.ANTHROPIC_API_KEY;

const PROMPT = `Analiza esta miniatura de YouTube. Responde SOLO con JSON válido, sin nada alrededor:
{
  "caras": <nº de caras humanas claramente visibles>,
  "cara_grande": <true si alguna cara ocupa >15% de la imagen>,
  "emocion_marcada": <true si alguna cara muestra emoción exagerada (sorpresa, shock, alegría intensa)>,
  "palabras_texto": <nº de palabras de texto superpuesto añadido (NO cuentes texto que forme parte natural de la escena, como carteles o marcas)>,
  "texto_grande": <true si ese texto ocupa una porción notable y se leería en móvil>,
  "flecha_o_circulo": <true si hay flechas, círculos o marcas de señalización superpuestas>,
  "saturacion_alta": <true si los colores son muy saturados/vivos>,
  "collage": <true si la imagen combina varias fotos/paneles separados>,
  "confianza": <0.0-1.0>
}`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function classify(buf, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: buf.toString('base64') } },
            { type: 'text', text: PROMPT },
          ] }],
        }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error.message);
      const txt = (d.content?.[0]?.text || '').trim().replace(/^```json\s*|\s*```$/g, '');
      return { v: JSON.parse(txt), usage: d.usage };
    } catch (e) {
      if (i === tries - 1) return { err: e.message };
      await sleep(1500 * (i + 1));
    }
  }
}

async function main() {
  const rows = require('./thumb-study-raw.json');
  const outPath = './thumb-study-classified.json';
  let done = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : [];
  const doneIds = new Set(done.map(d => d.id));
  const pending = rows.filter(r => !doneIds.has(r.id));
  console.log(`Total ${rows.length}, ya hechos ${done.length}, pendientes ${pending.length}\n`);

  let inTok = 0, outTok = 0, errs = 0;
  for (let i = 0; i < pending.length; i++) {
    const r = pending[i];
    try {
      const imgRes = await fetch(r.thumb);
      if (!imgRes.ok) { errs++; continue; }
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const { v, usage, err } = await classify(buf);
      if (err) { errs++; console.log(`  ! ${r.id}: ${err}`); continue; }
      inTok += usage.input_tokens; outTok += usage.output_tokens;
      done.push({ ...r, vis: v });
    } catch (e) { errs++; }

    if ((i + 1) % 20 === 0 || i === pending.length - 1) {
      fs.writeFileSync(outPath, JSON.stringify(done, null, 2));
      const cost = (inTok / 1e6) * 1.0 + (outTok / 1e6) * 5.0;
      console.log(`  ${i + 1}/${pending.length} clasificadas | errores ${errs} | coste acum ~$${cost.toFixed(2)}`);
    }
    await sleep(150);
  }
  fs.writeFileSync(outPath, JSON.stringify(done, null, 2));
  console.log(`\nListo. ${done.length} clasificadas, ${errs} errores.`);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
