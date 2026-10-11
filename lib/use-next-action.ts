'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClientReadWait } from '@/lib/client-read-wait';
import type { NextAction } from '@/lib/next-action';

const paths: Record<string, string> = {
  connect_channel: '/profile', first_generation: '/generate', score_recent_video: '/seo-score',
  optimize_low_score: '/optimize', track_competitors: '/competitors/tracking', best_time_stale: '/best-time',
  trend_alert_unseen: '/trends', plan_week: '/calendar', start_ab_test: '/ab-test', daily_idea: '/generate',
};
function decode(data: unknown): NextAction[] {
  const body = data as { action?: unknown; actions?: unknown } | null;
  if (!body || !Array.isArray(body.actions) || body.actions.length > 10) throw Error('Actions unavailable');
  const ids = new Set<string>();
  const project = (value: unknown): NextAction => {
    const row = value as NextAction | null;
    if (!row || typeof row.id !== 'string' || !Object.hasOwn(paths, row.id)
      || typeof row.href !== 'string' || !row.href.startsWith('/') || row.href.startsWith('//'))
      throw Error('Actions unavailable');
    const url = new URL(row.href, 'https://local.invalid');
    if (url.origin !== 'https://local.invalid' || url.pathname !== paths[row.id] || url.hash
      || (row.score !== undefined && (!Number.isFinite(row.score) || row.score < 0 || row.score > 100)))
      throw Error('Actions unavailable');
    const text = (value: unknown) => {
      const pair = value as { es?: unknown; en?: unknown } | null;
      if (!pair || typeof pair.es !== 'string' || !pair.es.trim() || typeof pair.en !== 'string' || !pair.en.trim())
        throw Error('Actions unavailable');
      return Object.freeze({ es: pair.es, en: pair.en });
    };
    return Object.freeze({ id: row.id, title: text(row.title), reason: text(row.reason), cta: text(row.cta),
      href: row.href, ...(row.score === undefined ? {} : { score: row.score }) });
  };
  const rows = body.actions.map(value => {
    const row = project(value);
    if (ids.has(row.id)) throw Error('Actions unavailable');
    ids.add(row.id); return row;
  });
  if (rows.length ? JSON.stringify(project(body.action)) !== JSON.stringify(rows[0]) : body.action !== null)
    throw Error('Actions unavailable');
  return rows;
}
const dayNow = () => new Date().toISOString().slice(0, 10);
const empty = () => ({ rows: [] as NextAction[], loaded: false, loading: false, error: false,
  skipped: [] as string[], index: 0, undone: null as NextAction | null });

