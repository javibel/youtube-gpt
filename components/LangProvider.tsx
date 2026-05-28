'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

type Lang = 'es' | 'en';

const LangContext = createContext<Lang>('es');

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
  const [lang, setLang] = useState<Lang>(initialLang);

  useEffect(() => {
    const cookie = document.cookie.split(';').find(c => c.trim().startsWith('ytubviral_lang='));
    if (cookie) {
      const val = cookie.split('=')[1]?.trim();
      if (val === 'en' || val === 'es') setLang(val);
    }
  }, []);

  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

/** Read the current language. Must be inside LangProvider. */
export function useLang(): Lang {
  return useContext(LangContext);
}
