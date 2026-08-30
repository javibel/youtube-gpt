'use strict';

// ============================================================
// i18n
// ============================================================

let _lang = 'es';

function t(es, en) { return _lang === 'en' ? en : es; }

async function initLang() {
  try {
    const res = await sendMsg({ type: 'GET_LANG' });
    _lang = res?.lang || 'es';
  } catch {
    // Detect from browser
    _lang = navigator.language.startsWith('en') ? 'en' : 'es';
  }
}

// ============================================================
// Centralized DOM selectors (v2.5.0 — B2 of the 2026-07-03 code review)
// YouTube/Studio change their markup without notice (it happened in May 2026 with the
// homepage thumbnail DOM). Keeping every selector here means a future breakage is a
// one-place fix instead of a hunt across the file.
// ============================================================

const SELECTORS = {
  yt: {
    videoSecondary: '#secondary-inner, #secondary, ytd-watch-next-secondary-results-renderer',
    searchResults: 'ytd-search #contents, ytd-section-list-renderer #contents',
    channelHeader: '#channel-header-container, ytd-c4-tabbed-header-renderer, #header-container',
    videoTitle: [
      'ytd-watch-metadata h1 yt-formatted-string',
      'h1.ytd-video-primary-info-renderer yt-formatted-string',
      '#title h1 yt-formatted-string',
      'h1.style-scope.ytd-watch-metadata',
    ],
    channelLink: [
      '#owner #channel-name a',
      'ytd-video-owner-renderer #channel-name a',
      'ytd-channel-name a',
      '#upload-info #channel-name a',
    ],
    thumbSelector: 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer',
  },
  studio: {
    navPanel: '#navigation-panel, ytcp-navigation-drawer, .left-nav-area',
    metadataEditor: '#details, ytcp-video-metadata-editor, .metadata-editor',
    titleField: '#title-textarea #textbox, ytcp-social-suggestion-input #textbox',
    descField: '#description-textarea #textbox, [aria-label*="description" i] #textbox',
    tagChips: 'ytcp-chip-bar ytcp-chip-bar-item, .tag-chip',
    videoRows: 'ytcp-video-row, .video-row, [class*="video-row"]',
    uploadDialog: 'ytcp-uploads-dialog',
  },
  // NOTE: no `shorts` selector set on purpose. The Shorts panels are mounted on
  // document.body with fixed positioning and only need the videoId from the URL —
  // the reel feed's internal DOM (the least stable markup on youtube.com) is never touched.
};

// ============================================================
// Helpers
// ============================================================

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtNum(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return Math.round(n / 1_000) + 'K';
  return String(n);
}

// El popup manda esto tras "Mostrar ideas de hoy" (ver popup.js) para
// refrescar una pestaña de YouTube que YA estaba abierta — sin esto, borrar
// la marca de "descartado" en storage no hacía nada visible hasta la
// siguiente navegación real (recarga o clic en un enlace), que es lo que
// reportó Javier como "pulsé y no reapareció".
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'YTV_RECHECK_IDEAS') { mountShell(); openShell('ideas'); }
});

function sendMsg(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, response => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (response?.error) {
        const err = new Error(response.error);
        err.limit = response.limit; // AB_CREATE / max_active_tests
        return reject(err);
      }
      resolve(response);
    });
  });
}

function waitForEl(selector, timeout = 6000) {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);
    const obs = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found) { obs.disconnect(); resolve(found); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); reject(new Error(`${selector} not found`)); }, timeout);
  });
}

function firstMatch(selectors) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

// ============================================================
// Page detection
// ============================================================

