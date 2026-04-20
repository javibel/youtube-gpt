import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import LandingHeroDemo from '@/components/LandingHeroDemo';
import LandingFeatures from '@/components/LandingFeatures';
import LandingFAQ from '@/components/LandingFAQ';
import LangToggle from '@/components/LangToggle';
import LangSync from '@/components/LangSync';

export const metadata: Metadata = {
  title: 'YTubViral — Genera contenido viral para YouTube con IA',
  description:
    'La herramienta de IA para YouTubers. Genera títulos que disparan el CTR, descripciones SEO, scripts completos, captions y conceptos de miniaturas en segundos. Empieza gratis.',
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
    ? [['#how', 'How it works'], ['/signup', 'Generate'], ['#pricing', 'Pricing']]
    : [['#how', 'Cómo funciona'], ['/signup', 'Generar'], ['#pricing', 'Precios']];

  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-md" style={{ background: 'rgba(10,10,10,0.85)' }}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="13" stroke="#9B2020" strokeWidth="2.2"/>
            <polygon points="13,10.5 13,21.5 23,16" fill="#9B2020"/>
          </svg>
          <span className="font-display font-bold text-[17px] tracking-tight">
            YTubViral<span style={{ color: 'var(--red)' }}>.</span>com
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-1 bg-white/5 border border-white/10 rounded-full p-1 font-mono-jb text-[11px] tracking-wider uppercase">
          {nav.map(([href, label]) => (
            <a key={href} href={href} className="px-3 py-1.5 rounded-full transition text-zinc-400 hover:text-white hover:bg-white/10">
              {label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <LangToggle urlMode currentLang={lang} />
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
          <span className="font-mono-jb text-[10px] font-bold tracking-wider text-white">{lang === 'en' ? 'LIVE' : 'EN VIVO'}</span>
        </div>
        <div className="marquee-track pl-36 gap-12 font-mono-jb text-[11px] text-zinc-400">
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
            <span className="font-mono-jb text-[10px] tracking-wider text-zinc-400 uppercase">
              {lang === 'en' ? 'AI for creators · Engine v4.2' : 'IA para creadores · Motor v4.2'}
            </span>
          </div>
        </div>

        <h1 className="font-display font-bold text-center leading-[0.95] tracking-tight" style={{ fontSize: 'clamp(44px,7vw,104px)' }}>
          {lang === 'en' ? (
            <>
              <span className="block">Stop fighting</span>
              <span className="block red-underline">the algorithm.</span>
              <span className="block"><span style={{ color: 'var(--red)' }}>→</span> Start winning it.</span>
            </>
          ) : (
            <>
              <span className="block">Deja de pelearte con</span>
              <span className="block red-underline">el algoritmo.</span>
              <span className="block"><span style={{ color: 'var(--red)' }}>→</span> Empieza a ganarlo.</span>
            </>
          )}
        </h1>

        <p className="max-w-2xl mx-auto text-center text-zinc-400 text-lg md:text-xl mt-8 leading-relaxed">
          {lang === 'en'
            ? "Titles, descriptions, scripts, captions and thumbnails that YouTube's algorithm wants to see. Generated in 8 seconds. Optimized for your niche."
            : 'Títulos, descripciones, scripts, captions y miniaturas que el algoritmo de YouTube quiere ver. Generados en 8 segundos. Optimizados para tu nicho.'}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
          <Link href="/signup" className="btn-offset px-8 py-4 text-[15px] font-display font-bold">
            {lang === 'en' ? 'Get started free →' : 'Empezar gratis →'}
          </Link>
          <a href="#how" className="btn-offset btn-offset-ghost px-8 py-4 text-[15px] font-display font-bold inline-flex items-center gap-2 justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M6 4l14 8-14 8V4z" /></svg>
            {lang === 'en' ? 'See how it works' : 'Ver cómo funciona'}
          </a>
        </div>
        <p className="text-center text-zinc-500 text-xs font-mono-jb mt-5">
          {lang === 'en'
            ? 'No credit card · 10 free generations · Cancel anytime'
            : 'Sin tarjeta · 10 generaciones gratis · Cancela cuando quieras'}
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
            <span className="absolute top-2 right-3 font-mono-jb text-[10px] text-zinc-700">0{i + 1}</span>
            <p className="font-display font-bold stat-num" style={{ fontSize: 'clamp(28px,4vw,48px)' }}>{s.n}</p>
            <p className="text-zinc-400 text-sm mt-2">{s.l}</p>
            <p className="font-mono-jb text-[10px] mt-3 tracking-wider uppercase" style={{ color: 'var(--red)' }}>{s.sub}</p>
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
      <p className="text-center font-mono-jb text-[10px] tracking-[0.3em] text-zinc-500 uppercase mb-8">
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
            <p className="font-mono-jb text-[11px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>03 · FLOW</p>
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
        { label: 'Research niche keywords', manual: '2 h', us: 'Automatic' },
        { label: 'Structure a 10-min script', manual: '3 h', us: '30 sec' },
        { label: 'Adapt to Reels/TikTok/Tweet', manual: '1 h', us: 'Included' },
        { label: 'Thumbnail visual brief', manual: '40 min', us: '5 sec' },
        { label: 'Consistency week after week', manual: 'Variable', us: 'Guaranteed' },
      ]
    : [
        { label: 'Escribir 10 títulos candidatos', manual: '45 min', us: '8 seg' },
        { label: 'Investigar keywords del nicho', manual: '2 h', us: 'Automático' },
        { label: 'Estructurar un guion de 10 min', manual: '3 h', us: '30 seg' },
        { label: 'Adaptar a Reels/TikTok/Tweet', manual: '1 h', us: 'Incluido' },
        { label: 'Brief visual para miniatura', manual: '40 min', us: '5 seg' },
        { label: 'Consistencia semana tras semana', manual: 'Variable', us: 'Garantizada' },
      ];

  return (
    <section className="border-b border-white/10" style={{ background: '#0B0B0D' }}>
      <div className="max-w-7xl mx-auto px-6 py-24">
        <div className="mb-12">
          <p className="font-mono-jb text-[11px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>05 · VERSUS</p>
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
            <p className="font-mono-jb text-[10px] tracking-wider text-zinc-500 uppercase mb-2">A</p>
            <p className="font-display font-bold text-lg">{lang === 'en' ? 'Manual method' : 'Método manual'}</p>
          </div>
          <div className="p-5 text-center relative" style={{ background: 'rgba(232,77,91,0.05)' }}>
            <p className="font-mono-jb text-[10px] tracking-wider uppercase mb-2" style={{ color: 'var(--red)' }}>B</p>
            <p className="font-display font-bold text-lg">Con YTubViral</p>
            <span className="absolute -top-3 right-4 red-tape">WINNER</span>
          </div>

          {rows.map((row, i) => (
            <>
              <div key={`l${i}`} className="p-5 border-t border-r border-white/10 flex items-center gap-3">
                <span className="font-mono-jb text-[10px] text-zinc-600">{String(i + 1).padStart(2, '0')}</span>
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

function Pricing({ lang }: { lang: Lang }) {
  const freeFeatures = lang === 'en'
    ? ['10 generations/month', '5 content types', '30-day history', 'No credit card']
    : ['10 generaciones al mes', '5 tipos de contenido', 'Historial 30 días', 'Sin tarjeta de crédito'];
  const proFeatures = lang === 'en'
    ? ['200 generations/month', 'All content types', 'Full history', '24h priority support', 'Early access to new features', 'CSV export']
    : ['200 generaciones al mes', 'Todos los tipos de contenido', 'Historial completo', 'Soporte prioritario 24h', 'Acceso anticipado a nuevas funciones', 'Exportación a CSV'];

  return (
    <section id="pricing" className="border-b border-white/10 relative overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 100%,rgba(232,77,91,0.10),transparent 60%)' }} />
      <div className="relative max-w-5xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <p className="font-mono-jb text-[11px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>06 · PRICING</p>
          <h2 className="font-display font-bold text-4xl md:text-6xl leading-[0.95]">
            {lang === 'en' ? 'One price. No surprises.' : 'Un precio. Ninguna sorpresa.'}
          </h2>
          <p className="text-zinc-400 text-lg mt-4 max-w-xl mx-auto">
            {lang === 'en' ? 'Start free. Go Pro when you\'re ready to scale.' : 'Empieza gratis. Sube a Pro cuando quieras escalar en serio.'}
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-0 border border-white/10">
          <div className="p-10 bg-black border-b md:border-b-0 md:border-r border-white/10">
            <p className="font-mono-jb text-[11px] tracking-wider uppercase text-zinc-500 mb-4">
              A · {lang === 'en' ? 'Free' : 'Gratuito'}
            </p>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="font-display font-bold stat-num" style={{ fontSize: '60px' }}>0€</span>
              <span className="text-zinc-500 font-mono-jb text-sm">/{lang === 'en' ? 'mo' : 'mes'}</span>
            </div>
            <p className="text-zinc-500 text-sm mb-8">{lang === 'en' ? 'To explore and validate' : 'Para explorar y validar'}</p>
            <ul className="space-y-3 mb-10">
              {freeFeatures.map((f) => (
                <li key={f} className="flex items-start gap-3 text-zinc-300 text-sm">
                  <svg className="shrink-0 mt-0.5 text-zinc-500" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}><path d="M5 13l4 4L19 7" /></svg>
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/signup" className="btn-offset btn-offset-ghost w-full px-5 py-3 text-sm font-display block text-center">
              {lang === 'en' ? 'Start free' : 'Empezar gratis'}
            </Link>
          </div>

          <div className="p-10 relative" style={{ background: 'linear-gradient(180deg,rgba(232,77,91,0.08),rgba(232,77,91,0.02))' }}>
            <div className="absolute -top-3 left-10 red-tape">★ {lang === 'en' ? 'MOST POPULAR' : 'MÁS ELEGIDO'}</div>
            <p className="font-mono-jb text-[11px] tracking-wider uppercase mb-4" style={{ color: 'var(--red)' }}>B · Pro</p>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="font-display font-bold stat-num" style={{ fontSize: '60px' }}>9,99€</span>
              <span className="text-zinc-500 font-mono-jb text-sm">/{lang === 'en' ? 'mo' : 'mes'}</span>
            </div>
            <p className="text-zinc-400 text-sm mb-8">
              {lang === 'en' ? 'For creators who publish seriously' : 'Para creadores que publican en serio'}
            </p>
            <ul className="space-y-3 mb-10">
              {proFeatures.map((f) => (
                <li key={f} className="flex items-start gap-3 text-zinc-200 text-sm">
                  <svg className="shrink-0 mt-0.5" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} style={{ color: 'var(--red)' }}><path d="M5 13l4 4L19 7" /></svg>
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/signup" className="btn-offset w-full px-5 py-3 text-sm font-display block text-center">
              {lang === 'en' ? 'Get Pro →' : 'Empezar con Pro →'}
            </Link>
          </div>
        </div>

        <p className="text-center text-zinc-500 text-xs font-mono-jb mt-6">
          {lang === 'en'
            ? '30-day guarantee · Cancel anytime · Transparent billing'
            : '30 días de garantía · Cancela cuando quieras · Facturación transparente'}
        </p>
      </div>
    </section>
  );
}

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
            <p className="font-mono-jb text-[11px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>07 · CREATORS</p>
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
                  <span className="font-mono-jb text-[10px] tracking-wider uppercase px-2 py-0.5 border" style={{ color: it.color, borderColor: it.color + '66' }}>
                    {it.metric}
                  </span>
                )}
              </div>
              <p className="text-zinc-200 text-[15px] leading-relaxed mb-5">&ldquo;{it.text}&rdquo;</p>
              <div className="flex items-center gap-3 pt-4 border-t border-white/5">
                <div className="w-9 h-9 flex items-center justify-center font-display font-bold text-xs shrink-0" style={{ background: it.color, color: '#000' }}>
                  {it.avatar}
                </div>
                <div>
                  <p className="font-semibold text-sm">{it.name}</p>
                  {it.channel && <p className="font-mono-jb text-[10px] text-zinc-500 tracking-wider">{it.channel}</p>}
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
            ? 'Join 12,000+ creators who stopped staring at a blank screen.'
            : 'Únete a +12.000 creadores que dejaron de mirar la pantalla en blanco.'}
        </p>
        <Link href="/signup" className="btn-offset px-10 py-5 text-lg font-display font-bold mt-10 inline-flex">
          {lang === 'en' ? 'Get started free →' : 'Empezar gratis →'}
        </Link>
      </div>
    </section>
  );
}

function Footer({ lang }: { lang: Lang }) {
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
      <div className="border-t border-white/10 px-6 py-8 mt-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm">
          <p className="text-zinc-500 font-mono-jb text-xs">
            © 2026 YTubViral · {lang === 'en' ? 'Made by creators, for creators.' : 'Hecho por creadores, para creadores.'}
          </p>
          <div className="flex gap-6 text-zinc-500 font-mono-jb text-xs">
            <Link href="/terms" className="hover:text-white transition">{lang === 'en' ? 'Terms' : 'Términos'}</Link>
            <Link href="/privacy" className="hover:text-white transition">{lang === 'en' ? 'Privacy' : 'Privacidad'}</Link>
            <Link href="/legal" className="hover:text-white transition">{lang === 'en' ? 'Legal Notice' : 'Aviso Legal'}</Link>
          </div>
          <p className="font-mono-jb text-xs text-zinc-600">MADRID · REMOTE · 40°24′N 3°41′W</p>
        </div>
      </div>
    </footer>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang: langParam } = await searchParams;
  const lang: Lang = langParam === 'en' ? 'en' : 'es';

  let approvedReviews: { id: string; rating: number; text: string; user: { name: string | null } }[] = [];
  try {
    approvedReviews = await prisma.review.findMany({
      where: { status: 'approved' },
      orderBy: { updatedAt: 'desc' },
      take: 12,
      select: { id: true, rating: true, text: true, user: { select: { name: true } } },
    });
  } catch {
    // fallback to static testimonials
  }

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      <LangSync lang={lang} />
      <TopNav lang={lang} />
      <LiveTicker lang={lang} />
      <Hero lang={lang} />
      <StatsStrip lang={lang} />
      <LogoMarquee lang={lang} />
      <HowItWorks lang={lang} />
      <LandingFeatures lang={lang} />
      <ComparisonTable lang={lang} />
      <Pricing lang={lang} />
      <Testimonials reviews={approvedReviews} lang={lang} />
      <LandingFAQ lang={lang} />
      <FinalCTA lang={lang} />
      <Footer lang={lang} />
    </div>
  );
}
