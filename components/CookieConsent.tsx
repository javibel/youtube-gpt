'use client';

import { useEffect, useState } from 'react';
import { useLang } from '@/components/LangProvider';

// Consentimiento de cookies (RGPD/AEPD).
// - ytv_consent=accepted|rejected. Aceptar: 365d. Rechazar: 180d (no re-preguntar enseguida).
// - Gatea las cookies de atribución (ytv_utm, ytv_ref). Las esenciales (sesión) y de
//   preferencia (ytubviral_lang, la pone el usuario al elegir idioma) están exentas.
// - Si algún día se añade GA u otro tercero, DEBE cargarse solo si hasTrackingConsent().
// - Evento 'ytv-consent' al decidir; 'ytv-consent-open' reabre el banner (retirar consentimiento).

export function hasTrackingConsent(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split('; ').some((c) => c === 'ytv_consent=accepted');
}

export function consentDecided(): boolean {
  if (typeof document === 'undefined') return true;
  return document.cookie.split('; ').some((c) => c.startsWith('ytv_consent='));
}

function setConsent(value: 'accepted' | 'rejected') {
  const days = value === 'accepted' ? 365 : 180;
  document.cookie = `ytv_consent=${value};path=/;max-age=${days * 86400};samesite=lax`;
  window.dispatchEvent(new CustomEvent('ytv-consent', { detail: value }));
}

export default function CookieConsent() {
  const lang = useLang();
  const [visible, setVisible] = useState(false);
  const t = (es: string, en: string) => (lang === 'en' ? en : es);

  useEffect(() => {
    if (!consentDecided()) setVisible(true);
    const open = () => setVisible(true);
    window.addEventListener('ytv-consent-open', open);
    return () => window.removeEventListener('ytv-consent-open', open);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label={t('Consentimiento de cookies', 'Cookie consent')}
      className="fixed bottom-0 inset-x-0 z-[200] backdrop-blur-md"
      style={{ background: 'rgba(12,10,15,0.92)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.1), 0 -20px 50px -20px rgba(0,0,0,.7)' }}
    >
      <div className="max-w-5xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <p className="text-zinc-300 text-sm leading-relaxed flex-1">
          {t(
            'Usamos cookies propias para saber de qué campaña vienes (atribución). Sin cookies de terceros ni publicidad. Las de sesión e idioma son necesarias y no se desactivan.',
            'We use first-party cookies to know which campaign you came from (attribution). No third-party or advertising cookies. Session and language cookies are necessary and always on.'
          )}{' '}
          <a href="/privacy" className="underline text-zinc-400 hover:text-white transition">
            {t('Más información', 'Learn more')}
          </a>
        </p>
        <div className="flex gap-3 shrink-0">
          <button
            onClick={() => { setConsent('rejected'); setVisible(false); }}
            className="btn-offset btn-offset-ghost px-5 py-2.5 text-[13px] font-display"
          >
            {t('Rechazar', 'Reject')}
          </button>
          <button
            onClick={() => { setConsent('accepted'); setVisible(false); }}
            className="btn-offset px-5 py-2.5 text-[13px] font-display"
          >
            {t('Aceptar', 'Accept')}
          </button>
        </div>
      </div>
    </div>
  );
}
