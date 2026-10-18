'use client';
import { admitSessionCookieWriter, markSessionCookiePost, ownsUnissuedEmailCookiePermit, releaseUnissuedSessionCookieWriter, sessionCookieWriterBusy, type SessionCookieWriter } from '@/lib/session-cookie-writer';

export type CredentialsAttempt = Readonly<{ kind: 'credentials' }>;
export type CredentialsOutcome = Readonly<{ status: 'confirmed' | 'denied' | 'not-issued' | 'unconfirmed' }>;
type Original = { context: object; promise: Promise<CredentialsOutcome>; outcome?: CredentialsOutcome; allowPost: boolean; claimed: boolean };
const originals = new WeakMap<CredentialsAttempt, Original>();
let retained: CredentialsAttempt | undefined;
const unknown: CredentialsOutcome = Object.freeze({ status: 'unconfirmed' });

// Only the body of this exact native CSRF GET or callback POST is consumed.
// Intrinsic body failure never releases the live cookie permit. A UI timeout or
// retirement neither cancels an issued request nor substitutes a new request.
async function credentialsBody(response: Response, endpoint: '/api/auth/csrf' | '/api/auth/callback/credentials'): Promise<unknown> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined, done = false;
  try {
    if (response.status !== 200 || response.ok !== true || response.redirected
      || response.url && response.url !== new URL(endpoint, window.location.origin).href
      || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
      || !response.body) throw Error('Native credentials unavailable');
    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let raw = '', bytes = 0, chunks = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) { done = true; break; }
      if (!(part.value instanceof Uint8Array) || ++chunks > 256 || (bytes += part.value.byteLength) > 4096)
        throw Error('Native credentials unavailable');
      raw += decoder.decode(part.value, { stream: true });
    }
    raw += decoder.decode();
    return JSON.parse(raw) as unknown;
  } finally {
    // Join this body's own cleanup; cancellation cannot undo an issued POST or
    // prove authentication, freshness, shutdown, or another original's result.
    try { if (!done) await (reader ? reader.cancel() : response.body?.cancel()); }
    catch { /* Private cleanup failure remains unconfirmed. */ }
    finally { reader?.releaseLock(); }
  }
}
export function currentCredentialsOriginal() { return retained; }
export function ownsCredentialsOriginal(attempt: CredentialsAttempt, context: object) { return originals.get(attempt)?.context === context; }
export function retireCredentialsProgress(attempt: CredentialsAttempt) { const original = originals.get(attempt); if (original) original.allowPost = false; }

// The fixed credentials provider and /dashboard callback belong to the local
// auth configuration. No dynamic provider, callback or public receipt can widen
// this transport. Password/OTP never enter the public attempt or browser storage.
export function beginCredentials(input: Readonly<{ email: string; password: string; totp: string }>,
  origin: string, context: object, active: () => boolean): CredentialsAttempt | undefined {
  if (sessionCookieWriterBusy()) return;
  return startCredentials(input, origin, context, active);
}

export function continueEmailCredentials(input: Readonly<{ email: string; password: string; totp: string }>,
  origin: string, context: object, active: () => boolean, permit: SessionCookieWriter): CredentialsAttempt | undefined {
  if (!ownsUnissuedEmailCookiePermit(permit)) return;
  return startCredentials(input, origin, context, active, permit);
}

