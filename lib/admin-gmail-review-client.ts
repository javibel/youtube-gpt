import type {GmailTextExclusions} from '@/lib/agent/gmail-metadata-original';
export type GmailReviewOwner=Readonly<{id:string;email:string;authSessionRef:string;expiresAt:number}>;
export type GmailReviewData=Readonly<{scanned:number;read:number;skipped:number;hasMore:boolean;exclusions:GmailTextExclusions;messages:readonly Readonly<{from:string;subject:string;text:string}>[]}>;
declare const gmailReviewView:unique symbol;
export type GmailReviewView={readonly[gmailReviewView]:true};
const views=new WeakMap<object,{own:object;data:GmailReviewData}>();
const object=(value:unknown,keys:string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
const integer=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
function text(value:unknown,bytes:number):value is string{return typeof value==='string'&&new TextEncoder().encode(value).byteLength<=bytes&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)&&new TextDecoder('utf-8',{fatal:true}).decode(new TextEncoder().encode(value))===value;}
function reviewData(v:unknown):GmailReviewData{
 const keys=['attachment','alternative','html','otherMime','encoding','structure'];
 if(!object(v,['scanned','read','skipped','hasMore','exclusions','messages','coverage','acceptance'])||!integer(v.scanned)||v.scanned>10||!integer(v.read)||!integer(v.skipped)||v.read+v.skipped!==v.scanned
  ||typeof v.hasMore!=='boolean'||v.coverage!=='at-most-ten-root-or-uniform-plain-mixed-messages'||v.acceptance!=='private-read-only-not-draft-send-or-operative-acceptance'
  ||!object(v.exclusions,keys)||!Array.isArray(v.messages)||v.messages.length!==v.read)throw Error('Unconfirmed Gmail review');
 const e=v.exclusions;if(!Object.values(e).every(integer)||Object.values(e).reduce<number>((sum,n)=>sum+(n as number),0)!==v.skipped)throw Error('Unconfirmed Gmail review');
 const exclusions:GmailTextExclusions=Object.freeze({attachment:e.attachment as number,alternative:e.alternative as number,html:e.html as number,otherMime:e.otherMime as number,encoding:e.encoding as number,structure:e.structure as number});
 let bytes=0;const messages=v.messages.map(m=>{
  if(!object(m,['from','subject','text'])||!text(m.from,2051)||!m.from||Array.from(m.from).length>513||/[\r\n\t]/.test(m.from)||!text(m.subject,2051)||Array.from(m.subject).length>513||/[\r\n\t]/.test(m.subject)||!text(m.text,16384))throw Error('Unconfirmed Gmail review');
  bytes+=new TextEncoder().encode(m.text).byteLength;if(bytes>65536)throw Error('Unconfirmed Gmail review');return Object.freeze({from:m.from,subject:m.subject,text:m.text});
 });
 return Object.freeze({scanned:v.scanned,read:v.read,skipped:v.skipped,hasMore:v.hasMore,exclusions,messages:Object.freeze(messages)});
}
type Own = { sent: boolean; finished: boolean; pending: number };
const attempted = new Set<string>(), unsettled = new Set<Own>();
const keyOf = (owner: GmailReviewOwner) => JSON.stringify([owner.id, owner.email, owner.authSessionRef]);
// A negative exclusion only. It cannot recover authority, release a sent
// command or adopt a previous response on remount, ABA or another module realm.
export const adminGmailReviewBlocked = (owner: GmailReviewOwner) => attempted.has(keyOf(owner)) || unsettled.size > 0;

