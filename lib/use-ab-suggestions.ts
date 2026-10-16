'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AbVideo } from './use-ab-test-read';
import { abSuggestionInput, abSuggestedVariants } from '@/lib/ab-suggestions-contract';

type Status = 'idle' | 'sending' | 'unconfirmed' | 'confirmed' | 'rejected' | 'lost' | 'storage-unavailable';
interface Selection { video: AbVideo; lang: 'es' | 'en'; token: object }
interface Snapshot { status: Status; selection: Selection | null; variants: { variantA: string; variantB: string } | null }
const blocked = (s: Status) => ['sending', 'unconfirmed', 'lost', 'storage-unavailable'].includes(s);
// Only the live original promise provides continuity. Storage can deny a send,
// never restore a producer or confirm a result after reload or module loss.
const accounts = new Map<string, ReturnType<typeof createSuggestions>>();
function createSuggestions(account: string) {
  const marker = 'ytubviral.ab-suggestions.pending:' + account;
  let snapshot: Snapshot = { status: 'idle', selection: null, variants: null };
  let original: object | null = null;
  const listeners = new Set<() => void>();
  const publish = (change: Partial<Snapshot>) => { snapshot = { ...snapshot, ...change }; for (const fn of listeners) fn(); };
  const observe = () => {
    if (original || blocked(snapshot.status)) return;
    try { if (window.sessionStorage.getItem(marker) !== null) publish({ status: 'lost' }); }
    catch { publish({ status: 'storage-unavailable' }); }
  };
  return {
    snapshot: () => snapshot,
    observe,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    start(selection: Selection) {
      observe();
      if (blocked(snapshot.status)) return null;
      const captured = { ...selection, video: { ...selection.video } };
      let input: ReturnType<typeof abSuggestionInput>;
      try { input = abSuggestionInput({ title: captured.video.title, lang: captured.lang }); }
      catch { publish({ status: 'rejected', selection: captured, variants: null }); return null; }
      let key: string;
      try { key = crypto.randomUUID(); window.sessionStorage.setItem(marker, 'unconfirmed'); }
      catch { publish({ status: 'storage-unavailable' }); return null; }
      // Copy the original selection; caller edits cannot change its payload.
      const body = JSON.stringify(input);
      const owner = {}; original = owner;
      let done!: () => void;
      const wait = new Promise<void>(resolve => { done = resolve; });
      const uncertain = () => { if (original === owner) { publish({ status: 'unconfirmed' }); done(); } };
      publish({ status: 'sending', selection: captured, variants: null });
      const timer = setTimeout(uncertain, 60_000);
      // The timer ends only the visible wait. Fetch + JSON remain the original
      // producer after unmount, language/account changes or a late response.
      void (async () => {
        try {
          const response = await fetch('/api/youtube/ab-test/suggest', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body,
          });
          const data = await response.json();
          if (original !== owner) return;
          let variants: ReturnType<typeof abSuggestedVariants> | null = null;
          if (response.status === 200 && response.ok) {
            try { variants = abSuggestedVariants(data, captured.video.title); } catch { /* Keep uncertainty. */ }
          }
          const confirmed = variants !== null;
          const rejected = !response.ok && data && (
            (response.status === 400 && ['Title required', 'Invalid operation key'].includes(data.error))
            || (response.status === 401 && data.error === 'Unauthorized')
            || (response.status === 403 && data.error === 'pro_required')
          );
          if (!confirmed && !rejected) { uncertain(); return; }
          try { window.sessionStorage.removeItem(marker); }
          catch { publish({ status: 'storage-unavailable', variants }); done(); return; }
          original = null;
          publish({ status: confirmed ? 'confirmed' : 'rejected', variants }); done();
        } catch { uncertain(); }
        finally { clearTimeout(timer); }
      })();
      return wait;
    },
  };
}
export function useAbSuggestions(account: string) {
  const coordinator = useMemo(() => {
    if (typeof window === 'undefined') return createSuggestions(account);
    let value = accounts.get(account);
    if (!value) { value = createSuggestions(account); accounts.set(account, value); }
    return value;
  }, [account]);
  const [, render] = useState(0);
  useEffect(() => { const stop = coordinator.subscribe(() => render(x => x + 1)); coordinator.observe(); render(x => x + 1); return stop; }, [coordinator]);
  return { ...coordinator.snapshot(), start: coordinator.start, blocked: blocked(coordinator.snapshot().status) };
}
