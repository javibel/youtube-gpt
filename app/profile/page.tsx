'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useLang, useSetLang } from '@/components/LangProvider';
import { useProfileSettings } from '@/lib/use-profile-settings';
import { usePasswordChange } from '@/lib/use-password-change';
import { passwordInputError } from '@/lib/password-change-client';
import type { PasswordReceipt } from '@/lib/password-change-client';
import { useSubscriptionDowngrade } from '@/lib/use-subscription-downgrade';
import { useSubscriptionCancellation } from '@/lib/use-subscription-cancellation';
import { useProfileCheckout } from '@/lib/use-profile-checkout';
import type { CheckoutPlan } from '@/lib/profile-checkout-client';
import { claimConfirmedProfileLanguage } from '@/lib/profile-update-client';
import type { ProfileData } from '@/lib/profile-read-client';
import DashboardShell from '@/components/DashboardShell';
import PasswordInput from '@/components/PasswordInput';
import { CrossIcon, CheckIcon, WarningIcon } from '@/components/icons';

type Lang = 'es' | 'en';

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const scope = JSON.stringify([session?.user?.id, session?.user?.email, status]);
  const invocation = useMemo(() => ({}), [scope]);
  const current = useRef(invocation);
  current.current = invocation;
  return <ProfileAccount key={scope} isCurrent={() => current.current === invocation} />;
}

