import type { Metadata } from 'next';
import PublicNav from '@/components/PublicNav';

export const metadata: Metadata = {
  title: 'Free YouTube Tools — SEO Score, Trends & More',
  description:
    'Free YouTube tools for creators: SEO Score, Trending Explorer, AI Generator, Keyword Research and more. No signup, no credit card.',
  alternates: { canonical: 'https://ytubviral.com/tools' },
};

const TOOLS = [
  {
    href: '/title-analyzer',
    icon: '📝',
    color: '#FFE800',
    title: 'YouTube Title Analyzer',
    desc: 'Score any video title 0-100 with instant CTR & SEO tips — before you publish. No signup.',
    tag: 'FREE',
    free: true,
  },
  {
    href: '/seo-score',
    icon: '📊',
    color: '#e84d5b',
    title: 'YouTube SEO Score',
    desc: 'Analyze any video and get a 0-100 SEO score with specific recommendations.',
    tag: 'FREE',
    free: true,
  },
  {
    href: '/ctr-calculator',
    icon: '🎯',
    color: '#22c55e',
    title: 'YouTube CTR Calculator',
    desc: 'Calculate your click-through rate and benchmark it against YouTube averages. Instant, no signup.',
    tag: 'FREE',
    free: true,
  },
  {
    href: '/youtube-money-calculator',
    icon: '💰',
    color: '#7CFF00',
    title: 'YouTube Money Calculator',
    desc: 'Estimate AdSense earnings from your monthly views and niche. Instant, no signup.',
    tag: 'FREE',
    free: true,
  },
  {
    href: '/trends',
    icon: '🔥',
    color: '#FF8A00',
    title: 'Trending Explorer',
    desc: 'The 20 most explosive videos right now across 6 countries. Updated every 30 minutes.',
    tag: 'FREE',
    free: true,
  },
  {
    href: '/embed',
    icon: '🧩',
    color: '#00E5FF',
    title: 'Embeddable Widget',
    desc: 'Add the SEO analyzer to your site with one line of HTML. Free and unlimited.',
    tag: 'FREE',
    free: true,
  },
  {
    href: '/generate',
    icon: '✍️',
    color: '#FFE800',
    title: 'AI Generator',
    desc: 'Titles, descriptions, scripts, captions and thumbnails generated with YouTube-optimized AI.',
    tag: '10 FREE/MO',
    free: true,
  },
  {
    href: '/features/keyword-research',
    icon: '🔑',
    color: '#7CFF00',
    title: 'Keyword Research',
    desc: 'Find the keywords your audience searches for. Volume, competition, and related suggestions.',
    tag: 'PRO',
    free: false,
  },
  {
    href: '/features/competitor-analysis',
    icon: '🕵️',
    color: '#B388FF',
    title: 'Competitor Analysis',
    desc: 'Analyze any channel: top videos, keywords they use, publishing frequency.',
    tag: 'PRO',
    free: false,
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

        <div className="grid md:grid-cols-2 gap-5">
          {TOOLS.map(tool => (
            <a
              key={tool.href}
              href={tool.href}
              className="group p-6 rounded-xl transition"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--yv-border)' }}
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-3xl">{tool.icon}</span>
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
