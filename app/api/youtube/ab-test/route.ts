import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';
import { createAbTest } from '@/lib/ab-test';

export const maxDuration = 60;

// Retire only HTTP. A title/credential write already invoked keeps its own
// persistence/result reader; neither timeout nor abort grants another attempt.
function mutationWait(signal?: AbortSignal) {
  const deadline = performance.now() + 55_000;
  let retired = false;
  let rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(new Error('Mutation unconfirmed')); } };
  const timer = setTimeout(retire, 55_000);
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
async function bounded(req: NextRequest, operation: (wait: ReturnType<typeof mutationWait>) => Promise<NextResponse>) {
  const wait = mutationWait(req.signal);
  try {
    const response = await operation(wait);
    wait.check(); response.headers.set('Cache-Control', 'no-store'); return response;
  } catch { return unconfirmed(); }
  finally { wait.close(); }
}

// ── Helpers ────────────────────────────────────────────────────────────────
// fetchVideoSnippet/updateVideoTitle usados por PATCH (cancel/apply_winner)
// viven en lib/ab-test.ts para POST; PATCH los necesita también, así que se
// mantiene una copia mínima local hasta que PATCH se extraiga.

async function fetchVideoSnippet(token: string, videoId: string) {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json();
  return data.items?.[0] ?? null;
}

async function updateVideoTitle(
  token: string,
  videoId: string,
  newTitle: string,
  categoryId: string,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const res = await fetch(
    'https://www.googleapis.com/youtube/v3/videos?part=snippet',
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: videoId,
        snippet: { title: newTitle, categoryId },
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, status: res.status, error: text };
  }
  return { ok: true, status: res.status };
}

// ── GET — list tests ───────────────────────────────────────────────────────

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const tests = await prisma.abTest.findMany({
    where: { userId },
    orderBy: { startedAt: 'desc' },
    take: 20,
  });

  return NextResponse.json({ userId, tests }, { headers: { 'Cache-Control': 'no-store' } });
}

// ── POST — create new test ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  return bounded(req, wait => createTest(req, wait));
}
async function createTest(req: NextRequest, wait: ReturnType<typeof mutationWait>) {
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

// ── PATCH — cancel test / apply winner ─────────────────────────────────────

export async function PATCH(req: NextRequest) {
  return bounded(req, wait => changeTest(req, wait));
}
async function changeTest(req: NextRequest, wait: ReturnType<typeof mutationWait>) {
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
    let categoryId: string | null = null;
    if (test.status === 'variant_a' || test.status === 'variant_b') {
      if (!token) return unconfirmed();
      const video = await wait.run(() => fetchVideoSnippet(token, test.videoId));
      if (!video || typeof video.snippet?.categoryId !== 'string' || !video.snippet.categoryId.trim()) return unconfirmed();
      categoryId = video.snippet.categoryId;
    }
    // The original restoration and its SQL completion stay together. A late
    // restoration must not be stranded by discarding its persistence reader.
    return wait.run(async () => {
      if (categoryId !== null) {
        const restored = await updateVideoTitle(token!, test.videoId, test.originalTitle, categoryId);
        if (!restored.ok) return unconfirmed();
      }
      const cancelled = await prisma.abTest.update({
        where: { id: testId },
        data: { status: 'cancelled', completedAt: new Date() },
      });
      return NextResponse.json({ ok: true, userId, test: cancelled }, { headers: { 'Cache-Control': 'no-store' } });
    });
  }

  if (action === 'apply_winner' && test.status === 'completed' && test.winner && token) {
    const winningTitle = test.winner === 'A' ? test.variantA : test.variantB;
    const video = await wait.run(() => fetchVideoSnippet(token, test.videoId));
    if (!video || typeof video.snippet?.categoryId !== 'string' || !video.snippet.categoryId.trim()) return unconfirmed();
    return wait.run(async () => {
      const applied = await updateVideoTitle(token, test.videoId, winningTitle, video.snippet.categoryId);
      return applied.ok ? NextResponse.json({ ok: true }) : unconfirmed();
    });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
