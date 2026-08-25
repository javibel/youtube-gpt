import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { PAID_STATUSES } from '@/lib/plans';
import { parseClaudeJson } from '@/lib/parse-claude-json';

export const maxDuration = 60;

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY!.trim();
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

interface TrendingVideo {
  title: string;
  channelTitle: string;
  viewCount: string;
  categoryId: string;
}

// Uploads playlist (UU + channelId sin el prefijo UC) vía playlistItems.list — 1 unidad
// de cuota (vs. 100 de search.list) y no necesita OAuth, es dato público del canal.
// Sin esto Claude solo conocía el NOMBRE del canal para juzgar relevancia, y elegía
// lo más viral globalmente (K-pop, trailers, Minecraft) sin relación real con su
// contenido — la causa de "se cuelan vídeos que no pertenecen" (Issues 25/08).
async function getRecentVideoTitles(channelId: string): Promise<string[]> {
  try {
    if (!channelId.startsWith('UC')) return [];
    const uploadsPlaylistId = `UU${channelId.slice(2)}`;
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=10&key=${YOUTUBE_API_KEY}`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || [])
      .map((it: { snippet?: { title?: string } }) => it.snippet?.title)
      .filter((t: string | undefined): t is string => !!t);
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Get all Pro users with connected YouTube channels
  const users = await prisma.user.findMany({
    where: {
      subscription: { status: { in: [...PAID_STATUSES] } },
      youtubeToken: { isNot: null },
    },
    select: {
      id: true,
      youtubeToken: { select: { channelName: true, channelId: true } },
    },
  });

  if (!users.length) {
    return NextResponse.json({ processed: 0 });
  }

  // Fetch trending videos for main regions
  const regions = ['US', 'ES', 'MX', 'GB'];
  const allTrending: TrendingVideo[] = [];

  for (const region of regions) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=${region}&maxResults=25&key=${YOUTUBE_API_KEY}`,
      );
      if (res.ok) {
        const data = await res.json();
        for (const item of (data.items || [])) {
          allTrending.push({
            title: item.snippet?.title || '',
            channelTitle: item.snippet?.channelTitle || '',
            viewCount: item.statistics?.viewCount || '0',
            categoryId: item.snippet?.categoryId || '',
          });
        }
      }
    } catch { /* continue */ }
  }

  // Dedupe by title similarity (simple: exact match)
  const seen = new Set<string>();
  const uniqueTrending = allTrending.filter(v => {
    const key = v.title.toLowerCase().slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  let processed = 0;

  for (const user of users) {
    // Skip if user already got alerts today
    const today = new Date().toISOString().slice(0, 10);
    const existingToday = await prisma.trendAlert.count({
      where: {
        userId: user.id,
        createdAt: { gte: new Date(today) },
      },
    });
    if (existingToday > 0) continue;

    const channelName = user.youtubeToken?.channelName || 'Unknown';
    const recentTitles = user.youtubeToken?.channelId
      ? await getRecentVideoTitles(user.youtubeToken.channelId)
      : [];

    // Use Claude Haiku to identify relevant trends
    try {
      const trendingList = uniqueTrending.slice(0, 40).map((v, i) =>
        `${i + 1}. "${v.title}" by ${v.channelTitle} (${parseInt(v.viewCount).toLocaleString()} views)`
      ).join('\n');

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'prompt-caching-2024-07-31',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          system: [{ type: 'text', text: `You analyze YouTube trends for a creator. Judge relevance ONLY against their actual recent content below — never against the channel name alone or generic "could leverage this for reach" reasoning. If nothing in the trending list is genuinely close to their real topics, output an empty JSON array [] instead of forcing unrelated picks (K-pop, movie trailers, Minecraft, etc. are NOT relevant just because they're popular). Identify at most 2-3 trends that a person who makes THIS creator's content would actually want to know about. For each trend, output a JSON array of objects with: title (short catchy alert title), description (1-2 sentences explaining the trend and why it's relevant to their specific content), category (one word like tech/gaming/education/entertainment/music/lifestyle/news), relevance (0-100 how relevant to this creator), videos (array of {title, views, channelName} for the 1-2 most relevant trending videos). Output ONLY valid JSON array, no markdown.`, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: `Channel: "${channelName}"\nTheir recent videos:\n${recentTitles.length ? recentTitles.map(t => `- ${t}`).join('\n') : '(no recent videos found — be conservative, prefer an empty array over guessing)'}\n\nTrending videos:\n${trendingList}` }],
        }),
      });

      if (!res.ok) { console.error('[cron/trends] anthropic not ok', res.status, await res.text()); continue; }

      const data = await res.json();
      const text = data.content?.[0]?.text || '';

      let alerts: { title: string; description: string; category: string; relevance: number; videos: { title: string; views: string; channelName: string }[] }[];
      try {
        alerts = parseClaudeJson(text);
        if (!Array.isArray(alerts)) { console.error('[cron/trends] not array', text.slice(0,200)); continue; }
      } catch (e) {
        console.error('[cron/trends] parse failed', (e as Error).message, text.slice(0, 200));
        continue;
      }

      // Save alerts
      for (const alert of alerts.slice(0, 3)) {
        await prisma.trendAlert.create({
          data: {
            userId: user.id,
            title: String(alert.title).slice(0, 200),
            description: String(alert.description).slice(0, 500),
            category: String(alert.category || 'general').slice(0, 50),
            relevance: Math.min(100, Math.max(0, Number(alert.relevance) || 50)),
            trendData: { videos: (alert.videos || []).slice(0, 3) } as unknown as Prisma.InputJsonValue,
          },
        });
      }

      processed++;
    } catch (e) { console.error('[cron/trends] outer catch', (e as Error).message); }
  }

  // Cleanup: delete alerts older than 14 days
  await prisma.trendAlert.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 14 * 86400000) } },
  });

  return NextResponse.json({ processed, totalUsers: users.length });
}
