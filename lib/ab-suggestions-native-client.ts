import { abNativeSuggestionInput,abSuggestedVariants } from '@/lib/ab-suggestions-contract';
import { anyUnconfirmedAbSuggestionsForUser } from '@/lib/use-ab-suggestions';
const command=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
type AbNativeSuggestionInput=ReturnType<typeof abNativeSuggestionInput>;
type AbNativeSuggestionResult={request:AbNativeSuggestionInput;variants:ReturnType<typeof abSuggestedVariants>;analysis:{commandRef:string;userId:string;email:string;sessionRef:string;sessionExpiresAt:number;lang:'es'|'en';videoId:string;channelId:string;asOf:number;expiresAt:number;sourceOwnership:'matched-native-channel';quality:'untested-editorial-alternatives'}};
export type AbNativeSuggestionOwner = Readonly<{ id: string; email: string; sessionRef: string; expiresAt: number }>;
declare const abNativeSuggestionReceipt: unique symbol;
export type AbNativeSuggestionReceipt = { readonly [abNativeSuggestionReceipt]: true };
const receipts = new WeakMap<object, { owner: object; data: AbNativeSuggestionResult }>();
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const parseInput=abNativeSuggestionInput;
const pendingUsers = new Map<string, object>(), deniedUsers = new Set<string>();
export function abNativeSuggestionsBlocked(id:string,_email:string){try{if(anyUnconfirmedAbSuggestionsForUser(id)||!pendingUsers.has(id)&&sessionStorage.getItem('ytubviral:ab-native-suggestions:'+JSON.stringify([id]))!==null)deniedUsers.add(id);return deniedUsers.has(id)||pendingUsers.has(id);}catch{return true;}}
// Display accepts only this original HTTP response. Client session fields and
// JSON never authorize server/provider work or recover a missing response.
export function beginAbNativeSuggestion(owner: AbNativeSuggestionOwner, candidate: AbNativeSuggestionInput, current: () => boolean, onRetire: () => void) {
  const own = {}, captured = Object.freeze({ ...owner }), input = parseInput(candidate), controller = new AbortController();
  const startedAt = Date.now(), deadline = performance.now() + 55000,account=captured.id;
  let displayExpiresAt=captured.expiresAt;
  let admitted = false, retired = false, completed = false, rejectStop!: (error: Error) => void, timer: ReturnType<typeof setTimeout> | undefined;
  const stopped = new Promise<never>((_, reject) => { rejectStop = reject; }); void stopped.catch(() => {});
  const retire = () => { if (retired) return; retired = true; if (admitted && !completed) deniedUsers.add(account); controller.abort(); clearTimeout(timer); rejectStop(Error('ab_suggestions_unconfirmed')); onRetire(); };
  const check = () => {
    if (retired || !current() || Date.now() < startedAt || Date.now() >= displayExpiresAt
      || !completed && (performance.now() >= deadline || Date.now() >= startedAt + 55000)) { retire(); throw Error('ab_suggestions_unconfirmed'); }
  };
  const wait = async <T,>(action: () => Promise<T>) => {
    check(); const pending = Promise.resolve().then(() => { check(); return action(); }); void pending.catch(() => {});
    const v = await Promise.race([pending, stopped]); check(); return v;
  };
  timer = setTimeout(retire, Math.max(0, Math.min(startedAt + 55000, captured.expiresAt) - startedAt));
  const original = (async () => { try {
    if (abNativeSuggestionsBlocked(captured.id,captured.email)) throw Error('previous_analysis_unconfirmed');
    pendingUsers.set(account, own); admitted = true;
    const storageKey = 'ytubviral:ab-native-suggestions:'+JSON.stringify([account]); sessionStorage.setItem(storageKey, 'pending');
    const commandRef = crypto.randomUUID();
    if (!command(commandRef) || !command(captured.sessionRef) || !/^[A-Za-z0-9_-]{1,128}$/.test(captured.id)
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(captured.email) || !count(captured.expiresAt)) throw Error('ab_suggestions_unconfirmed');
    const response = await wait(() => fetch('/api/youtube/ab-test/suggest', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': commandRef }, body: JSON.stringify(input), signal: controller.signal }));
    if (response.redirected || response.headers.get('cache-control') !== 'no-store') throw Error('ab_suggestions_unconfirmed');
    if (!response.body) throw Error('ab_suggestions_unconfirmed');
    const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
    let text = '', bytes = 0;
    if(!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''))throw Error('ab_suggestions_unconfirmed');
    try { for (;;) { const part = await wait(() => reader.read()); if (part.done) break;
      bytes += part.value.byteLength; if (bytes > 262144) throw Error('ab_suggestions_unconfirmed'); text += decoder.decode(part.value, { stream: true });
    } text += decoder.decode(); } finally { void reader.cancel().catch(() => {}); }
    const parsed = JSON.parse(text);
    if(response.status!==200||!response.ok||!exact(parsed,['request','variants','analysis']))throw Error('ab_suggestions_unconfirmed');
    const selected=abNativeSuggestionInput(parsed.request),ack=parsed.analysis;
    if(JSON.stringify(selected)!==JSON.stringify(input)||!exact(ack,['commandRef','userId','email','sessionRef','sessionExpiresAt','lang','videoId','channelId','asOf','expiresAt','sourceOwnership','quality'])
      ||ack.commandRef!==commandRef||ack.userId!==captured.id||ack.email!==captured.email||ack.sessionRef!==captured.sessionRef||ack.lang!==input.lang||ack.videoId!==input.videoId||ack.channelId!==input.channelId
      ||!count(ack.asOf)||ack.asOf<startedAt||ack.asOf>Date.now()||!count(ack.expiresAt)||ack.expiresAt<=Date.now()||ack.expiresAt-ack.asOf>55000||!count(ack.sessionExpiresAt)||ack.sessionExpiresAt<ack.expiresAt||ack.sourceOwnership!=='matched-native-channel'||ack.quality!=='untested-editorial-alternatives')throw Error('ab_suggestions_unconfirmed');
    const data:AbNativeSuggestionResult={request:selected,variants:abSuggestedVariants(parsed.variants,input.title),analysis:ack as AbNativeSuggestionResult['analysis']};check();
    try{if(pendingUsers.get(account)!==own)throw Error('ab_suggestions_unconfirmed');sessionStorage.removeItem(storageKey);pendingUsers.delete(account);}catch{deniedUsers.add(account);}
    // HTML timers take a signed 32-bit delay. A normal 30-day session must not
    // overflow into an immediate retirement of this original acknowledgement.
    displayExpiresAt=Math.min(captured.expiresAt,data.analysis.sessionExpiresAt);completed = true; clearTimeout(timer); timer = setTimeout(retire, Math.min(2147483647, Math.max(0, displayExpiresAt - Date.now())));
    const freeze = (v: unknown): void => { if (v && typeof v === 'object') { for (const child of Object.values(v)) freeze(child); Object.freeze(v); } };
    freeze(data);
    const receipt = Object.freeze({}) as AbNativeSuggestionReceipt; receipts.set(receipt, { owner: own, data }); return receipt;
  } catch (error) { retire(); throw error; } })(); void original.catch(() => {});
  return Object.freeze({ original, retire, read(receipt: AbNativeSuggestionReceipt | null) {
    try { check(); const value = receipt && receipts.get(receipt); return completed && value && value.owner === own ? value.data : null; } catch { return null; }
  } });
}
