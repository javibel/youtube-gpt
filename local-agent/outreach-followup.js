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

const TEMPLATES = {
  es: {
    subject: 'Re: Colaboración — acceso gratuito a YTubViral Pro',
    body: (name) => `Hola ${name},

Te escribí hace unos días sobre YTubViral, nuestra plataforma de crecimiento para YouTube con IA.

No quiero ser pesado — solo quería asegurarme de que no se perdió entre el ruido del inbox. La oferta sigue en pie: 1 mes de Pro gratis, sin compromiso.

Si te interesa, regístrate en https://ytubviral.com y responde con tu email de registro. Yo activo Pro en tu cuenta en minutos.

Si no es para ti, sin problema — agradezco tu tiempo.

Un saludo,
Javier Jimeno
Fundador, YTubViral
https://ytubviral.com`,
  },
  en: {
    subject: 'Re: Collab — free YTubViral Pro access',
    body: (name) => `Hi ${name},

I reached out a few days ago about YTubViral, our AI-powered YouTube growth toolkit.

Not trying to be pushy — just wanted to make sure my email didn't get buried. The offer still stands: 1 month of Pro, completely free, no strings attached.

If you're interested, sign up at https://ytubviral.com and reply with your registration email. I'll activate Pro on your account within minutes.

If it's not your thing, no worries at all — I appreciate your time.

Best,
Javier Jimeno
Founder, YTubViral
https://ytubviral.com`,
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
    const tpl = TEMPLATES[contact.lang] || TEMPLATES.en;
    const firstName = contact.name.split(' ')[0].split('/')[0].trim();
    const body = tpl.body(firstName);

    console.log(`  → ${contact.name} <${contact.email}> [${contact.lang}]`);

    if (DRY_RUN) {
      console.log(`    [DRY RUN] Would send: "${tpl.subject}"\n`);
      continue;
    }

    try {
      const result = await sendViaResend({
        to: contact.email,
        subject: tpl.subject,
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
