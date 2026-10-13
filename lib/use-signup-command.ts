'use client';
import { useEffect, useRef, useState } from 'react';
import type { SignupInput } from '@/lib/signup-input';
import type { SignupChallenge } from '@/lib/signup-challenge';
import { subscribeSessionCookieWriter } from '@/lib/session-cookie-writer';
import { beginSignup, claimSignupNavigation, observeSignupOriginal, retireSignupProgress, signupBlocked, signupPending, type SignupAttempt, type SignupOutcome } from '@/lib/signup-client';
export function useSignupCommand(frame: object) {
  const context = useRef({}), mounted = useRef(true), live = useRef(frame); live.current = frame;
  const command = useRef<{ attempt: SignupAttempt; frame: object; origin: string; path: string; search: string } | undefined>(undefined);
  const observer = useRef<ReturnType<typeof observeSignupOriginal> | undefined>(undefined);
  const [, repaint] = useState(0), [shown, setShown] = useState<{ frame: object; waiting: boolean; outcome?: SignupOutcome }>();
  useEffect(() => { mounted.current = true; const unsubscribe = subscribeSessionCookieWriter(() => repaint(n => n + 1));
    return () => { mounted.current = false; unsubscribe(); observer.current?.retire(); if (command.current) retireSignupProgress(command.current.attempt); };
  }, []);
  useEffect(() => { if (command.current && command.current.frame !== frame) { observer.current?.retire(); retireSignupProgress(command.current.attempt); } }, [frame]);
  const active = (own: NonNullable<typeof command.current>) => mounted.current && live.current === own.frame && command.current === own
    && window.location.origin === own.origin && window.location.pathname === own.path && window.location.search === own.search;
  async function observeOwn() {
    const own = command.current; if (!own || !active(own) || observer.current) return;
    const view = observeSignupOriginal(own.attempt, context.current, () => active(own)); observer.current = view; setShown({ frame: own.frame, waiting: true });
    const outcome = await view.promise; if (observer.current !== view) return; observer.current = undefined;
    if (!active(own)) return; setShown({ frame: own.frame, waiting: false, outcome });
    const target = claimSignupNavigation(own.attempt, context.current, outcome);
    if (target) { try { window.location.href = target; } catch { /* Known account retained; never reissue signup to repair navigation. */ } }
  }
  function start(input: Omit<SignupInput, 'turnstileToken'>, challenge: SignupChallenge) {
    if (!mounted.current || live.current !== frame || signupBlocked()) return false;
    const origin = window.location.origin, path = window.location.pathname, search = window.location.search;
    if (path !== '/signup') return false;
    const attempt = beginSignup(input, challenge, context.current, () => mounted.current && live.current === frame && window.location.origin === origin && window.location.pathname === path && window.location.search === search);
    if (!attempt) return false;
    command.current = { attempt, frame, origin, path, search }; void observeOwn(); return true;
  }
  const current = shown?.frame === frame ? shown : undefined, own = command.current?.frame === frame;
  return { start, observe: () => { void observeOwn(); }, blocked: signupBlocked(), pending: signupPending(), waiting: !!current?.waiting, status: current?.outcome?.status,
    own, canObserve: !!own && !current?.waiting && current?.outcome?.status === 'unconfirmed' };
}