function getPageType() {
  const p = window.location.pathname;
  const s = window.location.search;
  if (p === '/watch' && s.includes('v=')) return 'video';
  if (p.startsWith('/shorts/')) return 'shorts';
  if (p === '/results' && s.includes('search_query=')) return 'search';
  if (/^\/@|^\/channel\/|^\/c\//.test(p)) return 'channel';
  if (p === '/' || p.startsWith('/feed/')) return 'home';
  return null;
}

function getVideoId() {
  return new URLSearchParams(window.location.search).get('v') || '';
}

function getShortsVideoId() {
  const m = window.location.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : '';
}

function getVideoInfo() {
  const titleEl = firstMatch(SELECTORS.yt.videoTitle);
  const title = titleEl?.textContent?.trim() || document.title.replace(' - YouTube', '').trim();

  const channelLinkEl = firstMatch(SELECTORS.yt.channelLink);
  const channelName = channelLinkEl?.textContent?.trim() || '';
  const channelUrl = channelLinkEl?.href || '';

  return { title, channelName, channelUrl };
}

function getSearchQuery() {
  return new URLSearchParams(window.location.search).get('search_query') || '';
}

// ============================================================
// Unified panel shell (v2.7)
// ------------------------------------------------------------
// One persistent launcher + tabbed panel, mounted once on document.body and
// present on EVERY youtube.com / studio.youtube.com page. Replaces the old
// per-surface panels (injectVideoPanel / injectSearchPanel / injectChannelPanel /
// injectChannelStats / injectDailyIdeasPanel / injectLoggedOutPanel), each of
// which had its own header and mount point and made the extension feel scattered.
// The "Esta página" tab is refreshed on SPA navigation; "Tu canal" and "Ideas"
// are the same everywhere. Studio's inline SEO panel stays where it is (next to
// the title field, by design).
// ============================================================

const SHELL_TABS = [
  { id: 'page', es: 'Esta página', en: 'This page' },
  { id: 'channel', es: 'Tu canal', en: 'Your channel' },
  { id: 'ideas', es: 'Ideas', en: 'Ideas' },
];

const shellState = { open: false, tab: 'page', mounted: false };
// Rendered-content cache so switching tabs doesn't wipe results. `page` holds the
// URL key it was last rendered for (re-render only when the page changed);
// `channel`/`ideas` are booleans (render once per shell lifetime).
const shellRendered = { page: null, channel: false, ideas: false };

function shellEls() {
  const root = document.getElementById('ytv-shell');
  if (!root) return null;
  return {
    root,
    body: root.querySelector('#ytv-shell-body'),
    foot: root.querySelector('#ytv-shell-foot'),
    tabs: root.querySelector('#ytv-shell-tabs'),
    pane: (id) => root.querySelector(`.ytv-shell-pane[data-pane="${id}"]`),
  };
}

function mountShell() {
  if (document.getElementById('ytv-shell')) return;
  if (!document.body) return;
  const root = document.createElement('div');
  root.id = 'ytv-shell';
  root.className = 'ytv-shell ytv-shell-collapsed';
  root.innerHTML = `
    <button class="ytv-shell-launcher" id="ytv-shell-launcher" title="YTubViral" aria-label="YTubViral">
      <span class="ytv-shell-launcher-txt">YTubViral</span>
    </button>
    <div class="ytv-shell-panel" role="dialog" aria-label="YTubViral">
      <div class="ytv-shell-head">
        <span class="ytv-shell-logo">YTubViral</span>
        <button class="ytv-shell-btn" id="ytv-shell-close" aria-label="${t('Cerrar', 'Close')}">✕</button>
      </div>
      <div class="ytv-shell-tabs" id="ytv-shell-tabs"></div>
      <div class="ytv-shell-body" id="ytv-shell-body">
        <div class="ytv-shell-pane" data-pane="page"></div>
        <div class="ytv-shell-pane" data-pane="channel"></div>
        <div class="ytv-shell-pane" data-pane="ideas"></div>
      </div>
      <div class="ytv-shell-foot" id="ytv-shell-foot"></div>
    </div>`;
  document.body.appendChild(root);

  const tabsEl = root.querySelector('#ytv-shell-tabs');
  SHELL_TABS.forEach((tb) => {
    const b = document.createElement('button');
    b.className = 'ytv-shell-tab';
    b.dataset.tab = tb.id;
    b.textContent = t(tb.es, tb.en);
    b.addEventListener('click', () => setShellTab(tb.id));
    tabsEl.appendChild(b);
  });
  root.querySelector('#ytv-shell-launcher').addEventListener('click', toggleShell);
  root.querySelector('#ytv-shell-close').addEventListener('click', closeShell);

  shellState.mounted = true;

  chrome.storage.local.get(['ytv_shell_open', 'ytv_shell_tab'], (s) => {
    if (chrome.runtime.lastError || shellState.open) return; // already opened (e.g. by a message) — don't clobber
    shellState.tab = SHELL_TABS.some((x) => x.id === s.ytv_shell_tab) ? s.ytv_shell_tab : 'page';
    highlightShellTab();
    if (s.ytv_shell_open) openShell();
  });
}

function toggleShell() { shellState.open ? closeShell() : openShell(); }

function openShell(tab) {
  const els = shellEls(); if (!els) return;
  shellState.open = true;
  els.root.classList.remove('ytv-shell-collapsed');
  chrome.storage.local.set({ ytv_shell_open: true });
  if (tab && SHELL_TABS.some((x) => x.id === tab)) shellState.tab = tab;
  highlightShellTab();
  renderShellTab();
  refreshShellFoot();
}

function closeShell() {
  const els = shellEls(); if (!els) return;
  shellState.open = false;
  els.root.classList.add('ytv-shell-collapsed');
  chrome.storage.local.set({ ytv_shell_open: false });
}

function setShellTab(id) {
  shellState.tab = id;
  chrome.storage.local.set({ ytv_shell_tab: id });
  highlightShellTab();
  renderShellTab(); // lazy — a tab already rendered keeps its content (and results)
}

function highlightShellTab() {
  const els = shellEls(); if (!els) return;
  els.tabs.querySelectorAll('.ytv-shell-tab').forEach((b) =>
    b.classList.toggle('ytv-shell-tab-active', b.dataset.tab === shellState.tab));
}

// Called from onPageChange on SPA navigation. Only the page tab is page-specific;
// "Tu canal" / "Ideas" keep whatever they already rendered.
function refreshShell() {
  if (!shellState.mounted) return;
  if (shellState.open) { renderShellTab(); refreshShellFoot(); }
}

async function renderShellTab() {
  const els = shellEls(); if (!els || !shellState.open) return;

  els.body.querySelectorAll('.ytv-shell-pane').forEach((p) => {
    p.style.display = p.dataset.pane === shellState.tab ? 'flex' : 'none';
  });
  const pane = els.pane(shellState.tab);
  if (!pane) return;

  if (shellState.tab === 'page') {
    const key = location.hostname + location.pathname + location.search;
    if (shellRendered.page !== key) {
      shellRendered.page = key;
      renderShellPageTab(pane);
    }
  } else if (shellState.tab === 'channel') {
    if (!shellRendered.channel) renderShellChannelTab(pane); // sets the flag on success
  } else if (shellState.tab === 'ideas') {
    if (!shellRendered.ideas) renderShellIdeasTab(pane);
  }
}

function shellLoggedOutCta(reasonEs, reasonEn) {
  return `<div class="ytv-shell-cta">
    <p>${reasonEs ? t(reasonEs, reasonEn) : t('Crea una cuenta gratis para desbloquear la IA, tu canal y el histórico.', 'Create a free account to unlock AI, your channel and history.')}</p>
    <a href="https://ytubviral.com/signup?utm_source=extension&utm_medium=shell" target="_blank" class="ytv-btn ytv-btn-red ytv-btn-sm">${t('Crear cuenta gratis →', 'Create free account →')}</a>
  </div>`;
}

async function refreshShellFoot() {
  const els = shellEls(); if (!els) return;
  const user = await sendMsg({ type: 'GET_USER' }).catch(() => null);
  if (user) { els.foot.innerHTML = ''; els.foot.style.display = 'none'; return; }
  els.foot.style.display = '';
  els.foot.innerHTML = `<a href="https://ytubviral.com/signup?utm_source=extension&utm_medium=shellfoot" target="_blank">${t('Crear cuenta gratis — IA + tu canal + histórico', 'Create free account — AI + your channel + history')} →</a>`;
}

// ── "Esta página" tab ─────────────────────────────────────────────
// Re-render gating (page changed vs cached) is handled by renderShellTab().
async function renderShellPageTab(body) {
  if (location.hostname === 'studio.youtube.com') {
    body.innerHTML = `<div class="ytv-shell-note">${t('El análisis SEO en vivo aparece junto al título del vídeo mientras lo editas.', 'Live SEO analysis appears next to the video title while you edit it.')}</div>`;
    return;
  }

  const type = getPageType();
  if (type === 'video' || type === 'shorts') return renderShellScorecard(body);
  if (type === 'search') {
    const q = getSearchQuery();
    if (!q) { body.innerHTML = `<div class="ytv-shell-note">${t('Escribe una búsqueda para ver el análisis de la keyword.', 'Type a search to see keyword analysis.')}</div>`; return; }
    body.innerHTML = `<div class="ytv-section-label">${escapeHtml(q)}</div><div id="ytv-shell-kw"></div>`;
    return runKeywords(body.querySelector('#ytv-shell-kw'), q);
  }
  if (type === 'channel') {
    body.innerHTML = `<button class="ytv-btn ytv-btn-red ytv-btn-full" id="ytv-shell-analyze-ch">📊 ${t('Analizar este canal', 'Analyze this channel')}</button><div id="ytv-shell-ch"></div>`;
    body.querySelector('#ytv-shell-analyze-ch').addEventListener('click', () => {
      runCompetitor(body.querySelector('#ytv-shell-ch'), window.location.href);
    });
    return;
  }
  body.innerHTML = `<div class="ytv-shell-note">${t('Abre un vídeo, una búsqueda o un canal para ver el análisis aquí. Mientras, echa un vistazo a la pestaña Ideas.', 'Open a video, a search or a channel to see analysis here. Meanwhile, check the Ideas tab.')}</div>`;
}

async function renderShellScorecard(body) {
  const isShorts = getPageType() === 'shorts';
  const videoId = isShorts ? getShortsVideoId() : getVideoId();
  if (!videoId) { body.innerHTML = `<div class="ytv-shell-note">${t('No se pudo leer el vídeo.', "Couldn't read this video.")}</div>`; return; }

  body.innerHTML = renderLoading(t('Analizando vídeo...', 'Analyzing video...'));
  let d;
  try {
    d = await sendMsg({ type: 'SCORECARD', videoId });
  } catch (e) {
    if (e.message === 'rate_limited') { body.innerHTML = renderError('rate_limited'); return; }
    const { title } = getVideoInfo();
    body.innerHTML = title
      ? `<div style="padding:2px">${renderLoggedOutScore(title)}</div>` + shellLoggedOutCta(
          'Inicia sesión para el SEO Score completo (0-100): keywords, tags, miniatura, retención y más.',
          'Sign in for the full SEO Score (0-100): keywords, tags, thumbnail, retention and more.')
      : renderError(e.message);
    return;
  }

  const user = await sendMsg({ type: 'GET_USER' }).catch(() => null);
  body.innerHTML = `
    <div class="ytv-scorecard ytv-shell-scorecard">
      <div class="ytv-sc-pill ytv-sc-pill-static"><div class="ytv-sc-pill-logo">YTV</div>${renderScorecard(d)}</div>
      <div class="ytv-sc-detail" style="display:block">${renderScorecardExpanded(d)}</div>
    </div>
    ${user ? '' : shellLoggedOutCta()}
  `;
  wireShellScorecard(body, d, videoId, !!user);
  if (user) maybeShowReviewPrompt(body);
}

// Extracted from the old injectVideoPanel pill-click handler — wires the expanded scorecard.
function wireShellScorecard(root, scorecardData, videoId, loggedIn) {
  const detail = root.querySelector('.ytv-sc-detail');
  if (!detail) return;

  detail.querySelectorAll('.ytv-tag[data-kw]').forEach((tag) => {
    tag.addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(tag.dataset.kw)}`, '_blank');
    });
  });

  const copyTagsBtn = detail.querySelector('.ytv-copy-tags-btn');
  if (copyTagsBtn && scorecardData?.tags?.length) {
    copyTagsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(scorecardData.tags.join(', ')).then(() => {
        copyTagsBtn.textContent = '✓ ' + t('Copiado', 'Copied');
        setTimeout(() => { copyTagsBtn.innerHTML = `📋 ${t('Copiar todo', 'Copy all')}`; }, 2000);
      });
    });
  }

  const bestTimeArea = detail.querySelector('#ytv-sc-besttime-area');
  if (bestTimeArea) {
    sendMsg({ type: 'BEST_TIME' })
      .then((res) => { bestTimeArea.innerHTML = renderBestTime(res?.data || null); })
      .catch(() => { bestTimeArea.innerHTML = renderBestTime(null); });
  }

  const actionResults = detail.querySelector('#ytv-sc-action-results');
  const btnComp = detail.querySelector('#ytv-sc-btn-competitor');
  const btnTitles = detail.querySelector('#ytv-sc-btn-titles');
  if (btnComp) {
    btnComp.addEventListener('click', async (e) => {
      e.stopPropagation();
      const { channelUrl } = getVideoInfo();
      await runCompetitor(actionResults, channelUrl || window.location.href);
    });
  }
  if (btnTitles) {
    btnTitles.addEventListener('click', async (e) => {
      e.stopPropagation();
      const { title } = getVideoInfo();
      await runGenerate(actionResults, title);
    });
  }

  const btnComments = detail.querySelector('#ytv-sc-btn-comments');
  const commentsArea = detail.querySelector('#ytv-sc-comments-area');
  if (btnComments && commentsArea) {
    btnComments.addEventListener('click', async (e) => {
      e.stopPropagation();
      btnComments.style.display = 'none';
      await loadComments(commentsArea, videoId);
    });
  }
}

// ── "Tu canal" tab ───────────────────────────────────────────────
async function renderShellChannelTab(body) {
  body.innerHTML = renderLoading(t('Cargando stats...', 'Loading stats...'));
  let data;
  try {
    data = await sendMsg({ type: 'CHANNEL_STATS' });
  } catch (e) {
    if (e.message === 'not_logged_in') { body.innerHTML = shellLoggedOutCta(); return; }
    if (e.message === 'youtube_not_connected') {
      body.innerHTML = `<div class="ytv-shell-cta">
        <p>${t('Conecta tu canal de YouTube para ver aquí tus suscriptores, vistas y progreso de monetización.', 'Connect your YouTube channel to see your subscribers, views and monetization progress here.')}</p>
        <a href="https://ytubviral.com/dashboard?utm_source=extension&utm_medium=shell" target="_blank" class="ytv-btn ytv-btn-red ytv-btn-sm">${t('Conectar canal →', 'Connect channel →')}</a>
      </div>`;
      return;
    }
    body.innerHTML = renderError(e.message);
    return;
  }
  body.innerHTML = renderChannelStatsWidget(data);
  shellRendered.channel = true; // cache only a successful render
  sendMsg({ type: 'DAILY_IDEAS' }).then((ideaData) => {
    if (ideaData?.ideas?.length) body.insertAdjacentHTML('beforeend', renderDailyIdeasMini(ideaData.ideas));
  }).catch(() => {});
}

// ── "Ideas" tab ──────────────────────────────────────────────────
async function renderShellIdeasTab(body) {
  body.innerHTML = renderLoading(t('Cargando ideas...', 'Loading ideas...'));

  const user = await sendMsg({ type: 'GET_USER' }).catch(() => null);
  if (!user) {
    body.innerHTML = shellLoggedOutCta(
      'Crea una cuenta gratis y conecta tu canal para recibir 5 ideas de vídeo cada mañana.',
      'Create a free account and connect your channel to get 5 video ideas every morning.');
    return; // don't cache — retry after sign-in
  }

  let data;
  try {
    data = await sendMsg({ type: 'DAILY_IDEAS' });
  } catch {
    data = null;
  }

  if (!data || !data.ideas || !data.ideas.length) {
    // channelConnected === false → really needs to connect. Otherwise (connected,
    // or unknown) today's batch just isn't generated yet — don't tell them to connect.
    body.innerHTML = data && data.channelConnected === false
      ? `<div class="ytv-shell-cta">
          <p>${t('Conecta tu canal en YTubViral y cada mañana tendrás aquí 5 ideas de vídeo personalizadas.', 'Connect your channel on YTubViral and every morning you\'ll get 5 personalized video ideas here.')}</p>
          <a href="https://ytubviral.com/dashboard?utm_source=extension&utm_medium=shellideas" target="_blank" class="ytv-btn ytv-btn-red ytv-btn-sm">${t('Conectar canal →', 'Connect channel →')}</a>
        </div>`
      : `<div class="ytv-shell-cta">
          <p>${t('Tus ideas de hoy aún no están listas — se generan cada mañana (~06:00 UTC). Vuelve más tarde.', "Today's ideas aren't ready yet — they're generated every morning (~06:00 UTC). Check back later.")}</p>
          <a href="https://ytubviral.com/generate?utm_source=extension&utm_medium=shellideas" target="_blank" class="ytv-btn ytv-btn-red ytv-btn-sm">${t('Ir al generador →', 'Open the generator →')}</a>
        </div>`;
    return; // don't cache — state may change (connect channel / batch generated later today)
  }
  shellRendered.ideas = true;
  const ideas = data.ideas.slice(0, 5);
  body.innerHTML = `<div class="ytv-ideas-body" style="max-height:none">${ideas.map((idea) => {
    const title = t(idea.title_es, idea.title_en) || '';
    const desc = t(idea.idea_es, idea.idea_en) || '';
    const topic = encodeURIComponent(title);
    return `<div class="ytv-idea-item">
      <p class="ytv-idea-title">${escapeHtml(title)}</p>
      <p class="ytv-idea-desc">${escapeHtml(desc)}</p>
      <a href="https://ytubviral.com/generate?topic=${topic}&utm_source=extension&utm_medium=ideas" target="_blank">${t('Desarrollar →', 'Develop →')}</a>
    </div>`;
  }).join('')}</div>`;
}

// Genuine review collection (G2 ASO lever #1): after a user has loaded the scorecard a few times
// (i.e. they're engaged and getting value), ask ONCE for a Chrome Web Store review. No fake
// reviews — we only prompt real, active users. Shown once, then never again.
const CWS_REVIEW_URL = 'https://chromewebstore.google.com/detail/ytubviral-para-youtube/gkjecjfhdmfbhhcemcjdkjkcdbljkcfh/reviews';
function maybeShowReviewPrompt(panel) {
  try {
    chrome.storage.local.get(['ytv_sc_views', 'ytv_review_done'], (store) => {
      if (chrome.runtime.lastError || store.ytv_review_done) return;
      const views = (store.ytv_sc_views || 0) + 1;
      if (views < 5) { chrome.storage.local.set({ ytv_sc_views: views }); return; }
      // Threshold reached — show once and don't nag again
      chrome.storage.local.set({ ytv_sc_views: views, ytv_review_done: true });
      const el = document.createElement('div');
      el.style.cssText = 'margin-top:8px;padding:8px 10px;border:1px solid rgba(232,77,91,.3);border-radius:8px;background:rgba(232,77,91,.06);font-size:12px;display:flex;align-items:center;gap:8px;line-height:1.3';
      el.innerHTML = `<span style="flex:1">${t('¿Te sirve YTubViral? Déjanos una reseña ⭐', 'Enjoying YTubViral? Leave us a review ⭐')}</span>`
        + `<a href="${CWS_REVIEW_URL}" target="_blank" class="ytv-btn ytv-btn-sm ytv-btn-red">${t('Reseñar', 'Review')}</a>`
        + `<button class="ytv-review-x" title="${t('Cerrar', 'Dismiss')}" style="background:none;border:none;color:inherit;cursor:pointer;opacity:.6;font-size:13px">✕</button>`;
      panel.appendChild(el);
      el.querySelector('.ytv-review-x').addEventListener('click', () => el.remove());
    });
  } catch { /* storage unavailable — skip */ }
}

// ============================================================
// Render helpers
// ============================================================

function renderLoading(text) {
  return `<div class="ytv-loading"><span class="ytv-spinner"></span>${escapeHtml(text)}</div>`;
}

function renderError(msg) {
  if (msg === 'not_logged_in') {
    return `<div class="ytv-error">${t('Inicia sesión en el icono de la extensión para usar YTubViral.', 'Sign in via the extension icon to use YTubViral.')}</div>`;
  }
  if (msg.includes('Pro') || msg.includes('pro_required')) {
    return `<div class="ytv-error ytv-upsell">🔒 ${t('Función Pro', 'Pro feature')}<br><a href="https://ytubviral.com/profile?utm_source=extension&utm_medium=panel" target="_blank" class="ytv-cta-link">${t('Desbloquear por 9,99€/mes →', 'Unlock for €9.99/mo →')}</a></div>`;
  }
  return `<div class="ytv-error">⚠ ${escapeHtml(msg)}</div>`;
}

function renderCompetitor(data) {
  const { channel, keywords, avgViews, uploadFrequency } = data;
  const kwTags = (keywords || []).slice(0, 10).map(k =>
    `<span class="ytv-tag" data-kw="${escapeHtml(k)}">${escapeHtml(k)}</span>`
  ).join('');

  return `
    <div class="ytv-ch-row">
      ${channel.thumbnail ? `<img class="ytv-ch-thumb" src="${escapeHtml(channel.thumbnail)}" alt="">` : ''}
      <div class="ytv-ch-meta">
        <div class="ytv-ch-name">${escapeHtml(channel.name)}</div>
        <div class="ytv-ch-sub">${fmtNum(channel.subscribers)} ${t('suscriptores', 'subscribers')}</div>
      </div>
    </div>
    <div class="ytv-grid4">
      <div class="ytv-stat"><b>${fmtNum(channel.totalViews)}</b><span>${t('Vistas totales', 'Total views')}</span></div>
      <div class="ytv-stat"><b>${fmtNum(avgViews)}</b><span>${t('Media vistas', 'Avg views')}</span></div>
      <div class="ytv-stat"><b>${channel.videoCount}</b><span>${t('Vídeos', 'Videos')}</span></div>
      <div class="ytv-stat"><b>${escapeHtml(uploadFrequency)}</b><span>${t('Frecuencia', 'Frequency')}</span></div>
    </div>
    ${kwTags ? `<div class="ytv-section-label">${t('Keywords del canal', 'Channel keywords')} <span class="ytv-hint">(${t('clic para buscar', 'click to search')})</span></div><div class="ytv-tags">${kwTags}</div>` : ''}
    <a class="ytv-cta-link" href="https://ytubviral.com/competitors?utm_source=extension&utm_medium=panel" target="_blank">${t('Ver análisis completo en YTubViral →', 'View full analysis on YTubViral →')}</a>
  `;
}

function renderKeywords(data) {
  const levels = _lang === 'en'
    ? { low: '🟢 Low', medium: '🟡 Medium', high: '🔴 High' }
    : { low: '🟢 Baja', medium: '🟡 Media', high: '🔴 Alta' };
  const related = (data.relatedKeywords || []).slice(0, 8).map(k =>
    `<span class="ytv-tag ytv-tag-search" data-q="${encodeURIComponent(k)}">${escapeHtml(k)}</span>`
  ).join('');

  return `
    <div class="ytv-grid4">
      <div class="ytv-stat"><b>${levels[data.competition] || '-'}</b><span>${t('Competencia', 'Competition')}</span></div>
      <div class="ytv-stat ytv-opp-${data.competition}"><b>${data.opportunityScore}/100</b><span>${t('Oportunidad', 'Opportunity')}</span></div>
      <div class="ytv-stat"><b>${fmtNum(data.totalResults)}</b><span>${t('Resultados', 'Results')}</span></div>
      <div class="ytv-stat"><b>${fmtNum(data.avgViews)}</b><span>${t('Vistas prom.', 'Avg views')}</span></div>
    </div>
    ${related ? `<div class="ytv-section-label">${t('Búsquedas relacionadas', 'Related searches')}</div><div class="ytv-tags">${related}</div>` : ''}
    <a class="ytv-cta-link" href="https://ytubviral.com/research?utm_source=extension&utm_medium=panel" target="_blank">${t('Explorar más keywords →', 'Explore more keywords →')}</a>
  `;
}

function renderTitles(content) {
  const titles = content
    .split('\n')
    .map(l => l.replace(/^\d+\.\s*/, '').trim())
    .filter(l => l.length > 10)
    .slice(0, 5);

  if (!titles.length) {
    return `<div class="ytv-raw">${escapeHtml(content)}</div>`;
  }

  const html = titles.map(t => `<div class="ytv-title-item">${escapeHtml(t)}</div>`).join('');
  return `
    <div class="ytv-section-label">${t('Títulos generados', 'Generated titles')}</div>
    ${html}
    <a class="ytv-cta-link" href="https://ytubviral.com/generate?utm_source=extension&utm_medium=panel" target="_blank">${t('Generar más contenido →', 'Generate more content →')}</a>
  `;
}

function scoreColor(score) {
  if (score >= 70) return '#22c55e';
  if (score >= 40) return '#eab308';
  return '#ef4444';
}

function fmtAge(days, hours) {
  if (days >= 365) return Math.floor(days / 365) + 'y';
  if (days >= 30) return Math.floor(days / 30) + 'mo';
  if (days >= 1) return days + 'd';
  return hours + 'h';
}

function fmtDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
}

// ── Outlier multiplier → percentile label ──────────────────────────

function outlierToPercentile(mult) {
  if (mult >= 10) return 'Top 1%';
  if (mult >= 7)  return 'Top 2%';
  if (mult >= 5)  return 'Top 5%';
  if (mult >= 3)  return 'Top 10%';
  return 'Top 20%';
}

// ── Quick Wins — actionable tips from failed SEO checks ────────────

function renderQuickWins(checks) {
  const WIN_MAP = {
    title_length:    { tip: () => t('Ajusta el título a 30-70 caracteres para mejor CTR', 'Adjust title to 30-70 characters for better CTR'), pts: 8 },
    title_number:    { tip: () => t('Añade un número al título (ej: "5 estrategias...")', 'Add a number to the title (e.g. "5 strategies...")'), pts: 8 },
    title_caps:      { tip: () => t('Evita TODO EN MAYÚSCULAS en el título', 'Avoid ALL CAPS in the title'), pts: 4 },
    title_emoji:     { tip: () => t('Añade un emoji al inicio del título para llamar la atención', 'Add an emoji at the start of the title'), pts: 4 },
    title_power:     { tip: () => t('Añade una palabra gancho: "definitivo", "secreto", "fácil"', 'Add a power word: "ultimate", "secret", "easy"'), pts: 6 },
    desc_length:     { tip: () => t('Expande la descripción a más de 200 palabras', 'Expand description to 200+ words'), pts: 12 },
    desc_links:      { tip: () => t('Añade links en la descripción (redes, recursos)', 'Add links in the description (social, resources)'), pts: 5 },
    desc_timestamps: { tip: () => t('Añade timestamps (ej: 0:00 Intro · 1:30 Tema)', 'Add timestamps (e.g. 0:00 Intro · 1:30 Topic)'), pts: 6 },
    desc_hashtags:   { tip: () => t('Añade 3-5 hashtags al final de la descripción', 'Add 3-5 hashtags at the end of description'), pts: 5 },
    desc_cta:        { tip: () => t('Añade un CTA: "Suscríbete" o "Comenta abajo"', 'Add a CTA: "Subscribe" or "Comment below"'), pts: 8 },
    tags_count:      { tip: () => t('Añade tags hasta tener entre 5 y 20', 'Add tags to reach 5-20 total'), pts: 8 },
    tags_long:       { tip: () => t('Incluye tags de cola larga (frases de 3+ palabras)', 'Include long-tail tags (3+ word phrases)'), pts: 6 },
  };

  const wins = (checks || [])
    .filter(c => !c.ok && WIN_MAP[c.key])
    .slice(0, 3)
    .map(c => ({ ...WIN_MAP[c.key] }));

  if (!wins.length) {
    return `<div class="ytv-wins-perfect">✅ ${t('SEO perfecto — sin mejoras pendientes', 'Perfect SEO — nothing left to improve')}</div>`;
  }

  const pts = wins.reduce((a, w) => a + w.pts, 0);
  return `
    <div class="ytv-wins-section">
      <div class="ytv-wins-header">⚡ ${t('Ganancias rápidas', 'Quick Wins')} <span class="ytv-wins-pts">+${pts} ${t('pts posibles', 'pts possible')}</span></div>
      ${wins.map(w => `<div class="ytv-win-item">→ ${escapeHtml(w.tip())}</div>`).join('')}
    </div>
  `;
}

// ── Best Time to Post ──────────────────────────────────────────────

function renderBestTime(data) {
  if (!data) {
    return `<div class="ytv-besttime-empty">${t('Ejecuta el análisis en', 'Run the analysis at')} <a href="https://ytubviral.com/best-time?utm_source=extension&utm_medium=panel" target="_blank" class="ytv-cta-link">ytubviral.com →</a></div>`;
  }

  const DAY_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const DAY_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dayNames = _lang === 'en' ? DAY_EN : DAY_ES;

  const topSlots = (data.topSlots || []).slice(0, 3);
  const aiTip = data.aiTip ? (_lang === 'en' ? data.aiTip.en : data.aiTip.es) : null;

  const medals = ['🥇', '🥈', '🥉'];
  const slotsHtml = topSlots.map((slot, i) => `
    <div class="ytv-besttime-slot">
      <span class="ytv-besttime-medal">${medals[i]}</span>
      <span class="ytv-besttime-day">${dayNames[slot.day] || ''}</span>
      <span class="ytv-besttime-hour">${String(slot.hour).padStart(2, '0')}:00 UTC</span>
      <div class="ytv-besttime-bar"><div class="ytv-besttime-fill" style="width:${slot.score}%"></div></div>
    </div>
  `).join('');

  return `
    <div class="ytv-besttime-slots">${slotsHtml}</div>
    ${aiTip ? `<div class="ytv-besttime-tip">${escapeHtml(aiTip)}</div>` : ''}
    <a class="ytv-cta-link" href="https://ytubviral.com/best-time?utm_source=extension&utm_medium=panel" target="_blank">${t('Actualizar análisis →', 'Update analysis →')}</a>
  `;
}

// One-line best-time hint reused by the Studio editor and upload panels (v2.5.0 Tier 1 #3):
// fetch the user's #1 slot once and show it inline, right where they're about to publish.
async function renderBestTimeHint() {
  try {
    const res = await sendMsg({ type: 'BEST_TIME' });
    const top = res?.data?.topSlots?.[0];
    if (!top) return '';
    const DAY_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const DAY_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dayName = (_lang === 'en' ? DAY_EN : DAY_ES)[top.day] || '';
    return `<div class="ytv-besttime-hint">🥇 ${t('Tu mejor hora', 'Your best time')}: <b>${dayName} ${String(top.hour).padStart(2, '0')}:00 UTC</b></div>`;
  } catch {
    return ''; // not connected / no data yet — say nothing rather than show an error here
  }
}

// ── Scorecard renderer ──────────────────────────────────────────────

function renderScorecard(d) {
  const color = scoreColor(d.score);
  const engColor = d.engagement >= 5 ? '#22c55e' : d.engagement >= 2 ? '#eab308' : '#ef4444';
  const vphStr = d.vph >= 1000 ? fmtNum(Math.round(d.vph)) : d.vph.toFixed(1);

  const outlierBadge = d.outlierMultiplier > 0
    ? `<span class="ytv-outlier-badge ${d.outlierMultiplier >= 5 ? 'ytv-outlier-green' : d.outlierMultiplier >= 2 ? 'ytv-outlier-yellow' : 'ytv-outlier-gray'}">×${d.outlierMultiplier}</span>`
    : '';

  return `
    <div class="ytv-sc-ring" style="--score-color: ${color}; --score-pct: ${d.score}">
      <span class="ytv-sc-ring-num">${d.score}</span>
    </div>
    ${outlierBadge}
    <div class="ytv-sc-metrics">
      <div class="ytv-sc-metric" title="${d.vphRecent ? t('Velocidad reciente (vistas/hora ahora mismo)', 'Recent velocity (views/hour right now)') : t('Media de toda la vida del vídeo', 'Lifetime average')}">
        <span class="ytv-sc-val">${vphStr}</span>
        <span class="ytv-sc-label">${d.vphRecent ? 'VPH ⚡' : 'VPH'}</span>
      </div>
      <div class="ytv-sc-sep"></div>
      <div class="ytv-sc-metric">
        <span class="ytv-sc-val" style="color:${engColor}">${d.engagement}%</span>
        <span class="ytv-sc-label">Eng</span>
      </div>
      <div class="ytv-sc-sep"></div>
      <div class="ytv-sc-metric">
        <span class="ytv-sc-val">${d.likesRatio}%</span>
        <span class="ytv-sc-label">Likes</span>
      </div>
      <div class="ytv-sc-sep"></div>
      <div class="ytv-sc-metric">
        <span class="ytv-sc-val">${fmtAge(d.ageDays, d.ageHours)}</span>
        <span class="ytv-sc-label">${t('Edad', 'Age')}</span>
      </div>
    </div>
    <div class="ytv-sc-expand-icon" title="${t('Expandir', 'Expand')}">▼</div>
  `;
}

function renderScorecardExpanded(d) {
  const color = scoreColor(d.score);

  // Stats grid
  const statsHtml = `
    <div class="ytv-sc-stats">
      <div class="ytv-sc-stat-item"><b>${fmtNum(d.views)}</b><span>${t('Vistas', 'Views')}</span></div>
      <div class="ytv-sc-stat-item"><b>${fmtNum(d.likes)}</b><span>Likes</span></div>
      <div class="ytv-sc-stat-item"><b>${fmtNum(d.comments)}</b><span>${t('Comentarios', 'Comments')}</span></div>
      <div class="ytv-sc-stat-item"><b>${fmtDuration(d.durationSec)}</b><span>${t('Duración', 'Duration')}</span></div>
      ${d.channelAvgViews > 0 ? `<div class="ytv-sc-stat-item"><b>${fmtNum(d.channelAvgViews)}</b><span>${t('Avg canal', 'Ch. Avg')}</span></div>` : ''}
      ${d.outlierMultiplier > 0 ? `<div class="ytv-sc-stat-item ytv-sc-stat-outlier"><b>×${d.outlierMultiplier}</b><span>${outlierToPercentile(d.outlierMultiplier)}</span></div>` : ''}
    </div>
  `;

  // SEO checklist
  const checkLabels = {
    title_length: t('Largo título', 'Title length'),
    title_number: t('Números', 'Numbers'),
    title_caps: t('No ALL CAPS', 'No ALL CAPS'),
    title_emoji: 'Emoji',
    title_power: t('Palabra poder', 'Power word'),
    desc_length: t('Descripción larga', 'Long description'),
    desc_links: 'Links',
    desc_timestamps: 'Timestamps',
    desc_hashtags: 'Hashtags',
    desc_cta: 'CTA',
    tags_count: t('5-20 tags', '5-20 tags'),
    tags_long: t('Tags largos', 'Long-tail tags'),
    thumbnail: 'Thumbnail',
    captions: t('Subtítulos', 'Captions'),
    engagement: 'Engagement >3%',
    duration: t('8-20 min', '8-20 min'),
  };

  const checksHtml = (d.checks || []).map(c => {
    const icon = c.ok ? '✅' : '❌';
    const label = checkLabels[c.key] || c.key;
    return `<span class="ytv-sc-check-pill ${c.ok ? 'ytv-sc-check-pass' : 'ytv-sc-check-fail'}">${icon} ${escapeHtml(label)}</span>`;
  }).join('');

  // Tags
  const tagsHtml = (d.tags || []).slice(0, 15).map(tag =>
    `<span class="ytv-tag" data-kw="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`
  ).join('');

  return `
    <div class="ytv-sc-expanded">
      ${statsHtml}

      <div class="ytv-sc-section">
        <div class="ytv-sc-section-title">SEO Score <span style="color:${color};font-weight:800">${d.score}/100</span></div>
        <div class="ytv-sc-checks-grid">${checksHtml}</div>
      </div>

      ${renderQuickWins(d.checks)}

      ${d.tags?.length ? `
        <div class="ytv-sc-section">
          <div class="ytv-sc-section-title">Tags <span class="ytv-hint">(${d.tags.length})</span> <button class="ytv-btn ytv-btn-sm ytv-btn-dark ytv-copy-tags-btn" style="margin-left:auto">📋 ${t('Copiar todo', 'Copy all')}</button></div>
          <div class="ytv-tags">${tagsHtml}</div>
        </div>
      ` : ''}

      <div class="ytv-sc-section">
        <div class="ytv-sc-section-title">${t('Mejor hora de publicar', 'Best Time to Post')}</div>
        <div id="ytv-sc-besttime-area">${renderLoading(t('Cargando...', 'Loading...'))}</div>
      </div>

      <div class="ytv-sc-section">
        <div class="ytv-sc-section-title">${t('Comentarios', 'Comments')}</div>
        <button class="ytv-btn ytv-btn-dark ytv-btn-sm" id="ytv-sc-btn-comments">${t('💬 Cargar análisis', '💬 Load analysis')}</button>
        <div id="ytv-sc-comments-area"></div>
      </div>

      <div class="ytv-sc-actions">
        <button class="ytv-btn ytv-btn-dark ytv-btn-sm" id="ytv-sc-btn-competitor">${t('🔍 Analizar canal', '🔍 Analyze channel')} <span class="ytv-pro-badge">PRO</span></button>
        <button class="ytv-btn ytv-btn-dark ytv-btn-sm" id="ytv-sc-btn-titles">${t('✨ Generar títulos', '✨ Generate titles')} <span class="ytv-pro-badge">PRO</span></button>
        <a href="https://ytubviral.com/optimize?v=${d.videoId}&utm_source=extension&utm_medium=panel" target="_blank" class="ytv-btn ytv-btn-red ytv-btn-sm">${t('⚡ Optimizar', '⚡ Optimize')}</a>
      </div>
      <div id="ytv-sc-action-results"></div>
      <div style="margin-top:8px;font-size:10px;color:#777;line-height:1.4">
        ${t('SEO Score, VPH y estimaciones son métricas propias de YTubViral — no datos oficiales de YouTube.',
            'SEO Score, VPH and estimates are YTubViral\'s own metrics — not official YouTube data.')}
      </div>
    </div>
  `;
}

// ============================================================
// API actions
// ============================================================

async function runCompetitor(resultsEl, url) {
  resultsEl.innerHTML = renderLoading(t('Analizando canal...', 'Analyzing channel...'));
  try {
    const data = await sendMsg({ type: 'COMPETITOR', url });
    resultsEl.innerHTML = renderCompetitor(data);
    resultsEl.querySelectorAll('.ytv-tag[data-kw]').forEach(tag => {
      tag.addEventListener('click', () => {
        const q = encodeURIComponent(tag.dataset.kw);
        window.open(`https://www.youtube.com/results?search_query=${q}`, '_blank');
      });
    });
  } catch (e) {
    resultsEl.innerHTML = renderError(e.message);
  }
}

async function runKeywords(resultsEl, keyword) {
  resultsEl.innerHTML = renderLoading(t('Analizando keyword...', 'Analyzing keyword...'));
  try {
    const data = await sendMsg({ type: 'KEYWORDS', keyword });
    resultsEl.innerHTML = renderKeywords(data);
    resultsEl.querySelectorAll('.ytv-tag-search[data-q]').forEach(tag => {
      tag.addEventListener('click', () => {
        window.location.href = `https://www.youtube.com/results?search_query=${tag.dataset.q}`;
      });
    });
  } catch (e) {
    resultsEl.innerHTML = renderError(e.message);
  }
}

async function runGenerate(resultsEl, videoTitle) {
  resultsEl.innerHTML = renderLoading(t('Generando títulos con IA...', 'Generating titles with AI...'));
  try {
    const data = await sendMsg({
      type: 'GENERATE',
      template: 'title',
      inputs: { tema: videoTitle, tono: 'informativo', duracion: '10' },
    });
    resultsEl.innerHTML = renderTitles(data.content);
  } catch (e) {
    resultsEl.innerHTML = renderError(e.message);
  }
}

// ── Comments Intelligence ─────────────────────────────────────────

async function loadComments(container, videoId) {
  container.innerHTML = renderLoading(t('Cargando comentarios...', 'Loading comments...'));
  try {
    const data = await sendMsg({ type: 'COMMENTS', videoId });

    if (data.commentsDisabled) {
      container.innerHTML = `<div class="ytv-hint" style="padding:8px">${t('Comentarios desactivados', 'Comments disabled')}</div>`;
      return;
    }

    if (data.totalComments === 0) {
      container.innerHTML = `<div class="ytv-hint" style="padding:8px">${t('Sin comentarios', 'No comments')}</div>`;
      return;
    }

    const s = data.sentiment || {};
    const posW = Math.round((s.positive || 0) * 100);
    const negW = Math.round((s.negative || 0) * 100);
    const neuW = 100 - posW - negW;

    const sentimentHtml = `
      <div class="ytv-sentiment-bar">
        <div class="ytv-sentiment-pos" style="width:${posW}%" title="${t('Positivo', 'Positive')} ${posW}%"></div>
        <div class="ytv-sentiment-neg" style="width:${negW}%" title="${t('Negativo', 'Negative')} ${negW}%"></div>
        <div class="ytv-sentiment-neu" style="width:${neuW}%" title="${t('Neutro', 'Neutral')} ${neuW}%"></div>
      </div>
      <div class="ytv-sentiment-labels">
        <span style="color:#22c55e">👍 ${posW}%</span>
        <span style="color:#ef4444">👎 ${negW}%</span>
        <span style="color:#9ca3af">😐 ${neuW}%</span>
      </div>
    `;

    const topHtml = (data.topByLikes || []).slice(0, 3).map(c => `
      <div class="ytv-comment-item">
        <div class="ytv-comment-author">${escapeHtml(c.author)} <span class="ytv-hint">❤️ ${c.likes}</span></div>
        <div class="ytv-comment-text">${escapeHtml(c.text).substring(0, 200)}${c.text.length > 200 ? '...' : ''}</div>
      </div>
    `).join('');

    const user = await sendMsg({ type: 'GET_USER' }).catch(() => null);
    const isPro = user?.isPro || false;

    const questionsHtml = (data.questions || []).slice(0, 5).map(c => `
      <div class="ytv-comment-item ytv-comment-question">
        <div class="ytv-comment-author">${escapeHtml(c.author)} <span class="ytv-hint">❤️ ${c.likes}</span></div>
        <div class="ytv-comment-text">${escapeHtml(c.text).substring(0, 200)}${c.text.length > 200 ? '...' : ''}</div>
        ${isPro ? `<button class="ytv-btn ytv-btn-sm ytv-btn-dark ytv-btn-reply" data-comment="${escapeHtml(c.text.substring(0, 300))}">${t('🤖 AI Reply', '🤖 AI Reply')}</button>` : ''}
        <div class="ytv-reply-area"></div>
      </div>
    `).join('');

    container.innerHTML = `
      <div class="ytv-comments-section">
        <div class="ytv-sc-section-title">${t('Sentimiento', 'Sentiment')} <span class="ytv-hint">(${data.totalComments} ${t('analizados', 'analyzed')})</span></div>
        ${sentimentHtml}

        ${topHtml ? `<div class="ytv-sc-section-title" style="margin-top:12px">${t('Top comentarios', 'Top comments')}</div>${topHtml}` : ''}

        ${questionsHtml ? `<div class="ytv-sc-section-title" style="margin-top:12px">${t('Preguntas', 'Questions')} <span class="ytv-hint">(${data.questions.length})</span></div>${questionsHtml}` : ''}
      </div>
    `;

    // Wire AI Reply buttons
    container.querySelectorAll('.ytv-btn-reply').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const replyArea = btn.nextElementSibling;
        replyArea.innerHTML = renderLoading(t('Generando...', 'Generating...'));
        try {
          const { title } = getVideoInfo();
          const data = await sendMsg({
            type: 'GENERATE',
            template: 'reply',
            inputs: { comment: btn.dataset.comment, videoTitle: title },
          });
          const replyText = data.text || data.content || data.result || '';
          replyArea.innerHTML = `<div class="ytv-reply-text">${escapeHtml(replyText)}</div><button class="ytv-btn ytv-btn-sm ytv-btn-copy">${t('📋 Copiar', '📋 Copy')}</button>`;
          replyArea.querySelector('.ytv-btn-copy').addEventListener('click', (ev) => {
            ev.stopPropagation();
            navigator.clipboard.writeText(replyText);
            ev.target.textContent = '✓';
          });
        } catch (err) {
          replyArea.innerHTML = renderError(err.message);
        }
      });
    });
  } catch (e) {
    container.innerHTML = renderError(e.message);
  }
}


