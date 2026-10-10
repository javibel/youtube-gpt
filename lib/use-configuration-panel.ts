'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Configuration } from '@/contracts/ai/v1/core.cjs';
import { createClientReadWait } from '@/lib/client-read-wait';

type Preview = { previewId: string; expiresAt: number; previousRevision: string | null; revision: string; activeProfile: string;
  assignments: { profile: string; taskType: string; agentId: string | null; providerId: string; model: string }[];
  exceptions: Configuration['exceptions'] };
type Flight = { waiting: ReturnType<typeof createClientReadWait>; promise: Promise<void> | null };
const endpoint = '/api/admin/ai-configuration';
const uncertain = 'No se pudo confirmar la activación. Consulta el estado antes de intentarlo de nuevo.';
const initial = () => ({ configuration: null as Configuration | null, profile: '', reason: '', preview: null as Preview | null,
  attempt: null as Preview | null, checked: false, previousRevision: null as string | null,
  readBusy: false, commandBusy: false, loaded: false, message: '', error: '' });
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const label = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 1000;
const selection = (v: unknown) => record(v) && label(v.providerId) && label(v.model);
const exceptions = (v: unknown) => Array.isArray(v) && v.every(e => record(e) && ['task','agent'].includes(String(e.scope))
  && label(e.id) && selection(e.selection) && label(e.reason) && label(e.authorizedBy));
function configuration(value: unknown): Configuration | null {
  if (value === null) return null;
  if (!record(value) || value.contractVersion !== '1.0' || value.fallback !== 'none' || !label(value.revision)
    || !label(value.activeProfile) || !record(value.profiles) || !Object.hasOwn(value.profiles, value.activeProfile)
    || !Object.values(value.profiles).every(tasks => record(tasks) && Object.keys(tasks).length > 0 && Object.values(tasks).every(selection))
    || !exceptions(value.exceptions)) throw Error('Invalid configuration response');
  return value as unknown as Configuration;
}
function preview(value: unknown, revision: string, profile?: string): Preview {
  if (!record(value) || !label(value.previewId) || value.revision !== revision || !label(value.activeProfile)
    || (profile !== undefined && value.activeProfile !== profile) || !(value.previousRevision === null || label(value.previousRevision))
    || !Number.isSafeInteger(value.expiresAt) || (value.expiresAt as number) <= Date.now()
    || !Array.isArray(value.assignments) || !value.assignments.every(row => record(row) && label(row.profile)
      && label(row.taskType) && (row.agentId === null || label(row.agentId)) && label(row.providerId) && label(row.model))
    || !exceptions(value.exceptions)) throw Error('Invalid preview response');
  return value as unknown as Preview;
}

