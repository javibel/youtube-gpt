'use client';

import AffiliateApplicationForm from '@/components/AffiliateApplicationForm';
import { useLang } from '@/components/LangProvider';
import { useCurrency } from '@/components/CurrencyProvider';
import { PRICES, formatPrice } from '@/lib/pricing';
import PublicNav from '@/components/PublicNav';

export default function AffiliatesClient() {
  const lang = useLang();
  const currency = useCurrency();
  const proPrice = formatPrice(PRICES.pro.monthly.eur, currency, lang);
  // Ejemplo del 30% de comisión sobre 10 suscriptores Pro, derivado del precio
  // para que no quede desincronizado si cambia (ni mezcle € con $).
  const commissionMonthly = formatPrice(Math.round(PRICES.pro.monthly.eur * 10 * 0.3), currency, lang);
  const commissionYear = formatPrice(Math.round(PRICES.pro.monthly.eur * 10 * 0.3 * 12), currency, lang);
  const t = (es: string, en: string) => (lang === 'en' ? en : es);

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      <PublicNav />

      <article className="max-w-3xl mx-auto px-6 py-12">
        <header className="mb-10">
          <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--yv-brand)' }}>
            {t('PROGRAMA DE AFILIADOS', 'AFFILIATE PROGRAM')}
          </p>
          <h1 className="font-display font-bold text-4xl text-white mb-4 leading-tight">
            {t('30% recurrente durante 12 meses, por cada suscriptor que traigas', '30% recurring for 12 months, for every subscriber you bring')}
          </h1>
          <p className="font-mono-jb text-sm leading-relaxed" style={{ color: 'var(--yv-text-3)' }}>
            {t(
              'Si tu audiencia son creadores de YouTube, YTubViral es una recomendación honesta — y te paga por hacerla. Sin letra pequeña, sin mínimos de audiencia, aprobación revisada a mano por el fundador.',
              'If your audience is YouTube creators, YTubViral is an honest recommendation — and it pays you for making it. No fine print, no minimum audience size, applications reviewed by hand by the founder.'
            )}
          </p>
        </header>

        <section className="mb-12 grid sm:grid-cols-3 gap-4">
          {[
            { n: '30%', l: t('de comisión recurrente', 'recurring commission') },
            { n: '12', l: t('meses por cada suscriptor', 'months per subscriber') },
            { n: '60', l: t('días de cookie de atribución', 'day attribution cookie') },
          ].map((s, i) => (
            <div key={i} className="rounded-xl p-5 text-center" style={{ background: 'var(--yv-surface)', border: '1px solid var(--yv-border)' }}>
              <p className="font-display font-bold text-3xl mb-1" style={{ color: 'var(--yv-brand)' }}>{s.n}</p>
              <p className="font-mono-jb text-[12px]" style={{ color: 'var(--yv-text-3)' }}>{s.l}</p>
            </div>
          ))}
        </section>

        <section className="mb-12">
          <h2 className="font-display font-bold text-2xl text-white mb-4">{t('Cómo funciona', 'How it works')}</h2>
          <ul className="space-y-3">
            {[
              { es: 'Te aprobamos y te damos un link con tu código (ytubviral.com/a/tucodigo) que puedes compartir en vídeo, descripción o donde quieras.', en: 'Once approved, you get a link with your code (ytubviral.com/a/yourcode) to share in a video, description, or anywhere.' },
              { es: 'Tu audiencia también puede citar tu código a mano al registrarse, sin necesidad de hacer clic — útil si lo mencionas de viva voz en un vídeo.', en: 'Your audience can also type your code by hand at signup, no click needed — useful if you mention it out loud in a video.' },
              { es: 'Cuando alguien se suscribe a Pro o Business por tu link o código, cobras el 30% de cada factura (sin IVA) durante los 12 meses siguientes a su primer pago.', en: 'When someone subscribes to Pro or Business through your link or code, you earn 30% of every invoice (excl. tax) for the 12 months following their first payment.' },
              { es: 'Liquidación mensual (umbral mínimo 50€) por PayPal o transferencia. Sin automatismos: lo revisamos y pagamos a mano.', en: 'Monthly payout (€50 minimum) via PayPal or bank transfer. No automation: we review and pay by hand.' },
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-3 font-mono-jb text-sm" style={{ color: 'var(--yv-text-2)' }}>
                <span className="font-display font-bold" style={{ color: 'var(--yv-brand)' }}>{i + 1}</span>
                <span>{lang === 'en' ? item.en : item.es}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-12 rounded-xl p-6" style={{ background: 'var(--yv-surface)', border: '1px solid var(--yv-border)' }}>
          <p className="font-mono-jb text-[12px] uppercase tracking-wider mb-2" style={{ color: 'var(--yv-text-4)' }}>{t('Un ejemplo real, sin inflar', 'A real example, not inflated')}</p>
          <p className="font-mono-jb text-sm leading-relaxed" style={{ color: 'var(--yv-text-2)' }}>
            {t(
              `10 personas de tu audiencia se hacen Pro (${proPrice}/mes) gracias a ti: son unos ${commissionMonthly}/mes de comisión durante 12 meses (~${commissionYear} en total por esos 10). No prometemos más que eso — depende de tu audiencia y de si son un buen fit para la herramienta.`,
              `10 people from your audience become Pro (${proPrice}/mo) thanks to you: that's about ${commissionMonthly}/mo in commission for 12 months (~${commissionYear} total for those 10). We don't promise more than that — it depends on your audience and whether they're a good fit for the tool.`
            )}
          </p>
        </section>

        <section className="mb-12">
          <h2 className="font-display font-bold text-2xl text-white mb-4">{t('Solicitar acceso', 'Apply')}</h2>
          <AffiliateApplicationForm lang={lang} />
          <p className="font-mono-jb text-[12px] mt-4" style={{ color: 'var(--yv-text-4)' }}>
            {t('Todas las solicitudes se revisan a mano. Sin aprobación automática.', 'All applications are reviewed by hand. No automatic approval.')}
            {' '}
            {t('Al solicitar acceso aceptas los ', 'By applying you agree to the ')}
            <a href="/affiliates/terms" className="underline hover:text-white transition">{t('términos del programa', 'program terms')}</a>.
          </p>
        </section>
      </article>
    </div>
  );
}
