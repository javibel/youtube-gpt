'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { getLangClient, setLangClient } from '@/lib/get-lang-client';
import PasswordInput from '@/components/PasswordInput';

type Lang = 'es' | 'en';

type UserData = {
  user: { email: string; name: string | null; createdAt: string };
  stats: { isPro: boolean; totalGenerations: number; generationsThisMonth: number; limit: number };
  subscription: { status: string; cancelAtPeriodEnd: boolean; currentPeriodEnd: string | null } | null;
};

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('es');
  const [data, setData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [nameInput, setNameInput] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [showPwdForm, setShowPwdForm] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdSuccess, setPwdSuccess] = useState(false);

  useEffect(() => { setLang(getLangClient()); }, []);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/user/stats')
        .then(r => r.json())
        .then(d => { setData(d); setNameInput(d.user?.name ?? ''); })
        .finally(() => setLoading(false));
    }
  }, [status]);

  const t = (es: string, en: string) => lang === 'en' ? en : es;

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdError('');
    if (newPwd !== confirmPwd) {
      setPwdError(t('Las contraseñas no coinciden', 'Passwords do not match'));
      return;
    }
    if (newPwd.length < 8) {
      setPwdError(t('Mínimo 8 caracteres', 'At least 8 characters'));
      return;
    }
    setPwdLoading(true);
    const res = await fetch('/api/user/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd, lang }),
    });
    const d = await res.json();
    setPwdLoading(false);
    if (!res.ok) { setPwdError(d.error ?? t('Error al cambiar la contraseña', 'Error changing password')); return; }
    setPwdSuccess(true);
    setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    setTimeout(() => { setPwdSuccess(false); setShowPwdForm(false); }, 3000);
  }

  function handleLangChange(next: Lang) {
    setLang(next);
    setLangClient(next);
  }

  async function handleSaveName() {
    setSavingName(true);
    const res = await fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameInput.trim() }),
    });
    if (res.ok) {
      setData(prev => prev ? { ...prev, user: { ...prev.user, name: nameInput.trim() } } : null);
      setEditingName(false);
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2500);
    }
    setSavingName(false);
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--ink)' }}>
        <div className="w-8 h-8 rounded-full border-2 border-transparent spin-r" style={{ borderTopColor: 'var(--red)' }} />
      </div>
    );
  }

  if (!session) return null;

  const isPro = data?.stats?.isPro ?? false;
  const displayName = data?.user?.name ?? session.user?.email ?? '';
  const initials = displayName.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
  const dateLocale = lang === 'en' ? 'en-US' : 'es-ES';

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>

      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-md" style={{ background: 'rgba(10,10,10,0.85)' }}>
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <a href="/dashboard" className="flex items-center gap-2 text-zinc-400 hover:text-white transition font-mono-jb text-[11px] tracking-wider uppercase">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            {t('Volver al panel', 'Back to dashboard')}
          </a>
          <button onClick={() => signOut({ callbackUrl: '/' })} className="font-mono-jb text-[11px] text-zinc-500 hover:text-zinc-300 transition">
            {t('Salir', 'Sign out')}
          </button>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">

        {/* Page title */}
        <div>
          <p className="font-mono-jb text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: 'var(--red)' }}>
            {t('AJUSTES', 'SETTINGS')}
          </p>
          <h1 className="font-display font-bold text-3xl">{t('Mi perfil', 'My profile')}</h1>
        </div>

        {/* Avatar + name */}
        <div className="soft-card p-6">
          <p className="font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-5">{t('Información personal', 'Personal information')}</p>
          <div className="flex items-center gap-5 mb-6">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center font-display font-bold text-2xl flex-shrink-0"
              style={{ background: 'var(--red)', color: '#fff', boxShadow: '0 8px 24px -8px rgba(232,77,91,0.6)' }}>
              {initials}
            </div>
            <div>
              <p className="font-display font-bold text-xl text-white">{displayName}</p>
              <p className="font-mono-jb text-xs text-zinc-500 mt-0.5">{data?.user?.email}</p>
              {isPro && <span className="red-tape text-[9px] mt-1 inline-block">PRO</span>}
            </div>
          </div>

          {/* Name field */}
          <div className="space-y-2">
            <label className="block font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500">{t('Nombre', 'Name')}</label>
            {editingName ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
                  className="soft-field flex-1 py-2.5 px-3 text-sm"
                  style={{ borderRadius: '10px' }}
                />
                <button onClick={handleSaveName} disabled={savingName || !nameInput.trim()}
                  className="btn-offset px-4 py-2.5 text-[12px] font-display disabled:opacity-50">
                  {savingName ? '...' : t('Guardar', 'Save')}
                </button>
                <button onClick={() => setEditingName(false)} className="px-3 text-zinc-500 hover:text-white transition font-mono-jb text-sm">✕</button>
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)' }}>
                <span className="text-sm text-zinc-300">{data?.user?.name || <span className="text-zinc-600">{t('Sin nombre', 'No name set')}</span>}</span>
                <button onClick={() => { setNameInput(data?.user?.name ?? ''); setEditingName(true); }}
                  className="font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 hover:text-white transition">
                  {t('Editar', 'Edit')}
                </button>
              </div>
            )}
            {nameSaved && (
              <p className="font-mono-jb text-[11px]" style={{ color: '#22c55e' }}>✓ {t('Nombre actualizado', 'Name updated')}</p>
            )}
          </div>

          {/* Email (read-only) */}
          <div className="mt-4 space-y-2">
            <label className="block font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500">Email</label>
            <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)' }}>
              <span className="text-sm text-zinc-500">{data?.user?.email}</span>
              <span className="font-mono-jb text-[9px] text-zinc-700 uppercase">{t('No editable', 'Read only')}</span>
            </div>
          </div>
        </div>

        {/* Language */}
        <div className="soft-card p-6">
          <p className="font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-4">{t('Idioma', 'Language')}</p>
          <div className="flex gap-3">
            {(['es', 'en'] as Lang[]).map(l => (
              <button
                key={l}
                onClick={() => handleLangChange(l)}
                className="flex-1 py-3 rounded-xl font-display font-bold text-sm transition"
                style={{
                  background: lang === l ? 'var(--red)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${lang === l ? 'var(--red)' : 'var(--line)'}`,
                  color: lang === l ? '#fff' : '#71717a',
                  boxShadow: lang === l ? '0 6px 20px -8px rgba(232,77,91,0.6)' : 'none',
                }}
              >
                {l === 'es' ? 'Español' : 'English'}
              </button>
            ))}
          </div>
          <p className="font-mono-jb text-[10px] text-zinc-600 mt-3">
            {t('El idioma se aplica a toda la aplicación.', 'Language applies across the entire app.')}
          </p>
        </div>

        {/* Plan */}
        <div className="soft-card p-6">
          <p className="font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-4">{t('Plan', 'Plan')}</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display font-bold text-lg text-white">{isPro ? 'Pro' : 'Free'}</p>
              <p className="font-mono-jb text-[11px] text-zinc-500 mt-1">
                {isPro
                  ? (data?.subscription?.cancelAtPeriodEnd
                      ? t('Cancela el ', 'Cancels on ') + (data.subscription.currentPeriodEnd ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString(dateLocale, { day: '2-digit', month: 'long', year: 'numeric' }) : '—')
                      : t('Renovación el ', 'Renews on ') + (data?.subscription?.currentPeriodEnd ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString(dateLocale, { day: '2-digit', month: 'long', year: 'numeric' }) : '—'))
                  : `${data?.stats?.generationsThisMonth ?? 0} / ${data?.stats?.limit ?? 10} ${t('generaciones este mes', 'generations this month')}`}
              </p>
            </div>
            {!isPro && (
              <a href="/dashboard" className="btn-offset px-4 py-2 text-[12px] font-display">
                Upgrade →
              </a>
            )}
          </div>
        </div>

        {/* Security */}
        <div className="soft-card p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500">{t('Seguridad', 'Security')}</p>
            {!showPwdForm && (
              <button onClick={() => setShowPwdForm(true)}
                className="font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 hover:text-white transition">
                {t('Cambiar contraseña', 'Change password')}
              </button>
            )}
          </div>

          {!showPwdForm && !pwdSuccess && (
            <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)' }}>
              <span className="text-sm text-zinc-500">••••••••••••</span>
              <span className="font-mono-jb text-[9px] text-zinc-700 uppercase">{t('Protegida', 'Protected')}</span>
            </div>
          )}

          {pwdSuccess && (
            <p className="font-mono-jb text-[12px] py-2" style={{ color: '#22c55e' }}>
              ✓ {t('Contraseña actualizada. Te hemos enviado un email de confirmación.', 'Password updated. A confirmation email has been sent.')}
            </p>
          )}

          {showPwdForm && !pwdSuccess && (
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-1.5">
                  {t('Contraseña actual', 'Current password')}
                </label>
                <PasswordInput required value={currentPwd} onChange={e => setCurrentPwd(e.target.value)}
                  className="py-2.5 px-3 text-sm" />
              </div>
              <div>
                <label className="block font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-1.5">
                  {t('Nueva contraseña', 'New password')}
                </label>
                <PasswordInput required value={newPwd} onChange={e => setNewPwd(e.target.value)}
                  className="py-2.5 px-3 text-sm" placeholder={t('Mínimo 8 caracteres', 'At least 8 characters')} />
              </div>
              <div>
                <label className="block font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-1.5">
                  {t('Confirmar contraseña', 'Confirm password')}
                </label>
                <PasswordInput required value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
                  className="py-2.5 px-3 text-sm" />
              </div>
              {pwdError && (
                <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(232,77,91,0.08)', border: '1px solid rgba(232,77,91,0.3)', color: '#f87171' }}>
                  ⚠️ {pwdError}
                </div>
              )}
              <div className="flex gap-3">
                <button type="submit" disabled={pwdLoading}
                  className="btn-offset px-5 py-2.5 text-[12px] font-display disabled:opacity-50 flex items-center gap-2">
                  {pwdLoading
                    ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full spin-r" />{t('Guardando...', 'Saving...')}</>
                    : t('Guardar contraseña', 'Save password')}
                </button>
                <button type="button" onClick={() => { setShowPwdForm(false); setPwdError(''); setCurrentPwd(''); setNewPwd(''); setConfirmPwd(''); }}
                  className="px-4 py-2.5 font-mono-jb text-[11px] text-zinc-500 hover:text-white transition">
                  {t('Cancelar', 'Cancel')}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Danger zone */}
        <div className="soft-card p-6" style={{ borderColor: 'rgba(239,68,68,0.2)' }}>
          <p className="font-mono-jb text-[10px] tracking-wider uppercase mb-4" style={{ color: '#ef4444' }}>{t('Zona peligrosa', 'Danger zone')}</p>
          <button onClick={() => signOut({ callbackUrl: '/' })}
            className="font-mono-jb text-[12px] text-zinc-500 hover:text-white transition">
            {t('Cerrar sesión en todos los dispositivos', 'Sign out of all devices')}
          </button>
        </div>

        {/* Footer links */}
        <div className="flex justify-center gap-6 font-mono-jb text-xs text-zinc-700 pt-2">
          <a href="/terms" className="hover:text-zinc-400 transition">{t('Términos', 'Terms')}</a>
          <a href="/privacy" className="hover:text-zinc-400 transition">{t('Privacidad', 'Privacy')}</a>
          <a href="/legal" className="hover:text-zinc-400 transition">{t('Aviso Legal', 'Legal Notice')}</a>
        </div>

      </main>
    </div>
  );
}
