'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { beginAbSelectionRead, type AbSelectionDisplay } from '@/lib/ab-selection-client';
import { beginAbHistoryRead, type AbHistoryDisplay } from '@/lib/ab-history-client';

export type { AbSelectionVideo as AbVideo } from '@/lib/ab-selection-contract';
import type { AbSelectionVideo as AbVideo } from '@/lib/ab-selection-contract';
export interface AbTest {
  id: string; userId: string; videoId: string; thumbnail: string | null; originalTitle: string;
  variantA: string; variantB: string; status: string; hoursPerVariant: number;
  startedAt: string; switchedAt: string | null; completedAt: string | null;
  initialViews: number; switchViews: number | null; endViews: number | null;
  winner: string | null; aiInsight: { es: string; en: string } | null;
}
type Data = { channelId:string|null; connected: boolean; videos: AbVideo[]; tests: AbTest[]; hasMore: boolean; unavailable: number };
const empty: Data = { channelId:null,connected: false, videos: [], tests: [], hasMore: false, unavailable: 0 };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const nullable = (v: unknown, check: (v: unknown) => boolean) => v === null || check(v);
const string = (v: unknown) => typeof v === 'string';
const date = (v: unknown) => string(v) && Number.isFinite(Date.parse(v as string));
export function decodeAbTest(v: unknown, owner: string): AbTest | null {
  return object(v) && v.userId === owner && typeof v.id === 'string' && v.id.trim()
      && typeof v.videoId === 'string' && v.videoId.trim() && string(v.originalTitle)
      && string(v.variantA) && string(v.variantB) && ['variant_a', 'variant_b', 'completed', 'cancelled'].includes(v.status as string)
      && number(v.hoursPerVariant) && (v.hoursPerVariant as number) > 0 && date(v.startedAt)
      && nullable(v.thumbnail, string) && nullable(v.switchedAt, date) && nullable(v.completedAt, date)
      && number(v.initialViews) && nullable(v.switchViews, number) && nullable(v.endViews, number)
      && nullable(v.winner, x => ['A', 'B', 'tie'].includes(x as string))
      && nullable(v.aiInsight, x => object(x) && string(x.es) && string(x.en)) ? v as unknown as AbTest : null;
}
export function useAbTestRead(userId: string, email: string, lang: 'es' | 'en', native: { sessionRef: string; expiresAt: number; eligible: boolean }) {
  const scope = useMemo(() => ({ active: true, flight: null as Promise<void> | null, selection: null as ReturnType<typeof beginAbSelectionRead> | null, selectionReceipt: null as AbSelectionDisplay | null, history: null as ReturnType<typeof beginAbHistoryRead> | null, receipt: null as AbHistoryDisplay | null }), [userId, email, lang, native.sessionRef, native.expiresAt, native.eligible]);
  const active = useRef(scope); active.current = scope;
  const [store, setStore] = useState({ scope, status: 'loading', data: empty });
  const current = () => active.current === scope && scope.active && native.eligible && Date.now() < native.expiresAt;
  const read = () => {
    if (!current()) return Promise.resolve();
    if (scope.flight) return scope.flight;
    scope.history?.retire(); scope.selection?.retire(); scope.receipt = null; scope.selectionReceipt = null;
    let history: ReturnType<typeof beginAbHistoryRead>;
    history = beginAbHistoryRead({ id: userId, email, sessionRef: native.sessionRef, expiresAt: native.expiresAt }, current, () => {
      void Promise.resolve().then(() => { if (active.current === scope && scope.active && scope.history === history) { scope.receipt = null; scope.selection?.retire(); setStore({ scope, status: 'error', data: empty }); } });
    });
    scope.history = history;
    setStore({ scope, status: 'loading', data: empty });
    let selection: ReturnType<typeof beginAbSelectionRead>;
    selection = beginAbSelectionRead({id:userId,email,sessionRef:native.sessionRef,expiresAt:native.expiresAt},current,() => {
      void Promise.resolve().then(() => { if (active.current === scope && scope.active && scope.selection === selection) { scope.selectionReceipt = null; history.retire(); setStore({scope,status:'error',data:empty}); } });
    }); scope.selection = selection;
    scope.flight = (async () => {
      try {
        const [selectedReceipt, receipt] = await Promise.all([selection.original,history.original]);
        if (!current()) return;
        const decoded = selection.display(selectedReceipt), list = history.display(receipt);
        if (!decoded || !list) throw Error('Unconfirmed original read');
        scope.receipt = receipt; scope.selectionReceipt = selectedReceipt;
        setStore({scope,status:'ready',data:{channelId:decoded.channelId,connected:decoded.connected,videos:decoded.videos,tests:list,hasMore:decoded.hasMore,unavailable:decoded.unavailableVideoIds.length}});
      } catch { history.retire(); selection.retire(); if (current()) setStore({scope,status:'error',data:empty}); }
      finally { scope.flight = null; }
    })();
    return scope.flight;
  };
  useEffect(() => {
    scope.active = true; void read();
    return () => { scope.active = false; void Promise.resolve().then(() => { if (!scope.active) { scope.selection?.retire(); scope.history?.retire(); } }); };
  }, [scope]); // Each immutable scope owns its read and cleanup.
  const history = scope.history?.display(scope.receipt) ?? null;
  const visible = store.scope === scope ? store : { scope, status: 'loading', data: empty };
  const selection = scope.selection?.display(scope.selectionReceipt) ?? null;
  const valid = visible.status !== 'ready' || history !== null && selection !== null;
  return { ...(valid ? visible.data : empty), tests: history ?? [], status: native.eligible && valid ? visible.status : 'error', retry: read };
}
