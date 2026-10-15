import { retentionChannelId, retentionCommand, retentionInput, retentionInsights, retentionObject, retentionVideoId,
  type RetentionInput, type RetentionResult, type RetentionVideo } from '@/lib/retention-contract';
export type RetentionOwner = Readonly<{ id: string; email: string; sessionRef: string; expiresAt: number }>;
declare const retentionReceipt: unique symbol;
export type RetentionReceipt = { readonly [retentionReceipt]: true };
const receipts = new WeakMap<object, { owner: object; data: RetentionResult }>();
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
function result(value: unknown): RetentionResult {
  const v = retentionObject(value), ack = retentionObject(v.retentionAnalysis);
  if (Object.keys(v).sort().join(',') !== 'aiTips,dropOffReasons,retentionAnalysis,tipsStatus,videos'
    || Object.keys(ack).sort().join(',') !== 'asOf,channelId,commandRef,coverage,email,expiresAt,lang,requestedEndDate,requestedStartDate,sessionRef,userId'
    || !retentionChannelId(ack.channelId) || ack.coverage !== 'not-reported'
    || !Array.isArray(v.videos) || v.videos.length < 1 || v.videos.length > 5) throw Error('retention_unconfirmed');
  const ids = new Set<string>();
  for (const item of v.videos) {
    const video = retentionObject(item);
    if (Object.keys(video).sort().join(',') !== 'avgRetention,dropOffPoints,duration,hookScore,hookWindowSeconds,retention,title,videoId,views'
      || !retentionVideoId(video.videoId) || ids.has(video.videoId) || typeof video.title !== 'string' || !video.title.trim() || video.title.length > 500
      || !count(video.views) || !count(video.duration) || video.duration === 0 || !count(video.avgRetention)
      || video.hookScore !== null && !count(video.hookScore) || !finite(video.hookWindowSeconds) || video.hookWindowSeconds > Math.min(30, video.duration)
      || (video.hookWindowSeconds === 0) !== (video.hookScore === null)
      || !Array.isArray(video.retention) || video.retention.length !== 100 || !video.retention.every(count)
      || !Array.isArray(video.dropOffPoints) || video.dropOffPoints.length > 5) throw Error('retention_unconfirmed');
    ids.add(video.videoId);
    for (const entry of video.dropOffPoints) {
      const d = retentionObject(entry);
      if (Object.keys(d).sort().join(',') !== 'drop,retentionAfter,retentionBefore,time' || !count(d.time) || d.time > video.duration
        || !count(d.drop) || !count(d.retentionBefore) || !count(d.retentionAfter) || d.drop < 10 || d.retentionBefore < d.retentionAfter) throw Error('retention_unconfirmed');
    }
  }
  if (!['available', 'unavailable'].includes(v.tipsStatus as string)) throw Error('retention_unconfirmed');
  if (v.tipsStatus === 'available') retentionInsights({ tips: v.aiTips, dropOffReasons: v.dropOffReasons }, v.videos as RetentionVideo[]);
  else if (!Array.isArray(v.aiTips) || v.aiTips.length || Object.keys(retentionObject(v.dropOffReasons)).length) throw Error('retention_unconfirmed');
  return v as unknown as RetentionResult;
}
// Display accepts only this original HTTP response. Client session fields and
// JSON never authorize server/provider work or recover a missing response.
export function beginRetentionAnalysis(owner: RetentionOwner, candidate: RetentionInput, current: () => boolean, onRetire: () => void) {
  const own = {}, captured = Object.freeze({ ...owner }), input = retentionInput(candidate), controller = new AbortController();
  const startedAt = Date.now(), deadline = performance.now() + 55000;
  let retired = false, completed = false, rejectStop!: (error: Error) => void, timer: ReturnType<typeof setTimeout> | undefined;
  const stopped = new Promise<never>((_, reject) => { rejectStop = reject; }); void stopped.catch(() => {});
  const retire = () => { if (retired) return; retired = true; controller.abort(); clearTimeout(timer); rejectStop(Error('retention_unconfirmed')); onRetire(); };
  const check = () => {
    if (retired || !current() || Date.now() < startedAt || Date.now() >= captured.expiresAt
      || !completed && (performance.now() >= deadline || Date.now() >= startedAt + 55000)) { retire(); throw Error('retention_unconfirmed'); }
  };
  const wait = async <T>(action: () => Promise<T>) => {
    check(); const pending = Promise.resolve().then(() => { check(); return action(); }); void pending.catch(() => {});
    const v = await Promise.race([pending, stopped]); check(); return v;
  };
  timer = setTimeout(retire, Math.max(0, Math.min(startedAt + 55000, captured.expiresAt) - startedAt));
  const original = (async () => { try {
    const commandRef = crypto.randomUUID();
    if (!retentionCommand(commandRef) || !retentionCommand(captured.sessionRef) || !/^[A-Za-z0-9_-]{1,128}$/.test(captured.id)
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(captured.email) || !count(captured.expiresAt)) throw Error('retention_unconfirmed');
    const response = await wait(() => fetch('/api/youtube/retention', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': commandRef }, body: JSON.stringify(input), signal: controller.signal }));
    if (response.redirected || response.headers.get('cache-control') !== 'no-store') throw Error('retention_unconfirmed');
    if (!response.body) throw Error('retention_unconfirmed');
    const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
    let text = '', bytes = 0;
    try { for (;;) { const part = await wait(() => reader.read()); if (part.done) break;
      bytes += part.value.byteLength; if (bytes > 262144) throw Error('retention_unconfirmed'); text += decoder.decode(part.value, { stream: true });
    } text += decoder.decode(); } finally { void reader.cancel().catch(() => {}); }
    const parsed = JSON.parse(text);
    if (response.status !== 200 || !response.ok) {
      const error = retentionObject(parsed), allowed = ['pro_required', 'youtube_not_connected', 'token_expired', 'no_videos', 'no_retention_data'];
      throw Error(typeof error.error === 'string' && allowed.includes(error.error) ? error.error : 'retention_unconfirmed');
    }
    const data = result(parsed), ack = data.retentionAnalysis;
    if (ack.commandRef !== commandRef || ack.userId !== captured.id || ack.email !== captured.email || ack.sessionRef !== captured.sessionRef || ack.lang !== input.lang
      || !count(ack.asOf) || ack.asOf < startedAt || ack.asOf > Date.now() || !count(ack.expiresAt) || ack.expiresAt <= Date.now() || ack.expiresAt - ack.asOf > 55000
      || ack.requestedStartDate !== new Date(ack.asOf - 90 * 86400000).toISOString().slice(0, 10)
      || ack.requestedEndDate !== new Date(ack.asOf - 2 * 86400000).toISOString().slice(0, 10)
      || input.videoId && (data.videos.length !== 1 || data.videos[0].videoId !== input.videoId)) throw Error('retention_unconfirmed');
    check(); completed = true; clearTimeout(timer); timer = setTimeout(retire, Math.max(0, captured.expiresAt - Date.now()));
    const freeze = (v: unknown): void => { if (v && typeof v === 'object') { for (const child of Object.values(v)) freeze(child); Object.freeze(v); } };
    freeze(data);
    const receipt = Object.freeze({}) as RetentionReceipt; receipts.set(receipt, { owner: own, data }); return receipt;
  } catch (error) { retire(); throw error; } })(); void original.catch(() => {});
  return Object.freeze({ original, retire, read(receipt: RetentionReceipt | null) {
    try { check(); const value = receipt && receipts.get(receipt); return completed && value && value.owner === own ? value.data : null; } catch { return null; }
  } });
}
