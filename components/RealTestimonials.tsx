'use client';

import { useEffect, useState } from 'react';
import type { Lang } from '@/lib/server-lang';

// B5: social proof REAL — solo reseñas aprobadas del sistema de reviews
// (regla CEO 2026-06-12: nada inventado). Si no hay reseñas, no renderiza nada.
type PublicReview = { id: string; rating: number; text: string; createdAt: string; user: { name: string | null } };

export default function RealTestimonials({ lang }: { lang: Lang }) {
  const [reviews, setReviews] = useState<PublicReview[] | null>(null);
  const t = (es: string, en: string) => (lang === 'en' ? en : es);

  useEffect(() => {
    fetch('/api/reviews/public')
      .then((r) => (r.ok ? r.json() : { reviews: [] }))
      .then((d) => setReviews(d.reviews || []))
      .catch(() => setReviews([]));
  }, []);

  if (!reviews || reviews.length === 0) return null;

  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  const avgLabel = Number.isInteger(avg) ? String(avg) : avg.toFixed(1);

  return (
    <section style={{ background: 'var(--yv-bg-0)' }}>
      <div className="max-w-7xl mx-auto px-6 py-24">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-12">
          <div>
            <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--yv-brand-lift)' }}>
              {t('USUARIOS REALES', 'REAL USERS')}
            </p>
            <h2 className="font-display font-bold text-4xl md:text-6xl leading-[0.95] max-w-2xl">
              {t('Lo que dicen los usuarios.', 'What users are saying.')}
            </h2>
          </div>
          <div className="text-right">
            <p className="font-display font-bold text-3xl">{avgLabel}/5</p>
            <p className="font-mono-jb text-[13px] text-zinc-500">
              {t(`basado en ${reviews.length} reseña${reviews.length > 1 ? 's' : ''} verificada${reviews.length > 1 ? 's' : ''}`,
                 `based on ${reviews.length} verified review${reviews.length > 1 ? 's' : ''}`)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {reviews.slice(0, 6).map((r) => (
            <div key={r.id} className="yv-glass yv-glass--hover p-7 transition">
              <div className="flex gap-0.5 mb-4" aria-label={`${r.rating}/5`}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <svg key={s} width={13} height={13} viewBox="0 0 20 20" fill={s <= r.rating ? '#FFE800' : 'rgba(255,255,255,0.15)'}>
                    <path d="M10 2l2.4 5 5.6.8-4 4 1 5.6L10 14.8 5 17.4l1-5.6-4-4L7.6 7z" />
                  </svg>
                ))}
              </div>
              <p className="text-zinc-200 text-[15px] leading-relaxed mb-5">&ldquo;{r.text}&rdquo;</p>
              <div className="flex items-center gap-3 pt-4" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)' }}>
                <div className="w-9 h-9 flex items-center justify-center font-display font-bold text-[13px] shrink-0 text-white" style={{ borderRadius: 'var(--yv-radius-sm)', background: 'var(--yv-glass-chip)' }}>
                  {(r.user.name || 'U').charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-sm">{r.user.name || t('Usuario verificado', 'Verified user')}</p>
                  <p className="font-mono-jb text-[13px] text-zinc-500">
                    {new Date(r.createdAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', { month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
