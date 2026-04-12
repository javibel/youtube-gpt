import Link from 'next/link';
import { FaBolt, FaFileAlt, FaImage, FaMobileAlt, FaPenFancy, FaCheckCircle } from 'react-icons/fa';

const features = [
  { icon: FaBolt, title: 'Títulos virales', desc: 'Genera títulos optimizados para el algoritmo de YouTube que disparan el CTR.' },
  { icon: FaFileAlt, title: 'Descripciones SEO', desc: 'Descripciones con palabras clave que posicionan tu vídeo en los primeros resultados.' },
  { icon: FaPenFancy, title: 'Scripts completos', desc: 'Guiones estructurados con gancho, desarrollo y llamada a la acción.' },
  { icon: FaMobileAlt, title: 'Captions para redes', desc: 'Textos adaptados para Instagram, TikTok y Twitter desde tu contenido de YouTube.' },
  { icon: FaImage, title: 'Conceptos de miniaturas', desc: 'Ideas visuales para miniaturas que generan curiosidad y consiguen más clics.' },
];

const freeFeatures = ['10 generaciones al mes', '5 tipos de contenido', 'Historial de generaciones'];
const proFeatures = ['200 generaciones al mes', '5 tipos de contenido', 'Historial completo', 'Soporte prioritario', 'Acceso a nuevas funciones antes que nadie'];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* Nav */}
      <nav className="border-b border-white/5 px-6 py-4 sticky top-0 z-50 bg-gray-950/90 backdrop-blur">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <span className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            YTubViral
          </span>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-gray-400 hover:text-white text-sm transition">
              Iniciar sesión
            </Link>
            <Link href="/signup" className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
              Empezar gratis
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-24 pb-20 text-center">
        <div className="max-w-4xl mx-auto">
          <div className="inline-block bg-purple-500/10 border border-purple-500/30 text-purple-400 text-xs font-semibold px-4 py-1.5 rounded-full mb-6 tracking-wide uppercase">
            IA para creadores de YouTube
          </div>
          <h1 className="text-5xl sm:text-6xl font-extrabold leading-tight mb-6">
            Crea contenido viral
            <br />
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              en segundos con IA
            </span>
          </h1>
          <p className="text-gray-400 text-xl max-w-2xl mx-auto mb-10">
            Genera títulos, descripciones, scripts, captions y conceptos de miniaturas optimizados para el algoritmo de YouTube. Sin bloqueos creativos.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/signup" className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold px-8 py-4 rounded-xl text-lg transition shadow-lg shadow-purple-900/30">
              Empezar gratis →
            </Link>
            <Link href="/login" className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold px-8 py-4 rounded-xl text-lg transition">
              Ya tengo cuenta
            </Link>
          </div>
          <p className="text-gray-600 text-sm mt-4">Sin tarjeta de crédito · 10 generaciones gratis al mes</p>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20 bg-gray-900/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold mb-3">Todo lo que necesitas para crecer en YouTube</h2>
            <p className="text-gray-400">5 herramientas de contenido impulsadas por inteligencia artificial</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-gray-900 border border-white/5 rounded-2xl p-6 hover:border-purple-500/40 transition group">
                <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-purple-500/20 transition">
                  <Icon className="text-purple-400" size={20} />
                </div>
                <h3 className="text-white font-semibold text-lg mb-2">{title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
            {/* Extra card: CTA */}
            <div className="bg-gradient-to-br from-purple-900/40 to-blue-900/40 border border-purple-500/30 rounded-2xl p-6 flex flex-col justify-center items-center text-center">
              <p className="text-white font-semibold text-lg mb-3">¿Listo para empezar?</p>
              <Link href="/signup" className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-5 py-2.5 rounded-lg transition text-sm">
                Crear cuenta gratis
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="px-6 py-20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold mb-3">Planes simples y transparentes</h2>
            <p className="text-gray-400">Empieza gratis, escala cuando lo necesites</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Free */}
            <div className="bg-gray-900 border border-white/5 rounded-2xl p-8">
              <p className="text-gray-400 text-sm font-semibold uppercase tracking-wide mb-2">Gratuito</p>
              <div className="flex items-end gap-1 mb-6">
                <span className="text-5xl font-extrabold text-white">0€</span>
                <span className="text-gray-500 mb-2">/mes</span>
              </div>
              <ul className="space-y-3 mb-8">
                {freeFeatures.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-gray-300 text-sm">
                    <FaCheckCircle className="text-gray-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="block text-center bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold py-3 rounded-xl transition">
                Empezar gratis
              </Link>
            </div>

            {/* Pro */}
            <div className="bg-gradient-to-b from-purple-900/50 to-gray-900 border border-purple-500/40 rounded-2xl p-8 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-purple-500 to-blue-500 text-white text-xs font-bold px-4 py-1 rounded-full">
                MÁS POPULAR
              </div>
              <p className="text-purple-400 text-sm font-semibold uppercase tracking-wide mb-2">Pro</p>
              <div className="flex items-end gap-1 mb-6">
                <span className="text-5xl font-extrabold text-white">9,99€</span>
                <span className="text-gray-500 mb-2">/mes</span>
              </div>
              <ul className="space-y-3 mb-8">
                {proFeatures.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-gray-300 text-sm">
                    <FaCheckCircle className="text-purple-400 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="block text-center bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-purple-900/30">
                Empezar con Pro →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 px-6 py-10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <span className="text-gray-600 text-sm">© 2026 YTubViral · ytbeviral@gmail.com</span>
          <div className="flex gap-6 text-sm text-gray-600">
            <Link href="/terms" className="hover:text-gray-400 transition">Términos</Link>
            <Link href="/privacy" className="hover:text-gray-400 transition">Privacidad</Link>
            <Link href="/legal" className="hover:text-gray-400 transition">Aviso Legal</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
