import { readNativeVerifiedUser } from '@/lib/native-user-session';

export type NativeChatPurpose = 'read' | 'send';
declare const nativeChatBrand: unique symbol;
export type NativeChatSession<P extends NativeChatPurpose = NativeChatPurpose> = { readonly [nativeChatBrand]: P };
type Owner = Readonly<{ id: string; email: string }>;
const purposes = new Set<NativeChatPurpose>(['read', 'send']);
const originals = new WeakMap<object, { owner: Owner; purpose: NativeChatPurpose; expires: number; used: boolean }>();

// Only the native cookie reader originates this permission. Business rows and
// receipts may deny an operation; they never construct or recover its authority.
export async function authorizeNativeChat<P extends NativeChatPurpose>(purpose: P): Promise<NativeChatSession<P> | null> {
  if (!purposes.has(purpose)) throw Error('Chat authentication unavailable');
  const principal = await readNativeVerifiedUser();
  if (!principal) return null;
  const original = Object.freeze({}) as NativeChatSession<P>;
  originals.set(original, { owner: Object.freeze({ id: principal.id, email: principal.email }), purpose, expires: principal.expires, used: false });
  return original;
}
function retained(original: NativeChatSession, purpose: NativeChatPurpose) {
  const own = original && typeof original === 'object' ? originals.get(original) : undefined;
  if (!own || own.purpose !== purpose || own.expires <= Date.now() / 1000) throw Error('Chat authentication unavailable');
  return own;
}
export async function runNativeChat<P extends NativeChatPurpose, T>(original: NativeChatSession<P>, purpose: P, action: (owner: Owner, check: () => void) => Promise<T>): Promise<T> {
  const own = retained(original, purpose);
  if (own.used) throw Error('Chat authentication unavailable');
  own.used = true;
  const result = await action(own.owner, () => { retained(original, purpose); });
  retained(original, purpose);
  return result;
}
