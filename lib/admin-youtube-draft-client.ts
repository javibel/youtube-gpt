export type YoutubeDraftOwner=Readonly<{id:string;email:string;authSessionRef:string;expiresAt:number}>;
export type YoutubeDraftReadCoverage=Readonly<{pages:number;scanned:number;eligible:number;hasMore:boolean}>;
export type YoutubeDraftViewData=Readonly<{kind:'draft';author:string;publishedAt:string;sourceText:string;content:string;coverage:YoutubeDraftReadCoverage}>|Readonly<{kind:'no-eligible-source';coverage:YoutubeDraftReadCoverage}>;
declare const youtubeDraftView:unique symbol;
export type YoutubeDraftView={readonly[youtubeDraftView]:true};
const views=new WeakMap<object,{own:object;data:YoutubeDraftViewData}>();
const object=(value:unknown,keys:string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
const integer=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
function text(value:unknown,bytes:number):value is string{return typeof value==='string'&&new TextEncoder().encode(value).byteLength<=bytes&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)&&new TextDecoder('utf-8',{fatal:true}).decode(new TextEncoder().encode(value))===value;}
function readCoverage(value:unknown,positive:boolean):YoutubeDraftReadCoverage{
 if(!object(value,['pages','scanned','eligible','hasMore','coverage','acceptance'])||!integer(value.pages)||value.pages<1||value.pages>3
   ||!integer(value.scanned)||value.scanned>value.pages*20||!integer(value.eligible)||value.eligible>value.scanned
   ||(positive?value.eligible<1:value.eligible!==0)||typeof value.hasMore!=='boolean'||value.hasMore&&value.pages!==3
   ||value.coverage!=='at-most-three-pages-within-original-budget'||value.acceptance!=='read-scope-only-not-complete-review-reply-or-operative-acceptance')throw Error('Unconfirmed YouTube draft');
 return Object.freeze({pages:value.pages,scanned:value.scanned,eligible:value.eligible,hasMore:value.hasMore});
}
function noSourceData(value:Record<string,unknown>):YoutubeDraftViewData{
 const v=value.youtubeDraftUnavailable;
 if(!object(v,['platform','reason','pages','scanned','eligible','hasMore','coverage','acceptance'])||v.platform!=='youtube'||v.reason!=='no-eligible-source')throw Error('Unconfirmed YouTube draft');
 return Object.freeze({kind:'no-eligible-source',coverage:readCoverage({pages:v.pages,scanned:v.scanned,eligible:v.eligible,hasMore:v.hasMore,coverage:v.coverage,acceptance:v.acceptance},false)});
}
function draftData(value:Record<string,unknown>,asOf:number):YoutubeDraftViewData{
 const count=value.youtubeDraft,v=value.youtubeDraftView;
 const id=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=256&&!/[\s\x00-\x1f\x7f]/.test(v);
 const time=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(v)&&Number.isFinite(Date.parse(v))&&Date.parse(v)<=asOf;
 if(!object(count,['generated','platform','acceptance'])||count.generated!==1||count.platform!=='youtube'||count.acceptance!=='private-draft-only-no-reply-or-operative-acceptance'
 ||!object(v,['platform','source','content','acceptance'])||v.platform!=='youtube'||v.acceptance!=='private-draft-view-only-no-reply-or-operative-acceptance'||!object(v.source,['channelId','commentId','threadId','videoId','author','text','publishedAt','updatedAt'])
 ||typeof v.source.channelId!=='string'||!/^UC[A-Za-z0-9_-]{22}$/.test(v.source.channelId)||!id(v.source.commentId)||!id(v.source.threadId)||v.source.videoId!==null&&!id(v.source.videoId)
 ||!text(v.source.author,2051)||!v.source.author||Array.from(v.source.author).length>513||!text(v.source.text,40000)||!v.source.text.trim()||v.source.text.length>10000
 ||!time(v.source.publishedAt)||!time(v.source.updatedAt)||Date.parse(v.source.updatedAt)<Date.parse(v.source.publishedAt)
 ||!text(v.content,4096)||!v.content.trim()||v.content.length>2000||v.content.trim().split(/\s+/u).length>80||v.content.includes('\r'))throw Error('Unconfirmed YouTube draft');
 return Object.freeze({kind:'draft',author:v.source.author,publishedAt:v.source.publishedAt,sourceText:v.source.text,content:v.content,coverage:readCoverage(value.youtubeDraftCoverage,true)});
}

type Own = { sent: boolean; finished: boolean; pending: number };
const attempted = new Set<string>(), unsettled = new Set<Own>();
const keyOf = (owner: YoutubeDraftOwner) => JSON.stringify([owner.id, owner.email, owner.authSessionRef]);
// A negative exclusion only. It cannot recover authority, release a sent
// command or adopt a previous response on remount, ABA or another module realm.
export const adminYoutubeDraftBlocked = (owner: YoutubeDraftOwner) => attempted.has(keyOf(owner)) || unsettled.size > 0;

