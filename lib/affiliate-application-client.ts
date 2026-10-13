'use client';
import { hasAcceptedAffiliateApplicationResponse } from '@/lib/affiliate-application-response';
import { AFFILIATES_DORMANT } from '@/lib/features';
import { isDisposableEmail } from '@/lib/disposable-domains';

export type AffiliateApplicationAttempt = Readonly<{ kind: 'affiliate-application-client-original' }>;
export type AffiliateApplicationOutcome = Readonly<{ status: 'accepted' | 'invalid' | 'rate-limited' | 'not-issued' | 'unavailable' | 'unconfirmed' }>;
type Input = { name: string; email: string; lang: 'es' | 'en'; channelInfo: string };
type Own = { context: object; promise: Promise<AffiliateApplicationOutcome>; dispatchAllowed: boolean; claimAllowed: boolean; claimed: boolean; outcome?: AffiliateApplicationOutcome; observed?: AffiliateApplicationOutcome };
const originals = new WeakMap<AffiliateApplicationAttempt, Own>(), listeners = new Set<() => void>();
const unknown: AffiliateApplicationOutcome = Object.freeze({ status: 'unconfirmed' });
let retained: AffiliateApplicationAttempt | undefined;
const terminal = (own?: Own) => !!own?.outcome && own.outcome.status !== 'unconfirmed';
const notify = () => { for (const listener of listeners) { try { listener(); } catch { /* A view cannot change the original terminal. */ } } };
export function subscribeAffiliateApplication(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function affiliateApplicationBlocked() { return !!retained && !terminal(originals.get(retained)); }
export function retireAffiliateApplicationProgress(attempt: AffiliateApplicationAttempt) { const own = originals.get(attempt); if (own) { own.dispatchAllowed = false; own.claimAllowed = false; } }
export function canObserveAffiliateApplication(attempt: AffiliateApplicationAttempt, context: object) { const own = originals.get(attempt); return !!own && own.context === context && own.claimAllowed; }

export function affiliateApplicationDormant() { return AFFILIATES_DORMANT; }
async function nativeBody(response: Response): Promise<unknown> {
  const expected = new URL('/api/affiliates/apply', window.location.origin).href;
  if (!(response instanceof Response) || response.redirected || response.url && response.url !== expected
    || !/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type') ?? '') || !response.body) throw Error('Unconfirmed');
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '', bytes = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 4096) throw Error('Unconfirmed'); text += decoder.decode(part.value, { stream: true }); }
    text += decoder.decode(); return JSON.parse(text);
  } finally { reader.releaseLock(); }
}
export function beginAffiliateApplication(input: Input, context: object, active: () => boolean): AffiliateApplicationAttempt | undefined {
  const prior = retained && originals.get(retained);
  if (AFFILIATES_DORMANT || affiliateApplicationBlocked() || prior?.context === context && prior.outcome?.status === 'accepted' || !active()
    || !input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 4 || Object.keys(input).some(k => !['name', 'email', 'lang', 'channelInfo'].includes(k))
    || input.lang !== 'es' && input.lang !== 'en' || typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 100 || /[\x00-\x1f\x7f]/.test(input.name.trim())
    || typeof input.email !== 'string' || input.email.trim().length > 254 || !/^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(input.email.trim()) || isDisposableEmail(input.email.trim().toLowerCase())
    || typeof input.channelInfo !== 'string' || input.channelInfo.length > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(input.channelInfo)) return;
  const captured = { name: input.name.trim(), email: input.email.trim().toLowerCase(), lang: input.lang, channelInfo: input.channelInfo.replace(/\r\n?/g, '\n').trim() || null };
  const attempt: AffiliateApplicationAttempt = Object.freeze({ kind: 'affiliate-application-client-original' });
  const own: Own = { context, promise: Promise.resolve(unknown), dispatchAllowed: true, claimAllowed: true, claimed: false };
  originals.set(attempt, own); retained = attempt;
  const settle = (outcome: AffiliateApplicationOutcome) => { own.outcome = outcome; notify(); return outcome; };
  // Private promise and exclusion exist before HTTP. No cookies, session writer,
  // persistent queue, timer release, retry or metadata-based recovery.
  own.promise = Promise.resolve().then(async () => {
    try {
      if (AFFILIATES_DORMANT || !own.dispatchAllowed || !active()) return settle(Object.freeze({ status: 'not-issued' }));
      const response = await fetch('/api/affiliates/apply', { method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(captured) });
      const body = await nativeBody(response);
      if (response.ok === true && hasAcceptedAffiliateApplicationResponse(response.status, body)) return settle(Object.freeze({ status: 'accepted' }));
      if (body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 1) {
        const error = (body as Record<string, unknown>).error;
        if (response.status === 404 && error === 'not_found') return settle(Object.freeze({ status: 'unavailable' }));
        if (response.status === 400 && error === 'invalid_input') return settle(Object.freeze({ status: 'invalid' }));
        if (response.status === 429 && error === 'too_many_requests') return settle(Object.freeze({ status: 'rate-limited' }));
      }
      return settle(unknown);
    } catch { return settle(unknown); }
    finally { captured.name = ''; captured.email = ''; captured.channelInfo = null; }
  });
  notify(); return attempt;
}
// An observer expires; its HTTP/Reader and shared exclusion do not. A late
// consultation can only join this same privately retained original.
export function observeAffiliateApplication(attempt: AffiliateApplicationAttempt, context: object, active: () => boolean) {
  const own = originals.get(attempt), deadline = performance.now() + 60000;
  let finished = false, timer: ReturnType<typeof setTimeout> | undefined, resolve!: (outcome: AffiliateApplicationOutcome) => void;
  const promise = new Promise<AffiliateApplicationOutcome>(done => { resolve = done; });
  const finish = (outcome: AffiliateApplicationOutcome) => { if (finished) return; finished = true; if (timer !== undefined) clearTimeout(timer); if (own && outcome !== unknown) own.observed = outcome; resolve(outcome); };
  const retire = () => { if (own?.context === context) own.dispatchAllowed = false; finish(unknown); };
  if (!own || own.context !== context) finish(unknown);
  else if (!active() || !own.claimAllowed) { retireAffiliateApplicationProgress(attempt); finish(unknown); }
  else { timer = setTimeout(retire, 60000); void own.promise.then(outcome => {
    if (finished) return;
    if (!active() || !own.claimAllowed) { retireAffiliateApplicationProgress(attempt); retire(); return; }
    if (performance.now() >= deadline) { retire(); return; } finish(outcome);
  }); }
  return { promise, retire };
}
export function claimAffiliateApplicationAccepted(attempt: AffiliateApplicationAttempt, context: object, outcome: AffiliateApplicationOutcome) {
  const own = originals.get(attempt);
  if (!own || own.context !== context || !own.claimAllowed || own.claimed || own.observed !== outcome || own.outcome !== outcome || outcome.status !== 'accepted') return false;
  own.claimed = true; return true;
}

