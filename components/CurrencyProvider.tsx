'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { Currency } from '@/lib/pricing';

const CurrencyContext = createContext<Currency>('eur');

/**
 * Provides the visitor's likely billing currency (eur|usd) to all client components.
 *
 * The server always renders 'eur' (static, cacheable) — same pattern as LangProvider.
 * On hydration: reads the ytv_currency cookie if a previous visit already resolved
 * it; otherwise calls /api/geo-currency (reads Vercel's IP-country header) once and
 * caches the result in a cookie for a year. EUR visitors see no change; non-eurozone
 * visitors flip to USD after that one lookup (~one render cycle, imperceptible).
 */
export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<Currency>('eur');

  useEffect(() => {
    const cookie = document.cookie.split(';').find(c => c.trim().startsWith('ytv_currency='));
    const cached = cookie?.split('=')[1]?.trim();
    if (cached === 'usd' || cached === 'eur') {
      setCurrency(cached);
      return;
    }
    fetch('/api/geo-currency')
      .then(r => r.json())
      .then((d: { currency?: Currency }) => {
        const c = d.currency === 'usd' ? 'usd' : 'eur';
        setCurrency(c);
        document.cookie = `ytv_currency=${c};path=/;max-age=31536000;samesite=lax`;
      })
      .catch(() => {});
  }, []);

  return <CurrencyContext.Provider value={currency}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): Currency {
  return useContext(CurrencyContext);
}
