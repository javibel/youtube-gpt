'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

type Lang = 'es' | 'en';

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const LangContext = createContext<LangContextValue>({ lang: 'es', setLang: () => {} });

/**
 * Provides the user's language to all client components.
 *
 * The server renders with lang='es' (static, cacheable).
 * On hydration, reads the ytubviral_lang cookie client-side.
 * EN users see one render cycle (~16ms) in 'es' before switching — imperceptible.
 *
 * This design keeps ALL pages statically cacheable by Vercel CDN,
 * which is critical for SEO indexation and performance.
 */
export function LangProvider({ lang: initialLang, children }: { lang: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  useEffect(() => {
    const cookie = document.cookie.split(';').find(c => c.trim().startsWith('ytubviral_lang='));
    if (cookie) {
      const val = cookie.split('=')[1]?.trim();
      if (val === 'en' || val === 'es') setLangState(val);
    }
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem('ytubviral_lang', l);
    document.cookie = `ytubviral_lang=${l};path=/;max-age=31536000;samesite=lax`;
  }, []);

  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

/** Read the current language. Must be inside LangProvider. */
export function useLang(): Lang {
  return useContext(LangContext).lang;
}

/** Set the language (updates context + cookie + localStorage). */
export function useSetLang(): (l: Lang) => void {
  return useContext(LangContext).setLang;
}
