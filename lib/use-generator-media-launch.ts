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
  persistenceUnavailable: false, resumable: [] as Selection[], limit: null as { reason: LimitReason; onClose: () => void } | null });
const slot = (owner: string) => 'ytv-video-selection:v1:' + owner;
function validSelection(value: unknown, owner: string): value is Selection {
  if (!value || typeof value !== 'object' || Array.isArray(value) || owner.length > 2000) return false;
  const s = value as Selection;
  return Object.keys(s).sort().join(',') === 'generationId,owner,scriptContent,scriptTitle,version'
    && s.version === 1 && s.owner === owner
    && typeof s.generationId === 'string' && /^[-A-Za-z0-9._:]{1,128}$/.test(s.generationId)
    && typeof s.scriptContent === 'string' && !!s.scriptContent.trim() && s.scriptContent.length <= 64000
    && typeof s.scriptTitle === 'string' && !!s.scriptTitle.trim() && s.scriptTitle.length <= 512;
}
function readSelections(owner: string): Selection[] {
  if (owner.length > 2000) return [];
  const raw = sessionStorage.getItem(slot(owner));
  if (!raw || raw.length > 400000) return [];
  try {
    const value = JSON.parse(raw);
    if (validSelection(value,owner)) return [value];
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join(',') !== 'owner,selections,version'
      || value.version !== 2 || value.owner !== owner || !Array.isArray(value.selections)
      || !value.selections.length || value.selections.length > 10
      || !value.selections.every((s: unknown) => validSelection(s,owner))) return [];
    const selections: Selection[] = value.selections;
    if (new Set(selections.map(s => s.generationId)).size !== selections.length) return [];
    return selections;
  } catch { return []; }
}

// A local draft selection only. It never confirms a result or grants server recovery authority.
export function useGeneratorMediaLaunch(owner: GeneratorScreenScope, template: string,
  inputs: Record<string,string>, output: string, onConfirmed: () => void,
  surface: 'generator' | 'dashboard' = 'generator', onSavedConfirmed?: () => void) {
  const selectionOwner = surface === 'dashboard' ? 'dashboard:' + owner.scope.key : owner.scope.key;
  const context = JSON.stringify(Object.keys(inputs).sort().map(k => [k,inputs[k]]));
  const scope = useMemo(() => ({ active: true, preview: null as Preview | null,
    selection: null as Selection | null, selections: [] as Selection[], limit: null as ReturnType<typeof initial>['limit'] }),
    [owner.scope,template,context,output,surface]);
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
    let confirmed = false, saved = false;
    const belongs = () => current() && scope.preview === preview;
    const preview: Preview = { generationId: selection.generationId,
      scriptContent: selection.scriptContent, scriptTitle: selection.scriptTitle,
      onClose: () => { if (belongs()) { scope.preview = null; update({ preview: null, canResume: !!scope.selection, resumable: scope.selections }); } },
      onSaved: () => { if (belongs() && !saved) { saved = true; update({ saved: true }); try { onSavedConfirmed?.(); } catch {} } },
      onGenerated: () => {
        if (!belongs() || confirmed) return;
        confirmed = true;
        try { onConfirmed(); } catch {}
      },
      onLimitReached: reason => {
        if (!belongs() || !['limit','video_tips_capped'].includes(reason)) return;
        scope.preview = null; update({ preview: null, canResume: !!scope.selection, resumable: scope.selections });
        showLimit(reason === 'video_tips_capped' ? 'video_tips_limit' : 'limit');
      } };
    scope.preview = preview; scope.limit = null;
    update({ preview, saved: false, canResume: false, limit: null });
  };
  const openPreview = (scriptContent: string, scriptTitle: string, originalId?: string) => {
    if (!current() || scope.preview || !scriptContent.trim()) return;
    let generationId: string;
    if (surface === 'dashboard') {
      if (typeof originalId !== 'string' || !/^[-A-Za-z0-9._:]{1,128}$/.test(originalId)) return;
      generationId = originalId;
    } else { try { generationId = 'vp-' + crypto.randomUUID(); } catch { return; } }
    const selection: Selection = { version: 1, owner: selectionOwner, generationId, scriptContent, scriptTitle };
    try {
      if (!validSelection(selection,selectionOwner)) throw Error('Draft too large');
      // Preserve earlier original drafts. A capacity failure never evicts a query.
      const previous = readSelections(selectionOwner);
      const selections = [...previous.filter(s => s.generationId !== generationId),selection];
      if (selections.length > 10) throw Error('Draft capacity');
      const raw = JSON.stringify({ version: 2, owner: selectionOwner, selections });
      if (raw.length > 400000) throw Error('Draft capacity');
      sessionStorage.setItem(slot(selectionOwner),raw);
      if (sessionStorage.getItem(slot(selectionOwner)) !== raw) throw Error('Draft unavailable');
      scope.selections = selections; scope.selection = selection;
      update({ persistenceUnavailable: false, resumable: selections });
    } catch { update({ persistenceUnavailable: true }); }
    selectPreview(selection);
  };
  const resumePreview = (generationId?: string) => {
    if (!current() || scope.preview || !scope.selection) return;
    const offered = typeof generationId === 'string'
      ? scope.selections.find(s => s.generationId === generationId) : scope.selection;
    if (!offered) return;
    try {
      const selections = readSelections(selectionOwner);
      const saved = selections.find(s => s.generationId === offered.generationId);
      if (!saved || JSON.stringify(saved) !== JSON.stringify(offered)) {
        scope.selection = null; scope.selections = []; update({ canResume: false, resumable: [] }); return;
      }
      scope.selection = saved; scope.selections = selections;
      selectPreview(saved);
    } catch { update({ persistenceUnavailable: true, canResume: false, resumable: [] }); }
  };
  useEffect(() => {
    scope.active = true;
    setStore({ scope, ...initial() });
    if (current()) {
      try {
        scope.selections = readSelections(selectionOwner);
        scope.selection = scope.selections.at(-1) ?? null;
        update({ canResume: !!scope.selection, resumable: scope.selections });
      } catch { update({ persistenceUnavailable: true }); }
    }
    return () => { scope.active = false; scope.preview = null; scope.selection = null; scope.selections = []; scope.limit = null; };
  }, [scope]);
  return { ...(store.scope === scope && current() ? store : initial()), openPreview, resumePreview, showLimit,
    current };
}