function startCredentials(input: Readonly<{ email: string; password: string; totp: string }>,
  origin: string, context: object, active: () => boolean, emailPermit?: SessionCookieWriter): CredentialsAttempt | undefined {
  const prior = retained && originals.get(retained);
  if (prior && prior.outcome?.status !== 'not-issued' || !active()
    || typeof input.email !== 'string' || !input.email.trim() || typeof input.password !== 'string' || !input.password
    || typeof input.totp !== 'string' || input.totp !== '' && !/^\d{6}$/.test(input.totp)) return;
  const permit = emailPermit ?? admitSessionCookieWriter('credentials');
  if (!permit) return;
  const captured = { email: input.email, password: input.password, totp: input.totp };
  const attempt: CredentialsAttempt = Object.freeze({ kind: 'credentials' });
  const original: Original = { context, promise: Promise.resolve(unknown), allowPost: true, claimed: false };
  originals.set(attempt, original); retained = attempt;
  const settle = (status: CredentialsOutcome['status']) => {
    const outcome: CredentialsOutcome = Object.freeze({ status }); original.outcome = outcome;
    if (status === 'not-issued') releaseUnissuedSessionCookieWriter(permit);
    return outcome;
  };
  original.promise = Promise.resolve().then(async () => {
    try {
      if (!original.allowPost || !active()) return settle('not-issued');
      const csrfResponse = await fetch('/api/auth/csrf', { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
      const csrf = await credentialsBody(csrfResponse, '/api/auth/csrf');
      if (csrfResponse.status !== 200 || csrfResponse.ok !== true || !csrf || typeof csrf !== 'object' || Array.isArray(csrf)
        || Object.keys(csrf).length !== 1 || !('csrfToken' in csrf) || typeof csrf.csrfToken !== 'string'
        || !/^[a-f0-9]{64}$/.test(csrf.csrfToken)) return settle('unconfirmed');
      // Retiring a wait prevents a later POST; it does not cancel an issued POST
      // or its eventual cookie. Only this completed unissued original can release.
      if (!original.allowPost || !active()) return settle('not-issued');
      const body = new URLSearchParams({ email: captured.email, password: captured.password,
        ...(captured.totp ? { totp: captured.totp } : {}), csrfToken: csrf.csrfToken, callbackUrl: '/dashboard' }).toString();
      if (!markSessionCookiePost(permit)) return settle('unconfirmed');
      const response = await fetch('/api/auth/callback/credentials', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' }, body });
      const result = await credentialsBody(response, '/api/auth/callback/credentials');
      if (response.status !== 200 || response.ok !== true || !result || typeof result !== 'object' || Array.isArray(result)
        || Object.keys(result).length !== 1 || !('url' in result) || typeof result.url !== 'string') return settle('unconfirmed');
      const url = new URL(result.url, origin);
      if (url.origin !== origin || url.username || url.password || url.hash) return settle('unconfirmed');
      if (url.pathname === '/dashboard' && !url.search) return settle('confirmed');
      const entries = [...url.searchParams.entries()];
      if (url.pathname === '/login' && entries.length === 2 && url.searchParams.get('error') === 'CredentialsSignin'
        && url.searchParams.get('code') === 'credentials') return settle('denied');
      return settle('unconfirmed');
    } catch { return settle('unconfirmed'); }
    finally { captured.email = ''; captured.password = ''; captured.totp = ''; }
  });
  return attempt;
}

export function observeCredentialsOriginal(attempt: CredentialsAttempt, context: object, active: () => boolean) {
  const original = originals.get(attempt);
  let finished = false, timer: ReturnType<typeof setTimeout> | undefined;
  let resolve!: (outcome: CredentialsOutcome) => void;
  const promise = new Promise<CredentialsOutcome>(done => { resolve = done; });
  const finish = (outcome: CredentialsOutcome) => { if (finished) return; finished = true; if (timer !== undefined) clearTimeout(timer); resolve(outcome); };
  const retire = () => { if (original && original.context === context) original.allowPost = false; finish(unknown); };
  if (!original || original.context !== context || !active()) retire();
  else {
    timer = setTimeout(retire, 30_000);
    void original.promise.then(outcome => { if (!finished && active()) finish(outcome); else retire(); });
  }
  return { promise, retire };
}

export function claimCredentialsNavigation(attempt: CredentialsAttempt, context: object, outcome: CredentialsOutcome) {
  const original = originals.get(attempt);
  if (!original || original.context !== context || original.outcome !== outcome || original.claimed
    || (outcome.status !== 'confirmed' && outcome.status !== 'denied')) return false;
  original.claimed = true;
  // These static routes consume the browser's native cookie on a full load.
  // Native auth/proxy still decides identity and gates. No session GET, SDK
  // projection/broadcast or JSON claim grants authentication or releases the POST.
  return outcome.status === 'confirmed' ? '/dashboard' : '/login?credentials=1';
}
