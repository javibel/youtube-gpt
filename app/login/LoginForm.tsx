'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useGoogleSignin } from '@/lib/use-google-signin';
import { sessionCookieWriterBusy, subscribeSessionCookieWriter } from '@/lib/session-cookie-writer';
import { beginCredentials, claimCredentialsNavigation, observeCredentialsOriginal, retireCredentialsProgress, type CredentialsAttempt, type CredentialsOutcome } from '@/lib/credentials-client';
import PasswordInput from '@/components/PasswordInput';

export default function LoginForm() {
  const { status } = useSession();
  const context = useRef({});
  const command = useRef<{ attempt: CredentialsAttempt; frame: object } | undefined>(undefined);
  const observer = useRef<ReturnType<typeof observeCredentialsOriginal> | undefined>(undefined);
  const [cookieBusy, setCookieBusy] = useState(sessionCookieWriterBusy);
  const [pending, setPending] = useState(false);
  const [denied, setDenied] = useState(false);
  const mounted = useRef(true);
  const selection = useRef({ email: '', password: '', totp: '', lang: 'es' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lang, setLang] = useState<'es'|'en'>('es');
  const [justVerified, setJustVerified] = useState(false);
  const [totp, setTotp] = useState('');
  const [showTotp, setShowTotp] = useState(false);
  if (selection.current.email !== email || selection.current.password !== password || selection.current.totp !== totp || selection.current.lang !== lang) selection.current = { email, password, totp, lang };
  const rendered = selection.current;
  const google = useGoogleSignin(rendered, '/dashboard', !loading && status !== 'loading', () => mounted.current && selection.current === rendered && !loading);
  useEffect(() => { mounted.current = true; const unsubscribe = subscribeSessionCookieWriter(() => setCookieBusy(sessionCookieWriterBusy())); return () => { mounted.current = false; unsubscribe(); observer.current?.retire(); if (command.current) retireCredentialsProgress(command.current.attempt); }; }, []);

  useEffect(() => {
    const stored = localStorage.getItem('ytubviral_lang') as 'es'|'en' | null;
    if (stored) setLang(stored);
    if (new URLSearchParams(window.location.search).get('verified') === '1') setJustVerified(true);
    if (new URLSearchParams(window.location.search).get('credentials') === '1') { setShowTotp(true); setError(stored === 'en' ? 'Incorrect email, password, or code.' : 'Email, contraseña o código incorrectos.'); }
  }, []);

  const t = (es: string, en: string) => lang === 'en' ? en : es;


  const applyOutcome = (attempt: CredentialsAttempt, outcome: CredentialsOutcome) => {
    const target = claimCredentialsNavigation(attempt, context.current, outcome);
    if (target === '/dashboard') window.location.href = target;
    else if (target) {
      setDenied(true); setPending(false); setShowTotp(true);
      setError(t('Email, contraseña o código incorrectos. Vuelve a abrir el formulario para intentarlo de nuevo.', 'Incorrect email, password, or code. Reopen the form to try again.'));
    } else if (outcome.status === 'not-issued') {
      command.current = undefined; setPending(false);
      setError(t('No se envió el inicio de sesión. Puedes intentarlo de nuevo.', 'Sign-in was not sent. You can try again.'));
    } else {
      setPending(true);
      setError(t('No se ha confirmado el inicio de sesión. Consulta la solicitud pendiente.', 'Sign-in was not confirmed. Check the pending request.'));
    }
  };
  const observeOwn = async () => {
    const own = command.current;
    const active = () => mounted.current && command.current === own && selection.current === own?.frame;
    if (!own || !active() || loading) return;
    setLoading(true);
    const view = observeCredentialsOriginal(own.attempt, context.current, active); observer.current = view;
    const outcome = await view.promise;
    if (observer.current !== view || !active()) return;
    observer.current = undefined; applyOutcome(own.attempt, outcome); setLoading(false);
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const captured = rendered;
    const active = () => mounted.current && selection.current === captured;
    if (!active() || loading || status === 'loading' || sessionCookieWriterBusy()) return;
    const attempt = beginCredentials(captured, window.location.origin, context.current, active);
    if (!attempt) {
      setError(t('Revisa el email, la contraseña y el código de seis dígitos.', 'Check your email, password and six-digit code.')); return;
    }
    command.current = { attempt, frame: captured }; setLoading(true); setError('');
    const view = observeCredentialsOriginal(attempt, context.current, active); observer.current = view;
    const outcome = await view.promise;
    if (observer.current !== view || !active()) return;
    observer.current = undefined; applyOutcome(attempt, outcome); setLoading(false);
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
          disabled={loading || cookieBusy}
          onClick={() => { if (loading || sessionCookieWriterBusy()) return; const next = lang === 'es' ? 'en' : 'es'; setLang(next); localStorage.setItem('ytubviral_lang', next); document.cookie = `ytubviral_lang=${next};path=/;max-age=31536000;samesite=lax`; }}
          className="yv-chip flex items-center gap-1 font-mono-jb text-[13px] tracking-wider px-2 py-1"
        >
          <span style={{ color: lang === 'es' ? 'white' : '#52525b', fontWeight: lang === 'es' ? 700 : 400 }}>ES</span>
          <span className="text-zinc-700 mx-0.5">|</span>
          <span style={{ color: lang === 'en' ? 'white' : '#52525b', fontWeight: lang === 'en' ? 700 : 400 }}>EN</span>
        </button>
      </div>

      <div className="w-full max-w-md">
        <div className="mb-8">
          <p className="font-mono-jb text-[13px] tracking-widest uppercase mb-3" style={{ color: 'var(--yv-brand-lift)' }}>▸ {t('ACCESO', 'SIGN IN')}</p>
          <h1 className="font-display font-bold text-3xl tracking-tight text-white mb-2">{t('Bienvenido de vuelta', 'Welcome back')}</h1>
          <p className="text-zinc-400 text-sm">{t('Inicia sesión para seguir creando contenido viral', 'Sign in to keep creating viral content')}</p>
        </div>

        <div className="soft-card p-8">
          <button
            disabled={loading || cookieBusy || status === 'loading'}
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
              <label className="block font-mono-jb text-[13px] tracking-wider uppercase text-zinc-500 mb-2">Email</label>
              <input type="email" disabled={loading || cookieBusy || status === 'loading'} value={email} onChange={(e) => setEmail(e.target.value)}
                className="soft-field py-3 px-4 text-sm" placeholder="you@email.com" required />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="font-mono-jb text-[13px] tracking-wider uppercase text-zinc-500">{t('Contraseña', 'Password')}</label>
                <a href="/forgot-password" className="font-mono-jb text-[13px] tracking-wider text-zinc-500 hover:text-white transition">
                  {t('¿Olvidaste la contraseña?', 'Forgot password?')}
                </a>
              </div>
              <PasswordInput disabled={loading || cookieBusy || status === 'loading'} value={password} onChange={(e) => setPassword(e.target.value)}
                className="py-3 px-4 text-sm" required />
            </div>

            {showTotp && (
              <div>
                <label className="block font-mono-jb text-[13px] tracking-wider uppercase text-zinc-500 mb-2">
                  {t('Código de verificación', 'Verification code')}
                </label>
                <input type="text" disabled={loading || cookieBusy || status === 'loading'} inputMode="numeric" autoComplete="one-time-code" value={totp}
                  onChange={(e) => setTotp(e.target.value)}
                  className="soft-field py-3 px-4 text-sm" placeholder="123456" maxLength={6} />
              </div>
            )}

            {justVerified && (
              <div className="yv-note yv-note--ok">
                {t('Email verificado. Inicia sesión para continuar.', 'Email verified. Sign in to continue.')}
              </div>
            )}

            {cookieBusy && !loading && !pending && !denied && <p role="status">{t('Hay una operación de sesión pendiente. Espera a que termine.', 'A session operation is pending. Wait for it to finish.')}</p>}

            {error && (
              <div role="alert" className="yv-note yv-note--error">
                {error}
                {pending && command.current?.frame === rendered && <button type="button" disabled={loading} onClick={() => void observeOwn()}>{t('Consultar solicitud pendiente', 'Check pending request')}</button>}
                {denied && <button type="button" onClick={() => { if (mounted.current) window.location.href = '/login?credentials=1'; }}>{t('Volver a abrir el formulario', 'Reopen form')}</button>}
              </div>
            )}

            <button type="submit" disabled={loading || cookieBusy || status === 'loading'}
              className="btn-offset w-full py-3.5 font-display font-bold text-[15px] disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? (
                <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full spin-r" />{t('Ingresando...', 'Signing in...')}</>
              ) : t('Entrar →', 'Sign in →')}
            </button>
          </form>
        </div>

        <p className="text-zinc-500 text-sm mt-6 text-center">
          {t('¿No tienes cuenta?', "Don't have an account?")}{' '}
          <a href="/signup" className="text-white hover:underline font-medium">{t('Regístrate gratis', 'Sign up for free')}</a>
        </p>

        <div className="mt-8 flex justify-center gap-5 text-[13px] text-zinc-600">
          <a href="/terms" className="hover:text-zinc-400 transition">{t('Términos', 'Terms')}</a>
          <a href="/privacy" className="hover:text-zinc-400 transition">{t('Privacidad', 'Privacy')}</a>
          <a href="/legal" className="hover:text-zinc-400 transition">{t('Aviso Legal', 'Legal Notice')}</a>
        </div>
      </div>
    </div>
  );
}
