'use strict';

/**
 * Outreach email sender — reads outreach-tracker.json, sends personalized emails
 * via Resend (hello@ytubviral.com), updates tracker with sent status.
 *
 * Usage: node outreach-send.js [--dry-run]
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { sendViaResend } = require('./resend');

const TRACKER_PATH = path.join(__dirname, 'outreach-tracker.json');
const DRY_RUN = process.argv.includes('--dry-run');

// ── HTML email builder helpers ────────────────────────────────────────────────

function scoreColor(score) {
  if (score >= 80) return '#22c55e'; // green
  if (score >= 60) return '#f59e0b'; // amber
  if (score >= 40) return '#f97316'; // orange
  return '#ef4444';                  // red
}

function scoreLabel(score, lang) {
  if (lang === 'es') {
    if (score >= 80) return 'Excelente';
    if (score >= 60) return 'Bien';
    if (score >= 40) return 'Mejorable';
    return 'Necesita trabajo';
  }
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Needs improvement';
  return 'Needs work';
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildSeoHtml(lang, name, videoTitle, videoUrl, seoScore, tips) {
  const isEs = lang === 'es';
  const tipsHtml = tips.map((t, i) => {
    const tipText = escHtml(isEs ? t.tip_es : t.tip_en);
    return `<p style="margin:0 0 8px;color:#333;font-size:15px;line-height:1.5;">${i + 1}. ${tipText}</p>`;
  }).join('');

  // Minimal plain-looking HTML — no headers, no gradients, looks like a personal email
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.6;color:#333;">
<p>${isEs ? `Hola ${escHtml(name)},` : `Hey ${escHtml(name)},`}</p>
<p>${isEs
  ? `Soy Javier &mdash; estoy construyendo una herramienta de SEO para YouTube y mientras la testeaba analic&eacute; tu video &ldquo;<a href="${escHtml(videoUrl)}" style="color:#333;">${escHtml(videoTitle)}</a>&rdquo;.`
  : `I'm Javier &mdash; building a YouTube SEO tool and was testing it on channels in your niche. Ran your video &ldquo;<a href="${escHtml(videoUrl)}" style="color:#333;">${escHtml(videoTitle)}</a>&rdquo; through it.`}</p>
<p><strong>${isEs ? `Resultado: ${seoScore}/100.` : `Score: ${seoScore}/100.`}</strong> ${isEs ? 'Los 3 puntos donde m&aacute;s podr&iacute;as mejorar:' : 'Top 3 things that would move the needle:'}</p>
${tipsHtml}
<p>${isEs ? 'Son cambios r&aacute;pidos que pueden mover el ranking.' : 'Quick fixes that can actually impact your rankings.'}</p>
<p>${isEs
  ? 'Puedes analizar cualquier video gratis aqu&iacute;: <a href="https://ytubviral.com/seo-score?utm_source=outreach&utm_medium=email" style="color:#dc2626;">ytubviral.com/seo-score</a>'
  : 'You can analyze any video for free here: <a href="https://ytubviral.com/seo-score?utm_source=outreach&utm_medium=email" style="color:#dc2626;">ytubviral.com/seo-score</a>'}</p>
<p>${isEs
  ? 'Si quieres acceso a la herramienta completa (keywords, competidores, ideas), te doy Pro gratis 1 mes (normalmente 9,99&euro;/mes). Solo dime.'
  : 'If you want the full toolkit (keywords, competitors, content ideas), I\'ll give you Pro free for 1 month (normally $10/mo). Just say the word.'}</p>
<p>Javier<br><span style="color:#999;font-size:13px;"><a href="https://ytubviral.com?utm_source=outreach&utm_medium=email" style="color:#999;">ytubviral.com</a></span></p>
</body></html>`;
}

function buildFallbackHtml(lang, name, topic) {
  const isEs = lang === 'es';
  // Minimal plain-looking HTML — looks like a personal email, not a newsletter
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.6;color:#333;">
<p>${isEs ? `Hola ${escHtml(name)},` : `Hey ${escHtml(name)},`}</p>
<p>${isEs
  ? `Soy Javier &mdash; estoy construyendo una herramienta de SEO para YouTube. Vi tu canal en el nicho de ${escHtml(topic)} y me pareci&oacute; interesante.`
  : `I'm Javier &mdash; building a YouTube SEO tool. Came across your channel in the ${escHtml(topic)} space and thought you might find this useful.`}</p>
<p>${isEs
  ? `Tenemos un analizador SEO gratuito que te dice exactamente qu&eacute; mejorar en cada video (t&iacute;tulo, descripci&oacute;n, tags) para posicionarte mejor. Si quieres probarlo: <a href="https://ytubviral.com/features/seo-score?utm_source=outreach&utm_medium=email" style="color:#dc2626;">ytubviral.com/features/seo-score</a>`
  : `We have a free SEO analyzer that tells you exactly what to fix on each video (title, description, tags) to rank better. Try it if you want: <a href="https://ytubviral.com/features/seo-score?utm_source=outreach&utm_medium=email" style="color:#dc2626;">ytubviral.com/features/seo-score</a>`}</p>
<p>${isEs
  ? 'Tambi&eacute;n puedo darte acceso Pro gratis 1 mes si te interesa &mdash; keywords, an&aacute;lisis de competidores, ideas de contenido.'
  : 'I can also give you full Pro access free for 1 month if you\'re interested &mdash; keywords, competitor analysis, content ideas.'}</p>
<p><strong>${isEs ? '&iquest;Te ser&iacute;a &uacute;til algo as&iacute;?' : 'Would something like this be useful for you?'}</strong></p>
<p>Javier<br><span style="color:#999;font-size:13px;"><a href="https://ytubviral.com?utm_source=outreach&utm_medium=email" style="color:#999;">ytubviral.com</a></span></p>
</body></html>`;
}

// ── Plain text versions (email clients that don't render HTML) ────────────────

const TEMPLATES_SEO = {
  es: {
    subject: (videoTitle, seoScore) => `${seoScore}/100 — análisis SEO de "${videoTitle.slice(0, 40)}"`,
    body: (name, videoTitle, videoUrl, seoScore, tips) => {
      const tipsText = tips.map((t, i) => `${i + 1}. ${t.tip_es}`).join('\n');
      return `Hola ${name},

Soy Javier, estoy construyendo una herramienta de SEO para YouTube y mientras la testeaba analicé tu video "${videoTitle}".

Resultado: ${seoScore}/100. Los 3 puntos donde más podrías mejorar:

${tipsText}

Son cambios rápidos que pueden mover el ranking.

Puedes analizar cualquier video gratis aquí: https://ytubviral.com/seo-score?utm_source=outreach&utm_medium=email

Si quieres la herramienta completa (keywords, competidores, ideas), te doy Pro gratis 1 mes (normalmente 9,99€/mes). Solo dime.

Javier
https://ytubviral.com?utm_source=outreach&utm_medium=email`;
    },
  },
  en: {
    subject: (videoTitle, seoScore) => `${seoScore}/100 — SEO analysis of "${videoTitle.slice(0, 40)}"`,
    body: (name, videoTitle, videoUrl, seoScore, tips) => {
      const tipsText = tips.map((t, i) => `${i + 1}. ${t.tip_en}`).join('\n');
      return `Hey ${name},

I'm Javier — building a YouTube SEO tool and was testing it on channels in your niche. Ran your video "${videoTitle}" through it.

Score: ${seoScore}/100. Top 3 things that would move the needle:

${tipsText}

Quick fixes that can actually impact your rankings.

You can analyze any video for free here: https://ytubviral.com/seo-score?utm_source=outreach&utm_medium=email

If you want the full toolkit (keywords, competitors, content ideas), I'll give you Pro free for 1 month (normally $10/mo). Just say the word.

Javier
https://ytubviral.com?utm_source=outreach&utm_medium=email`;
    },
  },
};

// Fallback templates for contacts without video data (legacy contacts)
const TEMPLATES_FALLBACK = {
  es: {
    subject: 'Pregunta rápida sobre tu canal',
    body: (name, topic) => `Hola ${name},

Soy Javier — estoy construyendo una herramienta de SEO para YouTube. Vi tu canal en el nicho de ${topic} y me pareció interesante.

Tenemos un analizador SEO gratuito que te dice exactamente qué mejorar en cada video (título, descripción, tags) para posicionarte mejor. Si quieres probarlo: https://ytubviral.com/features/seo-score?utm_source=outreach&utm_medium=email

También puedo darte acceso Pro gratis 1 mes si te interesa — keywords, análisis de competidores, ideas de contenido.

¿Te sería útil algo así?

Javier
ytubviral.com`,
  },
  en: {
    subject: 'Quick question about your channel',
    body: (name, topic) => `Hey ${name},

I'm Javier — building a YouTube SEO tool. Came across your channel in the ${topic} space and thought you might find this useful.

We have a free SEO analyzer that tells you exactly what to fix on each video (title, description, tags) to rank better. Try it if you want: https://ytubviral.com/features/seo-score?utm_source=outreach&utm_medium=email

I can also give you full Pro access free for 1 month if you're interested — keywords, competitor analysis, content ideas.

Would something like this be useful for you?

Javier
ytubviral.com`,
  },
};

async function runOutreachSend() {
  const tracker = JSON.parse(fs.readFileSync(TRACKER_PATH, 'utf-8'));
  const toSend = tracker.contacts.filter(c => c.email && c.status === 'pending-email');

  if (toSend.length === 0) {
    console.log('[outreach] No pending contacts with emails to send.');
    return { sent: 0 };
  }

  const dryRun = DRY_RUN;
  console.log(`[outreach] ${dryRun ? 'DRY RUN — ' : ''}Sending to ${toSend.length} contacts...\n`);

  // Max 10 emails per run (Resend allows 100/day on free tier)
  const batch = toSend.slice(0, 10);
  let sent = 0;
  for (const contact of batch) {
    const firstName = contact.name.split(' ')[0].split('/')[0].trim();
    const lang = contact.lang || 'en';

    // Only send emails with real SEO data — skip contacts without analysis
    if (!contact.latestVideo || !contact.seoScore || !contact.seoTips?.length) {
      console.log(`  ⏭ ${contact.name} <${contact.email}> — skipped (no SEO data)`);
      continue;
    }

    const tpl = TEMPLATES_SEO[lang] || TEMPLATES_SEO.en;
    const subject = tpl.subject(contact.latestVideo.title, contact.seoScore);
    const body = tpl.body(firstName, contact.latestVideo.title, contact.latestVideo.url, contact.seoScore, contact.seoTips);
    const html = buildSeoHtml(lang, firstName, contact.latestVideo.title, contact.latestVideo.url, contact.seoScore, contact.seoTips);
    console.log(`  → ${contact.name} <${contact.email}> [${lang}] SEO: ${contact.seoScore}/100`);

    if (dryRun) {
      console.log(`    [DRY RUN] Would send: "${subject}"\n`);
      continue;
    }

    try {
      const result = await sendViaResend({
        to: contact.email,
        subject,
        body,
        html,
        from: 'hello',
        replyTo: 'hello@ytubviral.com',
        bcc: process.env.OWNER_EMAIL || 'ytbeviral@gmail.com',
      });
      console.log(`    ✓ Sent (id: ${result.id})`);
      contact.status = 'sent';
      contact.dateSent = new Date().toISOString().split('T')[0];
      contact.dateFollowUp = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
      sent++;
    } catch (err) {
      console.error(`    ✗ Failed: ${err.message}`);
      contact.notes += ` | Send failed ${new Date().toISOString().split('T')[0]}: ${err.message}`;
    }

    // Small delay between sends to avoid rate limits
    if (!dryRun) await new Promise(r => setTimeout(r, 1500));
  }

  // Update stats
  tracker.meta.stats.totalSent += sent;

  // Save tracker
  fs.writeFileSync(TRACKER_PATH, JSON.stringify(tracker, null, 2));
  console.log(`\n[outreach] Done. ${sent} emails sent. Tracker updated.`);
  return { sent };
}

if (require.main === module) {
  runOutreachSend().catch(err => {
    console.error('[outreach] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { runOutreachSend };
