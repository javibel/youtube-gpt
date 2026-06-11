import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import LaunchClient from './LaunchClient';

export const metadata: Metadata = {
  title: '14 AI Tools for YouTube Creators — Waitlist',
  description:
    'Join the waitlist and get 50% off for 1 year: 14 AI tools to grow on YouTube — SEO Score, AI Generator, Keyword Research and more.',
  alternates: { canonical: 'https://ytubviral.com/launch' },
};

const TOOLS_EN = [
  'Viral Title Generator', 'AI Scripts', 'SEO Score', 'Keyword Research',
  'Competitor Analysis', 'Revenue Estimator', 'A/B Testing', 'Best Time to Post',
  'Content Calendar', 'Retention Analysis', 'Video Predictor', 'AI Coach',
  'Trend Explorer', 'Learning Hub',
];

const REASONS = [
  { title: '50% off for 1 year', desc: 'Early supporters pay half price for a full year.' },
  { title: 'Early access', desc: 'Be among the first to try all 14 tools before the public launch.' },
  { title: 'Vote on Product Hunt', desc: 'Help us reach #1 on launch day and earn extra perks.' },
];

export default function LaunchPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-md" style={{ background: 'rgba(10,10,10,0.85)' }}>
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1.5">
            <svg width="18" height="18" viewBox="7 7 18 18" fill="none">
              <circle cx="16" cy="16" r="8" fill="#ee4d5e"/>
            </svg>
            <span className="font-bold text-[17px] tracking-tight">
              YTubViral<span style={{ color: '#e84d5b' }}>.</span>com
            </span>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="max-w-3xl mx-auto px-6 pt-20 pb-32">
        <div className="text-center mb-12">
          <span className="inline-block text-xs font-bold tracking-[0.2em] text-[#e84d5b] bg-[#e84d5b]/10 px-4 py-1.5 rounded-full mb-6">
            LAUNCHING ON PRODUCT HUNT
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight mb-4">
            14 AI tools to grow on YouTube.<br />
            <span className="text-[#e84d5b]">One platform.</span>
          </h1>
          <p className="text-lg text-zinc-400 max-w-xl mx-auto">
            Join the waitlist and get 50% off for 1 year when we launch.
          </p>
        </div>

        {/* Client form + count */}
        <Suspense fallback={
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        }>
          <LaunchClient />
        </Suspense>

        {/* Tools grid */}
        <div className="flex flex-wrap justify-center gap-2.5 mb-16">
          {TOOLS_EN.map((tool, i) => (
            <div
              key={i}
              className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-300 text-center"
            >
              {tool}
            </div>
          ))}
        </div>

        {/* Why section */}
        <h2 className="text-2xl font-bold text-center mb-8">Why join?</h2>
        <div className="grid sm:grid-cols-3 gap-6 mb-16">
          {REASONS.map((r, i) => (
            <div key={i} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-6">
              <div className="w-10 h-10 rounded-full bg-[#e84d5b]/15 flex items-center justify-center mb-4 text-[#e84d5b] font-bold">
                {i + 1}
              </div>
              <h3 className="font-semibold mb-2">{r.title}</h3>
              <p className="text-sm text-zinc-400">{r.desc}</p>
            </div>
          ))}
        </div>

        {/* Back */}
        <div className="text-center">
          <Link href="/" className="text-sm text-zinc-500 hover:text-white transition-colors">
            Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}
