'use strict';

const db = require('./db');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const AGENT_EMAIL = process.env.AGENT_EMAIL ?? 'ytbeviral@gmail.com';
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? 'javijimenoplata@gmail.com';

async function getAccessToken() {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Gmail OAuth failed');
  return data.access_token;
}

function encodeSubject(subject) {
  // RFC 2047: encode non-ASCII Subject headers so email clients don't garble them
  if (/[^\x20-\x7E]/.test(subject)) {
    const encoded = Buffer.from(subject, 'utf-8').toString('base64');
    return `=?UTF-8?B?${encoded}?=`;
  }
  return subject;
}

function buildEmail({ to, from, subject, body }) {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: base64`,
    `MIME-Version: 1.0`,
    '',
    Buffer.from(body, 'utf-8').toString('base64'),
  ];
  const raw = lines.join('\r\n');
  return Buffer.from(raw).toString('base64url');
}

async function sendEmail(subject, body) {
  const token = await getAccessToken();
  const raw = buildEmail({
    to: OWNER_EMAIL,
    from: `YTubViral Agent <${AGENT_EMAIL}>`,
    subject,
    body,
  });
  await fetch(`${GMAIL_BASE}/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });
}

async function sendDailyReport() {
  const stats = await db.getDailyStats();

  // Posts por plataforma
  const postsLines = stats.posts.length > 0
    ? stats.posts.map(p => `  - ${p.platform}: ${p.count} publicaciones`).join('\n')
    : '  - Sin publicaciones hoy';

  // Prospectos LinkedIn
  const prospectsLines = stats.prospects.length > 0
    ? stats.prospects.map(p => `  - ${p.status}: ${p.count}`).join('\n')
    : '  - Sin prospectos aún';

  // Acciones LinkedIn del día
  const actionsLines = stats.actions.length > 0
    ? stats.actions.map(a => `  - ${a.type}: ${a.count}`).join('\n')
    : '  - Sin acciones hoy';

  // Acciones Twitter del día
  const twitterLines = stats.twitterActions?.length > 0
    ? stats.twitterActions.map(a => `  - ${a.type}: ${a.count}`).join('\n')
    : '  - Sin acciones hoy';

  // Acciones Instagram del día
  const instagramLines = stats.instagramActions?.length > 0
    ? stats.instagramActions.map(a => `  - ${a.type}: ${a.count}`).join('\n')
    : '  - Sin acciones hoy';

  // Acciones Facebook del día
  const facebookLines = stats.facebookActions?.length > 0
    ? stats.facebookActions.map(a => `  - ${a.type}: ${a.count}`).join('\n')
    : '  - Sin acciones hoy';

  // Emails
  const emailsLine = stats.emails
    ? `  - Recibidos: ${stats.emails.total} | Respondidos: ${stats.emails.replied}`
    : '  - Sin emails hoy';

  // Comentarios completos del día
  const comments = await db.getTodayComments();

  function formatComments(entries, label) {
    if (!entries || entries.length === 0) return '';
    let section = `\n--- ${label} ---\n`;
    for (const c of entries) {
      const time = new Date(c.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      section += `  [${time}] (${c.type}) ${c.content}\n`;
    }
    return section;
  }

  const allComments = [
    formatComments(comments.linkedin, 'LinkedIn'),
    formatComments(comments.twitter, 'Twitter/X'),
    formatComments(comments.instagram, 'Instagram'),
    formatComments(comments.facebook, 'Facebook'),
  ].filter(s => s).join('');

  const commentsSection = allComments
    ? allComments
    : '\n  Sin comentarios hoy\n';

  const today = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const body = `REPORTE DIARIO YTUBVIRAL — ${today.toUpperCase()}
${'='.repeat(60)}

📱 PUBLICACIONES EN REDES SOCIALES (últimas 24h)
${postsLines}

🎯 PROSPECTOS LINKEDIN (total acumulado)
${prospectsLines}

⚡ ACCIONES LINKEDIN (últimas 24h)
${actionsLines}

🐦 ACCIONES TWITTER/X (últimas 24h)
${twitterLines}

📸 ACCIONES INSTAGRAM (últimas 24h)
${instagramLines}

👥 ACCIONES FACEBOOK (últimas 24h)
${facebookLines}

📧 GMAIL (últimas 24h)
${emailsLine}

💬 COMENTARIOS Y RESPUESTAS (últimas 24h)
${'-'.repeat(60)}
${commentsSection}
${'='.repeat(60)}
Agente YTubViral — ytubviral.com
`;

  await sendEmail(`📊 Reporte Diario YTubViral — ${new Date().toLocaleDateString('es-ES')}`, body);
  console.log('[reports] Daily report sent');
}

async function sendPersonaReport() {
  const { loadPersonas, getAndClearErrors } = require('./persona-runner');
  const personas = loadPersonas();
  const errors = getAndClearErrors();
  const now = new Date();
  const timeLabel = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  const dateLabel = now.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Europe/Madrid' });

  let body = `INFORME PERSONAS — ${timeLabel} — ${dateLabel.toUpperCase()}\n${'='.repeat(60)}\n`;

  for (const persona of personas) {
    const stats = await db.getPersonaStats(persona.id);
    const comments = await db.getPersonaComments(persona.id);

    body += `\n👤 ${persona.name.toUpperCase()} (${persona.id})\n${'-'.repeat(40)}\n`;

    // Stats per platform
    for (const [platform, label] of [['twitter', 'Twitter/X'], ['facebook', 'Facebook'], ['linkedin', 'LinkedIn'], ['reddit', 'Reddit']]) {
      const platformStats = stats[platform];
      if (platformStats && platformStats.length > 0) {
        body += `  ${label}: ${platformStats.map(s => `${s.type}=${s.count}`).join(', ')}\n`;
      } else {
        body += `  ${label}: sin actividad\n`;
      }
    }

    // Comments per platform
    const hasComments = Object.values(comments).some(c => c.length > 0);
    if (hasComments) {
      body += `\n  Comentarios:\n`;
      for (const [platform, label] of [['twitter', 'Twitter'], ['facebook', 'Facebook'], ['linkedin', 'LinkedIn'], ['reddit', 'Reddit']]) {
        for (const c of comments[platform] || []) {
          const time = new Date(c.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
          const preview = c.content.length > 120 ? c.content.slice(0, 120) + '...' : c.content;
          body += `    [${time}] ${label}: ${preview}\n`;
        }
      }
    }
  }

  // Errors section
  if (errors.length > 0) {
    body += `\n⚠️ ERRORES\n${'-'.repeat(40)}\n`;
    for (const e of errors) {
      const time = new Date(e.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
      body += `  [${time}] ${e.persona} / ${e.platform}: ${e.error}\n`;
    }
  } else {
    body += `\n✅ Sin errores\n`;
  }

  body += `\n${'='.repeat(60)}\nAgente YTubViral — Personas\n`;

  await sendEmail(`👥 Informe Personas ${timeLabel} — ${now.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' })}`, body);
  console.log('[reports] Persona report sent');
}

module.exports = { sendDailyReport, sendPersonaReport, sendEmail };
