import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const ES_PROMPT = (script: string) => `Convierte este script de YouTube en un storyboard de 4-6 escenas para un preview de vídeo de 15-20 segundos en total.

Formato de salida — UNA línea por escena, exactamente así:
[inicio]s-[fin]s: ETIQUETA | Descripción visual (máx 12 palabras, presente, verbos de acción)

Reglas:
- Duración total entre 15 y 20 segundos
- Cada escena dura entre 3 y 5 segundos
- ETIQUETA: 1-2 palabras EN MAYÚSCULAS (ej: GANCHO, CONFLICTO, GIRO, SOLUCIÓN, CLÍMAX, CTA)
- Descripción: lo que VE el espectador — imágenes concretas, no narración
- Verbos de acción en presente (sube, aparece, mira, cae, brilla…)
- La última escena debe mostrar un título o CTA que enganche
- No incluyas nada más: solo las líneas de escenas

Script:
${script.slice(0, 2500)}`;

const EN_PROMPT = (script: string) => `Convert this YouTube script into a visual storyboard of 4-6 scenes for a 15-20 second video preview.

Output format — ONE line per scene, exactly like this:
[start]s-[end]s: LABEL | Visual description (max 12 words, present tense, action verbs)

Rules:
- Total duration: 15-20 seconds
- Each scene lasts 3-5 seconds
- LABEL: 1-2 words IN UPPERCASE (e.g., HOOK, CONFLICT, TWIST, SOLUTION, CLIMAX, CTA)
- Description: what the VIEWER SEES — concrete images, not narration
- Present tense action verbs (rises, appears, looks, falls, shines…)
- Last scene must show a title or hooky CTA
- Output ONLY the scene lines, nothing else

Script:
${script.slice(0, 2500)}`;

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
        max_tokens: 512,
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
