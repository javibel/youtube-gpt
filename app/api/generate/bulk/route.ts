import { getMessagesTask } from '@/lib/ai/task-runtime';
import { TEMPLATES } from '@/utils/prompts';
import { auth } from '@/auth';
import { getUserPlan, getLimits, isPaid } from '@/lib/plans';
import { readGenerationQuota } from '@/lib/generation-quota';
import { unkeyedTextGeneration } from '@/lib/text-generation-attempt';

function getIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip');
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Pro-only feature
    const plan = await getUserPlan(session.user.id);
    if (!isPaid(plan)) {
      return Response.json({ error: 'pro_required' }, { status: 403 });
    }

    const limits = getLimits(plan);
    const maxTopics = limits.bulkMaxTopics;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({ error: 'Invalid body' }, { status: 400 });
    const { template, topics, options = {}, lang: requestedLang = 'es' } = body;
    if (requestedLang != null && typeof requestedLang !== 'string') return Response.json({ error: 'Invalid language' }, { status: 400 });
    const lang = requestedLang === 'en' ? 'en' : 'es';
    if (!options || typeof options !== 'object' || Array.isArray(options)
      || Object.values(options).some(value => typeof value !== 'string' || value.length > 500)) return Response.json({ error: 'Invalid options' }, { status: 400 });

    // Validate template
    if (typeof template !== 'string' || !Object.hasOwn(TEMPLATES, template)) {
      return Response.json({ error: 'Invalid template' }, { status: 400 });
    }
    const templateData = TEMPLATES[template as keyof typeof TEMPLATES];
    if (!templateData) {
      return Response.json({ error: 'Invalid template' }, { status: 400 });
    }

    // Validate topics
    if (!Array.isArray(topics) || topics.length < 1 || topics.length > maxTopics) {
      return Response.json({ error: `Provide 1-${maxTopics} topics` }, { status: 400 });
    }

    // Validate the whole batch before quota/task effects. Silently removing an
    // invalid neighbour changes requested item positions and hides input errors.
    if (topics.some(t => typeof t !== 'string' || !t.trim() || t.trim().length > 500)) {
      return Response.json({ error: 'Invalid topics' }, { status: 400 });
    }
    const cleanTopics = topics.map((t: string) => t.trim());

    // Check remaining quota
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    let usedThisMonth: number;
    try { usedThisMonth = await readGenerationQuota(session.user.id, startOfMonth); }
    catch { return Response.json({ error: 'Generation quota unavailable' }, { status: 503 }); }

    const remaining = Math.max(0, limits.generationsPerMonth - usedThisMonth);
    if (remaining < cleanTopics.length) {
      return Response.json(
        {
          error: lang === 'en'
            ? `Not enough credits. You have ${remaining} left, need ${cleanTopics.length}.`
            : `Creditos insuficientes. Tienes ${remaining}, necesitas ${cleanTopics.length}.`,
          limitReached: true,
        },
        { status: 429 },
      );
    }

    const identity = { taskType: 'content.bulk-generate', userId: session.user.id, language: lang === 'en' ? 'en' : 'es', instructionsVersion: 'bulk-templates-v1' };
    const ip = getIp(request);
    const LONG_TEMPLATES = new Set(['script', 'series', 'niche_analysis']);
    const maxTokens = LONG_TEMPLATES.has(template) ? 8192 : 2048;
    const langInstruction = lang === 'en'
      ? '\n\nIMPORTANT: Write your ENTIRE response in English.'
      : '';

    // Process topics sequentially to avoid API rate limits
    const results: { topic: string; content: string; error?: string; retryMayConsume?: true }[] = [];

    for (const topic of cleanTopics) {
      // Other operations can occupy capacity between items. This is a snapshot,
      // not a reservation: do not infer fresh model authority from its result.
      try {
        const occupied = await readGenerationQuota(session.user.id, startOfMonth);
        if (occupied >= limits.generationsPerMonth) {
          results.push({ topic, content: '', error: 'Not enough credits' });
          continue;
        }
      } catch {
        results.push({ topic, content: '', error: 'Generation quota unavailable' });
        continue;
      }
      const confirmed = await unkeyedTextGeneration(session.user.id, request.signal, async () => {
       try {
        const inputs = { ...options, tema: topic };
        const prompt = templateData.prompt(inputs) + langInstruction;

        let task;
        try { task = await getMessagesTask(identity); }
        catch { return Response.json({ error: 'Service unavailable', retryMayConsume: true }, { status: 503 }); }
        const data = await task.create({ max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }, { signal: request.signal });
        const content = data?.content?.[0]?.text;
        const tokensUsed = data?.usage?.output_tokens;
        // Unknown usage is not zero usage. Keep the item unconfirmed rather
        // than recording a fabricated token count or incomplete output.
        if (data?.incomplete === true || typeof content !== 'string' || !content.trim()
          || typeof tokensUsed !== 'number' || !Number.isSafeInteger(tokensUsed) || tokensUsed < 0) {
          return Response.json({ error: 'Generation result unavailable', retryMayConsume: true }, { status: 502 });
        }

        // Only this acknowledged fresh admission can execute this closure.
        // The helper commits history and its completed slot atomically.
        return { content, truncated: false, history: { template,
          inputs: { ...options, tema: topic, _bulk: true }, output: content,
          tokensUsed, ipAddress: ip } };
      } catch (err) {
        return Response.json({ error: err && typeof err === 'object' && 'code' in err && err.code === 'rate_limit'
          ? 'API error 429' : 'Generation failed', retryMayConsume: true }, { status: 502 });
      }
      });
      const item = await confirmed.json();
      if (confirmed.ok && typeof item.content === 'string' && item.truncated === false) {
        results.push({ topic, content: item.content });
      } else if (results.length === 0 && confirmed.status === 503 && item.error === 'Service unavailable') {
        return Response.json({ error: 'Service unavailable', retryMayConsume: true }, { status: 503 });
      } else {
        const error = item.limitReached === true ? 'Not enough credits'
          : ['Generation result unavailable', 'API error 429', 'Service unavailable'].includes(item.error) ? item.error : 'Generation failed';
        results.push({ topic, content: '', error, ...(item.retryMayConsume === true ? { retryMayConsume: true as const } : {}) });
      }
    }

    return Response.json({
      results,
      generated: results.filter(r => !r.error).length,
      total: cleanTopics.length,
    });
  } catch (error) {
    console.error('[generate/bulk]', error);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}
