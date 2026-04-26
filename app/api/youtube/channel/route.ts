import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

type RefreshResult =
  | { ok: true; accessToken: string }
  | { ok: false; permanent: boolean }; // permanent=true → invalid_grant, delete token

async function refreshAccessToken(yt: { refreshToken: string | null; userId: string }): Promise<RefreshResult> {
  if (!yt.refreshToken) {
    // No refresh token stored — treat as transient so cached data is shown, not deleted
    console.error('[youtube/refresh] no refresh token for user', yt.userId);
    return { ok: false, permanent: false };
  }

  let data: Record<string, unknown>;
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: yt.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    data = await res.json();
  } catch {
    // Network error — don't delete the token, let the caller use cached data
    return { ok: false, permanent: false };
  }

  if (!data.access_token) {
    const permanent = data.error === 'invalid_grant' || data.error === 'invalid_client';
    console.error('[youtube/refresh] token refresh failed', data.error, 'permanent:', permanent, 'userId:', yt.userId);
    return { ok: false, permanent };
  }

  const expiresAt = new Date(Date.now() + ((data.expires_in as number) || 3600) * 1000);
  await prisma.youtubeToken.update({
    where: { userId: yt.userId },
    data: { accessToken: data.access_token as string, expiresAt },
  });

  return { ok: true, accessToken: data.access_token as string };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const yt = await prisma.youtubeToken.findUnique({ where: { userId: session.user.id } });
  if (!yt) {
    return NextResponse.json({ connected: false });
  }

  // Token was marked as permanently invalid (accessToken cleared, expiresAt set to epoch)
  if (!yt.accessToken && yt.expiresAt.getTime() === 0) {
    return NextResponse.json({ connected: false, expired: true });
  }

  // Return cached data if stats are fresh (< 1 hour old)
  const oneHourAgo = new Date(Date.now() - 3600 * 1000);
  if (yt.updatedAt > oneHourAgo && yt.channelName) {
    return NextResponse.json({
      connected: true,
      cached: true,
      channel: {
        id: yt.channelId,
        name: yt.channelName,
        thumbnail: yt.channelThumb,
        subscribers: parseInt(String(yt.subscribers ?? '0'), 10),
        totalViews: parseInt(String(yt.totalViews ?? '0'), 10),
        videoCount: parseInt(String(yt.videoCount ?? '0'), 10),
      },
      videos: [],
    });
  }

  // Refresh token if expired (with 60s margin)
  let accessToken = yt.accessToken;
  if (yt.expiresAt < new Date(Date.now() + 60_000)) {
    const refreshResult = await refreshAccessToken({ refreshToken: yt.refreshToken, userId: yt.userId });
    if (!refreshResult.ok) {
      if (refreshResult.permanent) {
        // Google revoked the token — mark as expired but keep the record so user can reconnect
        // (deleting it would lose channel info and make the reconnect prompt less clear)
        await prisma.youtubeToken.update({
          where: { userId: session.user.id },
          data: { accessToken: '', expiresAt: new Date(0) },
        });
        return NextResponse.json({ connected: false, expired: true });
      }
      // Transient error (network, Google API down) — return cached data so UI stays connected
      return NextResponse.json({
        connected: true,
        cached: true,
        channel: {
          id: yt.channelId,
          name: yt.channelName,
          thumbnail: yt.channelThumb,
          subscribers: parseInt(String(yt.subscribers ?? '0'), 10),
          totalViews: parseInt(String(yt.totalViews ?? '0'), 10),
          videoCount: parseInt(String(yt.videoCount ?? '0'), 10),
        },
        videos: [],
      });
    }
    accessToken = refreshResult.accessToken;
  }

  try {
    // Latest channel stats
    const channelRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const channelData = await channelRes.json();
    const channel = channelData.items?.[0];

    // Last 5 uploaded videos
    const videosRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channel?.id}&order=date&type=video&maxResults=5`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const videosData = await videosRes.json();
    const videoIds = videosData.items?.map((v: { id: { videoId: string } }) => v.id.videoId).join(',') || '';

    let videos: {
      videoId: string;
      title: string;
      thumbnail: string;
      publishedAt: string;
      views: number;
      likes: number;
    }[] = [];

    if (videoIds) {
      const statsRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const statsData = await statsRes.json();
      videos = (statsData.items || []).map((v: {
        id: string;
        snippet: { title: string; thumbnails: { medium: { url: string } }; publishedAt: string };
        statistics: { viewCount?: string; likeCount?: string };
      }) => ({
        videoId: v.id,
        title: v.snippet?.title || '',
        thumbnail: v.snippet?.thumbnails?.medium?.url || '',
        publishedAt: v.snippet?.publishedAt || '',
        views: parseInt(v.statistics?.viewCount || '0', 10),
        likes: parseInt(v.statistics?.likeCount || '0', 10),
      }));
    }

    // Update cached stats
    if (channel) {
      await prisma.youtubeToken.update({
        where: { userId: session.user.id },
        data: {
          channelName: channel.snippet?.title,
          channelThumb: channel.snippet?.thumbnails?.default?.url,
          subscribers: channel.statistics?.subscriberCount,
          totalViews: channel.statistics?.viewCount,
          videoCount: channel.statistics?.videoCount,
        },
      });
    }

    return NextResponse.json({
      connected: true,
      channel: {
        id: channel?.id,
        name: channel?.snippet?.title,
        thumbnail: channel?.snippet?.thumbnails?.default?.url,
        subscribers: parseInt(channel?.statistics?.subscriberCount || '0', 10),
        totalViews: parseInt(channel?.statistics?.viewCount || '0', 10),
        videoCount: parseInt(channel?.statistics?.videoCount || '0', 10),
      },
      videos,
    });
  } catch (err) {
    console.error('[youtube/channel]', err);
    return NextResponse.json({ error: 'Failed to fetch channel data' }, { status: 500 });
  }
}
