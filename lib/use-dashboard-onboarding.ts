'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const initial = () => ({ step: null as number|null, name: '', topic: '', result: null as string|null,
  loading: false, saving: false, generating: false, copied: false, error: false, generationError: false });
function decode(value: unknown, userId: string, minimum = 0) {
  const data = value as { userId?: unknown; step?: unknown; name?: unknown } | null;
  if (!data || data.userId !== userId || typeof data.step !== 'number' || !Number.isSafeInteger(data.step)
    || data.step < minimum || data.step > 99 || !(data.name === null || typeof data.name === 'string')) throw Error('Invalid onboarding');
  return { step: data.step, name: data.name ?? '' };
}

export function useDashboardOnboarding(userId: string|undefined, email: string|null|undefined, authStatus: string,
  lang: string, refreshStats: () => Promise<void>, refreshHistory: () => Promise<void>) {
  const scope = useMemo(() => ({ active: true, flight: null as Promise<boolean>|null, target: null as number|null,
    generation: null as Promise<void>|null, generated: false, sequence: 0, timer: null as ReturnType<typeof setTimeout>|null }), [userId,email,authStatus]);
  const active = useRef(scope); active.current = scope;
  const [store,setStore] = useState(() => ({ scope, ...initial() }));
  const current = useCallback(() => active.current === scope && scope.active && authStatus === 'authenticated' && !!userId,
    [scope,authStatus,userId]);
  const update = useCallback((fn: (v: ReturnType<typeof initial>) => ReturnType<typeof initial>) => {
    if (current()) setStore(prev => ({ scope, ...fn(prev.scope === scope ? prev : initial()) }));
  }, [scope,current]);
  const request = useCallback(async (target: number|null): Promise<boolean> => {
    if (!current()) return false;
    if (scope.flight) return target === scope.target ? scope.flight : false;
    if (target !== null && (!Number.isSafeInteger(target) || target < 0 || target > 99)) return false;
    scope.target = target;
    update(v => ({ ...v, loading: target === null, saving: target !== null, error: false }));
    const flight = (async () => {
      try {
        const response = await fetch('/api/onboarding', target === null ? { cache: 'no-store' } : {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: target }) });
        if (!response.ok) throw Error('Onboarding unavailable');
        const data = decode(await response.json(), userId!, target ?? 0);
        if (!current()) return false;
        update(v => ({ ...v, ...data })); scope.target = null; return true;
      } catch {
        if (current()) update(v => ({ ...v,error: true }));
        return false;
      } finally {
        update(v => ({ ...v,loading: false,saving: false }));
      }
    })();
    scope.flight = flight;
    try { return await flight; } finally { if (scope.flight === flight) scope.flight = null; }
  }, [scope,current,update,userId]);
  const advanceOnboarding = useCallback((step: number) => request(step), [request]);
  const retryOnboarding = useCallback(() => request(scope.target), [request,scope]);
  const setOnboardingTopic = useCallback((topic: string) => update(v => ({ ...v,topic })), [update]);
  const runOnboardingGenerate = useCallback(async (rawTopic: string) => {
    if (!current() || scope.flight) return;
    if (scope.generation) return scope.generation;
    // A result waiting for step persistence must never spend another generation.
    if (scope.generated || store.scope !== scope || store.step !== 1) return;
    const topic = rawTopic.trim(); if (topic.length < 3 || topic.length > 200) return;
    update(v => ({ ...v,topic,generating: true,generationError: false }));
    const generation = (async () => {
      try {
        const response = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template: 'title', inputs: { tema: topic }, lang }) });
        if (!response.ok) throw Error('Generation failed');
        const data = await response.json();
        if (typeof data?.content !== 'string' || !data.content.trim()) throw Error('Invalid result');
        if (!current()) return;
        scope.generated = true;
        update(v => ({ ...v,result: data.content }));
        await advanceOnboarding(2);
        if (current()) { void refreshStats(); void refreshHistory(); }
      } catch { if (current()) update(v => ({ ...v,generationError: true })); }
      finally { update(v => ({ ...v,generating: false })); }
    })();
    scope.generation = generation;
    try { await generation; } finally { if (scope.generation === generation) scope.generation = null; }
  }, [scope,current,update,store,lang,advanceOnboarding,refreshStats,refreshHistory]);
  const copyOnboarding = useCallback(async () => {
    if (!current() || store.scope !== scope || !store.result) return;
    const sequence = ++scope.sequence;
    try {
      await navigator.clipboard.writeText(store.result);
      if (!current() || sequence !== scope.sequence) return;
      if (scope.timer) clearTimeout(scope.timer);
      update(v => ({ ...v,copied: true }));
      scope.timer = setTimeout(() => { if (current() && sequence === scope.sequence) update(v => ({ ...v,copied: false })); },2000);
    } catch { /* Copy failure does not discard the generated result. */ }
  }, [scope,current,store,update]);
  useEffect(() => {
    scope.active = true; active.current = scope; setStore({ scope, ...initial() }); void request(null);
    return () => { scope.active = false; if (scope.timer) clearTimeout(scope.timer); };
  }, [scope,request]);
  const view = store.scope === scope && current() ? store : initial();
  return { onboardingStep: view.step, onboardingName: view.name, onboardingTopic: view.topic,
    onboardingResult: view.result, onboardingGenerating: view.generating, onboardingCopied: view.copied,
    onboardingBusy: view.loading || view.saving || view.generating,
    onboardingError: view.error || (authStatus === 'authenticated' && !userId), generationError: view.generationError,
    advanceOnboarding, retryOnboarding, runOnboardingGenerate, setOnboardingTopic, copyOnboarding };
}

