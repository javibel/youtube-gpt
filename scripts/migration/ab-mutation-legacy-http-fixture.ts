// Historical a106698 public-auth PATCH;shared producer/deadline/metadata fixture only. Never native writer authority.
import { createAbTestOriginal } from '@/lib/ab-create-original';
import { readAbHistoryOriginal } from '@/lib/ab-history-original';
import { captureAbTitleMetadata,readAbVideoOriginal,publishAbTitleOriginal,type AbTitlePayload } from '@/lib/ab-title-metadata';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';
import { beginAbTestMutation } from '@/lib/ab-test';

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

// ── GET — list tests ───────────────────────────────────────────────────────

export async function GET(req: NextRequest) { return readAbHistoryOriginal(req); }

// ── POST — create new test ─────────────────────────────────────────────────

export const POST = createAbTestOriginal;

// ── PATCH — cancel test / apply winner ─────────────────────────────────────

export async function PATCH(req: NextRequest) {
  return bounded(req, wait => changeTest(req, wait));
}
async function changeTest(req: NextRequest, wait: ReturnType<typeof httpWait>) {
  const session = await wait.run(() => auth());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  let body;
  try { body = await wait.run(() => req.json()); }
  catch { wait.check(); return NextResponse.json({ error: 'Missing fields' }, { status: 400 }); }
  const { testId, action } = body ?? {};
  if (!testId || !action) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const found = await wait.run(() => prisma.abTest.findFirst({
    where: { id: testId, userId },
  }));
  if (!found) {
    return NextResponse.json({ error: 'Test not found' }, { status: 404 });
  }

  const test = { ...found };
  const token = await wait.run(() => getAccessToken(userId, wait.check));

  if (action === 'cancel') {
    let payload:AbTitlePayload|null=null;
    if (test.status === 'variant_a' || test.status === 'variant_b') {
      if (!token) return unconfirmed();
      const video = await wait.run(() => readAbVideoOriginal(token, test.videoId));
      if(!video)return unconfirmed();
      payload=captureAbTitleMetadata(video,test.videoId,test.originalTitle);
    }
    const admission = await wait.run(() => beginAbTestMutation(userId, test, 'cancel', wait.check));
    if (!admission.ok) return unconfirmed();
    // The original restoration and its SQL completion stay together. A late
    // restoration must not be stranded by discarding its persistence reader.
    return wait.run(async () => {
      if (payload !== null) {
        const restored = await publishAbTitleOriginal(token!,payload);
        if (!restored.ok) return unconfirmed();
      }
      const cancelled = await admission.complete();
      return NextResponse.json({ ok: true, userId, test: cancelled }, { headers: { 'Cache-Control': 'no-store' } });
    });
  }

  if (action === 'apply_winner' && test.status === 'completed' && test.winner && token) {
    const winningTitle = test.winner === 'A' ? test.variantA : test.variantB;
    const video = await wait.run(() => readAbVideoOriginal(token, test.videoId));
    if(!video)return unconfirmed();
    const payload=captureAbTitleMetadata(video,test.videoId,winningTitle);
    const admission = await wait.run(() => beginAbTestMutation(userId, test, 'apply_winner', wait.check));
    if (!admission.ok) return unconfirmed();
    return wait.run(async () => {
      const applied = await publishAbTitleOriginal(token,payload);
      if (!applied.ok) return unconfirmed();
      await admission.complete();
      return NextResponse.json({ ok: true });
    });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
