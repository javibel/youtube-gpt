'use client';

import { useState } from 'react';

type Lang = 'es' | 'en';

const FEATURES_ES = [
  {
    k: 'titles',
    t: 'Títulos virales',
    d: 'Frameworks probados: curiosity gap, número específico, promesa + twist. El algoritmo los ama.',
    tag: 'CTR +23%',
    preview: [
      '7 razones por las que tu CTR está estancado (y cómo arreglarlo en 48h)',
      'Probé la IA de YouTube durante 30 días. Esto pasó.',
      'El truco de miniatura que MrBeast esconde (no es lo que crees)',
      'Guardé 200€/mes con este cambio tonto en mi setup',
    ],
  },
  { k: 'desc', t: 'Descripciones SEO', d: 'Con keywords de cola larga, timestamps automáticos, hashtags y tu tono único.', tag: 'Search +41%', preview: null },
  { k: 'script', t: 'Scripts completos', d: 'Gancho de 15s, desarrollo modular y CTA. Estructura probada en +2M de vídeos virales.', tag: '8 min ahorro', preview: null },
  { k: 'caption', t: 'Captions multi-plataforma', d: 'Reels, TikToks, Tweets. Adapta tu contenido de YouTube a cada red sin perder el alma.', tag: '4 redes', preview: null },
  { k: 'thumb', t: 'Conceptos de miniaturas', d: 'Briefs visuales con colores, pose facial, texto y referencias. Envía a tu diseñador y listo.', tag: '×3 clics', preview: null },
];

const FEATURES_EN = [
  {
    k: 'titles',
    t: 'Viral titles',
    d: 'Battle-tested frameworks: curiosity gap, specific numbers, promise + twist. The algorithm loves them.',
    tag: 'CTR +23%',
    preview: [
      '7 reasons your CTR is stuck (and how to fix it in 48h)',
      "I tested YouTube's AI for 30 days. Here's what happened.",
      "The thumbnail trick MrBeast hides (it's not what you think)",
      'I saved $200/month with this dumb tweak to my setup',
    ],
  },
  { k: 'desc', t: 'SEO descriptions', d: 'Long-tail keywords, automatic timestamps, hashtags and your unique tone.', tag: 'Search +41%', preview: null },
  { k: 'script', t: 'Full scripts', d: '15s hook, modular development and CTA. Structure proven across 2M+ viral videos.', tag: '8 min saved', preview: null },
  { k: 'caption', t: 'Multi-platform captions', d: 'Reels, TikToks, Tweets. Repurpose your YouTube content to every network without losing its soul.', tag: '4 networks', preview: null },
  { k: 'thumb', t: 'Thumbnail concepts', d: 'Visual briefs with colors, facial pose, text and references. Send to your designer and you\'re done.', tag: '×3 clicks', preview: null },
];

function PreviewDesc({ lang }: { lang: Lang }) {
  return (
    <div className="col-span-2 font-mono-jb text-[11px] bg-black border border-white/10 p-4 leading-relaxed text-zinc-300">
      <p style={{ color: 'var(--red)' }}>⚡ TIMESTAMPS</p>
      <p>0:00 · Intro</p>
      <p>0:42 · {lang === 'en' ? 'Full setup' : 'El setup completo'}</p>
      <p>2:15 · {lang === 'en' ? 'Why I chose this monitor' : 'Por qué elegí este monitor'}</p>
      <p className="mt-3 text-[#00E5FF]">🔗 {lang === 'en' ? 'Gear mentioned' : 'Equipo mencionado'}</p>
      <p>— Monitor LG 27GP: ...</p>
      <p className="mt-3">#EditingSetup #BudgetSetup #ContentCreator</p>
    </div>
  );
}

function PreviewScript({ lang }: { lang: Lang }) {
  return (
    <div className="col-span-2 border border-white/10 bg-black p-4">
      <p className="font-mono-jb text-[10px] tracking-wider mb-2" style={{ color: 'var(--red)' }}>HOOK · 00:00—00:15</p>
      <p className="text-[13px] leading-relaxed">
        {lang === 'en'
          ? '"This setup cost under $500 and I edit 4K without a single lag. Before you tell me that\'s impossible, let me show you exactly what I bought, why, and what I didn\'t buy."'
          : '"Este setup costó menos de 500€ y edito 4K sin un solo lag. Antes de que me digas que es imposible, déjame enseñarte exactamente qué compré, por qué, y lo que NO compré."'}
      </p>
      <p className="font-mono-jb text-[10px] text-zinc-500 mt-4 tracking-wider">→ BODY · 4 {lang === 'en' ? 'BLOCKS' : 'BLOQUES'} · CTA</p>
    </div>
  );
}

