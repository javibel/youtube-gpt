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
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2.5">
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="13" stroke="#9B2020" strokeWidth="2.2" />
                <polygon points="13,10.5 13,21.5 23,16" fill="#9B2020" />
              </svg>
              <span className="font-display font-bold text-[15px] tracking-tight text-white">
                YTubViral<span style={{ color: 'var(--red)' }}>.</span>com
              </span>
            </Link>
            <Link href="/" className="hidden sm:inline-flex items-center gap-1 font-mono-jb text-[13px] text-zinc-500 hover:text-white transition">
              ← {lang === 'en' ? 'Home' : 'Inicio'}
            </Link>
          </div>
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
