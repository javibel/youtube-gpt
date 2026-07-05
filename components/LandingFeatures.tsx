'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BoltIcon, LinkIcon, WarningIcon } from '@/components/icons';

type Lang = 'es' | 'en';

const FEATURE_LINKS: Record<string, string> = {
  seoscore: '/features/seo-score',
  research: '/features/keyword-research',
  competitors: '/features/competitor-analysis',
  revenue: '/features/revenue-estimator',
};

const FEATURES_ES = [
  {
    k: 'seoscore',
    t: 'SEO Score',
    d: 'Pega el título, descripción y tags de tu vídeo. Obtén una puntuación de 0 a 100 con recomendaciones específicas para mejorar. El diagnóstico más rápido para saber por qué tu vídeo no se posiciona.',
    tag: 'Gratis · Top #1',
    preview: null,
  },
  { k: 'research', t: 'Keyword Research', d: 'Datos reales de YouTube Data API. Volumen estimado, competencia y CPC. Encuentra temas antes que tu competencia y posiciona cada vídeo desde el primer día. Exclusivo Plan Pro.', tag: 'Pro · SEO', preview: null },
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
  { k: 'competitors', t: 'Análisis de competidores', d: 'Introduce cualquier URL de canal. Stats completos, top 10 vídeos por vistas, frecuencia de publicación y las keywords que más usa. Copia lo que funciona. Exclusivo Plan Pro.', tag: 'Pro · Intel', preview: null },
  { k: 'desc', t: 'Descripciones SEO', d: 'Con keywords de cola larga, timestamps automáticos, hashtags y tu tono único.', tag: 'Search +41%', preview: null },
  { k: 'script', t: 'Scripts completos', d: 'Gancho de 15s, desarrollo modular y CTA. Estructura probada en +2M de vídeos virales.', tag: '8 min ahorro', preview: null },
  { k: 'thumb', t: 'Conceptos de miniaturas', d: 'Briefs visuales con colores, pose facial, texto y referencias. Envía a tu diseñador y listo.', tag: '×3 clics', preview: null },
  { k: 'retention', t: 'Optimizador de retención', d: 'Detecta el punto exacto donde los viewers abandonan. Recomendaciones de IA por segmento: gancho, desarrollo y cierre.', tag: 'Pro · Retención', preview: null },
  { k: 'outliers', t: 'Detección de outliers', d: 'Encuentra vídeos virales en cualquier nicho que superaron ×10 la media del canal. Analiza qué hicieron diferente para replicar el patrón.', tag: 'Pro · Viral', preview: null },
  { k: 'extension', t: 'Extensión Chrome', d: 'SEO score, detección de outliers, estadísticas de canal y títulos con IA — directamente en YouTube y YouTube Studio. Solo en Plan Pro.', tag: 'Pro · Chrome', preview: null },
  { k: 'revenue', t: 'Estimador de ingresos', d: 'CPM real por país, proyección mensual y anual, top vídeos por revenue y consejos de IA para maximizar tu monetización. Datos reales de YouTube Analytics.', tag: 'Pro · Revenue', preview: null },
  { k: 'calendar', t: 'Calendario IA', d: 'Planifica tu próxima semana con IA. Analiza trends, competidores y horarios óptimos para sugerirte qué publicar, cuándo y por qué.', tag: 'Pro · Planificador', preview: null },
  { k: 'caption', t: 'Captions multi-plataforma', d: 'Reels, TikToks, Tweets. Adapta tu contenido de YouTube a cada red sin perder el alma.', tag: '4 redes', preview: null },
  { k: 'thumbpreview', t: 'Preview de miniatura', d: 'Visualiza tu miniatura en contexto real: feed de YouTube, móvil, barra lateral. Detecta problemas de legibilidad antes de publicar.', tag: 'Pro · Visual', preview: null },
  { k: 'subscribers', t: 'Análisis de suscriptores', d: 'Crecimiento diario, tendencia semanal, ratio subs/vistas y predicción a 30 días. Entiende qué vídeos convierten viewers en fans.', tag: 'Pro · Growth', preview: null },
];

