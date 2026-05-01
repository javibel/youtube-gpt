import { prisma } from '@/lib/prisma';
import { sendEmailTo } from './gmail-agent';

const APP_URL = process.env.APP_PUBLIC_URL ?? 'https://ytubviral.com';
const FEEDBACK_DELAY_DAYS = 3;

function detectLang(email: string, name?: string | null): 'es' | 'en' {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  const spanishTlds = [
    '.es', '.mx', '.ar', '.co', '.pe', '.cl', '.ve', '.uy',
    '.py', '.bo', '.ec', '.gt', '.sv', '.hn', '.ni', '.cr',
    '.pa', '.do', '.cu', '.pr',
  ];
  if (spanishTlds.some(tld => domain.endsWith(tld))) return 'es';
  if (name && /[áéíóúñü¿¡]/i.test(name)) return 'es';
  return 'en';
}

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

export interface FeedbackAgentResult {
  sent: number;
  errors: string[];
}

export async function runFeedbackAgent(): Promise<FeedbackAgentResult> {
  const result: FeedbackAgentResult = { sent: 0, errors: [] };

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - FEEDBACK_DELAY_DAYS);

  const users = await prisma.user.findMany({
    where: {
      createdAt: { lte: cutoff },
      feedbackEmailSentAt: null,
    },
    select: { id: true, email: true, name: true, lang: true },
    take: 10,
  });

  for (const user of users) {
    try {
      const lang: 'es' | 'en' = user.lang === 'en' ? 'en' : 'es';
      const token = crypto.randomUUID();

      await prisma.userFeedback.create({
        data: { userId: user.id, token, lang },
      });

      const url = `${APP_URL}/feedback?token=${token}`;
      const name = user.name?.split(' ')[0] ?? (lang === 'es' ? 'creador' : 'creator');
      const copy = COPY[lang];

      await sendEmailTo(user.email, copy.subject, copy.body(name, url));

      await prisma.user.update({
        where: { id: user.id },
        data: { feedbackEmailSentAt: new Date() },
      });

      result.sent++;
    } catch (err) {
      result.errors.push(
        `Feedback for ${user.email}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return result;
}
