import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserPlan, isPaid } from '@/lib/plans';

const MAX_ENTRIES = 200;
const VALID_STATUSES = ['idea', 'draft', 'scheduled', 'published'];
class CalendarCreationConflict extends Error {}

// Retiring the HTTP waiter does not cancel or replace an original dependency.
function calendarReadWait(signal: AbortSignal) {
  const deadline = performance.now() + 30_000;
  let retired = false;
  let rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => {
    if (!retired) { retired = true; rejectWait(new Error('Calendar read unconfirmed')); }
  };
  const timer = setTimeout(retire, 30_000);
  signal.addEventListener('abort', retire, { once: true });
  const check = () => {
    if (signal.aborted || performance.now() >= deadline) retire();
    if (retired) throw new Error('Calendar read unconfirmed');
  };
  return {
    async run<T>(operation: () => Promise<T>): Promise<T> {
      check();
      const original = Promise.resolve().then(() => { check(); return operation(); });
      const result = await Promise.race([original, stopped]);
      check();
      return result;
    },
    close() { clearTimeout(timer); signal.removeEventListener('abort', retire); },
  };
}

// GET — list entries for a month (or range)
export async function GET(request: Request) {
  const wait = calendarReadWait(request.signal);
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const session = await wait.run(() => auth());
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers });
    }

    const userId = session.user.id;
    const plan = await wait.run(() => getUserPlan(userId));
    if (!isPaid(plan)) {
      return NextResponse.json({ error: 'pro_required' }, { status: 403, headers });
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';

    const where: { userId: string; date?: { gte?: string; lte?: string } } = {
      userId,
    };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = from;
      if (to) where.date.lte = to;
    }

    const entries = await wait.run(() => prisma.calendarEntry.findMany({
      where,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      take: MAX_ENTRIES,
    }));

    return NextResponse.json({ entries }, { headers });
  } catch {
    return NextResponse.json({ error: 'calendar_read_unconfirmed' }, { status: 503, headers });
  } finally {
    wait.close();
  }
}

// POST — create entry
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const key = request.headers.get('Idempotency-Key');
  const recovery = request.headers.get('X-Calendar-Write-Recovery');
  if ((key !== null && !/^[-A-Za-z0-9._:]{1,128}$/.test(key))
    || (recovery !== null && (recovery !== 'retained-only-v1' || !key))) {
    return NextResponse.json({ error: 'invalid_recovery' }, { status: 400 });
  }

  const plan = await getUserPlan(session.user.id);
  if (!isPaid(plan)) {
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || typeof body.title !== 'string' || typeof body.date !== 'string'
    || (body.description != null && typeof body.description !== 'string')
    || (body.color != null && typeof body.color !== 'string')) {
    return NextResponse.json({ error: 'invalid entry' }, { status: 400 });
  }
  const title = (body.title as string || '').trim();
  const date = body.date as string || '';
  const description = (body.description as string || '').trim();
  const status = VALID_STATUSES.includes(body.status) ? body.status : 'idea';
  const color = (body.color as string || '').trim() || null;

  if (!title || title.length > 200) {
    return NextResponse.json({ error: 'title required (max 200)' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date required (YYYY-MM-DD)' }, { status: 400 });
  }

  const input = JSON.stringify({ title, description: description || null, date, status, color });
  if (key && (input.length > 65_536 || Object.keys(body).some(name => !['title','description','date','status','color'].includes(name)))) {
    return NextResponse.json({ error: 'invalid entry' }, { status: 400 });
  }

  const userId = session.user.id;
  try {
    const entry = await prisma.$transaction(async (tx) => {
      if (request.signal.aborted) throw new Error('Calendar request aborted');
      // Every calendar admission locks the owner before counting and inserting.
      const owners = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        'SELECT id FROM users WHERE id=$1 FOR UPDATE', userId,
      );
      if (owners.length !== 1 || owners[0].id !== userId || request.signal.aborted) {
        throw new Error('Calendar owner unconfirmed');
      }
      if (key) {
        const receipt = await tx.calendarCreationReceipt.findUnique({ where: { userId_key: { userId, key } } });
        if (receipt) {
          if (receipt.userId !== userId || receipt.key !== key) throw new Error('Calendar receipt unconfirmed');
          if (receipt.input !== input) throw new CalendarCreationConflict('calendar_key_conflict');
          // A retained business receipt selects the original committed row only.
          // Deletion or subsequent edits never authorize another creation.
          const retained = receipt.entryId ? await tx.calendarEntry.findUnique({ where: { id: receipt.entryId } }) : null;
          if (!retained || retained.userId !== userId) throw new Error('Calendar original unavailable');
          const retainedInput = JSON.stringify({ title: retained.title, description: retained.description,
            date: retained.date, status: retained.status, color: retained.color });
          if (retainedInput !== input) throw new CalendarCreationConflict('calendar_entry_changed');
          return retained;
        }
        if (recovery === 'retained-only-v1') throw new Error('Calendar original unconfirmed');
      }
      const count = await tx.calendarEntry.count({ where: { userId } });
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('Calendar count unconfirmed');
      if (count >= MAX_ENTRIES) return null;
      if (request.signal.aborted) throw new Error('Calendar request aborted');
      const created = await tx.calendarEntry.create({
        data: { userId, title, description: description || null, date, status, color },
      });
      if (key) await tx.calendarCreationReceipt.create({ data: { userId, key, input, entryId: created.id } });
      return created;
    }, { maxWait: 10_000, timeout: 15_000 });
    if (!entry) return NextResponse.json({ error: 'max_entries' }, { status: 400 });
    return NextResponse.json({ entry }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof CalendarCreationConflict) return NextResponse.json({ error: error.message }, {
      status: 409, headers: { 'Cache-Control': 'no-store' },
    });
    return NextResponse.json({ error: 'calendar_write_unconfirmed' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  }
}

// PUT — update entry
class CalendarMutationConflict extends Error {}
function calendarSnapshot(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'color,date,description,status,title'
    || typeof v.title !== 'string' || !v.title.trim() || v.title.length > 200
    || typeof v.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)
    || typeof v.status !== 'string' || !VALID_STATUSES.includes(v.status)
    || (v.description !== null && typeof v.description !== 'string')
    || (v.color !== null && typeof v.color !== 'string')) return null;
  return { title: v.title, description: v.description, date: v.date, status: v.status, color: v.color };
}

