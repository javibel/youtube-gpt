
'use client';
import { useEffect, useRef, useState } from 'react';
import { SessionContext, type SessionContextValue } from 'next-auth/react';
import type { Session } from 'next-auth';
import { beginSessionRead, claimSessionRead, currentSessionReadOriginal, observeSessionRead, ownsSessionRead } from '@/lib/native-session-read';
import type { SessionReadAttempt } from '@/lib/native-session-read';

export default function SessionProviderWrapper({ children }: { children: React.ReactNode }) {
  const context = useRef({}), mounted = useRef(false);
  const observer = useRef<ReturnType<typeof observeSessionRead> | null>(null);
  const attempt = useRef<SessionReadAttempt | null>(null);
  const flight = useRef<Promise<Session | null> | null>(null);
  const uncertain = useRef(false);
  const [state, setState] = useState<{ session: Session | null; loading: boolean; error: boolean }>({ session: null, loading: true, error: false });

  function read(explicitObservation = false): Promise<Session | null> {
    if (!mounted.current) return Promise.resolve(null);
    if (flight.current) return flight.current;
    if (uncertain.current && !explicitObservation) return Promise.resolve(null);
    const original = explicitObservation ? attempt.current : beginSessionRead(context.current);
    if (!original || !ownsSessionRead(original, context.current)) {
      setState(prior => prior.loading ? { ...prior, error: true } : prior);
      return Promise.resolve(null);
    }
    attempt.current = original;
    observer.current?.retire();
    const wait = observeSessionRead(original, context.current, () => mounted.current);
    observer.current = wait;
    setState(prior => ({ ...prior, loading: true, error: false }));
    const pending = wait.promise.then(outcome => {
      if (!mounted.current || observer.current !== wait) return null;
      if (outcome.status === 'confirmed' && claimSessionRead(original, context.current, outcome)) {
        uncertain.current = false;
        setState({ session: outcome.session, loading: false, error: false });
        return outcome.session;
      }
      uncertain.current = true;
      setState({ session: null, loading: true, error: true }); // Unknown is not signed out or authenticated.
      return null;
    });
    flight.current = pending;
    void pending.finally(() => { if (flight.current === pending) flight.current = null; });
    return pending;
  }

  useEffect(() => {
    mounted.current = true;
    const prior = currentSessionReadOriginal();
    if (prior && ownsSessionRead(prior, context.current)) attempt.current = prior;
    void read();
    const visible = () => { if (document.visibilityState === 'visible') void read(); };
    // Broadcast is an invalidation hint only: no supplied user/session/claims are adopted.
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('next-auth');
    const message = (event: MessageEvent) => { if (event.data?.event === 'session') void read(); };
    document.addEventListener('visibilitychange', visible);
    channel?.addEventListener('message', message);
    return () => {
      mounted.current = false; observer.current?.retire(); observer.current = null; flight.current = null;
      document.removeEventListener('visibilitychange', visible); channel?.removeEventListener('message', message); channel?.close();
    };
  }, []);

  const update = (data?: unknown) => data === undefined ? read() : Promise.resolve(null); // No public update flags or SDK POST fallback.
  const value: SessionContextValue = state.loading
    ? { data: null, status: 'loading', update }
    : state.session ? { data: state.session, status: 'authenticated', update }
      : { data: null, status: 'unauthenticated', update };
  return <SessionContext.Provider value={value}>
    {state.error && <div role="alert" className="yv-note yv-note--error">
      No se ha podido confirmar la sesión. / The session could not be confirmed.
      {attempt.current && ownsSessionRead(attempt.current, context.current) && <button type="button" onClick={() => { void read(true); }}>
        Consultar solicitud pendiente / Check pending request
      </button>}
    </div>}
    {children}
  </SessionContext.Provider>;
}
