'use client';
import { signOut } from 'next-auth/react';

export type SignoutOwner = { userId: string; email: string };
export type SignoutOutcome = Readonly<{ status: 'confirmed' | 'unconfirmed' | 'not-started' }>;
export type SignoutAttempt = Readonly<{ owner: Readonly<SignoutOwner> }>;
type Original = { context: object; promise: Promise<SignoutOutcome>; outcome?: SignoutOutcome; claimed: boolean };
const originals = new WeakMap<SignoutAttempt, Original>();
let retained: SignoutAttempt | undefined;
const unknown: SignoutOutcome = Object.freeze({ status: 'unconfirmed' });
const listeners = new Set<() => void>();
function notify() { for (const listener of listeners) { try { listener(); } catch { /* A retired view cannot change the native result. */ } } }
export function subscribeSignout(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

export function currentSignoutOriginal() { return retained; }
export function trustedSignoutOutcome(attempt: SignoutAttempt) { return originals.get(attempt)?.outcome; }
export function signoutBlocked() {
  return !!retained && trustedSignoutOutcome(retained)?.status !== 'confirmed'
    && trustedSignoutOutcome(retained)?.status !== 'not-started';
}
export function sameSignoutOwner(attempt: SignoutAttempt, owner: SignoutOwner) {
  return originals.has(attempt) && attempt.owner.userId === owner.userId && attempt.owner.email === owner.email;
}
export function sameSignoutContext(attempt: SignoutAttempt, context: object) { return originals.get(attempt)?.context === context; }
export function signoutNeedsObservation(attempt: SignoutAttempt) {
  const original = originals.get(attempt);
  return !!original && !original.claimed && original.outcome?.status !== 'not-started';
}

export function beginSignout(owner: SignoutOwner, origin: string, context: object, canStart: () => boolean): SignoutAttempt | undefined {
  if (signoutBlocked() || !canStart() || !owner.userId || !owner.email) return;
  const captured = Object.freeze({ userId: owner.userId, email: owner.email });
  const attempt: SignoutAttempt = Object.freeze({ owner: captured });
  const invoke = signOut;
  const original: Original = { context, promise: Promise.resolve(unknown), claimed: false };
  originals.set(attempt, original); retained = attempt;
  original.promise = Promise.resolve().then(async () => {
    if (!canStart()) {
      const outcome: SignoutOutcome = Object.freeze({ status: 'not-started' });
      original.outcome = outcome; notify(); return outcome;
    }
    try {
      // Observe this exact SDK call. Do not let the SDK navigate after a retired UI wait.
      // This does not cancel or bind its internal CSRF/POST stages to an account,
      // and does not prove revocation on other devices or after loss of this realm.
      const result: unknown = await invoke({ redirect: false, callbackUrl: '/' });
      // The installed SDK returns parsed JSON without exposing the HTTP status.
      // Its expected result is only { url }; an error/negative or unknown shape
      // must remain uncertain even when it also carries an allowed home URL.
      if (!result || typeof result !== 'object' || Array.isArray(result))
        { original.outcome = unknown; notify(); return unknown; }
      const keys = Object.keys(result);
      if (keys.length !== 1 || keys[0] !== 'url' || !('url' in result) || typeof result.url !== 'string')
        { original.outcome = unknown; notify(); return unknown; }
      const url = new URL(result.url, origin);
      if (url.origin !== origin || url.pathname !== '/' || url.search || url.hash || url.username || url.password)
        { original.outcome = unknown; notify(); return unknown; }
      const outcome: SignoutOutcome = Object.freeze({ status: 'confirmed' });
      original.outcome = outcome; notify(); return outcome;
    } catch { original.outcome = unknown; notify(); return unknown; }
  });
  notify();
  return attempt;
}

export function observeSignoutOriginal(attempt: SignoutAttempt, active: () => boolean) {
  const original = originals.get(attempt);
  let retired = false, finished = false, timer: ReturnType<typeof setTimeout> | undefined;
  let resolve!: (value: SignoutOutcome) => void;
  const promise = new Promise<SignoutOutcome>(done => { resolve = done; });
  const finish = (value: SignoutOutcome) => {
    if (finished) return;
    finished = true; if (timer !== undefined) clearTimeout(timer); resolve(value);
  };
  const retire = () => { retired = true; finish(unknown); };
  if (!original || !active()) retire();
  else {
    timer = setTimeout(retire, 30_000);
    void original.promise.then(value => {
      if (!retired && active()) finish(value); else retire();
    });
  }
  return { promise, retire };
}

export function claimSignoutNavigation(attempt: SignoutAttempt, outcome: SignoutOutcome) {
  const original = originals.get(attempt);
  if (!original || original.outcome !== outcome || outcome.status !== 'confirmed' || original.claimed) return false;
  original.claimed = true; return true;
}
