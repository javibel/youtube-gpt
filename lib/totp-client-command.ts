'use client';
import { admitSessionCookieWriter, heldSessionCookieWriterKind, markSessionCookiePost, releaseUnissuedSessionCookieWriter, sessionCookieWriterBusy, subscribeSessionCookieWriter } from '@/lib/session-cookie-writer';
import type { TotpAccountExpectation } from '@/lib/totp-account';

export type TotpOwner = Readonly<{ id: string; email: string; authSessionRef: string }>;
export type TotpOutcome = Readonly<{ status: 'confirmed' | 'invalid' | 'rate-limited' | 'not-issued' | 'unconfirmed' }>;
export type TotpAttempt = Readonly<{ owner: TotpOwner }>;
type Original = {
  context: object;
  promise: Promise<TotpOutcome>;
  outcome?: TotpOutcome;
  allowUpdate: boolean;
  claimed: boolean;
};
const originals = new WeakMap<TotpAttempt, Original>();
let retained: TotpAttempt | undefined;
const unknown: TotpOutcome = Object.freeze({ status: 'unconfirmed' });
const listeners = new Set<() => void>();
function notify() { for (const listener of listeners) { try { listener(); } catch { /* Retired views do not control the original. */ } } }
subscribeSessionCookieWriter(notify);
export function totpOtherCookieWriterKind() { const kind = heldSessionCookieWriterKind(); return kind === 'totp' ? undefined : kind; }
export function totpHeldByOtherCookieWriter() { return !!totpOtherCookieWriterKind(); }
export function subscribeTotp(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function currentTotpOriginal() { return retained; }
export function ownsTotpOriginal(attempt: TotpAttempt, context: object) { return originals.get(attempt)?.context === context; }
export function totpBlocked() {
  const original = retained && originals.get(retained);
  return sessionCookieWriterBusy() || !!original && (!original.outcome || original.outcome.status === 'unconfirmed'
    || (original.outcome.status === 'confirmed' && !original.claimed));
}
export function retireTotpProgress(attempt: TotpAttempt) {
  const original = originals.get(attempt);
  if (original) original.allowUpdate = false;
}

// Bind only a body from the retained native precheck/CSRF/session chain. Body
// cleanup and observer retirement are never authority to release an issued POST.
async function totpBody(response: Response, stage: 'precheck' | 'csrf' | 'session'): Promise<unknown> {
  const endpoint = stage === 'precheck' ? '/api/auth/verify-totp' : stage === 'csrf' ? '/api/auth/csrf' : '/api/auth/session';
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined, done = false;
  try {
    if (!(stage === 'precheck' ? [200, 400, 429] : [200]).includes(response.status)
      || response.ok !== (response.status === 200) || response.redirected
      || response.url && response.url !== new URL(endpoint, window.location.origin).href
      || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
      || !response.body) throw Error('Native factor unavailable');
    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let raw = '', bytes = 0, chunks = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) { done = true; break; }
      if (!(part.value instanceof Uint8Array) || ++chunks > 256
        || (bytes += part.value.byteLength) > (stage === 'session' ? 65_536 : 4096)) throw Error('Native factor unavailable');
      raw += decoder.decode(part.value, { stream: true });
    }
    raw += decoder.decode();
    return JSON.parse(raw) as unknown;
  } finally {
    // Join only this body's native cleanup. Pending/rejected cancellation cannot
    // prove cookie state, recover a lost owner or undo a dispatched mutation.
    try { if (!done) await (reader ? reader.cancel() : response.body?.cancel()); }
    catch { /* Private body failure remains unconfirmed. */ }
    finally { reader?.releaseLock(); }
  }
}
export function beginTotp(owner: TotpOwner, context: object, code: string,
  active: () => boolean): TotpAttempt | undefined {
  if (totpBlocked() || !active() || !owner.id || !owner.email || typeof owner.authSessionRef !== 'string' || !owner.authSessionRef || !/^\d{6}$/.test(code)) return;
  const permit = admitSessionCookieWriter('totp');
  if (!permit) return;
  const attempt: TotpAttempt = Object.freeze({ owner: Object.freeze({ id: owner.id, email: owner.email, authSessionRef: owner.authSessionRef }) });
  const original: Original = { context, promise: Promise.resolve(unknown), allowUpdate: true, claimed: false };
  originals.set(attempt, original); retained = attempt;
  const expectation: TotpAccountExpectation = Object.freeze({ expectedUserId: attempt.owner.id, expectedEmail: attempt.owner.email, expectedAuthSessionRef: attempt.owner.authSessionRef });
  const settle = (status: TotpOutcome['status']) => {
    const outcome: TotpOutcome = Object.freeze({ status });
    original.outcome = outcome;
    if (status === 'not-issued' || status === 'invalid' || status === 'rate-limited') releaseUnissuedSessionCookieWriter(permit);
    notify(); return outcome;
  };
  original.promise = Promise.resolve().then(async () => {
    try {
      if (!original.allowUpdate || !active()) return settle('not-issued');
      // Retain this exact precheck/CSRF/session HTTP and body chain. Ending a UI
      // wait cannot cancel server work, prove cookie state or authorize replacement.
      const response = await fetch('/api/auth/verify-totp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, ...expectation }),
      });
      const body = await totpBody(response, 'precheck');
      if (!body || typeof body !== 'object' || Array.isArray(body)) return settle('unconfirmed');
      if (response.status === 400 && Object.keys(body).length === 1 && 'error' in body && body.error === 'invalid_code') return settle('invalid');
      if (response.status === 429 && Object.keys(body).length === 1 && 'error' in body && body.error === 'rate_limited') return settle('rate-limited');
      if (!response.ok || response.status !== 200 || Object.keys(body).length !== 1
        || !('verified' in body) || body.verified !== true) return settle('unconfirmed');
      // A delayed precheck must never start the native mutation after retirement.
      if (!original.allowUpdate || !active()) return settle('not-issued');
      const csrfResponse = await fetch('/api/auth/csrf', { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
      const csrf = await totpBody(csrfResponse, 'csrf');
      if (csrfResponse.status !== 200 || csrfResponse.ok !== true || !csrf || typeof csrf !== 'object'
        || Array.isArray(csrf) || Object.keys(csrf).length !== 1 || !('csrfToken' in csrf)
        || typeof csrf.csrfToken !== 'string' || !/^[a-f0-9]{64}$/.test(csrf.csrfToken)) return settle('unconfirmed');
      if (!original.allowUpdate || !active()) return settle('not-issued');
      if (!markSessionCookiePost(permit)) return settle('unconfirmed');
      const native = await fetch('/api/auth/session', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json',
          'X-YTV-Totp-Expectation': encodeURIComponent(JSON.stringify(expectation)) },
        body: JSON.stringify({ csrfToken: csrf.csrfToken, data: { totpCode: code, ...expectation } }) });
      const result = await totpBody(native, 'session');
      if (native.status !== 200 || native.ok !== true) return settle('unconfirmed');
      if (!result || typeof result !== 'object' || Array.isArray(result)
        || Object.keys(result).some(key => key !== 'user' && key !== 'expires')
        || ('expires' in result && typeof result.expires !== 'string')) return settle('unconfirmed');
      const principal = (result as { user?: { id?: unknown; email?: unknown; requiresTotp?: unknown; isAdmin?: unknown; authSessionRef?: unknown } } | null)?.user;
      if (!principal || typeof principal !== 'object' || Array.isArray(principal)
        || principal.id !== attempt.owner.id || principal.email !== attempt.owner.email
        || principal.authSessionRef !== attempt.owner.authSessionRef
        || principal.requiresTotp !== false || principal.isAdmin !== true) return settle('unconfirmed');
      // No SDK projection/broadcast/session refresh adds another cookie writer.
      // This acknowledges the original response, not cross-device continuity or
      // cancellation/serialization of late cookies after this realm is retired.
      return settle('confirmed');
    } catch { return settle('unconfirmed'); }
  });
  notify();
  return attempt;
}

export function observeTotpOriginal(attempt: TotpAttempt, active: () => boolean) {
  const original = originals.get(attempt);
  let finished = false, timer: ReturnType<typeof setTimeout> | undefined;
  let resolve!: (value: TotpOutcome) => void;
  const promise = new Promise<TotpOutcome>(done => { resolve = done; });
  const finish = (value: TotpOutcome) => {
    if (finished) return;
    finished = true; if (timer !== undefined) clearTimeout(timer); resolve(value);
  };
  const retire = () => { retireTotpProgress(attempt); finish(unknown); };
  if (!original || !active()) retire();
  else {
    timer = setTimeout(retire, 30_000);
    void original.promise.then(value => { if (!finished && active()) finish(value); else retire(); });
  }
  return { promise, retire };
}

export function claimTotpConfirmation(attempt: TotpAttempt, context: object, outcome: TotpOutcome) {
  const original = originals.get(attempt);
  if (!original || original.context !== context || original.outcome !== outcome
    || outcome.status !== 'confirmed' || original.claimed) return false;
  original.claimed = true; notify(); return true;
}
