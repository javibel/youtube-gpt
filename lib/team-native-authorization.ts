import { readNativeVerifiedUser } from '@/lib/native-user-session';

export type NativeTeamPurpose = 'read' | 'create' | 'rename' | 'exit' | 'invite' | 'revoke' | 'member-role' | 'member-remove' | 'join';
declare const nativeTeamBrand: unique symbol;
export type NativeTeamSession<P extends NativeTeamPurpose = NativeTeamPurpose> = { readonly [nativeTeamBrand]: P };
type Owner = Readonly<{ userId: string; email: string }>;
const purposes = new Set<NativeTeamPurpose>(['read', 'create', 'rename', 'exit', 'invite', 'revoke', 'member-role', 'member-remove', 'join']);
const originals = new WeakMap<object, { owner: Owner; purpose: NativeTeamPurpose; expires: number; used: boolean }>();

// Only the native cookie reader may originate this purpose-specific permission.
// Membership rows, inputs and durable denial markers never create or recover it.
export async function authorizeNativeTeam<P extends NativeTeamPurpose>(purpose: P): Promise<NativeTeamSession<P> | null> {
  if (!purposes.has(purpose)) throw Error('Team authentication unavailable');
  const principal = await readNativeVerifiedUser();
  if (!principal) return null;
  const original = Object.freeze({}) as NativeTeamSession<P>;
  originals.set(original, { owner: Object.freeze({ userId: principal.id, email: principal.email }), purpose, expires: principal.expires, used: false });
  return original;
}
function retained(original: NativeTeamSession, purpose: NativeTeamPurpose) {
  const own = original && typeof original === 'object' ? originals.get(original) : undefined;
  if (!own || own.purpose !== purpose || own.expires <= Date.now() / 1000) throw Error('Team authentication unavailable');
  return own;
}
export async function runNativeTeam<P extends NativeTeamPurpose, T>(original: NativeTeamSession<P>, purpose: P, action: (owner: Owner, check: () => void) => Promise<T>): Promise<T> {
  const own = retained(original, purpose);
  if (own.used) throw Error('Team authentication unavailable');
  own.used = true;
  const result = await action(own.owner, () => { retained(original, purpose); });
  retained(original, purpose);
  return result;
}
