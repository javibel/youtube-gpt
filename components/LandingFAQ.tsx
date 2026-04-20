'use client';

import { useState } from 'react';

type Lang = 'es' | 'en';

const FAQ_ITEMS: Record<Lang, { q: string; a: string }[]> = {
  es: [
    { q: '¿Qué IA usáis por debajo?', a: 'Un stack propio sobre modelos de última generación (Claude Sonnet) con prompts entrenados específicamente en patrones de vídeos virales reales. No es un wrapper genérico: es contexto de YouTube puro.' },
    { q: '¿Sustituye a mi creatividad?', a: 'Al revés. Te quita la parte mecánica (keywords, frameworks, estructura) para que dediques tu energía a grabar, editar y hablarle a tu audiencia. Piensa en YTubViral como tu asistente, no tu guionista.' },
    { q: '¿Sirve para canales pequeños?', a: 'Sí, especialmente. Cuando empiezas no tienes datos para optimizar — nosotros sí. Los canales de <10K subs son los que más CTR recuperan con nuestros títulos.' },
    { q: '¿Puedo cancelar cuando quiera?', a: 'Un clic desde el panel. Mantienes Pro hasta el final del ciclo pagado, y luego vuelves al plan gratuito sin perder tu historial.' },
    { q: '¿En qué idiomas funciona?', a: 'En español e inglés. El motor adapta frameworks culturales según el idioma seleccionado.' },
    { q: '¿Mis ideas quedan privadas?', a: 'Totalmente. No entrenamos ningún modelo con tus prompts ni outputs. Tu contenido es tuyo. Encriptado en reposo y en tránsito.' },
  ],
  en: [
    { q: 'What AI do you use under the hood?', a: 'A custom stack built on latest-generation models (Claude Sonnet) with prompts specifically trained on real viral video patterns. Not a generic wrapper — pure YouTube context.' },
    { q: 'Does it replace my creativity?', a: 'Quite the opposite. It removes the mechanical parts (keywords, frameworks, structure) so you can focus your energy on filming, editing and talking to your audience. Think of YTubViral as your assistant, not your ghostwriter.' },
    { q: 'Does it work for small channels?', a: "Yes, especially. When you're starting out you don't have data to optimize with — we do. Channels under 10K subs see the biggest CTR gains from our titles." },
    { q: 'Can I cancel whenever I want?', a: 'One click from your dashboard. You keep Pro until the end of the paid cycle, then go back to the free plan without losing your history.' },
    { q: 'What languages does it support?', a: 'Spanish and English. The engine adapts cultural frameworks based on the selected language.' },
    { q: 'Are my ideas kept private?', a: "Completely. We don't train any model with your prompts or outputs. Your content is yours. Encrypted at rest and in transit." },
  ],
};

export default function LandingFAQ({ lang = 'es' }: { lang?: Lang }) {
  const [open, setOpen] = useState<number | null>(null);
  const items = FAQ_ITEMS[lang];

  return (
    <section className="border-b border-white/10" style={{ background: '#0B0B0D' }}>
      <div className="max-w-4xl mx-auto px-6 py-24">
        <div className="mb-12">
          <p className="font-mono-jb text-[11px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>08 · FAQ</p>
          <h2 className="font-display font-bold text-4xl md:text-6xl leading-[0.95]">
            {lang === 'en' ? <>Questions before<br />you hit the button.</> : <>Preguntas antes<br />de apretar el botón.</>}
          </h2>
        </div>

        <div className="border-t border-white/10">
          {items.map((item, i) => (
            <div key={i} className="border-b border-white/10">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full text-left py-6 flex items-center gap-5 group"
              >
                <span className="font-mono-jb text-[10px] text-zinc-600">{String(i + 1).padStart(2, '0')}</span>
                <span className="font-display font-semibold text-lg md:text-xl flex-1 transition" style={{ color: open === i ? 'var(--red)' : '#f4f4f5' }}>
                  {item.q}
                </span>
                <span
                  className="w-8 h-8 flex items-center justify-center border text-xl transition"
                  style={{
                    borderColor: open === i ? 'var(--red)' : 'rgba(255,255,255,0.20)',
                    background: open === i ? 'var(--red)' : 'transparent',
                    transform: open === i ? 'rotate(45deg)' : 'none',
                  }}
                >+</span>
              </button>
              {open === i && (
                <div className="pb-6 pl-10 pr-12 text-zinc-400 leading-relaxed max-w-3xl page-enter">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
