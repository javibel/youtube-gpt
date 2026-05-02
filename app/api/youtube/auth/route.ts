import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUserPlan, isPaid } from '@/lib/plans';
import crypto from 'crypto';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', process.env.NEXTAUTH_URL!));
  }

  // YouTube connect is a Pro-only feature
  const plan = await getUserPlan(session.user.id);
  if (!isPaid(plan)) {
    return NextResponse.redirect(new URL('/dashboard?yt=pro_required', process.env.NEXTAUTH_URL!));
  }

  const nonce = crypto.randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
    redirect_uri: `${process.env.NEXTAUTH_URL!.trim()}/api/youtube/callback`,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube.force-ssl',
      'https://www.googleapis.com/auth/yt-analytics.readonly',
      'https://www.googleapis.com/auth/yt-analytics-monetary.readonly',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state: nonce,
  });

  const response = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
  // Bind nonce to user in a short-lived httpOnly cookie
  response.cookies.set('yt_oauth_state', `${session.user.id}:${nonce}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });
  return response;
}
