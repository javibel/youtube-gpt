import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'YouTube Money Calculator — Revenue Estimator by Country | YTubViral',
  description:
    'Estimate YouTube earnings for any channel. Real CPM data for 40+ countries, revenue projections, and AI monetization tips. Free YouTube money calculator.',
  alternates: { canonical: 'https://ytubviral.com/features/revenue-estimator' },
  openGraph: {
    title: 'YouTube Money Calculator — Revenue Estimator | YTubViral',
    description: 'Estimate YouTube earnings with real CPM data for 40+ countries. Free calculator.',
    url: 'https://ytubviral.com/features/revenue-estimator',
    type: 'website',
  },
};

const FAQ = [
  {
    q: 'How accurate are the revenue estimates?',
    qa: 'Our estimates use real CPM data from YouTube Analytics (authenticated channels) and industry benchmarks by country and niche. Accuracy is typically within 15-25% of actual earnings — significantly better than tools that use generic $1-$5 CPM ranges.',
  },
  {
    q: 'What CPM data do you have?',
    qa: 'Real CPM ranges for 40+ countries including US, UK, Germany, Canada, Australia, Spain, Mexico, Brazil, India, Japan, and more. Data is segmented by niche (tech, gaming, finance, beauty, etc.) since CPM varies dramatically by category.',
  },
  {
    q: 'Can I estimate earnings for any channel?',
    qa: 'Yes. Enter any YouTube channel URL and we\'ll estimate monthly and yearly revenue based on their view count, audience geography (when available), and niche. Works for channels of any size.',
  },
  {
    q: 'How is this different from Social Blade earnings estimates?',
    qa: 'Social Blade shows extremely wide ranges (e.g., "$500 - $8,000/month") that aren\'t useful. YTubViral uses niche-specific CPM data and audience geography to give much tighter, actionable estimates. Plus we include AI-powered monetization tips.',
  },
  {
    q: 'Does this include sponsorship income?',
    qa: 'The calculator focuses on AdSense/YouTube ad revenue. Sponsorship income varies too much to estimate reliably. However, our AI monetization tips include advice on sponsorship pricing based on your channel metrics.',
  },
];

export default function RevenueEstimatorFeature() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--ink)' }}>
      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">
        <p className="font-mono-jb text-[13px] tracking-[0.2em] uppercase mb-4" style={{ color: '#00D9FF' }}>
          PRO TOOL
        </p>
        <h1 className="font-display font-bold text-4xl md:text-6xl leading-tight mb-6">
          YouTube Money<br />
          <span style={{ color: 'var(--red)' }}>Calculator</span>
        </h1>
        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-8">
          How much does a YouTuber really earn? Get accurate revenue estimates based on real CPM data
          for 40+ countries. Not generic ranges — actual niche-specific numbers.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link href="/signup" className="btn-offset px-8 py-3 text-[15px] font-display">
            Estimate earnings — free trial
          </Link>
          <Link href="/revenue" className="btn-offset btn-offset-white px-8 py-3 text-[15px] font-display">
            Try the calculator
          </Link>
        </div>
      </section>

      {/* What you get */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-10 text-center">
          What the revenue estimator shows you
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { title: 'CPM by country', desc: 'Real CPM data for 40+ countries. See exactly how much advertisers pay per 1,000 views in each market — from $30+ (US finance) to $0.50 (India gaming).' },
            { title: 'Monthly revenue estimate', desc: 'Based on recent view counts, audience geography, and niche CPM. Tighter ranges than any other free tool.' },
            { title: 'Yearly projection', desc: 'Annualized revenue estimate with growth trend factored in. See where the channel is heading financially.' },
            { title: 'Revenue per video', desc: 'Average earnings per video based on typical views. Know your per-video ROI before investing in production.' },
            { title: 'Niche CPM comparison', desc: 'How does your niche compare? Finance and tech pay 5-10x more than entertainment. See the data.' },
            { title: 'AI monetization tips', desc: 'Personalized advice on how to increase revenue: better audience targeting, content format changes, sponsorship pricing guidance.' },
          ].map((f) => (
            <div key={f.title} className="soft-card p-5">
              <h3 className="font-display font-bold text-base mb-2">{f.title}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CPM examples */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="font-display font-bold text-2xl md:text-3xl mb-8 text-center">
          Average YouTube CPM by country (2026)
        </h2>
        <p className="text-zinc-400 text-center mb-8 text-sm">
          CPM = cost per 1,000 monetized views. These are real averages across niches.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-white/10">
                <th className="py-3 px-4 font-display font-bold">Country</th>
                <th className="py-3 px-4 font-display font-bold text-center">Avg CPM</th>
                <th className="py-3 px-4 font-display font-bold text-center">High-CPM niches</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              {[
                ['United States', '$7-15', 'Finance ($25+), Tech ($12+)'],
                ['United Kingdom', '$6-12', 'Finance, Business, SaaS'],
                ['Germany', '$6-11', 'Auto, Finance, Tech'],
                ['Canada', '$5-10', 'Finance, Real Estate'],
                ['Australia', '$5-10', 'Finance, Health'],
                ['Spain', '$2-5', 'Finance, Marketing'],
                ['Mexico', '$1-3', 'Business, Tech'],
                ['Brazil', '$0.80-2', 'Finance, Gaming'],
                ['India', '$0.30-1.50', 'Tech, Education'],
              ].map(([country, cpm, niches]) => (
                <tr key={country} className="border-b border-white/5">
                  <td className="py-2.5 px-4 text-white">{country}</td>
                  <td className="py-2.5 px-4 text-center">{cpm}</td>
                  <td className="py-2.5 px-4 text-center text-xs">{niches}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-zinc-500 text-xs text-center mt-4">
          Data from YTubViral authenticated channels, updated quarterly. Your actual CPM depends on niche, audience demographics, and ad format.
        </p>
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
          How much is your channel really worth?
        </h2>
        <p className="text-zinc-400 mb-8">Get a real estimate, not a useless $500-$8,000 range.</p>
        <Link href="/signup" className="btn-offset px-10 py-4 text-[15px] font-display">
          Calculate your revenue
        </Link>
      </section>
    </div>
  );
}
