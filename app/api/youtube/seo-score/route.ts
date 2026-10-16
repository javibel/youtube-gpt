import { NextResponse } from 'next/server';
import { videoReviewOriginal } from '@/lib/video-review-original';
import { videoReviewHistoryOriginal } from '@/lib/video-review-history-original';
export const maxDuration = 60;
const error = (e: unknown) => { const code = e instanceof Error ? e.message : ''; const status = code === 'invalid_input' ? 400 : code === 'unauthorized' || code === 'token_expired' ? 401 : code === 'pro_required' ? 403 : code === 'youtube_not_connected' ? 400 : 503; return NextResponse.json({ error: status === 503 ? 'videoReview_unconfirmed' : code }, { status, headers: { 'Cache-Control': 'no-store' } }); };
export async function POST(request: Request) { try { return NextResponse.json(await videoReviewOriginal(request), { headers: { 'Cache-Control': 'no-store' } }); } catch (e) { return error(e); } }
export async function GET(request: Request) { try { return NextResponse.json(await videoReviewHistoryOriginal(request), { headers: { 'Cache-Control': 'no-store' } }); } catch (e) { return error(e); } }
