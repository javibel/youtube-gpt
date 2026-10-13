import { readNativeVerifiedUser } from '@/lib/native-user-session';
import { changePasswordOriginal } from '@/lib/password-change';
import type { PasswordChangeResult } from '@/lib/password-change';

declare const nativePasswordChangeBrand: unique symbol;
export type NativePasswordChangeSession = { readonly [nativePasswordChangeBrand]: true };
type Original = {
  owner: Readonly<{ userId: string; email: string }>;
  expires: number;
  used: boolean;
};
const originals = new WeakMap<object, Original>();

// This purpose owns its original independently of profile/stats/history.
export async function authorizeNativePasswordChange(): Promise<NativePasswordChangeSession | null> {
  const principal = await readNativeVerifiedUser();
  if (!principal) return null;
  const original = Object.freeze({}) as NativePasswordChangeSession;
  originals.set(original, { owner: Object.freeze({ userId: principal.id, email: principal.email }), expires: principal.expires, used: false });
  return original;
}
function retained(original: NativePasswordChangeSession): Original {
  const own = original && typeof original === 'object' ? originals.get(original) : undefined;
  if (!own || own.expires <= Date.now() / 1000) throw Error('Password authentication unavailable');
  return own;
}
// Expiry only denies. Fields, JSON, rows, IDs or time cannot create or recover
// an original, extend its lifetime, or authorize another password invocation.
export function checkNativePasswordChange(original: NativePasswordChangeSession): void {
  retained(original);
}
export async function dispatchNativePasswordChange(original: NativePasswordChangeSession, input: unknown, key: string, beforeStep: () => void): Promise<PasswordChangeResult> {
  const own = retained(original);
  if (own.used) throw Error('Password authentication unavailable');
  own.used = true;
  const check = () => { beforeStep(); retained(original); };
  check();
  return changePasswordOriginal(own.owner, input, key, check);
}
