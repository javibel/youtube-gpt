'use client';

import { useState, useEffect } from 'react';
import { useLang, useSetLang } from './LangProvider';

export default function LangToggle() {
  const lang = useLang();
  const setLang = useSetLang();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const toggle = () => {
    setLang(lang === 'es' ? 'en' : 'es');
  };

  const activeLang = mounted ? lang : 'es';

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1 font-mono-jb text-[13px] tracking-wider border border-white/15 rounded px-2 py-1 hover:border-white/30 transition"
      title={activeLang === 'es' ? 'Switch to English' : 'Cambiar a Español'}
    >
      <span style={{ color: activeLang === 'es' ? 'white' : '#52525b', fontWeight: activeLang === 'es' ? 700 : 400 }}>ES</span>
      <span className="text-zinc-700 mx-0.5">|</span>
      <span style={{ color: activeLang === 'en' ? 'white' : '#52525b', fontWeight: activeLang === 'en' ? 700 : 400 }}>EN</span>
    </button>
  );
}
