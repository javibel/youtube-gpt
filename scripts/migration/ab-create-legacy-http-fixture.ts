// Historical public-auth HTTP test fixture from4d9241d.
// Retains shared-helper deadline/metadata coverage;never a native web admission.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';


import { createAbTest, beginAbTestMutation } from '@/lib/ab-test';

export const maxDuration = 60;

// Retire only HTTP. A title/credential write already invoked keeps its own
// persistence/result reader; neither timeout nor abort grants another attempt.
function httpWait(signal?: AbortSignal, budget = 55_000) {
  const deadline = performance.now() + budget;
  let retired = false;
  let rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(new Error('Mutation unconfirmed')); } };
  const timer = setTimeout(retire, budget);
  signal?.addEventListener('abort', retire, { once: true });
  const check = () => {
    if (signal?.aborted || performance.now() >= deadline) retire();
    if (retired) throw new Error('Mutation unconfirmed');
  };
  return {
    async run<T>(operation: () => Promise<T>): Promise<T> {
      check();
      const original = Promise.resolve().then(() => { check(); return operation(); });
      const result = await Promise.race([original, stopped]);
      check(); return result;
    },
    check,
    close() { clearTimeout(timer); signal?.removeEventListener('abort', retire); },
  };
}
function unconfirmed() {
  return NextResponse.json({ error: 'ab_mutation_unconfirmed' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
async function bounded(req: NextRequest, operation: (wait: ReturnType<typeof httpWait>) => Promise<NextResponse>) {
  const wait = httpWait(req.signal);
  try {
    const response = await operation(wait);
    wait.check(); response.headers.set('Cache-Control', 'no-store'); return response;
  } catch { return unconfirmed(); }
  finally { wait.close(); }
}

// ── POST — create new test ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  return bounded(req, wait => createTest(req, wait));
}
async function createTest(req: NextRequest, wait: ReturnType<typeof httpWait>) {
  const session = await wait.run(() => auth());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  let body;
  try { body = await wait.run(() => req.json()); }
  catch { wait.check(); return NextResponse.json({ error: 'Missing fields' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  const input = { videoId: body.videoId, variantA: body.variantA, variantB: body.variantB, hoursPerVariant: body.hoursPerVariant };
  const result = await wait.run(() => createAbTest(userId, input, wait.check));
  if (!result.ok) {
    return NextResponse.json({ error: result.error, limit: result.limit }, { status: result.status });
  }
  return NextResponse.json({ test: result.test }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}

