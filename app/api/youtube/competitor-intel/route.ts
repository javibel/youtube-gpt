import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserPlan, isPaid } from '@/lib/plans';
import { getMessagesTask } from '@/lib/ai/task-runtime';

const YT_API_KEY = process.env.YOUTUBE_API_KEY?.trim();
const YT_BASE = 'https://www.googleapis.com/youtube/v3';
export const maxDuration = 60;

interface TrendingVideo {
  videoId: string; title: string; thumbnail: string; channelName: string; channelId: string;
  publishedAt: string; views: number; likes: number; vph: number; ageHours: number;
}
interface MissedOpportunity { topic: string; coveredBy: string[]; totalViews: number; suggestion: string }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
const unavailable = () => Error('Competitor intelligence unavailable');
function count(v: unknown): number {
  if (v === undefined) return 0;
  if (typeof v !== 'string' || !/^\d+$/.test(v)) throw unavailable();
  const n = Number(v); if (!Number.isSafeInteger(n) || n < 0) throw unavailable(); return n;
}
function opportunitiesFrom(data: unknown): MissedOpportunity[] {
  if (!object(data) || data.incomplete || !Array.isArray(data.content) || !object(data.content[0]) || typeof data.content[0].text !== 'string') throw unavailable();
  const value: unknown = JSON.parse(data.content[0].text);
  if (!Array.isArray(value) || value.length > 5 || !value.every(v => object(v)
    && Object.keys(v).length === 4 && typeof v.topic === 'string' && !!v.topic.trim()
    && typeof v.suggestion === 'string' && !!v.suggestion.trim()
    && Array.isArray(v.coveredBy) && v.coveredBy.every(n => typeof n === 'string')
    && typeof v.totalViews === 'number' && Number.isFinite(v.totalViews) && v.totalViews >= 0)) throw unavailable();
  return value as MissedOpportunity[];
}

