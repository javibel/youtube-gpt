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

// ── Value-upfront templates (include SEO analysis of their latest video) ────

const TEMPLATES_SEO = {
  es: {
    subject: (videoTitle) => `Tu video "${videoTitle.slice(0, 40)}..." — análisis SEO gratuito`,
    body: (name, videoTitle, videoUrl, seoScore, tips) => {
      const tipsText = tips.map((t, i) => `${i + 1}. ${t.tip_es}`).join('\n');
      return `Hola ${name},

Soy Javier Jimeno, fundador de YTubViral. Analicé tu último video "${videoTitle}" y tiene un ${seoScore}/100 en SEO de YouTube.

Estos son los 3 puntos donde más puedes mejorar:

${tipsText}

Estos ajustes son rápidos y pueden marcar una diferencia real en cómo YouTube posiciona tu contenido.

Si quieres ver el análisis completo (keywords, retención, thumbnails, ideas de contenido), te doy acceso Pro gratis 1 mes en https://ytubviral.com — solo regístrate y responde con tu email de registro.

Sin compromiso. Si te sirve, genial. Si no, espero que al menos estos tips te sean útiles.

Un saludo,
Javier Jimeno
Fundador, YTubViral
https://ytubviral.com`;
    },
  },
  en: {
    subject: (videoTitle) => `Your video "${videoTitle.slice(0, 40)}..." — free SEO analysis`,
    body: (name, videoTitle, videoUrl, seoScore, tips) => {
      const tipsText = tips.map((t, i) => `${i + 1}. ${t.tip_en}`).join('\n');
      return `Hi ${name},

I'm Javier Jimeno, founder of YTubViral. I ran a quick analysis on your latest video "${videoTitle}" and it scored ${seoScore}/100 on YouTube SEO.

Here are the 3 areas with the biggest room for improvement:

${tipsText}

These are quick fixes that can make a real difference in how YouTube ranks your content.

If you'd like to see the full analysis (keywords, retention, thumbnails, content ideas), I'll give you free Pro access for 1 month at https://ytubviral.com — just sign up and reply with your registration email.

No strings attached. If it helps, great. If not, I hope these tips are useful regardless.

Best,
Javier Jimeno
Founder, YTubViral
https://ytubviral.com`;
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

Pruébala gratis en https://ytubviral.com/features/seo-score

Si te interesa el paquete completo (keywords, ideas de contenido, retención), te doy Pro gratis 1 mes. Solo regístrate y responde con tu email.

Un saludo,
Javier Jimeno
Fundador, YTubViral
https://ytubviral.com`,
  },
  en: {
    subject: 'Free SEO tool for your channel — YTubViral',
    body: (name, topic) => `Hi ${name},

I'm Javier Jimeno, founder of YTubViral. I'm reaching out to creators like you in the ${topic} space because I think our tool can genuinely help.

YTubViral has a free SEO Score tool — analyze any of your videos and get actionable tips on what to improve in your title, description, tags, and thumbnail to rank better.

Try it free at https://ytubviral.com/features/seo-score

If you'd like the full suite (keywords, content ideas, retention analysis), I'll give you Pro free for 1 month. Just sign up and reply with your email.

Best,
Javier Jimeno
Founder, YTubViral
https://ytubviral.com`,
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

  // Max 5 emails per run to stay under Resend rate limits
  const batch = toSend.slice(0, 5);
  let sent = 0;
  for (const contact of batch) {
    const firstName = contact.name.split(' ')[0].split('/')[0].trim();
    const lang = contact.lang || 'en';

    // Choose template based on whether we have video SEO data
    let subject, body;
    if (contact.latestVideo && contact.seoScore && contact.seoTips?.length > 0) {
      // Value-upfront: personalized SEO analysis
      const tpl = TEMPLATES_SEO[lang] || TEMPLATES_SEO.en;
      subject = tpl.subject(contact.latestVideo.title);
      body = tpl.body(firstName, contact.latestVideo.title, contact.latestVideo.url, contact.seoScore, contact.seoTips);
      console.log(`  → ${contact.name} <${contact.email}> [${lang}] SEO: ${contact.seoScore}/100`);
    } else {
      // Fallback: lead with free SEO Score tool
      const tpl = TEMPLATES_FALLBACK[lang] || TEMPLATES_FALLBACK.en;
      const topic = contact.niche || 'YouTube';
      subject = tpl.subject;
      body = tpl.body(firstName, topic);
      console.log(`  → ${contact.name} <${contact.email}> [${lang}] (no video data — using fallback)`);
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
        from: 'hello',
        replyTo: 'hello@ytubviral.com',
      });
      console.log(`    ✓ Sent (id: ${result.id})`);
      contact.status = 'sent';
      contact.dateSent = new Date().toISOString().split('T')[0];
      contact.dateFollowUp = new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0];
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
