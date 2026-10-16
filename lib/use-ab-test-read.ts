'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClientReadWait } from './client-read-wait';
import { beginAbHistoryRead, type AbHistoryDisplay } from '@/lib/ab-history-client';

export interface AbVideo { videoId: string; title: string; thumbnail: string; publishedAt: string; views: number; likes: number }
export interface AbTest {
  id: string; userId: string; videoId: string; thumbnail: string | null; originalTitle: string;
  variantA: string; variantB: string; status: string; hoursPerVariant: number;
  startedAt: string; switchedAt: string | null; completedAt: string | null;
  initialViews: number; switchViews: number | null; endViews: number | null;
  winner: string | null; aiInsight: { es: string; en: string } | null;
}
type Data = { connected: boolean; videos: AbVideo[]; tests: AbTest[] };
const empty: Data = { connected: false, videos: [], tests: [] };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const nullable = (v: unknown, check: (v: unknown) => boolean) => v === null || check(v);
const string = (v: unknown) => typeof v === 'string';
const date = (v: unknown) => string(v) && Number.isFinite(Date.parse(v as string));
function channel(value: unknown, owner: string) {
  if (!object(value) || value.userId !== owner || typeof value.connected !== 'boolean') throw Error('Invalid channel identity');
  if (!value.connected) return { connected: false, videos: [] as AbVideo[] };
  if (!Array.isArray(value.videos) || !value.videos.every(v => object(v)
    && typeof v.videoId === 'string' && v.videoId.trim() && string(v.title) && string(v.thumbnail)
    && date(v.publishedAt) && number(v.views) && number(v.likes))) throw Error('Invalid videos');
  return { connected: true, videos: value.videos as AbVideo[] };
}
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
  const scope = useMemo(() => ({ active: true, flight: null as Promise<void> | null, wait: null as ReturnType<typeof createClientReadWait> | null, history: null as ReturnType<typeof beginAbHistoryRead> | null, receipt: null as AbHistoryDisplay | null }), [userId, email, lang, native.sessionRef, native.expiresAt, native.eligible]);
  const active = useRef(scope); active.current = scope;
  const [store, setStore] = useState({ scope, status: 'loading', data: empty });
  const current = () => active.current === scope && scope.active && native.eligible && Date.now() < native.expiresAt;
  const read = () => {
    if (!current()) return Promise.resolve();
    if (scope.flight) return scope.flight;
    scope.history?.retire(); scope.receipt = null;
    const wait = createClientReadWait(); scope.wait = wait;
    let history: ReturnType<typeof beginAbHistoryRead>;
    history = beginAbHistoryRead({ id: userId, email, sessionRef: native.sessionRef, expiresAt: native.expiresAt }, current, () => {
      void Promise.resolve().then(() => { if (active.current === scope && scope.active && scope.history === history) { scope.receipt = null; wait.cancel(); setStore({ scope, status: 'error', data: empty }); } });
    });
    scope.history = history;
    setStore({ scope, status: 'loading', data: empty });
    const json = async (url: string) => {
      if (!current()) throw Error('Retired read');
      const response = await wait.wait(fetch(url, { cache: 'no-store', signal: wait.signal }));
      if (!current() || !response.ok) throw Error('Read unavailable');
      return wait.wait(response.json());
    };
    scope.flight = (async () => {
      try {
        const [ch, receipt] = await Promise.all([json('/api/youtube/channel'), history.original]);
        if (!current()) return;
        let decoded = channel(ch, userId);
        const list = history.display(receipt); if (!list) throw Error('Unconfirmed history');
        scope.receipt = receipt;
        if (decoded.connected && decoded.videos.length === 0) decoded = channel(await json('/api/youtube/channel?fresh=1'), userId);
        if (current()) setStore({ scope, status: 'ready', data: { ...decoded, tests: list } });
      } catch { history.retire(); if (current()) setStore({ scope, status: 'error', data: empty }); }
      finally { wait.finish(); scope.wait = null; scope.flight = null; }
    })();
    return scope.flight;
  };
  useEffect(() => {
    scope.active = true; void read();
    return () => { scope.active = false; void Promise.resolve().then(() => { if (!scope.active) { scope.wait?.cancel(); scope.history?.retire(); } }); };
  }, [scope]); // Each immutable scope owns its read and cleanup.
  const history = scope.history?.display(scope.receipt) ?? null;
  const visible = store.scope === scope ? store : { scope, status: 'loading', data: empty };
  const valid = visible.status !== 'ready' || history !== null;
  return { ...(valid ? visible.data : empty), tests: history ?? [], status: native.eligible && valid ? visible.status : 'error', retry: read };
}
