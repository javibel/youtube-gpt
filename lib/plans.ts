import { prisma } from '@/lib/prisma';

export type PlanType = 'free' | 'pro' | 'business';

export const PLAN_LIMITS = {
  free: {
    generationsPerMonth: 10,
    chatMessagesPerDay: 5,
    coachMessagesPerMonth: 0,
    predictionsPerMonth: 0,
    bulkPerMonth: 0,
    bulkMaxTopics: 0,
    auditsPerMonth: 0,
    trendingCountries: 0,
    competitors: 1,
    abTestsSimultaneous: 0,
    teamMembers: 0,
  },
  pro: {
    generationsPerMonth: 200,
    chatMessagesPerDay: 20,
    coachMessagesPerMonth: 50,
    predictionsPerMonth: 10,
    bulkPerMonth: 3,
    bulkMaxTopics: 5,
    auditsPerMonth: 2,
    trendingCountries: 3,
    competitors: 5,
    abTestsSimultaneous: 3,
    teamMembers: 0,
  },
  business: {
    generationsPerMonth: 999999,
    chatMessagesPerDay: 999999,
    coachMessagesPerMonth: 999999,
    predictionsPerMonth: 999999,
    bulkPerMonth: 999999,
    bulkMaxTopics: 10,
    auditsPerMonth: 999999,
    trendingCountries: 12,
    competitors: 20,
    abTestsSimultaneous: 10,
    teamMembers: 5,
  },
} as const;

export async function getUserPlan(userId: string): Promise<PlanType> {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { status: true, plan: true },
  });
  if (sub?.status !== 'active') return 'free';
  return (sub.plan === 'business' ? 'business' : 'pro') as PlanType;
}

export function getLimits(plan: PlanType) {
  return PLAN_LIMITS[plan];
}

export function isPaid(plan: PlanType): boolean {
  return plan === 'pro' || plan === 'business';
}
