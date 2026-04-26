import { NextResponse } from 'next/server';
import { generateSocialPost } from '@/lib/agent/content-generator';
import {
  publishToFacebook,
  publishToFacebookWithImage,
  publishToInstagram,
  getSocialImageUrl,
} from '@/lib/agent/meta-agent';
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
  const raw: string = aiData.content?.[0]?.text?.trim() ?? '';
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
    // 1. Generate daily tip
    await generateAndSaveDailyTip().catch(err =>
      errors.push(`Daily tip: ${err instanceof Error ? err.message : err}`)
    );

    // 2. Generate content for all platforms
    const [facebook, instagram, linkedin, tiktok, twitter] = await Promise.allSettled([
      generateSocialPost('facebook', 'morning'),
      generateSocialPost('instagram', 'morning'),
      generateSocialPost('linkedin', 'morning'),
      generateSocialPost('tiktok', 'morning'),
      generateSocialPost('twitter', 'morning'),
    ]);

    const fb = facebook.status === 'fulfilled' ? facebook.value : null;
    const ig = instagram.status === 'fulfilled' ? instagram.value : null;
    const li = linkedin.status === 'fulfilled' ? linkedin.value : null;
    const tt = tiktok.status === 'fulfilled' ? tiktok.value : null;
    const tw = twitter.status === 'fulfilled' ? twitter.value : null;

    if (facebook.status === 'rejected') errors.push(`Facebook content: ${facebook.reason}`);
    if (instagram.status === 'rejected') errors.push(`Instagram content: ${instagram.reason}`);
    if (linkedin.status === 'rejected') errors.push(`LinkedIn content: ${linkedin.reason}`);
    if (tiktok.status === 'rejected') errors.push(`TikTok content: ${tiktok.reason}`);
    if (twitter.status === 'rejected') errors.push(`Twitter content: ${twitter.reason}`);

    // 3. Publish Facebook (30% with image) + Instagram
    const useImage = Math.random() < 0.3;
    const [fbResult, igResult] = await Promise.all([
      fb
        ? useImage
          ? publishToFacebookWithImage(fb, getSocialImageUrl())
          : publishToFacebook(fb)
        : Promise.resolve(null),
      ig ? publishToInstagram(ig) : Promise.resolve(null),
    ]);
    results.facebook = fbResult;
    results.instagram = igResult;
    if (fbResult && !fbResult.success) errors.push(`Facebook: ${fbResult.error}`);
    if (igResult && !igResult.success) errors.push(`Instagram: ${igResult.error}`);

    // 4. Publish LinkedIn
    if (li) {
      const liResult = await publishToLinkedIn(li);
      results.linkedin = liResult;
      if (!liResult.success) errors.push(`LinkedIn: ${liResult.error}`);
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
