import { legacyIntelBlocked } from '@/lib/competitor-intel-client';
import { trackedIntelCommand, trackedIntelInput, trackedIntelResult, trackedIntelObject, type TrackedIntelInput, type TrackedIntelResult } from '@/lib/tracked-intel-contract';
export type TrackedIntelOwner = Readonly<{ id: string; email: string; sessionRef: string; expiresAt: number }>;
declare const trackedIntelReceipt: unique symbol;
export type TrackedIntelReceipt = { readonly [trackedIntelReceipt]: true };
const receipts = new WeakMap<object, { owner: object; data: TrackedIntelResult }>();
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const result = trackedIntelResult;
const pendingUsers = new Map<string, object>(), deniedUsers = new Set<string>();
export function trackedIntelBlocked(id: string) { return deniedUsers.has(id) || pendingUsers.has(id) || legacyIntelBlocked(id); }
// Display accepts only this original HTTP response. Client session fields and
// JSON never authorize server/provider work or recover a missing response.
export function beginTrackedIntelAnalysis(owner: TrackedIntelOwner, candidate: TrackedIntelInput, current: () => boolean, onRetire: () => void) {
  const own = {}, captured = Object.freeze({ ...owner }), input = trackedIntelInput(candidate), controller = new AbortController();
  const startedAt = Date.now(), deadline = performance.now() + 55000;
  let admitted = false, retired = false, completed = false, rejectStop!: (error: Error) => void, timer: ReturnType<typeof setTimeout> | undefined;
  const stopped = new Promise<never>((_, reject) => { rejectStop = reject; }); void stopped.catch(() => {});
  const retire = () => { if (retired) return; retired = true; if (admitted && !completed) deniedUsers.add(captured.id); controller.abort(); clearTimeout(timer); rejectStop(Error('tracked_intel_unconfirmed')); onRetire(); };
  const check = () => {
    if (retired || !current() || Date.now() < startedAt || Date.now() >= captured.expiresAt
      || !completed && (performance.now() >= deadline || Date.now() >= startedAt + 55000)) { retire(); throw Error('tracked_intel_unconfirmed'); }
  };
  const wait = async <T>(action: () => Promise<T>) => {
    check(); const pending = Promise.resolve().then(() => { check(); return action(); }); void pending.catch(() => {});
    const v = await Promise.race([pending, stopped]); check(); return v;
  };
  timer = setTimeout(retire, Math.max(0, Math.min(startedAt + 55000, captured.expiresAt) - startedAt));
  const original = (async () => { try {
    if (trackedIntelBlocked(captured.id)) throw Error('previous_analysis_unconfirmed');
    pendingUsers.set(captured.id, own); admitted = true;
    const storageKey = 'ytubviral:competitor-intel:' + JSON.stringify([captured.id]); sessionStorage.setItem(storageKey, 'pending');
    const commandRef = crypto.randomUUID();
    if (!trackedIntelCommand(commandRef) || !trackedIntelCommand(captured.sessionRef) || !/^[A-Za-z0-9_-]{1,128}$/.test(captured.id)
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(captured.email) || !count(captured.expiresAt)) throw Error('tracked_intel_unconfirmed');
    const response = await wait(() => fetch('/api/youtube/competitor-intel', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': commandRef }, body: JSON.stringify(input), signal: controller.signal }));
    if (response.redirected || response.headers.get('cache-control') !== 'no-store') throw Error('tracked_intel_unconfirmed');
    if (!response.body) throw Error('tracked_intel_unconfirmed');
    const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
    let text = '', bytes = 0;
    try { for (;;) { const part = await wait(() => reader.read()); if (part.done) break;
      bytes += part.value.byteLength; if (bytes > 262144) throw Error('tracked_intel_unconfirmed'); text += decoder.decode(part.value, { stream: true });
    } text += decoder.decode(); } finally { void reader.cancel().catch(() => {}); }
    const parsed = JSON.parse(text);
    if (response.status !== 200 || !response.ok) {
      const error = trackedIntelObject(parsed), allowed = ['pro_required', 'youtube_not_connected', 'token_expired', 'selection_changed'];
      throw Error(typeof error.error === 'string' && allowed.includes(error.error) ? error.error : 'tracked_intel_unconfirmed');
    }
    const data = result(parsed), ack = data.trackedIntelAnalysis;
    if (ack.commandRef !== commandRef || ack.userId !== captured.id || ack.email !== captured.email || ack.sessionRef !== captured.sessionRef || ack.lang !== input.lang || JSON.stringify(ack.channelIds) !== JSON.stringify(input.channelIds)
      || !count(ack.asOf) || ack.asOf < startedAt || ack.asOf > Date.now() || !count(ack.expiresAt) || ack.expiresAt <= Date.now() || ack.expiresAt - ack.asOf > 55000
      || ack.requestedAfter !== new Date(ack.asOf - 7 * 86400000).toISOString()
      || ack.requestedBefore !== new Date(ack.asOf).toISOString()) throw Error('tracked_intel_unconfirmed');
    check();
    if (data.adviceStatus === 'unavailable') deniedUsers.add(captured.id);
    else { try { if (pendingUsers.get(captured.id) !== own) throw Error('tracked_intel_unconfirmed'); sessionStorage.removeItem(storageKey); pendingUsers.delete(captured.id); } catch { deniedUsers.add(captured.id); } }
    completed = true; clearTimeout(timer); timer = setTimeout(retire, Math.max(0, captured.expiresAt - Date.now()));
    const freeze = (v: unknown): void => { if (v && typeof v === 'object') { for (const child of Object.values(v)) freeze(child); Object.freeze(v); } };
    freeze(data);
    const receipt = Object.freeze({}) as TrackedIntelReceipt; receipts.set(receipt, { owner: own, data }); return receipt;
  } catch (error) { retire(); throw error; } })(); void original.catch(() => {});
  return Object.freeze({ original, retire, read(receipt: TrackedIntelReceipt | null) {
    try { check(); const value = receipt && receipts.get(receipt); return completed && value && value.owner === own ? value.data : null; } catch { return null; }
  } });
}
