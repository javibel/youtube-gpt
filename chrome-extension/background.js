'use strict';

const API_BASE = 'https://ytubviral.com';
const FETCH_TIMEOUT_MS = 15000;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg)
    .then(sendResponse)
    .catch(err => sendResponse({ error: err.message || 'Unknown error', limit: err.limit }));
  return true; // keep channel open for async response
});

// Shared fetch wrapper (v2.5.0): adds a timeout — a hung request used to leave the panel
// spinning forever — and never throws on a non-JSON response (a Vercel/Cloudflare error
// page: 502, bot challenge — used to surface as a raw "Unexpected token '<'" to the user).
async function apiFetch(url, opts = {}) {
  let res;
  try {
    res = await fetch(url, { ...opts, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error('timeout');
    throw new Error('network_error');
  }
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON response — keep data = {} */ }
  return { res, data };
}

async function getToken() {
  return new Promise(resolve => {
    chrome.storage.local.get('ytv_token', data => resolve(data.ytv_token || null));
  });
}

async function getLang() {
  return new Promise(resolve => {
    chrome.storage.local.get('ytv_lang', data => resolve(data.ytv_lang || 'es'));
  });
}

// Translates the two connection-level errors apiFetch can throw into the same bilingual
// copy every handler already used for its own domain errors, so renderError() in
// content.js doesn't need to know about them specially.
function connErrorMessage(err, lang, fallback) {
  if (err.message === 'timeout') return lang === 'en' ? 'Request timed out. Try again.' : 'La petición tardó demasiado. Inténtalo de nuevo.';
  if (err.message === 'network_error') return lang === 'en' ? 'Connection error. Check your internet.' : 'Error de conexión. Comprueba tu internet.';
  return fallback;
}

async function handleMessage(msg) {
  const lang = await getLang();

  switch (msg.type) {

    case 'LOGIN': {
      let res, data;
      try {
        ({ res, data } = await apiFetch(`${API_BASE}/api/extension/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: msg.email, password: msg.password }),
        }));
      } catch (err) { throw new Error(connErrorMessage(err, lang, err.message)); }
      if (!res.ok) throw new Error(data.error || (lang === 'en' ? 'Login failed' : 'Error al iniciar sesión'));
      await chrome.storage.local.set({
        ytv_token: data.token,
        ytv_user: { name: data.name, email: data.email, isPro: data.isPro },
      });
      return { name: data.name, email: data.email, isPro: data.isPro };
    }

    case 'LOGOUT': {
      await chrome.storage.local.remove(['ytv_token', 'ytv_user']);
      return { ok: true };
    }

    case 'HAS_TOKEN': {
      const token = await getToken();
      return { hasToken: !!token };
    }

    case 'STORE_TOKEN': {
      // Web auto-connect (detect.js on ytubviral.com) — store the session-minted token + user.
      if (!msg.token) return { ok: false };
      await chrome.storage.local.set({
        ytv_token: msg.token,
        ...(msg.user ? { ytv_user: msg.user } : {}),
      });
      return { ok: true };
    }

    case 'GET_USER': {
      const token = await getToken();
      if (!token) return null;
      // Return cached user instantly if available
      const cached = await new Promise(resolve => {
        chrome.storage.local.get('ytv_user', data => resolve(data.ytv_user || null));
      });
      if (cached) {
        // Refresh in background (don't await — caller gets instant response)
        apiFetch(`${API_BASE}/api/extension/me`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }).then(async ({ res, data }) => {
          if (res.status === 401) {
            // Token expired/revoked — clear it so the UI reflects logged-out next time
            await chrome.storage.local.remove(['ytv_token', 'ytv_user']);
          } else if (res.ok && data && data.email) {
            // data.email guard: a 200 with a non-JSON body (proxy error page) leaves data={}
            // — don't overwrite a good cached user with an empty object
            await chrome.storage.local.set({ ytv_user: data });
          }
        }).catch(() => {});
        return cached;
      }
      // No cache — must fetch (first load after login on new page)
      try {
        const { res, data } = await apiFetch(`${API_BASE}/api/extension/me`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (res.status === 401) {
          await chrome.storage.local.remove(['ytv_token', 'ytv_user']);
          return null;
        }
        if (!res.ok || !data || !data.email) return null; // data.email: see guard note above
        await chrome.storage.local.set({ ytv_user: data });
        return data;
      } catch {
        return null;
      }
    }

    case 'SET_LANG': {
      await chrome.storage.local.set({ ytv_lang: msg.lang });
      return { ok: true };
    }

    case 'GET_LANG': {
      return { lang };
    }

    case 'COMPETITOR': {
      const token = await getToken();
      if (!token) throw new Error('not_logged_in');
      let res, data;
      try {
        ({ res, data } = await apiFetch(`${API_BASE}/api/youtube/competitor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ url: msg.url, lang: msg.lang || lang }),
        }));
      } catch (err) { throw new Error(connErrorMessage(err, lang, err.message)); }
      if (res.status === 403 && data.error === 'pro_required') throw new Error(lang === 'en' ? 'Pro plan required. Upgrade at ytubviral.com' : 'Plan Pro requerido. Actualiza en ytubviral.com');
      if (!res.ok) throw new Error(data.error || (lang === 'en' ? 'Channel analysis error' : 'Error al analizar canal'));
      return data;
    }

    case 'KEYWORDS': {
      const token = await getToken();
      if (!token) throw new Error('not_logged_in');
      let res, data;
      try {
        ({ res, data } = await apiFetch(`${API_BASE}/api/research/keywords`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ keyword: msg.keyword }),
        }));
      } catch (err) { throw new Error(connErrorMessage(err, lang, err.message)); }
      if (res.status === 403 && data.error === 'pro_required') throw new Error(lang === 'en' ? 'Pro plan required. Upgrade at ytubviral.com' : 'Plan Pro requerido. Actualiza en ytubviral.com');
      if (!res.ok) throw new Error(data.error || (lang === 'en' ? 'Keyword search error' : 'Error al buscar keywords'));
      return data;
    }

    case 'GENERATE': {
      const token = await getToken();
      if (!token) throw new Error('not_logged_in');
      let res, data;
      try {
        ({ res, data } = await apiFetch(`${API_BASE}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            template: msg.template,
            inputs: msg.inputs,
            lang: msg.lang || lang,
          }),
        }));
      } catch (err) { throw new Error(connErrorMessage(err, lang, err.message)); }
      if (res.status === 403 && data.error === 'pro_required') throw new Error(lang === 'en' ? 'Pro plan required. Upgrade at ytubviral.com' : 'Plan Pro requerido. Actualiza en ytubviral.com');
      if (!res.ok) throw new Error(data.error || (lang === 'en' ? 'Content generation error' : 'Error al generar contenido'));
      return data;
    }

    case 'SEO_QUICK': {
      const token = await getToken();
      if (!token) throw new Error('not_logged_in');
      let res, data;
      try {
        ({ res, data } = await apiFetch(`${API_BASE}/api/extension/seo-quick`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ videoId: msg.videoId, lang: msg.lang || lang }),
        }));
      } catch (err) { throw new Error(connErrorMessage(err, lang, err.message)); }
      if (res.status === 403 && data.error === 'pro_required') throw new Error(lang === 'en' ? 'Pro plan required. Upgrade at ytubviral.com' : 'Plan Pro requerido. Actualiza en ytubviral.com');
      if (!res.ok) throw new Error(data.error || (lang === 'en' ? 'SEO analysis error' : 'Error al analizar SEO'));
      return data;
    }

    case 'CHANNEL_STATS': {
      const token = await getToken();
      if (!token) throw new Error('not_logged_in');
      let res, data;
      try {
        ({ res, data } = await apiFetch(`${API_BASE}/api/extension/channel-stats`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: '{}',
        }));
      } catch (err) { throw new Error(connErrorMessage(err, lang, err.message)); }
      if (!res.ok) throw new Error(data.error || (lang === 'en' ? 'Stats error' : 'Error al cargar stats'));
      return data;
    }

    case 'SCORECARD': {
      // v2.7: works without login — the scorecard endpoint now serves public YouTube data to
      // anonymous callers (rate-limited by IP). Send the token only if we have one.
      const token = await getToken();
      let res, data;
      try {
        ({ res, data } = await apiFetch(`${API_BASE}/api/extension/video-scorecard`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ videoId: msg.videoId }),
        }));
      } catch (err) { throw new Error(connErrorMessage(err, lang, err.message)); }
      if (res.status === 429) throw new Error('rate_limited');
      if (!res.ok) throw new Error(data.error || (lang === 'en' ? 'Scorecard error' : 'Error al cargar scorecard'));
      return data;
    }

    case 'SEO_LIVE': {
      const token = await getToken();
      if (!token) throw new Error('not_logged_in');
      let res, data;
      try {
        ({ res, data } = await apiFetch(`${API_BASE}/api/extension/seo-live`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ title: msg.title, description: msg.description, tags: msg.tags || [] }),
        }));
      } catch (err) { throw new Error(connErrorMessage(err, lang, err.message)); }
      if (!res.ok) throw new Error(data.error || 'SEO live error');
      return data;
    }

    case 'COMMENTS': {
      const token = await getToken();
      if (!token) throw new Error('not_logged_in');
      let res, data;
      try {
        ({ res, data } = await apiFetch(`${API_BASE}/api/extension/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ videoId: msg.videoId }),
        }));
      } catch (err) { throw new Error(connErrorMessage(err, lang, err.message)); }
      if (!res.ok) throw new Error(data.error || (lang === 'en' ? 'Comments error' : 'Error al cargar comentarios'));
      return data;
    }

    case 'VIDEO_BATCH': {
      // v2.7: works without login (VPH badges = ambient value at second 1). Token is optional.
      const token = await getToken();
      let res, data;
      try {
        ({ res, data } = await apiFetch(`${API_BASE}/api/extension/video-batch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ videoIds: msg.videoIds }),
        }));
      } catch (err) { throw new Error(connErrorMessage(err, lang, err.message)); }
      if (res.status === 429) throw new Error('rate_limited');
      if (!res.ok) throw new Error(data.error || 'Batch error');
      return data;
    }

    case 'BEST_TIME': {
      const token = await getToken();
      if (!token) throw new Error('not_logged_in');
      let res, data;
      try {
        ({ res, data } = await apiFetch(`${API_BASE}/api/extension/best-time`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }));
      } catch (err) { throw new Error(connErrorMessage(err, lang, err.message)); }
      if (!res.ok) throw new Error(data.error || (lang === 'en' ? 'Best time error' : 'Error al cargar best time'));
      return data;
    }

    case 'AB_CREATE': {
      // A diferencia del resto de handlers, aquí NO se traduce el error a un
      // mensaje bonito — content.js necesita el código crudo (pro_required,
      // active_test_exists, max_active_tests, youtube_not_connected,
      // youtube_reconnect_required) para pintar una tarjeta distinta por caso
      // (la de pro_required es el momento de conversión de la release).
      const token = await getToken();
      if (!token) throw new Error('not_logged_in');
      let res, data;
      try {
        ({ res, data } = await apiFetch(`${API_BASE}/api/extension/ab-test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            videoId: msg.videoId,
            variantA: msg.variantA,
            variantB: msg.variantB,
          }),
        }));
      } catch (err) { throw new Error(connErrorMessage(err, lang, err.message)); }
      if (!res.ok) {
        const e = new Error(data.error || 'ab_test_error');
        e.limit = data.limit; // solo presente en max_active_tests
        throw e;
      }
      return data;
    }

    case 'DAILY_IDEAS': {
      const token = await getToken();
      if (!token) return { ideas: null };

      // Cache 1 fetch/día: la homepage se visita muchas veces y las ideas no
      // cambian en el día. Limpia claves de días anteriores al escribir la nueva.
      const today = new Date().toISOString().slice(0, 10);
      const cacheKey = `ytv_ideas_${today}`;
      const cached = await new Promise(resolve => {
        chrome.storage.local.get(cacheKey, data => resolve(data[cacheKey]));
      });
      if (cached) return cached;

      let res, data;
      try {
        ({ res, data } = await apiFetch(`${API_BASE}/api/extension/daily-ideas`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }));
      } catch {
        return { ideas: null }; // panel de homepage: fallar en silencio, no molestar
      }
      if (!res.ok) return { ideas: null };

      // Solo las claves de CACHÉ por fecha (ytv_ideas_YYYY-MM-DD), NO las de
      // preferencias que comparten prefijo: ytv_ideas_dismissed_<fecha>,
      // ytv_ideas_collapsed, ytv_ideas_upsell_last. Un `startsWith('ytv_ideas_')`
      // las borraba todas en el primer fetch de cada día — reseteaba el estado
      // colapsado a diario y rompía el throttle semanal del upsell.
      const allKeys = await new Promise(resolve => chrome.storage.local.get(null, resolve));
      const staleKeys = Object.keys(allKeys).filter(k => /^ytv_ideas_\d{4}-\d{2}-\d{2}$/.test(k) && k !== cacheKey);
      if (staleKeys.length) await chrome.storage.local.remove(staleKeys);
      await chrome.storage.local.set({ [cacheKey]: data });
      return data;
    }

    default:
      throw new Error('Unknown message: ' + msg.type);
  }
}
