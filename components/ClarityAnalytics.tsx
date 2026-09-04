'use client';

import { useEffect } from 'react';
import { hasTrackingConsent } from '@/components/CookieConsent';

// Microsoft Clarity — grabación de sesiones y mapas de calor.
//
// Por qué (02/09/2026): 46 usuarios externos han generado algo alguna vez, los 46 el
// mismo día del alta, y 45 no volvieron nunca. Los datos de page_views dicen QUÉ
// hicieron (se recorrieron el producto entero y se fueron) pero no POR QUÉ no les
// valió la pena volver. El email está muerto como canal de feedback (258 lifecycle +
// 63 tokens + 52 de campaña manual = 0 respuestas), así que preguntar no es una
// opción. Esto permite VER la primera sesión — la única que existe — en vez de
// seguir infiriéndola desde tablas.
//
// Con 13-20 visitas reales/día se pueden revisar todas las sesiones a mano.
//
// Reglas que respeta:
// - Solo carga si el usuario ACEPTÓ cookies (hasTrackingConsent), como pide el
//   comentario de CookieConsent.tsx. Si rechaza, no se carga nada.
// - Si acepta mientras está en la página, se engancha al evento 'ytv-consent' y
//   carga sin necesidad de recargar.
// - No carga en local: el dev server usa la misma BD/config que producción y no
//   tiene sentido grabarse a uno mismo programando.
// - Sin NEXT_PUBLIC_CLARITY_ID no hace absolutamente nada (no rompe nada si falta).
//
// IMPORTANTE: los dominios de Clarity están declarados en la CSP de next.config.ts
// (script-src y connect-src, en las DOS políticas). Sin eso el navegador lo bloquea
// en silencio — exactamente el fallo que tuvo el reproductor de vídeo dos meses.
// El contrato de CSP de local-agent/smoke-browser.js lo vigila.

const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID;

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[] };

function getClarity(): ClarityFn | null {
  if (typeof window === 'undefined') return null;
  const fn = (window as unknown as { clarity?: unknown }).clarity;
  return typeof fn === 'function' ? (fn as ClarityFn) : null;
}

// API de consentimiento v2 de Clarity. Desde el 31/10/2025 Microsoft EXIGE recibir
// una señal de consentimiento para las visitas del EEE, Reino Unido y Suiza; sin ella
// Clarity funciona en "no-consent mode" y asigna un id nuevo por página, de modo que
// no hay sesión continua que revisar (que es justo para lo que se puso).
// No hacemos publicidad, así que ad_Storage va siempre en "denied".
function signalConsent(analytics: 'granted' | 'denied') {
  getClarity()?.('consentv2', { ad_Storage: 'denied', analytics_Storage: analytics });
}

function loadClarity(id: string) {
  if (typeof window === 'undefined') return;
  // Ya cargado (p. ej. el usuario aceptó y luego navegó)
  if ((window as { clarity?: unknown }).clarity) return;

  const w = window as unknown as Record<string, unknown> & { clarity?: unknown };
  w.clarity = w.clarity || function (...args: unknown[]) {
    ((w.clarity as { q?: unknown[] }).q = (w.clarity as { q?: unknown[] }).q || []).push(args);
  };

  // La señal se encola en w.clarity.q y se procesa cuando el tag termina de cargar,
  // así que puede emitirse antes de que el script esté listo.
  signalConsent('granted');

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${id}`;
  document.head.appendChild(script);
}

// Retirada del consentimiento (art. 7.3 RGPD). No basta con dejar de cargar el script:
// si Clarity ya está en memoria sigue grabando hasta que se recargue.
//   1. consentv2 denied → Clarity pasa a modo sin consentimiento.
//   2. consent(false)   → borra sus cookies y termina la sesión en curso (documentado
//                         en clarity-consent-api-v2, "Erase cookies").
//   3. recarga          → garantiza que no queda nada en memoria. Al volver,
//                         hasTrackingConsent() es false y el tag ya no se carga.
// Solo se recarga si Clarity estaba cargado: rechazar en el banner inicial no recarga.
//
// La recarga se aplaza un instante a propósito: `location.reload()` inmediato mata la
// página antes de que las llamadas de arriba lleguen a salir, así que la señal de
// retirada se perdía a veces. El cumplimiento no dependía de ello (las cookies las
// borra CookieConsent y el tag ya no vuelve a cargarse), pero sin la señal Microsoft
// no se entera de que hay que dejar de vincular la sesión en su lado.
const REVOKE_FLUSH_MS = 250;

function revokeClarity() {
  const clarity = getClarity();
  if (!clarity) return; // nunca llegó a cargar: nada que revocar
  try {
    signalConsent('denied');
    clarity('consent', false);
  } catch { /* la recarga + el borrado de cookies son la garantía de respaldo */ }
  window.setTimeout(() => window.location.reload(), REVOKE_FLUSH_MS);
}

export default function ClarityAnalytics() {
  useEffect(() => {
    if (!CLARITY_ID) return;
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return;

    if (hasTrackingConsent()) loadClarity(CLARITY_ID);

    // El listener se registra SIEMPRE, no solo cuando falta decidir. Antes se hacía
    // `return` tras cargar, así que quien llegaba con el consentimiento ya dado no
    // tenía a nadie escuchando y rechazar desde el pie no paraba nada.
    const onConsent = (e: Event) => {
      const decision = (e as CustomEvent).detail;
      if (decision === 'accepted') loadClarity(CLARITY_ID);
      else if (decision === 'rejected') revokeClarity();
    };
    window.addEventListener('ytv-consent', onConsent);
    return () => window.removeEventListener('ytv-consent', onConsent);
  }, []);

  return null;
}
