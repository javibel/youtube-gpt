import { prisma } from '@/lib/prisma';

/**
 * Get a valid YouTube OAuth access token for the given user.
 * Automatically refreshes expired tokens with retry on transient failure.
 */
export async function getAccessToken(userId: string): Promise<string | null> {
  const yt = await prisma.youtubeToken.findUnique({ where: { userId } });
  if (!yt) return null;

  // No refresh token and no access token → truly disconnected
  if (!yt.refreshToken && !yt.accessToken) return null;

  // Token still valid (with 5-minute buffer)
  if (yt.accessToken && yt.expiresAt > new Date(Date.now() + 5 * 60_000)) return yt.accessToken;

  // No refresh token → can't refresh, return stale token if any
  if (!yt.refreshToken) return yt.accessToken || null;

  // Attempt refresh with retry (even if accessToken is empty)
  const result = await attemptRefresh(userId, yt.refreshToken);
  if (result) return result;

  // First attempt failed — wait briefly and retry once
  await new Promise(r => setTimeout(r, 1000));
  const retry = await attemptRefresh(userId, yt.refreshToken);
  if (retry) return retry;

  // Both attempts failed — return stale token if non-empty, otherwise null
  // Log so we can diagnose
  console.error(`[youtube-auth] Both refresh attempts failed for user ${userId}`);
  return yt.accessToken || null;
}

async function attemptRefresh(userId: string, refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GOOGLE_CLIENT_ID?.trim(),
        client_secret: process.env.GOOGLE_CLIENT_SECRET?.trim(),
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const data = await res.json();

    // Permanent failure — user actually revoked access
    if (data.error === 'invalid_grant' && data.error_description?.includes('revoked')) {
      console.error(`[youtube-auth] Revoked for user ${userId}: ${data.error_description}`);
      await prisma.youtubeToken.update({
        where: { userId },
        data: { accessToken: '', refreshToken: '', expiresAt: new Date(0) },
      });
      return null;
    }

    // Invalid client credentials — permanent, but don't clear tokens
    if (data.error === 'invalid_client') {
      console.error(`[youtube-auth] Invalid client credentials for user ${userId}`);
      return null;
    }

    // Any other error → transient, return null to trigger retry
    if (!data.access_token) {
      console.warn(`[youtube-auth] Refresh attempt failed for user ${userId}: ${data.error || 'no access_token'} (${data.error_description || ''})`);
      return null;
    }

    // Success — update access token, expiry, and refresh token if rotated
    const expiresAt = new Date(Date.now() + ((data.expires_in as number) || 3600) * 1000);
    const updateData: { accessToken: string; expiresAt: Date; refreshToken?: string } = {
      accessToken: data.access_token as string,
      expiresAt,
    };

    if (data.refresh_token) {
      updateData.refreshToken = data.refresh_token as string;
    }

    await prisma.youtubeToken.update({
      where: { userId },
      data: updateData,
    });

    return data.access_token as string;
  } catch (err) {
    console.warn(`[youtube-auth] Network error refreshing token for user ${userId}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
