'use client';

import { useState, useMemo } from 'react';
import { useLang } from '@/components/LangProvider';
import PublicNav from '@/components/PublicNav';
import ExitIntentPopup from '@/components/ExitIntentPopup';
import FreeToolsCrossLinks from '@/components/FreeToolsCrossLinks';
import { analyzeTitle as analyze } from '@/lib/title-score';

type Lang = 'es' | 'en';

interface Check {
  key: string;
  label: { es: string; en: string };
  earned: number;
  weight: number;
  tip: { es: string; en: string };
}



function scoreColor(score: number): string {
  if (score >= 70) return '#22c55e';
  if (score >= 40) return '#FFE800';
  return '#e84d5b';
}
function scoreBg(score: number): string {
  if (score >= 70) return 'rgba(34,197,94,0.12)';
  if (score >= 40) return 'rgba(255,232,0,0.10)';
  return 'rgba(232,77,91,0.12)';
}
function scoreLabel(score: number, lang: Lang): string {
  if (score >= 70) return lang === 'en' ? 'Strong' : 'Fuerte';
  if (score >= 40) return lang === 'en' ? 'Needs work' : 'Mejorable';
  return lang === 'en' ? 'Weak' : 'Flojo';
}

const FAQ = [
  {
    q: { es: '¿Cuál es la longitud ideal de un título de YouTube?', en: 'What is the ideal YouTube title length?' },
    a: { es: 'Entre 40 y 70 caracteres. YouTube muestra el título completo en resultados y sugeridos hasta unos 70 caracteres; a partir de ahí lo recorta con puntos suspensivos. Menos de 30 desaprovecha el espacio para keywords y gancho.', en: 'Between 40 and 70 characters. YouTube shows the full title in search and suggested up to ~70 characters; beyond that it truncates with an ellipsis. Under 30 wastes space for keywords and hook.' },
  },
  {
    q: { es: '¿Sirven los números en los títulos?', en: 'Do numbers in titles help?' },
    a: { es: 'Sí. Los números ("7 trucos", "en 5 minutos", "2026") aumentan el CTR porque prometen contenido concreto y fácil de consumir. Úsalos cuando encajen de forma natural.', en: 'Yes. Numbers ("7 tips", "in 5 minutes", "2026") increase CTR because they promise concrete, easy-to-consume content. Use them when they fit naturally.' },
  },
  {
    q: { es: '¿Por qué penaliza escribir en mayúsculas?', en: 'Why is writing in all caps penalized?' },
    a: { es: 'Escribir varias palabras EN MAYÚSCULAS se percibe como spam o clickbait agresivo y puede reducir la confianza del espectador. Resaltar una sola palabra clave funciona; el título entero en mayúsculas, no.', en: 'Writing several words in ALL CAPS reads as spam or aggressive clickbait and can lower viewer trust. Emphasizing a single keyword works; the whole title in caps does not.' },
  },
  {
    q: { es: '¿Esta herramienta es gratis?', en: 'Is this tool free?' },
    a: { es: 'Sí, totalmente gratis y sin registro. El análisis se hace al instante en tu navegador. Si quieres que la IA genere títulos optimizados por ti, puedes crear una cuenta gratuita con 10 generaciones al mes.', en: 'Yes, completely free and no signup. The analysis runs instantly in your browser. If you want AI to generate optimized titles for you, you can create a free account with 10 generations per month.' },
  },
];

