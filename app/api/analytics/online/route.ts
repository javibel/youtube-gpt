import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Quien esta navegando ahora mismo.
//
// 30/08/2026: no existia nada parecido — solo se podian ver totales agregados por
// dia, asi que era imposible saber si habia alguien en la web en este momento ni
// que estaba mirando. Una "sesion" es la cookie anonima ytv_sid que pone
// /api/track; se considera activa si ha registrado alguna vista en los ultimos
// `minutes` minutos (5 por defecto, que es lo que suele durar una pagina abierta).
//
// El trafico propio (dev, bots, cuentas internas) se excluye salvo que se pida:
// con este volumen, un smoke test disparandose haria parecer que hay gente.

type Row = {
  session_id: string | null;
  last_path: string;
  last_seen: Date;
  first_seen: Date;
  hits: bigint;
  country: string | null;
  email: string | null;
  name: string | null;
};

export async function GET(req: NextRequest) {
  const token = req.headers.get('x-dashboard-token') || req.nextUrl.searchParams.get('token');
  if (!token || token !== process.env.DASHBOARD_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const minutes = Math.min(180, Math.max(1, parseInt(sp.get('minutes') || '5', 10) || 5));
  const includeInternal = sp.get('includeInternal') === '1';
  const since = new Date(Date.now() - minutes * 60 * 1000);

  // DISTINCT ON por sesion: nos quedamos con su ultima vista, que es donde esta
  // ahora. Los agregados (hits, inicio) se calculan aparte y se unen.
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `WITH activas AS (
       SELECT session_id,
              MIN(created_at) AS first_seen,
              MAX(created_at) AS last_seen,
              COUNT(*)::bigint AS hits
         FROM page_views
        WHERE created_at >= $1 AND session_id IS NOT NULL
          ${includeInternal ? '' : 'AND internal = false'}
        GROUP BY session_id
     ),
     ultima AS (
       SELECT DISTINCT ON (pv.session_id)
              pv.session_id, pv.path AS last_path, pv.country, pv.user_id
         FROM page_views pv
         JOIN activas a ON a.session_id = pv.session_id
        WHERE pv.created_at >= $1
        ORDER BY pv.session_id, pv.created_at DESC
     )
     SELECT u.session_id, u.last_path, u.country,
            a.last_seen, a.first_seen, a.hits,
            usr.email, usr.name
       FROM ultima u
       JOIN activas a ON a.session_id = u.session_id
       LEFT JOIN users usr ON usr.id = u.user_id
      ORDER BY a.last_seen DESC
      LIMIT 100`,
    since,
  );

  const now = Date.now();
  const visitors = rows.map(r => ({
    // Solo un prefijo: identifica la sesion en la lista sin exponer la cookie entera.
    id: (r.session_id || '').slice(0, 8),
    path: r.last_path,
    country: r.country,
    // Anonimo salvo que haya iniciado sesion. No inventamos identidad.
    user: r.email ? { email: r.email, name: r.name } : null,
    pageviews: Number(r.hits),
    secondsAgo: Math.round((now - new Date(r.last_seen).getTime()) / 1000),
    sessionSeconds: Math.round((new Date(r.last_seen).getTime() - new Date(r.first_seen).getTime()) / 1000),
  }));

  return NextResponse.json({
    windowMinutes: minutes,
    online: visitors.length,
    loggedIn: visitors.filter(v => v.user).length,
    anonymous: visitors.filter(v => !v.user).length,
    visitors,
  });
}
