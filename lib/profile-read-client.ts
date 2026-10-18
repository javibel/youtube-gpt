import { decodeDashboardStats } from '@/lib/use-dashboard-stats';
import type { DashboardStats } from '@/lib/use-dashboard-stats';
import type { ProfileOwner } from '@/lib/profile-update';
export type ProfileData = Omit<DashboardStats, 'user'> & { user: DashboardStats['user'] & { lang: 'es' | 'en' } };
export type ProfileReadOutcome = { status: 'ready'; data: ProfileData } | { status: 'error' };
export interface ProfileRead { readonly owner: ProfileOwner; readonly sequence: number; readonly original: Promise<ProfileReadOutcome>; readonly waiter: Promise<ProfileReadOutcome>; pending: boolean; outcome?: ProfileReadOutcome; waitOutcome?: ProfileReadOutcome }
const live = new Map<string, ProfileRead>(), settled = new WeakMap<ProfileRead, ProfileReadOutcome>();
let sequence = 0;
const failed = (): ProfileReadOutcome => Object.freeze({ status: 'error' });
export const trustedProfileRead = (r: ProfileRead): ProfileReadOutcome | undefined => settled.get(r);
// Bound the captured profile GET body before granting trusted profile data.
// UI timeout/retirement never substitutes a read or releases another command.
async function profileBody(response: Response): Promise<unknown> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined, done = false;
  try {
    if (response.status !== 200 || response.ok !== true || response.redirected
      || response.url && response.url !== new URL('/api/user/stats', window.location.origin).href
      || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
      || !response.body) throw Error('Native profile response unavailable');
    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let raw = '', bytes = 0, chunks = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) { done = true; break; }
      if (!(part.value instanceof Uint8Array) || ++chunks > 256 || (bytes += part.value.byteLength) > 65536)
        throw Error('Native profile response unavailable');
      raw += decoder.decode(part.value, { stream: true });
    }
    raw += decoder.decode();
    return JSON.parse(raw) as unknown;
  } finally {
    // Join only this body's cleanup before settling and admitting a queued read.
    // Cancellation cannot prove mutation, authentication or recovery authority.
    try { if (!done) await (reader ? reader.cancel() : response.body?.cancel()); }
    catch { /* Private cleanup failure remains a failed profile read. */ }
    finally { reader?.releaseLock(); }
  }
}
export function beginProfileRead(owner: ProfileOwner, afterCurrent = false): ProfileRead {
  const own = Object.freeze({ userId: owner.userId, email: owner.email }), key = JSON.stringify([own.userId, own.email]), existing = live.get(key);
  if (existing && !afterCurrent) return existing;
  const r = { owner: own, sequence: ++sequence, pending: true } as ProfileRead; live.set(key, r);
  const deadline = performance.now() + 30_000;
  const original = Promise.resolve().then(async (): Promise<ProfileReadOutcome> => {
    try {
      if (existing) await existing.original;
      if (!own.userId || !own.email || performance.now() >= deadline) return failed();
      const response = await fetch('/api/user/stats', { method: 'GET', redirect: 'error', cache: 'no-store' });
      const value = await profileBody(response);
      const raw = value as { user?: { lang?: unknown } };
      if (raw?.user?.lang !== 'es' && raw?.user?.lang !== 'en') return failed();
      const decoded = decodeDashboardStats(value, own.userId, own.email), data = {
        ...decoded, user: Object.freeze({ ...decoded.user, lang: raw.user.lang }),
        stats: Object.freeze(decoded.stats), subscription: decoded.subscription && Object.freeze(decoded.subscription) };
      return Object.freeze({ status: 'ready', data: Object.freeze(data) });
    } catch { return failed(); }
  }).then(outcome => { r.pending = false; r.outcome = outcome; settled.set(r, outcome); if (live.get(key) === r) live.delete(key); return outcome; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waiter = (async () => {
    try { const result = await Promise.race([original, new Promise<ProfileReadOutcome>(resolve => { timer = setTimeout(() => resolve(failed()), Math.max(0, deadline - performance.now())); })]); return r.waitOutcome = performance.now() >= deadline ? failed() : result; }
    finally { clearTimeout(timer); }
  })();
  Object.defineProperties(r, { owner: { value: own, writable: false, configurable: false }, sequence: { value: r.sequence, writable: false, configurable: false },
    original: { value: original, writable: false, configurable: false }, waiter: { value: waiter, writable: false, configurable: false } });
  return r;
}
