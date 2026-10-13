'use client';
import type { TotpAccountExpectation } from '@/lib/totp-account';

export type TotpOwner = Readonly<{ id: string; email: string }>;
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
export function subscribeTotp(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function currentTotpOriginal() { return retained; }
export function ownsTotpOriginal(attempt: TotpAttempt, context: object) { return originals.get(attempt)?.context === context; }
export function totpBlocked() {
  const original = retained && originals.get(retained);
  return !!original && (!original.outcome || original.outcome.status === 'unconfirmed'
    || (original.outcome.status === 'confirmed' && !original.claimed));
}
export function retireTotpProgress(attempt: TotpAttempt) {
  const original = originals.get(attempt);
  if (original) original.allowUpdate = false;
}

export function beginTotp(owner: TotpOwner, context: object, code: string,
  update: (data: { totpCode: string } & TotpAccountExpectation) => Promise<unknown>, active: () => boolean): TotpAttempt | undefined {
  if (totpBlocked() || !active() || !owner.id || !owner.email || !/^\d{6}$/.test(code)) return;
  const attempt: TotpAttempt = Object.freeze({ owner: Object.freeze({ id: owner.id, email: owner.email }) });
  const original: Original = { context, promise: Promise.resolve(unknown), allowUpdate: true, claimed: false };
  originals.set(attempt, original); retained = attempt;
  const expectation: TotpAccountExpectation = Object.freeze({ expectedUserId: attempt.owner.id, expectedEmail: attempt.owner.email });
  const settle = (status: TotpOutcome['status']) => {
    const outcome: TotpOutcome = Object.freeze({ status });
    original.outcome = outcome; notify(); return outcome;
  };
  original.promise = Promise.resolve().then(async () => {
    try {
      if (!original.allowUpdate || !active()) return settle('not-issued');
      // Retain this exact HTTP/body/SDK chain. Ending a UI wait does not cancel
      // server work, prove cookie state, or authorize a replacement SDK call.
      const response = await fetch('/api/auth/verify-totp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, ...expectation }),
      });
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || Array.isArray(body)) return settle('unconfirmed');
      if (response.status === 400 && 'error' in body && body.error === 'invalid_code') return settle('invalid');
      if (response.status === 429 && 'error' in body && body.error === 'rate_limited') return settle('rate-limited');
      if (!response.ok || response.status !== 200 || Object.keys(body).length !== 1
        || !('verified' in body) || body.verified !== true) return settle('unconfirmed');
      // A delayed precheck must never start the native mutation after retirement.
      if (!original.allowUpdate || !active()) return settle('not-issued');
      const result = await update({ totpCode: code, ...expectation });
      if (!result || typeof result !== 'object' || Array.isArray(result)
        || Object.keys(result).some(key => key !== 'user' && key !== 'expires')
        || ('expires' in result && typeof result.expires !== 'string')) return settle('unconfirmed');
      const principal = (result as { user?: { id?: unknown; email?: unknown; requiresTotp?: unknown; isAdmin?: unknown } } | null)?.user;
      if (!principal || typeof principal !== 'object' || Array.isArray(principal)
        || principal.id !== attempt.owner.id || principal.email !== attempt.owner.email
        || principal.requiresTotp !== false || principal.isAdmin !== true) return settle('unconfirmed');
      // This observes the installed SDK return, not its hidden CSRF/HTTP stages
      // or authenticated continuity after this JavaScript realm is lost.
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
