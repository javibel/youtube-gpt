import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

async function refreshAccessToken(yt: { refreshToken: string | null; userId: string }) {
  if (!yt.refreshToken) return null;

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

  const data = await res.json();
  if (!data.access_token) return null;

  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);
  await prisma.youtubeToken.update({
    where: { userId: yt.userId },
    data: { accessToken: data.access_token, expiresAt },
  });

  return data.access_token as string;
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

  // Refresh token if expired (with 60s margin)
  let accessToken = yt.accessToken;
  if (yt.expiresAt < new Date(Date.now() + 60_000)) {
    const refreshed = await refreshAccessToken({ refreshToken: yt.refreshToken, userId: yt.userId });
    if (!refreshed) {
      // Token is dead — remove and ask user to reconnect
      await prisma.youtubeToken.delete({ where: { userId: session.user.id } });
      return NextResponse.json({ connected: false, expired: true });
    }
    accessToken = refreshed;
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
