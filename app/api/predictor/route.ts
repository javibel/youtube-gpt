import { getMessagesTask } from '@/lib/ai/task-runtime';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';
import { getUserPlan, isPaid } from '@/lib/plans';

export const maxDuration = 60;

// Retiring HTTP does not cancel or replace an original OAuth resolver or task.
function predictionHttpWait(signal: AbortSignal) {
  const deadline = performance.now() + 55_000;
  let retired = false;
  let rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => {
    if (!retired) { retired = true; rejectWait(new Error('Prediction unconfirmed')); }
  };
  const timer = setTimeout(retire, 55_000);
  signal.addEventListener('abort', retire, { once: true });
  const check = () => {
    if (signal.aborted || performance.now() >= deadline) retire();
    if (retired) throw new Error('Prediction unconfirmed');
  };
  return {
    async run<T>(operation: () => Promise<T>): Promise<T> {
      check();
      const original = Promise.resolve().then(() => { check(); return operation(); });
      const result = await Promise.race([original, stopped]);
      check();
      return result;
    },
    check,
    close() { clearTimeout(timer); signal.removeEventListener('abort', retire); },
  };
}

interface VideoData {
  title: string;
  views: number;
  likes: number;
  comments: number;
  duration: number; // seconds
  publishedAt: string;
  tags: string[];
  descriptionLength: number;
  hasCustomThumbnail: boolean;
}

