import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const start = Date.now();
  const checks: Record<string, { ok: boolean; ms?: number; error?: string }> = {};

  // Database check
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { ok: true, ms: Date.now() - dbStart };
  } catch (err: any) {
    checks.database = { ok: false, error: err.message };
  }

  const allOk = Object.values(checks).every(c => c.ok);

  return NextResponse.json(
    {
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      totalMs: Date.now() - start,
      checks,
    },
    { status: allOk ? 200 : 503 }
  );
}
