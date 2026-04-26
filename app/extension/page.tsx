import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Extensión de Chrome — YTubViral',
  description:
    'Instala la extensión de YTubViral para Chrome y analiza canales, keywords y genera títulos directamente desde YouTube.',
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
    icon: '📊',
    title: 'Análisis de canales',
    desc: 'Desde cualquier vídeo o canal: suscriptores, vistas totales, frecuencia de publicación y keywords que usa el canal.',
  },
  {
    icon: '🔍',
    title: 'Keywords en búsquedas',
    desc: 'Al buscar en YouTube, ves al instante la competencia, oportunidad y keywords relacionadas para ese término.',
  },
  {
    icon: '✨',
    title: 'Títulos con IA',
    desc: 'Genera 5 títulos virales para cualquier vídeo con un solo clic, sin salir de YouTube.',
  },
];

export default function ExtensionPage() {
  return (
    <main className="min-h-screen bg-black text-white">

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 py-20 text-center">
        <div className="inline-flex items-center gap-2 bg-red-950 border border-red-800 text-red-400 text-sm px-4 py-1.5 rounded-full mb-8">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
          Extensión para Chrome
        </div>

        <h1 className="text-4xl md:text-5xl font-extrabold mb-6 leading-tight">
          YTubViral directamente
          <span className="text-red-500"> en YouTube</span>
        </h1>

        <p className="text-gray-400 text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
          Analiza canales, investiga keywords y genera títulos con IA sin salir de YouTube.
          Instálalo en segundos, funciona con tu cuenta de ytubviral.com.
        </p>

        <a
          href={CHROME_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-3 bg-red-600 hover:bg-red-700 text-white font-bold text-lg px-8 py-4 rounded-xl transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
          </svg>
          Instalar extensión — Es gratis
        </a>
      </section>

      {/* Features */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold text-center mb-10">¿Qué hace la extensión?</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {features.map(f => (
            <div key={f.title} className="bg-gray-950 border border-gray-800 rounded-2xl p-6">
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="font-bold text-lg mb-2">{f.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold text-center mb-10">Cómo instalarla</h2>
        <div className="flex flex-col gap-4">
          {steps.map(s => (
            <div key={s.num} className="flex gap-5 items-start">
              <div className="flex-shrink-0 w-10 h-10 bg-red-600 rounded-full flex items-center justify-center font-bold text-lg">
                {s.num}
              </div>
              <div>
                <div className="font-semibold text-base mb-1">{s.title}</div>
                <div className="text-gray-400 text-sm leading-relaxed">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA bottom */}
      <section className="border-t border-gray-900 py-16">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <p className="text-gray-500 text-sm mb-4">
            Necesitas una cuenta en ytubviral.com para usar la extensión.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/signup"
              className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              Crear cuenta gratis
            </Link>
            <Link
              href="/dashboard"
              className="border border-gray-700 hover:border-gray-500 text-gray-300 font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              Ir al dashboard
            </Link>
          </div>
        </div>
      </section>

    </main>
  );
}
