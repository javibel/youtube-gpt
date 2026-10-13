'use client';
import { hasAcceptedWaitlistResponse } from '@/lib/waitlist-response';

export type WaitlistAttempt = Readonly<{ kind: 'waitlist-client-original' }>;
export type WaitlistOutcome = Readonly<{ status: 'accepted' | 'invalid' | 'rate-limited' | 'not-issued' | 'unconfirmed' }>;
type Input = { email: string; lang: 'es' | 'en'; source: string; referrer: string | null };
type Own = { context: object; promise: Promise<WaitlistOutcome>; dispatchAllowed: boolean; claimAllowed: boolean; claimed: boolean; outcome?: WaitlistOutcome; observed?: WaitlistOutcome };
const originals = new WeakMap<WaitlistAttempt, Own>(), listeners = new Set<() => void>();
const unknown: WaitlistOutcome = Object.freeze({ status: 'unconfirmed' });
let retained: WaitlistAttempt | undefined;
const terminal = (own?: Own) => !!own?.outcome && own.outcome.status !== 'unconfirmed';
const notify = () => { for (const listener of listeners) { try { listener(); } catch { /* A view cannot change the original terminal. */ } } };
export function subscribeWaitlist(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function waitlistBlocked() { return !!retained && !terminal(originals.get(retained)); }
export function retireWaitlistProgress(attempt: WaitlistAttempt) { const own = originals.get(attempt); if (own) { own.dispatchAllowed = false; own.claimAllowed = false; } }
export function canObserveWaitlist(attempt: WaitlistAttempt, context: object) { const own = originals.get(attempt); return !!own && own.context === context && own.claimAllowed; }

export function waitlistReferrer(value: string | null): string | null {
  if (!value || value.length > 2048 || /[\x00-\x1f\x7f]/.test(value)) return null;
  if (/^[\w.-]{1,80}$/.test(value)) return value;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.origin + url.pathname : null; }
  catch { return null; }
}
async function nativeBody(response: Response): Promise<unknown> {
  const expected = new URL('/api/waitlist', window.location.origin).href;
  if (!(response instanceof Response) || response.redirected || response.url && response.url !== expected
    || !/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type') ?? '') || !response.body) throw Error('Unconfirmed');
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '', bytes = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 4096) throw Error('Unconfirmed'); text += decoder.decode(part.value, { stream: true }); }
    text += decoder.decode(); return JSON.parse(text);
  } finally { reader.releaseLock(); }
}
export function beginWaitlist(input: Input, context: object, active: () => boolean): WaitlistAttempt | undefined {
  const prior = retained && originals.get(retained);
  if (waitlistBlocked() || prior?.context === context && prior.outcome?.status === 'accepted' || !active()
    || !input || typeof input !== 'object' || Object.keys(input).length !== 4 || Object.keys(input).some(k => !['email', 'lang', 'source', 'referrer'].includes(k))
    || input.lang !== 'es' && input.lang !== 'en' || typeof input.email !== 'string' || input.email.trim().length > 254
    || !/^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(input.email.trim())
    || typeof input.source !== 'string' || !input.source.trim() || input.source.trim().length > 160 || /[\x00-\x1f\x7f]/.test(input.source)
    || input.referrer !== null && (typeof input.referrer !== 'string' || waitlistReferrer(input.referrer) === null)) return;
  const captured = { email: input.email.trim().toLowerCase(), lang: input.lang, source: input.source.trim(), referrer: waitlistReferrer(input.referrer) };
  const attempt: WaitlistAttempt = Object.freeze({ kind: 'waitlist-client-original' });
  const own: Own = { context, promise: Promise.resolve(unknown), dispatchAllowed: true, claimAllowed: true, claimed: false };
  originals.set(attempt, own); retained = attempt;
  const settle = (outcome: WaitlistOutcome) => { own.outcome = outcome; notify(); return outcome; };
  // Private promise and exclusion exist before HTTP. No cookies, session writer,
  // persistent queue, timer release, retry or metadata-based recovery.
  own.promise = Promise.resolve().then(async () => {
    try {
      if (!own.dispatchAllowed || !active()) return settle(Object.freeze({ status: 'not-issued' }));
      const response = await fetch('/api/waitlist', { method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(captured) });
      const body = await nativeBody(response);
      if (response.ok === true && hasAcceptedWaitlistResponse(response.status, body)) return settle(Object.freeze({ status: 'accepted' }));
      if (body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 1) {
        const error = (body as Record<string, unknown>).error;
        if (response.status === 400 && error === 'invalid_input') return settle(Object.freeze({ status: 'invalid' }));
        if (response.status === 429 && error === 'too_many_requests') return settle(Object.freeze({ status: 'rate-limited' }));
      }
      return settle(unknown);
    } catch { return settle(unknown); }
    finally { captured.email = ''; captured.referrer = null; }
  });
  notify(); return attempt;
}
// An observer expires; its HTTP/Reader and shared exclusion do not. A late
// consultation can only join this same privately retained original.
export function observeWaitlist(attempt: WaitlistAttempt, context: object, active: () => boolean) {
  const own = originals.get(attempt), deadline = performance.now() + 60000;
  let finished = false, timer: ReturnType<typeof setTimeout> | undefined, resolve!: (outcome: WaitlistOutcome) => void;
  const promise = new Promise<WaitlistOutcome>(done => { resolve = done; });
  const finish = (outcome: WaitlistOutcome) => { if (finished) return; finished = true; if (timer !== undefined) clearTimeout(timer); if (own && outcome !== unknown) own.observed = outcome; resolve(outcome); };
  const retire = () => { if (own?.context === context) own.dispatchAllowed = false; finish(unknown); };
  if (!own || own.context !== context) finish(unknown);
  else if (!active() || !own.claimAllowed) { retireWaitlistProgress(attempt); finish(unknown); }
  else { timer = setTimeout(retire, 60000); void own.promise.then(outcome => {
    if (finished) return;
    if (!active() || !own.claimAllowed) { retireWaitlistProgress(attempt); retire(); return; }
    if (performance.now() >= deadline) { retire(); return; } finish(outcome);
  }); }
  return { promise, retire };
}
export function claimWaitlistAccepted(attempt: WaitlistAttempt, context: object, outcome: WaitlistOutcome) {
  const own = originals.get(attempt);
  if (!own || own.context !== context || !own.claimAllowed || own.claimed || own.observed !== outcome || own.outcome !== outcome || outcome.status !== 'accepted') return false;
  own.claimed = true; return true;
}

// Aggregate count is a read, never permission to submit or evidence of delivery.
// Strict remounts join one native read; a retired view cannot display its late body.
let countOriginal: Promise<number | undefined> | undefined;
export function observeWaitlistCount(active: () => boolean) {
  let finished = false, resolve!: (count: number | undefined) => void;
  const promise = new Promise<number | undefined>(done => { resolve = done; });
  const finish = (count?: number) => { if (finished) return; finished = true; clearTimeout(timer); resolve(count); };
  const deadline = performance.now() + 60000, timer = setTimeout(() => finish(), 60000);
  if (!active()) finish();
  else {
    countOriginal ??= Promise.resolve().then(async () => {
      try {
        const response = await fetch('/api/waitlist', { credentials: 'omit', redirect: 'error', cache: 'no-store' }), body = await nativeBody(response);
        if (response.status !== 200 || response.ok !== true || !body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1) return;
        const count = (body as Record<string, unknown>).count; return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? count : undefined;
      } catch { return; }
    });
    void countOriginal.then(count => finish(active() && performance.now() < deadline ? count : undefined));
  }
  return { promise, retire: () => finish() };
}
