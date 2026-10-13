import { prisma } from '@/lib/prisma';
import { prepareFeedbackOriginal, dispatchFeedbackOriginal } from '@/lib/feedback-email-original';

export interface FeedbackAgentResult { sent: number; errors: string[] }
export async function runFeedbackAgent(): Promise<FeedbackAgentResult> {
  const result: FeedbackAgentResult = { sent: 0, errors: [] };
  if (process.env.LIFECYCLE_EMAILS_LIVE !== 'true') return result;
  try {
  const users = await prisma.user.findMany({
    where: { createdAt: { lte: new Date(Date.now()-3*86400_000) }, feedbackEmailSentAt: null,
      emailVerified: { not: null }, marketingOptOut: false },
    select: { id: true, email: true }, take: 10, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  for (const user of users) {
    const original = prepareFeedbackOriginal(user.id, user.email);
    const outcome = original ? await dispatchFeedbackOriginal(original) : 'not-issued';
    if (outcome === 'provider-accepted') result.sent++;
    else if (['not-issued','not-configured','unconfirmed'].includes(outcome))
      result.errors.push('Solicitud de feedback sin confirmación');
  }
  } catch { result.errors.push("Solicitudes de feedback sin confirmación"); }
  return result;
}
