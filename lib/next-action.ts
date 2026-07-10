// Motor del widget "Siguiente acción" — ver docs/siguiente-accion-especificacion-2026-07-09.md.
// v1 sin IA: catálogo de reglas deterministas evaluadas en orden, sobre señales que
// ya existen en BD. La primera regla que dispara (y no está en `skip`) gana.
import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';

export interface NextAction {
  id: string;
  title: { es: string; en: string };
  reason: { es: string; en: string };
  cta: { es: string; en: string };
  href: string;
}

interface Ctx {
  userId: string;
  isPaid: boolean;
}

type Rule = { id: string; check: (ctx: Ctx) => Promise<NextAction | null> };

const DAY = 86400_000;

// Uploads del canal SIN search.list (100 unidades) — playlistItems.list (1 unidad)
// contra la playlist de uploads (UU + channelId sin el prefijo UC). Nunca lanza:
// cualquier fallo (token caducado, canal sin vídeos, API caída) devuelve [].
async function getRecentUploads(userId: string, channelId: string): Promise<{ videoId: string; publishedAt: string }[]> {
  try {
    const token = await getAccessToken(userId);
    if (!token || !channelId.startsWith('UC')) return [];
    const uploadsPlaylistId = `UU${channelId.slice(2)}`;
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=5`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || [])
      .map((it: { snippet?: { resourceId?: { videoId?: string }; publishedAt?: string } }) => ({
        videoId: it.snippet?.resourceId?.videoId || '',
        publishedAt: it.snippet?.publishedAt || '',
      }))
      .filter((v: { videoId: string }) => v.videoId);
  } catch {
    return [];
  }
}

const RULES: Rule[] = [
  {
    id: 'connect_channel',
    check: async (ctx) => {
      const yt = await prisma.youtubeToken.findUnique({ where: { userId: ctx.userId }, select: { channelId: true } });
      if (yt?.channelId) return null;
      return {
        id: 'connect_channel',
        title: { es: 'Conecta tu canal', en: 'Connect your channel' },
        reason: { es: 'Desbloquea datos reales de tu canal en toda la app', en: 'Unlocks real channel data across the app' },
        cta: { es: 'Conectar canal', en: 'Connect channel' },
        href: '/profile',
      };
    },
  },
  {
    id: 'first_generation',
    check: async (ctx) => {
      const count = await prisma.generation.count({ where: { userId: ctx.userId } });
      if (count > 0) return null;
      return {
        id: 'first_generation',
        title: { es: 'Genera tu primer título', en: 'Generate your first title' },
        reason: { es: 'Aún no has generado nada — empieza en menos de un minuto', en: "You haven't generated anything yet — takes under a minute" },
        cta: { es: 'Generar ahora', en: 'Generate now' },
        href: '/generate',
      };
    },
  },
  {
    id: 'score_recent_video',
    check: async (ctx) => {
      const yt = await prisma.youtubeToken.findUnique({ where: { userId: ctx.userId }, select: { channelId: true } });
      if (!yt?.channelId) return null;
      const uploads = await getRecentUploads(ctx.userId, yt.channelId);
      const recent = uploads.filter(v => Date.now() - new Date(v.publishedAt).getTime() < 7 * DAY);
      if (!recent.length) return null;
      const scored = await prisma.videoSeoScore.findMany({
        where: { userId: ctx.userId, videoId: { in: recent.map(v => v.videoId) } },
        select: { videoId: true },
      });
      const scoredIds = new Set(scored.map(s => s.videoId));
      const unscored = recent.find(v => !scoredIds.has(v.videoId));
      if (!unscored) return null;
      return {
        id: 'score_recent_video',
        title: { es: 'Puntúa tu último vídeo', en: 'Score your latest video' },
        reason: { es: 'Publicaste hace poco y aún no tiene SEO Score', en: "You published recently and it doesn't have a SEO Score yet" },
        cta: { es: 'Puntuar', en: 'Score it' },
        href: `/seo-score?video=${unscored.videoId}`,
      };
    },
  },
  {
    id: 'optimize_low_score',
    check: async (ctx) => {
      const last = await prisma.videoSeoScore.findFirst({
        where: { userId: ctx.userId },
        orderBy: { analyzedAt: 'desc' },
        select: { videoId: true, score: true },
      });
      if (!last || last.score >= 60) return null;
      return {
        id: 'optimize_low_score',
        title: { es: 'Optimiza tu último vídeo', en: 'Optimize your last video' },
        reason: { es: `Tu último vídeo puntúa ${last.score}/100`, en: `Your last video scores ${last.score}/100` },
        cta: { es: 'Optimizarlo', en: 'Optimize it' },
        href: `/optimize?video=${last.videoId}`,
      };
    },
  },
  {
    id: 'track_competitors',
    check: async (ctx) => {
      const yt = await prisma.youtubeToken.findUnique({ where: { userId: ctx.userId }, select: { channelId: true } });
      if (!yt?.channelId) return null;
      const count = await prisma.trackedCompetitor.count({ where: { userId: ctx.userId } });
      if (count > 0) return null;
      return {
        id: 'track_competitors',
        title: { es: 'Añade tu primer competidor', en: 'Add your first competitor' },
        reason: { es: 'Aún no sigues a ningún canal para comparar tu rendimiento', en: "You're not tracking any channel to compare performance yet" },
        cta: { es: 'Añadir competidor', en: 'Add competitor' },
        href: '/competitors',
      };
    },
  },
  {
    id: 'best_time_stale',
    check: async (ctx) => {
      // /best-time calcula sobre los vídeos del propio canal — sin canal conectado
      // (o con 0 vídeos) la sugerencia sería un callejón sin salida.
      const yt = await prisma.youtubeToken.findUnique({ where: { userId: ctx.userId }, select: { channelId: true, videoCount: true } });
      if (!yt?.channelId || Number(yt.videoCount || 0) === 0) return null;
      const bt = await prisma.bestTimeAnalysis.findUnique({ where: { userId: ctx.userId }, select: { analyzedAt: true } });
      if (bt && Date.now() - bt.analyzedAt.getTime() < 30 * DAY) return null;
      return {
        id: 'best_time_stale',
        title: { es: 'Calcula tu mejor hora de publicación', en: 'Calculate your best time to post' },
        reason: bt
          ? { es: 'Tu último análisis tiene más de 30 días', en: 'Your last analysis is over 30 days old' }
          : { es: 'Aún no has calculado tu mejor hora de publicar', en: "You haven't calculated your best posting time yet" },
        cta: { es: 'Calcular', en: 'Calculate' },
        href: '/best-time',
      };
    },
  },
  {
    id: 'trend_alert_unseen',
    check: async (ctx) => {
      const alert = await prisma.trendAlert.findFirst({
        where: { userId: ctx.userId, read: false },
        orderBy: { createdAt: 'desc' },
        select: { title: true },
      });
      if (!alert) return null;
      return {
        id: 'trend_alert_unseen',
        title: { es: 'Revisa una tendencia detectada', en: 'Check a detected trend' },
        reason: { es: `Hemos detectado: "${alert.title}"`, en: `We detected: "${alert.title}"` },
        cta: { es: 'Ver tendencia', en: 'See trend' },
        href: '/trends',
      };
    },
  },
  {
    id: 'plan_week',
    check: async (ctx) => {
      const todayStr = new Date().toISOString().slice(0, 10);
      const weekAheadStr = new Date(Date.now() + 7 * DAY).toISOString().slice(0, 10);
      const count = await prisma.calendarEntry.count({
        where: { userId: ctx.userId, date: { gte: todayStr, lte: weekAheadStr } },
      });
      if (count > 0) return null;
      return {
        id: 'plan_week',
        title: { es: 'Planifica tu semana', en: 'Plan your week' },
        reason: { es: 'No tienes nada en el calendario para los próximos 7 días', en: 'Nothing on your calendar for the next 7 days' },
        cta: { es: 'Planificar', en: 'Plan' },
        href: '/calendar',
      };
    },
  },
  {
    id: 'start_ab_test',
    check: async (ctx) => {
      if (!ctx.isPaid) return null; // única regla de pago — nunca la primera cosa que ve un Free
      const yt = await prisma.youtubeToken.findUnique({ where: { userId: ctx.userId }, select: { videoCount: true } });
      if (!yt || Number(yt.videoCount || 0) < 3) return null;
      const active = await prisma.abTest.count({ where: { userId: ctx.userId, status: { in: ['variant_a', 'variant_b'] } } });
      if (active > 0) return null;
      return {
        id: 'start_ab_test',
        title: { es: 'Prueba un A/B test de título', en: 'Try an A/B test' },
        reason: { es: 'Tu canal ya tiene vídeos suficientes para comparar títulos con datos reales', en: 'Your channel has enough videos to compare titles with real data' },
        cta: { es: 'Crear A/B test', en: 'Create A/B test' },
        href: '/ab-test',
      };
    },
  },
  {
    id: 'daily_idea',
    check: async (ctx) => {
      const today = new Date().toISOString().slice(0, 10);
      const idea = await prisma.dailyIdea.findUnique({ where: { userId_date: { userId: ctx.userId, date: today } }, select: { ideas: true } });
      const first = Array.isArray(idea?.ideas)
        ? (idea!.ideas as { title_es?: string; title_en?: string }[])[0]
        : null;
      const titleEs = first?.title_es;
      const titleEn = first?.title_en;
      if (!titleEs && !titleEn) return null;
      const topicForHref = titleEs || titleEn || '';
      return {
        id: 'daily_idea',
        title: { es: 'Desarrolla la idea de hoy', en: "Develop today's idea" },
        reason: { es: `Idea del día: "${titleEs || titleEn}"`, en: `Today's idea: "${titleEn || titleEs}"` },
        cta: { es: 'Desarrollar', en: 'Develop it' },
        href: `/generate?topic=${encodeURIComponent(topicForHref)}`,
      };
    },
  },
];

export async function getNextAction(userId: string, isPaid: boolean, skipIds: string[]): Promise<NextAction | null> {
  const ctx: Ctx = { userId, isPaid };
  const skip = new Set(skipIds);
  for (const rule of RULES) {
    // El skip se comprueba ANTES de ejecutar la regla — una regla descartada no
    // debe costar nada (score_recent_video llama a la API de YouTube; evaluarla
    // para tirar el resultado sería pagar cuota en cada carga del dashboard).
    if (skip.has(rule.id)) continue;
    let action: NextAction | null;
    try {
      action = await rule.check(ctx);
    } catch (e) {
      console.error(`[next-action] regla "${rule.id}" falló, se salta:`, (e as Error).message);
      continue;
    }
    if (action) return action;
  }
  return null;
}
