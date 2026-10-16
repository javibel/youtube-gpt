import { abNativeMutationInput } from '@/lib/ab-mutate-contract';
import { decodeAbTest,type AbTest } from '@/lib/use-ab-test-read';
import { abCreationClientBlocked,retainAbCreationClient,denyAbCreationClient } from '@/lib/ab-create-negative';
import { anyUnconfirmedAbMutationForUser } from '@/lib/use-ab-mutation';
const command=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
type AbNativeMutationInput=ReturnType<typeof abNativeMutationInput>;
type AbNativeMutationResult={request:AbNativeMutationInput;test:AbTest;analysis:{commandRef:string;userId:string;email:string;sessionRef:string;sessionExpiresAt:number;lang:'es'|'en';videoId:string;channelId:string;asOf:number;expiresAt:number;sourceOwnership:'matched-native-channel';action:'cancel'|'apply_winner'}};
export type AbNativeMutationOwner = Readonly<{ id: string; email: string; sessionRef: string; expiresAt: number }>;
declare const abNativeMutationReceipt: unique symbol;
export type AbNativeMutationReceipt = { readonly [abNativeMutationReceipt]: true };
const receipts = new WeakMap<object, { owner: object; data: AbNativeMutationResult }>();
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const parseInput=abNativeMutationInput;
export function abNativeMutationsBlocked(id:string,_email:string){if(anyUnconfirmedAbMutationForUser(id))denyAbCreationClient(id);return abCreationClientBlocked(id);}
// Display accepts only this original HTTP response. Client session fields and
// JSON never authorize server/provider work or recover a missing response.
export function beginAbNativeMutation(owner: AbNativeMutationOwner, candidate: AbNativeMutationInput, current: () => boolean, onRetire: () => void) {
  const own = {}, captured = Object.freeze({ ...owner }), input = parseInput(candidate), controller = new AbortController();
  const startedAt = Date.now(), deadline = performance.now() + 55000,account=captured.id;
  let displayExpiresAt=captured.expiresAt;
  let reservation:ReturnType<typeof retainAbCreationClient>|undefined;
  let admitted = false, retired = false, completed = false, rejectStop!: (error: Error) => void, timer: ReturnType<typeof setTimeout> | undefined;
  const stopped = new Promise<never>((_, reject) => { rejectStop = reject; }); void stopped.catch(() => {});
  const retire = () => { if (retired) return; retired = true; if (admitted && !completed) reservation?.deny(); controller.abort(); clearTimeout(timer); rejectStop(Error('ab_mutation_unconfirmed')); onRetire(); };
  const check = () => {
    if (retired || !current() || Date.now() < startedAt || Date.now() >= displayExpiresAt
      || !completed && (performance.now() >= deadline || Date.now() >= startedAt + 55000)) { retire(); throw Error('ab_mutation_unconfirmed'); }
  };
  const wait = async <T,>(action: () => Promise<T>) => {
    check(); const pending = Promise.resolve().then(() => { check(); return action(); }); void pending.catch(() => {});
    const v = await Promise.race([pending, stopped]); check(); return v;
  };
  timer = setTimeout(retire, Math.max(0, Math.min(startedAt + 55000, captured.expiresAt) - startedAt));
  const original = (async () => { try {
    if (abNativeMutationsBlocked(captured.id,captured.email)) throw Error('previous_mutation_unconfirmed');
    reservation=retainAbCreationClient(account);admitted=true;
    const commandRef = crypto.randomUUID();
    if (!command(commandRef) || !command(captured.sessionRef) || !/^[A-Za-z0-9_-]{1,128}$/.test(captured.id)
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(captured.email) || !count(captured.expiresAt)) throw Error('ab_mutation_unconfirmed');
    const response = await wait(() => fetch('/api/youtube/ab-test', { method: 'PATCH', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': commandRef,'X-YTV-AB-Expectation':encodeURIComponent(JSON.stringify({userId:captured.id,email:captured.email,sessionRef:captured.sessionRef})) }, body: JSON.stringify(input), signal: controller.signal }));
    if (response.redirected || response.headers.get('cache-control') !== 'no-store') throw Error('ab_mutation_unconfirmed');
    if (!response.body) throw Error('ab_mutation_unconfirmed');
    const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
    let text = '', bytes = 0;
    if(!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''))throw Error('ab_mutation_unconfirmed');
    try { for (;;) { const part = await wait(() => reader.read()); if (part.done) break;
      bytes += part.value.byteLength; if (bytes > 262144) throw Error('ab_mutation_unconfirmed'); text += decoder.decode(part.value, { stream: true });
    } text += decoder.decode(); } finally { void reader.cancel().catch(() => {}); }
    const parsed = JSON.parse(text);
    if(response.status!==200||!response.ok||!exact(parsed,['request','test','analysis']))throw Error('ab_mutation_unconfirmed');
    const selected=abNativeMutationInput(parsed.request),ack=parsed.analysis;
    if(JSON.stringify(selected)!==JSON.stringify(input)||!exact(ack,['commandRef','userId','email','sessionRef','sessionExpiresAt','lang','videoId','channelId','asOf','expiresAt','sourceOwnership','action'])
      ||ack.commandRef!==commandRef||ack.userId!==captured.id||ack.email!==captured.email||ack.sessionRef!==captured.sessionRef||ack.lang!==input.lang||ack.videoId!==input.test.videoId||ack.channelId!==input.channelId
      ||!count(ack.asOf)||ack.asOf<startedAt||ack.asOf>Date.now()||!count(ack.expiresAt)||ack.expiresAt<=Date.now()||ack.expiresAt-ack.asOf>55000||!count(ack.sessionExpiresAt)||ack.sessionExpiresAt<ack.expiresAt||ack.sourceOwnership!=='matched-native-channel'||ack.action!==input.action)throw Error('ab_mutation_unconfirmed');
    const row=decodeAbTest(parsed.test,captured.id);
    if(!row)throw Error('ab_mutation_unconfirmed');
    const expected={...input.test,...(input.action==='cancel'?{status:'cancelled',completedAt:row.completedAt}:{})};
    if(Object.entries(expected).some(([k,v])=>row[k as keyof AbTest]!==v)||input.action==='cancel'&&(!row.completedAt||Date.parse(row.completedAt)<startedAt||Date.parse(row.completedAt)>Date.now()))throw Error('ab_mutation_unconfirmed');
    const data:AbNativeMutationResult={request:selected,test:row,analysis:ack as AbNativeMutationResult['analysis']};check();
    reservation.complete();
    // HTML timers take a signed 32-bit delay. A normal 30-day session must not
    // overflow into an immediate retirement of this original acknowledgement.
    displayExpiresAt=Math.min(captured.expiresAt,data.analysis.sessionExpiresAt);completed = true; clearTimeout(timer); timer = setTimeout(retire, Math.min(2147483647, Math.max(0, displayExpiresAt - Date.now())));
    const freeze = (v: unknown): void => { if (v && typeof v === 'object') { for (const child of Object.values(v)) freeze(child); Object.freeze(v); } };
    freeze(data);
    const receipt = Object.freeze({}) as AbNativeMutationReceipt; receipts.set(receipt, { owner: own, data }); return receipt;
  } catch (error) { retire(); throw error; } })(); void original.catch(() => {});
  return Object.freeze({ original, retire, read(receipt: AbNativeMutationReceipt | null) {
    try { check(); const value = receipt && receipts.get(receipt); return completed && value && value.owner === own ? value.data : null; } catch { return null; }
  } });
}
