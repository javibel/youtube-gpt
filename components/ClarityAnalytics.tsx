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

function loadClarity(id: string) {
  if (typeof window === 'undefined') return;
  // Ya cargado (p. ej. el usuario aceptó y luego navegó)
  if ((window as { clarity?: unknown }).clarity) return;

  const w = window as unknown as Record<string, unknown> & { clarity?: unknown };
  w.clarity = w.clarity || function (...args: unknown[]) {
    ((w.clarity as { q?: unknown[] }).q = (w.clarity as { q?: unknown[] }).q || []).push(args);
  };

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${id}`;
  document.head.appendChild(script);
}

// Retirada del consentimiento (art. 7.3 RGPD). No basta con no volver a cargar el
// script: si Clarity ya está en memoria sigue grabando hasta que se recargue. Se
// llama a la API `stop` (documentada, pero envuelta por si cambia) y se recarga solo
// cuando de verdad estaba cargado. CookieConsent ya ha borrado _clck/_clsk antes de
// emitir el evento, así que tras la recarga no se reanuda la sesión anterior.
function stopClarity() {
  const w = window as unknown as { clarity?: (...args: unknown[]) => void };
  if (typeof w.clarity !== 'function') return; // nunca llegó a cargar: nada que parar
  try { w.clarity('stop'); } catch { /* API opcional, la recarga es la garantía */ }
  window.location.reload();
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
      else if (decision === 'rejected') stopClarity();
    };
    window.addEventListener('ytv-consent', onConsent);
    return () => window.removeEventListener('ytv-consent', onConsent);
  }, []);

  return null;
}