function PreviewCaption({ lang }: { lang: Lang }) {
  const platforms = ['Reels', 'TikTok', 'Tweet', 'Shorts'];
  const texts: Record<string, Record<Lang, string>> = {
    Reels: { es: 'El setup que cambió mi forma de editar 🎬 → Guarda si eres creador.', en: 'The setup that changed how I edit 🎬 → Save if you\'re a creator.' },
    TikTok: { es: 'POV: gastaste menos de 500€ y editas mejor que nunca. Link en bio.', en: 'POV: spent under $500 and editing better than ever. Link in bio.' },
    Tweet: { es: 'Spoiler: no necesitas un Mac Pro para editar 4K. Hilo 🧵', en: 'Spoiler: you don\'t need a Mac Pro to edit 4K. Thread 🧵' },
    Shorts: { es: '¿Editas con menos de 500€? Esto lo va a cambiar todo.', en: 'Editing on under $500? This will change everything.' },
  };
  return (
    <>
      {platforms.map((p) => (
        <div key={p} className="border border-white/10 p-3 bg-black">
          <p className="font-mono-jb text-[10px] mb-1" style={{ color: 'var(--red)' }}>{p.toUpperCase()}</p>
          <p className="text-[11px] leading-snug text-zinc-300">{texts[p][lang]}</p>
        </div>
      ))}
    </>
  );
}

function PreviewThumb({ lang }: { lang: Lang }) {
  return (
    <>
      <div className="col-span-1 aspect-video bg-[#1a0008] flex items-center justify-center" style={{ backgroundImage: 'repeating-linear-gradient(135deg,rgba(232,77,91,0.15) 0 2px,transparent 2px 14px)' }}>
        <span className="font-mono-jb text-[10px] tracking-widest uppercase" style={{ color: 'var(--red)' }}>THUMBNAIL</span>
      </div>
      <div className="col-span-1 font-mono-jb text-[11px] bg-black border border-white/10 p-3 leading-relaxed">
        <p style={{ color: 'var(--red)' }}>BRIEF</p>
        <p className="mt-1 text-zinc-400">{lang === 'en' ? 'Pose: surprised' : 'Pose: sorpresa'}</p>
        <p className="text-zinc-400">{lang === 'en' ? 'Text: "$500"' : 'Texto: "500€"'}</p>
        <p className="text-zinc-400">{lang === 'en' ? 'Color: red/black' : 'Color: rojo/negro'}</p>
        <p className="text-zinc-400">{lang === 'en' ? 'Arrow: pointing' : 'Flecha: señalando'}</p>
      </div>
    </>
  );
}

export default function LandingFeatures({ lang = 'es' }: { lang?: Lang }) {
  const [active, setActive] = useState(0);
  const FEATURES = lang === 'en' ? FEATURES_EN : FEATURES_ES;
  const f = FEATURES[active];

  const renderPreview = () => {
    if (f.k === 'titles' && f.preview) {
      return f.preview.map((title, i) => (
        <div key={i} className="border border-white/10 p-3 text-[12px] leading-snug bg-black hover:border-[var(--red)]/50 transition">
          <span className="font-mono-jb text-[10px]" style={{ color: 'var(--red)' }}>#{i + 1}</span>
          <p className="mt-1">{title}</p>
        </div>
      ));
    }
    if (f.k === 'desc') return <PreviewDesc lang={lang} />;
    if (f.k === 'script') return <PreviewScript lang={lang} />;
    if (f.k === 'caption') return <PreviewCaption lang={lang} />;
    if (f.k === 'thumb') return <PreviewThumb lang={lang} />;
    return null;
  };

  return (
    <section className="border-b border-white/10 bg-black">
      <div className="max-w-7xl mx-auto px-6 py-24">
        <div className="mb-14">
          <p className="font-mono-jb text-[11px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>04 · TOOLS</p>
          <h2 className="font-display font-bold text-4xl md:text-6xl leading-[0.95]">
            {lang === 'en' ? <>Five tools.<br />One superpower.</> : <>Cinco herramientas.<br />Un superpoder.</>}
          </h2>
        </div>

        <div className="grid lg:grid-cols-[280px_1fr] gap-8">
          <div className="space-y-1">
            {FEATURES.map((feat, i) => (
              <button
                key={feat.k}
                onClick={() => setActive(i)}
                className="w-full text-left p-4 border transition flex items-center justify-between group"
                style={{
                  borderColor: active === i ? 'var(--red)' : 'rgba(255,255,255,0.10)',
                  background: active === i ? 'rgba(232,77,91,0.05)' : 'transparent',
                }}
              >
                <span className="flex items-center gap-3">
                  <span className="font-mono-jb text-[11px] text-zinc-500">0{i + 1}</span>
                  <span className="font-display font-semibold text-[15px]" style={{ color: active === i ? '#fff' : '#d4d4d8' }}>{feat.t}</span>
                </span>
                <span className="font-mono-jb text-[10px]" style={{ color: active === i ? 'var(--red)' : '#52525b' }}>
                  {active === i ? '→' : '·'}
                </span>
              </button>
            ))}
          </div>

          <div className="border border-white/10 bg-[#0B0B0D] p-6 md:p-10 relative overflow-hidden">
            <div className="absolute top-0 right-0 red-tape">{f.tag}</div>
            <p className="font-mono-jb text-[10px] tracking-wider uppercase text-zinc-500 mb-4">
              FEATURE · 0{active + 1} / 05
            </p>
            <h3 className="font-display font-bold text-3xl md:text-5xl leading-tight mb-4">{f.t}</h3>
            <p className="text-zinc-400 text-lg max-w-lg leading-relaxed">{f.d}</p>
            <div className="mt-10 grid grid-cols-2 gap-3 max-w-xl">
              {renderPreview()}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
