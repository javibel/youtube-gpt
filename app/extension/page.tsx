import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { ExtensionDetector } from './ExtensionDetector';

export const metadata: Metadata = {
  title: 'Chrome Extension — YTubViral',
  description:
    'Install the YTubViral Chrome extension: SEO score, outlier detection, channel stats and AI titles directly on YouTube and YouTube Studio.',
  alternates: { canonical: 'https://ytubviral.com/extension' },
};

type Lang = 'es' | 'en';

const CHROME_STORE_URL = 'https://chromewebstore.google.com/detail/ytubviral-para-youtube/gkjecjfhdmfbhhcemcjdkjkcdbljkcfh';

const COPY = {
  es: {
    login: 'Iniciar sesión',
    signup: 'Crear cuenta gratis',
    badge: 'CHROME EXTENSION v1.4',
    h1: 'YTubViral directamente',
    h1accent: ' en YouTube',
    sub: 'SEO score, detección de outliers, estadísticas de canal y títulos con IA — directamente en YouTube y YouTube Studio. Instálalo en segundos.',
    installLabel: 'Instalar extensión — Es gratis',
    installedLabel: 'Extensión instalada',
    featuresTitle: '¿Qué hace la extensión?',
    features: [
      { title: 'SEO Score en cada vídeo', desc: 'Scorecard con puntuación SEO, checklist de optimización, VPH, engagement y detección de outliers — directamente en la página del vídeo.' },
      { title: 'YouTube Studio integrado', desc: 'Panel SEO completo en el editor de vídeos de Studio. Badges de puntuación en la lista de vídeos. Botón directo para optimizar en YTubViral.' },
      { title: 'Análisis de canales', desc: 'Suscriptores, vistas, frecuencia de publicación, crecimiento 7d/30d con sparkline y estimación de monetización.' },
      { title: 'Keywords en búsquedas', desc: 'Al buscar en YouTube, ves al instante la competencia, oportunidad y keywords relacionadas para ese término.' },
      { title: 'Detección de Outliers', desc: 'Badge pulsante que identifica vídeos con rendimiento excepcional (≥5× la media del canal). Descubre qué funciona mejor.' },
      { title: 'Títulos con IA', desc: 'Genera 5 títulos virales para cualquier vídeo con un solo clic, sin salir de YouTube.' },
    ],
    stepsTitle: 'Cómo instalarla',
    steps: [
      { title: 'Instala la extensión', desc: 'Haz clic en el botón de abajo. Se abrirá la Chrome Web Store. Pulsa "Añadir a Chrome" y confirma.' },
      { title: 'Inicia sesión', desc: 'Haz clic en el icono de YTubViral en la barra de Chrome e introduce tu email y contraseña de ytubviral.com.' },
      { title: 'Ve a YouTube', desc: 'Abre cualquier vídeo, canal o resultado de búsqueda en YouTube. El panel de YTubViral aparecerá automáticamente.' },
    ],
    ctaNote: 'Necesitas una cuenta en ytubviral.com para usar la extensión.',
    ctaDashboard: 'Ir al dashboard',
  },
  en: {
    login: 'Log in',
    signup: 'Create free account',
    badge: 'CHROME EXTENSION v1.4',
    h1: 'YTubViral directly',
    h1accent: ' on YouTube',
    sub: 'SEO score, outlier detection, channel stats and AI titles — directly on YouTube and YouTube Studio. Install in seconds.',
    installLabel: 'Install extension — It\'s free',
    installedLabel: 'Extension installed',
    featuresTitle: 'What does the extension do?',
    features: [
      { title: 'SEO Score on every video', desc: 'Scorecard with SEO score, optimization checklist, VPH, engagement and outlier detection — right on the video page.' },
      { title: 'YouTube Studio integration', desc: 'Full SEO panel in the Studio video editor. Score badges on the video list. One-click button to optimize in YTubViral.' },
      { title: 'Channel analysis', desc: 'Subscribers, views, upload frequency, 7d/30d growth with sparkline and monetization estimate.' },
      { title: 'Keywords in search', desc: 'When searching on YouTube, instantly see competition, opportunity and related keywords for that term.' },
      { title: 'Outlier Detection', desc: 'Pulsing badge that identifies videos with exceptional performance (≥5× channel average). Discover what works best.' },
      { title: 'AI Titles', desc: 'Generate 5 viral titles for any video with a single click, without leaving YouTube.' },
    ],
    stepsTitle: 'How to install',
    steps: [
      { title: 'Install the extension', desc: 'Click the button below. The Chrome Web Store will open. Click "Add to Chrome" and confirm.' },
      { title: 'Log in', desc: 'Click the YTubViral icon in the Chrome toolbar and enter your ytubviral.com email and password.' },
      { title: 'Go to YouTube', desc: 'Open any video, channel or search result on YouTube. The YTubViral panel will appear automatically.' },
    ],
    ctaNote: 'You need a ytubviral.com account to use the extension.',
    ctaDashboard: 'Go to dashboard',
  },
};

