import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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

  const [totalGenerations, generationsThisMonth, recentGenerations, subscription] =
    await Promise.all([
      prisma.generation.count({ where: { userId: user.id } }),
      prisma.generation.count({
        where: { userId: user.id, createdAt: { gte: startOfMonth } },
      }),
      prisma.generation.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          template: true,
          createdAt: true,
          tokensUsed: true,
        },
      }),
      prisma.subscription.findUnique({
        where: { userId: user.id },
        select: { status: true, cancelAtPeriodEnd: true, currentPeriodEnd: true },
      }),
    ]);

  const isPro = subscription?.status === 'active';
  const FREE_LIMIT = 10;
  const PRO_LIMIT = 200;
  const limit = isPro ? PRO_LIMIT : FREE_LIMIT;

  return NextResponse.json({
    user: { email: user.email, name: user.name, createdAt: user.createdAt },
    stats: {
      totalGenerations,
      generationsThisMonth,
      limit,
      remaining: Math.max(0, limit - generationsThisMonth),
      isPro,
    },
    recentGenerations,
    subscription: subscription ?? null,
  });
}
