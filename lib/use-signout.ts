'use client';
import { useEffect, useRef, useState } from 'react';
import { beginSignout, claimSignoutNavigation, currentSignoutOriginal, observeSignoutOriginal, sameSignoutContext, sameSignoutOwner, signoutBlocked, signoutNeedsObservation, subscribeSignout } from '@/lib/signout-client';
import type { SignoutAttempt, SignoutOutcome, SignoutOwner } from '@/lib/signout-client';

export function useSignout(owner: SignoutOwner, status: string, language: string, context: object | null | undefined) {
  const current = useRef({ owner, language, context, liveStatus: status, epoch: {}, attempt: null as SignoutAttempt | null });
  const state = current.current;
  const changedOwner = status === 'authenticated' && (state.context !== context || state.owner.userId !== owner.userId
    || state.owner.email !== owner.email || (state.owner.authSessionRef ?? '') !== (owner.authSessionRef ?? ''));
  // An independently observed session→null transition may finish this same owned
  // command; a changed native reference/account retires its view and future POST.
  if (changedOwner || state.language !== language || status === 'loading') {
    current.current = { owner, language, context, liveStatus: status, epoch: {}, attempt: null };
  } else if (status === 'authenticated') state.owner = owner;
  current.current.liveStatus = status;
  const captured = current.current, mounted = useRef(true);
  const observer = useRef<{ epoch: object; wait: ReturnType<typeof observeSignoutOriginal> } | null>(null);
  const [view, setView] = useState<{ epoch: object; attempt: SignoutAttempt; waiting: boolean; outcome?: SignoutOutcome; navigationFailed?: boolean } | null>(null);
  const [, render] = useState(0);
  const active = () => mounted.current && current.current === captured;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; observer.current?.wait.retire(); }; }, []);
  useEffect(() => subscribeSignout(() => render(value => value + 1)), []);
  useEffect(() => () => {
    if (observer.current?.epoch === captured.epoch) observer.current.wait.retire();
  }, [captured]);
  const shown = active() && view?.epoch === captured.epoch ? view : null;
  const original = currentSignoutOriginal();
  const ownOriginal = original && captured.context && sameSignoutContext(original, captured.context) && sameSignoutOwner(original, captured.owner) ? original : undefined;
  const canStart = () => active() && current.current.liveStatus === 'authenticated' && !!context && !!owner.userId && !!owner.email
    && !signoutBlocked() && !shown?.attempt && (!ownOriginal || !signoutNeedsObservation(ownOriginal));

  function wait(attempt: SignoutAttempt) {
    if (!active()) return;
    captured.attempt = attempt;
    observer.current?.wait.retire();
    const wait = observeSignoutOriginal(attempt, active); observer.current = { epoch: captured.epoch, wait };
    setView({ epoch: captured.epoch, attempt, waiting: true });
    void wait.promise.then(outcome => {
      if (!active() || observer.current?.wait !== wait) return;
      setView({ epoch: captured.epoch, attempt, waiting: false, outcome });
      if (outcome.status === 'confirmed' && active() && claimSignoutNavigation(attempt, outcome)) {
        try { window.location.href = '/'; }
        catch { if (active()) setView({ epoch: captured.epoch, attempt, waiting: false, outcome, navigationFailed: true }); }
      }
    });
  }
  function start() {
    if (!canStart()) return;
    const attempt = beginSignout(owner, window.location.origin, context!, () => active() && current.current.liveStatus === 'authenticated'
      && current.current.context === context && current.current.owner.userId === owner.userId && current.current.owner.email === owner.email
      && (current.current.owner.authSessionRef ?? '') === (owner.authSessionRef ?? ''));
    if (attempt) wait(attempt); else render(value => value + 1);
  }
  function observe() { if (active() && !shown?.waiting && ownOriginal) wait(ownOriginal); }
  return { start, observe, canStart: canStart(), waiting: !!shown?.waiting, outcome: shown?.outcome,
    blocked: signoutBlocked(), canObserve: !!ownOriginal && !shown?.waiting,
    navigationFailed: !!shown?.navigationFailed };
}
