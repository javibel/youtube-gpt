'use client';

import { useLang } from '@/components/LangProvider';
import PublicNav from '@/components/PublicNav';
import ExitIntentPopup from '@/components/ExitIntentPopup';
import FreeToolsCrossLinks from '@/components/FreeToolsCrossLinks';

// ──────────────────────────────────────────────────────────────────────────
// DATOS REALES del estudio (recogidos 2026-06-27 vía YouTube Data API v3).
// Trending: chart=mostPopular en 30 regiones (N=1027 únicos).
// Niche: search.list order=viewCount en 16 nichos de creador EN+ES (N=787).
// Sin edición manual. Métricas calculadas sobre los títulos exactos de la API.
// ──────────────────────────────────────────────────────────────────────────
const STUDY = {
  date: '2026-06-27',
  total: 1814,
  trending: {
    n: 1027,
    regions: 30,
    medianChars: 48,
    avgChars: 50,
    medianWords: 8,
    dist: { '≤30': 217, '31–50': 361, '51–70': 243, '71–100': 203, '>100': 3 },
    withNumber: 28.6,
    withBrackets: 46.2,
    withQuestion: 3.7,
    withAllCaps: 47.4,
    listicle: 6.1,
    withHook: 6.8,
  },
  niche: {
    n: 787,
    niches: 16,
    medianChars: 69,
    avgChars: 67,
    medianWords: 10,
    withNumber: 41.0,
    withBrackets: 32.1,
    withQuestion: 7.8,
    withAllCaps: 40.3,
    listicle: 21.3,
    withHook: 26.6,
  },
};

type Lang = 'es' | 'en';

// Filas de la tabla comparativa (trending vs nicho)
const ROWS: { label: { es: string; en: string }; t: string; ni: string; up: boolean }[] = [
  { label: { es: 'Mediana de caracteres', en: 'Median characters' }, t: '48', ni: '69', up: true },
  { label: { es: 'Mediana de palabras', en: 'Median words' }, t: '8', ni: '10', up: true },
  { label: { es: 'Incluyen un número', en: 'Include a number' }, t: '28,6%', ni: '41,0%', up: true },
  { label: { es: 'Formato listicle ("7 trucos")', en: 'Listicle format ("7 tips")' }, t: '6,1%', ni: '21,3%', up: true },
  { label: { es: 'Palabra gancho', en: 'Hook / power word' }, t: '6,8%', ni: '26,6%', up: true },
  { label: { es: 'Corchetes o paréntesis', en: 'Brackets or parentheses' }, t: '46,2%', ni: '32,1%', up: false },
  { label: { es: 'Una palabra en MAYÚSCULAS', en: 'An ALL-CAPS word' }, t: '47,4%', ni: '40,3%', up: false },
  { label: { es: 'Signo de interrogación', en: 'Question mark' }, t: '3,7%', ni: '7,8%', up: true },
];

