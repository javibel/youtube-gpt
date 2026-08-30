import { NextResponse } from 'next/server';
import { generateSocialPost } from '@/lib/agent/content-generator';
import {
  publishToFacebook,
  publishToFacebookWithImage,
  publishToInstagram,
} from '@/lib/agent/meta-agent';
import { getOrCreateDailyBrandImage } from '@/lib/agent/ideogram-image';
import { buildInfographicUrl } from '@/lib/agent/infographic-generator';
// Twitter API desactivada — publicación migrada a Puppeteer en local-agent (brand-twitter-post.js)
// import { publishThreadToTwitter } from '@/lib/agent/twitter-agent';
import { sendNotificationEmail } from '@/lib/agent/gmail-agent';
// import { sendDailyReport } from '@/lib/agent/reports-agent'; // reporte diario desactivado 2026-08-30 (redundante con el Manager)
// sendOnboardingEmails DESACTIVADO 2026-07-01 (duplicaba lifecycle) — ver bloque "0." abajo.
// import { sendOnboardingEmails } from '@/lib/agent/onboarding-email';
import { sendVerificationReminders } from '@/lib/agent/verification-reminder';
import { sendReengagementEmails } from '@/lib/agent/reengagement-email';
import { sendDailyIdeasEmails } from '@/lib/daily-ideas-email';
import { generateDailyIdeas } from '@/lib/daily-ideas';
import { prisma } from '@/lib/prisma';

export const maxDuration = 120;

function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

async function generateAndSaveDailyTip(): Promise<{ skipped: boolean }> {
  const date = todayUTC();
  const existing = await prisma.dailyTip.findUnique({ where: { date } });
  if (existing) return { skipped: true };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Genera un tip práctico y específico para YouTubers sobre cómo mejorar su canal (títulos, thumbnails, SEO, retención, monetización, algoritmo, etc.).

El tip debe:
- Ser concreto y accionable, no genérico
- Incluir un dato o porcentaje real si es posible
- Tener máximo 2 frases
- Variar el tema respecto a tips comunes (sé creativo)

Responde SOLO con JSON en este formato exacto, sin texto adicional:
{"es": "tip en español aquí", "en": "tip in english here"}`,
      }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API error ${res.status}`);
  const aiData = await res.json();
  const raw: string = (aiData.content?.[0]?.text ?? '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  const parsed = JSON.parse(raw);
  const { es, en } = parsed as { es: string; en: string };

  await prisma.dailyTip.upsert({
    where: { date },
    create: { date, es, en },
    update: { es, en },
  });

  return { skipped: false };
}


