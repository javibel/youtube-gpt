import type { Prisma } from '@prisma/client';

// Caller must hold the user's row lock through admission/save/completion.
// Complete attempts are charged by Generation; uncertain attempts retain a slot.
// Accounting periods do not authorize reclaim or repeating an image effect.
export async function thumbnailQuota(tx: Prisma.TransactionClient, userId: string, month: Date) {
  const recorded = await tx.generation.count({ where: { userId, createdAt: { gte: month } } });
  const reserved = await tx.legacyThumbnailAttempt.count({
    where: { userId, createdAt: { gte: month }, state: { not: 'complete' } },
  });
  const total = recorded + reserved;
  if (![recorded, reserved, total].every(n => Number.isSafeInteger(n) && n >= 0)) {
    throw Error('Quota unavailable');
  }
  return { recorded, reserved, total };
}
