'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useSignupCommand } from '@/lib/use-signup-command';
import { useSignupChallenge } from '@/lib/use-signup-challenge';
import { signupPending } from '@/lib/signup-client';
import { useGoogleSignin } from '@/lib/use-google-signin';
import { sessionCookieWriterBusy } from '@/lib/session-cookie-writer';
import PasswordInput from '@/components/PasswordInput';
import { hasTrackingConsent } from '@/components/CookieConsent';
import { WarningIcon } from '@/components/icons';
import { AFFILIATES_DORMANT } from '@/lib/features';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function SignupForm() {
  const mounted = useRef(true);
  const selection = useRef({ name: '', email: '', password: '', confirmPassword: '', lang: 'es', refCode: '', affTyped: '', route: '' });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const searchParams = useSearchParams();
  const route = usePathname() + '?' + searchParams.toString();
  // Afiliados/referidos hibernados (ver docs/hibernacion-afiliados-referidos-2026-07-11.md):
  // forzar vacío desactiva en cascada las cookies ytv_ref/ytv_aff, el callback
  // de Google OAuth y el envío de ref/aff al signup, sin tocar cada punto por separado.
  const refCode = AFFILIATES_DORMANT ? '' : (searchParams.get('ref') || '');
  const affQueryCode = AFFILIATES_DORMANT ? '' : (searchParams.get('aff') || '');

  // Store ref in cookie so Google OAuth signIn callback can read it
  // RGPD: cookie de atribución — solo con consentimiento de tracking
  useEffect(() => {
    if (refCode && hasTrackingConsent()) {
      document.cookie = `ytv_ref=${refCode};path=/;max-age=3600;samesite=lax`;
    }
  }, [refCode]);

  // Programa de afiliados — namespace separado del ?ref= de arriba (ver
  // components/AffiliateCapture.tsx, que ya pone ytv_aff globalmente en
  // cualquier página; esto es solo el bridge de 1h para el round-trip de
  // Google OAuth si el link de afiliado apuntó directo a /signup).
  useEffect(() => {
    if (affQueryCode && hasTrackingConsent()) {
      document.cookie = `ytv_aff=${affQueryCode};path=/;max-age=3600;samesite=lax`;
    }
  }, [affQueryCode]);

  const [showAffInput, setShowAffInput] = useState(false);
  const [affTyped, setAffTyped] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [lang, setLang] = useState<'es'|'en'>('es');
  const challenge = useSignupChallenge(TURNSTILE_SITE_KEY, lang);

  useEffect(() => {
    try { const stored = localStorage.getItem('ytubviral_lang'); if (stored === 'es' || stored === 'en') setLang(stored); } catch {}
  }, []);

  if (selection.current.name !== name || selection.current.email !== email || selection.current.password !== password || selection.current.confirmPassword !== confirmPassword || selection.current.lang !== lang || selection.current.refCode !== refCode || selection.current.affTyped !== affTyped || selection.current.route !== route) selection.current = { name, email, password, confirmPassword, lang, refCode, affTyped, route };
  const rendered = selection.current;
  const googleCallback = /^[a-zA-Z0-9_-]{1,20}$/.test(refCode) ? '/dashboard?ref='+refCode : '/dashboard';
  const signup = useSignupCommand(rendered);
  const loading = signup.waiting;
  const google = useGoogleSignin(rendered, googleCallback, !signup.pending, () => mounted.current && selection.current === rendered && !signupPending());
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mounted.current || selection.current !== rendered || signupPending() || loading || sessionCookieWriterBusy()) return;
    setError('');

    if (password !== confirmPassword) {
      setError(t('Las contraseñas no coinciden', 'Passwords do not match'));
      return;
    }
    if (!name.trim() || name.trim().length > 100 || email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t('Revisa el nombre y el email del registro.', 'Check the signup name and email')); return;
    }
    if (new TextEncoder().encode(password).length > 72) {
      setError(t('La contraseña es demasiado larga.', 'The password is too long.')); return;
    }
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError(t(
        'Mínimo 8 caracteres, con al menos 1 letra y 1 número',
        'At least 8 characters, with at least 1 letter and 1 number'
      ));
      return;
    }

    if (!challenge.challenge || challenge.status !== 'ready') {
      setError(t('Completa la verificación antes de crear tu cuenta.', 'Complete the verification before creating your account.')); return;
    }

    // Attribution is resolved HERE, not at mount: LandingCapture writes these from an
    // effect, which runs after this component's render. Reading them during render lost
    // the attribution for everyone who landed straight on /signup (the whole extension
    // flow, which opens this page in a fresh tab).
    let signupReferrer = '';
    let signupLandingPage = '';
    try {
      signupLandingPage = sessionStorage.getItem('ytv_landing') || location.pathname + location.search;
      signupReferrer = sessionStorage.getItem('ytv_referrer') || '';
      if (!signupReferrer && document.referrer &&
          new URL(document.referrer).hostname !== location.hostname) {
        signupReferrer = document.referrer;
      }
    } catch {
      // sessionStorage or URL parsing unavailable — attribution is best-effort, never blocks signup
    }

    // Read first-touch UTM attribution from cookie
    let utmSource: string | undefined;
    let utmMedium: string | undefined;
    let utmCampaign: string | undefined;
    try {
      const utmCookie = document.cookie.split('; ').find(r => r.startsWith('ytv_utm='));
      if (utmCookie) {
        const parsed = JSON.parse(decodeURIComponent(utmCookie.split('=').slice(1).join('=')));
        utmSource = typeof parsed.source === 'string' ? parsed.source.slice(0, 100) : undefined;
        utmMedium = typeof parsed.medium === 'string' ? parsed.medium.slice(0, 100) : undefined;
        utmCampaign = typeof parsed.campaign === 'string' ? parsed.campaign.slice(0, 100) : undefined;
      }
    } catch {}

    // Código de afiliado — prioridad: tecleado a mano > query ?aff= > cookie ytv_aff
    // (first-touch, puesta por AffiliateCapture.tsx en cualquier página anterior).
    // Hibernado: no leer ni enviar nada — una cookie ytv_aff anterior a la
    // hibernación seguiría viva hasta 60 días (el servidor también la ignora).
    let affCookie: string | undefined;
    if (!AFFILIATES_DORMANT) {
      try {
        const c = document.cookie.split('; ').find(r => r.startsWith('ytv_aff='));
        if (c) affCookie = decodeURIComponent(c.split('=').slice(1).join('='));
      } catch {}
    }
    const aff = AFFILIATES_DORMANT ? undefined : (affTyped.trim() || affQueryCode || affCookie || undefined);

    if (!signup.start({ name, email, password, lang, utmSource, utmMedium, utmCampaign,
      ref: refCode || undefined, aff, signupReferrer: signupReferrer.slice(0, 500) || undefined,
      signupLandingPage: signupLandingPage.slice(0, 500) || undefined }, challenge.challenge)) {
      setError(t('La verificación ya no está disponible. Complétala de nuevo.', 'The verification is no longer available. Complete it again.'));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--yv-light)' }}>
      <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
        <a href="/" className="flex items-center gap-1">
          <svg width="16" height="16" viewBox="7 7 18 18" fill="none">
            <circle cx="16" cy="16" r="8" fill="#e84d5b"/>
          </svg>
          <span className="font-display font-bold text-[15px] tracking-tight text-white">YTubViral<span style={{ color: 'var(--yv-brand)' }}>.</span>com</span>
        </a>
        <button
          disabled={signup.blocked || google.blocked}
          onClick={() => { if (signupPending() || sessionCookieWriterBusy()) return; const next = lang === 'es' ? 'en' : 'es'; setLang(next); localStorage.setItem('ytubviral_lang', next); document.cookie = `ytubviral_lang=${next};path=/;max-age=31536000;samesite=lax`; }}
          className="yv-chip flex items-center gap-1 font-mono-jb text-[13px] tracking-wider px-2 py-1"
        >
          <span style={{ color: lang === 'es' ? 'white' : '#52525b', fontWeight: lang === 'es' ? 700 : 400 }}>ES</span>
          <span className="text-zinc-700 mx-0.5">|</span>
          <span style={{ color: lang === 'en' ? 'white' : '#52525b', fontWeight: lang === 'en' ? 700 : 400 }}>EN</span>
        </button>
      </div>

      <div className="w-full max-w-md">
        <div className="mb-8">
          <p className="font-mono-jb text-[13px] tracking-widest uppercase mb-3" style={{ color: 'var(--yv-brand-lift)' }}>▸ {t('REGISTRO GRATIS', 'FREE SIGN UP')}</p>
          <h1 className="font-display font-bold text-3xl tracking-tight text-white mb-2">{t('Empieza a crecer hoy', 'Start growing today')}</h1>
          <p className="text-zinc-400 text-sm">{t('10 generaciones al mes gratis. Sin tarjeta de crédito.', '10 free generations per month. No credit card required.')}</p>
        </div>

        <div className="soft-card p-8">
          <button
            disabled={signup.blocked || google.blocked}
            onClick={google.start}
            className="yv-btn yv-btn--ghost w-full py-3 px-4 text-sm font-medium text-white"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {t('Continuar con Google', 'Continue with Google')}
          </button>


          {google.waiting && <p role="status">{t('Preparando acceso con Google...', 'Preparing Google sign-in...')}</p>}
          {google.status === 'unconfirmed' && <div role="alert">
            <p>{t('No se ha confirmado el acceso con Google. La solicitud original puede seguir en curso.', 'Google sign-in was not confirmed. The original request may still be running.')}</p>
            {google.canObserve && <button type="button" onClick={google.observe}>{t('Consultar acceso pendiente', 'Check pending Google sign-in')}</button>}
          </div>}
          {google.status === 'not-issued' && <p role="status">{t('No se envió el acceso con Google. Puedes intentarlo de nuevo.', 'Google sign-in was not sent. You can try again.')}</p>}
          {google.blocked && !google.own && <p role="status">{t('Hay una operación de sesión pendiente. Espera a que termine.', 'A session operation is pending. Wait for it to finish.')}</p>}

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }}></div>
            <span className="text-zinc-600 text-[13px] font-mono-jb">{t('o con email', 'or with email')}</span>
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }}></div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block font-mono-jb text-[13px] tracking-wider uppercase text-zinc-500 mb-2">{t('Nombre', 'Name')}</label>
              <input type="text" maxLength={100} disabled={signup.blocked || google.blocked} value={name} onChange={(e) => setName(e.target.value)}
                className="soft-field py-3 px-4 text-sm"
                placeholder={t('Tu nombre', 'Your name')} required />
            </div>

            <div>
              <label className="block font-mono-jb text-[13px] tracking-wider uppercase text-zinc-500 mb-2">Email</label>
              <input type="email" maxLength={254} disabled={signup.blocked || google.blocked} value={email} onChange={(e) => setEmail(e.target.value)}
                className="soft-field py-3 px-4 text-sm" placeholder="you@email.com" required />
            </div>

            <div>
              <label className="block font-mono-jb text-[13px] tracking-wider uppercase text-zinc-500 mb-2">{t('Contraseña', 'Password')}</label>
              <PasswordInput disabled={signup.blocked || google.blocked} value={password} onChange={(e) => setPassword(e.target.value)}
                className="py-3 px-4 text-sm"
                placeholder={t('Mínimo 8 caracteres', 'At least 8 characters')} required />
              <p className="font-mono-jb text-[11px] mt-1.5" style={{ color: 'var(--yv-text-4)' }}>
                {t('Al menos 1 letra y 1 número', 'At least 1 letter and 1 number')}
              </p>
            </div>

            <div>
              <label className="block font-mono-jb text-[13px] tracking-wider uppercase text-zinc-500 mb-2">{t('Confirmar contraseña', 'Confirm password')}</label>
              <PasswordInput disabled={signup.blocked || google.blocked} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                className="py-3 px-4 text-sm"
                placeholder={t('Repite tu contraseña', 'Repeat your password')} required />
            </div>

            {!AFFILIATES_DORMANT && (
              !showAffInput ? (
                <button type="button" disabled={signup.blocked || google.blocked} onClick={() => { if (!signupPending() && !sessionCookieWriterBusy()) setShowAffInput(true); }}
                  className="font-mono-jb text-[12px] text-zinc-500 hover:text-zinc-300 transition underline">
                  {t('¿Te recomendó un creador? Añade su código', 'Did a creator recommend you? Add their code')}
                </button>
              ) : (
                <div>
                  <label className="block font-mono-jb text-[13px] tracking-wider uppercase text-zinc-500 mb-2">
                    {t('Código de afiliado (opcional)', 'Affiliate code (optional)')}
                  </label>
                  <input type="text" disabled={signup.blocked || google.blocked} value={affTyped} onChange={(e) => setAffTyped(e.target.value)}
                    className="soft-field py-3 px-4 text-sm" placeholder={t('ej. erika', 'e.g. erika')} />
                </div>
              )
            )}

            {TURNSTILE_SITE_KEY && <div ref={challenge.container} />}
            {challenge.status !== 'ready' && <p role="status">{challenge.status === 'unavailable'
              ? t('La verificación no está disponible. El registro por email no puede continuar.', 'Verification is unavailable. Email signup cannot continue.')
              : challenge.status === 'expired' ? t('La verificación ha caducado. Complétala de nuevo.', 'Verification expired. Complete it again.')
              : t('Completa la verificación de seguridad.', 'Complete the security verification.')}</p>}
            {!signup.blocked && TURNSTILE_SITE_KEY && (challenge.status === 'expired' || challenge.status === 'unavailable' || ['invalid', 'exists', 'bot-denied', 'rate-limited', 'not-issued'].includes(signup.status ?? '')) &&
              <button type="button" onClick={() => { if (!signupPending() && !sessionCookieWriterBusy()) challenge.restart(); }}>{t('Rehacer verificación', 'Redo verification')}</button>}
            {signup.status === 'unconfirmed' && <div role="alert"><p>{t('No se ha confirmado el registro. La solicitud puede seguir en curso; comprueba tu correo antes de volver a registrarte.', 'Signup was not confirmed. The request may still be running; check your email before signing up again.')}</p>
              {signup.canObserve && <button type="button" onClick={signup.observe}>{t('Consultar registro pendiente', 'Check pending signup')}</button>}</div>}
            {signup.status === 'created' && <p role="status">{t('Cuenta creada. Comprueba tu correo para verificarla.', 'Account created. Check your email to verify it.')}</p>}
            {signup.status === 'exists' && <p role="alert">{t('Ya existe una cuenta con este email. Inicia sesión o verifica tu correo.', 'An account with this email already exists. Sign in or verify your email.')}</p>}
            {signup.status === 'invalid' && <p role="alert">{t('Revisa los datos del registro.', 'Check the signup details.')}</p>}
            {signup.status === 'bot-denied' && <p role="alert">{t('La verificación no fue aceptada. Complétala de nuevo.', 'Verification was not accepted. Complete it again.')}</p>}
            {signup.status === 'rate-limited' && <p role="alert">{t('Demasiados intentos. Espera antes de volver a intentarlo.', 'Too many attempts. Wait before trying again.')}</p>}
            {signup.status === 'not-issued' && <p role="status">{t('No se envió el registro. Puedes iniciar una nueva solicitud.', 'Signup was not sent. You can start a new request.')}</p>}
            {signup.blocked && !signup.own && !google.own && <p role="status">{t('Hay una operación pendiente. Espera a que termine.', 'An operation is pending. Wait for it to finish.')}</p>}

            {error && (
              <div className="yv-note yv-note--error">
                <WarningIcon size={14} /> {error}
              </div>
            )}

            <button type="submit" disabled={signup.blocked || google.blocked}
              className="btn-offset w-full py-3.5 font-display font-bold text-[15px] disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? (
                <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full spin-r" />{t('Creando cuenta...', 'Creating account...')}</>
              ) : t('Crear cuenta gratis →', 'Create free account →')}
            </button>
          </form>

          <p className="text-zinc-600 text-[13px] mt-5 text-center leading-relaxed">
            {t('Al registrarte aceptas nuestros', 'By signing up you agree to our')}{' '}
            <a href="/terms" className="text-zinc-400 hover:text-white transition underline">{t('Términos y Condiciones', 'Terms and Conditions')}</a>{' '}
            {t('y la', 'and our')}{' '}
            <a href="/privacy" className="text-zinc-400 hover:text-white transition underline">{t('Política de Privacidad', 'Privacy Policy')}</a>.
          </p>
        </div>

        <p className="text-zinc-500 text-sm mt-6 text-center">
          {t('¿Ya tienes cuenta?', 'Already have an account?')}{' '}
          <a href="/login" className="text-white hover:underline font-medium">{t('Inicia sesión aquí', 'Sign in here')}</a>
        </p>

        <div className="mt-6 flex justify-center gap-5 text-[13px] text-zinc-600">
          <a href="/terms" className="hover:text-zinc-400 transition">{t('Términos', 'Terms')}</a>
          <a href="/privacy" className="hover:text-zinc-400 transition">{t('Privacidad', 'Privacy')}</a>
          <a href="/legal" className="hover:text-zinc-400 transition">{t('Aviso Legal', 'Legal Notice')}</a>
        </div>
      </div>
    </div>
  );
}
