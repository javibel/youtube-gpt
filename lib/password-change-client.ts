import { validatePassword } from '@/lib/password';
export type PasswordOwner = Readonly<{ userId: string; email: string }>;
export type PasswordReceipt = Readonly<{ ok: true; userId: string; email: string; key: string; status: 'updated'; lang: 'es' | 'en'; notification: 'not_started' | 'unconfirmed' | 'acknowledged' }>;
export type PasswordOutcome = { status: 'confirmed'; receipt: PasswordReceipt } | { status: 'rejected'; error: 'invalid' | 'unauthorized' | 'changed' | 'wrong_current' | 'passwordless' } | { status: 'unconfirmed' };
export interface PasswordAttempt { readonly owner: PasswordOwner; readonly key: string; readonly lang: 'es' | 'en'; readonly original: Promise<PasswordOutcome>; readonly waiter: Promise<PasswordOutcome>; readonly pending: boolean }
type RecordState = { pending: boolean; released: boolean; outcome?: PasswordOutcome };
const attempts = new Map<string, PasswordAttempt>(), records = new WeakMap<PasswordAttempt, RecordState>(), denied = new Set<string>();
const identity = (owner: PasswordOwner) => 'ytubviral:password-change:' + JSON.stringify([owner.userId, owner.email]);
const id = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const uncertain = (): PasswordOutcome => Object.freeze({ status: 'unconfirmed' });
export function passwordInputError(current: string, next: string, confirmation: string, lang: 'es' | 'en'): string | null {
  if (next !== confirmation) return lang === 'en' ? 'Passwords do not match' : 'Las contraseñas no coinciden';
  if (!current || !next) return lang === 'en' ? 'Enter both passwords' : 'Introduce ambas contraseñas';
  if (new TextEncoder().encode(current).length > 72 || new TextEncoder().encode(next).length > 72)
    return lang === 'en' ? 'Each password must be at most 72 UTF-8 bytes' : 'Cada contraseña debe tener como máximo 72 bytes UTF-8';
  return validatePassword(next, lang);
}
export const retainedPasswordChange = (owner: PasswordOwner) => attempts.get(identity(owner));
export function trustedPasswordOutcome(a: PasswordAttempt): PasswordOutcome | undefined {
  return attempts.get(identity(a.owner)) === a ? records.get(a)?.outcome : undefined;
}
export function passwordChangeBlocked(owner: PasswordOwner): boolean {
  const scope = identity(owner), a = attempts.get(scope);
  if (denied.has(scope) || a && !records.get(a)?.released) return true;
  try { return sessionStorage.getItem(scope) !== null; } catch { return true; }
}
// Only observation of the same live original can release its denial marker.
// The marker contains no credentials/key/receipt and never restores a capability.
export function acknowledgePasswordOriginal(a: PasswordAttempt): boolean {
  const state = records.get(a), result = trustedPasswordOutcome(a);
  if (!state || !result || result.status === 'unconfirmed') return false;
  if (state.released) return !denied.has(identity(a.owner));
  try { sessionStorage.removeItem(identity(a.owner)); state.released = true; return true; }
  catch { denied.add(identity(a.owner)); return false; }
}
function receipt(value: unknown, a: PasswordAttempt): PasswordReceipt | null {
  if (!object(value) || value.ok !== true || value.status !== 'updated' || value.userId !== a.owner.userId || value.email !== a.owner.email || value.key !== a.key
      || value.lang !== a.lang || !['not_started', 'unconfirmed', 'acknowledged'].includes(value.notification as string)) return null;
  return Object.freeze({ ok: true, userId: a.owner.userId, email: a.owner.email, key: a.key, status: 'updated', lang: a.lang,
    notification: value.notification as PasswordReceipt['notification'] });
}
function rejection(status: number, value: unknown): PasswordOutcome | null {
  if (!object(value) || Object.keys(value).length !== 1 || typeof value.error !== 'string') return null;
  const error = value.error;
  if (status === 401 && ['Unauthorized', 'No autorizado'].includes(error)) return Object.freeze({ status: 'rejected', error: 'unauthorized' });
  if (status === 409 && error === 'password_changed') return Object.freeze({ status: 'rejected', error: 'changed' });
  if (status !== 400) return null;
  if (['Current password is incorrect', 'La contraseña actual no es correcta'].includes(error)) return Object.freeze({ status: 'rejected', error: 'wrong_current' });
  if (['Cannot change password for this account', 'No se puede cambiar la contraseña de esta cuenta'].includes(error)) return Object.freeze({ status: 'rejected', error: 'passwordless' });
  if (error === 'invalid_input') return Object.freeze({ status: 'rejected', error: 'invalid' });
  return null;
}
// Consume only the response body of this captured native password POST.
// Observer timeout cannot cancel/reissue it or release its denial marker.
async function passwordBody(response: Response, canConsume: () => boolean): Promise<unknown> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined, done = false;
  try {
    if (!canConsume() || ![200, 400, 401, 409].includes(response.status) || response.ok !== (response.status === 200) || response.redirected
      || response.url && response.url !== new URL('/api/user/change-password', window.location.origin).href
      || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
      || !response.body) throw Error('Native password response unavailable');
    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let raw = '', bytes = 0, chunks = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) { done = true; break; }
      if (!(part.value instanceof Uint8Array) || ++chunks > 256 || (bytes += part.value.byteLength) > 4096)
        throw Error('Native password response unavailable');
      raw += decoder.decode(part.value, { stream: true });
    }
    raw += decoder.decode();
    return JSON.parse(raw) as unknown;
  } finally {
    // Join this body's own cleanup. It cannot undo the POST, acknowledge the
    // password, remove the marker or recover another original's authority.
    try { if (!done) await (reader ? reader.cancel() : response.body?.cancel()); }
    catch { /* Private cleanup failure remains unconfirmed. */ }
    finally { reader?.releaseLock(); }
  }
}
function bounded(original: Promise<PasswordOutcome>, deadline: number): Promise<PasswordOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (async () => {
    try {
      const result = await Promise.race([original, new Promise<PasswordOutcome>(resolve => { timer = setTimeout(() => resolve(uncertain()), Math.max(0, deadline - performance.now())); })]);
      return performance.now() >= deadline ? uncertain() : result;
    } finally { clearTimeout(timer); }
  })();
}
export function observePasswordOriginal(a: PasswordAttempt): Promise<PasswordOutcome> {
  if (attempts.get(identity(a.owner)) !== a || !records.has(a)) return Promise.resolve(uncertain());
  return bounded(a.original, performance.now() + 60_000);
}
export function beginPasswordChange(owner: PasswordOwner, input: { currentPassword: string; newPassword: string; lang: 'es' | 'en' },
  canConsume: () => boolean): PasswordAttempt | null {
  if (!id(owner.userId) || typeof owner.email !== 'string' || !owner.email || owner.email.length > 320 || !object(input)
      || !['es', 'en'].includes(input.lang) || typeof input.currentPassword !== 'string' || typeof input.newPassword !== 'string'
      || passwordInputError(input.currentPassword, input.newPassword, input.newPassword, input.lang) || !canConsume() || passwordChangeBlocked(owner)) return null;
  let key: string; try { key = crypto.randomUUID(); if (!id(key)) return null; } catch { return null; }
  const own = Object.freeze({ userId: owner.userId, email: owner.email }), lang = input.lang, scope = identity(own);
  // Secrets live only in this captured request body; never in a public handle or storage.
  const body = JSON.stringify({ currentPassword: input.currentPassword, newPassword: input.newPassword, lang });
  const state: RecordState = { pending: true, released: false };
  try { sessionStorage.setItem(scope, 'pending'); } catch { denied.add(scope); return null; }
  const a = { owner: own, key, lang } as PasswordAttempt; records.set(a, state); attempts.set(scope, a);
  const deadline = performance.now() + 60_000;
  const original = Promise.resolve().then(async (): Promise<PasswordOutcome> => {
    try {
      if (performance.now() >= deadline || !canConsume()) return uncertain();
      const response = await fetch('/api/user/change-password', { method: 'POST', redirect: 'error', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body });
      const value = await passwordBody(response, canConsume);
      if (!canConsume()) return uncertain();
      const accepted = response.ok && response.status === 200 ? receipt(value, a) : null;
      return accepted ? Object.freeze({ status: 'confirmed', receipt: accepted }) : rejection(response.status, value) ?? uncertain();
    } catch { return uncertain(); }
  }).then(result => { state.pending = false; state.outcome = result; return result; });
  Object.defineProperties(a, { owner: { value: own, writable: false }, key: { value: key, writable: false }, lang: { value: lang, writable: false },
    original: { value: original, writable: false }, waiter: { value: bounded(original, deadline), writable: false }, pending: { get: () => state.pending } });
  return Object.freeze(a);
}
