'use client';
import { admitSessionCookieWriter, releaseUnissuedSessionCookieWriter, sessionCookieWriterBusy } from '@/lib/session-cookie-writer';
import { validatePassword } from '@/lib/password';
export type RecoveryInput = { mode: 'forgot'; email: string; lang: 'es' | 'en' }
  | { mode: 'reset'; token: string; password: string; lang: 'es' | 'en' };
export type RecoveryAttempt = Readonly<{ kind: 'password-recovery-original' }>;
type Status = 'accepted' | 'updated' | 'invalid' | 'expired' | 'rate-limited' | 'not-issued' | 'unconfirmed';
export type RecoveryOutcome = Readonly<{ status: Status; notification?: 'not_started' | 'unconfirmed' | 'acknowledged' }>;
type Own = { context: object; mode: 'forgot' | 'reset'; promise: Promise<RecoveryOutcome>; dispatchAllowed: boolean; claimAllowed: boolean; claimed: boolean; status?: Status; outcome?: RecoveryOutcome; observed?: RecoveryOutcome };
const originals = new WeakMap<RecoveryAttempt, Own>();
let retained: RecoveryAttempt | undefined;
const unknown: RecoveryOutcome = Object.freeze({ status: 'unconfirmed' });
const terminal = (status?: Status) => !!status && ['accepted', 'invalid', 'expired', 'rate-limited', 'not-issued'].includes(status);
export function recoveryBlocked() { const own = retained && originals.get(retained); return sessionCookieWriterBusy() || !!own && !terminal(own.status); }
export function retireRecoveryProgress(attempt: RecoveryAttempt) { const own = originals.get(attempt); if (own) { own.dispatchAllowed = false; own.claimAllowed = false; } }
export function canObserveRecovery(attempt: RecoveryAttempt, context: object) { const own = originals.get(attempt); return !!own && own.context === context && own.claimAllowed; }

