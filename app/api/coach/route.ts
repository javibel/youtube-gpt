import { getMessagesTask } from '@/lib/ai/task-runtime';
import { NextResponse } from 'next/server';
import { authorizeNativeCoach, runNativeCoach } from '@/lib/coach-native-authorization';
import { prisma } from '@/lib/prisma';
import { getUserPlan, isPaid } from '@/lib/plans';
import { getChannelContext } from '@/lib/channel-context';
import { triggerConversionEmail } from '@/lib/lifecycle-trigger';

export const maxDuration = 60;

const MAX_CONTEXT = 10;

// Retire only the HTTP waiter. Already invoked SQL, mail or AI producers keep
// their original completion; expiry never authorizes cancellation or replay.
function coachSendWait(signal: AbortSignal) {
  const deadline = performance.now() + 55_000;
  let retired = false;
  let nativeCheck: (() => void) | null = null;
  let rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => {
    if (!retired) { retired = true; rejectWait(new Error('Coach send unconfirmed')); }
  };
  const timer = setTimeout(retire, 55_000);
  signal.addEventListener('abort', retire, { once: true });
  const check = () => {
    if (signal.aborted || performance.now() >= deadline) retire();
    if (retired) throw new Error('Coach send unconfirmed');
    nativeCheck?.();
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
    bindNativeCheck(checkNative: () => void) {
      if (nativeCheck) throw Error('Coach authentication already bound');
      nativeCheck = checkNative;
      check();
    },
    close() { clearTimeout(timer); signal.removeEventListener('abort', retire); },
  };
}

