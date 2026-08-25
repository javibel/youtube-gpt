'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLang } from '@/components/LangProvider';

type Lang = 'es' | 'en';

export default function TeamJoinPage() {
  return (
    <Suspense fallback={<div className="min-h-screen grain flex items-center justify-center" style={{ background: 'var(--ink)' }}><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /></div>}>
      <TeamJoinContent />
    </Suspense>
  );
}

function TeamJoinContent() {
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const lang = useLang();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const t = (es: string, en: string) => (lang === 'en' ? en : es);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push(`/login?redirect=/team/join?token=${token}`);
    }
  }, [status, router, token]);

  async function join() {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/team/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        const messages: Record<string, string> = {
          invalid_token: t('Enlace invalido o expirado.', 'Invalid or expired link.'),
          expired: t('Este enlace ha expirado.', 'This link has expired.'),
          email_mismatch: t('Este enlace es para otro email.', 'This link is for a different email.'),
          already_in_team: t('Ya perteneces a un equipo.', 'You already belong to a team.'),
          team_full: t('El equipo esta lleno.', 'The team is full.'),
        };
        setError(messages[data.error] || data.error || t('Error', 'Error'));
        return;
      }
      setSuccess(t(`Te has unido a ${data.teamName}!`, `You've joined ${data.teamName}!`));
      setTimeout(() => router.push('/team'), 2000);
    } catch {
      setError(t('Error de conexion', 'Connection error'));
    } finally {
      setLoading(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen grain flex items-center justify-center" style={{ background: 'var(--ink)' }}>
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--yv-light)', color: 'var(--yv-text-1)' }}>
      <div className="max-w-md w-full mx-4">
        <div className="yv-glass p-8 text-center">
          <div className="w-14 h-14 mx-auto mb-5 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(155,32,32,0.1)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>

          <h1 className="font-display font-bold text-2xl text-white mb-2">
            {t('Unirse al equipo', 'Join team')}
          </h1>
          <p className="text-zinc-500 font-mono-jb text-sm mb-6">
            {t('Has sido invitado a unirte a un equipo en YTubViral.', 'You have been invited to join a team on YTubViral.')}
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg border border-red-500/30" style={{ background: 'rgba(232,77,91,0.08)' }}>
              <p className="text-sm text-red-400 font-mono-jb">{error}</p>
            </div>
          )}

          {success ? (
            <div className="p-3 rounded-lg border border-green-500/30" style={{ background: 'rgba(34,197,94,0.08)' }}>
              <p className="text-sm text-green-400 font-mono-jb">{success}</p>
            </div>
          ) : (
            <button
              onClick={join}
              disabled={loading || !token}
              className="btn-offset inline-flex items-center gap-2 px-8 py-3 text-sm font-display disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
                </svg>
              )}
              {t('Aceptar invitacion', 'Accept invitation')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
