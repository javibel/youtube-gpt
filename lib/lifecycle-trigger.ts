import { prepareLifecycleOriginal, dispatchLifecycleOriginal } from '@/lib/lifecycle-email-original';

type ConvStep = 'c1' | 'c3';
// Fire-and-forget business caller: failures do not break the user's operation.
// Shared durable admission with cron; unknown acknowledgement never retries.
export async function triggerConversionEmail(userId: string, step: ConvStep,
  extra?: Record<string, string | number>, beforeEffect?: () => void): Promise<void> {
  const original = prepareLifecycleOriginal(userId, 'conv', step, extra, beforeEffect);
  if (original) await dispatchLifecycleOriginal(original);
}


// Legacy public IDs and declared invoice/trial facts cannot mint billing notice
// authority. Current webhook paths retain denial; a genuine admitted writer is
// still required before either transactional notice can be enabled.
export class BillingNoticeAdmissionRequired extends Error {
  constructor() { super("Billing notice requires its admitted original"); this.name = "BillingNoticeAdmissionRequired"; }
}
export async function triggerTrialEndingEmail(_userId: string, _subscriptionId: string,
  _extra: { trialEndTs: number; amountCents: number; currency: string; manageUrl: string }): Promise<void> {
  throw new BillingNoticeAdmissionRequired();
}
export async function triggerPaymentFailedEmail(_userId: string, _invoiceId: string,
  _extra: { amountCents: number; currency: string; manageUrl: string }): Promise<void> {
  throw new BillingNoticeAdmissionRequired();
}
