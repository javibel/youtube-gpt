import { readNativeVerifiedUser } from '@/lib/native-user-session';

export type NativeCalendarPurpose = 'read' | 'create' | 'update' | 'delete';
declare const nativeCalendarBrand: unique symbol;
export type NativeCalendarSession<P extends NativeCalendarPurpose = NativeCalendarPurpose> = { readonly [nativeCalendarBrand]: P };
type Owner = Readonly<{ id: string; email: string }>;
const purposes = new Set<NativeCalendarPurpose>(['read', 'create', 'update', 'delete']);
const originals = new WeakMap<object, { owner: Owner; purpose: NativeCalendarPurpose; expires: number; used: boolean }>();

// Only the native cookie reader originates this permission. Business rows and
// receipts may deny an operation; they never construct or recover its authority.
export async function authorizeNativeCalendar<P extends NativeCalendarPurpose>(purpose: P): Promise<NativeCalendarSession<P> | null> {
  if (!purposes.has(purpose)) throw Error('Calendar authentication unavailable');
  const principal = await readNativeVerifiedUser();
  if (!principal) return null;
  const original = Object.freeze({}) as NativeCalendarSession<P>;
  originals.set(original, { owner: Object.freeze({ id: principal.id, email: principal.email }), purpose, expires: principal.expires, used: false });
  return original;
}
function retained(original: NativeCalendarSession, purpose: NativeCalendarPurpose) {
  const own = original && typeof original === 'object' ? originals.get(original) : undefined;
  if (!own || own.purpose !== purpose || own.expires <= Date.now() / 1000) throw Error('Calendar authentication unavailable');
  return own;
}
export async function runNativeCalendar<P extends NativeCalendarPurpose, T>(original: NativeCalendarSession<P>, purpose: P, action: (owner: Owner, check: () => void) => Promise<T>): Promise<T> {
  const own = retained(original, purpose);
  if (own.used) throw Error('Calendar authentication unavailable');
  own.used = true;
  const result = await action(own.owner, () => { retained(original, purpose); });
  retained(original, purpose);
  return result;
}
