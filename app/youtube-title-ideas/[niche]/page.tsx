import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PublicNav from '@/components/PublicNav';
import FreeToolsCrossLinks from '@/components/FreeToolsCrossLinks';
import { NICHES, getNiche, generateTitleIdeas } from '@/lib/niches-data';
import { getServerLang } from '@/lib/server-lang';

export function generateStaticParams() {
  return NICHES.map(n => ({ niche: n.slug }));
}

// No generar páginas para slugs fuera de la lista.
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ niche: string }> }): Promise<Metadata> {
  const { niche: slug } = await params;
  const niche = getNiche(slug);
  if (!niche) return {};
  const name = niche.name.es;
  return {
    title: `Ideas de títulos para canales de ${name} en YouTube | YTubViral`,
    description: `Más de 20 ideas de títulos virales para canales de ${name} en YouTube, listas para usar. Gratis, sin registro, con frameworks que funcionan.`,
    alternates: { canonical: `https://ytubviral.com/youtube-title-ideas/${slug}` },
    openGraph: {
      title: `Ideas de títulos para canales de ${name} en YouTube`,
      description: `Más de 20 ideas de títulos virales para canales de ${name}. Gratis, sin registro.`,
      url: `https://ytubviral.com/youtube-title-ideas/${slug}`,
      images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    },
  };
}

