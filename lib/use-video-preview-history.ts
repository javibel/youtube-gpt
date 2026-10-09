'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type DbPreview = { id: string; title: string; mimeType: string; size: number; createdAt: string };
type PreviewError = { es: string; en: string } | null;
// A local wait ending does not establish cancellation of a server-side delete.
// Race each body read as well as its headers: a transport may ignore abort.
function boundedWait() {
  const controller = new AbortController();
  let rejectStop!: (reason: Error) => void, finished = false;
  const stopped = new Promise<never>((_, reject) => { rejectStop = reject; });
  const cancel = () => { if (!finished) { controller.abort(); clearTimeout(timer); rejectStop(new Error('Preview wait ended')); } };
  const timer = setTimeout(cancel, 30_000);
  return { signal: controller.signal, cancel,
    async wait<T>(pending: Promise<T>): Promise<T> {
      const value = await Promise.race([pending, stopped]);
      if (controller.signal.aborted) throw new Error('Preview wait ended');
      return value;
    },
    finish() { finished = true; clearTimeout(timer); } };
}
const empty = () => ({ previews: [] as DbPreview[], loaded: false, loading: false, listError: false,
  actionId: null as string | null, error: null as PreviewError, playing: null as { id: string; title: string; url: string } | null });

function previewList(value: unknown): value is DbPreview[] {
  if (!Array.isArray(value) || value.length > 3) return false;
  const ids = new Set<string>();
  return value.every(p => {
    if (!p || typeof p.id !== 'string' || !/^[-A-Za-z0-9._:]{1,128}$/.test(p.id) || ids.has(p.id)
      || typeof p.title !== 'string' || !p.title.trim() || typeof p.mimeType !== 'string' || !p.mimeType
      || !Number.isSafeInteger(p.size) || p.size < 0 || p.size > 8 * 1024 * 1024
      || typeof p.createdAt !== 'string' || !Number.isFinite(Date.parse(p.createdAt))) return false;
    ids.add(p.id); return true;
  });
}

