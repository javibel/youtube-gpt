'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClientReadWait } from '@/lib/client-read-wait';

export type DashboardStats = {
  user: { id: string; email: string; name: string | null; createdAt: string };
  stats: { totalGenerations: number; generationsThisMonth: number; generationsReserved: number; quotaOccupied: number; limit: number; remaining: number;
    isPro: boolean; plan: 'free'|'pro'|'business'; streak: number; videoTipsRemaining: number|null };
  subscription: { id?: string; status: string; plan?: string; cancelAtPeriodEnd: boolean; currentPeriodEnd: string | null } | null;
};
const initial = () => ({ data: null as DashboardStats|null, refreshing: false, error: false });
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
export function decodeDashboardStats(value: unknown, userId: string, email: string): DashboardStats {
  const body = value as DashboardStats | null;
  if (!body?.user || body.user.id !== userId || body.user.email !== email || !(body.user.name === null || typeof body.user.name === 'string')
    || !date(body.user.createdAt) || !body.stats || !Object.hasOwn(body, 'subscription')) throw Error('Invalid statistics');
  const s = body.stats;
  if (![s.totalGenerations, s.generationsThisMonth, s.generationsReserved, s.quotaOccupied, s.limit, s.remaining, s.streak].every(count) || s.limit === 0
    || !['free','pro','business'].includes(s.plan) || typeof s.isPro !== 'boolean' || s.isPro !== (s.plan !== 'free')
    || s.quotaOccupied !== s.generationsThisMonth + s.generationsReserved
    || s.remaining !== Math.max(0, s.limit - s.quotaOccupied)
    || (s.isPro ? s.videoTipsRemaining !== null : !count(s.videoTipsRemaining) || s.videoTipsRemaining > 1)) throw Error('Invalid statistics');
  const sub = body.subscription;
  if (sub !== null && (!sub || (sub.id !== undefined && (typeof sub.id !== 'string' || !/^[\w-]{1,128}$/.test(sub.id))) || typeof sub.status !== 'string' || !sub.status
    || !(sub.plan === undefined || typeof sub.plan === 'string') || typeof sub.cancelAtPeriodEnd !== 'boolean'
    || !(sub.currentPeriodEnd === null || date(sub.currentPeriodEnd)))) throw Error('Invalid subscription');
  return { user: { id: body.user.id, email: body.user.email, name: body.user.name, createdAt: body.user.createdAt },
    stats: { totalGenerations: s.totalGenerations, generationsThisMonth: s.generationsThisMonth,
      generationsReserved: s.generationsReserved, quotaOccupied: s.quotaOccupied, limit: s.limit,
      remaining: s.remaining, isPro: s.isPro, plan: s.plan, streak: s.streak, videoTipsRemaining: s.videoTipsRemaining },
    subscription: sub ? { id: sub.id, status: sub.status, plan: sub.plan, cancelAtPeriodEnd: sub.cancelAtPeriodEnd, currentPeriodEnd: sub.currentPeriodEnd } : null };
}

export function useDashboardStats(userId: string | undefined, email: string | null | undefined, authStatus: string) {
  const scope = useMemo(() => ({ active: true, sequence: 0, flight: null as Promise<void>|null,
    waiting: null as ReturnType<typeof createClientReadWait>|null }), [userId,email,authStatus]);
  const active = useRef(scope); active.current = scope;
  const [store,setStore] = useState(() => ({ scope, ...initial() }));
  const current = useCallback(() => active.current === scope && scope.active && authStatus === 'authenticated' && !!userId && !!email,
    [scope,authStatus,userId,email]);
  const update = useCallback((fn: (v: ReturnType<typeof initial>) => ReturnType<typeof initial>) => {
    if (current()) setStore(prev => ({ scope, ...fn(prev.scope === scope ? prev : initial()) }));
  }, [scope,current]);
  const read = useCallback(async (force = false) => {
    if (!current()) return;
    if (!force && scope.flight) return scope.flight;
    scope.waiting?.cancel();
    const sequence = ++scope.sequence;
    const waiting = createClientReadWait(); scope.waiting = waiting;
    update(v => ({ ...v, refreshing: true, error: false }));
    const flight = (async () => {
      try {
        const response = await waiting.wait(fetch('/api/user/stats', { cache: 'no-store', signal: waiting.signal }));
        if (!response.ok) throw Error('Statistics unavailable');
        const data = decodeDashboardStats(await waiting.wait(response.json()), userId!, email!);
        if (current() && scope.sequence === sequence) update(v => ({ ...v,data }));
      } catch {
        if (current() && scope.sequence === sequence) update(v => ({ ...v,error: true }));
      } finally {
        waiting.finish(); if (scope.waiting === waiting) scope.waiting = null;
        if (current() && scope.sequence === sequence) update(v => ({ ...v,refreshing: false }));
      }
    })();
    scope.flight = flight;
    try { await flight; } finally { if (scope.flight === flight) scope.flight = null; }
  }, [scope,current,update,userId,email]);
  const refreshStats = useCallback(() => read(true), [read]);
  const retryStats = useCallback(() => read(), [read]);
  useEffect(() => {
    scope.active = true; active.current = scope; setStore({ scope, ...initial() }); void read();
    return () => {
      scope.active = false;
      void Promise.resolve().then(() => { if (!scope.active || active.current !== scope) scope.waiting?.cancel(); });
    };
  }, [scope,read]);
  const view = store.scope === scope && current() ? store : initial();
  const error = view.error || (authStatus === 'authenticated' && (!userId || !email));
  return { data: view.data, loading: !view.data && !error, statsRefreshing: view.refreshing,
    statsError: error, refreshStats, retryStats };
}
