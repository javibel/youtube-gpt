'use client';

import { useState, useMemo } from 'react';
import { useLang } from '@/components/LangProvider';
import PublicNav from '@/components/PublicNav';
import ExitIntentPopup from '@/components/ExitIntentPopup';
import FreeToolsCrossLinks from '@/components/FreeToolsCrossLinks';

interface Niche {
  id: string;
  label: { es: string; en: string };
  low: number;  // RPM neto al creador (USD por 1000 vistas), rango bajo
  high: number; // rango alto
}

// RPM netos al creador (tras el reparto de YouTube, ~55% para el creador) por nicho.
// Rangos generales ampliamente citados — son ESTIMACIONES, no datos oficiales de YouTube.
const NICHES: Niche[] = [
  { id: 'finance', label: { es: 'Finanzas e inversión', en: 'Finance & investing' }, low: 7, high: 22 },
  { id: 'business', label: { es: 'Negocios y marketing', en: 'Business & marketing' }, low: 6, high: 18 },
  { id: 'tech', label: { es: 'Tecnología y software', en: 'Tech & software' }, low: 4, high: 14 },
  { id: 'education', label: { es: 'Educación y tutoriales', en: 'Education & how-to' }, low: 4, high: 12 },
  { id: 'health', label: { es: 'Salud y fitness', en: 'Health & fitness' }, low: 4, high: 11 },
  { id: 'travel', label: { es: 'Viajes', en: 'Travel' }, low: 3, high: 8 },
  { id: 'food', label: { es: 'Comida y cocina', en: 'Food & cooking' }, low: 3, high: 8 },
  { id: 'gaming', label: { es: 'Gaming', en: 'Gaming' }, low: 2, high: 6 },
  { id: 'entertainment', label: { es: 'Entretenimiento y vlogs', en: 'Entertainment & vlogs' }, low: 2, high: 5 },
  { id: 'music', label: { es: 'Música', en: 'Music' }, low: 1, high: 4 },
  { id: 'other', label: { es: 'Otro / general', en: 'Other / general' }, low: 2, high: 7 },
];

function money(n: number): string {
  if (!isFinite(n)) return '—';
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return '$' + (n / 1_000).toFixed(1) + 'K';
  return '$' + Math.round(n).toLocaleString('en-US');
}

