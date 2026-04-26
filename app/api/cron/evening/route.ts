import { NextResponse } from 'next/server';
import { generateSocialPost } from '@/lib/agent/content-generator';
import {
  publishToFacebook,
  publishToFacebookWithImage,
  publishToInstagram,
  getSocialImageUrl,
} from '@/lib/agent/meta-agent';
import { publishToLinkedIn } from '@/lib/agent/linkedin-agent';
import { runGmailAgent, sendNotificationEmail, sendOwnerEmail } from '@/lib/agent/gmail-agent';
import { runYoutubeAgent } from '@/lib/agent/youtube-agent';
import { prisma } from '@/lib/prisma';

export const maxDuration = 60;

function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const errors: string[] = [];
  const results: Record<string, unknown> = {};

  try {
    // 1. Generate evening content (more reflective/inspirational) + run agents in parallel
    const [facebook, instagram, linkedin, tiktok, twitter, gmailResult, youtubeResult] =
      await Promise.allSettled([
        generateSocialPost('facebook', 'evening'),
        generateSocialPost('instagram', 'evening'),
        generateSocialPost('linkedin', 'evening'),
        generateSocialPost('tiktok', 'evening'),
        generateSocialPost('twitter', 'evening'),
        runGmailAgent(),
        runYoutubeAgent(),
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

    // Gmail agent results
    const gmail = gmailResult.status === 'fulfilled'
      ? gmailResult.value
      : { processed: 0, replied: 0, errors: [`Gmail agent failed: ${gmailResult.reason}`] };
    errors.push(...gmail.errors);
    results.gmail = { processed: gmail.processed, replied: gmail.replied };

    // YouTube agent results
    const youtube = youtubeResult.status === 'fulfilled'
      ? youtubeResult.value
      : { processed: 0, replied: 0, errors: [`YouTube agent failed: ${youtubeResult.reason}`] };
    errors.push(...youtube.errors);
    results.youtube = { processed: youtube.processed, replied: youtube.replied };

    // 2. Publish Facebook (30% with image) + Instagram
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

    // 3. Publish LinkedIn
    if (li) {
      const liResult = await publishToLinkedIn(li);
      results.linkedin = liResult;
      if (!liResult.success) errors.push(`LinkedIn: ${liResult.error}`);
    }

    // 4. TikTok + X by email (manual)
    if (tt || tw) {
      const emailBody = [
        'AGENTE YTUBVIRAL - POST VESPERTINO (MANUAL)',
        '='.repeat(50),
        tt ? `TIKTOK\n${'-'.repeat(30)}\n${tt}\n` : '',
        tw ? `X/TWITTER\n${'-'.repeat(30)}\n${tw}\n` : '',
        '='.repeat(50),
        'Copia el contenido y publícalo directamente en cada plataforma.',
      ].filter(Boolean).join('\n');

      await sendOwnerEmail('[YTubViral Agent] Post vespertino - TikTok + X', emailBody).catch(
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

    if (errors.length > 0) {
      await sendNotificationEmail(
        '[YTubViral Agent] Errores en cron vespertino',
        errors.join('\n')
      ).catch(() => {});
    }

    return NextResponse.json({ ok: true, results, errors });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cron/evening]', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
