import { analyzeBestTimeVideos, captureBestTimeSearch, captureBestTimeReference, type BestTimeAnalysis } from './best-time-analysis';

type Check = () => void;
export type BestTimeSelection = Readonly<{ owner: Readonly<{ id: string; email: string }>; channelId: string; referenceAt: string }>;
export type BestTimeSources = Readonly<{
  search(selection: BestTimeSelection, check: Check): Promise<unknown>;
  details(selection: BestTimeSelection, ids: readonly string[], check: Check): Promise<unknown>;
}>;
type Outcome = Readonly<{ status: 'unconfirmed' }>
  | Readonly<{ status: 'no_videos'; selection: BestTimeSelection }>
  | Readonly<{ status: 'calculated'; selection: BestTimeSelection; analysis: BestTimeAnalysis }>;
const unknown = (): Outcome => Object.freeze({ status: 'unconfirmed' });
function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Declared source unavailable');
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw Error('Declared source unavailable');
  return descriptor.value;
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw Error('Declared source unavailable');
  return value;
}

// This live read coordinates declared source callbacks only. Selection, copies,
// timers and results never grant producer admission, quota, writer or recovery
// authority. A future admitted server coordinator must supply its own retained
// check and sources. HTTP/OAuth/model/persistence entry points remain separate.
export function readDeclaredBestTime(input: unknown, sources: BestTimeSources, inheritedCheck: Check, signal: AbortSignal) {
  let pending = true, retired = false, timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = performance.now() + 25_000;
  const check = () => {
    if (retired || signal.aborted || performance.now() >= deadline) { retired = true; throw Error('Declared source wait ended'); }
    try { inheritedCheck(); } catch (error) { retired = true; throw error; }
    if (retired || signal.aborted || performance.now() >= deadline) { retired = true; throw Error('Declared source wait ended'); }
  };
  let finish!: (value: Outcome) => void;
  const stopped = new Promise<Outcome>(resolve => { finish = resolve; });
  const retire = () => { retired = true; finish(unknown()); if (timer !== undefined) clearTimeout(timer); };
  signal.addEventListener('abort', retire, { once: true });
  let selection: BestTimeSelection | undefined;
  let searchRead: BestTimeSources['search'] | undefined, detailRead: BestTimeSources['details'] | undefined;
  try {
    check();
    const owner = field(input, 'owner'), reference = captureBestTimeReference(input, check);
    selection = Object.freeze({ owner: Object.freeze({ id: text(field(owner, 'id'), 128), email: text(field(owner, 'email'), 320) }), ...reference });
    searchRead = field(sources, 'search') as BestTimeSources['search'];
    detailRead = field(sources, 'details') as BestTimeSources['details'];
    if (typeof searchRead !== 'function' || typeof detailRead !== 'function') throw Error('Declared source unavailable');
    check();
  } catch { retired = true; }
  const original = Promise.resolve().then(async (): Promise<Outcome> => {
    try {
      check();
      if (!selection || !searchRead || !detailRead) throw Error('Declared source unavailable');
      const selected = selection;
      const collection = (value: unknown) => {
        check();
        const own = field(value, 'owner');
        if (field(own, 'id') !== selected.owner.id || field(own, 'email') !== selected.owner.email
          || field(value, 'channelId') !== selected.channelId || field(value, 'referenceAt') !== selected.referenceAt)
          throw Error('Declared source mismatch');
        return field(value, 'collection');
      };
      check();
      const searched = await searchRead(selected, check);
      check();
      const search = captureBestTimeSearch({ ...selected, search: collection(searched) }, check);
      // Empty search is a known search result; no fabricated details collection.
      if (!search.videos.length) { check(); return Object.freeze({ status: 'no_videos' as const, selection: selected }); }
      const ids = Object.freeze(search.videos.map(v => v.id));
      const capturedSearch = Object.freeze({ available: true, complete: true, items: Object.freeze(search.videos.map(v =>
        Object.freeze({ id: Object.freeze({ kind: 'youtube#video', videoId: v.id }),
          snippet: Object.freeze({ channelId: search.channelId, publishedAt: v.publishedAt }) }))) });
      check();
      const detailed = await detailRead(selected, ids, check);
      check();
      const analysis = analyzeBestTimeVideos({ ...selected, search: capturedSearch, details: collection(detailed) }, check);
      check();
      return Object.freeze({ status: 'calculated' as const, selection: selected, analysis });
    } catch { return unknown(); }
  }).then(outcome => {
    pending = false;
    if (timer !== undefined) clearTimeout(timer);
    signal.removeEventListener('abort', retire);
    try { check(); return outcome; } catch { return unknown(); }
  });
  // Retire only the local wait; the original continues draining without retry,
  // replacement, quota release or inferred authority to write a late result.
  timer = setTimeout(retire, Math.max(0, deadline - performance.now()));
  const waiter = Promise.race([original, stopped]).then(outcome => { try { check(); return outcome; } catch { return unknown(); } });
  return Object.freeze({ original, waiter, get pending() { return pending; } });
}
