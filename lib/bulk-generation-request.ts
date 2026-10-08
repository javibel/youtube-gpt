import { prisma } from '@/lib/prisma';

// This table binds the entire ordered batch, including duplicates and options.
// A lookup is identity evidence, never permission to run unstarted items.
export async function admitBulkRequest(userId: string, id: string, inputDigest: string, itemIds: string[],
  signal: AbortSignal, preflight: () => Promise<Response | null>, readOnly = false) {
  const unavailable = () => Response.json({ error: 'Batch unconfirmed', retryMayConsume: false },
    { status: 503, headers: { 'Cache-Control': 'no-store' } });
  const check = (row: { id: string; userId: string; inputDigest: string; itemCount: number; createdAt: Date }) => {
    if (row.id !== id || row.userId !== userId || row.inputDigest !== inputDigest || row.itemCount !== itemIds.length) {
      return Response.json({ error: 'Operation input changed' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    }
    return Number.isFinite(row.createdAt?.getTime()) ? null : unavailable();
  };
  try {
    if (!/^bulk_[a-f0-9]{64}$/.test(id) || !/^[a-f0-9]{64}$/.test(inputDigest) || !userId || signal.aborted
      || itemIds.length < 1 || itemIds.length > 10 || itemIds.some(v => !/^generate_[a-f0-9]{64}$/.test(v))
      || new Set(itemIds).size !== itemIds.length) return unavailable();
    const existing = await prisma.$transaction(async tx => {
      const owner = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM users WHERE id=$1 FOR UPDATE', userId);
      if (owner.length !== 1 || owner[0].id !== userId || signal.aborted) throw Error('Batch unavailable');
      return tx.bulkGenerationRequest.findUnique({ where: { id } });
    }, { maxWait: 10_000, timeout: 15_000 });
    if (existing) return check(existing) ?? { fresh: false };
    // Browser-retained input/key is not evidence that admission ever happened.
    // Missing durable identity cannot turn an explicit recovery into fresh work.
    if (readOnly) return Response.json({ error: 'Batch not admitted', retryMayConsume: false },
      { status: 409, headers: { 'Cache-Control': 'no-store' } });
    const denied = await preflight();
    return await prisma.$transaction(async tx => {
      const owner = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM users WHERE id=$1 FOR UPDATE', userId);
      if (owner.length !== 1 || owner[0].id !== userId || signal.aborted) throw Error('Batch unavailable');
      const raced = await tx.bulkGenerationRequest.findUnique({ where: { id } });
      if (raced) return check(raced) ?? { fresh: false };
      if (denied) return denied;
      // Deleting the identity row cannot turn retained items into a fresh batch.
      if (await tx.textGenerationAttempt.count({ where: { id: { in: itemIds } } })
        || await tx.generation.count({ where: { id: { in: itemIds } } })) return unavailable();
      const row = await tx.bulkGenerationRequest.create({ data: { id, userId, inputDigest, itemCount: itemIds.length } });
      const invalid = check(row);
      if (invalid) throw Error('Batch acknowledgement unavailable');
      return { fresh: true };
    }, { maxWait: 10_000, timeout: 15_000 });
  } catch { return unavailable(); }
}
