/**
 * DEMO MODE — Paste this in the browser console to show realistic data
 * for video recording. Works on any page of the app.
 *
 * Usage: Open the page you want to record, paste this in console, reload.
 * To disable: close the tab or run: sessionStorage.removeItem('ytv_demo');
 */

// Mark demo as active for this tab
sessionStorage.setItem('ytv_demo', '1');

const _origFetch = window.fetch;
window.fetch = async function(url, opts) {
  const u = typeof url === 'string' ? url : url.toString();

  // ── /api/user/stats ──────────────────────────────────────────────
  if (u.includes('/api/user/stats')) {
    return fakeResponse({
      user: { email: 'javier@ytubviral.com', name: 'Javier Jimeno', createdAt: '2025-09-15T10:00:00Z' },
      stats: {
        totalGenerations: 347,
        generationsThisMonth: 6,
        limit: 50,
        remaining: 44,
        isPro: true,
        plan: 'pro',
        streak: 12,
      },
      subscription: { status: 'active', plan: 'pro', cancelAtPeriodEnd: false, currentPeriodEnd: '2026-06-15T00:00:00Z' },
    });
  }

  // ── /api/youtube/channel ─────────────────────────────────────────
  if (u.includes('/api/youtube/channel')) {
    return fakeResponse({
      connected: true,
      channel: {
        id: 'UC_demo_channel',
        title: 'Javier Jimeno',
        thumbnail: 'https://yt3.ggpht.com/a/default-user=s88-c-k-c0x00ffffff-no-rj',
        subscriberCount: '18400',
        videoCount: '87',
        viewCount: '2340000',
      },
      videos: [
        { id: 'v1', title: 'Cómo Monetizar YouTube en 2026 (La Verdad)', views: 84200, publishedAt: '2026-05-08T14:00:00Z', thumbnail: '' },
        { id: 'v2', title: '10 Errores que MATAN tu Canal de YouTube', views: 127500, publishedAt: '2026-05-01T10:00:00Z', thumbnail: '' },
        { id: 'v3', title: 'Mi Setup de YouTube por Menos de 500€', views: 63800, publishedAt: '2026-04-24T12:00:00Z', thumbnail: '' },
        { id: 'v4', title: 'El Algoritmo de YouTube Cambió (Qué Hacer)', views: 195000, publishedAt: '2026-04-17T10:00:00Z', thumbnail: '' },
        { id: 'v5', title: 'Keyword Research para YouTube: Guía Completa', views: 41200, publishedAt: '2026-04-10T10:00:00Z', thumbnail: '' },
      ],
    });
  }

  // ── /api/youtube/stats ───────────────────────────────────────────
  if (u.includes('/api/youtube/stats')) {
    return fakeResponse({
      data: {
        growth: { views: 12.4, subs: 8.7, watchTime: 15.2 },
        points: [
          { date: '5 May', val: 3200, y: 60 },
          { date: '6 May', val: 4100, y: 45 },
          { date: '7 May', val: 3800, y: 50 },
          { date: '8 May', val: 5600, y: 25 },
          { date: '9 May', val: 6200, y: 15 },
          { date: '10 May', val: 5900, y: 20 },
          { date: '11 May', val: 7400, y: 5 },
        ],
      },
    });
  }

  // ── /api/youtube/analytics ───────────────────────────────────────
  if (u.includes('/api/youtube/analytics')) {
    return fakeResponse({
      channelName: 'Javier Jimeno',
      period: { start: '2026-04-11', end: '2026-05-11' },
      overview: {
        views: 234800,
        estimatedMinutesWatched: 98400,
        subscribersGained: 2840,
        subscribersLost: 310,
        averageViewDuration: 312,
        likes: 14200,
        comments: 1870,
        shares: 940,
      },
      traffic: [
        { insightTrafficSourceType: 'YT_SEARCH', views: 89200, estimatedMinutesWatched: 37400 },
        { insightTrafficSourceType: 'SUGGESTED', views: 72400, estimatedMinutesWatched: 30200 },
        { insightTrafficSourceType: 'EXT_URL', views: 28600, estimatedMinutesWatched: 12000 },
        { insightTrafficSourceType: 'SUBSCRIBER', views: 18900, estimatedMinutesWatched: 7900 },
        { insightTrafficSourceType: 'NOTIFICATION', views: 12100, estimatedMinutesWatched: 5100 },
        { insightTrafficSourceType: 'SHORTS', views: 8400, estimatedMinutesWatched: 2100 },
        { insightTrafficSourceType: 'PLAYLIST', views: 3200, estimatedMinutesWatched: 1800 },
        { insightTrafficSourceType: 'END_SCREEN', views: 2000, estimatedMinutesWatched: 900 },
      ],
      countries: [
        { country: 'ES', views: 78400, estimatedMinutesWatched: 32800 },
        { country: 'MX', views: 42100, estimatedMinutesWatched: 17600 },
        { country: 'AR', views: 28900, estimatedMinutesWatched: 12100 },
        { country: 'CO', views: 21400, estimatedMinutesWatched: 8900 },
        { country: 'US', views: 18200, estimatedMinutesWatched: 7600 },
        { country: 'CL', views: 12800, estimatedMinutesWatched: 5400 },
        { country: 'PE', views: 9400, estimatedMinutesWatched: 3900 },
        { country: 'GB', views: 6200, estimatedMinutesWatched: 2600 },
      ],
      topVideos: [
        { video: 'v4', title: 'El Algoritmo de YouTube Cambió (Qué Hacer)', views: 195000, estimatedMinutesWatched: 48200, averageViewDuration: 384, likes: 8200, subscribersGained: 1240 },
        { video: 'v2', title: '10 Errores que MATAN tu Canal de YouTube', views: 127500, estimatedMinutesWatched: 31800, averageViewDuration: 298, likes: 5400, subscribersGained: 820 },
        { video: 'v1', title: 'Cómo Monetizar YouTube en 2026 (La Verdad)', views: 84200, estimatedMinutesWatched: 21050, averageViewDuration: 312, likes: 3600, subscribersGained: 480 },
        { video: 'v3', title: 'Mi Setup de YouTube por Menos de 500€', views: 63800, estimatedMinutesWatched: 15900, averageViewDuration: 276, likes: 2800, subscribersGained: 340 },
        { video: 'v5', title: 'Keyword Research para YouTube: Guía Completa', views: 41200, estimatedMinutesWatched: 14400, averageViewDuration: 420, likes: 1900, subscribersGained: 260 },
      ],
      daily: generateDailyData(30),
    });
  }

  // ── /api/youtube/subscribers ─────────────────────────────────────
  if (u.includes('/api/youtube/subscribers')) {
    return fakeResponse({
      total: 18400,
      gained30d: 2840,
      lost30d: 310,
      net30d: 2530,
      growthPct: 15.9,
      sources: [
        { source: 'YouTube Search', pct: 38, count: 1079 },
        { source: 'Suggested Videos', pct: 27, count: 767 },
        { source: 'External', pct: 14, count: 398 },
        { source: 'Channel Page', pct: 11, count: 312 },
        { source: 'Other', pct: 10, count: 284 },
      ],
      daily: generateSubsDaily(30),
      milestones: [
        { date: '2026-05-09', subs: 18000, label: '18K' },
        { date: '2026-04-22', subs: 17000, label: '17K' },
        { date: '2026-04-05', subs: 16000, label: '16K' },
        { date: '2026-03-18', subs: 15000, label: '15K' },
      ],
    });
  }

  // ── /api/youtube/revenue ─────────────────────────────────────────
  if (u.includes('/api/youtube/revenue')) {
    return fakeResponse({
      estimated: true,
      total30d: 842.50,
      rpm: 3.59,
      cpm: 5.20,
      topVideos: [
        { title: 'El Algoritmo de YouTube Cambió (Qué Hacer)', views: 195000, rpm: 4.10, estimated: 799.50 },
        { title: '10 Errores que MATAN tu Canal de YouTube', views: 127500, rpm: 3.80, estimated: 484.50 },
        { title: 'Cómo Monetizar YouTube en 2026 (La Verdad)', views: 84200, rpm: 3.90, estimated: 328.38 },
        { title: 'Mi Setup de YouTube por Menos de 500€', views: 63800, rpm: 3.20, estimated: 204.16 },
        { title: 'Keyword Research para YouTube: Guía Completa', views: 41200, rpm: 2.80, estimated: 115.36 },
      ],
      byCountry: [
        { country: 'ES', rpm: 4.50, pct: 33 },
        { country: 'US', rpm: 6.20, pct: 8 },
        { country: 'MX', rpm: 2.10, pct: 18 },
        { country: 'AR', rpm: 1.80, pct: 12 },
        { country: 'CO', rpm: 2.30, pct: 9 },
        { country: 'GB', rpm: 5.80, pct: 3 },
      ],
    });
  }

  // ── /api/user/generations ────────────────────────────────────────
  if (u.includes('/api/user/generations')) {
    return fakeResponse({
      generations: [
        { id: 'g1', template: 'title', createdAt: '2026-05-11T09:15:00Z', tokensUsed: 180, output: '10 Errores de Edición que YouTube NO Perdona (Evítalos)', inputs: { topic: 'errores de edición youtube' } },
        { id: 'g2', template: 'description', createdAt: '2026-05-10T16:30:00Z', tokensUsed: 420, output: 'En este vídeo te enseño los errores más comunes que cometen los editores...', inputs: { topic: 'errores de edición' } },
        { id: 'g3', template: 'script', createdAt: '2026-05-10T11:00:00Z', tokensUsed: 890, output: 'HOOK: ¿Sabías que el 80% de los YouTubers abandonan en los primeros 6 meses?...', inputs: { topic: 'por qué abandonan los youtubers' } },
        { id: 'g4', template: 'title', createdAt: '2026-05-09T14:20:00Z', tokensUsed: 160, output: 'Gané 500€ en YouTube sin Monetización (Así Fue)', inputs: { topic: 'ganar dinero youtube sin monetización' } },
        { id: 'g5', template: 'thumbnail', createdAt: '2026-05-09T10:00:00Z', tokensUsed: 200, output: 'Composición: Tu cara con expresión de sorpresa a la izquierda (60% del frame)...', inputs: { topic: 'monetización alternativa' } },
      ],
      hasMore: true,
    });
  }

  // ── /api/daily-tip ───────────────────────────────────────────────
  if (u.includes('/api/daily-tip')) {
    return fakeResponse({
      es: 'Los primeros 30 segundos de tu vídeo determinan si el espectador se queda o se va. Empieza con una pregunta o dato sorprendente — nunca con "hola, bienvenidos a mi canal".',
      en: 'The first 30 seconds of your video determine whether the viewer stays or leaves. Start with a question or surprising fact — never with "hey, welcome to my channel".',
    });
  }

  // ── /api/daily-ideas ─────────────────────────────────────────────
  if (u.includes('/api/daily-ideas')) {
    return fakeResponse({
      ideas: [
        { title: 'Setup Minimalista para YouTube con IA', score: 92, reason: 'Trending + low competition' },
        { title: 'Cómo Usar ChatGPT para Scripts de YouTube', score: 88, reason: 'High search volume' },
        { title: 'El Error #1 que Cometen los YouTubers Nuevos', score: 85, reason: 'Evergreen + high CTR potential' },
      ],
    });
  }

  // ── /api/onboarding ──────────────────────────────────────────────
  if (u.includes('/api/onboarding')) {
    return fakeResponse({ step: 3, name: 'Javier' });
  }

  // ── /api/reviews ─────────────────────────────────────────────────
  if (u.includes('/api/reviews') && (!opts || opts.method !== 'POST')) {
    return fakeResponse({ review: null });
  }

  // ── /api/video-previews ──────────────────────────────────────────
  if (u.includes('/api/video-previews') && !u.includes('/api/video-previews/')) {
    return fakeResponse({ previews: [] });
  }

  // ── Default: pass through ────────────────────────────────────────
  return _origFetch.apply(this, arguments);
};

// ── Helpers ──────────────────────────────────────────────────────────

function fakeResponse(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function generateDailyData(days) {
  const pts = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const base = 6000 + Math.random() * 4000;
    const trend = (days - i) * 80; // upward trend
    pts.push({
      day: d.toISOString().slice(0, 10),
      views: Math.round(base + trend + (Math.random() - 0.3) * 2000),
      estimatedMinutesWatched: Math.round((base + trend) * 0.42),
      subscribersGained: Math.round(60 + Math.random() * 80 + (days - i) * 2),
      subscribersLost: Math.round(5 + Math.random() * 15),
    });
  }
  return pts;
}

function generateSubsDaily(days) {
  const pts = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const gained = Math.round(60 + Math.random() * 80 + (days - i) * 2);
    const lost = Math.round(5 + Math.random() * 15);
    pts.push({
      date: d.toISOString().slice(0, 10),
      gained,
      lost,
      net: gained - lost,
    });
  }
  return pts;
}

console.log('%c🔴 DEMO MODE ACTIVE — Realistic data loaded for video recording', 'color: #ee4d5e; font-weight: bold; font-size: 14px;');
console.log('To disable: close this tab or run sessionStorage.removeItem("ytv_demo")');
