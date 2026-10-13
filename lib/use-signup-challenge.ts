'use client';
import { useEffect, useRef, useState } from 'react';
import { attachSignupChallenge, type SignupChallenge } from '@/lib/signup-challenge';
export function useSignupChallenge(sitekey: string | undefined, lang: 'es' | 'en') {
  const container = useRef<HTMLDivElement>(null), generation = useRef({ lang, serial: 0 });
  const [serial, setSerial] = useState(0);
  if (generation.current.lang !== lang || generation.current.serial !== serial) generation.current = { lang, serial };
  const frame = generation.current;
  const [view, setView] = useState<{ frame: object; status: 'loading' | 'ready' | 'expired' | 'unavailable'; challenge?: SignupChallenge }>();
  useEffect(() => {
    if (!sitekey || !container.current) return;
    let live = true;
    const widget = attachSignupChallenge(container.current, sitekey, lang, state => {
      if (live && generation.current === frame) setView({ frame, ...state });
    });
    return () => { live = false; widget.dispose(); };
  }, [sitekey, lang, serial, frame]);
  const current = view?.frame === frame ? view : undefined;
  return { container, status: !sitekey ? 'unavailable' : current?.status ?? 'loading', challenge: current?.challenge,
    restart: () => setSerial(n => n + 1) };
}