// ============================================================
// E2: Channel Stats widget
// ============================================================

function renderChannelStatsWidget(d) {
  const ch = d.channel;
  const g = d.growth;
  const m = d.monetization;

  function delta(n) {
    if (n === 0) return '<span style="color:#666">—</span>';
    const sign = n > 0 ? '+' : '';
    const color = n > 0 ? '#22c55e' : '#ef4444';
    return `<span style="color:${color}">${sign}${fmtNum(n)}</span>`;
  }

  // Mini sparkline SVG from data
  let sparkSvg = '';
  if (d.sparkline?.length >= 2) {
    const vals = d.sparkline.map(s => s.subs);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const w = 120, h = 28;
    const points = vals.map((v, i) => {
      const x = (i / (vals.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    }).join(' ');
    sparkSvg = `<svg width="${w}" height="${h}" class="ytv-cs-spark"><polyline points="${points}" fill="none" stroke="#ff0000" stroke-width="1.5"/></svg>`;
  }

  // Monetization bar
  const overallPct = Math.round((m.subsPct + m.watchPct) / 2);
  const etaText = m.subsEtaDays != null
    ? (m.subsEtaDays <= 30 ? `~${m.subsEtaDays}d` : m.subsEtaDays <= 365 ? `~${Math.round(m.subsEtaDays / 30)}mo` : `~${Math.round(m.subsEtaDays / 365)}y`)
    : (ch.subs >= 1000 ? '✓' : '?');

  return `
    <div class="ytv-cs-header">
      ${ch.thumb ? `<img class="ytv-cs-thumb" src="${escapeHtml(ch.thumb)}" alt="">` : ''}
      <div class="ytv-cs-meta">
        <div class="ytv-cs-name">${escapeHtml(ch.name)}</div>
        <div class="ytv-cs-sub">${fmtNum(ch.subs)} ${t('subs', 'subs')}</div>
      </div>
      ${sparkSvg}
    </div>

    <div class="ytv-cs-grid">
      <div class="ytv-cs-cell">
        <div class="ytv-cs-cell-val">${fmtNum(ch.subs)}</div>
        <div class="ytv-cs-cell-label">${t('Suscriptores', 'Subscribers')}</div>
        <div class="ytv-cs-cell-delta">7d: ${delta(g.subs7d)} · 30d: ${delta(g.subs30d)}</div>
      </div>
      <div class="ytv-cs-cell">
        <div class="ytv-cs-cell-val">${fmtNum(ch.totalViews)}</div>
        <div class="ytv-cs-cell-label">${t('Vistas', 'Views')}</div>
        <div class="ytv-cs-cell-delta">7d: ${delta(g.views7d)} · 30d: ${delta(g.views30d)}</div>
      </div>
      <div class="ytv-cs-cell">
        <div class="ytv-cs-cell-val">${ch.videoCount}</div>
        <div class="ytv-cs-cell-label">${t('Vídeos', 'Videos')}</div>
      </div>
    </div>

    <div class="ytv-cs-monetization">
      <div class="ytv-cs-mon-title">${t('Progreso monetización', 'Monetization progress')}</div>
      <div class="ytv-cs-mon-row">
        <span class="ytv-cs-mon-label">${t('Subs', 'Subs')} ${fmtNum(ch.subs)}/1K</span>
        <div class="ytv-cs-bar"><div class="ytv-cs-bar-fill" style="width:${m.subsPct}%"></div></div>
        <span class="ytv-cs-mon-pct">${m.subsPct}%</span>
      </div>
      <div class="ytv-cs-mon-row">
        <span class="ytv-cs-mon-label">${t('Horas', 'Hours')} ${fmtNum(m.estWatchHours)}/4K</span>
        <div class="ytv-cs-bar"><div class="ytv-cs-bar-fill ytv-cs-bar-yellow" style="width:${m.watchPct}%"></div></div>
        <span class="ytv-cs-mon-pct">${m.watchPct}%</span>
      </div>
      <div class="ytv-cs-mon-eta">
        ${ch.subs >= 1000 ? `✅ ${t('Canal monetizable', 'Channel monetizable')}` : `⏳ ETA ${t('subs', 'subs')}: <b>${etaText}</b>`}
      </div>
    </div>
    <a class="ytv-cta-link" href="https://ytubviral.com/dashboard?utm_source=extension&utm_medium=studio" target="_blank">${t('Ver dashboard completo →', 'View full dashboard →')}</a>
  `;
}

function renderDailyIdeasMini(ideas) {
  const top = ideas.slice(0, 3);
  return `
    <div class="ytv-cs-ideas">
      <div class="ytv-cs-ideas-title">💡 ${t('Qué grabar hoy', 'What to film today')}</div>
      ${top.map((idea) => {
        const title = t(idea.title_es, idea.title_en) || '';
        const topic = encodeURIComponent(title);
        return `<div class="ytv-cs-idea-item">
          <span>${escapeHtml(title)}</span>
          <a href="https://ytubviral.com/generate?topic=${topic}&utm_source=extension&utm_medium=ideas" target="_blank">${t('Desarrollar →', 'Develop →')}</a>
        </div>`;
      }).join('')}
    </div>
  `;
}


// ============================================================
// YouTube Studio: SEO scores + Optimize buttons (v1.4.0)
// ============================================================

function getStudioVideoId() {
  // studio.youtube.com/video/{videoId}/edit
  const m = location.pathname.match(/\/video\/([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function isStudioVideoList() {
  // studio.youtube.com/channel/{channelId}/videos
  return location.hostname === 'studio.youtube.com' && /\/videos/.test(location.pathname);
}

function isStudioVideoEdit() {
  return location.hostname === 'studio.youtube.com' && !!getStudioVideoId();
}

// ── Studio v2 helpers ──────────────────────────────────────────────

function getStudioTitle() {
  const el = document.querySelector(SELECTORS.studio.titleField);
  return el ? el.textContent.trim() : '';
}

function getStudioDescription() {
  const el = document.querySelector(SELECTORS.studio.descField);
  return el ? el.textContent.trim() : '';
}

function getStudioTags() {
  const chips = document.querySelectorAll(SELECTORS.studio.tagChips);
  return Array.from(chips).map(c => c.textContent.trim()).filter(Boolean);
}

function setStudioField(selector, text) {
  const el = document.querySelector(selector);
  if (!el) return false;
  el.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('insertText', false, text);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

const STUDIO_CHECK_LABELS = {
  title_length: () => t('Largo título', 'Title length'),
  title_number: () => t('Números', 'Numbers'),
  title_caps: () => t('No ALL CAPS', 'No ALL CAPS'),
  title_emoji: () => 'Emoji',
  title_power: () => t('Palabra poder', 'Power word'),
  desc_length: () => t('Descripción larga', 'Long description'),
  desc_links: () => 'Links',
  desc_timestamps: () => 'Timestamps',
  desc_hashtags: () => 'Hashtags',
  desc_cta: () => 'CTA',
  tags_count: () => t('5-20 tags', '5-20 tags'),
  tags_long: () => t('Tags largos', 'Long-tail tags'),
};

function renderStudioChecks(checks) {
  return (checks || []).map(c => {
    const icon = c.ok ? '✅' : '❌';
    const labelFn = STUDIO_CHECK_LABELS[c.key];
    const label = labelFn ? labelFn() : c.key;
    return `<span class="ytv-sc-check-pill ${c.ok ? 'ytv-sc-check-pass' : 'ytv-sc-check-fail'}">${icon} ${escapeHtml(label)}</span>`;
  }).join('');
}

function renderStudioScore(score, checks, titleLen) {
  const color = scoreColor(score);
  const titleLenColor = titleLen >= 30 && titleLen <= 70 ? '#22c55e' : titleLen > 70 ? '#ef4444' : '#eab308';
  return `
    <div class="ytv-studio-score-row">
      <div class="ytv-seo-ring" style="--score-color: ${color}; --score-pct: ${score}">
        <span class="ytv-seo-num">${score}</span>
      </div>
      <div class="ytv-seo-info">
        <div class="ytv-seo-title">SEO Score</div>
        <div class="ytv-seo-sub">${score >= 70 ? t('Buen SEO', 'Good SEO') : score >= 40 ? t('SEO mejorable', 'Needs work') : t('SEO débil', 'Weak SEO')}</div>
      </div>
      <span class="ytv-studio-char-count" style="color:${titleLenColor}">${titleLen} ${t('caracteres', 'chars')}</span>
    </div>
    <div class="ytv-sc-checks-grid">${renderStudioChecks(checks)}</div>
  `;
}

// ── Shared AI button wiring (v2.5.0 — B1 of the 2026-07-03 code review) ────────────────
// injectStudioEditor and injectStudioUploadPanel used to each carry their own ~60-line copy
// of the "generate titles" / "generate tags" logic. Both now call these two functions;
// the editor additionally wires a "generate description" button the upload dialog doesn't have.

// Mensaje/CTA por cada código de error que puede devolver AB_CREATE — el
// content script necesita el código crudo (no traducido) precisamente para
// poder pintar una tarjeta distinta por caso (pro_required es el momento de
// conversión de la release, el resto son estados normales de uso).
function renderAbTestOutcome(err, limit) {
  const code = err?.message || '';
  if (code === 'pro_required') {
    return `<div class="ytv-ab-upsell">
      <strong>${t('La rotación automática A/B es Pro', 'Automatic A/B rotation is Pro')}</strong>
      <p>${t('Ni vidIQ la tiene — YTubViral rota tus dos títulos y te dice cuál gana con datos reales.', "Not even vidIQ has this — YTubViral rotates your two titles and tells you which one wins with real data.")}</p>
      <a href="https://ytubviral.com/pricing?utm_source=extension&utm_medium=abtest" target="_blank" class="ytv-btn ytv-btn-sm ytv-btn-red">${t('Ver planes →', 'See plans →')}</a>
    </div>`;
  }
  // renderError() escapa el mensaje (por diseño, para no inyectar HTML de
  // fuentes externas) — estos 3 casos necesitan un link real, así que se
  // construyen aparte con la misma clase visual .ytv-error.
  if (code === 'active_test_exists') {
    return `<div class="ytv-error">⚠ ${t('Este vídeo ya tiene un test activo. ', 'This video already has an active test. ')}<a href="https://ytubviral.com/ab-test?utm_source=extension&utm_medium=abtest" target="_blank">${t('Verlo →', 'View it →')}</a></div>`;
  }
  if (code === 'max_active_tests') {
    const limitTxt = limit ? t(`(límite de tu plan: ${limit})`, `(your plan's limit: ${limit})`) : '';
    return `<div class="ytv-error">⚠ ${t(`Has alcanzado el límite de tests activos ${limitTxt}. `, `You've reached your active test limit ${limitTxt}. `)}<a href="https://ytubviral.com/ab-test?utm_source=extension&utm_medium=abtest" target="_blank">${t('Gestionar →', 'Manage →')}</a></div>`;
  }
  if (code === 'youtube_not_connected' || code === 'youtube_reconnect_required') {
    return `<div class="ytv-error">⚠ ${t('Conecta (o reconecta) tu canal de YouTube en YTubViral. ', 'Connect (or reconnect) your YouTube channel on YTubViral. ')}<a href="https://ytubviral.com/dashboard?utm_source=extension&utm_medium=abtest" target="_blank">${t('Ir al dashboard →', 'Go to dashboard →')}</a></div>`;
  }
  return renderError(code || t('Error al crear el test', 'Error creating the test'));
}

function wireGenTitlesButton(btn, aiResults, isPro, titleFieldSelector, videoId) {
  btn.addEventListener('click', async () => {
    if (!isPro) { aiResults.innerHTML = renderError(t('Plan Pro requerido', 'Pro plan required')); return; }
    const title = getStudioTitle();
    if (!title) { aiResults.innerHTML = renderError(t('Escribe un título primero', 'Write a title first')); return; }
    aiResults.innerHTML = renderLoading(t('Generando títulos...', 'Generating titles...'));
    try {
      const data = await sendMsg({ type: 'GENERATE', template: 'title', inputs: { tema: title, tono: 'engaging', duracion: '10' } });
      const text = data.content || data.text || data.result || '';
      const titles = text.split('\n').filter(l => l.trim()).slice(0, 5).map(l => l.replace(/^\d+[\.\)]\s*/, '').trim());
      // Botón "A/B" solo en el editor de vídeos ya publicados (videoId presente) —
      // en el diálogo de subida el vídeo aún no existe públicamente, no se puede testear.
      aiResults.innerHTML = titles.map((tt, i) =>
        `<div class="ytv-studio-suggest">
          <span>${escapeHtml(tt)}</span>
          <button class="ytv-btn ytv-btn-sm ytv-btn-red ytv-btn-use" data-text="${escapeHtml(tt)}">${t('Usar', 'Use')}</button>
          ${videoId ? `<button class="ytv-btn ytv-btn-sm ytv-btn-dark ytv-btn-ab" data-idx="${i}">A/B</button>` : ''}
        </div>
        ${videoId ? `<div class="ytv-ab-result" id="ytv-ab-result-${i}"></div>` : ''}`
      ).join('');
      aiResults.querySelectorAll('.ytv-btn-use').forEach(useBtn => {
        useBtn.addEventListener('click', () => {
          setStudioField(titleFieldSelector, useBtn.dataset.text);
          btn.dispatchEvent(new CustomEvent('ytv-field-applied'));
        });
      });
      if (videoId) {
        aiResults.querySelectorAll('.ytv-btn-ab').forEach(abBtn => {
          abBtn.addEventListener('click', async () => {
            const idx = abBtn.dataset.idx;
            const resultEl = aiResults.querySelector(`#ytv-ab-result-${idx}`);
            const variantB = titles[idx];
            // variantA = título actual del campo AHORA (no cacheado — el usuario
            // puede haberlo editado desde que se generaron las sugerencias).
            const variantA = getStudioTitle();
            abBtn.disabled = true;
            resultEl.innerHTML = renderLoading(t('Creando test...', 'Creating test...'));
            try {
              await sendMsg({ type: 'AB_CREATE', videoId, variantA, variantB });
              resultEl.innerHTML = `<div class="ytv-ab-success">✓ ${t('Test creado. ', 'Test created. ')}<a href="https://ytubviral.com/ab-test?utm_source=extension&utm_medium=abtest" target="_blank">${t('Verlo →', 'View it →')}</a></div>`;
            } catch (e) {
              resultEl.innerHTML = renderAbTestOutcome(e, e.limit);
              abBtn.disabled = false;
            }
          });
        });
      }
    } catch (e) { aiResults.innerHTML = renderError(e.message); }
  });
}

function wireGenTagsButton(btn, aiResults, isPro) {
  btn.addEventListener('click', async () => {
    if (!isPro) { aiResults.innerHTML = renderError(t('Plan Pro requerido', 'Pro plan required')); return; }
    const title = getStudioTitle();
    if (!title) { aiResults.innerHTML = renderError(t('Escribe un título primero', 'Write a title first')); return; }
    aiResults.innerHTML = renderLoading(t('Buscando keywords...', 'Searching keywords...'));
    try {
      let data = await sendMsg({ type: 'KEYWORDS', keyword: title });
      let kws = (data.relatedKeywords || data.keywords || data.results || []).slice(0, 15);
      // If no results with full title, retry with first 4 words (more generic)
      if (kws.length === 0) {
        const shortKw = title.split(/\s+/).slice(0, 4).join(' ');
        if (shortKw !== title) {
          data = await sendMsg({ type: 'KEYWORDS', keyword: shortKw });
          kws = (data.relatedKeywords || data.keywords || data.results || []).slice(0, 15);
        }
      }
      if (kws.length === 0) { aiResults.innerHTML = renderError(t('No se encontraron keywords', 'No keywords found')); return; }
      aiResults.innerHTML = `<div class="ytv-studio-suggest">${kws.map(k => {
        const kw = typeof k === 'string' ? k : (k.keyword || k.text || '');
        return `<span class="ytv-studio-tag-pill" data-tag="${escapeHtml(kw)}">${escapeHtml(kw)} <b>+</b></span>`;
      }).join('')}</div>`;
      aiResults.querySelectorAll('.ytv-studio-tag-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          // Copy tag to clipboard as fallback (Studio tags input is complex)
          navigator.clipboard.writeText(pill.dataset.tag).then(() => {
            pill.style.opacity = '0.5';
            pill.innerHTML = `${escapeHtml(pill.dataset.tag)} ✓`;
          });
        });
      });
    } catch (e) { aiResults.innerHTML = renderError(e.message); }
  });
}

function wireGenDescButton(btn, aiResults, isPro, descFieldSelector) {
  btn.addEventListener('click', async () => {
    if (!isPro) { aiResults.innerHTML = renderError(t('Plan Pro requerido', 'Pro plan required')); return; }
    const title = getStudioTitle();
    if (!title) { aiResults.innerHTML = renderError(t('Escribe un título primero', 'Write a title first')); return; }
    aiResults.innerHTML = renderLoading(t('Generando descripción...', 'Generating description...'));
    try {
      const data = await sendMsg({ type: 'GENERATE', template: 'description', inputs: { tema: title, duracion: '10', keywords: '' } });
      const text = data.content || data.text || data.result || '';
      aiResults.innerHTML = `<div class="ytv-studio-suggest"><div class="ytv-studio-desc-preview">${escapeHtml(text).replace(/\n/g, '<br>')}</div><button class="ytv-btn ytv-btn-sm ytv-btn-red" id="ytv-studio-use-desc">${t('📋 Insertar descripción', '📋 Insert description')}</button></div>`;
      document.getElementById('ytv-studio-use-desc').addEventListener('click', () => {
        setStudioField(descFieldSelector, text);
        btn.dispatchEvent(new CustomEvent('ytv-field-applied'));
      });
    } catch (e) { aiResults.innerHTML = renderError(e.message); }
  });
}

// ── Studio Editor v2 ──────────────────────────────────────────────

async function injectStudioEditor() {
  try {
    const videoId = getStudioVideoId();
    if (!videoId) return;

    const container = await waitForEl(SELECTORS.studio.metadataEditor, 8000);
    if (document.getElementById('ytv-studio-scorecard')) return;

    const user = await sendMsg({ type: 'GET_USER' }).catch(() => null);
    const isPro = user?.isPro || false;

    const panel = document.createElement('div');
    panel.id = 'ytv-studio-scorecard';
    panel.className = 'ytv-panel ytv-studio-panel';
    panel.innerHTML = `
      <div class="ytv-header">
        <span class="ytv-logo">YTubViral</span>
        <span class="ytv-badge">SEO Live</span>
      </div>
      <div class="ytv-body">
        ${renderLoading(t('Analizando SEO...', 'Analyzing SEO...'))}
      </div>
      <div id="ytv-studio-besttime"></div>
      <div class="ytv-studio-ai-section">
        <div class="ytv-studio-ai-buttons">
          <button class="ytv-btn ytv-btn-dark ytv-btn-sm" id="ytv-studio-gen-titles">✨ ${t('Generar títulos', 'Generate titles')} ${!isPro ? '<span class="ytv-pro-badge">PRO</span>' : ''}</button>
          <button class="ytv-btn ytv-btn-dark ytv-btn-sm" id="ytv-studio-gen-desc">📝 ${t('Generar descripción', 'Generate description')} ${!isPro ? '<span class="ytv-pro-badge">PRO</span>' : ''}</button>
          <button class="ytv-btn ytv-btn-dark ytv-btn-sm" id="ytv-studio-gen-tags">🏷️ ${t('Sugerir tags', 'Suggest tags')} ${!isPro ? '<span class="ytv-pro-badge">PRO</span>' : ''}</button>
        </div>
        <div id="ytv-studio-ai-results"></div>
      </div>
      <div class="ytv-sc-actions" style="margin-top:8px">
        <a href="https://ytubviral.com/optimize?v=${videoId}&utm_source=extension&utm_medium=studio" target="_blank" class="ytv-btn ytv-btn-red ytv-btn-sm">⚡ ${t('Optimizar en YTubViral', 'Optimize on YTubViral')}</a>
      </div>
    `;

    container.parentElement.insertBefore(panel, container);

    const bodyEl = panel.querySelector('.ytv-body');
    const aiResults = panel.querySelector('#ytv-studio-ai-results');

    // ─ Initial score from SCORECARD (YouTube API data) ─
    try {
      const data = await sendMsg({ type: 'SCORECARD', videoId });
      bodyEl.innerHTML = renderStudioScore(data.score, data.checks, (data.title || '').length);
    } catch (e) {
      bodyEl.innerHTML = renderError(e.message);
    }

    // ─ Best Time hint (v2.5.0 Tier 1 #3) — non-blocking, appears once resolved ─
    renderBestTimeHint().then(html => {
      if (html) panel.querySelector('#ytv-studio-besttime').innerHTML = html;
    });

    // ─ Live SEO: observe title/description edits ─
    let liveTimer = null;
    function scheduleLiveUpdate() {
      if (liveTimer) clearTimeout(liveTimer);
      liveTimer = setTimeout(async () => {
        const title = getStudioTitle();
        const desc = getStudioDescription();
        const tags = getStudioTags();
        if (!title && !desc) return;
        try {
          const live = await sendMsg({ type: 'SEO_LIVE', title, description: desc, tags });
          bodyEl.innerHTML = renderStudioScore(live.score, live.checks, live.titleLength || title.length);
        } catch {
          // silent — keep showing last score
        }
      }, 1500);
    }

    // Observe title and description contenteditable fields
    const observeField = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return;
      const obs = new MutationObserver(scheduleLiveUpdate);
      obs.observe(el, { childList: true, subtree: true, characterData: true });
      el.addEventListener('input', scheduleLiveUpdate);
    };
    observeField(SELECTORS.studio.titleField);
    observeField(SELECTORS.studio.descField);

    // ─ AI Buttons (shared wiring — B1) ─
    const btnTitles = panel.querySelector('#ytv-studio-gen-titles');
    const btnDesc = panel.querySelector('#ytv-studio-gen-desc');
    const btnTags = panel.querySelector('#ytv-studio-gen-tags');
    btnTitles.addEventListener('ytv-field-applied', scheduleLiveUpdate);
    btnDesc.addEventListener('ytv-field-applied', scheduleLiveUpdate);
    wireGenTitlesButton(btnTitles, aiResults, isPro, SELECTORS.studio.titleField, videoId);
    wireGenDescButton(btnDesc, aiResults, isPro, SELECTORS.studio.descField);
    wireGenTagsButton(btnTags, aiResults, isPro);

  } catch (e) {
    console.log('[YTubViral] Studio editor:', e.message);
  }
}

// ── Studio UPLOAD dialog (C3 #1) ──────────────────────────────────────
// The upload dialog reuses the same metadata editor component as the editor (#title-textarea,
// #description-textarea), so the same getStudioTitle/Description/Tags + SEO_LIVE work. We just
// detect the modal and inject a live SEO panel — the highest-intent moment (before publishing).

let uploadDialogObserver = null;

// B3 (code review 2026-07-03): esto vigilaba document.body/subtree para
// siempre, sin desconectar nunca — un callback disparándose en CADA mutación
// del DOM de Studio (que re-renderiza listas constantemente) de por vida.
// Fix: desconectar en cuanto se detecta el diálogo, y re-armar solo cuando se
// cierra (se reutiliza el mismo patrón de sondeo que ya usa
// injectStudioUploadPanel para detectar el editor de metadatos).
function watchStudioUpload() {
  if (location.hostname !== 'studio.youtube.com') return;
  if (uploadDialogObserver) return; // already watching this session
  uploadDialogObserver = new MutationObserver(() => {
    const dialog = document.querySelector(SELECTORS.studio.uploadDialog);
    if (dialog && !document.getElementById('ytv-studio-upload-scorecard')) {
      uploadDialogObserver.disconnect();
      uploadDialogObserver = null;
      injectStudioUploadPanel(dialog);
      watchDialogClose(dialog);
    }
  });
  uploadDialogObserver.observe(document.body, { childList: true, subtree: true });
}

// Sondeo ligero (1/s) mientras el diálogo está montado — mucho más barato que
// el observer de subtree — y re-arma watchStudioUpload() al cerrarse, para
// que un segundo "Subir vídeos" sin navegación (sin SPA nav) se siga detectando.
function watchDialogClose(dialog) {
  const interval = setInterval(() => {
    if (document.body.contains(dialog)) return;
    clearInterval(interval);
    watchStudioUpload();
  }, 1000);
}

async function injectStudioUploadPanel(dialog) {
  try {
    if (document.getElementById('ytv-studio-upload-scorecard')) return;

    // The details step (with the metadata editor) renders a moment after the dialog opens.
    let anchor = null;
    for (let i = 0; i < 20 && !anchor; i++) {
      if (!document.body.contains(dialog)) return; // dialog closed
      anchor = dialog.querySelector('ytcp-video-metadata-editor') || dialog.querySelector('#title-textarea');
      if (!anchor) await new Promise(r => setTimeout(r, 500));
    }
    if (!anchor || document.getElementById('ytv-studio-upload-scorecard')) return;

    const user = await sendMsg({ type: 'GET_USER' }).catch(() => null);
    const isPro = user?.isPro || false;

    const panel = document.createElement('div');
    panel.id = 'ytv-studio-upload-scorecard';
    panel.className = 'ytv-panel ytv-studio-panel';
    panel.innerHTML = `
      <div class="ytv-header">
        <span class="ytv-logo">YTubViral</span>
        <span class="ytv-badge">SEO Live</span>
      </div>
      <div class="ytv-body">${renderLoading(t('Escribe el título para ver tu SEO Score...', 'Type a title to see your SEO score...'))}</div>
      <div id="ytv-up-besttime"></div>
      <div class="ytv-studio-ai-section">
        <div class="ytv-studio-ai-buttons">
          <button class="ytv-btn ytv-btn-dark ytv-btn-sm" id="ytv-up-gen-titles">✨ ${t('Generar títulos', 'Generate titles')} ${!isPro ? '<span class="ytv-pro-badge">PRO</span>' : ''}</button>
          <button class="ytv-btn ytv-btn-dark ytv-btn-sm" id="ytv-up-gen-tags">🏷️ ${t('Sugerir tags', 'Suggest tags')} ${!isPro ? '<span class="ytv-pro-badge">PRO</span>' : ''}</button>
        </div>
        <div id="ytv-up-ai-results"></div>
      </div>
    `;
    (anchor.parentElement || dialog).insertBefore(panel, anchor);

    const bodyEl = panel.querySelector('.ytv-body');
    const aiResults = panel.querySelector('#ytv-up-ai-results');

    // ─ Best Time hint (v2.5.0 Tier 1 #3) ─
    renderBestTimeHint().then(html => {
      if (html) panel.querySelector('#ytv-up-besttime').innerHTML = html;
    });

    let liveTimer = null;
    async function runLive() {
      const title = getStudioTitle();
      const desc = getStudioDescription();
      const tags = getStudioTags();
      if (!title && !desc) return;
      try {
        const live = await sendMsg({ type: 'SEO_LIVE', title, description: desc, tags });
        bodyEl.innerHTML = renderStudioScore(live.score, live.checks, live.titleLength || title.length);
      } catch { /* keep last */ }
    }
    function scheduleLiveUpdate() { if (liveTimer) clearTimeout(liveTimer); liveTimer = setTimeout(runLive, 1500); }

    const observeField = (selector) => {
      const el = dialog.querySelector(selector);
      if (!el) return;
      const obs = new MutationObserver(scheduleLiveUpdate);
      obs.observe(el, { childList: true, subtree: true, characterData: true });
      el.addEventListener('input', scheduleLiveUpdate);
    };
    observeField(SELECTORS.studio.titleField);
    observeField(SELECTORS.studio.descField);
    runLive(); // title may be prefilled from the filename

    // ─ AI Buttons (shared wiring — B1) ─
    const btnTitles = panel.querySelector('#ytv-up-gen-titles');
    const btnTags = panel.querySelector('#ytv-up-gen-tags');
    btnTitles.addEventListener('ytv-field-applied', scheduleLiveUpdate);
    wireGenTitlesButton(btnTitles, aiResults, isPro, SELECTORS.studio.titleField);
    wireGenTagsButton(btnTags, aiResults, isPro);

  } catch (e) {
    console.log('[YTubViral] Studio upload:', e.message);
  }
}

async function injectStudioVideoList() {
  try {
    if (!isStudioVideoList()) return;

    // Wait for video rows to appear
    await waitForEl(SELECTORS.studio.videoRows, 8000);

    // Find all video links in Studio — they contain /video/{id}
    const rows = document.querySelectorAll(SELECTORS.studio.videoRows);
    if (!rows.length) return;

    // Don't inject twice
    if (document.querySelector('.ytv-studio-badge')) return;

    const videoIds = [];
    const rowMap = new Map();

    rows.forEach(row => {
      // Try to extract video ID from links inside the row
      const link = row.querySelector('a[href*="/video/"]');
      if (link) {
        const m = link.href.match(/\/video\/([a-zA-Z0-9_-]{11})/);
        if (m) {
          videoIds.push(m[1]);
          rowMap.set(m[1], row);
        }
      }
    });

    // v2.5.0 (A1 fix): these used to be fetched one-by-one with an `await` inside the loop —
    // up to 10 sequential round-trips (10-20s before the last badge appeared). Placeholders
    // are inserted for all rows up front, then every SCORECARD call fires in parallel, so
    // total wait time is roughly the slowest single call instead of the sum of all ten.
    const toFetch = videoIds.slice(0, 10);
    const badgeFor = new Map();

    toFetch.forEach(vid => {
      const row = rowMap.get(vid);
      if (!row) return;
      const badge = document.createElement('span');
      badge.className = 'ytv-studio-badge';
      badge.innerHTML = '<span class="ytv-spinner-sm"></span>';
      const titleEl = row.querySelector('.video-title-text, h3, [class*="title"]');
      if (titleEl) titleEl.parentElement.appendChild(badge); else row.appendChild(badge);
      badgeFor.set(vid, badge);
    });

    await Promise.allSettled(toFetch.map(async vid => {
      const badge = badgeFor.get(vid);
      if (!badge) return;
      try {
        const data = await sendMsg({ type: 'SCORECARD', videoId: vid });
        const color = scoreColor(data.score);
        const outlierHtml = data.outlierMultiplier > 0
          ? `<span class="ytv-outlier-mini ${data.outlierMultiplier >= 5 ? 'ytv-outlier-green' : data.outlierMultiplier >= 2 ? 'ytv-outlier-yellow' : 'ytv-outlier-gray'}">×${data.outlierMultiplier}</span>`
          : '';
        badge.innerHTML = `
          <span class="ytv-studio-score" style="border-color: ${color}; color: ${color}">${data.score}</span>
          ${outlierHtml}
          <a href="https://ytubviral.com/optimize?v=${vid}&utm_source=extension&utm_medium=studio" target="_blank" class="ytv-studio-opt" title="${t('Optimizar', 'Optimize')}">⚡</a>
        `;
      } catch {
        badge.innerHTML = '<span class="ytv-studio-score" style="border-color:#666;color:#666">?</span>';
      }
    }));
  } catch (e) {
    console.log('[YTubViral] Studio video list:', e.message);
  }
}

// ============================================================
// Velocity Badges (Homepage + Search)
// ============================================================

const vphCache = new Map();
let badgeObserver = null;
let badgeIO = null; // IntersectionObserver — kept in module scope so it can be disconnected on each
                    // navigation (previously a new IO leaked on every SPA navigation)

function extractVideoIdFromThumb(el) {
  // New YouTube DOM: div with class content-id-{videoId}
  const lockup = el.querySelector('div[class*="content-id-"]') || el.closest('div[class*="content-id-"]');
  if (lockup) {
    const m = lockup.className.match(/content-id-([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
  }
  // Old DOM: a[href*="watch?v="]
  const link = el.closest('a[href*="watch?v="]') || el.querySelector('a[href*="watch?v="]');
  if (!link) return null;
  const m = link.href.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function renderVphBadge(vph) {
  const hot = vph >= 1000;
  const cls = hot ? 'ytv-thumb-badge ytv-thumb-hot' : 'ytv-thumb-badge';
  const label = vph >= 1000 ? fmtNum(Math.round(vph)) : vph.toFixed(1);
  return `<div class="${cls}">${hot ? '🔥 ' : ''}${label} VPH</div>`;
}

async function processBadgeBatch(videoIds) {
  // Filter out already cached
  const toFetch = videoIds.filter(id => !vphCache.has(id));
  if (toFetch.length > 0) {
    try {
      const data = await sendMsg({ type: 'VIDEO_BATCH', videoIds: toFetch });
      (data.videos || []).forEach(v => vphCache.set(v.videoId, v));
      // Simple size cap — a very long browsing session shouldn't grow this map unbounded
      if (vphCache.size > 500) {
        const excess = vphCache.size - 500;
        const keys = vphCache.keys();
        for (let i = 0; i < excess; i++) vphCache.delete(keys.next().value);
      }
    } catch (err) {
      console.log('[YTV] VIDEO_BATCH error:', err.message);
    }
  }

  // Apply badges to thumbnails
  videoIds.forEach(id => {
    const cached = vphCache.get(id);
    if (!cached) return;
    // Find thumbnail containers — support both old (ytd-thumbnail) and new (yt-lockup-view-model) YouTube DOM
    const containers = new Set();
    // New DOM: find the thumbnail <a> inside div.content-id-{videoId}
    document.querySelectorAll(`div.content-id-${CSS.escape(id)}`).forEach(el => {
      const thumbLink = el.querySelector('a[href*="watch"]');
      if (thumbLink) containers.add(thumbLink);
      else containers.add(el);
    });
    // Old DOM: ytd-thumbnail with a[href*="watch?v={id}"]
    document.querySelectorAll(`ytd-thumbnail a[href*="watch?v=${id}"]`).forEach(link => {
      const thumb = link.closest('ytd-thumbnail');
      if (thumb) containers.add(thumb);
    });
    // Fallback: any a[href*="watch?v={id}"] → closest renderer
    if (containers.size === 0) {
      document.querySelectorAll(`a[href*="watch?v=${id}"]`).forEach(link => {
        const parent = link.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer');
        if (parent) containers.add(parent);
      });
    }
    containers.forEach(thumb => {
      if (thumb.querySelector('.ytv-thumb-badge')) return;
      thumb.style.position = 'relative';
      const badge = document.createElement('div');
      badge.innerHTML = renderVphBadge(cached.vph);
      thumb.appendChild(badge.firstElementChild);
    });
  });
}

function injectVelocityBadges() {
  if (location.hostname === 'studio.youtube.com') return;
  // Clean up previous observers (both the mutation observer AND the IntersectionObserver —
  // the latter used to leak a new instance on every SPA navigation)
  if (badgeObserver) { badgeObserver.disconnect(); badgeObserver = null; }
  if (badgeIO) { badgeIO.disconnect(); badgeIO = null; }

  const selector = SELECTORS.yt.thumbSelector;
  let batchTimer = null;
  let pendingIds = new Set();

  function scheduleBatch() {
    if (batchTimer) clearTimeout(batchTimer);
    batchTimer = setTimeout(() => {
      const ids = [...pendingIds];
      pendingIds.clear();
      if (ids.length > 0) processBadgeBatch(ids);
    }, 500);
  }

  // Use IntersectionObserver for efficiency (module-scoped so it's disconnected on next nav)
  badgeIO = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const id = extractVideoIdFromThumb(entry.target);
      if (id && !vphCache.has(id)) {
        pendingIds.add(id);
        scheduleBatch();
      } else if (id && vphCache.has(id)) {
        // Already cached — inject badge directly
        processBadgeBatch([id]);
      }
    });
  }, { rootMargin: '200px' });

  // Observe existing items
  document.querySelectorAll(selector).forEach(el => badgeIO.observe(el));

  // Watch for new items (YouTube SPA dynamically loads content)
  badgeObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.(selector)) {
          badgeIO.observe(node);
        }
        node.querySelectorAll?.(selector)?.forEach(el => badgeIO.observe(el));
      }
    }
  });
  badgeObserver.observe(document.body, { childList: true, subtree: true });
}

