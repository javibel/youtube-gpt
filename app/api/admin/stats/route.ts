import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

export async function GET() {
  const session = await auth();

  if (!ADMIN_EMAIL || session?.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 6);
  startOfWeek.setHours(0, 0, 0, 0);

  const [
    totalUsers,
    proUsers,
    newUsersThisMonth,
    newUsersLastMonth,
    totalGenerations,
    generationsThisMonth,
    generationsLastMonth,
    recentUsers,
    recentGenerations,
    templateBreakdown,
    dailyGenerations,
  ] = await Promise.all([
    // Usuarios totales
    prisma.user.count(),

    // Usuarios Pro activos
    prisma.subscription.count({ where: { status: "active" } }),

    // Nuevos usuarios este mes
    prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),

    // Nuevos usuarios mes pasado
    prisma.user.count({
      where: { createdAt: { gte: startOfLastMonth, lt: startOfMonth } },
    }),

    // Total generaciones
    prisma.generation.count(),

    // Generaciones este mes
    prisma.generation.count({ where: { createdAt: { gte: startOfMonth } } }),

    // Generaciones mes pasado
    prisma.generation.count({
      where: { createdAt: { gte: startOfLastMonth, lt: startOfMonth } },
    }),

    // Últimos 10 usuarios
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        subscription: { select: { status: true } },
        _count: { select: { generations: true } },
      },
    }),

    // Últimas 10 generaciones
    prisma.generation.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        template: true,
        createdAt: true,
        tokensUsed: true,
        user: { select: { email: true } },
      },
    }),

    // Breakdown por template (este mes)
    prisma.generation.groupBy({
      by: ["template"],
      where: { createdAt: { gte: startOfMonth } },
      _count: { template: true },
      orderBy: { _count: { template: "desc" } },
    }),

    // Generaciones por día últimos 7 días
    prisma.generation.findMany({
      where: { createdAt: { gte: startOfWeek } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Agrupar generaciones por día
  const dailyMap: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    dailyMap[d.toISOString().split("T")[0]] = 0;
  }
  for (const g of dailyGenerations) {
    const key = g.createdAt.toISOString().split("T")[0];
    if (key in dailyMap) dailyMap[key]++;
  }

  const mrr = proUsers * 9.99;
  const freeUsers = totalUsers - proUsers;
  const conversionRate = totalUsers > 0 ? (proUsers / totalUsers) * 100 : 0;

  return NextResponse.json({
    overview: {
      totalUsers,
      proUsers,
      freeUsers,
      mrr,
      conversionRate,
      totalGenerations,
    },
    thisMonth: {
      newUsers: newUsersThisMonth,
      newUsersLastMonth,
      generations: generationsThisMonth,
      generationsLastMonth,
    },
    templateBreakdown: templateBreakdown.map((t) => ({
      template: t.template,
      count: t._count.template,
    })),
    daily: Object.entries(dailyMap).map(([date, count]) => ({ date, count })),
    recentUsers: recentUsers.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      createdAt: u.createdAt,
      isPro: u.subscription?.status === "active",
      generationCount: u._count.generations,
    })),
    recentGenerations: recentGenerations.map((g) => ({
      id: g.id,
      template: g.template,
      createdAt: g.createdAt,
      tokensUsed: g.tokensUsed,
      userEmail: g.user.email,
    })),
  });
}
