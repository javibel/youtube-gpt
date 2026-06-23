import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserPlan, getLimits, isPaid } from '@/lib/plans';
import { put } from '@vercel/blob';

function getIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip');
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }

    const form      = await request.formData();
    const imageFile = form.get('image') as File | null;
    const metaRaw   = (form.get('meta') as string) || '{}';

    if (!imageFile || imageFile.size === 0) {
      return Response.json({ error: 'No image provided' }, { status: 400 });
    }
    if (imageFile.size > 20 * 1024 * 1024) {
      return Response.json({ error: 'Image must be under 20 MB' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });

    const plan = await getUserPlan(user.id);
    if (!isPaid(plan)) {
      return Response.json({ error: 'Plan Pro requerido', limitReached: true }, { status: 403 });
    }

    const limit         = getLimits(plan).generationsPerMonth;
    const startOfMonth  = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const usedThisMonth = await prisma.generation.count({
      where: { userId: user.id, createdAt: { gte: startOfMonth } },
    });
    if (usedThisMonth >= limit) {
      return Response.json({ error: 'Límite del plan alcanzado', limitReached: true }, { status: 429 });
    }

    const buffer   = Buffer.from(await imageFile.arrayBuffer());
    const filename = `thumbnails/final/${user.id}/${Date.now()}.png`;
    const blob     = await put(filename, buffer, { access: 'public', contentType: 'image/png' });

    let meta: Record<string, unknown> = {};
    try { meta = JSON.parse(metaRaw); } catch { /* ignore malformed meta */ }

    const ip = getIp(request);
    await prisma.generation.create({
      data: {
        userId:    user.id,
        template:  'thumbnail',
        inputs:    { ...meta, editor: 'canvas-v2' },
        output:    blob.url,
        tokensUsed: 0,
        ipAddress: ip,
      },
    });

    return Response.json({ imageUrl: blob.url });
  } catch (error) {
    console.error('[thumbnail-save] Error:', error);
    return Response.json({ error: 'Error al guardar' }, { status: 500 });
  }
}
