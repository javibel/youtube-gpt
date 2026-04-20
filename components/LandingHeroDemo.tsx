'use client';

import { useState } from 'react';

type Lang = 'es' | 'en';

const DEMO: Record<Lang, { placeholder: string; results: string[]; label: string; btn: string; btnLoading: string; resultsLabel: string }> = {
  es: {
    placeholder: 'Un vídeo sobre cómo monté mi setup de edición por menos de 500€',
    results: [
      '5 errores que cometí montando mi setup por 500€ (y cómo evitarlos)',
      'Mi setup de edición REAL por 500€ — no creerás lo que funciona',
      'Así edito en 2026 con un presupuesto de 500€ · Tour completo',
    ],
    label: 'Tema del vídeo',
    btn: 'Generar →',
    btnLoading: 'Generando...',
    resultsLabel: 'Títulos generados',
  },
  en: {
    placeholder: 'A video about how I built my editing setup for under $500',
    results: [
      '5 mistakes I made building my $500 setup (and how to avoid them)',
      'My REAL editing setup for $500 — you won\'t believe what works',
      'How I edit in 2026 on a $500 budget · Full tour',
    ],
    label: 'Video topic',
    btn: 'Generate →',
    btnLoading: 'Generating...',
    resultsLabel: 'Generated titles',
  },
};

export default function LandingHeroDemo({ lang = 'es' }: { lang?: Lang }) {
  const d = DEMO[lang];
  const [topic, setTopic] = useState(d.placeholder);
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [results, setResults] = useState<string[]>([]);

  const run = () => {
    setState('loading');
    setResults([]);
    setTimeout(() => {
      setState('done');
      d.results.forEach((r, i) => {
        setTimeout(() => setResults((prev) => [...prev, r]), 420 * (i + 1));
      });
    }, 900);
  };

  return (
    <div className="mt-16 max-w-4xl mx-auto">
      <div className="relative screen-glow rounded-xl overflow-hidden border border-white/10" style={{ background: '#0B0B0D' }}>
        {/* Fake window chrome */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-black">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--red)' }} />
          </div>
          <span className="font-mono-jb text-[10px] text-zinc-500 tracking-wider">{lang === 'en' ? 'LIVE DEMO · 8.2s' : 'DEMO EN VIVO · 8.2s'}</span>
          <span className="live-dot" />
        </div>

        <div className="p-6 md:p-8">
          <div className="flex items-start gap-3">
            <span className="font-mono-jb text-xs text-zinc-500 mt-3">01</span>
            <div className="flex-1">
              <label className="block font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-2">
                {d.label}
              </label>
              <textarea
                rows={2}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full bg-black border border-white/10 text-white p-3 text-[15px] resize-none rounded-sm focus:outline-none focus:border-[var(--red)]/60 transition"
                placeholder={d.placeholder}
              />
            </div>
          </div>

          <div className="flex items-center justify-between mt-5 pl-8 flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {(lang === 'en'
                ? ['Title', 'Description', 'Script', 'Caption', 'Thumbnail']
                : ['Título', 'Descripción', 'Script', 'Caption', 'Miniatura']
              ).map((k, i) => (
                <span
                  key={k}
                  className="font-mono-jb text-[10px] tracking-wider uppercase px-2 py-1"
                  style={{ background: i === 0 ? 'var(--red)' : undefined, color: i === 0 ? '#fff' : '#71717a', border: i === 0 ? undefined : '1px solid rgba(255,255,255,0.12)' }}
                >
                  {k}
                </span>
              ))}
            </div>
            <button
              onClick={run}
              disabled={state === 'loading'}
              className="btn-offset btn-offset-white px-5 py-2.5 text-[13px] font-display disabled:opacity-50"
            >
              {state === 'loading' ? d.btnLoading : d.btn}
            </button>
          </div>

          {state !== 'idle' && (
            <div className="mt-6 pt-6 border-t border-white/10 pl-8">
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500">{d.resultsLabel}</span>
                {state === 'loading' && (
                  <span className="font-mono-jb text-[10px] flex items-center gap-2" style={{ color: 'var(--red)' }}>
                    <span className="w-3 h-3 border border-current border-t-transparent rounded-full spin-r" />
                    {lang === 'en' ? 'Processing' : 'Procesando'}
                  </span>
                )}
              </div>
              <ul className="space-y-2">
                {results.map((r, i) => (
                  <li key={i} className="group flex items-start gap-3 p-3 border border-white/10 hover:border-[var(--red)] bg-black/40 transition cursor-pointer page-enter">
                    <span className="font-mono-jb text-[11px] mt-0.5 shrink-0" style={{ color: 'var(--red)' }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="text-[15px] leading-snug">{r}</span>
                    <svg className="ml-auto shrink-0 mt-1 text-zinc-600 group-hover:text-white transition" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" />
                    </svg>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      <div className="relative -mt-3 ml-auto w-fit pr-4 text-right hidden md:block">
        <span className="inline-block px-3 py-1.5 font-mono-jb text-[11px] text-black rotate-[-2deg]" style={{ background: 'var(--yellow)', boxShadow: '2px 2px 0 #000' }}>
          {lang === 'en' ? '↗ Try it yourself' : '↗ Pruébalo tú mismo'}
        </span>
      </div>
    </div>
  );
}
