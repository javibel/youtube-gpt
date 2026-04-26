import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

// List last 3 previews for the current user (no video data)
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const previews = await prisma.videoPreview.findMany({
    where: { userId: session.user.id },
    select: { id: true, title: true, mimeType: true, size: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 3,
  });

  return NextResponse.json({ previews });
}

// Save a new preview (binary FormData) — Pro only
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const subscription = await prisma.subscription.findUnique({
    where: { userId: session.user.id },
    select: { status: true },
  });
  if (subscription?.status !== 'active') {
    return NextResponse.json({ error: 'Pro required' }, { status: 403 });
  }

  let title: string, buffer: Buffer, mimeType: string;
  try {
    const form = await request.formData();
    title = (form.get('title') as string | null) ?? '';
    const file = form.get('video') as File | null;
    if (!title || !file) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: 'File too large' }, { status: 413 });
    buffer = Buffer.from(await file.arrayBuffer());
    mimeType = file.type || 'video/webm';
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const preview = await prisma.videoPreview.create({
    data: {
      userId: session.user.id,
      title,
      videoData: buffer,
      mimeType,
      size: buffer.length,
    },
    select: { id: true },
  });

  // Keep only the last 3 per user — delete oldest surplus
  const all = await prisma.videoPreview.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  if (all.length > 3) {
    const toDelete = all.slice(3).map((p) => p.id);
    await prisma.videoPreview.deleteMany({ where: { id: { in: toDelete } } });
  }

  return NextResponse.json({ id: preview.id });
}
