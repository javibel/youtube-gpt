import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guards';

// An authenticated admin body/old subscriber row is not campaign provenance,
// consent, original dispatch custody, or a fresh 48-hour discount authorization.
// Keep this legacy bulk path closed until the genuine campaign admission exists.
export async function POST(_request: Request) {
  const gate = await requireAdmin(); if (!gate.ok) return gate.response;
  return NextResponse.json({ error: 'launch_requires_admitted_campaign' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
