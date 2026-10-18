'use client';
import { admitSessionCookieWriter, markSessionCookiePost, releaseUnissuedSessionCookieWriter, sessionCookieWriterBusy } from '@/lib/session-cookie-writer';

export type GoogleSigninAttempt = Readonly<{ kind: 'google' }>;
export type GoogleSigninOutcome = Readonly<{ status: 'ready-for-redirect'; url: string } | { status: 'not-issued' | 'unconfirmed' }>;
type Original = { context: object; promise: Promise<GoogleSigninOutcome>; outcome?: GoogleSigninOutcome; allowPost: boolean; claimed: boolean };
const originals = new WeakMap<GoogleSigninAttempt, Original>();
let retained: GoogleSigninAttempt | undefined;
const unknown: GoogleSigninOutcome = Object.freeze({ status: 'unconfirmed' });

// Only the body of this exact native CSRF GET or Google initiation POST is consumed.
// Intrinsic body failure never releases the live cookie permit. A UI timeout or
// retirement neither cancels an issued request nor substitutes a new request.
async function googleBody(response: Response, endpoint: '/api/auth/csrf' | '/api/auth/signin/google'): Promise<unknown> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined, done = false;
  try {
    if (response.status !== 200 || response.ok !== true || response.redirected
      || response.url && response.url !== new URL(endpoint, window.location.origin).href
      || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
      || !response.body) throw Error('Native Google initiation unavailable');
    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let raw = '', bytes = 0, chunks = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) { done = true; break; }
      if (!(part.value instanceof Uint8Array) || ++chunks > 256 || (bytes += part.value.byteLength) > (endpoint === '/api/auth/csrf' ? 4096 : 65536))
        throw Error('Native Google initiation unavailable');
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
export function currentGoogleSigninOriginal() { return retained; }
export function ownsGoogleSigninOriginal(attempt: GoogleSigninAttempt, context: object) { return originals.get(attempt)?.context === context; }
export function googleSigninBlocked() { const prior = retained && originals.get(retained); return sessionCookieWriterBusy() || !!prior && prior.outcome?.status !== 'not-issued'; }
export function retireGoogleSigninProgress(attempt: GoogleSigninAttempt) { const original = originals.get(attempt); if (original) original.allowPost = false; }

function callbackTarget(value: string) {
  if (value === '/dashboard') return value;
  // Captured referral routing is optional and restricts this request only. It
  // cannot establish account identity, attribution consent or OAuth authority.
  if (!/^\/dashboard\?ref=[a-zA-Z0-9_-]{1,20}$/.test(value)) return;
  return value;
}

function authorizationTarget(value: string, origin: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'accounts.google.com' || url.port || url.username || url.password
    || url.pathname !== '/o/oauth2/v2/auth' || url.hash) return;
  const allowed = ['response_type', 'client_id', 'redirect_uri', 'scope', 'code_challenge', 'code_challenge_method', 'state', 'nonce'];
  const params = url.searchParams, entries = [...params.entries()];
  if (entries.some(([key]) => !allowed.includes(key)) || new Set(entries.map(([key]) => key)).size !== entries.length
    || params.get('response_type') !== 'code' || params.get('code_challenge_method') !== 'S256'
    || !/^[a-zA-Z0-9_-]{43}$/.test(params.get('code_challenge') ?? '')
    || !params.get('client_id')?.trim() || (params.get('client_id')?.length ?? 0) > 512
    || entries.some(([, text]) => !text || text.length > 8192)) return;
  const callback = new URL(params.get('redirect_uri') ?? '');
  if (callback.origin !== origin || callback.pathname !== '/api/auth/callback/google' || callback.search || callback.hash || callback.username || callback.password) return;
  const scopes = (params.get('scope') ?? '').split(' ');
  if (scopes.length !== 3 || new Set(scopes).size !== 3 || scopes.some(scope => !['openid', 'profile', 'email'].includes(scope))) return;
  // This is a routing constraint on the same native initiation response. The
  // native issuer/callback owns PKCE/state/nonce cookies and eventual identity.
  // URL shape or public parameters never prove authentication or recovery.
  return url.href;
}

