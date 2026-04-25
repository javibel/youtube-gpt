import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const FREE_DAILY_LIMIT = 5;
const PRO_DAILY_LIMIT = 20;
const MAX_MESSAGE_LENGTH = 500;
const MAX_CONTEXT_MESSAGES = 4;
const MAX_TOKENS = 350;

const SYSTEM_PROMPT = `You are the YTubViral support assistant. Help content creators use YTubViral and answer general questions about creating content for YouTube, TikTok, Instagram, and similar platforms.

YTubViral features — be precise, never invent features not listed here:

GENERATE (/generate) — free for all users:
- Viral Titles: 5 title options (40-60 chars), optimized for CTR and search.
- YouTube Description: SEO description (200-300 words) with timestamps and CTA.
- Caption + Hashtags: viral captions for TikTok, Shorts, or Instagram with 15 hashtags.
- Thumbnail Text: 3 short text options (max 8 words) for the video thumbnail.
- Script: full script with hook (0-5s), intro, body sections, and CTA outro.

GENERATE (/generate) — Pro plan only:
- Shorts Hook: 5 hook options for the first 3 seconds of a Short.
- Series Plan: full content series plan with configurable episode count and progression logic.
- Niche Analysis: content opportunities, unique angles, 8 video ideas, 10 keywords, format recommendations.

VIDEO PREVIEW (dashboard) — Pro plan only:
- Converts a script into a storyboard of 8-12 timed visual scenes.
- Generates an animated video preview from the storyboard.
- Up to 3 previews saved per account. They CAN be downloaded directly from the platform.

KEYWORD RESEARCH (/research) — all users:
- Enter any keyword to get: competition level (low/medium/high), opportunity score, average views of top 5 videos, top videos list, and related keywords.

COMPETITOR ANALYSIS (/competitors) — all users:
- Paste any YouTube channel URL. Get: channel stats, top 10 videos by views, publishing frequency, recurring topic keywords. Keywords are clickable and redirect to Keyword Research.

CHANNEL ANALYTICS (dashboard) — all users:
- Connect your YouTube channel via Google OAuth to see: subscriber count, total views, video count.

PLANS:
- Free: 10 generations/month, 5 chat messages/day.
- Pro: 9.99 EUR/month or 99.99 EUR/year. 200 generations/month, 20 chat messages/day. Adds Shorts Hook, Series Plan, Niche Analysis, and Video Preview with download.

Rules:
- Reply in the same language the user writes in (Spanish or English).
- Be concise and practical. Plain text only, no markdown, no asterisks, no dashes as bullets.
- Only answer about YTubViral or content creation for YouTube, TikTok, Instagram, etc. Politely decline unrelated requests.
- If you are unsure about something not listed above, say so instead of guessing.`;

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, subscription: { select: { status: true } } },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const isPro = user.subscription?.status === 'active';
    const dailyLimit = isPro ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT;

    const body = await request.json();
    const { message, context } = body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 });
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Mensaje demasiado largo (máx ${MAX_MESSAGE_LENGTH} caracteres)` },
        { status: 400 }
      );
    }

    // Throttle: 1 mensaje cada 3 segundos por usuario
    const throttleKey = `chat_throttle:${user.id}`;
    const throttleResult = await prisma.$queryRaw<{ hits: number }[]>`
      INSERT INTO rate_limits (key, hits, window_start)
      VALUES (${throttleKey}, 1, NOW())
      ON CONFLICT (key) DO UPDATE
      SET
        hits = CASE
          WHEN rate_limits.window_start < NOW() - INTERVAL '3 seconds'
          THEN 1
          ELSE rate_limits.hits + 1
        END,
        window_start = CASE
          WHEN rate_limits.window_start < NOW() - INTERVAL '3 seconds'
          THEN NOW()
          ELSE rate_limits.window_start
        END
      RETURNING hits
    `;
    if (Number(throttleResult[0].hits) > 1) {
      return NextResponse.json(
        { error: 'Espera un momento antes de enviar otro mensaje.' },
        { status: 429 }
      );
    }

    // Límite diario (ventana de 24h)
    const dailyKey = `chat_day:${user.id}`;
    const dailyResult = await prisma.$queryRaw<{ hits: number }[]>`
      INSERT INTO rate_limits (key, hits, window_start)
      VALUES (${dailyKey}, 1, NOW())
      ON CONFLICT (key) DO UPDATE
      SET
        hits = CASE
          WHEN rate_limits.window_start < NOW() - INTERVAL '1 day'
          THEN 1
          ELSE rate_limits.hits + 1
        END,
        window_start = CASE
          WHEN rate_limits.window_start < NOW() - INTERVAL '1 day'
          THEN NOW()
          ELSE rate_limits.window_start
        END
      RETURNING hits
    `;

    const hitsToday = Number(dailyResult[0].hits);
    if (hitsToday > dailyLimit) {
      return NextResponse.json(
        {
          error: isPro
            ? 'Has alcanzado el límite diario del plan Pro (20 mensajes/día).'
            : 'Has alcanzado el límite diario del plan gratuito (5 mensajes/día). Actualiza a Pro para obtener 20 mensajes/día.',
          limitReached: true,
          remaining: 0,
        },
        { status: 429 }
      );
    }

    // Construir mensajes para Claude (contexto + nuevo mensaje)
    const contextMessages = Array.isArray(context)
      ? context.slice(-MAX_CONTEXT_MESSAGES).map((m: { role: string; content: string }) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: String(m.content).slice(0, MAX_MESSAGE_LENGTH),
        }))
      : [];

    const messages = [
      ...contextMessages,
      { role: 'user', content: message.trim() },
    ];

    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'Servicio no disponible temporalmente' }, { status: 503 });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return NextResponse.json(
        { error: err.error?.message || 'Error del servicio de IA' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const reply: string = data.content?.[0]?.text ?? '';
    const remaining = Math.max(0, dailyLimit - hitsToday);

    return NextResponse.json({ reply, remaining, isPro });
  } catch (err) {
    console.error('[chat]', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
