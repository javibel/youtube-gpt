import type { Metadata } from 'next';
import Link from 'next/link';

import LandingHeroDemo from '@/components/LandingHeroDemo';
import LandingFeatures from '@/components/LandingFeatures';
import LandingFAQ from '@/components/LandingFAQ';
import LangToggle from '@/components/LangToggle';
import ChatWidgetPreview from '@/components/ChatWidgetPreview';
import WaitlistInline from '@/components/WaitlistInline';
import PricingSection from '@/components/PricingSection';
import { getServerLang } from '@/lib/server-lang';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'YTubViral — 14 herramientas de IA para crecer en YouTube',
  description:
    'Títulos virales, scripts, SEO, keyword research, análisis de competidores, estimador de ingresos, calendario IA, retención y más. 14 herramientas en una plataforma. Empieza gratis.',
  alternates: { canonical: 'https://ytubviral.com' },
};

type Lang = 'es' | 'en';

const LOGO_CREATORS = [
  'TechConTodo', 'CreatorDAO', 'FinanzasYA', 'Cocina Fácil',
  'GamingES', 'Viajes360', 'FitnessPro', 'EduCanal',
];

const STATIC_TESTIMONIALS = {
  es: [
    { name: 'Carlos M.', channel: 'Tech · 48K subs', avatar: 'CM', metric: 'CTR +23%', color: '#e84d5b', text: 'Antes tardaba 2 horas en escribir un título y descripción decentes. Ahora en 30 segundos tengo 10 opciones entre las que elegir. Mi CTR subió un 23% el primer mes.' },
    { name: 'Laura G.', channel: 'Lifestyle · 12K subs', avatar: 'LG', metric: '+4K subs/mes', color: '#00E5FF', text: 'Los scripts son increíbles. Estructura completa con gancho, desarrollo y CTA. Solo adapto a mi estilo. Ha cambiado por completo cómo produzco.' },
    { name: 'Sergio R.', channel: 'Finanzas · 91K subs', avatar: 'SR', metric: 'Search +41%', color: '#FFE800', text: 'Lo que más me ha sorprendido son las descripciones SEO. Empecé a aparecer en búsquedas donde antes era invisible. El plan Pro se paga solo.' },
    { name: 'Marta P.', channel: 'Cocina · 7K subs', avatar: 'MP', metric: 'IG → YT +60%', color: '#e84d5b', text: 'Soy pequeña aún, pero los captions para Instagram llevan tráfico de redes a YouTube. Es la herramienta que le faltaba a mi estrategia.' },
    { name: 'Alejandro F.', channel: 'Gaming · 210K subs', avatar: 'AF', metric: '5 uploads/sem', color: '#00E5FF', text: 'Publico 5 vídeos a la semana. Sin YTubViral sería imposible mantener ese ritmo con contenido bien optimizado. Parte fija de mi flujo.' },
    { name: 'Inés D.', channel: 'Educación · 34K subs', avatar: 'ID', metric: '3× output', color: '#FFE800', text: 'Fácil de usar y los resultados sorprendentemente buenos. Los conceptos de miniaturas se los paso a mi diseñador. Ahorra tiempo y dinero.' },
  ],
  en: [
    { name: 'Carlos M.', channel: 'Tech · 48K subs', avatar: 'CM', metric: 'CTR +23%', color: '#e84d5b', text: 'I used to spend 2 hours writing a decent title and description. Now in 30 seconds I have 10 options to choose from. My CTR went up 23% in the first month.' },
    { name: 'Laura G.', channel: 'Lifestyle · 12K subs', avatar: 'LG', metric: '+4K subs/mo', color: '#00E5FF', text: 'The scripts are incredible. Complete structure with hook, body and CTA. I just adapt it to my style. It has completely changed how I produce.' },
    { name: 'Sergio R.', channel: 'Finance · 91K subs', avatar: 'SR', metric: 'Search +41%', color: '#FFE800', text: "What surprised me most were the SEO descriptions. I started showing up in searches where I was invisible before. The Pro plan pays for itself." },
    { name: 'Marta P.', channel: 'Cooking · 7K subs', avatar: 'MP', metric: 'IG → YT +60%', color: '#e84d5b', text: "I'm still small, but Instagram captions drive social traffic to YouTube. It's the tool my strategy was missing." },
    { name: 'Alejandro F.', channel: 'Gaming · 210K subs', avatar: 'AF', metric: '5 uploads/wk', color: '#00E5FF', text: "I publish 5 videos a week. Without YTubViral it would be impossible to keep that pace with well-optimized content. It's a fixed part of my workflow." },
    { name: 'Inés D.', channel: 'Education · 34K subs', avatar: 'ID', metric: '3× output', color: '#FFE800', text: 'Easy to use and surprisingly good results. I send the thumbnail concepts to my designer. Saves time and money.' },
  ],
};

