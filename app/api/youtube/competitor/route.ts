import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getExtensionUser } from '@/lib/extension-auth';
import { getUserPlan, isPaid } from '@/lib/plans';

const YT_API_KEY = process.env.YOUTUBE_API_KEY?.trim();
const YT_BASE = 'https://www.googleapis.com/youtube/v3';
export const maxDuration = 30;

const STOP_WORDS = new Set([
  'the','a','an','in','on','at','to','for','of','and','or','is','are','was','were',
  'with','this','that','my','your','how','what','why','when','i','you','he','she','we',
  'do','did','be','it','its','has','have','had','not','but','they','them','their',
  'el','la','los','las','un','una','de','del','en','con','por','para','que','y','o',
  'es','son','era','mi','tu','su','como','qué','por','más','muy','me','te','se','nos',
  'al','le','lo','si','ya','hay','sin','sobre','entre','desde','hasta','esto','ese',
]);

function extractKeywords(titles: string[]): string[] {
  const bigramFreq: Record<string, number> = {};

  for (const title of titles) {
    const words = title
      .toLowerCase()
      .replace(/[^a-záéíóúüña-z0-9\s]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);

    // Build bigrams from consecutive non-stopword tokens
    for (let i = 0; i < words.length - 1; i++) {
      const w1 = words[i];
      const w2 = words[i + 1];
      if (STOP_WORDS.has(w1) || STOP_WORDS.has(w2)) continue;
      if (w1.length < 3 || w2.length < 3) continue;
      const bigram = `${w1} ${w2}`;
      bigramFreq[bigram] = (bigramFreq[bigram] || 0) + 1;
    }
  }

  // Take bigrams that appear at least twice, or top ones if not enough
  const sorted = Object.entries(bigramFreq).sort((a, b) => b[1] - a[1]);
  const frequent = sorted.filter(([, c]) => c >= 2).slice(0, 12).map(([k]) => k);
  if (frequent.length >= 6) return frequent;

  // Fallback: fill with top bigrams even if count = 1
  return sorted.slice(0, 12).map(([k]) => k);
}

function calcUploadFrequency(dates: string[], lang: 'es' | 'en'): string {
  if (dates.length < 2) return lang === 'es' ? 'Datos insuficientes' : 'Insufficient data';
  const sorted = dates.map(d => new Date(d).getTime()).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push((sorted[i] - sorted[i - 1]) / (1000 * 60 * 60 * 24));
  }
  const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  if (avg <= 1.5)  return lang === 'es' ? 'Diario'         : 'Daily';
  if (avg <= 4)    return lang === 'es' ? 'Varios/semana'  : 'Several/week';
  if (avg <= 9)    return lang === 'es' ? 'Semanal'        : 'Weekly';
  if (avg <= 18)   return lang === 'es' ? 'Bisemanal'      : 'Biweekly';
  if (avg <= 35)   return lang === 'es' ? 'Mensual'        : 'Monthly';
  return lang === 'es' ? 'Irregular'        : 'Irregular';
}


