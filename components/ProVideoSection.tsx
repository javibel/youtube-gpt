'use client';

import Link from 'next/link';
import { isPaid } from '@/lib/plans';
import type { PlanType } from '@/lib/plans';
import type { Lang } from '@/lib/blog-data';

interface Props {
  videoId: string;
  plan: PlanType;
  lang: Lang;
}

export default function ProVideoSection({ videoId, plan, lang }: Props) {
  if (isPaid(plan)) {
    return (
      <div className="my-10">
        <div className="relative w-full overflow-hidden border border-white/10" style={{ aspectRatio: '16/9' }}>
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?rel=0`}
            title="Video tutorial"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
            className="absolute inset-0 w-full h-full"
          />
        </div>
      </div>
    );
  }

  // Free users — blurred thumbnail + upgrade CTA
  return (
    <div className="my-10 relative overflow-hidden border border-white/10">
      <div className="relative w-full" style={{ aspectRatio: '16/9' }}>
        {/* Blurred thumbnail background */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(https://img.youtube.com/vi/${videoId}/maxresdefault.jpg)`,
            filter: 'blur(20px) brightness(0.3)',
            transform: 'scale(1.1)',
          }}
        />
        {/* Lock overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10">
          <div className="w-16 h-16 flex items-center justify-center rounded-full" style={{ background: 'rgba(232,77,91,0.2)', border: '2px solid rgba(232,77,91,0.4)' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--red)' }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <p className="font-display font-bold text-lg text-white text-center px-4">
            {lang === 'en' ? 'Video tutorial — Pro members only' : 'Video tutorial — Solo miembros Pro'}
          </p>
          <Link
            href="/signup"
            className="btn-offset px-6 py-3 text-sm font-display font-bold"
          >
            {lang === 'en' ? 'Upgrade to Pro →' : 'Hazte Pro →'}
          </Link>
        </div>
      </div>
    </div>
  );
}
