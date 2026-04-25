import { NextResponse } from 'next/server';
import { runGmailAgent } from '@/lib/agent/gmail-agent';
import { runYoutubeAgent } from '@/lib/agent/youtube-agent';
import { sendNotificationEmail } from '@/lib/agent/gmail-agent';

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

  const allErrors: string[] = [];

  try {
    // Run Gmail and YouTube agents in parallel
    const [gmailResult, youtubeResult] = await Promise.allSettled([
      runGmailAgent(),
      runYoutubeAgent(),
    ]);

    const gmail = gmailResult.status === 'fulfilled'
      ? gmailResult.value
      : { processed: 0, replied: 0, errors: [String(gmailResult.reason)] };

    const youtube = youtubeResult.status === 'fulfilled'
      ? youtubeResult.value
      : { processed: 0, replied: 0, errors: [String(youtubeResult.reason)] };

    allErrors.push(...gmail.errors, ...youtube.errors);

    // Alert only for critical failures (not per-message errors)
    if (gmailResult.status === 'rejected' || youtubeResult.status === 'rejected') {
      await sendNotificationEmail(
        '[YTubViral Agent] ⚠️ Error en cron mensajes',
        allErrors.join('\n')
      ).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      gmail: { processed: gmail.processed, replied: gmail.replied },
      youtube: { processed: youtube.processed, replied: youtube.replied },
      errors: allErrors,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cron/messages]', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