export function beginGoogleSignin(callbackUrl: string, origin: string, context: object, active: () => boolean): GoogleSigninAttempt | undefined {
  const callback = callbackTarget(callbackUrl);
  if (!callback || googleSigninBlocked() || !active()) return;
  const permit = admitSessionCookieWriter('google'); if (!permit) return;
  const attempt: GoogleSigninAttempt = Object.freeze({ kind: 'google' });
  const original: Original = { context, promise: Promise.resolve(unknown), allowPost: true, claimed: false };
  originals.set(attempt, original); retained = attempt;
  const settle = (outcome: GoogleSigninOutcome) => { original.outcome = outcome; if (outcome.status === 'not-issued') releaseUnissuedSessionCookieWriter(permit); return outcome; };
  const notIssued = () => settle(Object.freeze({ status: 'not-issued' }));
  original.promise = Promise.resolve().then(async () => {
    try {
      if (!original.allowPost || !active()) return notIssued();
      const csrfResponse = await fetch('/api/auth/csrf', { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
      const csrf = await googleBody(csrfResponse, '/api/auth/csrf');
      if (csrfResponse.status !== 200 || csrfResponse.ok !== true || !csrf || typeof csrf !== 'object' || Array.isArray(csrf)
        || Object.keys(csrf).length !== 1 || !('csrfToken' in csrf) || typeof csrf.csrfToken !== 'string'
        || !/^[a-f0-9]{64}$/.test(csrf.csrfToken)) return settle(unknown);
      if (!original.allowPost || !active()) return notIssued();
      if (!markSessionCookiePost(permit)) return settle(unknown);
      // The configured Google provider is fixed. No SDK discovery, session GET,
      // projection or broadcast introduces a second cookie writer in this chain.
      const response = await fetch('/api/auth/signin/google', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' },
        body: new URLSearchParams({ csrfToken: csrf.csrfToken, callbackUrl: callback }).toString() });
      const body = await googleBody(response, '/api/auth/signin/google');
      if (response.status !== 200 || response.ok !== true || !body || typeof body !== 'object' || Array.isArray(body)
        || Object.keys(body).length !== 1 || !('url' in body) || typeof body.url !== 'string') return settle(unknown);
      const url = authorizationTarget(body.url, origin);
      return url ? settle(Object.freeze({ status: 'ready-for-redirect', url })) : settle(unknown);
    } catch { return settle(unknown); }
  });
  return attempt;
}

export function observeGoogleSigninOriginal(attempt: GoogleSigninAttempt, context: object, active: () => boolean) {
  const original = originals.get(attempt);
  let finished = false, timer: ReturnType<typeof setTimeout> | undefined;
  let resolve!: (outcome: GoogleSigninOutcome) => void;
  const promise = new Promise<GoogleSigninOutcome>(done => { resolve = done; });
  const finish = (outcome: GoogleSigninOutcome) => { if (finished) return; finished = true; if (timer !== undefined) clearTimeout(timer); resolve(outcome); };
  const retire = () => { if (original && original.context === context) original.allowPost = false; finish(unknown); };
  if (!original || original.context !== context || !active()) retire();
  else { timer = setTimeout(retire, 30_000); void original.promise.then(outcome => { if (!finished && active()) finish(outcome); else retire(); }); }
  return { promise, retire };
}

export function claimGoogleSigninRedirect(attempt: GoogleSigninAttempt, context: object, outcome: GoogleSigninOutcome) {
  const original = originals.get(attempt);
  if (!original || original.context !== context || original.outcome !== outcome || original.claimed || outcome.status !== 'ready-for-redirect') return false;
  original.claimed = true; return outcome.url;
}
