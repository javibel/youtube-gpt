'use client';

import { useState, useMemo } from 'react';
import { useLang } from '@/components/LangProvider';
import PublicNav from '@/components/PublicNav';
import ExitIntentPopup from '@/components/ExitIntentPopup';
import FreeToolsCrossLinks from '@/components/FreeToolsCrossLinks';

type Lang = 'es' | 'en';

interface Tier {
  max: number;
  label: { es: string; en: string };
  color: string;
}

// Benchmarks de CTR de impresiones en YouTube (rangos ampliamente citados por YouTube Creator Academy:
// la mayoría de canales están entre 2% y 10%). No son datos oficiales por nicho — son rangos generales.
const TIERS: Tier[] = [
  { max: 2, label: { es: 'Bajo', en: 'Low' }, color: '#e84d5b' },
  { max: 4, label: { es: 'Normal', en: 'Average' }, color: '#FFE800' },
  { max: 6, label: { es: 'Bueno', en: 'Good' }, color: '#7CFF00' },
  { max: 10, label: { es: 'Excelente', en: 'Excellent' }, color: '#22c55e' },
  { max: Infinity, label: { es: 'Excepcional', en: 'Exceptional' }, color: '#00E5FF' },
];

function tierFor(ctr: number): Tier {
  return TIERS.find(t => ctr < t.max) ?? TIERS[TIERS.length - 1];
}