const FEATURES_EN = [
  {
    k: 'seoscore',
    t: 'SEO Score',
    d: "Paste your video's title, description and tags. Get a 0-to-100 score with specific recommendations to improve. The fastest diagnosis for why your video isn't ranking.",
    tag: 'Free · Top #1',
    preview: null,
  },
  { k: 'research', t: 'Keyword Research', d: 'Real YouTube Data API data. Estimated volume, competition and CPC. Find topics before your competitors and rank every video from day one. Pro plan only.', tag: 'Pro · SEO', preview: null },
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
  { k: 'competitors', t: 'Competitor Analysis', d: 'Enter any channel URL. Full stats, top 10 videos by views, upload frequency and the keywords they use most. Copy what works. Pro plan only.', tag: 'Pro · Intel', preview: null },
  { k: 'desc', t: 'SEO descriptions', d: 'Long-tail keywords, automatic timestamps, hashtags and your unique tone.', tag: 'Search +41%', preview: null },
  { k: 'script', t: 'Full scripts', d: '15s hook, modular development and CTA. Structure proven across 2M+ viral videos.', tag: '8 min saved', preview: null },
  { k: 'thumb', t: 'Thumbnail concepts', d: 'Visual briefs with colors, facial pose, text and references. Send to your designer and you\'re done.', tag: '×3 clicks', preview: null },
  { k: 'retention', t: 'Retention Optimizer', d: 'Pinpoint exactly where viewers drop off. AI recommendations by segment: hook, body and outro.', tag: 'Pro · Retention', preview: null },
  { k: 'outliers', t: 'Outlier Detection', d: 'Find viral videos in any niche that outperformed the channel average by 10×. Analyze what they did differently so you can replicate the pattern.', tag: 'Pro · Viral', preview: null },
  { k: 'extension', t: 'Chrome Extension', d: 'SEO score, outlier detection, channel stats and AI titles — directly on YouTube and YouTube Studio. Pro plan only.', tag: 'Pro · Chrome', preview: null },
  { k: 'revenue', t: 'Revenue Estimator', d: 'Real CPM by country, monthly and yearly projections, top videos by revenue and AI tips to maximize your monetization. Real YouTube Analytics data.', tag: 'Pro · Revenue', preview: null },
  { k: 'calendar', t: 'AI Calendar', d: 'Plan your next week with AI. Analyzes trends, competitors and optimal times to suggest what to publish, when and why.', tag: 'Pro · Planner', preview: null },
  { k: 'caption', t: 'Multi-platform captions', d: 'Reels, TikToks, Tweets. Repurpose your YouTube content to every network without losing its soul.', tag: '4 networks', preview: null },
  { k: 'thumbpreview', t: 'Thumbnail Preview', d: 'See your thumbnail in real context: YouTube feed, mobile, sidebar. Catch readability issues before you publish.', tag: 'Pro · Visual', preview: null },
  { k: 'subscribers', t: 'Subscriber Analysis', d: 'Daily growth, weekly trends, subs/views ratio and 30-day forecast. Understand which videos convert viewers into fans.', tag: 'Pro · Growth', preview: null },
];

function PreviewSeoScore({ lang }: { lang: Lang }) {
  const items = lang === 'en'
    ? [
        { label: 'Title', score: 85, tip: 'Good length, has number + emotion' },
        { label: 'Description', score: 42, tip: 'Too short, missing keywords' },
        { label: 'Tags', score: 68, tip: 'Add 3 long-tail keywords' },
        { label: 'Thumbnail', score: 90, tip: 'High contrast, readable text' },
      ]
    : [
        { label: 'Título', score: 85, tip: 'Buena longitud, tiene número + emoción' },
        { label: 'Descripción', score: 42, tip: 'Demasiado corta, faltan keywords' },
        { label: 'Tags', score: 68, tip: 'Añade 3 keywords de cola larga' },
        { label: 'Miniatura', score: 90, tip: 'Alto contraste, texto legible' },
      ];
  const overall = 72;
  return (
    <div className="col-span-2 border border-white/10 bg-black p-4 space-y-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono-jb text-[13px] tracking-wider uppercase text-zinc-500">{lang === 'en' ? 'OVERALL SCORE' : 'PUNTUACIÓN GLOBAL'}</span>
        <span className="font-display font-bold text-3xl" style={{ color: overall >= 70 ? '#22c55e' : 'var(--red)' }}>{overall}<span className="text-lg text-zinc-500">/100</span></span>
      </div>
      {items.map((item) => (
        <div key={item.label} className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-zinc-300">{item.label}</span>
            <span className="font-mono-jb text-[13px]" style={{ color: item.score >= 70 ? '#22c55e' : item.score >= 50 ? '#f59e0b' : 'var(--red)' }}>{item.score}</span>
          </div>
          <div className="h-1.5 bg-white/5 overflow-hidden">
            <div className="h-full transition-all" style={{ width: `${item.score}%`, background: item.score >= 70 ? '#22c55e' : item.score >= 50 ? '#f59e0b' : 'var(--red)' }} />
          </div>
          <p className="font-mono-jb text-[11px] text-zinc-500">{item.tip}</p>
        </div>
      ))}
    </div>
  );
}

