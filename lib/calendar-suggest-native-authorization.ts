import { readNativeVerifiedUser } from '@/lib/native-user-session';

declare const nativeCalendarSuggestBrand: unique symbol;
export type NativeCalendarSuggestOriginal = { readonly [nativeCalendarSuggestBrand]: true };
type Owner = Readonly<{ id: string; email: string }>;
const originals = new WeakMap<object, { owner: Owner; expires: number; used: boolean }>();

// Suggestions own a distinct private map from calendar read/write and other purposes.
// There is no actor, serialized claim, selector or recovery constructor.
export async function authorizeNativeCalendarSuggest(): Promise<NativeCalendarSuggestOriginal | null> {
  const principal = await readNativeVerifiedUser();
  if (!principal) return null;
  const original = Object.freeze({}) as NativeCalendarSuggestOriginal;
  originals.set(original, { owner: Object.freeze({ id: principal.id, email: principal.email }), expires: principal.expires, used: false });
  return original;
}
function retained(original: NativeCalendarSuggestOriginal) {
  const own = original && typeof original === 'object' ? originals.get(original) : undefined;
  if (!own || own.expires <= Date.now() / 1000) throw Error('Calendar suggestions authentication unavailable');
  return own;
}
export async function runNativeCalendarSuggest<T>(original: NativeCalendarSuggestOriginal, produce: (owner: Owner, check: () => void) => Promise<T>): Promise<T> {
  const own = retained(original);
  if (own.used) throw Error('Calendar suggestions authentication unavailable');
  own.used = true;
  const result = await produce(own.owner, () => { retained(original); });
  retained(original);
  return result;
}
