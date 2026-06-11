import type { Lang } from '@/lib/server-lang';

const FAQS: { q: { es: string; en: string }; a: { es: string; en: string } }[] = [
  {
    q: { es: '¿Puedo cancelar mi suscripción cuando quiera?', en: 'Can I cancel my subscription anytime?' },
    a: {
      es: 'Sí, desde tu perfil en un clic, sin permanencia ni penalizaciones. Mantienes el acceso a tu plan hasta el final del período ya facturado.',
      en: 'Yes, from your profile in one click — no lock-in, no penalties. You keep access to your plan until the end of the period you already paid for.',
    },
  },
  {
    q: { es: '¿Hay garantía de devolución?', en: 'Is there a money-back guarantee?' },
    a: {
      es: 'Sí, 30 días. Si Pro o Business no encaja contigo, escríbenos a hello@ytubviral.com dentro de los primeros 30 días y te devolvemos el importe íntegro.',
      en: 'Yes, 30 days. If Pro or Business is not a fit, email hello@ytubviral.com within the first 30 days and we refund the full amount.',
    },
  },
  {
    q: { es: '¿Qué formas de pago aceptáis?', en: 'What payment methods do you accept?' },
    a: {
      es: 'Tarjeta de crédito o débito a través de Stripe. Tus datos de pago los procesa Stripe directamente — nunca tocan nuestros servidores.',
      en: 'Credit or debit card via Stripe. Your payment details are processed by Stripe directly — they never touch our servers.',
    },
  },
  {
    q: { es: '¿El plan Free es gratis para siempre?', en: 'Is the Free plan free forever?' },
    a: {
      es: 'Sí, sin tarjeta de crédito. Y dos herramientas — SEO Score y Trending Topics — ni siquiera necesitan cuenta: úsalas directamente desde la web.',
      en: 'Yes, no credit card required. And two tools — SEO Score and Trending Topics — do not even need an account: use them right from the site.',
    },
  },
  {
    q: { es: '¿Qué IA usa YTubViral?', en: 'Which AI does YTubViral use?' },
    a: {
      es: 'Claude, de Anthropic — la IA reconocida por la calidad de su escritura. La mayoría de alternativas usan GPT genérico; la diferencia se nota en cada título y guion.',
      en: 'Claude, by Anthropic — the AI known for its writing quality. Most alternatives use generic GPT; you can tell the difference in every title and script.',
    },
  },
  {
    q: { es: '¿Puedo cambiar de plan más adelante?', en: 'Can I change plans later?' },
    a: {
      es: 'Sí, puedes subir o bajar de plan en cualquier momento. Stripe prorratea el importe automáticamente, así que solo pagas la diferencia.',
      en: 'Yes, you can upgrade or downgrade anytime. Stripe prorates the amount automatically, so you only pay the difference.',
    },
  },
  {
    q: { es: '¿Qué pasa si llego a mi límite de generaciones?', en: 'What happens if I hit my generation limit?' },
    a: {
      es: 'Los límites se renuevan cada mes. Si necesitas más antes, puedes pasar a un plan superior en cualquier momento — el cambio es inmediato.',
      en: 'Limits reset every month. If you need more sooner, you can move to a higher plan anytime — the change is immediate.',
    },
  },
  {
    q: { es: '¿Recibiré factura de mis pagos?', en: 'Will I get an invoice for my payments?' },
    a: {
      es: 'Sí, Stripe te envía la factura de cada pago por email automáticamente.',
      en: 'Yes, Stripe automatically emails you an invoice for every payment.',
    },
  },
];

export default function PricingFAQ({ lang }: { lang: Lang }) {
  const t = (es: string, en: string) => (lang === 'en' ? en : es);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: lang === 'en' ? f.q.en : f.q.es,
      acceptedAnswer: { '@type': 'Answer', text: lang === 'en' ? f.a.en : f.a.es },
    })),
  };

  return (
    <section className="bg-black">
      <div className="max-w-3xl mx-auto px-6 py-20">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <p className="text-center font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>FAQ</p>
        <h2 className="font-display font-bold text-3xl md:text-5xl text-center leading-[0.95] mb-12">
          {t('Preguntas frecuentes', 'Frequently asked questions')}
        </h2>

        <div className="space-y-3">
          {FAQS.map((f, i) => (
            <details key={i} className="group border border-white/10 bg-white/[0.02] open:bg-white/[0.04] transition-colors">
              <summary className="flex items-center justify-between gap-4 p-5 cursor-pointer list-none text-white font-display font-bold text-base select-none [&::-webkit-details-marker]:hidden">
                {lang === 'en' ? f.q.en : f.q.es}
                <span className="shrink-0 font-mono-jb text-zinc-500 group-open:rotate-45 transition-transform" aria-hidden>+</span>
              </summary>
              <p className="px-5 pb-5 text-zinc-400 text-sm leading-relaxed">
                {lang === 'en' ? f.a.en : f.a.es}
              </p>
            </details>
          ))}
        </div>

        <p className="text-center text-zinc-500 text-sm mt-10">
          {t('¿Otra pregunta? Escríbenos a', 'Another question? Write to us at')}{' '}
          <a href="mailto:hello@ytubviral.com" className="text-white underline hover:no-underline">hello@ytubviral.com</a>
        </p>
      </div>
    </section>
  );
}
