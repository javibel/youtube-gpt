'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface Props {
  /** URL mode: clicking navigates to /?lang=en (for server-rendered pages) */
  urlMode?: boolean;
  /** Initial lang when urlMode is true — passed from server searchParams */
  currentLang?: 'es' | 'en';
}

export default function LangToggle({ urlMode = false, currentLang = 'es' }: Props) {
  const [lang, setLang] = useState<'es' | 'en'>(urlMode ? currentLang : 'es');
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
    if (!urlMode) {
      const stored = localStorage.getItem('ytubviral_lang') as 'es' | 'en' | null;
      if (stored === 'en' || stored === 'es') setLang(stored);
    }
  }, [urlMode]);

  const toggle = () => {
    const next = lang === 'es' ? 'en' : 'es';
    localStorage.setItem('ytubviral_lang', next);
    if (urlMode) {
      router.push(pathname + (next === 'en' ? '?lang=en' : ''));
    } else {
      setLang(next);
    }
  };

  const activeLang = urlMode ? currentLang : (mounted ? lang : 'es');

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1 font-mono-jb text-[10px] tracking-wider border border-white/15 rounded px-2 py-1 hover:border-white/30 transition"
      title={activeLang === 'es' ? 'Switch to English' : 'Cambiar a Español'}
    >
      <span style={{ color: activeLang === 'es' ? 'white' : '#52525b', fontWeight: activeLang === 'es' ? 700 : 400 }}>ES</span>
      <span className="text-zinc-700 mx-0.5">|</span>
      <span style={{ color: activeLang === 'en' ? 'white' : '#52525b', fontWeight: activeLang === 'en' ? 700 : 400 }}>EN</span>
    </button>
  );
}
