import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const { email, source, referrer } = await request.json() as {
    email?: string;
    source?: string;
    referrer?: string;
  };

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }

  const existing = await prisma.launchWaitlist.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (existing) {
    return NextResponse.json({ ok: true, alreadyJoined: true });
  }

  await prisma.launchWaitlist.create({
    data: {
      email: email.toLowerCase().trim(),
      source: source || 'launch-page',
      referrer: referrer || null,
    },
  });

  const count = await prisma.launchWaitlist.count();

  return NextResponse.json({ ok: true, position: count });
}

export async function GET() {
  const count = await prisma.launchWaitlist.count();
  return NextResponse.json({ count });
}
