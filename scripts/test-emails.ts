/**
 * Send test emails: waitlist welcome + launch day, in ES and EN.
 * Run: npx tsx scripts/test-emails.ts
 */
import { readFileSync } from 'fs';
import { Resend } from 'resend';
import { waitlistWelcomeEmail, launchDayEmail } from '../lib/emails';

// Load .env.local manually (no dotenv dependency)
const envFile = readFileSync('.env.local', 'utf-8');
for (const line of envFile.split('\n')) {
  const match = line.match(/^([A-Z_]+)\s*=\s*"?(.+?)"?\s*$/);
  if (match) process.env[match[1]] = match[2];
}

const resend = new Resend(process.env.RESEND_API_KEY);
const TO = 'ytbeviral@gmail.com';

async function send(subject: string, html: string) {
  const result = await resend.emails.send({
    from: 'YTubViral <hello@ytubviral.com>',
    to: TO,
    subject,
    html,
  });
  if (result.error) throw new Error(result.error.message);
  console.log(`  Sent: "${subject}"`);
}

async function main() {
  console.log(`Sending 4 test emails to ${TO}...\n`);

  // 1. Welcome ES
  await send(
    '[TEST] ¡Estás en la lista de lanzamiento de YTubViral!',
    waitlistWelcomeEmail('es'),
  );

  // 2. Welcome EN
  await send(
    "[TEST] You're on the YTubViral launch list!",
    waitlistWelcomeEmail('en'),
  );

  // 3. Launch day ES
  await send(
    '[TEST] 🚀 YTubViral está EN VIVO — 50% de descuento solo 48h',
    launchDayEmail('es', 'https://producthunt.com/posts/ytubviral', 'LAUNCH50'),
  );

  // 4. Launch day EN
  await send(
    '[TEST] 🚀 YTubViral is LIVE — 50% off for 48h only',
    launchDayEmail('en', 'https://producthunt.com/posts/ytubviral', 'LAUNCH50'),
  );

  console.log('\nDone! Check your inbox.');
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
