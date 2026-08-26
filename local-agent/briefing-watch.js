/**
 * Briefing watch — ¿vuelve alguien tras recibir las ideas diarias?
 *
 * El briefing de ideas empezó a enviarse el 26/08/2026 (ver memoria
 * project-daily-ideas-briefing). Toda la tesis depende de una sola pregunta:
 * si un creador recibe ideas de su propio canal cada mañana, ¿vuelve?
 *
 * Esto lo mide y avisa a Javier. Solo manda email cuando hay algo que contar:
 * alguien ha vuelto, o se cumple el plazo de una semana sin que vuelva nadie
 * (que también es una respuesta, y la que cierra la tesis).
 *
 * Cron: 19:00 diario (index.js).
 */
'use strict';

require('dotenv').config();
const db = require('./db');
const { sendViaResend } = require('./resend');

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? 'ytbeviral@gmail.com';
const INICIO = '2026-08-26'; // primer envío
const DIAS_VEREDICTO = 7;

async function runBriefingWatch() {
  const rows = await db.query(`
    WITH act AS (
      SELECT "userId", "createdAt" AS ts, 'generación' AS tipo FROM generations
      UNION ALL SELECT "userId", "createdAt", 'chat' FROM chat_messages
      UNION ALL SELECT "userId", "analyzedAt", 'SEO score' FROM video_seo_scores
      UNION ALL SELECT "userId", "createdAt", 'preview' FROM video_previews
      UNION ALL SELECT "userId", "createdAt", 'optimización' FROM optimize_history
    )
    SELECT u.email,
      (SELECT COUNT(*) FROM email_logs el
        WHERE el."userId" = u.id AND el.sequence = 'daily-ideas') AS briefings,
      (SELECT COUNT(*) FROM act a
        WHERE a."userId" = u.id AND a.ts >= $1::date) AS acciones_desde,
      (SELECT MAX(a.ts) FROM act a WHERE a."userId" = u.id) AS ultima,
      (SELECT string_agg(DISTINCT a.tipo, ', ') FROM act a
        WHERE a."userId" = u.id AND a.ts >= $1::date) AS que_hizo
    FROM users u
    WHERE EXISTS (SELECT 1 FROM email_logs el
                  WHERE el."userId" = u.id AND el.sequence = 'daily-ideas')
    ORDER BY u.email
  `, [INICIO]);

  if (!rows.length) {
    console.log('[briefing-watch] Nadie ha recibido el briefing todavía.');
    return { volvieron: 0, avisado: false };
  }

  // Las cuentas de Javier no cuentan como señal.
  const propias = ['ytbeviral@', 'javibel', 'cwsdcrtest@'];
  const externos = rows.filter(r => !propias.some(p => r.email.toLowerCase().includes(p)));
  const volvieron = externos.filter(r => Number(r.acciones_desde) > 0);

  const dias = Math.floor((Date.now() - new Date(INICIO).getTime()) / 86400000);
  console.log(`[briefing-watch] día ${dias} — ${volvieron.length}/${externos.length} externos han vuelto`);

  const hayNoticia = volvieron.length > 0;
  const toca_veredicto = dias >= DIAS_VEREDICTO;
  if (!hayNoticia && !toca_veredicto) return { volvieron: 0, avisado: false };

  const linea = r => `  ${r.email} — ${r.briefings} briefing(s) recibidos | ${r.acciones_desde} acciones desde el ${INICIO}${r.que_hizo ? ` (${r.que_hizo})` : ''} | última actividad: ${r.ultima ? new Date(r.ultima).toISOString().slice(0, 10) : 'nunca'}`;

  const subject = hayNoticia
    ? `✅ ${volvieron.length} usuario(s) han vuelto tras el briefing`
    : `⚠️ Briefing: ${dias} días y nadie ha vuelto`;

  const body = hayNoticia
    ? `HAN VUELTO (día ${dias} desde el primer briefing)\n\n${volvieron.map(linea).join('\n')}\n\nResto:\n${externos.filter(r => !volvieron.includes(r)).map(linea).join('\n') || '  —'}\n\nEs la primera señal de retención real desde abril. Ojo: con n=${externos.length} esto no demuestra nada, pero es la dirección correcta.\n\nAnálisis completo: cd local-agent && node user-analysis-2026-08-26.js`
    : `Han pasado ${dias} días desde el primer briefing y ninguno de los ${externos.length} externos ha vuelto.\n\n${externos.map(linea).join('\n')}\n\nEsto cierra la tesis del briefing barato: el problema no es la entrega, es el producto. Tocaría replantear qué motivo real hay para volver, no cómo se comunica.\n\nAnálisis completo: cd local-agent && node user-analysis-2026-08-26.js`;

  await sendViaResend({ to: OWNER_EMAIL, subject, body, from: 'agent' });
  console.log(`[briefing-watch] Aviso enviado: ${subject}`);
  return { volvieron: volvieron.length, avisado: true };
}

module.exports = { runBriefingWatch };

if (require.main === module) {
  runBriefingWatch()
    .then(r => { console.log(JSON.stringify(r)); process.exit(0); })
    .catch(e => { console.error(e.message); process.exit(1); });
}
