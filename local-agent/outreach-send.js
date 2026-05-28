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
  const color = scoreColor(seoScore);
  const label = scoreLabel(seoScore, lang);
  const barWidth = Math.max(5, Math.min(100, seoScore));
  const isEs = lang === 'es';

  const tipIcons = ['&#x1F3AF;', '&#x1F4DD;', '&#x26A1;']; // 🎯 📝 ⚡
  const tipsHtml = tips.map((t, i) => {
    const tipText = escHtml(isEs ? t.tip_es : t.tip_en);
    const icon = tipIcons[i] || '&#x2714;';
    return `<tr>
      <td style="padding:8px 12px;vertical-align:top;font-size:20px;line-height:1;">${icon}</td>
      <td style="padding:8px 0;color:#374151;font-size:15px;line-height:1.5;">${tipText}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#dc2626,#b91c1c);padding:24px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">YTubViral</td>
      <td align="right" style="color:rgba(255,255,255,0.8);font-size:13px;">${isEs ? 'An&aacute;lisis SEO gratuito' : 'Free SEO Analysis'}</td>
    </tr></table>
  </td></tr>

  <!-- Greeting -->
  <tr><td style="padding:28px 32px 12px;">
    <p style="margin:0;color:#111827;font-size:16px;line-height:1.6;">
      ${isEs ? `Hola <strong>${escHtml(name)}</strong>,` : `Hi <strong>${escHtml(name)}</strong>,`}
    </p>
    <p style="margin:12px 0 0;color:#374151;font-size:15px;line-height:1.6;">
      ${isEs
        ? `Soy Javier Jimeno, fundador de YTubViral. Analic&eacute; tu &uacute;ltimo video y estos son los resultados:`
        : `I'm Javier Jimeno, founder of YTubViral. I ran a quick SEO analysis on your latest video:`}
    </p>
  </td></tr>

  <!-- Video title -->
  <tr><td style="padding:0 32px 16px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
      <tr><td style="padding:14px 16px;">
        <p style="margin:0;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">${isEs ? 'Video analizado' : 'Video analyzed'}</p>
        <p style="margin:4px 0 0;color:#111827;font-size:15px;font-weight:600;">
          <a href="${escHtml(videoUrl)}" style="color:#111827;text-decoration:none;">${escHtml(videoTitle)}</a>
        </p>
      </td></tr>
    </table>
  </td></tr>

  <!-- Score card -->
  <tr><td style="padding:0 32px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111827;border-radius:10px;overflow:hidden;">
      <tr><td style="padding:24px 24px 12px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="color:#ffffff;font-size:14px;">${isEs ? 'Puntuaci&oacute;n SEO de YouTube' : 'YouTube SEO Score'}</td>
          <td align="right" style="color:${color};font-size:14px;font-weight:600;">${label}</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:0 24px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="color:#ffffff;font-size:48px;font-weight:800;line-height:1;">${seoScore}</td>
          <td style="color:#9ca3af;font-size:20px;vertical-align:bottom;padding-bottom:6px;">/100</td>
          <td width="100%"></td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:12px 24px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#374151;border-radius:6px;height:10px;">
          <tr><td style="width:${barWidth}%;background:${color};border-radius:6px;height:10px;"></td>
          <td style="height:10px;"></td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- Tips -->
  <tr><td style="padding:0 32px 8px;">
    <p style="margin:0;color:#111827;font-size:16px;font-weight:700;">
      ${isEs ? 'Los 3 puntos donde m&aacute;s puedes mejorar:' : 'Top 3 areas for improvement:'}
    </p>
  </td></tr>
  <tr><td style="padding:0 20px 20px;">
    <table width="100%" cellpadding="0" cellspacing="0">${tipsHtml}</table>
  </td></tr>

  <!-- CTA -->
  <tr><td style="padding:0 32px 28px;" align="center">
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.5;">
      ${isEs
        ? 'Estos ajustes son r&aacute;pidos y pueden marcar una diferencia real en c&oacute;mo YouTube posiciona tu contenido.'
        : 'These are quick fixes that can make a real difference in how YouTube ranks your content.'}
    </p>
    <table cellpadding="0" cellspacing="0"><tr><td style="background:#dc2626;border-radius:8px;">
      <a href="https://ytubviral.com/features/seo-score?utm_source=email&utm_medium=outreach&utm_campaign=creator-outreach?utm_source=email&utm_medium=outreach&utm_campaign=creator-outreach" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
        ${isEs ? 'Ver an&aacute;lisis completo gratis &rarr;' : 'See full analysis free &rarr;'}
      </a>
    </td></tr></table>
    <p style="margin:14px 0 0;color:#9ca3af;font-size:13px;">
      ${isEs
        ? 'Reg&iacute;strate y responde con tu email — te doy Pro gratis 3 meses.'
        : 'Sign up and reply with your email — I\'ll give you free Pro for 3 months.'}
    </p>
  </td></tr>

  <!-- Divider -->
  <tr><td style="padding:0 32px;"><hr style="border:none;border-top:1px solid #e5e7eb;margin:0;"></td></tr>

  <!-- Footer -->
  <tr><td style="padding:20px 32px 24px;">
    <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.5;">
      ${isEs
        ? 'Sin compromiso. Si te sirve, genial. Si no, espero que al menos estos tips te sean &uacute;tiles.'
        : 'No strings attached. If it helps, great. If not, I hope these tips are useful regardless.'}
    </p>
    <p style="margin:16px 0 0;color:#374151;font-size:14px;line-height:1.4;">
      Javier Jimeno<br>
      <span style="color:#6b7280;">${isEs ? 'Fundador' : 'Founder'}, <a href="https://ytubviral.com?utm_source=email&utm_medium=outreach&utm_campaign=creator-outreach" style="color:#dc2626;text-decoration:none;">YTubViral</a></span>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

function buildFallbackHtml(lang, name, topic) {
  const isEs = lang === 'es';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#dc2626,#b91c1c);padding:24px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">YTubViral</td>
      <td align="right" style="color:rgba(255,255,255,0.8);font-size:13px;">${isEs ? 'Herramienta SEO gratuita' : 'Free SEO Tool'}</td>
    </tr></table>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:28px 32px;">
    <p style="margin:0;color:#111827;font-size:16px;line-height:1.6;">
      ${isEs ? `Hola <strong>${escHtml(name)}</strong>,` : `Hi <strong>${escHtml(name)}</strong>,`}
    </p>
    <p style="margin:14px 0;color:#374151;font-size:15px;line-height:1.6;">
      ${isEs
        ? `Soy Javier Jimeno, fundador de YTubViral. Estoy contactando a creadores como t&uacute; en el espacio de <strong>${escHtml(topic)}</strong> porque creo que nuestra herramienta puede ayudarte.`
        : `I'm Javier Jimeno, founder of YTubViral. I'm reaching out to creators like you in the <strong>${escHtml(topic)}</strong> space because I think our tool can genuinely help.`}
    </p>
    <p style="margin:14px 0;color:#374151;font-size:15px;line-height:1.6;">
      ${isEs
        ? 'YTubViral tiene una herramienta de <strong>SEO Score gratuita</strong> &mdash; analizas cualquiera de tus videos y te dice exactamente qu&eacute; mejorar en t&iacute;tulo, descripci&oacute;n, tags y thumbnail para posicionarte mejor.'
        : 'YTubViral has a <strong>free SEO Score tool</strong> &mdash; analyze any of your videos and get actionable tips on what to improve in your title, description, tags, and thumbnail to rank better.'}
    </p>
  </td></tr>

  <!-- CTA -->
  <tr><td style="padding:0 32px 28px;" align="center">
    <table cellpadding="0" cellspacing="0"><tr><td style="background:#dc2626;border-radius:8px;">
      <a href="https://ytubviral.com/features/seo-score?utm_source=email&utm_medium=outreach&utm_campaign=creator-outreach?utm_source=email&utm_medium=outreach&utm_campaign=creator-outreach" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
        ${isEs ? 'Probar SEO Score gratis &rarr;' : 'Try SEO Score free &rarr;'}
      </a>
    </td></tr></table>
    <p style="margin:14px 0 0;color:#9ca3af;font-size:13px;">
      ${isEs
        ? 'Si te interesa el paquete completo, te doy Pro gratis 3 meses. Solo reg&iacute;strate y responde con tu email.'
        : 'Want the full suite? I\'ll give you Pro free for 3 months. Just sign up and reply with your email.'}
    </p>
  </td></tr>

  <!-- Divider -->
  <tr><td style="padding:0 32px;"><hr style="border:none;border-top:1px solid #e5e7eb;margin:0;"></td></tr>

  <!-- Footer -->
  <tr><td style="padding:20px 32px 24px;">
    <p style="margin:0;color:#374151;font-size:14px;line-height:1.4;">
      Javier Jimeno<br>
      <span style="color:#6b7280;">${isEs ? 'Fundador' : 'Founder'}, <a href="https://ytubviral.com?utm_source=email&utm_medium=outreach&utm_campaign=creator-outreach" style="color:#dc2626;text-decoration:none;">YTubViral</a></span>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

// ── Plain text versions (email clients that don't render HTML) ────────────────

const TEMPLATES_SEO = {
  es: {
    subject: (videoTitle, seoScore) => `Tu video tiene un ${seoScore}/100 en SEO — te muestro cómo subirlo`,
    body: (name, videoTitle, videoUrl, seoScore, tips) => {
      const tipsText = tips.map((t, i) => `${i + 1}. ${t.tip_es}`).join('\n');
      return `Hola ${name},

Soy Javier Jimeno, fundador de YTubViral. Analicé tu último video "${videoTitle}" y tiene un ${seoScore}/100 en SEO de YouTube.

Estos son los 3 puntos donde más puedes mejorar:

${tipsText}

Estos ajustes son rápidos y pueden marcar una diferencia real en cómo YouTube posiciona tu contenido.

Ver análisis completo gratis: https://ytubviral.com/features/seo-score?utm_source=email&utm_medium=outreach&utm_campaign=creator-outreach

Si quieres el paquete completo (keywords, retención, thumbnails, ideas de contenido), te doy acceso Pro gratis 3 meses — solo regístrate y responde con tu email de registro.

Sin compromiso. Si te sirve, genial. Si no, espero que al menos estos tips te sean útiles.

Un saludo,
Javier Jimeno
Fundador, YTubViral
https://ytubviral.com?utm_source=email&utm_medium=outreach&utm_campaign=creator-outreach`;
    },
  },
  en: {
    subject: (videoTitle, seoScore) => `Your video scored ${seoScore}/100 on YouTube SEO — here's how to fix it`,
    body: (name, videoTitle, videoUrl, seoScore, tips) => {
      const tipsText = tips.map((t, i) => `${i + 1}. ${t.tip_en}`).join('\n');
      return `Hi ${name},

I'm Javier Jimeno, founder of YTubViral. I ran a quick analysis on your latest video "${videoTitle}" and it scored ${seoScore}/100 on YouTube SEO.

Here are the 3 areas with the biggest room for improvement:

${tipsText}

These are quick fixes that can make a real difference in how YouTube ranks your content.

See full analysis free: https://ytubviral.com/features/seo-score?utm_source=email&utm_medium=outreach&utm_campaign=creator-outreach

If you'd like the full suite (keywords, retention, thumbnails, content ideas), I'll give you free Pro access for 3 months — just sign up and reply with your registration email.

No strings attached. If it helps, great. If not, I hope these tips are useful regardless.

Best,
Javier Jimeno
Founder, YTubViral
https://ytubviral.com?utm_source=email&utm_medium=outreach&utm_campaign=creator-outreach`;
    },
  },
};

// Fallback templates for contacts without video data (legacy contacts)
const TEMPLATES_FALLBACK = {
  es: {
    subject: 'Herramienta SEO gratuita para tu canal — YTubViral',
    body: (name, topic) => `Hola ${name},

Soy Javier Jimeno, fundador de YTubViral. Estoy contactando a creadores como tú en el espacio de ${topic} porque creo que nuestra herramienta puede ayudarte.

YTubViral tiene una herramienta de SEO Score gratuita — analizas cualquiera de tus videos y te dice exactamente qué mejorar en título, descripción, tags y thumbnail para posicionarte mejor.

Pruébala gratis en https://ytubviral.com/features/seo-score?utm_source=email&utm_medium=outreach&utm_campaign=creator-outreach

Si te interesa el paquete completo (keywords, ideas de contenido, retención), te doy Pro gratis 3 meses. Solo regístrate y responde con tu email.

Un saludo,
Javier Jimeno
Fundador, YTubViral
https://ytubviral.com?utm_source=email&utm_medium=outreach&utm_campaign=creator-outreach`,
  },
  en: {
    subject: 'Free SEO tool for your channel — YTubViral',
    body: (name, topic) => `Hi ${name},

I'm Javier Jimeno, founder of YTubViral. I'm reaching out to creators like you in the ${topic} space because I think our tool can genuinely help.

YTubViral has a free SEO Score tool — analyze any of your videos and get actionable tips on what to improve in your title, description, tags, and thumbnail to rank better.

Try it free at https://ytubviral.com/features/seo-score?utm_source=email&utm_medium=outreach&utm_campaign=creator-outreach

If you'd like the full suite (keywords, content ideas, retention analysis), I'll give you Pro free for 3 months. Just sign up and reply with your email.

Best,
Javier Jimeno
Founder, YTubViral
https://ytubviral.com?utm_source=email&utm_medium=outreach&utm_campaign=creator-outreach`,
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

    // Choose template based on whether we have video SEO data
    let subject, body, html;
    if (contact.latestVideo && contact.seoScore && contact.seoTips?.length > 0) {
      // Value-upfront: personalized SEO analysis
      const tpl = TEMPLATES_SEO[lang] || TEMPLATES_SEO.en;
      subject = tpl.subject(contact.latestVideo.title, contact.seoScore);
      body = tpl.body(firstName, contact.latestVideo.title, contact.latestVideo.url, contact.seoScore, contact.seoTips);
      html = buildSeoHtml(lang, firstName, contact.latestVideo.title, contact.latestVideo.url, contact.seoScore, contact.seoTips);
      console.log(`  → ${contact.name} <${contact.email}> [${lang}] SEO: ${contact.seoScore}/100 [HTML]`);
    } else {
      // Fallback: lead with free SEO Score tool
      const tpl = TEMPLATES_FALLBACK[lang] || TEMPLATES_FALLBACK.en;
      const topic = contact.niche || 'YouTube';
      subject = tpl.subject;
      body = tpl.body(firstName, topic);
      html = buildFallbackHtml(lang, firstName, topic);
      console.log(`  → ${contact.name} <${contact.email}> [${lang}] (no video data — using fallback) [HTML]`);
    }

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
