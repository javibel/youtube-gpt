import { captureSuggestionSearch, type SearchSelection } from '@/lib/calendar-suggestion-search';
import { captureSuggestionTimes, captureSuggestionTrends, captureSuggestionCompetitors,
  captureSuggestionCalendar, captureSuggestionChannel } from '@/lib/calendar-suggestion-context';
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
  const selection = Object.freeze({ baseDay, publishedThrough: new Date(baseInstant).toISOString(), publishedAfter: new Date(baseInstant - 7 * 86400000).toISOString(), next14 });
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
  selection: Readonly<{ baseDay: string; publishedThrough: string; publishedAfter: string; next14: readonly string[] }>) {
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


  // Identity and declared permission come from the same own SQL snapshot.
  // This read neither admits a task nor reconstructs an original producer.
  let originalSnapshot: unknown;
  let queryEntered = false;
  const permission = await wait.run(() => prisma.$transaction(async tx => {
    wait.check();
    if (queryEntered) throw Error('Duplicate context producer');
    queryEntered = true;
    const original = await (async () => {
    wait.check();
    const user = await tx.user.findUnique({
      where: { email: owner.email }, select: { id: true, email: true },
    });
    wait.check();
    if (!user) return { status: 404, access: null, context: null };
    if (user.id !== owner.id || user.email !== owner.email)
      return { status: 401, access: null, context: null };
    const subscription = await tx.subscription.findUnique({
      where: { userId: owner.id },
      select: { userId: true, status: true, plan: true, stripeCustomerId: true, currentPeriodEnd: true },
    });
    wait.check();
    if (subscription === null) return { status: 403, access: null, context: null };
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
    if (!paid) return { status: 403, access: null, context: null };
    // Copy each selection before the next await, inside the same owner/permission
    // snapshot. The extra calendar/watchlist row detects incomplete coverage.
    wait.check();
    const bestTime = captureSuggestionTimes(await tx.bestTimeAnalysis.findUnique({
      where: { userId }, select: { userId: true, topSlots: true, analyzedAt: true },
    }), userId, wait.check);
    wait.check();
    const trendAlerts = captureSuggestionTrends(await tx.trendAlert.findMany({
      where: { userId, relevance: { gte: 60 } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 10,
      select: { id: true, userId: true, title: true, category: true, relevance: true, createdAt: true },
    }), userId, wait.check);
    wait.check();
    const competitors = captureSuggestionCompetitors(await tx.trackedCompetitor.findMany({
      where: { userId }, orderBy: [{ addedAt: 'asc' }, { id: 'asc' }], take: 21,
      select: { id: true, userId: true, channelId: true, channelName: true, addedAt: true },
    }), userId, wait.check);
    wait.check();
    const existingEntries = captureSuggestionCalendar(await tx.calendarEntry.findMany({
      where: { userId, date: { gte: selection.baseDay } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }], take: 201,
      select: { id: true, userId: true, title: true, date: true, status: true, createdAt: true },
    }), userId, selection.baseDay, wait.check);
    wait.check();
    const ytToken = captureSuggestionChannel(await tx.youtubeToken.findUnique({
      where: { userId }, select: { userId: true, channelId: true, channelName: true },
    }), userId, wait.check);
    const context = Object.freeze({ bestTime, trendAlerts, competitors, existingEntries, ytToken,
      coverage: Object.freeze({ calendarComplete: true, calendarCount: existingEntries.length, calendarLimit: 200,
        watchlistComplete: true, watchlistCount: competitors.length, watchlistLimit: 20,
        trendSelectionLimit: 10, trendSelectionCount: trendAlerts.length }) });
    wait.check();
    return { status: 200, access, context };
    })();
    wait.check();
    originalSnapshot = Object.freeze(original);
    return original;
  }, { isolationLevel: 'RepeatableRead', maxWait: 55_000, timeout: 55_000 }));
  wait.check();
  if (permission !== originalSnapshot) throw Error('Unconfirmed original snapshot');
  if (permission.status !== 200)
    return NextResponse.json({ error: permission.status === 404 ? 'owner_not_found'
      : permission.status === 401 ? 'unauthorized' : 'pro_required' }, { status: permission.status });
  const paid = () => {
    wait.check();
    const access = permission.access;
    return access !== null && hasPaidAccess({ status: access.status, stripeCustomerId: access.stripeCustomerId,
      currentPeriodEnd: access.expiry === null ? null : new Date(access.expiry) });
  };


  if (!paid()) return NextResponse.json({ error: 'pro_required' }, { status: 403 });

  let task;
  try {
    task = await wait.run(() => getMessagesTask({ operationKey: operationKey ?? undefined, taskType: 'calendar.suggestions', userId, language: lang, instructionsVersion: 'calendar-suggestions-v1',
      outputSchema: { type: 'array', items: { type: 'object', properties: { title: { type: 'string', minLength: 1 }, date: { type: 'string' }, reason: { type: 'string' }, description: { type: 'string' } }, required: ['title'], additionalProperties: true } },
    }));
  } catch { wait.check(); return NextResponse.json({ error: 'ai_not_configured' }, { status: 500 }); }

  if (!paid()) return NextResponse.json({ error: 'pro_required' }, { status: 403 });

  const { bestTime, trendAlerts, competitors, existingEntries, ytToken } = permission.context!;

  // Best time slots
  let bestTimeInfo = 'No best time analysis available.';
  if (bestTime?.topSlots.length) {
    const slots = bestTime.topSlots;
    bestTimeInfo = slots
      .map((s, i) => `${i + 1}. ${DAY_NAMES_EN[s.day]} at ${s.hour}:00 UTC (score: ${s.score})`)
      .join('\n');
  }

  // Trending topics
  const trendingInfo = trendAlerts.length > 0
    ? trendAlerts.map(t => `- ${t.title} (relevance: ${t.relevance}, category: ${t.category})`).join('\n')
    : 'No trend alerts available.';

  // The public search is optional and bounded. A failed/malformed selection is
  // explicitly unconfirmed, never a fabricated empty result or a complete channel.
  const unavailable = (channelId: string | null, limit: 5 | 10, publishedAfter: string | null): SearchSelection =>
    Object.freeze({ channelId, limit, publishedAfter, publishedThrough: selection.publishedThrough,
      status: channelId && YT_API_KEY ? 'unconfirmed' as const : 'not_requested' as const, videos: Object.freeze([]) });
  async function uploads(original: SearchSelection): Promise<SearchSelection> {
    wait.check();
    if (original.status === 'not_requested') return original;
    try {
      const query = new URLSearchParams({ part: 'snippet', channelId: original.channelId!, type: 'video',
        order: 'date', maxResults: String(original.limit), key: YT_API_KEY! });
      if (original.publishedAfter !== null) query.set('publishedAfter', original.publishedAfter);
      // The upper bound is the original capture, never the later response time.
      query.set('publishedBefore', original.publishedThrough);
      const url = 'https://www.googleapis.com/youtube/v3/search?' + query.toString();
      const res = await wait.run(() => fetch(url, { signal: request.signal, redirect: 'error', cache: 'no-store' }));
      wait.check();
      const status = res.status, redirected = res.redirected, contentType = res.headers.get('content-type');
      wait.check();
      if (status !== 200 || redirected || contentType?.split(';')[0].trim().toLowerCase() !== 'application/json')
        return original;
      const reader = res.body?.getReader();
      if (!reader) return original;
      let complete = false, size = 0, text = '';
      const decoder = new TextDecoder('utf-8', { fatal: true });
      try {
        while (true) {
          const chunk = await wait.run(() => reader.read());
          wait.check();
          if (chunk.done) { complete = true; break; }
          if (!(chunk.value instanceof Uint8Array) || (size += chunk.value.byteLength) > 65_536)
            throw Error('Oversized optional search body');
          text += decoder.decode(chunk.value, { stream: true });
          wait.check();
        }
        text += decoder.decode();
        wait.check();
        const data: unknown = JSON.parse(text);
        wait.check();
        return captureSuggestionSearch(data, original, wait.check);
      } finally {
        // Only this response reader is retired; no task producer is cancelled.
        if (!complete) void reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    } catch { wait.check(); return original; }
  }
  // Copy the first response completely before starting the second optional await.
  const competitorSearch = await uploads(unavailable(competitors[0]?.channelId ?? null, 5, selection.publishedAfter));
  wait.check();
  const ownSearch = await uploads(unavailable(ytToken?.channelId ?? null, 10, null));
  wait.check();
  const competitorUploads = competitorSearch.status === 'selected'
    ? competitorSearch.videos.map(v => '- ' + v.channelTitle + ': "' + v.title + '"').join('\n') || 'Selected search returned no uploads.'
    : 'No confirmed competitor search data.';
  const recentTitles = ownSearch.videos.map(v => v.title);
  const recentInfo = ownSearch.status === 'selected'
    ? recentTitles.join(', ') || 'Selected search returned no uploads.'
    : 'No confirmed recent search data.';
  const searchAck = (captured: SearchSelection) => Object.freeze({
    channelId: captured.channelId, status: captured.status, selectionLimit: captured.limit,
    selectedCount: captured.videos.length, publishedAfter: captured.publishedAfter,
    publishedThrough: captured.publishedThrough,
    videos: Object.freeze(captured.videos.map(v => Object.freeze({ videoId: v.videoId, publishedAt: v.publishedAt }))),
  });
  // This is an acknowledgment of captured input only. It grants no authority to
  // recover another task, renew declared dates or accept an operational migration.
  const ack = Object.freeze({
    version: 1, userId, operationKey, method: recovery === null ? 'create' : 'retrieve',
    input, horizon: Object.freeze({ baseDay: selection.baseDay, next14 }),
    context: Object.freeze({ coverage: permission.context!.coverage,
      bestTimeAnalyzedAt: bestTime?.analyzedAt ?? null,
      competitorSearch: searchAck(competitorSearch), ownSearch: searchAck(ownSearch) }),
  });

  // Existing calendar entries
  const existingInfo = existingEntries.length > 0
    ? existingEntries.map(e => `- ${e.date}: "${e.title}" (${e.status})`).join('\n')
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
Recent videos: ${recentInfo}

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
    Object.freeze(parameters.messages[0]); Object.freeze(parameters.messages); Object.freeze(parameters);
    wait.check();
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
    return NextResponse.json({ suggestions, ack });
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
