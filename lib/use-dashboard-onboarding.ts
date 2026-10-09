'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClientReadWait } from '@/lib/client-read-wait';
import { readWelcomeRecovery, storeWelcomeRecovery, clearWelcomeRecovery } from '@/lib/onboarding-generation-recovery';

const initial = () => ({ step: null as number|null, name: '', topic: '', result: null as string|null,
  loading: false, saving: false, generating: false, copied: false, error: false, generationError: false,
  generationTimedOut: false, generationPending: false, generationRestored: false, storageUnavailable: false, truncated: false });
function decode(value: unknown, userId: string, minimum = 0) {
  const data = value as { userId?: unknown; step?: unknown; name?: unknown } | null;
  if (!data || data.userId !== userId || typeof data.step !== 'number' || !Number.isSafeInteger(data.step)
    || data.step < minimum || data.step > 99 || !(data.name === null || typeof data.name === 'string')) throw Error('Invalid onboarding');
  return { step: data.step, name: data.name ?? '' };
}

export function useDashboardOnboarding(userId: string|undefined, email: string|null|undefined, authStatus: string,
  lang: string, refreshStats: () => Promise<void>, refreshHistory: () => Promise<void>) {
  const scope = useMemo(() => ({ active: true, flight: null as Promise<boolean>|null, target: null as number|null,
    waiting: null as ReturnType<typeof createClientReadWait>|null,
    generation: null as Promise<void>|null, generated: false, step: null as number|null,
    operation: null as {key: string; body: string; topic: string; stepTarget?: 2}|null,
    restored: false,
    controller: null as AbortController|null, deadline: null as ReturnType<typeof setTimeout>|null,
    sequence: 0, timer: null as ReturnType<typeof setTimeout>|null }), [userId,email,authStatus,lang]);
  const active = useRef(scope); active.current = scope;
  const [store,setStore] = useState(() => ({ scope, ...initial() }));
  const current = useCallback(() => active.current === scope && scope.active && authStatus === 'authenticated' && !!userId,
    [scope,authStatus,userId]);
  const update = useCallback((fn: (v: ReturnType<typeof initial>) => ReturnType<typeof initial>) => {
    if (current()) setStore(prev => ({ scope, ...fn(prev.scope === scope ? prev : initial()) }));
  }, [scope,current]);
  const request = useCallback(async (target: number|null, fromGeneration = false): Promise<boolean> => {
    if (!current()) return false;
    if (scope.generation && !fromGeneration) return false;
    if (scope.flight) return target === scope.target ? scope.flight : false;
    if (target !== null && (!Number.isSafeInteger(target) || target < 0 || target > 99)) return false;
    // A restored step selector cannot advance the welcome until the original
    // retained result has been confirmed by the authenticated API.
    if (target !== null && target < 4 && scope.operation?.stepTarget === 2 && !scope.generated) return false;
    scope.target = target;
    const waiting = createClientReadWait(); scope.waiting = waiting;
    update(v => ({ ...v, loading: target === null, saving: target !== null, error: false }));
    const flight = (async () => {
      try {
        const response = await waiting.wait(fetch('/api/onboarding', target === null ? { cache: 'no-store', signal: waiting.signal } : {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: target }), signal: waiting.signal }));
        if (!response.ok) throw Error('Onboarding unavailable');
        const data = decode(await waiting.wait(response.json()), userId!, target ?? 0);
        if (!current()) return false;
        update(v => ({ ...v, ...data })); scope.step=data.step;scope.target = null;
        // Confirmed result + step (or confirmed close) discards only this tab
        // selector, never server work or reservations.
        if ((data.step >= 4 || (data.step >= 2 && scope.generated)) && scope.operation) {
          const removed = clearWelcomeRecovery(userId!,email!,lang,scope.operation.key);
          scope.operation=null;scope.restored=false;
          update(v => ({...v,generationPending:false,generationRestored:false,generationError:false,storageUnavailable:!removed}));
        }
        return true;
      } catch {
        if (current()) update(v => ({ ...v,error: true }));
        return false;
      } finally {
        waiting.finish(); if (scope.waiting === waiting) scope.waiting = null;
        update(v => ({ ...v,loading: false,saving: false }));
      }
    })();
    scope.flight = flight;
    try { return await flight; } finally { if (scope.flight === flight) scope.flight = null; }
  }, [scope,current,update,userId,email,lang]);
  const advanceOnboarding = useCallback((step: number) => request(step), [request]);
  const retryOnboarding = useCallback(() => request(scope.target), [request,scope]);
  const setOnboardingTopic = useCallback((topic: string) => {
    // An uncertain request keeps its original topic/body until resolved or the welcome is closed.
    if (!scope.operation && !scope.generation && !scope.generated) update(v => ({ ...v,topic }));
  }, [scope,update]);
  const runOnboardingGenerate = useCallback(async (rawTopic: string) => {
    if (!current() || scope.flight) return;
    if (scope.generation) return scope.generation;
    // A result waiting for step persistence must never spend another generation.
    const readOnly = !!scope.operation;
    if (scope.generated || (readOnly ? scope.step === null || scope.step < 1 || scope.step >= 4 : scope.step !== 1)
      || (scope.target !== null && !(readOnly && scope.operation?.stepTarget === 2 && scope.target === 2)) || !['es','en'].includes(lang)) return;
    if (!scope.operation) {
      const topic = rawTopic.trim(); if (topic.length < 3 || topic.length > 200) return;
      try {
        scope.operation={key:crypto.randomUUID(),topic,body:JSON.stringify({template:'title',inputs:{tema:topic},lang})};
        const stored=storeWelcomeRecovery(userId!,email!,lang,{version:1,...scope.operation});
        scope.restored=false;update(v=>({...v,storageUnavailable:!stored,generationRestored:false}));
      }
      catch {update(v=>({...v,generationError:true}));return;}
    }
    const operation=scope.operation;
    update(v => ({ ...v,topic:operation.topic,generating: true,generationError: false,generationTimedOut:false,generationPending:true }));
    let timedOut=false;const controller=new AbortController();scope.controller=controller;
    let stopWait!: (reason: Error) => void;
    const interrupted = new Promise<never>((_, reject) => { stopWait = reject; });
    // Abort retires the local wait even if the original transport ignores it.
    void interrupted.catch(() => {});
    const abort = () => stopWait(Error('Unconfirmed welcome generation'));
    controller.signal.addEventListener('abort',abort,{once:true});
    const deadline=setTimeout(()=>{timedOut=true;controller.abort();},90_000);scope.deadline=deadline;
    const generation = (async () => {
      try {
        const response = await Promise.race([fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json','Idempotency-Key':operation.key,
          ...(readOnly ? {'X-Generation-Recovery':'retained-only-v1'} : {}) },
          body:operation.body,signal:controller.signal }),interrupted]);
        if (!current()) return;
        if (controller.signal.aborted) throw Error('Unconfirmed generation');
        if (!response.ok) throw Error('Generation failed');
        const data = await Promise.race([response.json(),interrupted]);
        if (controller.signal.aborted || typeof data?.content !== 'string' || !data.content.trim() || typeof data.truncated !== 'boolean') throw Error('Invalid result');
        if (!current()) return;
        // Step persistence has its own wait; a confirmed result is never timed out.
        clearTimeout(deadline);if(scope.deadline===deadline)scope.deadline=null;
        controller.signal.removeEventListener('abort',abort);
        const restoredStep = scope.restored && operation.stepTarget === 2;
        operation.stepTarget=2;
        // Keep only the original selector and bounded absolute target across
        // reload. No title or server acknowledgement is trusted from storage.
        const retained=storeWelcomeRecovery(userId!,email!,lang,{version:1,...operation});
        scope.generated = true;scope.restored=false;
        update(v => ({ ...v,result: data.content,truncated:data.truncated,generationPending:false,generationRestored:false,storageUnavailable:!retained }));
        if (restoredStep) {
          if (scope.step !== null && scope.step >= 2) {
            const removed=clearWelcomeRecovery(userId!,email!,lang,operation.key);
            scope.operation=null;scope.target=null;
            update(v=>({...v,error:false,storageUnavailable:!removed}));
          } else {
            // Querying the title and retrying an uncertain step are separate
            // explicit actions after reload; JSON alone never writes a step.
            scope.target=2;update(v=>({...v,error:true}));
          }
        } else await request(2,true);
        if (current()) { void refreshStats(); void refreshHistory(); }
      } catch { if (current()) update(v => ({ ...v,generationError: true,generationTimedOut:timedOut })); }
      finally {controller.signal.removeEventListener('abort',abort);clearTimeout(deadline);if(scope.deadline===deadline)scope.deadline=null;if(scope.controller===controller)scope.controller=null;update(v => ({ ...v,generating: false })); }
    })();
    scope.generation = generation;
    try { await generation; } finally { if (scope.generation === generation) scope.generation = null; }
  }, [scope,current,update,lang,userId,email,request,refreshStats,refreshHistory]);
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
    scope.active = true; active.current = scope;
    const retained = readWelcomeRecovery(userId,email,authStatus,lang);
    if (current() && retained && !scope.operation && !scope.generated) {
      scope.operation={key:retained.key,topic:retained.topic,body:retained.body,...(retained.stepTarget===2?{stepTarget:2 as const}:{})};scope.restored=true;
    }
    // Restore a selector, not a result or step. The existing GET still confirms
    // the server step; only an explicit action can query retained generation.
    setStore({scope,...initial(),...(scope.operation ? {topic:scope.operation.topic,generationPending:true,
      generationError:true,generationRestored:scope.restored} : {})});
    void request(null);
    return () => {
      scope.active = false;scope.controller?.abort();if(scope.deadline)clearTimeout(scope.deadline);if (scope.timer) clearTimeout(scope.timer);
      // Immediate Strict Mode setup keeps the same original step read alive.
      void Promise.resolve().then(() => { if (!scope.active || active.current !== scope) scope.waiting?.cancel(); });
    };
  }, [scope,request,current,userId,email,authStatus,lang]);
  const view = store.scope === scope && current() ? store : initial();
  return { onboardingStep: view.step, onboardingName: view.name, onboardingTopic: view.topic,
    onboardingResult: view.result, onboardingGenerating: view.generating, onboardingCopied: view.copied,
    onboardingBusy: view.loading || view.saving || view.generating,
    onboardingError: view.error || (authStatus === 'authenticated' && !userId), generationError: view.generationError,
    generationTimedOut:view.generationTimedOut,onboardingGenerationPending:view.generationPending,onboardingTruncated:view.truncated,
    onboardingGenerationRestored:view.generationRestored,onboardingStorageUnavailable:view.storageUnavailable,
    advanceOnboarding, retryOnboarding, runOnboardingGenerate, setOnboardingTopic, copyOnboarding };
}

