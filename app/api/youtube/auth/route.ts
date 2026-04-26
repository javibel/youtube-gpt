import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', process.env.NEXTAUTH_URL!));
  }

  // YouTube connect is a Pro-only feature
  const subscription = await prisma.subscription.findUnique({
    where: { userId: session.user.id },
    select: { status: true },
  });
  if (subscription?.status !== 'active') {
    return NextResponse.redirect(new URL('/dashboard?yt=pro_required', process.env.NEXTAUTH_URL!));
  }

  const nonce = crypto.randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
    redirect_uri: `${process.env.NEXTAUTH_URL!.trim()}/api/youtube/callback`,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/youtube.readonly',
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
