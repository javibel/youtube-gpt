'use client';

import { useState } from 'react';
import { useLang } from '@/components/LangProvider';
import PublicNav from '@/components/PublicNav';

export default function EmbedPage() {
  const lang = useLang();
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const [copied, setCopied] = useState(false);

  const snippet = `<iframe
  src="https://ytubviral.com/embed/seo-score"
  width="100%"
  height="400"
  frameborder="0"
  style="border-radius:12px;border:1px solid #222;"
></iframe>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      <PublicNav />

      <div className="max-w-3xl mx-auto px-6 py-16">
        <header className="mb-12">
          <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--yv-brand)' }}>
            {t('WIDGET EMBEBIBLE', 'EMBEDDABLE WIDGET')}
          </p>
          <h1 className="font-display font-bold text-4xl text-white mb-4">
            {t('Añade el SEO Score a tu web', 'Add SEO Score to your website')}
          </h1>
          <p className="font-mono-jb text-sm leading-relaxed" style={{ color: 'var(--yv-text-3)' }}>
            {t(
              'Ofrece a tus visitantes un analizador SEO de YouTube gratuito. Copia el código y pégalo en tu HTML.',
              'Give your visitors a free YouTube SEO analyzer. Copy the code and paste it into your HTML.'
            )}
          </p>
        </header>

        {/* Code snippet */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <p className="font-mono-jb text-[13px] uppercase tracking-wider" style={{ color: 'var(--yv-text-4)' }}>HTML</p>
            <button
              onClick={handleCopy}
              className="font-mono-jb text-[13px] px-3 py-1 rounded-lg transition"
              style={{
                background: copied ? 'rgba(0,255,163,0.1)' : 'rgba(255,255,255,0.05)',
                border: copied ? '1px solid rgba(0,255,163,0.3)' : '1px solid var(--yv-border)',
                color: copied ? '#00FFA3' : 'var(--yv-text-2)',
              }}
            >
              {copied ? t('Copiado ✓', 'Copied ✓') : t('Copiar código', 'Copy code')}
            </button>
          </div>
          <pre
            className="p-5 rounded-xl overflow-x-auto font-mono-jb text-[13px] leading-relaxed"
            style={{ background: '#111', border: '1px solid var(--yv-border)', color: '#a1a1aa' }}
          >
            {snippet}
          </pre>
        </div>

        {/* Live preview */}
        <div className="mb-12">
          <p className="font-mono-jb text-[13px] uppercase tracking-wider mb-3" style={{ color: 'var(--yv-text-4)' }}>
            {t('PREVIEW EN VIVO', 'LIVE PREVIEW')}
          </p>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--yv-border)' }}>
            <iframe
              src="/embed/seo-score"
              width="100%"
              height={400}
              style={{ border: 'none', borderRadius: 12 }}
            />
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {[
            { icon: '⚡', title: t('Gratis', 'Free'), desc: t('Sin límites de uso ni API key.', 'No usage limits, no API key.') },
            { icon: '🎨', title: t('Responsive', 'Responsive'), desc: t('Se adapta a cualquier ancho.', 'Adapts to any width.') },
            { icon: '🔗', title: t('Backlink incluido', 'Backlink included'), desc: t('Link a YTubViral para atribución.', 'Links to YTubViral for attribution.') },
          ].map(f => (
            <div key={f.title} className="p-5 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--yv-border)' }}>
              <p className="text-2xl mb-2">{f.icon}</p>
              <p className="font-display font-bold text-sm text-white mb-1">{f.title}</p>
              <p className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-3)' }}>{f.desc}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center p-8 rounded-xl" style={{ background: 'rgba(232,77,91,0.04)', border: '1px solid rgba(232,77,91,0.15)' }}>
          <p className="font-display font-bold text-white text-lg mb-2">
            {t('¿Quieres el toolkit completo?', 'Want the full toolkit?')}
          </p>
          <p className="font-mono-jb text-sm mb-4" style={{ color: 'var(--yv-text-3)' }}>
            {t('14 herramientas de IA para optimizar tu canal de YouTube.', '14 AI tools to optimize your YouTube channel.')}
          </p>
          <a href="/signup" className="btn-offset inline-flex px-8 py-3.5 text-sm font-display font-bold">
            {t('Crear cuenta gratis →', 'Create free account →')}
          </a>
        </div>
      </div>
    </div>
  );
}
