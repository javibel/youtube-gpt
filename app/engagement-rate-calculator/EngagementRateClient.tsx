'use client';

import { useState, useMemo } from 'react';
import { useLang } from '@/components/LangProvider';
import PublicNav from '@/components/PublicNav';
import ExitIntentPopup from '@/components/ExitIntentPopup';
import FreeToolsCrossLinks from '@/components/FreeToolsCrossLinks';

interface Tier {
  max: number;
  label: { es: string; en: string };
  color: string;
}

// Engagement rate por vistas (likes + comentarios) / vistas. Rangos generales — no datos oficiales.
const TIERS: Tier[] = [
  { max: 2, label: { es: 'Bajo', en: 'Low' }, color: '#e84d5b' },
  { max: 4, label: { es: 'Normal', en: 'Average' }, color: '#FFE800' },
  { max: 6, label: { es: 'Bueno', en: 'Good' }, color: '#7CFF00' },
  { max: 10, label: { es: 'Excelente', en: 'Excellent' }, color: '#22c55e' },
  { max: Infinity, label: { es: 'Excepcional', en: 'Exceptional' }, color: '#00E5FF' },
];

function tierFor(rate: number): Tier {
  return TIERS.find(t => rate < t.max) ?? TIERS[TIERS.length - 1];
}

function num(s: string): number {
  const n = parseFloat(s.replace(/[^\d.]/g, ''));
  return isNaN(n) ? 0 : n;
}

