import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserPlan, hasPaidAccess, isPaid } from '@/lib/plans';

const MAX_ENTRIES = 200;
const VALID_STATUSES = ['idea', 'draft', 'scheduled', 'published'];
class CalendarCreationConflict extends Error {}

// Retiring the HTTP waiter does not cancel or replace an original dependency.
function calendarHttpWait(signal: AbortSignal, duration = 30_000) {
  const deadline = performance.now() + duration;
  let retired = false;
  let rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => {
    if (!retired) { retired = true; rejectWait(new Error('Calendar HTTP unconfirmed')); }
  };
  const timer = setTimeout(retire, duration);
  signal.addEventListener('abort', retire, { once: true });
  const check = () => {
    if (signal.aborted || performance.now() >= deadline) retire();
    if (retired) throw new Error('Calendar HTTP unconfirmed');
  };
  return {
    async run<T>(operation: () => Promise<T>): Promise<T> {
      check();
      const original = Promise.resolve().then(() => { check(); return operation(); });
      const result = await Promise.race([original, stopped]);
      check();
      return result;
    },
    check,
    close() { clearTimeout(timer); signal.removeEventListener('abort', retire); },
  };
}

type CalendarHttpWait = ReturnType<typeof calendarHttpWait>;
async function boundedCalendarWrite(request: Request, handler: (wait: CalendarHttpWait) => Promise<Response>) {
  const wait = calendarHttpWait(request.signal);
  try {
    const response = await handler(wait);
    wait.check();
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return NextResponse.json({ error: 'calendar_write_unconfirmed' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  } finally { wait.close(); }
}

// GET — an owner-bound, complete SQL snapshot for the requested date range.
export async function GET(request: Request) {
  const wait = calendarHttpWait(request.signal, 25_000);
  const reply = (body: unknown, status = 200) => {
    const response = NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
    wait.check();
    return response;
  };
  try {
    const session = await wait.run(() => auth());
    if (typeof session?.user?.id !== 'string' || !session.user.id
      || typeof session.user.email !== 'string' || !session.user.email) {
      return reply({ error: 'unauthorized' }, 401);
    }
    const owner = Object.freeze({ id: session.user.id, email: session.user.email });
    const params = new URL(request.url).searchParams;
    const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
      && value.slice(0, 4) !== '0000'
      && new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) === value;
    const from = params.get('from'), to = params.get('to');
    let validRange = true;
    try {
      validRange = [...params.keys()].every(key => key === 'from' || key === 'to')
        && params.getAll('from').length <= 1 && params.getAll('to').length <= 1
        && (from === null || validDate(from)) && (to === null || validDate(to))
        && (from === null || to === null || from <= to);
    } catch { validRange = false; }
    if (!validRange) return reply({ error: 'invalid_range' }, 400);
    const range = Object.freeze({ from, to });
    const snapshot = await wait.run(() => prisma.$transaction(async tx => {
      wait.check();
      const selected = await tx.user.findUnique({
        where: { email: owner.email }, select: { id: true, email: true },
      });
      wait.check();
      if (!selected) return { status: 404, body: { error: 'owner_not_found' }, access: null };
      if (selected.id !== owner.id || selected.email !== owner.email)
        return { status: 401, body: { error: 'unauthorized' }, access: null };
      const subscription = await tx.subscription.findUnique({
        where: { userId: owner.id },
        select: { userId: true, status: true, plan: true, stripeCustomerId: true, currentPeriodEnd: true },
      });
      wait.check();
      if (subscription !== null && (subscription.userId !== owner.id
        || typeof subscription.status !== 'string' || !subscription.status
        || !['free', 'pro', 'business'].includes(subscription.plan)
        || (subscription.stripeCustomerId !== null && typeof subscription.stripeCustomerId !== 'string')))
        throw Error('Calendar read unconfirmed');
      const access = subscription === null ? null : Object.freeze({
        status: subscription.status, stripeCustomerId: subscription.stripeCustomerId,
        currentPeriodEnd: subscription.currentPeriodEnd === null ? null
          : new Date(Date.prototype.toISOString.call(subscription.currentPeriodEnd)),
      });
      if (subscription === null || !['pro', 'business'].includes(subscription.plan) || !hasPaidAccess(access))
        return { status: 403, body: { error: 'pro_required' }, access: null };
      // The extra row proves truncation. Never acknowledge a capped list as complete.
      const rows = await tx.calendarEntry.findMany({
        where: { userId: owner.id, ...((from !== null || to !== null) ? {
          date: { ...(from !== null ? { gte: from } : {}), ...(to !== null ? { lte: to } : {}) },
        } : {}) },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }], take: MAX_ENTRIES + 1,
        select: { id: true, userId: true, title: true, description: true, date: true,
          status: true, color: true, createdAt: true, updatedAt: true },
      });
      wait.check();
      if (!Array.isArray(rows) || rows.length > MAX_ENTRIES) throw Error('Calendar read unconfirmed');
      const ids = new Set<string>();
      const entries = Array.from(rows, row => {
        if (typeof row.id !== 'string' || !row.id || ids.has(row.id) || row.userId !== owner.id
          || typeof row.title !== 'string' || !row.title.trim() || row.title.length > 200
          || (row.description !== null && typeof row.description !== 'string')
          || typeof row.date !== 'string' || !validDate(row.date)
          || (from !== null && row.date < from) || (to !== null && row.date > to)
          || typeof row.status !== 'string' || !VALID_STATUSES.includes(row.status)
          || (row.color !== null && typeof row.color !== 'string')) throw Error('Calendar read unconfirmed');
        ids.add(row.id);
        return Object.freeze({ id: row.id, userId: owner.id, title: row.title,
          description: row.description, date: row.date, status: row.status, color: row.color,
          createdAt: Date.prototype.toISOString.call(row.createdAt),
          updatedAt: Date.prototype.toISOString.call(row.updatedAt),
        });
      });
      for (let i = 1; i < entries.length; i++) {
        const a = entries[i - 1], b = entries[i];
        if (a.date > b.date || (a.date === b.date && (a.createdAt > b.createdAt
          || (a.createdAt === b.createdAt && a.id > b.id)))) throw Error('Calendar read unconfirmed');
      }
      wait.check();
      return { status: 200, access, body: { owner, range,
        coverage: { complete: true, count: entries.length, limit: MAX_ENTRIES }, entries } };
    }, { isolationLevel: 'RepeatableRead', maxWait: 25_000, timeout: 25_000 }));
    wait.check();
    // A delayed transaction acknowledgement cannot renew declared manual access.
    if (snapshot.status === 200 && !hasPaidAccess(snapshot.access)) return reply({ error: 'pro_required' }, 403);
    return reply(snapshot.body, snapshot.status);
  } catch {
    return NextResponse.json({ error: 'calendar_read_unconfirmed' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  } finally { wait.close(); }
}

// POST — create entry
export async function POST(request: Request) {
  return boundedCalendarWrite(request, async wait => {
    const session = await wait.run(() => auth());
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const key = request.headers.get('Idempotency-Key');
    const recovery = request.headers.get('X-Calendar-Write-Recovery');
    if ((key !== null && !/^[-A-Za-z0-9._:]{1,128}$/.test(key))
      || (recovery !== null && (recovery !== 'retained-only-v1' || !key))) {
      return NextResponse.json({ error: 'invalid_recovery' }, { status: 400 });
    }

    const userId = session.user.id;
    const plan = await wait.run(() => getUserPlan(userId));
    if (!isPaid(plan)) {
      return NextResponse.json({ error: 'pro_required' }, { status: 403 });
    }

    const body = await wait.run(() => request.json().catch(() => ({})));
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

    try {
      const entry = await wait.run(() => prisma.$transaction(async (tx) => {
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
    }, { maxWait: 10_000, timeout: 15_000 }));
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
  });
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
async function keyedCalendarMutation(request: Request, userId: string, method: 'PUT' | 'DELETE', body: unknown, id: unknown, wait: CalendarHttpWait) {
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
    const result = await wait.run(() => prisma.$transaction(async tx => {
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
    }, { maxWait: 10000, timeout: 15000 }));
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store', 'X-Calendar-Write-Result': 'original-v1' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof CalendarMutationConflict ? error.message : 'calendar_write_unconfirmed' }, {
      status: error instanceof CalendarMutationConflict ? 409 : 503, headers: { 'Cache-Control': 'no-store' },
    });
  }
}

