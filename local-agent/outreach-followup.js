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

// Follow-up templates — reference the SEO analysis if contact has video data
const TEMPLATES_SEO = {
  es: {
    subject: (videoTitle) => `Re: Tu video "${videoTitle.slice(0, 35)}..." — análisis SEO`,
    body: (name, seoScore) => `Hola ${name},

Te escribí hace unos días con un análisis SEO de tu último video (${seoScore}/100). Espero que los tips te hayan servido.

Solo quería asegurarme de que no se perdió en el inbox. Si quieres el análisis completo con keywords, retención y más, regístrate en https://ytubviral.com — te activo Pro gratis 3 meses.

También puedes probar la herramienta de SEO Score gratis sin registrarte: https://ytubviral.com/features/seo-score

Si no te interesa, sin problema. Gracias por tu tiempo.

Javier Jimeno
Fundador, YTubViral`,
  },
  en: {
    subject: (videoTitle) => `Re: Your video "${videoTitle.slice(0, 35)}..." — SEO analysis`,
    body: (name, seoScore) => `Hi ${name},

I sent you a quick SEO analysis of your latest video a few days ago (scored ${seoScore}/100). Hope the tips were useful.

Just making sure it didn't get buried. If you'd like the full analysis with keywords, retention data and more, sign up at https://ytubviral.com — I'll activate Pro free for 3 months.

You can also try the SEO Score tool free without signing up: https://ytubviral.com/features/seo-score

If it's not for you, no worries at all. Thanks for your time.

Javier Jimeno
Founder, YTubViral`,
  },
};

const TEMPLATES_FALLBACK = {
  es: {
    subject: 'Re: Herramienta SEO gratuita para tu canal',
    body: (name) => `Hola ${name},

Te escribí hace unos días sobre YTubViral. Solo quería asegurarme de que no se perdió.

Puedes probar gratis nuestra herramienta de SEO Score — analiza cualquier video y te dice qué mejorar: https://ytubviral.com/features/seo-score

Si te interesa el paquete completo, te doy Pro gratis 3 meses. Solo regístrate y responde con tu email.

Si no es para ti, sin problema — agradezco tu tiempo.

Javier Jimeno
Fundador, YTubViral`,
  },
  en: {
    subject: 'Re: Free SEO tool for your channel',
    body: (name) => `Hi ${name},

I reached out a few days ago about YTubViral. Just making sure it didn't get buried.

You can try our SEO Score tool free — analyze any video and get actionable tips: https://ytubviral.com/features/seo-score

If you'd like the full suite, I'll activate Pro free for 3 months. Just sign up and reply with your email.

No worries if it's not your thing — appreciate your time.

Javier Jimeno
Founder, YTubViral`,
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
        from: 'hello',
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