export async function GET(request: Request) {
  // Retire this HTTP waiter only. An already dispatched task keeps its original
  // control/ownership; timeout or disconnect cannot authorize a replacement.
  const deadline = performance.now() + 55_000, observedTime = Date.now();
  let retired = false, rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(unavailable()); } };
  const timer = setTimeout(retire, 55_000);
  request.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw unavailable(); };
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    const language = new URL(request.url).searchParams.get('lang') === 'en' ? 'en' : 'es';
    const operationKey = request.headers.get('idempotency-key') ?? undefined;
    const original = Promise.resolve().then(async () => {
      check(); const session = await auth(); check();
      if (!session?.user?.id) return reply({ error: 'unauthorized' }, 401);
      const userId = session.user.id;
      const plan = await getUserPlan(userId); check();
      if (!isPaid(plan)) return reply({ error: 'pro_required' }, 403);
      if (!YT_API_KEY) return reply({ error: 'no_api_key' }, 503);

      const rows = await prisma.trackedCompetitor.findMany({ where: { userId }, orderBy: { addedAt: 'asc' },
        select: { userId: true, channelId: true, channelName: true } }); check();
      if (rows.some(c => c.userId !== userId || !identifier(c.channelId) || typeof c.channelName !== 'string')
        || new Set(rows.map(c => c.channelId)).size !== rows.length) throw unavailable();
      // Copy the original owner selection before any external transport can wait.
      const competitors = rows.map(c => ({ channelId: c.channelId, channelName: c.channelName }));
      const channelIds = competitors.map(c => c.channelId).sort();
      const analyzedChannelIds = competitors.slice(0, 10).map(c => c.channelId);
      const unavailableChannelIds: string[] = [], allVideos: TrendingVideo[] = [];
      let completedChannels = 0;
      const google = async (path: string, limit: number) => {
        check(); const res = await fetch(`${YT_BASE}/${path}&key=${encodeURIComponent(YT_API_KEY)}`, { cache: 'no-store' }); check();
        if (!res.ok || res.status !== 200) throw unavailable();
        const data: unknown = await res.json(); check();
        if (!object(data) || !Array.isArray(data.items) || data.items.length > limit) throw unavailable();
        return data.items as unknown[];
      };
      const sevenDaysAgo = new Date(observedTime - 7 * 86400000).toISOString();
      const seen = new Set<string>();
      for (const comp of competitors.slice(0, 10)) {
        try {
          const items = await google(`search?part=snippet&channelId=${encodeURIComponent(comp.channelId)}&type=video&order=date&maxResults=5&publishedAfter=${encodeURIComponent(sevenDaysAgo)}`, 5);
          const ids = new Set<string>();
          for (const item of items) {
            if (!object(item) || !object(item.id) || !identifier(item.id.videoId)) throw unavailable();
            ids.add(item.id.videoId);
          }
          const videos: TrendingVideo[] = [];
          if (ids.size) {
            const stats = await google(`videos?part=statistics,snippet&id=${encodeURIComponent([...ids].join(','))}`, 5);
            const batchSeen = new Set<string>();
            for (const v of stats) {
              if (!object(v) || !identifier(v.id) || !ids.has(v.id) || seen.has(v.id) || batchSeen.has(v.id)
                || !object(v.snippet) || !object(v.statistics)) throw unavailable();
              const snippet = v.snippet;
              if (typeof snippet.title !== 'string' || typeof snippet.publishedAt !== 'string'
                || !Number.isFinite(Date.parse(snippet.publishedAt)) || Date.parse(snippet.publishedAt) > observedTime
                || (snippet.channelId !== undefined && snippet.channelId !== comp.channelId)) throw unavailable();
              const thumbnail = object(snippet.thumbnails) && object(snippet.thumbnails.medium) ? snippet.thumbnails.medium.url : '';
              if (typeof thumbnail !== 'string') throw unavailable();
              const ageHours = Math.max(1, (observedTime - Date.parse(snippet.publishedAt)) / 3600000), views = count(v.statistics.viewCount);
              videos.push({ videoId: v.id, title: snippet.title, thumbnail, channelId: comp.channelId, channelName: comp.channelName,
                publishedAt: snippet.publishedAt, views, likes: count(v.statistics.likeCount), vph: Math.round(views / ageHours), ageHours: Math.round(ageHours) });
              batchSeen.add(v.id);
            }
          }
          check(); videos.forEach(v => seen.add(v.videoId)); allVideos.push(...videos); completedChannels++;
        } catch { check(); unavailableChannelIds.push(comp.channelId); }
      }
      if (analyzedChannelIds.length && !completedChannels) throw unavailable();
      const trending = [...allVideos].sort((a, b) => b.vph - a.vph).slice(0, 15);
      const newUploads = allVideos.filter(v => v.ageHours <= 48).sort((a, b) => a.ageHours - b.ageHours).slice(0, 10);
      let opportunities: MissedOpportunity[] = [], opportunitiesStatus: 'ready' | 'not_applicable' | 'unavailable' = 'not_applicable';
      if (trending.length >= 3) {
        opportunitiesStatus = 'unavailable';
        try {
          const yt = await prisma.youtubeToken.findUnique({ where: { userId }, select: { channelId: true } }); check();
          let userTitles: string[] = [];
          if (yt?.channelId) {
            if (!identifier(yt.channelId)) throw unavailable();
            const items = await google(`search?part=snippet&channelId=${encodeURIComponent(yt.channelId)}&type=video&order=date&maxResults=20`, 20);
            userTitles = items.map(i => { if (!object(i) || !object(i.snippet) || typeof i.snippet.title !== 'string') throw unavailable(); return i.snippet.title; });
          }
          const competitorTopics = trending.map(v => `"${v.title}" (${v.channelName}, ${v.views} views, ${v.vph} VPH)`).join('\n');
          const userTopics = yt?.channelId ? `\n\nUser's recent videos:\n${userTitles.map(t => `- ${t}`).join('\n')}` : '\n\nUser has no connected YouTube channel yet.';
          check(); const task = await getMessagesTask({ operationKey, userId, taskType: 'youtube.competitor-opportunities', language, instructionsVersion: 'competitor-opportunities-v1',
            outputSchema: { type: 'array', maxItems: 5, items: { type: 'object', additionalProperties: false, required: ['topic', 'coveredBy', 'totalViews', 'suggestion'], properties: {
              topic: { type: 'string', minLength: 1 }, coveredBy: { type: 'array', items: { type: 'string' } }, totalViews: { type: 'number', minimum: 0 }, suggestion: { type: 'string', minLength: 1 },
            } } },
          }); check();
          const data = await task.create({ max_tokens: 600, messages: [{ role: 'user', content: `Analyze competitor videos and find missed opportunities. Reply in ${language === 'en' ? 'English' : 'Spanish'}. Output ONLY valid JSON array:
[{"topic":"topic name","coveredBy":["channel1"],"totalViews":123456,"suggestion":"actionable suggestion"}]

Find 3-5 topic areas/themes that competitors cover but the user doesn't. Focus on high-performing topics (high VPH). Be specific about the topic, not generic.

Competitor trending videos:
${competitorTopics}${userTopics}` }] }); check();
          opportunities = opportunitiesFrom(data); opportunitiesStatus = 'ready';
        } catch { check(); }
      }
      check(); return reply({ userId, language, channelIds, analyzedChannelIds, unavailableChannelIds,
        collectionStatus: unavailableChannelIds.length ? 'partial' : 'complete', opportunitiesStatus, trending, newUploads, opportunities });
    });
    const result = await Promise.race([original, stopped]); check(); return result;
  } catch { return reply({ error: 'competitor_intel_unavailable' }, 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
}