export async function PUT(request: Request) {
  return boundedCalendarWrite(request, async wait => {
    const session = await wait.run(() => auth());
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await wait.run(() => request.json().catch(() => ({})));
    if (request.headers.get('Idempotency-Key') !== null || request.headers.get('X-Calendar-Write-Recovery') !== null) return keyedCalendarMutation(request, userId, 'PUT', body, body?.id, wait);
    const id = body.id as string;
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const existing = await wait.run(() => prisma.calendarEntry.findUnique({ where: { id } }));
    if (!existing || existing.userId !== userId) {
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

    const entry = await wait.run(() => prisma.calendarEntry.update({ where: { id }, data }));
    return NextResponse.json({ entry });
  });
}

// DELETE — remove entry
export async function DELETE(request: Request) {
  return boundedCalendarWrite(request, async wait => {
    const session = await wait.run(() => auth());
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (request.headers.get('Idempotency-Key') !== null || request.headers.get('X-Calendar-Write-Recovery') !== null) return keyedCalendarMutation(request, userId, 'DELETE', await wait.run(() => request.json().catch(() => null)), id, wait);
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const existing = await wait.run(() => prisma.calendarEntry.findUnique({ where: { id } }));
    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    await wait.run(() => prisma.calendarEntry.delete({ where: { id } }));
    return NextResponse.json({ ok: true });
  });
}
