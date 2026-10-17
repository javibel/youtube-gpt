export type YoutubeReviewOwner=Readonly<{id:string;email:string;authSessionRef:string;expiresAt:number}>;
export type YoutubeReviewData=Readonly<{pages:number;scanned:number;eligible:number;hasMore:boolean;comments:readonly Readonly<{author:string;text:string}>[]}>;
declare const youtubeReviewView:unique symbol;
export type YoutubeReviewView={readonly[youtubeReviewView]:true};
const views=new WeakMap<object,{own:object;data:YoutubeReviewData}>();
const object=(value:unknown,keys:string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
const integer=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
function text(value:unknown,bytes:number):value is string{return typeof value==='string'&&value.length>0&&new TextEncoder().encode(value).byteLength<=bytes&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)&&new TextDecoder('utf-8',{fatal:true}).decode(new TextEncoder().encode(value))===value;}
function reviewData(v:unknown):YoutubeReviewData{
 if(!object(v,['pages','scanned','eligible','hasMore','comments','coverage','acceptance'])||!integer(v.pages)||v.pages<1||v.pages>3||!integer(v.scanned)||v.scanned>v.pages*20||!integer(v.eligible)||v.eligible>v.scanned
  ||typeof v.hasMore!=='boolean'||v.hasMore&&v.pages!==3||v.coverage!=='at-most-three-pages-within-original-budget'||v.acceptance!=='private-read-only-not-draft-reply-or-operative-acceptance'
  ||!Array.isArray(v.comments)||v.comments.length!==v.eligible)throw Error('Unconfirmed YouTube review');
 const comments=v.comments.map(m=>{if(!object(m,['author','text'])||!text(m.author,2051)||Array.from(m.author).length>513||/[\r\n\t]/.test(m.author)||!text(m.text,40000)||m.text.length>10000)throw Error('Unconfirmed YouTube review');return Object.freeze({author:m.author,text:m.text});});
 return Object.freeze({pages:v.pages,scanned:v.scanned,eligible:v.eligible,hasMore:v.hasMore,comments:Object.freeze(comments)});
}

type Own = { sent: boolean; finished: boolean; pending: number };
const attempted = new Set<string>(), unsettled = new Set<Own>();
const keyOf = (owner: YoutubeReviewOwner) => JSON.stringify([owner.id, owner.email, owner.authSessionRef]);
// A negative exclusion only. It cannot recover authority, release a sent
// command or adopt a previous response on remount, ABA or another module realm.
export const adminYoutubeReviewBlocked = (owner: YoutubeReviewOwner) => attempted.has(keyOf(owner)) || unsettled.size > 0;

export function beginAdminYoutubeReview(owner: YoutubeReviewOwner, current: () => boolean, onRetire: () => void) {
  const captured = Object.freeze({ ...owner }), key = keyOf(captured), own: Own = { sent: false, finished: false, pending: 0 };
  const at = Date.now(), started = performance.now(), transport = fetch;
  let until = Math.min(at + 65000, captured.expiresAt),deadline=started+Math.max(0,Math.min(65000,captured.expiresAt-at));
  let retired = false, timer: ReturnType<typeof setTimeout> | undefined, rejectStop!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectStop = reject; }); void stopped.catch(() => {});
  const error = () => Error('Unconfirmed YouTube review');
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
  const original: Promise<YoutubeReviewView> = (async () => {
    try {
      const uuid = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
      if (typeof captured.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(captured.id) || typeof captured.email !== 'string' || captured.email.length > 254
        || !/^\S+@\S+\.\S+$/.test(captured.email) || !uuid(captured.authSessionRef) || !Number.isSafeInteger(captured.expiresAt) || adminYoutubeReviewBlocked(captured)) throw error();
      const command = crypto.randomUUID(); if (!uuid(command)) throw error();
      unsettled.add(own);
      const response = await wait(() => {
        own.sent = true; attempted.add(key);
        return transport('/api/agent/run', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { 'Content-Type': 'application/json', 'x-ytv-social-youtube-review-command': command }, body: JSON.stringify({ action: 'messages-youtube-review',platform:'youtube' }) });
      });
      // The selectors below can veto a stale/wrong projection only. This is data
      // from this original HTTP/body,never send,operative acceptance or recovery authority.
      if (response.status !== 503 || response.ok !== false || response.redirected !== false || response.headers.get('cache-control') !== 'no-store'
        || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw error();
      if (response.url) { const target = new URL(response.url); if (!globalThis.location?.origin || target.origin !== globalThis.location.origin
        || target.pathname !== '/api/agent/run' || target.search || target.hash || target.username || target.password) throw error(); }
      const length = response.headers.get('content-length'); if (length && (!/^\d+$/.test(length) || Number(length) > 3145728)) throw error();
      const reader = response.body?.getReader(); let raw = '';
      if (reader) {
        let bytes = 0, chunks = 0; const decoder = new TextDecoder('utf-8', { fatal: true });
        let pendingRead: ReturnType<typeof reader.read> | undefined;
        const read = async () => { const pending = reader.read(); pendingRead = pending; try { return await pending; } finally { if (pendingRead === pending) pendingRead = undefined; } };
        try { for (;;) { const part = await wait(read); if (part.done) break; bytes += part.value.byteLength; if (!Number.isSafeInteger(bytes) || bytes > 3145728 || ++chunks > 256) throw error(); raw += decoder.decode(part.value, { stream: true }); } raw += decoder.decode(); }
        finally {
          const release = () => { try { reader.releaseLock(); } catch {} };
          if (pendingRead) void pendingRead.then(release, release); else release();
        }
      } else { throw error(); }
      check(); const value: unknown = JSON.parse(raw); check();
      if(!object(value,['ok','error','youtubeReview','youtubeReviewRead'])||value.ok!==false||value.error!=='social_youtube_review_unavailable')throw error();
      const binding = value.youtubeReviewRead;
      if (!object(binding, ['commandRef','userId','email','sessionRef','asOf','expiresAt']) || binding.commandRef !== command || binding.userId !== captured.id
        || binding.email !== captured.email || binding.sessionRef !== captured.authSessionRef || !integer(binding.asOf) || binding.asOf < at || binding.asOf > Date.now()
        || !integer(binding.expiresAt) || binding.expiresAt <= binding.asOf || binding.expiresAt - binding.asOf > 55000) throw error();
      until = Math.min(until, binding.expiresAt);deadline=Math.min(deadline,started+binding.expiresAt-at); check(); clearTimeout(timer);
      timer = setTimeout(retire, Math.max(0, Math.min(until - Date.now(), deadline - performance.now())));
      const data = reviewData(value.youtubeReview); check(); const handle = Object.freeze({}) as YoutubeReviewView; views.set(handle, { own, data }); return handle;
    } catch { retire(); throw error(); }
    finally { own.finished = true; drained(); }
  })(); void original.catch(() => {});
  return Object.freeze({ original, retire, sent: () => own.sent,
    display(handle: YoutubeReviewView | undefined | null): YoutubeReviewData | null {
      try { check(); const entry = handle && views.get(handle); return entry?.own === own ? entry.data : null; } catch { return null; }
    } });
}
