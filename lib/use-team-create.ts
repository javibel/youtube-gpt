'use client';
import { useEffect, useRef, useState } from 'react';
import { beginTeamCreation, retainedTeamCreation, teamCreationBlocked, teamCreationDraftBlocked, validTeamName } from '@/lib/team-create-client';
import type { TeamCreateAttempt, TeamCreateOutcome } from '@/lib/team-create-client';
import type { TeamOwner } from '@/lib/team-read-contract';
export function useTeamCreate(owner: TeamOwner, status: string, language: string, name: string) {
  const identity = JSON.stringify([owner.userId, owner.email]), scope = JSON.stringify([identity, status, language, name]);
  const current = useRef({ scope, identity, attempt: null as TeamCreateAttempt | null });
  if (current.current.scope !== scope) current.current = { scope, identity, attempt: current.current.identity === identity ? current.current.attempt : null };
  const invocation = current.current, mounted = useRef(true);
  const [view, setView] = useState<{ scope: string; attempt: TeamCreateAttempt; outcome?: TeamCreateOutcome } | null>(null);
  const [, renderDenial] = useState(0);
  const active = () => mounted.current && current.current === invocation && status === 'authenticated' && !!owner.userId && typeof owner.email === 'string';
  const relevant = active() && view?.scope === scope && view.attempt === current.current.attempt ? view : null;
  function observe(a: TeamCreateAttempt, alive: () => boolean = () => true) {
    current.current.attempt = a;
    const apply = (outcome?: TeamCreateOutcome) => { if (alive() && active() && current.current.attempt === a) setView({ scope, attempt: a, outcome }); };
    apply(a.outcome ?? a.waitOutcome); void a.original.then(apply); void a.waiter.then(outcome => { if (!a.outcome) apply(outcome); });
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { let alive = true; if (active()) { const a = current.current.attempt ?? retainedTeamCreation(owner); if (a) observe(a, () => alive); } return () => { alive = false; }; }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps
  function start() { if (!active() || !validTeamName(name) || teamCreationBlocked(owner)) return; const a = beginTeamCreation(owner, name); if (a) observe(a); else renderDenial(n => n + 1); }
  return { start, canAct: active, canEdit: () => active() && !teamCreationDraftBlocked(owner),
    attempt: relevant?.attempt ?? null, outcome: relevant?.outcome, creating: !!relevant && !relevant.outcome,
    blocked: active() && teamCreationBlocked(owner), pending: !!relevant?.attempt.pending };
}
