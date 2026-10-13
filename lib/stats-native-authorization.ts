import { readNativeVerifiedUser } from '@/lib/native-user-session';

declare const nativeStatsBrand: unique symbol;
export type NativeStatsOriginal = { readonly [nativeStatsBrand]: true };
type Owner = Readonly<{ id: string; email: string }>;
const originals = new WeakMap<object, { owner: Owner; expires: number; used: boolean }>();

// The read capability has a distinct private map from profile mutation.
// There is no actor, serialized claim, selector or recovery constructor.
export async function authorizeNativeStats(): Promise<NativeStatsOriginal | null> {
  const principal = await readNativeVerifiedUser();
  if (!principal) return null;
  const original = Object.freeze({}) as NativeStatsOriginal;
  originals.set(original, { owner: Object.freeze({ id: principal.id, email: principal.email }), expires: principal.expires, used: false });
  return original;
}
function retained(original: NativeStatsOriginal) {
  const own = original && typeof original === 'object' ? originals.get(original) : undefined;
  if (!own || own.expires <= Date.now() / 1000) throw Error('Statistics authentication unavailable');
  return own;
}
export async function runNativeStats<T>(original: NativeStatsOriginal, read: (owner: Owner, check: () => void) => Promise<T>): Promise<T> {
  const own = retained(original);
  if (own.used) throw Error('Statistics authentication unavailable');
  own.used = true;
  const result = await read(own.owner, () => { retained(original); });
  retained(original);
  return result;
}
