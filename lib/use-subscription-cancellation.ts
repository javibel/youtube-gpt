'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { beginCancellation, retainedCancellation, trustedCancellationOutcome, cancellationBlocked, observeCancellationOriginal, validCancellationSelection } from '@/lib/subscription-cancellation-client';
import type { CancellationOwner, CancellationSelection, CancellationAttempt, CancellationOutcome, CancellationReceipt } from '@/lib/subscription-cancellation-client';
export function useSubscriptionCancellation(owner: CancellationOwner, status: string, lang: string, selection: CancellationSelection | null,
  isCurrent: () => boolean, onConfirmed: (receipt: CancellationReceipt) => void) {
  const account = useMemo(() => ({ userId: owner.userId, email: owner.email, status }), [owner.userId,owner.email,status]);
  const activeAccount = useRef(account); activeAccount.current = account;
  const scope = useMemo(() => ({ active: true, generation: {}, flight: null as Promise<void> | null, delivered: null as CancellationAttempt | null }),
    [account,lang,selection?.subscriptionId,selection?.plan,selection?.status]);
  const generation = scope.generation, currentScope = useRef(scope); currentScope.current = scope;
  const [view,setView] = useState<{ scope: object; generation: object; waiting: boolean; outcome?: CancellationOutcome } | null>(null);
  const [,render] = useState(0);
  const canConsume = () => activeAccount.current === account && isCurrent() && status === 'authenticated' && /^[\w-]{1,128}$/.test(owner.userId) && !!owner.email && owner.email.length<=320;
  const current = () => canConsume() && scope.active && scope.generation === generation && currentScope.current === scope;
  const retained = current() ? retainedCancellation(owner) : undefined;
  const matches = (a: CancellationAttempt) => !!selection && a.selection.subscriptionId === selection.subscriptionId
    && a.selection.plan === selection.plan && a.selection.status === selection.status && a.lang === lang;
  function wait(a: CancellationAttempt, pending: Promise<CancellationOutcome>) {
    setView({scope,generation,waiting:true});
    const flight = pending.then(result => {
      if (!current()) return;
      const trusted = trustedCancellationOutcome(a), outcome = result.status === 'confirmed' && trusted?.status === 'confirmed' && matches(a)
        ? trusted : { status: 'unconfirmed' as const };
      setView({scope,generation,waiting:false,outcome});
      if (outcome.status === 'confirmed' && scope.delivered !== a && current()) {
        scope.delivered = a;
        // Follow-up UI/read is distinct from the original mutation. It cannot
        // turn an independent row or a refresh into a cancellation receipt.
        try { onConfirmed(outcome.receipt); } catch { /* A failed follow-up cannot erase the own original receipt. */ }
      }
    }).catch(() => { if(current())setView({scope,generation,waiting:false,outcome:{status:'unconfirmed'}}); })
      .finally(() => { if(scope.flight===flight)scope.flight=null; });
    scope.flight = flight; return flight;
  }
  function start() {
    if (!current()) return Promise.resolve();
    if (scope.flight) return scope.flight;
    if (!validCancellationSelection(selection) || selection.cancelAtPeriodEnd || cancellationBlocked(owner) || (lang!=='es'&&lang!=='en')) return Promise.resolve();
    if (!window.confirm(lang==='en'?'Are you sure you want to cancel your subscription at the end of the period?':'¿Seguro que quieres cancelar tu suscripción al final del periodo?') || !current()) return Promise.resolve();
    const a=beginCancellation(owner,selection,lang,canConsume);
    if(a)return wait(a,a.waiter);render(n=>n+1);return Promise.resolve();
  }
  function observe() {
    if (!current()) return Promise.resolve();
    if (scope.flight) return scope.flight;
    if (!retained || !matches(retained)) return Promise.resolve();
    return wait(retained,observeCancellationOriginal(retained));
  }
  useEffect(() => {scope.active=true;return()=>{scope.active=false;scope.generation={};scope.flight=null;};},[scope]);
  const shown=current()&&view?.scope===scope&&view.generation===generation?view:null, blocked=current()&&cancellationBlocked(owner);
  return {start,observe,waiting:!!shown?.waiting,outcome:shown?.outcome,confirmed:shown?.outcome?.status==='confirmed',blocked,
    hasOriginal:!!retained,pending:!!retained?.pending,selectionMatches:!!retained&&matches(retained),
    canStart:current()&&validCancellationSelection(selection)&&!selection.cancelAtPeriodEnd&&!blocked&&!shown?.waiting,
    canObserve:current()&&!!retained&&matches(retained)&&!shown?.waiting};
}
