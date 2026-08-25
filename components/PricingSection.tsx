import Link from 'next/link';
import type { Lang } from '@/lib/server-lang';
import { StarIcon } from '@/components/icons';
import PriceTag from '@/components/PriceTag';
import { PRICES } from '@/lib/pricing';

export default function PricingSection({ lang }: { lang: Lang }) {
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const Check = ({ color = 'text-zinc-500' }: { color?: string }) => (
    <svg className={`shrink-0 mt-0.5 ${color}`} width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}><path d="M5 13l4 4L19 7" /></svg>
  );

  const freeFeatures = [
    t('10 generaciones al mes', '10 generations/month'),
    t('5 tipos de contenido', '5 content types'),
    t('Historial 30 días', '30-day history'),
    t('Sin tarjeta de crédito', 'No credit card'),
  ];
  const proFeatures = [
    t('200 generaciones al mes', '200 generations/month'),
    t('Todos los tipos de contenido', 'All content types'),
    t('AI Coach (50 msg/mes)', 'AI Coach (50 msg/mo)'),
    t('Keyword Research + Outliers', 'Keyword Research + Outliers'),
    t('5 competidores + Intel avanzado', '5 competitors + Advanced Intel'),
    t('3 A/B tests simultáneos', '3 simultaneous A/B tests'),
    t('Estimador de ingresos', 'Revenue Estimator'),
    t('Calendario IA · Preview miniaturas', 'AI Calendar · Thumbnail Preview'),
    t('Retención · Suscriptores · Predictor', 'Retention · Subscribers · Predictor'),
    t('Extensión de Chrome', 'Chrome Extension'),
    t('Soporte prioritario 24h', '24h priority support'),
  ];
  const businessFeatures = [
    t('Generaciones ilimitadas', 'Unlimited generations'),
    t('AI Coach ilimitado', 'Unlimited AI Coach'),
    t('Predictor y Auditoría ilimitados', 'Unlimited Predictor & Audit'),
    t('20 competidores + Tracking', '20 competitors + Tracking'),
    t('10 A/B tests simultáneos', '10 simultaneous A/B tests'),
    t('Revenue + Analytics avanzados', 'Revenue + Advanced Analytics'),
    t('Trending: 12 países', 'Trending: 12 countries'),
    t('Equipo: 5 miembros incluidos', 'Team: 5 members included'),
    t('Bulk: 10 temas por lote', 'Bulk: 10 topics per batch'),
    t('Todo de Pro incluido', 'Everything in Pro included'),
  ];

  return (
    <section id="pricing" className="relative overflow-hidden" style={{ background: 'var(--yv-bg-0)' }}>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 100%,rgba(232,77,91,0.10),transparent 60%)' }} />
      <div className="relative max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--yv-brand-lift)' }}>06 · PRICING</p>
          <h2 className="font-display font-bold text-4xl md:text-6xl leading-[0.95]">
            {t('Elige tu plan. Sin sorpresas.', 'Pick your plan. No surprises.')}
          </h2>
          <p className="text-zinc-400 text-lg mt-4 max-w-xl mx-auto">
            {t('Empieza gratis. Escala cuando estés listo.', 'Start free. Scale when you\'re ready.')}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          {/* Free */}
          <div className="yv-glass p-8">
            <p className="font-mono-jb text-[13px] tracking-wider uppercase text-zinc-500 mb-4">
              A · {t('Gratuito', 'Free')}
            </p>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="font-display font-bold stat-num" style={{ fontSize: '48px' }}><PriceTag amount={0} lang={lang} /></span>
              <span className="text-zinc-500 font-mono-jb text-sm">/{t('mes', 'mo')}</span>
            </div>
            <p className="text-zinc-500 text-sm mb-8">{t('Para explorar y validar', 'To explore and validate')}</p>
            <ul className="space-y-3 mb-10">
              {freeFeatures.map((f) => (
                <li key={f} className="flex items-start gap-3 text-zinc-300 text-sm">
                  <Check />{f}
                </li>
              ))}
            </ul>
            <Link href="/signup" className="btn-offset btn-offset-ghost w-full px-5 py-3 text-sm font-display block text-center">
              {t('Empezar gratis', 'Start free')}
            </Link>
          </div>

          {/* Pro */}
          <div className="yv-glass yv-glass--brand p-8 relative">
            <div className="absolute -top-3 left-8 red-tape inline-flex items-center gap-1"><StarIcon size={12} /> {t('MÁS ELEGIDO', 'MOST POPULAR')}</div>
            <p className="font-mono-jb text-[13px] tracking-wider uppercase mb-4" style={{ color: 'var(--yv-brand-lift)' }}>B · Pro</p>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="font-display font-bold stat-num" style={{ fontSize: '48px' }}><PriceTag amount={PRICES.pro.monthly.eur} lang={lang} /></span>
              <span className="text-zinc-500 font-mono-jb text-sm">/{t('mes', 'mo')}</span>
            </div>
            <div className="flex items-center gap-2 mb-6 mt-2 p-2.5" style={{ borderRadius: 'var(--yv-radius)', background: 'rgba(124,255,0,0.06)', boxShadow: 'inset 0 1px 0 rgba(124,255,0,.18)' }}>
              <div>
                <p className="font-mono-jb text-[13px] tracking-wider uppercase inline-flex items-center gap-1" style={{ color: '#7CFF00' }}>
                  <StarIcon size={11} /> {t('ANUAL — AHORRA 17%', 'ANNUAL — SAVE 17%')}
                </p>
                <p className="font-display font-bold text-white text-base mt-0.5">
                  <PriceTag amount={PRICES.pro.yearly.eur} lang={lang} /><span className="text-zinc-400 font-mono-jb text-[13px] ml-1">/{t('año', 'yr')}</span>
                </p>
              </div>
            </div>
            <p className="text-zinc-400 text-sm mb-6">{t('Para creadores que publican en serio', 'For creators who publish seriously')}</p>
            <ul className="space-y-3 mb-10">
              {proFeatures.map((f) => (
                <li key={f} className="flex items-start gap-3 text-zinc-200 text-sm">
                  <Check color="" />{f}
                </li>
              ))}
            </ul>
            <Link href="/signup" className="btn-offset w-full px-5 py-3 text-sm font-display block text-center">
              {t('Prueba Pro 7 días gratis →', 'Try Pro free for 7 days →')}
            </Link>
            <p className="text-center text-zinc-500 text-xs mt-2">
              {t('Sin cargo hasta el día 7 · Cancela cuando quieras', 'No charge until day 7 · Cancel anytime')}
            </p>
          </div>

          {/* Business */}
          <div className="yv-glass p-8 relative" style={{ background: 'linear-gradient(155deg,rgba(0,229,255,0.10),rgba(255,255,255,.02))' }}>
            <p className="font-mono-jb text-[13px] tracking-wider uppercase mb-4" style={{ color: '#00E5FF' }}>C · Business</p>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="font-display font-bold stat-num" style={{ fontSize: '48px' }}><PriceTag amount={PRICES.business.monthly.eur} lang={lang} /></span>
              <span className="text-zinc-500 font-mono-jb text-sm">/{t('mes', 'mo')}</span>
            </div>
            <div className="flex items-center gap-2 mb-6 mt-2 p-2.5" style={{ borderRadius: 'var(--yv-radius)', background: 'rgba(0,229,255,0.06)', boxShadow: 'inset 0 1px 0 rgba(0,229,255,.2)' }}>
              <div>
                <p className="font-mono-jb text-[13px] tracking-wider uppercase inline-flex items-center gap-1" style={{ color: '#00E5FF' }}>
                  <StarIcon size={11} /> {t('ANUAL — AHORRA 17%', 'ANNUAL — SAVE 17%')}
                </p>
                <p className="font-display font-bold text-white text-base mt-0.5">
                  <PriceTag amount={PRICES.business.yearly.eur} lang={lang} /><span className="text-zinc-400 font-mono-jb text-[13px] ml-1">/{t('año', 'yr')}</span>
                </p>
              </div>
            </div>
            <p className="text-zinc-400 text-sm mb-6">{t('Para equipos y canales grandes', 'For teams and large channels')}</p>
            <ul className="space-y-3 mb-10">
              {businessFeatures.map((f) => (
                <li key={f} className="flex items-start gap-3 text-zinc-200 text-sm">
                  <Check color="" />{f}
                </li>
              ))}
            </ul>
            <Link href="/signup" className="btn-offset w-full px-5 py-3 text-sm font-display block text-center" style={{ background: 'linear-gradient(165deg,#4dd9ff,#0091b8)', boxShadow: '0 16px 40px -14px rgba(0,229,255,.6), inset 0 1px 0 rgba(255,255,255,.45)' }}>
              {t('Empezar con Business →', 'Get Business →')}
            </Link>
          </div>
        </div>

        <p className="text-center text-zinc-500 text-[13px] font-mono-jb mt-6">
          {t('30 días de garantía · Cancela cuando quieras · Facturación transparente',
            '30-day guarantee · Cancel anytime · Transparent billing')}
        </p>

        <div className="yv-glass mt-8 max-w-xl mx-auto p-5 text-center">
          <p className="font-mono-jb text-[13px] tracking-wider uppercase text-zinc-500 mb-3">
            {t('COMPARADO CON LA COMPETENCIA', 'COMPARED TO THE COMPETITION')}
          </p>
          <div className="flex items-center justify-center gap-6 flex-wrap">
            <div>
              <p className="font-display font-bold text-2xl" style={{ color: 'var(--yv-brand-lift)' }}><PriceTag amount={PRICES.pro.monthly.eur} lang={lang} /><span className="text-zinc-500 text-sm font-normal">/{t('mes', 'mo')}</span></p>
              <p className="text-zinc-400 text-sm mt-1">YTubViral Pro</p>
            </div>
            <span className="text-zinc-600 font-mono-jb text-sm">vs</span>
            <div>
              <p className="font-display font-bold text-2xl text-zinc-500 line-through" style={{ textDecorationColor: 'rgba(232,77,91,0.6)' }}>$49<span className="text-zinc-600 text-sm font-normal no-underline">/{t('mes', 'mo')}</span></p>
              <p className="text-zinc-500 text-sm mt-1">{t('Herramienta típica', 'Typical tool')}</p>
            </div>
          </div>
          <p className="text-zinc-500 text-[13px] font-mono-jb mt-3">
            {t('Keyword research, análisis de competidores, IA generativa — incluido en ambos.',
              'Keyword research, competitor analysis, generative AI — included in both.')}
          </p>
        </div>
      </div>
    </section>
  );
}
