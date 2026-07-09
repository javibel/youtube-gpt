import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PublicNav from '@/components/PublicNav';
import FreeToolsCrossLinks from '@/components/FreeToolsCrossLinks';
import { TOPIC_SLUGS, STUDY_META, getTopicStudy, computeFindings, METRIC_DEFS } from '@/lib/title-study-data';
import { getNiche } from '@/lib/niches-data';
import { getServerLang } from '@/lib/server-lang';

export function generateStaticParams() {
  return TOPIC_SLUGS.map(topic => ({ topic }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ topic: string }> }): Promise<Metadata> {
  const { topic: slug } = await params;
  const topic = getTopicStudy(slug);
  if (!topic) return {};
  const name = topic.name.es;
  return {
    title: `Anatomía de un título de YouTube en ${name}: ${topic.sampleSize} vídeos analizados | YTubViral`,
    description: `Analizamos los títulos de los vídeos más vistos de ${name} en YouTube: longitud, números, listicles y palabras gancho, con datos reales de la API.`,
    alternates: { canonical: `https://ytubviral.com/youtube-title-study/${slug}` },
    openGraph: {
      title: `Anatomía de un título de YouTube en ${name}`,
      description: `Datos reales sobre qué tienen en común los títulos de ${name} que más vistas consiguen.`,
      url: `https://ytubviral.com/youtube-title-study/${slug}`,
      type: 'article',
      images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    },
  };
}

