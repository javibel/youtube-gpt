import Link from 'next/link';
import LangToggle from '@/components/LangToggle';
import { getServerLang } from '@/lib/server-lang';

export default async function FeaturesLayout({ children }: { children: React.ReactNode }) {
  const lang = getServerLang();

  return (
    <>
      <nav className="sticky top-0 z-50 backdrop-blur-xl" style={{ background: 'rgba(12,10,15,0.72)', boxShadow: 'inset 0 -1px 0 rgba(255,255,255,.08)' }}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1.5">
            <svg width="16" height="16" viewBox="7 7 18 18" fill="none">
              <circle cx="16" cy="16" r="8" fill="#e84d5b"/>
            </svg>
            <span className="font-display font-bold text-[15px] tracking-tight text-white">
              YTubViral<span style={{ color: 'var(--red)' }}>.</span>com
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <LangToggle />
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
