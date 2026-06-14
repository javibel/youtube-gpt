import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { passwordChangedEmail } from '@/lib/emails';
import { validatePassword } from '@/lib/password';
import { sendTransactionalEmail } from '@/lib/send-email';
import { rateLimitRequest } from '@/lib/rate-limit-db';

export async function POST(request: Request) {
  // F2: throttle to prevent brute-forcing reset tokens
  if (!(await rateLimitRequest(request, 'reset-pw', 10, 15))) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }
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
    sendTransactionalEmail({
      to: user.email,
      subject,
      html: passwordChangedEmail(name, emailLang),
      isTransactional: true,
    }).catch(err => console.error('Password changed email error:', err));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[reset-password]', err);
    return NextResponse.json({ error: 'Error al restablecer la contraseña' }, { status: 500 });
  }
}
