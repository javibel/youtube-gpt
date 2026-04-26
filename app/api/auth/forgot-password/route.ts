import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Resend } from 'resend';
import crypto from 'crypto';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function POST(request: NextRequest) {
  // Rate limit: máx 5 intentos por IP cada 15 minutos — upsert atómico en BD (cross-instance safe)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown';
  const rlKey = `forgot-password:${ip}`;
  const rlResult = await prisma.$queryRaw<{ hits: number }[]>`
    INSERT INTO rate_limits (key, hits, window_start)
    VALUES (${rlKey}, 1, NOW())
    ON CONFLICT (key) DO UPDATE
    SET
      hits = CASE
        WHEN rate_limits.window_start < NOW() - INTERVAL '15 minutes'
        THEN 1
        ELSE rate_limits.hits + 1
      END,
      window_start = CASE
        WHEN rate_limits.window_start < NOW() - INTERVAL '15 minutes'
        THEN NOW()
        ELSE rate_limits.window_start
      END
    RETURNING hits
  `;
  const { email, lang = 'es' } = await request.json();
  const emailLang: 'es' | 'en' = lang === 'en' ? 'en' : 'es';
  const isEn = emailLang === 'en';

  if (Number(rlResult[0].hits) > 5) {
    return NextResponse.json(
      { error: isEn ? 'Too many attempts. Please wait a few minutes before trying again.' : 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.' },
      { status: 429 }
    );
  }

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

  const subject = isEn ? 'Reset your password - YTubViral' : 'Restablecer contraseña - YTubViral';
  const html = isEn ? `
    <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"></head>
    <body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:48px 0;">
        <tr><td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#111111;border-radius:12px;border:1px solid rgba(255,255,255,0.08);padding:40px;">
            <tr><td style="padding:40px;">
              <p style="margin:0 0 16px;font-size:11px;font-weight:600;color:#e84d5b;text-transform:uppercase;letter-spacing:0.15em;font-family:monospace;">PASSWORD RESET</p>
              <p style="margin:0 0 8px;font-size:22px;font-weight:800;color:#ffffff;">Reset your password</p>
              <p style="margin:0 0 28px;font-size:15px;color:#71717a;line-height:1.7;">We received a request to reset your password. Click the button below — the link expires in 1 hour.</p>
              <a href="${resetUrl}" style="display:inline-block;background:#e84d5b;color:#ffffff;font-weight:700;font-size:14px;padding:14px 32px;border-radius:6px;text-decoration:none;box-shadow:3px 3px 0 #000;">Reset password →</a>
              <p style="margin:28px 0 0;font-size:12px;color:#52525b;">If you didn't request this, you can safely ignore this email.</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body></html>
  ` : `
    <!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>
    <body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:48px 0;">
        <tr><td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#111111;border-radius:12px;border:1px solid rgba(255,255,255,0.08);padding:40px;">
            <tr><td style="padding:40px;">
              <p style="margin:0 0 16px;font-size:11px;font-weight:600;color:#e84d5b;text-transform:uppercase;letter-spacing:0.15em;font-family:monospace;">RESTABLECER CONTRASEÑA</p>
              <p style="margin:0 0 8px;font-size:22px;font-weight:800;color:#ffffff;">Restablece tu contraseña</p>
              <p style="margin:0 0 28px;font-size:15px;color:#71717a;line-height:1.7;">Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón — el enlace expira en 1 hora.</p>
              <a href="${resetUrl}" style="display:inline-block;background:#e84d5b;color:#ffffff;font-weight:700;font-size:14px;padding:14px 32px;border-radius:6px;text-decoration:none;box-shadow:3px 3px 0 #000;">Restablecer contraseña →</a>
              <p style="margin:28px 0 0;font-size:12px;color:#52525b;">Si no solicitaste esto, puedes ignorar este email.</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body></html>
  `;

  resend?.emails.send({
    from: 'noreply@ytubviral.com',
    to: email,
    subject,
    html,
  }).catch(err => console.error('forgot-password email error:', err));

  return NextResponse.json({ ok: true });
}
