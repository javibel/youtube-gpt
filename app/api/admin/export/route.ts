import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'ytbeviral@gmail.com';

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((h) => {
        const val = row[h] ?? '';
        const str = String(val).replace(/"/g, '""');
        return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
      }).join(',')
    ),
  ];
  return lines.join('\n');
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (session?.user?.email !== ADMIN_EMAIL) {
    return new Response('No autorizado', { status: 403 });
  }

  const type = req.nextUrl.searchParams.get('type') ?? 'users';

  let csv = '';
  let filename = '';

  if (type === 'users') {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        subscription: { select: { status: true, cancelAtPeriodEnd: true, currentPeriodEnd: true } },
        _count: { select: { generations: true } },
      },
    });

    csv = toCSV(users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name ?? '',
      plan: u.subscription?.status === 'active' ? 'Pro' : 'Free',
      cancel_at_period_end: u.subscription?.cancelAtPeriodEnd ?? false,
      subscription_ends: u.subscription?.currentPeriodEnd?.toISOString() ?? '',
      total_generations: u._count.generations,
      registered_at: u.createdAt.toISOString(),
    })));
    filename = `ytubviral_users_${new Date().toISOString().split('T')[0]}.csv`;

  } else if (type === 'generations') {
    const generations = await prisma.generation.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        template: true,
        tokensUsed: true,
        ipAddress: true,
        createdAt: true,
        user: { select: { email: true } },
      },
    });

    csv = toCSV(generations.map((g) => ({
      id: g.id,
      user_email: g.user.email,
      template: g.template,
      tokens_used: g.tokensUsed,
      ip_address: g.ipAddress ?? '',
      created_at: g.createdAt.toISOString(),
    })));
    filename = `ytubviral_generations_${new Date().toISOString().split('T')[0]}.csv`;

  } else if (type === 'subscriptions') {
    const subs = await prisma.subscription.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        cancelAtPeriodEnd: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        createdAt: true,
        updatedAt: true,
        stripeCustomerId: true,
        stripePriceId: true,
        user: { select: { email: true, name: true } },
      },
    });

    csv = toCSV(subs.map((s) => ({
      id: s.id,
      user_email: s.user.email,
      user_name: s.user.name ?? '',
      status: s.status,
      cancel_at_period_end: s.cancelAtPeriodEnd,
      current_period_start: s.currentPeriodStart?.toISOString() ?? '',
      current_period_end: s.currentPeriodEnd?.toISOString() ?? '',
      stripe_customer_id: s.stripeCustomerId ?? '',
      stripe_price_id: s.stripePriceId ?? '',
      created_at: s.createdAt.toISOString(),
      updated_at: s.updatedAt.toISOString(),
    })));
    filename = `ytubviral_subscriptions_${new Date().toISOString().split('T')[0]}.csv`;

  } else {
    return new Response('Tipo no válido', { status: 400 });
  }

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
