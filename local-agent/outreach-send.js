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

// Two-touch outreach (Javier's call 2026-06-13): TOUCH 1 (this file) = personalized SEO value
// + free no-signup tool, soft reply CTA. The Pro-free-month "ask" lives in the follow-up.
// A/B on the SUBJECT only (drives open rate; reply rate per variant is now measurable via
// gmail.js reply detection + the `variant` field stored on each contact).
const SUBJECTS = {
  es: [
    (t) => `Idea rápida para "${t.slice(0, 45)}"`,
    (t) => `Vi tu vídeo "${t.slice(0, 40)}" — una cosa`,
  ],
  en: [
    (t) => `Quick tip for "${t.slice(0, 45)}"`,
    (t) => `Watched "${t.slice(0, 40)}" — one thing`,
  ],
};

const TEMPLATES_SEO = {
  es: {
    body: (name, videoTitle, videoUrl, seoScore, tips) => {
      const topTip = tips[0] ? tips[0].tip_es : 'Optimizar el título para incluir tu keyword principal';
      const more = tips.length > 1
        ? `\n\nVi un par de puntos más — si te cuadra, dime y te los paso.`
        : `\n\n¿Te encaja algo así?`;
      return `Hola ${name},

Vi tu vídeo "${videoTitle}" y lo pasé por un analizador SEO que estoy creando. El cambio más rápido que harías: ${topTip.toLowerCase()}.

Puedes ver el análisis completo gratis (puntuación, keywords, comparativa) — sin registro:

https://ytubviral.com/seo-score?utm_source=outreach&utm_medium=email${more}

Javier`;
    },
  },
  en: {
    body: (name, videoTitle, videoUrl, seoScore, tips) => {
      const topTip = tips[0] ? tips[0].tip_en : 'Optimize your title to include your main keyword';
      const more = tips.length > 1
        ? `\n\nSpotted a couple more things — happy to share them if useful.`
        : `\n\nWould something like this help?`;
      return `Hey ${name},

Watched your video "${videoTitle}" and ran it through a YouTube SEO analyzer I'm building. The quickest win: ${topTip.toLowerCase()}.

You can see the full breakdown free (score, keywords, competitor comparison) — no signup:

https://ytubviral.com/seo-score?utm_source=outreach&utm_medium=email${more}

Javier`;
    },
  },
};

// NOTE: a generic TEMPLATES_FALLBACK used to live here but it was dead code — the SEO-data
// skip below returns before any contact without analysis reaches template selection. Removed
// (2026-06-13). Policy: only send personalized emails that carry a real SEO insight.

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
    const subjects = SUBJECTS[lang] || SUBJECTS.en;
    // A/B: alternate subject variant per email and remember which one (for reply-rate analysis)
    const variantIdx = (tracker.meta.stats.totalSent + sent) % subjects.length;
    contact.variant = ['A', 'B'][variantIdx] || 'A';
    const subject = subjects[variantIdx](contact.latestVideo.title);
    const body = tpl.body(firstName, contact.latestVideo.title, contact.latestVideo.url, contact.seoScore, contact.seoTips);
    console.log(`  → ${contact.name} <${contact.email}> [${lang}] SEO: ${contact.seoScore}/100 (variant ${contact.variant})`);

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
