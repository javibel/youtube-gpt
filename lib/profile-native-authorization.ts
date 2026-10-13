import { readNativeVerifiedUser } from '@/lib/native-user-session';
import { updateProfileOriginal } from '@/lib/profile-update';
import type { ProfileUpdateResult } from '@/lib/profile-update';

declare const nativeProfileSessionBrand: unique symbol;
export type NativeProfileSession = { readonly [nativeProfileSessionBrand]: true };
type Original = {
  owner: Readonly<{ userId: string; email: string }>;
  expires: number;
  used: boolean;
};
const originals = new WeakMap<object, Original>();
export async function authorizeNativeProfile(): Promise<NativeProfileSession | null> {
  const principal = await readNativeVerifiedUser();
  if (!principal) return null;
  const original = Object.freeze({}) as NativeProfileSession;
  originals.set(original, { owner: Object.freeze({ userId: principal.id, email: principal.email }), expires: principal.expires, used: false });
  return original;
}

function retained(original: NativeProfileSession): Original {
  const own = original && typeof original === 'object' ? originals.get(original) : undefined;
  if (!own || own.expires <= Date.now() / 1000) throw Error('Profile authentication unavailable');
  return own;
}

// WeakMap identity, never fields, hashes, dates or persisted IDs, joins the
// original. Expiry only denies; it cannot extend or restore an authorization.
export function checkNativeProfile(original: NativeProfileSession): void {
  retained(original);
}

export async function dispatchNativeProfile(original: NativeProfileSession, input: unknown, key: string, beforeStep: () => void): Promise<ProfileUpdateResult> {
  const own = retained(original);
  if (own.used) throw Error('Profile authentication unavailable');
  own.used = true;
  const check = () => { beforeStep(); retained(original); };
  check();
  return updateProfileOriginal(own.owner, input, key, check);
}
