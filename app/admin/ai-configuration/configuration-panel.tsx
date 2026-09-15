'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Configuration } from '@/contracts/ai/v1/core.cjs';

type Preview = { previewId: string; expiresAt: number; previousRevision: string | null; revision: string; activeProfile: string;
  assignments: { profile: string; taskType: string; agentId: string | null; providerId: string; model: string }[];
  exceptions: Configuration['exceptions']; };
const endpoint = '/api/admin/ai-configuration';
const button = 'rounded-lg border px-4 py-2 text-sm disabled:opacity-40';

async function command(body: object) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No se pudo confirmar la operación. Consulta el estado antes de intentarlo de nuevo.');
  return result;
}

export default function ConfigurationPanel() {
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const [profile, setProfile] = useState('');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previousRevision, setPreviousRevision] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(endpoint, { cache: 'no-store', signal });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo consultar la configuración.');
    setConfiguration(result.configuration);
    setProfile(result.configuration?.activeProfile ?? '');
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [refresh]);
  useEffect(() => {
    if (!preview) return;
    const timer = setTimeout(() => { setPreview(null); setMessage('La previsualización ha caducado. Revisa el cambio de nuevo.'); }, Math.max(0, preview.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [preview]);

  async function prepare(rollback = false) {
    if (!configuration || !reason.trim()) return;
    setBusy(true); setError(''); setMessage(''); setPreview(null);
    try {
      const result = rollback
        ? await command({ action: 'rollback', revision: previousRevision, reason })
        : await command({ action: 'preview', configuration: { ...configuration, revision: crypto.randomUUID(), activeProfile: profile }, reason });
      setPreview(result);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo previsualizar el cambio.'); }
    finally { setBusy(false); }
  }
  async function activate() {
    if (!preview || preview.expiresAt <= Date.now()) return;
    setBusy(true); setError('');
    try {
      await command({ action: 'activate', previewId: preview.previewId });
      setPreviousRevision(preview.previousRevision); setPreview(null);
      setMessage('Perfil activado. Las tareas que ya estaban en curso conservan su configuración.');
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo confirmar la activación.'); }
    finally { setBusy(false); }
  }

  return <section className="space-y-5" aria-busy={busy}>
    {error && <p role="alert" className="rounded-lg border border-red-400 p-4">{error}</p>}
    {message && <p role="status" className="rounded-lg border p-4">{message}</p>}
    {!configuration ? <div className="yv-card p-6"><p>{busy ? 'Consultando perfiles…' : 'No hay una configuración disponible para gestionar.'}</p>
      {!busy && <button className={`${button} mt-4`} onClick={async () => { setBusy(true); setError(''); try { await refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo consultar el estado.'); } finally { setBusy(false); } }}>Volver a consultar</button>}
    </div> : <>
      <div className="yv-card p-6 space-y-4">
        <p>Perfil activo: <strong>{configuration.activeProfile}</strong></p>
        <button className={button} disabled={busy} onClick={async () => { setBusy(true); setError(''); setPreview(null); try { await refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo consultar el estado.'); } finally { setBusy(false); } }}>Actualizar estado</button>
        <label className="block">Perfil que quieres utilizar
          <select className="mt-2 block w-full rounded-lg border bg-transparent p-3" value={profile} disabled={busy} onChange={e => { setProfile(e.target.value); setPreview(null); }}>
            {Object.keys(configuration.profiles).map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="block">Motivo del cambio
          <textarea className="mt-2 block w-full rounded-lg border bg-transparent p-3" rows={2} maxLength={1000} value={reason} disabled={busy} onChange={e => { setReason(e.target.value); setPreview(null); }} />
        </label>
        <div className="flex flex-wrap gap-3">
          <button className={button} disabled={busy || !reason.trim() || profile === configuration.activeProfile} onClick={() => prepare()}>Revisar cambio</button>
          {previousRevision && <button className={button} disabled={busy || !reason.trim()} onClick={() => prepare(true)}>Revisar vuelta al perfil anterior</button>}
        </div>
      </div>
      {preview && <div className="yv-card p-6 space-y-4">
        <h2 className="text-lg font-semibold">Previsualización: {preview.activeProfile}</h2>
        <p>Compatibilidad y disponibilidad comprobadas. Se verificarán de nuevo al activar.</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr><th className="p-2">Tarea</th><th className="p-2">Agente</th><th className="p-2">Proveedor</th><th className="p-2">Modelo</th></tr></thead>
          <tbody>{preview.assignments.filter(row => row.profile === preview.activeProfile).map(row => <tr key={`${row.taskType}:${row.agentId ?? ''}`}><td className="p-2">{row.taskType}</td><td className="p-2">{row.agentId ?? 'General'}</td><td className="p-2">{row.providerId}</td><td className="p-2">{row.model}</td></tr>)}</tbody>
        </table></div>
        {preview.exceptions.length > 0 && <div><h3 className="font-semibold">Excepciones que se mantienen</h3><ul className="list-disc pl-5">{preview.exceptions.map(item => <li key={`${item.scope}:${item.id}`}>{item.id}: {item.selection.providerId} · {item.selection.model}. {item.reason}</li>)}</ul></div>}
        <button className={button} disabled={busy} onClick={activate}>Activar este perfil</button>
      </div>}
    </>}
  </section>;
}
