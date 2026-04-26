import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

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

  // Pro-only feature
  const subscription = await prisma.subscription.findUnique({
    where: { userId: session.user.id },
    select: { status: true },
  });
  if (subscription?.status !== 'active') {
    return NextResponse.json({ error: 'Pro required' }, { status: 403 });
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
    return NextResponse.json({ storyboard });
  } catch {
    return NextResponse.json({ error: 'Connection error' }, { status: 500 });
  }
}