export default async function TitleStudyTopicPage({ params }: { params: Promise<{ topic: string }> }) {
  const { topic: slug } = await params;
  const topic = getTopicStudy(slug);
  if (!topic) notFound();

  const lang = getServerLang();
  const t = (es: string, en: string) => (lang === 'en' ? en : es);
  const name = lang === 'en' ? topic.name.en : topic.name.es;
  const findings = computeFindings(slug);
  const trending = STUDY_META.trending;
  const nicheGlobal = STUDY_META.nicheGlobal;
  const ideasNiche = getNiche(slug);

  const datasetLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `Anatomía de títulos de YouTube en ${topic.name.es} — ${topic.sampleSize} vídeos`,
    description: `Métricas de título (longitud, números, listicles, palabras gancho) calculadas sobre ${topic.sampleSize} vídeos reales de YouTube del nicho ${topic.name.es}.`,
    url: `https://ytubviral.com/youtube-title-study/${slug}`,
    datePublished: STUDY_META.date,
    creator: { '@type': 'Organization', name: 'YTubViral', url: 'https://ytubviral.com' },
    measurementTechnique: 'YouTube Data API v3 (search.list order=viewCount)',
    variableMeasured: ['title length', 'numbers in title', 'listicle format', 'hook words'],
  };

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetLd) }} />
      <PublicNav />

      <article className="max-w-3xl mx-auto px-6 py-12">
        <nav className="mb-6 font-mono-jb text-[12px]" style={{ color: 'var(--yv-text-4)' }}>
          <a href="/youtube-title-study" className="hover:text-white transition">{t('Estudio de títulos', 'Title study')}</a>
          <span className="mx-2">/</span>
          <span className="capitalize" style={{ color: 'var(--yv-text-2)' }}>{name}</span>
        </nav>

        <header className="mb-10">
          <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--yv-brand)' }}>
            {t('ESTUDIO DE DATOS', 'DATA STUDY')}
          </p>
          <h1 className="font-display font-bold text-4xl text-white mb-4 leading-tight">
            {t(`La anatomía de un título de YouTube en ${name}`, `The anatomy of a YouTube title in ${name}`)}
          </h1>
          <p className="font-mono-jb text-sm leading-relaxed" style={{ color: 'var(--yv-text-3)' }}>
            {t(
              `Analizamos los títulos de los ${topic.sampleSize} vídeos más vistos de ${name} en YouTube para ver qué tienen en común, y los comparamos contra el trending global. Datos reales, sin opiniones.`,
              `We analyzed the titles of the ${topic.sampleSize} most-viewed ${name} videos on YouTube to see what they have in common, and compared them against global trending. Real data, no opinions.`
            )}
          </p>
          {topic.smallSample && (
            <p className="font-mono-jb text-[12px] mt-3 px-3 py-2 rounded-lg inline-block" style={{ background: 'rgba(255,196,0,0.08)', border: '1px solid rgba(255,196,0,0.25)', color: '#ffc400' }}>
              {t(`Muestra pequeña (N=${topic.sampleSize}) — interpretar con cautela.`, `Small sample (N=${topic.sampleSize}) — interpret with caution.`)}
            </p>
          )}
          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-5 font-mono-jb text-[12px]" style={{ color: 'var(--yv-text-4)' }}>
            <span>{t('Muestra', 'Sample')}: <span className="text-white">{topic.sampleSize} {t('títulos', 'titles')}</span></span>
            <span>{t('Fuente', 'Source')}: <span className="text-white">YouTube Data API v3</span></span>
            <span>{t('Fecha', 'Date')}: <span className="text-white">{STUDY_META.date}</span></span>
          </div>
        </header>

        {/* Hallazgos */}
        {findings.length > 0 && (
          <div className="mb-12 p-6 rounded-xl" style={{ background: 'linear-gradient(135deg, rgba(232,77,91,0.08), rgba(0,229,255,0.05))', border: '1px solid rgba(232,77,91,0.2)' }}>
            <p className="font-mono-jb text-[12px] tracking-wider uppercase mb-3" style={{ color: 'var(--yv-brand)' }}>{t('Lo que más destaca', 'What stands out most')}</p>
            <ul className="space-y-3">
              {findings.map((f, i) => (
                <li key={i} className="font-display text-white text-base leading-relaxed">{lang === 'en' ? f.en : f.es}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Tabla comparativa */}
        <section className="mb-12">
          <h2 className="font-display font-bold text-2xl text-white mb-5 capitalize">
            {t(`Trending global vs. todos los nichos vs. ${name}`, `Global trending vs. all niches vs. ${name}`)}
          </h2>
          <div className="rounded-xl overflow-x-auto" style={{ border: '1px solid var(--yv-border)' }}>
            <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--yv-surface)' }}>
                  <th className="font-mono-jb text-[12px] px-4 py-3" style={{ color: 'var(--yv-text-3)' }}></th>
                  <th className="font-mono-jb text-[12px] px-3 py-3 text-right whitespace-nowrap" style={{ color: 'var(--yv-text-4)' }}>{t('Trending', 'Trending')}<br /><span className="text-[10px]">N={trending.sampleSize}</span></th>
                  <th className="font-mono-jb text-[12px] px-3 py-3 text-right whitespace-nowrap" style={{ color: 'var(--yv-text-4)' }}>{t('Todos los nichos', 'All niches')}<br /><span className="text-[10px]">N={nicheGlobal.sampleSize}</span></th>
                  <th className="font-mono-jb text-[12px] px-4 py-3 text-right whitespace-nowrap capitalize" style={{ color: 'var(--yv-brand)' }}>{name}<br /><span className="text-[10px]">N={topic.sampleSize}</span></th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderTop: '1px solid var(--yv-border)' }}>
                  <td className="font-mono-jb text-[13px] px-4 py-3 text-white">{t('Mediana de caracteres', 'Median characters')}</td>
                  <td className="font-mono-jb text-[13px] px-3 py-3 text-right" style={{ color: 'var(--yv-text-3)' }}>{trending.titleLength.medianChars}</td>
                  <td className="font-mono-jb text-[13px] px-3 py-3 text-right" style={{ color: 'var(--yv-text-3)' }}>{nicheGlobal.titleLength.medianChars}</td>
                  <td className="font-mono-jb text-[13px] px-4 py-3 text-right font-bold text-white">{topic.titleLength.medianChars}</td>
                </tr>
                {METRIC_DEFS.map((m) => (
                  <tr key={m.key} style={{ borderTop: '1px solid var(--yv-border)' }}>
                    <td className="font-mono-jb text-[13px] px-4 py-3 text-white">{lang === 'en' ? m.rowLabel.en : m.rowLabel.es}</td>
                    <td className="font-mono-jb text-[13px] px-3 py-3 text-right" style={{ color: 'var(--yv-text-3)' }}>{String(trending.features[m.key]).replace('.', ',')}%</td>
                    <td className="font-mono-jb text-[13px] px-3 py-3 text-right" style={{ color: 'var(--yv-text-3)' }}>{String(nicheGlobal.features[m.key]).replace('.', ',')}%</td>
                    <td className="font-mono-jb text-[13px] px-4 py-3 text-right font-bold text-white">{String(topic.features[m.key]).replace('.', ',')}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* CTA a la herramienta */}
        <div className="mb-12 p-8 rounded-xl text-center" style={{ background: 'linear-gradient(135deg, rgba(232,77,91,0.06), rgba(0,229,255,0.04))', border: '1px solid rgba(232,77,91,0.2)' }}>
          <p className="font-display font-bold text-white text-xl mb-2">
            {t(`¿Escribes títulos de ${name}?`, `Writing ${name} titles?`)}
          </p>
          <p className="font-mono-jb text-sm mb-5" style={{ color: 'var(--yv-text-3)' }}>
            {t('Nuestro analizador gratuito puntúa tu título de 0 a 100 con estos mismos factores. Sin registro.', 'Our free analyzer scores your title 0-100 using these same factors. No signup.')}
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <a href="/title-analyzer" className="btn-offset inline-flex px-7 py-3.5 text-sm font-display font-bold">
              {t('Analizar mi título →', 'Analyze my title →')}
            </a>
            {ideasNiche && (
              <a href={`/youtube-title-ideas/${slug}`} className="inline-flex px-7 py-3.5 text-sm font-display font-bold rounded-lg" style={{ border: '1px solid var(--yv-border)', color: 'var(--yv-text-2)' }}>
                {t(`Ideas de títulos de ${name} →`, `${name} title ideas →`)}
              </a>
            )}
          </div>
        </div>

        {/* Metodología */}
        <section className="mb-10 border-t pt-8" style={{ borderColor: 'var(--yv-border)' }}>
          <h2 className="font-display font-bold text-xl text-white mb-4">{t('Metodología', 'Methodology')}</h2>
          <ul className="space-y-2 font-mono-jb text-[13px] leading-relaxed" style={{ color: 'var(--yv-text-3)' }}>
            <li>• {t('Fuente: YouTube Data API v3 (datos públicos).', 'Source: YouTube Data API v3 (public data).')}</li>
            <li>• {t(`Nicho: endpoint search.list con order=viewCount, consultas en EN y ES para "${name}", deduplicado por ID → ${topic.sampleSize} títulos únicos.`, `Niche: search.list endpoint with order=viewCount, EN and ES queries for "${name}", deduplicated by ID → ${topic.sampleSize} unique titles.`)}</li>
            <li>• {t('Las métricas se calculan sobre el texto exacto del título devuelto por la API. Sin edición manual ni exclusiones.', 'Metrics are computed on the exact title text returned by the API. No manual editing or exclusions.')}</li>
            <li>• {t(`Recogido el ${STUDY_META.date}. Comparado contra el mismo baseline de trending global que el `, `Collected ${STUDY_META.date}. Compared against the same global trending baseline as the `)}<a href="/youtube-title-study" className="underline">{t('estudio general', 'main study')}</a>.</li>
          </ul>
        </section>

        {/* Índice de temas */}
        <section className="mb-10">
          <p className="font-mono-jb text-[12px] uppercase tracking-wider mb-3" style={{ color: 'var(--yv-text-4)' }}>{t('Otros nichos', 'Other niches')}</p>
          <div className="flex flex-wrap gap-2">
            {TOPIC_SLUGS.filter(s => s !== slug).map(s => {
              const other = getTopicStudy(s);
              if (!other) return null;
              const otherName = lang === 'en' ? other.name.en : other.name.es;
              return (
                <a key={s} href={`/youtube-title-study/${s}`} className="font-mono-jb text-[12px] px-3 py-1.5 rounded-lg capitalize transition hover:bg-white/[0.04]" style={{ border: '1px solid var(--yv-border)', color: 'var(--yv-text-2)' }}>
                  {otherName}
                </a>
              );
            })}
          </div>
        </section>

        <FreeToolsCrossLinks current="/youtube-title-study" lang={lang} />
      </article>
    </div>
  );
}
