export type DowngradeOwner = Readonly<{ userId: string; email: string }>;
export type DowngradeSelection = Readonly<{ subscriptionId: string; plan: 'business'; status: string; cancelAtPeriodEnd: boolean }>;
export type DowngradeReceipt = Readonly<{ ok: true; userId: string; email: string; key: string; subscriptionId: string; plan: 'pro'; mode: 'simulated' }>;
export type DowngradeOutcome = { status: 'confirmed'; receipt: DowngradeReceipt } | { status: 'unconfirmed' };
export interface DowngradeAttempt { readonly owner: DowngradeOwner; readonly key: string; readonly selection: DowngradeSelection; readonly lang: 'es' | 'en'; readonly original: Promise<DowngradeOutcome>; readonly waiter: Promise<DowngradeOutcome>; readonly pending: boolean }
type RecordState = { pending: boolean; outcome?: DowngradeOutcome };
const attempts = new Map<string, DowngradeAttempt>(), records = new WeakMap<DowngradeAttempt, RecordState>(), denied = new Set<string>();
const identity = (owner: DowngradeOwner) => 'ytubviral:profile-downgrade:' + JSON.stringify([owner.userId, owner.email]);
const id = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const uncertain = (): DowngradeOutcome => Object.freeze({ status: 'unconfirmed' });
export const retainedDowngrade = (owner: DowngradeOwner) => attempts.get(identity(owner));
export function trustedDowngradeOutcome(a: DowngradeAttempt): DowngradeOutcome | undefined {
  return attempts.get(identity(a.owner)) === a ? records.get(a)?.outcome : undefined;
}
export function downgradeBlocked(owner: DowngradeOwner): boolean {
  const scope = identity(owner);
  if (denied.has(scope) || attempts.has(scope)) return true;
  try { return sessionStorage.getItem(scope) !== null; } catch { return true; }
}
export function validDowngradeSelection(s: Readonly<{subscriptionId:string;plan:string;status:string;cancelAtPeriodEnd:boolean}> | null | undefined): s is DowngradeSelection { return !!s && id(s.subscriptionId) && s.plan === 'business' && ['active','trialing'].includes(s.status) && typeof s.cancelAtPeriodEnd === 'boolean'; }
function receipt(value: unknown, a: DowngradeAttempt): DowngradeReceipt | null {
  if (!object(value) || Object.keys(value).length !== 7 || value.ok !== true || value.userId !== a.owner.userId || value.email !== a.owner.email || value.key !== a.key
    || value.subscriptionId !== a.selection.subscriptionId || value.plan !== 'pro' || value.mode !== 'simulated') return null;
  return Object.freeze({ ok: true, userId: a.owner.userId, email: a.owner.email, key: a.key, subscriptionId: a.selection.subscriptionId, plan: 'pro', mode: 'simulated' });
}
function bounded(original: Promise<DowngradeOutcome>, deadline: number): Promise<DowngradeOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (async () => {
    try {
      const result = await Promise.race([original, new Promise<DowngradeOutcome>(resolve => { timer = setTimeout(() => resolve(uncertain()), Math.max(0, deadline - performance.now())); })]);
      return performance.now() >= deadline ? uncertain() : result;
    } finally { clearTimeout(timer); }
  })();
}
export function observeDowngradeOriginal(a: DowngradeAttempt): Promise<DowngradeOutcome> {
  if (attempts.get(identity(a.owner)) !== a || !records.has(a)) return Promise.resolve(uncertain());
  return bounded(a.original, performance.now() + 60_000);
}
export function beginDowngrade(owner: DowngradeOwner, selection: DowngradeSelection, lang: 'es' | 'en', canConsume: () => boolean): DowngradeAttempt | null {
  if (!id(owner.userId) || typeof owner.email !== 'string' || !owner.email || owner.email.length > 320
      || !validDowngradeSelection(selection) || selection.cancelAtPeriodEnd || !['es', 'en'].includes(lang)
      || !canConsume() || downgradeBlocked(owner)) return null;
  let key: string; try { key = crypto.randomUUID(); if (!id(key)) return null; } catch { return null; }
  const own = Object.freeze({ userId: owner.userId, email: owner.email }), scope = identity(own), selected = Object.freeze({ subscriptionId: selection.subscriptionId, plan: selection.plan, status: selection.status, cancelAtPeriodEnd: selection.cancelAtPeriodEnd }), body = JSON.stringify({ subscriptionId: selected.subscriptionId, plan: selected.plan });
  // Presence only: neither a public receipt nor a stored key restores this original.
  try { sessionStorage.setItem(scope, 'pending'); } catch { denied.add(scope); return null; }
  const state: RecordState = { pending: true }, a = { owner: own, key, selection: selected, lang } as DowngradeAttempt;
  records.set(a, state); attempts.set(scope, a);
  const deadline = performance.now() + 60_000;
  const original = Promise.resolve().then(async (): Promise<DowngradeOutcome> => {
    try {
      if (performance.now() >= deadline || !canConsume()) return uncertain();
      const response = await fetch('/api/stripe/downgrade', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body });
      if (!canConsume()) return uncertain();
      const value: unknown = await response.json();
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
