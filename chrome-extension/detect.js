'use strict';
document.documentElement.setAttribute('data-ytv-ext', '1');
// Persisted metadata is denial only: no reload, time or another tab recreates
// an issuance producer or retries its key. The original native ACK alone closes it.
(async () => {
  if (!navigator.locks?.request) return;
  await navigator.locks.request('ytv-native-token-connect', { ifAvailable: true }, async lock => {
    if (!lock) return;
    const marker = 'ytv-native-token-connect-pending';
    let key, retired = false, timer;
    const removeOwn = () => { if (localStorage.getItem(marker) === key) localStorage.removeItem(marker); };
    try {
      const ended = new Promise(resolve => { timer = setTimeout(() => { retired = true; resolve(); }, 60_000); });
      const work = (async () => {
        const has = await chrome.runtime.sendMessage({ type: 'HAS_TOKEN' });
        if (retired || has?.hasToken || localStorage.getItem(marker)) return;
        key = crypto.randomUUID();
        localStorage.setItem(marker, key);
        const res = await fetch('/api/extension/token', { credentials: 'include', cache: 'no-store', redirect: 'error', headers: { 'idempotency-key': key } });
        if (retired) return;
        if ([400, 401].includes(res.status)) { removeOwn(); return; } // Before server admission.
        if (!res.ok) return;
        const data = await res.json();
        if (retired || !data || data.key !== key || typeof data.token !== 'string' || !/^[a-f0-9]{64}$/.test(data.token)
          || typeof data.userId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(data.userId) || typeof data.email !== 'string' || data.email.length > 254
          || !/^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(data.email)
          || data.email !== data.email.trim().toLowerCase() || typeof data.isPro !== 'boolean'
          || data.name !== null && typeof data.name !== 'string') return;
        const stored = await chrome.runtime.sendMessage({ type: 'STORE_TOKEN', token: data.token,
          user: { name: data.name, email: data.email, isPro: data.isPro } });
        if (stored?.ok === true) removeOwn();
      })();
      await Promise.race([work, ended]);
    } catch { /* Retain unknown dispatch/storage. Never resume from metadata. */ }
    finally { retired = true; clearTimeout(timer); }
  });
})().catch(() => {});
