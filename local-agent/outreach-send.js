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

// ── Plain text templates (no HTML — personal emails get higher reply rates) ──

const TEMPLATES_SEO = {
  es: {
    subject: (videoTitle) => `Idea rápida para "${videoTitle.slice(0, 45)}"`,
    body: (name, videoTitle, videoUrl, seoScore, tips) => {
      const topTip = tips[0] ? tips[0].tip_es : 'Optimizar el título para incluir tu keyword principal';
      return `Hola ${name},

Vi tu video "${videoTitle}" y lo pasé por una herramienta SEO que estoy creando. El cambio más rápido que podrías hacer: ${topTip.toLowerCase()}.

Si quieres ver el análisis completo (puntuación, keywords, comparativa), puedes probarlo gratis aquí — sin registro:

https://ytubviral.com/seo-score?utm_source=outreach&utm_medium=email

¿Te resulta útil?

Javier`;
    },
  },
  en: {
    subject: (videoTitle) => `Quick tip for "${videoTitle.slice(0, 45)}"`,
    body: (name, videoTitle, videoUrl, seoScore, tips) => {
      const topTip = tips[0] ? tips[0].tip_en : 'Optimize your title to include your main keyword';
      return `Hey ${name},

Watched your video "${videoTitle}" and ran it through a YouTube SEO tool I'm building. The quickest win I spotted: ${topTip.toLowerCase()}.

If you want the full breakdown (score, keywords, competitor comparison), you can try it free here — no signup needed:

https://ytubviral.com/seo-score?utm_source=outreach&utm_medium=email

Would this be useful?

Javier`;
    },
  },
};

// Fallback templates for contacts without video data (legacy contacts)
const TEMPLATES_FALLBACK = {
  es: {
    subject: 'Pregunta rápida sobre tu canal',
    body: (name) => `Hola ${name},

Estoy creando una herramienta que analiza el SEO de cualquier video de YouTube y te dice qué mejorar para posicionarte mejor. Es gratis y sin registro:

https://ytubviral.com/seo-score?utm_source=outreach&utm_medium=email

¿Te sería útil algo así para tu canal?

Javier`,
  },
  en: {
    subject: 'Quick question about your channel',
    body: (name) => `Hey ${name},

I'm building a tool that analyzes the SEO of any YouTube video and tells you exactly what to fix to rank better. It's free, no signup needed:

https://ytubviral.com/seo-score?utm_source=outreach&utm_medium=email

Would something like this be useful for your channel?

Javier`,
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
    const subject = tpl.subject(contact.latestVideo.title);
    const body = tpl.body(firstName, contact.latestVideo.title, contact.latestVideo.url, contact.seoScore, contact.seoTips);
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
        from: 'javier',
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
