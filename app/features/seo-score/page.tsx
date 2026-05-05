import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'YouTube SEO Score Checker — Analyze Any Video Free | YTubViral',
  description:
    'Get a 0-100 SEO score for any YouTube video in seconds. Actionable checklist for title, tags, description, and thumbnail optimization. Free tool.',
  alternates: { canonical: 'https://ytubviral.com/features/seo-score' },
  openGraph: {
    title: 'YouTube SEO Score Checker — Analyze Any Video Free | YTubViral',
    description: 'Get a 0-100 SEO score for any YouTube video. Free actionable optimization checklist.',
    url: 'https://ytubviral.com/features/seo-score',
    type: 'website',
  },
};

const FAQ = [
  {
    q: 'How is the SEO score calculated?',
    qa: 'We analyze 12+ factors: title keyword presence, title length, description completeness, tag relevance, thumbnail quality signals, engagement metrics, and more. Each factor is weighted by its proven impact on YouTube rankings.',
  },
  {
    q: 'Can I check any video or only my own?',
    qa: 'You can analyze any public YouTube video — yours or your competitors\'. Just paste the URL and get instant results. Great for reverse-engineering what top creators do right.',
  },
  {
    q: 'What makes this different from VidIQ SEO score?',
    qa: 'VidIQ requires a browser extension and only shows scores while browsing YouTube. YTubViral works from any device via web, gives a more detailed checklist with specific fixes, and includes AI-powered improvement suggestions.',
  },
  {
    q: 'Does a higher SEO score guarantee more views?',
    qa: 'SEO score measures how well-optimized your video is for YouTube search. It improves your chances of ranking, but views also depend on CTR, retention, and topic demand. We recommend combining SEO Score with our Keyword Research tool.',
  },
  {
    q: 'Is the SEO checker free?',
    qa: 'Yes. The SEO score analysis is free with no limits. Pro users get AI-powered improvement suggestions and the ability to save scores over time to track optimization progress.',
  },
];

export default function SeoScoreFeature() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--ink)' }}>
      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">
        <p className="font-mono-jb text-[13px] tracking-[0.2em] uppercase mb-4" style={{ color: '#00D9FF' }}>
          FREE TOOL
        </p>
        <h1 className="font-display font-bold text-4xl md:text-6xl leading-tight mb-6">
          YouTube Video SEO<br />
          <span style={{ color: 'var(--red)' }}>Score Checker</span>
        </h1>
        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8">
          Paste any YouTube video URL and get an instant 0-100 SEO score with a detailed checklist
          of what to fix. Stop guessing — know exactly how optimized your videos are.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link href="/signup" className="btn-offset px-8 py-3 text-[15px] font-display">
            Check your video — free
          </Link>
          <Link href="/seo-score" className="btn-offset btn-offset-white px-8 py-3 text-[15px] font-display">
            Try the tool
          </Link>
        </div>
      </section>

      {/* What it checks */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-10 text-center">
          What we analyze in every video
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { title: 'Title optimization', desc: 'Keyword presence, length, power words, emotional triggers, and CTR potential of your title.' },
            { title: 'Description quality', desc: 'First 200 characters, keyword density, timestamps, links, CTA presence, and overall completeness.' },
            { title: 'Tags & keywords', desc: 'Number of tags, relevance to title/description, mix of broad and long-tail keywords.' },
            { title: 'Thumbnail signals', desc: 'Resolution, aspect ratio, text overlay detection, face presence, and contrast analysis.' },
            { title: 'Engagement metrics', desc: 'Like ratio, comment rate, and how they compare to average videos in the same niche.' },
            { title: 'Channel authority', desc: 'Subscriber count, upload consistency, and niche relevance — factors that affect ranking power.' },
          ].map((f) => (
            <div key={f.title} className="soft-card p-5">
              <h3 className="font-display font-bold text-base mb-2">{f.title}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How to use */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-10 text-center">
          How to improve your YouTube SEO in 3 steps
        </h2>
        <div className="space-y-8">
          {[
            { step: '1', title: 'Paste your video URL', desc: 'Copy any YouTube video link and paste it into the tool. Results appear in under 5 seconds.' },
            { step: '2', title: 'Review your score & checklist', desc: 'See your overall score (0-100) and a detailed breakdown of what\'s working and what needs improvement.' },
            { step: '3', title: 'Fix the red items first', desc: 'Each checklist item is color-coded by impact. Fix the red items first for maximum ranking improvement with minimum effort.' },
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
          YTubViral SEO Score vs alternatives
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-white/10">
                <th className="py-3 px-4 font-display font-bold">Feature</th>
                <th className="py-3 px-4 font-display font-bold text-center" style={{ color: 'var(--red)' }}>YTubViral</th>
                <th className="py-3 px-4 font-display font-bold text-center text-zinc-500">VidIQ</th>
                <th className="py-3 px-4 font-display font-bold text-center text-zinc-500">TubeBuddy</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              {[
                ['Overall SEO score', '✓ (0-100)', '✓ (0-100)', '✗'],
                ['Detailed checklist', '✓ (12 items)', 'Basic', '✗'],
                ['Analyze any video', '✓', '✓', '✓'],
                ['AI improvement tips', '✓ (Pro)', '✗', '✗'],
                ['Works without extension', '✓', '✗', '✗'],
                ['Track score over time', '✓ (Pro)', '✗', '✗'],
                ['Competitor video analysis', '✓', '✓', 'Limited'],
                ['Free tier', 'Unlimited', '3/day', 'N/A'],
                ['Price', '€9.99/mo', '$19/mo', '$9.99/mo'],
              ].map(([feat, ytub, vidiq, tube]) => (
                <tr key={feat} className="border-b border-white/5">
                  <td className="py-2.5 px-4">{feat}</td>
                  <td className="py-2.5 px-4 text-center text-white font-medium">{ytub}</td>
                  <td className="py-2.5 px-4 text-center">{vidiq}</td>
                  <td className="py-2.5 px-4 text-center">{tube}</td>
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
          How optimized is your latest video?
        </h2>
        <p className="text-zinc-400 mb-8">Find out in 5 seconds. Free, no signup required to try.</p>
        <Link href="/signup" className="btn-offset px-10 py-4 text-[15px] font-display">
          Check your SEO score — free
        </Link>
      </section>
    </div>
  );
}
