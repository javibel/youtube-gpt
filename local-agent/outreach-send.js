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

const TEMPLATES = {
  es: {
    subject: 'Colaboración — acceso gratuito a YTubViral Pro',
    body: (name, topic) => `Hola ${name},

Soy Javier Jimeno, fundador de YTubViral — una plataforma de herramientas de crecimiento para YouTube con IA (SEO, keywords, ideas de contenido, análisis de retención, thumbnails...).

He visto tu contenido sobre ${topic} y creo que YTubViral podría encajar muy bien con lo que haces. Me gustaría ofrecerte acceso gratuito al plan Pro durante 1 mes para que lo pruebes sin compromiso.

Lo único que necesitas es registrarte en https://ytubviral.com y responder a este email con el correo que usaste. Yo activo Pro directamente en tu cuenta.

Sin letras pequeñas. Si te gusta, genial. Si no, me encantaría saber qué mejorarías.

Un saludo,
Javier Jimeno
Fundador, YTubViral
https://ytubviral.com`,
  },
  en: {
    subject: 'Collab — free YTubViral Pro access',
    body: (name, topic) => `Hi ${name},

I'm Javier Jimeno, founder of YTubViral — an AI-powered YouTube growth toolkit (SEO, keywords, content ideas, retention analysis, thumbnails...).

I came across your content about ${topic} and thought YTubViral could be a great fit for what you do. I'd love to offer you free access to our Pro plan for 1 month, no strings attached.

Just sign up at https://ytubviral.com and reply with the email you used. I'll activate Pro on your account directly.

No catch. If you love it, awesome. If not, I'd genuinely appreciate your feedback on what we could improve.

Best,
Javier Jimeno
Founder, YTubViral
https://ytubviral.com`,
  },
};

const TOPICS = {
  'Nathalia / The Key Item': 'tus guías sobre creación de contenido',
  'DCP.bio': 'tu contenido sobre marketing digital y YouTube',
  'Alejandro Tamargo': 'tu guía de YouTube SEO 2026',
  'Alan Spicer': 'your YouTube growth tutorials',
  'Stephanie Kase': 'your YouTube strategy content',
  'LinoDash': 'your YouTube growth tips',
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
    const tpl = TEMPLATES[contact.lang] || TEMPLATES.en;
    const topic = TOPICS[contact.name] || contact.niche || 'YouTube';
    const firstName = contact.name.split(' ')[0].split('/')[0].trim();
    const body = tpl.body(firstName, topic);

    console.log(`  → ${contact.name} <${contact.email}> [${contact.lang}]`);

    if (dryRun) {
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
