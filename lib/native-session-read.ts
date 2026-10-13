
'use client';
import type { Session } from 'next-auth';
import { admitSessionCookieWriter, markSessionCookieRead, releaseAcknowledgedSessionCookieRead } from '@/lib/session-cookie-writer';

export type SessionReadAttempt = Readonly<{ kind: 'session-read' }>;
export type SessionReadOutcome = Readonly<{ status: 'confirmed'; session: Session | null } | { status: 'unconfirmed' }>;
type Original = { context: object; promise: Promise<SessionReadOutcome>; outcome?: SessionReadOutcome; claimed: boolean; permit: NonNullable<ReturnType<typeof admitSessionCookieWriter>> };
const originals = new WeakMap<SessionReadAttempt, Original>();
let retained: SessionReadAttempt | undefined;
const unknown: SessionReadOutcome = Object.freeze({ status: 'unconfirmed' });

// Parse only the original native response. Expires is shape metadata, never
// freshness, consent, recovery or proof of an unrelated operation.
function nativeSession(value: unknown): Session | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const body = value as Record<string, unknown>, user = body.user;
  if (Object.keys(body).length !== 2 || !('user' in body) || !('expires' in body)
    || typeof body.expires !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(body.expires)
    || !user || typeof user !== 'object' || Array.isArray(user)) return;
  const principal = user as Record<string, unknown>;
  const allowed = ['id', 'email', 'name', 'image', 'isAdmin', 'requiresTotp', 'requiresVerification', 'authSessionRef'];
  if (Object.keys(principal).some(key => !allowed.includes(key))
    || typeof principal.id !== 'string' || !principal.id
    || typeof principal.email !== 'string' || !principal.email.trim()
    || typeof principal.isAdmin !== 'boolean' || typeof principal.requiresTotp !== 'boolean'
    || typeof principal.requiresVerification !== 'boolean'
    || ('authSessionRef' in principal && (typeof principal.authSessionRef !== 'string' || !principal.authSessionRef))
    || ['name', 'image'].some(key => key in principal && principal[key] !== null && typeof principal[key] !== 'string')) return;
  Object.freeze(principal); return Object.freeze(body) as unknown as Session;
}
export function currentSessionReadOriginal() { return retained; }
export function ownsSessionRead(attempt: SessionReadAttempt, context: object) { return originals.get(attempt)?.context === context; }
export function beginSessionRead(context: object): SessionReadAttempt | undefined {
  const prior = retained && originals.get(retained);
  if (prior && !prior.claimed) return prior.context === context ? retained : undefined;
  const permit = admitSessionCookieWriter('refresh');
  if (!permit) return;
  const attempt: SessionReadAttempt = Object.freeze({ kind: 'session-read' });
  const original: Original = { context, permit, promise: Promise.resolve(unknown), claimed: false };
  originals.set(attempt, original); retained = attempt;
  original.promise = Promise.resolve().then(async () => {
    let outcome: SessionReadOutcome = unknown;
    try {
      if (markSessionCookieRead(permit)) {
        const response = await fetch('/api/auth/session', { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
        const body: unknown = await response.json();
        if (response.status === 200 && response.ok === true) {
          const session = nativeSession(body);
          if (session !== undefined) outcome = Object.freeze({ status: 'confirmed', session });
        }
      }
    } catch { /* Retain uncertainty and the genuine read capability. */ }
    original.outcome = outcome; return outcome;
  });
  return attempt;
}
export function observeSessionRead(attempt: SessionReadAttempt, context: object, active: () => boolean) {
  const original = originals.get(attempt);
  let finished = false, timer: ReturnType<typeof setTimeout> | undefined;
  let resolve!: (result: SessionReadOutcome) => void;
  const promise = new Promise<SessionReadOutcome>(done => { resolve = done; });
  const finish = (result: SessionReadOutcome) => { if (finished) return; finished = true; if (timer !== undefined) clearTimeout(timer); resolve(result); };
  const retire = () => finish(unknown); // Does not cancel or release an issued GET.
  if (!original || original.context !== context || !active()) retire();
  else {
    timer = setTimeout(retire, 30_000);
    void original.promise.then(result => { if (!finished && active()) finish(result); else retire(); });
  }
  return { promise, retire };
}
export function claimSessionRead(attempt: SessionReadAttempt, context: object, outcome: SessionReadOutcome) {
  const original = originals.get(attempt);
  if (!original || original.context !== context || original.outcome !== outcome || original.claimed
    || outcome.status !== 'confirmed') return false;
  // This same GET/body completed and is observed by its genuine live owner.
  // No unrelated POST, principal/factor grant or lost capability is recovered.
  if (!releaseAcknowledgedSessionCookieRead(original.permit)) return false;
  original.claimed = true; return true;
}
