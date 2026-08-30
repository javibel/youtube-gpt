import { NextResponse } from 'next/server';
import { getExtensionUser } from '@/lib/extension-auth';
import { rateLimitRequest } from '@/lib/rate-limit-db';

export async function POST(request: Request) {
  // v2.7: open without login (VPH badges = ambient value at second 1, like vidIQ). This route
  // only touches the public YouTube Data API — no user data. Anonymous callers are rate-limited
  // by IP; authenticated callers pass through freely.
  const extUser = await getExtensionUser(request);
  if (!extUser) {
    const ok = await rateLimitRequest(request, 'ext-pub-batch', 300, 10);
    if (!ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const videoIds = body.videoIds as string[] | undefined;
  if (!videoIds || !Array.isArray(videoIds) || videoIds.length === 0) {
    return NextResponse.json({ error: 'videoIds required (array)' }, { status: 400 });
  }

  // Cap at 50
  const ids = videoIds.slice(0, 50).filter(id => /^[a-zA-Z0-9_-]{11}$/.test(id));
  if (ids.length === 0) {
    return NextResponse.json({ error: 'no valid video IDs' }, { status: 400 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'service unavailable' }, { status: 503 });
  }

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids.join(',')}&key=${apiKey}`,
  );
  if (!res.ok) {
    return NextResponse.json({ error: 'YouTube API error' }, { status: 500 });
  }

  const data = await res.json();
  const videos = (data.items || []).map((v: Record<string, unknown>) => {
    const snippet = v.snippet as Record<string, unknown>;
    const stats = (v.statistics || {}) as Record<string, unknown>;
    const views = parseInt((stats.viewCount as string) || '0', 10);
    const publishedAt = snippet.publishedAt ? new Date(snippet.publishedAt as string) : new Date();
    const ageHours = Math.max(1, (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60));
    const vph = Math.round((views / ageHours) * 10) / 10;
    const ageDays = Math.floor(ageHours / 24);

    return {
      videoId: v.id as string,
      views,
      vph,
      ageDays,
    };
  });

  return NextResponse.json({ videos });
}
