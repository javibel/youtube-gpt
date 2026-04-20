'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Phase = 'syncing' | 'success' | 'error';

export default function StripeSuccessPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('syncing');

  useEffect(() => {
    let cancelled = false;
    let attempt = 0;

    async function trySync() {
      try {
        const res = await fetch('/api/stripe/sync', { method: 'POST' });
        const d = await res.json();

        if (cancelled) return;

        if (d.synced) {
          setPhase('success');
          setTimeout(() => router.push('/dashboard'), 2500);
        } else {
          attempt++;
          if (attempt < 6) {
            // Stripe webhook may not have fired yet — retry every 2s up to 6 times
            setTimeout(trySync, 2000);
          } else {
            setPhase('error');
          }
        }
      } catch {
        if (!cancelled) setPhase('error');
      }
    }

    trySync();

    return () => { cancelled = true; };
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center grain" style={{ background: 'var(--ink)' }}>
      <div className="text-center max-w-md px-6">

        {phase === 'syncing' && (
          <>
            <div className="w-16 h-16 mx-auto mb-8 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(232,77,91,0.15)', border: '1px solid rgba(232,77,91,0.3)' }}>
              <div className="w-7 h-7 border-2 border-transparent rounded-full spin-r" style={{ borderTopColor: 'var(--red)' }} />
            </div>
            <h1 className="font-display font-bold text-3xl mb-3">Activando tu plan Pro...</h1>
            <p className="text-zinc-500 font-mono-jb text-sm">Estamos sincronizando tu suscripción. Un momento.</p>
          </>
        )}

        {phase === 'success' && (
          <>
            <div className="w-16 h-16 mx-auto mb-8 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(232,77,91,0.2)', border: '1px solid var(--red)' }}>
              <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="font-mono-jb text-[11px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>BIENVENIDO A PRO</p>
            <h1 className="font-display font-bold text-3xl mb-3">¡Todo listo!</h1>
            <p className="text-zinc-400 text-sm mb-6">Tu cuenta está activa con 200 generaciones al mes. Redirigiendo al panel...</p>
            <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full" style={{ background: 'var(--red)', width: '100%' }} />
            </div>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="w-16 h-16 mx-auto mb-8 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth={2} strokeLinecap="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h1 className="font-display font-bold text-3xl mb-3">Pago recibido</h1>
            <p className="text-zinc-400 text-sm mb-6">
              Tu pago se procesó correctamente. Tu cuenta Pro se activará en unos minutos de forma automática.
            </p>
            <button onClick={() => router.push('/dashboard')} className="btn-offset px-6 py-3 font-display text-sm">
              Ir al dashboard →
            </button>
          </>
        )}

      </div>
    </div>
  );
}
