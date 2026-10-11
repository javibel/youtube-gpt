'use client';
import { useEffect, useRef, useState } from 'react';
import { beginTeamExit, retainedTeamExit, retainedTeamExitForOwner, teamExitBlocked, teamExitCreationBlocked } from '@/lib/team-exit-client';
import type { TeamExitAttempt, TeamExitOutcome } from '@/lib/team-exit-client';
import type { TeamOwner, TeamView } from '@/lib/team-read-contract';

export function useTeamExit(owner: TeamOwner, status: string, language: string, team: TeamView | null, role: string) {
  const ownerIdentity = JSON.stringify([owner.userId, owner.email]);
  const retainedId = retainedTeamExitForOwner(owner)?.input.teamId ?? null;
  const lastTeam = useRef({ ownerIdentity, teamId: team?.id ?? retainedId });
  if (lastTeam.current.ownerIdentity !== ownerIdentity) lastTeam.current = { ownerIdentity, teamId: team?.id ?? retainedId };
  else if (team) lastTeam.current.teamId = team.id;
  const own = team?.members.find(m => m.user.id === owner.userId);
  const teamId = lastTeam.current.teamId, identity = JSON.stringify([ownerIdentity, teamId]);
  const scope = JSON.stringify([identity, status, language, role, own?.id, own?.role, own?.user.id, own?.user.email]);
  const current = useRef({ scope, identity, attempt: null as TeamExitAttempt | null });
  if (current.current.scope !== scope) current.current = { scope, identity, attempt: current.current.identity === identity ? current.current.attempt : null };
  const invocation = current.current, mounted = useRef(true);
  const [view, setView] = useState<{ scope: string; attempt: TeamExitAttempt; outcome?: TeamExitOutcome } | null>(null);
  const [, renderDenial] = useState(0);
  const activeOwner = () => mounted.current && current.current === invocation && status === 'authenticated'
    && !!owner.userId && typeof owner.email === 'string' && !!owner.email;
  const active = () => activeOwner() && !!teamId;
  const blocked = () => !active() || teamExitBlocked(owner, teamId!) || teamExitCreationBlocked(owner);
  const relevant = active() && view?.scope === scope && view.attempt === current.current.attempt ? view : null;
  function observe(a: TeamExitAttempt, alive: () => boolean = () => true) {
    current.current.attempt = a;
    const apply = (outcome?: TeamExitOutcome) => { if (alive() && active() && current.current.attempt === a) setView({ scope, attempt: a, outcome }); };
    apply(a.outcome ?? a.waitOutcome); void a.original.then(apply); void a.waiter.then(outcome => { if (!a.outcome) apply(outcome); });
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { let alive = true; if (active()) { const a = current.current.attempt ?? retainedTeamExit(owner, teamId!); if (a) observe(a, () => alive); } return () => { alive = false; }; }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps
  function canStart() {
    return !blocked() && !!team && !!own && own.user.email === owner.email && own.role === role
      && (role === 'owner' || role === 'admin' || role === 'member');
  }
  function start() {
    if (!canStart()) return;
    const a = beginTeamExit(owner, { teamId: team!.id, memberId: own!.id, previousRole: own!.role,
      operation: role === 'owner' ? 'delete' : 'leave' });
    if (a) observe(a); else renderDenial(n => n + 1);
  }
  return { start, canStart, canObserve: active, attempt: relevant?.attempt ?? null, outcome: relevant?.outcome,
    updating: !!relevant && !relevant.outcome, blocked: activeOwner() && (teamId ? blocked() : teamExitCreationBlocked(owner)),
    creationBlocked: activeOwner() && teamExitCreationBlocked(owner), pending: !!relevant?.attempt.pending };
}
