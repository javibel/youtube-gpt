import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getLimits, hasPaidAccess, isPaid, type PlanType } from "@/lib/plans";
import { readGenerationQuotaSnapshot } from '@/lib/generation-quota';

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

  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, email: true, name: true, lang: true, createdAt: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    if (user.id !== session.user.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalGenerations, quota, videoTipsThisMonth, subscription, allDates] =
      await Promise.all([
        prisma.generation.count({ where: { userId: user.id } }),
        readGenerationQuotaSnapshot(user.id, startOfMonth),
        // Video Tips free (26/08): tope de 1/mes ademas del pool general — ver
        // app/api/storyboard/route.ts (FREE_VIDEO_TIPS_PER_MONTH).
        prisma.generation.count({
          where: { userId: user.id, template: 'video_preview', createdAt: { gte: startOfMonth } },
        }),
        prisma.subscription.findUnique({
          where: { userId: user.id },
          select: { status: true, plan: true, cancelAtPeriodEnd: true, currentPeriodEnd: true, stripeCustomerId: true },
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

    const plan: PlanType = hasPaidAccess(subscription)
      ? (subscription!.plan === 'business' ? 'business' : 'pro')
      : 'free';
    const isProUser = isPaid(plan);
    const limits = getLimits(plan);
    const limit = limits.generationsPerMonth;
    const streak = calcStreak(allDates.map((g) => g.createdAt));

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, lang: user.lang, createdAt: user.createdAt },
      stats: {
        totalGenerations,
        generationsThisMonth: quota.recorded,
        generationsReserved: quota.reserved,
        quotaOccupied: quota.total,
        limit,
        remaining: Math.max(0, limit - quota.total),
        isPro: isProUser,
        plan,
        streak,
        videoTipsRemaining: isProUser ? null : Math.max(0, 1 - videoTipsThisMonth),
      },
      subscription: subscription ?? null,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: "Estadísticas no disponibles" }, { status: 503 });
  }
}
