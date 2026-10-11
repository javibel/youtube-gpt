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
  score?: number;
}

interface Ctx {
  userId: string;
  isPaid: boolean;
  check: () => void;
  read: <T>(query: () => PromiseLike<T>, copy?: boolean) => Promise<T>;
}

type Rule = { id: string; check: (ctx: Ctx) => Promise<NextAction | null> };

const DAY = 86400_000;
function countValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw Error('Actions unavailable');
  return value;
}
function videoCount(value: unknown): number {
  return countValue(Number(value ?? 0));
}

// Only an acknowledged, valid empty playlist establishes absence of uploads.
async function getRecentUploads(ctx: Ctx, channelId: string): Promise<{ videoId: string; publishedAt: string }[]> {
  if (!/^UC[A-Za-z0-9_-]{22}$/.test(channelId)) throw Error('Actions unavailable');
  const token = await ctx.read(() => getAccessToken(ctx.userId, ctx.check, { checkRefreshStep: ctx.check }));
  if (!token) throw Error('Actions unavailable');
  const uploadsPlaylistId = 'UU' + channelId.slice(2);
  const res = await ctx.read(() => fetch(
    'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=' + uploadsPlaylistId + '&maxResults=5',
    { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' },
  ), false);
  if (!res.ok) throw Error('Actions unavailable');
  const data = await ctx.read(() => res.json());
  if (!data || !Array.isArray(data.items) || data.items.length > 5) throw Error('Actions unavailable');
  const ids = new Set<string>();
  return data.items.map((item: { snippet?: { resourceId?: { videoId?: unknown }; publishedAt?: unknown } }) => {
    const videoId = item?.snippet?.resourceId?.videoId, publishedAt = item?.snippet?.publishedAt;
    if (typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(videoId) || ids.has(videoId)
      || typeof publishedAt !== 'string' || !Number.isFinite(Date.parse(publishedAt)))
      throw Error('Actions unavailable');
    ids.add(videoId);
    return { videoId, publishedAt };
  });
}

const RULES: Rule[] = [
  {
    id: 'connect_channel',
    check: async (ctx) => {
      const yt = await ctx.read(() => prisma.youtubeToken.findUnique({ where: { userId: ctx.userId }, select: { channelId: true } }));
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
      const count = await ctx.read(() => prisma.generation.count({ where: { userId: ctx.userId } }));
      if (countValue(count) > 0) return null;
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
      const yt = await ctx.read(() => prisma.youtubeToken.findUnique({ where: { userId: ctx.userId }, select: { channelId: true } }));
      if (!yt?.channelId) return null;
      const uploads = await getRecentUploads(ctx, yt.channelId);
      const recent = uploads.filter(v => { const age = Date.now() - Date.parse(v.publishedAt); return age >= 0 && age < 7 * DAY; });
      if (!recent.length) return null;
      const scored = await ctx.read(() => prisma.videoSeoScore.findMany({
        where: { userId: ctx.userId, videoId: { in: recent.map(v => v.videoId) } },
        select: { videoId: true },
      }));
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
      const last = await ctx.read(() => prisma.videoSeoScore.findFirst({
        where: { userId: ctx.userId },
        orderBy: { analyzedAt: 'desc' },
        select: { videoId: true, score: true },
      }));
      if (!last) return null;
      if (!/^[A-Za-z0-9_-]{11}$/.test(last.videoId) || !Number.isInteger(last.score) || last.score < 0 || last.score > 100) throw Error('Actions unavailable');
      if (last.score >= 60) return null;
      return {
        id: 'optimize_low_score',
        title: { es: 'Optimiza tu último vídeo', en: 'Optimize your last video' },
        reason: { es: `Tu último vídeo puntúa ${last.score}/100`, en: `Your last video scores ${last.score}/100` },
        cta: { es: 'Optimizarlo', en: 'Optimize it' },
        href: `/optimize?video=${last.videoId}`,
        score: last.score,
      };
    },
  },
  {
    id: 'track_competitors',
    check: async (ctx) => {
      const yt = await ctx.read(() => prisma.youtubeToken.findUnique({ where: { userId: ctx.userId }, select: { channelId: true } }));
      if (!yt?.channelId) return null;
      const count = await ctx.read(() => prisma.trackedCompetitor.count({ where: { userId: ctx.userId } }));
      if (countValue(count) > 0) return null;
      return {
        id: 'track_competitors',
        title: { es: 'Añade tu primer competidor', en: 'Add your first competitor' },
        reason: { es: 'Aún no sigues a ningún canal para comparar tu rendimiento', en: "You're not tracking any channel to compare performance yet" },
        cta: { es: 'Añadir competidor', en: 'Add competitor' },
        href: '/competitors/tracking',
      };
    },
  },
  {
    id: 'best_time_stale',
    check: async (ctx) => {
      // /best-time calcula sobre los vídeos del propio canal — sin canal conectado
      // (o con 0 vídeos) la sugerencia sería un callejón sin salida.
      const yt = await ctx.read(() => prisma.youtubeToken.findUnique({ where: { userId: ctx.userId }, select: { channelId: true, videoCount: true } }));
      if (!yt?.channelId || videoCount(yt.videoCount) === 0) return null;
      const bt = await ctx.read(() => prisma.bestTimeAnalysis.findUnique({ where: { userId: ctx.userId }, select: { analyzedAt: true } }));
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
      const alert = await ctx.read(() => prisma.trendAlert.findFirst({
        where: { userId: ctx.userId, read: false },
        orderBy: { createdAt: 'desc' },
        select: { title: true },
      }));
      if (!alert) return null;
      if (typeof alert.title !== 'string') throw Error('Actions unavailable');
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
      const count = await ctx.read(() => prisma.calendarEntry.count({
        where: { userId: ctx.userId, date: { gte: todayStr, lte: weekAheadStr } },
      }));
      if (countValue(count) > 0) return null;
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
      const yt = await ctx.read(() => prisma.youtubeToken.findUnique({ where: { userId: ctx.userId }, select: { videoCount: true } }));
      if (!yt || videoCount(yt.videoCount) < 3) return null;
      const active = await ctx.read(() => prisma.abTest.count({ where: { userId: ctx.userId, status: { in: ['variant_a', 'variant_b'] } } }));
      if (countValue(active) > 0) return null;
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
      const idea = await ctx.read(() => prisma.dailyIdea.findUnique({ where: { userId_date: { userId: ctx.userId, date: today } }, select: { ideas: true } }));
      if (idea && !Array.isArray(idea.ideas)) throw Error('Actions unavailable');
      const first = Array.isArray(idea?.ideas)
        ? (idea!.ideas as { title_es?: string; title_en?: string }[])[0]
        : null;
      if (first != null && (typeof first !== 'object' || Array.isArray(first))) throw Error('Actions unavailable');
      if (first?.title_es != null && typeof first.title_es !== 'string' || first?.title_en != null && typeof first.title_en !== 'string') throw Error('Actions unavailable');
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

// Evalúa TODAS las reglas y devuelve las que disparan, en orden de prioridad.
// Antes había early-exit en la primera que acertaba, pero el widget necesita la
// lista completa para poder navegar entre sugerencias: con una sola, descartarla
// por error la perdía hasta el día siguiente (feedback Javier 26/08/2026).
// Se evalúan en paralelo, así que la latencia es la de la regla más lenta, no la
// suma. Solo score_recent_video toca la API de YouTube (playlistItems.list, 1
// unidad) y ya se pagaba en la mayoría de cargas del dashboard.
export async function getNextActions(userId: string, isPaid: boolean, check: () => void = () => {}): Promise<NextAction[]> {
  // Capture each SQL/JSON observation as it resolves. Another pending rule must
  // not leave a mutable row or nested idea attached to the eventual response.
  const snapshot = <T>(value: T): T => {
    if (Object.prototype.toString.call(value) === '[object Date]')
      return new Date((value as unknown as Date).getTime()) as T;
    if (Array.isArray(value)) return value.map(v => snapshot(v)) as T;
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, snapshot(v)])) as T;
    return value;
  };
  const ctx: Ctx = {
    userId, isPaid, check,
    async read<T>(query: () => PromiseLike<T>, copy = true): Promise<T> {
      check();
      const value = await query();
      check();
      return copy ? snapshot(value) : value;
    },
  };
  check();
  // A failed rule means coverage is unknown. Never manufacture a null rule
  // or a complete empty catalog from a failed SQL, token, HTTP or body read.
  const results = await Promise.all(RULES.map(async rule => {
    check();
    const action = await rule.check(ctx);
    check();
    return action;
  }));
  check();
  return results.filter((a): a is NextAction => a !== null);
}