// ============================================================
// Logged-out panel (win #1: show value without login)
// ============================================================

// v2.5.0 (Tier 1 #2 — A3 of the code review): this used to just report the title's length.
// Now it runs the same 0-100 heuristic scorer as the public /title-analyzer tool (client-side,
// zero API cost), so a visitor with no account gets a real score and concrete tips — the same
// "give value before signup" hook vidIQ uses. Keep this in sync with
// app/title-analyzer/TitleAnalyzerClient.tsx if that scoring ever changes; it's a deliberate,
// duplicated port (a content script can't import from the Next.js app).

const POWER_WORDS = [
  'how', 'why', 'best', 'easy', 'fast', 'free', 'new', 'now', 'secret', 'secrets',
  'proven', 'ultimate', 'simple', 'stop', 'never', 'always', 'avoid', 'mistake',
  'mistakes', 'truth', 'finally', 'instantly', 'guide', 'tips', 'hacks', 'hack',
  'tutorial', 'review', 'vs', 'before', 'after', 'worst', 'top', 'real', 'honest',
  'beginner', 'beginners', 'pro', 'expert', 'crazy', 'insane', 'shocking', 'huge',
  'cómo', 'como', 'por qué', 'porque', 'mejor', 'mejores', 'fácil', 'rápido',
  'gratis', 'nuevo', 'nueva', 'secreto', 'secretos', 'probado', 'definitivo',
  'sencillo', 'deja', 'nunca', 'siempre', 'evita', 'error', 'errores', 'verdad',
  'por fin', 'al instante', 'guía', 'trucos', 'truco', 'tutorial', 'reseña',
  'antes', 'después', 'peor', 'top', 'real', 'honesto', 'principiante',
  'principiantes', 'experto', 'increíble', 'brutal', 'rápida',
];

