'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Plan = 'monthly'|'yearly'|'business_monthly'|'business_yearly';
type Action = 'checkout'|'cancel'|'sync';
const initial = () => ({ busy: null as Action|null, error: null as Action|null,
  cancelled: false, syncResult: null as 'synced'|'none'|null });

export function useDashboardBilling(userId: string|undefined, email: string|null|undefined,
  authStatus: string, lang: string, refreshStats: () => Promise<void>) {
  const scope = useMemo(() => ({ active: true, action: null as Action|null,
    flight: null as Promise<void>|null, key: '', checkout: null as { key: string; url: string }|null,
    cancelled: false }), [userId,email,authStatus]);
  const active = useRef(scope); active.current = scope;
  const [store,setStore] = useState(() => ({ scope,...initial() }));
  const current = useCallback(() => scope.active && active.current === scope
    && authStatus === 'authenticated' && !!userId && !!email, [scope,userId,email,authStatus]);
  const update = useCallback((value: Partial<ReturnType<typeof initial>>) => {
    if (current()) setStore(old => ({ ...(old.scope === scope ? old : { scope,...initial() }),...value }));
  }, [scope,current]);
  const run = useCallback((action: Action, plan?: Plan) => {
    if (!current()) return Promise.resolve();
    const key = action === 'checkout' ? `${plan}:${lang}` : action;
    if (scope.flight) return scope.action === action && scope.key === key ? scope.flight : Promise.resolve();
    if (action === 'checkout' && (!['monthly','yearly','business_monthly','business_yearly'].includes(plan!)
      || !['es','en'].includes(lang))) { update({error:action}); return Promise.resolve(); }
    if (action === 'checkout' && scope.checkout?.key === key) {
      window.location.href = scope.checkout.url; return Promise.resolve();
    }
    if (action === 'cancel' && scope.cancelled) return Promise.resolve();
    if (action === 'cancel' && (!window.confirm(lang === 'en'
      ? 'Are you sure you want to cancel your subscription at the end of the period?'
      : '¿Seguro que quieres cancelar tu suscripción al final del periodo?') || !current())) return Promise.resolve();
    scope.action=action;scope.key=key; update({busy:action,error:null,syncResult:null});
    const flight = (async () => {
      try {
        const response = await fetch('/api/stripe/'+(action === 'checkout' ? 'checkout' : action), {
          method:'POST', ...(action === 'checkout' ? {headers:{'Content-Type':'application/json'},body:JSON.stringify({plan,lang})} : {}) });
        if (!response.ok) throw Error('Billing unconfirmed');
        const body = await response.json();
        if (!current()) return;
        if (!body || body.userId !== userId || body.email !== email) throw Error('Billing identity mismatch');
        if (action === 'checkout') {
          if (typeof body.url !== 'string' || body.mode !== 'simulated') throw Error('Invalid checkout');
          const url = new URL(body.url);
          // The migration payment facade only emits synthetic links. A real payment remains blocked.
          if (url.protocol !== 'https:' || url.hostname !== 'example.invalid' || url.port
            || url.username || url.password || url.pathname !== '/checkout') throw Error('Invalid checkout');
          scope.checkout={key,url:body.url}; window.location.href=body.url;
        } else if (action === 'cancel') {
          if (body.ok !== true || body.cancelAtPeriodEnd !== true) throw Error('Cancellation unconfirmed');
          scope.cancelled=true;update({cancelled:true});await refreshStats();
        } else {
          if (typeof body.synced !== 'boolean' || (body.synced && !['active','trialing'].includes(body.status))) throw Error('Sync unconfirmed');
          update({syncResult:body.synced ? 'synced' : 'none'});
          if (body.synced) await refreshStats();
        }
      } catch { update({error:action}); }
      finally { update({busy:null}); }
    })();
    scope.flight=flight;
    void flight.finally(() => { if (scope.flight === flight) {scope.flight=null;scope.action=null;} });
    return flight;
  }, [scope,current,update,userId,email,lang,refreshStats]);
  useEffect(() => {scope.active=true;setStore({scope,...initial()});return () => {scope.active=false;};}, [scope]);
  const view = store.scope === scope && current() ? store : initial();
  return {billingBusy:view.busy !== null,upgrading:view.busy === 'checkout',cancelling:view.busy === 'cancel',
    syncing:view.busy === 'sync',billingError:view.error,cancelConfirmed:view.cancelled,syncResult:view.syncResult,
    handleUpgrade:useCallback((plan: Plan) => run('checkout',plan), [run]),
    handleCancel:useCallback(() => run('cancel'), [run]),handleSync:useCallback(() => run('sync'), [run])};
}
