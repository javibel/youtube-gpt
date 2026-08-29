import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Analiticas del sitio para el dashboard interno.
//
// 30/08/2026: antes esto contaba TODO en bruto — bots, el servidor de desarrollo
// (que usa la misma BD), los smoke tests y la propia navegacion de Javier iban al
// mismo saco que los usuarios reales, y no habia ningun parametro para separarlos.
// Ahora el trafico propio viene marcado desde /api/track (columna `internal`) y se
// excluye por defecto, ademas de poder segmentar por anonimos/registrados y filtrar
// por ruta o pais. Tambien se cuentan VISITANTES unicos (cookie ytv_sid), no solo
// paginas vistas, que era la cifra que mas enganaba con tan poco trafico.

type Row = Record<string, unknown>;

export async function GET(req: NextRequest) {
  const token = req.headers.get('x-dashboard-token') || req.nextUrl.searchParams.get('token');
  if (!token || token !== process.env.DASHBOARD_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const days = Math.min(365, Math.max(1, parseInt(sp.get('days') || '7', 10) || 7));
  const includeInternal = sp.get('includeInternal') === '1';
  const segment = sp.get('segment') || 'all';         // all | anon | users
  const pathFilter = (sp.get('path') || '').trim();
  const country = (sp.get('country') || '').trim();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // WHERE compartido por todas las consultas. Parametrizado siempre: `path` y
  // `country` vienen del usuario del dashboard.
  const conds: string[] = ['created_at >= $1'];
  const params: unknown[] = [since];
  if (!includeInternal) conds.push('internal = false');
  if (segment === 'anon') conds.push('user_id IS NULL');
  if (segment === 'users') conds.push('user_id IS NOT NULL');
  if (pathFilter) { params.push(`%${pathFilter}%`); conds.push(`path ILIKE $${params.length}`); }
  if (country) { params.push(country.toUpperCase()); conds.push(`country = $${params.length}`); }
  const WHERE = conds.join(' AND ');

  const q = <T = Row>(sql: string) => prisma.$queryRawUnsafe<T[]>(sql, ...params);
  const n = (v: unknown) => Number(v ?? 0);

  const [totals, byPath, byDay, referrers, countries, internalCount] = await Promise.all([
    q(`SELECT COUNT(*)::bigint AS views,
              COUNT(DISTINCT session_id)::bigint AS visitors,
              COUNT(DISTINCT user_id)::bigint AS users,
              COUNT(DISTINCT path)::bigint AS pages
         FROM page_views WHERE ${WHERE}`),

    q(`SELECT path, COUNT(*)::bigint AS views, COUNT(DISTINCT session_id)::bigint AS visitors
         FROM page_views WHERE ${WHERE}
        GROUP BY path ORDER BY views DESC LIMIT 20`),

    q(`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
              COUNT(*)::bigint AS views, COUNT(DISTINCT session_id)::bigint AS visitors
         FROM page_views WHERE ${WHERE}
        GROUP BY 1 ORDER BY 1`),

    // Agrupado por HOSTNAME, no por URL completa: antes cada URL distinta del mismo
    // sitio contaba aparte y el top de referrers era inservible.
    q(`SELECT COALESCE(substring(referrer from '^https?://([^/]+)'), '(directo)') AS source,
              COUNT(*)::bigint AS views
         FROM page_views WHERE ${WHERE}
          AND (referrer IS NULL OR referrer NOT ILIKE '%ytubviral.com%')
        GROUP BY 1 ORDER BY views DESC LIMIT 12`),

    q(`SELECT country, COUNT(*)::bigint AS views FROM page_views
        WHERE ${WHERE} AND country IS NOT NULL
        GROUP BY country ORDER BY views DESC LIMIT 12`),

    // Cuanto se esta excluyendo, para que el numero no parezca que "falta".
    prisma.pageView.count({ where: { createdAt: { gte: since }, internal: true } }),
  ]);

  const t = totals[0] || {};
  const views = n(t.views);

  return NextResponse.json({
    period: { days, since: since.toISOString() },
    filters: { includeInternal, segment, path: pathFilter || null, country: country || null },
    totalViews: views,
    uniqueVisitors: n(t.visitors),
    loggedInUsers: n(t.users),
    uniquePages: n(t.pages),
    avgPerDay: Math.round((views / days) * 10) / 10,
    viewsPerVisitor: n(t.visitors) ? Math.round((views / n(t.visitors)) * 10) / 10 : 0,
    internalExcluded: includeInternal ? 0 : internalCount,
    viewsByPath: byPath.map(r => ({ path: r.path as string, views: n(r.views), visitors: n(r.visitors) })),
    viewsByDay: byDay.map(r => ({ day: r.day as string, views: n(r.views), visitors: n(r.visitors) })),
    topReferrers: referrers.map(r => ({ source: r.source as string, views: n(r.views) })),
    topCountries: countries.map(r => ({ country: r.country as string, views: n(r.views) })),
  });
}