function analyzeTitleHeuristic(title) {
  const tt = title.trim();
  const chars = tt.length;
  const words = tt.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const lower = tt.toLowerCase();
  const checks = [];

  let lengthEarned = 5;
  let lengthTip = null;
  if (chars >= 40 && chars <= 70) {
    lengthEarned = 25;
  } else if ((chars >= 30 && chars < 40) || (chars > 70 && chars <= 85)) {
    lengthEarned = 15;
    lengthTip = chars < 40
      ? t('Algo corto. Apunta a 40-70 caracteres.', 'A bit short. Aim for 40-70 characters.')
      : t('Algo largo. YouTube corta el título en búsqueda.', 'A bit long. YouTube truncates it in search.');
  } else {
    lengthEarned = 5;
    lengthTip = chars < 30
      ? t('Demasiado corto. 40-70 caracteres rinde mejor.', 'Too short. 40-70 characters performs best.')
      : t('Demasiado largo. Se cortará en resultados.', 'Too long. It will get cut off in results.');
  }
  checks.push({ key: 'length', earned: lengthEarned, weight: 25, tip: lengthTip });

  const hasNumber = /\d/.test(tt);
  checks.push({ key: 'number', earned: hasNumber ? 15 : 0, weight: 15, tip: hasNumber ? null : t('Añade un número ("7 trucos", "2026") — sube el CTR.', 'Add a number ("7 tips", "2026") — boosts CTR.') });

  const powerHits = POWER_WORDS.filter(w => lower.includes(w)).length;
  const powerEarned = powerHits >= 2 ? 20 : powerHits === 1 ? 14 : 0;
  checks.push({ key: 'power', earned: powerEarned, weight: 20, tip: powerEarned === 20 ? null : t('Usa palabras gancho: cómo, mejor, fácil, secreto.', 'Use power words: how, best, easy, secret.') });

  const hasBrackets = /[\[\(].+[\]\)]/.test(tt);
  checks.push({ key: 'brackets', earned: hasBrackets ? 10 : 0, weight: 10, tip: hasBrackets ? null : t('Añadir [2026] o (Tutorial) sube el CTR.', 'Adding [2026] or (Tutorial) boosts CTR.') });

  let wcEarned = 0;
  if (wordCount >= 4 && wordCount <= 9) wcEarned = 10;
  else if (wordCount === 3 || (wordCount >= 10 && wordCount <= 12)) wcEarned = 5;
  checks.push({ key: 'words', earned: wcEarned, weight: 10, tip: wcEarned === 10 ? null : t('Lo ideal son 4-9 palabras.', 'Aim for 4-9 words.') });

  const capsWords = words.filter(w => w.length >= 3 && w === w.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(w)).length;
  let capsEarned = 10;
  if (capsWords === 1) capsEarned = 7; else if (capsWords >= 2) capsEarned = 0;
  checks.push({ key: 'caps', earned: capsEarned, weight: 10, tip: capsEarned === 10 ? null : t('Demasiadas MAYÚSCULAS parecen spam.', 'Too many ALL-CAPS words look spammy.') });

  const hasIntent = /(how to|how |why |what |cómo |como |por qué|qué |\?)/i.test(' ' + lower);
  checks.push({ key: 'intent', earned: hasIntent ? 10 : 0, weight: 10, tip: hasIntent ? null : t('Empezar con "Cómo" o una pregunta conecta con la búsqueda.', 'Starting with "How" or a question matches search intent.') });

  const score = Math.round(checks.reduce((s, c) => s + c.earned, 0));
  return { score, checks };
}

