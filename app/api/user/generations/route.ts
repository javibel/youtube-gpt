import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 10;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10));
  const skip = (page - 1) * PAGE_SIZE;

  const [total, generations] = await Promise.all([
    prisma.generation.count({ where: { userId: user.id } }),
    prisma.generation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
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
    generations,
    total,
    page,
    hasMore: skip + generations.length < total,
  });
}
