import type { Metadata } from 'next';
import Link from 'next/link';
import { getServerLang } from '@/lib/server-lang';


export const metadata: Metadata = {
  title: 'YouTube A/B Testing Tool — Test Titles & Thumbnails Free',
  description:
    'A/B test your YouTube titles automatically. Swap versions, track CTR, and find what gets more clicks. The only free A/B testing tool for YouTube creators.',
  alternates: { canonical: 'https://ytubviral.com/features/ab-testing' },
  openGraph: {
    title: 'YouTube A/B Testing Tool — Test Titles & Thumbnails',
    description: 'A/B test YouTube titles automatically. Track CTR and find what gets more clicks. Free.',
    url: 'https://ytubviral.com/features/ab-testing',
    type: 'website',
    images: [{ url: '/og-ab-testing.webp', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'YouTube A/B Testing Tool — Test Titles & Thumbnails Free',
    description: 'A/B test your YouTube titles automatically. Swap versions, track CTR, and find what gets more clicks. The only free A/B testing tool for YouTube creators.',
    images: ['/og-ab-testing.webp'],
  },
};

const FAQ_ES = [
  { q: '¿Cómo funciona el A/B testing en YouTube?', a: 'Escribes dos variaciones de título para un vídeo. YTubViral las rota automáticamente a intervalos fijos (ej. cada 24 horas) y registra impresiones, CTR y vistas de cada versión. Cuando hay suficientes datos, declaramos un ganador estadísticamente significativo.' },
  { q: '¿Puedo hacer A/B test de thumbnails también?', a: 'YouTube ya tiene test nativo de thumbnails (Test & Compare). Nuestra herramienta se centra en el test de títulos, que YouTube NO ofrece de forma nativa. Combina ambos: testea thumbnails con YouTube, testea títulos con YTubViral.' },
  { q: '¿VidIQ ofrece A/B testing?', a: 'No. VidIQ no tiene A/B testing de títulos. TubeBuddy lo ofrece en su plan Legend ($49/mes). YTubViral lo incluye en Pro a 9,99 euros/mes — un 80% más barato.' },
  { q: '¿Cuánto tiempo necesita un test?', a: 'Normalmente 7-14 días para obtener resultados estadísticamente significativos, dependiendo del volumen de vistas de tu vídeo. La herramienta te avisa cuando hay suficientes datos para elegir un ganador con confianza.' },
  { q: '¿El A/B testing perjudica el rendimiento de mi vídeo?', a: 'No. Los cambios de título no resetean el algoritmo de YouTube ni afectan las recomendaciones. YouTube lo trata como una actualización de metadatos. Tu vídeo conserva todas sus impresiones, likes y comentarios.' },
  { q: '¿Cambia los títulos en YouTube automáticamente?', a: 'Sí. Con YouTube OAuth conectado, YTubViral rota los títulos automáticamente vía la API. Lo configuras una vez y revisas los resultados después. Sin cambios manuales.' },
];

const FAQ_EN = [
  { q: 'How does YouTube A/B testing work?', a: 'You provide two title variations for a video. YTubViral automatically swaps between them at set intervals (e.g., every 24 hours) and tracks impressions, CTR, and views for each version. After enough data, we declare a statistically significant winner.' },
  { q: 'Can I A/B test thumbnails too?', a: 'YouTube now has native thumbnail testing (Test & Compare). Our tool focuses on title testing, which YouTube does NOT offer natively. Combine both: test thumbnails with YouTube, test titles with YTubViral.' },
  { q: 'Does VidIQ offer A/B testing?', a: 'No. VidIQ does not have A/B testing for titles. TubeBuddy offers it in their Legend plan ($49/month). YTubViral includes it in Pro at \u20ac9.99/month \u2014 80% cheaper.' },
  { q: 'How long does a test need to run?', a: 'Typically 7-14 days to get statistically significant results, depending on your video\'s view volume. The tool tells you when there\'s enough data to pick a winner with confidence.' },
  { q: 'Will A/B testing hurt my video performance?', a: 'No. Title changes don\'t reset YouTube\'s algorithm or affect recommendations. YouTube treats it as a metadata update. Your video keeps all its existing impressions, likes, and comments.' },
  { q: 'Does it push title changes to YouTube automatically?', a: 'Yes. With YouTube OAuth connected, YTubViral swaps titles automatically via the API. You set it up once and check results later. No manual switching needed.' },
];

export default async function AbTestingFeature() {
  const lang = getServerLang();
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const FAQ = lang === 'en' ? FAQ_EN : FAQ_ES;

  const steps = [
    { step: '1', title: t('Elige un vídeo y escribe dos títulos', 'Pick a video and write two titles'), desc: t('Selecciona cualquier vídeo de tu canal. Pon tu título actual como versión A y tu alternativa como versión B. Nuestra IA puede sugerirte la versión B si necesitas ideas.', 'Select any video from your channel. Write your current title as version A and your alternative as version B. Our AI can suggest version B if you need ideas.') },
    { step: '2', title: t('Configura la rotación', 'Set the rotation schedule'), desc: t('Elige cada cuánto rotar títulos (cada 12h, 24h o 48h). La herramienta rota los títulos automáticamente vía la API de YouTube — sin trabajo manual.', 'Choose how often to swap titles (every 12h, 24h, or 48h). The tool rotates titles automatically via YouTube API — no manual work.') },
    { step: '3', title: t('Déjalo correr', 'Let it run'), desc: t('YTubViral registra impresiones, CTR y velocidad de vistas para cada versión del título. El dashboard muestra la comparativa de rendimiento en tiempo real.', 'YTubViral tracks impressions, CTR, and view velocity for each title version. The dashboard shows real-time performance comparison.') },
    { step: '4', title: t('Elige el ganador', 'Pick the winner'), desc: t('Cuando hay suficientes datos (normalmente 7-14 días), la herramienta declara un ganador estadísticamente significativo. Aplícalo con un clic.', 'Once we have enough data (usually 7-14 days), the tool declares a statistically significant winner. Apply it with one click.') },
  ];

  const comparison = [
    [t('A/B test de títulos', 'Title A/B testing'), '✓', t('✓ (solo Legend)', '✓ (Legend only)'), '✗', '✗'],
    [t('A/B test de thumbnails', 'Thumbnail A/B testing'), '✗', t('✓ (solo Legend)', '✓ (Legend only)'), '✗', t('✓ (nativo)', '✓ (native)')],
    [t('Rotación automática', 'Automatic rotation'), '✓', '✓', '\u2014', '✓'],
    [t('Significancia estadística', 'Statistical significance'), '✓', '✓', '\u2014', '✓'],
    [t('Sugerencias de títulos con IA', 'AI title suggestions'), '✓', '✗', '✓', '✗'],
    [t('Plan mínimo necesario', 'Min plan required'), 'Pro (\u20ac9.99)', 'Legend ($49)', 'N/A', t('Gratis', 'Free')],
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--ink)' }}>
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">
        <p className="font-mono-jb text-[13px] tracking-[0.2em] uppercase mb-4" style={{ color: '#00D9FF' }}>
          {t('HERRAMIENTA PRO — EXCLUSIVA', 'PRO TOOL — EXCLUSIVE')}
        </p>
        <h1 className="font-display font-bold text-4xl md:text-6xl leading-tight mb-6">
          {t('A/B Test para tus', 'A/B Test Your')}<br />
          <span style={{ color: 'var(--red)' }}>{t('títulos de YouTube', 'YouTube Titles')}</span>
        </h1>
        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8">
          {t('Deja de adivinar qué título consigue más clics. Configura un A/B test en 30 segundos, déjalo correr automáticamente y obtendrás resultados basados en datos. La función que VidIQ no tiene.',
            'Stop guessing which title gets more clicks. Set up an A/B test in 30 seconds, let it run automatically, and get data-driven results. The feature VidIQ doesn\'t have.')}
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link href="/signup" className="btn-offset px-8 py-3 text-[15px] font-display">
            {t('Empieza a testear', 'Start A/B testing')}
          </Link>
          <Link href="/ab-test" className="btn-offset btn-offset-white px-8 py-3 text-[15px] font-display">
            {t('Ver cómo funciona', 'See how it works')}
          </Link>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-6 text-center">
          {t('Por qué el A/B testing de títulos importa más de lo que crees', 'Why A/B testing titles matters more than you think')}
        </h2>
        <div className="soft-card p-6 md:p-8 space-y-4 text-zinc-400 text-[15px] leading-relaxed">
          <p>
            {t('Tu título es el factor #1 en si alguien hace clic en tu vídeo. Una mejora del 1% en CTR en un vídeo con 100.000 impresiones = ', 'Your title is the #1 factor in whether someone clicks your video. A 1% CTR improvement on a video with 100,000 impressions = ')}
            <strong className="text-white">{t('1.000 clics extra', '1,000 extra clicks')}</strong>
            {t('. Multiplica eso por tu catálogo y la diferencia es brutal.', '. Multiply that across your catalog and the difference is massive.')}
          </p>
          <p>
            {t('La mayoría de creadores eligen títulos por instinto. El top 1% los testea con datos. Hasta ahora, la única forma de hacer esto era TubeBuddy Legend a $49/mes. YTubViral trae la misma funcionalidad a una fracción del precio.',
              'Most creators pick titles based on gut feeling. The top 1% test them with data. Until now, the only way to do this was TubeBuddy Legend at $49/month. YTubViral brings the same capability at a fraction of the price.')}
          </p>
          <p>
            {t('Combinado con el test nativo de thumbnails de YouTube, ahora puedes optimizar ambos elementos que impulsan el CTR — y YouTube recompensa un CTR más alto con más impresiones. Es un efecto compuesto.',
              'Combined with YouTube\'s native thumbnail testing, you can now optimize both elements that drive CTR — and YouTube rewards higher CTR with more impressions. It\'s a compounding effect.')}
          </p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-10 text-center">
          {t('Cómo funciona', 'How it works')}
        </h2>
        <div className="space-y-8">
          {steps.map((s) => (
            <div key={s.step} className="flex gap-5 items-start">
              <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-lg" style={{ background: 'var(--red)', color: 'white' }}>
                {s.step}
              </div>
              <div>
                <h3 className="font-display font-bold text-lg mb-1">{s.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-8 text-center">
          {t('A/B testing: ¿quién lo ofrece?', 'A/B testing: who offers it?')}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-white/10">
                <th className="py-3 px-4 font-display font-bold">{t('Característica', 'Feature')}</th>
                <th className="py-3 px-4 font-display font-bold text-center" style={{ color: 'var(--red)' }}>YTubViral</th>
                <th className="py-3 px-4 font-display font-bold text-center text-zinc-500">TubeBuddy</th>
                <th className="py-3 px-4 font-display font-bold text-center text-zinc-500">VidIQ</th>
                <th className="py-3 px-4 font-display font-bold text-center text-zinc-500">YouTube</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              {comparison.map(([feat, ytub, tube, vidiq, yt]) => (
                <tr key={feat} className="border-b border-white/5">
                  <td className="py-2.5 px-4">{feat}</td>
                  <td className="py-2.5 px-4 text-center text-white font-medium">{ytub}</td>
                  <td className="py-2.5 px-4 text-center">{tube}</td>
                  <td className="py-2.5 px-4 text-center">{vidiq}</td>
                  <td className="py-2.5 px-4 text-center">{yt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-8 text-center">
          {t('Preguntas frecuentes', 'Frequently asked questions')}
        </h2>
        <div className="space-y-6">
          {FAQ.map((item) => (
            <div key={item.q} className="soft-card p-5">
              <h3 className="font-display font-bold text-base mb-2">{item.q}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: FAQ_ES.map((item) => ({
              '@type': 'Question',
              name: item.q,
              acceptedAnswer: { '@type': 'Answer', text: item.a },
            })),
          }),
        }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'YTubViral — A/B Testing',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            url: 'https://ytubviral.com/features/ab-testing',
            offers: [
              { '@type': 'Offer', price: '0', priceCurrency: 'EUR', name: 'Free' },
              { '@type': 'Offer', price: '9.99', priceCurrency: 'EUR', name: 'Pro' },
            ],
          }),
        }}
      />

      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-4">
          {t('Deja de adivinar. Empieza a testear.', 'Stop guessing. Start testing.')}
        </h2>
        <p className="text-zinc-400 mb-8">{t('Testea tus títulos de YouTube por 9,99 euros/mes. VidIQ no puede hacer esto a ningún precio.', 'A/B test your YouTube titles for \u20ac9.99/month. VidIQ can\'t do this at any price.')}</p>
        <Link href="/signup" className="btn-offset px-10 py-4 text-[15px] font-display">
          {t('Empieza tu primer A/B test', 'Start your first A/B test')}
        </Link>
      </section>
    </div>
  );
}
