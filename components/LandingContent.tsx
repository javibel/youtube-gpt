'use client';

import Link from 'next/link';
import { useLang } from '@/components/LangProvider';
import LangToggle from '@/components/LangToggle';
import LandingHeroDemo from '@/components/LandingHeroDemo';
import LandingFeatures from '@/components/LandingFeatures';
import LandingFAQ from '@/components/LandingFAQ';
import ChatWidgetPreview from '@/components/ChatWidgetPreview';
import PricingSection from '@/components/PricingSection';

type Lang = 'es' | 'en';

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
          <LangToggle />
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
            <span className="red-tape py-1">CLAUDE</span>
            <span className="font-mono-jb text-[13px] tracking-wider text-zinc-400 uppercase">
              {lang === 'en' ? 'Powered by Claude — Anthropic AI' : 'Impulsado por Claude — IA de Anthropic'}
            </span>
          </div>
        </div>

        <h1 className="font-display font-bold text-center leading-[0.95] tracking-tight" style={{ fontSize: 'clamp(44px,7vw,104px)' }}>
          {lang === 'en' ? (
            <>
              <span className="block">Grow on YouTube</span>
              <span className="block red-underline">with the best AI</span>
              <span className="block"><span style={{ color: 'var(--red)' }}>→</span> start free.</span>
            </>
          ) : (
            <>
              <span className="block">Crece en YouTube</span>
              <span className="block red-underline">con la mejor IA</span>
              <span className="block"><span style={{ color: 'var(--red)' }}>→</span> empieza gratis.</span>
            </>
          )}
        </h1>

        <p className="max-w-2xl mx-auto text-center text-zinc-400 text-lg md:text-xl mt-8 leading-relaxed">
          {lang === 'en'
            ? '14 AI tools to grow on YouTube, powered by Claude — the AI that writes best, not generic GPT. Start with the free SEO Score: paste a video URL and see what is holding you back. No signup.'
            : '14 herramientas de IA para crecer en YouTube, impulsadas por Claude — la IA que mejor escribe, no GPT genérico. Empieza con el SEO Score gratis: pega la URL de un vídeo y descubre qué te frena. Sin registro.'}
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
            ? 'No signup · SEO Score & Trends free forever · Pro €9.99/mo (VidIQ charges $49)'
            : 'Sin registro · SEO Score y Trends gratis para siempre · Pro 9,99€/mes (VidIQ cobra $49)'}
        </p>

        <LandingHeroDemo lang={lang} />
      </div>
    </section>
  );
}

