'use client';
import { useEffect, useRef, useState } from 'react';
import { beginMemberMutation, retainedMemberMutation, memberMutationBlocked } from '@/lib/team-members-client';
import type { MemberAttempt, MemberOutcome } from '@/lib/team-members-client';
import type { MemberOperation } from '@/lib/team-member-mutation';
import type { TeamOwner, TeamView } from '@/lib/team-read-contract';

export function useTeamMembers(owner: TeamOwner, status: string, language: string, team: TeamView | null, role: string) {
  const ownerIdentity = JSON.stringify([owner.userId, owner.email]);
  const lastTeam = useRef({ ownerIdentity, teamId: team?.id ?? null });
  if (lastTeam.current.ownerIdentity !== ownerIdentity) lastTeam.current = { ownerIdentity, teamId: team?.id ?? null };
  else if (team) lastTeam.current.teamId = team.id;
  const teamId = lastTeam.current.teamId, identity = JSON.stringify([ownerIdentity, teamId]);
  const scope = JSON.stringify([identity, status, language, role, team?.members.map(m => [m.id, m.user.id, m.role])]);
  const current = useRef({ scope, identity, attempt: null as MemberAttempt | null });
  if (current.current.scope !== scope) current.current = { scope, identity, attempt: current.current.identity === identity ? current.current.attempt : null };
  const invocation = current.current, mounted = useRef(true);
  const [view, setView] = useState<{ scope: string; attempt: MemberAttempt; outcome?: MemberOutcome } | null>(null);
  const [, renderDenial] = useState(0);
  const active = () => mounted.current && current.current === invocation && status === 'authenticated'
    && !!owner.userId && typeof owner.email === 'string' && !!teamId;
  const blocked = () => !active() || memberMutationBlocked(owner, teamId!);
  const relevant = active() && view?.scope === scope && view.attempt === current.current.attempt ? view : null;
  function observe(a: MemberAttempt, alive: () => boolean = () => true) {
    current.current.attempt = a;
    const apply = (outcome?: MemberOutcome) => { if (alive() && active() && current.current.attempt === a) setView({ scope, attempt: a, outcome }); };
    apply(a.outcome ?? a.waitOutcome); void a.original.then(apply); void a.waiter.then(outcome => { if (!a.outcome) apply(outcome); });
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { let alive = true; if (active()) { const a = current.current.attempt ?? retainedMemberMutation(owner, teamId!); if (a) observe(a, () => alive); } return () => { alive = false; }; }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps
  function canStart(operation: MemberOperation, memberId: string) {
    if (blocked() || !team) return false;
    const target = team!.members.find(m => m.id === memberId);
    return !!target && target.user.id !== owner.userId && (target.role === 'admin' || target.role === 'member')
      && (operation === 'role' ? role === 'owner' : role === 'owner' || role === 'admin' && target.role === 'member');
  }
  function start(operation: MemberOperation, memberId: string, nextRole: 'admin' | 'member' | null) {
    if (!canStart(operation, memberId)) return;
    const target = team!.members.find(m => m.id === memberId)!;
    if (operation === 'role' ? nextRole === null || nextRole === target.role : nextRole !== null) return;
    const a = beginMemberMutation(owner, { teamId: team!.id, memberId, targetUserId: target.user.id,
      previousRole: target.role as 'admin' | 'member', role: nextRole }, operation);
    if (a) observe(a); else renderDenial(n => n + 1);
  }
  return { start, canStart, canObserve: active, canAct: () => active() && !blocked(), attempt: relevant?.attempt ?? null,
    outcome: relevant?.outcome, updating: !!relevant && !relevant.outcome, blocked: active() && blocked(), pending: !!relevant?.attempt.pending };
}