function PreviewDesc({ lang }: { lang: Lang }) {
  return (
    <div className="col-span-2 font-mono-jb text-[13px] bg-black border border-white/10 p-4 leading-relaxed text-zinc-300">
      <p className="inline-flex items-center gap-1.5" style={{ color: 'var(--red)' }}><BoltIcon size={12} /> TIMESTAMPS</p>
      <p>0:00 · Intro</p>
      <p>0:42 · {lang === 'en' ? 'Full setup' : 'El setup completo'}</p>
      <p>2:15 · {lang === 'en' ? 'Why I chose this monitor' : 'Por qué elegí este monitor'}</p>
      <p className="mt-3 text-[#00E5FF] inline-flex items-center gap-1.5"><LinkIcon size={12} /> {lang === 'en' ? 'Gear mentioned' : 'Equipo mencionado'}</p>
      <p>— Monitor LG 27GP: ...</p>
      <p className="mt-3">#EditingSetup #BudgetSetup #ContentCreator</p>
    </div>
  );
}

function PreviewScript({ lang }: { lang: Lang }) {
  return (
    <div className="col-span-2 border border-white/10 bg-black p-4">
      <p className="font-mono-jb text-[13px] tracking-wider mb-2" style={{ color: 'var(--red)' }}>HOOK · 00:00—00:15</p>
      <p className="text-[13px] leading-relaxed">
        {lang === 'en'
          ? '"This setup cost under $500 and I edit 4K without a single lag. Before you tell me that\'s impossible, let me show you exactly what I bought, why, and what I didn\'t buy."'
          : '"Este setup costó menos de 500€ y edito 4K sin un solo lag. Antes de que me digas que es imposible, déjame enseñarte exactamente qué compré, por qué, y lo que NO compré."'}
      </p>
      <p className="font-mono-jb text-[13px] text-zinc-500 mt-4 tracking-wider">→ BODY · 4 {lang === 'en' ? 'BLOCKS' : 'BLOQUES'} · CTA</p>
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
          <p className="font-mono-jb text-[13px] mb-1" style={{ color: 'var(--red)' }}>{p.toUpperCase()}</p>
          <p className="text-[13px] leading-snug text-zinc-300">{texts[p][lang]}</p>
        </div>
      ))}
    </>
  );
}

function PreviewThumb({ lang }: { lang: Lang }) {
  return (
    <>
      <div className="col-span-1 aspect-video bg-[#1a0008] flex items-center justify-center" style={{ backgroundImage: 'repeating-linear-gradient(135deg,rgba(232,77,91,0.15) 0 2px,transparent 2px 14px)' }}>
        <span className="font-mono-jb text-[13px] tracking-widest uppercase" style={{ color: 'var(--red)' }}>THUMBNAIL</span>
      </div>
      <div className="col-span-1 font-mono-jb text-[13px] bg-black border border-white/10 p-3 leading-relaxed">
        <p style={{ color: 'var(--red)' }}>BRIEF</p>
        <p className="mt-1 text-zinc-400">{lang === 'en' ? 'Pose: surprised' : 'Pose: sorpresa'}</p>
        <p className="text-zinc-400">{lang === 'en' ? 'Text: "$500"' : 'Texto: "500€"'}</p>
        <p className="text-zinc-400">{lang === 'en' ? 'Color: red/black' : 'Color: rojo/negro'}</p>
        <p className="text-zinc-400">{lang === 'en' ? 'Arrow: pointing' : 'Flecha: señalando'}</p>
      </div>
    </>
  );
}

