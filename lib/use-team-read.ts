'use client';
import { useEffect, useRef, useState } from 'react';
import { beginTeamRead } from '@/lib/team-read-client';
import type { TeamRead, TeamOutcome } from '@/lib/team-read-client';
import type { TeamOwner } from '@/lib/team-read-contract';
export function useTeamRead(owner: TeamOwner, status: string, language: string) {
  const identity = JSON.stringify([owner.userId, owner.email]), scope = JSON.stringify([identity, status, language]);
  const current = useRef({ scope, identity, status, read: null as TeamRead | null });
  if (current.current.scope !== scope) current.current = { scope, identity, status,
    read: current.current.identity === identity && (current.current.status === status || current.current.read?.pending) ? current.current.read : null };
  const invocation = current.current;
  const mounted = useRef(true);
  const [view, setView] = useState<{ scope: string; read: TeamRead; outcome?: TeamOutcome } | null>(null);
  const active = () => mounted.current && current.current === invocation && status === 'authenticated' && !!owner.userId;
  const relevant = active() && view?.scope === scope && view.read === current.current.read ? view : null;
  function observe(read: TeamRead, alive: () => boolean = () => true) {
    current.current.read = read;
    const apply = (outcome?: TeamOutcome) => { if (alive() && active() && current.current.read === read) setView({ scope, read, outcome }); };
    apply(read.outcome ?? read.waitOutcome);
    void read.original.then(apply);
    void read.waiter.then(outcome => { if (!read.outcome) apply(outcome); });
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let alive = true;
    if (active()) observe(current.current.read ?? beginTeamRead(owner), () => alive);
    return () => { alive = false; };
  }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const canAct = () => active() && current.current.read === relevant?.read && relevant?.outcome?.status === 'ready' && !relevant.read.pending;
  function refresh() { if (active() && current.current.read && !current.current.read.pending) observe(beginTeamRead(owner)); }
  function install(read: TeamRead) {
    // A prior terminal read cannot overwrite a newer read after a remount or
    // another mutation. Its POST receipt remains separate from public display.
    if (active() && read.owner.userId === owner.userId && read.owner.email === owner.email
      && (read.pending || !current.current.read || current.current.read === read)) observe(read);
  }
  return { canAct, refresh, install, data: relevant?.outcome?.status === 'ready' ? relevant.outcome.data : null,
    error: relevant?.outcome?.status === 'error' ? relevant.outcome.error : '', loading: active() && !relevant?.outcome, pending: !!relevant?.read.pending };
}
