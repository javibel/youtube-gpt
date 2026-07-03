// Injected on ytubviral.com pages to (1) signal the extension is installed and (2) auto-connect:
// if the user is logged into ytubviral.com and the extension has no token yet, mint one via the
// session. Same-origin fetch → the NextAuth cookie is sent, so this works for Google/OAuth users
// (who have no password and can't use the email+password popup login).
'use strict';
document.documentElement.setAttribute('data-ytv-ext', '1');

(async () => {
  try {
    const has = await chrome.runtime.sendMessage({ type: 'HAS_TOKEN' });
    if (has && has.hasToken) return; // already connected
    const res = await fetch('/api/extension/token', { credentials: 'include' });
    if (!res.ok) return; // not logged in (401) or other — nothing to do
    const data = await res.json();
    if (data && data.token) {
      await chrome.runtime.sendMessage({
        type: 'STORE_TOKEN',
        token: data.token,
        user: { name: data.name, email: data.email, isPro: data.isPro },
      });
    }
  } catch { /* extension reloading or messaging unavailable — ignore */ }
})();
