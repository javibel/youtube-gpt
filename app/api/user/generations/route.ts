import { historyOutputTokens } from "@/lib/ai/history-usage";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const maxDuration = 30;
const PAGE_SIZE = 10;

export async function GET(req: NextRequest) {
  // Retire only the HTTP wait; never cancel or repeat the original SQL reads.
  const deadline = performance.now() + 25_000;
  let retired = false, rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => {
    if (!retired) { retired = true; rejectWait(Error("History unavailable")); }
  };
  const timer = setTimeout(retire, 25_000);
  req.signal?.addEventListener("abort", retire, { once: true });
  const check = () => {
    if (req.signal?.aborted || performance.now() >= deadline) retire();
    if (retired) throw Error("History unavailable");
  };
  const reply = (body: unknown, status = 200) =>
    NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

  try {
    const original = Promise.resolve().then(async () => {
      check();
      const session = await auth();
      check();
      if (typeof session?.user?.id !== "string" || !session.user.id
        || typeof session.user.email !== "string" || !session.user.email)
        return reply({ error: "No autorizado" }, 401);
      const owner = Object.freeze({ id: session.user.id, email: session.user.email });
      const suppliedPage = req.nextUrl.searchParams.get("page") ?? "1";
      if (!/^[1-9]\d{0,6}$/.test(suppliedPage) || Number(suppliedPage) > 1000000)
        return reply({ error: "Página no válida" }, 400);
      const page = Number(suppliedPage), skip = (page - 1) * PAGE_SIZE;
      const selected = await prisma.user.findUnique({
        where: { email: owner.email }, select: { id: true, email: true },
      });
      check();
      if (!selected) return reply({ error: "Usuario no encontrado" }, 404);
      if (selected.id !== owner.id || selected.email !== owner.email)
        return reply({ error: "No autorizado" }, 401);
      const read = async <T, R>(query: () => PromiseLike<T>, project: (value: T) => R) => {
        check();
        const value = await query();
        check();
        return project(value);
      };
      const [total, generations] = await Promise.all([
        read(() => prisma.generation.count({ where: { userId: owner.id } }), value => {
          if (!Number.isSafeInteger(value) || value < 0) throw Error("History unavailable");
          return value;
        }),
        read(() => prisma.generation.findMany({
          where: { userId: owner.id },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip, take: PAGE_SIZE,
          select: { id: true, template: true, createdAt: true, tokensUsed: true, output: true, inputs: true },
        }), values => {
          if (!Array.isArray(values) || values.length > PAGE_SIZE) throw Error("History unavailable");
          const ids = new Set<string>();
          return values.map(value => {
            if (typeof value.id !== "string" || !value.id || ids.has(value.id)
              || typeof value.template !== "string" || typeof value.output !== "string")
              throw Error("History unavailable");
            ids.add(value.id);
            // Capture nested JSON and dates as this branch resolves, before
            // another branch leaves a mutable source row pending.
            const inputs = JSON.parse(JSON.stringify(value.inputs));
            return Object.freeze({
              id: value.id, template: value.template, createdAt: value.createdAt.toISOString(),
              tokensUsed: historyOutputTokens(value.tokensUsed), output: value.output, inputs,
            });
          });
        }),
      ]);
      check();
      // Count and page are separate observations; concurrent writes may change
      // their totals. Preserve them without manufacturing cross-query equality.
      return reply({ generations, total, page, hasMore: skip + generations.length < total });
    });
    const response = await Promise.race([original, stopped]);
    check();
    return response;
  } catch {
    return reply({ error: "Historial no disponible" }, 503);
  } finally {
    retire();
    clearTimeout(timer);
    req.signal?.removeEventListener("abort", retire);
  }
}