function ProfileAccount({ isCurrent }: { isCurrent: () => boolean }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const lang = useLang();
  const applyLang = useSetLang();
  const owner = { userId: session?.user?.id ?? '', email: session?.user?.email ?? '' };
  const profile = useProfileSettings(owner, status, lang, isCurrent);
  const [dataStore, setData] = useState<ProfileData | null>(null);
  const data = profile.canObserve() && dataStore?.user.id === owner.userId && dataStore.user.email === owner.email ? dataStore : null;
  const loading = profile.loading && !data;
  const [nameInput, setNameInput] = useState('');
  const [editingName, setEditingName] = useState(false);
  const savingName = profile.updating || profile.pending;
  const nameSaved = profile.confirmedCurrent && profile.outcome?.status === 'confirmed' && profile.outcome.receipt.operation === 'name';
  const [langApplyError, setLangApplyError] = useState(false);
  const ui = useMemo(() => ({}), [owner.userId, owner.email, status, lang, nameInput, editingName, profile.read]);
  const currentUI = useRef(ui);
  currentUI.current = ui;
  const canUseUI = () => currentUI.current === ui && profile.canObserve();
  const [showPwdForm, setShowPwdForm] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdReceipt, setPwdReceipt] = useState<PasswordReceipt | null>(null);
  const pwdDraft = useMemo(() => ({}), [currentPwd, newPwd, confirmPwd, showPwdForm]);
  const password = usePasswordChange(owner, status, lang, pwdDraft, isCurrent);
  const pwdUI = useMemo(() => ({}), [pwdDraft, owner.userId, owner.email, status, lang]);
  const currentPwdUI = useRef(pwdUI);
  currentPwdUI.current = pwdUI;
  const canUsePwdUI = () => currentPwdUI.current === pwdUI && password.canObserve();
  const pwdLoading = password.waiting;
  const pwdSuccess = password.canObserve() && !!pwdReceipt;
  const checkoutPlan = data ? data.stats.plan === 'free' ? 'monthly' : data.stats.plan === 'pro' && !data.subscription?.cancelAtPeriodEnd ? 'business_monthly' : null : null;
  const checkout = useProfileCheckout(owner, status, lang, checkoutPlan, isCurrent);
  const upgrading = checkout.waiting;
  const sub = data?.subscription;
  const cancellation = useSubscriptionCancellation(owner,status,lang,sub && (sub.plan==='pro'||sub.plan==='business') ? {subscriptionId:sub.id??'',plan:sub.plan,status:sub.status,cancelAtPeriodEnd:sub.cancelAtPeriodEnd}:null,isCurrent,()=>{});
  const cancelling = cancellation.waiting;
  const downgrade = useSubscriptionDowngrade(owner,status,lang,sub && (sub.plan==='pro'||sub.plan==='business') ? {subscriptionId:sub.id??'',plan:sub.plan,status:sub.status,cancelAtPeriodEnd:sub.cancelAtPeriodEnd}:null,isCurrent,()=>{});
  const downgrading = downgrade.waiting;

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    if (profile.data && profile.canObserve()) {
      setData(profile.data);
      if (!editingName) setNameInput(profile.data.user.name ?? '');
    }
  }, [profile.data, editingName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!profile.canObserve() || !profile.confirmedCurrent || profile.outcome?.status !== 'confirmed'
        || profile.outcome.receipt.operation !== 'language' || !profile.attempt || !profile.read) return;
    const next = claimConfirmedProfileLanguage(profile.attempt, profile.read);
    if (!next) return;
    try { applyLang(next); setLangApplyError(false); }
    catch { setLangApplyError(true); }
  }, [profile.outcome, profile.confirmedCurrent, profile.attempt, applyLang]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = (es: string, en: string) => lang === 'en' ? en : es;

  function editPassword(field: 'current' | 'new' | 'confirm', value: string) {
    if (!canUsePwdUI()) return;
    (field === 'current' ? setCurrentPwd : field === 'new' ? setNewPwd : setConfirmPwd)(value);
    setPwdError(''); setPwdReceipt(null);
  }
  function passwordConfirmed(receipt: PasswordReceipt, clearDraft: boolean) {
    if (!canUsePwdUI()) return;
    setPwdReceipt(receipt); setPwdError('');
    if (clearDraft) { setCurrentPwd(''); setNewPwd(''); setConfirmPwd(''); setShowPwdForm(false); }
  }
  function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!canUsePwdUI() || !password.canStart) return;
    setPwdError(''); setPwdReceipt(null);
    const error = passwordInputError(currentPwd, newPwd, confirmPwd, lang);
    if (error) { setPwdError(error); return; }
    password.start({ currentPassword: currentPwd, newPassword: newPwd, lang }, receipt => passwordConfirmed(receipt, true));
  }
  function observePassword() {
    if (!canUsePwdUI()) return;
    password.observe(receipt => passwordConfirmed(receipt, false));
  }

  function handleUpgrade(plan: CheckoutPlan) { checkout.start(plan); }

  function handleDowngrade() { if(!upgrading&&!cancelling)void downgrade.start(); }

  function handleCancel() { if(!upgrading&&!downgrading)void cancellation.start(); }

  function handleLangChange(next: Lang) {
    if (!canUseUI() || !profile.canAct() || !profile.data) return;
    profile.start({ operation: 'language', previousLang: profile.data.user.lang, lang: next });
  }

  function handleSaveName() {
    if (!canUseUI() || !profile.canAct() || !profile.data) return;
    profile.start({ operation: 'name', previousName: profile.data.user.name, name: nameInput.trim() });
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
  const cancellationScheduled = !!data?.subscription?.cancelAtPeriodEnd || cancellation.confirmed;

  return (
    <DashboardShell>

      <main className="yv-page space-y-6">
        {profile.readError && <p role="alert">{t('No se pudo leer tu perfil. Puedes volver a consultarlo cuando termine la lectura original.', 'Could not read your profile. You can refresh when the original read finishes.')}</p>}
        {profile.updating && <p role="status">{t('Confirmando el cambio del perfil...', 'Confirming profile change...')}</p>}
        {(profile.outcome?.status === 'unconfirmed' || (profile.blocked && !profile.updating && profile.outcome?.status !== 'confirmed')) && <p role="alert">{t('Cambio del perfil sin confirmar. No se reenviará automáticamente.', 'Profile change unconfirmed. It will not be sent again automatically.')} {profile.pending && t('La solicitud original sigue pendiente.', 'The original request is still pending.')}</p>}
        {profile.outcome?.status === 'rejected' && <p role="alert">{t('Cambio rechazado antes de aplicarse. Consulta el perfil antes de elegir otro cambio.', 'Change rejected before applying. Read the profile before choosing another change.')}</p>}
        {profile.outcome?.status === 'confirmed' && !profile.confirmedCurrent && <p role="status">{t('Acuse recibido, pero el perfil actual no está confirmado.', 'Acknowledgement received, but the current profile is unconfirmed.')}</p>}
        {profile.confirmedCurrent && profile.outcome?.status === 'confirmed' && profile.outcome.receipt.operation === 'language' && <p role="status">{t('Idioma actualizado', 'Language updated')}</p>}
        {profile.outcome?.status === 'confirmed' && profile.blocked && <p role="alert">{t('Cambio confirmado. No se puede iniciar otro cambio porque el registro local no se pudo liberar.', 'Change confirmed. Another change cannot start because the local record could not be cleared.')}</p>}
        {langApplyError && <p role="alert">{t('El idioma está guardado, pero no se pudo aplicar a esta pantalla.', 'Language is saved, but could not be applied to this screen.')}</p>}
        <button onClick={() => { if (canUseUI()) profile.refresh(); }} disabled={!profile.canObserve() || profile.blocked || profile.readPending} className="font-mono-jb text-[13px] disabled:opacity-50">{t('Actualizar perfil', 'Refresh profile')}</button>

        {cancellation.blocked && <div role={cancellation.confirmed?'status':'alert'} className="yv-card p-4">
          <p>{cancellation.confirmed ? t('Cancelación confirmada al final del periodo. Tu acceso continúa hasta entonces.','Cancellation confirmed at period end. Access continues until then.') : t('Cancelación sin confirmar. No se reenviará automáticamente.','Cancellation unconfirmed. It will not be sent again automatically.')}</p>
          {cancellation.pending && <p>{t('La solicitud original sigue pendiente.','The original request is still pending.')}</p>}
          {cancellation.hasOriginal ? <><p>{!cancellation.selectionMatches && t('El original pertenece a otra suscripción o idioma. Selecciona el original para consultarlo.','The original belongs to another subscription or language. Select the original to observe it.')}</p><button onClick={()=>{if(!upgrading&&!downgrading)void cancellation.observe();}} disabled={!cancellation.canObserve||upgrading||downgrading}>{t('Consultar cancelación original','Observe original cancellation')}</button></> : <p>{t('La solicitud original no está disponible. Este registro no permite recuperarla ni iniciar otra.','The original request is unavailable. This record cannot restore it or start another.')}</p>}
        </div>}

        {downgrade.blocked && <div role={downgrade.confirmed||downgrade.waiting?'status':'alert'} className="yv-card p-4">
          <p>{downgrade.confirmed ? t('Cambio a Pro confirmado.','Downgrade to Pro confirmed.') : downgrade.waiting ? t('Confirmando el cambio a Pro...','Confirming downgrade to Pro...') : t('Cambio a Pro sin confirmar. No se reenviará automáticamente.','Downgrade to Pro unconfirmed. It will not be sent again automatically.')}</p>
          {downgrade.pending && <p>{t('La solicitud original sigue pendiente.','The original request is still pending.')}</p>}
          {downgrade.hasOriginal ? <><p>{!downgrade.selectionMatches && t('El original pertenece a otra suscripción o idioma. Selecciona el original para consultarlo.','The original belongs to another subscription or language. Select the original to observe it.')}</p><button onClick={()=>{if(!upgrading&&!cancelling)void downgrade.observe();}} disabled={!downgrade.canObserve||upgrading||cancelling}>{t('Consultar cambio a Pro original','Observe original downgrade')}</button></> : <p>{t('La solicitud original no está disponible. Este registro no permite recuperarla ni iniciar otra.','The original request is unavailable. This record cannot restore it or start another.')}</p>}
        </div>}

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
                  maxLength={100}
                  onChange={e => { if (canUseUI()) setNameInput(e.target.value); }}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape' && canUseUI()) setEditingName(false); }}
                  className="yv-input flex-1 py-2.5 px-3 text-sm"
                  style={{ borderRadius: '10px' }}
                />
                <button onClick={handleSaveName} disabled={!profile.canAct() || !nameInput.trim() || nameInput.trim().length > 100 || nameInput.trim() === profile.data?.user.name}
                  className="btn-offset px-4 py-2.5 text-[13px] font-display disabled:opacity-50">
                  {savingName ? '...' : t('Guardar', 'Save')}
                </button>
                <button onClick={() => { if (canUseUI()) setEditingName(false); }} className="px-3 hover:text-white transition font-mono-jb text-sm" style={{ color: 'var(--yv-text-3)' }}><CrossIcon size={14} /></button>
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)' }}>
                <span className="text-sm" style={{ color: 'var(--yv-text-2)' }}>{data?.user?.name || <span style={{ color: 'var(--yv-text-4)' }}>{t('Sin nombre', 'No name set')}</span>}</span>
                <button onClick={() => { if (canUseUI() && profile.canAct()) { setNameInput(profile.data?.user.name ?? ''); setEditingName(true); } }} disabled={!profile.canAct()}
                  className="font-mono-jb text-[13px] tracking-wider uppercase hover:text-white transition" style={{ color: 'var(--yv-text-3)' }}>
                  {t('Editar', 'Edit')}
                </button>
              </div>
            )}
            {nameSaved && (
              <p className="font-mono-jb text-[13px] inline-flex items-center gap-1.5" style={{ color: '#22c55e' }}><CheckIcon size={13} /> {t('Nombre actualizado', 'Name updated')}</p>
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
                disabled={!profile.canAct() || profile.data?.user.lang === l}
                className="flex-1 py-3 rounded-xl font-display font-bold text-sm transition"
                style={{
                  background: profile.data?.user.lang === l ? 'var(--yv-brand)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${profile.data?.user.lang === l ? 'var(--yv-brand)' : 'var(--line)'}`,
                  color: profile.data?.user.lang === l ? '#fff' : '#71717a',
                  boxShadow: profile.data?.user.lang === l ? '0 6px 20px -8px rgba(232,77,91,0.6)' : 'none',
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
              <p className="font-display font-bold text-lg text-white flex items-center gap-2">
                {planLabel}
                {data?.subscription?.status === 'trialing' && (
                  <span className="font-mono-jb text-[11px] tracking-wider uppercase px-1.5 py-0.5 rounded" style={{ background: 'var(--yv-brand)', color: 'white' }}>
                    {t('PRUEBA', 'TRIAL')}
                  </span>
                )}
              </p>
              <p className="font-mono-jb text-[13px] mt-1" style={{ color: 'var(--yv-text-3)' }}>
                {isPro
                  ? (cancellationScheduled
                      ? t('Cancela el ', 'Cancels on ') + (data?.subscription?.currentPeriodEnd ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString(dateLocale, { day: '2-digit', month: 'long', year: 'numeric' }) : '—')
                      : data?.subscription?.status === 'trialing'
                      ? t('Tu prueba termina el ', 'Your trial ends on ') + (data?.subscription?.currentPeriodEnd ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString(dateLocale, { day: '2-digit', month: 'long', year: 'numeric' }) : '—')
                      : t('Renovación el ', 'Renews on ') + (data?.subscription?.currentPeriodEnd ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString(dateLocale, { day: '2-digit', month: 'long', year: 'numeric' }) : '—'))
                  : `${data?.stats?.generationsThisMonth ?? 0} / ${data?.stats?.limit ?? 10} ${t('generaciones este mes', 'generations this month')}`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {!isPro && (
                <button onClick={() => handleUpgrade('monthly')} disabled={!checkout.canStart}
                  className="btn-offset px-4 py-2 text-[13px] font-display disabled:opacity-50">
                  {upgrading ? '...' : 'Upgrade →'}
                </button>
              )}
              {isPro && !isBusiness && !cancellationScheduled && (
                <button onClick={() => handleUpgrade('business_monthly')} disabled={!checkout.canStart}
                  className="font-mono-jb text-[13px] transition" style={{ color: '#00E5FF' }}>
                  {upgrading ? '...' : t('Subir a Business', 'Upgrade to Business')}
                </button>
              )}
              {isBusiness && !cancellationScheduled && (
                <button onClick={handleDowngrade} disabled={downgrading || upgrading || cancelling || !downgrade.canStart}
                  className="font-mono-jb text-[13px] transition" style={{ color: 'var(--yv-text-3)' }}>
                  {downgrading ? '...' : t('Bajar a Pro', 'Downgrade to Pro')}
                </button>
              )}
              {isPro && !cancellationScheduled && (
                <button onClick={handleCancel} disabled={cancelling || upgrading || downgrading || !cancellation.canStart}
                  className="font-mono-jb text-[13px] hover:text-white transition" style={{ color: 'var(--yv-text-4)' }}>
                  {cancelling ? t('Cancelando...', 'Cancelling...') : t('Cancelar suscripción', 'Cancel subscription')}
                </button>
              )}
            </div>
          </div>
          {checkout.waiting && <p role="status">{t('Consultando la sesión de pago original...', 'Checking the original checkout session...')}</p>}
          {checkout.blocked && !checkout.waiting && checkout.outcome?.status !== 'confirmed' && <p role="alert">{t('Sesión de pago sin confirmar. No vuelvas a enviarla.', 'Checkout session unconfirmed. Do not send it again.')} {checkout.pending && t('La solicitud original sigue pendiente.', 'The original request is still pending.')}</p>}
          {checkout.outcome?.status === 'confirmed' && <p role="status">{t('Sesión de prueba confirmada. No acredita un pago ni un cambio de plan.', 'Test session confirmed. It does not confirm payment or a plan change.')}</p>}
          {checkout.retained && !checkout.selectionMatches && <p role="alert">{t('La solicitud original corresponde a otro plan o idioma. No se abrirá automáticamente.', 'The original request belongs to another plan or language. It will not open automatically.')}</p>}
          {checkout.navigationFailed && <p role="alert">{t('No se pudo abrir la sesión confirmada. Puedes consultar la misma solicitud original.', 'Could not open the confirmed session. You can observe the same original request.')}</p>}
          {checkout.retained && <button onClick={checkout.observe} disabled={!checkout.canObserve} className="font-mono-jb text-[13px] disabled:opacity-50">{t('Consultar sesión de pago original', 'Observe original checkout session')}</button>}
        </div>

        {/* Security */}
        <div className="yv-card">
          <div className="flex items-center justify-between mb-4">
            <p className="font-mono-jb text-[13px] tracking-wider uppercase" style={{ color: 'var(--yv-text-3)' }}>{t('Seguridad', 'Security')}</p>
            {!showPwdForm && (
              <button onClick={() => { if (!canUsePwdUI()) return; setShowPwdForm(true); setPwdReceipt(null); setPwdError(''); }}
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
            <p role="status" className="font-mono-jb text-[13px] py-2 inline-flex items-start gap-1.5" style={{ color: '#22c55e' }}>
              <CheckIcon size={13} className="mt-0.5 shrink-0" /> {t('Contraseña actualizada.', 'Password updated.')}
              {pwdReceipt?.notification === 'acknowledged'
                ? t('El proveedor ha aceptado el aviso; su entrega no está confirmada.', 'The provider accepted the notice; delivery is not confirmed.')
                : pwdReceipt?.notification === 'unconfirmed'
                  ? t('El envío del aviso está sin confirmar. No se reenviará automáticamente.', 'The notice send is unconfirmed. It will not be sent again automatically.')
                  : t('El aviso no se ha enviado.', 'The notice was not sent.')}
            </p>
          )}

          {pwdLoading && <p role="status">{t('Confirmando el cambio de contraseña...', 'Confirming password change...')}</p>}
          {!pwdLoading && password.blocked && !pwdSuccess && <p role="alert">
            {t('Cambio de contraseña sin confirmar. No vuelvas a enviarlo.', 'Password change unconfirmed. Do not send it again.')}
            {password.pending && t('La solicitud original sigue pendiente.', 'The original request is still pending.')}
          </p>}
          {pwdSuccess && password.blocked && <p role="alert">{t('Cambio confirmado, pero no se pudo liberar el registro local. Otro cambio está bloqueado.', 'Change confirmed, but the local record could not be released. Another change is blocked.')}</p>}
          {password.outcome?.status === 'rejected' && <p role="alert">
            {password.outcome.error === 'wrong_current' ? t('La contraseña actual no es correcta', 'Current password is incorrect')
              : password.outcome.error === 'passwordless' ? t('No se puede cambiar la contraseña de esta cuenta', 'Cannot change password for this account')
                : password.outcome.error === 'changed' ? t('La contraseña cambió durante la solicitud. Revisa la contraseña actual antes de iniciar otro cambio.', 'The password changed during the request. Review the current password before starting another change.')
                  : password.outcome.error === 'unauthorized' ? t('No autorizado. Comprueba tu sesión.', 'Unauthorized. Check your session.')
                    : t('Solicitud de contraseña rechazada antes de aplicarse.', 'Password request rejected before applying.')}
          </p>}
          {password.retained && !pwdSuccess && <button type="button" onClick={observePassword} disabled={pwdLoading}
            className="font-mono-jb text-[13px] py-2 disabled:opacity-50">
            {t('Consultar solicitud original', 'Observe original request')}
          </button>}
          {showPwdForm && (
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block font-mono-jb text-[13px] tracking-wider uppercase mb-1.5 yv-muted">
                  {t('Contraseña actual', 'Current password')}
                </label>
                <PasswordInput required value={currentPwd} onChange={e => editPassword('current', e.target.value)}
                  className="py-2.5 px-3 text-sm" />
              </div>
              <div>
                <label className="block font-mono-jb text-[13px] tracking-wider uppercase mb-1.5 yv-muted">
                  {t('Nueva contraseña', 'New password')}
                </label>
                <PasswordInput required value={newPwd} onChange={e => editPassword('new', e.target.value)}
                  className="py-2.5 px-3 text-sm" placeholder={t('Mínimo 8 caracteres', 'At least 8 characters')} />
              </div>
              <div>
                <label className="block font-mono-jb text-[13px] tracking-wider uppercase mb-1.5 yv-muted">
                  {t('Confirmar contraseña', 'Confirm password')}
                </label>
                <PasswordInput required value={confirmPwd} onChange={e => editPassword('confirm', e.target.value)}
                  className="py-2.5 px-3 text-sm" />
              </div>
              {pwdError && (
                <div role="alert" className="rounded-xl px-4 py-3 text-sm inline-flex items-center gap-1.5" style={{ background: 'var(--yv-brand-soft)', border: '1px solid var(--yv-brand-border)', color: '#f87171' }}>
                  <WarningIcon size={14} /> {pwdError}
                </div>
              )}
              <div className="flex gap-3">
                <button type="submit" disabled={!password.canStart || pwdLoading}
                  className="btn-offset px-5 py-2.5 text-[13px] font-display disabled:opacity-50 flex items-center gap-2">
                  {pwdLoading
                    ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full spin-r" />{t('Guardando...', 'Saving...')}</>
                    : t('Guardar contraseña', 'Save password')}
                </button>
                <button type="button" onClick={() => { if (!canUsePwdUI()) return; setShowPwdForm(false); setPwdError(''); setPwdReceipt(null); setCurrentPwd(''); setNewPwd(''); setConfirmPwd(''); }}
                  className="px-4 py-2.5 font-mono-jb text-[13px] hover:text-white transition" style={{ color: 'var(--yv-text-3)' }}>
                  {t('Cerrar formulario', 'Close form')}
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
