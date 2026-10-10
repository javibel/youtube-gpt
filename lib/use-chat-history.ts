'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClientReadWait } from '@/lib/client-read-wait';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function decodeHistory(data: unknown): ChatMessage[] {
  const rows = (data as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(rows) || rows.length > 50) throw new Error('Unconfirmed history');
  return rows.map(row => {
    if (!row || (row.role !== 'user' && row.role !== 'assistant') || typeof row.content !== 'string') {
      throw new Error('Unconfirmed history');
    }
    return { role: row.role, content: row.content };
  });
}

// The widget mounts one conversation per authenticated account. A closed read
// retires locally; abort does not prove that the server stopped its work.
export function useChatHistory(isOpen: boolean) {
  const scope = useMemo(() => ({
    mounted: true, open: false, active: false, confirmed: false, sequence: 0,
    flight: null as Promise<boolean> | null,
    waiting: null as ReturnType<typeof createClientReadWait> | null,
  }), []);
  scope.open = isOpen;
  const [messages, updateMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const current = useCallback(() => scope.mounted && scope.active && scope.open, [scope]);

  const read = useCallback(async (force = false) => {
    if (!current() || (scope.confirmed && !force)) return false;
    if (scope.flight) return scope.flight;
    const sequence = ++scope.sequence;
    const waiting = createClientReadWait();
    scope.waiting = waiting;
    setLoading(true);
    setError(false);
    const flight = (async () => {
      try {
        const response = await waiting.wait(fetch('/api/chat', { cache: 'no-store', signal: waiting.signal }));
        if (!current() || sequence !== scope.sequence) return false;
        if (!response.ok) throw new Error('Unconfirmed history');
        const rows = decodeHistory(await waiting.wait(response.json()));
        if (!current() || sequence !== scope.sequence) return false;
        updateMessages(rows);
        scope.confirmed = true;
        setConfirmed(true);
        return true;
      } catch {
        if (current() && sequence === scope.sequence) setError(true);
        return false;
      } finally {
        waiting.finish();
        if (scope.waiting === waiting) scope.waiting = null;
        if (current() && sequence === scope.sequence) setLoading(false);
      }
    })();
    scope.flight = flight;
    try { return await flight; } finally { if (scope.flight === flight) scope.flight = null; }
  }, [scope, current]);

  const retire = useCallback(() => {
    scope.active = false;
    scope.sequence++;
    scope.waiting?.cancel();
    scope.flight = null;
    setLoading(false);
  }, [scope]);

  useEffect(() => {
    scope.mounted = true;
    return () => {
      scope.mounted = false;
      // Strict Mode setup/cleanup/setup keeps the same original initial read.
      void Promise.resolve().then(() => { if (!scope.mounted) scope.waiting?.cancel(); });
    };
  }, [scope]);

  useEffect(() => {
    scope.active = isOpen;
    if (isOpen) void read();
    return () => {
      scope.active = false;
      void Promise.resolve().then(() => {
        if (!scope.active || !scope.mounted) scope.waiting?.cancel();
      });
    };
  }, [isOpen, scope, read]);

  const setMessages = useCallback((rows: ChatMessage[]) => {
    if (scope.mounted && scope.confirmed) updateMessages(rows);
  }, [scope]);

  return {
    messages, setMessages, historyLoaded: confirmed,
    historyLoading: isOpen && (loading || (!confirmed && !error)), historyError: error,
    retryHistory: () => read(), refreshHistory: () => read(true), retireHistory: retire,
    isCurrent: () => scope.mounted,
    canSend: () => current() && scope.confirmed,
  };
}