function PreviewResearch({ lang }: { lang: Lang }) {
  const items = lang === 'en' ? [
    { kw: 'how to grow on youtube fast', vol: '22K', comp: 'Med', cpc: '$1.20' },
    { kw: 'youtube algorithm 2024', vol: '18K', comp: 'Low', cpc: '$0.90' },
    { kw: 'youtube shorts monetization', vol: '40K', comp: 'High', cpc: '$2.10' },
    { kw: 'best camera for youtube beginners', vol: '12K', comp: 'Med', cpc: '$3.40' },
  ] : [
    { kw: 'cómo crecer en youtube rápido', vol: '22K', comp: 'Med', cpc: '1,20€' },
    { kw: 'algoritmo de youtube 2024', vol: '18K', comp: 'Bajo', cpc: '0,90€' },
    { kw: 'monetización youtube shorts', vol: '40K', comp: 'Alto', cpc: '2,10€' },
    { kw: 'mejor cámara youtube principiantes', vol: '12K', comp: 'Med', cpc: '3,40€' },
  ];
  return (
    <div className="col-span-2 border border-white/10 bg-black overflow-hidden">
      <div className="grid px-4 py-2 border-b border-white/10 font-mono-jb text-[13px] tracking-wider uppercase text-zinc-600" style={{ gridTemplateColumns: '1fr auto auto' }}>
        <span>Keyword</span>
        <span className="pr-6">Vol.</span>
        <span>CPC</span>
      </div>
      {items.map((r, i) => (
        <div key={i} className="grid px-4 py-2.5 border-b border-white/5 items-center hover:bg-white/[0.02] transition" style={{ gridTemplateColumns: '1fr auto auto' }}>
          <span className="text-[13px] text-zinc-200 truncate pr-4">{r.kw}</span>
          <span className="font-mono-jb text-[13px] pr-6" style={{ color: 'var(--red)' }}>{r.vol}</span>
          <span className="font-mono-jb text-[13px] text-zinc-400">{r.cpc}</span>
        </div>
      ))}
    </div>
  );
}

