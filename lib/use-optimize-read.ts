'use client';
import { useEffect, useRef, useState } from 'react';
import { beginOptimizeRead } from '@/lib/optimize-read-client';
import type { OptimizeRead, OptimizeOutcome } from '@/lib/optimize-read-client';
import type { ScoreOwner } from '@/lib/optimize-score-client';

export function useOptimizeRead(owner: ScoreOwner, status: string, videoId: string | null, language: string, enabled: boolean) {
  const identity = JSON.stringify([owner.userId, owner.email, videoId]);
  const scope = JSON.stringify([status, identity, language, enabled]);
  const current = useRef({ scope, identity, read: null as OptimizeRead | null, retired: false });
  if (current.current.scope !== scope) current.current = { scope, identity, read: current.current.identity === identity ? current.current.read : null, retired: false };
  const mounted = useRef(true);
  const [view, setView] = useState<{ scope: string; read: OptimizeRead; outcome?: OptimizeOutcome } | null>(null);
  const active = () => mounted.current && current.current.scope === scope && !current.current.retired && status === 'authenticated' && !!owner.userId && enabled;
  const relevant = active() && view?.scope === scope && view.read === current.current.read ? view : null;
  function observe(read: OptimizeRead, alive: () => boolean = () => true) {
    current.current.read = read;
    const apply = (outcome?: OptimizeOutcome) => { if (alive() && active() && current.current.read === read) setView({ scope, read, outcome }); };
    apply(read.outcome ?? read.waitOutcome);
    void read.original.then(apply);
    void read.waiter.then(outcome => { if (!read.outcome) apply(outcome); });
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let alive = true;
    if (active()) observe(current.current.read ?? beginOptimizeRead(owner, videoId), () => alive);
    return () => { alive = false; };
  }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps
  function retry() {
    if (active() && relevant?.outcome?.status === 'error' && !relevant.read.pending && current.current.read === relevant.read) observe(beginOptimizeRead(owner, videoId));
  }
  function install(read: OptimizeRead) {
    if (!active() || read.owner.userId !== owner.userId || read.owner.email !== owner.email || read.videoId !== videoId || current.current.read === read) return;
    observe(read);
  }
  return { canAct: active, retire: () => { if (active()) current.current.retired = true; }, retry, install,
    data: relevant?.outcome?.status === 'ready' ? relevant.outcome.data : null,
    error: relevant?.outcome?.status === 'error' ? relevant.outcome.error : '',
    loading: active() && !relevant?.outcome, pending: !!relevant?.read.pending };
}