export default async function NicheTitleIdeasPage({ params }: { params: Promise<{ niche: string }> }) {
  const { niche: slug } = await params;
  const niche = getNiche(slug);
  if (!niche) notFound();

  const lang = getServerLang();
  const t = (es: string, en: string) => (lang === 'en' ? en : es);
  const name = lang === 'en' ? niche.name.en : niche.name.es;
  const ideas = generateTitleIdeas(niche, lang, 24);

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Ideas de títulos para canales de ${niche.name.es}`,
    itemListElement: ideas.map((title, i) => ({ '@type': 'ListItem', position: i + 1, name: title })),
  };

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <PublicNav />

      <div className="max-w-3xl mx-auto px-6 py-12">
        <nav className="mb-6 font-mono-jb text-[12px]" style={{ color: 'var(--yv-text-4)' }}>
          <a href="/youtube-title-ideas" className="hover:text-white transition">{t('Ideas de títulos', 'Title ideas')}</a>
          <span className="mx-2">/</span>
          <span className="capitalize" style={{ color: 'var(--yv-text-2)' }}>{name}</span>
        </nav>

        <header className="mb-10">
          <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--yv-brand)' }}>
            {t('IDEAS GRATIS', 'FREE IDEAS')}
          </p>
          <h1 className="font-display font-bold text-4xl text-white mb-4 capitalize">
            {t(`Ideas de títulos para canales de ${name}`, `Title ideas for ${name} channels`)}
          </h1>
          <p className="font-mono-jb text-sm leading-relaxed" style={{ color: 'var(--yv-text-3)' }}>
            {t(
              `${ideas.length} ideas de títulos listas para usar para vídeos de ${name}, basadas en frameworks de títulos que funcionan en YouTube. Cópialas, adáptalas a tu vídeo y púntualas con el analizador gratis.`,
              `${ideas.length} ready-to-use title ideas for ${name} videos, based on title frameworks that work on YouTube. Copy them, adapt them to your video and score them with the free analyzer.`
            )}
          </p>
        </header>

        <ol className="space-y-2 mb-10">
          {ideas.map((title, i) => (
            <li key={i} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'var(--yv-surface)', border: '1px solid var(--yv-border)' }}>
              <span className="font-mono-jb text-[13px] flex-shrink-0 w-6 text-right" style={{ color: 'var(--yv-text-4)' }}>{i + 1}.</span>
              <span className="text-white text-sm">{title}</span>
            </li>
          ))}
        </ol>

        <div className="mb-12 p-6 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--yv-border)' }}>
          <p className="font-mono-jb text-[13px] leading-relaxed mb-4" style={{ color: 'var(--yv-text-2)' }}>
            {t(
              'Consejo: pega cualquiera de estas ideas en el Analizador de Títulos para ver su puntuación de CTR y SEO y afinarla antes de publicar.',
              'Tip: paste any of these ideas into the Title Analyzer to see its CTR and SEO score and refine it before publishing.'
            )}
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="/title-analyzer" className="font-mono-jb text-[13px] px-4 py-2 rounded-lg transition hover:bg-white/[0.04]" style={{ border: '1px solid var(--yv-border)', color: 'var(--yv-text-2)' }}>
              📝 {t('Analizar un título', 'Analyze a title')}
            </a>
            <a href="/generate" className="font-mono-jb text-[13px] px-4 py-2 rounded-lg transition hover:bg-white/[0.04]" style={{ border: '1px solid var(--yv-border)', color: 'var(--yv-text-2)' }}>
              ✍️ {t('Generar títulos con IA', 'Generate titles with AI')}
            </a>
          </div>
        </div>

        {/* CTA */}
        <div className="mb-12 p-8 rounded-xl text-center" style={{ background: 'linear-gradient(135deg, rgba(232,77,91,0.06), rgba(0,229,255,0.04))', border: '1px solid rgba(232,77,91,0.2)' }}>
          <p className="font-display font-bold text-white text-xl mb-2">
            {t(`¿Quieres títulos de ${name} a medida de tu vídeo?`, `Want ${name} titles tailored to your video?`)}
          </p>
          <p className="font-mono-jb text-sm mb-5" style={{ color: 'var(--yv-text-3)' }}>
            {t('La IA genera títulos adaptados a tu canal y tu tema. 10 generaciones gratis al mes.', 'AI generates titles tailored to your channel and topic. 10 free generations per month.')}
          </p>
          <a href="/signup" className="btn-offset inline-flex px-8 py-3.5 text-sm font-display font-bold">
            {t('Crear cuenta gratis →', 'Create free account →')}
          </a>
        </div>

        {/* Contenido educativo (SEO) */}
        <section className="border-t pt-10" style={{ borderColor: 'var(--yv-border)' }}>
          <h2 className="font-display font-bold text-2xl text-white mb-4">
            {t(`Cómo escribir buenos títulos para vídeos de ${name}`, `How to write good titles for ${name} videos`)}
          </h2>
          <p className="font-mono-jb text-sm leading-relaxed mb-4" style={{ color: 'var(--yv-text-3)' }}>
            {t(
              `Un buen título de ${name} combina la palabra clave por la que quieres posicionar con un gancho que despierte curiosidad. Las ideas de arriba parten de frameworks probados (cómo, listas, retos de 30 días, "la verdad sobre..."), pero el secreto está en adaptarlas a tu vídeo concreto y a tu audiencia.`,
              `A good ${name} title combines the keyword you want to rank for with a hook that sparks curiosity. The ideas above start from proven frameworks (how-to, lists, 30-day challenges, "the truth about..."), but the secret is adapting them to your specific video and audience.`
            )}
          </p>
          <ul className="space-y-3 mb-8">
            {[
              { es: 'Mantén el título entre 40 y 70 caracteres para que no se corte.', en: 'Keep the title between 40 and 70 characters so it isn\'t cut off.' },
              { es: 'Incluye un número o un año cuando encaje ("7 trucos", "en 2026").', en: 'Include a number or year when it fits ("7 tips", "in 2026").' },
              { es: 'Pon la palabra clave principal al principio del título.', en: 'Put the main keyword at the start of the title.' },
              { es: 'Evita el clickbait vacío: el título debe cumplir lo que promete.', en: 'Avoid empty clickbait: the title must deliver what it promises.' },
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-3 font-mono-jb text-sm" style={{ color: 'var(--yv-text-2)' }}>
                <span style={{ color: 'var(--yv-brand)' }}>→</span>
                <span>{lang === 'en' ? item.en : item.es}</span>
              </li>
            ))}
          </ul>

          <FreeToolsCrossLinks current="/youtube-title-ideas" lang={lang} />
        </section>
      </div>
    </div>
  );
}
