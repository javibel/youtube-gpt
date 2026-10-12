import { getMessagesTask } from '@/lib/ai/task-runtime';
import type { BestTimeAnalysis } from './best-time-analysis';

// Only the admitted original calls this function. Factory/create are awaited
// directly, without retrieve, retries or a replacement promise. Policy, model,
// credentials, accounting and budget remain in the installed common runtime.
export async function generateBestTimeTip(owner: Readonly<{ id: string; email: string }>, operationKey: string,
  analysis: Extract<BestTimeAnalysis, { status: 'ready' }>, check: () => void, signal: AbortSignal): Promise<Readonly<{ es: string; en: string }> | null> {
  check();
  const slots = analysis.topSlots.map(s => ({ day: s.day, hour: s.hour, score: s.score, videoCount: s.videoCount }));
  const task = await getMessagesTask({ operationKey, taskType: 'youtube.best-time-tip', userId: owner.id, language: 'es,en',
    instructionsVersion: 'best-time-tip-v1', incompletePolicy: 'reject',
    outputSchema: { type: 'object', properties: { es: { type: 'string', minLength: 1, maxLength: 4096 }, en: { type: 'string', minLength: 1, maxLength: 4096 } }, required: ['es', 'en'], additionalProperties: false } });
  check();
  const result = await task.create({ max_tokens: 200, messages: [{ role: 'user', content:
    `Publishing-time statistics from ${analysis.videoCount} videos. Days are UTC, Monday=0, Sunday=6. Selected slots: ${JSON.stringify(slots)}. `
    + 'Give a brief actionable publishing recommendation in 1-2 sentences, describe this as observed performance rather than a guaranteed cause. Respond only with JSON {"es":"consejo en español","en":"tip in English"}.' }] }, { signal });
  check();
  // A thrown/uncertain runtime result propagates and keeps business exclusion.
  // Optional means that a *completed original* with unusable text may contribute
  // no tip. It never means assuming a failed/pending model stopped or settled.
  const execution = Object.getOwnPropertyDescriptor(result, 'execution')?.value;
  const accounting = Object.getOwnPropertyDescriptor(result, 'accounting')?.value;
  if (result.incomplete !== false || Object.getOwnPropertyDescriptor(execution ?? {}, 'status')?.value !== 'completed'
    || Object.getOwnPropertyDescriptor(accounting ?? {}, 'state')?.value !== 'settled') throw Error('Best time tip original unconfirmed');
  let tip: Readonly<{ es: string; en: string }> | null = null;
  try {
    if (!Array.isArray(result.content) || result.content.length !== 1 || result.content[0].type !== 'text') throw Error();
    const text = result.content[0].text;
    if (typeof text !== 'string' || text.length > 16_384) throw Error();
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length !== 2) throw Error();
    const es = Object.getOwnPropertyDescriptor(parsed, 'es')?.value, en = Object.getOwnPropertyDescriptor(parsed, 'en')?.value;
    if (typeof es !== 'string' || !es.trim() || es.length > 4096 || typeof en !== 'string' || !en.trim() || en.length > 4096) throw Error();
    tip = Object.freeze({ es, en });
  } catch { /* The original returned complete; omit unusable optional text. */ }
  check(); return tip;
}
