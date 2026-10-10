'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ChatMessage } from '@/lib/use-chat-history';

type Status = 'idle' | 'sending' | 'unconfirmed' | 'confirmed' | 'rejected' | 'lost' | 'storage-unavailable';
interface Snapshot {
  status: Status;
  messages: ChatMessage[] | null;
  remaining: number | null;
  error: string | null;
  lastSentAt: number;
}
interface Original {
  before: ChatMessage[];
  after: ChatMessage[];
  done: () => void;
  wait: Promise<void>;
  result: Promise<void> | null;
  timer: ReturnType<typeof setTimeout> | null;
}

// These controllers retain the actual original promise across widget remounts.
// They are never serialized or recreated from browser storage, time or a hash.
const conversations = new Map<string, ReturnType<typeof createConversation>>();

function createConversation(account: string) {
  const marker = 'ytubviral.chat.pending:' + account;
  let snapshot: Snapshot = { status: 'idle', messages: null, remaining: null, error: null, lastSentAt: 0 };
  let original: Original | null = null;
  const listeners = new Set<() => void>();
  const publish = (change: Partial<Snapshot>) => {
    snapshot = { ...snapshot, ...change };
    for (const listener of listeners) listener();
  };
  const blocked = () => ['sending', 'unconfirmed', 'lost', 'storage-unavailable'].includes(snapshot.status);
  const observeMarker = () => {
    if (original || blocked()) return;
    try {
      if (window.sessionStorage.getItem(marker) !== null) publish({ status: 'lost' });
    } catch { publish({ status: 'storage-unavailable' }); }
  };
  const release = (owner: Original, change: Partial<Snapshot>) => {
    if (original !== owner) return;
    // Only the original, verified HTTP acknowledgment can remove this denial.
    // The marker contains no message, token, timestamp or recovery authority.
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
  const uncertain = (owner: Original) => {
    if (original !== owner) return;
    publish({ status: 'unconfirmed', error: null });
    owner.done();
  };

  return {
    snapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    observeMarker,
    start(message: string, lang: 'es' | 'en', history: ChatMessage[]) {
      observeMarker();
      if (blocked()) return null;
      try { window.sessionStorage.setItem(marker, 'unconfirmed'); }
      catch { publish({ status: 'storage-unavailable' }); return null; }
      const before = snapshot.messages ?? history;
      const after: ChatMessage[] = [...before, { role: 'user', content: message }];
      let done!: () => void;
      const wait = new Promise<void>(resolve => { done = resolve; });
      const owner: Original = { before, after, done, wait, result: null, timer: null };
      original = owner;
      publish({ status: 'sending', messages: after, error: null, lastSentAt: Date.now() });
      // Retire only the local wait. Do not abort, resend, discard the message or
      // release the producer/quota because the acknowledgment has not arrived.
      owner.timer = setTimeout(() => uncertain(owner), 60_000);
      owner.result = (async () => {
        try {
          const response = await fetch('/api/chat', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, lang }),
          });
          const data = await response.json();
          if (original !== owner) return;
          if (response.status === 200 && response.ok && data && typeof data.reply === 'string'
            && Number.isSafeInteger(data.remaining) && data.remaining >= 0) {
            release(owner, { status: 'confirmed', messages: [...after, { role: 'assistant', content: data.reply }], remaining: data.remaining, error: null });
          } else if ([400, 401, 404, 429].includes(response.status) && !response.ok
            && data && typeof data.error === 'string' && data.error.length > 0
            && (data.limitReached === undefined || typeof data.limitReached === 'boolean')) {
            release(owner, { status: 'rejected', messages: before, error: data.error,
              ...(data.limitReached === true ? { remaining: 0 } : {}), });
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

export function useChatSend(account: string) {
  const conversation = useMemo(() => {
    // Server rendering cannot retain an authenticated browser conversation.
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
  return { ...conversation.snapshot(), start: conversation.start,
    blocked: ['sending', 'unconfirmed', 'lost', 'storage-unavailable'].includes(conversation.snapshot().status) };
}
