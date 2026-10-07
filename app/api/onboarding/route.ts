import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const select = { id: true, onboardingStep: true, name: true };
const reply = (user: { id: string; onboardingStep: number; name: string | null } | null) => user
  ? NextResponse.json({ userId: user.id, step: user.onboardingStep, name: user.name })
  : NextResponse.json({ error: 'account not found' }, { status: 404 });

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    return reply(await prisma.user.findUnique({ where: { id: session.user.id }, select }));
  } catch {
    return NextResponse.json({ error: 'onboarding unavailable' }, { status: 503 });
  }
}

// POST: advance onboarding step
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let step: unknown;
  try { step = (await request.json())?.step; } catch { /* invalid JSON */ }
  if (typeof step !== 'number' || !Number.isSafeInteger(step) || step < 0 || step > 99) {
    return NextResponse.json({ error: 'invalid step' }, { status: 400 });
  }

  try {
    // Absolute, monotonic writes: retries and late requests cannot reopen completed onboarding.
    await prisma.user.updateMany({
      where: { id: session.user.id, onboardingStep: { lt: step } },
      data: { onboardingStep: step },
    });
    return reply(await prisma.user.findUnique({ where: { id: session.user.id }, select }));
  } catch {
    return NextResponse.json({ error: 'onboarding unavailable' }, { status: 503 });
  }
}
