import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isDisposableEmail } from '@/lib/disposable-domains';
import { sendTransactionalEmail } from '@/lib/send-email';
import { ADMIN_EMAIL } from '@/lib/admin-email';
import { AFFILIATES_DORMANT } from '@/lib/features';

// Genera un code corto y legible a partir del nombre ("Erika Goncalves" → "erika"),
// con sufijo numérico si ya existe — el afiliado puede pedir cambiarlo, Javier lo
// edita a mano al aprobar (no hay UI de auto-servicio para esto, v1 curada).
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 20) || 'afiliado';
}

export async function POST(req: NextRequest) {
  if (AFFILIATES_DORMANT) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { name, email, channelInfo, lang } = await req.json().catch(() => ({}));
  const isEn = lang === 'en';

  // Rate limit: máx 3 solicitudes por IP por hora — POST público que crea filas
  // y envía email a Javier; sin esto un bot le inunda el buzón. Mismo upsert
  // atómico en BD que el signup (cross-instance safe).
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown';
  const rlKey = `affapply:${ip}`;
  const rlResult = await prisma.$queryRaw<{ hits: number }[]>`
    INSERT INTO rate_limits (key, hits, window_start)
    VALUES (${rlKey}, 1, NOW())
    ON CONFLICT (key) DO UPDATE
    SET
      hits = CASE
        WHEN rate_limits.window_start < NOW() - INTERVAL '1 hour'
        THEN 1
        ELSE rate_limits.hits + 1
      END,
      window_start = CASE
        WHEN rate_limits.window_start < NOW() - INTERVAL '1 hour'
        THEN NOW()
        ELSE rate_limits.window_start
      END
    RETURNING hits
  `;
  if (Number(rlResult[0].hits) > 3) {
    return NextResponse.json(
      { error: isEn ? 'Too many applications from this connection. Try again later.' : 'Demasiadas solicitudes desde esta conexión. Inténtalo más tarde.' },
      { status: 429 },
    );
  }

  if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' || !email.trim()) {
    return NextResponse.json(
      { error: isEn ? 'Name and email are required.' : 'Nombre y email son obligatorios.' },
      { status: 400 },
    );
  }
  const normalizedEmail = email.toLowerCase().trim();
  if (isDisposableEmail(normalizedEmail)) {
    return NextResponse.json(
      { error: isEn ? 'Please use a real, non-disposable email.' : 'Usa un email real, no desechable.' },
      { status: 400 },
    );
  }

  const existing = await prisma.affiliate.findFirst({ where: { email: normalizedEmail } });
  if (existing) {
    return NextResponse.json(
      { error: isEn ? 'There is already an application with that email.' : 'Ya existe una solicitud con ese email.' },
      { status: 400 },
    );
  }

  let code = slugify(name);
  let suffix = 0;
  while (await prisma.affiliate.findUnique({ where: { code } })) {
    suffix += 1;
    code = `${slugify(name)}${suffix}`;
  }

  const affiliate = await prisma.affiliate.create({
    data: {
      code,
      name: name.trim().slice(0, 100),
      email: normalizedEmail,
      channelInfo: typeof channelInfo === 'string' && channelInfo.trim() ? channelInfo.trim().slice(0, 2000) : undefined,
      status: 'pending',
    },
  });

  if (ADMIN_EMAIL) {
    await sendTransactionalEmail({
      to: ADMIN_EMAIL,
      subject: `Nueva solicitud de afiliado: ${affiliate.name}`,
      html: `<p>Nueva solicitud del programa de afiliados.</p>
        <p><b>Nombre:</b> ${affiliate.name}<br/>
        <b>Email:</b> ${affiliate.email}<br/>
        <b>Código propuesto:</b> ${affiliate.code}</p>
        <p><b>Canal/audiencia/cómo promociona:</b><br/>${(affiliate.channelInfo || '(no indicado)').replace(/\n/g, '<br/>')}</p>
        <p>Aprobar/pausar en <a href="https://ytubviral.com/admin/affiliates">/admin/affiliates</a>.</p>`,
      isTransactional: true,
    }).catch((err) => console.error('[affiliates/apply] notify email error:', err));
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
