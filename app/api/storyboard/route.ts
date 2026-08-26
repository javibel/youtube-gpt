import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserPlan, getLimits, isPaid } from '@/lib/plans';

// Free incluye Video Tips desde el 26/08 (gancho de retención — el 69% de lo
// generado en free eran titulos, producto de un solo uso; ver
// project_retention_analysis_2026_08_26.md). Decisión de Javier: 1/mes para
// free, y esa generación CUENTA dentro de las 10 generaciones/mes normales
// (no es un cupo aparte). Pro/Business solo estan limitados por su pool
// general (generationsPerMonth), sin tope adicional aqui.
const FREE_VIDEO_TIPS_PER_MONTH = 1;

function getIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip');
}

const ES_PROMPT = (script: string) => `Convierte este script de YouTube en un storyboard visual de 8-12 escenas. Adapta la cantidad al tamaño del script: scripts cortos → 8 escenas, scripts largos → hasta 12.

Formato de salida — UNA línea por escena, exactamente así:
[inicio]s-[fin]s: ETIQUETA | Descripción (máx 15 palabras, presente, imágenes concretas)

Reglas:
- Cada escena dura entre 5 y 8 segundos
- ETIQUETA: 1-3 palabras EN MAYÚSCULAS (ej: GANCHO, PROBLEMA, DATO CLAVE, GIRO, SOLUCIÓN, CTA)
- Descripción: lo que VE el espectador, imágenes concretas, no narración abstracta
- Verbos de acción en presente
- Cubre el arco completo: introducción, desarrollo, puntos clave y cierre/CTA
- No incluyas nada más: solo las líneas de escenas

Script:
${script.slice(0, 4000)}`;

const EN_PROMPT = (script: string) => `Convert this YouTube script into a visual storyboard of 8-12 scenes. Adapt the count to script length: short scripts → 8 scenes, long scripts → up to 12.

Output format — ONE line per scene, exactly like this:
[start]s-[end]s: LABEL | Visual description (max 15 words, present tense, concrete images)

Rules:
- Each scene lasts 5-8 seconds
- LABEL: 1-3 words IN UPPERCASE (e.g., HOOK, PROBLEM, KEY FACT, TWIST, SOLUTION, CTA)
- Description: what the VIEWER SEES — concrete images, not abstract narration
- Present tense action verbs
- Cover the full arc: intro, development, key points, closing CTA
- Output ONLY the scene lines, nothing else

Script:
${script.slice(0, 4000)}`;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const plan = await getUserPlan(userId);
  const isPro = isPaid(plan);
  const limit = getLimits(plan).generationsPerMonth;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const usedThisMonth = await prisma.generation.count({
    where: { userId, createdAt: { gte: startOfMonth } },
  });

  if (usedThisMonth >= limit) {
    return NextResponse.json(
      { error: isPro ? 'Límite del plan Pro alcanzado' : 'Límite del plan gratuito alcanzado', limitReached: true },
      { status: 429 }
    );
  }

  // Tope adicional solo para free: 1 Video Tips/mes (comparte pool con las 10
  // generaciones normales, pero ademas no puede "gastarlas todas" en esto).
  if (!isPro) {
    const videoTipsThisMonth = await prisma.generation.count({
      where: { userId, template: 'video_preview', createdAt: { gte: startOfMonth } },
    });
    if (videoTipsThisMonth >= FREE_VIDEO_TIPS_PER_MONTH) {
      return NextResponse.json(
        { error: 'Ya usaste tu Video Tips gratis este mes', limitReached: true, videoTipsCapped: true },
        { status: 429 }
      );
    }
  }

  // Rate limit por minuto: mismo patron atomico que /api/generate (anti-abuso)
  const rlKey = `storyboard:${userId}`;
  const rlResult = await prisma.$queryRaw<{ hits: number }[]>`
    INSERT INTO rate_limits (key, hits, window_start)
    VALUES (${rlKey}, 1, NOW())
    ON CONFLICT (key) DO UPDATE
    SET
      hits = CASE
        WHEN rate_limits.window_start < NOW() - INTERVAL '1 minute'
        THEN 1
        ELSE rate_limits.hits + 1
      END,
      window_start = CASE
        WHEN rate_limits.window_start < NOW() - INTERVAL '1 minute'
        THEN NOW()
        ELSE rate_limits.window_start
      END
    RETURNING hits
  `;
  if (Number(rlResult[0].hits) > 5) {
    return NextResponse.json({ error: 'Demasiadas solicitudes. Espera un momento antes de continuar.' }, { status: 429 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });

  let script: string, lang: string;
  try {
    const body = await request.json();
    script = body.script ?? '';
    lang = body.lang ?? 'es';
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (!script.trim()) return NextResponse.json({ error: 'Empty script' }, { status: 400 });

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: lang === 'en' ? EN_PROMPT(script) : ES_PROMPT(script) }],
      }),
    });

    if (!res.ok) return NextResponse.json({ error: 'AI error' }, { status: 502 });
    const data = await res.json();
    const storyboard: string = data.content?.[0]?.text ?? '';

    // Registrar la generacion — cuenta para el pool mensual (10 free / 200 pro)
    // igual que cualquier otro template, y es lo que alimenta el tope de
    // FREE_VIDEO_TIPS_PER_MONTH de arriba.
    try {
      await prisma.generation.create({
        data: {
          userId,
          template: 'video_preview',
          inputs: { script: script.slice(0, 4000) },
          output: storyboard,
          tokensUsed: data.usage?.output_tokens ?? 0,
          ipAddress: getIp(request),
        },
      });
    } catch { /* no bloquear la respuesta si falla el registro */ }

    return NextResponse.json({ storyboard });
  } catch {
    return NextResponse.json({ error: 'Connection error' }, { status: 500 });
  }
}
