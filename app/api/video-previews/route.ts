import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

// List last 5 previews for the current user (no video data)
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const previews = await prisma.videoPreview.findMany({
    where: { userId: session.user.id },
    select: { id: true, title: true, mimeType: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  return NextResponse.json({ previews });
}

// Save a new preview (base64 encoded video)
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let title: string, videoData: string, mimeType: string;
  try {
    const body = await request.json();
    title = body.title;
    videoData = body.videoData;
    mimeType = body.mimeType ?? 'video/webm';
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (!title || !videoData) {
    return NextResponse.json({ error: 'Missing title or videoData' }, { status: 400 });
  }

  const buffer = Buffer.from(videoData, 'base64');

  const preview = await prisma.videoPreview.create({
    data: {
      userId: session.user.id,
      title,
      videoData: buffer,
      mimeType,
    },
    select: { id: true },
  });

  // Keep only the last 5 per user — delete oldest surplus
  const all = await prisma.videoPreview.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  if (all.length > 5) {
    const toDelete = all.slice(5).map((p) => p.id);
    await prisma.videoPreview.deleteMany({ where: { id: { in: toDelete } } });
  }

  return NextResponse.json({ id: preview.id });
}
