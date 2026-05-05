import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'YouTube Keyword Research Tool — Free AI-Powered | YTubViral',
  description:
    'Find high-volume, low-competition YouTube keywords in seconds. Search volume, opportunity score, related terms, and trend data. Free, no credit card required.',
  alternates: { canonical: 'https://ytubviral.com/features/keyword-research' },
  openGraph: {
    title: 'YouTube Keyword Research Tool — Free AI-Powered | YTubViral',
    description: 'Find high-volume, low-competition YouTube keywords in seconds. Free, no credit card.',
    url: 'https://ytubviral.com/features/keyword-research',
    type: 'website',
  },
};

const FAQ = [
  {
    q: 'Is YTubViral keyword research really free?',
    qa: 'Yes. Core keyword research (search volume, competition score, opportunity rating, related terms) is 100% free with no credit card required. Pro adds AI-generated title suggestions and deeper analytics.',
  },
  {
    q: 'How does it compare to VidIQ or TubeBuddy keyword tools?',
    qa: 'YTubViral provides the same data (search volume, competition, opportunity) plus AI-powered analysis and related keyword clusters — all in one web interface. No browser extension needed, no slowdowns. And it\'s free vs $19+/month.',
  },
  {
    q: 'What data sources does the keyword tool use?',
    qa: 'We combine YouTube autocomplete data, search volume estimates, competition analysis from existing videos, and trend signals to calculate an opportunity score for each keyword.',
  },
  {
    q: 'Can I use it for YouTube Shorts keywords?',
    qa: 'Absolutely. The tool works for any YouTube content format — long-form videos, Shorts, podcasts, and livestreams. Filter by trending keywords to find Shorts-friendly topics.',
  },
  {
    q: 'How many keywords can I research per day?',
    qa: 'Free users get unlimited keyword searches. There are no daily caps on the core research tool.',
  },
];

export default function KeywordResearchFeature() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--ink)' }}>
      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">
        <p className="font-mono-jb text-[13px] tracking-[0.2em] uppercase mb-4" style={{ color: '#00D9FF' }}>
          FREE TOOL
        </p>
        <h1 className="font-display font-bold text-4xl md:text-6xl leading-tight mb-6">
          YouTube Keyword Research<br />
          <span style={{ color: 'var(--red)' }}>powered by AI</span>
        </h1>
        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8">
          Find the keywords your audience is searching for. Get search volume, competition scores,
          opportunity ratings, and related terms — all in one place, completely free.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link href="/signup" className="btn-offset px-8 py-3 text-[15px] font-display">
            Start researching — free
          </Link>
          <Link href="/research" className="btn-offset btn-offset-white px-8 py-3 text-[15px] font-display">
            Try the tool
          </Link>
        </div>
      </section>

      {/* What you get */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-10 text-center">
          What you get with every search
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { title: 'Search Volume', desc: 'Estimated monthly searches on YouTube for any keyword. Know exactly how much demand exists before you create.' },
            { title: 'Competition Score', desc: 'A 0-100 score showing how hard it is to rank. Low competition + high volume = your best opportunities.' },
            { title: 'Opportunity Rating', desc: 'Our AI combines volume, competition, and trend data into a single "should I make this video?" score.' },
            { title: 'Related Keywords', desc: 'Discover keyword clusters and long-tail variations you hadn\'t thought of. Expand your content strategy.' },
            { title: 'Trend Direction', desc: 'See if a keyword is rising, stable, or declining. Don\'t invest in dying topics.' },
            { title: 'Top Ranking Videos', desc: 'See who already ranks for this keyword, their view counts, and what you\'re up against.' },
          ].map((f) => (
            <div key={f.title} className="soft-card p-5">
              <h3 className="font-display font-bold text-base mb-2">{f.title}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-10 text-center">
          How it works
        </h2>
        <div className="space-y-8">
          {[
            { step: '1', title: 'Enter a keyword or topic', desc: 'Type any word, phrase, or topic idea. Works in English, Spanish, and most languages.' },
            { step: '2', title: 'Get instant data', desc: 'In under 3 seconds, see search volume, competition, opportunity score, and 10+ related keywords.' },
            { step: '3', title: 'Find your best opportunities', desc: 'Sort by opportunity score to find keywords where demand is high but competition is low — your fast lane to views.' },
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

      {/* vs Competitors */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-8 text-center">
          YTubViral vs other keyword tools
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
                ['Search volume', '✓', '✓', '✓'],
                ['Competition score', '✓', '✓', '✓'],
                ['Opportunity rating (AI)', '✓', '✗', '✗'],
                ['Related keyword clusters', '✓', 'Limited', '✓'],
                ['Trend direction', '✓', '✓', '✗'],
                ['No extension required', '✓', '✗', '✗'],
                ['No browser slowdown', '✓', '✗', '✗'],
                ['Free tier', 'Unlimited', '3/day', '2/day'],
                ['Price (full access)', '€9.99/mo', '$19/mo', '$9.99/mo'],
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

      {/* Use cases */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-8 text-center">
          Who is this for?
        </h2>
        <div className="grid md:grid-cols-2 gap-6">
          {[
            { title: 'New creators (0-1K subs)', desc: 'Find low-competition keywords where you can actually rank. Stop competing with channels that have 10x your audience.' },
            { title: 'Growing channels (1K-100K)', desc: 'Discover content gaps in your niche. Find topics your competitors missed that your audience is actively searching for.' },
            { title: 'Faceless/automation channels', desc: 'Research keywords at scale for high-volume content strategies. Find proven topics before you invest in production.' },
            { title: 'Agencies & consultants', desc: 'Research keywords for multiple clients from one dashboard. Export data and build content calendars based on real demand.' },
          ].map((u) => (
            <div key={u.title} className="soft-card p-5">
              <h3 className="font-display font-bold text-base mb-2">{u.title}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{u.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ — structured for Google */}
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

      {/* JSON-LD FAQPage */}
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
          Ready to find your next viral topic?
        </h2>
        <p className="text-zinc-400 mb-8">Free forever. No credit card. Start in 10 seconds.</p>
        <Link href="/signup" className="btn-offset px-10 py-4 text-[15px] font-display">
          Start keyword research — free
        </Link>
      </section>
    </div>
  );
}
