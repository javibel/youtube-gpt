import 'server-only';

type Run = (request: Request) => Readonly<{
  original: Promise<{ status: number; body: Record<string, unknown> }>;
  waiter: Promise<{ status: number; body: Record<string, unknown> }>;
  readonly pending: boolean;
}>;
const key = Symbol.for('ytubviral.migration.best-time-entry.v1');
const shared = globalThis as typeof globalThis & { [key]?: Run; __ytvRuntimeGuard?: boolean };
const guarded = () => process.env.YTV_MIGRATION_WEB_TEST === '1' && shared.__ytvRuntimeGuard === true;

// No environment/body alone installs a runner. The guarded, database-identified
// local bootstrap retains this callable once; no replace, reset or recovery API.
export function installBestTimeFixtureEntry(run: Run) {
  if (!guarded() || typeof run !== 'function' || shared[key]) throw Error('Best time fixture entry unavailable');
  Object.defineProperty(shared, key, { value: run, writable: false, configurable: false });
}
export function getBestTimeFixtureEntry(): Run | undefined {
  return guarded() ? shared[key] : undefined;
}
