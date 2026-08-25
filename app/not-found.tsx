import Link from 'next/link';
import { getServerLang } from '@/lib/server-lang';

export default async function NotFound() {
  const lang = getServerLang();
  const isEn = lang === 'en';

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--yv-light)', color: 'var(--yv-text-1)' }}>
      <div className="text-center max-w-md px-6">
        <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-4" style={{ color: 'var(--yv-brand-lift)' }}>
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

        <div className="mt-10 pt-8" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,.08)' }}>
          <p className="font-mono-jb text-[12px] tracking-[0.2em] uppercase mb-4" style={{ color: 'var(--yv-text-4, #71717a)' }}>
            {isEn ? 'Or try one of these' : 'O prueba una de estas'}
          </p>
          <div className="flex flex-col gap-2 items-center">
            <Link href="/seo-score" className="text-zinc-400 text-sm hover:text-white transition">
              {isEn ? 'Free SEO Score' : 'SEO Score gratis'}
            </Link>
            <Link href="/title-analyzer" className="text-zinc-400 text-sm hover:text-white transition">
              {isEn ? 'Title Analyzer' : 'Analizador de títulos'}
            </Link>
            <Link href="/tools" className="text-zinc-400 text-sm hover:text-white transition">
              {isEn ? 'All free tools' : 'Todas las herramientas gratis'}
            </Link>
            <Link href="/blog" className="text-zinc-400 text-sm hover:text-white transition">
              Blog
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
