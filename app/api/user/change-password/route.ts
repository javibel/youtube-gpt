import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { Resend } from 'resend';
import { passwordChangedEmail } from '@/lib/emails';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;


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
