import { beginProfileRead, trustedProfileRead } from '@/lib/profile-read-client';
import type { ProfileRead } from '@/lib/profile-read-client';
import type { ProfileOwner, ProfileUpdateInput } from '@/lib/profile-update';
export type ProfileOutcome = { status: 'confirmed'; receipt: Readonly<ProfileUpdateInput> } | { status: 'rejected'; error: string } | { status: 'unconfirmed' };
export interface ProfileAttempt { readonly owner: ProfileOwner; readonly key: string; readonly original: Promise<ProfileOutcome>; readonly waiter: Promise<ProfileOutcome>; pending: boolean; outcome?: ProfileOutcome; waitOutcome?: ProfileOutcome }
const attempts = new Map<string, ProfileAttempt>(), selections = new WeakMap<ProfileAttempt, Readonly<ProfileUpdateInput>>(),
  settled = new WeakMap<ProfileAttempt, ProfileOutcome>(), reads = new WeakMap<ProfileAttempt, ProfileRead>(), denied = new Set<string>(), owners = new Set<string>(), appliedLanguages = new WeakSet<ProfileAttempt>();
const identity = (owner: ProfileOwner) => 'ytubviral:profile-update:' + JSON.stringify([owner.userId, owner.email]);
const id = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
const language = (v: unknown) => v === 'es' || v === 'en';
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const uncertain = (): ProfileOutcome => Object.freeze({ status: 'unconfirmed' });
export function validProfileSelection(v: unknown): v is ProfileUpdateInput {
  if (!object(v) || Object.keys(v).length !== 3) return false;
  return v.operation === 'name' ? Object.hasOwn(v, 'previousName') && (v.previousName === null || typeof v.previousName === 'string' && v.previousName.length <= 1000)
    && typeof v.name === 'string' && v.name === v.name.trim() && v.name.length >= 1 && v.name.length <= 100 && v.name !== v.previousName
    : v.operation === 'language' && language(v.previousLang) && language(v.lang) && v.previousLang !== v.lang;
}
export const retainedProfileUpdate = (owner: ProfileOwner) => attempts.get(identity(owner));
export function trustedProfileOutcome(a: ProfileAttempt): ProfileOutcome | undefined { return attempts.get(identity(a.owner)) === a ? settled.get(a) : undefined; }
export function profileUpdateBlocked(owner: ProfileOwner): boolean {
  const key = identity(owner), a = attempts.get(key), result = a && settled.get(a);
  if (owners.has(key) || denied.has(key) || a && (!result || result.status === 'unconfirmed')) return true;
  try { return sessionStorage.getItem(key) !== null; } catch { return true; }
}
function acknowledgement(value: unknown, a: ProfileAttempt): Readonly<ProfileUpdateInput> | null {
  const selected = selections.get(a);
  if (!selected || !object(value) || value.ok !== true || value.status !== 'updated' || value.userId !== a.owner.userId || value.email !== a.owner.email || value.key !== a.key
    || Object.entries(selected).some(([k, v]) => value[k] !== v)) return null;
  return Object.freeze({ ...selected });
}
export function readConfirmedProfileUpdate(a: ProfileAttempt): ProfileRead | null {
  if (trustedProfileOutcome(a)?.status !== 'confirmed') return null;
  let r = reads.get(a); if (!r) { r = beginProfileRead(a.owner, true); reads.set(a, r); } return r;
}
export function profileValueConfirmed(a: ProfileAttempt, r: ProfileRead): boolean {
  const outcome = trustedProfileOutcome(a), read = trustedProfileRead(r);
  return outcome?.status === 'confirmed' && read?.status === 'ready' && r.owner.userId === a.owner.userId && r.owner.email === a.owner.email
    && (outcome.receipt.operation === 'name' ? read.data.user.name === outcome.receipt.name : read.data.user.lang === outcome.receipt.lang);
}
export function claimConfirmedProfileLanguage(a: ProfileAttempt, r: ProfileRead): 'es' | 'en' | null {
  const result = trustedProfileOutcome(a);
  if (appliedLanguages.has(a) || result?.status !== 'confirmed' || result.receipt.operation !== 'language' || !profileValueConfirmed(a, r)) return null;
  appliedLanguages.add(a); return result.receipt.lang;
}
export function beginProfileUpdate(owner: ProfileOwner, input: unknown): ProfileAttempt | null {
  if (!id(owner.userId) || typeof owner.email !== 'string' || !owner.email || !validProfileSelection(input) || profileUpdateBlocked(owner)) return null;
  let key: string; try { key = crypto.randomUUID(); if (!id(key)) return null; } catch { return null; }
  const own = Object.freeze({ userId: owner.userId, email: owner.email }), selected = Object.freeze({ ...input }), scope = identity(own);
  owners.add(scope); try { sessionStorage.setItem(scope, 'pending'); } catch { denied.add(scope); return null; }
  const a = { owner: own, key, pending: true } as ProfileAttempt; attempts.set(scope, a); selections.set(a, selected);
  const deadline = performance.now() + 60_000;
  const original = Promise.resolve().then(async (): Promise<ProfileOutcome> => {
    let outcome = uncertain();
    try {
      if (performance.now() >= deadline) return outcome;
      const res = await fetch('/api/user/profile', { method: 'PATCH', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(selected) });
      const value: unknown = await res.json(), receipt = res.ok && res.status === 200 ? acknowledgement(value, a) : null;
      if (receipt) outcome = Object.freeze({ status: 'confirmed', receipt });
      else if (!res.ok && object(value) && [[401, 'Unauthorized'], [400, 'invalid_input'], [404, 'profile_not_found'], [409, 'profile_changed']].some(([status, error]) => res.status === status && value.error === error))
        outcome = Object.freeze({ status: 'rejected', error: value.error as string });
      if (outcome.status !== 'unconfirmed') { try { sessionStorage.removeItem(scope); owners.delete(scope); } catch { denied.add(scope); } }
    } catch { /* Preserve uncertainty and same live original; no abort/retry/reconstruction. */ }
    return outcome;
  }).then(outcome => { a.pending = false; a.outcome = outcome; settled.set(a, outcome); return outcome; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waiter = (async () => { try { const result = await Promise.race([original, new Promise<ProfileOutcome>(resolve => { timer = setTimeout(() => resolve(uncertain()), Math.max(0, deadline - performance.now())); })]); return a.waitOutcome = performance.now() >= deadline ? uncertain() : result; } finally { clearTimeout(timer); } })();
  Object.defineProperties(a, { owner: { value: own, writable: false, configurable: false }, key: { value: key, writable: false, configurable: false },
    original: { value: original, writable: false, configurable: false }, waiter: { value: waiter, writable: false, configurable: false } });
  return a;
}
