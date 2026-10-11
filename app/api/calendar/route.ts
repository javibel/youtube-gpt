import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserPlan, hasPaidAccess, isPaid } from '@/lib/plans';

const MAX_ENTRIES = 200;
const VALID_STATUSES = ['idea', 'draft', 'scheduled', 'published'];
class CalendarCreationConflict extends Error {}
class CalendarCreationDenied extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

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

// POST — create one entry under the captured owner and original input.
export async function POST(request: Request) {
  return boundedCalendarWrite(request, async wait => {
    const session = await wait.run(() => auth());
    if (typeof session?.user?.id !== 'string' || !session.user.id
      || typeof session.user.email !== 'string' || !session.user.email) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const owner = Object.freeze({ id: session.user.id, email: session.user.email });
    const userId = owner.id, key = request.headers.get('Idempotency-Key');
    const recovery = request.headers.get('X-Calendar-Write-Recovery');
    if ((key !== null && !/^[-A-Za-z0-9._:]{1,128}$/.test(key))
      || (recovery !== null && (recovery !== 'retained-only-v1' || !key))) {
      return NextResponse.json({ error: 'invalid_recovery' }, { status: 400 });
    }
    const body = await wait.run(() => request.json().catch(() => ({})));
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some(name => !['title', 'description', 'date', 'status', 'color'].includes(name))
      || typeof body.title !== 'string' || typeof body.date !== 'string'
      || (body.description != null && typeof body.description !== 'string')
      || (body.color != null && typeof body.color !== 'string')
      || (body.status !== undefined && !VALID_STATUSES.includes(body.status))) {
      return NextResponse.json({ error: 'invalid entry' }, { status: 400 });
    }
    const title = body.title.trim(), date = body.date, description = (body.description || '').trim();
    const status = body.status === undefined ? 'idea' : body.status, color = (body.color || '').trim() || null;
    if (!title || title.length > 200) return NextResponse.json({ error: 'title required (max 200)' }, { status: 400 });
    let canonical = false;
    try { canonical = /^\d{4}-\d{2}-\d{2}$/.test(date) && !date.startsWith('0000-')
      && new Date(date + 'T00:00:00.000Z').toISOString().slice(0, 10) === date; } catch { /* Invalid civil day. */ }
    if (!canonical) return NextResponse.json({ error: 'date required (YYYY-MM-DD)' }, { status: 400 });
    const values = Object.freeze({ title, description: description || null, date, status, color });
    const input = JSON.stringify(values);
    if (input.length > 65_536) return NextResponse.json({ error: 'invalid entry' }, { status: 400 });
    type StoredEntry = { id: string; userId: string; title: string; description: string | null;
      date: string; status: string; color: string | null; createdAt: Date; updatedAt: Date };
    const capture = (row: StoredEntry, expectedId?: string) => {
      if (!row || typeof row.id !== 'string' || !row.id || (expectedId !== undefined && row.id !== expectedId)
        || row.userId !== owner.id) throw Error('Calendar original unconfirmed');
      const storedInput = JSON.stringify({ title: row.title, description: row.description,
        date: row.date, status: row.status, color: row.color });
      if (storedInput !== input) throw new CalendarCreationConflict('calendar_entry_changed');
      return Object.freeze({ id: row.id, userId: owner.id, ...values,
        createdAt: Date.prototype.toISOString.call(row.createdAt), updatedAt: Date.prototype.toISOString.call(row.updatedAt) });
    };
    try {
      const result = await wait.run(() => prisma.$transaction(async tx => {
        wait.check();
        // Lock owner, then paid source in the same order as billing writers.
        const owners = await tx.$queryRawUnsafe<Array<{ id: string; email: string }>>(
          'SELECT id,email FROM users WHERE id=$1 FOR UPDATE', owner.id);
        wait.check();
        if (!Array.isArray(owners) || owners.length > 1
          || (owners.length === 1 && (typeof owners[0].id !== 'string' || typeof owners[0].email !== 'string')))
          throw Error('Calendar owner unconfirmed');
        if (owners.length !== 1 || owners[0].id !== owner.id || owners[0].email !== owner.email)
          throw new CalendarCreationDenied(401, 'unauthorized');
        const locks = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          'SELECT id FROM subscriptions WHERE "userId"=$1 FOR UPDATE', owner.id);
        wait.check();
        if (!Array.isArray(locks) || locks.length > 1 || (locks.length === 1 && (typeof locks[0].id !== 'string' || !locks[0].id)))
          throw Error('Calendar plan unconfirmed');
        const lockedId = locks[0]?.id;
        const selected = await tx.subscription.findUnique({ where: { userId: owner.id },
          select: { id: true, userId: true, status: true, plan: true, stripeCustomerId: true, currentPeriodEnd: true } });
        wait.check();
        if (selected === null) {
          if (locks.length !== 0) throw Error('Calendar plan unconfirmed');
          throw new CalendarCreationDenied(403, 'pro_required');
        }
        if (locks.length !== 1 || selected.id !== lockedId || selected.userId !== owner.id
          || typeof selected.status !== 'string' || !selected.status || !['free', 'pro', 'business'].includes(selected.plan)
          || (selected.stripeCustomerId !== null && typeof selected.stripeCustomerId !== 'string'))
          throw Error('Calendar plan unconfirmed');
        const access = Object.freeze({ status: selected.status, stripeCustomerId: selected.stripeCustomerId,
          currentPeriodEnd: selected.currentPeriodEnd === null ? null : new Date(Date.prototype.toISOString.call(selected.currentPeriodEnd)) });
        const selectedPlan = selected.plan;
        const checkPaid = () => {
          wait.check();
          if (!['pro', 'business'].includes(selectedPlan) || !hasPaidAccess(access))
            throw new CalendarCreationDenied(403, 'pro_required');
        };
        checkPaid();
        if (key) {
          const record = await tx.calendarCreationReceipt.findUnique({ where: { userId_key: { userId, key } } });
          checkPaid();
          if (record) {
            if (record.userId !== userId || record.key !== key || typeof record.input !== 'string'
              || (record.entryId !== null && (typeof record.entryId !== 'string' || !record.entryId)))
              throw Error('Calendar receipt unconfirmed');
            const original = Object.freeze({ input: record.input, entryId: record.entryId });
            if (original.input !== input) throw new CalendarCreationConflict('calendar_key_conflict');
            // Select the existing business result only; it never admits another creation.
            if (!original.entryId) throw Error('Calendar original unavailable');
            const retained = await tx.calendarEntry.findUnique({ where: { id: original.entryId } });
            checkPaid();
            if (!retained) throw Error('Calendar original unavailable');
            return { entry: capture(retained, original.entryId), access };
          }
          if (recovery === 'retained-only-v1') throw Error('Calendar original unconfirmed');
        }
        const count = await tx.calendarEntry.count({ where: { userId } });
        checkPaid();
        if (!Number.isSafeInteger(count) || count < 0) throw Error('Calendar count unconfirmed');
        if (count >= MAX_ENTRIES) return { entry: null, access };
        const created = await tx.calendarEntry.create({ data: { userId, ...values } });
        wait.check();
        if (!hasPaidAccess(access)) throw Error('Calendar write unconfirmed');
        const entry = capture(created);
        if (key) {
          const receipt = await tx.calendarCreationReceipt.create({ data: { userId, key, input, entryId: entry.id } });
          wait.check();
          if (!hasPaidAccess(access) || receipt.userId !== userId || receipt.key !== key
            || receipt.input !== input || receipt.entryId !== entry.id) throw Error('Calendar receipt unconfirmed');
        }
        wait.check();
        if (!hasPaidAccess(access)) throw Error('Calendar write unconfirmed');
        return { entry, access };
      }, { maxWait: 10_000, timeout: 15_000 }));
      wait.check();
      if (!hasPaidAccess(result.access)) throw Error('Calendar write unconfirmed');
      if (!result.entry) return NextResponse.json({ error: 'max_entries' }, { status: 400 });
      return NextResponse.json({ entry: result.entry }, { status: 201 });
    } catch (error) {
      if (error instanceof CalendarCreationDenied) return NextResponse.json({ error: error.code }, { status: error.status });
      if (error instanceof CalendarCreationConflict) return NextResponse.json({ error: error.message }, { status: 409 });
      return NextResponse.json({ error: 'calendar_write_unconfirmed' }, { status: 503 });
    }
  });
}