export async function POST(request: Request) {
  const wait = predictionHttpWait(request.signal);
  try {
    const response = await predict(request, wait);
    wait.check();
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return NextResponse.json({ error: 'prediction_unconfirmed', retryMayConsume: false }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  } finally { wait.close(); }
}

async function predict(request: Request, wait: ReturnType<typeof predictionHttpWait>) {
  const session = await wait.run(() => auth());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const operationKey = request.headers.get('idempotency-key');
  const recovery = request.headers.get('X-Predictor-Recovery');
  if ((operationKey !== null && !/^[-A-Za-z0-9._:]{1,128}$/.test(operationKey))
    || (recovery !== null && (recovery !== 'retained-only-v1' || operationKey === null))) {
    return NextResponse.json({ error: 'invalid_recovery' }, { status: 400 });
  }

  const plan = await wait.run(() => getUserPlan(userId));
  if (!isPaid(plan)) {
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  const body = await wait.run(() => request.json().catch(() => ({})));
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || ['title', 'description', 'tags'].some(key => body[key] != null && typeof body[key] !== 'string')) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const title = (body.title || '').trim();
  const description = (body.description || '').trim();
  const tags = (body.tags || '').trim();

  if (!title) {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }

  const yt = await wait.run(() => prisma.youtubeToken.findUnique({ where: { userId } }));
  if (!yt?.channelId) {
    return NextResponse.json({ error: 'youtube_not_connected' }, { status: 400 });
  }

  const token = await wait.run(() => getAccessToken(userId));
  if (!token) {
    return NextResponse.json({ error: 'token_expired' }, { status: 401 });
  }

  // Fetch last 30 videos for baseline
  let videos: VideoData[] = [];
  try {
    const searchRes = await wait.run(() => fetch(
      `https://www.googleapis.com/youtube/v3/search?part=id&forMine=true&type=video&order=date&maxResults=30`,
      { headers: { Authorization: `Bearer ${token}` }, signal: request.signal },
    ));
    if (!searchRes.ok) throw new Error('search failed');
    const searchData = await wait.run(() => searchRes.json());
    const ids = (searchData.items || []).map((i: { id: { videoId: string } }) => i.id.videoId).join(',');

    if (ids) {
      const vidsRes = await wait.run(() => fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${ids}`,
        { headers: { Authorization: `Bearer ${token}` }, signal: request.signal },
      ));
      if (vidsRes.ok) {
        const vidsData = await wait.run(() => vidsRes.json());
        videos = (vidsData.items || []).map((v: {
          snippet: { title: string; publishedAt: string; tags?: string[]; description: string; thumbnails?: Record<string, unknown> };
          statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
          contentDetails: { duration?: string };
        }) => {
          const durMatch = (v.contentDetails.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
          const durSec = durMatch
            ? (parseInt(durMatch[1] || '0') * 3600) + (parseInt(durMatch[2] || '0') * 60) + parseInt(durMatch[3] || '0')
            : 0;
          return {
            title: v.snippet.title,
            views: parseInt(v.statistics.viewCount || '0', 10),
            likes: parseInt(v.statistics.likeCount || '0', 10),
            comments: parseInt(v.statistics.commentCount || '0', 10),
            duration: durSec,
            publishedAt: v.snippet.publishedAt,
            tags: v.snippet.tags || [],
            descriptionLength: v.snippet.description?.split(/\s+/).filter(Boolean).length || 0,
            hasCustomThumbnail: v.snippet.thumbnails ? Object.keys(v.snippet.thumbnails).length >= 4 : false,
          };
        });
      }
    }
  } catch {
    wait.check();
    return NextResponse.json({ error: 'youtube_api_error' }, { status: 500 });
  }

  if (videos.length < 3) {
    return NextResponse.json({ error: 'not_enough_videos', videoCount: videos.length }, { status: 400 });
  }

  // Compute channel baselines
  const avgViews = Math.round(videos.reduce((s, v) => s + v.views, 0) / videos.length);
  const medianViews = videos.map(v => v.views).sort((a, b) => a - b)[Math.floor(videos.length / 2)];
  const avgLikes = Math.round(videos.reduce((s, v) => s + v.likes, 0) / videos.length);
  const avgComments = Math.round(videos.reduce((s, v) => s + v.comments, 0) / videos.length);
  const avgEngagement = avgViews > 0 ? ((avgLikes + avgComments) / avgViews) * 100 : 0;
  const topVideo = videos.reduce((best, v) => v.views > best.views ? v : best, videos[0]);
  const bottomVideo = videos.reduce((worst, v) => v.views < worst.views ? v : worst, videos[0]);

  // Build channel context for AI prediction
  const channelContext = {
    channelName: yt.channelName || 'Unknown',
    subscribers: yt.subscribers || 0,
    avgViews,
    medianViews,
    avgEngagement: avgEngagement.toFixed(1),
    topVideoViews: topVideo.views,
    topVideoTitle: topVideo.title,
    bottomVideoViews: bottomVideo.views,
    videoCount: videos.length,
  };

  const userLang = body.lang === 'en' ? 'en' : 'es';

  const prompt = `You are a YouTube analytics predictor. Based on the creator's channel data and the proposed video details, predict its performance.

CHANNEL DATA:
- Channel: ${channelContext.channelName} (${channelContext.subscribers} subs)
- Last ${channelContext.videoCount} videos: avg ${channelContext.avgViews} views, median ${channelContext.medianViews} views
- Avg engagement: ${channelContext.avgEngagement}%
- Best video: "${channelContext.topVideoTitle}" (${channelContext.topVideoViews} views)
- Worst recent: ${channelContext.bottomVideoViews} views

PROPOSED VIDEO:
- Title: "${title}"
- Description length: ${description.split(/\s+/).filter(Boolean).length} words
- Tags: ${tags || 'none'}

Output ONLY a valid JSON object with these fields:
- estimatedViews: {low: number, mid: number, high: number} (realistic range based on channel data)
- estimatedEngagement: number (percentage, e.g. 4.2)
- titleScore: number (0-100, how good is this title for CTR)
- seoScore: number (0-100, based on title+description+tags)
- viralPotential: "low" | "medium" | "high"
- strengths: string[] (2-3 short bullet points in ${userLang})
- weaknesses: string[] (2-3 short bullet points in ${userLang})
- suggestion: string (1-2 sentences of key advice in ${userLang})

Be realistic. Base predictions on actual channel metrics, not optimistic guesses.`;

  try {
    let task;
    try {
      task = await wait.run(() => getMessagesTask({ operationKey: operationKey ?? undefined, taskType: 'youtube.performance-prediction', userId,
        language: userLang, instructionsVersion: 'performance-prediction-v1',
        outputSchema: {
          type: 'object', additionalProperties: false,
          required: ['estimatedViews','estimatedEngagement','titleScore','seoScore','viralPotential','strengths','weaknesses','suggestion'],
          properties: {
            estimatedViews: { type: 'object', additionalProperties: false, required: ['low','mid','high'], properties: {
              low: { type: 'number', minimum: 0 }, mid: { type: 'number', minimum: 0 }, high: { type: 'number', minimum: 0 },
            } },
            estimatedEngagement: { type: 'number', minimum: 0 },
            titleScore: { type: 'number', minimum: 0, maximum: 100 }, seoScore: { type: 'number', minimum: 0, maximum: 100 },
            viralPotential: { type: 'string', enum: ['low','medium','high'] },
            strengths: { type: 'array', items: { type: 'string' } }, weaknesses: { type: 'array', items: { type: 'string' } },
            suggestion: { type: 'string', minLength: 1 },
          },
        },
      }));
    } catch {
      wait.check();
      return NextResponse.json({ error: 'service unavailable' }, { status: 503 });
    }
    const parameters = { max_tokens: 600, messages: [{ role: 'user' as const, content: prompt }] };
    const data = await wait.run(() => recovery !== null
      ? Promise.resolve(task.retrieve?.(parameters, { signal: request.signal }))
      : task.create(parameters, { signal: request.signal }));
    if (!data) return NextResponse.json({ error: 'prediction_unconfirmed', retryMayConsume: false }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
    const prediction = JSON.parse(data.content[0].text);
    if (prediction.estimatedViews.low > prediction.estimatedViews.mid || prediction.estimatedViews.mid > prediction.estimatedViews.high) {
      return NextResponse.json({ error: 'prediction_failed' }, { status: 500 });
    }

    return NextResponse.json({
      prediction,
      baseline: {
        avgViews,
        medianViews,
        avgEngagement: parseFloat(avgEngagement.toFixed(1)),
        topVideoViews: topVideo.views,
        topVideoTitle: topVideo.title,
        videoCount: videos.length,
        subscribers: yt.subscribers || 0,
      },
    });
  } catch {
    wait.check();
    return NextResponse.json({ error: 'prediction_failed' }, { status: 500 });
  }
}
