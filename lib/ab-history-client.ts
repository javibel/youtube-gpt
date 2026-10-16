import type { AbTest } from './use-ab-test-read';
export type AbHistoryOwner = Readonly<{ id: string; email: string; sessionRef: string; expiresAt: number }>;
declare const abHistoryDisplay: unique symbol;
export type AbHistoryDisplay = { readonly [abHistoryDisplay]: true };
const displays = new WeakMap<object, { owner: object; tests: AbTest[] }>();
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: unknown, keys: string[]): v is Record<string, unknown> => object(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k));
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const views = (v: unknown) => count(v) && v <= 2147483647;
const iso = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v)) && Date.parse(v) >= 0 && new Date(v).toISOString() === v;
function rows(value: unknown, owner: string): AbTest[] {
  if (!Array.isArray(value) || value.length > 20) throw Error('ab_read_unconfirmed');
  const keys = ['id','userId','videoId','thumbnail','originalTitle','variantA','variantB','status','hoursPerVariant','startedAt','switchedAt','completedAt','initialViews','switchViews','endViews','winner','aiInsight'];
  for (const row of value) {
    if (!exact(row,keys) || !id(row.id) || row.userId !== owner || !id(row.videoId)
      || !text(row.originalTitle,1024) || !text(row.variantA,1024) || !text(row.variantB,1024)
      || !['variant_a','variant_b','completed','cancelled'].includes(row.status as string)
      || !count(row.hoursPerVariant) || row.hoursPerVariant < 1 || row.hoursPerVariant > 168 || !iso(row.startedAt)
      || row.switchedAt !== null && !iso(row.switchedAt) || row.completedAt !== null && !iso(row.completedAt)
      || !views(row.initialViews) || row.switchViews !== null && !views(row.switchViews) || row.endViews !== null && !views(row.endViews)
      || row.winner !== null && !['A','B','tie'].includes(row.winner as string)) throw Error('ab_read_unconfirmed');
    if (row.thumbnail !== null && row.thumbnail !== '') {
      if (!text(row.thumbnail,2048)) throw Error('ab_read_unconfirmed'); const image = new URL(row.thumbnail);
      if (image.protocol !== 'https:' || image.hostname !== 'i.ytimg.com' || image.username || image.password || image.port || image.search || image.hash
        || !image.pathname.startsWith('/vi/' + row.videoId + '/')) throw Error('ab_read_unconfirmed');
    }
    if (row.aiInsight !== null && (!exact(row.aiInsight,['es','en']) || !text(row.aiInsight.es,2000) || !text(row.aiInsight.en,2000))) throw Error('ab_read_unconfirmed');
  }
  if (new Set(value.map(row => row.id)).size !== value.length) throw Error('ab_read_unconfirmed');
  return value as AbTest[];
}
// Session metadata can only veto this display. Only the server's original
// native cookie authenticates its SELECT. No receipt authorizes a writer.
export function beginAbHistoryRead(owner: AbHistoryOwner, current: () => boolean, onRetire: () => void) {
  const captured = Object.freeze({...owner}), own = {}, startedAt = Date.now(), started = performance.now(), controller = new AbortController();
  let expiresAt = Math.min(startedAt + 25000,captured.expiresAt), duration = 25000, retired = false, completed = false;
  let timer: ReturnType<typeof setTimeout> | undefined, rejectStop!: (e: Error) => void;
  const stopped = new Promise<never>((_,reject) => { rejectStop = reject; }); void stopped.catch(() => {});
  const retire = () => { if (retired) return; retired = true; controller.abort(); clearTimeout(timer); rejectStop(Error('ab_read_unconfirmed')); onRetire(); };
  const check = () => { if (retired || !current() || Date.now() < startedAt || Date.now() >= expiresAt || performance.now() - started >= duration) { retire(); throw Error('ab_read_unconfirmed'); } };
  const wait = async <T,>(fn: () => Promise<T>) => { check(); const pending = Promise.resolve().then(() => { check(); return fn(); }); void pending.catch(() => {}); const value = await Promise.race([pending,stopped]); check(); return value; };
  timer = setTimeout(retire,Math.max(0,expiresAt - startedAt));
  const original = (async () => { try {
    const readRef = crypto.randomUUID();
    if (!uuid(readRef) || !uuid(captured.sessionRef) || !id(captured.id) || !text(captured.email,254) || captured.email !== captured.email.trim().toLowerCase()
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(captured.email) || !count(captured.expiresAt)) throw Error('ab_read_unconfirmed');
    const response = await wait(() => fetch('/api/youtube/ab-test',{ method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'X-YTV-Read-Ref':readRef},signal:controller.signal }));
    if (response.status !== 200 || !response.ok || response.redirected || response.headers.get('cache-control') !== 'no-store'
      || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body) throw Error('ab_read_unconfirmed');
    const reader = response.body.getReader(), decoder = new TextDecoder('utf-8',{fatal:true}); let body = '', bytes = 0;
    try { for (;;) { const part = await wait(() => reader.read()); if (part.done) break; bytes += part.value.byteLength;
      if (bytes > 1048576) throw Error('ab_read_unconfirmed'); body += decoder.decode(part.value,{stream:true});
    } body += decoder.decode(); } finally { void reader.cancel().catch(() => {}); }
    const data: unknown = JSON.parse(body); check();
    if (!exact(data,['userId','tests','historyRead']) || data.userId !== captured.id) throw Error('ab_read_unconfirmed');
    const ack = data.historyRead;
    if (!exact(ack,['commandRef','readRef','email','sessionRef','sessionExpiresAt','requestedAt','expiresAt','coverage','sourceOwnership','operationalFreshness'])
      || !uuid(ack.commandRef) || ack.readRef !== readRef || ack.email !== captured.email || ack.sessionRef !== captured.sessionRef
      || !count(ack.requestedAt) || ack.requestedAt < startedAt || ack.requestedAt > Date.now() || !count(ack.expiresAt) || ack.expiresAt <= Date.now()
      || ack.expiresAt <= ack.requestedAt || ack.expiresAt - ack.requestedAt > 25000 || !count(ack.sessionExpiresAt) || ack.sessionExpiresAt < ack.expiresAt
      || ack.coverage !== 'latest-up-to-20-stored-records' || ack.sourceOwnership !== 'not-verified' || ack.operationalFreshness !== 'not-verified') throw Error('ab_read_unconfirmed');
    expiresAt = Math.min(expiresAt,ack.expiresAt); check(); const tests = rows(data.tests,captured.id); check();
    const freeze = (v: unknown): void => { if (v && typeof v === 'object') { for (const child of Object.values(v)) freeze(child); Object.freeze(v); } }; freeze(tests);
    // Completion keeps a historical snapshot only until the original native
    // session expires. It never makes stored dates into fresh YouTube activity.
    expiresAt = Math.min(captured.expiresAt,ack.sessionExpiresAt); duration = expiresAt - startedAt; completed = true;
    clearTimeout(timer); timer = setTimeout(retire,Math.min(2147483647,Math.max(0,expiresAt - Date.now()))); check();
    const display = Object.freeze({}) as AbHistoryDisplay; displays.set(display,{owner:own,tests}); return display;
  } catch { retire(); throw Error('ab_read_unconfirmed'); } })(); void original.catch(() => {});
  return Object.freeze({original,retire,display(receipt: AbHistoryDisplay | null) { try { check(); const value = receipt && displays.get(receipt); return completed && value?.owner === own ? value.tests : null; } catch { return null; } }});
}