export function useConfigurationPanel(userId: string | null | undefined, email: string | null | undefined, status: string) {
  const scope = useMemo(() => ({ active: true, state: initial(), readSequence: 0, read: null as Flight | null, command: null as Flight | null }), [userId,email,status]);
  const active = useRef(scope); active.current = scope;
  const [store, setStore] = useState(() => ({ scope, state: scope.state }));
  const current = useCallback(() => active.current === scope && scope.active && status === 'authenticated' && !!userId && !!email, [scope,status,userId,email]);
  const update = useCallback((fn: (v: ReturnType<typeof initial>) => ReturnType<typeof initial>) => {
    if (!current()) return;
    scope.state = fn(scope.state); setStore({ scope, state: scope.state });
  }, [scope,current]);
  const retireRead = useCallback(() => { ++scope.readSequence; scope.read?.waiting.cancel(); }, [scope]);
  const read = useCallback(async (force = false) => {
    if (!current() || scope.command) return;
    if (!force && scope.read) return scope.read.promise;
    retireRead(); const sequence = scope.readSequence;
    const flight: Flight = { waiting: createClientReadWait(), promise: null }; scope.read = flight;
    const valid = () => current() && scope.readSequence === sequence;
    update(v => ({ ...v, readBusy: true, error: '' }));
    flight.promise = (async () => {
      try {
        const response = await flight.waiting.wait(fetch(endpoint, { cache: 'no-store', signal: flight.waiting.signal }));
        if (!valid()) return;
        if (!response.ok) throw Error('Configuration unavailable');
        const body: unknown = await flight.waiting.wait(response.json());
        if (!valid()) return;
        if (!record(body) || !Object.hasOwn(body, 'configuration')) throw Error('Invalid configuration response');
        const value = configuration(body.configuration);
        update(v => ({ ...v, configuration: value, loaded: true, profile: v.preview || v.attempt ? v.profile : value?.activeProfile ?? '',
          checked: !!v.attempt, message: v.attempt ? (value?.revision === v.attempt.revision
            ? 'El servidor muestra el perfil solicitado. La petición original sigue sin acuse.'
            : 'Estado consultado. La petición original sigue sin acuse; la consulta no la cancela.') : v.message }));
      } catch {
        if (valid()) update(v => ({ ...v, error: 'No se pudo consultar la configuración. Puedes volver a consultar el estado.' }));
      } finally {
        flight.waiting.finish(); if (scope.read === flight) scope.read = null;
        if (valid()) update(v => ({ ...v, readBusy: false }));
      }
    })();
    return flight.promise;
  }, [scope,current,retireRead,update]);

  const run = useCallback(async (body: object, decode: (value: unknown) => void, activating = false) => {
    if (!current()) return;
    if (scope.command) return scope.command.promise;
    retireRead(); update(v => ({ ...v, readBusy: false, commandBusy: true, error: '' }));
    const flight: Flight = { waiting: createClientReadWait(), promise: null }; scope.command = flight;
    let acknowledged = false;
    flight.promise = (async () => {
      try {
        const response = await flight.waiting.wait(fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body), signal: flight.waiting.signal }));
        if (!current()) return;
        const value: unknown = await flight.waiting.wait(response.json());
        if (!current()) return;
        if (!response.ok) throw Error('Command unavailable');
        decode(value); acknowledged = activating;
      } catch {
        if (current()) update(v => ({ ...v, error: activating ? uncertain : 'No se pudo previsualizar el cambio. Revisa el estado antes de repetirlo.' }));
      } finally {
        flight.waiting.finish(); if (scope.command === flight) scope.command = null;
        if (current()) update(v => ({ ...v, commandBusy: false }));
      }
      // A confirmed acknowledgement is independent of the following read.
      if (acknowledged && current()) await read(true);
    })();
    return flight.promise;
  }, [scope,current,retireRead,update,read]);

  const prepare = useCallback(async (rollback = false) => {
    if (!current()) return;
    if (scope.command) return scope.command.promise;
    const v = scope.state;
    if (scope.read || v.attempt || !v.configuration || !v.reason.trim() || (rollback && !v.previousRevision)
      || (!rollback && (v.profile === v.configuration.activeProfile || !Object.hasOwn(v.configuration.profiles, v.profile)))) return;
    const candidate = { ...v.configuration, revision: crypto.randomUUID(), activeProfile: v.profile };
    const revision = rollback ? v.previousRevision! : candidate.revision;
    update(s => ({ ...s, preview: null, message: '' }));
    return run(rollback ? { action: 'rollback', revision, reason: v.reason } : { action: 'preview', configuration: candidate, reason: v.reason }, value => {
      const result = preview(value, revision, rollback ? undefined : candidate.activeProfile);
      update(s => ({ ...s, preview: result, checked: false }));
    });
  }, [scope,current,update,run]);
  const activate = useCallback(async () => {
    if (!current()) return;
    if (scope.command) return scope.command.promise;
    const v = scope.state, original = v.preview;
    if (scope.read || !original || original.expiresAt <= Date.now() || (v.attempt && !v.checked)) return;
    // Only this original server-issued preview permits an explicit retry, within its original expiry.
    update(s => ({ ...s, attempt: original, checked: false, message: 'Activación pendiente de confirmación.' }));
    return run({ action: 'activate', previewId: original.previewId }, value => {
      if (!record(value) || value.revision !== original.revision || (value.alreadyActive !== undefined && typeof value.alreadyActive !== 'boolean')) throw Error('Invalid activation acknowledgement');
      update(s => ({ ...s, previousRevision: original.previousRevision, preview: null, attempt: null, checked: false,
        message: 'Perfil activado. Las tareas que ya estaban en curso conservan su configuración.' }));
    }, true);
  }, [scope,current,update,run]);

  useEffect(() => {
    scope.active = true; void read();
    return () => {
      scope.active = false;
      // Strict Mode reuses the original flight; real retirement never grants cancellation or retry authority.
      void Promise.resolve().then(() => { if (!scope.active || active.current !== scope) { scope.read?.waiting.cancel(); scope.command?.waiting.cancel(); } });
    };
  }, [scope,read]);
  const view = store.scope === scope && current() ? store.state : initial();
  useEffect(() => {
    const original = view.preview; if (!original) return;
    const timer = setTimeout(() => update(v => v.preview !== original ? v : ({ ...v, preview: null,
      message: v.attempt ? 'La previsualización ha caducado y la petición original sigue sin acuse. Consulta el estado; no puede repetirse con un permiso caducado.'
        : 'La previsualización ha caducado. Revisa el cambio de nuevo.' })), Math.max(0, original.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [view.preview,update]);
  const busy = view.readBusy || view.commandBusy || status === 'loading' || (current() && !view.loaded && !view.error);
  const edit = (field: 'profile' | 'reason', value: string) => { if (current() && !scope.read && !scope.command && !scope.state.attempt) update(v => ({ ...v, [field]: value, preview: null })); };
  return { ...view, busy, error: view.error || (status === 'unauthenticated' || (status === 'authenticated' && (!userId || !email)) ? 'Necesitas una sesión administrativa para consultar el estado.' : ''),
    refresh: () => read(true), prepare, activate, setProfile: (value: string) => edit('profile', value), setReason: (value: string) => edit('reason', value) };
}