function renderLoggedOutScore(title) {
  const { score, checks } = analyzeTitleHeuristic(title);
  const color = scoreColor(score);
  const topTips = checks.filter(c => c.tip).slice(0, 2);
  return `
    <div style="display:flex;align-items:center;gap:10px">
      <div class="ytv-seo-ring" style="--score-color: ${color}; --score-pct: ${score}; width:44px; height:44px">
        <span class="ytv-seo-num" style="font-size:15px">${score}</span>
      </div>
      <div style="font-size:12px;line-height:1.3">
        <div style="font-weight:700">${t('Score del título', 'Title score')}</div>
        <div style="opacity:.75">${score >= 70 ? t('Fuerte', 'Strong') : score >= 40 ? t('Mejorable', 'Needs work') : t('Flojo', 'Weak')}</div>
      </div>
    </div>
    ${topTips.map(c => `<div style="font-size:12px;color:#f5a623;line-height:1.4;margin-top:6px">⚠ ${escapeHtml(c.tip)}</div>`).join('')}
  `;
}


// ============================================================
// Navigation (YouTube SPA)
// ============================================================

let lastUrl = location.href;
let navTimer = null;

async function onPageChange() {
  // v2.7: one persistent shell on document.body — mounted once, refreshed on nav.
  // No per-page panels to clean up, and no early return for logged-out users
  // (the shell + thumbnail badges give value at second 1, like vidIQ).
  mountShell();
  refreshShell();

  // YouTube Studio — the inline SEO panel stays next to the metadata editor.
  if (location.hostname === 'studio.youtube.com') {
    watchStudioUpload(); // detect the upload dialog (opens without a URL change)
    if (isStudioVideoEdit()) {
      injectStudioEditor();
    } else if (isStudioVideoList()) {
      setTimeout(() => injectStudioVideoList(), 1500);
    }
    return;
  }

  // Regular YouTube — thumbnail VPH badges (now work logged-out).
  const type = getPageType();
  if (type === 'video' || type === 'search' || type === 'channel' || type === 'home') {
    injectVelocityBadges();
  }
}

