export type SocialMessagesOwner = Readonly<{ id: string; email: string; authSessionRef: string; expiresAt: number }>;
export type SocialMessagesPartialData = Readonly<{ youtube: Readonly<{ status: 'unavailable' }> | Readonly<{ status: 'read-only'; pages: number; scanned: number; hasMore: boolean }>;
  gmail: Readonly<{ status: 'unavailable' }> | Readonly<{ status: 'read-only-metadata'; scanned: number; hasMore: boolean; text?:Readonly<{read:number;skipped:number}> }> }>;
declare const messagesPartialView: unique symbol;
export type SocialMessagesPartialView = { readonly [messagesPartialView]: true };
const views = new WeakMap<object, { own: object; data: SocialMessagesPartialData }>();
const object = (value: unknown, keys: string[]): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function partial(value: Record<string, unknown>): SocialMessagesPartialData {
  const youtube = value.youtube, gmail = value.gmail;
  let y: SocialMessagesPartialData['youtube'], g: SocialMessagesPartialData['gmail'];
  if (object(youtube, ['status']) && youtube.status === 'unavailable') y = Object.freeze({ status: 'unavailable' });
  else {
    if (!object(youtube, ['status','coverage']) || youtube.status !== 'read-only') throw Error('Unconfirmed social messages');
    const v = youtube.coverage;
    if (!object(v, ['configured','pages','scanned','eligible','hasMore','coverage','acceptance']) || v.configured !== true
      || !integer(v.pages) || v.pages < 1 || v.pages > 3 || !integer(v.scanned) || v.scanned > v.pages * 20
      || !integer(v.eligible) || v.eligible > v.scanned || typeof v.hasMore !== 'boolean' || v.hasMore && v.pages !== 3
      || v.coverage !== 'at-most-three-pages-within-original-budget' || v.acceptance !== 'read-only-not-reply-consent-or-operative-freshness') throw Error('Unconfirmed social messages');
    y = Object.freeze({ status: 'read-only', pages: v.pages, scanned: v.scanned, hasMore: v.hasMore });
  }
  if (object(gmail, ['status']) && gmail.status === 'unavailable') g = Object.freeze({ status: 'unavailable' });
  else {
    if (!object(gmail, ['status','coverage']) || gmail.status !== 'read-only-metadata') throw Error('Unconfirmed social messages');
    const v = gmail.coverage;
    if (!object(v, ['configured','pages','scanned','hasMore','coverage','content','acceptance']) || v.configured !== true || v.pages !== 1
      || !integer(v.scanned) || v.scanned > 10 || typeof v.hasMore !== 'boolean' || v.coverage !== 'at-most-ten-unread-inbox-messages-one-list-page'
      || v.content !== 'selected-headers-only-no-body-or-attachments' || v.acceptance !== 'read-only-not-draft-send-consent-or-operative-freshness') throw Error('Unconfirmed social messages');
    g = Object.freeze({ status: 'read-only-metadata', scanned: v.scanned, hasMore: v.hasMore });
  }
  if(Object.hasOwn(value,'gmailText')){
    const t=value.gmailText;
    if(g.status!=='read-only-metadata'||!object(t,['configured','read','skipped','coverage','content','acceptance'])||t.configured!==true
      ||!integer(t.read)||!integer(t.skipped)||t.read+t.skipped!==g.scanned||t.read+t.skipped>10
      ||t.coverage!=='at-most-ten-root-or-uniform-plain-mixed-messages'||t.content!=='utf8-or-ascii-plain-mixed-no-html-alternatives-or-attachments'
      ||t.acceptance!=='data-only-not-draft-send-consent-or-operative-freshness')throw Error('Unconfirmed social messages');
    g=Object.freeze({...g,text:Object.freeze({read:t.read,skipped:t.skipped})});
  }
  if (y.status === 'unavailable' && g.status === 'unavailable') throw Error('Unconfirmed social messages');
  return Object.freeze({ youtube: y, gmail: g });
}
type Own = { sent: boolean; finished: boolean; pending: number };
const attempted = new Set<string>(), unsettled = new Set<Own>();
const keyOf = (owner: SocialMessagesOwner) => JSON.stringify([owner.id, owner.email, owner.authSessionRef]);
// A negative exclusion only. It cannot recover authority, release a sent
// command or adopt a previous response on remount, ABA or another module realm.
export const adminSocialMessagesBlocked = (owner: SocialMessagesOwner) => attempted.has(keyOf(owner)) || unsettled.size > 0;

