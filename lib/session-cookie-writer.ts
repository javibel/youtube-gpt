
'use client';

export type SessionCookieWriter = Readonly<{ kind: 'totp' | 'signout' }>;
const permits = new WeakMap<SessionCookieWriter, { postIssued: boolean }>();
let held: SessionCookieWriter | undefined;
const listeners = new Set<() => void>();
function notify() { for (const listener of listeners) { try { listener(); } catch { /* A view cannot release the live original. */ } } }
export function subscribeSessionCookieWriter(listener: () => void) {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
export function sessionCookieWriterBusy() { return held !== undefined; }
export function heldSessionCookieWriterKind() { return held?.kind; } // Negative UI hint, never a capability.

export function admitSessionCookieWriter(kind: SessionCookieWriter['kind']): SessionCookieWriter | undefined {
  if (held || (kind !== 'totp' && kind !== 'signout')) return;
  const permit: SessionCookieWriter = Object.freeze({ kind });
  permits.set(permit, { postIssued: false }); held = permit; notify(); return permit;
}

// Called synchronously immediately before the one native POST. Once dispatched,
// no outcome, timer, retirement, JSON or independent probe releases this realm's
// exclusion. The own hard navigation leaves this instance; other writers/realms
// and late cookies across a new instance still require separate coordination.
export function markSessionCookiePost(permit: SessionCookieWriter) {
  const original = permits.get(permit);
  if (held !== permit || !original || original.postIssued) return false;
  original.postIssued = true; return true;
}

// Only the genuine live unissued permit is usable. Callers keep it private and
// invoke this only when that same original has definitively ended before POST;
// pending CSRF/body/timeouts and uncertain responses never use this path.
export function releaseUnissuedSessionCookieWriter(permit: SessionCookieWriter) {
  const original = permits.get(permit);
  if (held !== permit || !original || original.postIssued) return false;
  held = undefined; permits.delete(permit); notify(); return true;
}