export default function TitleAnalyzerClient() {
  const lang = useLang();
  const t = (es: string, en: string) => (lang === 'en' ? en : es);
  const [title, setTitle] = useState('');

  const trimmed = title.trim();
  const result = useMemo(() => (trimmed ? analyze(title) : null), [title, trimmed]);

  // Recorte de previsualización tipo búsqueda de YouTube (~70 car.)
  const previewTitle = trimmed.length > 70 ? trimmed.slice(0, 69) + '…' : trimmed;

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      <PublicNav />

      <div className="max-w-3xl mx-auto px-6 py-12">
        <header className="mb-10">
          <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--yv-brand)' }}>
            {t('HERRAMIENTA GRATIS', 'FREE TOOL')}
          </p>
          <h1 className="font-display font-bold text-4xl text-white mb-4">
            {t('Analizador de Títulos de YouTube', 'YouTube Title Analyzer')}
          </h1>
          <p className="font-mono-jb text-sm leading-relaxed" style={{ color: 'var(--yv-text-3)' }}>
            {t(
              'Escribe el título de tu vídeo y obtén al instante una puntuación de 0 a 100 con consejos concretos para mejorar el CTR y el SEO. Sin registro, sin tarjeta — antes de publicar.',
              'Type your video title and get an instant 0-100 score with concrete tips to improve CTR and SEO. No signup, no card — before you publish.'
            )}
          </p>
        </header>

        {/* Input */}
        <div className="mb-6">
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={t('Escribe el título de tu vídeo...', 'Type your video title...')}
            className="w-full px-4 py-3.5 rounded-xl text-base font-mono-jb"
            autoFocus
            style={{ background: 'var(--yv-surface)', border: '1px solid var(--yv-border)', color: 'var(--yv-text)', outline: 'none' }}
            onFocus={e => { e.target.style.borderColor = 'var(--yv-brand)'; }}
            onBlur={e => { e.target.style.borderColor = 'var(--yv-border)'; }}
          />
          <div className="flex items-center justify-between mt-2 px-1">
            <span className="font-mono-jb text-[12px]" style={{ color: trimmed.length > 70 ? '#e84d5b' : 'var(--yv-text-4)' }}>
              {trimmed.length} {t('caracteres', 'characters')}
            </span>
            <span className="font-mono-jb text-[12px]" style={{ color: 'var(--yv-text-4)' }}>
              {t('Recomendado: 40-70', 'Recommended: 40-70')}
            </span>
          </div>
        </div>

        {!result && (
          <div className="text-center py-16">
            <div className="mb-4"><img src="/icons/title.webp" alt="" width={56} height={56} className="inline-block object-contain" /></div>
            <p className="font-mono-jb text-sm" style={{ color: 'var(--yv-text-2)' }}>
              {t('Escribe un título arriba para analizarlo gratis.', 'Type a title above to analyze it for free.')}
            </p>
          </div>
        )}

        {result && (
          <>
            {/* Score + preview */}
            <div className="grid sm:grid-cols-[auto_1fr] gap-4 mb-6">
              <div
                className="flex flex-col items-center justify-center px-6 py-5 rounded-xl"
                style={{ background: scoreBg(result.score), border: `1px solid ${scoreColor(result.score)}33` }}
              >
                <span className="text-4xl font-bold font-mono-jb" style={{ color: scoreColor(result.score) }}>{result.score}</span>
                <span className="font-mono-jb text-[12px]" style={{ color: scoreColor(result.score), opacity: 0.8 }}>/100 · {scoreLabel(result.score, lang)}</span>
              </div>

              {/* Vista previa estilo búsqueda YouTube */}
              <div className="rounded-xl p-4 flex gap-3" style={{ background: 'var(--yv-surface)', border: '1px solid var(--yv-border)' }}>
                <div className="w-28 h-16 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--yv-text-4)" strokeWidth="1.5"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="font-mono-jb text-[11px] mb-1" style={{ color: 'var(--yv-text-4)' }}>{t('Así se verá en búsqueda', 'How it looks in search')}</p>
                  <p className="text-white text-sm font-medium leading-snug" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {previewTitle || t('(vacío)', '(empty)')}
                  </p>
                </div>
              </div>
            </div>

            {/* Checks */}
            <div className="space-y-2 mb-10">
              {[...result.checks].sort((a, b) => (a.earned / a.weight) - (b.earned / b.weight)).map(c => {
                const full = c.earned === c.weight;
                return (
                  <div key={c.key} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: full ? 'rgba(34,197,94,0.05)' : 'rgba(232,77,91,0.05)' }}>
                    <div className="flex-shrink-0 mt-0.5">
                      {full ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e84d5b" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-display font-medium">{lang === 'en' ? c.label.en : c.label.es}</p>
                      {!full && (c.tip.es || c.tip.en) && (
                        <p className="text-[13px] font-mono-jb mt-0.5" style={{ color: 'var(--yv-text-3)' }}>{lang === 'en' ? c.tip.en : c.tip.es}</p>
                      )}
                    </div>
                    <span className="flex-shrink-0 font-mono-jb text-[12px]" style={{ color: 'var(--yv-text-4)' }}>
                      {c.earned}/{c.weight}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* CTA AI */}
            <div className="mb-12 p-8 rounded-xl text-center" style={{ background: 'linear-gradient(135deg, rgba(232,77,91,0.06), rgba(0,229,255,0.04))', border: '1px solid rgba(232,77,91,0.2)' }}>
              <p className="font-display font-bold text-white text-xl mb-2">
                {t('¿Quieres que la IA escriba títulos de 90+ por ti?', 'Want AI to write 90+ titles for you?')}
              </p>
              <p className="font-mono-jb text-sm mb-5" style={{ color: 'var(--yv-text-3)' }}>
                {t('10 generaciones gratis al mes. Sin tarjeta de crédito.', '10 free generations per month. No credit card required.')}
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
            {t('Qué hace bueno a un título de YouTube', 'What makes a great YouTube title')}
          </h2>
          <p className="font-mono-jb text-sm leading-relaxed mb-4" style={{ color: 'var(--yv-text-3)' }}>
            {t(
              'El título es, junto a la miniatura, lo que decide si alguien hace clic en tu vídeo. Un buen título combina la palabra clave por la que quieres posicionar, un gancho que despierte curiosidad y una longitud que no se corte en los resultados de búsqueda. Estos son los factores que analiza esta herramienta:',
              'The title is, alongside the thumbnail, what decides whether someone clicks your video. A good title combines the keyword you want to rank for, a hook that sparks curiosity, and a length that won\'t get cut off in search results. These are the factors this tool analyzes:'
            )}
          </p>
          <ul className="space-y-3 mb-8">
            {[
              { es: 'Longitud de 40-70 caracteres para que se vea completo en búsqueda y sugeridos.', en: '40-70 characters so it shows in full in search and suggested.' },
              { es: 'Un número que prometa contenido concreto ("7 trucos", "en 2026").', en: 'A number that promises concrete content ("7 tips", "in 2026").' },
              { es: 'Palabras gancho que activan curiosidad o urgencia (cómo, mejor, evita, gratis).', en: 'Power words that trigger curiosity or urgency (how, best, avoid, free).' },
              { es: 'Corchetes o paréntesis para añadir contexto sin gastar el título principal.', en: 'Brackets or parentheses to add context without using up the main title.' },
              { es: 'Un gancho de intención: empezar con "Cómo", "Por qué" o una pregunta.', en: 'A search-intent hook: starting with "How", "Why" or a question.' },
              { es: 'Sin abuso de mayúsculas, que se percibe como spam.', en: 'No all-caps abuse, which reads as spam.' },
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-3 font-mono-jb text-sm" style={{ color: 'var(--yv-text-2)' }}>
                <span style={{ color: 'var(--yv-brand)' }}>→</span>
                <span>{lang === 'en' ? item.en : item.es}</span>
              </li>
            ))}
          </ul>

          <div className="rounded-xl p-5 mb-10 flex items-start gap-3" style={{ background: 'var(--yv-surface)', border: '1px solid var(--yv-border)' }}>
            <span style={{ color: 'var(--yv-brand)' }}>→</span>
            <p className="font-mono-jb text-sm leading-relaxed" style={{ color: 'var(--yv-text-2)' }}>
              {t(
                '¿De dónde salen estos criterios? Analizamos 1.814 títulos reales de YouTube con la API oficial. ',
                'Where do these criteria come from? We analyzed 1,814 real YouTube titles with the official API. '
              )}
              <a href="/youtube-title-study" className="underline hover:text-white transition">
                {t('Ver el estudio completo →', 'See the full study →')}
              </a>
            </p>
          </div>

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

          {/* Cross-linking interno (SEO Fase 1) — fuente única en FreeToolsCrossLinks */}
          <FreeToolsCrossLinks current="/title-analyzer" lang={lang} />
        </section>
      </div>

      <ExitIntentPopup lang={lang} />
    </div>
  );
}
