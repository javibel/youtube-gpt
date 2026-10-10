import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUserPlan, isPaid } from '@/lib/plans';
import { getMessagesTask } from '@/lib/ai/task-runtime';

export const maxDuration = 60;

// This retires only the HTTP wait, never the original task or its authority.
function suggestionWait(signal: AbortSignal) {
  const deadline = performance.now() + 55_000;
  let retired = false;
  let rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => {
    if (!retired) { retired = true; rejectWait(new Error('Suggestions unconfirmed')); }
  };
  const timer = setTimeout(retire, 55_000);
  signal.addEventListener('abort', retire, { once: true });
  const check = () => {
    if (signal.aborted || performance.now() >= deadline) retire();
    if (retired) throw new Error('Suggestions unconfirmed');
  };
  return {
    async run<T>(operation: () => Promise<T>): Promise<T> {
      check();
      const original = Promise.resolve().then(() => { check(); return operation(); });
      const result = await Promise.race([original, stopped]);
      check();
      return result;
    },
    check,
    close() { clearTimeout(timer); signal.removeEventListener('abort', retire); },
  };
}

export async function POST(req: NextRequest) {
  const wait = suggestionWait(req.signal);
  try {
    const response = await suggestTitles(req, wait);
    wait.check();
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    try { wait.check(); }
    catch {
      return NextResponse.json({ error: 'ab_suggestions_unconfirmed' }, {
        status: 503, headers: { 'Cache-Control': 'no-store' },
      });
    }
    return NextResponse.json({ error: 'AI suggestions temporarily unavailable' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  } finally { wait.close(); }
}

async function suggestTitles(req: NextRequest, wait: ReturnType<typeof suggestionWait>) {
  const session = await wait.run(() => auth());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const plan = await wait.run(() => getUserPlan(userId));
  if (!isPaid(plan)) {
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  let body;
  try { body = await wait.run(() => req.json()); }
  catch { wait.check(); body = null; }
  const { title, lang = 'es' } = body ?? {};
  if (typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'Title required' }, { status: 400 });
  }

  const operationKey = req.headers.get('idempotency-key') ?? undefined;
  if (operationKey !== undefined && !/^[-A-Za-z0-9._:]{1,128}$/.test(operationKey)) {
    return NextResponse.json({ error: 'Invalid operation key' }, { status: 400 });
  }

  const isEn = lang === 'en';
  const prompt = isEn
    ? `You are a YouTube SEO expert. Given this video title, generate exactly 2 alternative title variants optimized for higher CTR. Keep the same language and topic but use different hooks, power words, or structures.

Original title: "${title}"

Rules:
- Keep the same language as the original
- Each variant must be 40-70 characters
- Use numbers, brackets, or parentheses when effective
- One variant should be more emotional/curiosity-driven
- One variant should be more direct/value-driven
- Do NOT use ALL CAPS

Respond ONLY with a JSON object: {"variantA": "...", "variantB": "..."}`
    : `Eres un experto en SEO de YouTube. Dado este título de vídeo, genera exactamente 2 variantes alternativas optimizadas para mayor CTR. Mantén el mismo idioma y tema pero usa diferentes ganchos, palabras poderosas o estructuras.

Título original: "${title}"

Reglas:
- Mantén el mismo idioma que el original
- Cada variante debe tener 40-70 caracteres
- Usa números, corchetes o paréntesis cuando sea efectivo
- Una variante debe ser más emocional/curiosa
- La otra debe ser más directa/con propuesta de valor
- NO uses TODO MAYÚSCULAS

Responde SOLO con un objeto JSON: {"variantA": "...", "variantB": "..."}`;

  try {
    const task = await wait.run(() => getMessagesTask({
      taskType: 'youtube.ab-title-suggestions', userId, operationKey,
      language: isEn ? 'en' : 'es', instructionsVersion: 'ab-titles-v1',
      outputSchema: { type: 'object', properties: { variantA: { type: 'string' }, variantB: { type: 'string' } }, additionalProperties: false },
    }));
    // Once dispatched, keep creation and parsing in the original producer.
    // A late result cannot replace the retired response or authorize a retry.
    return await wait.run(async () => {
      const msg = await task.create({
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
      const cleaned = text.replace(/```json\s*/g, '').replace(/```/g, '').trim();

      const parsed = JSON.parse(cleaned);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
        || (parsed.variantA !== undefined && typeof parsed.variantA !== 'string')
        || (parsed.variantB !== undefined && typeof parsed.variantB !== 'string')) {
        return NextResponse.json({ error: 'AI response parse error' }, { status: 500 });
      }
      return NextResponse.json({
        variantA: parsed.variantA || title,
        variantB: parsed.variantB || title,
      });
    });
  } catch {
    wait.check();
    return NextResponse.json({ error: 'AI suggestions temporarily unavailable' }, { status: 503 });
  }
}
