import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendTransactionalEmail } from '@/lib/send-email';
import { requireAdmin } from '@/lib/auth-guards';

const APP_URL = process.env.APP_PUBLIC_URL ?? 'https://ytubviral.com';

const COPY = {
  es: {
    subject: '¿Cómo va tu experiencia con YTubViral?',
    body: (name: string, url: string) =>
      `Hola ${name},\n\nLlevamos unos días juntos y nos gustaría saber cómo está siendo tu experiencia con YTubViral.\n\nTu opinión nos ayuda a mejorar la herramienta para ti y para todos los creadores:\n\n👉 ${url}\n\nSolo te lleva 30 segundos. ¡Gracias!\n\nEl equipo de YTubViral`,
  },
  en: {
    subject: 'How is your experience with YTubViral?',
    body: (name: string, url: string) =>
      `Hi ${name},\n\nWe've been working together for a few days and we'd love to hear about your experience with YTubViral.\n\nYour feedback helps us improve the tool for you and all creators:\n\n👉 ${url}\n\nIt only takes 30 seconds. Thank you!\n\nThe YTubViral Team`,
  },
};

function detectLang(email: string, name?: string | null): 'es' | 'en' {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  const esIds = ['.es','.mx','.ar','.co','.pe','.cl','.ve','.uy','.py','.bo','.ec','.gt','.sv','.hn','.ni','.cr','.pa','.do','.cu','.pr'];
  if (esIds.some(t => domain.endsWith(t))) return 'es';
  if (name && /[áéíóúñü¿¡]/i.test(name)) return 'es';
  return 'en';
}

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { email } = await request.json() as { email: string };
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, lang: true } });
  if (!user) return NextResponse.json({ error: `Usuario no encontrado: ${email}` }, { status: 404 });

  // Si ya tiene feedback enviado, borrar el registro anterior para poder reenviar
  const existing = await prisma.userFeedback.findUnique({ where: { userId: user.id } });
  if (existing) {
    await prisma.userFeedback.delete({ where: { userId: user.id } });
  }

  const lang: 'es' | 'en' = user.lang === 'en' ? 'en' : 'es';
  const token = crypto.randomUUID();

  await prisma.userFeedback.create({ data: { userId: user.id, token, lang } });

  const url = `${APP_URL}/feedback?token=${token}`;
  const name = user.name?.split(' ')[0] ?? (lang === 'es' ? 'creador' : 'creator');
  const copy = COPY[lang];

  const body = copy.body(name, url);
  await sendTransactionalEmail({ to: email, subject: copy.subject, html: body.replace(/\n/g, '<br>') });

  await prisma.user.update({ where: { id: user.id }, data: { feedbackEmailSentAt: new Date() } });

  return NextResponse.json({ ok: true, email, lang, token });
}
