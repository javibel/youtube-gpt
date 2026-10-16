import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { getMessagesTask } from '@/lib/ai/task-runtime';
import { runCronDailyTip, type NativeCronDailyTip } from '@/lib/cron-dispatch-original';

const prompt = `Genera un tip práctico y específico para YouTubers sobre cómo mejorar su canal (títulos, thumbnails, SEO, retención, monetización, algoritmo, etc.).

El tip debe:
- Ser concreto y accionable, no genérico
- Incluir un dato o porcentaje real si es posible
- Tener máximo 2 frases
- Variar el tema respecto a tips comunes (sé creativo)

Responde SOLO con JSON en este formato exacto, sin texto adicional:
{"es": "tip en español aquí", "en": "tip in english here"}`;

export function generateDailyTipOriginal(original: NativeCronDailyTip): Promise<{ skipped: boolean }> {
  return runCronDailyTip(original, async ({ date, checkBeforeDispatch: check }) => {
    check();
    const existing = await prisma.dailyTip.findUnique({ where: { date }, select: { date: true } });
    check();
    if (existing) {
      if (existing.date !== date) throw Error('daily_tip_unconfirmed');
      return { skipped: true };
    }
    const attemptId = randomUUID();
    check();
    const admission = await prisma.$queryRawUnsafe<{ id: string; date: string; state: string }[]>(`
      INSERT INTO daily_tip_generation_attempts (id,date)
      SELECT $1,$2 WHERE NOT EXISTS (SELECT 1 FROM daily_tips WHERE date=$2)
      ON CONFLICT (date) DO NOTHING RETURNING id,date,state`, attemptId, date);
    // An existing pending/completed marker is only a veto. Only this INSERT's
    // own ACK can admit the new producer; a lost ACK is never reconstructed.
    if (!Array.isArray(admission) || admission.length !== 1 || Object.keys(admission[0]).length !== 3
      || admission[0].id !== attemptId || admission[0].date !== date || admission[0].state !== 'pending') throw Error('daily_tip_unconfirmed');
    check();
    const task = await getMessagesTask({ operationKey: attemptId, serviceId: 'morning-cron', taskType: 'site.daily-tip', language: 'es', instructionsVersion: 'daily-tip-v1',
      outputSchema: { type: 'object', required: ['es', 'en'], additionalProperties: false, properties: { es: { type: 'string', minLength: 1 }, en: { type: 'string', minLength: 1 } } } });
    check();
    // Once invoked, keep this exact producer promise through its own atomic
    // completion, even if the caller retires. Never retrieve/restart a model.
    const result = await task.create({ max_tokens: 300, messages: [{ role: 'user', content: prompt }] });
    if (!Array.isArray(result.content) || result.content.length !== 1 || result.content[0]?.type !== 'text'
      || typeof result.content[0].text !== 'string') throw Error('daily_tip_unconfirmed');
    const value = JSON.parse(result.content[0].text) as Record<string, unknown>;
    if (!value || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'en,es'
      || !['es', 'en'].every(k => typeof value[k] === 'string' && value[k].trim().length > 0 && value[k].length <= 1000)) throw Error('daily_tip_unconfirmed');
    const saved = await prisma.$queryRawUnsafe<{ date: string; attemptId: string }[]>(`
      WITH own AS MATERIALIZED (
        SELECT id FROM daily_tip_generation_attempts WHERE id=$1 AND date=$2 AND state='pending' FOR UPDATE
      ), saved AS (
        INSERT INTO daily_tips (date,es,en)
        SELECT $2,$3,$4 FROM own ON CONFLICT (date) DO NOTHING RETURNING date
      ), completed AS (
        UPDATE daily_tip_generation_attempts SET state='completed',"completedAt"=timezone('UTC',clock_timestamp())
        WHERE id=$1 AND date=$2 AND state='pending' AND EXISTS(SELECT 1 FROM saved) RETURNING id
      ) SELECT s.date,c.id AS "attemptId" FROM saved s CROSS JOIN completed c`, attemptId, date, value.es, value.en);
    if (!Array.isArray(saved) || saved.length !== 1 || Object.keys(saved[0]).length !== 2
      || saved[0].date !== date || saved[0].attemptId !== attemptId) throw Error('daily_tip_unconfirmed');
    return { skipped: false };
  });
}