// PUT/DELETE — captured input under the original owner and paid SQL source.
class CalendarMutationConflict extends Error {}
class CalendarMutationDenied extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
function calendarMutationDay(value: unknown): value is string {
  try { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !value.startsWith('0000-') && new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) === value;
  } catch { return false; }
}
function calendarSnapshot(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'color,date,description,status,title'
    || typeof v.title !== 'string' || !v.title.trim() || v.title.length > 200
    || !calendarMutationDay(v.date) || typeof v.status !== 'string' || !VALID_STATUSES.includes(v.status)
    || (v.description !== null && typeof v.description !== 'string')
    || (v.color !== null && typeof v.color !== 'string')) return null;
  return Object.freeze({ title: v.title, description: v.description, date: v.date, status: v.status, color: v.color });
}

// A business receipt confirms only the original mutation. It never proves current
// row state, cancellation, or authority to recover an executor or another write.
async function calendarMutation(request: Request, method: 'PUT' | 'DELETE', wait: CalendarHttpWait) {
  const invalid = () => NextResponse.json({ error: 'invalid mutation' }, { status: 400 });
  const session = await wait.run(() => auth());
  if (typeof session?.user?.id !== 'string' || !session.user.id
    || typeof session.user.email !== 'string' || !session.user.email)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const owner = Object.freeze({ id: session.user.id, email: session.user.email });
  const key = request.headers.get('Idempotency-Key'), recovery = request.headers.get('X-Calendar-Write-Recovery');
  if ((key !== null && !/^[-A-Za-z0-9._:]{1,128}$/.test(key))
    || (recovery !== null && (recovery !== 'retained-only-v1' || !key))) return invalid();
  const params = new URL(request.url).searchParams;
  if (method === 'DELETE' && ([...params.keys()].some(name => name !== 'id') || params.getAll('id').length !== 1)) return invalid();
  const body = method === 'PUT' || key ? await wait.run(() => request.json().catch(() => null)) : {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid();
  const b = body as Record<string, unknown>, id = method === 'PUT' ? b.id : params.get('id');
  if (typeof id !== 'string' || !id || id.length > 128
    || Object.keys(b).some(name => !(method === 'PUT'
      ? ['id', 'title', 'description', 'date', 'status', 'color', 'expected'] : ['expected']).includes(name))) return invalid();
  const expected = b.expected === undefined && !key ? null : calendarSnapshot(b.expected);
  if ((key || b.expected !== undefined) && !expected) return invalid();
  const patch: { title?: string; description?: string | null; date?: string; status?: string; color?: string | null } = {};
  if (method === 'PUT') {
    if (b.title !== undefined) { if (typeof b.title !== 'string' || !b.title.trim() || b.title.trim().length > 200) return invalid(); patch.title = b.title.trim(); }
    if (b.description !== undefined) { if (b.description !== null && typeof b.description !== 'string') return invalid(); patch.description = (b.description as string | null)?.trim() || null; }
    if (b.date !== undefined) { if (!calendarMutationDay(b.date)) return invalid(); patch.date = b.date; }
    if (b.status !== undefined) { if (typeof b.status !== 'string' || !VALID_STATUSES.includes(b.status)) return invalid(); patch.status = b.status; }
    if (b.color !== undefined) { if (b.color !== null && typeof b.color !== 'string') return invalid(); patch.color = (b.color as string | null)?.trim() || null; }
    if (!Object.keys(patch).length) return invalid();
  }
  const data = Object.freeze(patch), input = JSON.stringify({ id, expected, data });
  if (input.length > 65_536) return invalid();
  type Row = { id: string; userId: string; title: string; description: string | null; date: string;
    status: string; color: string | null; createdAt: Date; updatedAt: Date };
  const capture = (row: Row) => {
    if (!row || row.id !== id || row.userId !== owner.id) throw Error('Calendar row unconfirmed');
    const fields = calendarSnapshot({ title: row.title, description: row.description, date: row.date, status: row.status, color: row.color });
    if (!fields) throw Error('Calendar row unconfirmed');
    return Object.freeze({ id, userId: owner.id, ...fields,
      createdAt: Date.prototype.toISOString.call(row.createdAt), updatedAt: Date.prototype.toISOString.call(row.updatedAt) });
  };
  try {
    const result = await wait.run(() => prisma.$transaction(async tx => {
      wait.check();
      const owners = await tx.$queryRawUnsafe<Array<{ id: string; email: string }>>(
        'SELECT id,email FROM users WHERE id=$1 FOR UPDATE', owner.id);
      wait.check();
      if (!Array.isArray(owners) || owners.length > 1 || (owners.length === 1
        && (typeof owners[0].id !== 'string' || typeof owners[0].email !== 'string'))) throw Error('Calendar owner unconfirmed');
      if (owners.length !== 1 || owners[0].id !== owner.id || owners[0].email !== owner.email)
        throw new CalendarMutationDenied(401, 'unauthorized');
      const locks = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        'SELECT id FROM subscriptions WHERE "userId"=$1 FOR UPDATE', owner.id);
      wait.check();
      if (!Array.isArray(locks) || locks.length > 1 || (locks.length === 1
        && (typeof locks[0].id !== 'string' || !locks[0].id))) throw Error('Calendar source unconfirmed');
      const lockedId = locks[0]?.id;
      const selected = await tx.subscription.findUnique({ where: { userId: owner.id },
        select: { id: true, userId: true, status: true, plan: true, stripeCustomerId: true, currentPeriodEnd: true } });
      wait.check();
      if (selected === null) { if (locks.length) throw Error('Calendar source unconfirmed'); throw new CalendarMutationDenied(403, 'pro_required'); }
      if (locks.length !== 1 || selected.id !== lockedId || selected.userId !== owner.id
        || typeof selected.status !== 'string' || !selected.status || !['free', 'pro', 'business'].includes(selected.plan)
        || (selected.stripeCustomerId !== null && typeof selected.stripeCustomerId !== 'string')) throw Error('Calendar source unconfirmed');
      const plan = selected.plan, access = Object.freeze({ status: selected.status, stripeCustomerId: selected.stripeCustomerId,
        currentPeriodEnd: selected.currentPeriodEnd === null ? null : new Date(Date.prototype.toISOString.call(selected.currentPeriodEnd)) });
      const checkPaid = () => { wait.check(); if (!['pro', 'business'].includes(plan) || !hasPaidAccess(access))
        throw new CalendarMutationDenied(403, 'pro_required'); };
      checkPaid();
      if (key) {
        const record = await tx.calendarMutationReceipt.findUnique({ where: { userId_key: { userId: owner.id, key } } });
        checkPaid();
        if (record) {
          if (record.userId !== owner.id || record.key !== key || typeof record.input !== 'string'
            || typeof record.output !== 'string' || record.output.length > 65_536) throw Error('Calendar receipt unconfirmed');
          const receipt = Object.freeze({ method: record.method, entryId: record.entryId, input: record.input, output: record.output });
          if (receipt.method !== method || receipt.entryId !== id || receipt.input !== input)
            throw new CalendarMutationConflict('calendar_key_conflict');
          const retained = JSON.parse(receipt.output);
          if (!retained || retained.originalMutation !== true || Object.keys(retained).sort().join(',') !==
            (method === 'PUT' ? 'entry,originalMutation' : 'id,ok,originalMutation')) throw Error('Calendar output unconfirmed');
          if (method === 'PUT') {
            const e = retained.entry, fields = e && calendarSnapshot({ title: e.title, description: e.description, date: e.date, status: e.status, color: e.color });
            if (!fields || e.id !== id || e.userId !== owner.id || Object.keys(e).sort().join(',') !==
              'color,createdAt,date,description,id,status,title,updatedAt,userId') throw Error('Calendar output unconfirmed');
            for (const [field, value] of Object.entries({ ...expected, ...data }))
              if (e[field] !== value) throw Error('Calendar output unconfirmed');
            for (const instant of [e.createdAt, e.updatedAt])
              if (typeof instant !== 'string' || new Date(instant).toISOString() !== instant) throw Error('Calendar output unconfirmed');
            Object.freeze(e);
          } else if (retained.ok !== true || retained.id !== id) throw Error('Calendar output unconfirmed');
          return Object.freeze({ output: Object.freeze(retained), access });
        }
        if (recovery === 'retained-only-v1') throw Error('Calendar original unavailable');
      }
      const locked = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        'SELECT id FROM calendar_entries WHERE id=$1 AND "userId"=$2 FOR UPDATE', id, owner.id);
      checkPaid();
      if (!Array.isArray(locked) || locked.length > 1 || (locked.length === 1 && locked[0].id !== id)) throw Error('Calendar row unconfirmed');
      if (locked.length !== 1) { if (key) throw new CalendarMutationConflict('calendar_entry_unavailable'); throw new CalendarMutationDenied(404, 'not found'); }
      const row = await tx.calendarEntry.findUnique({ where: { id } });
      checkPaid();
      const current = capture(row as Row), fields = calendarSnapshot({ title: current.title, description: current.description,
        date: current.date, status: current.status, color: current.color });
      if (expected && JSON.stringify(fields) !== JSON.stringify(expected)) throw new CalendarMutationConflict('calendar_entry_changed');
      const changed = method === 'PUT' ? await tx.calendarEntry.update({ where: { id }, data }) : await tx.calendarEntry.delete({ where: { id } });
      wait.check();
      if (!hasPaidAccess(access)) throw Error('Calendar mutation unconfirmed');
      const captured = capture(changed);
      if (captured.createdAt !== current.createdAt || JSON.stringify(calendarSnapshot({ title: captured.title,
        description: captured.description, date: captured.date, status: captured.status, color: captured.color }))
        !== JSON.stringify(method === 'PUT' ? { ...fields, ...data } : fields)) throw Error('Calendar mutation unconfirmed');
      const output = Object.freeze(method === 'PUT' ? { entry: captured, ...(key ? { originalMutation: true } : {}) }
        : { ok: true, ...(key ? { id, originalMutation: true } : {}) });
      if (key) {
        const serialized = JSON.stringify(output);
        if (serialized.length > 65_536) throw Error('Calendar output unconfirmed');
        const stored = await tx.calendarMutationReceipt.create({ data: { userId: owner.id, key, method, entryId: id, input, output: serialized } });
        wait.check();
        if (!hasPaidAccess(access) || stored.userId !== owner.id || stored.key !== key || stored.method !== method
          || stored.entryId !== id || stored.input !== input || stored.output !== serialized) throw Error('Calendar receipt unconfirmed');
      }
      wait.check();
      if (!hasPaidAccess(access)) throw Error('Calendar mutation unconfirmed');
      return Object.freeze({ output, access });
    }, { maxWait: 10_000, timeout: 15_000 }));
    wait.check();
    if (!hasPaidAccess(result.access)) throw Error('Calendar mutation unconfirmed');
    const response = NextResponse.json(result.output, { headers: key ? { 'X-Calendar-Write-Result': 'original-v1' } : {} });
    wait.check();
    if (!hasPaidAccess(result.access)) throw Error('Calendar mutation unconfirmed');
    return response;
  } catch (error) {
    if (error instanceof CalendarMutationDenied) return NextResponse.json({ error: error.code }, { status: error.status });
    if (error instanceof CalendarMutationConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: 'calendar_write_unconfirmed' }, { status: 503 });
  }
}
export async function PUT(request: Request) {
  return boundedCalendarWrite(request, wait => calendarMutation(request, 'PUT', wait));
}
export async function DELETE(request: Request) {
  return boundedCalendarWrite(request, wait => calendarMutation(request, 'DELETE', wait));
}
