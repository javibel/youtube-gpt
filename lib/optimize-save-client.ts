import { computeScore, validOptimizeDraft } from '@/lib/optimize-score';
import { beginOptimizeRead } from '@/lib/optimize-read-client';
import type { OptimizeRead } from '@/lib/optimize-read-client';
import type { OptimizeDraft, OptimizeCheck } from '@/lib/optimize-score';
import type { ScoreOwner } from '@/lib/optimize-score-client';

export interface OptimizeSaveInput extends OptimizeDraft {
  categoryId: string; original: { title: string; description: string; tags: string[] };
}
export type OptimizeSaveOutcome = { status: 'confirmed'; input: OptimizeSaveInput; score: number; checks: OptimizeCheck[]; aiSuggestion: { es: string; en: string } | null }
  | { status: 'rejected'; error: string } | { status: 'unconfirmed' };
export interface OptimizeSave {
  owner: ScoreOwner; input: OptimizeSaveInput; key: string; pending: boolean;
  original: Promise<OptimizeSaveOutcome>; waiter: Promise<OptimizeSaveOutcome>;
  outcome?: OptimizeSaveOutcome; waitOutcome?: OptimizeSaveOutcome; read?: OptimizeRead;
}
const attempts = new Map<string, OptimizeSave>(), denied = new Set<string>();
const identity = (owner: ScoreOwner, videoId: string) => 'ytubviral:optimize-save:' + JSON.stringify([owner.userId, owner.email, videoId]);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const uncertain = (): OptimizeSaveOutcome => ({ status: 'unconfirmed' });
const tagsEqual = (a: string[], b: unknown) => Array.isArray(b) && a.length === b.length && a.every((t, i) => t === b[i]);
export function validOptimizeSave(v: unknown): v is OptimizeSaveInput {
  return validOptimizeDraft(v) && object(v) && !!v.title.trim() && typeof v.categoryId === 'string'
    && /^\d{1,3}$/.test(v.categoryId) && object(v.original) && validOptimizeDraft({ ...v.original, videoId: v.videoId });
}
function acknowledgement(body: unknown, attempt: OptimizeSave): OptimizeSaveOutcome | null {
  const i = attempt.input, after = computeScore(i.title, i.description, i.tags), before = computeScore(i.original.title, i.original.description, i.original.tags);
  const changed = i.title !== i.original.title || i.description !== i.original.description || !tagsEqual(i.tags, i.original.tags);
  if (!object(body) || body.success !== true || body.userId !== attempt.owner.userId || body.email !== attempt.owner.email
    || body.operationKey !== attempt.key || !object(body.selection) || body.selection.videoId !== i.videoId || !validOptimizeSave(body.draft)
    || body.draft.videoId !== i.videoId || body.draft.title !== i.title || body.draft.description !== i.description
    || body.draft.categoryId !== i.categoryId || !tagsEqual(i.tags, body.draft.tags)
    || body.draft.original.title !== i.original.title || body.draft.original.description !== i.original.description || !tagsEqual(i.original.tags, body.draft.original.tags)
    || body.publicationStatus !== 'confirmed' || body.historyStatus !== (changed ? 'complete' : 'unchanged')
    || !['observed', 'unavailable'].includes(body.metricsStatus as string) || body.scoreAfter !== after.score || body.scoreBefore !== before.score
    || !Array.isArray(body.checks) || body.checks.length !== after.checks.length
    || body.checks.some((c, n) => !object(c) || c.key !== after.checks[n].key || c.ok !== after.checks[n].ok || c.w !== after.checks[n].w)) return null;
  const tip = body.aiSuggestion;
  if (tip !== null && (!object(tip) || typeof tip.es !== 'string' || !tip.es.trim() || tip.es.length > 1000 || typeof tip.en !== 'string' || !tip.en.trim() || tip.en.length > 1000)) return null;
  return { status: 'confirmed', input: i, score: after.score, checks: after.checks, aiSuggestion: tip === null ? null : { es: tip.es as string, en: tip.en as string } };
}
export function retainedOptimizeSave(owner: ScoreOwner, videoId: string): OptimizeSave | undefined { return attempts.get(identity(owner, videoId)); }
export function optimizeSaveBlocked(owner: ScoreOwner, videoId: string): boolean {
  const id = identity(owner, videoId), a = attempts.get(id);
  if (denied.has(id) || a && (!a.outcome || a.outcome.status === 'unconfirmed')) return true;
  try { return sessionStorage.getItem(id) !== null; } catch { return true; }
}
// Only the exact original live successful request can initiate its subsequent
// read. Stored IDs, serialized receipts and denial markers never recreate it.
export function readConfirmedOptimizeSave(a: OptimizeSave): OptimizeRead | null {
  if (attempts.get(identity(a.owner, a.input.videoId)) !== a || a.outcome?.status !== 'confirmed') return null;
  return a.read ??= beginOptimizeRead(a.owner, a.input.videoId, true);
}
export function beginOptimizeSave(owner: ScoreOwner, input: OptimizeSaveInput): OptimizeSave | null {
  const id = identity(owner, input.videoId), existing = attempts.get(id);
  if (existing && (!existing.outcome || existing.outcome.status === 'unconfirmed')) return existing;
  if (!owner.userId || !validOptimizeSave(input) || optimizeSaveBlocked(owner, input.videoId)) return null;
  let key: string;
  try {
    key = crypto.randomUUID();
    if (!/^[\w-]{1,128}$/.test(key)) return null;
    sessionStorage.setItem(id, 'pending');
  } catch { denied.add(id); return null; }
  const own = Object.freeze({ userId: owner.userId, email: owner.email });
  const draft = Object.freeze({ videoId: input.videoId, title: input.title, description: input.description, categoryId: input.categoryId,
    tags: Object.freeze([...input.tags]) as unknown as string[], original: Object.freeze({ title: input.original.title, description: input.original.description,
      tags: Object.freeze([...input.original.tags]) as unknown as string[] }) });
  const a: OptimizeSave = { owner: own, input: draft, key, pending: true, original: Promise.resolve(uncertain()), waiter: Promise.resolve(uncertain()) };
  attempts.set(id, a); const deadline = performance.now() + 60_000;
  a.original = Promise.resolve().then(async (): Promise<OptimizeSaveOutcome> => {
    let outcome = uncertain();
    try {
      if (performance.now() >= deadline) return outcome;
      const res = await fetch('/api/youtube/optimize', { method: 'PUT', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(draft) });
      const body: unknown = await res.json();
      outcome = res.ok && res.status === 200 ? acknowledgement(body, a) ?? uncertain() : uncertain();
      if (!res.ok && object(body) && [[401, 'Unauthorized'], [400, 'invalid_input'], [403, 'pro_required'], [400, 'youtube_not_connected']]
        .some(([status, error]) => res.status === status && body.error === error)) outcome = { status: 'rejected', error: body.error as string };
      if (outcome.status !== 'unconfirmed') {
        try { sessionStorage.removeItem(id); } catch { denied.add(id); }
      }
    } catch { /* A transport/private diagnostic is never a safe retry or receipt. */ }
    return outcome;
  }).then(outcome => { a.pending = false; a.outcome = outcome; return outcome; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  a.waiter = (async () => {
    try {
      const outcome = await Promise.race([a.original, new Promise<OptimizeSaveOutcome>(resolve => { timer = setTimeout(() => resolve(uncertain()), Math.max(0, deadline - performance.now())); })]);
      return a.waitOutcome = performance.now() >= deadline ? uncertain() : outcome;
    } finally { clearTimeout(timer); }
  })();
  return a;
}

// A new editor may consult old uncertainty only as a veto,including an email
// change. This never exposes or adopts a prior producer or clears its marker.
export function anyUnconfirmedOptimizeSave(userId:string,videoId:string):boolean {
 const matches=(key:string)=>{try{const data=JSON.parse(key.slice('ytubviral:optimize-save:'.length));return Array.isArray(data)&&data[0]===userId&&data[2]===videoId;}catch{return false;}};
 for(const[key,value]of attempts)if(matches(key)&&(!value.outcome||value.outcome.status==='unconfirmed'))return true;
 for(const key of denied)if(matches(key))return true;
 try{for(let i=0;i<sessionStorage.length;i++){const key=sessionStorage.key(i);if(key?.startsWith('ytubviral:optimize-save:')&&matches(key))return true;}return false;}catch{return true;}
}
