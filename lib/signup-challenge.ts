'use client';
export type SignupChallenge = Readonly<{ kind: 'signup-challenge' }>;
type WidgetApi = {
  ready: (fn: () => void) => void;
  render: (container: HTMLElement, options: { sitekey: string; action: string; theme: string; language: string; callback: (token: string) => void; 'expired-callback': () => void; 'error-callback': () => void }) => string;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: WidgetApi } }
type State = Readonly<{ status: 'loading' | 'ready' | 'expired' | 'unavailable'; challenge?: SignupChallenge }>;
const challenges = new WeakMap<SignupChallenge, { token: string | null; lang: 'es' | 'en'; expires: number; live: () => boolean; consumed: () => void }>();
let loading: Promise<WidgetApi> | undefined;
function api() { const value = window.turnstile; return value && typeof value.ready === 'function' && typeof value.render === 'function' && typeof value.remove === 'function' ? value : undefined; }
function loadApi() {
  const existing = api(); if (existing) return Promise.resolve(existing);
  if (!loading) loading = new Promise<WidgetApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true; script.defer = true;
    script.onload = () => { const loaded = api(); if (loaded) resolve(loaded); else reject(new Error('Widget unavailable')); };
    script.onerror = () => reject(new Error('Widget unavailable'));
    try { document.head.appendChild(script); } catch { reject(new Error('Widget unavailable')); }
    // One original loader per module. Unmount never removes another widget's script
    // or retries an uncertain load. No real script executes in the offline tests.
  });
  return loading;
}
/** This private widget input is never bot/authentication/consent/freshness proof.
 * Server Siteverify remains mandatory. Expiry/cleanup can only invalidate it.
 * https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
 */
export function attachSignupChallenge(container: HTMLElement, sitekey: string, lang: 'es' | 'en', onState: (state: State) => void) {
  let live = true, spent = false, widget: WidgetApi | undefined, id: string | undefined, current: SignupChallenge | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  const invalidate = () => { if (current) { const own = challenges.get(current); if (own) own.token = null; } current = undefined; if (expiry !== undefined) clearTimeout(expiry); };
  const emit = (state: State) => { if (live) onState(state); };
  const valid = () => live && id !== undefined && container.isConnected;
  const unavailable = () => { invalidate(); emit({ status: 'unavailable' }); };
  const timer = setTimeout(() => { unavailable(); live = false; }, 15000);
  emit({ status: 'loading' });
  if (!sitekey || (lang !== 'es' && lang !== 'en')) { clearTimeout(timer); unavailable(); live = false; }
  else void loadApi().then(loaded => {
    if (!live || !container.isConnected) return;
    widget = loaded;
    loaded.ready(() => {
      if (!live || !container.isConnected) return;
      clearTimeout(timer);
      try {
        id = loaded.render(container, { sitekey, action: 'signup', theme: 'dark', language: lang,
          callback: token => {
            if (!valid() || spent || typeof token !== 'string' || !/^[!-~]{1,2048}$/.test(token)) return;
            invalidate(); const own: SignupChallenge = Object.freeze({ kind: 'signup-challenge' }); current = own;
            challenges.set(own, { token, lang, expires: Date.now() + 240000, live: () => valid() && current === own, consumed: () => { spent = true; } });
            expiry = setTimeout(() => { if (current === own) { invalidate(); emit({ status: 'expired' }); } }, 240000);
            emit({ status: 'ready', challenge: own });
          },
          'expired-callback': () => { if (valid()) { invalidate(); emit({ status: 'expired' }); } },
          'error-callback': () => { if (valid()) unavailable(); },
        });
        if (typeof id !== 'string' || !id) { id = undefined; unavailable(); }
      } catch { unavailable(); }
    });
  }).catch(() => { clearTimeout(timer); if (live) unavailable(); });
  return { dispose() {
    if (!live && id === undefined) return;
    live = false; clearTimeout(timer); invalidate();
    const ownId = id; id = undefined;
    if (widget && ownId !== undefined) { try { widget.remove(ownId); } catch { /* No reset(undefined), foreign widget or account recovery. */ } }
  } };
}
export function consumeSignupChallenge(challenge: SignupChallenge, lang: 'es' | 'en') {
  const own = challenges.get(challenge);
  if (!own || own.lang !== lang || !own.token || !own.live() || Date.now() >= own.expires) return;
  const token = own.token; own.token = null; own.consumed(); return token;
}
