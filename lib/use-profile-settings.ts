'use client';
import { useEffect, useRef, useState } from 'react';
import { beginProfileRead, trustedProfileRead } from '@/lib/profile-read-client';
import { beginProfileUpdate, retainedProfileUpdate, profileUpdateBlocked, trustedProfileOutcome, readConfirmedProfileUpdate, profileValueConfirmed } from '@/lib/profile-update-client';
import type { ProfileRead, ProfileReadOutcome } from '@/lib/profile-read-client';
import type { ProfileAttempt, ProfileOutcome } from '@/lib/profile-update-client';
import type { ProfileOwner, ProfileUpdateInput } from '@/lib/profile-update';
export function useProfileSettings(owner: ProfileOwner, status: string, language: string, isCurrent: () => boolean) {
  const identity = JSON.stringify([owner.userId, owner.email]), scope = JSON.stringify([identity, status, language]);
  const current = useRef({ scope, identity, read: null as ProfileRead | null, attempt: null as ProfileAttempt | null });
  if (current.current.scope !== scope) current.current = { scope, identity,
    read: current.current.identity === identity ? current.current.read : null, attempt: current.current.identity === identity ? current.current.attempt : null };
  const invocation = current.current, mounted = useRef(true);
  const [readView, setReadView] = useState<{ scope: string; read: ProfileRead; outcome?: ProfileReadOutcome } | null>(null);
  const [commandView, setCommandView] = useState<{ scope: string; attempt: ProfileAttempt; outcome?: ProfileOutcome } | null>(null), [, render] = useState(0);
  const active = () => mounted.current && isCurrent() && current.current === invocation && status === 'authenticated' && !!owner.userId && !!owner.email;
  function observeRead(r: ProfileRead, alive: () => boolean = () => true) {
    if (current.current.read && r.sequence < current.current.read.sequence) return;
    current.current.read = r;
    const apply = (outcome?: ProfileReadOutcome) => { if (alive() && active() && current.current.read === r) setReadView({ scope, read: r, outcome: trustedProfileRead(r) ?? (outcome?.status === 'ready' ? { status: 'error' } : outcome) }); };
    apply(trustedProfileRead(r) ?? r.waitOutcome); void r.original.then(apply); void r.waiter.then(outcome => { if (!trustedProfileRead(r)) apply(outcome); });
  }
  function observeAttempt(a: ProfileAttempt, alive: () => boolean = () => true) {
    current.current.attempt = a;
    const apply = (outcome?: ProfileOutcome) => {
      if (!alive() || !active() || current.current.attempt !== a) return;
      const trusted = trustedProfileOutcome(a); setCommandView({ scope, attempt: a, outcome: trusted ?? (outcome?.status === 'confirmed' ? { status: 'unconfirmed' } : outcome) });
      if (trusted?.status === 'confirmed') { const r = readConfirmedProfileUpdate(a); if (r) observeRead(r, alive); }
    };
    apply(trustedProfileOutcome(a) ?? a.waitOutcome); void a.original.then(apply); void a.waiter.then(outcome => { if (!trustedProfileOutcome(a)) apply(outcome); });
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { let alive = true; if (active()) { observeRead(current.current.read ?? beginProfileRead(owner), () => alive); const a = current.current.attempt ?? retainedProfileUpdate(owner); if (a) observeAttempt(a, () => alive); } return () => { alive = false; }; }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const read = active() && readView?.scope === scope && readView.read === current.current.read ? readView : null;
  const command = active() && commandView?.scope === scope && commandView.attempt === current.current.attempt ? commandView : null;
  const trusted = read && trustedProfileRead(read.read);
  const canAct = () => active() && !!read && current.current.read === read.read && trusted?.status === 'ready' && !read!.read.pending && !profileUpdateBlocked(owner);
  function start(input: ProfileUpdateInput) { if (!canAct() || trusted?.status !== 'ready') return;
    if (input.operation === 'name' ? input.previousName !== trusted.data.user.name : input.previousLang !== trusted.data.user.lang) return;
    const a = beginProfileUpdate(owner, input); if (a) observeAttempt(a); else render(n => n + 1);
  }
  function refresh() { if (active() && !profileUpdateBlocked(owner) && current.current.read && !current.current.read.pending) observeRead(beginProfileRead(owner)); }
  return { canObserve: active, canAct, start, refresh, data: read?.outcome?.status === 'ready' ? read.outcome.data : null,
    loading: active() && !read?.outcome, readPending: !!read?.read.pending, readError: read?.outcome?.status === 'error',
    read: read?.read ?? null, attempt: command?.attempt ?? null, outcome: command?.outcome, updating: !!command && !command.outcome,
    pending: !!command?.attempt.pending, blocked: active() && profileUpdateBlocked(owner),
    confirmedCurrent: !!command && !!read && profileValueConfirmed(command.attempt, read.read) };
}
