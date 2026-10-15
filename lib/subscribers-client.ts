import { subscribersCommand, subscribersInput, subscribersResult, subscribersObject, type SubscribersInput, type SubscribersResult } from '@/lib/subscribers-contract';
export type SubscribersOwner = Readonly<{ id: string; email: string; sessionRef: string; expiresAt: number }>;
declare const subscribersReceipt: unique symbol;
export type SubscribersReceipt = { readonly [subscribersReceipt]: true };
const receipts = new WeakMap<object, { owner: object; data: SubscribersResult }>();
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const result = subscribersResult;
// Display accepts only this original HTTP response. Client session fields and
// JSON never authorize server/provider work or recover a missing response.
export function beginSubscribersAnalysis(owner: SubscribersOwner, candidate: SubscribersInput, current: () => boolean, onRetire: () => void) {
  const own = {}, captured = Object.freeze({ ...owner }), input = subscribersInput(candidate), controller = new AbortController();
  const startedAt = Date.now(), deadline = performance.now() + 55000;
  let retired = false, completed = false, rejectStop!: (error: Error) => void, timer: ReturnType<typeof setTimeout> | undefined;
  const stopped = new Promise<never>((_, reject) => { rejectStop = reject; }); void stopped.catch(() => {});
  const retire = () => { if (retired) return; retired = true; controller.abort(); clearTimeout(timer); rejectStop(Error('subscribers_unconfirmed')); onRetire(); };
  const check = () => {
    if (retired || !current() || Date.now() < startedAt || Date.now() >= captured.expiresAt
      || !completed && (performance.now() >= deadline || Date.now() >= startedAt + 55000)) { retire(); throw Error('subscribers_unconfirmed'); }
  };
  const wait = async <T>(action: () => Promise<T>) => {
    check(); const pending = Promise.resolve().then(() => { check(); return action(); }); void pending.catch(() => {});
    const v = await Promise.race([pending, stopped]); check(); return v;
  };
  timer = setTimeout(retire, Math.max(0, Math.min(startedAt + 55000, captured.expiresAt) - startedAt));
  const original = (async () => { try {
    const commandRef = crypto.randomUUID();
    if (!subscribersCommand(commandRef) || !subscribersCommand(captured.sessionRef) || !/^[A-Za-z0-9_-]{1,128}$/.test(captured.id)
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(captured.email) || !count(captured.expiresAt)) throw Error('subscribers_unconfirmed');
    const response = await wait(() => fetch('/api/youtube/subscribers', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': commandRef }, body: JSON.stringify(input), signal: controller.signal }));
    if (response.redirected || response.headers.get('cache-control') !== 'no-store') throw Error('subscribers_unconfirmed');
    if (!response.body) throw Error('subscribers_unconfirmed');
    const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
    let text = '', bytes = 0;
    try { for (;;) { const part = await wait(() => reader.read()); if (part.done) break;
      bytes += part.value.byteLength; if (bytes > 262144) throw Error('subscribers_unconfirmed'); text += decoder.decode(part.value, { stream: true });
    } text += decoder.decode(); } finally { void reader.cancel().catch(() => {}); }
    const parsed = JSON.parse(text);
    if (response.status !== 200 || !response.ok) {
      const error = subscribersObject(parsed), allowed = ['pro_required', 'youtube_not_connected', 'token_expired'];
      throw Error(typeof error.error === 'string' && allowed.includes(error.error) ? error.error : 'subscribers_unconfirmed');
    }
    const data = result(parsed), ack = data.subscribersAnalysis;
    if (ack.commandRef !== commandRef || ack.userId !== captured.id || ack.email !== captured.email || ack.sessionRef !== captured.sessionRef || ack.lang !== input.lang
      || !count(ack.asOf) || ack.asOf < startedAt || ack.asOf > Date.now() || !count(ack.expiresAt) || ack.expiresAt <= Date.now() || ack.expiresAt - ack.asOf > 55000
      || ack.requestedStartDate !== new Date(ack.asOf - 91 * 86400000).toISOString().slice(0, 10)
      || ack.requestedEndDate !== new Date(ack.asOf - 2 * 86400000).toISOString().slice(0, 10)) throw Error('subscribers_unconfirmed');
    check(); completed = true; clearTimeout(timer); timer = setTimeout(retire, Math.max(0, captured.expiresAt - Date.now()));
    const freeze = (v: unknown): void => { if (v && typeof v === 'object') { for (const child of Object.values(v)) freeze(child); Object.freeze(v); } };
    freeze(data);
    const receipt = Object.freeze({}) as SubscribersReceipt; receipts.set(receipt, { owner: own, data }); return receipt;
  } catch (error) { retire(); throw error; } })(); void original.catch(() => {});
  return Object.freeze({ original, retire, read(receipt: SubscribersReceipt | null) {
    try { check(); const value = receipt && receipts.get(receipt); return completed && value && value.owner === own ? value.data : null; } catch { return null; }
  } });
}
