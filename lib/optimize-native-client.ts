import { command, input as parseInput, result, object, sameDraft, requestInput, type Input, type Result } from '@/lib/optimize-native-contract';
import { optimizeSaveBlocked as legacyBlocked, anyUnconfirmedOptimizeSave } from '@/lib/optimize-save-client';
export type OptimizeNativeOwner = Readonly<{ id: string; email: string; sessionRef: string; expiresAt: number }>;
declare const videoReviewReceipt: unique symbol;
export type OptimizeNativeReceipt = { readonly [videoReviewReceipt]: true };
const receipts = new WeakMap<object, { owner: object; data: Result }>();
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const pendingUsers = new Map<string, object>(), deniedUsers = new Set<string>();
export function optimizeNativeBlocked(owner:OptimizeNativeOwner,videoId:string) {const key=JSON.stringify([owner.id,videoId]);try{return deniedUsers.has(key)||pendingUsers.has(key)||sessionStorage.getItem('ytubviral:optimize-native:'+key)!==null||legacyBlocked({userId:owner.id,email:owner.email},videoId)||anyUnconfirmedOptimizeSave(owner.id,videoId);}catch{return true;}}
// Display accepts only this original HTTP response. Client session fields and
// JSON never authorize server/provider work or recover a missing response.
export function beginOptimizeNative(owner: OptimizeNativeOwner, method:'GET'|'POST'|'PUT', candidate: Input, current: () => boolean, onRetire: () => void) {
  const own = {}, captured = Object.freeze({ ...owner }), selected = parseInput(method==='GET'?{lang:candidate.lang,videoId:candidate.videoId}:method==='POST'?{lang:candidate.lang,draft:candidate.draft}:{lang:candidate.lang,draft:candidate.draft,original:candidate.original,categoryId:candidate.categoryId,advice:candidate.advice},method), controller = new AbortController();
  const marker=JSON.stringify([captured.id,selected.videoId]), storageKey='ytubviral:optimize-native:'+marker;
  const startedAt = Date.now(), deadline = performance.now() + 55000;
  let admitted = false, retired = false, completed = false, rejectStop!: (error: Error) => void, timer: ReturnType<typeof setTimeout> | undefined;
  const stopped = new Promise<never>((_, reject) => { rejectStop = reject; }); void stopped.catch(() => {});
  const retire = () => { if (retired) return; retired = true; if (admitted && !completed) deniedUsers.add(marker); controller.abort(); clearTimeout(timer); rejectStop(Error('optimize_unconfirmed')); onRetire(); };
  const check = () => {
    if (retired || !current() || Date.now() < startedAt || Date.now() >= captured.expiresAt
      || !completed && (performance.now() >= deadline || Date.now() >= startedAt + 55000)) { retire(); throw Error('optimize_unconfirmed'); }
  };
  const wait = async <T>(action: () => Promise<T>) => {
    check(); const pending = Promise.resolve().then(() => { check(); return action(); }); void pending.catch(() => {});
    const v = await Promise.race([pending, stopped]); check(); return v;
  };
  timer = setTimeout(retire, Math.max(0, Math.min(startedAt + 55000, captured.expiresAt) - startedAt));
  const original = (async () => { try {
    if(method==='PUT'){if(optimizeNativeBlocked(captured,selected.videoId!))throw Error('previous_publication_unconfirmed');pendingUsers.set(marker,own);admitted=true;sessionStorage.setItem(storageKey,'pending');}
    const commandRef = crypto.randomUUID();
    if (!command(commandRef) || !command(captured.sessionRef) || !/^[A-Za-z0-9_-]{1,128}$/.test(captured.id)
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(captured.email) || !count(captured.expiresAt)) throw Error('optimize_unconfirmed');
    const response = await wait(() => fetch('/api/youtube/optimize'+(method==='GET'?'?lang='+selected.lang+(selected.videoId?'&videoId='+selected.videoId:''):''), { method, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': commandRef }, ...(method==='GET'?{}:{body:JSON.stringify(method==='POST'?{lang:selected.lang,draft:selected.draft}:{lang:selected.lang,draft:selected.draft,original:selected.original,categoryId:selected.categoryId,advice:selected.advice})}), signal: controller.signal }));
    if (response.redirected || response.headers.get('cache-control') !== 'no-store') throw Error('optimize_unconfirmed');
    if (!response.body) throw Error('optimize_unconfirmed');
    const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
    let text = '', bytes = 0;
    try { for (;;) { const part = await wait(() => reader.read()); if (part.done) break;
      bytes += part.value.byteLength; if (bytes > 4194304) throw Error('optimize_unconfirmed'); text += decoder.decode(part.value, { stream: true });
    } text += decoder.decode(); } finally { void reader.cancel().catch(() => {}); }
    const parsed = JSON.parse(text);
    if (response.status !== 200 || !response.ok) {
      const error = object(parsed), allowed = ['pro_required', 'youtube_not_connected', 'token_expired'];
      throw Error(typeof error.error === 'string' && allowed.includes(error.error) ? error.error : 'optimize_unconfirmed');
    }
    const data = result(parsed), ack = data.analysis;
    if (ack.commandRef !== commandRef || ack.userId !== captured.id || ack.email !== captured.email || ack.sessionRef !== captured.sessionRef || ack.lang !== selected.lang
      || !count(ack.asOf) || ack.asOf < startedAt || ack.asOf > Date.now() || !count(ack.expiresAt) || ack.expiresAt <= Date.now() || ack.expiresAt - ack.asOf > 55000
      || JSON.stringify(data.request)!==JSON.stringify(requestInput(selected,method)) || ack.videoId !== selected.videoId || ack.method !== method || method!=='GET' && (!data.draft || !sameDraft(data.draft,selected.draft!))) throw Error('optimize_unconfirmed');
    check();
    if(method==='PUT'){try{if(pendingUsers.get(marker)!==own)throw Error('optimize_unconfirmed');sessionStorage.removeItem(storageKey);pendingUsers.delete(marker);}catch{deniedUsers.add(marker);}}
    completed = true; clearTimeout(timer); timer = setTimeout(retire, Math.max(0, captured.expiresAt - Date.now()));
    const freeze = (v: unknown): void => { if (v && typeof v === 'object') { for (const child of Object.values(v)) freeze(child); Object.freeze(v); } };
    freeze(data);
    const receipt = Object.freeze({}) as OptimizeNativeReceipt; receipts.set(receipt, { owner: own, data }); return receipt;
  } catch (error) { retire(); throw error; } })(); void original.catch(() => {});
  return Object.freeze({ original, retire, read(receipt: OptimizeNativeReceipt | null) {
    try { check(); const value = receipt && receipts.get(receipt); return completed && value && value.owner === own ? value.data : null; } catch { return null; }
  } });
}
