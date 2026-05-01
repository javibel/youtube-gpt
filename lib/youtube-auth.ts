import { prisma } from '@/lib/prisma';

/**
 * Get a valid YouTube OAuth access token for the given user.
 * Automatically refreshes expired tokens.
 */
export async function getAccessToken(userId: string): Promise<string | null> {
  const yt = await prisma.youtubeToken.findUnique({ where: { userId } });
  if (!yt?.accessToken) return null;

  if (yt.expiresAt > new Date(Date.now() + 60_000)) return yt.accessToken;

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

  const expiresAt = new Date(Date.now() + ((data.expires_in as number) || 3600) * 1000);
  await prisma.youtubeToken.update({
    where: { userId },
    data: { accessToken: data.access_token as string, expiresAt },
  });
  return data.access_token as string;
}
