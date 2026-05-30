'use strict';

import { prisma } from '@/lib/prisma';
import { sendOwnerEmail } from './gmail-agent';

interface RawCountRow { status?: string; type?: string; count: number }

export async function sendDailyReport(): Promise<void> {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dateStr = now.toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // 1. Social posts last 24h (published only)
  const posts = await prisma.socialPost.groupBy({
    by: ['platform'],
    where: { publishedAt: { gte: yesterday }, status: 'published' },
    _count: { id: true },
  });

  // 1b. Failed posts last 72h — social health check
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const failedPosts = await prisma.socialPost.groupBy({
    by: ['platform'],
    where: { createdAt: { gte: threeDaysAgo }, status: 'failed' },
    _count: { id: true },
  });
  const publishedLast3d = await prisma.socialPost.groupBy({
    by: ['platform'],
    where: { createdAt: { gte: threeDaysAgo }, status: 'published' },
    _count: { id: true },
  });
  const platforms3d = new Set([
    ...failedPosts.map(f => f.platform),
    ...publishedLast3d.map(p => p.platform),
  ]);
  const healthWarnings: string[] = [];
  for (const plat of platforms3d) {
    const fails = failedPosts.find(f => f.platform === plat)?._count.id ?? 0;
    const successes = publishedLast3d.find(p => p.platform === plat)?._count.id ?? 0;
    if (successes === 0 && fails > 0) {
      healthWarnings.push(`  ⚠ ${plat}: 0 publicaciones exitosas en 3 días (${fails} fallos)`);
    } else if (fails > successes) {
      healthWarnings.push(`  ⚠ ${plat}: más fallos (${fails}) que éxitos (${successes}) en 3 días`);
    }
  }

  // 2. Gmail replies last 24h
  const gmailCount = await prisma.socialMessage.count({
    where: { platform: 'gmail', repliedAt: { gte: yesterday } },
  });

  // 3. LinkedIn prospects + actions (raw tables written by YCML)
  let prospectsRows: RawCountRow[] = [];
  let actionsRows: RawCountRow[] = [];
  try {
    prospectsRows = await prisma.$queryRaw<RawCountRow[]>`
      SELECT status, CAST(COUNT(*) AS INTEGER) as count
      FROM linkedin_prospects
      GROUP BY status
    `;
    actionsRows = await prisma.$queryRaw<RawCountRow[]>`
      SELECT type, CAST(COUNT(*) AS INTEGER) as count
      FROM linkedin_actions
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY type
    `;
  } catch {
    // Tables don't exist yet — YCML hasn't run
  }

  const postsSection = posts.length > 0
    ? posts.map(p => `  - ${p.platform}: ${p._count.id} publicaciones`).join('\n')
    : '  - Sin publicaciones hoy';

  const prospectsSection = prospectsRows.length > 0
    ? prospectsRows.map(r => `  - ${r.status}: ${r.count}`).join('\n')
    : '  - Sin datos (YCML pendiente de arrancar)';

  const actionsSection = actionsRows.length > 0
    ? actionsRows.map(r => `  - ${r.type}: ${r.count}`).join('\n')
    : '  - Sin acciones hoy';

  const healthSection = healthWarnings.length > 0
    ? `\nALERTA SALUD SOCIAL (ultimos 3 dias)\n${healthWarnings.join('\n')}\n`
    : '';

  const body = `REPORTE DIARIO YTUBVIRAL - ${dateStr.toUpperCase()}
${'='.repeat(60)}
${healthSection}
PUBLICACIONES EN REDES SOCIALES (ultimas 24h)
${postsSection}

GMAIL (ultimas 24h)
  - Respondidos: ${gmailCount}

PROSPECTOS LINKEDIN (total acumulado)
${prospectsSection}

ACCIONES LINKEDIN - YCML (ultimas 24h)
${actionsSection}

${'='.repeat(60)}
Agente YTubViral - ytubviral.com
`;

  await sendOwnerEmail(
    `Reporte Diario YTubViral - ${now.toLocaleDateString('es-ES')}`,
    body
  );
}
