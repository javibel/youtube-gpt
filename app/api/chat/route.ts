import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserPlan, getLimits, isPaid } from '@/lib/plans';
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

SEO SCORE (/seo-score) — all users (YouTube channel required):
- Analyzes any of your videos with a 15-point checklist: title length, description, tags, thumbnail, etc.
- Returns a 0-100 score with an AI optimization tip.

BEST TIME TO PUBLISH (/best-time) — Pro plan only:
- Analyzes your last 50 videos to find optimal publishing windows.
- Shows a 7x24 heatmap and top 3 recommended time slots with AI tip.

ANALYTICS INTELLIGENCE (/analytics) — Pro plan only:
- Private YouTube Analytics data: watch time, retention, traffic sources, countries, top videos.
- Requires YouTube channel connected via OAuth.

CONTENT CALENDAR (/calendar) — Pro plan only:
- Monthly calendar view to plan content. Create entries with title, description, date, and status (idea/draft/scheduled/published).

A/B TESTING (/ab-test) — Pro plan only:
- Run A/B tests on video titles: set two title variants (A and B) and a duration per variant (24/48/72 hours).
- The system automatically switches between titles and tracks views for each variant.
- After both variants run, determines a winner and generates an AI insight.
- Requires YouTube channel connected with write permissions.

TREND ALERTS (/trends) — Pro plan only:
- Daily trending video alerts from US, ES, MX, GB.
- AI evaluates relevance to your channel. Mark alerts as read.

PREDICTOR (/predictor) — Pro plan only:
- Predicts performance (views, engagement, viral potential) for a video idea using AI analysis of your channel baseline.

RETENTION OPTIMIZER (/retention) — Pro plan only:
- Analyzes audience retention curves from YouTube Analytics.
- Identifies drop-off points and provides AI tips to improve retention.

AI COACH (/coach) — Pro plan only:
- Personal AI growth coach that has access to your real channel data (videos, SEO, growth, competitors).
- Ask questions about improving CTR, growth strategies, content optimization, etc.

COMPETITOR TRACKING (/competitors) — all users:
- Paste any YouTube channel URL. Get: channel stats, top 10 videos by views, publishing frequency, recurring topic keywords.
- Pro users can track up to 10 competitor channels with periodic snapshots and growth sparklines.

BULK OPERATIONS (/generate/bulk) — Pro plan only:
- Generate content for up to 10 topics at once using any template (titles, descriptions, captions, thumbnails, shorts hooks).
- Export results as CSV.

TEAM / AGENCY (/team) — Pro plan only:
- Create a team and invite members by email with roles: owner, admin, member.
- Team plan supports up to 5 members, Agency up to 25.

DAILY IDEAS (dashboard) — Pro plan only:
- 5 personalized video ideas per day based on your channel, niche, and history.

THUMBNAILS (/thumbnail-preview) — Pro plan only:
- Upload or generate thumbnail previews to see how they look in YouTube search results and suggested videos.

ACHIEVEMENTS (/achievements) — all users:
- Gamified achievement system. Unlock badges for milestones (channel connection, subscriber counts), improvement (SEO scores, A/B tests), streaks (consecutive days), and learning (coach messages, tool usage).

CHROME EXTENSION (v1.4):
- YTubViral Chrome Extension available on Chrome Web Store. Works on YouTube watch pages, YouTube Studio editor, Studio video list, search results, and channel pages.
- Features: SEO scorecard with score ring and checklist, outlier detection badge (≥5× channel average), channel stats with growth sparkline, keyword competition panel, AI title generation. Pro plan required.

BLOG (/blog):
- Educational blog with articles about YouTube growth, SEO, content strategy, and gear reviews.

GEAR (/gear):
- Curated page of recommended equipment for content creators (cameras, microphones, lighting, etc.) with Amazon affiliate links.

PLANS:
- Free: 10 generations/month, 5 chat messages/day.
- Pro: 9.99 EUR/month or 99.99 EUR/year. 200 generations/month, 20 chat messages/day. Adds Shorts Hook, Series Plan, Niche Analysis, Video Preview, and all Pro features listed above.
- Business: 29.99 EUR/month or 299 EUR/year. Unlimited generations, 50 chat messages/day. Includes all Pro features plus team features.

Rules:
- Reply in the same language the user writes in (Spanish or English).
- Be concise and practical. Plain text only, no markdown, no asterisks, no dashes as bullets.
- Only answer about YTubViral or content creation for YouTube, TikTok, Instagram, etc. Politely decline unrelated requests.
- If you are unsure about something not listed above, say so instead of guessing.`;

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ messages: [] });

  const messages = await prisma.chatMessage.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    take: 50,
    select: { role: true, content: true, createdAt: true },
  });
  return NextResponse.json({ messages });
}

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

    const plan = await getUserPlan(user.id);
    const isPro = isPaid(plan);
    const dailyLimit = getLimits(plan).chatMessagesPerDay;

    const body = await request.json();
    const { message, context, lang: clientLang } = body;
    const en = clientLang === 'en';

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: en ? 'Message required' : 'Mensaje requerido' }, { status: 400 });
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: en ? `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` : `Mensaje demasiado largo (máx ${MAX_MESSAGE_LENGTH} caracteres)` },
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
        { error: en ? 'Wait a moment before sending another message.' : 'Espera un momento antes de enviar otro mensaje.' },
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
            ? (en ? 'You have reached the daily Pro plan limit (20 messages/day).' : 'Has alcanzado el límite diario del plan Pro (20 mensajes/día).')
            : (en ? 'You have reached the free plan daily limit (5 messages/day). Upgrade to Pro for 20 messages/day.' : 'Has alcanzado el límite diario del plan gratuito (5 mensajes/día). Actualiza a Pro para obtener 20 mensajes/día.'),
          limitReached: true,
          remaining: 0,
        },
        { status: 429 }
      );
    }

    // Load recent messages from DB for context
    const recentMessages = await prisma.chatMessage.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: MAX_CONTEXT_MESSAGES,
      select: { role: true, content: true },
    });
    const contextMessages = recentMessages.reverse().map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content.slice(0, MAX_MESSAGE_LENGTH),
    }));

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
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: MAX_TOKENS,
        system: [
          { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        ],
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

    // Mismo fallo que habia en /api/track: sin await, la instancia serverless se
    // congela al devolver la respuesta y el historial se pierde sin dejar rastro.
    try {
      await prisma.chatMessage.createMany({
        data: [
          { userId: user.id, role: 'user', content: message.trim().slice(0, MAX_MESSAGE_LENGTH) },
          { userId: user.id, role: 'assistant', content: reply.slice(0, 2000) },
        ],
      });

      // Poda: conservar los ultimos 50 mensajes por usuario.
      const old = await prisma.chatMessage.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        skip: 50,
        select: { id: true },
      });
      if (old.length > 0) {
        await prisma.chatMessage.deleteMany({ where: { id: { in: old.map(m => m.id) } } });
      }
    } catch (err) {
      console.error('[chat] save error:', err);
    }

    return NextResponse.json({ reply, remaining, isPro });
  } catch (err) {
    console.error('[chat]', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
