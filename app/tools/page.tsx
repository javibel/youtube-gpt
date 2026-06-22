import type { Metadata } from 'next';
import PublicNav from '@/components/PublicNav';

export const metadata: Metadata = {
  title: 'Free YouTube Tools — SEO Score, Trends & More',
  description:
    'Free YouTube tools for creators: SEO Score, Trending Explorer, AI Generator, Keyword Research and more. No signup, no credit card.',
  alternates: { canonical: 'https://ytubviral.com/tools' },
};

interface Tool {
  href: string;
  icon: string;
  title: string;
  desc: string;
  tag: string;
  free: boolean;
}

// Agrupadas por propósito para que no sea un muro plano de tarjetas.
// Iconos: set WebP de /public/icons (los mismos que usa la landing) — coherencia de marca.
const GROUPS: { id: string; title: string; subtitle: string; tools: Tool[] }[] = [
  {
    id: 'instant',
    title: 'Instant free tools',
    subtitle: 'No signup, no card — results in your browser as you type.',
    tools: [
      { href: '/title-analyzer', icon: '/icons/title.webp', title: 'Title Analyzer', desc: 'Score any video title 0-100 with instant CTR & SEO tips, before you publish.', tag: 'FREE', free: true },
      { href: '/seo-score', icon: '/icons/bar-chart.webp', title: 'SEO Score', desc: 'Analyze any published video and get a 0-100 SEO score with recommendations.', tag: 'FREE', free: true },
      { href: '/ctr-calculator', icon: '/icons/target.webp', title: 'CTR Calculator', desc: 'Calculate your click-through rate and benchmark it against YouTube averages.', tag: 'FREE', free: true },
      { href: '/youtube-money-calculator', icon: '/icons/chart-up.webp', title: 'Money Calculator', desc: 'Estimate AdSense earnings from your monthly views and niche.', tag: 'FREE', free: true },
      { href: '/engagement-rate-calculator', icon: '/icons/community.webp', title: 'Engagement Rate Calculator', desc: 'Measure a video\'s engagement from views, likes and comments and benchmark it.', tag: 'FREE', free: true },
    ],
  },
  {
    id: 'discover',
    title: 'Discover & create',
    subtitle: 'Find what works right now and turn it into content.',
    tools: [
      { href: '/youtube-title-ideas', icon: '/icons/bulb.webp', title: 'Title Ideas by Niche', desc: 'Dozens of ready-to-use viral title ideas for your niche: gaming, cooking, fitness and more.', tag: 'FREE', free: true },
      { href: '/trends', icon: '/icons/trend.webp', title: 'Trending Explorer', desc: 'The 20 most explosive videos right now across 6 countries. Updated every 30 minutes.', tag: 'FREE', free: true },
      { href: '/generate', icon: '/icons/magic-wand.webp', title: 'AI Generator', desc: 'Titles, descriptions, scripts, captions and thumbnails generated with YouTube-optimized AI.', tag: '10 FREE/MO', free: true },
      { href: '/embed', icon: '/icons/globe.webp', title: 'Embeddable Widget', desc: 'Add the SEO analyzer to your site with one line of HTML. Free and unlimited.', tag: 'FREE', free: true },
    ],
  },
  {
    id: 'pro',
    title: 'Pro tools',
    subtitle: 'Deeper research and channel data with a Pro account.',
    tools: [
      { href: '/features/keyword-research', icon: '/icons/key.webp', title: 'Keyword Research', desc: 'Find the keywords your audience searches for. Volume, competition, and related suggestions.', tag: 'PRO', free: false },
      { href: '/features/competitor-analysis', icon: '/icons/swords.webp', title: 'Competitor Analysis', desc: 'Analyze any channel: top videos, keywords they use, publishing frequency.', tag: 'PRO', free: false },
    ],
  },
];

export default function ToolsPage() {
  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      <PublicNav />

      <div className="max-w-4xl mx-auto px-6 py-16">
        <header className="text-center mb-14">
          <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--yv-brand)' }}>
            FREE TOOLS
          </p>
          <h1 className="font-display font-bold text-4xl text-white mb-4">
            Free YouTube Tools
          </h1>
          <p className="font-mono-jb text-sm max-w-lg mx-auto" style={{ color: 'var(--yv-text-3)' }}>
            Analyze, optimize and grow your YouTube channel with professional tools. No credit card required.
          </p>
        </header>

        <div className="space-y-12">
          {GROUPS.map(group => (
            <section key={group.id}>
              <div className="mb-5">
                <h2 className="font-display font-bold text-xl text-white">{group.title}</h2>
                <p className="font-mono-jb text-[13px] mt-1" style={{ color: 'var(--yv-text-4)' }}>{group.subtitle}</p>
              </div>
              <div className="grid md:grid-cols-2 gap-5">
                {group.tools.map(tool => (
                  <a
                    key={tool.href}
                    href={tool.href}
                    className="group p-6 rounded-xl transition"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--yv-border)' }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <img src={tool.icon} alt="" width={40} height={40} className="object-contain" />
                      <span
                        className="font-mono-jb text-[11px] tracking-wider font-bold px-2 py-0.5 rounded"
                        style={{
                          background: tool.free ? 'rgba(0,255,163,0.1)' : 'rgba(232,77,91,0.1)',
                          color: tool.free ? '#00FFA3' : '#e84d5b',
                          border: tool.free ? '1px solid rgba(0,255,163,0.3)' : '1px solid rgba(232,77,91,0.3)',
                        }}
                      >
                        {tool.tag}
                      </span>
                    </div>
                    <h3 className="font-display font-bold text-lg text-white mb-2 group-hover:text-[#e84d5b] transition">
                      {tool.title}
                    </h3>
                    <p className="font-mono-jb text-[13px] leading-relaxed" style={{ color: 'var(--yv-text-3)' }}>
                      {tool.desc}
                    </p>
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-14 text-center">
          <p className="font-mono-jb text-sm mb-4" style={{ color: 'var(--yv-text-3)' }}>
            Want access to all 14 tools?
          </p>
          <a href="/signup" className="btn-offset inline-flex px-8 py-3.5 text-sm font-display font-bold">
            Create free account →
          </a>
        </div>
      </div>
    </div>
  );
}
