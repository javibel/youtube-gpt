import { historyOutputTokens } from "@/lib/ai/history-usage";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guards";
import { hasPaidAccess } from "@/lib/plans";
import { authorizeNativeAdminStats, checkNativeAdminStats, closeNativeAdminStats, runNativeAdminStats, type NativeAdminStats, type AdminStatsRead } from "@/lib/admin-stats-native-authorization";

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export async function GET(request: Request) {
  const startedAt=Date.now(),deadline=performance.now()+25000,signal=request.signal,controller=new AbortController();
  const cookie=request.headers.get('cookie'),captured={signal:controller.signal,headers:new Headers(cookie?{cookie}:{})} as Request;
  const yearlyPriceId=process.env.STRIPE_PRO_YEARLY_PRICE_ID;
  // Correlation only: this caller value never originates an admin grant.
  const readRef=request.headers.get('X-YTV-Read-Ref');
  let retired=false,rejectWait!:(error:Error)=>void,original:NativeAdminStats|null=null;
  const stopped=new Promise<never>((_,reject)=>{rejectWait=reject;});void stopped.catch(()=>{});
  const retire=()=>{if(!retired){retired=true;controller.abort();rejectWait(Error('Admin statistics unconfirmed'));}};
  const timer=setTimeout(retire,25000);signal.addEventListener('abort',retire,{once:true});
  const check=()=>{if(signal.aborted||Date.now()<startedAt||performance.now()>=deadline)retire();if(retired)throw Error('Admin statistics unconfirmed');if(original)checkNativeAdminStats(original);};
  const run=async<T,>(operation:()=>Promise<T>)=>{check();const pending=Promise.resolve().then(()=>{check();return operation();});void pending.catch(()=>{});const value=await Promise.race([pending,stopped]);check();return value;};
  const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'no-store'}});
  try{
    if(readRef!==null&&!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(readRef))throw Error('Admin statistics unconfirmed');
    const gate=await run(()=>requireAdmin());if(!gate.ok)return gate.response;
    original=await run(()=>authorizeNativeAdminStats(captured));if(!original)return json({error:'No autorizado'},403);
    const result=await run(()=>runNativeAdminStats(original!,async context=>{
      const value=await readAdminStats(context,yearlyPriceId);
      return readRef===null?value:{...value,adminStatsRead:{readRef,userId:context.userId,asOf:context.asOf,expiresAt:context.expiresAt}};
    }));
    check();const response=json(result);check();return response;
  }catch{return json({error:'admin_stats_unconfirmed'},503);}
  finally{clearTimeout(timer);signal.removeEventListener('abort',retire);if(original)closeNativeAdminStats(original);controller.abort();}
}

async function readAdminStats(context: AdminStatsRead, yearlyPriceId: string | undefined) {
  const now = new Date(context.asOf);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 6);
  startOfWeek.setHours(0, 0, 0, 0);

  const [
    totalUsers,
    proSubscriptions,
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
    context.step(() => prisma.user.count()),

    // Suscripciones Pro activas (con priceId para calcular MRR correctamente)
    context.step(() => prisma.subscription.findMany({
      where: { status: "active" },
      select: { status: true, stripeCustomerId: true, stripePriceId: true, currentPeriodEnd: true },
    })),

    // Nuevos usuarios este mes
    context.step(() => prisma.user.count({ where: { createdAt: { gte: startOfMonth } } })),

    // Nuevos usuarios mes pasado
    context.step(() => prisma.user.count({
      where: { createdAt: { gte: startOfLastMonth, lt: startOfMonth } },
    })),

    // Total generaciones
    context.step(() => prisma.generation.count()),

    // Generaciones este mes
    context.step(() => prisma.generation.count({ where: { createdAt: { gte: startOfMonth } } })),

    // Generaciones mes pasado
    context.step(() => prisma.generation.count({
      where: { createdAt: { gte: startOfLastMonth, lt: startOfMonth } },
    })),

    // Últimos 10 usuarios
    context.step(() => prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        subscription: { select: { status: true, plan: true, stripeCustomerId: true, currentPeriodEnd: true } },
        _count: { select: { generations: true } },
      },
    })),

    // Últimas 10 generaciones
    context.step(() => prisma.generation.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        template: true,
        createdAt: true,
        tokensUsed: true,
        user: { select: { email: true } },
      },
    })),

    // Breakdown por template (este mes)
    context.step(() => prisma.generation.groupBy({
      by: ["template"],
      where: { createdAt: { gte: startOfMonth } },
      _count: { template: true },
      orderBy: { _count: { template: "desc" } },
    })),

    // Generaciones por día últimos 7 días
    context.step(() => prisma.generation.findMany({
      where: { createdAt: { gte: startOfWeek } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    })),
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


  const activeProSubscriptions = proSubscriptions.filter((s) => hasPaidAccess(s));
  const proUsers = activeProSubscriptions.length;
  const mrr = activeProSubscriptions.filter((s) => s.stripeCustomerId !== 'manual_admin').reduce((sum, s) => {
    const isYearly = yearlyPriceId && s.stripePriceId === yearlyPriceId;
    return sum + (isYearly ? 99.99 / 12 : 9.99);
  }, 0);
  const freeUsers = totalUsers - proUsers;
  const conversionRate = totalUsers > 0 ? (proUsers / totalUsers) * 100 : 0;

  return {
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
      isPro: hasPaidAccess(u.subscription),
      plan: hasPaidAccess(u.subscription) ? (u.subscription?.status === 'trialing' ? 'trial' : u.subscription?.plan || 'pro') : 'free',
      generationCount: u._count.generations,
    })),
    recentGenerations: recentGenerations.map((g) => ({
      id: g.id,
      template: g.template,
      createdAt: g.createdAt,
      tokensUsed: historyOutputTokens(g.tokensUsed),
      userEmail: g.user.email,
    })),
    dataQuality: { source: 'stored-admin-aggregates', freshness: 'unconfirmed', mrr: 'fixed-price-estimate', billingReconciliation: 'not-assessed' },
  };
}
