// Await only the immutable owner supplied by trusted Node bootstrap. Ordinary
// data/session routes never import this request gate. Configuration cannot
// create capabilities, renew a failed installation or replace its promise.
const key = Symbol.for('ytubviral.ai.operational-web-capabilities.v1');
type Original = Readonly<{ install: () => Promise<unknown> }>;

export function waitForOperationalWebRuntime(): Promise<unknown> {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
  // Standalone synthetic runtimes retain their existing explicit installers.
  if (!descriptor) return Promise.resolve();
  if (!Object.hasOwn(descriptor, 'value') || descriptor.writable !== false || descriptor.configurable !== false) {
    return Promise.reject(new Error('Original operational runtime registration required'));
  }
  const original = descriptor.value as Original;
  if (!original || !Object.isFrozen(original) || typeof original.install !== 'function') {
    return Promise.reject(new Error('Original operational runtime capabilities required'));
  }
  return original.install();
}