export function useNextAction(userId: string | undefined, email: string | null | undefined, status: string) {
  const [, tick] = useState(0), day = dayNow();
  const ownerKey = JSON.stringify([userId, email, status, day]);
  const scope = useMemo(() => ({ active: true, sequence: 0, ...empty(),
    flight: null as Promise<void> | null, waiting: null as ReturnType<typeof createClientReadWait> | null,
    undoTimer: null as ReturnType<typeof setTimeout> | null,
    storageKey: 'ytv_na_skip_v2_' + encodeURIComponent(JSON.stringify([userId, email])) + '_' + day,
  }), [userId, email, status, day]);
  const active = useRef(scope); active.current = scope;
  const [store, setStore] = useState(() => ({ scope, ...empty() }));
  const current = useCallback(() => active.current === scope && scope.active && status === 'authenticated'
    && typeof userId === 'string' && !!userId && typeof email === 'string' && !!email && dayNow() === day,
  [scope, status, userId, email, day]);
  const publish = useCallback(() => {
    if (current()) setStore({ scope, rows: scope.rows, loaded: scope.loaded, loading: scope.loading,
      error: scope.error, skipped: scope.skipped, index: scope.index, undone: scope.undone });
  }, [scope, current]);
  const read = useCallback(async (force = false) => {
    if (!current()) return;
    if (!force && scope.flight) return scope.flight;
    scope.waiting?.cancel();
    const sequence = ++scope.sequence, deadline = performance.now() + 30_000;
    const waiting = createClientReadWait(); scope.waiting = waiting;
    const check = () => {
      if (!current() || scope.sequence !== sequence || performance.now() >= deadline) throw Error('Actions unavailable');
    };
    scope.loading = true; scope.error = false; publish();
    const flight = (async () => {
      try {
        check();
        const response = await waiting.wait(fetch('/api/next-action', { cache: 'no-store', signal: waiting.signal }));
        check();
        if (!response.ok) throw Error('Actions unavailable');
        const body = await waiting.wait(response.json());
        check();
        const rows = decode(body);
        check();
        scope.rows = rows; scope.loaded = true; scope.index = 0; publish();
      } catch {
        if (current() && scope.sequence === sequence) { scope.error = true; publish(); }
      } finally {
        waiting.finish();
        if (scope.waiting === waiting) scope.waiting = null;
        if (current() && scope.sequence === sequence) { scope.loading = false; publish(); }
      }
    })();
    scope.flight = flight;
    try { await flight; } finally { if (scope.flight === flight) scope.flight = null; }
  }, [scope, current, publish]);

  useEffect(() => {
    scope.active = true; active.current = scope;
    if (current()) {
      // An old accountless key cannot establish whose preference it was.
      try {
        const saved = JSON.parse(localStorage.getItem(scope.storageKey) || '[]');
        scope.skipped = Array.isArray(saved)
          ? [...new Set(saved.filter((id): id is string => typeof id === 'string' && Object.hasOwn(paths, id)))] : [];
      } catch { scope.skipped = []; }
      publish(); void read();
    }
    return () => {
      scope.active = false;
      if (scope.undoTimer) clearTimeout(scope.undoTimer);
      void Promise.resolve().then(() => { if (!scope.active || active.current !== scope) scope.waiting?.cancel(); });
    };
  }, [scope, current, publish, read]);
  useEffect(() => {
    if (status !== 'authenticated' || !userId || !email) return;
    const remaining = Date.parse(day + 'T00:00:00Z') + 86_400_000 - Date.now();
    const timer = setTimeout(() => {
      if (scope.active && active.current === scope) tick(value => value + 1);
    }, Math.max(1, remaining));
    return () => clearTimeout(timer);
  }, [scope, day, status, userId, email]);

  const writeSkipped = () => {
    if (!current()) return;
    try { localStorage.setItem(scope.storageKey, JSON.stringify(scope.skipped)); } catch {}
  };
  const clearUndo = () => {
    if (!current()) return;
    if (scope.undoTimer) clearTimeout(scope.undoTimer);
    scope.undoTimer = null; scope.undone = null; publish();
  };
  const dismiss = (id: string) => {
    if (!current() || !scope.loaded || scope.skipped.includes(id)) return;
    const row = scope.rows.find(row => row.id === id);
    if (!row) return;
    scope.skipped = [...scope.skipped, id]; writeSkipped();
    scope.undone = row;
    if (scope.undoTimer) clearTimeout(scope.undoTimer);
    scope.undoTimer = setTimeout(() => {
      if (!current()) return;
      scope.undoTimer = null; scope.undone = null; publish();
    }, 12_000);
    publish();
  };
  const undo = () => {
    if (!current() || !scope.undone) return;
    const id = scope.undone.id;
    scope.skipped = scope.skipped.filter(value => value !== id); writeSkipped();
    const index = scope.rows.filter(row => !scope.skipped.includes(row.id)).findIndex(row => row.id === id);
    if (index >= 0) scope.index = index;
    clearUndo();
  };
  const navigate = (index: number) => {
    if (!current() || !Number.isInteger(index)) return;
    const visible = scope.rows.filter(row => !scope.skipped.includes(row.id));
    if (index < 0 || index >= visible.length) return;
    scope.index = index; clearUndo();
  };
  const view = store.scope === scope && current() ? store : empty();
  return { ...view, ownerKey, dismiss, undo, navigate, retry: () => read(), refresh: () => read(true) };
}
