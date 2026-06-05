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

// Follow-up templates — short, personal, plain text
const TEMPLATES_SEO = {
  es: {
    subject: (videoTitle) => `Re: "${videoTitle.slice(0, 45)}"`,
    body: (name, seoScore) => `Hola ${name},

Te escribí hace unos días con un tip para tu video. ¿Llegaste a probarlo?

Si quieres ver el análisis completo gratis (sin registro): https://ytubviral.com/seo-score?utm_source=outreach&utm_medium=email

Javier`,
  },
  en: {
    subject: (videoTitle) => `Re: "${videoTitle.slice(0, 45)}"`,
    body: (name, seoScore) => `Hey ${name},

Sent you a quick tip about your video a few days ago — did you get a chance to try it?

If you want the full analysis for free (no signup): https://ytubviral.com/seo-score?utm_source=outreach&utm_medium=email

Javier`,
  },
};

// Fallback for contacts without video data (skip follow-ups without SEO data)
const TEMPLATES_FALLBACK = {
  es: {
    subject: 'Re: Tu canal de YouTube',
    body: (name) => `Hola ${name},

Te escribí hace unos días. Creé una herramienta gratuita que analiza el SEO de cualquier video de YouTube — sin registro:

https://ytubviral.com/seo-score?utm_source=outreach&utm_medium=email

¿Te sería útil?

Javier`,
  },
  en: {
    subject: 'Re: Your YouTube channel',
    body: (name) => `Hey ${name},

Reached out a few days ago. Built a free tool that analyzes the SEO of any YouTube video — no signup needed:

https://ytubviral.com/seo-score?utm_source=outreach&utm_medium=email

Would this be useful?

Javier`,
  },
};

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

    let subject, body;
    if (contact.latestVideo && contact.seoScore) {
      const tpl = TEMPLATES_SEO[lang] || TEMPLATES_SEO.en;
      subject = tpl.subject(contact.latestVideo.title);
      body = tpl.body(firstName, contact.seoScore);
    } else {
      const tpl = TEMPLATES_FALLBACK[lang] || TEMPLATES_FALLBACK.en;
      subject = tpl.subject;
      body = tpl.body(firstName);
    }

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
