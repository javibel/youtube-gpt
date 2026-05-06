import { NextResponse } from 'next/server';
import { generateSocialPost } from '@/lib/agent/content-generator';
import { publishToInstagram, retryPendingFacebookPost } from '@/lib/agent/meta-agent';
import { sendNotificationEmail } from '@/lib/agent/gmail-agent';
import { runYoutubeAgent } from '@/lib/agent/youtube-agent';
import { runFeedbackAgent } from '@/lib/agent/feedback-agent';
import { processAbTests } from '@/lib/ab-test-processor';
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
    // 1. Generate Instagram content + run agents in parallel (evening = Instagram only)
    // Gmail agent disabled here — YCML (local PM2 agent) handles inbox every 30min
    const [instagram, youtubeResult] =
      await Promise.allSettled([
        generateSocialPost('instagram', 'evening'),
        runYoutubeAgent(),
      ]);

    const ig = instagram.status === 'fulfilled' ? instagram.value : null;

    if (instagram.status === 'rejected') errors.push(`Instagram content: ${instagram.reason}`);

    // Retry Facebook posts that failed with error 190 (Meta block) during morning cron
    const fbRetry = await retryPendingFacebookPost().catch(err => ({
      success: false as const,
      skipped: false,
      error: err instanceof Error ? err.message : String(err),
    }));
    results.facebookRetry = fbRetry;
    if (!fbRetry.success && !fbRetry.skipped) errors.push(`Facebook retry: ${fbRetry.error}`);

    // 0. Send feedback emails to users registered 3 days ago
    const feedbackResult = await runFeedbackAgent().catch(err => ({
      sent: 0,
      errors: [`Feedback agent: ${err instanceof Error ? err.message : err}`],
    }));
    errors.push(...feedbackResult.errors);
    results.feedback = { sent: feedbackResult.sent };

    // YouTube agent results
    const youtube = youtubeResult.status === 'fulfilled'
      ? youtubeResult.value
      : { processed: 0, replied: 0, errors: [`YouTube agent failed: ${youtubeResult.reason}`] };
    errors.push(...youtube.errors);
    results.youtube = { processed: youtube.processed, replied: youtube.replied };

    // 2. Publish Instagram (evening slot — 18:30 Madrid)
    if (ig) {
      const igResult = await publishToInstagram(ig);
      results.instagram = igResult;
      if (!igResult.success) errors.push(`Instagram: ${igResult.error}`);
    }

    // Process A/B tests (switch variants, complete tests)
    const abResult = await processAbTests().catch(err => ({
      switched: 0,
      completed: 0,
      errors: [`A/B test processor: ${err instanceof Error ? err.message : String(err)}`],
    }));
    results.abTests = { switched: abResult.switched, completed: abResult.completed };
    errors.push(...abResult.errors);

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
