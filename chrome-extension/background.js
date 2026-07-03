'use strict';

const API_BASE = 'https://ytubviral.com';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg)
    .then(sendResponse)
    .catch(err => sendResponse({ error: err.message || 'Unknown error' }));
  return true; // keep channel open for async response
});

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

async function handleMessage(msg) {
  const lang = await getLang();

  switch (msg.type) {

    case 'LOGIN': {
      const res = await fetch(`${API_BASE}/api/extension/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: msg.email, password: msg.password }),
      });
      const data = await res.json();
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
        fetch(`${API_BASE}/api/extension/me`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }).then(async res => {
          if (res.status === 401) {
            // Token expired/revoked — clear it so the UI reflects logged-out next time
            await chrome.storage.local.remove(['ytv_token', 'ytv_user']);
          } else if (res.ok) {
            const user = await res.json();
            await chrome.storage.local.set({ ytv_user: user });
          }
        }).catch(() => {});
        return cached;
      }
      // No cache — must fetch (first load after login on new page)
      try {
        const res = await fetch(`${API_BASE}/api/extension/me`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (res.status === 401) {
          await chrome.storage.local.remove(['ytv_token', 'ytv_user']);
          return null;
        }
        if (!res.ok) return null;
        const user = await res.json();
        await chrome.storage.local.set({ ytv_user: user });
        return user;
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
      const res = await fetch(`${API_BASE}/api/youtube/competitor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ url: msg.url, lang: msg.lang || lang }),
      });
      const data = await res.json();
      if (res.status === 403 && data.error === 'pro_required') throw new Error(lang === 'en' ? 'Pro plan required. Upgrade at ytubviral.com' : 'Plan Pro requerido. Actualiza en ytubviral.com');
      if (!res.ok) throw new Error(data.error || (lang === 'en' ? 'Channel analysis error' : 'Error al analizar canal'));
      return data;
    }

    case 'KEYWORDS': {
      const token = await getToken();
      if (!token) throw new Error('not_logged_in');
      const res = await fetch(`${API_BASE}/api/research/keywords`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ keyword: msg.keyword }),
      });
      const data = await res.json();
      if (res.status === 403 && data.error === 'pro_required') throw new Error(lang === 'en' ? 'Pro plan required. Upgrade at ytubviral.com' : 'Plan Pro requerido. Actualiza en ytubviral.com');
      if (!res.ok) throw new Error(data.error || (lang === 'en' ? 'Keyword search error' : 'Error al buscar keywords'));
      return data;
    }

    case 'GENERATE': {
      const token = await getToken();
      if (!token) throw new Error('not_logged_in');
      const res = await fetch(`${API_BASE}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          template: msg.template,
          inputs: msg.inputs,
          lang: msg.lang || lang,
        }),
      });
      const data = await res.json();
      if (res.status === 403 && data.error === 'pro_required') throw new Error(lang === 'en' ? 'Pro plan required. Upgrade at ytubviral.com' : 'Plan Pro requerido. Actualiza en ytubviral.com');
      if (!res.ok) throw new Error(data.error || (lang === 'en' ? 'Content generation error' : 'Error al generar contenido'));
      return data;
    }

    case 'SEO_QUICK': {
      const token = await getToken();
      if (!token) throw new Error('not_logged_in');
      const res = await fetch(`${API_BASE}/api/extension/seo-quick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ videoId: msg.videoId, lang: msg.lang || lang }),
      });
      const data = await res.json();
      if (res.status === 403 && data.error === 'pro_required') throw new Error(lang === 'en' ? 'Pro plan required. Upgrade at ytubviral.com' : 'Plan Pro requerido. Actualiza en ytubviral.com');
      if (!res.ok) throw new Error(data.error || (lang === 'en' ? 'SEO analysis error' : 'Error al analizar SEO'));
      return data;
    }

    case 'CHANNEL_STATS': {
      const token = await getToken();
      if (!token) throw new Error('not_logged_in');
      const res = await fetch(`${API_BASE}/api/extension/channel-stats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: '{}',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || (lang === 'en' ? 'Stats error' : 'Error al cargar stats'));
      return data;
    }

    case 'SCORECARD': {
      const token = await getToken();
      if (!token) throw new Error('not_logged_in');
      const res = await fetch(`${API_BASE}/api/extension/video-scorecard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ videoId: msg.videoId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || (lang === 'en' ? 'Scorecard error' : 'Error al cargar scorecard'));
      return data;
    }

    case 'SEO_LIVE': {
      const token = await getToken();
      if (!token) throw new Error('not_logged_in');
      const res = await fetch(`${API_BASE}/api/extension/seo-live`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ title: msg.title, description: msg.description, tags: msg.tags || [] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'SEO live error');
      return data;
    }

    case 'COMMENTS': {
      const token = await getToken();
      if (!token) throw new Error('not_logged_in');
      const res = await fetch(`${API_BASE}/api/extension/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ videoId: msg.videoId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || (lang === 'en' ? 'Comments error' : 'Error al cargar comentarios'));
      return data;
    }

    case 'VIDEO_BATCH': {
      const token = await getToken();
      if (!token) throw new Error('not_logged_in');
      const res = await fetch(`${API_BASE}/api/extension/video-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ videoIds: msg.videoIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Batch error');
      return data;
    }

    case 'BEST_TIME': {
      const token = await getToken();
      if (!token) throw new Error('not_logged_in');
      const res = await fetch(`${API_BASE}/api/extension/best-time`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || (lang === 'en' ? 'Best time error' : 'Error al cargar best time'));
      return data;
    }

    default:
      throw new Error('Unknown message: ' + msg.type);
  }
}
