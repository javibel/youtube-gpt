/**
 * Re-engagement email — win back users who activated (used a tool at least once)
 * but went dormant. The funnel's 2nd biggest leak: most activated users are
 * "one-and-done" (tried it once, never returned).
 *
 * Targets verified, activated users whose last generation was 7-60 days ago and
 * who haven't been re-engaged yet. One email per user (tracked in reengagement_emails,
 * which is MODELED in schema.prisma so deploys don't drop it).
 *
 * PAUSED (2026-06-18): overlaps with the lifecycle-emails "react" sequence, which already
 * handles reactivation more robustly (EmailLog idempotency, opt-out). Disabled by default to
 * avoid double-emailing dormant users; pending decision to retire this in favour of lifecycle.
 * Set REENGAGEMENT_ENABLED='true' to re-enable. Runs from the morning cron (dry-run while paused).
 */
import { prisma } from '@/lib/prisma';
import { sendTransactionalEmail } from '@/lib/send-email';

const BASE_URL = (process.env.NEXTAUTH_URL ?? 'https://ytubviral.com').trim().replace(/\/$/, '');
const LIVE = process.env.REENGAGEMENT_ENABLED === 'true';

function buildHtml(name: string, lang: 'es' | 'en'): string {
  const firstName = (name || '').split(' ')[0] || (lang === 'es' ? 'Hola' : 'Hi');
  const ctaUrl = `${BASE_URL}/generate`;

  if (lang === 'es') {
    return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <div style="text-align:center;padding:24px 0">
    <img src="${BASE_URL}/logo.png" alt="YTubViral" width="140" style="display:inline-block" />
  </div>
  <p style="font-size:18px;font-weight:600">Hey ${firstName} 👋</p>
  <p>Probaste YTubViral hace unas semanas y luego no volviste — sin presión, sé que el día a día se come todo.</p>
  <p>Pero si sigues subiendo vídeos, hay un hábito que marca la diferencia de verdad: antes de publicar, revisa el título. No el contenido — el título. Es lo que decide si alguien hace clic o sigue haciendo scroll. Y es literalmente un minuto.</p>
  <div style="text-align:center;margin:24px 0">
    <a href="${ctaUrl}" style="display:inline-block;background:#e84d5b;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Revisar un título ahora</a>
  </div>
  <p style="color:#666;font-size:13px">Tienes tus 10 generaciones gratis de este mes esperándote.</p>
  <p style="color:#666;font-size:13px">Y si algo no te encajó la primera vez, respóndeme a este email y lo miro — lo leo yo.</p>
  <p style="color:#666;font-size:13px">— Javier, fundador de YTubViral</p>
</div>`.trim();
  }

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <div style="text-align:center;padding:24px 0">
    <img src="${BASE_URL}/logo.png" alt="YTubViral" width="140" style="display:inline-block" />
  </div>
  <p style="font-size:18px;font-weight:600">Hey ${firstName} 👋</p>
  <p>You tried YTubViral a few weeks back and didn't come back — no pressure, I know everyday life eats your time.</p>
  <p>But if you're still uploading videos, there's one habit that genuinely moves the needle: before you publish, check the title. Not the content — the title. It's what decides whether someone clicks or keeps scrolling. And it takes a minute.</p>
  <div style="text-align:center;margin:24px 0">
    <a href="${ctaUrl}" style="display:inline-block;background:#e84d5b;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Check a title now</a>
  </div>
  <p style="color:#666;font-size:13px">Your 10 free generations this month are waiting.</p>
  <p style="color:#666;font-size:13px">And if something didn't click the first time, just reply to this email and I'll look into it — I read every one.</p>
  <p style="color:#666;font-size:13px">— Javier, founder of YTubViral</p>
</div>`.trim();
}

function detectLang(name: string | null, email: string): 'es' | 'en' {
  const hint = `${name || ''} ${email}`.toLowerCase();
  return /[áéíóúñü]|\.es\b/.test(hint) ? 'es' : 'es'; // default Spanish (Hispanic audience)
}

type Candidate = { id: string; name: string | null; email: string };

// Safety net: the table is modeled in schema.prisma (so deploys keep it), but create
// it if the cron ever runs before a deploy's db push has created it.
async function ensureTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS reengagement_emails (
      user_id TEXT PRIMARY KEY,
      sent_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

export async function sendReengagementEmails(): Promise<number> {
  await ensureTable();
  // Verified + activated users whose last generation was 7-60 days ago, not yet re-engaged.
  const candidates = await prisma.$queryRawUnsafe<Candidate[]>(`
    SELECT u.id, u.name, u.email
    FROM users u
    WHERE u."emailVerified" IS NOT NULL
      AND EXISTS (SELECT 1 FROM generations g WHERE g."userId" = u.id)
      AND NOT EXISTS (SELECT 1 FROM generations g WHERE g."userId" = u.id AND g."createdAt" >= NOW() - INTERVAL '7 days')
      AND EXISTS (SELECT 1 FROM generations g WHERE g."userId" = u.id AND g."createdAt" >= NOW() - INTERVAL '60 days')
      AND NOT EXISTS (SELECT 1 FROM reengagement_emails re WHERE re.user_id = u.id)
  `);

  if (candidates.length === 0) return 0;

  let sent = 0;
  for (const u of candidates) {
    if (!LIVE) {
      console.log(`[reengagement] DRY-RUN — would send to ${u.email}`);
      continue;
    }
    try {
      const lang = detectLang(u.name, u.email);
      const subject = lang === 'es'
        ? '¿Le damos otra vuelta a tu canal?'
        : 'Want to give your channel another shot?';
      await sendTransactionalEmail({ to: u.email, subject, html: buildHtml(u.name || '', lang) });
      await prisma.$executeRawUnsafe(
        `INSERT INTO reengagement_emails (user_id, sent_at) VALUES ($1, NOW()) ON CONFLICT (user_id) DO NOTHING`,
        u.id,
      );
      sent++;
      console.log(`[reengagement] Sent to ${u.email}`);
    } catch (err) {
      console.error(`[reengagement] Failed for ${u.email}:`, err instanceof Error ? err.message : err);
    }
  }

  return sent;
}
