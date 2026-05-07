import { NextResponse } from 'next/server';
import { generateSocialPost } from '@/lib/agent/content-generator';
import {
  publishToFacebook,
  publishToFacebookWithImage,
  getSocialImageUrl,
} from '@/lib/agent/meta-agent';
import { getHumanImageUrl } from '@/lib/agent/linkedin-agent';
import { publishToLinkedIn } from '@/lib/agent/linkedin-agent';
import { sendNotificationEmail, sendOwnerEmail } from '@/lib/agent/gmail-agent';
import { sendDailyReport } from '@/lib/agent/reports-agent';
import { prisma } from '@/lib/prisma';

export const maxDuration = 60;

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

  // Find Pro users with connected YouTube channel who don't have ideas for today
  const users = await prisma.youtubeToken.findMany({
    where: {
      channelId: { not: null },
      user: {
        subscription: { status: 'active' },
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
          max_tokens: 600,
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
- Include a suggested title for each idea
- Each idea: 1 sentence max explaining the angle

Respond ONLY with JSON array, no other text:
[{"title_es":"título sugerido","title_en":"suggested title","idea_es":"explicación breve","idea_en":"brief explanation"}]`,
          }],
        }),
      });

      if (!res.ok) continue;
      const aiData = await res.json();
      const raw: string = (aiData.content?.[0]?.text ?? '')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
      const ideas = JSON.parse(raw);
      if (!Array.isArray(ideas) || ideas.length === 0) continue;

      await prisma.dailyIdea.create({
        data: {
          userId: user.userId,
          date,
          ideas: ideas as unknown as import('@prisma/client').Prisma.InputJsonValue,
        },
      });
      generated++;
    } catch {
      // Skip this user on error, continue with next
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

    // 2. Generate content for Facebook + LinkedIn + TikTok + Twitter (morning networks)
    const [facebook, linkedin, tiktok, twitter] = await Promise.allSettled([
      generateSocialPost('facebook', 'morning'),
      generateSocialPost('linkedin', 'morning'),
      generateSocialPost('tiktok', 'morning'),
      generateSocialPost('twitter', 'morning'),
    ]);

    const fb = facebook.status === 'fulfilled' ? facebook.value : null;
    const li = linkedin.status === 'fulfilled' ? linkedin.value : null;
    const tt = tiktok.status === 'fulfilled' ? tiktok.value : null;
    const tw = twitter.status === 'fulfilled' ? twitter.value : null;

    if (facebook.status === 'rejected') errors.push(`Facebook content: ${facebook.reason}`);
    if (linkedin.status === 'rejected') errors.push(`LinkedIn content: ${linkedin.reason}`);
    if (tiktok.status === 'rejected') errors.push(`TikTok content: ${tiktok.reason}`);
    if (twitter.status === 'rejected') errors.push(`Twitter content: ${twitter.reason}`);

    // 3. Publish Facebook — DESACTIVADO: bloquea cuentas (2026-05-07)
    // const useImage = Math.random() < 0.3;
    // const fbImageUrl = (await getHumanImageUrl('facebook')) ?? getSocialImageUrl();
    // const fbResult = fb
    //   ? useImage
    //     ? await publishToFacebookWithImage(fb, fbImageUrl)
    //     : await publishToFacebook(fb)
    //   : null;
    // results.facebook = fbResult;
    const fbResult = null;
    if (fb) {
      results.facebook = { success: false, error: 'Facebook desactivado — bloquea cuentas (2026-05-07)' };
    }

    // 4. Publish LinkedIn — DESACTIVADO: cuenta bloqueada por LinkedIn (2026-05-07)
    // if (li) {
    //   const liResult = await publishToLinkedIn(li);
    //   results.linkedin = liResult;
    //   if (!liResult.success) errors.push(`LinkedIn: ${liResult.error}`);
    // }
    if (li) {
      results.linkedin = { success: false, error: 'LinkedIn desactivado — cuenta bloqueada (2026-05-07)' };
    }

    // 5. TikTok + X by email (manual)
    if (tt || tw) {
      const emailBody = [
        'AGENTE YTUBVIRAL - POST MATUTINO (MANUAL)',
        '='.repeat(50),
        tt ? `TIKTOK\n${'-'.repeat(30)}\n${tt}\n` : '',
        tw ? `X/TWITTER\n${'-'.repeat(30)}\n${tw}\n` : '',
        '='.repeat(50),
        'Copia el contenido y publícalo directamente en cada plataforma.',
      ].filter(Boolean).join('\n');

      await sendOwnerEmail('[YTubViral Agent] Post matutino - TikTok + X', emailBody).catch(
        err => errors.push(`Email TikTok/X: ${err instanceof Error ? err.message : err}`)
      );

      for (const [platform, content] of [['tiktok', tt], ['twitter', tw]] as [string, string | null][]) {
        if (content) {
          await prisma.socialPost.create({
            data: { platform, content, status: 'email_sent', publishedAt: new Date() },
          }).catch(() => {});
        }
      }
    }

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
