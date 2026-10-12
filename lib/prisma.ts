import { PrismaClient } from "@prisma/client";
import { getFixtureLifecycle } from './migration/local-fixture-lifecycle.cjs';

const fixtureKey = Symbol.for('ytubviral.migration.fixture-prisma.v1');
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  [fixtureKey]?: PrismaClient;
};

function createClient(): PrismaClient {
  if (process.env.YTV_MIGRATION_WEB_TEST === '1') {
    const lifecycle = getFixtureLifecycle();
    lifecycle.check();
    const existing = globalForPrisma[fixtureKey];
    if (existing !== undefined) {
      if (!(existing instanceof PrismaClient)) throw Error('Original fixture Prisma client required');
      return existing;
    }
    const client = new PrismaClient();
    // Capture this exact client before any caller can start a native query.
    // Registration itself is joined work; its failure denies clean drainage.
    void lifecycle.openResource(async () => ({ close: () => client.$disconnect() })).catch(() => {});
    Object.defineProperty(globalForPrisma, fixtureKey, { value: client, writable: false, configurable: false });
    return client;
  }
  return globalForPrisma.prisma ?? new PrismaClient();
}
export const prisma = createClient();

if (process.env.NODE_ENV !== "production" && process.env.YTV_MIGRATION_WEB_TEST !== '1') globalForPrisma.prisma = prisma;
