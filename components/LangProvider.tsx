'use client';

import { createContext, useContext, type ReactNode } from 'react';

type Lang = 'es' | 'en';

const LangContext = createContext<Lang>('es');

/**
 * Provides the user's language to all client components.
 * The lang value comes from the server (cookie reading in RootLayout),
 * so SSR and client hydration always agree — no mismatch flash.
 */
export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

/** Read the current language. Must be inside LangProvider. */
export function useLang(): Lang {
  return useContext(LangContext);
}
