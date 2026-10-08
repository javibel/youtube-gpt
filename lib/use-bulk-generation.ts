'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Item = { topic: string; content: string; error?: string; retryMayConsume?: boolean };
type Failure = 'unconfirmed' | 'limit' | 'pro';
const initial = () => ({ results: [] as Item[], loading: false, pendingCount: 0, recoverable: false, error: null as Failure | null });

// Keys and selection live in this browser interaction; the server retains batch
// identity. Recovery reads the same batch. Generating failed topics is a new
// acknowledged operation, never recovery authority for an uncertain old item.
export function useBulkGeneration(userId: string | undefined, email: string | null | undefined,
  authStatus: string, template: string, topics: string[], options: Record<string, string>, lang: string) {
  const body = JSON.stringify({ template, topics, options: Object.fromEntries(Object.keys(options).sort().map(k => [k, options[k]])), lang });
  const scope = useMemo(() => ({ active: true, results: [] as Item[], flight: null as Promise<void> | null,
    controller: null as AbortController | null,
    attempt: null as { key: string; rawBody: string; positions: number[] } | null }), [userId, email, authStatus, body]);
  const active = useRef(scope); active.current = scope;
  const [store, setStore] = useState(() => ({ scope, ...initial() }));
  const current = useCallback(() => scope.active && active.current === scope && authStatus === 'authenticated'
    && !!userId && !!email && ['es', 'en'].includes(lang), [scope, userId, email, authStatus, lang]);
  const update = useCallback((value: Partial<ReturnType<typeof initial>>) => {
    if (current()) setStore(old => ({ ...(old.scope === scope ? old : { scope, ...initial() }), ...value }));
  }, [scope, current]);
  const run = useCallback((failedOnly: boolean, recover = false) => {
    if (!current()) return Promise.resolve();
    if (scope.flight) return scope.flight;
    const input = JSON.parse(body) as { template: string; topics: string[]; options: Record<string, string>; lang: string };
    const positions = recover ? scope.attempt?.positions ?? []
      : failedOnly ? scope.results.flatMap((item, i) => item.error ? [i] : []) : input.topics.map((_, i) => i);
    if (!positions.length || positions.length > 10) return Promise.resolve();
    const requested = positions.map(i => input.topics[i]);
    const previous = scope.results.slice();
    if (!recover) {
      try { scope.attempt = { key: crypto.randomUUID(), positions,
        rawBody: JSON.stringify({ ...input, topics: requested }) }; }
      catch { update({ error: 'unconfirmed' }); return Promise.resolve(); }
    }
    const attempt = scope.attempt;
    if (!attempt) return Promise.resolve();
    if (!failedOnly && !recover) scope.results = [];
    update({ loading: true, pendingCount: positions.length, recoverable: true, error: null, results: scope.results });
    const controller = new AbortController(); scope.controller = controller;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 90_000);
    const flight = Promise.resolve().then(async () => {
      try {
        if (!current()) return;
        const response = await fetch('/api/generate/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': attempt.key },
          body: attempt.rawBody, signal: controller.signal });
        const data = await response.json();
        if (!current()) return;
        if (timedOut) throw Error('Unconfirmed response');
        if (!response.ok) {
          update({ error: data?.error === 'pro_required' ? 'pro' : data?.limitReached === true ? 'limit' : 'unconfirmed' });
          return;
        }
        // Validate the complete response before merging any neighbour. Matching is
        // positional so repeated topics remain distinct; never guess by text or ID.
        if (!data || data.total !== requested.length || !Number.isSafeInteger(data.generated)
          || !Array.isArray(data.results) || data.results.length !== requested.length) throw Error('Invalid batch');
        const items: Item[] = data.results.map((item: Item, i: number) => {
          if (!item || item.topic !== requested[i] || typeof item.content !== 'string'
            || (item.retryMayConsume !== undefined && typeof item.retryMayConsume !== 'boolean')) throw Error('Invalid item');
          if (item.error !== undefined) {
            if (typeof item.error !== 'string' || !item.error.trim() || item.error.length > 500 || item.content !== '') throw Error('Invalid error');
            return { topic: item.topic, content: '', error: item.error, retryMayConsume: item.retryMayConsume };
          }
          if (!item.content.trim()) throw Error('Missing result');
          return { topic: item.topic, content: item.content };
        });
        if (data.generated !== items.filter(item => !item.error).length) throw Error('Invalid count');
        if (recover && positions.some((position, i) => previous[position] && !previous[position].error
          && !items[i].error && previous[position].content !== items[i].content)) throw Error('Changed retained result');
        const merged = failedOnly || recover ? previous : [];
        positions.forEach((position, i) => {
          if (!recover || !merged[position] || merged[position].error) merged[position] = items[i];
        });
        scope.results = merged;
        const recoverable = items.some(item => !!item.error);
        if (!recoverable) scope.attempt = null;
        update({ results: merged, error: null, recoverable });
      } catch {
        if (current()) update({ error: 'unconfirmed' });
      } finally {
        clearTimeout(timer);
        if (scope.controller === controller) scope.controller = null;
        if (scope.flight === flight) scope.flight = null;
        update({ loading: false, pendingCount: 0 });
      }
    });
    scope.flight = flight;
    return flight;
  }, [body, scope, current, update]);
  useEffect(() => {
    scope.active = true;
    return () => { scope.active = false; scope.controller?.abort(); };
  }, [scope]);
  const value = store.scope === scope && current() ? store : initial();
  return { ...value, generated: value.results.filter(item => !item.error).length,
    failed: value.results.filter(item => !!item.error).length, isCurrent: current,
    generate: () => run(false), generateFailed: () => run(true), recover: () => run(false, true) };
}
