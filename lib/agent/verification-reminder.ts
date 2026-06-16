/**
 * Verification-reminder email — the single biggest funnel leak is signup -> email
 * verification (~40% never verify, and verifying is a hard gate to using the product).
 * The onboarding email only targets ALREADY-verified users, so unverified signups got
 * nothing. This nudges them to finish verifying.
 *
 * Up to 2 reminders per user (1st within the first ~5 days, 2nd ~48h later, capped
 * at 14 days old so we never pester long-stale accounts). State lives in a raw
 * `verify_reminders` table (kept out of the Prisma schema, like the other agent tables).
 *
 * LIVE by default. Set VERIFY_REMINDER_ENABLED='false' to pause it (then it runs in
 * dry-run and just logs who it WOULD email). Runs from the morning cron.
 */
import { prisma } from '@/lib/prisma';
import { sendTransactionalEmail } from '@/lib/send-email';

const BASE_URL = (process.env.NEXTAUTH_URL ?? 'https://ytubviral.com').trim().replace(/\/$/, '');
const LIVE = process.env.VERIFY_REMINDER_ENABLED !== 'false';

function buildHtml(name: string, lang: 'es' | 'en'): string {
  const firstName = (name || '').split(' ')[0] || (lang === 'es' ? 'Hola' : 'Hi');
  const verifyUrl = `${BASE_URL}/verify-email`;

  if (lang === 'es') {
    return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <div style="text-align:center;padding:24px 0">
    <img src="${BASE_URL}/logo.png" alt="YTubViral" width="140" style="display:inline-block" />
  </div>
  <p style="font-size:18px;font-weight:600">Hey ${firstName} 👋</p>
  <p>Te registraste en YTubViral hace un rato, pero aún no has verificado tu email — así que la cuenta está a medias y no puedes usar nada todavía.</p>
  <p>Es literalmente un momento. Verifica y entras directo. Dentro tienes 10 generaciones gratis este mes para probar lo que más usa la gente: el generador de títulos optimizados para YouTube, pensado con keywords reales y CTR, no a ojo.</p>
  <div style="text-align:center;margin:24px 0">
    <a href="${verifyUrl}" style="display:inline-block;background:#e84d5b;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Verificar mi email</a>
  </div>
  <p style="color:#666;font-size:13px">Si ya no encuentras el código que te enviamos, en esa página puedes pedir uno nuevo.</p>
  <p style="color:#666;font-size:13px">¿Alguna duda? Responde a este email, lo leo yo.</p>
  <p style="color:#666;font-size:13px">— Javier, fundador de YTubViral</p>
</div>`.trim();
  }

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <div style="text-align:center;padding:24px 0">
    <img src="${BASE_URL}/logo.png" alt="YTubViral" width="140" style="display:inline-block" />
  </div>
  <p style="font-size:18px;font-weight:600">Hey ${firstName} 👋</p>
  <p>You signed up for YTubViral a little while ago but haven't verified your email yet — so your account is half-done and you can't use anything.</p>
  <p>It takes a second. Verify and you're in. Inside you've got 10 free generations this month to try what people use most: the YouTube title generator, built around real keywords and CTR, not guesswork.</p>
  <div style="text-align:center;margin:24px 0">
    <a href="${verifyUrl}" style="display:inline-block;background:#e84d5b;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Verify my email</a>
  </div>
  <p style="color:#666;font-size:13px">If you can't find the code we sent, you can request a new one on that page.</p>
  <p style="color:#666;font-size:13px">Questions? Just reply — I read these myself.</p>
  <p style="color:#666;font-size:13px">— Javier, founder of YTubViral</p>
</div>`.trim();
}

function detectLang(name: string | null, email: string): 'es' | 'en' {
  const hint = `${name || ''} ${email}`.toLowerCase();
  return /[áéíóúñü]|\.es\b/.test(hint) ? 'es' : 'es'; // default Spanish (Hispanic audience)
}

async function ensureTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS verify_reminders (
      user_id TEXT PRIMARY KEY,
      reminders_sent INT NOT NULL DEFAULT 0,
      last_sent_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

type Candidate = { id: string; name: string | null; email: string; sent: number };

export async function sendVerificationReminders(): Promise<number> {
  await ensureTable();

  // Unverified users who are due for a reminder:
  //  - 1st reminder: signed up between 2h and 5 days ago, none sent yet
  //  - 2nd reminder: 1 already sent >48h ago, account still under 14 days old
  const candidates = await prisma.$queryRawUnsafe<Candidate[]>(`
    SELECT u.id, u.name, u.email, COALESCE(vr.reminders_sent, 0) AS sent
    FROM users u
    LEFT JOIN verify_reminders vr ON vr.user_id = u.id
    WHERE u."emailVerified" IS NULL
      AND (
        (COALESCE(vr.reminders_sent, 0) = 0
          AND u."createdAt" <= NOW() - INTERVAL '2 hours'
          AND u."createdAt" >= NOW() - INTERVAL '120 hours')
        OR
        (COALESCE(vr.reminders_sent, 0) = 1
          AND u."createdAt" >= NOW() - INTERVAL '336 hours'
          AND vr.last_sent_at <= NOW() - INTERVAL '48 hours')
      )
  `);

  if (candidates.length === 0) return 0;

  let sent = 0;
  for (const u of candidates) {
    if (!LIVE) {
      console.log(`[verify-reminder] DRY-RUN — would send reminder #${u.sent + 1} to ${u.email}`);
      continue;
    }
    try {
      const lang = detectLang(u.name, u.email);
      const subject = lang === 'es'
        ? 'Te queda un paso para entrar a YTubViral'
        : 'One step left to get into YTubViral';
      await sendTransactionalEmail({ to: u.email, subject, html: buildHtml(u.name || '', lang) });
      await prisma.$executeRawUnsafe(
        `INSERT INTO verify_reminders (user_id, reminders_sent, last_sent_at)
         VALUES ($1, 1, NOW())
         ON CONFLICT (user_id) DO UPDATE SET reminders_sent = verify_reminders.reminders_sent + 1, last_sent_at = NOW()`,
        u.id,
      );
      sent++;
      console.log(`[verify-reminder] Sent reminder #${u.sent + 1} to ${u.email}`);
    } catch (err) {
      console.error(`[verify-reminder] Failed for ${u.email}:`, err instanceof Error ? err.message : err);
    }
  }

  return sent;
}
