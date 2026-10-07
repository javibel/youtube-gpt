'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeneratorScreenScope } from './use-generator-screen-scope';

type LimitReason = 'limit' | 'pro_feature' | 'video_tips_limit';
type Preview = { generationId: string; scriptContent: string; scriptTitle: string;
  onClose: () => void; onSaved: () => void; onGenerated: () => void;
  onLimitReached: (reason: 'limit' | 'video_tips_capped') => void };
const initial = () => ({ preview: null as Preview | null, saved: false,
  limit: null as { reason: LimitReason; onClose: () => void } | null });

// This is the launch lifetime, not a claim of server cancellation, generation or media storage.
export function useGeneratorMediaLaunch(owner: GeneratorScreenScope, template: string,
  inputs: Record<string,string>, output: string, onConfirmed: () => void) {
  const context = JSON.stringify(Object.keys(inputs).sort().map(k => [k,inputs[k]]));
  const scope = useMemo(() => ({ active: true, preview: null as Preview | null,
    limit: null as ReturnType<typeof initial>['limit'] }), [owner.scope,template,context,output]);
  const latest = useRef(scope); latest.current = scope;
  const [store,setStore] = useState(() => ({ scope, ...initial() }));
  const current = () => scope.active && latest.current === scope && owner.current();
  const update = (change: Partial<ReturnType<typeof initial>>) => {
    if (current()) setStore(old => current()
      ? { ...(old.scope === scope ? old : { scope, ...initial() }), ...change } : old);
  };
  const showLimit = (reason: LimitReason) => {
    if (!current() || !['limit','pro_feature','video_tips_limit'].includes(reason)) return;
    const limit = { reason, onClose: () => {
      if (current() && scope.limit === limit) { scope.limit = null; update({ limit: null }); }
    } };
    scope.limit = limit; update({ limit });
  };
  const openPreview = (scriptContent: string, scriptTitle: string) => {
    if (!current() || scope.preview || !scriptContent.trim()) return;
    let generationId: string;
    try { generationId = 'vp-' + crypto.randomUUID(); } catch { return; }
    let confirmed = false;
    const belongs = () => current() && scope.preview === preview;
    const preview: Preview = { generationId, scriptContent, scriptTitle,
      onClose: () => { if (belongs()) { scope.preview = null; update({ preview: null }); } },
      onSaved: () => { if (belongs()) update({ saved: true }); },
      onGenerated: () => {
        if (!belongs() || confirmed) return;
        confirmed = true;
        try { onConfirmed(); } catch {}
      },
      onLimitReached: reason => {
        if (!belongs() || !['limit','video_tips_capped'].includes(reason)) return;
        scope.preview = null; update({ preview: null });
        showLimit(reason === 'video_tips_capped' ? 'video_tips_limit' : 'limit');
      } };
    scope.preview = preview; scope.limit = null;
    update({ preview, saved: false, limit: null });
  };
  useEffect(() => {
    scope.active = true; setStore({ scope, ...initial() });
    return () => { scope.active = false; scope.preview = null; scope.limit = null; };
  }, [scope]);
  return { ...(store.scope === scope && current() ? store : initial()), openPreview, showLimit,
    current };
}
