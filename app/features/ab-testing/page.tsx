import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'YouTube A/B Testing Tool — Test Titles & Thumbnails Free | YTubViral',
  description:
    'A/B test your YouTube titles automatically. Swap versions, track CTR, and find what gets more clicks. The only free A/B testing tool for YouTube creators.',
  alternates: { canonical: 'https://ytubviral.com/features/ab-testing' },
  openGraph: {
    title: 'YouTube A/B Testing Tool — Test Titles & Thumbnails | YTubViral',
    description: 'A/B test YouTube titles automatically. Track CTR and find what gets more clicks. Free.',
    url: 'https://ytubviral.com/features/ab-testing',
    type: 'website',
  },
};

const FAQ = [
  {
    q: 'How does YouTube A/B testing work?',
    qa: 'You provide two title variations for a video. YTubViral automatically swaps between them at set intervals (e.g., every 24 hours) and tracks impressions, CTR, and views for each version. After enough data, we declare a statistically significant winner.',
  },
  {
    q: 'Can I A/B test thumbnails too?',
    qa: 'YouTube now has native thumbnail testing (Test & Compare). Our tool focuses on title testing, which YouTube does NOT offer natively. Combine both: test thumbnails with YouTube, test titles with YTubViral.',
  },
  {
    q: 'Does VidIQ offer A/B testing?',
    qa: 'No. VidIQ does not have A/B testing for titles. TubeBuddy offers it in their Legend plan ($49/month). YTubViral includes it in Pro at €9.99/month — 80% cheaper.',
  },
  {
    q: 'How long does a test need to run?',
    qa: 'Typically 7-14 days to get statistically significant results, depending on your video\'s view volume. The tool tells you when there\'s enough data to pick a winner with confidence.',
  },
  {
    q: 'Will A/B testing hurt my video performance?',
    qa: 'No. Title changes don\'t reset YouTube\'s algorithm or affect recommendations. YouTube treats it as a metadata update. Your video keeps all its existing impressions, likes, and comments.',
  },
  {
    q: 'Does it push title changes to YouTube automatically?',
    qa: 'Yes. With YouTube OAuth connected, YTubViral swaps titles automatically via the API. You set it up once and check results later. No manual switching needed.',
  },
];

export default function AbTestingFeature() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--ink)' }}>
      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">
        <p className="font-mono-jb text-[13px] tracking-[0.2em] uppercase mb-4" style={{ color: '#00D9FF' }}>
          PRO TOOL — EXCLUSIVE
        </p>
        <h1 className="font-display font-bold text-4xl md:text-6xl leading-tight mb-6">
          A/B Test Your<br />
          <span style={{ color: 'var(--red)' }}>YouTube Titles</span>
        </h1>
        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8">
          Stop guessing which title gets more clicks. Set up an A/B test in 30 seconds,
          let it run automatically, and get data-driven results. The feature VidIQ doesn&apos;t have.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link href="/signup" className="btn-offset px-8 py-3 text-[15px] font-display">
            Start A/B testing
          </Link>
          <Link href="/ab-test" className="btn-offset btn-offset-white px-8 py-3 text-[15px] font-display">
            See how it works
          </Link>
        </div>
      </section>

      {/* Why it matters */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-6 text-center">
          Why A/B testing titles matters more than you think
        </h2>
        <div className="soft-card p-6 md:p-8 space-y-4 text-zinc-400 text-[15px] leading-relaxed">
          <p>
            Your title is the #1 factor in whether someone clicks your video. A 1% CTR improvement
            on a video with 100,000 impressions = <strong className="text-white">1,000 extra clicks</strong>. Multiply that across
            your catalog and the difference is massive.
          </p>
          <p>
            Most creators pick titles based on gut feeling. The top 1% test them with data.
            Until now, the only way to do this was TubeBuddy Legend at $49/month. YTubViral brings
            the same capability at a fraction of the price.
          </p>
          <p>
            Combined with YouTube&apos;s native thumbnail testing, you can now optimize <em>both</em> elements
            that drive CTR — and YouTube rewards higher CTR with more impressions. It&apos;s a compounding effect.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-10 text-center">
          How it works
        </h2>
        <div className="space-y-8">
          {[
            { step: '1', title: 'Pick a video and write two titles', desc: 'Select any video from your channel. Write your current title as version A and your alternative as version B. Our AI can suggest version B if you need ideas.' },
            { step: '2', title: 'Set the rotation schedule', desc: 'Choose how often to swap titles (every 12h, 24h, or 48h). The tool rotates titles automatically via YouTube API — no manual work.' },
            { step: '3', title: 'Let it run', desc: 'YTubViral tracks impressions, CTR, and view velocity for each title version. The dashboard shows real-time performance comparison.' },
            { step: '4', title: 'Pick the winner', desc: 'Once we have enough data (usually 7-14 days), the tool declares a statistically significant winner. Apply it with one click.' },
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
          A/B testing: who offers it?
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-white/10">
                <th className="py-3 px-4 font-display font-bold">Feature</th>
                <th className="py-3 px-4 font-display font-bold text-center" style={{ color: 'var(--red)' }}>YTubViral</th>
                <th className="py-3 px-4 font-display font-bold text-center text-zinc-500">TubeBuddy</th>
                <th className="py-3 px-4 font-display font-bold text-center text-zinc-500">VidIQ</th>
                <th className="py-3 px-4 font-display font-bold text-center text-zinc-500">YouTube</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              {[
                ['Title A/B testing', '✓', '✓ (Legend only)', '✗', '✗'],
                ['Thumbnail A/B testing', '✗', '✓ (Legend only)', '✗', '✓ (native)'],
                ['Automatic rotation', '✓', '✓', '—', '✓'],
                ['Statistical significance', '✓', '✓', '—', '✓'],
                ['AI title suggestions', '✓', '✗', '✓', '✗'],
                ['Min plan required', 'Pro (€9.99)', 'Legend ($49)', 'N/A', 'Free'],
              ].map(([feat, ytub, tube, vidiq, yt]) => (
                <tr key={feat} className="border-b border-white/5">
                  <td className="py-2.5 px-4">{feat}</td>
                  <td className="py-2.5 px-4 text-center text-white font-medium">{ytub}</td>
                  <td className="py-2.5 px-4 text-center">{tube}</td>
                  <td className="py-2.5 px-4 text-center">{vidiq}</td>
                  <td className="py-2.5 px-4 text-center">{yt}</td>
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
          Stop guessing. Start testing.
        </h2>
        <p className="text-zinc-400 mb-8">A/B test your YouTube titles for €9.99/month. VidIQ can&apos;t do this at any price.</p>
        <Link href="/signup" className="btn-offset px-10 py-4 text-[15px] font-display">
          Start your first A/B test
        </Link>
      </section>
    </div>
  );
}