// SPA nav race: Studio's metadata editor mounts a moment after navigation, so the
// Studio SEO panel still needs the retry. The shell mounts synchronously on
// document.body, so nothing to retry for regular YouTube pages.
function expectedPanelId() {
  if (location.hostname === 'studio.youtube.com' && isStudioVideoEdit()) return 'ytv-studio-scorecard';
  return null;
}

function dispatchWithRetry(attempt = 0) {
  onPageChange();
  if (attempt >= 2) return;
  const id = expectedPanelId();
  const startedAt = location.href;
  setTimeout(() => {
    if (location.href !== startedAt) return; // navegó a otra página: su propio ciclo se encarga
    if (id && !document.getElementById(id)) dispatchWithRetry(attempt + 1);
  }, attempt === 0 ? 1500 : 2000);
}

function scheduleInit() {
  if (navTimer) clearTimeout(navTimer);
  navTimer = setTimeout(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      dispatchWithRetry();
    }
  }, 500);
}

document.addEventListener('yt-navigate-finish', () => {
  lastUrl = ''; // force re-check
  scheduleInit();
});

window.addEventListener('popstate', () => {
  lastUrl = ''; // back/forward: forzar re-check aunque la href coincida con la última
  scheduleInit();
});

// Ensure critical CSS is present (manifest CSS can be lost on extension reload)
(function ensureCss() {
  const test = document.createElement('div');
  test.className = 'ytv-thumb-badge';
  test.style.position = 'fixed';
  test.style.visibility = 'hidden';
  document.body.appendChild(test);
  const w = test.getBoundingClientRect().width;
  document.body.removeChild(test);
  // If badge has no padding (CSS not loaded), inject critical styles
  if (w === 0) {
    const s = document.createElement('style');
    s.textContent = `
      .ytv-thumb-badge{position:absolute!important;bottom:6px!important;left:6px!important;background:rgba(0,0,0,.8)!important;color:#e5e7eb!important;font-size:10px!important;font-weight:700!important;padding:2px 6px!important;border-radius:4px!important;z-index:50!important;pointer-events:none!important;line-height:1.3!important;backdrop-filter:blur(4px)!important}
      .ytv-thumb-hot{background:rgba(220,38,38,.85)!important;color:#fff!important}
    `;
    document.head.appendChild(s);
  }
})();

// Initial load — mismo retry que la navegación (en carga directa/refresco el
// contenedor puede no estar listo cuando corre document_idle).
initLang().then(() => dispatchWithRetry());
