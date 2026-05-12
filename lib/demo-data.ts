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
