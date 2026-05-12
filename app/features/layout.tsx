import Link from 'next/link';
import { cookies } from 'next/headers';
import LangToggle from '@/components/LangToggle';

export default async function FeaturesLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const lang = cookieStore.get('ytubviral_lang')?.value === 'en' ? 'en' : 'es';

  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-md" style={{ background: 'rgba(10,10,10,0.85)' }}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <svg width="18" height="18" viewBox="6 6 20 20" fill="none">
              <circle cx="16" cy="16" r="8" fill="#ee4d5e"/>
            </svg>
            <span className="font-display font-bold text-[15px] tracking-tight text-white">
              YTubViral<span style={{ color: 'var(--red)' }}>.</span>com
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <LangToggle currentLang={lang} />
            <Link href="/login" className="font-mono-jb text-[13px] text-zinc-400 hover:text-white transition">
              {lang === 'en' ? 'Log in' : 'Iniciar sesión'}
            </Link>
            <Link href="/signup" className="btn-offset px-4 py-2 text-[13px] font-display">
              {lang === 'en' ? 'Sign up free' : 'Registrarse gratis'}
            </Link>
          </div>
        </div>
      </nav>
      {children}
    </>
  );
}
