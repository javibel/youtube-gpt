import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUserPlan, isPaid } from '@/lib/plans';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const plan = await getUserPlan(session.user.id);
  if (!isPaid(plan)) {
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  const { title, lang = 'es' } = await req.json();
  if (!title) {
    return NextResponse.json({ error: 'Title required' }, { status: 400 });
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

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
  const cleaned = text.replace(/```json\s*/g, '').replace(/```/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    return NextResponse.json({
      variantA: parsed.variantA || title,
      variantB: parsed.variantB || title,
    });
  } catch {
    return NextResponse.json({ error: 'AI response parse error' }, { status: 500 });
  }
}
