import { retentionObject, retentionCommand, retentionChannelId, retentionVideoId } from '@/lib/retention-contract';
export { retentionObject as trackedIntelObject, retentionCommand as trackedIntelCommand, retentionChannelId as trackedIntelChannelId } from '@/lib/retention-contract';
export type TrackedIntelInput = Readonly<{ lang: 'es' | 'en'; channelIds: readonly string[] }>;
export type TrackedVideo = { videoId: string; channelId: string; title: string; publishedAt: string; views: number | null; likes: number | null; ageHours: number; lifetimeViewsPerHour: number | null };
export type TrackedSample = { id: string; name: string; hasMore: boolean; unavailableVideoIds: string[]; videos: TrackedVideo[] };
export type TrackedIntelResult = { channels: TrackedSample[]; ownChannel: TrackedSample; insights: { tips: string[]; limitations: string[] } | null; adviceStatus: 'ready' | 'not-applicable' | 'unavailable';
  trackedIntelAnalysis: { commandRef: string; userId: string; email: string; sessionRef: string; lang: 'es' | 'en'; channelId: string; channelIds: string[]; analyzedChannelIds: string[];
    requestedAfter: string; requestedBefore: string; coverage: 'not-reported'; source: 'limited-search-sample'; separateReads: true; channelLimit: 10; videoLimit: 5; asOf: number; expiresAt: number } };