// ── Section components ────────────────────────────────────────────────────────

function TopNav({ lang }: { lang: Lang }) {
  const nav = lang === 'en'
    ? [['#how', 'How it works'], ['#tools', 'Tools'], ['/signup', 'Generate'], ['#pricing', 'Pricing'], ['/blog', 'Blog'], ['/gear', 'Gear']]
    : [['#how', 'Cómo funciona'], ['#tools', 'Herramientas'], ['/signup', 'Generar'], ['#pricing', 'Precios'], ['/blog', 'Blog'], ['/gear', 'Equipo']];

  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-md" style={{ background: 'rgba(10,10,10,0.85)' }}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-1.5 group">
          <svg width="18" height="18" viewBox="7 7 18 18" fill="none">
            <circle cx="16" cy="16" r="8" fill="#ee4d5e"/>
          </svg>
          <span className="font-display font-bold text-[17px] tracking-tight">
            YTubViral<span style={{ color: 'var(--red)' }}>.</span>com
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-1 bg-white/5 border border-white/10 rounded-full p-1 font-mono-jb text-[13px] tracking-wider uppercase">
          {nav.map(([href, label]) => (
            <a key={href} href={href} className="px-3 py-1.5 rounded-full transition text-zinc-400 hover:text-white hover:bg-white/10">
              {label}
            </a>
          ))}
          <Link href="/launch" className="btn-shimmer px-3 py-1.5 rounded-full bg-[#e84d5b] text-white font-bold transition hover:bg-[#d43d4b]">
            {lang === 'en' ? 'Launch' : 'Lanzamiento'}
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <LangToggle currentLang={lang} />
          <Link href="/login" className="hidden sm:block text-sm text-zinc-400 hover:text-white transition">
            {lang === 'en' ? 'Log in' : 'Iniciar sesión'}
          </Link>
          <Link href="/signup" className="btn-offset px-4 py-2 text-[13px] font-display">
            {lang === 'en' ? 'Get started free' : 'Empezar gratis'}
          </Link>
        </div>
      </div>
    </nav>
  );
}