export function beginAdminYoutubeDraft(owner: YoutubeDraftOwner, current: () => boolean, onRetire: () => void) {
  const captured = Object.freeze({ ...owner }), key = keyOf(captured), own: Own = { sent: false, finished: false, pending: 0 };
  const at = Date.now(), started = performance.now(), transport = fetch;
  let until = Math.min(at + 65000, captured.expiresAt),deadline=started+Math.max(0,Math.min(65000,captured.expiresAt-at));
  let retired = false, timer: ReturnType<typeof setTimeout> | undefined, rejectStop!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectStop = reject; }); void stopped.catch(() => {});
  const error = () => Error('Unconfirmed YouTube draft');
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
  const original: Promise<YoutubeDraftView> = (async () => {
    try {
      const uuid = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
      if (typeof captured.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(captured.id) || typeof captured.email !== 'string' || captured.email.length > 254
        || !/^\S+@\S+\.\S+$/.test(captured.email) || !uuid(captured.authSessionRef) || !Number.isSafeInteger(captured.expiresAt) || adminYoutubeDraftBlocked(captured)) throw error();
      const command = crypto.randomUUID(); if (!uuid(command)) throw error();
      unsettled.add(own);
      const response = await wait(() => {
        own.sent = true; attempted.add(key);
        return transport('/api/agent/run', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { 'Content-Type': 'application/json', 'x-ytv-social-youtube-draft-command': command }, body: JSON.stringify({ action: 'messages-youtube-draft',platform:'youtube' }) });
      });
      // The selectors below can veto a stale/wrong projection only. This is data
      // from this original HTTP/body,never send,operative acceptance or recovery authority.
      if (response.status !== 503 || response.ok !== false || response.redirected !== false || response.headers.get('cache-control') !== 'no-store'
        || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw error();
      if (response.url) { const target = new URL(response.url); if (!globalThis.location?.origin || target.origin !== globalThis.location.origin
        || target.pathname !== '/api/agent/run' || target.search || target.hash || target.username || target.password) throw error(); }
      const length = response.headers.get('content-length'); if (length && (!/^\d+$/.test(length) || Number(length) > 65536)) throw error();
      const reader = response.body?.getReader(); let raw = '';
      if (reader) {
        let bytes = 0, chunks = 0; const decoder = new TextDecoder('utf-8', { fatal: true });
        let pendingRead: ReturnType<typeof reader.read> | undefined;
        const read = async () => { const pending = reader.read(); pendingRead = pending; try { return await pending; } finally { if (pendingRead === pending) pendingRead = undefined; } };
        try { for (;;) { const part = await wait(read); if (part.done) break; bytes += part.value.byteLength; if (!Number.isSafeInteger(bytes) || bytes > 65536 || ++chunks > 128) throw error(); raw += decoder.decode(part.value, { stream: true }); } raw += decoder.decode(); }
        finally {
          const release = () => { try { reader.releaseLock(); } catch {} };
          if (pendingRead) void pendingRead.then(release, release); else release();
        }
      } else { throw error(); }
      check(); const value: unknown = JSON.parse(raw); check();
      const noSource=!!value&&typeof value==='object'&&Object.hasOwn(value,'youtubeDraftUnavailable');
      if (!object(value,noSource?['ok','error','youtubeDraftUnavailable','youtubeDraftRead']:['ok','error','youtubeDraft','youtubeDraftView','youtubeDraftCoverage','youtubeDraftRead']) || value.ok !== false || value.error !== 'social_youtube_draft_unavailable') throw error();
      const binding = value.youtubeDraftRead;
      if (!object(binding, ['commandRef','userId','email','sessionRef','asOf','expiresAt']) || binding.commandRef !== command || binding.userId !== captured.id
        || binding.email !== captured.email || binding.sessionRef !== captured.authSessionRef || !integer(binding.asOf) || binding.asOf < at || binding.asOf > Date.now()
        || !integer(binding.expiresAt) || binding.expiresAt <= binding.asOf || binding.expiresAt - binding.asOf > 55000) throw error();
      until = Math.min(until, binding.expiresAt);deadline=Math.min(deadline,started+binding.expiresAt-at); check(); clearTimeout(timer);
      timer = setTimeout(retire, Math.max(0, Math.min(until - Date.now(), deadline - performance.now())));
      const data = noSource?noSourceData(value):draftData(value,binding.asOf); check(); const handle = Object.freeze({}) as YoutubeDraftView; views.set(handle, { own, data }); return handle;
    } catch { retire(); throw error(); }
    finally { own.finished = true; drained(); }
  })(); void original.catch(() => {});
  return Object.freeze({ original, retire, sent: () => own.sent,
    display(handle: YoutubeDraftView | undefined | null): YoutubeDraftViewData | null {
      try { check(); const entry = handle && views.get(handle); return entry?.own === own ? entry.data : null; } catch { return null; }
    } });
}
