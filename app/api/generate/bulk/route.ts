import { getMessagesTask } from '@/lib/ai/task-runtime';
import { TEMPLATES } from '@/utils/prompts';
import { auth } from '@/auth';
import { getUserPlan, getLimits, isPaid } from '@/lib/plans';
import { readGenerationQuota } from '@/lib/generation-quota';
import { unkeyedTextGeneration, keyedTextGeneration, retrieveKeyedTextGeneration } from '@/lib/text-generation-attempt';
import { admitBulkRequest } from '@/lib/bulk-generation-request';
import { prisma } from '@/lib/prisma';
import { createHash } from 'node:crypto';

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
    const userId = session.user.id;
    const operationKey = request.headers.get('idempotency-key');
    const recovery = request.headers.get('X-Bulk-Recovery');
    if (recovery !== null && (recovery !== 'retained-only-v1' || operationKey === null)) {
      return Response.json({ error: 'Invalid recovery request' }, { status: 400 });
    }
    if (operationKey !== null && !/^[A-Za-z0-9._:-]{1,128}$/.test(operationKey)) {
      return Response.json({ error: 'Invalid operation key' }, { status: 400 });
    }

    // Pro-only feature
    const plan = await getUserPlan(userId);
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

    const wholeBatchPreflight = async (): Promise<Response | null> => {
    let usedThisMonth: number;
    try { usedThisMonth = await readGenerationQuota(userId, startOfMonth); }
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
    return null;
    };

    const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
    const inputDigest = hash([template, cleanTopics, Object.keys(options).sort().map(k => [k, options[k]]), lang]);
    const itemKeys = cleanTopics.map((_topic: string, index: number) => operationKey === null ? null
      : 'bulk.' + hash([userId, operationKey, index]));
    const itemIds = itemKeys.map((key: string | null) => key === null ? null : 'generate_' + hash([userId, key]));
    let freshBatch = true;
    if (operationKey === null) {
      const denied = await wholeBatchPreflight(); if (denied) return denied;
    } else {
      const batch = await admitBulkRequest(userId, 'bulk_' + hash([userId, operationKey]),
        inputDigest, itemIds as string[], request.signal, wholeBatchPreflight, recovery === 'retained-only-v1');
      if (batch instanceof Response) return batch;
      freshBatch = batch.fresh;
    }

    const identity = { taskType: 'content.bulk-generate', userId: userId, language: lang === 'en' ? 'en' : 'es', instructionsVersion: 'bulk-templates-v1' };
    const ip = getIp(request);
    const LONG_TEMPLATES = new Set(['script', 'series', 'niche_analysis']);
    const maxTokens = LONG_TEMPLATES.has(template) ? 8192 : 2048;
    const langInstruction = lang === 'en'
      ? '\n\nIMPORTANT: Write your ENTIRE response in English.'
      : '';

    // Process topics sequentially to avoid API rate limits
    const results: { topic: string; content: string; error?: string; retryMayConsume?: true }[] = [];

    for (const [index, topic] of cleanTopics.entries()) {
      const itemId = itemIds[index];
      // Confirmed business replay requires its exact owner and ordered batch.
      // Missing/corrupt history never restarts a completed item.
      if (itemId) {
        try {
          const saved = await prisma.generation.findUnique({ where: { id: itemId } });
          if (saved) {
            const inputs = saved.inputs;
            const meta = inputs && typeof inputs === 'object' && !Array.isArray(inputs) ? inputs._migrationBulk : null;
            if (saved.userId !== userId || saved.template !== template || !meta || typeof meta !== 'object'
              || Array.isArray(meta) || meta.inputDigest !== inputDigest || meta.index !== index) {
              return Response.json({ error: 'Operation input changed' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
            }
            if (typeof saved.output === 'string' && saved.output.trim() && Number.isSafeInteger(saved.tokensUsed) && saved.tokensUsed >= 0) {
              results.push({ topic, content: saved.output }); continue;
            }
            results.push({ topic, content: '', error: 'Generation result unavailable' }); continue;
          }
        } catch { results.push({ topic, content: '', error: 'Generation result unavailable' }); continue; }
      }
      // Other operations can occupy capacity between items. This is a snapshot,
      // not a reservation: do not infer fresh model authority from its result.
      const itemPreflight = async (): Promise<Response | null> => { try {
        const occupied = await readGenerationQuota(userId, startOfMonth);
        if (occupied >= limits.generationsPerMonth) {
          return Response.json({ error: 'Not enough credits', limitReached: true }, { status: 429 });
        }
      } catch {
        return Response.json({ error: 'Generation quota unavailable' }, { status: 503 });
      }
      return null; };
      if (operationKey === null) {
        const denied = await itemPreflight();
        if (denied) { const data = await denied.json(); results.push({ topic, content: '', error: data.error }); continue; }
      }
      const execute = async (readOnly = false) => {
       try {
        const inputs = { ...options, tema: topic };
        const prompt = templateData.prompt(inputs) + langInstruction;

        let task;
        try { task = await getMessagesTask(itemKeys[index] === null ? identity : { ...identity,
          operationKey: itemKeys[index]!, instructionsVersion: 'bulk-templates-v2:' + inputDigest }); }
        catch { return Response.json({ error: 'Service unavailable', retryMayConsume: operationKey === null }, { status: 503 }); }
        const parameters = { max_tokens: maxTokens, messages: [{ role: 'user' as const, content: prompt }] };
        if (readOnly && typeof task.retrieve !== 'function') return Response.json({ error: 'Generation result unavailable', retryMayConsume: false }, { status: 503 });
        const data = await (readOnly ? task.retrieve!(parameters, { signal: request.signal }) : task.create(parameters, { signal: request.signal }));
        const content = data?.content?.[0]?.text;
        const tokensUsed = data?.usage?.output_tokens;
        // Unknown usage is not zero usage. Keep the item unconfirmed rather
        // than recording a fabricated token count or incomplete output.
        if (data?.incomplete === true || typeof content !== 'string' || !content.trim()
          || typeof tokensUsed !== 'number' || !Number.isSafeInteger(tokensUsed) || tokensUsed < 0) {
          return Response.json({ error: 'Generation result unavailable', retryMayConsume: operationKey === null }, { status: 502 });
        }

        // Only this acknowledged fresh admission can execute this closure.
        // The helper commits history and its completed slot atomically.
        return { content, truncated: false, history: { template,
          inputs: { ...options, tema: topic, _bulk: true, ...(itemId ? { _migrationBulk: { inputDigest, index } } : {}) }, output: content,
          tokensUsed, ipAddress: ip } };
      } catch (err) {
        return Response.json({ error: err && typeof err === 'object' && 'code' in err && err.code === 'rate_limit'
          ? 'API error 429' : 'Generation failed', retryMayConsume: operationKey === null }, { status: 502 });
      }
      };
      const confirmed = !itemId ? await unkeyedTextGeneration(userId, request.signal, execute)
        : freshBatch ? await keyedTextGeneration(userId, itemId, request.signal, itemPreflight, execute, () => execute(true))
        : await retrieveKeyedTextGeneration(userId, itemId, request.signal, () => execute(true));
      const item = await confirmed.json();
      if (confirmed.ok && typeof item.content === 'string' && item.truncated === false) {
        results.push({ topic, content: item.content });
      } else if (operationKey === null && results.length === 0 && confirmed.status === 503 && item.error === 'Service unavailable') {
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
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[generate/bulk]', error);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}