function PreviewCompetitors({ lang }: { lang: Lang }) {
  const keywords = lang === 'en'
    ? ['last to leave', '$10,000', 'survive', 'challenge']
    : ['último en salir', '10.000€', 'sobrevivir', 'reto'];
  return (
    <div className="col-span-2 border border-white/10 bg-black p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display font-bold text-sm">@MrBeast</p>
          <p className="font-mono-jb text-[13px] text-zinc-500 mt-0.5">youtube.com/@MrBeast</p>
        </div>
        <span className="font-mono-jb text-[13px] px-2 py-0.5 border" style={{ color: 'var(--red)', borderColor: 'rgba(232,77,91,0.4)' }}>320M {lang === 'en' ? 'subs' : 'subs'}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 font-mono-jb text-[13px]">
        <div className="bg-white/5 p-2 text-center">
          <p className="text-zinc-500 text-[13px] uppercase">{lang === 'en' ? 'Videos' : 'Vídeos'}</p>
          <p className="text-white font-bold mt-0.5">847</p>
        </div>
        <div className="bg-white/5 p-2 text-center">
          <p className="text-zinc-500 text-[13px] uppercase">{lang === 'en' ? 'Freq.' : 'Frec.'}</p>
          <p className="text-white font-bold mt-0.5">2/sem</p>
        </div>
        <div className="bg-white/5 p-2 text-center">
          <p className="text-zinc-500 text-[13px] uppercase">{lang === 'en' ? 'Views' : 'Vistas'}</p>
          <p className="text-white font-bold mt-0.5">51B</p>
        </div>
      </div>
      <div>
        <p className="font-mono-jb text-[13px] uppercase text-zinc-600 mb-1.5">{lang === 'en' ? '↗ Top keywords' : '↗ Keywords top'}</p>
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((k) => (
            <span key={k} className="font-mono-jb text-[13px] px-2 py-0.5 border border-white/10 text-zinc-300 cursor-pointer hover:border-[rgba(232,77,91,0.5)] transition">{k}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function PreviewRevenue({ lang }: { lang: Lang }) {
  const countries = lang === 'en'
    ? [{ c: '🇺🇸 United States', cpm: '$7.50', pct: 85 }, { c: '🇬🇧 United Kingdom', cpm: '$6.20', pct: 70 }, { c: '🇩🇪 Germany', cpm: '$5.80', pct: 65 }, { c: '🇪🇸 Spain', cpm: '$2.10', pct: 24 }]
    : [{ c: '🇺🇸 Estados Unidos', cpm: '7,50€', pct: 85 }, { c: '🇬🇧 Reino Unido', cpm: '6,20€', pct: 70 }, { c: '🇩🇪 Alemania', cpm: '5,80€', pct: 65 }, { c: '🇪🇸 España', cpm: '2,10€', pct: 24 }];
  return (
    <div className="col-span-2 border border-white/10 bg-black p-4 space-y-3">
      <div className="grid grid-cols-3 gap-2 font-mono-jb text-[13px]">
        <div className="bg-white/5 p-2 text-center">
          <p className="text-zinc-500 text-[13px] uppercase">{lang === 'en' ? 'Monthly' : 'Mensual'}</p>
          <p className="font-bold mt-0.5" style={{ color: 'var(--red)' }}>$842</p>
        </div>
        <div className="bg-white/5 p-2 text-center">
          <p className="text-zinc-500 text-[13px] uppercase">{lang === 'en' ? 'Yearly' : 'Anual'}</p>
          <p className="font-bold mt-0.5" style={{ color: 'var(--red)' }}>$10,104</p>
        </div>
        <div className="bg-white/5 p-2 text-center">
          <p className="text-zinc-500 text-[13px] uppercase">CPM</p>
          <p className="font-bold mt-0.5" style={{ color: 'var(--red)' }}>$4.82</p>
        </div>
      </div>
      {countries.map((c) => (
        <div key={c.c} className="flex items-center gap-3">
          <span className="text-[13px] text-zinc-300 w-28 truncate">{c.c}</span>
          <div className="flex-1 h-2 bg-white/5 overflow-hidden"><div className="h-full" style={{ width: `${c.pct}%`, background: 'var(--red)' }} /></div>
          <span className="font-mono-jb text-[13px] text-zinc-400 w-12 text-right">{c.cpm}</span>
        </div>
      ))}
    </div>
  );
}

function PreviewCalendar({ lang }: { lang: Lang }) {
  const suggestions = lang === 'en'
    ? [
        { day: 'Mon 10:00', title: 'Setup tour under $500', reason: 'Tech peaks Mon AM' },
        { day: 'Wed 17:00', title: 'Camera comparison 2026', reason: 'Competitor gap detected' },
        { day: 'Fri 12:00', title: 'My editing workflow', reason: 'Trending topic +340%' },
      ]
    : [
        { day: 'Lun 10:00', title: 'Setup tour bajo 500€', reason: 'Tech pico Lun AM' },
        { day: 'Mié 17:00', title: 'Comparativa cámaras 2026', reason: 'Hueco competencia' },
        { day: 'Vie 12:00', title: 'Mi flujo de edición', reason: 'Trending +340%' },
      ];
  return (
    <div className="col-span-2 border border-white/10 bg-black p-4 space-y-2">
      <p className="font-mono-jb text-[13px] tracking-wider uppercase text-zinc-600 mb-2">{lang === 'en' ? '↗ AI suggestions this week' : '↗ Sugerencias IA esta semana'}</p>
      {suggestions.map((s) => (
        <div key={s.day} className="flex items-center gap-3 p-2 border border-white/5 hover:border-[rgba(232,77,91,0.3)] transition">
          <span className="font-mono-jb text-[13px] w-16 shrink-0" style={{ color: 'var(--red)' }}>{s.day}</span>
          <span className="text-[13px] text-zinc-200 flex-1 truncate">{s.title}</span>
          <span className="font-mono-jb text-[13px] text-zinc-500 shrink-0">{s.reason}</span>
        </div>
      ))}
    </div>
  );
}

function PreviewThumbPreview({ lang }: { lang: Lang }) {
  return (
    <div className="col-span-2 border border-white/10 bg-black p-4">
      <div className="grid grid-cols-3 gap-2">
        {['FEED', 'MOBILE', 'SIDEBAR'].map((ctx) => (
          <div key={ctx} className="text-center">
            <p className="font-mono-jb text-[8px] tracking-wider text-zinc-600 mb-1">{ctx}</p>
            <div className={`mx-auto bg-[#1a0008] flex items-center justify-center ${ctx === 'SIDEBAR' ? 'w-16 h-9' : ctx === 'MOBILE' ? 'w-20 h-11' : 'w-full aspect-video'}`} style={{ backgroundImage: 'repeating-linear-gradient(135deg,rgba(232,77,91,0.15) 0 2px,transparent 2px 14px)' }}>
              <span className="font-mono-jb text-[7px] tracking-widest" style={{ color: 'var(--red)' }}>THUMB</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-green-500" />
        <span className="font-mono-jb text-[13px] text-zinc-400">{lang === 'en' ? 'Text readable at all sizes' : 'Texto legible en todos los tamaños'}</span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="w-2 h-2 rounded-full" style={{ background: 'var(--red)' }} />
        <span className="font-mono-jb text-[13px] text-zinc-400">{lang === 'en' ? 'Face too small on mobile' : 'Cara muy pequeña en móvil'}</span>
      </div>
    </div>
  );
}

function PreviewRetention({ lang }: { lang: Lang }) {
  const bars = [95, 88, 82, 76, 65, 58, 52, 45, 38, 42];
  return (
    <div className="col-span-2 border border-white/10 bg-black p-4">
      <div className="flex items-end gap-1 h-16 mb-2">
        {bars.map((h, i) => (
          <div key={i} className="flex-1 rounded-t transition" style={{ height: `${h}%`, background: h < 50 ? 'var(--red)' : i === 9 ? '#00E5FF' : 'rgba(255,255,255,0.15)' }} />
        ))}
      </div>
      <div className="flex justify-between font-mono-jb text-[8px] text-zinc-600">
        <span>0:00</span><span>2:30</span><span>5:00</span><span>7:30</span><span>10:00</span>
      </div>
      <div className="mt-3 p-2 border border-white/5">
        <p className="font-mono-jb text-[13px] inline-flex items-center gap-1.5" style={{ color: 'var(--red)' }}><WarningIcon size={12} /> {lang === 'en' ? 'DROP at 7:30 — 38%' : 'CAÍDA en 7:30 — 38%'}</p>
        <p className="text-[13px] text-zinc-400 mt-1">{lang === 'en' ? 'AI: Move CTA before this point. Add a pattern interrupt at 7:00.' : 'IA: Mueve el CTA antes de este punto. Añade cambio de patrón en 7:00.'}</p>
      </div>
    </div>
  );
}

function PreviewSubscribers({ lang }: { lang: Lang }) {
  return (
    <div className="col-span-2 border border-white/10 bg-black p-4">
      <div className="grid grid-cols-2 gap-2 font-mono-jb text-[13px] mb-3">
        <div className="bg-white/5 p-2"><span className="text-zinc-500 text-[13px]">{lang === 'en' ? '7d growth' : 'Crec. 7d'}</span><p className="font-bold mt-0.5" style={{ color: '#00E5FF' }}>+847</p></div>
        <div className="bg-white/5 p-2"><span className="text-zinc-500 text-[13px]">{lang === 'en' ? 'Subs/views' : 'Subs/vistas'}</span><p className="font-bold mt-0.5" style={{ color: '#00E5FF' }}>3.2%</p></div>
      </div>
      <p className="font-mono-jb text-[13px] text-zinc-600 uppercase tracking-wider mb-1">{lang === 'en' ? '↗ 30-day forecast' : '↗ Previsión 30 días'}</p>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-white/5 overflow-hidden"><div className="h-full" style={{ width: '72%', background: 'linear-gradient(90deg,#00E5FF,var(--red))' }} /></div>
        <span className="font-mono-jb text-[13px] font-bold" style={{ color: 'var(--red)' }}>+3,420</span>
      </div>
    </div>
  );
}

function PreviewOutliers({ lang }: { lang: Lang }) {
  const items = lang === 'en'
    ? [{ t: 'I QUIT my job for YouTube', views: '4.2M', avg: '180K', mult: '×23' }, { t: 'This camera changed everything', views: '1.8M', avg: '200K', mult: '×9' }]
    : [{ t: 'DEJÉ mi trabajo por YouTube', views: '4.2M', avg: '180K', mult: '×23' }, { t: 'Esta cámara lo cambió todo', views: '1.8M', avg: '200K', mult: '×9' }];
  return (
    <div className="col-span-2 border border-white/10 bg-black p-4 space-y-2">
      {items.map((v) => (
        <div key={v.t} className="p-2 border border-white/5 flex items-center gap-3">
          <div className="w-14 h-8 bg-[#1a0008] shrink-0 flex items-center justify-center" style={{ backgroundImage: 'repeating-linear-gradient(135deg,rgba(232,77,91,0.15) 0 2px,transparent 2px 14px)' }}>
            <span className="font-mono-jb text-[7px]" style={{ color: 'var(--red)' }}>▶</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-zinc-200 truncate">{v.t}</p>
            <p className="font-mono-jb text-[13px] text-zinc-500">{v.views} views · avg {v.avg}</p>
          </div>
          <span className="font-mono-jb text-[13px] font-bold shrink-0" style={{ color: 'var(--red)' }}>{v.mult}</span>
        </div>
      ))}
    </div>
  );
}

export default function LandingFeatures({ lang = 'es' }: { lang?: Lang }) {
  const [active, setActive] = useState(0);
  const FEATURES = lang === 'en' ? FEATURES_EN : FEATURES_ES;
  const f = FEATURES[active];

  const renderPreview = () => {
    if (f.k === 'titles' && f.preview) {
      return f.preview.map((title, i) => (
        <div key={i} className="border border-white/10 p-3 text-[13px] leading-snug bg-black hover:border-[var(--red)]/50 transition">
          <span className="font-mono-jb text-[13px]" style={{ color: 'var(--red)' }}>#{i + 1}</span>
          <p className="mt-1">{title}</p>
        </div>
      ));
    }
    if (f.k === 'seoscore') return <PreviewSeoScore lang={lang} />;
    if (f.k === 'desc') return <PreviewDesc lang={lang} />;
    if (f.k === 'script') return <PreviewScript lang={lang} />;
    if (f.k === 'caption') return <PreviewCaption lang={lang} />;
    if (f.k === 'thumb') return <PreviewThumb lang={lang} />;
    if (f.k === 'research') return <PreviewResearch lang={lang} />;
    if (f.k === 'competitors') return <PreviewCompetitors lang={lang} />;
    if (f.k === 'revenue') return <PreviewRevenue lang={lang} />;
    if (f.k === 'calendar') return <PreviewCalendar lang={lang} />;
    if (f.k === 'thumbpreview') return <PreviewThumbPreview lang={lang} />;
    if (f.k === 'retention') return <PreviewRetention lang={lang} />;
    if (f.k === 'subscribers') return <PreviewSubscribers lang={lang} />;
    if (f.k === 'outliers') return <PreviewOutliers lang={lang} />;
    return null;
  };

  return (
    <section id="tools" className="border-b border-white/10 bg-black">
      <div className="max-w-7xl mx-auto px-6 py-24">
        <div className="mb-14">
          <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>04 · TOOLS</p>
          <h2 className="font-display font-bold text-4xl md:text-6xl leading-[0.95]">
            {lang === 'en' ? <>Start with SEO Score.<br />Go deeper with AI.</> : <>Empieza con SEO Score.<br />Profundiza con IA.</>}
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
                  <span className="font-mono-jb text-[13px] text-zinc-500">{String(i + 1).padStart(2, '0')}</span>
                  <span className="font-display font-semibold text-[15px]" style={{ color: active === i ? '#fff' : '#d4d4d8' }}>{feat.t}</span>
                </span>
                <span className="font-mono-jb text-[13px]" style={{ color: active === i ? 'var(--red)' : '#52525b' }}>
                  {active === i ? '→' : '·'}
                </span>
              </button>
            ))}
          </div>

          <div className="border border-white/10 bg-[#0B0B0D] p-6 md:p-10 relative overflow-hidden">
            <div className="absolute top-0 right-0 red-tape">{f.tag}</div>
            <p className="font-mono-jb text-[13px] tracking-wider uppercase text-zinc-500 mb-4">
              FEATURE · {String(active + 1).padStart(2, '0')} / {String(FEATURES.length).padStart(2, '0')}
            </p>
            <h3 className="font-display font-bold text-3xl md:text-5xl leading-tight mb-4">{f.t}</h3>
            <p className="text-zinc-400 text-lg max-w-lg leading-relaxed">{f.d}</p>
            {FEATURE_LINKS[f.k] && (
              <Link href={FEATURE_LINKS[f.k]} className="inline-flex items-center gap-2 mt-4 font-display font-bold text-sm transition hover:opacity-80" style={{ color: 'var(--red)' }}>
                {lang === 'en' ? 'Learn more' : 'Saber más'} →
              </Link>
            )}
            <div className="mt-10 grid grid-cols-2 gap-3 max-w-xl">
              {renderPreview()}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
