import { prisma } from '@/lib/prisma';
import { thumbnailQuota } from '@/lib/image/thumbnail-quota';

// Read a consistent snapshot of history plus admitted legacy image capacity.
// This releases the owner lock before text inference: it is not a text reservation
// and must not be used to claim global admission or recovered model authority.
export async function readGenerationQuotaSnapshot(userId: string, month: Date) {
  return prisma.$transaction(async tx => {
    const owner = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT id FROM users WHERE id=$1 FOR UPDATE', userId,
    );
    if (owner.length !== 1 || owner[0].id !== userId) throw Error('Quota owner unavailable');
    return thumbnailQuota(tx,userId,month);
  }, { maxWait: 10_000, timeout: 15_000 });
}

export async function readGenerationQuota(userId: string, month: Date) {
  return (await readGenerationQuotaSnapshot(userId, month)).total;
}
