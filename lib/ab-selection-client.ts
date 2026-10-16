import { abSelection, type AbSelection } from '@/lib/ab-selection-contract';
export type AbSelectionOwner = Readonly<{ id: string; email: string; sessionRef: string; expiresAt: number }>;
declare const abSelectionDisplay: unique symbol;
export type AbSelectionDisplay = { readonly [abSelectionDisplay]: true };
const displays = new WeakMap<object, { owner: object; selection: AbSelection }>();
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: unknown, keys: string[]): v is Record<string, unknown> => object(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k));
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
// Session metadata can only veto this display. Only the server's original
// native cookie authenticates the actor/source read. No receipt authorizes a writer.
export function beginAbSelectionRead(owner: AbSelectionOwner, current: () => boolean, onRetire: () => void) {
  const captured = Object.freeze({...owner}), own = {}, startedAt = Date.now(), started = performance.now(), controller = new AbortController();
  let expiresAt = Math.min(startedAt + 25000,captured.expiresAt), duration = 25000, retired = false, completed = false;
  let timer: ReturnType<typeof setTimeout> | undefined, rejectStop!: (e: Error) => void;
  const stopped = new Promise<never>((_,reject) => { rejectStop = reject; }); void stopped.catch(() => {});
  const retire = () => { if (retired) return; retired = true; controller.abort(); clearTimeout(timer); rejectStop(Error('ab_selection_unconfirmed')); onRetire(); };
  const check = () => { if (retired || !current() || Date.now() < startedAt || Date.now() >= expiresAt || performance.now() - started >= duration) { retire(); throw Error('ab_selection_unconfirmed'); } };
  const wait = async <T,>(fn: () => Promise<T>) => { check(); const pending = Promise.resolve().then(() => { check(); return fn(); }); void pending.catch(() => {}); const value = await Promise.race([pending,stopped]); check(); return value; };
  timer = setTimeout(retire,Math.max(0,expiresAt - startedAt));
  const original = (async () => { try {
    const readRef = crypto.randomUUID();
    if (!uuid(readRef) || !uuid(captured.sessionRef) || !id(captured.id) || !text(captured.email,254) || captured.email !== captured.email.trim().toLowerCase()
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(captured.email) || !count(captured.expiresAt)) throw Error('ab_selection_unconfirmed');
    const response = await wait(() => fetch('/api/youtube/ab-test/selection',{ method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'X-YTV-Read-Ref':readRef},signal:controller.signal }));
    if (response.status !== 200 || !response.ok || response.redirected || response.headers.get('cache-control') !== 'no-store'
      || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body) throw Error('ab_selection_unconfirmed');
    const reader = response.body.getReader(), decoder = new TextDecoder('utf-8',{fatal:true}); let body = '', bytes = 0;
    try { for (;;) { const part = await wait(() => reader.read()); if (part.done) break; bytes += part.value.byteLength;
      if (bytes > 1048576) throw Error('ab_selection_unconfirmed'); body += decoder.decode(part.value,{stream:true});
    } body += decoder.decode(); } finally { void reader.cancel().catch(() => {}); }
    const data: unknown = JSON.parse(body); check();
    if (!exact(data,['userId','selection','selectionRead']) || data.userId !== captured.id) throw Error('ab_selection_unconfirmed');
    const ack = data.selectionRead;
    if (!exact(ack,['commandRef','readRef','email','sessionRef','sessionExpiresAt','tokenExpiresAt','requestedAt','expiresAt','coverage','sourceOwnership','operationalFreshness'])
      || !uuid(ack.commandRef) || ack.readRef !== readRef || ack.email !== captured.email || ack.sessionRef !== captured.sessionRef
      || !count(ack.requestedAt) || ack.requestedAt < startedAt || ack.requestedAt > Date.now() || !count(ack.expiresAt) || ack.expiresAt <= Date.now()
      || ack.expiresAt <= ack.requestedAt || ack.expiresAt - ack.requestedAt > 25000 || !count(ack.sessionExpiresAt) || ack.sessionExpiresAt < ack.expiresAt
      || ack.coverage !== 'first-up-to-20-uploads' || !['matched-native-channel','no-channel'].includes(ack.sourceOwnership as string) || ack.operationalFreshness !== 'not-verified') throw Error('ab_selection_unconfirmed');
    expiresAt = Math.min(expiresAt,ack.expiresAt); check(); const selection = abSelection(data.selection,ack.requestedAt); check();
    if (selection.connected ? !count(ack.tokenExpiresAt) || ack.tokenExpiresAt < ack.expiresAt || ack.sourceOwnership !== 'matched-native-channel' : ack.tokenExpiresAt !== null || ack.sourceOwnership !== 'no-channel') throw Error('ab_selection_unconfirmed');
    const freeze = (v: unknown): void => { if (v && typeof v === 'object') { for (const child of Object.values(v)) freeze(child); Object.freeze(v); } }; freeze(selection);
    // Completion keeps a source snapshot only until the captured native session/token
    // expires. Its timestamps never claim operational freshness.
    expiresAt = Math.min(captured.expiresAt,ack.sessionExpiresAt,(ack.tokenExpiresAt as number | null) ?? Infinity); duration = expiresAt - startedAt; completed = true;
    clearTimeout(timer); timer = setTimeout(retire,Math.min(2147483647,Math.max(0,expiresAt - Date.now()))); check();
    const display = Object.freeze({}) as AbSelectionDisplay; displays.set(display,{owner:own,selection}); return display;
  } catch { retire(); throw Error('ab_selection_unconfirmed'); } })(); void original.catch(() => {});
  return Object.freeze({original,retire,display(receipt: AbSelectionDisplay | null) { try { check(); const value = receipt && displays.get(receipt); return completed && value?.owner === own ? value.selection : null; } catch { return null; } }});
}
