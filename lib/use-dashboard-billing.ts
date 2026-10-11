'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { beginCheckout, checkoutBlocked, observeCheckoutOriginal, retainedCheckout, trustedCheckoutOutcome } from '@/lib/profile-checkout-client';
import type { CheckoutAttempt, CheckoutOutcome, CheckoutPlan } from '@/lib/profile-checkout-client';

import { useSubscriptionCancellation } from '@/lib/use-subscription-cancellation';
import type { CancellationSelection } from '@/lib/subscription-cancellation-client';

type Action = 'checkout'|'cancel'|'sync';
const plans = ['monthly','yearly','business_monthly','business_yearly'];
const initial = () => ({ busy: null as Action|null, error: null as Action|null,
  cancelled: false, syncResult: null as 'synced'|'none'|null,
  checkoutState: null as 'confirmed'|'unconfirmed'|null, navigationFailed: false });

export function useDashboardBilling(userId: string|undefined, email: string|null|undefined,
  authStatus: string, lang: string, refreshStats: () => Promise<void>, selectedPlan: CheckoutPlan = 'monthly', subscriptionPlan?: string, subscription?: { id?: string; plan?: string; status: string; cancelAtPeriodEnd: boolean } | null) {
  const account = useMemo(() => ({ userId, email, authStatus }), [userId,email,authStatus]);
  const activeAccount = useRef(account); activeAccount.current = account;
  const scope = useMemo(() => ({ active: true, action: null as Action|null,
    flight: null as Promise<void>|null, key: '', cancelled: false, generation: {} }), [account,lang,selectedPlan,subscriptionPlan]);
  const generation=scope.generation;
  const active = useRef(scope); active.current = scope;
  const [store,setStore] = useState(() => ({ scope,...initial() }));
  const canConsume = useCallback(() => activeAccount.current === account
    && account.authStatus === 'authenticated' && !!account.userId && !!account.email, [account]);
  const current = useCallback(() => scope.active && scope.generation === generation && active.current === scope && canConsume(), [scope,generation,canConsume]);
  const update = useCallback((value: Partial<ReturnType<typeof initial>>) => {
    if (current()) setStore(old => ({ ...(old.scope === scope ? old : { scope,...initial() }),...value }));
  }, [scope,current]);
  const owner = { userId: userId ?? '', email: email ?? '' };
  const selection: CancellationSelection | null = subscription && (subscription.plan==='pro'||subscription.plan==='business') ? {subscriptionId:subscription.id??'',plan:subscription.plan,status:subscription.status,cancelAtPeriodEnd:subscription.cancelAtPeriodEnd}:null;
  const cancellation=useSubscriptionCancellation(owner,authStatus,lang,selection,canConsume,()=>{ void refreshStats().catch(()=>{}); });

  function waitCheckout(a: CheckoutAttempt, pending: Promise<CheckoutOutcome>, navigate: boolean) {
    scope.action='checkout'; scope.key=a.plan+':'+a.lang;
    update({busy:'checkout',error:null,checkoutState:null,navigationFailed:false});
    const flight = pending.then(result => {
      if (!current()) return;
      const trusted = trustedCheckoutOutcome(a);
      const outcome = result.status === 'confirmed' && trusted?.status === 'confirmed' ? trusted : {status:'unconfirmed' as const};
      update({checkoutState:outcome.status,error:outcome.status === 'confirmed' ? null : 'checkout'});
      if (outcome.status !== 'confirmed' || !navigate || !current()) return;
      try { window.location.href=outcome.receipt.url; }
      catch { update({navigationFailed:true}); }
    }).finally(() => {
      if (scope.flight === flight) { scope.flight=null; scope.action=null; update({busy:null}); }
    });
    scope.flight=flight;
    return flight;
  }
  function handleUpgrade(plan: CheckoutPlan) {
    if (!current() || cancellation.waiting) return Promise.resolve();
    if (scope.flight) return scope.action === 'checkout' && scope.key === plan+':'+lang ? scope.flight : Promise.resolve();
    if (!plans.includes(plan) || !plans.includes(selectedPlan) || (lang !== 'es' && lang !== 'en')) {
      update({error:'checkout'}); return Promise.resolve();
    }
    if(checkoutBlocked(owner)) return Promise.resolve();
    // All Dashboard and profile entry points share the original admission. A
    // completed or uncertain session does not authorize another checkout.
    const attempt=beginCheckout(owner,plan,lang,canConsume);
    if (!attempt) { update({error:'checkout',checkoutState:'unconfirmed'}); return Promise.resolve(); }
    return waitCheckout(attempt,attempt.waiter,true);
  }
  function handleObserveCheckout() {
    if (!current() || scope.flight) return Promise.resolve();
    const original=retainedCheckout(owner);
    if (!original) return Promise.resolve();
    return waitCheckout(original,observeCheckoutOriginal(original),original.plan === selectedPlan && original.lang === lang);
  }
  const run = useCallback((action: 'sync') => {
    if (!current()) return Promise.resolve();
    if (scope.flight) return scope.action === action ? scope.flight : Promise.resolve();
    scope.action=action;scope.key=action; update({busy:action,error:null,syncResult:null});
    const flight = (async () => {
      try {
        const response = await fetch('/api/stripe/'+action, {method:'POST'});
        if (!response.ok) throw Error('Billing unconfirmed');
        const body = await response.json();
        if (!current()) return;
        if (!body || body.userId !== userId || body.email !== email) throw Error('Billing identity mismatch');
        if (typeof body.synced !== 'boolean' || (body.synced && !['active','trialing'].includes(body.status))) throw Error('Sync unconfirmed');
        update({syncResult:body.synced ? 'synced' : 'none'});
        if (body.synced) await refreshStats();
      } catch { update({error:action}); }
      finally { update({busy:null}); }
    })();
    scope.flight=flight;
    void flight.finally(() => { if (scope.flight === flight) {scope.flight=null;scope.action=null;} });
    return flight;
  }, [scope,current,update,userId,email,lang,refreshStats]);
  useEffect(() => {scope.active=true;setStore({scope,...initial()});return () => {
    scope.active=false;scope.generation={};
    if(scope.action === 'checkout') {scope.flight=null;scope.action=null;}
  };}, [scope]);
  const view = store.scope === scope && current() ? store : initial();
  const original=current() ? retainedCheckout(owner) : undefined;
  return {billingBusy:view.busy !== null || cancellation.waiting,upgrading:view.busy === 'checkout',cancelling:cancellation.waiting,
    syncing:view.busy === 'sync',billingError:cancellation.outcome?.status==='unconfirmed'?'cancel' as const:view.error,cancelConfirmed:cancellation.confirmed,syncResult:view.syncResult,
    checkoutBlocked:current() && checkoutBlocked(owner),checkoutHasOriginal:!!original,checkoutPending:!!original?.pending,
    checkoutSelectionMatches:!!original && original.plan === selectedPlan && original.lang === lang,
    checkoutState:view.checkoutState,checkoutNavigationFailed:view.navigationFailed,
    handleUpgrade,handleObserveCheckout,
    cancelBlocked:cancellation.blocked,cancelHasOriginal:cancellation.hasOriginal,cancelPending:cancellation.pending,cancelSelectionMatches:cancellation.selectionMatches,cancelCanStart:cancellation.canStart,cancelCanObserve:cancellation.canObserve,
    handleCancel:()=>current()&&!scope.flight?cancellation.start():Promise.resolve(),
    handleObserveCancel:()=>current()&&!scope.flight?cancellation.observe():Promise.resolve(),handleSync:()=>!cancellation.waiting?run('sync'):Promise.resolve()};
}
