/**
 * Demo mode data for video recording.
 * When cookie `ytv_demo=1` is set, API routes return this fake data instead of real data.
 *
 * Activate:  document.cookie = 'ytv_demo=1; path=/'
 * Deactivate: document.cookie = 'ytv_demo=; path=/; max-age=0'
 */

import { NextRequest, NextResponse } from 'next/server';

export function isDemoMode(req: NextRequest): boolean {
  return req.cookies.get('ytv_demo')?.value === '1';
}

// Seeded pseudo-random for consistent but organic-looking data
function seededRand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function generateSnapshots(days: number) {
  const pts = [];
  const now = new Date();
  let subs = 15200;
  let views = 1850000;
  let vids = 80;

  // Pre-define growth phases so the cumulative curve has visible shape changes.
  // Each phase: [startDay, endDay, subsMultiplier, viewsMultiplier]
  // "plateau" = 0.15x, "normal" = 1x, "boost" = 2.5x, "viral" = 5x
  const phases: [number, number, number, number][] = [
    [1,  12, 0.15, 0.2],   // plateau — algo dip, barely growing
    [13, 18, 1.0,  1.0],   // normal recovery
    [19, 22, 2.8,  3.0],   // video went semi-viral
    [23, 38, 0.8,  0.9],   // back to steady
    [39, 42, 0.1,  0.15],  // another plateau
    [43, 48, 1.5,  1.6],   // new video boosts
    [49, 52, 4.5,  5.0],   // viral spike!
    [53, 58, 2.0,  2.2],   // afterglow from viral
    [59, 72, 0.9,  1.0],   // normal
    [73, 76, 0.2,  0.25],  // slight dip
    [77, 84, 1.2,  1.3],   // recovering
    [85, 90, 1.8,  2.0],   // recent momentum
  ];

  function getPhaseMultiplier(dayIdx: number): [number, number] {
    for (const [s, e, sm, vm] of phases) {
      if (dayIdx >= s && dayIdx <= e) return [sm, vm];
    }
    return [1, 1];
  }

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dayIdx = days - i;
    const r = seededRand(dayIdx);
    const [subsMult, viewsMult] = getPhaseMultiplier(dayIdx);

    const dailySubs = Math.max(2, Math.round((30 + r * 50) * subsMult));
    const dailyViews = Math.max(200, Math.round((3000 + r * 4000) * viewsMult));

    subs += dailySubs;
    views += dailyViews;
    if (dayIdx % 4 === 0 && r > 0.3) vids++;
    pts.push({ subscribers: subs, totalViews: views, videoCount: vids, recordedAt: d.toISOString() });
  }
  return pts;
}