export async function POST(request: Request) {
  const wait = coachSendWait(request.signal);
  try {
    const authorization = await wait.run(() => authorizeNativeCoach(request));
    if (!authorization) return NextResponse.json({ error: 'unauthorized' }, {
      status: 401, headers: { 'Cache-Control': 'no-store' },
    });
    const response = await wait.run(() => runNativeCoach(authorization, async (owner, checkNative) => {
      wait.bindNativeCheck(checkNative);
      return sendCoach(request, wait, owner);
    }));
    wait.check();
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    try { wait.check(); }
    catch {
      return NextResponse.json({ error: 'coach_send_unconfirmed' }, {
        status: 503, headers: { 'Cache-Control': 'no-store' },
      });
    }
    return NextResponse.json({ error: 'service unavailable' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  } finally { wait.close(); }
}

async function sendCoach(request: Request, wait: ReturnType<typeof coachSendWait>, owner: Readonly<{ id: string; email: string }> & (Readonly<{ source: 'web' }> | Readonly<{ source: 'extension'; isPro: boolean }>)) {
  const userId = owner.id;
  const isProUser = owner.source === 'extension' ? owner.isPro : isPaid(await wait.run(() => getUserPlan(userId)));
  if (!isProUser) {
    // C3: tocó el paywall del Coach — email explicativo (idempotente, DRY_RUN por defecto)
    await wait.run(() => triggerConversionEmail(userId, 'c3', undefined, wait.check));
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  let body;
  try { body = await wait.run(() => request.json()); }
  catch { wait.check(); body = null; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const { message, context, mode, lang: clientLang, pageContext } = body;
  const lang = clientLang === 'en' ? 'en' : 'es';
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return NextResponse.json({ error: 'message required' }, { status: 400 });
  }

  const coachMode = (['create', 'analyze', 'optimize', 'research'] as const).includes(mode) ? mode : 'analyze';

  // Rate limit: 1 message per 5 seconds
  const throttleKey = `coach_throttle:${userId}`;
  const throttleResult = await wait.run(() => prisma.$queryRaw<{ hits: number }[]>`
    INSERT INTO rate_limits (key, hits, window_start)
    VALUES (${throttleKey}, 1, NOW())
    ON CONFLICT (key) DO UPDATE
    SET
      hits = CASE WHEN rate_limits.window_start < NOW() - INTERVAL '5 seconds' THEN 1 ELSE rate_limits.hits + 1 END,
      window_start = CASE WHEN rate_limits.window_start < NOW() - INTERVAL '5 seconds' THEN NOW() ELSE rate_limits.window_start END
    RETURNING hits
  `);
  if (Number(throttleResult[0].hits) > 1) {
    return NextResponse.json({ error: 'throttled' }, { status: 429 });
  }

  // Build channel context (shared with AI Generator)
  const ctx = await wait.run(() => getChannelContext(userId));
  const channelContext = ctx?.summary || 'No YouTube channel connected.';

  const MODE_PROMPTS: Record<string, string> = {
    create: `You are the YTubViral AI Coach in CREATE MODE — a creative content strategist for YouTube.

CREATOR'S CHANNEL DATA:
${channelContext}

YOUR ROLE:
- Help the creator brainstorm video ideas, scripts, titles, thumbnails, and hooks
- Suggest topics based on their channel niche, audience, and what's working
- Help craft compelling narratives and storytelling structures
- Generate variations of titles optimized for CTR
- Suggest content formats (tutorial, vlog, review, listicle, etc.) best suited for the topic
- Reference their most successful videos as models to replicate

APPROACH: Be creative and generative. Offer multiple options. Think like a showrunner planning a content calendar.`,

    analyze: `You are the YTubViral AI Coach in ANALYZE MODE — a YouTube analytics expert.

CREATOR'S CHANNEL DATA:
${channelContext}

YOUR ROLE:
- Deep-dive into the creator's channel performance, metrics, and growth trajectory
- Identify what's working and what isn't, backed by their real data
- Compare their metrics against benchmarks for their channel size
- Spot trends in their video performance (which topics, formats, lengths work best)
- For small channels (<1K subs): focus on niche clarity, searchable content, consistency
- For medium channels (1K-50K): focus on CTR optimization, audience retention, collaborations
- For large channels (50K+): focus on brand, diversification, monetization strategy

APPROACH: Be analytical and data-driven. Reference specific videos, scores, and metrics. Give honest assessments.`,

    optimize: `You are the YTubViral AI Coach in OPTIMIZE MODE — a YouTube SEO and conversion specialist.

CREATOR'S CHANNEL DATA:
${channelContext}

YOUR ROLE:
- Help optimize existing videos: titles, descriptions, tags, thumbnails, end screens
- Improve SEO scores with specific, actionable changes
- Optimize for search (keywords, metadata) and browse (CTR, packaging)
- Suggest A/B test ideas for underperforming videos
- Help improve audience retention with hook and pacing advice
- Recommend which existing videos to optimize first for maximum impact

APPROACH: Be precise and tactical. Give exact text suggestions, not vague advice. Prioritize changes by expected impact.`,

    research: `You are the YTubViral AI Coach in RESEARCH MODE — a YouTube market intelligence analyst.

CREATOR'S CHANNEL DATA:
${channelContext}

YOUR ROLE:
- Help research niches, competitors, keywords, and market opportunities
- Analyze competitor strategies and identify gaps the creator can exploit
- Evaluate trending topics and their relevance to the creator's channel
- Assess search volume and competition for potential video topics
- Map the competitive landscape in the creator's niche
- Identify underserved audiences and content gaps

APPROACH: Be thorough and strategic. Think long-term positioning, not just individual videos. Reference competitors when available.`,
  };

  // P5: the extension passes what the creator is looking at right now (a video, a channel,
  // a search). This is what makes the extension Coach worth more than a generic chat — it
  // reasons about the thing on screen, not just the user's own channel.
  const pageBlock = typeof pageContext === 'string' && pageContext.trim()
    ? `\n\nWHAT THE CREATOR IS LOOKING AT ON YOUTUBE RIGHT NOW:\n${pageContext.trim().slice(0, 600)}\nIf their question is about this, focus on it. Otherwise use it only as background.`
    : '';

  const systemPrompt = `${MODE_PROMPTS[coachMode]}${pageBlock}

YTUBVIRAL PLATFORM TOOLS (recommend these when relevant):
- Trending Explorer: discover trending videos by country, category, language, duration, and likes. Pro feature.
- SEO Score: analyze any YouTube video's SEO (title, description, tags, thumbnail). Shows score 0-100 with checklist.
- Generate: AI-powered content generation — titles, descriptions, scripts, captions, hashtags, hooks, thumbnail ideas, and more.
- Keyword Research: competition level, opportunity score, related terms for any search query.
- Competitor Analysis: subscriber count, upload frequency, avg views, top keywords extracted from any channel.
- A/B Testing: compare two title/thumbnail variants head to head.
- Revenue Estimator: estimate CPM and monthly revenue for any channel.
- Retention Analyzer: identify drop-off points and pacing issues.
- Outlier Detection: spot videos with 5x+ their channel's average views.
- Chrome Extension: SEO scores, keyword stats, competitor data, and outlier badges directly inside YouTube and YouTube Studio.
When the user asks how to do something that a tool can help with, mention the specific tool by name.

RULES:
- IMPORTANT: Reply ALWAYS in ${lang === 'en' ? 'English' : 'Spanish'}, regardless of the language of the channel data or system prompt
- Be concise but thorough. Use plain text, no markdown formatting
- Reference specific videos and data points when possible
- If asked about something you don't have data for, say so honestly
- Never invent metrics or data you don't have`;

  const history = Array.isArray(context) ? context.slice(-MAX_CONTEXT) : [];
  if (history.some(m => !m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string')
    || history[0]?.role === 'assistant') {
    return NextResponse.json({ error: 'Invalid conversation history' }, { status: 400 });
  }
  const contextMessages = history.map((m: { role: 'user' | 'assistant'; content: string }) => ({
    role: m.role, content: m.content.slice(0, 2000),
  }));
  const messages: { role: 'user' | 'assistant'; content: string }[] = [...contextMessages, { role: 'user', content: message.trim().slice(0, 2000) }];
  let task;
  try {
    task = await wait.run(() => getMessagesTask({
      taskType: 'channel.coach', userId, language: lang, instructionsVersion: 'coach-modes-v1',
      requiredCapabilities: ['prompt_cache'],
    }));
  } catch {
    wait.check();
    return NextResponse.json({ error: 'service unavailable' }, { status: 503 });
  }
  try {
    // Keep the original task and result reader together after dispatch. Coach
    // has no persisted history: a retired HTTP response cannot expose this
    // late result, and losing the process cannot recover it.
    return await wait.run(async () => {
      const data = await task.create({ max_tokens: 4096, system: systemPrompt, messages });
      return NextResponse.json({ reply: data.content[0].text });
    });
  } catch {
    wait.check();
    return NextResponse.json({ error: 'AI service error' }, { status: 500 });
  }
}
