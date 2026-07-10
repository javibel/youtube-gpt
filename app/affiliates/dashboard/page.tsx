'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useLang } from '@/components/LangProvider';
import PublicNav from '@/components/PublicNav';

type Commission = { id: string; commissionCents: number; invoiceAmountCents: number; status: string; createdAt: string };
type AffiliateData = {
  code: string; status: string; commissionPct: number; monthsPaid: number; url: string;
  clicks30d: number; referredSignups: number; pendingCents: number; paidCents: number; commissions: Commission[];
} | null;

const eur = (cents: number) => `${(cents / 100).toFixed(2).replace('.', ',')} €`;

export default function AffiliateDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const lang = useLang();
  const t = (es: string, en: string) => (lang === 'en' ? en : es);
  const [data, setData] = useState<AffiliateData>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status === 'authenticated') {
      fetch('/api/affiliates/dashboard').then(r => r.json()).then(d => setData(d.affiliate)).finally(() => setLoading(false));
    }
  }, [status, router]);

  if (status === 'loading' || loading) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--ink)' }}><span className="text-white">…</span></div>;
  }

  if (!data) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
        <PublicNav />
        <div className="max-w-xl mx-auto px-6 py-20 text-center">
          <p className="font-display font-bold text-xl text-white mb-3">{t('Esta cuenta no está vinculada a ningún afiliado', 'This account isn\'t linked to any affiliate')}</p>
          <p className="font-mono-jb text-sm mb-6" style={{ color: 'var(--yv-text-3)' }}>
            {t('Si ya has solicitado unirte al programa, espera la aprobación — te lo vinculamos manualmente.', 'If you already applied to the program, wait for approval — we link it manually.')}
          </p>
          <a href="/affiliates" className="btn-offset inline-flex px-6 py-3 text-sm font-display font-bold">{t('Ver el programa de afiliados', 'See the affiliate program')}</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      <PublicNav />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--yv-brand)' }}>{t('PANEL DE AFILIADO', 'AFFILIATE DASHBOARD')}</p>
        <h1 className="font-display font-bold text-3xl text-white mb-6">{data.code}</h1>

        {data.status !== 'active' && (
          <div className="mb-6 rounded-xl px-4 py-3 font-mono-jb text-sm" style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)', color: '#eab308' }}>
            {t(`Tu cuenta está "${data.status}" — solo se generan comisiones mientras esté activa.`, `Your account is "${data.status}" — commissions only accrue while active.`)}
          </div>
        )}

        <div className="rounded-xl p-5 mb-8" style={{ background: 'var(--yv-surface)', border: '1px solid var(--yv-border)' }}>
          <p className="font-mono-jb text-[12px] mb-2" style={{ color: 'var(--yv-text-4)' }}>{t('Tu link', 'Your link')}</p>
          <div className="flex items-center gap-2">
            <code className="font-mono-jb text-sm text-white flex-1 truncate">{data.url}</code>
            <button onClick={() => { navigator.clipboard.writeText(data.url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="text-[12px] px-3 py-1.5 rounded flex-shrink-0" style={{ border: '1px solid var(--yv-border)', color: 'var(--yv-text-2)' }}>
              {copied ? t('¡Copiado!', 'Copied!') : t('Copiar', 'Copy')}
            </button>
          </div>
          <p className="font-mono-jb text-[12px] mt-3" style={{ color: 'var(--yv-text-4)' }}>
            {t(`O tu audiencia puede citar el código "${data.code}" a mano al registrarse.`, `Or your audience can type the code "${data.code}" by hand at signup.`)}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { l: t('Clics (30d)', 'Clicks (30d)'), v: data.clicks30d },
            { l: t('Signups atribuidos', 'Attributed signups'), v: data.referredSignups },
            { l: t('Pendiente', 'Pending'), v: eur(data.pendingCents) },
            { l: t('Pagado', 'Paid'), v: eur(data.paidCents) },
          ].map((s, i) => (
            <div key={i} className="rounded-xl p-4 text-center" style={{ background: 'var(--yv-surface)', border: '1px solid var(--yv-border)' }}>
              <p className="font-display font-bold text-xl text-white">{s.v}</p>
              <p className="font-mono-jb text-[11px] mt-1" style={{ color: 'var(--yv-text-4)' }}>{s.l}</p>
            </div>
          ))}
        </div>

        <p className="font-mono-jb text-[12px] mb-4" style={{ color: 'var(--yv-text-4)' }}>
          {t(`${data.commissionPct}% de comisión, durante ${data.monthsPaid} meses por cada suscriptor.`, `${data.commissionPct}% commission, for ${data.monthsPaid} months per subscriber.`)}
        </p>

        <h2 className="font-display font-bold text-lg text-white mb-3">{t('Comisiones', 'Commissions')}</h2>
        <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--yv-border)' }}>
          <table className="w-full text-left text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--yv-surface)' }}>
                {[t('Fecha', 'Date'), t('Comisión', 'Commission'), t('Estado', 'Status')].map(h => (
                  <th key={h} className="font-mono-jb text-[11px] px-3 py-2" style={{ color: 'var(--yv-text-4)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.commissions.map(c => (
                <tr key={c.id} style={{ borderTop: '1px solid var(--yv-border)' }}>
                  <td className="px-3 py-2 font-mono-jb text-[12px]">{new Date(c.createdAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES')}</td>
                  <td className="px-3 py-2 font-bold text-white">{eur(c.commissionCents)}</td>
                  <td className="px-3 py-2 font-mono-jb text-[12px]">{c.status}</td>
                </tr>
              ))}
              {data.commissions.length === 0 && (
                <tr><td colSpan={3} className="px-3 py-6 text-center font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>{t('Todavía sin comisiones.', 'No commissions yet.')}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="font-mono-jb text-[12px] mt-6" style={{ color: 'var(--yv-text-4)' }}>
          <a href="/affiliates/terms" className="underline hover:text-white transition">{t('Términos del programa', 'Program terms')}</a>
        </p>
      </div>
    </div>
  );
}
