/**
 * Generates the personalized daily video ideas for creators with a connected channel.
 *
 * Lives in lib/ rather than inside the cron route so it can be run on its own —
 * the route is just one caller. Suggested titles are graded by the Title Analyzer
 * rubric (lib/title-score.ts); keep the rules below in sync with it.
 */
import { prisma } from '@/lib/prisma';

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function generateDailyIdeas(): Promise<number> {
  const date = todayUTC();

  // Find users with connected YouTube channel who don't have ideas for today.
  // Gratis desde 13/07 (decisión Javier) — ya no se filtra por plan de pago,
  // ver project_channel_connect_free.md.
  const users = await prisma.youtubeToken.findMany({
    where: {
      channelId: { not: null },
      user: {
        dailyIdeas: { none: { date } },
      },
    },
    select: {
      userId: true,
      channelName: true,
      subscribers: true,
      videoCount: true,
    },
  });

  if (users.length === 0) return 0;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return 0;

  let generated = 0;

  for (const user of users) {
    try {
      // Fetch user's recent video titles for context
      const recentGens = await prisma.generation.findMany({
        where: { userId: user.userId, template: { in: ['title', 'description'] } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { output: true },
      });
      const recentTitles = recentGens.map(g => g.output.slice(0, 80)).join('\n');

      const subs = user.subscribers ? parseInt(user.subscribers, 10) : 0;
      const vids = user.videoCount ? parseInt(user.videoCount, 10) : 0;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: `You are a YouTube growth advisor. Generate 5 personalized video ideas for this creator.

Channel: ${user.channelName || 'Unknown'}
Subscribers: ${subs}
Total videos: ${vids}
Recent content: ${recentTitles || 'No recent titles available'}

Rules:
- Each idea must be specific and actionable, not generic
- Ideas should match the channel's apparent niche and size
- For small channels (<1K subs): focus on searchable, niche topics
- For medium channels (1K-50K): mix of search and trending topics
- For large channels (50K+): trending, collab ideas, series concepts
- Each idea: 1 sentence max explaining the angle

Suggested titles are graded by our free Title Analyzer (app/title-analyzer,
scored 0-100), which is the tool that judges a bare title — the SEO score grades
published videos and cannot fully judge a title on its own. Aim for 85+:
- 40-70 characters (25 pts)
- Contains a digit, e.g. "7 mistakes", "23 facts" — not spelled out (15 pts)
- At least TWO power words for full marks: how, why, best, easy, fast, free, new,
  secret, proven, ultimate, simple, stop, never, avoid, mistake, truth, guide,
  tips, real, honest, worst, top, vs, before, after (20 pts)
- Wrap a qualifier in brackets or parentheses, e.g. "(Explained)" (10 pts)
- 4-9 words total (10 pts)
- No ALL-CAPS words (10 pts)
- A search-intent hook: start with how/why/what, or end with "?" (10 pts)

Respond ONLY with JSON array, no other text:
[{"title_es":"título sugerido","title_en":"suggested title","idea_es":"explicación breve","idea_en":"brief explanation"}]`,
          }],
        }),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        console.error(`[daily-ideas] Anthropic API error for user ${user.userId}: ${res.status} ${errBody.slice(0, 300)}`);
        continue;
      }
      const aiData = await res.json();
      const raw: string = (aiData.content?.[0]?.text ?? '')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
      let ideas: unknown;
      try {
        ideas = JSON.parse(raw);
      } catch (parseErr) {
        console.error(`[daily-ideas] JSON parse failed for user ${user.userId}: ${parseErr instanceof Error ? parseErr.message : parseErr} — raw: ${raw.slice(0, 300)}`);
        continue;
      }
      if (!Array.isArray(ideas) || ideas.length === 0) {
        console.error(`[daily-ideas] Empty/non-array ideas for user ${user.userId} — raw: ${raw.slice(0, 300)}`);
        continue;
      }

      await prisma.dailyIdea.create({
        data: {
          userId: user.userId,
          date,
          ideas: ideas as unknown as import('@prisma/client').Prisma.InputJsonValue,
        },
      });
      generated++;
    } catch (err) {
      // Antes tragaba el error sin loguear nada — con 0 filas de DailyIdea
      // en toda la historia de producción (11/07/2026) era imposible saber
      // por qué. Ahora queda rastro para el próximo cron (07:15 UTC).
      console.error(`[daily-ideas] Unexpected error for user ${user.userId}: ${err instanceof Error ? err.message : err}`);
    }
  }

  return generated;
}