function Bar({ label, trending, niche, lang }: { label: string; trending: number; niche: number; lang: Lang }) {
  return (
    <div className="mb-5">
      <p className="font-mono-jb text-[13px] text-white mb-2">{label}</p>
      <div className="space-y-1.5">
        {[
          { tag: lang === 'en' ? 'Niche top videos' : 'Top por nicho', v: niche, color: 'var(--yv-brand)' },
          { tag: lang === 'en' ? 'Global trending' : 'Trending global', v: trending, color: 'var(--yv-text-4)' },
        ].map((b, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="font-mono-jb text-[11px] w-28 flex-shrink-0 text-right" style={{ color: 'var(--yv-text-4)' }}>{b.tag}</span>
            <div className="flex-1 h-5 rounded" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div className="h-5 rounded flex items-center justify-end px-2" style={{ width: `${Math.max(b.v, 6)}%`, background: b.color, transition: 'width 0.6s' }}>
                <span className="font-mono-jb text-[10px] font-bold" style={{ color: i === 0 ? '#0a0a0a' : '#fff' }}>{String(b.v).replace('.', ',')}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StudyClient() {
  const lang = useLang();
  const t = (es: string, en: string) => (lang === 'en' ? en : es);

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      <PublicNav />

      <article className="max-w-3xl mx-auto px-6 py-12">
        {/* Aviso: versión archivada */}
        <div className="mb-8 px-4 py-3 rounded-lg font-mono-jb text-[12px]" style={{ background: 'var(--yv-surface)', border: '1px solid var(--yv-border)', color: 'var(--yv-text-3)' }}>
          {t(
            'Versión archivada del 27/06/2026, citada en un vídeo publicado con estos datos exactos. ',
            'Archived version from 06/27/2026, cited in a published video with these exact figures. '
          )}
          <a href="/youtube-title-study" className="underline" style={{ color: 'var(--yv-brand)' }}>
            {t('Ver los datos actualizados →', 'See the updated data →')}
          </a>
        </div>

        {/* Hero */}
        <header className="mb-10">
          <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--yv-brand)' }}>
            {t('ESTUDIO DE DATOS', 'DATA STUDY')}
          </p>
          <h1 className="font-display font-bold text-4xl text-white mb-4 leading-tight">
            {t(
              'La anatomía de un título de YouTube: analizamos 1.814 vídeos reales',
              'The anatomy of a YouTube title: we analyzed 1,814 real videos'
            )}
          </h1>
          <p className="font-mono-jb text-sm leading-relaxed" style={{ color: 'var(--yv-text-3)' }}>
            {t(
              'Recogimos los títulos de 1.814 vídeos reales de YouTube —1.027 en tendencias globales de 30 países y 787 entre los más vistos de 16 nichos de creador— para responder a una pregunta: ¿qué tienen en común los títulos que funcionan? Estos son los datos, sin opiniones.',
              'We collected the titles of 1,814 real YouTube videos — 1,027 from global trending across 30 countries and 787 from the most-viewed in 16 creator niches — to answer one question: what do titles that work have in common? Here is the data, no opinions.'
            )}
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-5 font-mono-jb text-[12px]" style={{ color: 'var(--yv-text-4)' }}>
            <span>{t('Muestra', 'Sample')}: <span className="text-white">1.814 {t('títulos', 'titles')}</span></span>
            <span>{t('Fuente', 'Source')}: <span className="text-white">YouTube Data API v3</span></span>
            <span>{t('Fecha', 'Date')}: <span className="text-white">27/06/2026</span></span>
          </div>
        </header>

        {/* Hallazgo principal */}
        <div className="mb-12 p-6 rounded-xl" style={{ background: 'linear-gradient(135deg, rgba(232,77,91,0.08), rgba(0,229,255,0.05))', border: '1px solid rgba(232,77,91,0.2)' }}>
          <p className="font-mono-jb text-[12px] tracking-wider uppercase mb-2" style={{ color: 'var(--yv-brand)' }}>{t('El hallazgo', 'The finding')}</p>
          <p className="font-display text-white text-lg leading-relaxed">
            {t(
              'El vídeo viral de masas (música, trailers, deportes) NO usa títulos optimizados: son cortos y directos. Pero los vídeos más vistos DENTRO de un nicho de creador usan títulos más largos y estructurados — más números, más listicles y más palabras gancho. Cuando compites por un tema en lugar de por viralidad de masas, la estructura del título sí importa.',
              'Mass-viral video (music, trailers, sports) does NOT use optimized titles: they are short and blunt. But the most-viewed videos WITHIN a creator niche use longer, more structured titles — more numbers, more listicles, more hook words. When you compete for a topic instead of mass virality, title structure does matter.'
            )}
          </p>
        </div>

        {/* Tabla comparativa */}
        <section className="mb-12">
          <h2 className="font-display font-bold text-2xl text-white mb-5">
            {t('Trending global vs. top por nicho', 'Global trending vs. niche top videos')}
          </h2>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--yv-border)' }}>
            <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--yv-surface)' }}>
                  <th className="font-mono-jb text-[12px] px-4 py-3" style={{ color: 'var(--yv-text-3)' }}></th>
                  <th className="font-mono-jb text-[12px] px-3 py-3 text-right" style={{ color: 'var(--yv-text-4)' }}>{t('Trending', 'Trending')}<br /><span className="text-[10px]">N=1.027</span></th>
                  <th className="font-mono-jb text-[12px] px-4 py-3 text-right" style={{ color: 'var(--yv-brand)' }}>{t('Nicho', 'Niche')}<br /><span className="text-[10px]">N=787</span></th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--yv-border)' }}>
                    <td className="font-mono-jb text-[13px] px-4 py-3 text-white">{lang === 'en' ? r.label.en : r.label.es}</td>
                    <td className="font-mono-jb text-[13px] px-3 py-3 text-right" style={{ color: 'var(--yv-text-3)' }}>{r.t}</td>
                    <td className="font-mono-jb text-[13px] px-4 py-3 text-right font-bold" style={{ color: r.up ? '#22c55e' : 'var(--yv-text-2)' }}>{r.ni}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="font-mono-jb text-[11px] mt-3" style={{ color: 'var(--yv-text-4)' }}>
            {t(
              'En verde, las métricas más altas entre los vídeos más vistos por nicho que entre el trending de masas.',
              'In green, metrics that are higher among the most-viewed niche videos than in mass trending.'
            )}
          </p>
        </section>

        {/* Barras clave */}
        <section className="mb-12">
          <h2 className="font-display font-bold text-2xl text-white mb-6">
            {t('Las tres diferencias que más destacan', 'The three differences that stand out most')}
          </h2>
          <Bar label={t('Incluyen un número en el título', 'Include a number in the title')} trending={STUDY.trending.withNumber} niche={STUDY.niche.withNumber} lang={lang} />
          <Bar label={t('Usan formato listicle ("7 trucos para...")', 'Use a listicle format ("7 tips to...")')} trending={STUDY.trending.listicle} niche={STUDY.niche.listicle} lang={lang} />
          <Bar label={t('Incluyen una palabra gancho (cómo, mejor, evita...)', 'Include a hook word (how, best, avoid...)')} trending={STUDY.trending.withHook} niche={STUDY.niche.withHook} lang={lang} />
        </section>

        {/* Longitud */}
        <section className="mb-12">
          <h2 className="font-display font-bold text-2xl text-white mb-4">
            {t('La longitud: 48 vs 69 caracteres', 'Length: 48 vs 69 characters')}
          </h2>
          <p className="font-mono-jb text-sm leading-relaxed mb-4" style={{ color: 'var(--yv-text-3)' }}>
            {t(
              'La mediana de un título trending global es de 48 caracteres. Entre los vídeos más vistos por nicho sube a 69 — justo en el límite de lo que YouTube muestra sin cortar (~70 caracteres). Los creadores que rankean en su nicho aprovechan todo el espacio disponible para meter keyword y gancho, mientras que el contenido viral de masas no lo necesita.',
              'The median global trending title is 48 characters. Among the most-viewed niche videos it rises to 69 — right at the edge of what YouTube shows without truncating (~70 characters). Creators ranking in their niche use all the available space for keyword and hook, while mass-viral content does not need to.'
            )}
          </p>
          <div className="rounded-xl p-5" style={{ background: 'var(--yv-surface)', border: '1px solid var(--yv-border)' }}>
            <p className="font-mono-jb text-[12px] mb-3" style={{ color: 'var(--yv-text-4)' }}>{t('Distribución de longitud — trending global (1.027 títulos)', 'Length distribution — global trending (1,027 titles)')}</p>
            {Object.entries(STUDY.trending.dist).map(([bucket, count]) => {
              const p = Math.round((count / STUDY.trending.n) * 100);
              return (
                <div key={bucket} className="flex items-center gap-3 mb-1.5">
                  <span className="font-mono-jb text-[11px] w-16 flex-shrink-0 text-right" style={{ color: 'var(--yv-text-4)' }}>{bucket}</span>
                  <div className="flex-1 h-4 rounded" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <div className="h-4 rounded" style={{ width: `${Math.max(p, 2)}%`, background: 'var(--yv-brand)' }} />
                  </div>
                  <span className="font-mono-jb text-[11px] w-10 flex-shrink-0" style={{ color: 'var(--yv-text-3)' }}>{p}%</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Qué significa para tus títulos */}
        <section className="mb-12">
          <h2 className="font-display font-bold text-2xl text-white mb-4">
            {t('Qué significa esto para tus títulos', 'What this means for your titles')}
          </h2>
          <ul className="space-y-3 mb-6">
            {[
              { es: 'Si compites en un nicho (no buscas viralidad de masas), aprovecha los 60-70 caracteres: hay sitio para keyword + gancho.', en: 'If you compete in a niche (not chasing mass virality), use 60-70 characters: there is room for keyword + hook.' },
              { es: 'Los números y los listicles son tres veces más frecuentes entre los vídeos top por nicho. Si encaja, ponlos.', en: 'Numbers and listicles are three times more frequent among top niche videos. If it fits, use them.' },
              { es: 'Una palabra gancho (cómo, mejor, evita, gratis) aparece en 1 de cada 4 títulos top por nicho, frente a 1 de cada 15 en trending.', en: 'A hook word (how, best, avoid, free) appears in 1 of every 4 top niche titles, versus 1 in 15 in trending.' },
              { es: 'No abuses de las MAYÚSCULAS: incluso entre los vídeos más vistos no son mayoría, y leen como spam.', en: 'Do not overuse ALL-CAPS: even among the most-viewed videos they are not the majority, and they read as spam.' },
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-3 font-mono-jb text-sm" style={{ color: 'var(--yv-text-2)' }}>
                <span style={{ color: 'var(--yv-brand)' }}>→</span>
                <span>{lang === 'en' ? item.en : item.es}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* CTA a la herramienta */}
        <div className="mb-12 p-8 rounded-xl text-center" style={{ background: 'linear-gradient(135deg, rgba(232,77,91,0.06), rgba(0,229,255,0.04))', border: '1px solid rgba(232,77,91,0.2)' }}>
          <p className="font-display font-bold text-white text-xl mb-2">
            {t('Mide tu título con estos mismos criterios', 'Score your title against these same criteria')}
          </p>
          <p className="font-mono-jb text-sm mb-5" style={{ color: 'var(--yv-text-3)' }}>
            {t(
              'Nuestro analizador gratuito puntúa tu título de 0 a 100 con los factores de este estudio. Sin registro.',
              'Our free analyzer scores your title 0-100 using the factors in this study. No signup.'
            )}
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <a href="/title-analyzer" className="btn-offset inline-flex px-7 py-3.5 text-sm font-display font-bold">
              {t('Analizar mi título →', 'Analyze my title →')}
            </a>
            <a href="/seo-score" className="inline-flex px-7 py-3.5 text-sm font-display font-bold rounded-lg" style={{ border: '1px solid var(--yv-border)', color: 'var(--yv-text-2)' }}>
              {t('Puntuar mi SEO', 'Score my SEO')}
            </a>
          </div>
        </div>

        {/* Metodología (citabilidad) */}
        <section className="mb-10 border-t pt-8" style={{ borderColor: 'var(--yv-border)' }}>
          <h2 className="font-display font-bold text-xl text-white mb-4">{t('Metodología', 'Methodology')}</h2>
          <ul className="space-y-2 font-mono-jb text-[13px] leading-relaxed" style={{ color: 'var(--yv-text-3)' }}>
            <li>• {t('Fuente: YouTube Data API v3 (datos públicos).', 'Source: YouTube Data API v3 (public data).')}</li>
            <li>• {t('Trending: endpoint videos.list con chart=mostPopular en 30 regiones, 50 vídeos por región, deduplicado por ID → 1.027 únicos.', 'Trending: videos.list endpoint with chart=mostPopular across 30 regions, 50 videos per region, deduplicated by ID → 1,027 unique.')}</li>
            <li>• {t('Nicho: endpoint search.list con order=viewCount en 16 nichos de creador (EN+ES), 50 por nicho → 787 únicos.', 'Niche: search.list endpoint with order=viewCount across 16 creator niches (EN+ES), 50 per niche → 787 unique.')}</li>
            <li>• {t('Las métricas se calculan sobre el texto exacto del título devuelto por la API. Sin edición manual ni exclusiones.', 'Metrics are computed on the exact title text returned by the API. No manual editing or exclusions.')}</li>
            <li>• {t('Recogido el 27 de junio de 2026. "Palabra gancho" = lista de 45 términos de alto CTR en EN y ES.', 'Collected June 27, 2026. "Hook word" = list of 45 high-CTR terms in EN and ES.')}</li>
          </ul>
          <div className="mt-5 rounded-lg p-4" style={{ background: 'var(--yv-surface)', border: '1px solid var(--yv-border)' }}>
            <p className="font-mono-jb text-[11px] mb-1" style={{ color: 'var(--yv-text-4)' }}>{t('Cómo citar este estudio', 'How to cite this study')}</p>
            <p className="font-mono-jb text-[12px] leading-relaxed" style={{ color: 'var(--yv-text-2)' }}>
              {t(
                'YTubViral (2026). "La anatomía de un título de YouTube: análisis de 1.814 vídeos." ytubviral.com/youtube-title-study',
                'YTubViral (2026). "The anatomy of a YouTube title: an analysis of 1,814 videos." ytubviral.com/youtube-title-study'
              )}
            </p>
          </div>
        </section>

        <FreeToolsCrossLinks current="/youtube-title-study" lang={lang} />
      </article>

      <ExitIntentPopup lang={lang} />
    </div>
  );
}
