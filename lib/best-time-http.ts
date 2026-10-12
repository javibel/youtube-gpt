import { NextResponse } from 'next/server';
import { getBestTimeFixtureEntry } from '@/lib/migration/best-time-entry';

// A missing guarded bootstrap returns null so the existing eligibility-only
// route stays closed. JSON/headers cannot supply runner, source date or owner.
export async function bestTimeFixturePost(request?: Request): Promise<Response | null> {
  const entry = getBestTimeFixtureEntry();
  if (!entry) return null;
  const deadline = performance.now() + 55_000;
  const abort = new AbortController();
  let finish!: () => void;
  const stopped = new Promise<void>(resolve => { finish = resolve; });
  const retire = () => { abort.abort(); finish(); };
  const timer = setTimeout(retire, 55_000);
  request?.signal.addEventListener('abort', retire, { once: true });
  const check = () => {
    if (!request || request.signal.aborted || performance.now() >= deadline) retire();
    if (abort.signal.aborted) throw Error('Best time HTTP wait ended');
  };
  try {
    check();
    // Cookie auth remains the route's real server auth. The producer ignores
    // request JSON/header keys; retain only this bounded signal and endpoint.
    const original = entry(new Request(request!.url, { method: 'POST', signal: abort.signal }));
    const outcome = await Promise.race([original.waiter, stopped.then(() => { throw Error('Best time HTTP wait ended'); })]);
    check();
    const response = NextResponse.json(outcome.body, { status: outcome.status, headers: { 'Cache-Control': 'no-store' } });
    check(); return response;
  } catch {
    retire();
    return NextResponse.json({ error: 'best_time_analysis_unconfirmed' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  } finally { clearTimeout(timer); request?.signal.removeEventListener('abort', retire); }
}
