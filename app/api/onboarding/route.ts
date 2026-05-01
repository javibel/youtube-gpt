import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

// GET: return current onboarding step
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { onboardingStep: true, name: true },
  });

  return NextResponse.json({ step: user?.onboardingStep ?? 0, name: user?.name });
}

// POST: advance onboarding step
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const step = typeof body.step === 'number' ? body.step : null;
  if (step === null || step < 0 || step > 99) {
    return NextResponse.json({ error: 'invalid step' }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { onboardingStep: step },
  });

  return NextResponse.json({ ok: true, step });
}