const featureIcons = [
  /* SEO Score */ <svg key="0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
  /* Studio */ <svg key="1" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 7h3v3H7z"/><path d="M14 7h3"/><path d="M14 11h3"/><path d="M7 14h10"/></svg>,
  /* Channel */ <svg key="2" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="m7 16 4-8 4 5 5-7"/></svg>,
  /* Keywords */ <svg key="3" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  /* Outlier */ <svg key="4" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  /* AI Titles */ <svg key="5" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>,
];

export default async function ExtensionPage() {
  const cookieStore = await cookies();
  const lang: Lang = cookieStore.get('ytubviral_lang')?.value === 'en' ? 'en' : 'es';
  const t = COPY[lang];

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>

      {/* Nav */}
      <header className="border-b" style={{ borderColor: 'var(--line)', background: 'rgba(10,10,10,0.92)' }}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <svg width="18" height="18" viewBox="6 6 20 20" fill="none">
              <circle cx="16" cy="16" r="8" fill="#ee4d5e"/>
            </svg>
            <span className="font-display font-bold text-[16px] tracking-tight">YTubViral<span style={{ color: 'var(--red)' }}>.</span>com</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="font-mono-jb text-[13px] tracking-wider text-zinc-500 hover:text-white transition">{t.login}</Link>
            <Link href="/signup" className="btn-offset px-4 py-1.5 text-[13px] font-display">{t.signup}</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 py-20 text-center">
        <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-6" style={{ color: 'var(--red)' }}>
          {t.badge}
        </p>

        <h1 className="font-display font-bold text-4xl md:text-5xl mb-6 leading-tight">
          {t.h1}
          <span style={{ color: 'var(--red)' }}>{t.h1accent}</span>
        </h1>

        <p className="text-zinc-400 text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
          {t.sub}
        </p>

        <ExtensionDetector
          installUrl={CHROME_STORE_URL}
          installLabel={t.installLabel}
          installedLabel={t.installedLabel}
        />
      </section>

      {/* Features */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <h2 className="font-display font-bold text-2xl text-center mb-10">{t.featuresTitle}</h2>
        <div className="grid md:grid-cols-2 gap-5">
          {t.features.map((f, i) => (
            <div key={f.title} className="soft-card p-6">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-4" style={{ background: 'rgba(232,77,91,0.12)', color: 'var(--red)' }}>
                {featureIcons[i]}
              </div>
              <h3 className="font-display font-bold text-sm mb-2">{f.title}</h3>
              <p className="text-zinc-500 text-[13px] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <h2 className="font-display font-bold text-2xl text-center mb-10">{t.stepsTitle}</h2>
        <div className="flex flex-col gap-5 max-w-xl mx-auto">
          {t.steps.map((s, i) => (
            <div key={i} className="flex gap-5 items-start">
              <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-lg"
                style={{ background: 'var(--red)', color: '#fff', boxShadow: '0 6px 18px -6px rgba(232,77,91,0.6)' }}>
                {i + 1}
              </div>
              <div>
                <div className="font-display font-semibold text-sm mb-1">{s.title}</div>
                <div className="text-zinc-500 text-[13px] leading-relaxed">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA bottom */}
      <section className="border-t py-16" style={{ borderColor: 'var(--line)' }}>
        <div className="max-w-2xl mx-auto px-6 text-center">
          <p className="text-zinc-600 text-[13px] mb-5">
            {t.ctaNote}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/signup" className="btn-offset px-6 py-2.5 text-sm font-display">
              {t.signup}
            </Link>
            <Link href="/dashboard" className="btn-offset-ghost px-6 py-2.5 text-sm font-display" style={{ background: 'transparent', color: 'var(--text)' }}>
              {t.ctaDashboard}
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
