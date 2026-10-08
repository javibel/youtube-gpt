import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserPlan, getLimits, isPaid } from '@/lib/plans';
import { getMessagesTask } from '@/lib/ai/task-runtime';
import { createHash } from 'node:crypto';
import { readGenerationQuota } from '@/lib/generation-quota';

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
  const operationKey = request.headers.get('idempotency-key');
  if (operationKey !== null && !/^[A-Za-z0-9._:-]{1,128}$/.test(operationKey)) {
    return NextResponse.json({ error: 'Invalid operation key' }, { status: 400 });
  }
  let script: string, lang: string;
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || (body.script != null && typeof body.script !== 'string')
      || (body.lang != null && typeof body.lang !== 'string')) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    script = body.script ?? '';
    lang = body.lang === 'en' ? 'en' : 'es';
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  if (!script.trim()) return NextResponse.json({ error: 'Empty script' }, { status: 400 });

  // The task ledger deduplicates inference, but history also consumes quota.
  // Use the existing primary key for one history effect per user/operation;
  // this is a business replay lookup, never coordinator recovery authority.
  const generationId = operationKey === null ? null : 'storyboard_' + createHash('sha256')
    .update(JSON.stringify([userId, operationKey])).digest('hex');
  const inputDigest = createHash('sha256').update(JSON.stringify([script, lang])).digest('hex');
  async function savedResponse() {
    if (!generationId) return null;
    const saved = await prisma.generation.findUnique({ where: { id: generationId } });
    if (!saved) return null;
    const inputs = saved.inputs;
    if (saved.userId !== userId || saved.template !== 'video_preview'
      || !inputs || typeof inputs !== 'object' || Array.isArray(inputs)
      || inputs.retryInputDigest !== inputDigest) {
      return NextResponse.json({ error: 'Operation input changed' }, { status: 409 });
    }
    if (!saved.output.trim()) {
      return NextResponse.json({ error: 'Saved generation unavailable' }, { status: 503 });
    }
    return NextResponse.json({ storyboard: saved.output });
  }
  try {
    const saved = await savedResponse();
    if (saved) return saved;
  } catch {
    return NextResponse.json({ error: 'Generation history unavailable' }, { status: 503 });
  }

  const plan = await getUserPlan(userId);
  const isPro = isPaid(plan);
  const limit = getLimits(plan).generationsPerMonth;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  let usedThisMonth: number;
  try { usedThisMonth = await readGenerationQuota(userId,startOfMonth); }
  catch { return NextResponse.json({ error: 'Generation quota unavailable' }, { status: 503 }); }

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

  let task;
  try {
    task = await getMessagesTask({ operationKey: operationKey ?? undefined,
      taskType: 'content.storyboard', userId, language: lang === 'en' ? 'en' : 'es',
      instructionsVersion: 'storyboard-v1',
    });
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
  try {
    const data = await task.create({
      max_tokens: 1024,
      messages: [{ role: 'user', content: lang === 'en' ? EN_PROMPT(script) : ES_PROMPT(script) }],
    });
    const storyboard: string = data.content?.[0]?.text ?? '';
    const tokensUsed = data.usage?.output_tokens;
    // Unknown usage is not a measured zero. Validate before quota/history effects.
    if (typeof storyboard !== 'string' || !storyboard.trim() || data.incomplete === true
      || typeof tokensUsed !== 'number' || !Number.isSafeInteger(tokensUsed) || tokensUsed < 0) {
      return NextResponse.json({ error: 'Storyboard result unavailable' }, { status: 502 });
    }

    // Registrar la generacion — cuenta para el pool mensual (10 free / 200 pro)
    // igual que cualquier otro template, y es lo que alimenta el tope de
    // FREE_VIDEO_TIPS_PER_MONTH de arriba.
    try {
      await prisma.generation.create({
        data: {
          ...(generationId ? { id: generationId } : {}),
          userId,
          template: 'video_preview',
          inputs: { script: script.slice(0, 4000), ...(generationId ? { retryInputDigest: inputDigest } : {}) },
          output: storyboard,
          tokensUsed,
          ipAddress: getIp(request),
        },
      });
    } catch {
      // A concurrent retry, or an acknowledged-late insert, may have saved it.
      // Read the committed row; never overwrite an existing operation's input.
      if (generationId) {
        try {
          const saved = await savedResponse();
          if (saved) return saved;
        } catch { /* Preserve uncertain persistence as a retryable failure. */ }
      }
      return NextResponse.json({ error: 'Generation history could not be saved' }, { status: 503 });
    }

    return NextResponse.json({ storyboard });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : 'uncertain';
    return NextResponse.json({ error: 'AI generation unavailable' }, { status: code === 'uncertain' ? 500 : 502 });
  }
}