const fail = (): never => { throw Error('tracked_intel_unconfirmed'); };
const validPublished = (v: unknown, time: number): v is string => typeof v === 'string' && Number.isFinite(time)
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v) && new Date(time).toISOString().replace('.000Z', 'Z') === v.replace('.000Z', 'Z');
export function trackedIntelInput(value: unknown): TrackedIntelInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('invalid_input'); const v = retentionObject(value);
  if (Object.keys(v).sort().join(',') !== 'channelIds,lang' || !['es', 'en'].includes(v.lang as string) || !Array.isArray(v.channelIds) || v.channelIds.length < 1 || v.channelIds.length > 100
    || !v.channelIds.every(retentionChannelId) || new Set(v.channelIds).size !== v.channelIds.length) throw Error('invalid_input');
  return Object.freeze({ lang: v.lang as 'es' | 'en', channelIds: Object.freeze([...(v.channelIds as string[])].sort()) });
}
export function trackedIntelCount(v: unknown): number | null {
  if (v === undefined) return null;
  if (typeof v !== 'string' || !/^\d{1,16}$/.test(v) || !Number.isSafeInteger(Number(v)) || Number(v) < 0) fail(); return Number(v);
}
export function trackedIntelVideo(value: unknown, channelId: string, start: number, at: number): TrackedVideo {
  const v = retentionObject(value), snippet = retentionObject(v.snippet), stats = retentionObject(v.statistics);
  const published = typeof snippet.publishedAt === 'string' ? Date.parse(snippet.publishedAt) : NaN;
  if (v.kind !== 'youtube#video' || !retentionVideoId(v.id) || snippet.channelId !== channelId || typeof snippet.title !== 'string' || !snippet.title.trim() || snippet.title.length > 500
    || !validPublished(snippet.publishedAt, published) || published < start || published > at) fail();
  const views = trackedIntelCount(stats.viewCount), likes = trackedIntelCount(stats.likeCount), ageHours = (at - published) / 3600000;
  return { videoId: v.id as string, channelId, title: snippet.title as string, publishedAt: snippet.publishedAt as string, views, likes, ageHours, lifetimeViewsPerHour: ageHours >= 1 && views !== null ? views / ageHours : null };
}
export function trackedIntelInsights(value: unknown): NonNullable<TrackedIntelResult['insights']> {
  const v = retentionObject(value); if (Object.keys(v).sort().join(',') !== 'limitations,tips') fail();
  for (const key of ['tips', 'limitations']) if (!Array.isArray(v[key]) || v[key].length < 1 || v[key].length > 4 || v[key].some((s: unknown) => typeof s !== 'string' || !s.trim() || s.length > 1000)) fail();
  return v as NonNullable<TrackedIntelResult['insights']>;
}
export function trackedIntelResult(value: unknown): TrackedIntelResult {
  const v = retentionObject(value), a = retentionObject(v.trackedIntelAnalysis);
  if (Object.keys(v).sort().join(',') !== 'adviceStatus,channels,insights,ownChannel,trackedIntelAnalysis'
    || Object.keys(a).sort().join(',') !== 'analyzedChannelIds,asOf,channelId,channelIds,channelLimit,commandRef,coverage,email,expiresAt,lang,requestedAfter,requestedBefore,separateReads,sessionRef,source,userId,videoLimit'
    || !retentionCommand(a.commandRef) || !retentionCommand(a.sessionRef) || !retentionChannelId(a.channelId) || typeof a.userId !== 'string' || typeof a.email !== 'string'
    || !Number.isSafeInteger(a.asOf) || !Number.isSafeInteger(a.expiresAt) || (a.asOf as number) < 0 || (a.expiresAt as number) <= (a.asOf as number) || (a.expiresAt as number) - (a.asOf as number) > 55000
    || a.requestedAfter !== new Date((a.asOf as number) - 7 * 86400000).toISOString() || a.requestedBefore !== new Date(a.asOf as number).toISOString()
    || a.coverage !== 'not-reported' || a.source !== 'limited-search-sample' || a.separateReads !== true || a.channelLimit !== 10 || a.videoLimit !== 5) fail();
  const input = trackedIntelInput({ lang: a.lang, channelIds: a.channelIds });
  if (JSON.stringify(input.channelIds) !== JSON.stringify(a.channelIds) || JSON.stringify(input.channelIds.slice(0, 10)) !== JSON.stringify(a.analyzedChannelIds)
    || !Array.isArray(v.channels) || v.channels.length !== input.channelIds.slice(0, 10).length) fail();
  const samples = [...v.channels as unknown[], v.ownChannel];
  for (let i = 0; i < samples.length; i++) {
    const sample = retentionObject(samples[i]), expected = i === samples.length - 1 ? a.channelId : input.channelIds[i];
    if (Object.keys(sample).sort().join(',') !== 'hasMore,id,name,unavailableVideoIds,videos' || sample.id !== expected || typeof sample.name !== 'string' || !sample.name.trim() || sample.name.length > 500
      || typeof sample.hasMore !== 'boolean' || !Array.isArray(sample.videos) || !Array.isArray(sample.unavailableVideoIds) || sample.videos.length + sample.unavailableVideoIds.length > 5
      || !sample.unavailableVideoIds.every(retentionVideoId)) fail();
    const seen = new Set(sample.unavailableVideoIds as string[]); if (seen.size !== (sample.unavailableVideoIds as string[]).length) fail();
    for (const entry of sample.videos as unknown[]) {
      const row = retentionObject(entry), published = typeof row.publishedAt === 'string' ? Date.parse(row.publishedAt) : NaN;
      if (Object.keys(row).sort().join(',') !== 'ageHours,channelId,lifetimeViewsPerHour,likes,publishedAt,title,videoId,views' || !retentionVideoId(row.videoId) || seen.has(row.videoId)
        || row.channelId !== expected || typeof row.title !== 'string' || !row.title.trim() || row.title.length > 500 || !Number.isFinite(published)
        || published < (a.asOf as number) - 7 * 86400000 || published > (a.asOf as number) || !validPublished(row.publishedAt, published)
        || row.ageHours !== ((a.asOf as number) - published) / 3600000) fail();
      for (const field of ['views', 'likes']) if (row[field] !== null && (typeof row[field] !== 'number' || !Number.isSafeInteger(row[field]) || (row[field] as number) < 0)) fail();
      if (row.lifetimeViewsPerHour !== ((row.ageHours as number) >= 1 && row.views !== null ? (row.views as number) / (row.ageHours as number) : null)) fail(); seen.add(row.videoId as string);
    }
  }
  const enough = (v.channels as TrackedSample[]).reduce((n, c) => n + c.videos.length, 0) >= 3;
  if (!['ready', 'not-applicable', 'unavailable'].includes(v.adviceStatus as string) || (enough ? v.adviceStatus === 'not-applicable' : v.adviceStatus !== 'not-applicable')
    || (v.adviceStatus === 'ready' ? v.insights === null : v.insights !== null)) fail();
  if (v.insights !== null) trackedIntelInsights(v.insights); return v as unknown as TrackedIntelResult;
}
