import { TEMPLATES } from '@/utils/prompts';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const FREE_LIMIT = 10;

export async function POST(request: Request) {
  try {
    const { apiKey, template, inputs } = await request.json();

    if (!apiKey || !apiKey.startsWith('sk-ant-')) {
      return Response.json({ error: 'API key inválida' }, { status: 400 });
    }

    const templateData = TEMPLATES[template as keyof typeof TEMPLATES];
    if (!templateData) {
      return Response.json({ error: 'Template no válido' }, { status: 400 });
    }

    // Resolver usuario autenticado una sola vez
    const session = await auth();
    let userId: string | null = null;

    if (session?.user?.email) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      });
      if (user) {
        userId = user.id;

        // Verificar si tiene plan Pro
        const subscription = await prisma.subscription.findUnique({
          where: { userId: user.id },
          select: { status: true },
        });
        const isPro = subscription?.status === 'active';

        if (!isPro) {
          // Verificar límite ANTES de llamar a Claude
          const startOfMonth = new Date();
          startOfMonth.setDate(1);
          startOfMonth.setHours(0, 0, 0, 0);

          const usedThisMonth = await prisma.generation.count({
            where: { userId, createdAt: { gte: startOfMonth } },
          });

          if (usedThisMonth >= FREE_LIMIT) {
            return Response.json(
              { error: 'Límite del plan gratuito alcanzado', limitReached: true },
              { status: 429 }
            );
          }
        }
      }
    }

    // Llamar a Claude
    const prompt = templateData.prompt(inputs);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-1-20250805',
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

    // Guardar generación en BD si el usuario está autenticado
    if (userId) {
      await prisma.generation.create({
        data: { userId, template, inputs, output: content, tokensUsed },
      });
    }

    return Response.json({ content });
  } catch (error) {
    console.error('API Error:', error);
    return Response.json({ error: 'Error al procesar la solicitud' }, { status: 500 });
  }
}
