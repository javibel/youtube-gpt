/**
 * Onboarding email — sent ~24h after registration to users who haven't
 * connected YouTube or explored key features.
 *
 * Runs as part of the morning cron. Sends max 1 onboarding email per user.
 */
import { prisma } from '@/lib/prisma';
import { sendTransactionalEmail } from '@/lib/send-email';

const BASE_URL = (process.env.NEXTAUTH_URL ?? 'https://ytubviral.com').trim().replace(/\/$/, '');

function buildOnboardingHtml(name: string, lang: 'es' | 'en'): string {
  const firstName = (name || '').split(' ')[0] || (lang === 'es' ? 'Hola' : 'Hi');

  if (lang === 'es') {
    return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <div style="text-align:center;padding:24px 0">
    <img src="${BASE_URL}/logo.png" alt="YTubViral" width="140" style="display:inline-block" />
  </div>

  <p style="font-size:18px;font-weight:600">Hey ${firstName} 👋</p>

  <p>Vi que te registraste ayer pero aun no has conectado tu canal de YouTube. Sin eso, las herramientas no pueden personalizar los resultados para ti.</p>

  <p style="font-weight:600">3 cosas que puedes hacer ahora mismo (gratis):</p>

  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr>
      <td style="padding:12px;background:#111;border-radius:8px 8px 0 0">
        <span style="color:#e84d5b;font-weight:700">1.</span>
        <a href="${BASE_URL}/dashboard" style="color:#fff;text-decoration:none;font-weight:600"> Conecta tu canal de YouTube</a>
        <br><span style="color:#999;font-size:13px">Un click. Desbloquea todas las herramientas personalizadas.</span>
      </td>
    </tr>
    <tr>
      <td style="padding:12px;background:#1a1a1a">
        <span style="color:#00E5FF;font-weight:700">2.</span>
        <a href="${BASE_URL}/seo-score" style="color:#fff;text-decoration:none;font-weight:600"> Analiza el SEO de tu ultimo video</a>
        <br><span style="color:#999;font-size:13px">Descubre que mejorar en titulo, descripcion y tags. Puntuacion de 0 a 100.</span>
      </td>
    </tr>
    <tr>
      <td style="padding:12px;background:#111;border-radius:0 0 8px 8px">
        <span style="color:#7CFF00;font-weight:700">3.</span>
        <a href="${BASE_URL}/generate" style="color:#fff;text-decoration:none;font-weight:600"> Genera un titulo optimizado con IA</a>
        <br><span style="color:#999;font-size:13px">Tienes 10 generaciones gratis este mes. Pruebalo.</span>
      </td>
    </tr>
  </table>

  <div style="text-align:center;margin:24px 0">
    <a href="${BASE_URL}/dashboard" style="display:inline-block;background:#e84d5b;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Ir a mi dashboard</a>
  </div>

  <p style="color:#666;font-size:13px">Si tienes dudas, responde a este email. Leo todos los mensajes personalmente.</p>

  <p style="color:#666;font-size:13px">— Javier, fundador de YTubViral</p>
</div>`.trim();
  }

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <div style="text-align:center;padding:24px 0">
    <img src="${BASE_URL}/logo.png" alt="YTubViral" width="140" style="display:inline-block" />
  </div>

  <p style="font-size:18px;font-weight:600">Hey ${firstName} 👋</p>

  <p>I saw you signed up yesterday but haven't connected your YouTube channel yet. Without it, the tools can't personalize results for you.</p>

  <p style="font-weight:600">3 things you can do right now (free):</p>

  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr>
      <td style="padding:12px;background:#111;border-radius:8px 8px 0 0">
        <span style="color:#e84d5b;font-weight:700">1.</span>
        <a href="${BASE_URL}/dashboard" style="color:#fff;text-decoration:none;font-weight:600"> Connect your YouTube channel</a>
        <br><span style="color:#999;font-size:13px">One click. Unlocks all personalized tools.</span>
      </td>
    </tr>
    <tr>
      <td style="padding:12px;background:#1a1a1a">
        <span style="color:#00E5FF;font-weight:700">2.</span>
        <a href="${BASE_URL}/seo-score" style="color:#fff;text-decoration:none;font-weight:600"> Analyze your latest video's SEO</a>
        <br><span style="color:#999;font-size:13px">Find what to improve in your title, description and tags. Score 0–100.</span>
      </td>
    </tr>
    <tr>
      <td style="padding:12px;background:#111;border-radius:0 0 8px 8px">
        <span style="color:#7CFF00;font-weight:700">3.</span>
        <a href="${BASE_URL}/generate" style="color:#fff;text-decoration:none;font-weight:600"> Generate an AI-optimized title</a>
        <br><span style="color:#999;font-size:13px">You have 10 free generations this month. Try it.</span>
      </td>
    </tr>
  </table>

  <div style="text-align:center;margin:24px 0">
    <a href="${BASE_URL}/dashboard" style="display:inline-block;background:#e84d5b;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Go to my dashboard</a>
  </div>

  <p style="color:#666;font-size:13px">Questions? Just reply to this email. I read every message personally.</p>

  <p style="color:#666;font-size:13px">— Javier, founder of YTubViral</p>
</div>`.trim();
}

function detectLang(name: string | null, email: string): 'es' | 'en' {
  const hint = `${name || ''} ${email}`.toLowerCase();
  const esPatterns = /[áéíóúñü]|gmail\.es|hotmail\.es|yahoo\.es/;
  return esPatterns.test(hint) ? 'es' : 'es'; // default Spanish for now (Hispanic audience)
}

export async function sendOnboardingEmails(): Promise<number> {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  // Find users who:
  // - Registered between 24h and 48h ago
  // - Haven't connected YouTube
  // - Haven't been sent an onboarding email (tracked via onboardingEmailSentAt)
  const candidates = await prisma.user.findMany({
    where: {
      createdAt: {
        gte: fortyEightHoursAgo,
        lte: twentyFourHoursAgo,
      },
      emailVerified: { not: null },
      onboardingEmailSentAt: null,
      youtubeToken: null,
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  if (candidates.length === 0) return 0;

  let sent = 0;
  for (const user of candidates) {
    try {
      const lang = detectLang(user.name, user.email);
      const subject = lang === 'es'
        ? '🎬 Tu canal de YouTube te espera — 3 cosas que puedes hacer gratis'
        : '🎬 Your YouTube channel awaits — 3 things you can do for free';

      await sendTransactionalEmail({
        to: user.email,
        subject,
        html: buildOnboardingHtml(user.name || '', lang),
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { onboardingEmailSentAt: now },
      });

      sent++;
      console.log(`[onboarding] Sent to ${user.email}`);
    } catch (err) {
      console.error(`[onboarding] Failed for ${user.email}:`, err instanceof Error ? err.message : err);
    }
  }

  return sent;
}