export function useVideoPreviewHistory(userId: string | undefined, authStatus: string) {
  const scope = useMemo(() => ({ active: true, read: 0, action: 0, busy: false, actionKind: null as 'play'|'download'|'delete'|null,
    listFlight: null as Promise<void> | null, listWait: null as ReturnType<typeof boundedWait> | null,
    actionWait: null as ReturnType<typeof boundedWait> | null,
    playingUrl: null as string | null, playingId: null as string | null }), [userId, authStatus]);
  const active = useRef(scope); active.current = scope;
  const [store, setStore] = useState(() => ({ scope, ...empty() }));
  const current = useCallback(() => active.current === scope && scope.active && authStatus === 'authenticated' && !!userId,
    [scope, authStatus, userId]);
  const update = useCallback((fn: (view: ReturnType<typeof empty>) => ReturnType<typeof empty>) => {
    if (current()) setStore(prev => ({ scope, ...fn(prev.scope === scope ? prev : empty()) }));
  }, [scope, current]);
  const releasePlayer = useCallback(() => {
    if (scope.playingUrl) URL.revokeObjectURL(scope.playingUrl);
    scope.playingUrl = null;
    scope.playingId = null;
  }, [scope]);

  const load = useCallback(async (force = false) => {
    if (!current()) return;
    if (!force && scope.listFlight) return scope.listFlight;
    scope.listWait?.cancel();
    const read = ++scope.read;
    const waiting = boundedWait(); scope.listWait = waiting;
    update(view => ({ ...view, loading: true, listError: false }));
    const flight = (async () => {
      try {
        const response = await waiting.wait(fetch('/api/video-previews', { cache: 'no-store', signal: waiting.signal }));
        if (!response.ok) throw new Error('Preview history unavailable');
        const data = await waiting.wait(response.json());
        if (!previewList(data?.previews)) throw new Error('Invalid preview history');
        if (current() && scope.read === read) update(view => ({ ...view, previews: data.previews, loaded: true }));
      } catch {
        if (current() && scope.read === read) update(view => ({ ...view, listError: true }));
      } finally {
        waiting.finish(); if (scope.listWait === waiting) scope.listWait = null;
        if (current() && scope.read === read) update(view => ({ ...view, loading: false }));
      }
    })();
    scope.listFlight = flight;
    try { await flight; } finally { if (scope.listFlight === flight) scope.listFlight = null; }
  }, [scope, current, update]);
  const loadDbPreviews = useCallback(() => load(), [load]);
  // A newly confirmed save needs a newer snapshot, even if an older GET is pending.
  const refreshDbPreviews = useCallback(() => load(true), [load]);

  useEffect(() => {
    scope.active = true; active.current = scope;
    setStore({ scope, ...empty() });
    void loadDbPreviews();
    return () => {
      scope.active = false; scope.action++; scope.actionWait?.cancel(); releasePlayer();
      // Strict Mode's immediate setup reuses the same original list request.
      // A retired scope still settles without waiting for an ignored abort.
      void Promise.resolve().then(() => { if (!scope.active || active.current !== scope) scope.listWait?.cancel(); });
    };
  }, [scope, loadDbPreviews, releasePlayer]);

  const binary = useCallback(async (preview: DbPreview, download: boolean) => {
    if (!current() || scope.busy) return;
    scope.busy = true;
    scope.actionKind = download ? 'download' : 'play';
    const action = ++scope.action;
    const waiting = boundedWait(); scope.actionWait = waiting;
    const valid = () => current() && scope.action === action;
    update(view => ({ ...view, actionId: preview.id, error: null }));
    try {
      const response = await waiting.wait(fetch(`/api/video-previews/${encodeURIComponent(preview.id)}`, { cache: 'no-store', signal: waiting.signal }));
      if (!response.ok) throw new Error('Preview unavailable');
      const blob = await waiting.wait(response.blob());
      if (blob.size < 2000 || blob.size > 8 * 1024 * 1024 || !blob.type.startsWith('video/')) throw new Error('Invalid preview binary');
      if (!valid()) return;
      const url = URL.createObjectURL(blob);
      if (download) {
        try {
          const link = document.createElement('a'); link.href = url;
          link.download = `${preview.title}.webm`; link.click();
        } finally { URL.revokeObjectURL(url); }
      } else {
        releasePlayer(); scope.playingUrl = url; scope.playingId = preview.id;
        update(view => ({ ...view, playing: { id: preview.id, title: preview.title, url } }));
      }
    } catch {
      if (valid()) update(view => ({ ...view, error: download
        ? { es: 'No se pudo descargar el vídeo. Vuelve a pulsar Descargar.', en: 'Could not download the video. Try Download again.' }
        : { es: 'No se pudo abrir el vídeo. Vuelve a pulsar su título.', en: 'Could not open the video. Try its title again.' } }));
    } finally {
      waiting.finish(); if (scope.actionWait === waiting) scope.actionWait = null;
      if (scope.action === action) { scope.busy = false; scope.actionKind = null; update(view => ({ ...view, actionId: null })); }
    }
  }, [scope, current, update, releasePlayer]);
  const handleSelectPreview = useCallback((preview: DbPreview) => binary(preview, false), [binary]);
  const handleDownloadPreview = useCallback((preview: DbPreview) => binary(preview, true), [binary]);
  const closePlayingPreview = useCallback(() => {
    if (!current()) return;
    const cancelPlay = scope.actionKind === 'play';
    if (cancelPlay) { scope.action++; scope.actionWait?.cancel(); scope.busy = false; scope.actionKind = null; }
    releasePlayer();
    update(view => ({ ...view, playing: null, actionId: cancelPlay ? null : view.actionId }));
  }, [scope, current, update, releasePlayer]);

  const handleDeletePreview = useCallback(async (id: string) => {
    if (!current() || scope.busy) return;
    scope.busy = true;
    scope.actionKind = 'delete';
    const action = ++scope.action;
    const waiting = boundedWait(); scope.actionWait = waiting;
    const valid = () => current() && scope.action === action;
    update(view => ({ ...view, actionId: id, error: null }));
    try {
      const response = await waiting.wait(fetch(`/api/video-previews/${encodeURIComponent(id)}`, { method: 'DELETE', signal: waiting.signal }));
      // DELETE is idempotent: 404 confirms absence, including a lost previous ack.
      if (response.status !== 204 && response.status !== 404) throw new Error('Preview deletion unconfirmed');
      if (!valid()) return;
      if (scope.playingId === id) releasePlayer();
      update(view => ({ ...view, previews: view.previews.filter(p => p.id !== id), playing: view.playing?.id === id ? null : view.playing }));
      // Invalidate an older listing that could reintroduce the deleted preview.
      // A confirmed deletion is complete; its independent list refresh should
      // not hold the play/download/delete lock while waiting for another GET.
      void refreshDbPreviews();
    } catch {
      if (valid()) update(view => ({ ...view, error: { es: 'No se pudo confirmar la eliminación. Vuelve a pulsar Eliminar.', en: 'Deletion could not be confirmed. Try Delete again.' } }));
    } finally {
      waiting.finish(); if (scope.actionWait === waiting) scope.actionWait = null;
      if (scope.action === action) { scope.busy = false; scope.actionKind = null; update(view => ({ ...view, actionId: null })); }
    }
  }, [scope, current, update, releasePlayer, refreshDbPreviews]);

  // Do not expose the previous account's list/player during the effect transition.
  const view = store.scope === scope && current() ? store : empty();
  return { dbPreviews: view.previews, previewsLoaded: view.loaded, previewListLoading: view.loading,
    previewListError: view.listError, loadingPreviewId: view.actionId, previewError: view.error,
    playingPreview: view.playing, loadDbPreviews, refreshDbPreviews,
    handleSelectPreview, handleDownloadPreview, handleDeletePreview, closePlayingPreview };
}
