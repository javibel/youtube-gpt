'use client';
import WaitlistRequestForm from '@/components/WaitlistRequestForm';
export default function WaitlistInline({ lang, source = 'homepage-cta' }: { lang: 'es' | 'en'; source?: string }) {
  return <WaitlistRequestForm lang={lang} source={source} />;
}