function fmt(n: number): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export default function CtrCalculatorClient() {
  const lang = useLang();
  const t = (es: string, en: string) => (lang === 'en' ? en : es);

  const [impressions, setImpressions] = useState('');
  const [clicks, setClicks] = useState('');

  const result = useMemo(() => {
    const imp = parseFloat(impressions.replace(/[^\d.]/g, ''));
    const clk = parseFloat(clicks.replace(/[^\d.]/g, ''));
    if (!imp || imp <= 0 || isNaN(clk) || clk < 0) return null;
    const ctr = (clk / imp) * 100;
    const tier = tierFor(ctr);
    // ¿Cuántos clics extra si subes el CTR 1 punto?
    const extraPerPoint = Math.round(imp * 0.01);
    return { ctr, tier, extraPerPoint, imp, clk };
  }, [impressions, clicks]);

  const FAQ = [
    {
      q: { es: '¿Qué es un buen CTR en YouTube?', en: 'What is a good CTR on YouTube?' },
      a: { es: 'La mayoría de los vídeos tienen un CTR de impresiones de entre 2% y 10%. Por debajo de 2% suele indicar que la miniatura o el título no atraen; entre 4% y 6% es un buen rango; por encima de 6% es excelente. El CTR varía mucho según el nicho, el tamaño del canal y la fuente de tráfico.', en: 'Most videos have an impressions CTR between 2% and 10%. Below 2% usually means the thumbnail or title isn\'t pulling clicks; 4% to 6% is a good range; above 6% is excellent. CTR varies a lot by niche, channel size and traffic source.' },
    },
    {
      q: { es: '¿Cómo se calcula el CTR?', en: 'How is CTR calculated?' },
      a: { es: 'CTR = (clics ÷ impresiones) × 100. Si tu vídeo tuvo 10.000 impresiones y 500 clics, tu CTR es del 5%. Una impresión cuenta cada vez que tu miniatura se muestra a alguien en YouTube.', en: 'CTR = (clicks ÷ impressions) × 100. If your video had 10,000 impressions and 500 clicks, your CTR is 5%. An impression counts every time your thumbnail is shown to someone on YouTube.' },
    },
    {
      q: { es: '¿Un CTR muy alto siempre es bueno?', en: 'Is a very high CTR always good?' },
      a: { es: 'No necesariamente. Un CTR altísimo con poca retención puede indicar clickbait: la gente entra pero se va enseguida, y YouTube deja de recomendar el vídeo. El objetivo es un buen CTR junto a una buena retención.', en: 'Not necessarily. A very high CTR with low retention can signal clickbait: people click but leave quickly, and YouTube stops recommending the video. The goal is a good CTR alongside good retention.' },
    },
    {
      q: { es: '¿Esta calculadora es gratis?', en: 'Is this calculator free?' },
      a: { es: 'Sí, gratis y sin registro. El cálculo se hace al instante en tu navegador. Si quieres comparar miniaturas y títulos con A/B testing real, puedes crear una cuenta gratuita.', en: 'Yes, free and no signup. The calculation runs instantly in your browser. If you want to compare thumbnails and titles with real A/B testing, you can create a free account.' },
    },
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
            {t('Calculadora de CTR de YouTube', 'YouTube CTR Calculator')}
          </h1>
          <p className="font-mono-jb text-sm leading-relaxed" style={{ color: 'var(--yv-text-3)' }}>
            {t(
              'Introduce tus impresiones y clics para calcular el CTR (click-through rate) y compáralo al instante con los benchmarks de YouTube. Sin registro, sin tarjeta.',
              'Enter your impressions and clicks to calculate your CTR (click-through rate) and instantly benchmark it against YouTube averages. No signup, no card.'
            )}
          </p>
        </header>

        {/* Inputs */}
        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block font-mono-jb text-[12px] mb-2" style={{ color: 'var(--yv-text-3)' }}>
              {t('Impresiones', 'Impressions')}
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={impressions}
              onChange={e => setImpressions(e.target.value)}
              placeholder={t('Ej. 10000', 'e.g. 10000')}
              className="w-full px-4 py-3.5 rounded-xl text-base font-mono-jb"
              autoFocus
              style={{ background: 'var(--yv-surface)', border: '1px solid var(--yv-border)', color: 'var(--yv-text)', outline: 'none' }}
              onFocus={e => { e.target.style.borderColor = 'var(--yv-brand)'; }}
              onBlur={e => { e.target.style.borderColor = 'var(--yv-border)'; }}
            />
          </div>
          <div>
            <label className="block font-mono-jb text-[12px] mb-2" style={{ color: 'var(--yv-text-3)' }}>
              {t('Clics (vistas desde impresiones)', 'Clicks (views from impressions)')}
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={clicks}
              onChange={e => setClicks(e.target.value)}
              placeholder={t('Ej. 500', 'e.g. 500')}
              className="w-full px-4 py-3.5 rounded-xl text-base font-mono-jb"
              style={{ background: 'var(--yv-surface)', border: '1px solid var(--yv-border)', color: 'var(--yv-text)', outline: 'none' }}
              onFocus={e => { e.target.style.borderColor = 'var(--yv-brand)'; }}
              onBlur={e => { e.target.style.borderColor = 'var(--yv-border)'; }}
            />
          </div>
        </div>

        {!result && (
          <div className="text-center py-16">
            <div className="mb-4"><img src="/icons/target.webp" alt="" width={56} height={56} className="inline-block object-contain" /></div>
            <p className="font-mono-jb text-sm" style={{ color: 'var(--yv-text-2)' }}>
              {t('Introduce impresiones y clics para calcular tu CTR.', 'Enter impressions and clicks to calculate your CTR.')}
            </p>
          </div>
        )}

        {result && (
          <>
            {/* Resultado */}
            <div className="rounded-xl p-6 mb-6 text-center" style={{ background: `${result.tier.color}1a`, border: `1px solid ${result.tier.color}33` }}>
              <span className="text-5xl font-bold font-mono-jb" style={{ color: result.tier.color }}>{result.ctr.toFixed(2)}%</span>
              <p className="font-mono-jb text-sm mt-1" style={{ color: result.tier.color }}>
                CTR · {lang === 'en' ? result.tier.label.en : result.tier.label.es}
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

            {/* Insight accionable */}
            <div className="rounded-xl p-5 mb-10" style={{ background: 'var(--yv-surface)', border: '1px solid var(--yv-border)' }}>
              <p className="font-mono-jb text-[13px] leading-relaxed" style={{ color: 'var(--yv-text-2)' }}>
                {t(
                  `Con ${fmt(result.imp)} impresiones, cada punto de CTR que ganes son ~${fmt(result.extraPerPoint)} clics extra. Mejorar la miniatura y el título es la palanca más rápida para subir el CTR.`,
                  `With ${fmt(result.imp)} impressions, every CTR point you gain is ~${fmt(result.extraPerPoint)} extra clicks. Improving your thumbnail and title is the fastest lever to raise CTR.`
                )}
              </p>
            </div>

            {/* CTA */}
            <div className="mb-12 p-8 rounded-xl text-center" style={{ background: 'linear-gradient(135deg, rgba(232,77,91,0.06), rgba(0,229,255,0.04))', border: '1px solid rgba(232,77,91,0.2)' }}>
              <p className="font-display font-bold text-white text-xl mb-2">
                {t('Sube tu CTR con A/B testing real', 'Raise your CTR with real A/B testing')}
              </p>
              <p className="font-mono-jb text-sm mb-5" style={{ color: 'var(--yv-text-3)' }}>
                {t('Compara títulos y miniaturas y deja que gane el que más clics consigue. Cuenta gratis.', 'Compare titles and thumbnails and let the best-performing one win. Free account.')}
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
            {t('Qué es el CTR y por qué importa', 'What CTR is and why it matters')}
          </h2>
          <p className="font-mono-jb text-sm leading-relaxed mb-4" style={{ color: 'var(--yv-text-3)' }}>
            {t(
              'El CTR (click-through rate) mide qué porcentaje de las personas que ven tu miniatura en YouTube acaban haciendo clic. Es una de las señales más importantes para el algoritmo: si tu vídeo se muestra mucho pero nadie hace clic, YouTube deja de recomendarlo. Junto a la retención, el CTR decide hasta dónde llega tu vídeo.',
              'CTR (click-through rate) measures what percentage of people who see your thumbnail on YouTube actually click. It is one of the most important signals for the algorithm: if your video is shown a lot but nobody clicks, YouTube stops recommending it. Alongside retention, CTR decides how far your video reaches.'
            )}
          </p>
          <ul className="space-y-3 mb-8">
            {[
              { es: 'CTR = (clics ÷ impresiones) × 100.', en: 'CTR = (clicks ÷ impressions) × 100.' },
              { es: 'La mayoría de vídeos están entre el 2% y el 10%.', en: 'Most videos sit between 2% and 10%.' },
              { es: 'La miniatura y el título son las dos palancas que más mueven el CTR.', en: 'Thumbnail and title are the two levers that move CTR the most.' },
              { es: 'Un CTR alto con baja retención señala clickbait y perjudica el alcance.', en: 'High CTR with low retention signals clickbait and hurts reach.' },
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

          <FreeToolsCrossLinks current="/ctr-calculator" lang={lang} />
        </section>
      </div>

      <ExitIntentPopup lang={lang} />
    </div>
  );
}
