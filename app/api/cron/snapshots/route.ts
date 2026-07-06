import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';
import { PAID_STATUSES } from '@/lib/plans';

export const maxDuration = 60;

function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Find all Pro users with a connected YouTube channel
  const users = await prisma.youtubeToken.findMany({
    where: {
      channelId: { not: null },
      user: { subscription: { status: { in: [...PAID_STATUSES] } } },
    },
    select: { userId: true },
  });

  let snapped = 0;
  let errors = 0;

  for (const { userId } of users) {
    try {
      const token = await getAccessToken(userId);
      if (!token) continue;

      const res = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=statistics&mine=true',
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) continue;

      const data = await res.json();
      const stats = data.items?.[0]?.statistics;
      if (!stats) continue;

      const subscribers = parseInt(stats.subscriberCount || '0', 10);
      const totalViews = BigInt(stats.viewCount || '0');
      const videoCount = parseInt(stats.videoCount || '0', 10);

      // Only snapshot if at least 6h since last snapshot for this user
      const lastSnapshot = await prisma.channelSnapshot.findFirst({
        where: { userId },
        orderBy: { recordedAt: 'desc' },
      });

      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
      if (lastSnapshot && lastSnapshot.recordedAt > sixHoursAgo) continue;

      await prisma.channelSnapshot.create({
        data: { userId, subscribers, totalViews, videoCount },
      });

      // Also update YoutubeToken with latest values
      await prisma.youtubeToken.update({
        where: { userId },
        data: {
          subscribers: stats.subscriberCount,
          totalViews: stats.viewCount,
          videoCount: stats.videoCount,
        },
      });

      snapped++;
    } catch {
      errors++;
    }
  }

  // ── Competitor snapshots ──────────────────────────────────────────────────
  const YT_API_KEY = process.env.YOUTUBE_API_KEY?.trim();
  let compSnapped = 0;

  if (YT_API_KEY) {
    const competitors = await prisma.trackedCompetitor.findMany({
      select: { id: true, channelId: true },
    });

    // Batch channel IDs (max 50 per API call)
    for (let i = 0; i < competitors.length; i += 50) {
      const batch = competitors.slice(i, i + 50);
      const ids = batch.map(c => c.channelId).join(',');

      try {
        const res = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${ids}&key=${YT_API_KEY}`,
        );
        if (!res.ok) continue;
        const data = await res.json();

        for (const item of data.items || []) {
          const comp = batch.find(c => c.channelId === item.id);
          if (!comp) continue;

          const subs = parseInt(item.statistics.subscriberCount || '0', 10);
          const views = BigInt(item.statistics.viewCount || '0');
          const vids = parseInt(item.statistics.videoCount || '0', 10);

          await prisma.competitorSnapshot.create({
            data: {
              competitorId: comp.id,
              subscribers: subs,
              totalViews: views,
              videoCount: vids,
            },
          });

          await prisma.trackedCompetitor.update({
            where: { id: comp.id },
            data: { subscribers: subs, totalViews: views, videoCount: vids },
          });

          compSnapped++;
        }
      } catch {
        // Skip batch on error
      }
    }
  }

  // ── Limpieza de datos no-estadísticos de la API de YouTube ────────────────
  // YouTube API Developer Policies III.E.4.c/d: los datos que no son estadísticas
  // (títulos, thumbnails) deben refrescarse o borrarse a los 30 días.
  // Aprobado por el CEO el 2026-06-12 (auditoría D3).
  let cleanedCache = 0;
  let cleanedScores = 0;
  try {
    const expiredCache = await prisma.youtubeCache.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    cleanedCache = expiredCache.count;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const staleScores = await prisma.videoSeoScore.deleteMany({
      where: { analyzedAt: { lt: thirtyDaysAgo } },
    });
    cleanedScores = staleScores.count;
  } catch {
    // La limpieza no debe tumbar el cron de snapshots
  }

  return NextResponse.json({ ok: true, users: users.length, snapped, errors, compSnapped, cleanedCache, cleanedScores });
}
