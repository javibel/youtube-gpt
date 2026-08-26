import { NextRequest, NextResponse } from 'next/server';
import { rateLimitRequest } from '@/lib/rate-limit-db';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

// A5 (2026-07-05): creado para recoger las violaciones de la CSP candidata mientras
// corre en modo observacion.
//
// 26/08/2026: ahora tambien recibe los bloqueos REALES. Hasta hoy la politica enforced
// no llevaba report-uri, asi que un bloqueo de verdad no se registraba en ninguna parte
// — por eso la falta de `media-src` tuvo el reproductor de previews en negro casi dos
// meses sin que saltara ninguna alarma (el servidor devolvia 200 todo el rato).
//
// Por eso ya no basta con console.warn: los bloqueos se agrupan en `csp_violations`
// (unico por directiva+recurso) y el Guardian avisa de los nuevos. El upsert mantiene
// la tabla acotada por muchos reportes que lleguen.

// Extensiones del navegador y proxies inyectan scripts en las paginas y generan
// violaciones que no son culpa nuestra ni podemos arreglar. Se registran como aviso
// pero no se persisten, para no llenar la tabla de ruido ajeno.
const NOISE_SCHEMES = ['chrome-extension', 'moz-extension', 'safari-extension', 'safari-web-extension', 'webkit-masked-url'];

export async function POST(req: NextRequest) {
  const allowed = await rateLimitRequest(req, 'csp-report', 10, 1);
  if (!allowed) return NextResponse.json({ ok: true });

  try {
    const body = await req.json();
    const report = body['csp-report'] ?? body;

    const directive: string = report['effective-directive'] || report['violated-directive'] || 'unknown';
    const blockedUri: string = report['blocked-uri'] || 'unknown';
    const documentUri: string | null = report['document-uri'] || null;
    // `disposition` lo envia el navegador: "enforce" (bloqueado de verdad) o "report".
    const reportOnly = report['disposition'] === 'report';

    console.warn('[csp-report]', JSON.stringify({ blockedUri, directive, documentUri, reportOnly }));

    if (NOISE_SCHEMES.some(scheme => blockedUri.startsWith(scheme))) {
      return NextResponse.json({ ok: true });
    }

    // La directiva puede llegar como "media-src 'self'" — nos quedamos con el nombre.
    const directiveName = directive.split(/\s+/)[0].slice(0, 64);

    await prisma.cspViolation.upsert({
      where: { directive_blockedUri_reportOnly: { directive: directiveName, blockedUri: blockedUri.slice(0, 200), reportOnly } },
      create: {
        directive: directiveName,
        blockedUri: blockedUri.slice(0, 200),
        documentUri: documentUri?.slice(0, 300) ?? null,
        reportOnly,
      },
      update: { count: { increment: 1 } },
    });
  } catch {
    // Reporte mal formado o BD no disponible — nunca debe hacer fallar la peticion:
    // el navegador no hace nada con el error y solo generaria ruido.
  }

  return NextResponse.json({ ok: true });
}
