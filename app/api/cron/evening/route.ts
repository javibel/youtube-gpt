import { authorizeCronDispatch, runCronDispatch } from '@/lib/cron-dispatch-original';
import { NextResponse } from 'next/server';
import { generateSocialPost,publishCronInstagramPhoto,consumeCronInstagramPublication } from '@/lib/agent/content-generator';
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

  return runCronDispatch(original, async (step, _tip, _ideas, _email, issueSocialPost, issueBrandImageRead, _morningSocial, _verify, _reengagement, issueYoutubeComments, issueYoutubeReplies, issueFeedback) => {
  const errors: string[] = [];
  const results: Record<string, unknown> = {};

  try {
    // Consume the native A/B original before unrelated jobs use its budget.
    const abResult = await step(() => processAbTests(abOriginal));
    results.abTests = abResult;
    errors.push(...abResult.errors);

    // 1. Generate Instagram content + run agents in parallel (evening = Instagram only)
    // Gmail agent disabled here — YCML (local PM2 agent) handles inbox every 30min
    const instagramOriginal=issueSocialPost('instagram'),youtubeReadOriginal=issueYoutubeComments();
    const [instagram, youtubeResult] =
      await Promise.allSettled([
        step(() => generateSocialPost('instagram', 'evening', instagramOriginal)),
        step(() => runYoutubeAgent(youtubeReadOriginal,issueYoutubeReplies(youtubeReadOriginal))),
      ]);

    const ig = instagram.status === 'fulfilled' ? instagram.value : null;

    if (instagram.status === 'rejected') errors.push(`Instagram content: ${instagram.reason}`);

    // Existing rows do not authorize retrying an uncertain publication.
    results.facebookRetry={success:false,error:'social_publish_unconfirmed'};

    // 0. Send feedback emails to users registered 3 days ago
    const feedbackResult = await step(() => runFeedbackAgent(issueFeedback())).catch(() => ({
      sent: 0,
      errors: ['feedback_batch_unconfirmed'],
    }));
    errors.push(...feedbackResult.errors);
    results.feedback = { sent: feedbackResult.sent,...('coverage' in feedbackResult?{coverage:feedbackResult.coverage,scanned:feedbackResult.scanned,hasMore:feedbackResult.hasMore,disabled:feedbackResult.disabled,excluded:feedbackResult.excluded,unconfirmed:feedbackResult.unconfirmed}:{}) };

    // YouTube agent results
    const youtube = youtubeResult.status === 'fulfilled'
      ? youtubeResult.value
      : { processed: 0, replied: 0, errors: [`YouTube agent failed: ${youtubeResult.reason}`] };
    errors.push(...youtube.errors);
    results.youtube = { processed: youtube.processed, replied: youtube.replied, ...('coverage' in youtube?{coverage:youtube.coverage}:{}),...('replyCoverage' in youtube?{replyCoverage:youtube.replyCoverage}:{}) };

    // The same source/read/native lifetime owns image,day,remote effect and
    // SQL completion. Only its private final consumer may build this response.
    if (!ig) return NextResponse.json({ok:false,error:'social_publish_unconfirmed',results,errors},{status:503});
    try {
      const receipt=await step(()=>publishCronInstagramPhoto(instagramOriginal,issueBrandImageRead()));
      return await step(()=>consumeCronInstagramPublication(receipt,async published=>{
        await published.validateBeforeResponse();
        const response=NextResponse.json({ok:errors.length===0,...(errors.length?{error:'cron_jobs_unconfirmed'}:{}),results:{...results,brandImage:published.brandImage,instagram:{success:true,postId:published.postId}},errors},{status:errors.length?503:200});
        await published.validateBeforeResponse();return response;
      }));
    } catch (error) {
      const message=(error as {message?:unknown}|null)?.message;
      const code=message==='daily_brand_image_unconfirmed'||message==='daily_brand_image_read_unconfirmed'?'daily_brand_image_unconfirmed':'social_publish_unconfirmed';
      return NextResponse.json({ok:false,error:code,results,errors},{status:503});
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cron/evening]', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
  }).catch(() => NextResponse.json({ ok: false, error: 'cron_invocation_unconfirmed' }, { status: 503 }));
}
