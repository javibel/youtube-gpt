import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserPlan, isPaid } from '@/lib/plans';

const MAX_ENTRIES = 200;
const VALID_STATUSES = ['idea', 'draft', 'scheduled', 'published'];

// GET — list entries for a month (or range)
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const plan = await getUserPlan(session.user.id);
  if (!isPaid(plan)) {
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';

  const where: { userId: string; date?: { gte?: string; lte?: string } } = {
    userId: session.user.id,
  };
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = from;
    if (to) where.date.lte = to;
  }

  const entries = await prisma.calendarEntry.findMany({
    where,
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    take: MAX_ENTRIES,
  });

  return NextResponse.json({ entries });
}

// POST — create entry
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
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
      const count = await tx.calendarEntry.count({ where: { userId } });
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('Calendar count unconfirmed');
      if (count >= MAX_ENTRIES) return null;
      if (request.signal.aborted) throw new Error('Calendar request aborted');
      return tx.calendarEntry.create({
        data: { userId, title, description: description || null, date, status, color },
      });
    }, { maxWait: 10_000, timeout: 15_000 });
    if (!entry) return NextResponse.json({ error: 'max_entries' }, { status: 400 });
    return NextResponse.json({ entry }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'calendar_write_unconfirmed' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  }
}

// PUT — update entry
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
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
