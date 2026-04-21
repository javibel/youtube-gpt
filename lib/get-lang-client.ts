/**
 * Reads the user's language preference on the client.
 * Priority: cookie (same source the server reads) → localStorage → 'es'
 */
export function getLangClient(): 'es' | 'en' {
  if (typeof document === 'undefined') return 'es';
  const match = document.cookie.match(/(?:^|;\s*)ytubviral_lang=([^;]+)/);
  const cookieVal = match?.[1];
  if (cookieVal === 'en' || cookieVal === 'es') return cookieVal;
  try {
    const stored = localStorage.getItem('ytubviral_lang');
    if (stored === 'en' || stored === 'es') return stored;
  } catch {}
  return 'es';
}

/** Persists a language choice to both cookie and localStorage. */
export function setLangClient(lang: 'es' | 'en') {
  document.cookie = `ytubviral_lang=${lang};path=/;max-age=31536000;samesite=lax`;
  try { localStorage.setItem('ytubviral_lang', lang); } catch {}
}
