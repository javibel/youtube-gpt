import { readNativeVerifiedUser } from '@/lib/native-user-session';

declare const nativeCoachBrand: unique symbol;
export type NativeCoachSession = { readonly [nativeCoachBrand]: true };
type Owner = Readonly<{ id: string; email: string; source: 'web' }>;
type Original = { owner: Owner; expires: number; used: boolean };
const originals = new WeakMap<object, Original>();

// Cookie authentication stays separate from the extension purpose. A failed
// cookie never falls through to a Bearer credential or refreshes a session.
export async function authorizeNativeCoach(request: Request): Promise<NativeCoachSession | null> {
  if (!request.headers.get('cookie')) return null;
  const principal = await readNativeVerifiedUser();
  if (!principal) return null;
  const original = Object.freeze({}) as NativeCoachSession;
  originals.set(original, { owner: Object.freeze({ id: principal.id, email: principal.email, source: 'web' }), expires: principal.expires, used: false });
  return original;
}
function retained(original: NativeCoachSession) {
  const own = original && typeof original === 'object' ? originals.get(original) : undefined;
  if (!own || own.expires <= Date.now() / 1000) throw Error('Coach authentication unavailable');
  return own;
}
export async function runNativeCoach<T>(original: NativeCoachSession, action: (owner: Owner, check: () => void) => Promise<T>): Promise<T> {
  const own = retained(original);
  if (own.used) throw Error('Coach authentication unavailable');
  own.used = true;
  const result = await action(own.owner, () => { retained(original); });
  retained(original);
  return result;
}
