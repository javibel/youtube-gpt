import { NextResponse } from 'next/server';
import { generateSocialPost } from '@/lib/agent/content-generator';
import { publishToFacebook, publishToInstagram } from '@/lib/agent/meta-agent';
import { publishToLinkedIn } from '@/lib/agent/linkedin-agent';
import { sendNotificationEmail } from '@/lib/agent/gmail-agent';
import { prisma } from '@/lib/prisma';

function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const errors: string[] = [];
  const results: Record<string, unknown> = {};

  try {
    // 1. Generate evening content (more reflective/inspirational)
    const [facebook, instagram, linkedin, tiktok, twitter] = await Promise.allSettled([
      generateSocialPost('facebook', 'evening'),
      generateSocialPost('instagram', 'evening'),
      generateSocialPost('linkedin', 'evening'),
      generateSocialPost('tiktok', 'evening'),
      generateSocialPost('twitter', 'evening'),
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

    // 2. Publish Facebook + Instagram via Meta Graph API
    const [fbResult, igResult] = await Promise.all([
      fb ? publishToFacebook(fb) : Promise.resolve(null),
      ig ? publishToInstagram(ig) : Promise.resolve(null),
    ]);
    results.facebook = fbResult;
    results.instagram = igResult;
    if (fbResult && !fbResult.success) errors.push(`Facebook: ${fbResult.error}`);
    if (igResult && !igResult.success) errors.push(`Instagram: ${igResult.error}`);

    // 3. Publish LinkedIn via direct API
    if (li) {
      const liResult = await publishToLinkedIn(li);
      results.linkedin = liResult;
      if (!liResult.success) errors.push(`LinkedIn: ${liResult.error}`);
    }

    // 3. Send TikTok + X by email
    if (tt || tw) {
      const emailBody = [
        '🤖 AGENTE YTUBVIRAL — POST VESPERTINO (MANUAL)',
        '='.repeat(50),
        '',
        tt ? ['📱 TIKTOK', '-'.repeat(30), tt, ''].join('\n') : '',
        tw ? ['🐦 X/TWITTER', '-'.repeat(30), tw, ''].join('\n') : '',
        '='.repeat(50),
        'Copia el contenido y publícalo directamente en cada plataforma.',
      ].filter(Boolean).join('\n');

      await sendNotificationEmail('[YTubViral Agent] Post vespertino — TikTok + X', emailBody).catch(
        err => errors.push(`Email: ${err instanceof Error ? err.message : err}`)
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
        '[YTubViral Agent] ⚠️ Errores en cron vespertino',
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
