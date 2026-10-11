'use client';
import { useEffect, useRef, useState } from 'react';
import { beginRevocation, retainedRevocation, revocationBlocked } from '@/lib/team-revoke-client';
import type { RevocationAttempt, RevocationOutcome } from '@/lib/team-revoke-client';
import type { TeamOwner, TeamView } from '@/lib/team-read-contract';

export function useTeamRevoke(owner: TeamOwner, status: string, language: string, team: TeamView | null, role: string) {
  const ownerIdentity = JSON.stringify([owner.userId, owner.email]);
  const lastTeam = useRef({ ownerIdentity, teamId: team?.id ?? null });
  if (lastTeam.current.ownerIdentity !== ownerIdentity) lastTeam.current = { ownerIdentity, teamId: team?.id ?? null };
  else if (team) lastTeam.current.teamId = team.id;
  const teamId = lastTeam.current.teamId, identity = JSON.stringify([ownerIdentity, teamId]);
  const scope = JSON.stringify([identity, status, language, role, team?.invitations.map(i => [i.id, i.email, i.role, i.expiresAt])]);
  const current = useRef({ scope, identity, attempt: null as RevocationAttempt | null });
  if (current.current.scope !== scope) current.current = { scope, identity, attempt: current.current.identity === identity ? current.current.attempt : null };
  const invocation = current.current, mounted = useRef(true);
  const [view, setView] = useState<{ scope: string; attempt: RevocationAttempt; outcome?: RevocationOutcome } | null>(null);
  const [, renderDenial] = useState(0);
  const active = () => mounted.current && current.current === invocation && status === 'authenticated'
    && !!owner.userId && typeof owner.email === 'string' && !!teamId;
  const blocked = () => !active() || revocationBlocked(owner, teamId!);
  const relevant = active() && view?.scope === scope && view.attempt === current.current.attempt ? view : null;
  function observe(a: RevocationAttempt, alive: () => boolean = () => true) {
    current.current.attempt = a;
    const apply = (outcome?: RevocationOutcome) => { if (alive() && active() && current.current.attempt === a) setView({ scope, attempt: a, outcome }); };
    apply(a.outcome ?? a.waitOutcome); void a.original.then(apply); void a.waiter.then(outcome => { if (!a.outcome) apply(outcome); });
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { let alive = true; if (active()) { const a = current.current.attempt ?? retainedRevocation(owner, teamId!); if (a) observe(a, () => alive); } return () => { alive = false; }; }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps
  function canStart(invitationId: string) {
    return !blocked() && !!team && (role === 'owner' || role === 'admin') && team.invitations.some(i => i.id === invitationId);
  }
  function start(invitationId: string) {
    if (!canStart(invitationId)) return;
    const target = team!.invitations.find(i => i.id === invitationId)!;
    const a = beginRevocation(owner, { teamId: team!.id, invitationId, targetEmail: target.email,
      previousRole: target.role, previousExpiresAt: target.expiresAt });
    if (a) observe(a); else renderDenial(n => n + 1);
  }
  return { start, canStart, canObserve: active, attempt: relevant?.attempt ?? null, outcome: relevant?.outcome,
    updating: !!relevant && !relevant.outcome, blocked: active() && blocked(), pending: !!relevant?.attempt.pending };
}
