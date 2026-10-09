'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClientReadWait } from '@/lib/client-read-wait';

export type Generation = { id: string; template: string; createdAt: string; tokensUsed: number | null; output: string; inputs: Record<string, string> };
const empty = () => ({ rows: [] as Generation[], loaded: false, page: 0, hasMore: false, loading: false, error: null as 'refresh'|'more'|null });
function decode(data: unknown, requested: number): { rows: Generation[]; hasMore: boolean } {
  const body = data as { generations?: unknown; total?: unknown; page?: unknown; hasMore?: unknown } | null;
  if (!body || !Array.isArray(body.generations) || body.generations.length > 10 || body.page !== requested
    || !Number.isSafeInteger(body.total) || (body.total as number) < body.generations.length || typeof body.hasMore !== 'boolean'
    || body.hasMore !== ((requested - 1) * 10 + body.generations.length < (body.total as number))
    || (body.hasMore && body.generations.length !== 10)) throw new Error('Invalid history page');
  const ids = new Set<string>();
  const rows = body.generations.map(row => {
    if (!row || typeof row.id !== 'string' || !/^[-A-Za-z0-9._:]{1,128}$/.test(row.id) || ids.has(row.id)
      || typeof row.template !== 'string' || !row.template.trim() || typeof row.output !== 'string'
      || typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt))
      || !(row.tokensUsed === null || (Number.isSafeInteger(row.tokensUsed) && row.tokensUsed > 0))
      || !Object.hasOwn(row, 'inputs')) throw new Error('Invalid history row');
    ids.add(row.id);
    // Legacy JSON inputs may contain nested/numeric metadata. The Dashboard
    // only displays string labels; preserve the output and omit non-string labels.
    const inputs = row.inputs && typeof row.inputs === 'object' && !Array.isArray(row.inputs)
      ? Object.fromEntries(Object.entries(row.inputs).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : {};
    return { id: row.id, template: row.template, createdAt: row.createdAt, tokensUsed: row.tokensUsed, output: row.output, inputs };
  });
  return { rows, hasMore: body.hasMore };
}

export function useGenerationHistory(userId: string | undefined, email: string | null | undefined, authStatus: string) {
  const scope = useMemo(() => ({ active: true, sequence: 0, page: 0, hasMore: false,
    failed: 'refresh' as 'refresh'|'more', flight: null as Promise<void>|null,
    waiting: null as ReturnType<typeof createClientReadWait>|null }), [userId, email, authStatus]);
  const active = useRef(scope); active.current = scope;
  const [store, setStore] = useState(() => ({ scope, ...empty() }));
  const current = useCallback(() => active.current === scope && scope.active && authStatus === 'authenticated' && !!email,
    [scope, authStatus, email]);
  const update = useCallback((fn: (view: ReturnType<typeof empty>) => ReturnType<typeof empty>) => {
    if (current()) setStore(prev => ({ scope, ...fn(prev.scope === scope ? prev : empty()) }));
  }, [scope, current]);
  const read = useCallback(async (page: number, force = false) => {
    if (!current()) return;
    if (!force && scope.flight) return scope.flight;
    scope.waiting?.cancel();
    const sequence = ++scope.sequence;
    const waiting = createClientReadWait(); scope.waiting = waiting;
    const mode = page === 1 ? 'refresh' : 'more';
    update(view => ({ ...view, loading: true, error: null }));
    const flight = (async () => {
      try {
        const response = await waiting.wait(fetch(`/api/user/generations?page=${page}`, { cache: 'no-store', signal: waiting.signal }));
        if (!response.ok) throw new Error('History unavailable');
        const data = decode(await waiting.wait(response.json()), page);
        if (!current() || scope.sequence !== sequence) return;
        scope.page = page; scope.hasMore = data.hasMore;
        update(view => {
          const combined = page === 1 ? data.rows : [...view.rows, ...data.rows];
          const ids = new Set<string>();
          return { ...view, rows: combined.filter(row => { if (ids.has(row.id)) return false; ids.add(row.id); return true; }),
            page, hasMore: data.hasMore, loaded: true };
        });
      } catch {
        if (current() && scope.sequence === sequence) { scope.failed = mode; update(view => ({ ...view, error: mode })); }
      } finally {
        waiting.finish(); if (scope.waiting === waiting) scope.waiting = null;
        if (current() && scope.sequence === sequence) update(view => ({ ...view, loading: false }));
      }
    })();
    scope.flight = flight;
    try { await flight; } finally { if (scope.flight === flight) scope.flight = null; }
  }, [scope, current, update]);
  const refreshHistory = useCallback(() => read(1, true), [read]);
  const loadMoreHistory = useCallback(() => {
    if (scope.flight) return scope.flight;
    if (!scope.page) return read(1);
    if (scope.hasMore) return read(scope.page + 1);
  }, [scope, read]);
  const retryHistory = useCallback(() => scope.failed === 'more' ? loadMoreHistory() : read(1), [scope, loadMoreHistory, read]);
  useEffect(() => {
    scope.active = true; active.current = scope; setStore({ scope, ...empty() });
    void read(1);
    return () => {
      scope.active = false;
      // Immediate Strict Mode setup retains the original initial GET.
      void Promise.resolve().then(() => { if (!scope.active || active.current !== scope) scope.waiting?.cancel(); });
    };
  }, [scope, read]);
  const view = store.scope === scope && current() ? store : empty();
  return { historyGens: view.rows, historyLoaded: view.loaded, historyPage: view.page, historyHasMore: view.hasMore,
    historyLoading: view.loading, historyError: view.error, refreshHistory, loadMoreHistory, retryHistory };
}
