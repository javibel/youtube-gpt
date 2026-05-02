import type { Metadata } from 'next';
import Link from 'next/link';
import { ExtensionDetector } from './ExtensionDetector';

export const metadata: Metadata = {
  title: 'Extensión de Chrome — YTubViral',
  description:
    'Instala la extensión de YTubViral para Chrome y analiza canales, keywords y genera títulos directamente desde YouTube.',
  alternates: { canonical: 'https://ytubviral.com/extension' },
};

const CHROME_STORE_URL = 'https://chromewebstore.google.com/detail/ytubviral-para-youtube/gkjecjfhdmfbhhcemcjdkjkcdbljkcfh';

const steps = [
  {
    num: 1,
    title: 'Instala la extensión',
    desc: 'Haz clic en el botón de abajo. Se abrirá la Chrome Web Store. Pulsa "Añadir a Chrome" y confirma.',
  },
  {
    num: 2,
    title: 'Inicia sesión',
    desc: 'Haz clic en el icono de YTubViral en la barra de Chrome e introduce tu email y contraseña de ytubviral.com.',
  },
  {
    num: 3,
    title: 'Ve a YouTube',
    desc: 'Abre cualquier vídeo, canal o resultado de búsqueda en YouTube. El panel de YTubViral aparecerá automáticamente.',
  },
];

const features = [
  {
    title: 'Análisis de canales',
    desc: 'Desde cualquier vídeo o canal: suscriptores, vistas totales, frecuencia de publicación y keywords que usa el canal.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 3v18h18"/><path d="m7 16 4-8 4 5 5-7"/>
      </svg>
    ),
  },
  {
    title: 'Keywords en búsquedas',
    desc: 'Al buscar en YouTube, ves al instante la competencia, oportunidad y keywords relacionadas para ese término.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
    ),
  },
  {
    title: 'Títulos con IA',
    desc: 'Genera 5 títulos virales para cualquier vídeo con un solo clic, sin salir de YouTube.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
      </svg>
    ),
  },
];

export default function ExtensionPage() {
  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>

      {/* Nav */}
      <header className="border-b" style={{ borderColor: 'var(--line)', background: 'rgba(10,10,10,0.92)' }}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="13" stroke="#9B2020" strokeWidth="2.2"/>
              <polygon points="13,10.5 13,21.5 23,16" fill="#9B2020"/>
            </svg>
            <span className="font-display font-bold text-[16px] tracking-tight">YTubViral<span style={{ color: 'var(--red)' }}>.</span>com</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="font-mono-jb text-[11px] tracking-wider text-zinc-500 hover:text-white transition">Iniciar sesión</Link>
            <Link href="/signup" className="btn-offset px-4 py-1.5 text-[11px] font-display">Crear cuenta gratis</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 py-20 text-center">
        <p className="font-mono-jb text-[11px] tracking-[0.3em] uppercase mb-6" style={{ color: 'var(--red)' }}>
          CHROME EXTENSION
        </p>

        <h1 className="font-display font-bold text-4xl md:text-5xl mb-6 leading-tight">
          YTubViral directamente
          <span style={{ color: 'var(--red)' }}> en YouTube</span>
        </h1>

        <p className="text-zinc-400 text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
          Analiza canales, investiga keywords y genera títulos con IA sin salir de YouTube.
          Instálalo en segundos, funciona con tu cuenta de ytubviral.com.
        </p>

        <ExtensionDetector
          installUrl={CHROME_STORE_URL}
          installLabel="Instalar extensión — Es gratis"
          installedLabel="Extensión instalada"
        />
      </section>

      {/* Features */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <h2 className="font-display font-bold text-2xl text-center mb-10">¿Qué hace la extensión?</h2>
        <div className="grid md:grid-cols-3 gap-5">
          {features.map(f => (
            <div key={f.title} className="soft-card p-6">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-4" style={{ background: 'rgba(232,77,91,0.12)', color: 'var(--red)' }}>
                {f.icon}
              </div>
              <h3 className="font-display font-bold text-sm mb-2">{f.title}</h3>
              <p className="text-zinc-500 text-xs leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <h2 className="font-display font-bold text-2xl text-center mb-10">Cómo instalarla</h2>
        <div className="flex flex-col gap-5 max-w-xl mx-auto">
          {steps.map(s => (
            <div key={s.num} className="flex gap-5 items-start">
              <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-lg"
                style={{ background: 'var(--red)', color: '#fff', boxShadow: '0 6px 18px -6px rgba(232,77,91,0.6)' }}>
                {s.num}
              </div>
              <div>
                <div className="font-display font-semibold text-sm mb-1">{s.title}</div>
                <div className="text-zinc-500 text-xs leading-relaxed">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA bottom */}
      <section className="border-t py-16" style={{ borderColor: 'var(--line)' }}>
        <div className="max-w-2xl mx-auto px-6 text-center">
          <p className="text-zinc-600 text-xs mb-5">
            Necesitas una cuenta en ytubviral.com para usar la extensión.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/signup" className="btn-offset px-6 py-2.5 text-sm font-display">
              Crear cuenta gratis
            </Link>
            <Link href="/dashboard" className="btn-offset-ghost px-6 py-2.5 text-sm font-display" style={{ background: 'transparent', color: 'var(--text)' }}>
              Ir al dashboard
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
