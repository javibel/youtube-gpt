'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { hasTrackingConsent } from '@/components/CookieConsent';

/**
 * Captures UTM params from the URL on first visit and stores them in a cookie.
 * First-touch attribution: only overwrites if the cookie doesn't exist yet.
 * Cookie TTL: 30 days.
 * RGPD: solo escribe la cookie con consentimiento. Si el usuario acepta en esta
 * misma página (evento 'ytv-consent'), captura en ese momento.
 */
export default function UTMCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    function capture() {
      const source = searchParams.get('utm_source');
      const medium = searchParams.get('utm_medium');
      const campaign = searchParams.get('utm_campaign');

      if (!source) return; // No UTM params in current URL — preserve existing cookie
      if (!hasTrackingConsent()) return; // RGPD: sin consentimiento no hay cookie de atribución

      const existing = document.cookie.split('; ').find(r => r.startsWith('ytv_utm='));
      if (existing) return; // Already captured first touch

      const value = encodeURIComponent(JSON.stringify({ source, medium, campaign }));
      const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
      document.cookie = `ytv_utm=${value}; path=/; expires=${expires}; SameSite=Lax`;
    }

    capture();
    const onConsent = (e: Event) => { if ((e as CustomEvent).detail === 'accepted') capture(); };
    window.addEventListener('ytv-consent', onConsent);
    return () => window.removeEventListener('ytv-consent', onConsent);
  }, [searchParams]);

  return null;
}
