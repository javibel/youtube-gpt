'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { beginDowngrade, retainedDowngrade, trustedDowngradeOutcome, downgradeBlocked, observeDowngradeOriginal, validDowngradeSelection } from '@/lib/subscription-downgrade-client';
import type { DowngradeOwner, DowngradeSelection, DowngradeAttempt, DowngradeOutcome, DowngradeReceipt } from '@/lib/subscription-downgrade-client';
export function useSubscriptionDowngrade(owner: DowngradeOwner, status: string, lang: string, selection: (Omit<DowngradeSelection, 'plan'> & { plan: 'pro' | 'business' }) | null,
  isCurrent: () => boolean, onConfirmed: (receipt: DowngradeReceipt) => void) {
  const account = useMemo(() => ({ userId: owner.userId, email: owner.email, status }), [owner.userId,owner.email,status]);
  const activeAccount = useRef(account); activeAccount.current = account;
  const confirmedSelection = useRef<{ account: object; lang: string; subscriptionId: string; status: string; scope: { active: boolean }; attempt: DowngradeAttempt } | null>(null);
  const own = confirmedSelection.current;
  // Only a previously consumed own receipt permits its same-selection Business→Pro read transition.
  const ownTransition = !!own && own.scope.active && own.account === account && own.lang === lang
    && own.subscriptionId === selection?.subscriptionId && own.status === selection?.status
    && selection?.plan === 'pro' && trustedDowngradeOutcome(own.attempt)?.status === 'confirmed';
  const selectedPlan = ownTransition ? 'business' : selection?.plan;
  const scope = useMemo(() => ({ active: true, generation: {}, flight: null as Promise<void> | null, delivered: null as DowngradeAttempt | null }),
    [account,lang,selection?.subscriptionId,selectedPlan,selection?.status,selection?.cancelAtPeriodEnd]);
  const generation = scope.generation, currentScope = useRef(scope); currentScope.current = scope;
  const [view,setView] = useState<{ scope: object; generation: object; waiting: boolean; outcome?: DowngradeOutcome } | null>(null);
  const [,render] = useState(0);
  const canConsume = () => activeAccount.current === account && isCurrent() && status === 'authenticated' && /^[\w-]{1,128}$/.test(owner.userId) && !!owner.email && owner.email.length<=320;
  const current = () => canConsume() && scope.active && scope.generation === generation && currentScope.current === scope;
  const retained = current() ? retainedDowngrade(owner) : undefined;
  const matches = (a: DowngradeAttempt) => !!selection && a.selection.subscriptionId === selection.subscriptionId
    && (a.selection.plan === selection.plan || ownTransition) && a.selection.status === selection.status && a.selection.cancelAtPeriodEnd === selection.cancelAtPeriodEnd && a.lang === lang;
  function wait(a: DowngradeAttempt, pending: Promise<DowngradeOutcome>) {
    setView({scope,generation,waiting:true});
    const flight = pending.then(result => {
      if (!current()) return;
      const trusted = trustedDowngradeOutcome(a), outcome = result.status === 'confirmed' && trusted?.status === 'confirmed' && matches(a)
        ? trusted : { status: 'unconfirmed' as const };
      setView({scope,generation,waiting:false,outcome});
      if (outcome.status === 'confirmed' && scope.delivered !== a && current()) {
        scope.delivered = a;
        confirmedSelection.current = { account,lang,subscriptionId:a.selection.subscriptionId,status:a.selection.status,scope,attempt:a };
        // Follow-up UI/read is distinct from the original mutation. It cannot
        // turn an independent row or a refresh into a downgrade receipt.
        try { onConfirmed(outcome.receipt); } catch { /* A failed follow-up cannot erase the own original receipt. */ }
      }
    }).catch(() => { if(current())setView({scope,generation,waiting:false,outcome:{status:'unconfirmed'}}); })
      .finally(() => { if(scope.flight===flight)scope.flight=null; });
    scope.flight = flight; return flight;
  }
  function start() {
    if (!current()) return Promise.resolve();
    if (scope.flight) return scope.flight;
    if (!validDowngradeSelection(selection) || selection.cancelAtPeriodEnd || downgradeBlocked(owner) || (lang!=='es'&&lang!=='en')) return Promise.resolve();
    if (!window.confirm(lang==='en'?'Downgrade from Business to Pro? This applies now, prorated on your next invoice?':'¿Bajar de Business a Pro? El cambio se aplica ahora, con prorrateo en tu próxima factura.') || !current()) return Promise.resolve();
    const a=beginDowngrade(owner,selection,lang,canConsume);
    if(a)return wait(a,a.waiter);render(n=>n+1);return Promise.resolve();
  }
  function observe() {
    if (!current()) return Promise.resolve();
    if (scope.flight) return scope.flight;
    if (!retained || !matches(retained)) return Promise.resolve();
    return wait(retained,observeDowngradeOriginal(retained));
  }
  useEffect(() => {scope.active=true;return()=>{scope.active=false;scope.generation={};scope.flight=null;};},[scope]);
  const shown=current()&&view?.scope===scope&&view.generation===generation?view:null, blocked=current()&&downgradeBlocked(owner);
  return {start,observe,waiting:!!shown?.waiting,outcome:shown?.outcome,confirmed:shown?.outcome?.status==='confirmed',blocked,
    hasOriginal:!!retained,pending:!!retained?.pending,selectionMatches:!!retained&&matches(retained),
    canStart:current()&&validDowngradeSelection(selection)&&!selection.cancelAtPeriodEnd&&!blocked&&!shown?.waiting,
    canObserve:current()&&!!retained&&matches(retained)&&!shown?.waiting};
}