export default function MoneyCalculatorClient() {
  const lang = useLang();
  const t = (es: string, en: string) => (lang === 'en' ? en : es);

  const [views, setViews] = useState('');
  const [nicheId, setNicheId] = useState('other');

  const niche = NICHES.find(n => n.id === nicheId) ?? NICHES[NICHES.length - 1];

  const result = useMemo(() => {
    const v = parseFloat(views.replace(/[^\d.]/g, ''));
    if (!v || v <= 0) return null;
    const monthLow = (v / 1000) * niche.low;
    const monthHigh = (v / 1000) * niche.high;
    return { v, monthLow, monthHigh, yearLow: monthLow * 12, yearHigh: monthHigh * 12 };
  }, [views, niche]);

  const FAQ = [
    {
      q: { es: '¿Cuánto paga YouTube por 1000 vistas?', en: 'How much does YouTube pay per 1,000 views?' },
      a: { es: 'Depende muchísimo del nicho y del país de la audiencia. El RPM neto al creador (lo que te queda tras el reparto de YouTube) suele ir de 1-4 $ en música o entretenimiento hasta 7-22 $ en finanzas o negocios. Esta calculadora usa rangos generales por nicho.', en: 'It depends heavily on the niche and the audience country. The net RPM to the creator (what you keep after YouTube\'s share) usually ranges from $1-4 in music or entertainment up to $7-22 in finance or business. This calculator uses general per-niche ranges.' },
    },
    {
      q: { es: '¿Esta estimación incluye patrocinios?', en: 'Does this estimate include sponsorships?' },
      a: { es: 'No. Solo estima los ingresos de AdSense (anuncios). Muchos canales ganan más con patrocinios, membresías, afiliados o sus propios productos que con los anuncios. Considera esto un suelo, no un techo.', en: 'No. It only estimates AdSense (ad) revenue. Many channels earn more from sponsorships, memberships, affiliates or their own products than from ads. Treat this as a floor, not a ceiling.' },
    },
    {
      q: { es: '¿Por qué un rango en vez de una cifra exacta?', en: 'Why a range instead of an exact number?' },
      a: { es: 'Porque los ingresos reales varían según la época del año (el CPM sube en Q4), el porcentaje de vistas monetizables, la duración del vídeo y la audiencia. Un rango es más honesto que una cifra falsamente precisa.', en: 'Because real earnings vary by season (CPM rises in Q4), the share of monetizable views, video length and audience. A range is more honest than a falsely precise number.' },
    },
    {
      q: { es: '¿Necesito una cuenta?', en: 'Do I need an account?' },
      a: { es: 'No. La calculadora es gratis y funciona al instante en tu navegador. Si conectas tu canal con una cuenta gratuita, podrás ver tus ingresos reales por país y vídeo en lugar de una estimación.', en: 'No. The calculator is free and works instantly in your browser. If you connect your channel with a free account, you can see your real earnings by country and video instead of an estimate.' },
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
            {t('Calculadora de Ingresos de YouTube', 'YouTube Money Calculator')}
          </h1>
          <p className="font-mono-jb text-sm leading-relaxed" style={{ color: 'var(--yv-text-3)' }}>
            {t(
              'Estima cuánto puede ganar un canal de YouTube con AdSense según sus vistas mensuales y su nicho. Sin registro, sin tarjeta, al instante.',
              'Estimate how much a YouTube channel can earn from AdSense based on its monthly views and niche. No signup, no card, instant.'
            )}
          </p>
        </header>

        {/* Inputs */}
        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block font-mono-jb text-[12px] mb-2" style={{ color: 'var(--yv-text-3)' }}>
              {t('Vistas mensuales', 'Monthly views')}
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={views}
              onChange={e => setViews(e.target.value)}
              placeholder={t('Ej. 100000', 'e.g. 100000')}
              className="w-full px-4 py-3.5 rounded-xl text-base font-mono-jb"
              autoFocus
              style={{ background: 'var(--yv-surface)', border: '1px solid var(--yv-border)', color: 'var(--yv-text)', outline: 'none' }}
              onFocus={e => { e.target.style.borderColor = 'var(--yv-brand)'; }}
              onBlur={e => { e.target.style.borderColor = 'var(--yv-border)'; }}
            />
          </div>
          <div>
            <label className="block font-mono-jb text-[12px] mb-2" style={{ color: 'var(--yv-text-3)' }}>
              {t('Nicho del canal', 'Channel niche')}
            </label>
            <select
              value={nicheId}
              onChange={e => setNicheId(e.target.value)}
              className="w-full px-4 py-3.5 rounded-xl text-base font-mono-jb"
              style={{ background: 'var(--yv-surface)', border: '1px solid var(--yv-border)', color: 'var(--yv-text)', outline: 'none' }}
            >
              {NICHES.map(n => (
                <option key={n.id} value={n.id} style={{ background: '#1a1a1c', color: '#fff' }}>
                  {lang === 'en' ? n.label.en : n.label.es}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!result && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">💰</div>
            <p className="font-mono-jb text-sm" style={{ color: 'var(--yv-text-2)' }}>
              {t('Introduce tus vistas mensuales y tu nicho para estimar tus ingresos.', 'Enter your monthly views and niche to estimate earnings.')}
            </p>
          </div>
        )}

        {result && (
          <>
            <div className="grid sm:grid-cols-2 gap-4 mb-6">
              <div className="rounded-xl p-6 text-center" style={{ background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.3)' }}>
                <p className="font-mono-jb text-[12px] mb-1" style={{ color: 'var(--yv-text-3)' }}>{t('Estimación mensual', 'Estimated monthly')}</p>
                <span className="text-3xl font-bold font-mono-jb" style={{ color: '#22c55e' }}>
                  {money(result.monthLow)} – {money(result.monthHigh)}
                </span>
              </div>
              <div className="rounded-xl p-6 text-center" style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.3)' }}>
                <p className="font-mono-jb text-[12px] mb-1" style={{ color: 'var(--yv-text-3)' }}>{t('Estimación anual', 'Estimated yearly')}</p>
                <span className="text-3xl font-bold font-mono-jb" style={{ color: '#00E5FF' }}>
                  {money(result.yearLow)} – {money(result.yearHigh)}
                </span>
              </div>
            </div>

            <div className="rounded-xl p-5 mb-6" style={{ background: 'var(--yv-surface)', border: '1px solid var(--yv-border)' }}>
              <p className="font-mono-jb text-[13px] leading-relaxed" style={{ color: 'var(--yv-text-2)' }}>
                {t(
                  `Basado en un RPM de ${niche.low}-${niche.high} $ por 1000 vistas para ${(lang === 'en' ? niche.label.en : niche.label.es).toLowerCase()}. Solo AdSense — los patrocinios, membresías y afiliados suelen sumar más que los anuncios.`,
                  `Based on a $${niche.low}-${niche.high} RPM per 1,000 views for ${(lang === 'en' ? niche.label.en : niche.label.es).toLowerCase()}. AdSense only — sponsorships, memberships and affiliates usually add more than ads.`
                )}
              </p>
            </div>

            <p className="text-zinc-600 text-[12px] mb-10">
              {t(
                'Estimación orientativa basada en rangos generales de RPM por nicho. No es una predicción de tus ingresos reales, que dependen del país de tu audiencia, la temporada y el porcentaje de vistas monetizables.',
                'Rough estimate based on general per-niche RPM ranges. It is not a prediction of your real earnings, which depend on your audience country, season and the share of monetizable views.'
              )}
            </p>

            <div className="mb-12 p-8 rounded-xl text-center" style={{ background: 'linear-gradient(135deg, rgba(232,77,91,0.06), rgba(0,229,255,0.04))', border: '1px solid rgba(232,77,91,0.2)' }}>
              <p className="font-display font-bold text-white text-xl mb-2">
                {t('¿Quieres tus ingresos reales, no una estimación?', 'Want your real earnings, not an estimate?')}
              </p>
              <p className="font-mono-jb text-sm mb-5" style={{ color: 'var(--yv-text-3)' }}>
                {t('Conecta tu canal gratis y mira tus ingresos por país, vídeo y CPM real.', 'Connect your channel for free and see earnings by country, video and real CPM.')}
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
            {t('Cómo se calculan los ingresos de YouTube', 'How YouTube earnings are calculated')}
          </h2>
          <p className="font-mono-jb text-sm leading-relaxed mb-4" style={{ color: 'var(--yv-text-3)' }}>
            {t(
              'Los ingresos de AdSense se basan en el RPM: lo que ganas por cada 1000 vistas, ya descontada la parte que se queda YouTube (aproximadamente el 45%). El RPM cambia muchísimo según el nicho, el país de la audiencia y la época del año. Por eso dos canales con las mismas vistas pueden ganar cifras muy distintas.',
              'AdSense revenue is based on RPM: what you earn per 1,000 views, after YouTube\'s cut (roughly 45%) is removed. RPM changes a lot depending on niche, audience country and season. That\'s why two channels with the same views can earn very different amounts.'
            )}
          </p>
          <ul className="space-y-3 mb-8">
            {[
              { es: 'Ingresos AdSense ≈ (vistas ÷ 1000) × RPM neto.', en: 'AdSense revenue ≈ (views ÷ 1,000) × net RPM.' },
              { es: 'El nicho es el factor que más cambia el RPM (finanzas paga 10× más que música).', en: 'Niche is the biggest RPM factor (finance pays ~10× more than music).' },
              { es: 'La audiencia de EE. UU., Reino Unido o Canadá tiene CPM más alto.', en: 'US, UK and Canada audiences have higher CPM.' },
              { es: 'El CPM sube en el último trimestre del año por la publicidad navideña.', en: 'CPM rises in Q4 due to holiday advertising.' },
              { es: 'AdSense es solo una parte: patrocinios y productos propios suelen pesar más.', en: 'AdSense is only part of it: sponsorships and own products often weigh more.' },
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

          <FreeToolsCrossLinks current="/youtube-money-calculator" lang={lang} />
        </section>
      </div>

      <ExitIntentPopup lang={lang} />
    </div>
  );
}