export function beginPasswordRecovery(input: RecoveryInput, context: object, active: () => boolean): RecoveryAttempt | undefined {
  const prior = retained && originals.get(retained);
  if (recoveryBlocked() || prior?.context === context && (prior.status === 'accepted' || prior.status === 'updated')
    || !active() || !input || typeof input !== 'object' || !['forgot', 'reset'].includes(input.mode)
    || input.lang !== 'es' && input.lang !== 'en') return;
  if (input.mode === 'forgot') {
    if (Object.keys(input).some(k => !['mode', 'email', 'lang'].includes(k)) || typeof input.email !== 'string' || input.email.trim().length > 254
      || !/^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(input.email.trim())) return;
  } else if (Object.keys(input).some(k => !['mode', 'token', 'password', 'lang'].includes(k))
    || typeof input.token !== 'string' || !/^[a-f0-9]{64}$/.test(input.token)
    || typeof input.password !== 'string' || new TextEncoder().encode(input.password).length > 72 || validatePassword(input.password, input.lang)) return;
  const permit = admitSessionCookieWriter('recovery'); if (!permit) return;
  const mode = input.mode, captured = mode === 'forgot'
    ? { email: (input as Extract<RecoveryInput, { mode: 'forgot' }>).email.trim().toLowerCase(), lang: input.lang }
    : { token: (input as Extract<RecoveryInput, { mode: 'reset' }>).token, password: (input as Extract<RecoveryInput, { mode: 'reset' }>).password, lang: input.lang };
  const attempt: RecoveryAttempt = Object.freeze({ kind: 'password-recovery-original' });
  const own: Own = { context, mode, promise: Promise.resolve(unknown), dispatchAllowed: true, claimAllowed: true, claimed: false };
  originals.set(attempt, own); retained = attempt;
  const settle = (outcome: RecoveryOutcome) => {
    own.status = outcome.status; own.outcome = outcome;
    // These endpoints never issue session cookies. Only their known native
    // terminal/nonissuance releases the privately held unissued cookie permit.
    if (terminal(outcome.status)) releaseUnissuedSessionCookieWriter(permit);
    return outcome;
  };
  own.promise = Promise.resolve().then(async () => {
    try {
      if (!own.dispatchAllowed || !active()) return settle(Object.freeze({ status: 'not-issued' }));
      const endpoint = '/api/auth/' + (mode === 'forgot' ? 'forgot-password' : 'reset-password');
      const expected = new URL(endpoint, window.location.origin).href;
      const response = await fetch(endpoint, { method: 'POST', redirect: 'error', cache: 'no-store', credentials: 'omit',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(captured) });
      if (response.redirected || response.url && response.url !== expected
        || !response.headers.get('content-type')?.toLowerCase().includes('application/json') || !response.body) return settle(unknown);
      const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
      let text = '', bytes = 0;
      try { while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 4096) return settle(unknown); text += decoder.decode(part.value, { stream: true }); } text += decoder.decode(); }
      finally { reader.releaseLock(); }
      const body: unknown = JSON.parse(text);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return settle(unknown);
      const row = body as Record<string, unknown>;
      if (mode === 'forgot' && response.status === 202 && response.ok === true
        && Object.keys(row).length === 2 && row.ok === true && row.status === 'accepted') return settle(Object.freeze({ status: 'accepted' }));
      if (mode === 'reset' && response.status === 200 && response.ok === true && Object.keys(row).length === 3 && row.ok === true && row.status === 'updated'
        && ['not_started', 'unconfirmed', 'acknowledged'].includes(row.notification as string))
        return settle(Object.freeze({ status: 'updated', notification: row.notification as RecoveryOutcome['notification'] }));
      if (Object.keys(row).length === 1 && typeof row.error === 'string') {
        if (response.status === 400 && row.error === 'invalid_input') return settle(Object.freeze({ status: 'invalid' }));
        if (mode === 'reset' && response.status === 400 && row.error === 'invalid_or_expired_link') return settle(Object.freeze({ status: 'expired' }));
        if (response.status === 429 && row.error === 'too_many_requests') return settle(Object.freeze({ status: 'rate-limited' }));
      }
      return settle(unknown);
    } catch { return settle(unknown); }
    finally { if ('password' in captured) captured.password = ''; if ('token' in captured) captured.token = ''; }
  });
  return attempt;
}

// Observer timeout stops this view, never the original HTTP/body or its realm
// exclusion. Explicit late observation joins it without another GET/POST.
export function observePasswordRecovery(attempt: RecoveryAttempt, context: object, active: () => boolean) {
  const own = originals.get(attempt), deadline = performance.now() + 60000; let finished = false, timer: ReturnType<typeof setTimeout> | undefined, resolve!: (o: RecoveryOutcome) => void;
  const promise = new Promise<RecoveryOutcome>(done => { resolve = done; });
  const finish = (outcome: RecoveryOutcome) => { if (finished) return; finished = true; if (timer !== undefined) clearTimeout(timer); if (own && outcome !== unknown) own.observed = outcome; resolve(outcome); };
  const retire = () => { if (own?.context === context) own.dispatchAllowed = false; finish(unknown); };
  if (!own || own.context !== context) finish(unknown);
  else if (!active() || !own.claimAllowed) { retireRecoveryProgress(attempt); finish(unknown); }
  else { timer = setTimeout(retire, 60000); void own.promise.then(outcome => {
    if (finished) return; if (!active() || !own.claimAllowed) { retireRecoveryProgress(attempt); retire(); return; }
    if (performance.now() >= deadline) { retire(); return; } finish(outcome);
  }); }
  return { promise, retire };
}
export function claimRecoveryCompletion(attempt: RecoveryAttempt, context: object, outcome: RecoveryOutcome) {
  const own = originals.get(attempt);
  if (!own || own.context !== context || own.observed !== outcome || own.outcome !== outcome || !own.claimAllowed || own.claimed
    || own.status !== outcome.status || !['accepted', 'updated'].includes(outcome.status)) return false;
  own.claimed = true; return own.mode === 'forgot' ? 'accepted' : '/login?reset=1';
}
