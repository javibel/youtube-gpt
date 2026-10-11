'use client';
import { useEffect, useRef, useState } from 'react';
import { beginCheckout, retainedCheckout, trustedCheckoutOutcome, checkoutBlocked, observeCheckoutOriginal } from '@/lib/profile-checkout-client';
import type { CheckoutAttempt, CheckoutOutcome, CheckoutOwner, CheckoutPlan } from '@/lib/profile-checkout-client';
export function useProfileCheckout(owner: CheckoutOwner, status: string, language: 'es' | 'en', selectedPlan: CheckoutPlan | null, isCurrent: () => boolean) {
  const identity = JSON.stringify([owner.userId, owner.email, status]), account = useRef({ identity });
  if (account.current.identity !== identity) account.current = { identity };
  const capturedAccount = account.current, current = useRef({ account: capturedAccount, language, selectedPlan });
  if (current.current.account !== capturedAccount || current.current.language !== language || current.current.selectedPlan !== selectedPlan)
    current.current = { account: capturedAccount, language, selectedPlan };
  const invocation = current.current, mounted = useRef(true), observation = useRef<{ invocation: object; waiting: boolean } | null>(null);
  const [view, setView] = useState<{ invocation: object; attempt: CheckoutAttempt; waiting: boolean; outcome?: CheckoutOutcome; navigationFailed?: boolean } | null>(null);
  const [, render] = useState(0);
  const canConsume = () => account.current === capturedAccount && isCurrent() && status === 'authenticated' && !!owner.userId && !!owner.email;
  const active = () => mounted.current && canConsume() && current.current === invocation;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  function wait(a: CheckoutAttempt, pending: Promise<CheckoutOutcome>) {
    if (!active()) return;
    const ticket = { invocation, waiting: true }; observation.current = ticket; setView({ invocation, attempt: a, waiting: true });
    void pending.then(result => {
      if (observation.current !== ticket || !active()) return;
      ticket.waiting = false;
      const trusted = trustedCheckoutOutcome(a), outcome = result.status === 'unconfirmed' ? result : trusted ?? { status: 'unconfirmed' as const };
      setView({ invocation, attempt: a, waiting: false, outcome });
      if (outcome.status !== 'confirmed' || a.plan !== selectedPlan || a.lang !== language || !active()) return;
      try { window.location.href = outcome.receipt.url; }
      catch { if (active()) setView({ invocation, attempt: a, waiting: false, outcome, navigationFailed: true }); }
    });
  }
  const shown = active() && view?.invocation === invocation ? view : null, retained = active() ? retainedCheckout(owner) : undefined;
  const blocked = active() && checkoutBlocked(owner), waiting = !!shown?.waiting;
  function start(plan: CheckoutPlan) {
    if (!active() || waiting || blocked || plan !== selectedPlan) return;
    const a = beginCheckout(owner, plan, language, canConsume);
    if (a) wait(a, a.waiter); else render(n => n + 1);
  }
  function observe() {
    if (!active() || waiting || (observation.current?.invocation === invocation && observation.current.waiting) || !retained) return;
    wait(retained, observeCheckoutOriginal(retained));
  }
  return { start, observe, blocked, retained, pending: !!retained?.pending, waiting, outcome: shown?.outcome, navigationFailed: !!shown?.navigationFailed,
    selectionMatches: !!retained && retained.plan === selectedPlan && retained.lang === language,
    canStart: active() && selectedPlan !== null && !blocked && !waiting, canObserve: active() && !!retained && !waiting };
}
