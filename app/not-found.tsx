import Link from 'next/link';
import { getServerLang } from '@/lib/server-lang';

export default async function NotFound() {
  const lang = getServerLang();
  const isEn = lang === 'en';

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      <div className="text-center max-w-md px-6">
        <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-4" style={{ color: 'var(--red)' }}>
          404
        </p>
        <h1 className="font-display font-bold text-3xl text-white mb-4">
          {isEn ? 'Page not found' : 'Página no encontrada'}
        </h1>
        <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
          {isEn
            ? "The page you're looking for doesn't exist or has been moved."
            : 'La página que buscas no existe o ha sido movida.'}
        </p>
        <Link href="/" className="btn-offset px-6 py-2.5 text-sm font-display">
          {isEn ? 'Back to home' : 'Volver al inicio'}
        </Link>
      </div>
    </div>
  );
}
