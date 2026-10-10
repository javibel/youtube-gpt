'use client';
import { useSession } from 'next-auth/react';
import { useConfigurationPanel } from '@/lib/use-configuration-panel';
const button = 'rounded-lg border px-4 py-2 text-sm disabled:opacity-40';

export default function ConfigurationPanel() {
  const { data: session, status } = useSession();
  const { configuration, profile, reason, preview, attempt, checked, previousRevision, busy, message, error,
    refresh, prepare, activate, setProfile, setReason } = useConfigurationPanel(session?.user?.id, session?.user?.email, status);

  return <section className="space-y-5" aria-busy={busy}>
    {error && <p role="alert" className="rounded-lg border border-red-400 p-4">{error}</p>}
    {message && <p role="status" className="rounded-lg border p-4">{message}</p>}
    {!configuration ? <div className="yv-card p-6"><p>{busy ? 'Consultando perfiles…' : 'No hay una configuración disponible para gestionar.'}</p>
      {!busy && <button className={`${button} mt-4`} onClick={refresh}>Volver a consultar</button>}
    </div> : <>
      <div className="yv-card p-6 space-y-4">
        <p>Perfil activo: <strong>{configuration.activeProfile}</strong></p>
        <button className={button} disabled={busy} onClick={refresh}>Actualizar estado</button>
        <label className="block">Perfil que quieres utilizar
          <select className="mt-2 block w-full rounded-lg border bg-transparent p-3" value={profile} disabled={busy || !!attempt} onChange={e => setProfile(e.target.value)}>
            {Object.keys(configuration.profiles).map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="block">Motivo del cambio
          <textarea className="mt-2 block w-full rounded-lg border bg-transparent p-3" rows={2} maxLength={1000} value={reason} disabled={busy || !!attempt} onChange={e => setReason(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-3">
          <button className={button} disabled={busy || !!attempt || !reason.trim() || profile === configuration.activeProfile} onClick={() => prepare()}>Revisar cambio</button>
          {previousRevision && <button className={button} disabled={busy || !!attempt || !reason.trim()} onClick={() => prepare(true)}>Revisar vuelta al perfil anterior</button>}
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
        <button className={button} disabled={busy || (!!attempt && !checked)} onClick={activate}>Activar este perfil</button>
      </div>}
    </>}
  </section>;
}
