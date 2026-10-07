import { historyOutputTokens } from "@/lib/ai/history-usage";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 10;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const suppliedPage = req.nextUrl.searchParams.get("page") ?? "1";
  if (!/^[1-9]\d{0,6}$/.test(suppliedPage) || Number(suppliedPage) > 1000000) {
    return NextResponse.json({ error: "Página no válida" }, { status: 400 });
  }
  const page = Number(suppliedPage);
  const skip = (page - 1) * PAGE_SIZE;

  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const [total, generations] = await Promise.all([
      prisma.generation.count({ where: { userId: user.id } }),
      prisma.generation.findMany({
        where: { userId: user.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: PAGE_SIZE,
        select: {
          id: true,
          template: true,
          createdAt: true,
          tokensUsed: true,
          output: true,
          inputs: true,
        },
      }),
    ]);

    return NextResponse.json({
      generations: generations.map((g) => ({ ...g, tokensUsed: historyOutputTokens(g.tokensUsed) })),
      total,
      page,
      hasMore: skip + generations.length < total,
    });
  } catch {
    return NextResponse.json({ error: "Historial no disponible" }, { status: 503 });
  }
}
