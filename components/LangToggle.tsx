'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LangToggle({ currentLang = 'es' }: { currentLang?: 'es' | 'en' }) {
  const [lang, setLangState] = useState<'es' | 'en'>(currentLang);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem('ytubviral_lang') as 'es' | 'en' | null;
    if (stored === 'en' || stored === 'es') {
      setLangState(stored);
      // Bootstrap cookie from localStorage so server reads it on next request
      document.cookie = `ytubviral_lang=${stored};path=/;max-age=31536000;samesite=lax`;
    }
  }, []);

  const toggle = () => {
    const next = lang === 'es' ? 'en' : 'es';
    setLangState(next);
    localStorage.setItem('ytubviral_lang', next);
    document.cookie = `ytubviral_lang=${next};path=/;max-age=31536000;samesite=lax`;
    router.refresh();
  };

  const activeLang = mounted ? lang : currentLang;

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