// Immutable receipt confirms only the original business mutation, never current
// row state, cancellation, or authority to recover a native runner.
async function keyedCalendarMutation(request: Request, userId: string, method: 'PUT' | 'DELETE', body: unknown, id: unknown) {
  const key = request.headers.get('Idempotency-Key'), recovery = request.headers.get('X-Calendar-Write-Recovery');
  const invalid = () => NextResponse.json({ error: 'invalid mutation' }, { status: 400 });
  if (!key || !/^[-A-Za-z0-9._:]{1,128}$/.test(key) || (recovery !== null && recovery !== 'retained-only-v1')) return invalid();
  if (typeof id !== 'string' || !id || id.length > 128 || !body || typeof body !== 'object' || Array.isArray(body)) return invalid();
  const b = body as Record<string, unknown>, expected = calendarSnapshot(b.expected);
  if (!expected || Object.keys(b).some(k => !(method === 'PUT' ? ['id','title','description','date','status','color','expected'] : ['expected']).includes(k))) return invalid();
  const data: { title?: string; description?: string | null; date?: string; status?: string; color?: string | null } = {};
  if (method === 'PUT') {
    if (b.title !== undefined) { if (typeof b.title !== 'string' || !b.title.trim() || b.title.trim().length > 200) return invalid(); data.title = b.title.trim(); }
    if (b.description !== undefined) { if (b.description !== null && typeof b.description !== 'string') return invalid(); data.description = (b.description as string | null)?.trim() || null; }
    if (b.date !== undefined) { if (typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return invalid(); data.date = b.date; }
    if (b.status !== undefined) { if (typeof b.status !== 'string' || !VALID_STATUSES.includes(b.status)) return invalid(); data.status = b.status; }
    if (b.color !== undefined) { if (b.color !== null && typeof b.color !== 'string') return invalid(); data.color = (b.color as string | null)?.trim() || null; }
    if (!Object.keys(data).length) return invalid();
  }
  const input = JSON.stringify({ id, expected, data });
  if (input.length > 65536) return invalid();
  try {
    const result = await prisma.$transaction(async tx => {
      if (request.signal.aborted) throw new Error('Mutation aborted');
      const owners = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM users WHERE id=$1 FOR UPDATE', userId);
      if (owners.length !== 1 || owners[0].id !== userId || request.signal.aborted) throw new Error('Owner unconfirmed');
      const receipt = await tx.calendarMutationReceipt.findUnique({ where: { userId_key: { userId, key } } });
      if (receipt) {
        if (receipt.userId !== userId || receipt.key !== key || typeof receipt.output !== 'string' || receipt.output.length > 65536) throw new Error('Receipt unconfirmed');
        if (receipt.method !== method || receipt.entryId !== id || receipt.input !== input) throw new CalendarMutationConflict('calendar_key_conflict');
        const retained = JSON.parse(receipt.output);
        if (retained?.originalMutation !== true || Object.keys(retained).sort().join(',') !== (method === 'PUT' ? 'entry,originalMutation' : 'id,ok,originalMutation')) throw new Error('Original output unconfirmed');
        if (method === 'PUT') {
          const e = retained.entry;
          if (!e || e.id !== id || e.userId !== userId || !calendarSnapshot({ title:e.title, description:e.description, date:e.date, status:e.status, color:e.color })) throw new Error('Original entry unconfirmed');
          for (const [field,value] of Object.entries({ ...expected, ...data })) if (e[field] !== value) throw new Error('Original output changed');
        } else if (retained.ok !== true || retained.id !== id) throw new Error('Original deletion unconfirmed');
        return retained;
      }
      if (recovery === 'retained-only-v1') throw new Error('Original mutation unavailable');
      // Row lock also orders legacy writers that do not acquire the owner lock.
      const locked = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM calendar_entries WHERE id=$1 AND "userId"=$2 FOR UPDATE', id, userId);
      if (locked.length !== 1 || locked[0].id !== id) throw new CalendarMutationConflict('calendar_entry_unavailable');
      const existing = await tx.calendarEntry.findUnique({ where: { id } });
      if (!existing || existing.userId !== userId) throw new CalendarMutationConflict('calendar_entry_unavailable');
      const current = JSON.stringify({ title:existing.title, description:existing.description, date:existing.date, status:existing.status, color:existing.color });
      if (current !== JSON.stringify(expected)) throw new CalendarMutationConflict('calendar_entry_changed');
      if (request.signal.aborted) throw new Error('Mutation aborted');
      const output = method === 'PUT' ? { entry: await tx.calendarEntry.update({ where: { id }, data }), originalMutation: true }
        : (await tx.calendarEntry.delete({ where: { id } }), { ok: true, id, originalMutation: true });
      const serialized = JSON.stringify(output);
      if (serialized.length > 65536) throw new Error('Original output too large');
      await tx.calendarMutationReceipt.create({ data: { userId, key, method, entryId: id, input, output: serialized } });
      return output;
    }, { maxWait: 10000, timeout: 15000 });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store', 'X-Calendar-Write-Result': 'original-v1' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof CalendarMutationConflict ? error.message : 'calendar_write_unconfirmed' }, {
      status: error instanceof CalendarMutationConflict ? 409 : 503, headers: { 'Cache-Control': 'no-store' },
    });
  }
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  if (request.headers.get('Idempotency-Key') !== null || request.headers.get('X-Calendar-Write-Recovery') !== null) return keyedCalendarMutation(request, session.user.id, 'PUT', body, body?.id);
  const id = body.id as string;
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  const existing = await prisma.calendarEntry.findUnique({ where: { id } });
  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const data: { title?: string; description?: string | null; date?: string; status?: string; color?: string | null } = {};

  if (body.title !== undefined) {
    const title = (body.title as string).trim();
    if (!title || title.length > 200) return NextResponse.json({ error: 'invalid title' }, { status: 400 });
    data.title = title;
  }
  if (body.date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return NextResponse.json({ error: 'invalid date' }, { status: 400 });
    data.date = body.date;
  }
  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    data.status = body.status;
  }
  if (body.description !== undefined) data.description = (body.description as string || '').trim() || null;
  if (body.color !== undefined) data.color = (body.color as string || '').trim() || null;

  const entry = await prisma.calendarEntry.update({ where: { id }, data });
  return NextResponse.json({ entry });
}

// DELETE — remove entry
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (request.headers.get('Idempotency-Key') !== null || request.headers.get('X-Calendar-Write-Recovery') !== null) return keyedCalendarMutation(request, session.user.id, 'DELETE', await request.json().catch(() => null), id);
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  const existing = await prisma.calendarEntry.findUnique({ where: { id } });
  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  await prisma.calendarEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