const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const channelIdValid = (v: unknown): boolean => typeof v === 'string' && /^UC[\w-]{22}$/.test(v);
const videoIdValid = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
function count(v: unknown): number {
  if (v === undefined) return 0;
  if (typeof v !== 'string' || !/^\d+$/.test(v)) throw Error('Analysis unavailable');
  const n = Number(v); if (!Number.isSafeInteger(n) || n < 0) throw Error('Analysis unavailable'); return n;
}
function text(v: unknown, max: number, fallback?: string): string {
  if (v === undefined && fallback !== undefined) return fallback;
  if (typeof v !== 'string' || v.length > max) throw Error('Analysis unavailable'); return v;
}
function thumbnail(snippet: Record<string, unknown>): string {
  if (snippet.thumbnails === undefined) return '';
  if (!object(snippet.thumbnails)) throw Error('Analysis unavailable');
  if (snippet.thumbnails.medium === undefined) return '';
  if (!object(snippet.thumbnails.medium)) throw Error('Analysis unavailable');
  const url = text(snippet.thumbnails.medium.url, 2048);
  if (!url) return '';
  const parsed = new URL(url); if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw Error('Analysis unavailable'); return url;
}
function published(v: unknown, observedTime: number): string {
  const value = text(v, 64), n = Date.parse(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(n) || n > observedTime) throw Error('Analysis unavailable');
  const [year, month, day] = value.slice(0, 10).split('-').map(Number), date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw Error('Analysis unavailable');
  return value;
}
type Selection = { kind: 'id' | 'handle' | 'name'; value: string };
function selection(input: string): Selection | null {
  if (channelIdValid(input)) return { kind: 'id', value: input };
  let pathname = input;
  if (!input.startsWith('@')) {
    try {
      const url = new URL(input);
      if (url.protocol !== 'https:' || !['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname) || url.username || url.password || url.port) return null;
      pathname = decodeURIComponent(url.pathname).replace(/\/$/, '');
    } catch { return null; }
  }
  const id = pathname.match(/^\/channel\/(UC[\w-]{22})$/);
  if (id) return { kind: 'id', value: id[1] };
  const handle = pathname.match(/^\/?@([^/?#\s]{1,100})$/);
  if (handle) return { kind: 'handle', value: handle[1] };
  const name = pathname.match(/^\/(?:c|user)\/([^/?#\s]{1,100})$/);
  return name ? { kind: 'name', value: name[1] } : null;
}

export async function POST(request: Request) {
  const deadline = performance.now() + 25_000, observedTime = Date.now();
  let retired = false, rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('Analysis unavailable')); } };
  const timer = setTimeout(retire, 25_000);
  request.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('Analysis unavailable'); };
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    // Extension auth reads only URL and headers. Capture those without consuming
    // or transferring the original body, before awaiting session authentication.
    const extensionRequest = new Request(request.url, { method: 'POST', headers: request.headers });
    const original = Promise.resolve().then(async () => {
      check(); const session = await auth(); check();
      let userId: string;
      if (session?.user) {
        const id = session.user.id, email = session.user.email;
        if (typeof id !== 'string' || !id || id.length > 512) return reply({ error: 'Unauthorized' }, 401);
        userId = id;
        if (email !== undefined && email !== null) {
          if (typeof email !== 'string' || !email || email.length > 320) return reply({ error: 'Unauthorized' }, 401);
          const user = await prisma.user.findUnique({ where: { email }, select: { id: true } }); check();
          if (!user || user.id !== userId) return reply({ error: 'pro_required' }, 403);
        }
        const plan = await getUserPlan(userId); check();
        if (!isPaid(plan)) return reply({ error: 'pro_required' }, 403);
      } else {
        const extension = await getExtensionUser(extensionRequest); check();
        if (!extension || typeof extension.user?.id !== 'string' || !extension.user.id || extension.user.id.length > 512) return reply({ error: 'Unauthorized' }, 401);
        userId = extension.user.id;
        if (extension.isPro !== true) return reply({ error: 'pro_required' }, 403);
      }
      if (!YT_API_KEY) return reply({ error: 'no_api_key' }, 503);
      const body: unknown = await request.json(); check();
      if (!object(body) || typeof body.url !== 'string' || !body.url.trim() || body.url.length > 2048) return reply({ error: 'Missing URL' }, 400);
      const input = body.url.trim(), language = body.lang === undefined ? 'es' : body.lang, selected = selection(input);
      if (!selected || !['es', 'en'].includes(language as string)) return reply({ error: 'invalid_selection' }, 400);
      const google = async (route: string, max: number) => {
        check(); const res = await fetch(`${YT_BASE}/${route}&key=${encodeURIComponent(YT_API_KEY)}`, { cache: 'no-store' }); check();
        if (!res.ok || res.status !== 200) throw Error('Analysis unavailable');
        const data: unknown = await res.json(); check();
        if (!object(data) || !Array.isArray(data.items) || data.items.length > max || data.items.some(v => !object(v))) throw Error('Analysis unavailable');
        return data.items as Record<string, unknown>[];
      };
      let channelId = selected.value;
      if (selected.kind !== 'id') {
        const items = selected.kind === 'handle'
          ? await google('channels?part=id&forHandle=' + encodeURIComponent(selected.value), 1)
          : await google('search?part=snippet&type=channel&q=' + encodeURIComponent(selected.value) + '&maxResults=1', 1);
        if (!items.length) return reply({ error: 'channel_not_found' }, 404);
        const value = selected.kind === 'handle' ? items[0].id : object(items[0].snippet) ? items[0].snippet.channelId : undefined;
        if (typeof value !== 'string' || !channelIdValid(value)) throw Error('Analysis unavailable'); channelId = value;
      }
      const channels = await google('channels?part=snippet,statistics,contentDetails&id=' + encodeURIComponent(channelId), 1);
      if (!channels.length) return reply({ error: 'channel_not_found' }, 404);
      const ch = channels[0];
      if (ch.id !== channelId || !object(ch.snippet) || !object(ch.statistics) || !object(ch.contentDetails)
        || !object(ch.contentDetails.relatedPlaylists)) throw Error('Analysis unavailable');
      const snippet = ch.snippet, country = snippet.country === undefined ? null : snippet.country;
      if (country !== null && (typeof country !== 'string' || !/^[A-Z]{2}$/.test(country))) throw Error('Analysis unavailable');
      const channel = { id: channelId, name: text(snippet.title, 1000), description: text(snippet.description, 100000, '').slice(0, 200),
        thumbnail: thumbnail(snippet), country, subscribers: count(ch.statistics.subscriberCount), totalViews: count(ch.statistics.viewCount), videoCount: count(ch.statistics.videoCount) };
      const playlistId = ch.contentDetails.relatedPlaylists.uploads;
      if (typeof playlistId !== 'string' || !/^[\w-]{1,128}$/.test(playlistId)) throw Error('Analysis unavailable');
      const playlist = await google('playlistItems?part=snippet&playlistId=' + encodeURIComponent(playlistId) + '&maxResults=50', 50);
      const entries: { id: string; title: string; publishedAt: string }[] = [], seen = new Set<string>();
      for (const item of playlist) {
        if (!object(item.snippet) || !object(item.snippet.resourceId) || !videoIdValid(item.snippet.resourceId.videoId)) throw Error('Analysis unavailable');
        const s = item.snippet, id = item.snippet.resourceId.videoId;
        if (s.channelId !== undefined && s.channelId !== channelId) throw Error('Analysis unavailable');
        const title = text(s.title, 1000), date = published(s.publishedAt, observedTime);
        if (!seen.has(id)) { seen.add(id); entries.push({ id, title, publishedAt: date }); }
      }
      const videos: { videoId: string; title: string; thumbnail: string; publishedAt: string; views: number; likes: number }[] = [], available = new Set<string>();
      if (entries.length) {
        const items = await google('videos?part=statistics,snippet&id=' + encodeURIComponent(entries.map(v => v.id).join(',')), 50);
        for (const v of items) {
          if (!videoIdValid(v.id) || !seen.has(v.id) || available.has(v.id) || !object(v.snippet) || !object(v.statistics)) throw Error('Analysis unavailable');
          if (v.snippet.channelId !== undefined && v.snippet.channelId !== channelId) throw Error('Analysis unavailable');
          available.add(v.id);
          videos.push({ videoId: v.id, title: text(v.snippet.title, 1000), thumbnail: thumbnail(v.snippet), publishedAt: published(v.snippet.publishedAt, observedTime), views: count(v.statistics.viewCount), likes: count(v.statistics.likeCount) });
        }
      }
      const topVideos = videos.sort((a, b) => b.views - a.views).slice(0, 10), unavailableVideoIds = entries.filter(v => !available.has(v.id)).map(v => v.id);
      const recent = entries.slice(0, 20), keywords = extractKeywords([...recent.map(v => v.title), ...topVideos.map(v => v.title)]);
      const uploadFrequency = calcUploadFrequency(recent.map(v => v.publishedAt), language as 'es' | 'en');
      const totalViews = topVideos.reduce((n, v) => n + BigInt(v.views), BigInt(0));
      const avgViews = topVideos.length ? Number((totalViews + BigInt(Math.floor(topVideos.length / 2))) / BigInt(topVideos.length)) : 0;
      if (!Number.isSafeInteger(avgViews) || avgViews < 0) throw Error('Analysis unavailable');
      check(); return reply({ userId, language, input, channel, topVideos, keywords, uploadFrequency, avgViews,
        collectionStatus: unavailableVideoIds.length ? 'partial' : 'complete', unavailableVideoIds, totalVideosRequested: entries.length, totalVideosAvailable: videos.length });
    });
    const response = await Promise.race([original, stopped]); check(); return response;
  } catch { return reply({ error: 'competitor_analysis_unavailable' }, 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
}
