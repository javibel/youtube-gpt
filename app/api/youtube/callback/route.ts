import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const BASE = process.env.NEXTAUTH_URL!;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const cookieValue = request.cookies.get('yt_oauth_state')?.value ?? '';
  const [userId, expectedNonce] = cookieValue.split(':');

  if (error || !code || !state || !userId || !expectedNonce || state !== expectedNonce) {
    const response = NextResponse.redirect(`${BASE}/dashboard?yt=error`);
    response.cookies.delete('yt_oauth_state');
    return response;
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID?.trim(),
        client_secret: process.env.GOOGLE_CLIENT_SECRET?.trim(),
        redirect_uri: `${BASE.trim()}/api/youtube/callback`,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      return NextResponse.redirect(`${BASE}/dashboard?yt=error`);
    }

    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

    // Fetch channel info
    const channelRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    const channelData = await channelRes.json();
    const channel = channelData.items?.[0];

    // Upsert token + channel info
    await prisma.youtubeToken.upsert({
      where: { userId },
      create: {
        userId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        expiresAt,
        channelId: channel?.id || null,
        channelName: channel?.snippet?.title || null,
        channelThumb: channel?.snippet?.thumbnails?.default?.url || null,
        subscribers: channel?.statistics?.subscriberCount || null,
        totalViews: channel?.statistics?.viewCount || null,
        videoCount: channel?.statistics?.videoCount || null,
      },
      update: {
        accessToken: tokens.access_token,
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        expiresAt,
        channelId: channel?.id || null,
        channelName: channel?.snippet?.title || null,
        channelThumb: channel?.snippet?.thumbnails?.default?.url || null,
        subscribers: channel?.statistics?.subscriberCount || null,
        totalViews: channel?.statistics?.viewCount || null,
        videoCount: channel?.statistics?.videoCount || null,
      },
    });

    const success = NextResponse.redirect(`${BASE}/dashboard?yt=connected`);
    success.cookies.delete('yt_oauth_state');
    return success;
  } catch (err) {
    console.error('[youtube/callback]', err);
    const errResponse = NextResponse.redirect(`${BASE}/dashboard?yt=error`);
    errResponse.cookies.delete('yt_oauth_state');
    return errResponse;
  }
}
