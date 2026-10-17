import { authorizeCronDispatch, runCronDispatch } from '@/lib/cron-dispatch-original';
import { NextResponse } from 'next/server';
import { generateSocialPost } from '@/lib/agent/content-generator';
import { getOrCreateDailyBrandImage, consumeDailyBrandImage } from '@/lib/agent/ideogram-image';
import { sendNotificationEmail } from '@/lib/agent/gmail-agent';
import { runYoutubeAgent } from '@/lib/agent/youtube-agent';
import { runFeedbackAgent } from '@/lib/agent/feedback-agent';
import { processAbTests } from '@/lib/ab-test-processor';
import { authorizeNativeAbProcessor } from '@/lib/ab-processor-original';

export const maxDuration = 60;

export async function GET(request: Request) {
  const original = authorizeCronDispatch(request, 'evening');
  const abOriginal=authorizeNativeAbProcessor(request);
  if (!original || !abOriginal) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return runCronDispatch(original, async (step, _tip, _ideas, _email, issueSocialPost, issueBrandImageRead) => {
  const errors: string[] = [];
  const results: Record<string, unknown> = {};

  try {
    // Consume the native A/B original before unrelated jobs use its budget.
    const abResult = await step(() => processAbTests(abOriginal));
    results.abTests = abResult;
    errors.push(...abResult.errors);

    // 1. Generate Instagram content + run agents in parallel (evening = Instagram only)
    // Gmail agent disabled here — YCML (local PM2 agent) handles inbox every 30min
    const instagramOriginal=issueSocialPost('instagram');
    const [instagram, youtubeResult] =
      await Promise.allSettled([
        step(() => generateSocialPost('instagram', 'evening', instagramOriginal)),
        step(() => runYoutubeAgent()),
      ]);

    const ig = instagram.status === 'fulfilled' ? instagram.value : null;

    if (instagram.status === 'rejected') errors.push(`Instagram content: ${instagram.reason}`);

    // Existing rows do not authorize retrying an uncertain publication.
    results.facebookRetry={success:false,error:'social_publish_unconfirmed'};

    // 0. Send feedback emails to users registered 3 days ago
    const feedbackResult = await step(() => runFeedbackAgent()).catch(err => ({
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

    // Keep the same evening source and original 55-second lifetime.
    if (ig) {
      try {
        const image=await step(()=>getOrCreateDailyBrandImage(instagramOriginal,issueBrandImageRead()));
        results.brandImage=await step(()=>consumeDailyBrandImage(image,async own=>own.producerAcknowledged?{date:own.date,cacheCompleted:true}:{date:own.date,cacheResourceRead:true,producerAcknowledged:false}));
      } catch {
        return NextResponse.json({ok:false,error:'daily_brand_image_unconfirmed',results,errors},{status:503});
      }
      results.instagram={success:false,error:'social_publish_unconfirmed'};
      return NextResponse.json({ok:false,error:'social_publish_unconfirmed',results,errors},{status:503});
    }

    if (errors.length > 0) {
      await step(() => sendNotificationEmail(
        '[YTubViral Agent] Errores en cron vespertino',
        errors.join('\n')
      )).catch(() => {});
    }

    return NextResponse.json({ ok: true, results, errors });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cron/evening]', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
  }).catch(() => NextResponse.json({ ok: false, error: 'cron_invocation_unconfirmed' }, { status: 503 }));
}
