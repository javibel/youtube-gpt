'use client';
import { abCreationClientBlocked } from '@/lib/ab-create-negative';

import { useEffect, useMemo, useState } from 'react';
import { decodeAbTest, type AbTest, type AbVideo } from './use-ab-test-read';

type Create = { kind: 'create'; video: AbVideo; variantA: string; variantB: string; hours: number; lang: 'es' | 'en'; token: object };
type Cancel = { kind: 'cancel'; test: AbTest; lang: 'es' | 'en' };
type Mutation = Create | Cancel;
type Status = 'idle' | 'sending' | 'unconfirmed' | 'confirmed' | 'rejected' | 'lost' | 'storage-unavailable';
type Snapshot = { status: Status; mutation: Mutation | null; received: AbTest | null; confirmed: AbTest[]; error: string | null };
const blocked = (status: Status) => ['sending', 'unconfirmed', 'lost', 'storage-unavailable'].includes(status);
// The live original HTTP request alone can acknowledge a mutation. Storage is
// only a denial after module loss; neither GET nor a timer restores authority.
const accounts = new Map<string, ReturnType<typeof coordinator>>();
function coordinator(account: string, userId: string) {
  const marker = 'ytubviral.ab-mutation.pending:' + account;
  let snapshot: Snapshot = { status: 'idle', mutation: null, received: null, confirmed: [], error: null };
  let original: object | null = null;
  const listeners = new Set<() => void>();
  const publish = (change: Partial<Snapshot>) => { snapshot = { ...snapshot, ...change }; for (const fn of listeners) fn(); };
  const observe = () => {
    if (original || blocked(snapshot.status)) return;
    try { if (window.sessionStorage.getItem(marker) !== null) publish({ status: 'lost' }); }
    catch { publish({ status: 'storage-unavailable' }); }
  };
  return {
    snapshot: () => snapshot, observe,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    start(input: Mutation) {
      observe();
      if (abCreationClientBlocked(userId) || blocked(snapshot.status) || (input.kind === 'cancel' && snapshot.confirmed.some(t => t.id === input.test.id && t.status === 'cancelled'))) return null;
      try { window.sessionStorage.setItem(marker, 'unconfirmed'); }
      catch { publish({ status: 'storage-unavailable' }); return null; }
      const mutation: Mutation = input.kind === 'create'
        ? { ...input, video: { ...input.video } } : { ...input, test: { ...input.test } };
      const body = JSON.stringify(mutation.kind === 'create'
        ? { videoId: mutation.video.videoId, variantA: mutation.variantA, variantB: mutation.variantB, hoursPerVariant: mutation.hours }
        : { testId: mutation.test.id, action: 'cancel' });
      const owner = {}; original = owner;
      let done!: () => void;
      const wait = new Promise<void>(resolve => { done = resolve; });
      const uncertain = () => { if (original === owner) { publish({ status: 'unconfirmed' }); done(); } };
      publish({ status: 'sending', mutation, received: null, error: null });
      const timer = setTimeout(uncertain, 60_000);
      // This deadline ends the visible wait, never the producer or admission.
      void (async () => {
        try {
          const response = await fetch('/api/youtube/ab-test', {
            method: mutation.kind === 'create' ? 'POST' : 'PATCH',
            headers: { 'Content-Type': 'application/json' }, body,
          });
          const data = await response.json();
          if (original !== owner) return;
          const row = decodeAbTest(data?.test, userId);
          const accepted = response.ok && row && (mutation.kind === 'create'
            ? response.status === 201 && row.status === 'variant_a' && row.videoId === mutation.video.videoId
              && row.variantA === mutation.variantA && row.variantB === mutation.variantB
              && row.hoursPerVariant === Math.max(12, Math.min(168, mutation.hours))
            : response.status === 200 && data.ok === true && data.userId === userId
              && row.id === mutation.test.id && row.videoId === mutation.test.videoId
              && row.variantA === mutation.test.variantA && row.variantB === mutation.test.variantB
              && row.originalTitle === mutation.test.originalTitle && row.status === 'cancelled' && row.completedAt !== null);
          // Only errors guaranteed to precede the title effect permit another
          // attempt. A provider rejection or unknown error remains uncertain.
          const rejected = !response.ok && data && (
            (response.status === 401 && data.error === 'Unauthorized')
            || (response.status === 400 && data.error === 'Missing fields')
            || (mutation.kind === 'create' && ((response.status === 403 && data.error === 'pro_required')
              || (response.status === 400 && ['youtube_not_connected', 'active_test_exists', 'max_active_tests'].includes(data.error))
              || (response.status === 404 && data.error === 'video_not_found')))
            || (mutation.kind === 'cancel' && response.status === 404 && data.error === 'Test not found')
          );
          if (!accepted && !rejected) { uncertain(); return; }
          const received = accepted ? row : null;
          const confirmed = received ? [received, ...snapshot.confirmed.filter(t => t.id !== received.id)] : snapshot.confirmed;
          try { window.sessionStorage.removeItem(marker); }
          catch { publish({ status: 'storage-unavailable', received, confirmed }); done(); return; }
          original = null;
          publish({ status: accepted ? 'confirmed' : 'rejected', received, confirmed, error: rejected ? data.error : null }); done();
        } catch { uncertain(); }
        finally { clearTimeout(timer); }
      })();
      return wait;
    },
  };
}
export function useAbMutation(userId: string, email: string) {
  const account = JSON.stringify([userId, email]);
  const live = useMemo(() => {
    if (typeof window === 'undefined') return coordinator(account, userId);
    let value = accounts.get(account);
    if (!value) { value = coordinator(account, userId); accounts.set(account, value); }
    return value;
  }, [account, userId]);
  const [, render] = useState(0);
  useEffect(() => { const stop = live.subscribe(() => render(x => x + 1)); live.observe(); render(x => x + 1); return stop; }, [live]);
  return { ...live.snapshot(), start: live.start, blocked: blocked(live.snapshot().status)||abCreationClientBlocked(userId) };
}

// Only vetoes a new native command,including the same ID with changed email.
export function anyUnconfirmedAbMutationForUser(id:string):boolean{
 try{for(const [account,value]of accounts){const who=JSON.parse(account);if(Array.isArray(who)&&who[0]===id){value.observe();if(blocked(value.snapshot().status))return true;}}
 const prefix='ytubviral.ab-mutation.pending:';for(let i=0;i<window.sessionStorage.length;i++){const k=window.sessionStorage.key(i);if(k?.startsWith(prefix)){const who=JSON.parse(k.slice(prefix.length));if(!Array.isArray(who)||who[0]===id)return true;}}return false;}catch{return true;}
}
