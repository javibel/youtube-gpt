'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';

type AffiliateRow = {
  id: string; code: string; name: string; email: string; status: string;
  commissionPct: number; monthsPaid: number; payoutMethod: string | null;
  channelInfo: string | null; createdAt: string; linkedUserEmail: string | null;
  clicks: number; commissionCount: number; pendingCents: number; paidCents: number;
};
type CommissionRow = {
  id: string; affiliateCode: string; affiliateName: string; affiliateEmail: string;
  payoutMethod: string | null; commissionCents: number; invoiceAmountCents: number;
  status: string; createdAt: string; payable: boolean;
};

const eur = (cents: number) => `${(cents / 100).toFixed(2).replace('.', ',')} €`;
const STATUS_COLOR: Record<string, string> = {
  pending: '#eab308', active: '#22c55e', paused: '#71717a', terminated: '#f87171', approved: '#3b82f6', paid: '#22c55e', reversed: '#f87171',
};

export default function AdminAffiliatesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [affiliates, setAffiliates] = useState<AffiliateRow[]>([]);
  const [commissions, setCommissions] = useState<CommissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [linkEmailDraft, setLinkEmailDraft] = useState<Record<string, string>>({});
  const [selectedCommissions, setSelectedCommissions] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      fetch('/api/admin/affiliates').then(r => r.json()),
      fetch('/api/admin/affiliates/commissions').then(r => r.json()),
    ]).then(([a, c]) => {
      if (a.error || c.error) { setError(a.error || c.error); return; }
      setAffiliates(a.affiliates); setCommissions(c.commissions);
    }).catch(e => setError(String(e))).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status === 'authenticated' && !(session?.user as { isAdmin?: boolean })?.isAdmin) { router.push('/dashboard'); return; }
    if (status === 'authenticated') load();
  }, [status, session, router, load]);

  async function patchAffiliate(id: string, body: Record<string, unknown>) {
    setBusy(true);
    const res = await fetch('/api/admin/affiliates', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...body }),
    });
    const data = await res.json();
    if (!res.ok) alert(data.error || 'Error');
    else load();
    setBusy(false);
  }

  async function patchCommissions(ids: string[], newStatus: string) {
    setBusy(true);
    const res = await fetch('/api/admin/affiliates/commissions', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, status: newStatus }),
    });
    const data = await res.json();
    if (!res.ok) alert(data.error || 'Error');
    else { setSelectedCommissions(new Set()); load(); }
    setBusy(false);
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--ink)' }}><span className="text-white">Cargando…</span></div>;
  if (error) return <div className="min-h-screen p-8" style={{ background: 'var(--ink)', color: '#f87171' }}>{error}</div>;

  const payableSelected = commissions.filter(c => selectedCommissions.has(c.id) && c.payable);

  return (
    <div className="min-h-screen p-8" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      <h1 className="font-display font-bold text-2xl text-white mb-1">Afiliados</h1>
      <p className="font-mono-jb text-[13px] mb-8" style={{ color: 'var(--yv-text-4)' }}>Aprobación manual — v1 curada, sin auto-servicio.</p>

      <section className="mb-10">
        <h2 className="font-display font-bold text-lg text-white mb-3">Afiliados ({affiliates.length})</h2>
        <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--yv-border)' }}>
          <table className="w-full text-left text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--yv-surface)' }}>
                {['Código', 'Nombre', 'Email', 'Estado', '%', 'Cuenta vinculada', 'Clics', 'Pendiente', 'Pagado', 'Acciones'].map(h => (
                  <th key={h} className="font-mono-jb text-[11px] px-3 py-2 whitespace-nowrap" style={{ color: 'var(--yv-text-4)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {affiliates.map(a => (
                <tr key={a.id} style={{ borderTop: '1px solid var(--yv-border)' }}>
                  <td className="px-3 py-2 font-mono-jb text-white">{a.code}</td>
                  <td className="px-3 py-2">{a.name}</td>
                  <td className="px-3 py-2 font-mono-jb text-[12px]" style={{ color: 'var(--yv-text-3)' }}>{a.email}</td>
                  <td className="px-3 py-2"><span style={{ color: STATUS_COLOR[a.status] }}>{a.status}</span></td>
                  <td className="px-3 py-2">
                    <input type="number" defaultValue={a.commissionPct} min={0} max={100} style={{ width: 50, background: 'transparent', border: '1px solid var(--yv-border)', borderRadius: 4, color: 'white', padding: '2px 4px' }}
                      onBlur={(e) => { const v = Number(e.target.value); if (v !== a.commissionPct) patchAffiliate(a.id, { commissionPct: v }); }} />
                  </td>
                  <td className="px-3 py-2 font-mono-jb text-[12px]">
                    {a.linkedUserEmail || (
                      <div className="flex gap-1">
                        <input type="email" placeholder="email cuenta" value={linkEmailDraft[a.id] || ''} onChange={(e) => setLinkEmailDraft(d => ({ ...d, [a.id]: e.target.value }))}
                          style={{ width: 130, background: 'transparent', border: '1px solid var(--yv-border)', borderRadius: 4, color: 'white', padding: '2px 4px', fontSize: 11 }} />
                        <button disabled={busy} onClick={() => patchAffiliate(a.id, { linkUserEmail: linkEmailDraft[a.id] })}
                          className="text-[11px] px-2 rounded" style={{ border: '1px solid var(--yv-border)' }}>Vincular</button>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{a.clicks}</td>
                  <td className="px-3 py-2 text-right">{eur(a.pendingCents)}</td>
                  <td className="px-3 py-2 text-right">{eur(a.paidCents)}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 flex-wrap">
                      {a.status !== 'active' && <button disabled={busy} onClick={() => patchAffiliate(a.id, { status: 'active' })} className="text-[11px] px-2 py-1 rounded" style={{ border: '1px solid #22c55e', color: '#22c55e' }}>Aprobar</button>}
                      {a.status === 'active' && <button disabled={busy} onClick={() => patchAffiliate(a.id, { status: 'paused' })} className="text-[11px] px-2 py-1 rounded" style={{ border: '1px solid #eab308', color: '#eab308' }}>Pausar</button>}
                      {a.status !== 'terminated' && <button disabled={busy} onClick={() => { if (confirm(`¿Terminar a ${a.name}?`)) patchAffiliate(a.id, { status: 'terminated' }); }} className="text-[11px] px-2 py-1 rounded" style={{ border: '1px solid #f87171', color: '#f87171' }}>Terminar</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {affiliates.length === 0 && <tr><td colSpan={10} className="px-3 py-6 text-center font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>Sin solicitudes todavía.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="font-display font-bold text-lg text-white mb-1">Comisiones pendientes de pago ({commissions.length})</h2>
        <p className="font-mono-jb text-[12px] mb-3" style={{ color: 'var(--yv-text-4)' }}>Solo son pagables (checkbox habilitado) las que llevan ≥30 días devengadas — ventana de garantía/refund.</p>
        <div className="flex gap-2 mb-3">
          <button disabled={busy || !payableSelected.length} onClick={() => patchCommissions(payableSelected.map(c => c.id), 'approved')}
            className="text-[12px] px-3 py-1.5 rounded disabled:opacity-40" style={{ border: '1px solid #3b82f6', color: '#3b82f6' }}>Aprobar seleccionadas ({payableSelected.length})</button>
          <button disabled={busy || !payableSelected.length} onClick={() => { if (confirm('¿Marcar como pagadas? Esto NO envía el pago — solo registra que ya lo hiciste a mano.')) patchCommissions(payableSelected.map(c => c.id), 'paid'); }}
            className="text-[12px] px-3 py-1.5 rounded disabled:opacity-40" style={{ border: '1px solid #22c55e', color: '#22c55e' }}>Marcar pagadas ({payableSelected.length})</button>
        </div>
        <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--yv-border)' }}>
          <table className="w-full text-left text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--yv-surface)' }}>
                {['', 'Afiliado', 'Email', 'Método pago', 'Factura', 'Comisión', 'Estado', 'Devengada'].map(h => (
                  <th key={h} className="font-mono-jb text-[11px] px-3 py-2 whitespace-nowrap" style={{ color: 'var(--yv-text-4)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {commissions.map(c => (
                <tr key={c.id} style={{ borderTop: '1px solid var(--yv-border)', opacity: c.payable ? 1 : 0.5 }}>
                  <td className="px-3 py-2"><input type="checkbox" disabled={!c.payable} checked={selectedCommissions.has(c.id)}
                    onChange={(e) => setSelectedCommissions(s => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })} /></td>
                  <td className="px-3 py-2 font-mono-jb">{c.affiliateCode} — {c.affiliateName}</td>
                  <td className="px-3 py-2 font-mono-jb text-[12px]" style={{ color: 'var(--yv-text-3)' }}>{c.affiliateEmail}</td>
                  <td className="px-3 py-2 font-mono-jb text-[12px]">{c.payoutMethod || '—'}</td>
                  <td className="px-3 py-2 text-right">{eur(c.invoiceAmountCents)}</td>
                  <td className="px-3 py-2 text-right font-bold">{eur(c.commissionCents)}</td>
                  <td className="px-3 py-2"><span style={{ color: STATUS_COLOR[c.status] }}>{c.status}</span></td>
                  <td className="px-3 py-2 font-mono-jb text-[12px]">{new Date(c.createdAt).toLocaleDateString('es-ES')}{!c.payable && <span style={{ color: 'var(--yv-text-4)' }}> (en retención)</span>}</td>
                </tr>
              ))}
              {commissions.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>Sin comisiones pendientes.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
