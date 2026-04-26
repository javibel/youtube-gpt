import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

function calcStreak(dates: Date[]): number {
  if (!dates.length) return 0;

  // Unique days in UTC (YYYY-MM-DD)
  const days = new Set(dates.map((d) => d.toISOString().split('T')[0]));

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // Si hoy no tiene generación, empezamos desde ayer
  const cursor = new Date(today);
  if (!days.has(todayStr)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while (true) {
    const dateStr = cursor.toISOString().split('T')[0];
    if (days.has(dateStr)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

export async function GET() {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, name: true, createdAt: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalGenerations, generationsThisMonth, subscription, allDates] =
    await Promise.all([
      prisma.generation.count({ where: { userId: user.id } }),
      prisma.generation.count({
        where: { userId: user.id, createdAt: { gte: startOfMonth } },
      }),
      prisma.subscription.findUnique({
        where: { userId: user.id },
        select: { status: true, cancelAtPeriodEnd: true, currentPeriodEnd: true },
      }),
      prisma.generation.findMany({
        where: {
          userId: user.id,
          createdAt: { gte: new Date(Date.now() - 60 * 24 * 3600 * 1000) },
        },
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  const isPro = subscription?.status === 'active';
  const FREE_LIMIT = 10;
  const PRO_LIMIT = 200;
  const limit = isPro ? PRO_LIMIT : FREE_LIMIT;
  const streak = calcStreak(allDates.map((g) => g.createdAt));

  return NextResponse.json({
    user: { email: user.email, name: user.name, createdAt: user.createdAt },
    stats: {
      totalGenerations,
      generationsThisMonth,
      limit,
      remaining: Math.max(0, limit - generationsThisMonth),
      isPro,
      streak,
    },
    subscription: subscription ?? null,
  });
}
