'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeneratorScreenScope } from './use-generator-screen-scope';

type LimitReason = 'limit' | 'pro_feature' | 'video_tips_limit';
type Preview = { generationId: string; scriptContent: string; scriptTitle: string;
  onClose: () => void; onSaved: () => void; onGenerated: () => void;
  onLimitReached: (reason: 'limit' | 'video_tips_capped') => void };
type Selection = { version: 1; owner: string; generationId: string;
  scriptContent: string; scriptTitle: string };
const initial = () => ({ preview: null as Preview | null, saved: false, canResume: false,
  persistenceUnavailable: false, limit: null as { reason: LimitReason; onClose: () => void } | null });
const slot = (owner: string) => 'ytv-video-selection:v1:' + owner;
function validSelection(value: unknown, owner: string): value is Selection {
  if (!value || typeof value !== 'object' || Array.isArray(value) || owner.length > 2000) return false;
  const s = value as Selection;
  return Object.keys(s).sort().join(',') === 'generationId,owner,scriptContent,scriptTitle,version'
    && s.version === 1 && s.owner === owner
    && typeof s.generationId === 'string' && /^vp-[-A-Za-z0-9._:]{1,124}$/.test(s.generationId)
    && typeof s.scriptContent === 'string' && !!s.scriptContent.trim() && s.scriptContent.length <= 64000
    && typeof s.scriptTitle === 'string' && !!s.scriptTitle.trim() && s.scriptTitle.length <= 512;
}
function readSelection(owner: string): Selection | null {
  const raw = sessionStorage.getItem(slot(owner));
  if (!raw || raw.length > 400000) return null;
  try { const s: unknown = JSON.parse(raw); return validSelection(s,owner) ? s : null; }
  catch { return null; }
}

// A local draft selection only. It never confirms a result or grants server recovery authority.
export function useGeneratorMediaLaunch(owner: GeneratorScreenScope, template: string,
  inputs: Record<string,string>, output: string, onConfirmed: () => void) {
  const context = JSON.stringify(Object.keys(inputs).sort().map(k => [k,inputs[k]]));
  const scope = useMemo(() => ({ active: true, preview: null as Preview | null,
    selection: null as Selection | null, limit: null as ReturnType<typeof initial>['limit'] }),
    [owner.scope,template,context,output]);
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
  const selectPreview = (selection: Selection) => {
    if (!current() || scope.preview) return;
    let confirmed = false;
    const belongs = () => current() && scope.preview === preview;
    const preview: Preview = { generationId: selection.generationId,
      scriptContent: selection.scriptContent, scriptTitle: selection.scriptTitle,
      onClose: () => { if (belongs()) { scope.preview = null; update({ preview: null, canResume: !!scope.selection }); } },
      onSaved: () => { if (belongs()) update({ saved: true }); },
      onGenerated: () => {
        if (!belongs() || confirmed) return;
        confirmed = true;
        try { onConfirmed(); } catch {}
      },
      onLimitReached: reason => {
        if (!belongs() || !['limit','video_tips_capped'].includes(reason)) return;
        scope.preview = null; update({ preview: null, canResume: !!scope.selection });
        showLimit(reason === 'video_tips_capped' ? 'video_tips_limit' : 'limit');
      } };
    scope.preview = preview; scope.limit = null;
    update({ preview, saved: false, canResume: false, limit: null });
  };
  const openPreview = (scriptContent: string, scriptTitle: string) => {
    if (!current() || scope.preview || !scriptContent.trim()) return;
    let generationId: string;
    try { generationId = 'vp-' + crypto.randomUUID(); } catch { return; }
    const selection: Selection = { version: 1, owner: owner.scope.key, generationId, scriptContent, scriptTitle };
    scope.selection = null;
    try {
      if (!validSelection(selection,owner.scope.key)) throw Error('Draft too large');
      const raw = JSON.stringify(selection);
      if (raw.length > 400000) throw Error('Draft too large');
      sessionStorage.setItem(slot(owner.scope.key),raw);
      scope.selection = selection; update({ persistenceUnavailable: false });
    } catch { update({ persistenceUnavailable: true }); }
    selectPreview(selection);
  };
  const resumePreview = () => {
    if (!current() || scope.preview || !scope.selection) return;
    try {
      const saved = readSelection(owner.scope.key);
      if (!saved || JSON.stringify(saved) !== JSON.stringify(scope.selection)) {
        scope.selection = null; update({ canResume: false }); return;
      }
      selectPreview(saved);
    } catch { update({ persistenceUnavailable: true, canResume: false }); }
  };
  useEffect(() => {
    scope.active = true;
    setStore({ scope, ...initial() });
    if (current()) {
      try {
        scope.selection = readSelection(owner.scope.key);
        update({ canResume: !!scope.selection });
      } catch { update({ persistenceUnavailable: true }); }
    }
    return () => { scope.active = false; scope.preview = null; scope.selection = null; scope.limit = null; };
  }, [scope]);
  return { ...(store.scope === scope && current() ? store : initial()), openPreview, resumePreview, showLimit,
    current };
}
