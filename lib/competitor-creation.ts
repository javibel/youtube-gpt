import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { getUserPlan, getLimits } from '@/lib/plans';

type Result = { ok: true; userId: string; competitor: {
  id: string; channelId: string; channelName: string; channelThumb: string | null;
  subscribers: number; totalViews: number; videoCount: number; addedAt: string;
  snapshots: { subscribers: number; totalViews: number; videoCount: number; recordedAt: string }[]; growth: null;
} } | { ok: false; status: number; error: string; max?: number; plan?: string };
const uncertain = (): Result => ({ ok: false, status: 503, error: 'competitor_create_unconfirmed' });
const channel = (value: unknown): boolean => typeof value === 'string' && /^UC[\w-]{18,98}$/.test(value);
function selection(input: unknown): { channelId?: string; handle?: string } | null {
  if (typeof input !== 'string' || !input.trim() || input.length > 2048) return null;
  const text = input.trim();
  if (channel(text)) return { channelId: text };
  if (/^@[\w.-]{1,100}$/.test(text)) return { handle: text.slice(1) };
  const match = text.match(/^https?:\/\/(?:www\.|m\.)?youtube\.com\/(?:channel\/(UC[\w-]+)|@([\w.-]+)|c\/([\w.-]+))\/?(?:[?#].*)?$/i);
  if (!match) return null;
  return match[1] ? channel(match[1]) ? { channelId: match[1] } : null : { handle: match[2] || match[3] };
}
function integer(value: unknown, maximum: number): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw Error('Invalid statistics');
  const result = Number(value); if (!Number.isSafeInteger(result) || result < 0 || result > maximum) throw Error('Invalid statistics'); return result;
}

// Fresh admission only: a pending row denies a successor. Only this invocation
// receives its new admission acknowledgement and retains the original write.
export async function createTrackedCompetitor(userId: string, input: unknown, apiKey: string | undefined, beforeStep: () => void): Promise<Result> {
  try {
    beforeStep(); const selected = selection(input);
    if (!selected) return { ok: false, status: 400, error: 'invalid_url' };
    const plan = await getUserPlan(userId); beforeStep();
    const max = getLimits(plan).competitors;
    if (!Number.isSafeInteger(max) || max < 0) return uncertain();
    if (!apiKey) return { ok: false, status: 500, error: 'api_key_missing' };
    const read = async (url: string) => {
      beforeStep(); const response = await fetch(url); beforeStep();
      if (!response.ok || response.status !== 200) throw Error('Channel unavailable');
      const data = await response.json(); beforeStep(); return data;
    };
    let channelId = selected.channelId;
    if (!channelId) {
      const data = await read(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(selected.handle!)}&maxResults=1&key=${apiKey}`);
      channelId = data?.items?.[0]?.snippet?.channelId;
      if (!channel(channelId)) return { ok: false, status: 404, error: 'channel_not_found' };
    }
    const data = await read(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${apiKey}`);
    const ch = data?.items?.[0];
    if (!ch) return { ok: false, status: 404, error: 'channel_not_found' };
    if (ch.id !== channelId || typeof ch.snippet?.title !== 'string' || !ch.snippet.title.trim() || ch.snippet.title.length > 1000) return uncertain();
    const captured = { channelId: channelId!, channelName: ch.snippet.title, channelThumb: ch.snippet.thumbnails?.default?.url ?? null,
      subscribers: integer(ch.statistics?.subscriberCount ?? '0', 2147483647), totalViews: BigInt(integer(ch.statistics?.viewCount ?? '0', Number.MAX_SAFE_INTEGER)), videoCount: integer(ch.statistics?.videoCount ?? '0', 2147483647) };
    if (!(captured.channelThumb === null || typeof captured.channelThumb === 'string')) return uncertain();
    const id = randomUUID(); beforeStep();
    const admission = await prisma.$transaction(async tx => {
      beforeStep(); const owner = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM users WHERE id=$1 FOR UPDATE', userId); beforeStep();
      if (owner.length !== 1 || owner[0].id !== userId) throw Error('Admission unavailable');
      const pending = await tx.competitorCreationAttempt.findFirst({ where: { userId, channelId: captured.channelId, state: { not: 'complete' } } }); beforeStep();
      if (pending) return { denied: 'uncertain' as const };
      const existing = await tx.trackedCompetitor.findUnique({ where: { userId_channelId: { userId, channelId: captured.channelId } } }); beforeStep();
      if (existing) return { denied: 'already_tracked' as const };
      const count = await tx.trackedCompetitor.count({ where: { userId } }); beforeStep();
      const reserved = await tx.competitorCreationAttempt.count({ where: { userId, state: { not: 'complete' } } }); beforeStep();
      if (![count, reserved, count + reserved].every(n => Number.isSafeInteger(n) && n >= 0)) throw Error('Capacity unavailable');
      if (count + reserved >= max) return { denied: 'limit_reached' as const };
      const row = await tx.competitorCreationAttempt.create({ data: { id, userId, channelId: captured.channelId, state: 'pending' } }); beforeStep();
      return { row };
    }, { maxWait: 10_000, timeout: 15_000 });
    if ('denied' in admission) return admission.denied === 'uncertain' ? uncertain() : { ok: false, status: admission.denied === 'already_tracked' ? 409 : 400, error: admission.denied, ...(admission.denied === 'limit_reached' ? { max, plan } : {}) };
    if (admission.row.id !== id || admission.row.userId !== userId || admission.row.channelId !== captured.channelId || admission.row.state !== 'pending') return uncertain();
    beforeStep();
    const result = await prisma.$transaction(async tx => {
      beforeStep(); const owner = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM users WHERE id=$1 FOR UPDATE', userId); beforeStep();
      if (owner.length !== 1 || owner[0].id !== userId) throw Error('Completion unavailable');
      const attempt = await tx.competitorCreationAttempt.findUnique({ where: { id } }); beforeStep();
      if (!attempt || attempt.userId !== userId || attempt.channelId !== captured.channelId || attempt.state !== 'pending') throw Error('Completion unavailable');
      // Once create is invoked, this original producer commits the competitor,
      // snapshot and completion marker atomically, even after HTTP retires.
      const row = await tx.trackedCompetitor.create({ data: { userId, ...captured } });
      const snapshot = await tx.competitorSnapshot.create({ data: { competitorId: row.id, subscribers: captured.subscribers, totalViews: captured.totalViews, videoCount: captured.videoCount } });
      const marked = await tx.competitorCreationAttempt.updateMany({ where: { id, userId, channelId: captured.channelId, state: 'pending' }, data: { state: 'complete', competitorId: row.id } });
      if (marked.count !== 1) throw Error('Completion unconfirmed');
      return { row, snapshot };
    }, { maxWait: 10_000, timeout: 15_000 });
    return { ok: true, userId, competitor: { id: result.row.id, ...captured, totalViews: Number(captured.totalViews), addedAt: result.row.addedAt.toISOString(),
      snapshots: [{ subscribers: result.snapshot.subscribers, totalViews: Number(result.snapshot.totalViews), videoCount: result.snapshot.videoCount, recordedAt: result.snapshot.recordedAt.toISOString() }], growth: null } };
  } catch { return uncertain(); }
}
