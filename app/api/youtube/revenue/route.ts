import { NextResponse } from 'next/server';
import { revenueOriginal } from '@/lib/revenue-original';
export const maxDuration = 60;
export async function POST(request: Request) {
  try { return NextResponse.json(await revenueOriginal(request), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) {
    const allowed: Record<string, number> = { invalid_input: 400, unauthorized: 401, pro_required: 403, youtube_not_connected: 400, token_expired: 401, no_activity_data: 400 };
    const message = error instanceof Error && Object.hasOwn(allowed, error.message) ? error.message : 'revenue_unconfirmed';
    return NextResponse.json({ error: message }, { status: allowed[message] ?? 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
export function GET() { return NextResponse.json({ error: 'analysis_request_required' }, { status: 405, headers: { 'Cache-Control': 'no-store', Allow: 'POST' } }); }
