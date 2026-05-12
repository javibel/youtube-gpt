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

function generateSnapshots(days: number) {
  const pts = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const seed = (days - i) * 17 % 100;
    pts.push({
      subscribers: 15800 + (days - i) * 85 + seed,
      totalViews: 1900000 + (days - i) * 14600 + seed * 100,
      videoCount: 82 + Math.floor((days - i) / 7),
      recordedAt: d.toISOString(),
    });
  }
  return pts;
}

const DEMO_ROUTES: Record<string, (req: NextRequest) => object | null> = {
  '/api/user/stats': () => ({
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
  }),

  '/api/youtube/channel': () => {
    const snapshots = generateSnapshots(90);
    const latest = snapshots[snapshots.length - 1];
    return {
      connected: true,
      channel: {
        id: 'UC_demo_channel',
        name: 'Javier Jimeno',
        thumbnail: 'https://yt3.ggpht.com/a/default-user=s88-c-k-c0x00ffffff-no-rj',
        subscribers: latest.subscribers,
        totalViews: latest.totalViews,
        videoCount: latest.videoCount,
      },
      videos: [
        { videoId: 'dQw4w9WgXcQ', title: 'Cómo Monetizar YouTube en 2026 (La Verdad)', views: 84200, likes: 3600, publishedAt: '2026-05-08T14:00:00Z', thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg' },
        { videoId: '9bZkp7q19f0', title: '10 Errores que MATAN tu Canal de YouTube', views: 127500, likes: 5400, publishedAt: '2026-05-01T10:00:00Z', thumbnail: 'https://i.ytimg.com/vi/9bZkp7q19f0/mqdefault.jpg' },
        { videoId: 'kJQP7kiw5Fk', title: 'Mi Setup de YouTube por Menos de 500€', views: 63800, likes: 2800, publishedAt: '2026-04-24T12:00:00Z', thumbnail: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/mqdefault.jpg' },
        { videoId: 'RgKAFK5djSk', title: 'El Algoritmo de YouTube Cambió (Qué Hacer)', views: 195000, likes: 8200, publishedAt: '2026-04-17T10:00:00Z', thumbnail: 'https://i.ytimg.com/vi/RgKAFK5djSk/mqdefault.jpg' },
        { videoId: 'JGwWNGJdvx8', title: 'Keyword Research para YouTube: Guía Completa', views: 41200, likes: 1900, publishedAt: '2026-04-10T10:00:00Z', thumbnail: 'https://i.ytimg.com/vi/JGwWNGJdvx8/mqdefault.jpg' },
      ],
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
    const daily = [];
    for (let i = 89; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const seed = (90 - i) * 13 % 100;
      daily.push({
        day: d.toISOString().slice(0, 10),
        views: 5000 + (90 - i) * 60 + seed * 20,
        estimatedMinutesWatched: 2100 + (90 - i) * 25 + seed * 8,
        subscribersGained: 60 + Math.round(seed * 0.8) + (90 - i),
        subscribersLost: 5 + Math.round(seed * 0.1),
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
        { video: 'v4', title: 'El Algoritmo de YouTube Cambió (Qué Hacer)', views: 195000, estimatedMinutesWatched: 48200, averageViewDuration: 384, likes: 8200, subscribersGained: 1240 },
        { video: 'v2', title: '10 Errores que MATAN tu Canal de YouTube', views: 127500, estimatedMinutesWatched: 31800, averageViewDuration: 298, likes: 5400, subscribersGained: 820 },
        { video: 'v1', title: 'Cómo Monetizar YouTube en 2026 (La Verdad)', views: 84200, estimatedMinutesWatched: 21050, averageViewDuration: 312, likes: 3600, subscribersGained: 480 },
        { video: 'v3', title: 'Mi Setup de YouTube por Menos de 500€', views: 63800, estimatedMinutesWatched: 15900, averageViewDuration: 276, likes: 2800, subscribersGained: 340 },
        { video: 'v5', title: 'Keyword Research para YouTube: Guía Completa', views: 41200, estimatedMinutesWatched: 14400, averageViewDuration: 420, likes: 1900, subscribersGained: 260 },
      ],
      daily,
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
      { id: 'ta5', topic: 'MrBeast production secrets', country: 'US', score: 76, read: true, createdAt: new Date(Date.now() - 3 * 86400000).toISOString() },
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
        row.push(Math.round((peak + weekendBoost + (day * 3 + hour * 7) % 10 / 50) * 100));
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
  '/api/youtube/audit': () => ({
    audit: {
      overallScore: 78,
      categories: [
        { key: 'titles', label: { es: 'Títulos', en: 'Titles' }, score: 82, maxScore: 100, checks: [
          { key: 'title_length', label: { es: 'Longitud óptima (30-70 chars)', en: 'Optimal length (30-70 chars)' }, passed: true, impact: 8 },
          { key: 'title_numbers', label: { es: 'Incluye números', en: 'Includes numbers' }, passed: true, impact: 5 },
          { key: 'title_power_words', label: { es: 'Palabras clave de impacto', en: 'Power words' }, passed: true, impact: 4 },
        ]},
        { key: 'descriptions', label: { es: 'Descripciones', en: 'Descriptions' }, score: 65, maxScore: 100, checks: [
          { key: 'desc_length', label: { es: '100+ palabras', en: '100+ words' }, passed: true, impact: 10 },
          { key: 'desc_links', label: { es: 'Incluye enlaces', en: 'Includes links' }, passed: true, impact: 5 },
          { key: 'desc_timestamps', label: { es: 'Timestamps', en: 'Timestamps' }, passed: false, impact: 7 },
          { key: 'desc_cta', label: { es: 'Call to action', en: 'Call to action' }, passed: true, impact: 3 },
        ]},
        { key: 'tags', label: { es: 'Tags', en: 'Tags' }, score: 74, maxScore: 100, checks: [
          { key: 'tag_count', label: { es: '5-20 tags', en: '5-20 tags' }, passed: true, impact: 8 },
          { key: 'tag_long', label: { es: 'Tags de cola larga', en: 'Long-tail tags' }, passed: true, impact: 4 },
          { key: 'tag_short', label: { es: 'Tags de 1 palabra', en: 'Single word tags' }, passed: false, impact: 3 },
        ]},
        { key: 'engagement', label: { es: 'Engagement', en: 'Engagement' }, score: 88, maxScore: 100, checks: [
          { key: 'like_ratio', label: { es: 'Ratio likes > 4%', en: 'Like ratio > 4%' }, passed: true, impact: 10 },
          { key: 'comment_rate', label: { es: 'Ratio comentarios > 0.5%', en: 'Comment rate > 0.5%' }, passed: true, impact: 8 },
        ]},
      ],
      videoCount: 87,
      analyzedAt: new Date().toISOString(),
      aiAnalysis: {
        es: 'Tu canal tiene un rendimiento sólido con títulos bien optimizados y buen engagement. Las áreas de mejora principales son: añadir timestamps a las descripciones (mejora el CTR en búsqueda un 12%) y diversificar los tags con más variaciones de 1 palabra para captar búsquedas genéricas.',
        en: 'Your channel has solid performance with well-optimized titles and good engagement. Main areas for improvement: add timestamps to descriptions (improves search CTR by 12%) and diversify tags with more single-word variations to capture generic searches.',
      },
    },
  }),

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
        id: `cal${i + 4}`,
        date: d.toISOString().slice(0, 10),
        title: titles[(i + 3) % titles.length],
        status: i < 0 ? 'published' : i === 0 ? 'filming' : 'planned',
        notes: '',
      });
    }
    return { entries };
  },
};

/**
 * Check if the request is in demo mode and return fake data if available.
 * Returns null if not in demo mode or no fake data for this route.
 */
export function getDemoResponse(req: NextRequest): NextResponse | null {
  if (!isDemoMode(req)) return null;

  const pathname = new URL(req.url).pathname;
  const handler = DEMO_ROUTES[pathname];
  if (!handler) return null;

  const data = handler(req);
  if (!data) return null;

  return NextResponse.json(data);
}
