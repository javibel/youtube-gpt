import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Resend } from 'resend';
import crypto from 'crypto';
import { checkRateLimit } from '@/lib/rate-limit';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  // Rate limit: máx 5 intentos por IP cada 15 minutos (previene spam de emails)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown';
  const rl = checkRateLimit(`forgot-password:${ip}`, 5, 15 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.' },
      { status: 429 }
    );
  }

  const { email } = await request.json();

  if (!email) {
    return NextResponse.json({ error: 'Email requerido' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // Siempre devolvemos 200 para no revelar si el email existe
  if (!user) {
    return NextResponse.json({ ok: true });
  }

  // Eliminar tokens anteriores del mismo email
  await prisma.passwordResetToken.deleteMany({ where: { email } });

  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 1000 * 60 * 60); // 1 hora

  await prisma.passwordResetToken.create({
    data: { email, token, expires },
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://ytubviral.com';
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  await resend.emails.send({
    from: 'noreply@ytubviral.com',
    to: email,
    subject: 'Restablecer contraseña - YTubViral',
    html: `
      <p>Hola,</p>
      <p>Recibimos una solicitud para restablecer tu contraseña.</p>
      <p><a href="${resetUrl}" style="background:#7c3aed;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Restablecer contraseña</a></p>
      <p>Este enlace expira en 1 hora. Si no solicitaste esto, ignora este email.</p>
    `,
  });

  return NextResponse.json({ ok: true });
}
