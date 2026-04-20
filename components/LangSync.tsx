'use client';

import { useEffect } from 'react';

export default function LangSync({ lang }: { lang: 'es' | 'en' }) {
  useEffect(() => {
    localStorage.setItem('ytubviral_lang', lang);
  }, [lang]);

  return null;
}