export function beginAdminSocialMessages(owner: SocialMessagesOwner, current: () => boolean, onRetire: () => void) {
  const captured = Object.freeze({ ...owner }), key = keyOf(captured), own: Own = { sent: false, finished: false, pending: 0 };
  const at = Date.now(), started = performance.now(), transport = fetch;
  let until = Math.min(at + 65000, captured.expiresAt);
  let retired = false, timer: ReturnType<typeof setTimeout> | undefined, rejectStop!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectStop = reject; }); void stopped.catch(() => {});
  const error = () => Error('Unconfirmed social messages');
  const retire = () => { if (retired) return; retired = true; clearTimeout(timer); rejectStop(error()); onRetire(); };
  const check = () => { if (retired || !current() || Date.now() < at || Date.now() >= until || performance.now() < started || performance.now() >= started + 65000) { retire(); throw error(); } };
  const drained = () => { if (own.finished && own.pending === 0) unsettled.delete(own); };
  const wait = async <T,>(run: () => Promise<T>): Promise<T> => {
    check(); own.pending++;
    const pending = Promise.resolve().then(() => { check(); return run(); }).finally(() => { own.pending--; drained(); });
    void pending.catch(() => {});
    const value = await Promise.race([pending, stopped]); check(); return value;
  };
  timer = setTimeout(retire, Math.max(0, until - at));
  const original: Promise<SocialMessagesPartialView> = (async () => {
    try {
      const uuid = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
      if (typeof captured.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(captured.id) || typeof captured.email !== 'string' || captured.email.length > 254
        || !/^\S+@\S+\.\S+$/.test(captured.email) || !uuid(captured.authSessionRef) || !Number.isSafeInteger(captured.expiresAt) || adminSocialMessagesBlocked(captured)) throw error();
      const command = crypto.randomUUID(); if (!uuid(command)) throw error();
      unsettled.add(own);
      const response = await wait(() => {
        own.sent = true; attempted.add(key);
        return transport('/api/agent/run', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { 'Content-Type': 'application/json', 'x-ytv-social-messages-command': command }, body: JSON.stringify({ action: 'messages' }) });
      });
      // The selectors below can veto a stale/wrong projection only. This is data
      // from this original HTTP/body,never a full-review or recovery capability.
      if (response.status !== 503 || response.ok !== false || response.redirected !== false || response.headers.get('cache-control') !== 'no-store'
        || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw error();
      if (response.url) { const target = new URL(response.url); if (!globalThis.location?.origin || target.origin !== globalThis.location.origin
        || target.pathname !== '/api/agent/run' || target.search || target.hash || target.username || target.password) throw error(); }
      const length = response.headers.get('content-length'); if (length && (!/^\d+$/.test(length) || Number(length) > 8192)) throw error();
      const reader = response.body?.getReader(); let raw = '';
      if (reader) {
        let bytes = 0, chunks = 0; const decoder = new TextDecoder('utf-8', { fatal: true });
        let pendingRead: ReturnType<typeof reader.read> | undefined;
        const read = async () => { const pending = reader.read(); pendingRead = pending; try { return await pending; } finally { if (pendingRead === pending) pendingRead = undefined; } };
        try { for (;;) { const part = await wait(read); if (part.done) break; bytes += part.value.byteLength; if (!Number.isSafeInteger(bytes) || bytes > 8192 || ++chunks > 32) throw error(); raw += decoder.decode(part.value, { stream: true }); } raw += decoder.decode(); }
        finally {
          const release = () => { try { reader.releaseLock(); } catch {} };
          if (pendingRead) void pendingRead.then(release, release); else release();
        }
      } else { raw = await wait(response.text.bind(response)); if (new TextEncoder().encode(raw).byteLength > 8192) throw error(); }
      check(); const value: unknown = JSON.parse(raw); check();
      if (!object(value, ['ok','error','youtube','gmail','messagesRead',...(value&&typeof value==='object'&&Object.hasOwn(value,'gmailText')?['gmailText']:[])]) || value.ok !== false || value.error !== 'social_messages_unavailable') throw error();
      const binding = value.messagesRead;
      if (!object(binding, ['commandRef','userId','email','sessionRef','asOf','expiresAt']) || binding.commandRef !== command || binding.userId !== captured.id
        || binding.email !== captured.email || binding.sessionRef !== captured.authSessionRef || !integer(binding.asOf) || binding.asOf < at || binding.asOf > Date.now()
        || !integer(binding.expiresAt) || binding.expiresAt <= binding.asOf || binding.expiresAt - binding.asOf > 55000) throw error();
      until = Math.min(until, binding.expiresAt); check(); clearTimeout(timer);
      timer = setTimeout(retire, Math.max(0, Math.min(until - Date.now(), started + 65000 - performance.now())));
      const data = partial(value); check(); const handle = Object.freeze({}) as SocialMessagesPartialView; views.set(handle, { own, data }); return handle;
    } catch { retire(); throw error(); }
    finally { own.finished = true; drained(); }
  })(); void original.catch(() => {});
  return Object.freeze({ original, retire, sent: () => own.sent,
    display(handle: SocialMessagesPartialView | undefined | null): SocialMessagesPartialData | null {
      try { check(); const entry = handle && views.get(handle); return entry?.own === own ? entry.data : null; } catch { return null; }
    } });
}