export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const errors: string[] = [];
  const results: Record<string, unknown> = {};

  try {
    // 0. Onboarding email del agente — DESACTIVADO 2026-07-01 (Javier).
    //    MOTIVO: se solapaba con la secuencia lifecycle (lib/lifecycle-emails.ts,
    //    onboarding a1-a5), que cubre lo mismo mejor escalonado, con skip-on-action
    //    y link de baja (LSSI). Este mandaba un 2º nudge casi idéntico ~24-48h tras
    //    registro (ej. usuario Luis Avila recibió a1 "SEO Score" el 30/06 y este
    //    "3 cosas / conecta canal" el 01/07 → redundante). El lifecycle es la fuente
    //    única de onboarding a partir de ahora.
    //    PARA REACTIVAR: descomentar la llamada de abajo Y coordinar con el cron
    //    lifecycle para no duplicar (o borrar los pasos solapados a1/a3).
    //    Código intacto en lib/agent/onboarding-email.ts por si se reutiliza.
    // const onboardingSent = await sendOnboardingEmails().catch(err => {
    //   errors.push(`Onboarding: ${err instanceof Error ? err.message : err}`);
    //   return 0;
    // });
    results.onboarding = 'disabled_2026-07-01_dup_lifecycle';

    // 0b. Verification reminders to unverified signups (gated by VERIFY_REMINDER_ENABLED)
    const verifyReminders = await sendVerificationReminders().catch(err => {
      errors.push(`VerifyReminder: ${err instanceof Error ? err.message : err}`);
      return 0;
    });
    results.verifyReminders = verifyReminders;

    // 0c. Re-engagement emails to dormant activated users (gated by REENGAGEMENT_ENABLED)
    const reengaged = await sendReengagementEmails().catch(err => {
      errors.push(`Reengagement: ${err instanceof Error ? err.message : err}`);
      return 0;
    });
    results.reengaged = reengaged;

    // 1. Generate daily tip
    await generateAndSaveDailyTip().catch(err =>
      errors.push(`Daily tip: ${err instanceof Error ? err.message : err}`)
    );

    // 1b. Generate personalized daily ideas for Pro users
    const ideasGenerated = await generateDailyIdeas().catch(err => {
      errors.push(`Daily ideas: ${err instanceof Error ? err.message : err}`);
      return 0;
    });
    results.dailyIdeas = ideasGenerated;

    // 1c. Deliver those ideas. Without this the cron writes them to the database and
    // nobody ever sees them — which is why users who connected a channel stopped
    // returning (docs: memory project-daily-ideas-briefing).
    const ideasEmailed = await sendDailyIdeasEmails().catch(err => {
      errors.push(`Daily ideas email: ${err instanceof Error ? err.message : err}`);
      return 0;
    });
    results.dailyIdeasEmailed = ideasEmailed;

    // 2. Generate content for Facebook + Instagram (LinkedIn + Twitter desactivados)
    const [facebook, instagram] = await Promise.allSettled([
      generateSocialPost('facebook', 'morning'),
      generateSocialPost('instagram', 'morning'),
    ]);

    const fb = facebook.status === 'fulfilled' ? facebook.value : null;
    const ig = instagram.status === 'fulfilled' ? instagram.value : null;
    const tw = null; // Twitter API desactivada — migrado a Puppeteer local-agent

    if (facebook.status === 'rejected') errors.push(`Facebook content: ${facebook.reason}`);
    if (instagram.status === 'rejected') errors.push(`Instagram content: ${instagram.reason}`);

    // 3. One shared AI image for the whole day (FB + IG + the local-agent Twitter
    //    post all reuse it) to avoid duplicate Ideogram generations. Falls back to a
    //    per-platform Satori infographic only if Ideogram itself fails.
    const sharedAiUrl = (fb || ig) ? await getOrCreateDailyBrandImage((fb || ig) as string) : null;
    const fbImageUrl = fb ? (sharedAiUrl ?? buildInfographicUrl(fb)) : null;
    const igImageUrl = ig ? (sharedAiUrl ?? buildInfographicUrl(ig)) : null;

    // 3a. Publish Facebook with AI image (via Graph API)
    if (fb && fbImageUrl) {
      const fbResult = await publishToFacebookWithImage(fb, fbImageUrl);
      results.facebook = fbResult;
      if (!fbResult.success) errors.push(`Facebook: ${fbResult.error}`);
    }

    // 3b. Publish Instagram + Twitter in parallel (both independent)
    const socialPublishTasks: Promise<void>[] = [];

    if (ig) {
      socialPublishTasks.push((async () => {
        const igResult = await publishToInstagram(ig, igImageUrl ?? undefined);
        results.instagram = igResult;
        if (!igResult.success) errors.push(`Instagram: ${igResult.error}`);
      })());
    }

    // Twitter/X — DESACTIVADO: API de pago, migrado a Puppeteer en local-agent (brand-twitter-post.js)
    if (tw) {
      results.twitter = { success: false, error: 'Twitter API desactivada — publicación via Puppeteer en local-agent' };
    }

    await Promise.allSettled(socialPublishTasks);

    // 6. Reporte diario al owner — DESACTIVADO 2026-08-30 (decisión Javier).
    //    Era el segundo reporte diario redundante (el otro, local-agent/reports.js,
    //    se apagó el 28/08). El Reporte Ejecutivo del Manager (03:15) ya cubre
    //    posts sociales y gmail; las secciones de LinkedIn/YCML llevan meses en
    //    "sin datos" (personas abandonadas). Código intacto en lib/agent/reports-agent.ts.
    // await sendDailyReport().catch(err =>
    //   errors.push(`Daily report: ${err instanceof Error ? err.message : err}`)
    // );

    if (errors.length > 0) {
      await sendNotificationEmail(
        '[YTubViral Agent] Errores en cron matutino',
        errors.join('\n')
      ).catch(() => {});
    }

    return NextResponse.json({ ok: true, results, errors });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cron/morning]', msg);
    await sendNotificationEmail('[YTubViral Agent] Error critico cron matutino', msg).catch(() => {});
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
