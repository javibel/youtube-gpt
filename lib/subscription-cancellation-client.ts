import { syncDenied, denyOtherBilling } from '@/lib/subscription-sync-denial';
export type CancellationOwner = Readonly<{ userId: string; email: string }>;
export type CancellationSelection = Readonly<{ subscriptionId: string; plan: 'pro' | 'business'; status: string; cancelAtPeriodEnd: boolean }>;
export type CancellationReceipt = Readonly<{ ok: true; userId: string; email: string; key: string; subscriptionId: string; cancelAtPeriodEnd: true; mode: 'simulated' }>;
export type CancellationOutcome = { status: 'confirmed'; receipt: CancellationReceipt } | { status: 'unconfirmed' };
export interface CancellationAttempt { readonly owner: CancellationOwner; readonly key: string; readonly selection: CancellationSelection; readonly lang: 'es' | 'en'; readonly original: Promise<CancellationOutcome>; readonly waiter: Promise<CancellationOutcome>; readonly pending: boolean }
type RecordState = { pending: boolean; outcome?: CancellationOutcome };
const attempts = new Map<string, CancellationAttempt>(), records = new WeakMap<CancellationAttempt, RecordState>(), denied = new Set<string>();
const identity = (owner: CancellationOwner) => 'ytubviral:profile-cancellation:' + JSON.stringify([owner.userId, owner.email]);
const id = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const uncertain = (): CancellationOutcome => Object.freeze({ status: 'unconfirmed' });
export const retainedCancellation = (owner: CancellationOwner) => attempts.get(identity(owner));
export function trustedCancellationOutcome(a: CancellationAttempt): CancellationOutcome | undefined {
  return attempts.get(identity(a.owner)) === a ? records.get(a)?.outcome : undefined;
}
export function cancellationBlocked(owner: CancellationOwner): boolean {
  const scope = identity(owner);
  if (denied.has(scope) || attempts.has(scope)) return true;
  try { return sessionStorage.getItem(scope) !== null; } catch { return true; }
}
export function validCancellationSelection(s: CancellationSelection | null | undefined): s is CancellationSelection { return !!s && id(s.subscriptionId) && ['pro','business'].includes(s.plan) && ['active','trialing'].includes(s.status) && typeof s.cancelAtPeriodEnd === 'boolean'; }
function receipt(value: unknown, a: CancellationAttempt): CancellationReceipt | null {
  if (!object(value) || value.ok !== true || value.userId !== a.owner.userId || value.email !== a.owner.email || value.key !== a.key
    || value.subscriptionId !== a.selection.subscriptionId || value.cancelAtPeriodEnd !== true || value.mode !== 'simulated') return null;
  return Object.freeze({ ok: true, userId: a.owner.userId, email: a.owner.email, key: a.key, subscriptionId: a.selection.subscriptionId, cancelAtPeriodEnd: true, mode: 'simulated' });
}
// Consume only this captured simulated cancellation response. A UI timeout
// cannot cancel/reissue the POST, remove denial or establish operative success.
async function cancellationBody(response: Response, canConsume: () => boolean): Promise<unknown> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined, done = false;
  try {
    if (!canConsume() || response.status !== 200 || response.ok !== true || response.redirected
      || response.url && response.url !== new URL('/api/stripe/cancel', window.location.origin).href
      || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
      || !response.body) throw Error('Native simulated cancellation response unavailable');
    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let raw = '', bytes = 0, chunks = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) { done = true; break; }
      if (!(part.value instanceof Uint8Array) || ++chunks > 256 || (bytes += part.value.byteLength) > 4096)
        throw Error('Native simulated cancellation response unavailable');
      raw += decoder.decode(part.value, { stream: true });
    }
    raw += decoder.decode();
    return JSON.parse(raw) as unknown;
  } finally {
    // Join this body's own cleanup. It cannot undo the POST, acknowledge the
    // cancellation, remove the marker or recover another original's authority.
    try { if (!done) await (reader ? reader.cancel() : response.body?.cancel()); }
    catch { /* Private cleanup failure remains unconfirmed. */ }
    finally { reader?.releaseLock(); }
  }
}
function bounded(original: Promise<CancellationOutcome>, deadline: number): Promise<CancellationOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (async () => {
    try {
      const result = await Promise.race([original, new Promise<CancellationOutcome>(resolve => { timer = setTimeout(() => resolve(uncertain()), Math.max(0, deadline - performance.now())); })]);
      return performance.now() >= deadline ? uncertain() : result;
    } finally { clearTimeout(timer); }
  })();
}
export function observeCancellationOriginal(a: CancellationAttempt): Promise<CancellationOutcome> {
  if (attempts.get(identity(a.owner)) !== a || !records.has(a)) return Promise.resolve(uncertain());
  return bounded(a.original, performance.now() + 60_000);
}
export function beginCancellation(owner: CancellationOwner, selection: CancellationSelection, lang: 'es' | 'en', canConsume: () => boolean): CancellationAttempt | null {
  if (!id(owner.userId) || typeof owner.email !== 'string' || !owner.email || owner.email.length > 320
      || !validCancellationSelection(selection) || selection.cancelAtPeriodEnd || !['es', 'en'].includes(lang)
      || !canConsume() || cancellationBlocked(owner) || syncDenied(owner)) return null;
  let key: string; try { key = crypto.randomUUID(); if (!id(key)) return null; } catch { return null; }
  const own = Object.freeze({ userId: owner.userId, email: owner.email }), scope = identity(own), selected = Object.freeze({ subscriptionId: selection.subscriptionId, plan: selection.plan, status: selection.status, cancelAtPeriodEnd: selection.cancelAtPeriodEnd }), body = JSON.stringify({ subscriptionId: selected.subscriptionId, plan: selected.plan });
  // Presence only: neither a public receipt nor a stored key restores this original.
  try { sessionStorage.setItem(scope, 'pending'); } catch { denied.add(scope); return null; }
  denyOtherBilling(own);
  const state: RecordState = { pending: true }, a = { owner: own, key, selection: selected, lang } as CancellationAttempt;
  records.set(a, state); attempts.set(scope, a);
  const deadline = performance.now() + 60_000;
  const original = Promise.resolve().then(async (): Promise<CancellationOutcome> => {
    try {
      if (performance.now() >= deadline || !canConsume()) return uncertain();
      const response = await fetch('/api/stripe/cancel', { method: 'POST', cache: 'no-store', redirect: 'error', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body });
      const value: unknown = await cancellationBody(response, canConsume);
      if (!canConsume()) return uncertain();
      const accepted = response.ok && response.status === 200 ? receipt(value, a) : null;
      return accepted ? Object.freeze({ status: 'confirmed', receipt: accepted }) : uncertain();
    } catch { return uncertain(); }
  }).then(result => { state.pending = false; state.outcome = result; return result; });
  Object.defineProperties(a, { original: { value: original }, waiter: { value: bounded(original, deadline) }, pending: { get: () => state.pending } });
  // Complete and uncertain originals both retain denial. Rows, markers and
  // independent reads cannot release admission or restore this private producer.
  return Object.freeze(a);
}
