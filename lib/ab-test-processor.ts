import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';
import { getMessagesTask } from '@/lib/ai/task-runtime';
import { beginAbTestTransition } from '@/lib/ab-test';

type ProcessorResult = { switched: number; completed: number; errors: string[]; unconfirmed?: true };

// This budget retires only the caller. The original title, insight and SQL
// promises stay observed; a pending durable reservation never authorizes replay.
export async function processAbTests(beforeStep?: () => void): Promise<ProcessorResult> {
  const deadline = performance.now() + 55_000;
  const stoppedError = new Error('ab_processor_unconfirmed');
  let retired = false;
  let rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => {
    if (!retired) { retired = true; rejectWait(stoppedError); }
  };
  const checkDeadline = () => {
    if (performance.now() >= deadline) retire();
    if (retired) throw stoppedError;
  };
  const check = () => {
    checkDeadline();
    beforeStep?.();
    checkDeadline();
  };
  const timer = setTimeout(retire, 55_000);
  try {
    const original = Promise.resolve().then(() => { check(); return runAbTests(check); });
    const result = await Promise.race([original, stopped]);
    checkDeadline(); return result;
  } catch (error) {
    if (error !== stoppedError) throw error;
    // Zero counters are unconfirmed, not proof that no title/SQL was applied.
    return { switched: 0, completed: 0, errors: ['ab_processor_unconfirmed'], unconfirmed: true };
  } finally { clearTimeout(timer); }
}

async function fetchVideoData(token: string, videoId: string) {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
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

async function runAbTests(beforeStep: () => void): Promise<ProcessorResult> {
  const errors: string[] = [];
  let switched = 0;
  let completed = 0;
  const now = new Date();

  // 1. Switch tests from variant_a → variant_b
  const testsToSwitch = await prisma.abTest.findMany({
    where: { status: 'variant_a' },
  });

  beforeStep?.();
  for (const found of testsToSwitch) {
    beforeStep();
    const test = { ...found };
    const switchTime = new Date(test.startedAt.getTime() + test.hoursPerVariant * 3600_000);
    if (now < switchTime) continue;

    try {
      beforeStep?.();
      const token = await getAccessToken(test.userId, beforeStep);
      beforeStep?.();
      if (!token) {
        errors.push(`A/B test ${test.id}: no YouTube token`);
        continue;
      }

      const video = await fetchVideoData(token, test.videoId);
      beforeStep?.();
      if (!video) {
        errors.push(`A/B test ${test.id}: video not found`);
        continue;
      }

      const currentViews = parseInt(video.statistics?.viewCount ?? '0', 10);
      if (typeof video.snippet?.categoryId !== 'string' || !video.snippet.categoryId.trim()
        || !/^\d+$/.test(String(video.statistics?.viewCount ?? '0'))) {
        errors.push(`A/B test ${test.id}: invalid video data`); continue;
      }
      const admission = await beginAbTestTransition(test.userId, test, { action: 'switch_variant', at: now, views: currentViews }, beforeStep);
      if (!admission.ok) { errors.push(`A/B test ${test.id}: switch unconfirmed`); continue; }
      beforeStep?.();

      // Switch title to variant B
      const ok = await updateTitle(token, test.videoId, test.variantB, video.snippet.categoryId);
      if (!ok) {
        errors.push(`A/B test ${test.id}: failed to update title to variant B`);
        continue;
      }

      // Once the original title starts, retain its original completion even
      // if the caller stops waiting. A pending row never permits a new producer.
      await admission.complete();
      switched++;
    } catch (err) {
      errors.push(`A/B test ${test.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Complete tests from variant_b → completed
  beforeStep?.();
  const testsToComplete = await prisma.abTest.findMany({
    where: { status: 'variant_b', switchedAt: { not: null } },
  });

  beforeStep?.();
  for (const found of testsToComplete) {
    beforeStep();
    const test = { ...found };
    const endTime = new Date(test.switchedAt!.getTime() + test.hoursPerVariant * 3600_000);
    if (now < endTime) continue;

    try {
      beforeStep?.();
      const token = await getAccessToken(test.userId, beforeStep);
      beforeStep?.();
      if (!token) {
        errors.push(`A/B test ${test.id}: no YouTube token for completion`);
        continue;
      }

      const video = await fetchVideoData(token, test.videoId);
      beforeStep?.();
      if (!video) {
        errors.push(`A/B test ${test.id}: video not found for completion`);
        continue;
      }

      const endViews = parseInt(video.statistics?.viewCount ?? '0', 10);
      if (typeof video.snippet?.categoryId !== 'string' || !video.snippet.categoryId.trim()
        || !/^\d+$/.test(String(video.statistics?.viewCount ?? '0'))) {
        errors.push(`A/B test ${test.id}: invalid completion data`); continue;
      }
      const viewsA = (test.switchViews ?? 0) - test.initialViews;
      const viewsB = endViews - (test.switchViews ?? 0);

      // Determine winner
      const winner = viewsA > viewsB ? 'A' : viewsB > viewsA ? 'B' : 'A';
      const admission = await beginAbTestTransition(test.userId, test, { action: 'complete_test', at: now, views: endViews, winner }, beforeStep);
      if (!admission.ok) { errors.push(`A/B test ${test.id}: completion unconfirmed`); continue; }
      beforeStep?.();

      // Set winning title
      const winningTitle = winner === 'A' ? test.variantA : test.variantB;
      if (!await updateTitle(token, test.videoId, winningTitle, video.snippet.categoryId)) {
        errors.push(`A/B test ${test.id}: failed to apply winning title`);
        continue;
      }

      // AI insight
      let aiInsight: { es: string; en: string } | null = null;
      try {
        beforeStep?.();
        const prompt = `A/B test results for a YouTube video:
Original title: "${test.originalTitle}"
Variant A: "${test.variantA}" — ${viewsA} views in ${test.hoursPerVariant}h
Variant B: "${test.variantB}" — ${viewsB} views in ${test.hoursPerVariant}h
Winner: Variant ${winner}

Give a brief insight (1-2 sentences) about why the winning title likely performed better and what the creator can learn. Respond as JSON: {"es":"...","en":"..."}`;

        const task = await getMessagesTask({ userId: test.userId, taskType: 'youtube.ab-result-insight', language: 'es', instructionsVersion: 'ab-result-insight-v1',
          outputSchema: { type: 'object', required: ['es', 'en'], additionalProperties: false, properties: { es: { type: 'string', minLength: 1 }, en: { type: 'string', minLength: 1 } } },
        });
        beforeStep?.();
        const msg = await task.create({
          max_tokens: 200,
          messages: [{ role: 'user', content: prompt }],
        });
        const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
        aiInsight = JSON.parse(text);
      } catch {
        // Non-critical
      }

      await admission.complete(aiInsight ?? undefined);
      completed++;
    } catch (err) {
      errors.push(`A/B test ${test.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { switched, completed, errors };
}
