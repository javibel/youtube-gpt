'use client';
import { useEffect, useRef, useState } from 'react';
import { subscribeSessionCookieWriter } from '@/lib/session-cookie-writer';
import { beginGoogleSignin, claimGoogleSigninRedirect, googleSigninBlocked, observeGoogleSigninOriginal, retireGoogleSigninProgress, type GoogleSigninAttempt, type GoogleSigninOutcome } from '@/lib/google-signin-client';

export function useGoogleSignin(frame: object, callbackUrl: string, enabled: boolean, canStart: () => boolean) {
  const context = useRef({}), mounted = useRef(true), live = useRef({ frame, enabled, canStart }); live.current = { frame, enabled, canStart };
  const command = useRef<{ attempt: GoogleSigninAttempt; frame: object } | undefined>(undefined);
  const observer = useRef<ReturnType<typeof observeGoogleSigninOriginal> | undefined>(undefined);
  const [, repaint] = useState(0);
  const [shown, setShown] = useState<{ frame: object; waiting: boolean; outcome?: GoogleSigninOutcome } | undefined>(undefined);
  useEffect(() => {
    mounted.current = true; const unsubscribe = subscribeSessionCookieWriter(() => repaint(n => n + 1));
    return () => { mounted.current = false; unsubscribe(); observer.current?.retire(); if (command.current) retireGoogleSigninProgress(command.current.attempt); };
  }, []);
  useEffect(() => {
    if (command.current && command.current.frame !== frame) { observer.current?.retire(); retireGoogleSigninProgress(command.current.attempt); }
  }, [frame]);
  async function observeOwn() {
    const own = command.current;
    const active = () => mounted.current && command.current === own && live.current.frame === own?.frame && live.current.enabled && live.current.canStart();
    if (!own || !active() || observer.current) return;
    const view = observeGoogleSigninOriginal(own.attempt, context.current, active); observer.current = view;
    setShown({ frame: own.frame, waiting: true });
    const outcome = await view.promise;
    if (observer.current !== view) return;
    observer.current = undefined;
    if (!active()) return;
    setShown({ frame: own.frame, waiting: false, outcome });
    const target = claimGoogleSigninRedirect(own.attempt, context.current, outcome);
    if (target) window.location.href = target;
  }
  function start() {
    if (!mounted.current || live.current.frame !== frame || !live.current.enabled || !live.current.canStart() || googleSigninBlocked()) return;
    const active = () => mounted.current && live.current.frame === frame && live.current.enabled && live.current.canStart();
    const attempt = beginGoogleSignin(callbackUrl, window.location.origin, context.current, active);
    if (!attempt) return;
    command.current = { attempt, frame }; void observeOwn();
  }
  const own = command.current?.frame === frame, current = shown?.frame === frame ? shown : undefined;
  return { start, observe: () => { void observeOwn(); }, blocked: googleSigninBlocked(), own,
    waiting: !!current?.waiting, status: current?.outcome?.status,
    canObserve: !!own && !!current && !current.waiting && current.outcome?.status === 'unconfirmed' };
}
