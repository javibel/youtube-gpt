import { decodeCalendarSuggestions } from '@/lib/calendar-suggestion-contract';
import { getMessagesTask } from '@/lib/ai/task-runtime';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { hasPaidAccess } from '@/lib/plans';

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
  const selectedUser = session?.user;
  const id = selectedUser?.id, email = selectedUser?.email;
  wait.check();
  if (typeof id !== 'string' || !id || typeof email !== 'string' || !email)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const owner = Object.freeze({ id, email });
  const userId = owner.id;
  const operationKey=request.headers.get('idempotency-key');
  const recovery=request.headers.get('X-Calendar-Recovery');
  if((operationKey!==null&&!/^[-A-Za-z0-9._:]{1,128}$/.test(operationKey))
    ||(recovery!==null&&(recovery!=='retained-only-v1'||operationKey===null))){
    return NextResponse.json({error:'invalid_recovery'},{status:400});
  }

  // Identity and declared permission come from the same own SQL snapshot.
  // This read neither admits a task nor reconstructs an original producer.
  const permission = await wait.run(() => prisma.$transaction(async tx => {
    wait.check();
    const user = await tx.user.findUnique({
      where: { email: owner.email }, select: { id: true, email: true },
    });
    wait.check();
    if (!user) return { status: 404, access: null };
    if (user.id !== owner.id || user.email !== owner.email)
      return { status: 401, access: null };
    const subscription = await tx.subscription.findUnique({
      where: { userId: owner.id },
      select: { userId: true, status: true, plan: true, stripeCustomerId: true, currentPeriodEnd: true },
    });
    wait.check();
    if (subscription === null) return { status: 403, access: null };
    const { userId: planOwner, status, plan, stripeCustomerId, currentPeriodEnd } = subscription;
    if (planOwner !== owner.id || typeof status !== 'string' || !status
      || !['free', 'pro', 'business'].includes(plan)
      || (stripeCustomerId !== null && typeof stripeCustomerId !== 'string'))
      throw Error('Suggestions unconfirmed');
    // Capture an expiry value, not the mutable Date returned by a dependency.
    const expiry = currentPeriodEnd === null ? null : Date.prototype.toISOString.call(currentPeriodEnd);
    const access = Object.freeze({ status, stripeCustomerId, expiry });
    const paid = ['pro', 'business'].includes(plan) && hasPaidAccess({
      status, stripeCustomerId, currentPeriodEnd: expiry === null ? null : new Date(expiry),
    });
    wait.check();
    return { status: paid ? 200 : 403, access: paid ? access : null };
  }, { isolationLevel: 'RepeatableRead', maxWait: 55_000, timeout: 55_000 }));
  wait.check();
  if (permission.status !== 200)
    return NextResponse.json({ error: permission.status === 404 ? 'owner_not_found'
      : permission.status === 401 ? 'unauthorized' : 'pro_required' }, { status: permission.status });
  const paid = () => {
    wait.check();
    const access = permission.access;
    return access !== null && hasPaidAccess({ status: access.status, stripeCustomerId: access.stripeCustomerId,
      currentPeriodEnd: access.expiry === null ? null : new Date(access.expiry) });
  };

  const body = await wait.run(() => request.json().catch(() => null));
  wait.check();
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(key => key !== 'lang'))
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const language = body.lang;
  wait.check();
  if (language !== undefined && language !== 'es' && language !== 'en')
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const input = Object.freeze({ lang: language === undefined ? 'es' : language });
  const lang = input.lang;
  if (!paid()) return NextResponse.json({ error: 'pro_required' }, { status: 403 });

  let task;
  try {
    task = await wait.run(() => getMessagesTask({ operationKey: operationKey ?? undefined, taskType: 'calendar.suggestions', userId, language: lang, instructionsVersion: 'calendar-suggestions-v1',
      outputSchema: { type: 'array', items: { type: 'object', properties: { title: { type: 'string', minLength: 1 }, date: { type: 'string' }, reason: { type: 'string' }, description: { type: 'string' } }, required: ['title'], additionalProperties: true } },
    }));
  } catch { wait.check(); return NextResponse.json({ error: 'ai_not_configured' }, { status: 500 }); }

  if (!paid()) return NextResponse.json({ error: 'pro_required' }, { status: 403 });

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

  if (!paid()) return NextResponse.json({ error: 'pro_required' }, { status: 403 });

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
    if (!paid()) return NextResponse.json({ error: 'pro_required' }, { status: 403 });
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

    if (!paid()) return NextResponse.json({ error: 'pro_required' }, { status: 403 });
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
