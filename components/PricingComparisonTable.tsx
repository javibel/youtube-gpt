import type { Lang } from '@/lib/server-lang';
import PriceTag from '@/components/PriceTag';
import { PRICES } from '@/lib/pricing';

type Cell = string | boolean;
type Row = { feature: { es: string; en: string }; free: Cell; pro: Cell; business: Cell };

// Valores alineados con las cards de PricingSection — si cambian allí, cambiar aquí
const ROWS: Row[] = [
  { feature: { es: 'Generaciones IA', en: 'AI generations' }, free: '10/mes · 10/mo', pro: '200/mes · 200/mo', business: 'Ilimitadas · Unlimited' },
  { feature: { es: 'Tipos de contenido', en: 'Content types' }, free: '5', pro: 'Todos · All', business: 'Todos · All' },
  { feature: { es: 'SEO Score', en: 'SEO Score' }, free: true, pro: true, business: true },
  { feature: { es: 'Trending Topics', en: 'Trending Topics' }, free: true, pro: true, business: '12 países · countries' },
  { feature: { es: 'AI Coach', en: 'AI Coach' }, free: false, pro: '50 msg/mes · mo', business: 'Ilimitado · Unlimited' },
  { feature: { es: 'Keyword Research + Outliers', en: 'Keyword Research + Outliers' }, free: false, pro: true, business: true },
  { feature: { es: 'Competidores monitorizados', en: 'Tracked competitors' }, free: false, pro: '5', business: '20 + tracking' },
  { feature: { es: 'A/B tests simultáneos', en: 'Simultaneous A/B tests' }, free: false, pro: '3', business: '10' },
  { feature: { es: 'Estimador de ingresos', en: 'Revenue Estimator' }, free: false, pro: true, business: '+ Analytics' },
  { feature: { es: 'Calendario IA + Preview miniaturas', en: 'AI Calendar + Thumbnail Preview' }, free: false, pro: true, business: true },
  { feature: { es: 'Retención · Predictor · Auditoría', en: 'Retention · Predictor · Audit' }, free: false, pro: true, business: 'Ilimitados · Unlimited' },
  { feature: { es: 'Extensión de Chrome', en: 'Chrome Extension' }, free: false, pro: true, business: true },
  { feature: { es: 'Miembros de equipo', en: 'Team members' }, free: false, pro: false, business: '5' },
  { feature: { es: 'Generación bulk', en: 'Bulk generation' }, free: false, pro: false, business: '10 temas/lote · topics/batch' },
  { feature: { es: 'Soporte prioritario 24h', en: '24h priority support' }, free: false, pro: true, business: true },
];

function CellContent({ value, lang }: { value: Cell; lang: Lang }) {
  if (value === true) {
    return (
      <svg className="inline-block" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#7CFF00" strokeWidth={2.4} aria-label="✓">
        <path d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (value === false) return <span className="text-zinc-700" aria-label="—">—</span>;
  // Valores bilingües "es · en": mostrar solo el del idioma activo cuando aplica
  const parts = value.split(' · ');
  return <span className="text-zinc-300">{parts.length === 2 ? (lang === 'en' ? parts[1] : parts[0]) : value}</span>;
}

export default function PricingComparisonTable({ lang }: { lang: Lang }) {
  const t = (es: string, en: string) => (lang === 'en' ? en : es);

  return (
    <section style={{ background: 'var(--yv-bg-1)' }}>
      <div className="max-w-6xl mx-auto px-6 py-20">
        <p className="text-center font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--yv-brand-lift)' }}>
          {t('COMPARATIVA COMPLETA', 'FULL COMPARISON')}
        </p>
        <h2 className="font-display font-bold text-3xl md:text-5xl text-center leading-[0.95] mb-12">
          {t('Todo lo que incluye cada plan', 'Everything each plan includes')}
        </h2>

        <div className="overflow-x-auto yv-glass">
          <table className="yv-table yv-table--matrix md:min-w-[640px]">
            <thead>
              <tr>
                <th className="text-left">
                  {t('Característica', 'Feature')}
                </th>
                <th>Free<br /><span className="text-zinc-600"><PriceTag amount={0} lang={lang} /></span></th>
                <th style={{ color: 'var(--yv-brand-lift)' }}>Pro<br /><span className="text-zinc-400"><PriceTag amount={PRICES.pro.monthly.eur} lang={lang} />/{t('mes', 'mo')}</span></th>
                <th style={{ color: '#00E5FF' }}>Business<br /><span className="text-zinc-400"><PriceTag amount={PRICES.business.monthly.eur} lang={lang} />/{t('mes', 'mo')}</span></th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr key={i}>
                  <td className="text-zinc-300">{lang === 'en' ? row.feature.en : row.feature.es}</td>
                  <td className="text-center" data-label="Free"><CellContent value={row.free} lang={lang} /></td>
                  <td className="text-center" data-label="Pro" style={{ background: 'var(--yv-brand-glass)' }}><CellContent value={row.pro} lang={lang} /></td>
                  <td className="text-center" data-label="Business"><CellContent value={row.business} lang={lang} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