function StatsStrip({ lang }: { lang: Lang }) {
  const items = lang === 'en'
    ? [
        { n: '0→100', l: 'SEO Score in 30 seconds', sub: 'Instant video diagnosis' },
        { n: '€9.99', l: 'Pro plan / month', sub: 'VidIQ charges $49/mo' },
        { n: '100%', l: 'Free SEO Score', sub: 'No signup, no limits' },
        { n: 'AI', l: 'Personalized to your channel', sub: 'Connect YouTube · get tailored results' },
      ]
    : [
        { n: '0→100', l: 'SEO Score en 30 segundos', sub: 'Diagnóstico instantáneo' },
        { n: '9,99€', l: 'Plan Pro / mes', sub: 'VidIQ cobra $49/mes' },
        { n: '100%', l: 'SEO Score gratis', sub: 'Sin registro, sin límites' },
        { n: 'IA', l: 'Personalizada a tu canal', sub: 'Conecta YouTube · resultados a medida' },
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

function WhyDifferent({ lang }: { lang: Lang }) {
  const items = lang === 'en'
    ? [
        { icon: '🎯', title: 'Honest diagnostics', desc: 'SEO Score tells you exactly what to fix — no vague advice.' },
        { icon: '🧠', title: 'AI that knows your channel', desc: 'Connect YouTube and every generation is tailored to your niche, audience, and recent performance.' },
        { icon: '💰', title: '5× cheaper than VidIQ', desc: '€9.99/mo vs $49/mo. Same core features. No enterprise upsell.' },
      ]
    : [
        { icon: '🎯', title: 'Diagnóstico honesto', desc: 'SEO Score te dice exactamente qué arreglar — sin consejos vagos.' },
        { icon: '🧠', title: 'IA que conoce tu canal', desc: 'Conecta YouTube y cada generación se adapta a tu nicho, audiencia y rendimiento.' },
        { icon: '💰', title: '5× más barato que VidIQ', desc: '9,99€/mes vs $49/mes. Mismas funciones core. Sin upsell enterprise.' },
      ];

  return (
    <section className="py-16 border-b border-white/10 bg-black">
      <div className="max-w-5xl mx-auto px-6">
        <p className="text-center font-mono-jb text-[13px] tracking-[0.3em] text-zinc-500 uppercase mb-10">
          {lang === 'en' ? 'Why creators switch to YTubViral' : 'Por qué los creadores eligen YTubViral'}
        </p>
        <div className="grid md:grid-cols-3 gap-6">
          {items.map((item, i) => (
            <div key={i} className="p-6 border border-white/10 bg-white/[0.02]">
              <span className="text-2xl">{item.icon}</span>
              <h3 className="font-display font-bold text-lg mt-3 mb-2">{item.title}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{item.desc}</p>
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
        { n: '01', t: 'Check your SEO Score', d: "Paste any video URL. Get a 0-100 score with specific fixes — no signup needed." },
        { n: '02', t: 'Connect your channel', d: "Link YouTube and every AI tool adapts to your niche, audience size, and recent performance." },
        { n: '03', t: 'Create and grow', d: "Titles, scripts, thumbnails — all personalized to your channel. Not generic AI slop." },
      ]
    : [
        { n: '01', t: 'Analiza tu SEO Score', d: 'Pega cualquier URL de vídeo. Obtén una puntuación 0-100 con fixes concretos — sin registro.' },
        { n: '02', t: 'Conecta tu canal', d: 'Vincula YouTube y cada herramienta IA se adapta a tu nicho, tamaño de audiencia y rendimiento.' },
        { n: '03', t: 'Crea y crece', d: 'Títulos, scripts, miniaturas — todo personalizado a tu canal. No IA genérica.' },
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
            <div key={i} className="contents">
              <div className="p-5 border-t border-r border-white/10 flex items-center gap-3">
                <span className="font-mono-jb text-[13px] text-zinc-600">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-zinc-300 text-sm">{row.label}</span>
              </div>
              <div className="p-5 border-t border-r border-white/10 text-center">
                <span className="font-mono-jb text-sm text-zinc-500 line-through" style={{ textDecorationColor: 'rgba(232,77,91,0.6)' }}>{row.manual}</span>
              </div>
              <div className="p-5 border-t border-white/10 text-center" style={{ background: 'rgba(232,77,91,0.05)' }}>
                <span className="font-display font-bold" style={{ color: 'var(--red)' }}>{row.us}</span>
              </div>
            </div>
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

function Testimonials({ lang }: { lang: Lang }) {
  const items = STATIC_TESTIMONIALS[lang];

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
            {lang === 'en' ? 'What our early users are saying.' : 'Lo que dicen nuestros primeros usuarios.'}
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
            ? 'Analyze your first video for free. No credit card, no limits on the SEO Score.'
            : 'Analiza tu primer vídeo gratis. Sin tarjeta, sin límites en el SEO Score.'}
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/seo-score" className="btn-offset inline-flex px-10 py-4 text-base font-display font-bold">
            {lang === 'en' ? 'Check my SEO Score →' : 'Analizar mi SEO Score →'}
          </Link>
          <Link href="/signup" className="text-zinc-400 hover:text-white text-sm font-mono-jb underline underline-offset-2 transition">
            {lang === 'en' ? 'or create free account' : 'o crear cuenta gratis'}
          </Link>
        </div>
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
              <li><Link href="/pricing" className="text-zinc-500 text-sm hover:text-white transition">{t('Precios', 'Pricing')}</Link></li>
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
              <li><button onClick={() => window.dispatchEvent(new CustomEvent('ytv-consent-open'))} className="text-zinc-500 text-sm hover:text-white transition">Cookies</button></li>
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

// ── Main content ────────────────────────────────────────────────────────────

export default function LandingContent({ jsonLd }: { jsonLd: object[] }) {
  const lang = useLang();

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
      <WhyDifferent lang={lang} />
      <DemoVideo lang={lang} />
      <HowItWorks lang={lang} />
      <LandingFeatures lang={lang} />
      <ComparisonTable lang={lang} />
      <FreeToolsStrip lang={lang} />
      <PricingSection lang={lang} />
      <Testimonials lang={lang} />
      <LandingFAQ lang={lang} />
      <FinalCTA lang={lang} />
      <Footer lang={lang} />
      <ChatWidgetPreview />
    </div>
  );
}
