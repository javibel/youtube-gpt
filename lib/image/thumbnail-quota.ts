import type { Prisma } from '@prisma/client';

// Caller must hold the user's row lock through admission/save/completion.
// Complete attempts are charged by Generation; uncertain attempts retain a slot.
// Keyed editor saves keep their original charge after history deletion.
// Accounting periods do not authorize reclaim or repeating an image effect.
export async function thumbnailQuota(tx: Prisma.TransactionClient, userId: string, month: Date) {
  const history = await tx.generation.count({ where: { userId, createdAt: { gte: month } } });
  const deleted = await tx.$queryRaw<Array<{ retained: number }>>`
    SELECT COUNT(*)::double precision AS retained
    FROM thumbnail_save_receipts AS receipt
    WHERE receipt."userId"=${userId} AND receipt."createdAt">=${month}
      AND NOT EXISTS (SELECT 1 FROM generations AS history WHERE history.id=receipt.id AND history."userId"=receipt."userId")
  `;
  if (deleted.length !== 1 || !Number.isSafeInteger(deleted[0].retained) || deleted[0].retained < 0) {
    throw Error('Quota unavailable');
  }
  const retained = deleted[0].retained;
  const recorded = history + retained;
  const imageReserved = await tx.legacyThumbnailAttempt.count({
    where: { userId, createdAt: { gte: month }, state: { not: 'complete' } },
  });
  const textReserved = await tx.textGenerationAttempt.count({
    where: { userId, createdAt: { gte: month }, state: { not: 'complete' } },
  });
  const reserved = imageReserved + textReserved;
  const total = recorded + reserved;
  if (![history, retained, recorded, imageReserved, textReserved, reserved, total].every(n => Number.isSafeInteger(n) && n >= 0)) {
    throw Error('Quota unavailable');
  }
  return { recorded, reserved, total };
}
