import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserPlan, getLimits, isPaid } from '@/lib/plans';
import { put } from '@vercel/blob';
import { createHash, randomUUID } from 'node:crypto';
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
  // Receipt identity is account scoped, never an operational recovery credential.
  // A keyless request is a fresh save, never a recovery identity. Its unique ID
  // retains the committed charge without sharing a timestamp-based Blob path.
  const id = key === null ? 'thumbnail_keyless_' + randomUUID() : 'thumbnail_' + createHash('sha256').update(JSON.stringify([userId,key])).digest('hex');
  let buffer: Buffer, meta: { topic: string; hasPhoto: boolean; textCount: number; backgroundOperationKey?: string };
  try {
    const form = await request.formData(), file = form.get('image'), raw = form.get('meta');
    if (!file || typeof file === 'string' || !file.size || file.type !== 'image/png'
      || typeof raw !== 'string' || raw.length > 4096) return Response.json({ error: 'Imagen o metadatos inválidos' }, { status: 400 });
    if (file.size > 20 * 1024 * 1024) return Response.json({ error: 'Máx 20 MB' }, { status: 413 });
    const data = JSON.parse(raw);
    if (!data || Array.isArray(data) || typeof data.topic !== 'string' || data.topic.length > 500
      || typeof data.hasPhoto !== 'boolean' || !Number.isSafeInteger(data.textCount) || data.textCount < 0
      || data.textCount > 1000 || Object.keys(data).some(k => !['topic','hasPhoto','textCount','backgroundOperationKey'].includes(k))
      || (Object.hasOwn(data,'backgroundOperationKey') && (typeof data.backgroundOperationKey !== 'string'
        || !/^[-A-Za-z0-9._:]{1,128}$/.test(data.backgroundOperationKey)))) {
      return Response.json({ error: 'Metadatos inválidos' }, { status: 400 });
    }
    meta = { topic: data.topic, hasPhoto: data.hasPhoto, textCount: data.textCount,
      ...(Object.hasOwn(data,'backgroundOperationKey') ? {backgroundOperationKey:data.backgroundOperationKey} : {}) };
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
      if (key !== null) {
        const receipt = await tx.thumbnailSaveReceipt.findUnique({ where: { id } });
        if (receipt && (receipt.userId !== userId || receipt.digest !== digest)) {
          return Response.json({ error: 'La captura no coincide con el guardado' }, { status: 409 });
        }
        const saved = await tx.generation.findUnique({ where: { id } });
        if (saved) return replay(saved);
        // A committed key with deleted history cannot authorize another write.
        // No PNG, metadata or output URL is retained in this deletion guard.
        if (receipt) return Response.json({ error: 'El guardado ya no está disponible' }, { status: 409 });
      }
      // An exact committed replay precedes plan/quota checks and does not upload again.
      let backgroundId: string | undefined;
      if (meta.backgroundOperationKey !== undefined) {
        // Hash locates the row; only its authenticated owner and completed result permit a reference.
        // No inference, recovery authority, pixel provenance or quota exemption is created here.
        backgroundId = 'background_ai_' + createHash('sha256').update(JSON.stringify([userId,meta.backgroundOperationKey])).digest('hex');
        const background = await tx.backgroundImageAttempt.findUnique({ where: { id: backgroundId } });
        if (!background || background.id !== backgroundId || background.userId !== userId || background.state !== 'complete'
          || !imageUrl(background.output) || typeof background.prompt !== 'string' || !background.prompt.trim()
          || background.prompt.length > 4000 || !/^[a-f0-9]{64}$/.test(background.digest)) {
          return Response.json({ error: 'Fondo sin confirmar' }, { status: 409 });
        }
      }
      const plan = await getUserPlan(userId);
      if (!isPaid(plan)) return Response.json({ error: 'Plan Pro requerido', limitReached: true }, { status: 403 });
      const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0);
      const quota = await thumbnailQuota(tx,userId,startOfMonth), limit = getLimits(plan).generationsPerMonth;
      if (quota.total >= limit) return Response.json({ error: 'Límite del plan alcanzado', limitReached: true,
        quotaRecorded: quota.recorded, quotaReserved: quota.reserved, quotaLimit: limit }, { status: 429 });
      const filename = `thumbnails/final/${userId}/${id}.png`;
      // Blob and PostgreSQL are not one transaction. A failure before history commits may
      // require re-uploading identical bytes; keyed writes use the same object path.
      const blob = await put(filename,buffer,{ access: 'public',contentType: 'image/png',
        ...(key !== null ? { addRandomSuffix: false, allowOverwrite: true } : {}) });
      if (!imageUrl(blob.url)) throw Error('Invalid stored image');
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip');
      const saved = await tx.generation.create({ data: { id, userId,
        template: 'thumbnail', inputs: { ...meta, editor: 'canvas-v2', _editorSave: { version: 1,digest },
          ...(backgroundId ? {_editorBackground:{version:1,id:backgroundId}} : {}) },
        output: blob.url,tokensUsed: 0,ipAddress: ip } });
      await tx.thumbnailSaveReceipt.create({ data: { id,userId,digest,createdAt:saved.createdAt } });
      return Response.json({ id: saved.id,userId,imageUrl: saved.output,operationKey: key });
    }, { maxWait: 10_000, timeout: 30_000 });
  } catch {
    if (key !== null) {
      try {
        const owner = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
        if (owner?.id === userId) { const saved = await prisma.generation.findUnique({ where: { id } }); if (saved) return replay(saved); }
      } catch { /* bounded uncertainty below */ }
    }
    return Response.json({ error: 'Guardado sin confirmar' }, { status: 503 });
  }
}
