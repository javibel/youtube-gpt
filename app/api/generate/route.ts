import { TEMPLATES } from '@/utils/prompts';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getExtensionUser } from '@/lib/extension-auth';

const FREE_LIMIT = 10;
const PRO_LIMIT = 200;
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
    if (extAuth && !extAuth.isPro) {
      return Response.json({ error: 'pro_required' }, { status: 403 });
    }

    const { template, inputs, lang } = await request.json();

    // Validar longitud de inputs (previene prompts gigantes y costes desorbitados)
    const MAX_INPUT_LENGTH = 500;
    if (inputs && typeof inputs === 'object') {
      for (const [key, value] of Object.entries(inputs)) {
        if (typeof value === 'string' && value.length > MAX_INPUT_LENGTH) {
          return Response.json(
            { error: `El campo "${key}" es demasiado largo (máx ${MAX_INPUT_LENGTH} caracteres)` },
            { status: 400 }
          );
        }
      }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      return Response.json({ error: 'Servicio no disponible temporalmente' }, { status: 503 });
    }

    const templateData = TEMPLATES[template as keyof typeof TEMPLATES];
    if (!templateData) {
      return Response.json({ error: 'Template no válido' }, { status: 400 });
    }
    let userId: string | null = null;
    let isPro = false;

    if (extAuth) {
      // Extension Bearer token auth
      userId = extAuth.user.id;
      isPro = extAuth.isPro;
      const limit = isPro ? PRO_LIMIT : FREE_LIMIT;

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const usedThisMonth = await prisma.generation.count({
        where: { userId, createdAt: { gte: startOfMonth } },
      });
      if (usedThisMonth >= limit) {
        return Response.json(
          { error: isPro ? 'Límite del plan Pro alcanzado' : 'Límite del plan gratuito alcanzado', limitReached: true },
          { status: 429 }
        );
      }

      if (!isPro && (templateData as { proOnly?: boolean }).proOnly) {
        return Response.json(
          { error: 'Este template es exclusivo del plan Pro', limitReached: true },
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
    } else if (session?.user?.email) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      });
      if (user) {
        userId = user.id;

        const subscription = await prisma.subscription.findUnique({
          where: { userId: user.id },
          select: { status: true },
        });
        isPro = subscription?.status === 'active';
        const limit = isPro ? PRO_LIMIT : FREE_LIMIT;

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        // Verificar límite por cuenta
        const usedThisMonth = await prisma.generation.count({
          where: { userId, createdAt: { gte: startOfMonth } },
        });

        if (usedThisMonth >= limit) {
          return Response.json(
            { error: isPro ? 'Límite del plan Pro alcanzado' : 'Límite del plan gratuito alcanzado', limitReached: true },
            { status: 429 }
          );
        }

        // Bloquear templates Pro para usuarios free
        if (!isPro && (templateData as { proOnly?: boolean }).proOnly) {
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

    // Llamar a Claude
    const basePrompt = templateData.prompt(inputs);
    const langInstruction = lang === 'en'
      ? '\n\nIMPORTANT: Write your ENTIRE response in English. Do not use any other language, regardless of the language used in the inputs above.'
      : '';
    const prompt = basePrompt + langInstruction;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return Response.json(
        { error: error.error?.message || 'Error desconocido' },
        { status: response.status }
      );
    }

    const data = await response.json();
    const content = data.content[0].text;
    const tokensUsed = data.usage?.output_tokens ?? 0;

    // Guardar generación con IP
    if (userId) {
      const ip = getIp(request);
      await prisma.generation.create({
        data: { userId, template, inputs, output: content, tokensUsed, ipAddress: ip },
      });
    }

    return Response.json({ content });
  } catch (error) {
    console.error('API Error:', error);
    return Response.json({ error: 'Error al procesar la solicitud' }, { status: 500 });
  }
}
