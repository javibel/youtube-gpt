'use client';
import { admitSessionCookieWriter, releaseUnissuedSessionCookieWriter, sessionCookieWriterBusy } from '@/lib/session-cookie-writer';
import { claimCredentialsNavigation, continueEmailCredentials, observeCredentialsOriginal, retireCredentialsProgress, type CredentialsAttempt, type CredentialsOutcome } from '@/lib/credentials-client';

export type EmailAttempt = Readonly<{ kind: 'verify' | 'resend' }>;
export type EmailOutcome = Readonly<{ status: 'verified-login' | 'verified-signin-required' | 'login-unconfirmed' | 'resend-accepted' | 'invalid' | 'expired' | 'rate-limited' | 'not-issued' | 'unconfirmed' }>;
type CodeOutcome = 'verified' | 'resend-accepted' | 'invalid' | 'expired' | 'rate-limited' | 'not-issued' | 'unconfirmed';
type Original = { context: object; promise: Promise<CodeOutcome>; permit: NonNullable<ReturnType<typeof admitSessionCookieWriter>>; allowProgress: boolean; claimed: boolean; code?: CodeOutcome; outcome?: EmailOutcome; login?: CredentialsAttempt; loginContext: object; loginOutcome?: CredentialsOutcome };
const originals = new WeakMap<EmailAttempt, Original>();
let retained: EmailAttempt | undefined;
const unknown: EmailOutcome = Object.freeze({ status: 'unconfirmed' });
const canStartAfter = (code: CodeOutcome | undefined) => !!code && ['resend-accepted', 'invalid', 'expired', 'rate-limited', 'not-issued'].includes(code);
export function emailVerificationBlocked() { const prior = retained && originals.get(retained); return sessionCookieWriterBusy() || !!prior && !canStartAfter(prior.code); }
export function currentEmailOriginal() { return retained; }
export function ownsEmailOriginal(attempt: EmailAttempt, context: object) { return originals.get(attempt)?.context === context; }
export function retireEmailProgress(attempt: EmailAttempt) { const original = originals.get(attempt); if (original) { original.allowProgress = false; if (original.login) retireCredentialsProgress(original.login); } }

export function beginEmailCommand(kind: EmailAttempt['kind'], input: Readonly<{ email: string; code: string; password: string; lang: 'es' | 'en' }>,
  origin: string, context: object, active: () => boolean): EmailAttempt | undefined {
  if ((kind !== 'verify' && kind !== 'resend') || emailVerificationBlocked() || !active()
    || typeof input.email !== 'string' || !input.email.trim() || input.email.length > 254
    || typeof input.password !== 'string' || typeof input.code !== 'string' || kind === 'verify' && !/^\d{6}$/.test(input.code)
    || (input.lang !== 'es' && input.lang !== 'en')) return;
  const permit = admitSessionCookieWriter('email'); if (!permit) return;
  const captured = { email: input.email.trim().toLowerCase(), code: input.code, password: input.password, lang: input.lang };
  const attempt: EmailAttempt = Object.freeze({ kind });
  const original: Original = { context, permit, promise: Promise.resolve('unconfirmed'), allowProgress: true, claimed: false, loginContext: {} };
  originals.set(attempt, original); retained = attempt;
  const settle = (code: CodeOutcome) => { original.code = code; if (canStartAfter(code)) releaseUnissuedSessionCookieWriter(permit); return code; };
  original.promise = Promise.resolve().then(async () => {
    try {
      if (!original.allowProgress || !active()) return settle('not-issued');
      const response = await fetch(kind === 'verify' ? '/api/auth/verify-email' : '/api/auth/resend-verification', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'verify' ? { email: captured.email, code: captured.code } : { email: captured.email, lang: captured.lang }),
      });
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1) return settle('unconfirmed');
      if (kind === 'verify' && response.status === 400 && 'error' in body && body.error === 'invalid_code') return settle('invalid');
      if (kind === 'verify' && response.status === 400 && 'error' in body && body.error === 'expired_code') return settle('expired');
      if (response.status === 429 && 'error' in body && body.error === (kind === 'verify' ? 'Too many attempts. Try again later.' : 'Too many requests. Try again later.')) return settle('rate-limited');
      if (response.status !== 200 || response.ok !== true) return settle('unconfirmed');
      if (kind === 'resend') return 'ok' in body && body.ok === true ? settle('resend-accepted') : settle('unconfirmed');
      if (!('verified' in body) || body.verified !== true) return settle('unconfirmed');
      // The genuine code HTTP/body ended. Its ACK proves only this verification
      // response, not authentication or mail delivery. A native password child
      // may continue only with the same private unissued permit and live input.
      original.code = 'verified';
      if (original.allowProgress && active() && captured.password) original.login = continueEmailCredentials(
        { email: captured.email, password: captured.password, totp: '' }, origin, original.loginContext,
        () => original.allowProgress && active(), permit);
      if (!original.login) releaseUnissuedSessionCookieWriter(permit);
      return 'verified';
    } catch { return settle('unconfirmed'); }
    finally { captured.password = ''; captured.code = ''; }
  });
  return attempt;
}

export function observeEmailOriginal(attempt: EmailAttempt, context: object, active: () => boolean) {
  const original = originals.get(attempt);
  let finished = false, timer: ReturnType<typeof setTimeout> | undefined;
  let child: ReturnType<typeof observeCredentialsOriginal> | undefined;
  let resolve!: (outcome: EmailOutcome) => void;
  const promise = new Promise<EmailOutcome>(done => { resolve = done; });
  const finish = (outcome: EmailOutcome) => { if (finished) return; finished = true; if (timer !== undefined) clearTimeout(timer); if (original && outcome !== unknown) original.outcome = outcome; resolve(outcome); };
  const retire = () => { if (original && original.context === context) { retireEmailProgress(attempt); child?.retire(); } finish(unknown); };
  if (!original || original.context !== context || !active()) retire();
  else {
    timer = setTimeout(retire, 60_000);
    void original.promise.then(async code => {
      if (finished || !active()) { retire(); return; }
      if (code === 'unconfirmed') { finish(unknown); return; }
      if (code !== 'verified') { finish(Object.freeze({ status: code })); return; }
      if (!original.login) { finish(Object.freeze({ status: 'verified-signin-required' })); return; }
      child = observeCredentialsOriginal(original.login, original.loginContext, () => !finished && active());
      const outcome = await child.promise;
      if (finished || !active()) { retire(); return; }
      original.loginOutcome = outcome;
      finish(Object.freeze({ status: outcome.status === 'confirmed' ? 'verified-login' : outcome.status === 'unconfirmed' ? 'login-unconfirmed' : 'verified-signin-required' }));
    });
  }
  return { promise, retire };
}

export function claimEmailNavigation(attempt: EmailAttempt, context: object, outcome: EmailOutcome) {
  const original = originals.get(attempt);
  if (!original || original.context !== context || original.outcome !== outcome || original.claimed
    || !['verified-login', 'verified-signin-required'].includes(outcome.status)) return false;
  let target: string | false = '/login?verified=1';
  if (original.login && original.loginOutcome?.status === 'confirmed') target = claimCredentialsNavigation(original.login, original.loginContext, original.loginOutcome);
  else if (original.login && original.loginOutcome?.status === 'denied') target = claimCredentialsNavigation(original.login, original.loginContext, original.loginOutcome);
  if (!target) return false;
  original.claimed = true; return target;
}
