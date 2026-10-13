'use client';
import { admitSessionCookieWriter, heldSessionCookieWriterKind, markSessionCookiePost, releaseUnissuedSessionCookieWriter, sessionCookieWriterBusy, subscribeSessionCookieWriter } from '@/lib/session-cookie-writer';
export type SignoutOwner = { userId: string; email: string; authSessionRef?: string };
export type SignoutOutcome = Readonly<{ status: 'confirmed' | 'unconfirmed' | 'not-started' }>;
export type SignoutAttempt = Readonly<{ owner: Readonly<SignoutOwner> }>;
type Original = { context: object; promise: Promise<SignoutOutcome>; outcome?: SignoutOutcome; claimed: boolean; allowPost: boolean };
const originals = new WeakMap<SignoutAttempt, Original>();
let retained: SignoutAttempt | undefined;
const unknown: SignoutOutcome = Object.freeze({ status: 'unconfirmed' });
const listeners = new Set<() => void>();
function notify() { for (const listener of listeners) { try { listener(); } catch { /* A retired view cannot change the native result. */ } } }
subscribeSessionCookieWriter(notify);
export function signoutOtherCookieWriterKind() { const kind = heldSessionCookieWriterKind(); return kind === 'signout' ? undefined : kind; }
export function signoutHeldByOtherCookieWriter() { return !!signoutOtherCookieWriterKind(); }
export function subscribeSignout(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

export function currentSignoutOriginal() { return retained; }
export function trustedSignoutOutcome(attempt: SignoutAttempt) { return originals.get(attempt)?.outcome; }
export function signoutBlocked() {
  return sessionCookieWriterBusy() || !!retained && trustedSignoutOutcome(retained)?.status !== 'confirmed'
    && trustedSignoutOutcome(retained)?.status !== 'not-started';
}
export function sameSignoutOwner(attempt: SignoutAttempt, owner: SignoutOwner) {
  return originals.has(attempt) && attempt.owner.userId === owner.userId && attempt.owner.email === owner.email
    && (attempt.owner.authSessionRef ?? '') === (owner.authSessionRef ?? '');
}
export function sameSignoutContext(attempt: SignoutAttempt, context: object) { return originals.get(attempt)?.context === context; }
export function signoutNeedsObservation(attempt: SignoutAttempt) {
  const original = originals.get(attempt);
  return !!original && !original.claimed && original.outcome?.status !== 'not-started';
}

export function beginSignout(owner: SignoutOwner, origin: string, context: object, canStart: () => boolean): SignoutAttempt | undefined {
  if (signoutBlocked() || !canStart() || !owner.userId || !owner.email) return;
  const permit = admitSessionCookieWriter('signout');
  if (!permit) return;
  const captured = Object.freeze({ userId: owner.userId, email: owner.email, authSessionRef: owner.authSessionRef ?? '' });
  const attempt: SignoutAttempt = Object.freeze({ owner: captured });
  const original: Original = { context, promise: Promise.resolve(unknown), claimed: false, allowPost: true };
  originals.set(attempt, original); retained = attempt;
  original.promise = Promise.resolve().then(async () => {
    if (!canStart()) {
      const outcome: SignoutOutcome = Object.freeze({ status: 'not-started' });
      original.outcome = outcome;
      releaseUnissuedSessionCookieWriter(permit);
      notify(); return outcome;
    }
    try {
      const csrfResponse = await fetch('/api/auth/csrf', { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
      const csrf: unknown = await csrfResponse.json();
      if (csrfResponse.status !== 200 || csrfResponse.ok !== true || !csrf || typeof csrf !== 'object'
        || Array.isArray(csrf) || Object.keys(csrf).length !== 1 || !('csrfToken' in csrf)
        || typeof csrf.csrfToken !== 'string' || !/^[a-f0-9]{64}$/.test(csrf.csrfToken))
        { original.outcome = unknown; notify(); return unknown; }
      // Retirement prevents dispatch after the same CSRF/body original settles.
      // It does not cancel an issued POST or prevent late browser cookie writes.
      if (!original.allowPost || !canStart()) {
        const outcome: SignoutOutcome = Object.freeze({ status: 'not-started' });
        original.outcome = outcome;
      if (outcome.status === 'not-started') releaseUnissuedSessionCookieWriter(permit);
      notify(); return outcome;
      }
      if (!markSessionCookiePost(permit)) { original.outcome = unknown; notify(); return unknown; }
      const response = await fetch('/api/auth/signout', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1',
          'X-YTV-Signout-Expectation': encodeURIComponent(JSON.stringify(captured)) },
        body: new URLSearchParams({ csrfToken: csrf.csrfToken, callbackUrl: '/' }).toString() });
      const result: unknown = await response.json();
      // The original HTTP and its own body must both acknowledge this native POST.
      // No SDK broadcast/refresh adds another session-cookie writer before navigation.
      if (response.status !== 200 || response.ok !== true)
        { original.outcome = unknown; notify(); return unknown; }
      if (!result || typeof result !== 'object' || Array.isArray(result))
        { original.outcome = unknown; notify(); return unknown; }
      const keys = Object.keys(result);
      if (keys.length !== 1 || keys[0] !== 'url' || !('url' in result) || typeof result.url !== 'string')
        { original.outcome = unknown; notify(); return unknown; }
      const url = new URL(result.url, origin);
      if (url.origin !== origin || url.pathname !== '/' || url.search || url.hash || url.username || url.password)
        { original.outcome = unknown; notify(); return unknown; }
      const outcome: SignoutOutcome = Object.freeze({ status: 'confirmed' });
      original.outcome = outcome;
      if (outcome.status === 'not-started') releaseUnissuedSessionCookieWriter(permit);
      notify(); return outcome;
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
  const retire = () => { retired = true; if (original) original.allowPost = false; finish(unknown); };
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
