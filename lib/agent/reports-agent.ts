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

  const body = `REPORTE DIARIO YTUBVIRAL - ${dateStr.toUpperCase()}
${'='.repeat(60)}

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
