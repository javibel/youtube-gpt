import { captureAbTitleMetadata,readAbVideoOriginal,publishAbTitleOriginal,reportedAbViews } from '@/lib/ab-title-metadata';
import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';
import { observeAbWindows } from '@/lib/ab-observation';
import { beginAbTestTransition } from '@/lib/ab-test';

type ProcessorResult = { switched: number; completed: number; errors: string[]; unconfirmed?: true };

// This budget retires only the caller. The original title and SQL
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

      const video = await readAbVideoOriginal(token, test.videoId);
      beforeStep?.();
      if (!video) {
        errors.push(`A/B test ${test.id}: video not found`);
        continue;
      }

      const currentViews=reportedAbViews(video);if(currentViews===null){errors.push('A/B source views unavailable');continue;}
      const payload=captureAbTitleMetadata(video,test.videoId,test.variantB);
      const admission = await beginAbTestTransition(test.userId, test, { action: 'switch_variant', at: now, views: currentViews }, beforeStep);
      if (!admission.ok) { errors.push(`A/B test ${test.id}: switch unconfirmed`); continue; }
      beforeStep?.();

      // Switch title to variant B
      const ack=await publishAbTitleOriginal(token,payload);
      if (!ack.ok) {
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

      const video = await readAbVideoOriginal(token, test.videoId);
      beforeStep?.();
      if (!video) {
        errors.push(`A/B test ${test.id}: video not found for completion`);
        continue;
      }

      const endViews=reportedAbViews(video);if(endViews===null){errors.push('A/B source views unavailable');continue;}
      const observation = observeAbWindows({ ...test, endViews, completedAt: now });
      if (!observation) { errors.push('A/B observation incomplete or inconsistent'); continue; }
      const winner = observation.leadingWindow;
      const selectedTitle = observation.selectedVariant === 'A' ? test.variantA : test.variantB;
      const payload=captureAbTitleMetadata(video,test.videoId,selectedTitle);
      const admission = await beginAbTestTransition(test.userId, test, { action: 'complete_test', at: now, views: endViews, winner }, beforeStep);
      if (!admission.ok) { errors.push(`A/B test ${test.id}: completion unconfirmed`); continue; }
      beforeStep?.();

      // Existing policy selects the larger raw delta, keeping A on a tie.
      // Neither this policy nor the sequential observations prove title efficacy.
      if (!(await publishAbTitleOriginal(token,payload)).ok) {
        errors.push(`A/B test ${test.id}: failed to apply selected title`);
        continue;
      }

      // No model can infer a cause or CTR from these lifetime-view counters.
      // The same invoked publisher still owns mandatory SQL after caller retirement.
      await admission.complete();
      completed++;
    } catch (err) {
      errors.push(`A/B test ${test.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { switched, completed, errors };
}