function LiveTicker({ lang }: { lang: Lang }) {
  const feed = lang === 'en'
    ? [
        { who: 'Andrea K.', what: 'generated a title', topic: '· Gaming · Valorant' },
        { who: 'Diego R.', what: 'published with Pro', topic: '· Lifestyle' },
        { who: 'Saray M.', what: 'unlocked thumbnails', topic: '· Cooking' },
        { who: 'Marc T.', what: 'generated 12 captions', topic: '· Tech reviews' },
        { who: 'Pablo V.', what: 'CTR up +18%', topic: '· This week' },
        { who: 'Noa L.', what: 'created an 8-min script', topic: '· Travel' },
      ]
    : [
        { who: 'Andrea K.', what: 'generó un título', topic: '· Gaming · Valorant' },
        { who: 'Diego R.', what: 'publicó con Pro', topic: '· Lifestyle' },
        { who: 'Saray M.', what: 'desbloqueó miniaturas', topic: '· Cocina' },
        { who: 'Marc T.', what: 'generó 12 captions', topic: '· Tech reviews' },
        { who: 'Pablo V.', what: 'subió CTR +18%', topic: '· Esta semana' },
        { who: 'Noa L.', what: 'creó un script de 8 min', topic: '· Viajes' },
      ];
  const items = [...feed, ...feed, ...feed];

  return (
    <div className="border-b border-white/10 overflow-hidden" style={{ background: 'linear-gradient(90deg,#0a0a0a,#1a000b,#0a0a0a)' }}>
      <div className="relative h-8 flex items-center">
        <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center px-4" style={{ background: 'var(--red)' }}>
          <span className="live-dot mr-2" />
          <span className="font-mono-jb text-[13px] font-bold tracking-wider text-white">{lang === 'en' ? 'LIVE' : 'EN VIVO'}</span>
        </div>
        <div className="marquee-track pl-36 gap-12 font-mono-jb text-[13px] text-zinc-400">
          {items.map((f, i) => (
            <span key={i} className="flex items-center gap-2 shrink-0 mr-12">
              <span className="w-1 h-1 bg-zinc-600 rounded-full" />
              <span className="text-white">{f.who}</span>
              <span>{f.what}</span>
              <span className="text-zinc-600">{f.topic}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Hero({ lang }: { lang: Lang }) {
  return (
    <section className="relative overflow-hidden border-b border-white/10">
      <div className="absolute inset-0 grid-bg" />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 0%,rgba(232,77,91,0.18),transparent 70%)' }} />
      <div className="absolute inset-x-0 top-[10%] font-display font-bold text-center select-none pointer-events-none opacity-[0.022] whitespace-nowrap leading-none" style={{ fontSize: 'clamp(80px,18vw,260px)' }}>VIRAL.VIRAL</div>

      <div className="relative max-w-7xl mx-auto px-6 pt-16 pb-20">
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center gap-2 border border-white/15 rounded-full pl-1 pr-4 py-1 backdrop-blur" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <span className="red-tape py-1">v4.2</span>
            <span className="font-mono-jb text-[13px] tracking-wider text-zinc-400 uppercase">
              {lang === 'en' ? 'AI for creators · Engine v4.2' : 'IA para creadores · Motor v4.2'}
            </span>
          </div>
        </div>

        <h1 className="font-display font-bold text-center leading-[0.95] tracking-tight" style={{ fontSize: 'clamp(44px,7vw,104px)' }}>
          {lang === 'en' ? (
            <>
              <span className="block">Know your</span>
              <span className="block red-underline">YouTube SEO Score</span>
              <span className="block"><span style={{ color: 'var(--red)' }}>→</span> in 30 seconds.</span>
            </>
          ) : (
            <>
              <span className="block">Conoce tu</span>
              <span className="block red-underline">YouTube SEO Score</span>
              <span className="block"><span style={{ color: 'var(--red)' }}>→</span> en 30 segundos.</span>
            </>
          )}
        </h1>

        <p className="max-w-2xl mx-auto text-center text-zinc-400 text-lg md:text-xl mt-8 leading-relaxed">
          {lang === 'en'
            ? "Paste any video URL and get an instant diagnosis: what's holding you back, what to fix first, and how to rank higher. Free, no signup required."
            : 'Pega cualquier URL de video y obtén un diagnóstico instantáneo: qué te frena, qué arreglar primero y cómo posicionarte mejor. Gratis, sin registro.'}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
          <Link href="/seo-score" className="btn-offset px-8 py-4 text-[15px] font-display font-bold">
            {lang === 'en' ? 'Check my SEO Score →' : 'Analizar mi SEO Score →'}
          </Link>
          <Link href="/signup" className="btn-offset btn-offset-ghost px-8 py-4 text-[15px] font-display font-bold inline-flex items-center gap-2 justify-center">
            {lang === 'en' ? 'Create free account' : 'Crear cuenta gratis'}
          </Link>
        </div>
        <p className="text-center text-zinc-500 text-[13px] font-mono-jb mt-5">
          {lang === 'en'
            ? 'No signup needed · Free forever · 14 more AI tools inside'
            : 'Sin registro · Gratis para siempre · 14 herramientas más dentro'}
        </p>

        <LandingHeroDemo lang={lang} />
      </div>
    </section>
  );
}

function StatsStrip({ lang }: { lang: Lang }) {
  const items = lang === 'en'
    ? [
        { n: '12,847', l: 'Active creators', sub: '↗ +412 this week' },
        { n: '1.4M', l: 'Contents generated', sub: '↗ since 2024' },
        { n: '+27%', l: 'Average CTR boost', sub: 'month 1 vs. month 0' },
        { n: '6h 22m', l: 'Time saved/video', sub: 'according to our users' },
      ]
    : [
        { n: '12,847', l: 'Creadores activos', sub: '↗ +412 esta semana' },
        { n: '1.4M', l: 'Contenidos generados', sub: '↗ desde 2024' },
        { n: '+27%', l: 'Mejora media de CTR', sub: 'mes 1 vs. mes 0' },
        { n: '6h 22m', l: 'Tiempo ahorrado/vídeo', sub: 'según nuestros usuarios' },
      ];

  return (
    <section className="border-b border-white/10 bg-black">
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4">
        {items.map((s, i) => (
          <div key={i} className={`p-8 md:p-10 relative overflow-hidden ${i < 3 ? 'md:border-r' : ''} ${i < 2 ? 'border-r' : ''} ${i < 2 ? 'border-b md:border-b-0' : ''} border-white/10`}>
            <span className="absolute top-2 right-3 font-mono-jb text-[13px] text-zinc-700">0{i + 1}</span>
            <p className="font-display font-bold stat-num" style={{ fontSize: 'clamp(28px,4vw,48px)' }}>{s.n}</p>
            <p className="text-zinc-400 text-sm mt-2">{s.l}</p>
            <p className="font-mono-jb text-[13px] mt-3 tracking-wider uppercase" style={{ color: 'var(--red)' }}>{s.sub}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function LogoMarquee({ lang }: { lang: Lang }) {
  const logos = [...LOGO_CREATORS, ...LOGO_CREATORS];
  return (
    <section className="py-12 border-b border-white/10 bg-black overflow-hidden">
      <p className="text-center font-mono-jb text-[13px] tracking-[0.3em] text-zinc-500 uppercase mb-8">
        {lang === 'en' ? 'Used by creators who move the needle' : 'Usado por creadores que mueven la aguja'}
      </p>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 w-32 z-10 pointer-events-none" style={{ background: 'linear-gradient(90deg,#0A0A0A,transparent)' }} />
        <div className="absolute inset-y-0 right-0 w-32 z-10 pointer-events-none" style={{ background: 'linear-gradient(-90deg,#0A0A0A,transparent)' }} />
        <div className="marquee-track slow gap-14">
          {logos.map((l, i) => (
            <div key={i} className="flex items-center gap-3 shrink-0 mr-14">
              <div className="w-6 h-6 rounded-full border border-white/20" />
              <span className="font-display font-bold text-xl text-zinc-400">{l}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DemoVideo({ lang }: { lang: Lang }) {
  return (
    <section className="py-20 border-b border-white/10 bg-black">
      <div className="max-w-4xl mx-auto px-6">
        <h2 className="font-display font-bold text-3xl md:text-4xl text-center mb-4">
          {lang === 'en' ? 'See YTubViral in action' : 'Mira YTubViral en acción'}
        </h2>
        <p className="text-zinc-400 text-center mb-10 max-w-2xl mx-auto">
          {lang === 'en'
            ? 'A quick tour of every tool — from SEO analysis to AI-powered scripts.'
            : 'Un recorrido rápido por todas las herramientas — del análisis SEO a los guiones con IA.'}
        </p>
        <div className="relative w-full rounded-2xl overflow-hidden border border-white/10" style={{ paddingBottom: '56.25%' }}>
          <iframe
            className="absolute inset-0 w-full h-full"
            src="https://www.youtube.com/embed/sTvct-XXyGk?rel=0"
            title="YTubViral Demo"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        </div>
      </div>
    </section>
  );
}

function HowItWorks({ lang }: { lang: Lang }) {
  const steps = lang === 'en'
    ? [
        { n: '01', t: 'Tell us the topic', d: "A channel, a niche, a half-baked idea. Whatever. Our engine understands context." },
        { n: '02', t: 'Choose what to generate', d: "Title, description, script, captions, thumbnails. Or everything in sprint mode." },
        { n: '03', t: 'Publish and grow', d: "Copy, paste, upload. Algorithm-optimized content without creative blocks." },
      ]
    : [
        { n: '01', t: 'Cuéntanos el tema', d: 'Un canal, un nicho, una idea a medio cocinar. Lo que sea. Nuestro motor entiende contexto.' },
        { n: '02', t: 'Elige qué generar', d: 'Título, descripción, script, captions, miniaturas. O todo en modo sprint.' },
        { n: '03', t: 'Publica y crece', d: 'Copia, pega, sube. Contenido optimizado para el algoritmo sin bloqueos creativos.' },
      ];

  return (
    <section id="how" className="border-b border-white/10 relative">
      <div className="absolute inset-0 grid-bg opacity-40" />
      <div className="relative max-w-7xl mx-auto px-6 py-24">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-14">
          <div>
            <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>03 · FLOW</p>
            <h2 className="font-display font-bold text-4xl md:text-6xl leading-[0.95] max-w-2xl">
              {lang === 'en' ? 'Three steps. Zero creative blocks.' : 'Tres pasos. Cero bloqueos creativos.'}
            </h2>
          </div>
          <p className="text-zinc-400 max-w-sm">
            {lang === 'en' ? 'From topic to upload in less time than it takes to make your coffee.' : 'Del tema al upload en menos tiempo del que tarda tu café.'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 relative">
          <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-px" style={{ background: 'linear-gradient(90deg,transparent,var(--red),transparent)' }} />
          {steps.map((s, i) => (
            <div key={i} className="relative p-6 md:p-8">
              <div className="relative z-10 w-24 h-24 flex items-center justify-center border border-white/15 bg-black mb-6" style={{ boxShadow: '4px 4px 0 0 var(--red)' }}>
                <span className="font-display font-bold text-4xl">{s.n}</span>
              </div>
              <h3 className="font-display font-bold text-2xl mb-3">{s.t}</h3>
              <p className="text-zinc-400 leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ComparisonTable({ lang }: { lang: Lang }) {
  const rows = lang === 'en'
    ? [
        { label: 'Write 10 candidate titles', manual: '45 min', us: '8 sec' },
        { label: 'Research niche keywords', manual: '2 h', us: 'Built-in tool' },
        { label: 'Structure a 10-min script', manual: '3 h', us: '30 sec' },
        { label: 'Adapt to Reels/TikTok/Tweet', manual: '1 h', us: 'Included' },
        { label: 'Plan what to publish and when', manual: 'Guesswork', us: 'AI Calendar' },
        { label: 'Estimate revenue per video', manual: 'No data', us: 'Real CPM' },
        { label: 'Detect retention drop-offs', manual: 'Manual review', us: 'AI analysis' },
        { label: 'Consistency week after week', manual: 'Variable', us: 'Guaranteed' },
      ]
    : [
        { label: 'Escribir 10 títulos candidatos', manual: '45 min', us: '8 seg' },
        { label: 'Investigar keywords del nicho', manual: '2 h', us: 'Herramienta propia' },
        { label: 'Estructurar un guion de 10 min', manual: '3 h', us: '30 seg' },
        { label: 'Adaptar a Reels/TikTok/Tweet', manual: '1 h', us: 'Incluido' },
        { label: 'Planificar qué publicar y cuándo', manual: 'A ojo', us: 'Calendario IA' },
        { label: 'Estimar ingresos por vídeo', manual: 'Sin datos', us: 'CPM real' },
        { label: 'Detectar caídas de retención', manual: 'Revisión manual', us: 'Análisis IA' },
        { label: 'Consistencia semana tras semana', manual: 'Variable', us: 'Garantizada' },
      ];

  return (
    <section className="border-b border-white/10" style={{ background: '#0B0B0D' }}>
      <div className="max-w-7xl mx-auto px-6 py-24">
        <div className="mb-12">
          <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>05 · VERSUS</p>
          <h2 className="font-display font-bold text-4xl md:text-6xl leading-[0.95]">
            {lang === 'en' ? 'Manual vs. YTubViral.' : 'El método manual vs. YTubViral.'}
          </h2>
          <p className="text-zinc-400 text-lg mt-4">
            {lang === 'en' ? 'Same intent. Different results.' : 'Misma intención. Resultados distintos.'}
          </p>
        </div>

        <div className="grid border border-white/10 bg-black" style={{ gridTemplateColumns: '1.5fr 1fr 1fr' }}>
          <div className="p-5 border-r border-white/10" />
          <div className="p-5 border-r border-white/10 text-center">
            <p className="font-mono-jb text-[13px] tracking-wider text-zinc-500 uppercase mb-2">A</p>
            <p className="font-display font-bold text-lg">{lang === 'en' ? 'Manual method' : 'Método manual'}</p>
          </div>
          <div className="p-5 text-center relative" style={{ background: 'rgba(232,77,91,0.05)' }}>
            <p className="font-mono-jb text-[13px] tracking-wider uppercase mb-2" style={{ color: 'var(--red)' }}>B</p>
            <p className="font-display font-bold text-lg">Con YTubViral</p>
            <span className="absolute -top-3 right-4 red-tape">WINNER</span>
          </div>

          {rows.map((row, i) => (
            <>
              <div key={`l${i}`} className="p-5 border-t border-r border-white/10 flex items-center gap-3">
                <span className="font-mono-jb text-[13px] text-zinc-600">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-zinc-300 text-sm">{row.label}</span>
              </div>
              <div key={`m${i}`} className="p-5 border-t border-r border-white/10 text-center">
                <span className="font-mono-jb text-sm text-zinc-500 line-through" style={{ textDecorationColor: 'rgba(232,77,91,0.6)' }}>{row.manual}</span>
              </div>
              <div key={`u${i}`} className="p-5 border-t border-white/10 text-center" style={{ background: 'rgba(232,77,91,0.05)' }}>
                <span className="font-display font-bold" style={{ color: 'var(--red)' }}>{row.us}</span>
              </div>
            </>
          ))}
        </div>
      </div>
    </section>
  );
}

function FreeToolsStrip({ lang }: { lang: Lang }) {
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const tools = [
    { href: '/seo-score', icon: '📊', label: 'SEO Score', desc: t('Analiza cualquier vídeo', 'Analyze any video') },
    { href: '/trends', icon: '🔥', label: 'Trending', desc: t('Qué está viral ahora', "What's viral now") },
    { href: '/embed', icon: '🧩', label: 'Widget', desc: t('Para tu web', 'For your site') },
  ];
  return (
    <section className="border-b border-white/10 bg-black">
      <div className="max-w-7xl mx-auto px-6 py-16 text-center">
        <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: '#00FFA3' }}>
          {t('GRATIS · SIN REGISTRO', 'FREE · NO SIGNUP')}
        </p>
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-8">
          {t('Prueba antes de registrarte', 'Try before you sign up')}
        </h2>
        <div className="grid md:grid-cols-3 gap-4 max-w-3xl mx-auto">
          {tools.map(tool => (
            <Link key={tool.href} href={tool.href} className="group p-5 rounded-xl transition text-left" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="text-2xl">{tool.icon}</span>
              <p className="font-display font-bold text-sm text-white mt-2 group-hover:text-[#e84d5b] transition">{tool.label}</p>
              <p className="font-mono-jb text-[13px] mt-1" style={{ color: 'var(--yv-text-3)' }}>{tool.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// Pricing section extracted to components/PricingSection.tsx (shared with /pricing page)

function Testimonials({ reviews, lang }: { reviews: { id: string; rating: number; text: string; user: { name: string | null } }[]; lang: Lang }) {
  const COLORS = ['#e84d5b', '#00E5FF', '#FFE800', '#e84d5b', '#00E5FF', '#FFE800'];
  const staticItems = STATIC_TESTIMONIALS[lang];
  const dbItems = reviews.map((r, i) => {
    const name = r.user.name?.trim() || (lang === 'en' ? 'User' : 'Usuario');
    const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    return { name, channel: '', avatar: initials, metric: '★'.repeat(r.rating), color: COLORS[i % 6], text: r.text };
  });
  const items = [...dbItems, ...staticItems.slice(dbItems.length)].slice(0, 6);

  return (
    <section className="border-b border-white/10 bg-black">
      <div className="max-w-7xl mx-auto px-6 py-24">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-12">
          <div>
            <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>07 · CREATORS</p>
            <h2 className="font-display font-bold text-4xl md:text-6xl leading-[0.95] max-w-2xl">
              {lang === 'en' ? "Creators who stopped guessing." : "Creadores que ya no escriben a ciegas."}
            </h2>
          </div>
          <p className="text-zinc-400 max-w-sm">
            {lang === 'en' ? 'Real reviews. Real CTR. Real growth.' : 'Reseñas reales. CTR reales. Crecimiento real.'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border border-white/10">
          {items.map((it, i) => (
            <div
              key={i}
              className={`p-7 relative border-white/10 hover:bg-white/[0.02] transition ${i % 3 !== 2 ? 'lg:border-r' : ''} ${i < items.length - 3 ? 'lg:border-b' : ''} ${i < items.length - 2 ? 'md:border-b' : ''} border-b`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <svg key={s} width={13} height={13} viewBox="0 0 20 20" fill="#FFE800">
                      <path d="M10 2l2.4 5 5.6.8-4 4 1 5.6L10 14.8 5 17.4l1-5.6-4-4L7.6 7z" />
                    </svg>
                  ))}
                </div>
                {it.metric && (
                  <span className="font-mono-jb text-[13px] tracking-wider uppercase px-2 py-0.5 border" style={{ color: it.color, borderColor: it.color + '66' }}>
                    {it.metric}
                  </span>
                )}
              </div>
              <p className="text-zinc-200 text-[15px] leading-relaxed mb-5">&ldquo;{it.text}&rdquo;</p>
              <div className="flex items-center gap-3 pt-4 border-t border-white/5">
                <div className="w-9 h-9 flex items-center justify-center font-display font-bold text-[13px] shrink-0" style={{ background: it.color, color: '#000' }}>
                  {it.avatar}
                </div>
                <div>
                  <p className="font-semibold text-sm">{it.name}</p>
                  {it.channel && <p className="font-mono-jb text-[13px] text-zinc-500 tracking-wider">{it.channel}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA({ lang }: { lang: Lang }) {
  return (
    <section className="border-b border-white/10 bg-black relative overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 100%,rgba(232,77,91,0.25),transparent 70%)' }} />
      <div className="relative max-w-4xl mx-auto px-6 py-28 text-center">
        <h2 className="font-display font-bold leading-[0.9]" style={{ fontSize: 'clamp(40px,8vw,96px)' }}>
          {lang === 'en' ? (
            <>Your next viral video<br /><span className="red-underline">starts here.</span></>
          ) : (
            <>Tu próximo vídeo viral<br /><span className="red-underline">empieza aquí.</span></>
          )}
        </h2>
        <p className="text-zinc-400 text-lg md:text-xl mt-8 max-w-xl mx-auto">
          {lang === 'en'
            ? 'Join the waitlist — get 50% off for a year and early access before the public launch.'
            : 'Únete a la waitlist — 50% de descuento durante un año y acceso anticipado antes del lanzamiento público.'}
        </p>
        <WaitlistInline lang={lang} />
        <p className="text-center text-zinc-600 text-[13px] font-mono-jb mt-4">
          {lang === 'en'
            ? 'or '
            : 'o '}
          <Link href="/signup" className="text-zinc-400 hover:text-white underline underline-offset-2 transition">
            {lang === 'en' ? 'start free now →' : 'empieza gratis ahora →'}
          </Link>
        </p>
      </div>
    </section>
  );
}

function Footer({ lang }: { lang: Lang }) {
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const creationTools = [
    { href: '/features/ai-generator', label: t('Generador IA', 'AI Generator') },
    { href: '/features/keyword-research', label: 'Keyword Research' },
    { href: '/features/seo-score', label: 'SEO Score' },
    { href: '/features/ab-testing', label: 'A/B Testing' },
    { href: '/features/ai-coach', label: t('Coach IA', 'AI Coach') },
    { href: '/features/content-calendar', label: t('Calendario', 'Calendar') },
  ];
  const analysisTools = [
    { href: '/features/channel-analytics', label: 'Analytics' },
    { href: '/features/competitor-analysis', label: t('Competidores', 'Competitors') },
    { href: '/features/retention-analyzer', label: t('Retención', 'Retention') },
    { href: '/features/video-predictor', label: t('Predictor', 'Predictor') },
    { href: '/features/best-time', label: t('Mejor hora', 'Best Time') },
    { href: '/features/revenue-estimator', label: t('Ingresos', 'Revenue') },
    { href: '/features/trend-explorer', label: t('Tendencias', 'Trends') },
    { href: '/features/learning-hub', label: t('Aprendizaje', 'Learning') },
  ];

  return (
    <footer className="bg-black">
      <div className="px-6 pt-16 overflow-hidden">
        <p
          className="font-display font-bold text-center tracking-tight leading-none select-none"
          style={{ fontSize: 'clamp(50px,16vw,220px)', background: 'linear-gradient(180deg,#1a1a1a 0%,#0a0a0a 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
        >
          YTUBVIRAL<span style={{ color: 'var(--red)', WebkitTextFillColor: 'var(--red)' }}>.</span>
        </p>
      </div>
      <div className="border-t border-white/10 px-6 py-12 mt-8">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-10 mb-10">
          <div>
            <p className="font-mono-jb text-[13px] tracking-[0.2em] uppercase mb-4" style={{ color: 'var(--red)' }}>
              {t('Creación', 'Creation')}
            </p>
            <ul className="space-y-2">
              {creationTools.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-zinc-500 text-sm hover:text-white transition">{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-mono-jb text-[13px] tracking-[0.2em] uppercase mb-4" style={{ color: 'var(--red)' }}>
              {t('Análisis', 'Analysis')}
            </p>
            <ul className="space-y-2">
              {analysisTools.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-zinc-500 text-sm hover:text-white transition">{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-mono-jb text-[13px] tracking-[0.2em] uppercase mb-4" style={{ color: 'var(--red)' }}>
              {t('Recursos', 'Resources')}
            </p>
            <ul className="space-y-2">
              <li><Link href="/tools" className="text-zinc-500 text-sm hover:text-white transition">{t('Herramientas gratis', 'Free Tools')}</Link></li>
              <li><Link href="/trends" className="text-zinc-500 text-sm hover:text-white transition">{t('Trending', 'Trending')}</Link></li>
              <li><Link href="/blog" className="text-zinc-500 text-sm hover:text-white transition">Blog</Link></li>
              <li><Link href="/gear" className="text-zinc-500 text-sm hover:text-white transition">{t('Equipo recomendado', 'Recommended gear')}</Link></li>
              <li><Link href="/extension" className="text-zinc-500 text-sm hover:text-white transition">{t('Extensión Chrome', 'Chrome Extension')}</Link></li>
              <li><a href="#pricing" className="text-zinc-500 text-sm hover:text-white transition">{t('Precios', 'Pricing')}</a></li>
            </ul>
          </div>
          <div>
            <p className="font-mono-jb text-[13px] tracking-[0.2em] uppercase mb-4" style={{ color: 'var(--red)' }}>
              {t('Legal', 'Legal')}
            </p>
            <ul className="space-y-2">
              <li><Link href="/terms" className="text-zinc-500 text-sm hover:text-white transition">{t('Términos', 'Terms')}</Link></li>
              <li><Link href="/privacy" className="text-zinc-500 text-sm hover:text-white transition">{t('Privacidad', 'Privacy')}</Link></li>
              <li><Link href="/legal" className="text-zinc-500 text-sm hover:text-white transition">{t('Aviso Legal', 'Legal Notice')}</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm">
          <p className="text-zinc-500 font-mono-jb text-[13px]">
            © 2026 YTubViral · {lang === 'en' ? 'Made by creators, for creators.' : 'Hecho por creadores, para creadores.'}
          </p>
          <p className="font-mono-jb text-[13px] text-zinc-600">MADRID · REMOTE · 40°24′N 3°41′W</p>
        </div>
      </div>
    </footer>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function LandingPage() {
  const lang = getServerLang();

  // Static testimonials are the fallback — skip DB query to avoid Neon cold starts on ISR revalidation
  const approvedReviews: { id: string; rating: number; text: string; user: { name: string | null } }[] = [];

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'YTubViral',
      url: 'https://ytubviral.com',
      description: 'AI-powered YouTube SEO and growth toolkit',
      publisher: { '@type': 'Organization', name: 'YTubViral' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'YTubViral',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: 'https://ytubviral.com',
      description: 'AI-powered YouTube SEO and growth toolkit. Keyword research, competitor analysis, A/B testing, and content generation.',
      offers: [
        { '@type': 'Offer', price: '0', priceCurrency: 'EUR', name: 'Free' },
        { '@type': 'Offer', price: '9.99', priceCurrency: 'EUR', name: 'Pro' },
        { '@type': 'Offer', price: '29.99', priceCurrency: 'EUR', name: 'Business' },
      ],
      ...(approvedReviews.length >= 5 ? {
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: (approvedReviews.reduce((sum, r) => sum + r.rating, 0) / approvedReviews.length).toFixed(1),
          ratingCount: String(approvedReviews.length),
        },
      } : {}),
    },
  ];

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TopNav lang={lang} />
      <LiveTicker lang={lang} />
      <Hero lang={lang} />
      <StatsStrip lang={lang} />
      <LogoMarquee lang={lang} />
      <DemoVideo lang={lang} />
      <HowItWorks lang={lang} />
      <LandingFeatures lang={lang} />
      <ComparisonTable lang={lang} />
      <FreeToolsStrip lang={lang} />
      <PricingSection lang={lang} />
      <Testimonials reviews={approvedReviews} lang={lang} />
      <LandingFAQ lang={lang} />
      <FinalCTA lang={lang} />
      <Footer lang={lang} />
      <ChatWidgetPreview />
    </div>
  );
}
