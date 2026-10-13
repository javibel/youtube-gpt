import { readNativeVerifiedUser } from '@/lib/native-user-session';
import { authorizeExtensionCoach, runExtensionCoach, type ExtensionCoachSession } from '@/lib/extension-auth';

declare const nativeCoachBrand: unique symbol;
export type NativeCoachSession = { readonly [nativeCoachBrand]: true };
type Owner = Readonly<{ id: string; email: string }> & (
  Readonly<{ source: 'web' }> | Readonly<{ source: 'extension'; isPro: boolean }>
);
type Original = { source: 'web'; owner: Owner; expires: number; used: boolean }
  | { source: 'extension'; original: ExtensionCoachSession; used: boolean };
const originals = new WeakMap<object, Original>();

// Cookie and extension credentials have distinct original readers. A failed
// cookie does not fall through to an unrelated Bearer/row or refresh a session.
export async function authorizeNativeCoach(request: Request): Promise<NativeCoachSession | null> {
  let own: Original;
  if (request.headers.get('cookie')) {
    const principal = await readNativeVerifiedUser();
    if (!principal) return null;
    own = { source: 'web', owner: Object.freeze({ id: principal.id, email: principal.email, source: 'web' }), expires: principal.expires, used: false };
  } else {
    const original = await authorizeExtensionCoach(request);
    if (!original) return null;
    own = { source: 'extension', original, used: false };
  }
  const original = Object.freeze({}) as NativeCoachSession;
  originals.set(original, own);
  return original;
}
function retained(original: NativeCoachSession) {
  const own = original && typeof original === 'object' ? originals.get(original) : undefined;
  if (!own || own.source === 'web' && own.expires <= Date.now() / 1000) throw Error('Coach authentication unavailable');
  return own;
}
export async function runNativeCoach<T>(original: NativeCoachSession, action: (owner: Owner, check: () => void) => Promise<T>): Promise<T> {
  const own = retained(original);
  if (own.used) throw Error('Coach authentication unavailable');
  own.used = true;
  if (own.source === 'extension') return runExtensionCoach(own.original, (owner, check) => action(
    Object.freeze({ ...owner, source: 'extension' }), () => { retained(original); check(); },
  ));
  const result = await action(own.owner, () => { retained(original); });
  retained(original);
  return result;
}
