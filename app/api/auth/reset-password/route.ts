import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { Resend } from 'resend';
import { passwordChangedEmail } from '@/lib/emails';
import { validatePassword } from '@/lib/password';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function POST(request: Request) {
  try {
    const { token, password, lang = 'es' } = await request.json();
    const emailLang: 'es' | 'en' = lang === 'en' ? 'en' : 'es';

    if (!token || !password) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    const pwError = validatePassword(password, emailLang);
    if (pwError) {
      return NextResponse.json({ error: pwError }, { status: 400 });
    }

    const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });

    if (!resetToken || resetToken.expires < new Date()) {
      return NextResponse.json({ error: emailLang === 'en' ? 'The link has expired or is invalid' : 'El enlace ha expirado o no es válido' }, { status: 400 });
    }

    const hashed = await bcrypt.hash(password, 12);

    const user = await prisma.user.update({
      where: { email: resetToken.email },
      data: { password: hashed },
      select: { name: true, email: true },
    });

    await prisma.passwordResetToken.delete({ where: { token } });

    const name = user.name ?? user.email;
    const subject = emailLang === 'en' ? 'Your password was changed - YTubViral' : 'Tu contraseña ha sido cambiada - YTubViral';
    resend?.emails.send({
      from: 'noreply@ytubviral.com',
      to: user.email,
      subject,
      html: passwordChangedEmail(name, emailLang),
    }).catch(err => console.error('Password changed email error:', err));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[reset-password]', err);
    return NextResponse.json({ error: 'Error al restablecer la contraseña' }, { status: 500 });
  }
}
