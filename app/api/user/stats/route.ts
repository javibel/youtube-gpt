import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getLimits, hasPaidAccess, isPaid, type PlanType } from "@/lib/plans";
import { readGenerationQuotaSnapshot } from "@/lib/generation-quota";

export const maxDuration = 30;

function count(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw Error("Statistics unavailable");
  return value;
}

function date(value: Date): string {
  return value.toISOString();
}

function calcStreak(dates: string[]): number {
  const days = new Set(dates.map(d => d.split("T")[0]));
  const cursor = new Date();
  if (!days.has(cursor.toISOString().split("T")[0])) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (days.has(cursor.toISOString().split("T")[0])) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export async function GET(request?: Request) {
  // This retires the HTTP wait. The original read is not cancelled or retried.
  const deadline = performance.now() + 25_000;
  let retired = false, rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => {
    if (!retired) { retired = true; rejectWait(Error("Statistics unavailable")); }
  };
  const timer = setTimeout(retire, 25_000);
  request?.signal.addEventListener("abort", retire, { once: true });
  const check = () => {
    if (request?.signal.aborted || performance.now() >= deadline) retire();
    if (retired) throw Error("Statistics unavailable");
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
      const selected = await prisma.user.findUnique({
        where: { email: owner.email },
        select: { id: true, email: true, name: true, lang: true, createdAt: true },
      });
      check();
      if (!selected) return reply({ error: "Usuario no encontrado" }, 404);
      if (selected.id !== owner.id || selected.email !== owner.email)
        return reply({ error: "No autorizado" }, 401);
      if ((selected.name !== null && typeof selected.name !== "string") || typeof selected.lang !== "string")
        throw Error("Statistics unavailable");
      const user = Object.freeze({
        ...owner, name: selected.name, lang: selected.lang, createdAt: date(selected.createdAt),
      });
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const read = async <T, R>(query: () => PromiseLike<T>, project: (value: T) => R) => {
        check();
        const value = await query();
        check();
        return project(value);
      };
      const [totalGenerations, quota, videoTipsThisMonth, subscription, allDates] = await Promise.all([
        read(() => prisma.generation.count({ where: { userId: owner.id } }), count),
        read(() => readGenerationQuotaSnapshot(owner.id, startOfMonth), value => {
          const recorded = count(value.recorded), reserved = count(value.reserved), total = count(value.total);
          if (!Number.isSafeInteger(recorded + reserved) || total !== recorded + reserved)
            throw Error("Statistics unavailable");
          return Object.freeze({ recorded, reserved, total });
        }),
        read(() => prisma.generation.count({
          where: { userId: owner.id, template: "video_preview", createdAt: { gte: startOfMonth } },
        }), count),
        read(() => prisma.subscription.findUnique({
          where: { userId: owner.id },
          select: { status: true, plan: true, cancelAtPeriodEnd: true, currentPeriodEnd: true, stripeCustomerId: true },
        }), value => {
          if (value === null) return null;
          if (typeof value.status !== "string" || !value.status || typeof value.plan !== "string"
            || typeof value.cancelAtPeriodEnd !== "boolean"
            || (value.stripeCustomerId !== null && typeof value.stripeCustomerId !== "string"))
            throw Error("Statistics unavailable");
          // The private customer marker is needed only for manual-plan expiry.
          return Object.freeze({
            status: value.status, plan: value.plan, cancelAtPeriodEnd: value.cancelAtPeriodEnd,
            currentPeriodEnd: value.currentPeriodEnd === null ? null : date(value.currentPeriodEnd),
            stripeCustomerId: value.stripeCustomerId,
          });
        }),
        read(() => prisma.generation.findMany({
          where: { userId: owner.id, createdAt: { gte: new Date(now.getTime() - 60 * 24 * 3600 * 1000) } },
          select: { createdAt: true }, orderBy: { createdAt: "desc" },
        }), values => values.map(value => date(value.createdAt))),
      ]);
      check();
      const paid = hasPaidAccess(subscription === null ? null : {
        ...subscription,
        currentPeriodEnd: subscription.currentPeriodEnd === null ? null : new Date(subscription.currentPeriodEnd),
      });
      const plan: PlanType = paid ? (subscription!.plan === "business" ? "business" : "pro") : "free";
      const limit = count(getLimits(plan).generationsPerMonth);
      if (!limit) throw Error("Statistics unavailable");
      const publicSubscription = subscription === null ? null : {
        status: subscription.status, plan: subscription.plan, cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        currentPeriodEnd: subscription.currentPeriodEnd,
      };
      const body = {
        user,
        stats: {
          totalGenerations, generationsThisMonth: quota.recorded, generationsReserved: quota.reserved,
          quotaOccupied: quota.total, limit, remaining: Math.max(0, limit - quota.total),
          isPro: isPaid(plan), plan, streak: calcStreak(allDates),
          videoTipsRemaining: isPaid(plan) ? null : Math.max(0, 1 - videoTipsThisMonth),
        },
        subscription: publicSubscription,
      };
      check();
      return reply(body);
    });
    const response = await Promise.race([original, stopped]);
    check();
    return response;
  } catch {
    return reply({ error: "Estadísticas no disponibles" }, 503);
  } finally {
    retire();
    clearTimeout(timer);
    request?.signal.removeEventListener("abort", retire);
  }
}
