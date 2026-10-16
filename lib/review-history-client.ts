import { videoReviewCommand, videoReviewInput, reviewHistoryResult, videoReviewObject, type VideoReviewInput, type ReviewHistory } from '@/lib/video-review-contract';
export type HistoryOwner = Readonly<{ id: string; email: string; sessionRef: string; expiresAt: number }>;
declare const videoReviewReceipt: unique symbol;
export type HistoryReceipt = { readonly [videoReviewReceipt]: true };
const receipts = new WeakMap<object, { owner: object; data: ReviewHistory }>();
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const result = reviewHistoryResult;
export function reviewHistoryBlocked(_id: string) { return false; }
// Display accepts only this original HTTP response. Client session fields and
// JSON never authorize server/provider work or recover a missing response.
export function beginReviewHistory(owner: HistoryOwner, candidate: VideoReviewInput, current: () => boolean, onRetire: () => void) {
  const own = {}, captured = Object.freeze({ ...owner }), input = videoReviewInput(candidate), controller = new AbortController();
  const startedAt = Date.now(), deadline = performance.now() + 25000;
  let admitted = false, retired = false, completed = false, rejectStop!: (error: Error) => void, timer: ReturnType<typeof setTimeout> | undefined;
  const stopped = new Promise<never>((_, reject) => { rejectStop = reject; }); void stopped.catch(() => {});
  const retire = () => { if (retired) return; retired = true; controller.abort(); clearTimeout(timer); rejectStop(Error('videoReview_unconfirmed')); onRetire(); };
  const check = () => {
    if (retired || !current() || Date.now() < startedAt || Date.now() >= captured.expiresAt
      || !completed && (performance.now() >= deadline || Date.now() >= startedAt + 25000)) { retire(); throw Error('videoReview_unconfirmed'); }
  };
  const wait = async <T>(action: () => Promise<T>) => {
    check(); const pending = Promise.resolve().then(() => { check(); return action(); }); void pending.catch(() => {});
    const v = await Promise.race([pending, stopped]); check(); return v;
  };
  timer = setTimeout(retire, Math.max(0, Math.min(startedAt + 25000, captured.expiresAt) - startedAt));
  const original = (async () => { try {
    const commandRef = crypto.randomUUID();
    if (!videoReviewCommand(commandRef) || !videoReviewCommand(captured.sessionRef) || !/^[A-Za-z0-9_-]{1,128}$/.test(captured.id)
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(captured.email) || !count(captured.expiresAt)) throw Error('videoReview_unconfirmed');
    const response = await wait(() => fetch('/api/youtube/seo-score?lang=' + input.lang, { method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: { 'Idempotency-Key': commandRef }, signal: controller.signal }));
    if (response.redirected || response.headers.get('cache-control') !== 'no-store') throw Error('videoReview_unconfirmed');
    if (!response.body) throw Error('videoReview_unconfirmed');
    const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
    let text = '', bytes = 0;
    try { for (;;) { const part = await wait(() => reader.read()); if (part.done) break;
      bytes += part.value.byteLength; if (bytes > 1048576) throw Error('videoReview_unconfirmed'); text += decoder.decode(part.value, { stream: true });
    } text += decoder.decode(); } finally { void reader.cancel().catch(() => {}); }
    const parsed = JSON.parse(text);
    if (response.status !== 200 || !response.ok) {
      const error = videoReviewObject(parsed), allowed = ['pro_required', 'youtube_not_connected', 'token_expired'];
      throw Error(typeof error.error === 'string' && allowed.includes(error.error) ? error.error : 'videoReview_unconfirmed');
    }
    const data = result(parsed), ack = data.historyAnalysis;
    if (ack.commandRef !== commandRef || ack.userId !== captured.id || ack.email !== captured.email || ack.sessionRef !== captured.sessionRef || ack.lang !== input.lang
      || !count(ack.asOf) || ack.asOf < startedAt || ack.asOf > Date.now() || !count(ack.expiresAt) || ack.expiresAt <= Date.now() || ack.expiresAt - ack.asOf > 25000
      ) throw Error('videoReview_unconfirmed');
    check();
    completed = true; clearTimeout(timer); timer = setTimeout(retire, Math.max(0, captured.expiresAt - Date.now()));
    const freeze = (v: unknown): void => { if (v && typeof v === 'object') { for (const child of Object.values(v)) freeze(child); Object.freeze(v); } };
    freeze(data);
    const receipt = Object.freeze({}) as HistoryReceipt; receipts.set(receipt, { owner: own, data }); return receipt;
  } catch (error) { retire(); throw error; } })(); void original.catch(() => {});
  return Object.freeze({ original, retire, read(receipt: HistoryReceipt | null) {
    try { check(); const value = receipt && receipts.get(receipt); return completed && value && value.owner === own ? value.data : null; } catch { return null; }
  } });
}
