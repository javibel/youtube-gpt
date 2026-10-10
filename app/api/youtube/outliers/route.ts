import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUserPlan, isPaid } from '@/lib/plans';

const YT_API_KEY = process.env.YOUTUBE_API_KEY?.trim();
const YT_BASE = 'https://www.googleapis.com/youtube/v3';
export const maxDuration = 30;

export interface OutlierVideo {
  videoId: string; title: string; thumbnail: string; publishedAt: string;
  views: number; likes: number; multiplier: number; type: 'viral' | 'evergreen';
}
export interface OutlierResult { channelId: string; medianViews: number; totalVideosAnalyzed: number; outliers: OutlierVideo[] }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const videoId = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
function count(v: unknown): number {
  if (v === undefined) return 0;
  if (typeof v !== 'string' || !/^\d+$/.test(v)) throw Error('Outliers unavailable');
  const n = Number(v); if (!Number.isSafeInteger(n) || n < 0) throw Error('Outliers unavailable'); return n;
}
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round(sorted[mid - 1] + (sorted[mid] - sorted[mid - 1]) / 2);
}

export async function GET(request: Request) {
  const deadline = performance.now() + 25_000, observedTime = Date.now();
  let retired = false, rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('Outliers unavailable')); } };
  const timer = setTimeout(retire, 25_000);
  request.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('Outliers unavailable'); };
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    // Capture selection before any asynchronous authentication/plan/transport.
    const url = new URL(request.url), channelId = url.searchParams.get('channelId'), period = url.searchParams.get('period') || 'all';
    const thresholdText = url.searchParams.get('threshold'), threshold = thresholdText === null ? 10 : Number(thresholdText);
    const original = Promise.resolve().then(async () => {
      check(); const session = await auth(); check();
      if (!session?.user?.id) return reply({ error: 'unauthorized' }, 401);
      const userId = session.user.id;
      const plan = await getUserPlan(userId); check();
      if (!isPaid(plan)) return reply({ error: 'pro_required' }, 403);
      if (!channelId || channelId.length > 128 || !/^[\w-]+$/.test(channelId) || !['all', '7d', '30d', '90d'].includes(period)
        || (thresholdText !== null && !thresholdText.trim()) || !Number.isFinite(threshold) || threshold <= 0) return reply({ error: 'invalid_selection' }, 400);
      if (!YT_API_KEY) return reply({ error: 'no_api_key' }, 503);
      const envelope = { userId, channelId, period, threshold };
      const response = (medianViews: number, totalVideosAnalyzed: number, outliers: OutlierVideo[]) => {
        check(); return reply({ ...envelope, medianViews, totalVideosAnalyzed, outliers });
      };
      const google = async (path: string) => {
        check(); const res = await fetch(`${YT_BASE}/${path}&key=${encodeURIComponent(YT_API_KEY)}`, { cache: 'no-store' }); check();
        if (!res.ok || res.status !== 200) throw Error('Outliers unavailable');
        const data: unknown = await res.json(); check();
        if (!object(data) || !Array.isArray(data.items) || data.items.length > 50) throw Error('Outliers unavailable');
        return data;
      };
      const ids = new Set<string>(); let pageToken = '';
      for (let page = 0; page < 2; page++) {
        const search = await google(`search?part=snippet&channelId=${encodeURIComponent(channelId)}&order=date&type=video&maxResults=50${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
        for (const item of search.items as unknown[]) {
          if (!object(item) || !object(item.id) || !videoId(item.id.videoId)) throw Error('Outliers unavailable');
          ids.add(item.id.videoId);
        }
        if (search.nextPageToken !== undefined && (typeof search.nextPageToken !== 'string' || search.nextPageToken.length > 2048)) throw Error('Outliers unavailable');
        pageToken = typeof search.nextPageToken === 'string' ? search.nextPageToken : '';
        if (!pageToken || ids.size >= 50) break;
      }
      if (!ids.size) return response(0, 0, []);
      const allIds = [...ids], videos: Omit<OutlierVideo, 'multiplier' | 'type'>[] = [], seen = new Set<string>();
      for (let i = 0; i < allIds.length; i += 50) {
        const batch = allIds.slice(i, i + 50), stats = await google(`videos?part=statistics,snippet&id=${encodeURIComponent(batch.join(','))}`);
        for (const v of stats.items as unknown[]) {
          if (!object(v) || !videoId(v.id) || !batch.includes(v.id) || seen.has(v.id) || !object(v.snippet) || !object(v.statistics)) throw Error('Outliers unavailable');
          const snippet = v.snippet;
          if (typeof snippet.title !== 'string' || typeof snippet.publishedAt !== 'string' || !Number.isFinite(Date.parse(snippet.publishedAt))) throw Error('Outliers unavailable');
          const thumbnail = object(snippet.thumbnails) && object(snippet.thumbnails.medium) ? snippet.thumbnails.medium.url : '';
          if (typeof thumbnail !== 'string') throw Error('Outliers unavailable');
          seen.add(v.id); videos.push({ videoId: v.id, title: snippet.title, thumbnail, publishedAt: snippet.publishedAt, views: count(v.statistics.viewCount), likes: count(v.statistics.likeCount) });
        }
      }
      const periodMs: Record<string, number> = { '7d': 7 * 86400000, '30d': 30 * 86400000, '90d': 90 * 86400000 };
      const cutoff = periodMs[period] ? observedTime - periodMs[period] : 0;
      const filtered = cutoff ? videos.filter(v => Date.parse(v.publishedAt) >= cutoff) : videos;
      if (filtered.length < 3) return response(0, filtered.length, []);
      const med = median(filtered.map(v => v.views));
      if (!med) return response(0, filtered.length, []);
      const outliers: OutlierVideo[] = filtered.filter(v => v.views >= threshold * med).map<OutlierVideo>(v => ({ ...v,
        multiplier: Math.round(v.views / med * 10) / 10, type: Date.parse(v.publishedAt) < observedTime - 180 * 86400000 ? 'evergreen' : 'viral',
      })).sort((a, b) => b.multiplier - a.multiplier);
      return response(med, filtered.length, outliers);
    });
    const result = await Promise.race([original, stopped]); check(); return result;
  } catch { return reply({ error: 'outliers_unavailable' }, 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
}
