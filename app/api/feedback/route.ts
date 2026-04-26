import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/feedback?token=xxx — return lang + already submitted
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const record = await prisma.userFeedback.findUnique({ where: { token } });
  if (!record) return NextResponse.json({ error: 'Invalid token' }, { status: 404 });

  return NextResponse.json({
    lang: record.lang,
    submitted: !!record.submittedAt,
  });
}

// POST /api/feedback — save rating + comment
export async function POST(request: Request) {
  const { token, rating, comment } = await request.json() as {
    token: string;
    rating: number;
    comment?: string;
  };

  if (!token || !rating || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const record = await prisma.userFeedback.findUnique({ where: { token } });
  if (!record) return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
  if (record.submittedAt) return NextResponse.json({ error: 'Already submitted' }, { status: 409 });

  await prisma.userFeedback.update({
    where: { token },
    data: { rating, comment: comment?.trim() || null, submittedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
