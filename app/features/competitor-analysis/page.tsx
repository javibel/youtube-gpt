import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'YouTube Competitor Analysis Tool — Free Channel Spy | YTubViral',
  description:
    'Analyze any YouTube channel: upload frequency, average views, top keywords, trending videos, and growth patterns. Free competitor intelligence for creators.',
  alternates: { canonical: 'https://ytubviral.com/features/competitor-analysis' },
  openGraph: {
    title: 'YouTube Competitor Analysis Tool — Free | YTubViral',
    description: 'Spy on any YouTube channel: views, keywords, upload patterns, trending videos. Free.',
    url: 'https://ytubviral.com/features/competitor-analysis',
    type: 'website',
  },
};

const FAQ = [
  {
    q: 'Can I analyze any YouTube channel?',
    qa: 'Yes. Enter any channel URL or name and get instant data — subscribers, views, upload frequency, top keywords, best-performing videos, and more. Works for any public channel regardless of size.',
  },
  {
    q: 'What competitor data can I see?',
    qa: 'Upload frequency and schedule, average views per video, subscriber growth trends, most-used keywords and tags, top performing videos (outliers), estimated revenue range, and content gaps you can exploit.',
  },
  {
    q: 'How is this different from Social Blade?',
    qa: 'Social Blade shows passive stats (subscriber count, grade). YTubViral goes deeper: we show their keyword strategy, identify their outlier videos, detect content patterns, and suggest opportunities they\'re missing that you can target.',
  },
  {
    q: 'Can I track competitors over time?',
    qa: 'Yes. Pro users can save competitors and get weekly reports on their upload activity, trending videos, and keyword changes. Know what they\'re doing before their videos even go viral.',
  },
  {
    q: 'How many competitors can I analyze?',
    qa: 'Free tier: unlimited one-time analyses. Pro tier: save and track up to 20 competitors with weekly automated reports and alerts.',
  },
];

export default function CompetitorAnalysisFeature() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--ink)' }}>
      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">
        <p className="font-mono-jb text-[13px] tracking-[0.2em] uppercase mb-4" style={{ color: '#00D9FF' }}>
          FREE TOOL
        </p>
        <h1 className="font-display font-bold text-4xl md:text-6xl leading-tight mb-6">
          YouTube Competitor<br />
          <span style={{ color: 'var(--red)' }}>Analysis Tool</span>
        </h1>
        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8">
          Enter any channel URL and see exactly what&apos;s working for them — keywords, upload patterns,
          outlier videos, and content gaps you can exploit. Know your competition inside out.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link href="/signup" className="btn-offset px-8 py-3 text-[15px] font-display">
            Analyze a competitor — free
          </Link>
          <Link href="/competitors" className="btn-offset btn-offset-white px-8 py-3 text-[15px] font-display">
            Try the tool
          </Link>
        </div>
      </section>

      {/* What you learn */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-10 text-center">
          What you&apos;ll discover about any channel
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { title: 'Upload frequency & schedule', desc: 'See when and how often they post. Find patterns: do they upload at specific times? Is consistency driving their growth?' },
            { title: 'Average views & engagement', desc: 'Views per video, like ratio, comment rate — and how these metrics have changed over the last 30/90 days.' },
            { title: 'Top keywords & tags', desc: 'The exact keywords and tags they use most. See which terms drive their traffic and find ones you\'re not targeting.' },
            { title: 'Outlier videos (10x performers)', desc: 'Videos that got 5-10x more views than their average. These reveal what content format and topics resonate most.' },
            { title: 'Content gaps & opportunities', desc: 'AI identifies topics their audience searches for but they haven\'t covered yet. Your chance to fill the gap first.' },
            { title: 'Growth trajectory', desc: 'Subscriber growth rate, views trend, and momentum indicators. Is this channel accelerating, plateauing, or declining?' },
          ].map((f) => (
            <div key={f.title} className="soft-card p-5">
              <h3 className="font-display font-bold text-base mb-2">{f.title}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Use cases */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-10 text-center">
          How creators use competitor analysis
        </h2>
        <div className="space-y-8">
          {[
            { step: '1', title: 'Find what topics work in your niche', desc: 'Analyze 3-5 channels in your niche. Look at their outlier videos. Those topics have proven demand — now make your version.' },
            { step: '2', title: 'Steal their keyword strategy', desc: 'See exactly which keywords they rank for. Filter for ones where you could compete based on your channel size and authority.' },
            { step: '3', title: 'Identify content gaps', desc: 'Our AI cross-references their content with audience search data. Find topics people want that nobody in your niche has covered well.' },
            { step: '4', title: 'Benchmark your performance', desc: 'Compare your upload frequency, avg views, and growth rate against competitors. Know if you\'re ahead or behind — and exactly where.' },
          ].map((s) => (
            <div key={s.step} className="flex gap-5 items-start">
              <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-lg" style={{ background: 'var(--red)', color: 'white' }}>
                {s.step}
              </div>
              <div>
                <h3 className="font-display font-bold text-lg mb-1">{s.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-8 text-center">
          YTubViral vs other competitor tools
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-white/10">
                <th className="py-3 px-4 font-display font-bold">Feature</th>
                <th className="py-3 px-4 font-display font-bold text-center" style={{ color: 'var(--red)' }}>YTubViral</th>
                <th className="py-3 px-4 font-display font-bold text-center text-zinc-500">Social Blade</th>
                <th className="py-3 px-4 font-display font-bold text-center text-zinc-500">VidIQ</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              {[
                ['Channel overview stats', '✓', '✓', '✓'],
                ['Top keywords used', '✓', '✗', '✓'],
                ['Outlier video detection', '✓', '✗', '✗'],
                ['Content gap analysis (AI)', '✓', '✗', '✗'],
                ['Upload schedule patterns', '✓', 'Basic', '✓'],
                ['Competitor tracking', '✓ (Pro)', '✓', '✓'],
                ['Revenue estimates', '✓', '✓ (ranges)', '✓'],
                ['No extension needed', '✓', '✓', '✗'],
                ['Free tier', 'Unlimited', '✓', '3/day'],
                ['Price', '€9.99/mo', 'Free', '$19/mo'],
              ].map(([feat, ytub, blade, vidiq]) => (
                <tr key={feat} className="border-b border-white/5">
                  <td className="py-2.5 px-4">{feat}</td>
                  <td className="py-2.5 px-4 text-center text-white font-medium">{ytub}</td>
                  <td className="py-2.5 px-4 text-center">{blade}</td>
                  <td className="py-2.5 px-4 text-center">{vidiq}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-8 text-center">
          Frequently asked questions
        </h2>
        <div className="space-y-6">
          {FAQ.map((item) => (
            <div key={item.q} className="soft-card p-5">
              <h3 className="font-display font-bold text-base mb-2">{item.q}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{item.qa}</p>
            </div>
          ))}
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: FAQ.map((item) => ({
              '@type': 'Question',
              name: item.q,
              acceptedAnswer: { '@type': 'Answer', text: item.qa },
            })),
          }),
        }}
      />

      {/* Final CTA */}
      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-4">
          Know exactly what your competitors are doing
        </h2>
        <p className="text-zinc-400 mb-8">Analyze any channel in seconds. Free, no signup required to try.</p>
        <Link href="/signup" className="btn-offset px-10 py-4 text-[15px] font-display">
          Analyze your first competitor — free
        </Link>
      </section>
    </div>
  );
}