const DEMO_VIDEOS = [
  { videoId: 'dQw4w9WgXcQ', title: 'Cómo Monetizar YouTube en 2026 (La Verdad)', views: 84200, likes: 3600, comments: 420, publishedAt: '2026-05-08T14:00:00Z', thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg' },
  { videoId: '9bZkp7q19f0', title: '10 Errores que MATAN tu Canal de YouTube', views: 127500, likes: 5400, comments: 680, publishedAt: '2026-05-01T10:00:00Z', thumbnail: 'https://i.ytimg.com/vi/9bZkp7q19f0/mqdefault.jpg' },
  { videoId: 'kJQP7kiw5Fk', title: 'Mi Setup de YouTube por Menos de 500€', views: 63800, likes: 2800, comments: 340, publishedAt: '2026-04-24T12:00:00Z', thumbnail: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/mqdefault.jpg' },
  { videoId: 'RgKAFK5djSk', title: 'El Algoritmo de YouTube Cambió (Qué Hacer)', views: 195000, likes: 8200, comments: 1120, publishedAt: '2026-04-17T10:00:00Z', thumbnail: 'https://i.ytimg.com/vi/RgKAFK5djSk/mqdefault.jpg' },
  { videoId: 'JGwWNGJdvx8', title: 'Keyword Research para YouTube: Guía Completa', views: 41200, likes: 1900, comments: 210, publishedAt: '2026-04-10T10:00:00Z', thumbnail: 'https://i.ytimg.com/vi/JGwWNGJdvx8/mqdefault.jpg' },
];

const DEMO_ROUTES: Record<string, (req: NextRequest) => object | null> = {
  '/api/user/stats': () => ({
    user: { email: 'javier@ytubviral.com', name: 'Javier Jimeno', createdAt: '2025-09-15T10:00:00Z' },
    stats: {
      totalGenerations: 347, generationsThisMonth: 6, limit: 50, remaining: 44,
      isPro: true, plan: 'pro', streak: 12,
    },
    subscription: { status: 'active', plan: 'pro', cancelAtPeriodEnd: false, currentPeriodEnd: '2026-06-15T00:00:00Z' },
  }),

  '/api/youtube/channel': () => {
    const snapshots = generateSnapshots(90);
    const latest = snapshots[snapshots.length - 1];
    return {
      connected: true,
      channel: {
        id: 'UC_demo_channel', name: 'Javier Jimeno',
        thumbnail: 'https://yt3.ggpht.com/a/default-user=s88-c-k-c0x00ffffff-no-rj',
        subscribers: latest.subscribers, totalViews: latest.totalViews, videoCount: latest.videoCount,
      },
      videos: DEMO_VIDEOS,
    };
  },

  '/api/youtube/stats': () => {
    const snapshots = generateSnapshots(90);
    const latest = snapshots[snapshots.length - 1];
    const week = snapshots[Math.max(0, snapshots.length - 8)];
    const month = snapshots[Math.max(0, snapshots.length - 31)];
    return {
      data: {
        points: snapshots,
        growth: {
          subs7d: latest.subscribers - week.subscribers,
          subs30d: latest.subscribers - month.subscribers,
          views7d: latest.totalViews - week.totalViews,
          views30d: latest.totalViews - month.totalViews,
          videos7d: latest.videoCount - week.videoCount,
          videos30d: latest.videoCount - month.videoCount,
        },
        latest,
      },
    };
  },

  '/api/daily-ideas': () => ({
    ideas: [
      { title_es: 'Setup Minimalista para YouTube con IA', title_en: 'Minimalist YouTube Setup with AI', idea_es: 'Enseña cómo montar un setup completo de grabación usando herramientas de IA por menos de 200€', idea_en: 'Show how to build a complete recording setup using AI tools for under $200' },
      { title_es: 'Cómo Usar ChatGPT para Scripts de YouTube', title_en: 'How to Use ChatGPT for YouTube Scripts', idea_es: 'Tutorial paso a paso para generar guiones que enganchen desde el primer segundo', idea_en: 'Step-by-step tutorial to generate scripts that hook from the first second' },
      { title_es: 'El Error #1 que Cometen los YouTubers Nuevos', title_en: 'The #1 Mistake New YouTubers Make', idea_es: 'Contenido evergreen sobre no optimizar títulos — alto potencial de CTR', idea_en: 'Evergreen content about not optimizing titles — high CTR potential' },
    ],
    date: new Date().toISOString().slice(0, 10),
  }),

  '/api/user/generations': () => ({
    generations: [
      { id: 'g1', template: 'title', createdAt: '2026-05-11T09:15:00Z', tokensUsed: 180, output: '10 Errores de Edición que YouTube NO Perdona (Evítalos)', inputs: { topic: 'errores de edición youtube' } },
      { id: 'g2', template: 'description', createdAt: '2026-05-10T16:30:00Z', tokensUsed: 420, output: 'En este vídeo te enseño los errores más comunes que cometen los editores...', inputs: { topic: 'errores de edición' } },
      { id: 'g3', template: 'script', createdAt: '2026-05-10T11:00:00Z', tokensUsed: 890, output: 'HOOK: ¿Sabías que el 80% de los YouTubers abandonan en los primeros 6 meses?...', inputs: { topic: 'por qué abandonan los youtubers' } },
      { id: 'g4', template: 'title', createdAt: '2026-05-09T14:20:00Z', tokensUsed: 160, output: 'Gané 500€ en YouTube sin Monetización (Así Fue)', inputs: { topic: 'ganar dinero youtube sin monetización' } },
      { id: 'g5', template: 'thumbnail', createdAt: '2026-05-09T10:00:00Z', tokensUsed: 200, output: 'Composición: Tu cara con expresión de sorpresa a la izquierda (60% del frame)...', inputs: { topic: 'monetización alternativa' } },
    ],
    hasMore: true,
  }),

  '/api/daily-tip': () => ({
    es: 'Los primeros 30 segundos de tu vídeo determinan si el espectador se queda o se va. Empieza con una pregunta o dato sorprendente — nunca con "hola, bienvenidos a mi canal".',
    en: 'The first 30 seconds of your video determine whether the viewer stays or leaves. Start with a question or surprising fact — never with "hey, welcome to my channel".',
  }),

  '/api/onboarding': () => ({ step: 3, name: 'Javier' }),
  '/api/reviews': () => ({ review: null }),
  '/api/video-previews': () => ({ previews: [] }),

  // ── Analytics page ─────────────────────────────────────────────
  '/api/youtube/analytics': () => {
    const now = new Date();
    const endDate = new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10);
    const startDate = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    // Growth phases for analytics daily data — different amplitudes create
    // varied peak heights instead of uniform oscillation.
    // [startDay, endDay, viewsMult, subsMult]
    const analyticsPhases: [number, number, number, number][] = [
      [1,  8,  0.6,  0.5],   // slow week
      [9,  14, 1.0,  1.0],   // normal
      [15, 17, 2.2,  2.0],   // video release bump
      [18, 25, 1.1,  1.0],   // settling
      [26, 30, 0.5,  0.4],   // dip
      [31, 33, 0.7,  0.6],   // low
      [34, 38, 1.8,  1.7],   // another release
      [39, 45, 1.3,  1.2],   // afterglow
      [46, 50, 0.8,  0.7],   // normal-low
      [51, 54, 3.5,  3.0],   // big viral spike
      [55, 60, 2.0,  1.8],   // viral afterglow
      [61, 68, 1.0,  0.9],   // back to normal
      [69, 74, 0.55, 0.5],   // quiet period
      [75, 80, 1.4,  1.3],   // recovery
      [81, 85, 1.0,  1.0],   // steady
      [86, 90, 1.6,  1.5],   // recent momentum
    ];
    function getAnalyticsMult(dayIdx: number): [number, number] {
      for (const [s, e, vm, sm] of analyticsPhases) {
        if (dayIdx >= s && dayIdx <= e) return [vm, sm];
      }
      return [1, 1];
    }

    const daily = [];
    for (let i = 89; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const dayIdx = 90 - i;
      const r = seededRand(dayIdx + 500);
      const dow = d.getDay();
      const wkFactor = (dow === 0 || dow === 6) ? 1.2 : (dow === 5) ? 1.1 : 1.0;
      const [viewsMult, subsMult] = getAnalyticsMult(dayIdx);
      const baseViews = 4500 + r * 3000;
      const baseSubs = 40 + r * 50;
      daily.push({
        day: d.toISOString().slice(0, 10),
        views: Math.round(baseViews * viewsMult * wkFactor),
        estimatedMinutesWatched: Math.round(baseViews * viewsMult * wkFactor * 0.38),
        subscribersGained: Math.round(baseSubs * subsMult * wkFactor),
        subscribersLost: Math.round(4 + r * 12),
      });
    }
    return {
      channelName: 'Javier Jimeno',
      period: { start: startDate, end: endDate },
      overview: {
        views: 234800, estimatedMinutesWatched: 98400, averageViewDuration: 312, averageViewPercentage: 42.5,
        subscribersGained: 2840, subscribersLost: 310, likes: 14200, comments: 1870, shares: 940,
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
        { video: 'RgKAFK5djSk', title: 'El Algoritmo de YouTube Cambió (Qué Hacer)', views: 195000, estimatedMinutesWatched: 48200, averageViewDuration: 384, likes: 8200, subscribersGained: 1240 },
        { video: '9bZkp7q19f0', title: '10 Errores que MATAN tu Canal de YouTube', views: 127500, estimatedMinutesWatched: 31800, averageViewDuration: 298, likes: 5400, subscribersGained: 820 },
        { video: 'dQw4w9WgXcQ', title: 'Cómo Monetizar YouTube en 2026 (La Verdad)', views: 84200, estimatedMinutesWatched: 21050, averageViewDuration: 312, likes: 3600, subscribersGained: 480 },
        { video: 'kJQP7kiw5Fk', title: 'Mi Setup de YouTube por Menos de 500€', views: 63800, estimatedMinutesWatched: 15900, averageViewDuration: 276, likes: 2800, subscribersGained: 340 },
        { video: 'JGwWNGJdvx8', title: 'Keyword Research para YouTube: Guía Completa', views: 41200, estimatedMinutesWatched: 14400, averageViewDuration: 420, likes: 1900, subscribersGained: 260 },
      ],
      daily,
    };
  },

  // ── Subscribers page ───────────────────────────────────────────
  '/api/youtube/subscribers': () => {
    const now = new Date();
    const endDate = new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10);
    const startDate = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);
    const subsTimeline = [];
    for (let i = 89; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const r = seededRand(90 - i + 200);
      const isSpike = r > 0.93;
      subsTimeline.push({
        day: d.toISOString().slice(0, 10),
        gained: Math.round(55 + r * 70 + (90 - i) * 0.6 + (isSpike ? 200 : 0)),
        lost: Math.round(4 + r * 12),
      });
    }
    const totalGained = subsTimeline.reduce((s, d) => s + d.gained, 0);
    const totalLost = subsTimeline.reduce((s, d) => s + d.lost, 0);
    return {
      ageGroups: [
        { group: '18-24', percentage: 28.5 }, { group: '25-34', percentage: 38.2 },
        { group: '35-44', percentage: 18.7 }, { group: '45-54', percentage: 9.1 },
        { group: '55-64', percentage: 3.8 }, { group: '65+', percentage: 1.7 },
      ],
      genderSplit: [{ gender: 'male', percentage: 72.4 }, { gender: 'female', percentage: 27.6 }],
      countries: [
        { country: 'ES', views: 78400, watchTime: 32800, subsGained: 890 },
        { country: 'MX', views: 42100, watchTime: 17600, subsGained: 520 },
        { country: 'AR', views: 28900, watchTime: 12100, subsGained: 380 },
        { country: 'CO', views: 21400, watchTime: 8900, subsGained: 290 },
        { country: 'US', views: 18200, watchTime: 7600, subsGained: 240 },
      ],
      subsSources: [
        { source: 'YT_SEARCH', subsGained: 89200 },
        { source: 'SUGGESTED', subsGained: 72400 },
        { source: 'EXT_URL', subsGained: 28600 },
        { source: 'SUBSCRIBER', subsGained: 18900 },
      ],
      subsTimeline,
      summary: { totalSubsGained: totalGained, totalSubsLost: totalLost, netGrowth: totalGained - totalLost },
      aiInsights: {
        audienceProfile: 'Tu audiencia principal son hombres de 25-34 años en España y Latinoamérica interesados en crecer en YouTube y monetizar contenido digital.',
        interests: ['YouTube growth', 'Video editing', 'Content creation', 'Digital marketing', 'Passive income'],
        collaborationSuggestions: [
          { channel: 'Canales de edición de vídeo (DaVinci, Premiere)', reason: 'Audiencia complementaria que busca mejorar calidad técnica' },
          { channel: 'Canales de marketing digital en español', reason: 'Overlap en audiencia emprendedora digital' },
          { channel: 'Canales de productividad/tech', reason: 'Tu audiencia valora herramientas y optimización' },
        ],
        growthTips: [
          'Crea más contenido en inglés para captar audiencia US/GB con CPMs más altos',
          'Enfócate en Shorts para captar el segmento 18-24 que crece rápido',
          'Colabora con canales de edición de vídeo para cross-pollinate audiencias',
        ],
      },
      channelName: 'Javier Jimeno',
      period: { start: startDate, end: endDate },
    };
  },

  // ── Revenue page ───────────────────────────────────────────────
  '/api/youtube/revenue': () => {
    const now = new Date();
    const endDate = new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10);
    const startDate = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    return {
      hasRealRevenue: false,
      revenue28d: 842.50,
      weightedCPM: 3.59,
      totalViews28: 234800,
      totalWatchTime28: 98400,
      countries: [
        { country: 'ES', views: 78400, watchTime: 32800, cpm: 3.0, estimatedRevenue: 235.20 },
        { country: 'MX', views: 42100, watchTime: 17600, cpm: 2.0, estimatedRevenue: 84.20 },
        { country: 'AR', views: 28900, watchTime: 12100, cpm: 1.0, estimatedRevenue: 28.90 },
        { country: 'US', views: 18200, watchTime: 7600, cpm: 7.5, estimatedRevenue: 136.50 },
        { country: 'CO', views: 21400, watchTime: 8900, cpm: 1.5, estimatedRevenue: 32.10 },
        { country: 'GB', views: 6200, watchTime: 2600, cpm: 6.0, estimatedRevenue: 37.20 },
      ],
      videos: DEMO_VIDEOS.map(v => ({
        videoId: v.videoId, title: v.title, views: v.views,
        watchTime: Math.round(v.views * 0.42),
        estimatedRevenue: Math.round(v.views / 1000 * 3.59 * 100) / 100,
        thumbnail: v.thumbnail,
      })),
      months: [
        { month: '2026-02', views: 168000, watchTime: 70500, estimatedRevenue: 603.12 },
        { month: '2026-03', views: 195000, watchTime: 81900, estimatedRevenue: 700.05 },
        { month: '2026-04', views: 218000, watchTime: 91500, estimatedRevenue: 782.62 },
        { month: '2026-05', views: 234800, watchTime: 98400, estimatedRevenue: 842.50 },
      ],
      projection: { daily: 30.09, monthly: 902.68, yearly: 10982.61 },
      aiInsights: {
        optimizationPotential: 'Podrías aumentar un 40-60% tus ingresos atrayendo más audiencia de EEUU y UK donde los CPMs son 2-3x más altos.',
        missedRevenue: '$350-500/mes',
        tips: [
          'Crea contenido bilingüe (ES+EN) para captar audiencia anglófona con CPMs de $6-8',
          'Optimiza los primeros 30 segundos para mejorar retención — cada minuto extra de watch time sube el RPM',
          'Usa end screens y cards para aumentar sesiones de visualización — YouTube premia los canales que retienen a los viewers',
        ],
        cpmStrategy: 'Tu audiencia principal está en países con CPM bajo ($1-3). Crear series en inglés sobre "YouTube growth tips" podría triplicar el RPM sin perder tu audiencia actual.',
      },
      channelName: 'Javier Jimeno',
      period: { start: startDate, end: endDate },
    };
  },

  // ── SEO Score page ─────────────────────────────────────────────
  '/api/youtube/seo-score': () => ({
    scores: DEMO_VIDEOS.map((v, i) => ({
      videoId: v.videoId, title: v.title, thumbnail: v.thumbnail,
      publishedAt: v.publishedAt, views: v.views,
      score: [78, 85, 62, 91, 74][i],
      checklist: [
        { key: 'title_length', label: { es: 'Longitud del título', en: 'Title length' }, passed: v.title.length >= 30 && v.title.length <= 70, detail: { es: `${v.title.length} chars`, en: `${v.title.length} chars` }, weight: 8 },
        { key: 'title_number', label: { es: 'Número en el título', en: 'Number in title' }, passed: /\d/.test(v.title), detail: { es: 'OK', en: 'OK' }, weight: 5 },
        { key: 'desc_length', label: { es: 'Descripción completa', en: 'Full description' }, passed: i !== 2, detail: { es: i === 2 ? 'Muy corta' : '150+ palabras', en: i === 2 ? 'Too short' : '150+ words' }, weight: 10 },
        { key: 'tags_count', label: { es: 'Tags suficientes', en: 'Enough tags' }, passed: i !== 2 && i !== 4, detail: { es: 'OK', en: 'OK' }, weight: 8 },
        { key: 'timestamps', label: { es: 'Timestamps', en: 'Timestamps' }, passed: i < 2, detail: { es: i < 2 ? 'Incluidos' : 'No encontrados', en: i < 2 ? 'Included' : 'Not found' }, weight: 7 },
      ],
      analyzedAt: new Date().toISOString(),
    })),
  }),

  // ── Optimize page ──────────────────────────────────────────────
  '/api/youtube/optimize': () => ({
    videos: DEMO_VIDEOS.map((v, i) => ({
      videoId: v.videoId, title: v.title, thumbnail: v.thumbnail,
      publishedAt: v.publishedAt, views: v.views, likes: v.likes,
      score: [78, 85, 62, 91, 74][i],
    })),
  }),

  // ── Retention page (returns { videos, aiTips, dropOffReasons }) ─
  '/api/youtube/retention': () => {
    const makeRetention = (seed: number, hookPct: number, avgPct: number) => {
      const vals: number[] = [];
      let cur = hookPct;
      for (let i = 0; i < 100; i++) {
        const r = seededRand(i + seed) * 4 - 2;
        const decay = i < 5 ? -0.3 : i < 15 ? -0.8 : -0.35;
        const midDip = i > 40 && i < 55 ? -0.5 : 0;
        cur = Math.max(5, cur + decay + midDip + r);
        vals.push(Math.round(cur));
      }
      return vals;
    };
    const videos = [
      { videoId: 'dQw4w9WgXcQ', title: 'Cómo Monetizar YouTube en 2026 (La Verdad)', views: 84200, duration: 720,
        retention: makeRetention(900, 95, 48), avgRetention: 48, hookScore: 88,
        dropOffPoints: [
          { time: 35, drop: 12, retentionBefore: 88, retentionAfter: 76 },
          { time: 312, drop: 8, retentionBefore: 52, retentionAfter: 44 },
        ] },
      { videoId: '9bZkp7q19f0', title: '10 Errores que MATAN tu Canal de YouTube', views: 127500, duration: 600,
        retention: makeRetention(910, 92, 52), avgRetention: 52, hookScore: 85,
        dropOffPoints: [
          { time: 28, drop: 10, retentionBefore: 85, retentionAfter: 75 },
          { time: 240, drop: 7, retentionBefore: 55, retentionAfter: 48 },
        ] },
      { videoId: 'kJQP7kiw5Fk', title: 'Mi Setup de YouTube por Menos de 500€', views: 63800, duration: 540,
        retention: makeRetention(920, 88, 44), avgRetention: 44, hookScore: 78,
        dropOffPoints: [
          { time: 42, drop: 14, retentionBefore: 82, retentionAfter: 68 },
        ] },
      { videoId: 'RgKAFK5djSk', title: 'El Algoritmo de YouTube Cambió (Qué Hacer)', views: 195000, duration: 840,
        retention: makeRetention(930, 97, 55), avgRetention: 55, hookScore: 92,
        dropOffPoints: [
          { time: 30, drop: 8, retentionBefore: 92, retentionAfter: 84 },
          { time: 420, drop: 9, retentionBefore: 50, retentionAfter: 41 },
        ] },
      { videoId: 'JGwWNGJdvx8', title: 'Keyword Research para YouTube: Guía Completa', views: 41200, duration: 960,
        retention: makeRetention(940, 85, 42), avgRetention: 42, hookScore: 72,
        dropOffPoints: [
          { time: 50, drop: 15, retentionBefore: 78, retentionAfter: 63 },
          { time: 360, drop: 10, retentionBefore: 48, retentionAfter: 38 },
        ] },
    ];
    return {
      videos,
      aiTips: [
        'Acorta tu intro a 10-15 segundos — todos tus vídeos pierden audiencia entre 0:30 y 1:00.',
        'Usa cortes visuales o cambios de plano cada 30-40 segundos en la sección media para evitar la caída del minuto 5.',
        'Tu hook es fuerte (media 83%) — mantén ese estilo directo al tema.',
        'Prueba a añadir un "loop abierto" al inicio: adelanta lo que van a aprender al final del vídeo.',
      ],
      dropOffReasons: {
        dQw4w9WgXcQ: [
          { timestamp: '0:35', reason: 'Intro demasiado larga — el contenido principal empieza después de 30s.' },
          { timestamp: '5:12', reason: 'Sección repetitiva sin nuevos estímulos visuales.' },
        ],
        '9bZkp7q19f0': [
          { timestamp: '0:28', reason: 'Transición del hook al contenido poco fluida.' },
        ],
      },
    };
  },

  // ── Achievements page ──────────────────────────────────────────
  '/api/achievements': () => ({
    achievements: [
      { key: 'first_video', unlockedAt: '2025-10-01T10:00:00Z' },
      { key: 'ten_videos', unlockedAt: '2025-12-15T14:30:00Z' },
      { key: 'hundred_subs', unlockedAt: '2026-01-10T09:00:00Z' },
      { key: 'thousand_subs', unlockedAt: '2026-03-22T16:00:00Z' },
      { key: 'first_optimize', unlockedAt: '2025-10-05T11:00:00Z' },
      { key: 'seo_70', unlockedAt: '2025-11-20T13:00:00Z' },
      { key: 'seo_90', unlockedAt: '2026-02-14T10:30:00Z' },
      { key: 'streak_3', unlockedAt: '2025-10-03T08:00:00Z' },
      { key: 'streak_7', unlockedAt: '2025-10-10T08:00:00Z' },
      { key: 'streak_30', unlockedAt: '2026-01-15T08:00:00Z' },
      { key: 'first_audit', unlockedAt: '2025-10-08T15:00:00Z' },
      { key: 'coach_5', unlockedAt: '2025-10-12T12:00:00Z' },
      { key: 'coach_50', unlockedAt: '2026-04-01T14:00:00Z' },
    ],
    newlyUnlocked: [],
  }),

  // ── Trends page ────────────────────────────────────────────────
  '/api/trends': () => ({
    alerts: [
      { id: 'ta1', topic: 'AI Video Editing', country: 'US', score: 94, read: false, createdAt: new Date().toISOString() },
      { id: 'ta2', topic: 'YouTube Shorts monetización', country: 'ES', score: 88, read: false, createdAt: new Date().toISOString() },
      { id: 'ta3', topic: 'Podcast clips strategy', country: 'US', score: 82, read: true, createdAt: new Date(Date.now() - 86400000).toISOString() },
      { id: 'ta4', topic: 'Faceless channels 2026', country: 'MX', score: 79, read: true, createdAt: new Date(Date.now() - 2 * 86400000).toISOString() },
    ],
    unreadCount: 2,
  }),

  // ── A/B Test page ──────────────────────────────────────────────
  '/api/youtube/ab-test': () => ({
    tests: [
      { id: 'ab1', videoId: 'dQw4w9WgXcQ', titleA: 'Cómo Monetizar YouTube en 2026', titleB: 'La VERDAD sobre Monetizar YouTube (2026)', status: 'completed', winner: 'B', viewsA: 42100, viewsB: 84200, ctrA: 4.2, ctrB: 7.8, startedAt: '2026-05-01T10:00:00Z', endedAt: '2026-05-08T10:00:00Z' },
      { id: 'ab2', videoId: '9bZkp7q19f0', titleA: '10 Errores de YouTubers', titleB: '10 Errores que MATAN tu Canal de YouTube', status: 'completed', winner: 'B', viewsA: 63750, viewsB: 127500, ctrA: 5.1, ctrB: 9.3, startedAt: '2026-04-20T10:00:00Z', endedAt: '2026-04-27T10:00:00Z' },
      { id: 'ab3', videoId: 'kJQP7kiw5Fk', titleA: 'Mi Setup de YouTube Completo', titleB: 'Mi Setup de YouTube por Menos de 500€', status: 'running', winner: null, viewsA: 28400, viewsB: 35400, ctrA: 3.8, ctrB: 5.2, startedAt: '2026-05-10T10:00:00Z', endedAt: null },
    ],
  }),

  // ── Best Time page ─────────────────────────────────────────────
  '/api/youtube/best-time': () => {
    const heatmap: number[][] = [];
    for (let day = 0; day < 7; day++) {
      const row: number[] = [];
      for (let hour = 0; hour < 24; hour++) {
        const peak = (hour >= 17 && hour <= 21) ? 0.8 : (hour >= 12 && hour <= 14) ? 0.5 : 0.2;
        const weekendBoost = (day === 0 || day === 6) ? 0.15 : 0;
        row.push(Math.round((peak + weekendBoost + seededRand(day * 24 + hour + 700) * 0.2) * 100));
      }
      heatmap.push(row);
    }
    return {
      data: {
        heatmap,
        topSlots: [
          { day: 6, hour: 18, score: 98, videoCount: 8 },
          { day: 0, hour: 19, score: 95, videoCount: 6 },
          { day: 3, hour: 17, score: 91, videoCount: 12 },
          { day: 5, hour: 20, score: 89, videoCount: 5 },
          { day: 1, hour: 18, score: 86, videoCount: 9 },
        ],
        videoCount: 87,
        aiTip: {
          es: 'Tu audiencia es más activa los sábados entre las 18:00 y las 21:00 (hora de España). Los miércoles a las 17:00 también muestran buen engagement. Evita publicar antes de las 10:00 entre semana.',
          en: 'Your audience is most active on Saturdays between 6-9 PM (Spain time). Wednesdays at 5 PM also show good engagement. Avoid publishing before 10 AM on weekdays.',
        },
        analyzedAt: new Date().toISOString(),
      },
    };
  },

  // ── Audit page ─────────────────────────────────────────────────
  '/api/youtube/audit': () => {
    const now = new Date();
    const endDate = new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10);
    const startDate = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    return {
      channelName: 'Javier Jimeno',
      subscribers: 18400,
      healthScore: 78,
      categories: [
        { key: 'content', label: { es: 'Contenido', en: 'Content' }, score: 80, maxScore: 100, checks: [
          { key: 'avg_duration', label: { es: 'Duración media óptima (8-20 min)', en: 'Optimal avg duration (8-20 min)' }, passed: true, impact: 25 },
          { key: 'longform', label: { es: 'Videos long-form (10+ min)', en: 'Long-form videos (10+ min)' }, passed: true, impact: 15 },
          { key: 'desc_quality', label: { es: 'Descripciones completas (80+ palabras)', en: 'Complete descriptions (80+ words)' }, passed: true, impact: 25 },
          { key: 'timestamps', label: { es: 'Timestamps en >50% videos', en: 'Timestamps in >50% videos' }, passed: false, impact: 20 },
          { key: 'links', label: { es: 'Enlaces en descripciones', en: 'Links in descriptions' }, passed: true, impact: 15 },
        ]},
        { key: 'seo', label: { es: 'SEO', en: 'SEO' }, score: 85, maxScore: 100, checks: [
          { key: 'avg_seo', label: { es: 'SEO Score promedio ≥ 60', en: 'Average SEO Score ≥ 60' }, passed: true, impact: 30 },
          { key: 'tags_usage', label: { es: '>70% videos con 5+ tags', en: '>70% videos with 5+ tags' }, passed: true, impact: 25 },
          { key: 'hashtags', label: { es: 'Hashtags en >50% videos', en: 'Hashtags in >50% videos' }, passed: true, impact: 15 },
          { key: 'title_length', label: { es: 'Títulos bien dimensionados', en: 'Well-sized titles' }, passed: true, impact: 30 },
        ]},
        { key: 'growth', label: { es: 'Crecimiento', en: 'Growth' }, score: 75, maxScore: 100, checks: [
          { key: 'net_positive', label: { es: 'Crecimiento neto positivo', en: 'Net positive growth' }, passed: true, impact: 30 },
          { key: 'low_churn', label: { es: 'Baja pérdida de suscriptores', en: 'Low subscriber churn' }, passed: true, impact: 25 },
          { key: 'views_trending', label: { es: 'Tendencia de views al alza', en: 'Views trending upward' }, passed: true, impact: 25 },
          { key: 'subs_gained', label: { es: '10+ suscriptores en 28 días', en: '10+ subscribers in 28 days' }, passed: true, impact: 20 },
        ]},
        { key: 'engagement', label: { es: 'Engagement', en: 'Engagement' }, score: 70, maxScore: 100, checks: [
          { key: 'eng_rate', label: { es: 'Engagement rate > 3%', en: 'Engagement rate > 3%' }, passed: true, impact: 30 },
          { key: 'avg_retention', label: { es: 'Retención media > 40%', en: 'Average retention > 40%' }, passed: true, impact: 30 },
          { key: 'share_rate', label: { es: 'Videos compartidos', en: 'Videos shared' }, passed: false, impact: 15 },
          { key: 'cta_usage', label: { es: 'CTAs en >50% descripciones', en: 'CTAs in >50% descriptions' }, passed: false, impact: 25 },
        ]},
        { key: 'consistency', label: { es: 'Consistencia', en: 'Consistency' }, score: 80, maxScore: 100, checks: [
          { key: 'freq_weekly', label: { es: 'Al menos 1 video/semana', en: 'At least 1 video/week' }, passed: true, impact: 35 },
          { key: 'no_long_gaps', label: { es: 'Sin pausas > 14 días', en: 'No gaps > 14 days' }, passed: true, impact: 25 },
          { key: 'regular_schedule', label: { es: 'Calendario regular', en: 'Regular schedule' }, passed: true, impact: 25 },
          { key: 'active_recent', label: { es: 'Video en últimos 7 días', en: 'Video in last 7 days' }, passed: true, impact: 15 },
        ]},
      ],
      quickWins: [
        { label: { es: 'Añade timestamps a tus descripciones', en: 'Add timestamps to descriptions' }, detail: { es: 'Solo el 30% de tus vídeos tienen timestamps. Mejora el CTR en búsqueda un 12%.', en: 'Only 30% of your videos have timestamps. Improves search CTR by 12%.' }, action: { label: { es: 'Optimizar', en: 'Optimize' }, href: '/optimize' }, priority: 'high' as const },
        { label: { es: 'Añade CTAs pidiendo likes y comentarios', en: 'Add CTAs asking for likes and comments' }, detail: { es: 'Menos del 50% de tus vídeos incluyen un CTA claro.', en: 'Less than 50% of your videos include a clear CTA.' }, action: { label: { es: 'Ver Coach AI', en: 'Ask AI Coach' }, href: '/coach' }, priority: 'medium' as const },
        { label: { es: 'Publica en tu mejor horario', en: 'Publish at your best time' }, detail: { es: 'Sábados 18-21h es tu mejor momento.', en: 'Saturdays 6-9 PM is your best window.' }, action: { label: { es: 'Ver Best Time', en: 'See Best Time' }, href: '/best-time' }, priority: 'low' as const },
      ],
      patterns: {
        topVideos: DEMO_VIDEOS.slice(0, 3).map(v => ({ videoId: v.videoId, title: v.title, views: v.views, seoScore: 85 })),
        bottomVideos: DEMO_VIDEOS.slice(3).map(v => ({ videoId: v.videoId, title: v.title, views: v.views, seoScore: 62 })),
        patterns: [
          { es: 'Tus TOP videos tienen SEO Score 85 vs 62 de los peores. El SEO importa.', en: 'Your TOP videos have SEO Score 85 vs 62 for bottom ones. SEO matters.' },
          { es: 'Tus TOP videos tienen títulos más largos (52 vs 38 chars).', en: 'Your TOP videos have longer titles (52 vs 38 chars).' },
          { es: '80% de tus TOP videos usan números en el título vs 20% de los peores.', en: '80% of your TOP videos use numbers in titles vs 20% of bottom ones.' },
        ],
      },
      aiSummary: {
        es: 'Tu canal tiene una salud sólida (78/100). El SEO y la consistencia son tus puntos fuertes. Las áreas de mejora principales son:\n\n1. Timestamps: solo el 30% de tus vídeos los incluyen. Añadirlos mejora el CTR en búsqueda.\n2. CTAs: menos de la mitad de tus vídeos piden likes/comentarios explícitamente.\n3. Shares: tu ratio de compartidos es bajo. Crea momentos "compartibles" en tus vídeos.',
        en: 'Your channel has solid health (78/100). SEO and consistency are your strengths. Main areas for improvement:\n\n1. Timestamps: only 30% of your videos include them. Adding them improves search CTR.\n2. CTAs: less than half your videos explicitly ask for likes/comments.\n3. Shares: your share rate is low. Create "shareable" moments in your videos.',
      },
      videosAnalyzed: 30,
      period: { start: startDate, end: endDate },
    };
  },

  // ── Calendar page ──────────────────────────────────────────────
  '/api/calendar': () => {
    const entries = [];
    const now = new Date();
    const titles = [
      'Setup Minimalista con IA', 'Errores de Edición', 'Monetización sin 1K subs',
      'Shorts vs Long-form', 'SEO para principiantes', 'Cómo crecer en 2026',
      'Mi rutina de YouTuber', 'Herramientas gratis', 'Algoritmo explicado',
    ];
    for (let i = -3; i < 12; i++) {
      const d = new Date(now); d.setDate(d.getDate() + i * 3);
      entries.push({
        id: `cal${i + 4}`, date: d.toISOString().slice(0, 10),
        title: titles[(i + 3) % titles.length],
        status: i < 0 ? 'published' : i === 0 ? 'filming' : 'planned',
        notes: '',
      });
    }
    return { entries };
  },
};

export function getDemoResponse(req: NextRequest): NextResponse | null {
  if (!isDemoMode(req)) return null;

  const pathname = new URL(req.url).pathname;
  const handler = DEMO_ROUTES[pathname];
  if (!handler) return null;

  const data = handler(req);
  if (!data) return null;

  return NextResponse.json(data);
}
