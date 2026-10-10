'use client';

import { useEffect, useMemo, useState } from 'react';

type CoachMode = 'create' | 'analyze' | 'optimize' | 'research';
interface Message { role: 'user' | 'assistant'; content: string }
type Status = 'idle' | 'sending' | 'unconfirmed' | 'confirmed' | 'rejected' | 'lost' | 'storage-unavailable';
interface Snapshot { status: Status; messages: Message[]; error: string | null }
interface Original {
  before: Message[];
  after: Message[];
  done: () => void;
  wait: Promise<void>;
  result: Promise<void> | null;
  timer: ReturnType<typeof setTimeout> | null;
}

// The browser retains the actual original producer across page remounts.
// Storage is a denial only. It cannot recreate or acknowledge that producer.
const conversations = new Map<string, ReturnType<typeof createConversation>>();
const isBlocked = (status: Status) => ['sending', 'unconfirmed', 'lost', 'storage-unavailable'].includes(status);

function createConversation(account: string) {
  const marker = 'ytubviral.coach.pending:' + account;
  let snapshot: Snapshot = { status: 'idle', messages: [], error: null };
  let original: Original | null = null;
  const listeners = new Set<() => void>();
  const publish = (change: Partial<Snapshot>) => {
    snapshot = { ...snapshot, ...change };
    for (const listener of listeners) listener();
  };
  const observeMarker = () => {
    if (original || isBlocked(snapshot.status)) return;
    try {
      if (window.sessionStorage.getItem(marker) !== null) publish({ status: 'lost' });
    } catch { publish({ status: 'storage-unavailable' }); }
  };
  const uncertain = (owner: Original) => {
    if (original !== owner) return;
    publish({ status: 'unconfirmed', error: null });
    owner.done();
  };
  const release = (owner: Original, change: Partial<Snapshot>) => {
    if (original !== owner) return;
    // Only this original HTTP acknowledgment may retire its denial marker.
    try { window.sessionStorage.removeItem(marker); }
    catch {
      publish({ ...change, status: 'storage-unavailable' });
      owner.done();
      return;
    }
    original = null;
    publish(change);
    owner.done();
  };

  return {
    snapshot: () => snapshot,
    observeMarker,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    start(message: string, mode: CoachMode, lang: 'es' | 'en') {
      observeMarker();
      if (!message.trim() || isBlocked(snapshot.status)) return null;
      try { window.sessionStorage.setItem(marker, 'unconfirmed'); }
      catch { publish({ status: 'storage-unavailable' }); return null; }
      const before = snapshot.messages;
      const after: Message[] = [...before, { role: 'user', content: message }];
      let done!: () => void;
      const wait = new Promise<void>(resolve => { done = resolve; });
      const owner: Original = { before, after, done, wait, result: null, timer: null };
      original = owner;
      // Synchronous publication blocks a second callback before React renders.
      publish({ status: 'sending', messages: after, error: null });
      // This retires the UI wait, never the task, question or original promise.
      owner.timer = setTimeout(() => uncertain(owner), 60_000);
      owner.result = (async () => {
        try {
          const response = await fetch('/api/coach', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, context: before, mode, lang }),
          });
          const data = await response.json();
          if (original !== owner) return;
          if (response.status === 200 && response.ok && data && typeof data.reply === 'string' && data.reply.trim()) {
            release(owner, { status: 'confirmed', messages: [...after, { role: 'assistant', content: data.reply }], error: null });
          } else if (!response.ok && data && (
            (response.status === 400 && ['Invalid body', 'message required', 'Invalid conversation history'].includes(data.error))
            || (response.status === 401 && data.error === 'unauthorized')
            || (response.status === 403 && data.error === 'pro_required')
            || (response.status === 429 && data.error === 'throttled')
          )) {
            release(owner, { status: 'rejected', messages: before, error: data.error });
          } else uncertain(owner);
        } catch { uncertain(owner); }
        finally {
          if (owner.timer !== null) clearTimeout(owner.timer);
          owner.timer = null;
        }
      })();
      return wait;
    },
  };
}

export function useCoachSend(account: string) {
  const conversation = useMemo(() => {
    if (typeof window === 'undefined') return createConversation(account);
    let current = conversations.get(account);
    if (!current) { current = createConversation(account); conversations.set(account, current); }
    return current;
  }, [account]);
  const [, render] = useState(0);
  useEffect(() => {
    const stop = conversation.subscribe(() => render(value => value + 1));
    conversation.observeMarker();
    render(value => value + 1);
    return stop;
  }, [conversation]);
  return { ...conversation.snapshot(), start: conversation.start, blocked: isBlocked(conversation.snapshot().status) };
}
