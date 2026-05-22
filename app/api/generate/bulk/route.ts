import { TEMPLATES } from '@/utils/prompts';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserPlan, getLimits, isPaid } from '@/lib/plans';

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

    const { template, topics, options = {}, lang = 'es' } = await request.json();

    // Validate template
    const templateData = TEMPLATES[template as keyof typeof TEMPLATES];
    if (!templateData) {
      return Response.json({ error: 'Invalid template' }, { status: 400 });
    }

    // Validate topics
    if (!Array.isArray(topics) || topics.length < 1 || topics.length > maxTopics) {
      return Response.json({ error: `Provide 1-${maxTopics} topics` }, { status: 400 });
    }

    const cleanTopics = topics
      .map((t: string) => (typeof t === 'string' ? t.trim() : ''))
      .filter((t: string) => t.length > 0 && t.length <= 500);

    if (cleanTopics.length === 0) {
      return Response.json({ error: 'No valid topics' }, { status: 400 });
    }

    // Check remaining quota
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const usedThisMonth = await prisma.generation.count({
      where: { userId: session.user.id, createdAt: { gte: startOfMonth } },
    });

    const remaining = limits.generationsPerMonth - usedThisMonth;
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

    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      return Response.json({ error: 'Service unavailable' }, { status: 503 });
    }

    const ip = getIp(request);
    const LONG_TEMPLATES = new Set(['script', 'series', 'niche_analysis']);
    const maxTokens = LONG_TEMPLATES.has(template) ? 2048 : 1024;
    const langInstruction = lang === 'en'
      ? '\n\nIMPORTANT: Write your ENTIRE response in English.'
      : '';

    // Process topics sequentially to avoid API rate limits
    const results: { topic: string; content: string; error?: string }[] = [];

    for (const topic of cleanTopics) {
      try {
        const inputs = { tema: topic, ...options };
        const prompt = templateData.prompt(inputs) + langInstruction;

        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: maxTokens,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (!res.ok) {
          results.push({ topic, content: '', error: `API error ${res.status}` });
          continue;
        }

        const data = await res.json();
        const content = data.content[0].text;
        const tokensUsed = data.usage?.output_tokens ?? 0;

        // Save generation
        await prisma.generation.create({
          data: {
            userId: session.user.id,
            template,
            inputs: { tema: topic, ...options, _bulk: true },
            output: content,
            tokensUsed,
            ipAddress: ip,
          },
        });

        results.push({ topic, content });
      } catch (err) {
        results.push({
          topic,
          content: '',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
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
