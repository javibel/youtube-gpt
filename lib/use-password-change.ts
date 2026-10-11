'use client';
import { useEffect, useRef, useState } from 'react';
import { beginPasswordChange, retainedPasswordChange, trustedPasswordOutcome, passwordChangeBlocked, observePasswordOriginal, acknowledgePasswordOriginal } from '@/lib/password-change-client';
import type { PasswordAttempt, PasswordOutcome, PasswordOwner, PasswordReceipt } from '@/lib/password-change-client';
export function usePasswordChange(owner: PasswordOwner, status: string, language: 'es' | 'en', draft: object, isCurrent: () => boolean) {
  const identity = JSON.stringify([owner.userId, owner.email, status]);
  const account = useRef({ identity });
  if (account.current.identity !== identity) account.current = { identity };
  const capturedAccount = account.current;
  const current = useRef({ account: capturedAccount, language, draft });
  if (current.current.account !== capturedAccount || current.current.language !== language || current.current.draft !== draft)
    current.current = { account: capturedAccount, language, draft };
  const invocation = current.current, mounted = useRef(true);
  const [view, setView] = useState<{ invocation: object; attempt: PasswordAttempt; waiting: boolean; outcome?: PasswordOutcome } | null>(null);
  const [, render] = useState(0);
  const canConsume = () => account.current === capturedAccount && isCurrent() && status === 'authenticated' && !!owner.userId && !!owner.email;
  const active = () => mounted.current && canConsume() && current.current === invocation;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  function wait(a: PasswordAttempt, pending: Promise<PasswordOutcome>, onConfirmed?: (receipt: PasswordReceipt) => void) {
    if (!active()) return;
    const ticket = {};
    setView({ invocation, attempt: a, waiting: true });
    // A new observation retires this callback without changing the producer.
    observation.current = ticket;
    void pending.then(result => {
      if (observation.current !== ticket || !active()) return;
      const trusted = trustedPasswordOutcome(a), outcome = result.status === 'unconfirmed' ? result : trusted ?? { status: 'unconfirmed' as const };
      if (outcome.status !== 'unconfirmed') acknowledgePasswordOriginal(a);
      setView({ invocation, attempt: a, waiting: false, outcome });
      if (outcome.status === 'confirmed' && active()) onConfirmed?.(outcome.receipt);
    });
  }
  const observation = useRef<object | null>(null);
  const shown = active() && view?.invocation === invocation ? view : null;
  const retained = active() ? retainedPasswordChange(owner) : undefined;
  const blocked = active() && passwordChangeBlocked(owner);
  function start(input: { currentPassword: string; newPassword: string; lang: 'es' | 'en' }, onConfirmed?: (receipt: PasswordReceipt) => void) {
    if (!active() || shown?.waiting || blocked) return;
    const a = beginPasswordChange(owner, input, canConsume);
    if (a) wait(a, a.waiter, onConfirmed); else render(n => n + 1);
  }
  function observe(onConfirmed?: (receipt: PasswordReceipt) => void) {
    if (!active() || shown?.waiting || !retained) return;
    wait(retained, observePasswordOriginal(retained), onConfirmed);
  }
  return { canObserve: active, start, observe, blocked, retained, pending: !!retained?.pending, waiting: !!shown?.waiting, outcome: shown?.outcome,
    canStart: active() && !blocked && !shown?.waiting };
}
