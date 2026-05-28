import { NextResponse } from 'next/server';
import { getExtensionUser } from '@/lib/extension-auth';

const POSITIVE = /\b(love|great|amazing|awesome|excellent|fantastic|perfect|best|helpful|incredible|thank|genial|increíble|excelente|fantástico|gracias|perfecto|mejor|útil|maravilloso)\b/i;
const NEGATIVE = /\b(bad|terrible|hate|horrible|worst|awful|useless|boring|waste|disappointing|malo|terrible|odio|horrible|peor|inútil|aburrido|decepcionante)\b/i;

interface Comment {
  author: string;
  text: string;
  likes: number;
  replies: number;
  publishedAt: string;
}

export async function POST(request: Request) {
  const extUser = await getExtensionUser(request);
  if (!extUser) {
    return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const videoId = body.videoId as string | undefined;
  if (!videoId) {
    return NextResponse.json({ error: 'videoId required' }, { status: 400 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'service unavailable' }, { status: 503 });
  }

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${encodeURIComponent(videoId)}&maxResults=100&order=relevance&key=${apiKey}`,
  );

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    if (errData?.error?.errors?.[0]?.reason === 'commentsDisabled') {
      return NextResponse.json({ commentsDisabled: true, totalComments: 0, topByLikes: [], questions: [], sentiment: { positive: 0, negative: 0, neutral: 1 } });
    }
    return NextResponse.json({ error: 'YouTube API error' }, { status: 500 });
  }

  const data = await res.json();
  const threads = data.items || [];

  const comments: Comment[] = threads.map((t: Record<string, unknown>) => {
    const s = (t.snippet as Record<string, unknown>)?.topLevelComment as Record<string, unknown>;
    const snip = (s?.snippet || {}) as Record<string, unknown>;
    return {
      author: (snip.authorDisplayName as string) || '',
      text: (snip.textDisplay as string) || '',
      likes: (snip.likeCount as number) || 0,
      replies: ((t.snippet as Record<string, unknown>)?.totalReplyCount as number) || 0,
      publishedAt: (snip.publishedAt as string) || '',
    };
  });

  // Top by likes
  const topByLikes = [...comments].sort((a, b) => b.likes - a.likes).slice(0, 5);

  // Questions
  const questions = comments.filter(c => c.text.includes('?')).sort((a, b) => b.likes - a.likes).slice(0, 10);

  // Sentiment
  let pos = 0, neg = 0, neu = 0;
  for (const c of comments) {
    const isPos = POSITIVE.test(c.text);
    const isNeg = NEGATIVE.test(c.text);
    if (isPos && !isNeg) pos++;
    else if (isNeg && !isPos) neg++;
    else neu++;
  }
  const total = comments.length || 1;

  return NextResponse.json({
    commentsDisabled: false,
    totalComments: comments.length,
    topByLikes,
    questions,
    sentiment: {
      positive: Math.round((pos / total) * 100) / 100,
      negative: Math.round((neg / total) * 100) / 100,
      neutral: Math.round((neu / total) * 100) / 100,
    },
  });
}
