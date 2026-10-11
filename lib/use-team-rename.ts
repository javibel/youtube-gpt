'use client';
import { useEffect, useRef, useState } from 'react';
import { beginTeamRename, retainedTeamRename, retainedTeamRenameForOwner, teamRenameBlocked, teamRenameCreationBlocked } from '@/lib/team-rename-client';
import type { TeamRenameAttempt, TeamRenameOutcome } from '@/lib/team-rename-client';
import type { TeamOwner, TeamView } from '@/lib/team-read-contract';

export function useTeamRename(owner: TeamOwner, status: string, language: string, team: TeamView | null, role: string) {
  const ownerIdentity = JSON.stringify([owner.userId, owner.email]);
  const retainedId = retainedTeamRenameForOwner(owner)?.input.teamId ?? null;
  const lastTeam = useRef({ ownerIdentity, teamId: team?.id ?? retainedId });
  if (lastTeam.current.ownerIdentity !== ownerIdentity) lastTeam.current = { ownerIdentity, teamId: team?.id ?? retainedId };
  else if (team) lastTeam.current.teamId = team.id;
  const own = team?.members.find(m => m.user.id === owner.userId);
  const teamId = lastTeam.current.teamId, identity = JSON.stringify([ownerIdentity, teamId]);
  const draftScope = JSON.stringify([identity, status, language, role, team?.name, own?.id, own?.role, own?.user.email]);
  const [draft, setDraft] = useState({ scope: draftScope, value: '' });
  const value = draft.scope === draftScope ? draft.value : '';
  const scope = JSON.stringify([draftScope, value]);
  const current = useRef({ scope, identity, attempt: null as TeamRenameAttempt | null });
  if (current.current.scope !== scope) current.current = { scope, identity, attempt: current.current.identity === identity ? current.current.attempt : null };
  const invocation = current.current, mounted = useRef(true);
  const [view, setView] = useState<{ scope: string; attempt: TeamRenameAttempt; outcome?: TeamRenameOutcome } | null>(null);
  const [, renderDenial] = useState(0);
  const activeOwner = () => mounted.current && current.current === invocation && status === 'authenticated'
    && !!owner.userId && typeof owner.email === 'string' && !!owner.email;
  const active = () => activeOwner() && !!teamId;
  const blocked = () => !active() || teamRenameBlocked(owner, teamId!) || teamRenameCreationBlocked(owner);
  const relevant = active() && view?.scope === scope && view.attempt === current.current.attempt ? view : null;
  function observe(a: TeamRenameAttempt, alive: () => boolean = () => true) {
    current.current.attempt = a;
    const apply = (outcome?: TeamRenameOutcome) => { if (alive() && active() && current.current.attempt === a) setView({ scope, attempt: a, outcome }); };
    apply(a.outcome ?? a.waitOutcome); void a.original.then(apply); void a.waiter.then(outcome => { if (!a.outcome) apply(outcome); });
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { let alive = true; if (active()) { const a = current.current.attempt ?? retainedTeamRename(owner, teamId!); if (a) observe(a, () => alive); } return () => { alive = false; }; }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps
  function canEdit() {
    return !blocked() && !!team && !!own && own.user.email === owner.email && own.role === role
      && (role === 'owner' || role === 'admin');
  }
  function canStart() { const name = value.trim(); return canEdit() && name.length >= 2 && name.length <= 50 && name !== team!.name; }
  function change(value: string) { if (canEdit()) setDraft({ scope: draftScope, value }); }
  function start() {
    if (!canStart()) return;
    const a = beginTeamRename(owner, { teamId: team!.id, memberId: own!.id, previousRole: own!.role as 'owner' | 'admin', previousName: team!.name, name: value.trim() });
    if (a) observe(a); else renderDenial(n => n + 1);
  }
  return { value, change, start, canStart, canEdit, canObserve: active, attempt: relevant?.attempt ?? null, outcome: relevant?.outcome,
    updating: !!relevant && !relevant.outcome, blocked: activeOwner() && (teamId ? blocked() : teamRenameCreationBlocked(owner)),
    creationBlocked: activeOwner() && teamRenameCreationBlocked(owner), pending: !!relevant?.attempt.pending };
}
