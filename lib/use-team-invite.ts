'use client';
import { useEffect, useRef, useState } from 'react';
import { beginTeamInvite, retainedTeamInvite, retainedTeamInviteForOwner, teamInviteBlocked, teamInviteCreationBlocked } from '@/lib/team-invite-client';
import type { TeamInviteAttempt, TeamInviteOutcome } from '@/lib/team-invite-client';
import type { TeamOwner, TeamView } from '@/lib/team-read-contract';

export function useTeamInvite(owner: TeamOwner, status: string, language: string, team: TeamView | null, role: string) {
  const ownerIdentity = JSON.stringify([owner.userId, owner.email]);
  const retainedId = retainedTeamInviteForOwner(owner)?.input.teamId ?? null;
  const lastTeam = useRef({ ownerIdentity, teamId: team?.id ?? retainedId });
  if (lastTeam.current.ownerIdentity !== ownerIdentity) lastTeam.current = { ownerIdentity, teamId: team?.id ?? retainedId };
  else if (team) lastTeam.current.teamId = team.id;
  const own = team?.members.find(m => m.user.id === owner.userId);
  const teamId = lastTeam.current.teamId, identity = JSON.stringify([ownerIdentity, teamId]);
  const draftScope = JSON.stringify([identity, status, language, role, team?.name, own?.id, own?.role, own?.user.email, team?.maxMembers, team?.invitations.map(i => [i.id,i.email,i.role,i.expiresAt])]);
  const [draft, setDraft] = useState({ scope: draftScope, value: '', requestedRole: 'member' as 'member' | 'admin' });
  const value = draft.scope === draftScope ? draft.value : '', requestedRole = draft.scope === draftScope ? draft.requestedRole : 'member';
  const scope = JSON.stringify([draftScope, value, requestedRole]);
  const current = useRef({ scope, identity, attempt: null as TeamInviteAttempt | null });
  if (current.current.scope !== scope) current.current = { scope, identity, attempt: current.current.identity === identity ? current.current.attempt : null };
  const invocation = current.current, mounted = useRef(true);
  const [view, setView] = useState<{ scope: string; attempt: TeamInviteAttempt; outcome?: TeamInviteOutcome } | null>(null);
  const [, renderDenial] = useState(0);
  const activeOwner = () => mounted.current && current.current === invocation && status === 'authenticated'
    && !!owner.userId && typeof owner.email === 'string' && !!owner.email;
  const active = () => activeOwner() && !!teamId;
  const blocked = () => !active() || teamInviteBlocked(owner, teamId!) || teamInviteCreationBlocked(owner);
  const relevant = active() && view?.scope === scope && view.attempt === current.current.attempt ? view : null;
  function observe(a: TeamInviteAttempt, alive: () => boolean = () => true) {
    current.current.attempt = a;
    const apply = (outcome?: TeamInviteOutcome) => { if (alive() && active() && current.current.attempt === a) setView({ scope, attempt: a, outcome }); };
    apply(a.outcome ?? a.waitOutcome); void a.original.then(apply); void a.waiter.then(outcome => { if (!a.outcome) apply(outcome); });
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { let alive = true; if (active()) { const a = current.current.attempt ?? retainedTeamInvite(owner, teamId!); if (a) observe(a, () => alive); } return () => { alive = false; }; }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps
  function canEdit() {
    return !blocked() && !!team && !!own && own.user.email === owner.email && own.role === role
      && (role === 'owner' || role === 'admin');
  }
  function canStart() {
    const email = value.trim().toLowerCase();
    return canEdit() && email.length <= 320 && /^[^\s@<>"\x00-\x1f\x7f]+@[^\s@<>"\x00-\x1f\x7f]+\.[^\s@<>"\x00-\x1f\x7f]+$/.test(email)
      && team!.members.length + team!.invitations.length < team!.maxMembers
      && !team!.members.some(m => m.user.email.toLowerCase() === email) && !team!.invitations.some(i => i.email.toLowerCase() === email)
      && !(relevant?.outcome?.status === 'rejected' && relevant.outcome.error === 'expired_invitation_requires_revocation' && relevant.attempt.input.targetEmail === email);
  }
  function change(value: string) { if (canEdit()) setDraft({ scope: draftScope, value, requestedRole }); }
  function changeRole(value: string) { if (canEdit() && (value === 'member' || value === 'admin')) setDraft({ scope: draftScope, value: draft.scope === draftScope ? draft.value : '', requestedRole: value }); }
  function start() {
    if (!canStart()) return;
    const a = beginTeamInvite(owner, { teamId: team!.id, memberId: own!.id, previousRole: own!.role as 'owner' | 'admin', targetEmail: value.trim().toLowerCase(), role: requestedRole });
    if (a) observe(a); else renderDenial(n => n + 1);
  }
  return { value, requestedRole, change, changeRole, start, canStart, canEdit, canObserve: active, attempt: relevant?.attempt ?? null, outcome: relevant?.outcome,
    updating: !!relevant && !relevant.outcome, blocked: activeOwner() && (teamId ? blocked() : teamInviteCreationBlocked(owner)),
    creationBlocked: activeOwner() && teamInviteCreationBlocked(owner), pending: !!relevant?.attempt.pending };
}
