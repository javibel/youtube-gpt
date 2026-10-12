import { decodeCalendarSuggestions } from '@/lib/calendar-suggestion-contract';
import { getMessagesTask } from '@/lib/ai/task-runtime';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserPlan, isPaid } from '@/lib/plans';

export const maxDuration = 60;

// The HTTP deadline retires this waiter; it never replaces the original task.
function suggestionHttpWait(signal: AbortSignal) {
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

const YT_API_KEY = process.env.YOUTUBE_API_KEY?.trim();

const DAY_NAMES_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export async function POST(request: Request) {
  const wait = suggestionHttpWait(request.signal);
  // Capture this HTTP producer's civil horizon before any await. A later request
  // cannot reconstruct an older producer: the task facade must match its original
  // input, or retained-only retrieval remains unconfirmed.
  const baseInstant = Date.now();
  const baseDay = new Date(baseInstant).toISOString().slice(0, 10);
  const next14 = Object.freeze(Array.from({ length: 14 }, (_, i) =>
    new Date(baseInstant + (i + 1) * 86400000).toISOString().slice(0, 10)));
  const selection = Object.freeze({ baseDay, publishedAfter: new Date(baseInstant - 7 * 86400000).toISOString(), next14 });
  try {
    const response = await suggest(request, wait, selection);
    wait.check();
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return NextResponse.json({ error: 'suggestions_unconfirmed', retryMayConsume: false }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  } finally { wait.close(); }
}

async function suggest(request: Request, wait: ReturnType<typeof suggestionHttpWait>,
  selection: Readonly<{ baseDay: string; publishedAfter: string; next14: readonly string[] }>) {
  const next14 = selection.next14;
  const session = await wait.run(() => auth());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const operationKey=request.headers.get('idempotency-key');
  const recovery=request.headers.get('X-Calendar-Recovery');
  if((operationKey!==null&&!/^[-A-Za-z0-9._:]{1,128}$/.test(operationKey))
    ||(recovery!==null&&(recovery!=='retained-only-v1'||operationKey===null))){
    return NextResponse.json({error:'invalid_recovery'},{status:400});
  }

  const plan = await wait.run(() => getUserPlan(userId));
  if (!isPaid(plan)) {
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  const body = (await wait.run(() => request.json().catch(() => ({})))) ?? {};
  const lang = body.lang === 'en' ? 'en' : 'es';

  let task;
  try {
    task = await wait.run(() => getMessagesTask({ operationKey: operationKey ?? undefined, taskType: 'calendar.suggestions', userId, language: lang, instructionsVersion: 'calendar-suggestions-v1',
      outputSchema: { type: 'array', items: { type: 'object', properties: { title: { type: 'string', minLength: 1 }, date: { type: 'string' }, reason: { type: 'string' }, description: { type: 'string' } }, required: ['title'], additionalProperties: true } },
    }));
  } catch { wait.check(); return NextResponse.json({ error: 'ai_not_configured' }, { status: 500 }); }

  // Gather data in parallel
  const [bestTime, trendAlerts, competitors, existingEntries, ytToken] = await wait.run(() => Promise.all([
    prisma.bestTimeAnalysis.findUnique({ where: { userId } }),
    prisma.trendAlert.findMany({
      where: { userId, relevance: { gte: 60 } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.trackedCompetitor.findMany({
      where: { userId },
      select: { channelId: true, channelName: true },
      take: 10,
    }),
    prisma.calendarEntry.findMany({
      where: { userId, date: { gte: selection.baseDay } },
      orderBy: { date: 'asc' },
      take: 30,
    }),
    prisma.youtubeToken.findUnique({ where: { userId }, select: { channelId: true, channelName: true } }),
  ]));

  // Best time slots
  let bestTimeInfo = 'No best time analysis available.';
  if (bestTime?.topSlots) {
    const slots = bestTime.topSlots as { day: number; hour: number; score: number }[];
    bestTimeInfo = slots
      .map((s, i) => `${i + 1}. ${DAY_NAMES_EN[s.day]} at ${s.hour}:00 UTC (score: ${s.score})`)
      .join('\n');
  }

  // Trending topics
  const trendingInfo = trendAlerts.length > 0
    ? trendAlerts.map(t => `- ${t.title} (relevance: ${t.relevance}, category: ${t.category})`).join('\n')
    : 'No trend alerts available.';

  // Competitor recent uploads (last 7 days)
  let competitorUploads = 'No competitor data.';
  if (competitors.length > 0 && YT_API_KEY) {
    try {
      const res = await wait.run(() => fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${competitors[0].channelId}&type=video&order=date&maxResults=5&publishedAfter=${selection.publishedAfter}&key=${YT_API_KEY}`,
        { signal: request.signal }
      ));
      if (res.ok) {
        const data = await wait.run(() => res.json());
        const titles = (data.items || []).map((i: { snippet: { title: string; channelTitle: string } }) =>
          `- ${i.snippet.channelTitle}: "${i.snippet.title}"`
        );
        if (titles.length > 0) competitorUploads = titles.join('\n');
      }
    } catch { wait.check(); }
  }

  // User's recent videos
  let recentTitles: string[] = [];
  if (ytToken?.channelId && YT_API_KEY) {
    try {
      const res = await wait.run(() => fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${ytToken.channelId}&type=video&order=date&maxResults=10&key=${YT_API_KEY}`,
        { signal: request.signal }
      ));
      if (res.ok) {
        const data = await wait.run(() => res.json());
        recentTitles = (data.items || []).map((i: { snippet: { title: string } }) => i.snippet.title).filter(Boolean);
      }
    } catch { wait.check(); }
  }

  // Existing calendar entries
  const existingInfo = existingEntries.length > 0
    ? existingEntries.slice(0, 15).map(e => `- ${e.date}: "${e.title}" (${e.status})`).join('\n')
    : 'No upcoming entries.';


  try {
    const parameters = {
        max_tokens: 1000,
        messages: [{
          role: 'user' as const,
          content: `You are a YouTube content strategist. Based on the data below, suggest 5 video ideas with optimal publish dates for the next 2 weeks. Reply in ${lang === 'en' ? 'English' : 'Spanish'}. Output ONLY valid JSON array:
[{"title":"video title","date":"YYYY-MM-DD","hour":14,"reason":"why this date/topic","description":"brief content outline"}]

RULES:
- Pick dates from: ${next14.join(', ')}
- Prefer dates that match the best publish times
- Don't suggest topics the creator already has scheduled
- Incorporate trending topics when relevant
- Each suggestion should have a different topic
- Titles should be compelling YouTube titles (curiosity gap, numbers, etc.)
- Hour in UTC (0-23), aligned with best publish times

DATA:
Channel: "${ytToken?.channelName || 'Unknown'}"
Recent videos: ${recentTitles.slice(0, 8).join(', ') || 'none'}

Best publish times:
${bestTimeInfo}

Trending topics (relevant to channel):
${trendingInfo}

Recent competitor uploads:
${competitorUploads}

Already scheduled:
${existingInfo}`,
        }],
    };
    const data = await wait.run(() => recovery !== null
      ? Promise.resolve(task.retrieve?.(parameters, { signal: request.signal }))
      : task.create(parameters, { signal: request.signal }));
    if (!data) return NextResponse.json({ error: 'suggestions_unconfirmed', retryMayConsume: false }, { status: 503 });

    let suggestions;
    try {
    wait.check();
    const incomplete = data.incomplete, content = data.content;
    wait.check();
    if (incomplete || !Array.isArray(content) || content.length !== 1) throw Error('Incomplete suggestions');
    const type = content[0]?.type, text = content[0]?.text;
    wait.check();
    if (type !== 'text') throw Error('Incomplete suggestions');
    suggestions = decodeCalendarSuggestions(text, next14, wait.check);
    wait.check();
    } catch {
      wait.check();
      return NextResponse.json(recovery === null ? { error: 'ai_parse_error' }
        : { error: 'suggestions_unconfirmed', retryMayConsume: false }, { status: recovery === null ? 500 : 503 });
    }

    return NextResponse.json({ suggestions });
  } catch (e) {
    wait.check();
    if (recovery !== null) {
      const conflict = e && typeof e === 'object' && 'code' in e && e.code === 'invalid_format';
      return NextResponse.json({ error: conflict ? 'operation_input_changed' : 'suggestions_unconfirmed', retryMayConsume: false }, { status: conflict ? 409 : 503 });
    }
    const msg = e && typeof e === 'object' && 'code' in e && e.code === 'invalid_format' ? 'ai_parse_error' : 'AI error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
