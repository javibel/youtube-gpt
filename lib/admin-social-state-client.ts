import { decodeSocialState, stateObject as object, type SocialStateData } from '@/lib/admin-social-state-data';
export type SocialStateOwner=Readonly<{id:string;email:string;authSessionRef:string;expiresAt:number}>;
declare const socialStateView:unique symbol;
export type SocialStateView={readonly [socialStateView]:true};
const views=new WeakMap<object,{own:object;data:SocialStateData}>();
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
type Own = { sent: boolean; finished: boolean; pending: number; confirmed:boolean };
const attempted = new Set<string>(), unsettled = new Set<Own>();
const keyOf = (owner: SocialStateOwner) => JSON.stringify([owner.id, owner.email, owner.authSessionRef]);
// Realm-local negative exclusion. An uncertain issued read cannot be retried;
// unconfirmed issued IO blocks every owner in this realm,even after waiter retirement.
// Only this original validated body permits a later independent poll;no recovery.
export const adminSocialStateBlocked = (owner: SocialStateOwner) => attempted.has(keyOf(owner)) || unsettled.size > 0;

export function beginAdminSocialState(owner: SocialStateOwner, current: () => boolean, onRetire: () => void) {
  const captured = Object.freeze({ ...owner }), key = keyOf(captured), own: Own = { sent: false, finished: false, pending: 0, confirmed:false };
  const at = Date.now(), started = performance.now(), transport = fetch;
  let until = Math.min(at + 30000, captured.expiresAt);
  let retired = false, timer: ReturnType<typeof setTimeout> | undefined, rejectStop!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectStop = reject; }); void stopped.catch(() => {});
  const error = () => Error('Unconfirmed social state');
  const retire = () => { if (retired) return; retired = true; clearTimeout(timer); rejectStop(error()); onRetire(); };
  const check = () => { if (retired || !current() || Date.now() < at || Date.now() >= until || performance.now() < started || performance.now() >= started + 30000) { retire(); throw error(); } };
  const drained = () => { if (own.finished && own.pending === 0 && (!own.sent || own.confirmed)) unsettled.delete(own); };
  const wait = async <T,>(run: () => Promise<T>): Promise<T> => {
    check(); own.pending++;
    const pending = Promise.resolve().then(() => { check(); return run(); }).finally(() => { own.pending--; drained(); });
    void pending.catch(() => {});
    const value = await Promise.race([pending, stopped]); check(); return value;
  };
  timer = setTimeout(retire, Math.max(0, until - at));
  const original: Promise<SocialStateView> = (async () => {
    try {
      const uuid = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
      if (typeof captured.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(captured.id) || typeof captured.email !== 'string' || captured.email.length > 254
        || !/^\S+@\S+\.\S+$/.test(captured.email) || !uuid(captured.authSessionRef) || !Number.isSafeInteger(captured.expiresAt) || adminSocialStateBlocked(captured)) throw error();
      const readRef = crypto.randomUUID(); if (!uuid(readRef)) throw error();
      unsettled.add(own);
      const response = await wait(() => {
        own.sent = true;
        return transport('/api/admin/social', { method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { 'x-ytv-read-ref': readRef } });
      });
      // The selectors below can veto a stale/wrong projection only. This is data
      // from this original HTTP/body,never a full-review or recovery capability.
      if (response.status !== 200 || response.ok !== true || response.redirected !== false || response.headers.get('cache-control') !== 'no-store'
        || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw error();
      if (response.url) { const target = new URL(response.url); if (!globalThis.location?.origin || target.origin !== globalThis.location.origin
        || target.pathname !== '/api/admin/social' || target.search || target.hash || target.username || target.password) throw error(); }
      const length = response.headers.get('content-length'); if (length && (!/^\d+$/.test(length) || Number(length) > 1048576)) throw error();
      const reader = response.body?.getReader(); let raw = '';
      if (reader) {
        let bytes = 0, chunks = 0; const decoder = new TextDecoder('utf-8', { fatal: true });
        let pendingRead: ReturnType<typeof reader.read> | undefined;
        const read = async () => { const pending = reader.read(); pendingRead = pending; try { return await pending; } finally { if (pendingRead === pending) pendingRead = undefined; } };
        try { for (;;) { const part = await wait(read); if (part.done) break; bytes += part.value.byteLength; if (!Number.isSafeInteger(bytes) || bytes > 1048576 || ++chunks > 1024) throw error(); raw += decoder.decode(part.value, { stream: true }); } raw += decoder.decode(); }
        finally {
          const release = () => { try { reader.releaseLock(); } catch {} };
          if (pendingRead) void pendingRead.then(release, release); else release();
        }
      } else { raw = await wait(response.text.bind(response)); if (new TextEncoder().encode(raw).byteLength > 1048576) throw error(); }
      check(); const value: unknown = JSON.parse(raw); check();
      if (!object(value, ['posts','messages','status','quality','socialStateRead'])) throw error();
      const binding = value.socialStateRead;
      if (!object(binding, ['readRef','userId','email','sessionRef','asOf','expiresAt']) || binding.readRef !== readRef || binding.userId !== captured.id
        || binding.email !== captured.email || binding.sessionRef !== captured.authSessionRef || !integer(binding.asOf) || binding.asOf < at || binding.asOf > Date.now()
        || !integer(binding.expiresAt) || binding.expiresAt <= binding.asOf || binding.expiresAt - binding.asOf > 25000) throw error();
      until = Math.min(until, binding.expiresAt); check(); clearTimeout(timer);
      timer = setTimeout(retire, Math.max(0, Math.min(until - Date.now(), started + 30000 - performance.now())));
      const data = decodeSocialState(value); check(); const handle = Object.freeze({}) as SocialStateView; views.set(handle, { own, data }); own.confirmed=true; return handle;
    } catch { if(own.sent)attempted.add(key);retire();throw error(); }
    finally { own.finished = true; drained(); }
  })(); void original.catch(() => {});
  return Object.freeze({ original, retire, sent: () => own.sent,
    display(handle: SocialStateView | undefined | null): SocialStateData | null {
      try { check(); const entry = handle && views.get(handle); return entry?.own === own ? entry.data : null; } catch { return null; }
    } });
}
