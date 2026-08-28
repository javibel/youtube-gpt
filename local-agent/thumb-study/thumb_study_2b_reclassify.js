'use strict';
/**
 * FASE 2b — reclasificación con criterio corregido.
 *
 * Corrige el fallo detectado: el clasificador contaba a Bob Esponja y a Mario
 * como "caras humanas". Ahora separa cara humana REAL de personaje
 * animado/videojuego, que es una distinción relevante: "pon tu cara" es un
 * consejo sobre personas, no sobre avatares.
 *
 * Salida: thumb-study-classified-v2.json (reanudable)
 */
require('dotenv').config({ path: 'C:/Users/jimen/youtube-gpt/local-agent/.env' });
const fs = require('fs');
const ANTHROPIC = process.env.ANTHROPIC_API_KEY;

const PROMPT = `Analiza esta miniatura de YouTube. Responde SOLO con JSON válido, sin nada alrededor.

IMPORTANTE sobre las caras: distingue entre PERSONAS REALES (fotografía de un ser humano) y PERSONAJES (dibujos animados, personajes de videojuego, avatares, ilustraciones, muñecos). NO cuentes personajes como personas.

{
  "caras_humanas": <nº de caras de PERSONAS REALES fotografiadas>,
  "caras_personaje": <nº de caras de personajes animados/videojuego/ilustrados>,
  "cara_humana_grande": <true si una cara de persona real ocupa >15% de la imagen>,
  "emocion_marcada": <true si una cara de PERSONA REAL muestra emoción exagerada>,
  "palabras_texto": <nº de palabras de texto superpuesto añadido (NO texto natural de la escena)>,
  "texto_grande": <true si ese texto se leería fácilmente en un móvil>,
  "flecha_o_circulo": <true si hay flechas, círculos o marcas superpuestas>,
  "saturacion_alta": <true si los colores son muy saturados>,
  "collage": <true si combina varias fotos o paneles separados>,
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
          model: 'claude-haiku-4-5-20251001', max_tokens: 400,
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
  const rows = JSON.parse(fs.readFileSync('./thumb-study-raw.json', 'utf8'));
  const outPath = './thumb-study-classified-v2.json';
  let done = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : [];
  const doneIds = new Set(done.map(d => d.id));
  const pending = rows.filter(r => !doneIds.has(r.id));
  console.log(`Total ${rows.length}, hechos ${done.length}, pendientes ${pending.length}\n`);

  let inTok = 0, outTok = 0, errs = 0;
  for (let i = 0; i < pending.length; i++) {
    const r = pending[i];
    try {
      const imgRes = await fetch(r.thumb);
      if (!imgRes.ok) { errs++; continue; }
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const { v, usage, err } = await classify(buf);
      if (err) { errs++; continue; }
      inTok += usage.input_tokens; outTok += usage.output_tokens;
      done.push({ ...r, vis: v });
    } catch { errs++; }
    if ((i + 1) % 25 === 0 || i === pending.length - 1) {
      fs.writeFileSync(outPath, JSON.stringify(done, null, 2));
      console.log(`  ${i + 1}/${pending.length} | err ${errs} | ~$${((inTok/1e6)*1 + (outTok/1e6)*5).toFixed(2)}`);
    }
    await sleep(140);
  }
  fs.writeFileSync(outPath, JSON.stringify(done, null, 2));
  console.log(`\nListo: ${done.length} clasificadas, ${errs} errores.`);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
