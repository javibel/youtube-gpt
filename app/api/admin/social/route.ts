import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? '';

export async function GET() {
  const session = await auth();
  if (session?.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const [posts, messages] = await Promise.all([
    prisma.socialPost.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.socialMessage.findMany({
      orderBy: { receivedAt: 'desc' },
      take: 20,
    }),
  ]);

  // Status: check env vars presence
  const status = {
    youtube: !!(process.env.YOUTUBE_API_KEY && process.env.YOUTUBE_CHANNEL_ID),
    gmail: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN),
    facebook: !!process.env.BUFFER_FACEBOOK_ID,
    instagram: !!process.env.BUFFER_INSTAGRAM_ID,
    linkedin: !!process.env.BUFFER_LINKEDIN_ID,
    buffer: !!process.env.BUFFER_ACCESS_TOKEN,
    tiktok: false, // manual
    twitter: false, // manual
  };

  return NextResponse.json({ posts, messages, status });
}
