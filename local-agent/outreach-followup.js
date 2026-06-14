'use strict';

/**
 * Outreach follow-up — reads outreach-tracker.json, sends follow-up emails
 * to contacts whose dateFollowUp <= today and status === 'sent'.
 *
 * Runs daily via cron (index.js) at 10:00 Madrid time.
 * Can also run manually: node outreach-followup.js [--dry-run]
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { sendViaResend } = require('./resend');

const TRACKER_PATH = path.join(__dirname, 'outreach-tracker.json');
const DRY_RUN = process.argv.includes('--dry-run');

// Follow-up = TOUCH 2 of the two-touch outreach (Javier's call 2026-06-13): this is the "ask"
// — the free month of Pro. Subject keeps "Re:" to thread under touch 1. Plain text, personal.
const TEMPLATES_SEO = {
  es: {
    subject: (videoTitle) => `Re: "${videoTitle.slice(0, 45)}"`,
    body: (name, seoScore) => `Hola ${name},

Te escribí hace unos días con un tip para tu vídeo. Por si te sirve: además del analizador gratis, te puedo dar un mes de YTubViral Pro gratis (sin tarjeta) para que lo pruebes entero — generador de títulos y descripciones, ideas de contenido y análisis de competidores.

Si te interesa, respóndeme a este correo o regístrate aquí y te lo activo a mano:

https://ytubviral.com/signup?utm_source=outreach&utm_medium=email

P.D.: si ahora no es el momento, lanzamos pronto en Product Hunt — te puedo avisar el día (con ventaja early-bird): https://ytubviral.com/launch?ref=outreach

Javier`,
  },
  en: {
    subject: (videoTitle) => `Re: "${videoTitle.slice(0, 45)}"`,
    body: (name, seoScore) => `Hey ${name},

Sent you a quick tip about your video a few days ago. In case it helps: on top of the free analyzer, I can give you a free month of YTubViral Pro (no card) to try the whole thing — title and description generators, content ideas, and competitor analysis.

If you're interested, just reply to this email or sign up here and I'll activate it for you:

https://ytubviral.com/signup?utm_source=outreach&utm_medium=email

PS: if now's not the time, we're launching on Product Hunt soon — I can give you a heads-up on launch day (with an early-bird perk): https://ytubviral.com/launch?ref=outreach

Javier`,
  },
};

// NOTE: a generic TEMPLATES_FALLBACK used to live here. Removed (2026-06-13) — same policy as
// outreach-send: only personalized SEO follow-ups. Contacts without SEO data are skipped below.

async function runFollowUp() {
  const tracker = JSON.parse(fs.readFileSync(TRACKER_PATH, 'utf-8'));
  const today = new Date().toISOString().split('T')[0];

  const due = tracker.contacts.filter(c =>
    c.status === 'sent' &&
    c.dateFollowUp &&
    c.dateFollowUp <= today &&
    c.email
  );

  if (due.length === 0) {
    console.log('[outreach-followup] No follow-ups due today.');
    return { sent: 0, due: 0 };
  }

  console.log(`[outreach-followup] ${DRY_RUN ? 'DRY RUN — ' : ''}${due.length} follow-ups due.`);

  let sent = 0;
  for (const contact of due) {
    const firstName = contact.name.split(' ')[0].split('/')[0].trim();
    const lang = contact.lang || 'en';

    // Only personalized SEO follow-ups (policy). Legacy contacts without SEO data are skipped
    // rather than sent a generic email.
    if (!contact.latestVideo || !contact.seoScore) {
      console.log(`  ⏭ ${contact.name} — skipped (no SEO data)`);
      continue;
    }
    const tpl = TEMPLATES_SEO[lang] || TEMPLATES_SEO.en;
    const subject = tpl.subject(contact.latestVideo.title);
    const body = tpl.body(firstName, contact.seoScore);

    console.log(`  → ${contact.name} <${contact.email}> [${lang}]`);

    if (DRY_RUN) {
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
      });
      console.log(`    ✓ Follow-up sent (id: ${result.id})`);
      contact.status = 'followed-up';
      contact.dateFollowUp = null; // consumed
      contact.notes += ` | Follow-up sent ${today}`;
      sent++;
    } catch (err) {
      console.error(`    ✗ Failed: ${err.message}`);
      contact.notes += ` | Follow-up failed ${today}: ${err.message}`;
    }

    // Delay between sends
    if (!DRY_RUN) await new Promise(r => setTimeout(r, 1500));
  }

  // Save tracker
  fs.writeFileSync(TRACKER_PATH, JSON.stringify(tracker, null, 2));
  console.log(`[outreach-followup] Done. ${sent}/${due.length} follow-ups sent.`);
  return { sent, due: due.length };
}

// Run directly or export
if (require.main === module) {
  runFollowUp().catch(err => {
    console.error('[outreach-followup] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { runFollowUp };
