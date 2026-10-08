import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserPlan, getLimits, isPaid } from '@/lib/plans';
import { put } from '@vercel/blob';
import { createHash } from 'node:crypto';
import { thumbnailQuota } from '@/lib/image/thumbnail-quota';

function imageUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 4096) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.hash; }
  catch { return false; }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return Response.json({ error: 'No autorizado' }, { status: 401 });
  const userId = session.user.id;
  const key = request.headers.get('Idempotency-Key');
  if (key !== null && !/^[-A-Za-z0-9._:]{1,128}$/.test(key)) return Response.json({ error: 'Clave inválida' }, { status: 400 });
  // Receipt identity while history is retained; never an operational recovery credential.
  const id = key === null ? undefined : 'thumbnail_' + createHash('sha256').update(JSON.stringify([userId,key])).digest('hex');
  let buffer: Buffer, meta: { topic: string; hasPhoto: boolean; textCount: number };
  try {
    const form = await request.formData(), file = form.get('image'), raw = form.get('meta');
    if (!file || typeof file === 'string' || !file.size || file.type !== 'image/png'
      || typeof raw !== 'string' || raw.length > 4096) return Response.json({ error: 'Imagen o metadatos inválidos' }, { status: 400 });
    if (file.size > 20 * 1024 * 1024) return Response.json({ error: 'Máx 20 MB' }, { status: 413 });
    const data = JSON.parse(raw);
    if (!data || Array.isArray(data) || typeof data.topic !== 'string' || data.topic.length > 500
      || typeof data.hasPhoto !== 'boolean' || !Number.isSafeInteger(data.textCount) || data.textCount < 0
      || data.textCount > 1000 || Object.keys(data).some(k => !['topic','hasPhoto','textCount'].includes(k))) {
      return Response.json({ error: 'Metadatos inválidos' }, { status: 400 });
    }
    meta = { topic: data.topic, hasPhoto: data.hasPhoto, textCount: data.textCount };
    buffer = Buffer.from(await file.arrayBuffer());
  } catch { return Response.json({ error: 'Cuerpo inválido' }, { status: 400 }); }
  const digest = createHash('sha256').update(JSON.stringify(meta)).update('\0image/png\0').update(buffer).digest('hex');
  type Saved = { id: string; userId: string; template: string; inputs: unknown; output: string };
  const replay = (saved: Saved) => {
    const marker = (saved.inputs as { _editorSave?: { version?: unknown; digest?: unknown } } | null)?._editorSave;
    if (saved.userId !== userId || saved.template !== 'thumbnail' || marker?.version !== 1 || marker.digest !== digest) {
      return Response.json({ error: 'La captura no coincide con el guardado' }, { status: 409 });
    }
    if (!imageUrl(saved.output)) return Response.json({ error: 'Guardado sin confirmar' }, { status: 503 });
    return Response.json({ id: saved.id, userId, imageUrl: saved.output, operationKey: key });
  };
  try {
    const owner = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!owner) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });
    if (owner.id !== userId) return Response.json({ error: 'No autorizado' }, { status: 401 });
    return await prisma.$transaction(async tx => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM users WHERE id=${userId} FOR UPDATE`;
      if (locked.length !== 1) throw Error('Owner unavailable');
      if (id) { const saved = await tx.generation.findUnique({ where: { id } }); if (saved) return replay(saved); }
      // An exact committed replay precedes plan/quota checks and does not upload again.
      const plan = await getUserPlan(userId);
      if (!isPaid(plan)) return Response.json({ error: 'Plan Pro requerido', limitReached: true }, { status: 403 });
      const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0);
      const quota = await thumbnailQuota(tx,userId,startOfMonth), limit = getLimits(plan).generationsPerMonth;
      if (quota.total >= limit) return Response.json({ error: 'Límite del plan alcanzado', limitReached: true,
        quotaRecorded: quota.recorded, quotaReserved: quota.reserved, quotaLimit: limit }, { status: 429 });
      const filename = `thumbnails/final/${userId}/${id ?? Date.now()}.png`;
      // Blob and PostgreSQL are not one transaction. A failure before history commits may
      // require re-uploading identical bytes; keyed writes use the same object path.
      const blob = await put(filename,buffer,{ access: 'public',contentType: 'image/png',
        ...(id ? { addRandomSuffix: false, allowOverwrite: true } : {}) });
      if (!imageUrl(blob.url)) throw Error('Invalid stored image');
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip');
      const saved = await tx.generation.create({ data: { ...(id ? { id } : {}), userId,
        template: 'thumbnail', inputs: { ...meta, editor: 'canvas-v2', _editorSave: { version: 1,digest } },
        output: blob.url,tokensUsed: 0,ipAddress: ip } });
      return Response.json({ id: saved.id,userId,imageUrl: saved.output,operationKey: key });
    }, { maxWait: 10_000, timeout: 30_000 });
  } catch {
    if (id) {
      try {
        const owner = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
        if (owner?.id === userId) { const saved = await prisma.generation.findUnique({ where: { id } }); if (saved) return replay(saved); }
      } catch { /* bounded uncertainty below */ }
    }
    return Response.json({ error: 'Guardado sin confirmar' }, { status: 503 });
  }
}
