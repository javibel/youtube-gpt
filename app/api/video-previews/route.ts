import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { createHash } from 'node:crypto';

// List last 3 previews for the current user (no video data)
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const previews = await prisma.videoPreview.findMany({
    where: { userId: session.user.id },
    select: { id: true, title: true, mimeType: true, size: true, createdAt: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 3,
  });

  return NextResponse.json({ previews });
}

// Save a new preview (binary FormData). Abierto a free desde el 26/08 junto
// con Video Tips (1/mes) — de lo contrario el unico Video Tips gratis se
// generaba pero no se guardaba en la cuenta. Coste marginal: solo storage,
// max 8MB, se conservan las ultimas 3 igual que Pro.
export async function POST(request: Request) {
  const reply = (data: unknown, init?: { status: number }) => NextResponse.json(data, { ...init, headers: { "Cache-Control": "no-store" } });
  const session = await auth();
  if (!session?.user?.id) return reply({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const key = request.headers.get('Idempotency-Key');
  if (key !== null && !/^[-A-Za-z0-9._:]{1,128}$/.test(key)) {
    return reply({ error: 'Invalid retry key' }, { status: 400 });
  }
  const mode = request.headers.get('X-Video-Preview-Recovery');
  if (mode !== null && (mode !== 'retained-only-v1' || key === null)) return reply({ error: 'Invalid recovery mode' }, { status: 400 });
  const retainedOnly = mode === 'retained-only-v1';
  // Business-record identity only. Replay lasts while the preview is retained;
  // this is not an operational recovery credential or a permanent tombstone.
  const id = key === null ? undefined : 'video_preview_' + createHash('sha256').update(JSON.stringify([userId, key])).digest('hex');

  let title: string, buffer: Buffer, mimeType: string;
  try {
    const form = await request.formData();
    const suppliedTitle = form.get('title');
    const file = form.get('video');
    if (typeof suppliedTitle !== 'string' || !suppliedTitle.trim() || !file || typeof file === 'string') {
      return reply({ error: 'Missing fields' }, { status: 400 });
    }
    title = suppliedTitle;
    if (file.size > 8 * 1024 * 1024) return reply({ error: 'File too large' }, { status: 413 });
    // Grabacion vacia/rota (p.ej. la pestaña paso a segundo plano durante la
    // grabacion real-time y el navegador dejo de componer el canvas — ver
    // VideoPreviewGenerator.tsx). Mejor rechazar que guardar un video que
    // luego no reproduce.
    if (file.size < 2000) return reply({ error: 'Empty or corrupt video' }, { status: 422 });
    buffer = Buffer.from(await file.arrayBuffer());
    mimeType = file.type || 'video/webm';
  } catch {
    return reply({ error: 'Invalid body' }, { status: 400 });
  }

  type Saved = { id: string; userId: string; title: string; mimeType: string; size: number; videoData: Uint8Array };
  const replay = (saved: Saved) => saved.userId === userId && saved.title === title && saved.mimeType === mimeType
    && saved.size === buffer.length && Buffer.from(saved.videoData).equals(buffer)
    ? reply({ id: saved.id })
    : reply({ error: 'Retry input changed' }, { status: 409 });
  try {
    return await prisma.$transaction(async tx => {
      // Serialize saves and retention for this account, including legacy callers.
      const owner = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM users WHERE id=${userId} FOR UPDATE`;
      if (owner.length !== 1) throw new Error('Preview owner unavailable');
      if (id) {
        const saved = await tx.videoPreview.findUnique({ where: { id } });
        if (saved) return replay(saved);
      }
      const preview = await tx.videoPreview.create({
        data: { ...(id ? { id } : {}), userId, title, videoData: buffer, mimeType, size: buffer.length },
        select: { id: true },
      });
      const all = await tx.videoPreview.findMany({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true } });
      // Preserve this newly acknowledged preview even when timestamps tie.
      const keep = new Set([preview.id, ...all.filter(p => p.id !== preview.id).slice(0, 2).map(p => p.id)]);
      const surplus = all.filter(p => !keep.has(p.id)).map(p => p.id);
      if (surplus.length) await tx.videoPreview.deleteMany({ where: { userId, id: { in: surplus } } });
      return reply({ id: preview.id });
    });
  } catch {
    // A commit acknowledgement may have been lost. Only a committed, exact
    // account/input match confirms success; otherwise leave the retry available.
    if (id) {
      try {
        const saved = await prisma.videoPreview.findUnique({ where: { id } });
        if (saved) return replay(saved);
      } catch { /* bounded failure below */ }
    }
    return reply({ error: 'Preview save unavailable' }, { status: 503 });
  }
}
