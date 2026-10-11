import { syncDenied, denyOtherBilling } from '@/lib/subscription-sync-denial';
export type CheckoutOwner = Readonly<{ userId: string; email: string }>;
export type CheckoutPlan = 'monthly' | 'yearly' | 'business_monthly' | 'business_yearly';
export type CheckoutReceipt = Readonly<{ userId: string; email: string; key: string; plan: CheckoutPlan; lang: 'es' | 'en'; mode: 'simulated'; url: string }>;
export type CheckoutOutcome = { status: 'confirmed'; receipt: CheckoutReceipt } | { status: 'unconfirmed' };
export interface CheckoutAttempt { readonly owner: CheckoutOwner; readonly key: string; readonly plan: CheckoutPlan; readonly lang: 'es' | 'en'; readonly original: Promise<CheckoutOutcome>; readonly waiter: Promise<CheckoutOutcome>; readonly pending: boolean }
type RecordState = { pending: boolean; outcome?: CheckoutOutcome };
const attempts = new Map<string, CheckoutAttempt>(), records = new WeakMap<CheckoutAttempt, RecordState>(), denied = new Set<string>();
const identity = (owner: CheckoutOwner) => 'ytubviral:profile-checkout:' + JSON.stringify([owner.userId, owner.email]);
const id = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const uncertain = (): CheckoutOutcome => Object.freeze({ status: 'unconfirmed' });
export const retainedCheckout = (owner: CheckoutOwner) => attempts.get(identity(owner));
export function trustedCheckoutOutcome(a: CheckoutAttempt): CheckoutOutcome | undefined {
  return attempts.get(identity(a.owner)) === a ? records.get(a)?.outcome : undefined;
}
export function checkoutBlocked(owner: CheckoutOwner): boolean {
  const scope = identity(owner);
  if (denied.has(scope) || attempts.has(scope)) return true;
  try { return sessionStorage.getItem(scope) !== null; } catch { return true; }
}
function receipt(value: unknown, a: CheckoutAttempt): CheckoutReceipt | null {
  if (!object(value) || value.userId !== a.owner.userId || value.email !== a.owner.email || value.key !== a.key
      || value.plan !== a.plan || value.lang !== a.lang || value.mode !== 'simulated' || typeof value.url !== 'string'
      || value.url.length > 2048 || /[\s\x00-\x1f\x7f]/.test(value.url)) return null;
  try {
    const url = new URL(value.url);
    // Keep the existing migration facade's synthetic destination restriction.
    if (url.protocol !== 'https:' || url.hostname !== 'example.invalid' || url.port || url.username || url.password
        || url.pathname !== '/checkout' || url.hash || url.href !== value.url) return null;
  } catch { return null; }
  return Object.freeze({ userId: a.owner.userId, email: a.owner.email, key: a.key, plan: a.plan, lang: a.lang, mode: 'simulated', url: value.url });
}
function bounded(original: Promise<CheckoutOutcome>, deadline: number): Promise<CheckoutOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (async () => {
    try {
      const result = await Promise.race([original, new Promise<CheckoutOutcome>(resolve => { timer = setTimeout(() => resolve(uncertain()), Math.max(0, deadline - performance.now())); })]);
      return performance.now() >= deadline ? uncertain() : result;
    } finally { clearTimeout(timer); }
  })();
}
export function observeCheckoutOriginal(a: CheckoutAttempt): Promise<CheckoutOutcome> {
  if (attempts.get(identity(a.owner)) !== a || !records.has(a)) return Promise.resolve(uncertain());
  return bounded(a.original, performance.now() + 60_000);
}
export function beginCheckout(owner: CheckoutOwner, plan: CheckoutPlan, lang: 'es' | 'en', canConsume: () => boolean): CheckoutAttempt | null {
  if (!id(owner.userId) || typeof owner.email !== 'string' || !owner.email || owner.email.length > 320
      || !['monthly', 'yearly', 'business_monthly', 'business_yearly'].includes(plan) || !['es', 'en'].includes(lang)
      || !canConsume() || checkoutBlocked(owner) || syncDenied(owner)) return null;
  let key: string; try { key = crypto.randomUUID(); if (!id(key)) return null; } catch { return null; }
  const own = Object.freeze({ userId: owner.userId, email: owner.email }), scope = identity(own), body = JSON.stringify({ plan, lang });
  // Presence only: neither a public receipt nor a stored key restores this original.
  try { sessionStorage.setItem(scope, 'pending'); } catch { denied.add(scope); return null; }
  denyOtherBilling(own);
  const state: RecordState = { pending: true }, a = { owner: own, key, plan, lang } as CheckoutAttempt;
  records.set(a, state); attempts.set(scope, a);
  const deadline = performance.now() + 60_000;
  const original = Promise.resolve().then(async (): Promise<CheckoutOutcome> => {
    try {
      if (performance.now() >= deadline || !canConsume()) return uncertain();
      const response = await fetch('/api/stripe/checkout', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body });
      if (!canConsume()) return uncertain();
      const value: unknown = await response.json();
      if (!canConsume()) return uncertain();
      const accepted = response.ok && response.status === 200 ? receipt(value, a) : null;
      return accepted ? Object.freeze({ status: 'confirmed', receipt: accepted }) : uncertain();
    } catch { return uncertain(); }
  }).then(result => { state.pending = false; state.outcome = result; return result; });
  Object.defineProperties(a, { original: { value: original }, waiter: { value: bounded(original, deadline) }, pending: { get: () => state.pending } });
  // A confirmed session also keeps denial: a second click may observe/navigate the
  // same original, never create a new session or infer payment/subscription success.
  return Object.freeze(a);
}
