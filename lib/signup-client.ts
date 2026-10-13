'use client';
import type { SignupInput } from '@/lib/signup-input';
import { consumeSignupChallenge, type SignupChallenge } from '@/lib/signup-challenge';
import { admitSessionCookieWriter, releaseUnissuedSessionCookieWriter, sessionCookieWriterBusy } from '@/lib/session-cookie-writer';
import { validatePassword } from '@/lib/password';
export type SignupAttempt = Readonly<{ kind: 'signup-original' }>;
type Status = 'created' | 'invalid' | 'exists' | 'bot-denied' | 'rate-limited' | 'not-issued' | 'unconfirmed';
export type SignupOutcome = Readonly<{ status: Status }>;
type Original = { context: object; email: string; promise: Promise<Status>; dispatchAllowed: boolean; navigationAllowed: boolean; claimed: boolean; status?: Status; outcome?: SignupOutcome };
const originals = new WeakMap<SignupAttempt, Original>();
let retained: SignupAttempt | undefined;
const unknown: SignupOutcome = Object.freeze({ status: 'unconfirmed' });
const canRetry = (status?: Status) => !!status && ['invalid', 'exists', 'bot-denied', 'rate-limited', 'not-issued'].includes(status);
export function signupPending() { const own = retained && originals.get(retained); return !!own && !canRetry(own.status); }
export function signupBlocked() { return sessionCookieWriterBusy() || signupPending(); }
export function retireSignupProgress(attempt: SignupAttempt) { const own = originals.get(attempt); if (own) { own.dispatchAllowed = false; own.navigationAllowed = false; } }
export function beginSignup(input: Omit<SignupInput, 'turnstileToken'>, challenge: SignupChallenge, context: object, active: () => boolean) {
  if (signupBlocked() || !active() || !input || typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 100
    || typeof input.email !== 'string' || input.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())
    || typeof input.password !== 'string' || new TextEncoder().encode(input.password).length > 72 || validatePassword(input.password, input.lang)
    || (input.lang !== 'es' && input.lang !== 'en')) return;
  const permit = admitSessionCookieWriter('signup'); if (!permit) return;
  const token = consumeSignupChallenge(challenge, input.lang);
  if (!token) { releaseUnissuedSessionCookieWriter(permit); return; }
  const captured = { ...input, name: input.name.trim(), email: input.email.trim().toLowerCase(), turnstileToken: token };
  const attempt: SignupAttempt = Object.freeze({ kind: 'signup-original' });
  const own: Original = { context, email: captured.email, promise: Promise.resolve('unconfirmed'), dispatchAllowed: true, navigationAllowed: true, claimed: false };
  originals.set(attempt, own); retained = attempt;
  const settle = (status: Status) => { own.status = status;
    // Signup never issues a session-cookie request. A known denial or own
    // unissued terminal releases its exclusion. The created account keeps the
    // original for hard navigation, which leaves this realm without other writers.
    if (canRetry(status)) releaseUnissuedSessionCookieWriter(permit);
    return status;
  };
  own.promise = Promise.resolve().then(async () => {
    try {
      if (!own.dispatchAllowed || !active()) return settle('not-issued');
      const response = await fetch('/api/signup', { method: 'POST', redirect: 'error', cache: 'no-store', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(captured) });
      if (response.redirected || !response.headers.get('content-type')?.toLowerCase().includes('application/json') || !response.body) return settle('unconfirmed');
      const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true }); let text = '', bytes = 0;
      try { while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 4096) return settle('unconfirmed'); text += decoder.decode(part.value, { stream: true }); } text += decoder.decode(); }
      finally { reader.releaseLock(); }
      const body: unknown = JSON.parse(text);
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1) return settle('unconfirmed');
      if (response.status === 201 && response.ok === true && 'success' in body && body.success === true) return settle('created');
      if ('error' in body) {
        if (response.status === 400 && body.error === 'invalid_request') return settle('invalid');
        if (response.status === 400 && body.error === 'account_exists') return settle('exists');
        if (response.status === 403 && body.error === 'bot_verification_failed') return settle('bot-denied');
        if (response.status === 429 && body.error === 'Too many attempts. Try again later.') return settle('rate-limited');
      }
      return settle('unconfirmed');
    } catch { return settle('unconfirmed'); }
    finally { captured.password = ''; captured.turnstileToken = ''; }
  });
  return attempt;
}
export function observeSignupOriginal(attempt: SignupAttempt, context: object, active: () => boolean) {
  const own = originals.get(attempt); let finished = false, timer: ReturnType<typeof setTimeout> | undefined, resolve!: (value: SignupOutcome) => void;
  const promise = new Promise<SignupOutcome>(done => { resolve = done; });
  const finish = (outcome: SignupOutcome) => { if (finished) return; finished = true; if (timer !== undefined) clearTimeout(timer); if (own && outcome !== unknown) own.outcome = outcome; resolve(outcome); };
  const retire = () => { if (own?.context === context) own.dispatchAllowed = false; finish(unknown); };
  if (!own || own.context !== context || !active()) finish(unknown);
  else { timer = setTimeout(retire, 60000); void own.promise.then(status => {
    if (finished) return; if (!active() || !own.navigationAllowed) { retireSignupProgress(attempt); retire(); return; }
    finish(status === 'unconfirmed' ? unknown : Object.freeze({ status }));
  }); }
  return { promise, retire };
}
export function claimSignupNavigation(attempt: SignupAttempt, context: object, outcome: SignupOutcome) {
  const own = originals.get(attempt);
  if (!own || own.context !== context || own.outcome !== outcome || own.status !== 'created' || outcome.status !== 'created' || !own.navigationAllowed || own.claimed) return false;
  own.claimed = true; return '/verify-email?email=' + encodeURIComponent(own.email);
}
