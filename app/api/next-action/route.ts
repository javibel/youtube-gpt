import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUserPlan } from '@/lib/plans';
import { getNextActions } from '@/lib/next-action';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const skip = (req.nextUrl.searchParams.get('skip') || '').split(',').filter(Boolean);

  // getUserPlan ya resuelve 'free' cuando la suscripción no está en estado
  // pagado (active/trialing) — no hace falta volver a consultarla aquí.
  // No hay parámetro de idioma: la respuesta lleva siempre ES y EN y el
  // cliente elige al renderizar.
  const plan = await getUserPlan(session.user.id);
  const isPaid = plan !== 'free';

  // Se devuelve la lista completa (para navegar) y `action`, la primera no
  // descartada, que es lo que el cliente muestra por defecto.
  const actions = await getNextActions(session.user.id, isPaid);
  const skipSet = new Set(skip);
  const action = actions.find(a => !skipSet.has(a.id)) ?? null;
  return NextResponse.json({ action, actions });
}
