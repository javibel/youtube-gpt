'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { setLangClient } from '@/lib/get-lang-client';
import { useLang } from '@/components/LangProvider';
import DashboardShell from '@/components/DashboardShell';
import PasswordInput from '@/components/PasswordInput';
import { toast } from '@/components/Toaster';

type Lang = 'es' | 'en';

type UserData = {
  user: { email: string; name: string | null; createdAt: string };
  stats: { isPro: boolean; plan: 'free' | 'pro' | 'business'; totalGenerations: number; generationsThisMonth: number; limit: number };
  subscription: { status: string; cancelAtPeriodEnd: boolean; currentPeriodEnd: string | null } | null;
};

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const serverLang = useLang();
  const [lang, setLang] = useState<Lang>(serverLang);
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
  const [upgrading, setUpgrading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [downgrading, setDowngrading] = useState(false);

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
    if (newPwd.length < 8 || !/[a-zA-Z]/.test(newPwd) || !/[0-9]/.test(newPwd)) {
      setPwdError(t(
        'Mínimo 8 caracteres, con al menos 1 letra y 1 número',
        'At least 8 characters, with at least 1 letter and 1 number'
      ));
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

  async function handleUpgrade(plan: 'monthly' | 'yearly' | 'business_monthly' | 'business_yearly') {
    setUpgrading(true);
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan, lang }) });
      const d = await res.json();
      if (d.error) { toast(d.error, 'error'); return; }
      if (!d.url) { toast(t('No se pudo iniciar el pago. Inténtalo de nuevo.', 'Could not start payment. Please try again.'), 'error'); return; }
      window.location.href = d.url;
    } catch { toast(t('Error de conexión. Inténtalo de nuevo.', 'Connection error. Please try again.'), 'error'); }
    finally { setUpgrading(false); }
  }

  async function handleDowngrade() {
    if (!confirm(t('¿Bajar de Business a Pro? El cambio se aplica ahora, con prorrateo en tu próxima factura.', 'Downgrade from Business to Pro? This applies now, prorated on your next invoice.'))) return;
    setDowngrading(true);
    try {
      const res = await fetch('/api/stripe/downgrade', { method: 'POST' });
      if (res.ok) {
        setData(prev => prev ? { ...prev, stats: { ...prev.stats, plan: 'pro' } } : null);
        toast(t('Has bajado a Pro', 'You are now on Pro'), 'success');
      } else {
        const { error } = await res.json();
        toast(error ?? t('Error al cambiar de plan', 'Error changing plan'), 'error');
      }
    } finally { setDowngrading(false); }
  }

  async function handleCancel() {
    if (!confirm(t('¿Seguro que quieres cancelar tu suscripción?', 'Are you sure you want to cancel your subscription?'))) return;
    setCancelling(true);
    try {
      const res = await fetch('/api/stripe/cancel', { method: 'POST' });
      if (res.ok) {
        setData(prev => prev ? { ...prev, subscription: prev.subscription ? { ...prev.subscription, cancelAtPeriodEnd: true } : null } : null);
      } else {
        const { error } = await res.json();
        toast(error ?? t('Error al cancelar', 'Cancellation error'), 'error');
      }
    } finally { setCancelling(false); }
  }

  function handleLangChange(next: Lang) {
    setLang(next);
    setLangClient(next);
    // Persist to DB so server-side emails use the correct language
    fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: next }),
    }).catch(() => {});
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--yv-bg-1)' }}>
        <div className="w-8 h-8 rounded-full border-2 border-transparent spin-r" style={{ borderTopColor: 'var(--yv-brand)' }} />
      </div>
    );
  }

  if (!session) return null;

  const isPro = data?.stats?.isPro ?? false;
  const plan = data?.stats?.plan ?? 'free';
  const isBusiness = plan === 'business';
  const planLabel = isBusiness ? 'Business' : isPro ? 'Pro' : 'Free';
  const displayName = data?.user?.name ?? session.user?.email ?? '';
  const initials = displayName.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
  const dateLocale = lang === 'en' ? 'en-US' : 'es-ES';

  return (
    <DashboardShell>

      <main className="yv-page space-y-6">

        {/* Page title */}
        <div className="yv-page-header">
          <div className="yv-page-header__left">
            <span className="yv-page-header__eyebrow">{t('AJUSTES', 'SETTINGS')}</span>
            <h1 className="yv-page-header__title">{t('Mi perfil', 'My profile')}</h1>
          </div>
        </div>

        {/* Avatar + name */}
        <div className="yv-card">
          <p className="font-mono-jb text-[13px] tracking-wider uppercase mb-5" style={{ color: 'var(--yv-text-3)' }}>{t('Información personal', 'Personal information')}</p>
          <div className="flex items-center gap-5 mb-6">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center font-display font-bold text-2xl flex-shrink-0"
              style={{ background: 'var(--yv-brand)', color: '#fff', boxShadow: '0 8px 24px -8px rgba(232,77,91,0.6)' }}>
              {initials}
            </div>
            <div>
              <p className="font-display font-bold text-xl text-white">{displayName}</p>
              <p className="font-mono-jb text-[13px] mt-0.5" style={{ color: 'var(--yv-text-3)' }}>{data?.user?.email}</p>
              {isPro && <span className="red-tape text-[13px] mt-1 inline-block">PRO</span>}
            </div>
          </div>

          {/* Name field */}
          <div className="space-y-2">
            <label className="block font-mono-jb text-[13px] tracking-wider uppercase" style={{ color: 'var(--yv-text-3)' }}>{t('Nombre', 'Name')}</label>
            {editingName ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
                  className="yv-input flex-1 py-2.5 px-3 text-sm"
                  style={{ borderRadius: '10px' }}
                />
                <button onClick={handleSaveName} disabled={savingName || !nameInput.trim()}
                  className="btn-offset px-4 py-2.5 text-[13px] font-display disabled:opacity-50">
                  {savingName ? '...' : t('Guardar', 'Save')}
                </button>
                <button onClick={() => setEditingName(false)} className="px-3 hover:text-white transition font-mono-jb text-sm" style={{ color: 'var(--yv-text-3)' }}>✕</button>
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)' }}>
                <span className="text-sm" style={{ color: 'var(--yv-text-2)' }}>{data?.user?.name || <span style={{ color: 'var(--yv-text-4)' }}>{t('Sin nombre', 'No name set')}</span>}</span>
                <button onClick={() => { setNameInput(data?.user?.name ?? ''); setEditingName(true); }}
                  className="font-mono-jb text-[13px] tracking-wider uppercase hover:text-white transition" style={{ color: 'var(--yv-text-3)' }}>
                  {t('Editar', 'Edit')}
                </button>
              </div>
            )}
            {nameSaved && (
              <p className="font-mono-jb text-[13px]" style={{ color: '#22c55e' }}>✓ {t('Nombre actualizado', 'Name updated')}</p>
            )}
          </div>

          {/* Email (read-only) */}
          <div className="mt-4 space-y-2">
            <label className="block font-mono-jb text-[13px] tracking-wider uppercase" style={{ color: 'var(--yv-text-3)' }}>Email</label>
            <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)' }}>
              <span className="text-sm" style={{ color: 'var(--yv-text-3)' }}>{data?.user?.email}</span>
              <span className="font-mono-jb text-[13px] uppercase" style={{ color: 'var(--yv-text-4)' }}>{t('No editable', 'Read only')}</span>
            </div>
          </div>
        </div>

        {/* Language */}
        <div className="yv-card">
          <p className="font-mono-jb text-[13px] tracking-wider uppercase mb-4" style={{ color: 'var(--yv-text-3)' }}>{t('Idioma', 'Language')}</p>
          <div className="flex gap-3">
            {(['es', 'en'] as Lang[]).map(l => (
              <button
                key={l}
                onClick={() => handleLangChange(l)}
                className="flex-1 py-3 rounded-xl font-display font-bold text-sm transition"
                style={{
                  background: lang === l ? 'var(--yv-brand)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${lang === l ? 'var(--yv-brand)' : 'var(--line)'}`,
                  color: lang === l ? '#fff' : '#71717a',
                  boxShadow: lang === l ? '0 6px 20px -8px rgba(232,77,91,0.6)' : 'none',
                }}
              >
                {l === 'es' ? 'Español' : 'English'}
              </button>
            ))}
          </div>
          <p className="font-mono-jb text-[13px] mt-3" style={{ color: 'var(--yv-text-4)' }}>
            {t('El idioma se aplica a toda la aplicación.', 'Language applies across the entire app.')}
          </p>
        </div>

        {/* Plan — 2026-07-04 (audit E3): was showing "Pro" for Business users (isPro
            covers both) and only linked to /dashboard instead of letting you act here. */}
        <div className="yv-card">
          <p className="font-mono-jb text-[13px] tracking-wider uppercase mb-4" style={{ color: 'var(--yv-text-3)' }}>{t('Plan', 'Plan')}</p>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="font-display font-bold text-lg text-white">{planLabel}</p>
              <p className="font-mono-jb text-[13px] mt-1" style={{ color: 'var(--yv-text-3)' }}>
                {isPro
                  ? (data?.subscription?.cancelAtPeriodEnd
                      ? t('Cancela el ', 'Cancels on ') + (data.subscription.currentPeriodEnd ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString(dateLocale, { day: '2-digit', month: 'long', year: 'numeric' }) : '—')
                      : t('Renovación el ', 'Renews on ') + (data?.subscription?.currentPeriodEnd ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString(dateLocale, { day: '2-digit', month: 'long', year: 'numeric' }) : '—'))
                  : `${data?.stats?.generationsThisMonth ?? 0} / ${data?.stats?.limit ?? 10} ${t('generaciones este mes', 'generations this month')}`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {!isPro && (
                <button onClick={() => handleUpgrade('monthly')} disabled={upgrading}
                  className="btn-offset px-4 py-2 text-[13px] font-display disabled:opacity-50">
                  {upgrading ? '...' : 'Upgrade →'}
                </button>
              )}
              {isPro && !isBusiness && !data?.subscription?.cancelAtPeriodEnd && (
                <button onClick={() => handleUpgrade('business_monthly')} disabled={upgrading}
                  className="font-mono-jb text-[13px] transition" style={{ color: '#00E5FF' }}>
                  {upgrading ? '...' : t('Subir a Business', 'Upgrade to Business')}
                </button>
              )}
              {isBusiness && !data?.subscription?.cancelAtPeriodEnd && (
                <button onClick={handleDowngrade} disabled={downgrading}
                  className="font-mono-jb text-[13px] transition" style={{ color: 'var(--yv-text-3)' }}>
                  {downgrading ? '...' : t('Bajar a Pro', 'Downgrade to Pro')}
                </button>
              )}
              {isPro && !data?.subscription?.cancelAtPeriodEnd && (
                <button onClick={handleCancel} disabled={cancelling}
                  className="font-mono-jb text-[13px] hover:text-white transition" style={{ color: 'var(--yv-text-4)' }}>
                  {cancelling ? t('Cancelando...', 'Cancelling...') : t('Cancelar suscripción', 'Cancel subscription')}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="yv-card">
          <div className="flex items-center justify-between mb-4">
            <p className="font-mono-jb text-[13px] tracking-wider uppercase" style={{ color: 'var(--yv-text-3)' }}>{t('Seguridad', 'Security')}</p>
            {!showPwdForm && (
              <button onClick={() => setShowPwdForm(true)}
                className="font-mono-jb text-[13px] tracking-wider uppercase hover:text-white transition" style={{ color: 'var(--yv-text-3)' }}>
                {t('Cambiar contraseña', 'Change password')}
              </button>
            )}
          </div>

          {!showPwdForm && !pwdSuccess && (
            <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)' }}>
              <span className="text-sm" style={{ color: 'var(--yv-text-3)' }}>••••••••••••</span>
              <span className="font-mono-jb text-[13px] uppercase" style={{ color: 'var(--yv-text-4)' }}>{t('Protegida', 'Protected')}</span>
            </div>
          )}

          {pwdSuccess && (
            <p className="font-mono-jb text-[13px] py-2" style={{ color: '#22c55e' }}>
              ✓ {t('Contraseña actualizada. Te hemos enviado un email de confirmación.', 'Password updated. A confirmation email has been sent.')}
            </p>
          )}

          {showPwdForm && !pwdSuccess && (
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block font-mono-jb text-[13px] tracking-wider uppercase mb-1.5 yv-muted">
                  {t('Contraseña actual', 'Current password')}
                </label>
                <PasswordInput required value={currentPwd} onChange={e => setCurrentPwd(e.target.value)}
                  className="py-2.5 px-3 text-sm" />
              </div>
              <div>
                <label className="block font-mono-jb text-[13px] tracking-wider uppercase mb-1.5 yv-muted">
                  {t('Nueva contraseña', 'New password')}
                </label>
                <PasswordInput required value={newPwd} onChange={e => setNewPwd(e.target.value)}
                  className="py-2.5 px-3 text-sm" placeholder={t('Mínimo 8 caracteres', 'At least 8 characters')} />
              </div>
              <div>
                <label className="block font-mono-jb text-[13px] tracking-wider uppercase mb-1.5 yv-muted">
                  {t('Confirmar contraseña', 'Confirm password')}
                </label>
                <PasswordInput required value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
                  className="py-2.5 px-3 text-sm" />
              </div>
              {pwdError && (
                <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--yv-brand-soft)', border: '1px solid var(--yv-brand-border)', color: '#f87171' }}>
                  ⚠️ {pwdError}
                </div>
              )}
              <div className="flex gap-3">
                <button type="submit" disabled={pwdLoading}
                  className="btn-offset px-5 py-2.5 text-[13px] font-display disabled:opacity-50 flex items-center gap-2">
                  {pwdLoading
                    ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full spin-r" />{t('Guardando...', 'Saving...')}</>
                    : t('Guardar contraseña', 'Save password')}
                </button>
                <button type="button" onClick={() => { setShowPwdForm(false); setPwdError(''); setCurrentPwd(''); setNewPwd(''); setConfirmPwd(''); }}
                  className="px-4 py-2.5 font-mono-jb text-[13px] hover:text-white transition" style={{ color: 'var(--yv-text-3)' }}>
                  {t('Cancelar', 'Cancel')}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Danger zone */}
        <div className="yv-card" style={{ borderColor: 'rgba(239,68,68,0.2)' }}>
          <p className="font-mono-jb text-[13px] tracking-wider uppercase mb-4" style={{ color: '#ef4444' }}>{t('Zona peligrosa', 'Danger zone')}</p>
          <button onClick={() => signOut({ callbackUrl: '/' })}
            className="font-mono-jb text-[13px] hover:text-white transition" style={{ color: 'var(--yv-text-3)' }}>
            {t('Cerrar sesión en todos los dispositivos', 'Sign out of all devices')}
          </button>
        </div>

        {/* Footer links */}
        <div className="flex justify-center gap-6 font-mono-jb text-[13px] pt-2" style={{ color: 'var(--yv-text-4)' }}>
          <a href="/terms" className="hover:opacity-80 transition">{t('Términos', 'Terms')}</a>
          <a href="/privacy" className="hover:opacity-80 transition">{t('Privacidad', 'Privacy')}</a>
          <a href="/legal" className="hover:opacity-80 transition">{t('Aviso Legal', 'Legal Notice')}</a>
        </div>

      </main>
    </DashboardShell>
  );
}
