import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function passwordChangedEmail(name: string, lang: 'es' | 'en'): string {
  const isEn = lang === 'en';
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:48px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td align="center" style="padding:0 0 32px 0;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="background:#e84d5b;width:28px;height:28px;border-radius:5px;text-align:center;vertical-align:middle;">
              <span style="color:#fff;font-size:14px;font-weight:900;line-height:28px;">▶</span>
            </td>
            <td style="padding-left:10px;font-size:18px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">
              YTubViral<span style="color:#e84d5b;">.</span>com
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="background:#111111;border-radius:12px;border:1px solid rgba(255,255,255,0.08);padding:40px;">
          <p style="margin:0 0 16px;font-size:11px;font-weight:600;color:#e84d5b;text-transform:uppercase;letter-spacing:0.15em;font-family:monospace;">
            ${isEn ? 'SECURITY NOTICE' : 'AVISO DE SEGURIDAD'}
          </p>
          <p style="margin:0 0 8px;font-size:22px;font-weight:800;color:#ffffff;">
            ${isEn ? `Hi, ${name}.` : `Hola, ${name}.`}
          </p>
          <p style="margin:0 0 28px;font-size:15px;color:#71717a;line-height:1.7;">
            ${isEn
              ? 'Your YTubViral password was changed successfully. If this was you, no action is needed.'
              : 'Tu contraseña de YTubViral se ha cambiado correctamente. Si fuiste tú, no necesitas hacer nada.'}
          </p>
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:16px;">
            <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.6;">
              ${isEn
                ? '⚠️ If you did <strong style="color:#fff;">not</strong> make this change, please <a href="https://ytubviral.com/forgot-password" style="color:#e84d5b;text-decoration:none;">reset your password immediately</a>.'
                : '⚠️ Si <strong style="color:#fff;">no</strong> realizaste este cambio, <a href="https://ytubviral.com/forgot-password" style="color:#e84d5b;text-decoration:none;">restablece tu contraseña inmediatamente</a>.'}
            </p>
          </div>
        </td></tr>
        <tr><td align="center" style="padding:24px 0 0;">
          <p style="margin:0;font-size:11px;color:#3f3f46;font-family:monospace;">
            © 2026 YTubViral.com ·
            <a href="https://ytubviral.com/terms" style="color:#52525b;text-decoration:none;">${isEn ? 'Terms' : 'Términos'}</a> ·
            <a href="https://ytubviral.com/privacy" style="color:#52525b;text-decoration:none;">${isEn ? 'Privacy' : 'Privacidad'}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { currentPassword, newPassword, lang = 'es' } = await request.json();
  const emailLang: 'es' | 'en' = lang === 'en' ? 'en' : 'es';

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: emailLang === 'en' ? 'All fields are required' : 'Todos los campos son obligatorios' }, { status: 400 });
  }

  if (newPassword.length < 8) {
    return NextResponse.json({ error: emailLang === 'en' ? 'Password must be at least 8 characters' : 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user?.password) {
    return NextResponse.json({ error: emailLang === 'en' ? 'Cannot change password for this account' : 'No se puede cambiar la contraseña de esta cuenta' }, { status: 400 });
  }

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) {
    return NextResponse.json({ error: emailLang === 'en' ? 'Current password is incorrect' : 'La contraseña actual no es correcta' }, { status: 400 });
  }

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { email: session.user.email }, data: { password: hashed } });

  const name = user.name ?? session.user.email;
  const subject = emailLang === 'en' ? 'Your password was changed - YTubViral' : 'Tu contraseña ha sido cambiada - YTubViral';
  resend?.emails.send({
    from: 'noreply@ytubviral.com',
    to: session.user.email,
    subject,
    html: passwordChangedEmail(name, emailLang),
  }).catch(err => console.error('Password changed email error:', err));

  return NextResponse.json({ ok: true });
}
