import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUserPlan } from '@/lib/plans';
import { getNextAction } from '@/lib/next-action';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const skip = (req.nextUrl.searchParams.get('skip') || '').split(',').filter(Boolean);
  const langParam = req.nextUrl.searchParams.get('lang');
  const lang: 'es' | 'en' = langParam === 'en' ? 'en' : 'es';

  // getUserPlan ya resuelve 'free' cuando la suscripción no está en estado
  // pagado (active/trialing) — no hace falta volver a consultarla aquí.
  const plan = await getUserPlan(session.user.id);
  const isPaid = plan !== 'free';

  const action = await getNextAction(session.user.id, isPaid, skip, lang);
  return NextResponse.json({ action });
}
