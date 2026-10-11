'use client';
import { useEffect, useRef, useState } from 'react';
import { beginTeamJoin, retainedTeamJoin, teamJoinBlocked, trustedTeamJoinOutcome, validTeamJoinToken } from '@/lib/team-join-client';
import type { TeamJoinAttempt, TeamJoinOutcome } from '@/lib/team-join-client';
import type { TeamOwner } from '@/lib/team-read-contract';
export function useTeamJoin(owner: TeamOwner, status: string, language: string, token: string | null) {
  const identity = JSON.stringify([owner.userId, owner.email, token]), scope = JSON.stringify([identity, status, language]);
  const current = useRef({ scope, identity, attempt: null as TeamJoinAttempt | null });
  if (current.current.scope !== scope) current.current = { scope, identity, attempt: current.current.identity === identity ? current.current.attempt : null };
  const invocation = current.current, mounted = useRef(true);
  const [view, setView] = useState<{ scope: string; attempt: TeamJoinAttempt; outcome?: TeamJoinOutcome } | null>(null), [, renderDenial] = useState(0);
  const active = () => mounted.current && current.current === invocation && status === 'authenticated' && !!owner.userId && typeof owner.email === 'string' && !!owner.email && validTeamJoinToken(token);
  const relevant = active() && view?.scope === scope && view.attempt === current.current.attempt ? view : null;
  function observe(a: TeamJoinAttempt, alive: () => boolean = () => true) {
    current.current.attempt = a;
    const apply = (outcome?: TeamJoinOutcome) => { if (alive() && active() && current.current.attempt === a) setView({ scope, attempt: a, outcome: trustedTeamJoinOutcome(a) ?? (outcome?.status === 'confirmed' ? { status: 'unconfirmed' } : outcome) }); };
    apply(trustedTeamJoinOutcome(a) ?? a.waitOutcome); void a.original.then(apply); void a.waiter.then(outcome => { if (!trustedTeamJoinOutcome(a)) apply(outcome); });
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { let alive = true; if (active()) { const a = current.current.attempt ?? retainedTeamJoin(owner, token!); if (a) observe(a, () => alive); } return () => { alive = false; }; }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps
  function start() { if (!active() || teamJoinBlocked(owner) || relevant?.outcome?.status === 'confirmed') return; const a = beginTeamJoin(owner, token!); if (a) observe(a); else renderDenial(n => n + 1); }
  return { start, canObserve: active, canStart: () => active() && !teamJoinBlocked(owner) && relevant?.outcome?.status !== 'confirmed', attempt: relevant?.attempt ?? null, outcome: relevant?.outcome,
    updating: !!relevant && !relevant.outcome, pending: !!relevant?.attempt.pending, blocked: active() && teamJoinBlocked(owner) };
}
