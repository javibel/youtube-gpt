import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { generateSocialPost } from '@/lib/agent/content-generator';
import { publishToFacebook, publishToInstagram } from '@/lib/agent/meta-agent';
import { publishToLinkedIn } from '@/lib/agent/linkedin-agent';
import { runGmailAgent, sendNotificationEmail } from '@/lib/agent/gmail-agent';
import { runYoutubeAgent } from '@/lib/agent/youtube-agent';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? '';

async function isAdmin(): Promise<boolean> {
  const session = await auth();
  return session?.user?.email === ADMIN_EMAIL;
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { action, type } = await request.json();
  // action: 'publish' | 'messages' | 'test'
  // type: 'morning' | 'evening' (for publish/test)

  try {
    if (action === 'publish') {
      const postType = type === 'evening' ? 'evening' : 'morning';
      const [facebook, instagram, linkedin, tiktok, twitter] = await Promise.allSettled([
        generateSocialPost('facebook', postType),
        generateSocialPost('instagram', postType),
        generateSocialPost('linkedin', postType),
        generateSocialPost('tiktok', postType),
        generateSocialPost('twitter', postType),
      ]);

      const fb = facebook.status === 'fulfilled' ? facebook.value : null;
      const ig = instagram.status === 'fulfilled' ? instagram.value : null;
      const li = linkedin.status === 'fulfilled' ? linkedin.value : null;
      const tt = tiktok.status === 'fulfilled' ? tiktok.value : null;
      const tw = twitter.status === 'fulfilled' ? twitter.value : null;

      const [fbResult, igResult] = await Promise.all([
        fb ? publishToFacebook(fb) : Promise.resolve(null),
        ig ? publishToInstagram(ig) : Promise.resolve(null),
      ]);
      if (li) await publishToLinkedIn(li);

      if (tt || tw) {
        const body = [
          '🤖 AGENTE YTUBVIRAL — POST MANUAL',
          tt ? `📱 TIKTOK:\n${tt}` : '',
          tw ? `🐦 X/TWITTER:\n${tw}` : '',
        ].filter(Boolean).join('\n\n');
        await sendNotificationEmail('[YTubViral Agent] Post manual — TikTok + X', body).catch(() => {});
      }

      return NextResponse.json({
        ok: true,
        facebook: fbResult,
        instagram: igResult,
        tiktok: tt,
        twitter: tw,
      });
    }

    if (action === 'messages') {
      const [gmail, youtube] = await Promise.allSettled([
        runGmailAgent(),
        runYoutubeAgent(),
      ]);
      return NextResponse.json({
        ok: true,
        gmail: gmail.status === 'fulfilled' ? gmail.value : { error: String(gmail.reason) },
        youtube: youtube.status === 'fulfilled' ? youtube.value : { error: String(youtube.reason) },
      });
    }

    if (action === 'test') {
      const postType = type === 'evening' ? 'evening' : 'morning';
      const [facebook, instagram, linkedin, tiktok, twitter] = await Promise.allSettled([
        generateSocialPost('facebook', postType),
        generateSocialPost('instagram', postType),
        generateSocialPost('linkedin', postType),
        generateSocialPost('tiktok', postType),
        generateSocialPost('twitter', postType),
      ]);
      // Test: generate only, do NOT publish
      return NextResponse.json({
        ok: true,
        preview: {
          facebook: facebook.status === 'fulfilled' ? facebook.value : null,
          instagram: instagram.status === 'fulfilled' ? instagram.value : null,
          linkedin: linkedin.status === 'fulfilled' ? linkedin.value : null,
          tiktok: tiktok.status === 'fulfilled' ? tiktok.value : null,
          twitter: twitter.status === 'fulfilled' ? twitter.value : null,
        },
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[agent/run]', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
