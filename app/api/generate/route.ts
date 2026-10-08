import { getMessagesTask } from '@/lib/ai/task-runtime';
import { TEMPLATES } from '@/utils/prompts';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getExtensionUser } from '@/lib/extension-auth';
import { getUserPlan, getLimits, isPaid } from '@/lib/plans';
import { getChannelContext } from '@/lib/channel-context';
import { triggerConversionEmail } from '@/lib/lifecycle-trigger';
import { createHash } from 'node:crypto';
import { readGenerationQuota } from '@/lib/generation-quota';
import { unkeyedTextGeneration, keyedTextGeneration } from '@/lib/text-generation-attempt';

export const maxDuration = 60; // generación con Claude puede pasar de 15s en plantillas largas

const IP_FREE_LIMIT = 30; // máximo por IP/mes para usuarios free (anti multi-cuenta)

function getIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip');
}

export async function POST(request: Request) {
  try {
    // Require authentication — unauthenticated calls would bypass all limits and incur API cost
    const session = await auth();
    const extAuth = !session?.user?.id ? await getExtensionUser(request) : null;
    if (!session?.user?.id && !extAuth) {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }
    if (!extAuth && !session?.user?.email) {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }
    // NOTE: no blanket Pro gate for the extension here. It existed from 2026-04-26 (af9112c)
    // and made EVERY extension generation Pro-only, which (a) contradicted the Chrome Web
    // Store listing ("Free users get 10 AI generations per month across the extension and the
    // web app combined") and (b) left the per-plan limit logic below unreachable — dead code
    // for the very users it was written for. Free users now go through the same monthly quota
    // and proOnly checks as the web, so cost stays bounded by generationsPerMonth.

    const operationKey = request.headers.get('idempotency-key');
    if (operationKey !== null && !/^[A-Za-z0-9._:-]{1,128}$/.test(operationKey)) {
      return Response.json({ error: 'Invalid operation key' }, { status: 400 });
    }
    let body;
    try { body = await request.json(); }
    catch { return Response.json({ error: 'Invalid body' }, { status: 400 }); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.template !== 'string'
      || !body.inputs || typeof body.inputs !== 'object' || Array.isArray(body.inputs)
      || Object.values(body.inputs).some(value => typeof value !== 'string')
      || (body.lang != null && typeof body.lang !== 'string')) {
      return Response.json({ error: 'Invalid body' }, { status: 400 });
    }
    const template: string = body.template;
    const inputs: Record<string,string> = { ...body.inputs };
    const lang = body.lang === 'en' ? 'en' : 'es';

    const templateData = TEMPLATES[template as keyof typeof TEMPLATES];
    if (!Object.hasOwn(TEMPLATES, template) || !templateData) {
      return Response.json({ error: 'Template no válido' }, { status: 400 });
    }

    // Require real content — prevents empty generations that waste API credits. This used to
    // hardcode `inputs.tema` for every template, which meant any template without a `tema`
    // input (reply, added 2026-05-28; channel_insight) failed this check on every single call —
    // AI Reply to comments has been silently 400ing since it shipped. Now it checks whichever
    // of the template's own declared inputs actually carries the content.
    const templateInputs = (templateData.inputs || []) as string[];
    const contentKey = templateInputs.includes('tema') ? 'tema' : templateInputs[0];
    const contentValue = contentKey ? inputs?.[contentKey] : undefined;
    if (!contentValue || (typeof contentValue === 'string' && contentValue.trim().length < 3)) {
      return Response.json(
        { error: lang === 'en'
          ? 'Please provide more detail (at least 3 characters)'
          : 'Danos un poco más de detalle (mínimo 3 caracteres)' },
        { status: 400 }
      );
    }

    // Keep ordinary form fields bounded; retained assistant context has its own
    // explicit ceiling. Preserve it whole rather than silently trimming history.
    const MAX_INPUT_LENGTH = 500;
    const MAX_CONTINUATION_LENGTH = 32_000;
    if (inputs && typeof inputs === 'object') {
      for (const [key, value] of Object.entries(inputs)) {
        const limit = key === '_previousContent' ? MAX_CONTINUATION_LENGTH : MAX_INPUT_LENGTH;
        if (typeof value === 'string' && value.length > limit) {
          return Response.json(
            { error: `El campo "${key}" es demasiado largo (máx ${limit} caracteres)` },
            { status: 400 }
          );
        }
      }
    }

    // Authenticate the owner before reading any retained generation. A history ID
    // is a business replay key, never authority to recover a lost coordinator.
    const authenticatedUser = extAuth ? extAuth.user : await prisma.user.findUnique({
      where: { email: session!.user!.email! }, select: { id: true },
    });
    if (!authenticatedUser || typeof authenticatedUser.id !== 'string' || !authenticatedUser.id
      || (!extAuth && authenticatedUser.id !== session!.user!.id)) {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }
    let userId: string | null = authenticatedUser.id;
    const generationId = operationKey === null ? null : 'generate_' + createHash('sha256')
      .update(JSON.stringify([userId,operationKey])).digest('hex');
    const inputDigest = createHash('sha256').update(JSON.stringify([template,
      Object.keys(inputs).sort().map(key => [key,inputs[key]]),lang])).digest('hex');
    async function savedResponse() {
      if (!generationId) return null;
      const saved = await prisma.generation.findUnique({ where: { id: generationId } });
      if (!saved) return null;
      const stored = saved.inputs;
      const meta = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored._migrationRetry : null;
      if (saved.userId !== authenticatedUser!.id || saved.template !== template || !meta
        || typeof meta !== 'object' || Array.isArray(meta) || meta.inputDigest !== inputDigest) {
        return Response.json({ error: 'Operation input changed' }, { status: 409 });
      }
      if (typeof meta.content !== 'string' || !meta.content.trim() || typeof meta.truncated !== 'boolean'
        || saved.output !== (inputs._previousContent || '') + meta.content) {
        return Response.json({ error: 'Saved generation unavailable' }, { status: 503 });
      }
      return Response.json({ content: meta.content, truncated: meta.truncated });
    }
    try { const saved = await savedResponse(); if (saved) return saved; }
    catch { return Response.json({ error: 'Generation history unavailable' }, { status: 503 }); }
    const preflight = async (): Promise<Response | null> => {
      let isPro = false;

      if (extAuth) {
        // Extension Bearer token auth
        userId = extAuth.user.id;
        isPro = extAuth.isPro;
        const extPlan = await getUserPlan(userId);
        const limit = getLimits(extPlan).generationsPerMonth;

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        let usedThisMonth: number;
        try { usedThisMonth = await readGenerationQuota(userId,startOfMonth); }
        catch { return Response.json({ error: 'Generation quota unavailable' }, { status: 503 }); }
        if (usedThisMonth >= limit) {
          if (!isPro) await triggerConversionEmail(userId, 'c1', { resetDay: 1 });
          // `code` is for the extension: it renders a different card for "free quota spent"
          // (upgrade prompt) vs "Pro quota spent" (no upsell — they already pay).
          return Response.json(
            {
              error: isPro ? 'Límite del plan Pro alcanzado' : 'Límite del plan gratuito alcanzado',
              code: isPro ? 'quota_pro' : 'quota_free',
              limit,
              limitReached: true,
            },
            { status: 429 }
          );
        }

        if (!isPro && (templateData as { proOnly?: boolean }).proOnly) {
          await triggerConversionEmail(userId, 'c3');
          return Response.json(
            { error: 'Este template es exclusivo del plan Pro', code: 'pro_required', limitReached: true },
            { status: 403 }
          );
        }

        const rlKey = `generate:${userId}`;
        const rlResult = await prisma.$queryRaw<{ hits: number }[]>`
          INSERT INTO rate_limits (key, hits, window_start)
          VALUES (${rlKey}, 1, NOW())
          ON CONFLICT (key) DO UPDATE
          SET
            hits = CASE
              WHEN rate_limits.window_start < NOW() - INTERVAL '1 minute'
              THEN 1
              ELSE rate_limits.hits + 1
            END,
            window_start = CASE
              WHEN rate_limits.window_start < NOW() - INTERVAL '1 minute'
              THEN NOW()
              ELSE rate_limits.window_start
            END
          RETURNING hits
        `;
        if (Number(rlResult[0].hits) > 5) {
          return Response.json(
            { error: 'Demasiadas solicitudes. Espera un momento antes de continuar.' },
            { status: 429 }
          );
        }

        // Same anti multi-account cap as the web branch. It was never needed while the
        // blanket Pro gate above blocked every free extension call; now that free users
        // get their monthly quota here, the extension needs the same IP ceiling or it
        // becomes the cheap way around it.
        if (!isPro) {
          const ip = getIp(request);
          if (ip) {
            const ipUsageThisMonth = await prisma.generation.count({
              where: { ipAddress: ip, createdAt: { gte: startOfMonth } },
            });
            if (ipUsageThisMonth >= IP_FREE_LIMIT) {
              return Response.json(
                { error: 'Límite del plan gratuito alcanzado', code: 'quota_free', limitReached: true },
                { status: 429 }
              );
            }
          }
        }
      } else if (session?.user?.email) {
        const user = authenticatedUser;
        // A stale or inconsistent session must not fall through without accounting.
        if (!user || user.id !== session.user.id) {
          return Response.json({ error: 'No autorizado' }, { status: 401 });
        }
        if (user) {
          userId = user.id;

          const plan = await getUserPlan(user.id);
          isPro = isPaid(plan);
          const limit = getLimits(plan).generationsPerMonth;

          const startOfMonth = new Date();
          startOfMonth.setDate(1);
          startOfMonth.setHours(0, 0, 0, 0);

          // Verificar límite por cuenta
          let usedThisMonth: number;
          try { usedThisMonth = await readGenerationQuota(userId,startOfMonth); }
          catch { return Response.json({ error: 'Generation quota unavailable' }, { status: 503 }); }

          if (usedThisMonth >= limit) {
            if (!isPro) await triggerConversionEmail(userId, 'c1', { resetDay: 1 });
            return Response.json(
              { error: isPro ? 'Límite del plan Pro alcanzado' : 'Límite del plan gratuito alcanzado', limitReached: true },
              { status: 429 }
            );
          }

          // Bloquear templates Pro para usuarios free
          if (!isPro && (templateData as { proOnly?: boolean }).proOnly) {
            await triggerConversionEmail(userId, 'c3');
            return Response.json(
              { error: 'Este template es exclusivo del plan Pro', limitReached: true },
              { status: 403 }
            );
          }

          // Rate limit por minuto: máx 5 generaciones/minuto por usuario (anti-abuso)
          // Upsert atómico en BD: una sola operación SQL sin race condition
          const rlKey = `generate:${userId}`;
          const result = await prisma.$queryRaw<{ hits: number }[]>`
            INSERT INTO rate_limits (key, hits, window_start)
            VALUES (${rlKey}, 1, NOW())
            ON CONFLICT (key) DO UPDATE
            SET
              hits = CASE
                WHEN rate_limits.window_start < NOW() - INTERVAL '1 minute'
                THEN 1
                ELSE rate_limits.hits + 1
              END,
              window_start = CASE
                WHEN rate_limits.window_start < NOW() - INTERVAL '1 minute'
                THEN NOW()
                ELSE rate_limits.window_start
              END
            RETURNING hits
          `;
          if (Number(result[0].hits) > 5) {
            return Response.json(
              { error: 'Demasiadas solicitudes. Espera un momento antes de continuar.' },
              { status: 429 }
            );
          }

          // Verificar límite por IP (solo usuarios free, para evitar multi-cuenta)
          if (!isPro) {
            const ip = getIp(request);
            if (ip) {
              const ipUsageThisMonth = await prisma.generation.count({
                where: { ipAddress: ip, createdAt: { gte: startOfMonth } },
              });
              if (ipUsageThisMonth >= IP_FREE_LIMIT) {
                return Response.json(
                  { error: 'Límite del plan gratuito alcanzado', limitReached: true },
                  { status: 429 }
                );
              }
            }
          }
        }
      }

    return null;
    };
    if (operationKey === null) {
      const denied = await preflight();
      if (denied) return denied;
    }

    // Token limits per template — long-form content needs more tokens
    const LONG_TEMPLATES = new Set(['script', 'series', 'niche_analysis', 'next_video']);
    const maxTokens = LONG_TEMPLATES.has(template) ? 8192 : 2048;

    // Inject channel context for personalized generation (any plan, if channel is connected —
    // conectar canal es gratis desde 13/07, ver project_channel_connect_free.md)
    const CONTEXT_TEMPLATES = new Set(['title', 'description', 'script', 'caption', 'shorts_hook', 'series', 'niche_analysis', 'next_video']);
    if (userId && CONTEXT_TEMPLATES.has(template)) {
      try {
        const ctx = await getChannelContext(userId);
        if (ctx) {
          inputs._channelContext = ctx.summary;
        }
      } catch { /* non-critical — generate without context */ }
    }

    // Continuation support — if previousContent is provided, ask Claude to continue
    const previousContent = inputs._previousContent as string | undefined;
    const isContinuation = !!previousContent;

    // Llamar a Claude
    const basePrompt = templateData.prompt(inputs);
    const langInstruction = lang === 'en'
      ? '\n\nIMPORTANT: Write your ENTIRE response in English. Do not use any other language, regardless of the language used in the inputs above.'
      : '';
    const prompt = basePrompt + langInstruction;

    const messages: { role: 'user' | 'assistant'; content: string }[] = isContinuation
      ? [
          { role: 'user', content: prompt },
          { role: 'assistant', content: previousContent! },
          { role: 'user', content: lang === 'en'
            ? 'Continue from where you left off. Do not repeat what you already wrote — pick up exactly where the text was cut.'
            : 'Continúa desde donde lo dejaste. No repitas lo que ya escribiste — retoma exactamente donde se cortó el texto.' },
        ]
      : [{ role: 'user', content: prompt }];

    if (!userId) return Response.json({ error: 'No autorizado' }, { status: 401 });
    const ownerId = userId;
    const execute = async (readOnly = false) => {
      let task;
      try {
        task = await getMessagesTask({
          operationKey: operationKey ?? undefined,
          taskType: 'content.generate', userId: ownerId, language: lang === 'en' ? 'en' : 'es',
          instructionsVersion: 'generation-templates-v1', incompletePolicy: 'expose-text',
        });
      } catch {
        return Response.json({ error: 'Servicio no disponible temporalmente' }, { status: 503 });
      }
      const parameters = { max_tokens: maxTokens, messages };
      let data;
      try {
        if (readOnly) {
          if (!task.retrieve) return Response.json({ error: 'Generation unconfirmed', code: 'text_result_unconfirmed',
            retryMayConsume: false }, { status: 503 });
          data = await task.retrieve(parameters, { signal: request.signal });
          if (!data) return Response.json({ error: 'Generation unconfirmed', code: 'text_result_unconfirmed',
            retryMayConsume: false }, { status: 503 });
        } else data = await task.create(parameters, { signal: request.signal });
      } catch (error) {
        if (!readOnly) throw error;
        const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
        return Response.json({ error: code === 'invalid_format' ? 'Operation input changed' : 'Generation unconfirmed',
          code: 'text_result_unconfirmed', retryMayConsume: false }, { status: code === 'invalid_format' ? 409 : 503 });
      }
      const content = data.content?.[0]?.text;
      // The task boundary preserves unknown usage as null/absent. It is not
      // evidence of a measured zero, including partial text and keyed replay.
      const tokensUsed = data.usage?.output_tokens;
      const truncated = data.incomplete === true;
      if (typeof content !== 'string' || !content.trim() || typeof tokensUsed !== 'number'
        || !Number.isSafeInteger(tokensUsed) || tokensUsed < 0) {
        return Response.json({ error: 'Generation result unavailable' }, { status: 502 });
      }

      return { content, truncated, history: { template,
        inputs: { ...inputs, ...(generationId ? { _migrationRetry: { inputDigest, content, truncated } } : {}) },
        output: isContinuation ? previousContent + content : content, tokensUsed, ipAddress: getIp(request) } };
    };
    if (operationKey === null) return unkeyedTextGeneration(ownerId, request.signal, () => execute());
    return keyedTextGeneration(ownerId, generationId!, request.signal, preflight, () => execute(), () => execute(true));
  } catch (error) {
    console.error('API Error:', error);
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
    return Response.json({ error: 'Error al procesar la solicitud' }, { status: code === 'rate_limit' || code === 'quota' ? 429 : 500 });
  }
}
