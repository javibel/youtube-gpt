import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

async function fetchVideoData(token: string, videoId: string) {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json();
  return data.items?.[0] ?? null;
}

async function updateTitle(token: string, videoId: string, title: string, categoryId: string) {
  const res = await fetch(
    'https://www.googleapis.com/youtube/v3/videos?part=snippet',
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: videoId, snippet: { title, categoryId } }),
    },
  );
  return res.ok;
}

export async function processAbTests(): Promise<{ switched: number; completed: number; errors: string[] }> {
  const errors: string[] = [];
  let switched = 0;
  let completed = 0;
  const now = new Date();

  // 1. Switch tests from variant_a → variant_b
  const testsToSwitch = await prisma.abTest.findMany({
    where: { status: 'variant_a' },
  });

  for (const test of testsToSwitch) {
    const switchTime = new Date(test.startedAt.getTime() + test.hoursPerVariant * 3600_000);
    if (now < switchTime) continue;

    try {
      const token = await getAccessToken(test.userId);
      if (!token) {
        errors.push(`A/B test ${test.id}: no YouTube token`);
        continue;
      }

      const video = await fetchVideoData(token, test.videoId);
      if (!video) {
        errors.push(`A/B test ${test.id}: video not found`);
        continue;
      }

      const currentViews = parseInt(video.statistics?.viewCount ?? '0', 10);

      // Switch title to variant B
      const ok = await updateTitle(token, test.videoId, test.variantB, video.snippet.categoryId);
      if (!ok) {
        errors.push(`A/B test ${test.id}: failed to update title to variant B`);
        continue;
      }

      await prisma.abTest.update({
        where: { id: test.id },
        data: {
          status: 'variant_b',
          switchedAt: now,
          switchViews: currentViews,
        },
      });
      switched++;
    } catch (err) {
      errors.push(`A/B test ${test.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Complete tests from variant_b → completed
  const testsToComplete = await prisma.abTest.findMany({
    where: { status: 'variant_b', switchedAt: { not: null } },
  });

  for (const test of testsToComplete) {
    const endTime = new Date(test.switchedAt!.getTime() + test.hoursPerVariant * 3600_000);
    if (now < endTime) continue;

    try {
      const token = await getAccessToken(test.userId);
      if (!token) {
        errors.push(`A/B test ${test.id}: no YouTube token for completion`);
        continue;
      }

      const video = await fetchVideoData(token, test.videoId);
      if (!video) {
        errors.push(`A/B test ${test.id}: video not found for completion`);
        continue;
      }

      const endViews = parseInt(video.statistics?.viewCount ?? '0', 10);
      const viewsA = (test.switchViews ?? 0) - test.initialViews;
      const viewsB = endViews - (test.switchViews ?? 0);

      // Determine winner
      const winner = viewsA > viewsB ? 'A' : viewsB > viewsA ? 'B' : 'A';

      // Set winning title
      const winningTitle = winner === 'A' ? test.variantA : test.variantB;
      await updateTitle(token, test.videoId, winningTitle, video.snippet.categoryId);

      // AI insight
      let aiInsight: { es: string; en: string } | null = null;
      try {
        const prompt = `A/B test results for a YouTube video:
Original title: "${test.originalTitle}"
Variant A: "${test.variantA}" — ${viewsA} views in ${test.hoursPerVariant}h
Variant B: "${test.variantB}" — ${viewsB} views in ${test.hoursPerVariant}h
Winner: Variant ${winner}

Give a brief insight (1-2 sentences) about why the winning title likely performed better and what the creator can learn. Respond as JSON: {"es":"...","en":"..."}`;

        const msg = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          messages: [{ role: 'user', content: prompt }],
        });
        const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
        const cleaned = text.replace(/```json\s*/g, '').replace(/```/g, '').trim();
        aiInsight = JSON.parse(cleaned);
      } catch {
        // Non-critical
      }

      await prisma.abTest.update({
        where: { id: test.id },
        data: {
          status: 'completed',
          completedAt: now,
          endViews,
          winner,
          aiInsight: aiInsight ?? undefined,
        },
      });
      completed++;
    } catch (err) {
      errors.push(`A/B test ${test.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { switched, completed, errors };
}
