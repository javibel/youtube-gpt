'use strict';
/**
 * CAMPAÑA DE FEEDBACK MANUAL — 24/08/2026
 *
 * Javier escribe a los usuarios registrados para entender por qué no vuelven
 * (solo 4 de 67 han vuelto un día distinto). NO vende nada: pide una respuesta
 * de una línea y ofrece 1 mes de Pro a quien conteste.
 *
 * Contexto que justifica el tono: el agente automático de feedback ya envió
 * 61 solicitudes con formulario y obtuvo 0 respuestas. Por eso este email es
 * personal, corto, y lo reconoce explícitamente.
 *
 * Requisitos previos (ya hechos):
 *  - feedback-campaign-guard.json creado y gmail.js parcheado, para que las
 *    respuestas NO reciban auto-respuesta de IA.
 *  - Dominio ytubviral.com verificado en Resend; javier@ enruta al Gmail de Javier.
 *
 * Uso:  node send-feedback-campaign.js --dry     (simula, no envía)
 *       node send-feedback-campaign.js --send    (envía de verdad)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { query } = require('./db');

const RESEND = process.env.RESEND_API_KEY;
const FROM = 'Javier <javier@ytubviral.com>';
const DRY = !process.argv.includes('--send');
const LOG = path.join(__dirname, 'feedback-campaign-sent.json');

// Reconoce el email automático anterior: suma credibilidad en vez de restarla.
const PREVIO_ES = 'Puede que hace unas semanas te llegara un correo automático nuestro pidiéndote opinión con un formulario. Este no es ese: lo escribo yo.';
const PREVIO_EN = 'You may have received an automated email from us a while back asking for feedback through a form. This isn\'t that one — I\'m writing this myself.';

const T = {
  es: {
    D: {
      subject: '¿qué te frenó?',
      body: n => `Hola ${n},

Soy Javier, el que hace YTubViral. ${PREVIO_ES}

Vi que te registraste y no llegaste a usar la herramienta. No te escribo para venderte nada — necesito entender qué pasó, y eres de las pocas personas que me lo puede decir.

¿Qué te frenó? Con una palabra me vale:

- No entendí qué hacía
- Me pidió conectar mi canal y no me fío
- No era lo que buscaba
- Me distraje y se me olvidó
- Otra cosa

Si me contestas te activo un mes de Pro, por las molestias.

Gracias,
Javier`,
    },
    C: {
      subject: 'la probaste una vez y no volviste',
      body: n => `Hola ${n},

Soy Javier, el que hace YTubViral. ${PREVIO_ES}

Vi que probaste la herramienta una vez y no volviste. Eso me interesa más que cualquier métrica, porque el número me dice qué pasó pero no por qué.

¿Qué faltó? Una línea me sirve:

- El resultado no fue lo bastante bueno
- Me sirvió, pero no me acordé de volver
- Solo lo necesitaba para un vídeo concreto
- Esperaba otra cosa
- Otra

Estoy decidiendo en qué trabajar los próximos meses y prefiero hacerlo con lo que me digáis que adivinando. Si me contestas te activo un mes de Pro.

Gracias,
Javier`,
    },
    B: {
      subject: 'le sacaste partido y no volviste — quiero entender por qué',
      body: n => `Hola ${n},

Soy Javier, el que hace YTubViral. ${PREVIO_ES}

Te escribo porque eres un caso raro: usaste la herramienta varias veces el mismo día, así que algo te aportó. Y aun así no volviste.

Eso es justo lo que no consigo explicarme, y es la pregunta más importante que tengo ahora mismo.

¿Qué habría hecho falta para que volvieras la semana siguiente? Puede ser una función que falta, que se te olvidara, o que sencillamente no lo necesitas tan a menudo. Cualquier respuesta me vale, incluidas las incómodas.

Si me contestas te activo un mes de Pro.

Gracias,
Javier`,
    },
    A: {
      subject: 'eres de los 4',
      body: n => `Hola ${n},

Soy Javier, el que hace YTubViral. ${PREVIO_ES}

Te escribo porque de todas las personas registradas, solo cuatro habéis vuelto en un día distinto. Eres una de ellas.

Eso te convierte en la persona cuya opinión más me importa ahora mismo, así que voy directo: ¿qué le falta para que valga la pena pagarla?

Y si la respuesta es "nada, no la pagaría", también quiero saberlo. Me sirve más una respuesta sincera que una amable.

Te activo un mes de Pro por haber vuelto, contestes lo que contestes.

Gracias,
Javier`,
    },
  },
  en: {
    D: { subject: 'what stopped you?', body: n => `Hi ${n},\n\nI'm Javier, the guy behind YTubViral. ${PREVIO_EN}\n\nI noticed you signed up but never got to use the tool. I'm not writing to sell you anything — I need to understand what happened, and you're one of the few people who can tell me.\n\nWhat stopped you? One word works:\n\n- Didn't understand what it did\n- It asked me to connect my channel and I wasn't comfortable\n- Not what I was looking for\n- Got distracted and forgot\n- Something else\n\nIf you reply I'll switch on a free month of Pro for you.\n\nThanks,\nJavier` },
    C: { subject: 'you tried it once and never came back', body: n => `Hi ${n},\n\nI'm Javier, the guy behind YTubViral. ${PREVIO_EN}\n\nI noticed you tried the tool once and never came back. That interests me more than any metric, because the number tells me what happened but not why.\n\nWhat was missing? One line is enough:\n\n- The output wasn't good enough\n- It helped, but I forgot to come back\n- I only needed it for one specific video\n- I expected something different\n- Other\n\nI'm deciding what to work on over the next months and I'd rather use what you tell me than guess. If you reply I'll switch on a free month of Pro.\n\nThanks,\nJavier` },
    B: { subject: 'you got value out of it and didn\'t return', body: n => `Hi ${n},\n\nI'm Javier, the guy behind YTubViral. ${PREVIO_EN}\n\nI'm writing because you're an unusual case: you used the tool several times in one day, so something clicked. And still you never came back.\n\nThat's exactly what I can't explain, and it's the most important question I have right now.\n\nWhat would it have taken for you to come back the following week? A missing feature, forgetting, or simply not needing this very often — any answer works, including uncomfortable ones.\n\nIf you reply I'll switch on a free month of Pro.\n\nThanks,\nJavier` },
    A: { subject: "you're one of the 4", body: n => `Hi ${n},\n\nI'm Javier, the guy behind YTubViral. ${PREVIO_EN}\n\nI'm writing because out of everyone who signed up, only four of you have come back on a different day. You're one of them.\n\nThat makes you the person whose opinion matters most to me right now, so I'll be direct: what's missing for this to be worth paying for?\n\nAnd if the answer is "nothing, I wouldn't pay for it" — I want to know that too. An honest answer helps me more than a kind one.\n\nA free month of Pro is on me for coming back, whatever you answer.\n\nThanks,\nJavier` },
  },
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const firstName = full => (full || '').trim().split(/\s+/)[0] || 'hola';

async function sendOne(to, subject, text) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND}` },
    body: JSON.stringify({ from: FROM, to: [to], reply_to: 'javier@ytubviral.com', subject, text }),
  });
  const d = await res.json();
  if (d.error || !d.id) throw new Error(JSON.stringify(d.error || d).slice(0, 200));
  return d.id;
}

async function main() {
  if (!RESEND) { console.error('Falta RESEND_API_KEY'); process.exit(1); }

  // Exclusiones. NO se escriben aquí: este repo es PÚBLICO y serían datos
  // personales expuestos. Viven en feedback-campaign-exclude.json, que está
  // en .gitignore.
  //   - cuentas propias de Javier/del agente: escribirles no aporta nada y
  //     además contaminaban las métricas (el 43% de las generaciones eran suyas)
  //   - dominios desechables: solo generan rebotes, y los rebotes dañan la
  //     reputación del dominio (que también envía los códigos de verificación)
  const exclPath = path.join(__dirname, 'feedback-campaign-exclude.json');
  const excl = fs.existsSync(exclPath) ? JSON.parse(fs.readFileSync(exclPath, 'utf8')) : { emails: [], domains: [] };
  const PROPIAS = (excl.emails || []).map(e => e.toLowerCase());
  const DOMINIOS_FAKE = (excl.domains || []).map(d => d.toLowerCase());

  const rowsRaw = await query(`
    SELECT u.id, u.name, u.email, COALESCE(u.lang,'es') lang,
      (SELECT COUNT(*)::int FROM generations g WHERE g."userId"=u.id) gens,
      (SELECT COUNT(DISTINCT DATE(g."createdAt"))::int FROM generations g WHERE g."userId"=u.id) dias
    FROM users u
    WHERE u."emailVerified" IS NOT NULL AND COALESCE(u."marketingOptOut", false) = false
    ORDER BY u."createdAt"`);

  const rows = rowsRaw.filter(u => {
    const e = u.email.toLowerCase();
    if (PROPIAS.includes(e)) return false;
    if (DOMINIOS_FAKE.includes(e.split('@')[1])) return false;
    return true;
  });
  console.log(`Excluidos: ${rowsRaw.length - rows.length} (cuentas propias y dominios desechables)`);

  const sent = fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, 'utf8')) : [];
  const done = new Set(sent.map(s => s.email));

  console.log(`${DRY ? '### SIMULACRO (no se envía nada) ###' : '### ENVÍO REAL ###'}`);
  console.log(`Destinatarios: ${rows.length} | ya enviados antes: ${done.size}\n`);

  let ok = 0, err = 0;
  for (const u of rows) {
    if (done.has(u.email)) { console.log(`  omitido (ya enviado): ${u.email}`); continue; }
    const seg = u.dias >= 2 ? 'A' : u.gens >= 3 ? 'B' : u.gens >= 1 ? 'C' : 'D';
    const lang = u.lang === 'en' ? 'en' : 'es';
    const tpl = T[lang][seg];
    const name = firstName(u.name);
    const subject = tpl.subject;
    const text = tpl.body(name);

    if (DRY) {
      console.log(`  [${seg}/${lang}] ${u.email.padEnd(34)} "${subject}"`);
      ok++;
      continue;
    }
    try {
      const id = await sendOne(u.email, subject, text);
      sent.push({ email: u.email, seg, lang, id, at: new Date().toISOString() });
      fs.writeFileSync(LOG, JSON.stringify(sent, null, 2));
      console.log(`  OK  [${seg}/${lang}] ${u.email}  (${id})`);
      ok++;
      await sleep(1200); // ritmo humano, mejor entregabilidad
    } catch (e) {
      console.error(`  ERR [${seg}] ${u.email}: ${e.message}`);
      err++;
    }
  }
  console.log(`\n${DRY ? 'Simulacro' : 'Envío'} terminado: ${ok} ok, ${err} errores.`);
  if (DRY) console.log('Para enviar de verdad:  node send-feedback-campaign.js --send');
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