export function beginAdminGmailReview(owner: GmailReviewOwner, current: () => boolean, onRetire: () => void) {
  const captured = Object.freeze({ ...owner }), key = keyOf(captured), own: Own = { sent: false, finished: false, pending: 0 };
  const at = Date.now(), started = performance.now(), transport = fetch;
  let until = Math.min(at + 65000, captured.expiresAt),deadline=started+Math.max(0,Math.min(65000,captured.expiresAt-at));
  let retired = false, timer: ReturnType<typeof setTimeout> | undefined, rejectStop!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectStop = reject; }); void stopped.catch(() => {});
  const error = () => Error('Unconfirmed Gmail review');
  const retire = () => { if (retired) return; retired = true; clearTimeout(timer); rejectStop(error()); onRetire(); };
  const check = () => { if (retired || !current() || Date.now() < at || Date.now() >= until || performance.now() < started || performance.now() >= deadline) { retire(); throw error(); } };
  const drained = () => { if (own.finished && own.pending === 0) unsettled.delete(own); };
  const wait = async <T,>(run: () => Promise<T>): Promise<T> => {
    check(); own.pending++;
    const pending = Promise.resolve().then(() => { check(); return run(); }).finally(() => { own.pending--; drained(); });
    void pending.catch(() => {});
    const value = await Promise.race([pending, stopped]); check(); return value;
  };
  timer = setTimeout(retire, Math.max(0, until - at));
  const original: Promise<GmailReviewView> = (async () => {
    try {
      const uuid = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
      if (typeof captured.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(captured.id) || typeof captured.email !== 'string' || captured.email.length > 254
        || !/^\S+@\S+\.\S+$/.test(captured.email) || !uuid(captured.authSessionRef) || !Number.isSafeInteger(captured.expiresAt) || adminGmailReviewBlocked(captured)) throw error();
      const command = crypto.randomUUID(); if (!uuid(command)) throw error();
      unsettled.add(own);
      const response = await wait(() => {
        own.sent = true; attempted.add(key);
        return transport('/api/agent/run', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { 'Content-Type': 'application/json', 'x-ytv-social-gmail-review-command': command }, body: JSON.stringify({ action: 'messages-gmail-review',platform:'gmail' }) });
      });
      // The selectors below can veto a stale/wrong projection only. This is data
      // from this original HTTP/body,never send,operative acceptance or recovery authority.
      if (response.status !== 503 || response.ok !== false || response.redirected !== false || response.headers.get('cache-control') !== 'no-store'
        || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw error();
      if (response.url) { const target = new URL(response.url); if (!globalThis.location?.origin || target.origin !== globalThis.location.origin
        || target.pathname !== '/api/agent/run' || target.search || target.hash || target.username || target.password) throw error(); }
      const length = response.headers.get('content-length'); if (length && (!/^\d+$/.test(length) || Number(length) > 196608)) throw error();
      const reader = response.body?.getReader(); let raw = '';
      if (reader) {
        let bytes = 0, chunks = 0; const decoder = new TextDecoder('utf-8', { fatal: true });
        let pendingRead: ReturnType<typeof reader.read> | undefined;
        const read = async () => { const pending = reader.read(); pendingRead = pending; try { return await pending; } finally { if (pendingRead === pending) pendingRead = undefined; } };
        try { for (;;) { const part = await wait(read); if (part.done) break; bytes += part.value.byteLength; if (!Number.isSafeInteger(bytes) || bytes > 196608 || ++chunks > 256) throw error(); raw += decoder.decode(part.value, { stream: true }); } raw += decoder.decode(); }
        finally {
          const release = () => { try { reader.releaseLock(); } catch {} };
          if (pendingRead) void pendingRead.then(release, release); else release();
        }
      } else { throw error(); }
      check(); const value: unknown = JSON.parse(raw); check();
      if(!object(value,['ok','error','gmailReview','gmailReviewRead'])||value.ok!==false||value.error!=='social_gmail_review_unavailable')throw error();
      const binding = value.gmailReviewRead;
      if (!object(binding, ['commandRef','userId','email','sessionRef','asOf','expiresAt']) || binding.commandRef !== command || binding.userId !== captured.id
        || binding.email !== captured.email || binding.sessionRef !== captured.authSessionRef || !integer(binding.asOf) || binding.asOf < at || binding.asOf > Date.now()
        || !integer(binding.expiresAt) || binding.expiresAt <= binding.asOf || binding.expiresAt - binding.asOf > 55000) throw error();
      until = Math.min(until, binding.expiresAt);deadline=Math.min(deadline,started+binding.expiresAt-at); check(); clearTimeout(timer);
      timer = setTimeout(retire, Math.max(0, Math.min(until - Date.now(), deadline - performance.now())));
      const data = reviewData(value.gmailReview); check(); const handle = Object.freeze({}) as GmailReviewView; views.set(handle, { own, data }); return handle;
    } catch { retire(); throw error(); }
    finally { own.finished = true; drained(); }
  })(); void original.catch(() => {});
  return Object.freeze({ original, retire, sent: () => own.sent,
    display(handle: GmailReviewView | undefined | null): GmailReviewData | null {
      try { check(); const entry = handle && views.get(handle); return entry?.own === own ? entry.data : null; } catch { return null; }
    } });
}