export default function EngagementRateClient() {
  const lang = useLang();
  const t = (es: string, en: string) => (lang === 'en' ? en : es);

  const [views, setViews] = useState('');
  const [likes, setLikes] = useState('');
  const [comments, setComments] = useState('');

  const result = useMemo(() => {
    const v = num(views);
    if (v <= 0) return null;
    const l = num(likes);
    const c = num(comments);
    const rate = ((l + c) / v) * 100;
    return { rate, tier: tierFor(rate), v, l, c };
  }, [views, likes, comments]);

  const FAQ = [
    {
      q: { es: '¿Cómo se calcula el engagement rate en YouTube?', en: 'How is YouTube engagement rate calculated?' },
      a: { es: 'La fórmula más común es (likes + comentarios) ÷ vistas × 100. Mide qué porcentaje de los que vieron el vídeo interactuaron de forma activa. Algunos creadores también suman las veces compartido o lo calculan sobre suscriptores.', en: 'The most common formula is (likes + comments) ÷ views × 100. It measures what percentage of viewers actively interacted. Some creators also add shares or calculate it over subscribers.' },
    },
    {
      q: { es: '¿Qué es un buen engagement rate?', en: 'What is a good engagement rate?' },
      a: { es: 'Sobre vistas, un 2-4% es normal, un 4-6% es bueno y por encima del 6% es excelente. Los canales pequeños suelen tener engagement más alto porque su audiencia es más fiel. Varía mucho según el formato y el nicho.', en: 'Over views, 2-4% is average, 4-6% is good and above 6% is excellent. Smaller channels often have higher engagement because their audience is more loyal. It varies a lot by format and niche.' },
    },
    {
      q: { es: '¿Por qué importa el engagement?', en: 'Why does engagement matter?' },
      a: { es: 'YouTube usa las señales de interacción para decidir a quién recomendar el vídeo. Un buen engagement indica que el contenido conecta, y eso ayuda a que el algoritmo lo distribuya más. Pedir likes y comentarios de forma natural en el vídeo sube la tasa.', en: 'YouTube uses interaction signals to decide who to recommend the video to. Good engagement signals that the content connects, which helps the algorithm distribute it more. Naturally asking for likes and comments in the video raises the rate.' },
    },
    {
      q: { es: '¿Esta calculadora es gratis?', en: 'Is this calculator free?' },
      a: { es: 'Sí, gratis y sin registro. El cálculo se hace al instante en tu navegador. Con una cuenta gratuita puedes analizar el rendimiento completo de tu canal, no solo un vídeo.', en: 'Yes, free and no signup. The calculation runs instantly in your browser. With a free account you can analyze your full channel performance, not just one video.' },
    },
  ];

  const fields: { label: { es: string; en: string }; value: string; set: (v: string) => void; placeholder: { es: string; en: string }; autoFocus?: boolean }[] = [
    { label: { es: 'Vistas', en: 'Views' }, value: views, set: setViews, placeholder: { es: 'Ej. 50000', en: 'e.g. 50000' }, autoFocus: true },
    { label: { es: 'Likes', en: 'Likes' }, value: likes, set: setLikes, placeholder: { es: 'Ej. 1800', en: 'e.g. 1800' } },
    { label: { es: 'Comentarios', en: 'Comments' }, value: comments, set: setComments, placeholder: { es: 'Ej. 200', en: 'e.g. 200' } },
  ];

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      <PublicNav />

      <div className="max-w-3xl mx-auto px-6 py-12">
        <header className="mb-10">
          <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--yv-brand)' }}>
            {t('HERRAMIENTA GRATIS', 'FREE TOOL')}
          </p>
          <h1 className="font-display font-bold text-4xl text-white mb-4">
            {t('Calculadora de Engagement Rate de YouTube', 'YouTube Engagement Rate Calculator')}
          </h1>
          <p className="font-mono-jb text-sm leading-relaxed" style={{ color: 'var(--yv-text-3)' }}>
            {t(
              'Introduce las vistas, likes y comentarios de un vídeo para calcular su tasa de engagement y compararla con los benchmarks de YouTube. Sin registro, al instante.',
              'Enter a video\'s views, likes and comments to calculate its engagement rate and benchmark it against YouTube averages. No signup, instant.'
            )}
          </p>
        </header>

        {/* Inputs */}
        <div className="grid sm:grid-cols-3 gap-4 mb-6">
          {fields.map((f, i) => (
            <div key={i}>
              <label className="block font-mono-jb text-[12px] mb-2" style={{ color: 'var(--yv-text-3)' }}>
                {lang === 'en' ? f.label.en : f.label.es}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={f.value}
                onChange={e => f.set(e.target.value)}
                placeholder={lang === 'en' ? f.placeholder.en : f.placeholder.es}
                autoFocus={f.autoFocus}
                className="w-full px-4 py-3.5 rounded-xl text-base font-mono-jb"
                style={{ background: 'var(--yv-surface)', border: '1px solid var(--yv-border)', color: 'var(--yv-text)', outline: 'none' }}
                onFocus={e => { e.target.style.borderColor = 'var(--yv-brand)'; }}
                onBlur={e => { e.target.style.borderColor = 'var(--yv-border)'; }}
              />
            </div>
          ))}
        </div>

        {!result && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">❤️</div>
            <p className="font-mono-jb text-sm" style={{ color: 'var(--yv-text-2)' }}>
              {t('Introduce vistas, likes y comentarios para calcular el engagement.', 'Enter views, likes and comments to calculate engagement.')}
            </p>
          </div>
        )}

        {result && (
          <>
            <div className="rounded-xl p-6 mb-6 text-center" style={{ background: `${result.tier.color}1a`, border: `1px solid ${result.tier.color}33` }}>
              <span className="text-5xl font-bold font-mono-jb" style={{ color: result.tier.color }}>{result.rate.toFixed(2)}%</span>
              <p className="font-mono-jb text-sm mt-1" style={{ color: result.tier.color }}>
                {t('Engagement rate', 'Engagement rate')} · {lang === 'en' ? result.tier.label.en : result.tier.label.es}
              </p>
            </div>

            {/* Barra de benchmark */}
            <div className="mb-6">
              <div className="flex h-3 rounded-full overflow-hidden" style={{ border: '1px solid var(--yv-border)' }}>
                <div style={{ width: '20%', background: '#e84d5b' }} />
                <div style={{ width: '20%', background: '#FFE800' }} />
                <div style={{ width: '20%', background: '#7CFF00' }} />
                <div style={{ width: '40%', background: '#22c55e' }} />
              </div>
              <div className="flex justify-between mt-1.5 font-mono-jb text-[11px]" style={{ color: 'var(--yv-text-4)' }}>
                <span>0%</span><span>2%</span><span>4%</span><span>6%</span><span>10%+</span>
              </div>
            </div>

            <div className="rounded-xl p-5 mb-10" style={{ background: 'var(--yv-surface)', border: '1px solid var(--yv-border)' }}>
              <p className="font-mono-jb text-[13px] leading-relaxed" style={{ color: 'var(--yv-text-2)' }}>
                {t(
                  'Engagement = (likes + comentarios) ÷ vistas × 100. Pedir de forma natural likes y comentarios dentro del vídeo, y responder a los comentarios, es la palanca más rápida para subirlo.',
                  'Engagement = (likes + comments) ÷ views × 100. Naturally asking for likes and comments inside the video, and replying to comments, is the fastest lever to raise it.'
                )}
              </p>
            </div>

            <div className="mb-12 p-8 rounded-xl text-center" style={{ background: 'linear-gradient(135deg, rgba(232,77,91,0.06), rgba(0,229,255,0.04))', border: '1px solid rgba(232,77,91,0.2)' }}>
              <p className="font-display font-bold text-white text-xl mb-2">
                {t('Analiza el engagement de todo tu canal', 'Analyze engagement across your whole channel')}
              </p>
              <p className="font-mono-jb text-sm mb-5" style={{ color: 'var(--yv-text-3)' }}>
                {t('Conecta tu canal gratis y ve qué vídeos conectan más y por qué.', 'Connect your channel for free and see which videos connect most and why.')}
              </p>
              <a href="/signup" className="btn-offset inline-flex px-8 py-3.5 text-sm font-display font-bold">
                {t('Crear cuenta gratis →', 'Create free account →')}
              </a>
            </div>
          </>
        )}

        {/* Contenido educativo (SEO) */}
        <section className="mt-4 border-t pt-10" style={{ borderColor: 'var(--yv-border)' }}>
          <h2 className="font-display font-bold text-2xl text-white mb-4">
            {t('Qué es el engagement rate y por qué importa', 'What engagement rate is and why it matters')}
          </h2>
          <p className="font-mono-jb text-sm leading-relaxed mb-4" style={{ color: 'var(--yv-text-3)' }}>
            {t(
              'El engagement rate mide qué porcentaje de las personas que ven tu vídeo interactúan con él (likes y comentarios). Es una de las señales que YouTube usa para decidir si recomienda el vídeo a más gente: si quienes lo ven reaccionan, el algoritmo lo interpreta como contenido que conecta y lo distribuye más.',
              'Engagement rate measures what percentage of people who watch your video interact with it (likes and comments). It is one of the signals YouTube uses to decide whether to recommend the video to more people: if viewers react, the algorithm reads it as content that connects and distributes it further.'
            )}
          </p>
          <ul className="space-y-3 mb-8">
            {[
              { es: 'Engagement = (likes + comentarios) ÷ vistas × 100.', en: 'Engagement = (likes + comments) ÷ views × 100.' },
              { es: 'Sobre vistas: 2-4% normal, 4-6% bueno, 6%+ excelente.', en: 'Over views: 2-4% average, 4-6% good, 6%+ excellent.' },
              { es: 'Los canales pequeños suelen tener engagement más alto (audiencia fiel).', en: 'Smaller channels often have higher engagement (loyal audience).' },
              { es: 'Pedir interacción de forma natural y responder comentarios sube la tasa.', en: 'Naturally asking for interaction and replying to comments raises the rate.' },
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-3 font-mono-jb text-sm" style={{ color: 'var(--yv-text-2)' }}>
                <span style={{ color: 'var(--yv-brand)' }}>→</span>
                <span>{lang === 'en' ? item.en : item.es}</span>
              </li>
            ))}
          </ul>

          <h2 className="font-display font-bold text-2xl text-white mb-5">
            {t('Preguntas frecuentes', 'Frequently asked questions')}
          </h2>
          <div className="space-y-4 mb-10">
            {FAQ.map((f, i) => (
              <div key={i} className="rounded-xl p-5" style={{ background: 'var(--yv-surface)', border: '1px solid var(--yv-border)' }}>
                <h3 className="text-white font-display font-semibold text-base mb-2">{lang === 'en' ? f.q.en : f.q.es}</h3>
                <p className="font-mono-jb text-[13px] leading-relaxed" style={{ color: 'var(--yv-text-3)' }}>{lang === 'en' ? f.a.en : f.a.es}</p>
              </div>
            ))}
          </div>

          <FreeToolsCrossLinks current="/engagement-rate-calculator" lang={lang} />
        </section>
      </div>

      <ExitIntentPopup lang={lang} />
    </div>
  );
}
