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
import { sendDailyReport } from '@/lib/agent/reports-agent';
// sendOnboardingEmails DESACTIVADO 2026-07-01 (duplicaba lifecycle) — ver bloque "0." abajo.
// import { sendOnboardingEmails } from '@/lib/agent/onboarding-email';
import { sendVerificationReminders } from '@/lib/agent/verification-reminder';
import { sendReengagementEmails } from '@/lib/agent/reengagement-email';
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

async function generateDailyIdeas(): Promise<number> {
  const date = todayUTC();

  // Find users with connected YouTube channel who don't have ideas for today.
  // Gratis desde 13/07 (decisión Javier) — ya no se filtra por plan de pago,
  // ver project_channel_connect_free.md.
  const users = await prisma.youtubeToken.findMany({
    where: {
      channelId: { not: null },
      user: {
        dailyIdeas: { none: { date } },
      },
    },
    select: {
      userId: true,
      channelName: true,
      subscribers: true,
      videoCount: true,
    },
  });

  if (users.length === 0) return 0;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return 0;

  let generated = 0;

  for (const user of users) {
    try {
      // Fetch user's recent video titles for context
      const recentGens = await prisma.generation.findMany({
        where: { userId: user.userId, template: { in: ['title', 'description'] } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { output: true },
      });
      const recentTitles = recentGens.map(g => g.output.slice(0, 80)).join('\n');

      const subs = user.subscribers ? parseInt(user.subscribers, 10) : 0;
      const vids = user.videoCount ? parseInt(user.videoCount, 10) : 0;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: `You are a YouTube growth advisor. Generate 5 personalized video ideas for this creator.

Channel: ${user.channelName || 'Unknown'}
Subscribers: ${subs}
Total videos: ${vids}
Recent content: ${recentTitles || 'No recent titles available'}

Rules:
- Each idea must be specific and actionable, not generic
- Ideas should match the channel's apparent niche and size
- For small channels (<1K subs): focus on searchable, niche topics
- For medium channels (1K-50K): mix of search and trending topics
- For large channels (50K+): trending, collab ideas, series concepts
- Each idea: 1 sentence max explaining the angle

Suggested titles are graded by our free Title Analyzer (app/title-analyzer,
scored 0-100), which is the tool that judges a bare title — the SEO score grades
published videos and cannot fully judge a title on its own. Aim for 85+:
- 40-70 characters (25 pts)
- Contains a digit, e.g. "7 mistakes", "23 facts" — not spelled out (15 pts)
- At least TWO power words for full marks: how, why, best, easy, fast, free, new,
  secret, proven, ultimate, simple, stop, never, avoid, mistake, truth, guide,
  tips, real, honest, worst, top, vs, before, after (20 pts)
- Wrap a qualifier in brackets or parentheses, e.g. "(Explained)" (10 pts)
- 4-9 words total (10 pts)
- No ALL-CAPS words (10 pts)
- A search-intent hook: start with how/why/what, or end with "?" (10 pts)

Respond ONLY with JSON array, no other text:
[{"title_es":"título sugerido","title_en":"suggested title","idea_es":"explicación breve","idea_en":"brief explanation"}]`,
          }],
        }),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        console.error(`[daily-ideas] Anthropic API error for user ${user.userId}: ${res.status} ${errBody.slice(0, 300)}`);
        continue;
      }
      const aiData = await res.json();
      const raw: string = (aiData.content?.[0]?.text ?? '')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
      let ideas: unknown;
      try {
        ideas = JSON.parse(raw);
      } catch (parseErr) {
        console.error(`[daily-ideas] JSON parse failed for user ${user.userId}: ${parseErr instanceof Error ? parseErr.message : parseErr} — raw: ${raw.slice(0, 300)}`);
        continue;
      }
      if (!Array.isArray(ideas) || ideas.length === 0) {
        console.error(`[daily-ideas] Empty/non-array ideas for user ${user.userId} — raw: ${raw.slice(0, 300)}`);
        continue;
      }

      await prisma.dailyIdea.create({
        data: {
          userId: user.userId,
          date,
          ideas: ideas as unknown as import('@prisma/client').Prisma.InputJsonValue,
        },
      });
      generated++;
    } catch (err) {
      // Antes tragaba el error sin loguear nada — con 0 filas de DailyIdea
      // en toda la historia de producción (11/07/2026) era imposible saber
      // por qué. Ahora queda rastro para el próximo cron (07:15 UTC).
      console.error(`[daily-ideas] Unexpected error for user ${user.userId}: ${err instanceof Error ? err.message : err}`);
    }
  }

  return generated;
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

    // 6. Send daily report to owner
    await sendDailyReport().catch(err =>
      errors.push(`Daily report: ${err instanceof Error ? err.message : err}`)
    );

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
