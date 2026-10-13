'use client';
import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useLang } from '@/components/LangProvider';
import WaitlistRequestForm from '@/components/WaitlistRequestForm';
import { observeWaitlistCount } from '@/lib/waitlist-client';

export default function LaunchClient() {
  const lang = useLang();
  return <><WaitlistRequestForm lang={lang} variant="launch" /><Suspense fallback={null}><RequestCount lang={lang} /></Suspense></>;
}
function RequestCount({ lang }: { lang: 'es' | 'en' }) {
  const path = usePathname(), query = useSearchParams().toString(), [count, setCount] = useState<number>();
  useEffect(() => {
    let current = true; const browserSearch = window.location.search;
    const original = observeWaitlistCount(() => current && window.location.pathname === path && window.location.search === browserSearch);
    setCount(undefined);
    void original.promise.then(value => { if (current) setCount(value); });
    return () => { current = false; original.retire(); };
  }, [path, query, lang]);
  return count === undefined ? null : <p className="text-center text-sm text-zinc-500 -mt-8 mb-12">
    {count} {lang === 'en' ? 'registered requests' : 'solicitudes registradas'}
  </p>;
}
