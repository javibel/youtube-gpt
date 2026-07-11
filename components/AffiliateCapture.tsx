'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { hasTrackingConsent } from '@/components/CookieConsent';
import { AFFILIATES_DORMANT } from '@/lib/features';

/**
 * Captura el código de afiliado (?aff=) en cookie ytv_aff, first-touch (60 días).
 * Deliberadamente separado de UTMCapture/ytv_utm y del sistema de referidos
 * peer-to-peer existente (?ref=/ytv_ref, ver prisma/schema.prisma User.referredByCode) —
 * son namespaces distintos a propósito, para no colisionar con lo que ya funciona.
 * RGPD: mismo gating de consentimiento que ytv_utm.
 */
export default function AffiliateCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    function capture() {
      if (AFFILIATES_DORMANT) return;
      const code = searchParams.get('aff');
      if (!code) return;
      if (!hasTrackingConsent()) return;

      const existing = document.cookie.split('; ').find(r => r.startsWith('ytv_aff='));
      if (existing) return; // first-touch: no sobrescribir

      const expires = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toUTCString();
      document.cookie = `ytv_aff=${encodeURIComponent(code)}; path=/; expires=${expires}; SameSite=Lax`;
    }

    capture();
    const onConsent = (e: Event) => { if ((e as CustomEvent).detail === 'accepted') capture(); };
    window.addEventListener('ytv-consent', onConsent);
    return () => window.removeEventListener('ytv-consent', onConsent);
  }, [searchParams]);

  return null;
}
