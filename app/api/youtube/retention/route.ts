import { NextResponse } from 'next/server';
import { retentionOriginal } from '@/lib/retention-original';
export const maxDuration = 60;
export async function POST(request: Request) {
  try { return NextResponse.json(await retentionOriginal(request), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) {
    const allowed: Record<string, number> = { invalid_input: 400, unauthorized: 401, pro_required: 403, youtube_not_connected: 400, token_expired: 401, no_videos: 400, no_retention_data: 400 };
    const message = error instanceof Error && Object.hasOwn(allowed, error.message) ? error.message : 'retention_unconfirmed';
    return NextResponse.json({ error: message }, { status: allowed[message] ?? 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
