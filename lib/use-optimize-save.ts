'use client';
import { useEffect, useRef, useState } from 'react';
import { beginOptimizeSave, optimizeSaveBlocked, retainedOptimizeSave } from '@/lib/optimize-save-client';
import type { OptimizeSave, OptimizeSaveInput, OptimizeSaveOutcome } from '@/lib/optimize-save-client';
import type { ScoreOwner } from '@/lib/optimize-score-client';

export function useOptimizeSave(owner: ScoreOwner, status: string, videoId: string | null, language: string, draftScope: string) {
  const identity = JSON.stringify([owner.userId, owner.email, videoId]), scope = JSON.stringify([status, identity, language, draftScope]);
  const current = useRef({ scope, identity, attempt: null as OptimizeSave | null });
  if (current.current.scope !== scope) current.current = { scope, identity, attempt: current.current.identity === identity ? current.current.attempt : null };
  const mounted = useRef(true);
  const [view, setView] = useState<{ scope: string; attempt: OptimizeSave; outcome?: OptimizeSaveOutcome } | null>(null);
  const [, renderDenial] = useState(0);
  const active = () => mounted.current && current.current.scope === scope && status === 'authenticated' && !!owner.userId && videoId !== null;
  const relevant = active() && view?.scope === scope && view.attempt === current.current.attempt ? view : null;
  function observe(a: OptimizeSave, alive: () => boolean = () => true) {
    current.current.attempt = a;
    const apply = (outcome?: OptimizeSaveOutcome) => { if (alive() && active() && current.current.attempt === a) setView({ scope, attempt: a, outcome }); };
    apply(a.outcome ?? a.waitOutcome);
    void a.original.then(apply); void a.waiter.then(outcome => { if (!a.outcome) apply(outcome); });
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let alive = true;
    if (active()) { const a = current.current.attempt ?? retainedOptimizeSave(owner, videoId!); if (a) observe(a, () => alive); }
    return () => { alive = false; };
  }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps
  function start(input: OptimizeSaveInput) {
    if (!active() || input.videoId !== videoId || optimizeSaveBlocked(owner, videoId!)) return;
    const a = beginOptimizeSave(owner, input); if (a) observe(a); else renderDenial(n => n + 1);
  }
  return { canAct: active, canEdit: () => active() && !optimizeSaveBlocked(owner, videoId!),
    currentAttempt: () => active() ? current.current.attempt ?? retainedOptimizeSave(owner, videoId!) : null,
    start, attempt: relevant?.attempt ?? null, outcome: relevant?.outcome,
    saving: !!relevant && !relevant.outcome, blocked: active() && optimizeSaveBlocked(owner, videoId!), pending: !!relevant?.attempt.pending };
}
